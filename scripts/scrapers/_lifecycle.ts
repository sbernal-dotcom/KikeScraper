/**
 * Helper compartido para evitar que los scrapers pisen el lifecycle de
 * propiedades archivadas / marcadas como problemáticas.
 *
 * Fondo: los scrapers hacen `upsert(row, {onConflict: 'url_original'})`
 * con `estado_anuncio="activo"` y `veces_no_encontrado=0` cada vez que
 * ven la URL en el listado del portal. Si verify había marcado la fila
 * como `posible_inactivo` (veces=5) porque el HTML devolvía 404, la
 * corrida del scraper la resetea a `activo, veces=0` SIN re-validar el
 * HTML — cancelando el progreso del lifecycle. Peor: propiedades
 * archivadas por `archivar-props-en-mar` o `limpiar-cache-duplicado`
 * (coord falsa) vuelven a `activo` con la misma coord mala.
 *
 * Fix (auditoría CRITICAL C2): antes del upsert, chequeamos el estado
 * actual de la fila. Si NO está `activo`, el helper quita del payload
 * los campos que pisarían la decisión de verify. El upsert entonces
 * actualiza precio/área/coord/tags (datos reales del scrape) pero
 * respeta lo que verify o los scripts de mantenimiento hayan decidido.
 *
 * Uso: reemplazar
 *   `.upsert(row, { onConflict: "url_original" })`
 * por
 *   `.upsert(stripLifecycleIfNotActive(row, existingMap.get(url)), ...)`
 *
 * donde `existingMap` es Map<url, {estado_anuncio}> obtenido de la
 * misma query de `fetchExistingUrls` (ahora devuelve estado además de
 * la URL). URL nueva (no en el map) recibe el row full.
 */

export type ExistingState = {
  estado_anuncio: string;
};

/** Estados que NO deben ser sobreescritos por un scrape rutinario. */
const LIFECYCLE_LOCKED_STATES = new Set([
  "archivado",
  "error_verificacion",
  "posible_inactivo",
  "vendido",
  "alquilado",
  "retirado",
]);

/** Campos del payload que pisan decisiones de lifecycle. */
const LIFECYCLE_FIELDS = [
  "estado_anuncio",
  "veces_no_encontrado",
  "motivo_estado",
  "fecha_deteccion",
] as const;

/**
 * Si la fila ya existe con estado != "activo", devuelve el row SIN los
 * campos que pisarían el lifecycle. Sino, devuelve el row tal cual.
 */
export function stripLifecycleIfNotActive(
  row: Record<string, unknown>,
  existing: ExistingState | undefined,
): Record<string, unknown> {
  // URL nueva → insert full.
  if (!existing) return row;
  // Fila activa → upsert normal (el scrape confirma que sigue viva y
  // resetea el contador de veces_no_encontrado a 0, deseado).
  if (!LIFECYCLE_LOCKED_STATES.has(existing.estado_anuncio)) return row;
  // Fila archivada / marcada como problemática → NO tocar lifecycle,
  // pero SÍ actualizar precio/coord/tags/etc.
  const cleaned: Record<string, unknown> = { ...row };
  for (const f of LIFECYCLE_FIELDS) delete cleaned[f];
  return cleaned;
}
