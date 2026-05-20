import type {
  CategoriaPropiedad,
  Condicion,
  Propiedad,
  TipoOperacion,
} from "./types";
import { labelCategoria, labelTipoOperacion } from "./format";

export type PropiedadFilters = {
  operacion: TipoOperacion[];
  categoria: CategoriaPropiedad[];
  condicion: Condicion[];
  fuentes: string[];
  precioMin?: number;
  precioMax?: number;
  habitacionesMin?: number;
  banosMin?: number;
};

export const emptyFilters: PropiedadFilters = {
  operacion: [],
  categoria: [],
  condicion: [],
  fuentes: [],
};

export function countActiveFilters(f: PropiedadFilters): number {
  let n = 0;
  if (f.operacion.length) n++;
  if (f.categoria.length) n++;
  if (f.condicion.length) n++;
  if (f.fuentes.length) n++;
  if (f.precioMin !== undefined || f.precioMax !== undefined) n++;
  if (f.habitacionesMin !== undefined) n++;
  if (f.banosMin !== undefined) n++;
  return n;
}

export function applyFilters(
  items: Propiedad[],
  query: string,
  f: PropiedadFilters,
): Propiedad[] {
  const q = query.trim().toLowerCase();
  return items.filter((p) => {
    if (q) {
      const haystack = [
        p.titulo,
        p.ubicacion.corregimiento,
        p.ubicacion.distrito,
        labelCategoria(p.categoria),
        labelTipoOperacion(p.tipoOperacion),
        p.fuenteNombre,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (f.operacion.length && !f.operacion.includes(p.tipoOperacion))
      return false;
    if (f.categoria.length && !f.categoria.includes(p.categoria)) return false;
    if (f.condicion.length) {
      if (!p.condicion || !f.condicion.includes(p.condicion)) return false;
    }
    if (f.fuentes.length && !f.fuentes.includes(p.fuenteNombre)) return false;
    if (f.precioMin !== undefined && p.precio < f.precioMin) return false;
    if (f.precioMax !== undefined && p.precio > f.precioMax) return false;
    if (
      f.habitacionesMin !== undefined &&
      (p.habitaciones ?? 0) < f.habitacionesMin
    )
      return false;
    if (f.banosMin !== undefined && (p.banos ?? 0) < f.banosMin) return false;
    return true;
  });
}
