/**
 * Limpia entradas de `edificios_cache` que agrupan mal — casos donde
 * una sola coord del cache termina asociada a muchas propiedades de
 * distintas zonas (el geocoder web guardó una respuesta genérica que
 * matchea con demasiados nombres).
 *
 * Diagnóstico (2026-08-04): dos pines con 16 propiedades cada uno que
 * comparten coord y ubicacion_fuente="cache(web)":
 *   - 8.9762,-79.5201 (16 props, todas etiquetadas "Marbella")
 *   - 9.0761,-79.4588 (16 props, mezcla Herrera+Arraiján+Brisas del Golf)
 *
 * Plan:
 *   1. Identificar las entradas del cache que caen en esas coord.
 *   2. Listar las propiedades afectadas.
 *   3. Con --apply:
 *        - Borrar las entradas del cache.
 *        - Para cada propiedad afectada, intentar re-geocodificar por
 *          zona (centroFromTable). Si no hay zona conocida, dejar
 *          coord null → el próximo scraper la re-procesa.
 *
 * Uso:
 *   npm run limpiar-cache-mal      # dry-run
 *   npm run limpiar-cache-mal:apply
 */

import { config as loadEnv } from "dotenv";

import { createScraperClient } from "./supabase-admin";

loadEnv({ path: ".env.local" });
loadEnv();

const APPLY = process.argv.includes("--apply");

// Coord problemáticas identificadas por diag. Tolerancia ±0.001° (~110m).
const PIN_TOLERANCIA = 0.001;
const PINES_MALOS: Array<{ lat: number; lng: number; motivo: string }> = [
  { lat: 8.9762, lng: -79.5201, motivo: "cache Marbella (16 props colapsadas)" },
  { lat: 9.0761, lng: -79.4588, motivo: "cache Brisas del Golf / mezcla zonas (16 props)" },
];

async function main() {
  const supa = createScraperClient();

  for (const pin of PINES_MALOS) {
    console.log(`\n═══ Pin ${pin.lat},${pin.lng} — ${pin.motivo} ═══`);

    // 1. Buscar entradas de cache con lat/lng cercanas.
    const { data: cacheHits, error: cacheErr } = await supa
      .from("edificios_cache")
      .select("nombre_norm, nombre_original, lat, lng, source, source_url")
      .gte("lat", pin.lat - PIN_TOLERANCIA)
      .lte("lat", pin.lat + PIN_TOLERANCIA)
      .gte("lng", pin.lng - PIN_TOLERANCIA)
      .lte("lng", pin.lng + PIN_TOLERANCIA);
    if (cacheErr) {
      console.warn(`  cache query error: ${cacheErr.message}`);
      continue;
    }
    const cacheRows = (cacheHits ?? []) as Array<{
      nombre_norm: string;
      nombre_original: string;
      lat: number;
      lng: number;
      source: string;
      source_url: string | null;
    }>;
    console.log(`  edificios_cache: ${cacheRows.length} entradas coinciden`);
    for (const r of cacheRows) {
      console.log(
        `    [${r.source}] "${r.nombre_original}" → ${r.lat},${r.lng}  (${r.source_url ?? "sin url"})`,
      );
    }

    // 2. Propiedades afectadas. Solo las que vinieron del cache mal
    // armado (ubicacion_fuente="cache(web)" con precision "aproximada").
    // Las que tienen precision="zona-declarada" ya están correctamente
    // en el centroide de su zona — el jitter visual las dispersa y
    // están OK. No las tocamos.
    const { data: props, error: propErr } = await supa
      .from("propiedades")
      .select("id, fuente_id, corregimiento, titulo, ubicacion_fuente, precision_ubicacion")
      .gte("lat", pin.lat - PIN_TOLERANCIA)
      .lte("lat", pin.lat + PIN_TOLERANCIA)
      .gte("lng", pin.lng - PIN_TOLERANCIA)
      .lte("lng", pin.lng + PIN_TOLERANCIA)
      .eq("ubicacion_fuente", "cache(web)")
      .eq("precision_ubicacion", "aproximada");
    if (propErr) {
      console.warn(`  propiedades query error: ${propErr.message}`);
      continue;
    }
    const propRows = (props ?? []) as Array<{
      id: string;
      fuente_id: string;
      corregimiento: string | null;
      titulo: string | null;
      ubicacion_fuente: string | null;
      precision_ubicacion: string | null;
    }>;
    console.log(`  propiedades afectadas: ${propRows.length}`);

    // Plan: en vez de reubicar manualmente (destructivo, muchas quedan
    // sin zona conocida) o dejar coord=null (invisibles hasta próximo
    // scrape), marcamos las propiedades como PRIORIDAD REFRESH — el
    // refresh rotativo del scraper (fetchRefreshTargets ordena por
    // fecha_ultima_revision asc) las agarra primero en la próxima
    // corrida y las re-geocodifica con el cache ya limpio.
    //
    // Mientras tanto siguen visibles en su coord actual (con jitter
    // visual dispersándolas). Menos destructivo, más automático.

    if (!APPLY) {
      console.log("  (dry-run, sin cambios — use --apply para ejecutar)");
      continue;
    }

    // a) borrar entradas del cache
    for (const c of cacheRows) {
      const { error } = await supa
        .from("edificios_cache")
        .delete()
        .eq("nombre_norm", c.nombre_norm);
      if (error) console.warn(`    cache delete "${c.nombre_norm}": ${error.message}`);
    }
    console.log(`  ✓ borradas ${cacheRows.length} entradas de cache`);

    // b) marcar propiedades como prioridad refresh — fecha_ultima_revision
    //    muy antigua = primeras en fetchRefreshTargets del próximo cron.
    const ids = propRows.map((p) => p.id);
    if (ids.length > 0) {
      const { error } = await supa
        .from("propiedades")
        .update({ fecha_ultima_revision: "2020-01-01T00:00:00Z" })
        .in("id", ids);
      if (error) console.warn(`    priority update: ${error.message}`);
      else
        console.log(
          `  ✓ ${ids.length} propiedades marcadas como prioridad refresh (próximo cron las re-geocodifica)`,
        );
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
