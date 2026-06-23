/**
 * Backfill de coords exactas para propiedades existentes.
 *
 * Cuando el pipeline `geocode-edificio` se integró (commit 904ca74 +
 * 683d85d), las ~1,800 props ya en DB siguieron con sus coords viejas
 * (centroide de zona + jitter). Este script las pasa por el mismo
 * pipeline retroactivamente:
 *
 *   1. Trae todas las activas (paginado).
 *   2. Skip panamaequity (su lat/lng viene exacto del JSON-LD del source).
 *   3. Para cada una: extraerEdificio(titulo, null) → pipeline.
 *   4. Si encuentra coord de edificio → UPDATE lat/lng.
 *   5. Si solo cae a zona-centroide → no toca (sería la misma coord).
 *
 * Limitación: solo usamos `titulo` (no tenemos descripcion en DB por
 * regla ToS). La IA todavía extrae bien para títulos con "PH X",
 * "Torre X", etc., que son la mayoría.
 *
 * Uso:
 *   npm run backfill:edificios          # dry-run, lista cambios sin escribir
 *   npm run backfill:edificios:prod     # UPDATE en Supabase
 *
 * El script puede interrumpirse (Ctrl+C) y re-correrse: el cache de
 * edificios se preserva entre corridas, así que las props ya procesadas
 * son rápidas en el segundo run.
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

// Source-first fuente: ya tienen coord exacta del HTML, no rehacer.
const SKIP_FUENTES = new Set(["panamaequity"]);

type Prop = {
  id: string;
  titulo: string;
  lat: number | null;
  lng: number | null;
  corregimiento: string | null;
  fuente_id: string;
  url_original: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const supa = createScraperClient();

  // Paginado: Supabase JS cap 1000/query.
  const PAGE_SIZE = 1000;
  const all: Prop[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supa
      .from("propiedades")
      .select("id, titulo, lat, lng, corregimiento, fuente_id, url_original")
      .eq("estado_anuncio", "activo")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("Error leyendo propiedades:", error.message);
      process.exit(1);
    }
    const batch = (data ?? []) as Prop[];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const candidatas = all.filter((p) => !SKIP_FUENTES.has(p.fuente_id));
  const props = LIMIT ? candidatas.slice(0, LIMIT) : candidatas;
  console.log(
    `Activas: ${all.length} | candidatas (sin ${[...SKIP_FUENTES].join(",")}): ${candidatas.length} | procesando: ${props.length}.`,
  );
  if (!WRITE) console.log("(dry-run — usa --supabase para escribir UPDATE)");

  let updated = 0;
  let unchanged = 0;
  let descartadas = 0;
  let failed = 0;

  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (i % 25 === 0 && i > 0) {
      console.log(
        `  [${i}/${props.length}] updated=${updated} unchanged=${unchanged} descartadas=${descartadas} failed=${failed}`,
      );
    }

    try {
      // Pipeline: pasamos titulo y NULL como descripcion (no tenemos
      // descripcion en DB por regla ToS). zonaFallback = corregimiento.
      const geo = await geocodeConEdificio(
        p.titulo,
        null,
        p.url_original,
        p.corregimiento,
      );

      if (!geo) {
        descartadas++;
        continue;
      }

      // Solo nos interesa actualizar si la nueva coord es de EDIFICIO
      // (precisión exacta). Las de "zona" son las mismas que ya tenemos
      // (centroide + jitter determinístico por url_original).
      if (geo.precision !== "edificio") {
        unchanged++;
        continue;
      }

      // Sanity: no escribir si el cambio es < ~10m (irrelevante).
      const dlat = Math.abs(geo.lat - (p.lat ?? 0));
      const dlng = Math.abs(geo.lng - (p.lng ?? 0));
      if (dlat < 0.0001 && dlng < 0.0001) {
        unchanged++;
        continue;
      }

      console.log(
        `  ✓ ${p.titulo.slice(0, 60)} | (${p.lat?.toFixed(4)}, ${p.lng?.toFixed(4)}) → (${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}) [${geo.source}]`,
      );

      if (WRITE) {
        const { error: updErr } = await supa
          .from("propiedades")
          .update({ lat: geo.lat, lng: geo.lng })
          .eq("id", p.id);
        if (updErr) {
          console.warn(`    update error: ${updErr.message}`);
          failed++;
          continue;
        }
      }
      updated++;
    } catch (err) {
      console.warn(`  ✗ ${p.id}: ${(err as Error).message}`);
      failed++;
    }

    // Pequeño respiro para no saturar Gemini (15 req/min free tier).
    // Pipeline hace 1 llamada IA + 0..1 web search por prop. Sleep
    // mantiene throughput ~10-12 req/min con margen.
    await sleep(150);
  }

  console.log(
    `\nResumen: updated=${updated} unchanged=${unchanged} descartadas=${descartadas} failed=${failed}`,
  );
  if (!WRITE && updated > 0) {
    console.log("(dry-run — re-correr con --supabase para aplicar los UPDATEs)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
