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
 * filtrar por precision === "exacta".
 */

import { type SupabaseClient } from "@supabase/supabase-js";

import { isOnLand } from "../../src/lib/geo/panama-land";
import { buscarEdificioWeb, type Validator } from "./buscar-edificio-web";
import { nominatimPanama } from "./nominatim";
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

/**
 * Precisión de ubicación — mapea 1:1 al CHECK constraint de la columna
 * `propiedades.precision_ubicacion` (migration 0014):
 *
 *   - "exacta"          : coord del source (JSON-LD o cache manual)
 *   - "zona-declarada"  : centroide de zona conocida que el source publicó
 *                         (allowZoneFallback: true)
 *   - "aproximada"      : coord del web-search u otro método inferido
 */
export type PrecisionUbicacion = "exacta" | "zona-declarada" | "aproximada";

export type GeocodeResultado = {
  lat: number;
  lng: number;
  precision: PrecisionUbicacion;
  /**
   * Cómo se obtuvo la coord — mapea 1:1 a `propiedades.ubicacion_fuente`.
   * Valores comunes: "edificios_cache" | "web_search" |
   * "streetAddress_zona" | "titulo_zona".
   */
  source: string;
};

export type GeocodeOpts = {
  /**
   * Si true, cuando el edificio/proyecto no resuelva y la zona (extraída
   * por IA del título/descripción o pasada por el scraper vía
   * zonaFallback) esté en la tabla de zonas conocidas, devolvemos su
   * centroide sin jitter con precision="zona-declarada".
   *
   * Default false: mantiene strict mode "edificio o nada" para las
   * fuentes existentes (encuentra24, mlsacobir, inmopanama, acobir).
   * Solo scrapers de fuentes de alta confianza que publican la zona
   * explícitamente (ej. savitat con streetAddress) deberían pasar true.
   */
  allowZoneFallback?: boolean;
  /**
   * Categoría de la propiedad. Cuando es "terreno" / "lote" / "casa",
   * el fallback a zona se activa AUTOMÁTICAMENTE porque no tienen
   * edificio identificable por definición (terreno) o porque la casa
   * suele ser única de un barrio sin nombre de edificio. Para
   * "apartamento", "oficina", "local-comercial", "galera" se mantiene
   * strict — son unidades dentro de un edificio y sin nombre del
   * edificio la coord sería demasiado inespecífica.
   */
  categoria?: string;
};

const CATEGORIAS_CON_FALLBACK_AUTO = new Set(["terreno", "lote", "casa"]);

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

// H16: TTL para hits positivos de source='web'. El geocoder web
// (DuckDuckGo scrape) es propenso a devolver coordenadas incorrectas —
// caso Marbella 2026-07 colapsó 16 props en la misma coord falsa hasta
// que se arreglaron a mano. Refrescamos cada 90 días para dar chance de
// corregir automáticamente (limpiar-cache-mal-agrupado.ts ya cubre casos
// severos; esto es la red preventiva).
// Cache 'manual' y 'google' son de alta confianza — sin TTL.
const WEB_HIT_TTL_DIAS = 90;

