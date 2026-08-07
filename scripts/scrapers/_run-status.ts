/**
 * Helper compartido para decidir el `status` de una fila `scraper_runs`.
 *
 * Fix auditoría H1 (2026-08-07): la fórmula copiada en 6 scrapers era
 *   `errors > 0 && inserted === 0 ? "error" : "ok"`
 * → una corrida con 1 fila insertada + 200 errores reportaba `ok` y las
 * alertas externas nunca disparaban. Perdíamos actualizaciones de precio
 * y URLs completas sin darnos cuenta.
 *
 * Regla nueva basada en ratio:
 *  - Sin actividad ni errores → ok (corrida legítima vacía, p.ej. cero
 *    URLs nuevas después de dedupear existentes).
 *  - `errors > 0 && ok === 0` → error (todo lo intentado falló).
 *  - `errors / (ok + errors) > 0.2` → error (calidad degradada aunque
 *    algo pase; el 20 % es umbral conservador: si más de 1 de cada 5
 *    intentos falla, algo está roto y hay que mirar).
 *  - Else → ok.
 */

export type RunCounts = {
  /** Filas procesadas correctamente (inserted + updated + sinCambio + 404, según el scraper). */
  ok: number;
  errors: number;
};

export function computeRunStatus(
  counts: RunCounts,
  errorRatioThreshold = 0.2,
): "ok" | "error" {
  const { ok, errors } = counts;
  const total = ok + errors;
  if (total === 0) return "ok";
  if (errors > 0 && ok === 0) return "error";
  if (errors / total > errorRatioThreshold) return "error";
  return "ok";
}
