/**
 * Re-aplica geocoding (tabla zonas-panama + jitter) sin re-scrapear ni
 * regenerar resúmenes IA. Útil cuando se mejora la tabla de centroides
 * y queremos arrastrar el cambio a los pines existentes.
 *
 * Modos:
 *   npm run scrape:coords                # JSON (public/scrape-preview.json)
 *   npm run scrape:coords -- --supabase  # UPDATE en Supabase
 *
 * En modo Supabase: SELECT id, corregimiento, lat, lng; para cada fila
 * con corregimiento conocido en la tabla, recalcula coords con jitter
 * determinístico por url_original; solo hace UPDATE si cambian.
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { config as loadEnv } from "dotenv";

import { createScraperClient } from "./supabase-admin";
import { centroFromTable, jitterCoords } from "./zonas-panama";

loadEnv({ path: ".env.local" });
loadEnv();

const TARGET: "json" | "supabase" = process.argv.includes("--supabase")
  ? "supabase"
  : "json";

type JsonRow = {
  zona: string | null;
  lat: number | null;
  lng: number | null;
  url_original: string;
  [k: string]: unknown;
};

function recalcJson() {
  const PATH = join(process.cwd(), "public", "scrape-preview.json");
  const file = JSON.parse(readFileSync(PATH, "utf-8")) as {
    results: JsonRow[];
    [k: string]: unknown;
  };

  let updated = 0;
  let skipped = 0;
  for (const row of file.results) {
    const center = centroFromTable(row.zona);
    if (!center) {
      console.warn(`  ✗ "${row.zona}" no está en la tabla — sin cambios`);
      skipped++;
      continue;
    }
    const c = jitterCoords(center, row.url_original);
    console.log(
      `  ✓ "${row.zona}": (${row.lat}, ${row.lng}) → (${c.lat.toFixed(6)}, ${c.lng.toFixed(6)})`,
    );
    row.lat = c.lat;
    row.lng = c.lng;
    updated++;
  }

  writeFileSync(PATH, JSON.stringify(file, null, 2));
  console.log(`\n${updated} actualizados, ${skipped} sin cambios.`);
}

type DbRow = {
  id: string;
  corregimiento: string | null;
  lat: number | null;
  lng: number | null;
  url_original: string;
};

// 6 decimales ≈ ~0.1 m. Si la diferencia es menor que esto, no vale la
// pena el UPDATE (mismas coords visualmente).
const COORD_EPSILON = 1e-6;

async function recalcSupabase() {
  const supa = createScraperClient();
  const { data, error } = await supa
    .from("propiedades")
    .select("id, corregimiento, lat, lng, url_original");

  if (error) {
    console.error("Error leyendo propiedades:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as DbRow[];
  console.log(`Propiedades en DB: ${rows.length}.`);

  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const center = centroFromTable(row.corregimiento);
    if (!center) {
      // No está en la tabla — la dejamos como está (probablemente vino
      // de Nominatim y es lo mejor que tenemos hasta agregarla).
      skipped++;
      continue;
    }
    const c = jitterCoords(center, row.url_original);

    const dlat = Math.abs(c.lat - (row.lat ?? 0));
    const dlng = Math.abs(c.lng - (row.lng ?? 0));
    if (dlat < COORD_EPSILON && dlng < COORD_EPSILON) {
      unchanged++;
      continue;
    }

    const { error: updErr } = await supa
      .from("propiedades")
      .update({ lat: c.lat, lng: c.lng })
      .eq("id", row.id);
    if (updErr) {
      console.warn(`  ✗ "${row.corregimiento}" (${row.id}): ${updErr.message}`);
      failed++;
      continue;
    }
    console.log(
      `  ✓ "${row.corregimiento}": (${row.lat}, ${row.lng}) → (${c.lat.toFixed(6)}, ${c.lng.toFixed(6)})`,
    );
    updated++;
  }

  console.log(
    `\n${updated} actualizados, ${unchanged} sin cambios (ya correctos), ${skipped} fuera de tabla, ${failed} con error.`,
  );
}

async function main() {
  if (TARGET === "supabase") {
    console.log("Modo Supabase: UPDATE de coords donde la tabla cambió.");
    await recalcSupabase();
  } else {
    console.log("Modo JSON: actualiza public/scrape-preview.json.");
    recalcJson();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
