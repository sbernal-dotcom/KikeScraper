/**
 * Extractores de HTML específicos de InmoPanama, compartidos entre el
 * scraper principal (`scraper-inmopanama.ts`) y el refresh liviano
 * (`refresh-precios.ts`).
 *
 * M1 (auditoría 2026-08-06): antes teníamos los mismos 4 regex de
 * cascada de precio + el parseQuickFacts copiados en ambos archivos.
 * Cuando se agregó el fallback "PRECIO DE VENTA/ALQUILER" el 2026-08-01
 * hubo que sincronizarlo a mano en los dos lugares.
 *
 * No incluimos el fallback semántico de IA (`extraer-html-ia.ts`) — ese
 * es específico del scraper principal y refresh-precios lo evita por
 * diseño (no queremos usar IA en el refresh diario).
 */

/**
 * Normaliza un label del HTML de InmoPanama a lowercase sin acentos ni
 * puntuación, para lookups robustos ("Precio:" → "precio").
 */
function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[:.]/g, "")
    .trim();
}

/**
 * Convierte "$1,500.00", "1.500", "1500" → number. Devuelve null si no
 * parsea o es <= 0. Duplicado con `scraper-inmopanama.ts` y
 * `refresh-precios.ts` (auditoría M22 hará el consolidado global).
 */
function toNumber(text: string | number | null | undefined): number | null {
  if (text == null) return null;
  const raw = String(text)
    .replace(/&\w+;/g, " ")
    .replace(/&#\d+;/g, " ")
    .trim();
  const negative = raw.startsWith("-");
  let s = raw.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) s = s.replace(/,/g, "");
  else if (hasComma) {
    if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, "");
    else s = s.replace(",", ".");
  }
  let n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (negative) n = -n;
  return n;
}

/**
 * Parsea la tabla `nb-quick-fact-cell` de InmoPanama. Devuelve un mapa
 * `label_normalizado → value_raw`. Ejemplos de labels: "precio",
 * "habitaciones", "banos", "area", "estacionamiento".
 */
export function parseInmoQuickFacts(html: string): Map<string, string> {
  const facts = new Map<string, string>();
  const re =
    /<div\s+class="[^"]*nb-quick-fact-cell[^"]*"[^>]*>\s*<div\s+class="nb-quick-fact-label"[^>]*>\s*([^<]+?)\s*<\/div>\s*<div\s+class="nb-quick-fact-value"[^>]*>\s*([^<]+?)\s*<\/div>/gi;
  for (const m of html.matchAll(re)) {
    const label = normalizeLabel(m[1]);
    const value = m[2].trim();
    if (label && value) facts.set(label, value);
  }
  return facts;
}

/**
 * Cascada de extracción de precio para InmoPanama. Cuatro fallbacks en
 * orden de confianza descendente. Si el caller ya tiene quick-facts
 * parseados (evita re-correr la regex), pasarlos como `qf`.
 *
 * Orden de fallbacks:
 *   1. Quick-fact con label "precio" (rediseño nb-*, 2026-07).
 *   2. Bloque específico `nb-price-cell` (por si el label no matcheó).
 *   3. Diseño viejo `<span class="ib-prop-main-price">` (pre 2026-07).
 *   4. Texto libre "PRECIO DE VENTA/ALQUILER: X" (visto en 2026-08-01
 *      para listings sin bloque estructurado).
 */
export function extractInmoPrecio(
  html: string,
  qf?: Map<string, string>,
): number | null {
  const facts = qf ?? parseInmoQuickFacts(html);

  // 1. Quick-fact con label "precio".
  const nuevoRaw = facts.get("precio");
  if (nuevoRaw) {
    const n = toNumber(nuevoRaw);
    if (n) return n;
  }
  // 2. Bloque nb-price-cell directo.
  const nbPriceCell = html.match(
    /class="[^"]*nb-price-cell[^"]*"[\s\S]{0,500}?class="nb-quick-fact-value"[^>]*>\s*\$?\s*([\d,\.]+)/i,
  )?.[1];
  const nb = toNumber(nbPriceCell ?? null);
  if (nb) return nb;
  // 3. Diseño viejo.
  const viejoRaw =
    html.match(/class="ib-prop-main-price"[^>]*>\s*([^<]+?)\s*</i)?.[1] ?? null;
  const viejo = toNumber(viejoRaw);
  if (viejo) return viejo;
  // 4. Texto libre en descripción.
  const textoDesc = html.match(
    /PRECIO\s+DE\s+(?:VENTA|ALQUILER)[:\s]+\$?\s*([\d,\.]+)/i,
  )?.[1];
  return toNumber(textoDesc ?? null);
}
