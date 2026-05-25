/**
 * Re-aplica geocoding (tabla zonas-panama + jitter) a las coords de
 * public/scrape-preview.json sin re-scrapear ni regenerar resúmenes IA.
 * Útil cuando se mejora la tabla de centroides y se quieren actualizar
 * solo las posiciones de los pines existentes.
 *
 *   npm run scrape:coords
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { centroFromTable, jitterCoords } from "./zonas-panama";

type Row = {
  zona: string | null;
  lat: number | null;
  lng: number | null;
  url_original: string;
  [k: string]: unknown;
};

const PATH = join(process.cwd(), "public", "scrape-preview.json");
const file = JSON.parse(readFileSync(PATH, "utf-8")) as {
  results: Row[];
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
