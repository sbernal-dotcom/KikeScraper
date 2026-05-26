/**
 * Lista cerrada de tags de características aprobada para el proyecto.
 * Cualquier tag fuera de esta lista que Gemini proponga va a tags_extra
 * (máx 3 por anuncio).
 *
 * Si una etiqueta de tags_extra empieza a aparecer con frecuencia,
 * promoverla a la lista cerrada y re-correr el enriquecimiento.
 */
export const TAGS_CERRADOS = [
  // Amenidades del conjunto
  "piscina",
  "gimnasio",
  "seguridad-24-7",
  "area-social",
  "spa",
  // Estado
  "a-estrenar",
  "remodelado",
  "como-nuevo",
  // Mobiliario y equipamiento
  "amoblado",
  "semi-amoblado",
  "linea-blanca",
  "aire-acondicionado",
  // Exteriores
  "balcon",
  "terraza",
  "jardin",
  "penthouse",
  // Vistas
  "vista-al-mar",
  "vista-a-la-ciudad",
  // Edificio
  "ascensor",
  "estacionamiento-techado",
  "deposito",
  "planta-electrica",
  // Conjunto / ubicación
  "centrico",
  "frente-al-mar",
  "urbanizacion-cerrada",
  // Otros
  "mascotas-permitidas",
] as const;

export type TagCerrado = (typeof TAGS_CERRADOS)[number];

const SET_CERRADOS = new Set<string>(TAGS_CERRADOS);

function normalizeTag(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Acepta tags solo si están exactos en la lista cerrada (post-normalización).
 * Devuelve la lista deduplicada en su forma canónica.
 */
export function filterTagsCerrados(tags: unknown): TagCerrado[] {
  if (!Array.isArray(tags)) return [];
  const out = new Set<TagCerrado>();
  for (const t of tags) {
    if (typeof t !== "string") continue;
    const n = normalizeTag(t);
    if (SET_CERRADOS.has(n)) out.add(n as TagCerrado);
  }
  return Array.from(out);
}

/**
 * Tags libres normalizados, máx 3. Se descarta cualquiera que ya esté en la
 * lista cerrada (debió ir al campo correcto).
 */
export function filterTagsExtra(
  tags: unknown,
  cerrados: TagCerrado[] = [],
): string[] {
  if (!Array.isArray(tags)) return [];
  const cerradosSet = new Set<string>(cerrados);
  const out = new Set<string>();
  for (const t of tags) {
    if (typeof t !== "string") continue;
    const n = normalizeTag(t);
    if (!n || n.length > 32) continue;
    if (SET_CERRADOS.has(n)) continue;
    if (cerradosSet.has(n)) continue;
    out.add(n);
    if (out.size >= 3) break;
  }
  return Array.from(out);
}

/**
 * Detecta plagio textual entre `original` (descripción del anuncio) y
 * `generated` (resumen IA). Si comparten más del `threshold` (default 0.2)
 * de sus n-gramas de 3 palabras, se considera que el resumen copia frases.
 *
 * Heurística cheap pero efectiva: si el modelo decidió citar literalmente
 * 4-5 frases, va a haber overlap claro. Si parafrasea, no.
 */
export function overlapAlto(
  original: string | null | undefined,
  generated: string | null | undefined,
  threshold = 0.2,
): boolean {
  if (!original || !generated) return false;
  const A = ngrams(original, 3);
  const B = ngrams(generated, 3);
  if (B.size === 0) return false;
  let hits = 0;
  for (const g of B) if (A.has(g)) hits++;
  return hits / B.size > threshold;
}

function ngrams(text: string, n: number): Set<string> {
  const tokens = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  const out = new Set<string>();
  for (let i = 0; i <= tokens.length - n; i++) {
    out.add(tokens.slice(i, i + n).join(" "));
  }
  return out;
}
