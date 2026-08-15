/**
 * Backfill: normaliza `propiedades.corregimiento` a la forma canónica
 * (lowercase, sin acentos, espacios colapsados).
 *
 * Motivación (auditoría CRITICAL C3): los scrapers guardaban la zona
 * cruda del portal ("Bella Vista", "BELLA VISTA", "Marbella, Bella
 * Vista", etc.). El `GROUP BY corregimiento` del benchmark separaba
 * cada variante en su propio bucket → promedios y scores calculados
 * sobre muestras chicas y podridos.
 *
 * Desde este PR los 6 scrapers persisten con `normalizeKey()`. Este
 * script re-normaliza las filas históricas para consolidar los buckets
 * viejos con los nuevos.
 *
 * Uso:
 *   npm run backfill:corregimiento      # dry-run (muestra los cambios)
 *   npm run backfill:corregimiento:apply
 */

import { config as loadEnv } from "dotenv";

import { createScraperClient } from "../supabase-admin";
import { normalizeKey } from "../zonas-panama";

loadEnv({ path: ".env.local" });
loadEnv();

const APPLY = process.argv.includes("--apply");

async function main() {
  const supa = createScraperClient();
  const PAGE = 1000;
  let from = 0;
  let total = 0;
  let cambiadas = 0;
  const muestras: Array<{ before: string; after: string; count: number }> = [];
  const bucketBefore = new Map<string, number>();
  const bucketAfter = new Map<string, number>();

  while (true) {
    const { data, error } = await supa
      .from("propiedades")
      .select("id, corregimiento")
      .not("corregimiento", "is", null)
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("SELECT falló:", error.message);
      process.exit(1);
    }
    const rows = (data ?? []) as Array<{ id: string; corregimiento: string }>;
    if (rows.length === 0) break;
    total += rows.length;

    for (const r of rows) {
      const before = r.corregimiento;
      const after = normalizeKey(before);
      bucketBefore.set(before, (bucketBefore.get(before) ?? 0) + 1);
      bucketAfter.set(after, (bucketAfter.get(after) ?? 0) + 1);
      if (after !== before) {
        cambiadas++;
        if (APPLY) {
          const { error: upErr } = await supa
            .from("propiedades")
            .update({ corregimiento: after })
            .eq("id", r.id);
          if (upErr) console.warn(`  update ${r.id}: ${upErr.message}`);
        } else if (muestras.length < 20) {
          // Colectar muestras para dry-run
          const existing = muestras.find((m) => m.before === before);
          if (existing) existing.count++;
          else muestras.push({ before, after, count: 1 });
        }
      }
    }

    if (rows.length < PAGE) break;
    from += PAGE;
  }

  console.log(`\nTotal filas: ${total}`);
  console.log(`Cambiadas: ${cambiadas}`);
  console.log(`Buckets antes: ${bucketBefore.size}`);
  console.log(`Buckets después: ${bucketAfter.size}`);
  console.log(
    `Consolidación: ${bucketBefore.size - bucketAfter.size} buckets duplicados eliminados`,
  );

  if (!APPLY) {
    console.log("\nMuestra de cambios (usa --apply para ejecutar):");
    for (const m of muestras.sort((a, b) => b.count - a.count)) {
      console.log(`  "${m.before}" → "${m.after}"  (${m.count}× en muestra)`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
