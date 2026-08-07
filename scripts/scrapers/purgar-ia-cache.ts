/**
 * Purgador manual del cache ia_extract_cache — fix H17 parte 2.
 *
 * El lookup ya descarta hits >90d automáticamente (soft TTL — la fila
 * queda en la tabla pero no se usa). Este script permite:
 *   - Ver cuántas filas están más allá del TTL.
 *   - --apply: hard-delete de esas filas (housekeeping).
 *   - --model=X: eliminar filas de un modelo antiguo (si cambiamos
 *     GROQ_MODEL, las filas viejas ya no se leen pero ocupan espacio).
 *
 * Uso:
 *   npm run purgar-ia-cache               # dry-run, filas >90d
 *   npm run purgar-ia-cache:apply         # elimina >90d
 *   npm run purgar-ia-cache -- --model=llama-3.1-8b-instant  # solo ese modelo
 */

import { config as loadEnv } from "dotenv";

import { createScraperClient } from "./supabase-admin";

loadEnv({ path: ".env.local" });
loadEnv();

const APPLY = process.argv.includes("--apply");
const TTL_DIAS = 90;
const modelArg = process.argv.find((a) => a.startsWith("--model="));
const MODEL_FILTER = modelArg ? modelArg.slice("--model=".length) : null;

async function main() {
  const supa = createScraperClient();

  const cutoff = new Date(Date.now() - TTL_DIAS * 86_400_000).toISOString();
  let query = supa
    .from("ia_extract_cache")
    .select("input_hash, model, created_at, last_hit_at, hit_count", {
      count: "exact",
      head: true,
    })
    .lt("created_at", cutoff);
  if (MODEL_FILTER) query = query.eq("model", MODEL_FILTER);
  const { count, error } = await query;
  if (error) {
    console.error(`SELECT falló: ${error.message}`);
    process.exit(1);
  }
  const total = count ?? 0;
  console.log(
    `\nFilas con created_at < ${cutoff} (>${TTL_DIAS}d)${MODEL_FILTER ? ` model=${MODEL_FILTER}` : ""}: ${total}`,
  );

  if (total === 0) {
    console.log("Nada para purgar.");
    return;
  }

  if (!APPLY) {
    console.log("Dry-run. Re-ejecutar con --apply para eliminar.");
    return;
  }

  let del = supa.from("ia_extract_cache").delete().lt("created_at", cutoff);
  if (MODEL_FILTER) del = del.eq("model", MODEL_FILTER);
  const { error: delErr } = await del;
  if (delErr) {
    console.error(`DELETE falló: ${delErr.message}`);
    process.exit(1);
  }
  console.log(`✓ ${total} filas eliminadas.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
