/**
 * Backfill correctivo de `precision_ubicacion` por fuente — fix M5.
 *
 * Contexto: el backfill inicial (2026-07-25, hoy en `_archived/`) aplanó
 * ~3781 filas a `precision_ubicacion="aproximada"` sin diferenciar por
 * fuente. Consecuencia: Savitat y Panama Equity (que casi siempre
 * tenían coord exacta del JSON-LD) quedaron mal etiquetadas como
 * "aproximada" → el badge "Ubicación aproximada" aparece indebidamente
 * en el mapa para propiedades que sí tenían coord del source.
 *
 * Estrategia: para cada fuente, aplicar el default correcto SOLO a
 * filas que hoy tienen `precision_ubicacion='aproximada'` Y NO tienen
 * `ubicacion_fuente` (fue backfill masivo, no una decisión del scraper).
 *
 *   - savitat + panamaequity: default = 'exacta' (publican coord en JSON-LD).
 *   - inmopanama + mlsacobir + acobir + encuentra24: dejar 'aproximada'
 *     (nunca traen coord del source, pipeline las genera).
 *
 * Idempotente: solo actualiza donde precision='aproximada' Y
 * ubicacion_fuente IS NULL. Filas ya correctas se saltan.
 *
 * Uso:
 *   npm run backfill:precision-fuente          # dry-run
 *   npm run backfill:precision-fuente:apply
 */

import { config as loadEnv } from "dotenv";

import { createScraperClient } from "./supabase-admin";

loadEnv({ path: ".env.local" });
loadEnv();

const APPLY = process.argv.includes("--apply");

type FuenteRule = {
  fuente_id: string;
  nuevaPrecision: "exacta" | "aproximada" | "zona-declarada";
  nuevaFuente: string;
};

// Reglas de corrección por fuente. Solo listamos las que necesitan
// cambio; el resto se deja como está.
const REGLAS: FuenteRule[] = [
  {
    fuente_id: "savitat",
    nuevaPrecision: "exacta",
    nuevaFuente: "jsonld_geo",
  },
  {
    fuente_id: "panamaequity",
    nuevaPrecision: "exacta",
    nuevaFuente: "jsonld_geo",
  },
];

async function main() {
  const supa = createScraperClient();

  console.log(`Modo: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);
  let totalAfectadas = 0;
  let totalActualizadas = 0;

  for (const regla of REGLAS) {
    console.log(`▶ ${regla.fuente_id} → precision="${regla.nuevaPrecision}" fuente="${regla.nuevaFuente}"`);

    // Contar cuántas van a cambiar.
    const { count, error: countErr } = await supa
      .from("propiedades")
      .select("*", { count: "exact", head: true })
      .eq("fuente_id", regla.fuente_id)
      .eq("precision_ubicacion", "aproximada")
      .is("ubicacion_fuente", null);
    if (countErr) {
      console.warn(`  count error: ${countErr.message}`);
      continue;
    }
    const n = count ?? 0;
    console.log(`  ${n} filas afectadas`);
    totalAfectadas += n;

    if (!APPLY || n === 0) continue;

    const { error: updErr } = await supa
      .from("propiedades")
      .update({
        precision_ubicacion: regla.nuevaPrecision,
        ubicacion_fuente: regla.nuevaFuente,
      })
      .eq("fuente_id", regla.fuente_id)
      .eq("precision_ubicacion", "aproximada")
      .is("ubicacion_fuente", null);
    if (updErr) {
      console.warn(`  update error: ${updErr.message}`);
      continue;
    }
    console.log(`  ✓ ${n} actualizadas`);
    totalActualizadas += n;
  }

  console.log(
    `\n[${APPLY ? "APPLY" : "DRY-RUN"}] Total afectadas: ${totalAfectadas}` +
      (APPLY ? ` · actualizadas: ${totalActualizadas}` : ""),
  );
  if (!APPLY) console.log("Re-ejecutar con --apply para aplicar cambios.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
