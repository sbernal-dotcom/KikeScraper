/**
 * Detector automático de "colapso" del edificios_cache — fix H16 parte 2.
 *
 * El geocoder web (DuckDuckGo scrape) a veces guarda una coord genérica
 * que matchea muchos nombres distintos → N propiedades terminan en el
 * mismo pin. Caso Marbella 2026-07: 16 props colapsadas en 8.9762,-79.5201.
 * `limpiar-cache-mal-agrupado.ts` lo arregla manualmente con lista
 * hardcodeada. Este script detecta el patrón automáticamente.
 *
 * Estrategia:
 *   1. SQL: agrupar propiedades activas por (round(lat,4), round(lng,4))
 *      donde ubicacion_fuente = 'cache(web)' y count >= UMBRAL.
 *   2. Para cada bucket sospechoso, buscar las entradas de edificios_cache
 *      cercanas (±0.001°).
 *   3. Con --apply: setear last_attempt_at = now() - 91d en esas entradas.
 *      El próximo scraper que las lea las verá stale (WEB_HIT_TTL_DIAS=90)
 *      y forzará re-cache.
 *
 * Se puede correr como cron semanal en Railway.
 *
 * Uso:
 *   npm run detectar-colapso            # dry-run
 *   npm run detectar-colapso:apply
 */

import { config as loadEnv } from "dotenv";

import { createScraperClient } from "./supabase-admin";

loadEnv({ path: ".env.local" });
loadEnv();

const APPLY = process.argv.includes("--apply");

// K props ≥ este número en la misma coord dispara sospecha. 5 es
// conservador — un edificio real puede tener múltiples unidades en la
// misma coord exacta (mismo lat/lng, distintos aptos), pero 5+ apts
// distintos vía cache(web) sin nombre en común es señal de que el
// geocoder guardó una coord genérica.
const UMBRAL_COLAPSO = 5;
// Tolerancia para encontrar entradas del cache cercanas.
const CACHE_TOLERANCIA = 0.001; // ~110 m
// Cuánto retrasar last_attempt_at para forzar stale.
const STALE_OFFSET_DIAS = 91;

type Bucket = {
  lat: number;
  lng: number;
  count: number;
};

async function main() {
  const supa = createScraperClient();

  // 1. Agrupar propiedades activas con ubicacion_fuente='cache(web)' por
  // coord redondeada a 4 decimales (~11 m). PostgREST no soporta GROUP BY
  // directo, entonces bajamos las filas y agrupamos en memoria.
  const { data: props, error: propErr } = await supa
    .from("propiedades")
    .select("id, url_original, lat, lng, ubicacion_fuente, precision_ubicacion")
    .eq("estado_anuncio", "activo")
    .eq("ubicacion_fuente", "cache(web)")
    .not("lat", "is", null)
    .not("lng", "is", null);
  if (propErr) {
    console.error(`SELECT propiedades falló: ${propErr.message}`);
    process.exit(1);
  }
  const rows = (props ?? []) as Array<{
    id: string;
    url_original: string;
    lat: number;
    lng: number;
    ubicacion_fuente: string;
  }>;

  const byBucket = new Map<string, { lat: number; lng: number; ids: string[] }>();
  for (const r of rows) {
    const key = `${r.lat.toFixed(4)},${r.lng.toFixed(4)}`;
    const b = byBucket.get(key) ?? { lat: r.lat, lng: r.lng, ids: [] };
    b.ids.push(r.id);
    byBucket.set(key, b);
  }
  const buckets: Bucket[] = [];
  for (const [, v] of byBucket) {
    if (v.ids.length >= UMBRAL_COLAPSO) {
      buckets.push({ lat: v.lat, lng: v.lng, count: v.ids.length });
    }
  }
  buckets.sort((a, b) => b.count - a.count);

  console.log(
    `\n${buckets.length} buckets con ≥${UMBRAL_COLAPSO} propiedades cache(web) en la misma coord:\n`,
  );

  if (buckets.length === 0) {
    console.log("Sin colapsos detectados — cache saludable.");
    return;
  }

  let cacheInvalidados = 0;
  for (const b of buckets) {
    console.log(
      `▶ ${b.lat},${b.lng} → ${b.count} props`,
    );
    const { data: cacheHits, error: cacheErr } = await supa
      .from("edificios_cache")
      .select("nombre_norm, nombre_original, source, last_attempt_at")
      .eq("source", "web")
      .gte("lat", b.lat - CACHE_TOLERANCIA)
      .lte("lat", b.lat + CACHE_TOLERANCIA)
      .gte("lng", b.lng - CACHE_TOLERANCIA)
      .lte("lng", b.lng + CACHE_TOLERANCIA);
    if (cacheErr) {
      console.warn(`  cache lookup: ${cacheErr.message}`);
      continue;
    }
    const entries = (cacheHits ?? []) as Array<{
      nombre_norm: string;
      nombre_original: string;
      source: string;
      last_attempt_at: string;
    }>;
    console.log(`  edificios_cache source=web: ${entries.length} entradas`);
    for (const e of entries) {
      console.log(`    "${e.nombre_original}" — last_attempt_at=${e.last_attempt_at}`);
    }

    if (APPLY && entries.length > 0) {
      // Setear last_attempt_at atrás para forzar re-cache en la próxima corrida.
      const stale = new Date(Date.now() - STALE_OFFSET_DIAS * 86_400_000).toISOString();
      const norms = entries.map((e) => e.nombre_norm);
      const { error: updErr } = await supa
        .from("edificios_cache")
        .update({ last_attempt_at: stale })
        .in("nombre_norm", norms);
      if (updErr) {
        console.warn(`  update falló: ${updErr.message}`);
      } else {
        console.log(`  ✓ ${entries.length} entradas marcadas como stale`);
        cacheInvalidados += entries.length;
      }
    }
  }

  const modo = APPLY ? "APLICADO" : "DRY-RUN";
  console.log(
    `\n[${modo}] ${buckets.length} colapsos detectados · ${APPLY ? cacheInvalidados : 0} entradas cache invalidadas.`,
  );
  if (!APPLY) console.log("Re-ejecutar con --apply para aplicar cambios.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
