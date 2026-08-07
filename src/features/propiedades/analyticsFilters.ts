import type {
  CategoriaPropiedad,
  ConfianzaScore,
  Oportunidad,
  TipoOperacion,
} from "./types";

export type AnalyticsFilters = {
  operacion: TipoOperacion[];
  categoria: CategoriaPropiedad[];
  confianza: ConfianzaScore[];
  fuentes: string[];
  scoreMin?: number;
};

export const emptyAnalyticsFilters: AnalyticsFilters = {
  operacion: [],
  categoria: [],
  confianza: [],
  fuentes: [],
};

export function countActiveAnalyticsFilters(f: AnalyticsFilters): number {
  let n = 0;
  if (f.operacion.length) n++;
  if (f.categoria.length) n++;
  if (f.confianza.length) n++;
  if (f.fuentes.length) n++;
  if (f.scoreMin !== undefined) n++;
  return n;
}

/**
 * Cuenta SOLO los filtros que `applyMapFilters` aplica efectivamente
 * (operación, categoría, fuentes). scoreMin y confianza son métricas
 * derivadas de `vw_oportunidades` que la vista del mapa no puede
 * aplicar — antes se contaban como activos y el chip mostraba "1
 * filtro" con el mapa idéntico → auditoría CRITICAL C1.
 */
export function countActiveMapFilters(f: AnalyticsFilters): number {
  let n = 0;
  if (f.operacion.length) n++;
  if (f.categoria.length) n++;
  if (f.fuentes.length) n++;
  return n;
}

/** True si hay filtros de análisis activos que el mapa no aplica. */
export function hasAnalyticsOnlyFilters(f: AnalyticsFilters): boolean {
  return f.confianza.length > 0 || f.scoreMin !== undefined;
}

export function applyAnalyticsFilters(
  items: Oportunidad[],
  f: AnalyticsFilters,
): Oportunidad[] {
  return items.filter((o) => {
    if (f.operacion.length && !f.operacion.includes(o.tipoOperacion))
      return false;
    if (f.categoria.length && !f.categoria.includes(o.categoria)) return false;
    if (f.confianza.length && !f.confianza.includes(o.confianza)) return false;
    if (f.fuentes.length && !f.fuentes.includes(o.fuenteNombre)) return false;
    if (
      f.scoreMin !== undefined &&
      (o.opportunityScore ?? 0) < f.scoreMin
    )
      return false;
    return true;
  });
}
