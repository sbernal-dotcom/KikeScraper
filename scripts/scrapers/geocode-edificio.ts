/**
 * Pipeline de geocoding con prioridad EDIFICIO.
 *
 * Reemplaza la estrategia anterior (solo zona-centroide) por:
 *
 *   1. IA extrae {edificio, proyecto, zona} del título + descripción.
 *   2. Si edificio: buscar en `edificios_cache`.
 *      - HIT con coords → usar (precisión: exact, sin jitter).
 *      - HIT sin coords (intento reciente fallido) → skip web search.
 *      - MISS → buscar en web → cachear (con o sin coords) → usar si hubo.
 *   3. Si aún no hay coords, repetir 2 con proyecto.
 *   4. Si aún no, usar zona-centroide (tabla zonas-panama + jitter).
 *   5. Si tampoco hay zona → return null (la propiedad se descarta).
 *
 * El campo `precision` permite que el frontend distinga entre pines
 * exactos y aproximados (zona). Si se quiere mostrar solo los exactos:
 * filtrar por precision === "edificio".
 */

import { type SupabaseClient } from "@supabase/supabase-js";

import { buscarEdificioWeb, type Validator } from "./buscar-edificio-web";
// SupabaseClient se usa solo como tipo del singleton.
import {
  extraerEdificio,
  normalizarNombre,
} from "./ia-extract-edificio";
import { createScraperClient } from "./supabase-admin";
import { centroFromTable, type ZonaCentro } from "./zonas-panama";

// Singleton lazy del cliente Supabase. Permite que el pipeline funcione
// como import-anywhere sin propagar `supa` por toda la firma del scraper.
let supaCache: SupabaseClient | null = null;
function supa(): SupabaseClient {
  if (!supaCache) supaCache = createScraperClient();
  return supaCache;
}

// Tolerancia para validar coords de web search contra el centroide de
// la zona conocida. 5km cubre un corregimiento bien — más laxo y
// empezamos a pescar coords de listings vecinos en páginas multi-listing.
const ZONE_PROXIMITY_KM = 5;

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function makeZoneValidator(centro: ZonaCentro | null): Validator | undefined {
  if (!centro) return undefined;
  return (lat: number, lng: number) =>
    haversineKm({ lat, lng }, centro) <= ZONE_PROXIMITY_KM;
}

export type GeocodeResultado = {
  lat: number;
  lng: number;
  precision: "edificio" | "zona";
  source: string; // "edificios_cache" | "web" | "zonas_panama"
};

// Tabla de cache (escribimos también filas "sin_resultado" para no
// re-buscar la misma cadena en cada corrida).
type EdificioCacheRow = {
  id?: string;
  nombre_norm: string;
  nombre_original: string;
  lat: number | null;
  lng: number | null;
  source: "manual" | "web" | "google" | "sin_resultado";
  source_url: string | null;
  confidence: number | null;
  attempts: number;
  last_attempt_at: string;
};

// Si una entrada está marcada como sin_resultado más reciente que esto,
// no re-buscamos. Permite que un edificio agregado a la web después
// (ej. un proyecto nuevo) eventualmente sea encontrado.
const SIN_RESULTADO_TTL_DIAS = 30;

