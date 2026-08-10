/**
 * Helpers compartidos entre los scrapers y jobs de mantenimiento.
 *
 * H22 (2026-08-10): antes había 8 copias de `chunkedParallel` con 3
 * variantes ligeramente distintas (con/sin filtro null, con/sin idx,
 * con/sin early-break). Cambio en una = auditar 7 archivos. Ahora
 * todos importan de acá y las diferencias se expresan como opciones.
 *
 * Dos formas exportadas:
 *   - chunkedParallel        → filtra null/undefined del resultado.
 *                              El default de los scrapers principales.
 *   - chunkedParallelKeepAll → conserva todo, incluidos null (verify y
 *                              refresh-precios los usan como "sin dato").
 *
 * Futuros helpers a extraer si se resiste el test de "cambio en un
 * lugar rompe otros" (M-level en la auditoría): `toNumber`,
 * `checkRobotsTxt`, `fetchHtml`, `nominatimQuery`.
 */

export type ChunkedOpts = {
  /**
   * Se evalúa al inicio de cada chunk. Si retorna true, se corta el
   * loop (refresh-precios lo usa para respetar el deadline de wall-clock).
   */
  shouldStop?: () => boolean;
};

/**
 * Procesa items[] en bloques de tamaño `concurrency`. Filtra
 * null/undefined del resultado. `fn` recibe (item, idx) — el idx es la
 * posición en el array original (útil para asignar recursos por-slot).
 *
 * Errores del callback se descartan silenciosamente (Promise rechazada
 * → no aparece en la salida). El scraper debe capturar sus propios
 * errores en el catch del callback para incrementar contadores (H2).
 */
export async function chunkedParallel<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R | null | undefined>,
  opts: ChunkedOpts = {},
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    if (opts.shouldStop?.()) break;
    const chunk = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      chunk.map((it, j) => fn(it, i + j)),
    );
    for (const r of settled) {
      if (r.status !== "fulfilled") continue;
      if (r.value != null) out.push(r.value);
    }
  }
  return out;
}

/**
 * Variante que conserva null/undefined en el resultado. Usada por
 * verify y refresh-precios donde el callback hace side-effects (update
 * en DB) y retorna null como "sin dato para el caller" pero el side
 * effect ya se aplicó — no queremos que el filtro haga desaparecer
 * esas ejecuciones.
 */
export async function chunkedParallelKeepAll<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>,
  opts: ChunkedOpts = {},
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    if (opts.shouldStop?.()) break;
    const chunk = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      chunk.map((it, j) => fn(it, i + j)),
    );
    for (const r of settled) {
      if (r.status === "fulfilled") out.push(r.value);
    }
  }
  return out;
}