export async function geocodeConEdificio(
  titulo: string | null,
  descripcion: string | null,
  url_original: string,
  zonaFallback: string | null = null, // zona del JSON-LD del scraper
  opts: GeocodeOpts = {},
): Promise<GeocodeResultado | null> {
  const { allowZoneFallback = false, categoria } = opts;
  // Terrenos, lotes y casas activan zona-declarada automáticamente
  // (no requieren edificio identificable).
  const useZoneFallback =
    allowZoneFallback ||
    (categoria != null && CATEGORIAS_CON_FALLBACK_AUTO.has(categoria));
  void url_original;
  // 1. IA extrae
  const extr = await extraerEdificio(titulo, descripcion);

  // Centroide de la zona (si conocida) para validar coords del web search.
  // Esto evita que pesquemos coords aleatorias de listings vecinos en
  // páginas que listan múltiples propiedades.
  //
  // Preferir extr.zona (más específica cuando existe en tabla). Pero si
  // el centro de extr.zona es null y zonaFallback SÍ resuelve, usar el
  // fallback — Savitat 2026-07-29: la IA extraía "Área Bancaria" para
  // una prop cuyo streetAddress era "Marbella, Bella Vista" (SÍ está en
  // la tabla), tirando la coord real por la borda.
  //
  // Además (2026-07-30) — si nada resuelve, tratamos cada parte de la
  // zona compuesta por separado. "Utive, Pacora" → prueba "Utive"
  // y luego "Pacora" (probablemente la ciudad SÍ está en tabla aunque
  // el corregimiento no).
  let zona = extr.zona ?? zonaFallback;
  let zonaCentro = zona ? centroFromTable(zona) : null;
  if (
    !zonaCentro &&
    extr.zona &&
    zonaFallback &&
    zonaFallback !== extr.zona
  ) {
    const fbCentro = centroFromTable(zonaFallback);
    if (fbCentro) {
      zona = zonaFallback;
      zonaCentro = fbCentro;
    }
  }
  if (!zonaCentro) {
    const candidatos = [zonaFallback, extr.zona]
      .filter((z): z is string => !!z && z.includes(","))
      .flatMap((z) => z.split(",").map((p) => p.trim()).filter(Boolean));
    for (const c of candidatos) {
      const parte = centroFromTable(c);
      if (parte) {
        zona = c;
        zonaCentro = parte;
        break;
      }
    }
  }
  const validator = makeZoneValidator(zonaCentro);

  // 2. Edificio
  if (extr.edificio) {
    const r = await resolverNombre(extr.edificio, validator);
    if (r && isOnLand(r.lat, r.lng)) {
      console.log(`  geocode → edificio "${extr.edificio}" ${r.source} (${r.lat.toFixed(4)},${r.lng.toFixed(4)})`);
      return { ...r, precision: precisionFromSource(r.source) };
    }
    if (r) {
      // Defensivo: coord en mar aunque venía del cache. Puede pasar si
      // el cache se pobló antes de que existiera isOnLand. Ignoramos.
      console.log(`  geocode → edificio "${extr.edificio}" descarta coord (en mar)`);
    }
  }

  // 3. Proyecto (solo si es DIFERENTE del edificio para no repetir el lookup)
  if (extr.proyecto && extr.proyecto !== extr.edificio) {
    const r = await resolverNombre(extr.proyecto, validator);
    if (r && isOnLand(r.lat, r.lng)) {
      console.log(`  geocode → proyecto "${extr.proyecto}" ${r.source} (${r.lat.toFixed(4)},${r.lng.toFixed(4)})`);
      return { ...r, precision: precisionFromSource(r.source) };
    }
    if (r) {
      console.log(`  geocode → proyecto "${extr.proyecto}" descarta coord (en mar)`);
    }
  }

  // 4. Zona-declarada (opt-in — solo scrapers de alta confianza)
  // Cuando el edificio no resuelve pero la fuente publicó la zona
  // (extr.zona viene del título/descripción vía IA, o zonaFallback
  // viene del JSON-LD del scraper) y esa zona está en nuestra tabla,
  // usamos el centroide SIN jitter. La coord no es exacta pero es
  // fuente-declarada, no adivinada — de ahí precision="zona-declarada".
  if (useZoneFallback && zonaCentro && isOnLand(zonaCentro.lat, zonaCentro.lng)) {
    const source = extr.zona ? "titulo_zona" : "streetAddress_zona";
    console.log(
      `  geocode → zona "${zona}" (centroide, ${source}) (${zonaCentro.lat.toFixed(4)},${zonaCentro.lng.toFixed(4)})`,
    );
    return {
      lat: zonaCentro.lat,
      lng: zonaCentro.lng,
      precision: "zona-declarada",
      source,
    };
  }

  // 5. Nominatim como último recurso ANTES de descartar (2026-07-30).
  // Solo si tenemos zonaCentro válido — el validator de proximidad
  // (30km) evita que Nominatim devuelva un homónimo en otra provincia
  // (ej. "La Pulida" tiene un hit en Darién a 350km del barrio real).
  // Sin zonaCentro no arriesgamos: preferimos no-pin sobre pin-mal.
  if (zonaCentro && (extr.edificio || extr.proyecto)) {
    const nombreQuery = extr.edificio ?? extr.proyecto;
    const query = zona
      ? `${nombreQuery}, ${zona}, Panamá`
      : `${nombreQuery}, Panamá`;
    const nomRes = await nominatimPanama(query, {
      zonaCentro,
      maxDistanceKm: 30,
    });
    if (nomRes) {
      const distStr = nomRes.distanceFromCenterKm?.toFixed(1) ?? "?";
      console.log(
        `  geocode → nominatim "${query}" (${nomRes.lat.toFixed(4)},${nomRes.lng.toFixed(4)}) · ${distStr}km del centro`,
      );
      return {
        lat: nomRes.lat,
        lng: nomRes.lng,
        precision: "aproximada",
        source: "nominatim",
      };
    }
  }

  // STRICT MODE (2026-06-25): policy "edificio o nada" para las fuentes
  // legacy. Eliminado el fallback a zona-centroide con jitter porque
  // el user lo encontraba confuso — props tipo "Apto en Bella Vista"
  // sin nombre de edificio terminaban pinchando en el medio del barrio,
  // dando la falsa impresión de ubicación real. Con allowZoneFallback
  // sí se permite, pero SIN jitter y marcado como "zona-declarada".
  console.log(`  geocode → SIN ubicación de edificio resoluble, propiedad se descarta`);
  return null;
}

/**
 * Deriva la precisión a partir del `source` que resolvió la coord.
 * `edificios_cache` con source "manual" → exacta; con "web" → aproximada
 * (viene del web search). Uno u otro se codifica en el string devuelto
 * por resolverNombre — ver switch abajo.
 */
function precisionFromSource(source: string): PrecisionUbicacion {
  if (source === "cache(manual)" || source === "cache(google)") return "exacta";
  return "aproximada"; // cache(web), cache(sin_resultado), web
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
    const ageDias = (ahora - new Date(row.last_attempt_at).getTime()) / 86_400_000;
    if (row.lat != null && row.lng != null) {
      // H16: hits positivos de source='web' se re-validan cada 90d.
      // manual/google/manual → sin TTL (alta confianza).
      const isWebStale = row.source === "web" && ageDias >= WEB_HIT_TTL_DIAS;
      if (!isWebStale) {
        return { lat: row.lat, lng: row.lng, source: `cache(${row.source})` };
      }
      console.log(`  cache "${nombre}" es web-stale (${ageDias.toFixed(0)}d) — re-verificando`);
      // Cae al web search abajo.
    } else if (row.source === "sin_resultado" && ageDias < SIN_RESULTADO_TTL_DIAS) {
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