export async function geocodeConEdificio(
  titulo: string | null,
  descripcion: string | null,
  url_original: string,
  zonaFallback: string | null = null, // zona del JSON-LD del scraper
): Promise<GeocodeResultado | null> {
  // 1. IA extrae
  const extr = await extraerEdificio(titulo, descripcion);

  // Centroide de la zona (si conocida) para validar coords del web search.
  // Esto evita que pesquemos coords aleatorias de listings vecinos en
  // páginas que listan múltiples propiedades.
  const zona = extr.zona ?? zonaFallback;
  const zonaCentro = zona ? centroFromTable(zona) : null;
  const validator = makeZoneValidator(zonaCentro);

  // 2. Edificio
  if (extr.edificio) {
    const r = await resolverNombre(extr.edificio, validator);
    if (r) {
      console.log(`  geocode → edificio "${extr.edificio}" ${r.source} (${r.lat.toFixed(4)},${r.lng.toFixed(4)})`);
      return { ...r, precision: "edificio" };
    }
  }

  // 3. Proyecto (solo si es DIFERENTE del edificio para no repetir el lookup)
  if (extr.proyecto && extr.proyecto !== extr.edificio) {
    const r = await resolverNombre(extr.proyecto, validator);
    if (r) {
      console.log(`  geocode → proyecto "${extr.proyecto}" ${r.source} (${r.lat.toFixed(4)},${r.lng.toFixed(4)})`);
      return { ...r, precision: "edificio" };
    }
  }

  // STRICT MODE (2026-06-25): policy "edificio o nada". Eliminado el
  // fallback a zona-centroide — usuario lo encontraba confuso (props
  // tipo "Apto en Bella Vista" sin nombre de edificio terminaban pin-
  // chando en el medio del barrio + jitter, dando la falsa impresión
  // de ubicación real). Mejor mostrar menos props pero exactas.
  console.log(`  geocode → SIN ubicación de edificio resoluble, propiedad se descarta`);
  return null;
}

/**
 * Resuelve un nombre (edificio o proyecto) consultando cache primero,
 * web search después. Cachea el resultado (positivo o negativo).
 */
async function resolverNombre(
  nombre: string,
  validator?: Validator,
): Promise<{ lat: number; lng: number; source: string } | null> {
  const norm = normalizarNombre(nombre);

  // a. Cache lookup. Si la tabla no existe (migration 0011 no aplicada)
  // o hay otro error, lo tratamos como cache-miss y seguimos sin cache.
  // Esto deja al pipeline funcional aunque la migration esté pendiente.
  let cached: EdificioCacheRow | null = null;
  try {
    const { data, error } = await supa()
      .from("edificios_cache")
      .select("*")
      .eq("nombre_norm", norm)
      .maybeSingle();
    if (!error) cached = data as EdificioCacheRow | null;
  } catch {
    // tabla inexistente / RLS / red → seguimos sin cache
  }

  const ahora = Date.now();
  if (cached) {
    const row = cached as EdificioCacheRow;
    if (row.lat != null && row.lng != null) {
      return { lat: row.lat, lng: row.lng, source: `cache(${row.source})` };
    }
    // Marcado como sin resultado — ¿re-intentar?
    const ageDias = (ahora - new Date(row.last_attempt_at).getTime()) / 86_400_000;
    if (row.source === "sin_resultado" && ageDias < SIN_RESULTADO_TTL_DIAS) {
      return null; // ya intentamos hace poco, no buscar de nuevo
    }
    // Sí re-intentar → caemos al web search.
  }

  // b. Web search
  const web = await buscarEdificioWeb(nombre, validator);

  // c. Cachear resultado (positivo o negativo)
  const nowIso = new Date().toISOString();
  const row: Partial<EdificioCacheRow> = {
    nombre_norm: norm,
    nombre_original: nombre,
    lat: web?.lat ?? null,
    lng: web?.lng ?? null,
    source: web ? "web" : "sin_resultado",
    source_url: web?.source_url ?? null,
    confidence: web?.confidence ?? null,
    attempts: (cached?.attempts ?? 0) + 1,
    last_attempt_at: nowIso,
  };

  // Persistir cache. Errores silenciosos (mismo motivo que el lookup).
  try {
    if (cached) {
      await supa()
        .from("edificios_cache")
        .update(row)
        .eq("nombre_norm", norm);
    } else {
      await supa().from("edificios_cache").insert(row);
    }
  } catch {
    // Sigue funcionando — solo perdemos el cache para esta corrida.
  }

  return web ? { lat: web.lat, lng: web.lng, source: "web" } : null;
}
