/**
 * Re-evalúa propiedades archivadas con el pipeline strict (edificio).
 *
 * Contexto: el 2026-06-25 cambiamos a strict mode (no zone-fallback)
 * y archivamos las 2929 props existentes. El cron diario solo procesa
 * URLs nuevas de los listings — los archivados se quedan archivados
 * salvo que reaparezcan en una lista (raro).
 *
 * Este script va específicamente sobre las archivadas y para cada una:
 *   1. Corre el pipeline (Groq IA extract → cache lookup → web search)
 *   2. Si encuentra coord de edificio: REVIVE (estado='activo', lat/lng exactos)
 *   3. Si no: queda archivada (no se inserta basura)
 *
 * Idempotente y reanudable: el cache de edificios persiste, así que
 * re-correrlo es rápido para las ya procesadas.
 *
 * Uso:
 *   npm run reprocess:archived            # dry-run
 *   npm run reprocess:archived:prod       # UPDATE en Supabase
 */

import { config as loadEnv } from "dotenv";

import { geocodeConEdificio } from "./geocode-edificio";
import { createScraperClient } from "./supabase-admin";

loadEnv({ path: ".env.local" });
loadEnv();

const WRITE = process.argv.includes("--supabase");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  if (i < 0) return null;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

type Prop = {
  id: string;
  titulo: string;
  corregimiento: string | null;
  fuente_id: string;
  url_original: string;
  lat: number | null;
  lng: number | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const supa = createScraperClient();

  // Paginado: todos los archivados
  const PAGE = 1000;
  const all: Prop[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supa
      .from("propiedades")
      .select("id, titulo, corregimiento, fuente_id, url_original, lat, lng")
      .eq("estado_anuncio", "archivado")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("Error leyendo propiedades:", error.message);
      process.exit(1);
    }
    const batch = (data ?? []) as Prop[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  const props = LIMIT ? all.slice(0, LIMIT) : all;
  console.log(`Archivadas totales: ${all.length} | procesando: ${props.length}`);
  if (!WRITE) console.log("(dry-run — usa --supabase para escribir UPDATE)");

  let revividas = 0;
  let sinResultado = 0;
  let failed = 0;
  const t0 = Date.now();

  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (i % 100 === 0 && i > 0) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      const rate = (i / Number(elapsed)).toFixed(1);
      console.log(
        `  [${i}/${props.length}] ${elapsed}s @ ${rate}/s | revividas=${revividas} sin_resultado=${sinResultado} failed=${failed}`,
      );
    }

    try {
      const geo = await geocodeConEdificio(
        p.titulo,
        null, // no tenemos descripcion en DB
        p.url_original,
        p.corregimiento,
      );

      if (!geo) {
        // No se pudo resolver edificio — queda archivada
        sinResultado++;
        continue;
      }

      // Solo revivir con precisión exacta (coord del source o cache manual).
      // Aproximada = web search — no queremos revivir con coord dudosa.
      // Zona-declarada no aplica: reprocess corre sin allowZoneFallback.
      if (geo.precision !== "exacta") {
        sinResultado++;
        continue;
      }

      console.log(
        `  ✓ REVIVIDA: ${p.fuente_id} ${p.titulo.slice(0, 60)} → (${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}) [${geo.source}]`,
      );

      if (WRITE) {
        const nowIso = new Date().toISOString();
        const { error: updErr } = await supa
          .from("propiedades")
          .update({
            estado_anuncio: "activo",
            lat: geo.lat,
            lng: geo.lng,
            // H20: antes solo actualizaba lat/lng → la fila quedaba con
            // coord nueva pero precision/ubicacion_fuente viejas (null o
            // "aproximada" del backfill masivo). El badge "Ubicación
            // aproximada" aparecía incorrectamente en el mapa.
            precision_ubicacion: geo.precision,
            ubicacion_fuente: geo.source,
            veces_no_encontrado: 0,
            fecha_ultima_vista: nowIso,
            fecha_ultima_revision: nowIso,
            motivo_estado: `re-evaluado strict: edificio resuelto (${geo.source})`,
          })
          .eq("id", p.id);
        if (updErr) {
          console.warn(`    update error: ${updErr.message}`);
          failed++;
          continue;
        }
      }
      revividas++;
    } catch (err) {
      console.warn(`  ✗ ${p.id}: ${(err as Error).message}`);
      failed++;
    }

    // Groq es rápido pero pongamos un mínimo para no saturar la red.
    await sleep(50);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(
    `\nResumen (${elapsed}s): revividas=${revividas} sin_resultado=${sinResultado} failed=${failed}`,
  );
  if (!WRITE && revividas > 0) {
    console.log("(dry-run — re-correr con --supabase para aplicar los UPDATEs)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
