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
  zonas: string[];
  fuentes: string[];
  scoreMin?: number;
};

export const emptyAnalyticsFilters: AnalyticsFilters = {
  operacion: [],
  categoria: [],
  confianza: [],
  zonas: [],
  fuentes: [],
};

export function countActiveAnalyticsFilters(f: AnalyticsFilters): number {
  let n = 0;
  if (f.operacion.length) n++;
  if (f.categoria.length) n++;
  if (f.confianza.length) n++;
  if (f.zonas.length) n++;
  if (f.fuentes.length) n++;
  if (f.scoreMin !== undefined) n++;
  return n;
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
    if (f.zonas.length) {
      if (!o.corregimiento || !f.zonas.includes(o.corregimiento)) return false;
    }
    if (f.fuentes.length && !f.fuentes.includes(o.fuenteNombre)) return false;
    if (
      f.scoreMin !== undefined &&
      (o.opportunityScore ?? 0) < f.scoreMin
    )
      return false;
    return true;
  });
}
