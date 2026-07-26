/**
 * Backfill: propiedades con precision_ubicacion = NULL → "aproximada".
 *
 * Contexto: la migración 0014 agregó precision_ubicacion como columna
 * pero las filas históricas quedaron en NULL. Los scrapers solo escriben
 * precision cuando insertan una fila nueva; una URL ya en DB nunca se
 * re-procesa (`skipUrls` en cada scraper) → nunca se llena.
 *
 * El frontend usa `precision !== "exacta"` para pintar el badge amarillo
 * "Ubicación aproximada". Con NULL no lo pinta, dando la falsa impresión
 * de que la coord es precisa cuando no sabemos.
 *
 * Estrategia: asumir "aproximada" (pesimista honesto). Cualquier
 * re-scrape futuro sobrescribe con el valor real.
 *
 * Uso:
 *   npm run backfill:precision              (dry-run)
 *   npm run backfill:precision:apply        (aplica)
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { createScraperClient } from "./supabase-admin";

const APPLY = process.argv.includes("--apply");
const PAGE = 500;

async function main() {
  const supa = createScraperClient();

  // Contar total
  const { count } = await supa
    .from("propiedades")
    .select("*", { count: "exact", head: true })
    .is("precision_ubicacion", null);
  console.log(`Filas con precision_ubicacion NULL: ${count}`);
  if (!count || count === 0) return;

  console.log(`Modo: ${APPLY ? "APPLY (writes)" : "DRY-RUN (no writes)"}`);
  if (!APPLY) {
    console.log("Nada que hacer sin --apply. Sample de 5:");
    const { data } = await supa
      .from("propiedades")
      .select("id, fuente_id, url_original")
      .is("precision_ubicacion", null)
      .limit(5);
    for (const p of data ?? []) console.log(`  [${p.fuente_id}] ${p.url_original}`);
    return;
  }

  // Update por batches para no explotar Supabase con un solo UPDATE.
  let done = 0;
  while (true) {
    const { data: batch, error: selErr } = await supa
      .from("propiedades")
      .select("id")
      .is("precision_ubicacion", null)
      .limit(PAGE);
    if (selErr) throw selErr;
    if (!batch || batch.length === 0) break;

    const ids = batch.map((r) => r.id);
    const { error: updErr } = await supa
      .from("propiedades")
      .update({ precision_ubicacion: "aproximada" })
      .in("id", ids);
    if (updErr) throw updErr;

    done += ids.length;
    console.log(`  ${done}/${count} actualizadas`);
    if (batch.length < PAGE) break;
  }

  console.log(`\n✓ Total actualizadas: ${done}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
