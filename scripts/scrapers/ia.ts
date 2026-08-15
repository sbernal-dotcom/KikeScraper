/**
 * Enriquecimiento IA — STUB (Gemini removido 2026-08-11, fix L4).
 *
 * Este módulo antes contenía 176 líneas de integración con Gemini para
 * generar resumen bilingüe (ES/EN) + tags cerrados/libres. Ya llevaba
 * meses apagado en prod (`AI_SUMMARY_ENABLED=false`) por precaución
 * legal sobre derechos de la descripción original.
 *
 * En vez de dejarlo como código muerto que nadie prueba (riesgo: bugs
 * silenciosos), se reemplazó por un stub explícito:
 *   - `enriquecerConIA` retorna resultado vacío inmediatamente.
 *   - `trimDescripcion` se conserva (utilidad de string inofensiva).
 *   - Los tipos siguen exportados para que los 8 scrapers que lo
 *     importan sigan compilando sin cambios.
 *
 * ⚠️ PENDIENTE: el user va a pasar una spec de qué hace cada IA (Gemini
 * vs Groq vs futura opción) para rediseñar el enriquecimiento. Cuando
 * llegue, esta interfaz es el punto de conexión — cambiar la impl de
 * `enriquecerConIA` sin tocar los callers.
 */

import type { TagCerrado } from "./tags-caracteristicas";

export type ResumenBilingue = { es: string; en: string };

export type EnriquecimientoIA = {
  resumen_ia: ResumenBilingue | null;
  tags_caracteristicas: TagCerrado[];
  tags_extra: string[];
  ai_source_flag: "generated_from_external_description" | null;
};

export const ENRIQUECIMIENTO_VACIO: EnriquecimientoIA = {
  resumen_ia: null,
  tags_caracteristicas: [],
  tags_extra: [],
  ai_source_flag: null,
};

export type FichaIA = {
  titulo: string | null;
  tipoOperacion: "venta" | "alquiler";
  precio: number | null;
  moneda: string | null;
  area_m2: number | null;
  habitaciones: number | null;
  banos: number | null;
  estacionamientos: number | null;
  zona: string | null;
};

const DESCRIPCION_MAX = 280;

/**
 * Limpia y corta la descripción original a un cap razonable. Se mantuvo
 * por si un futuro rediseño de IA la vuelve a necesitar como input, y
 * porque es un helper de string trivialmente correcto.
 */
export function trimDescripcion(
  desc: string | undefined | null,
): string | null {
  if (!desc) return null;
  const clean = desc
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return null;
  if (clean.length <= DESCRIPCION_MAX) return clean;
  return clean.slice(0, DESCRIPCION_MAX).trimEnd() + "…";
}

/**
 * Stub: retorna ENRIQUECIMIENTO_VACIO sin hacer llamadas externas. Los
 * scrapers seguirán guardando propiedades sin resumen ni tags derivados
 * de IA — solo con lo que sacan del HTML directamente.
 *
 * Cuando llegue la spec del nuevo diseño, reemplazar esta impl.
 */
export async function enriquecerConIA(
  _ficha: FichaIA,
  _descripcion: string | null,
): Promise<EnriquecimientoIA> {
  return ENRIQUECIMIENTO_VACIO;
}
