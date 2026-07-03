/**
 * Extracción IA del edificio/proyecto/zona desde título + descripción.
 *
 * Paso 1 del pipeline de geocoding exacto. La IA es necesaria porque los
 * formatos varían mucho:
 *   - "Apartamento en Venta en PH Dos Mares View..."
 *   - "Vendo en Torre del Pacífico"
 *   - "Edif. Allure - Punta Pacífica"
 *   - "Hermoso apartamento en El Hatillo II"
 *   - "Coronado Bay - $250,000"
 *
 * Devuelve hasta 3 strings, todos potencialmente null:
 *   - edificio: nombre del edificio/PH/torre específico
 *   - proyecto: nombre del desarrollo/condominio (a veces igual al edificio)
 *   - zona: barrio/corregimiento detectado (fallback si nada mejor)
 *
 * Usa Groq + Llama 3.1 8B Instant. Migrado de Gemini Flash Lite el
 * 2026-06-25 — la cuota free de Gemini (500 req/día) era el cuello de
 * botella en el backfill. Groq da 14,400 req/día y 10x velocidad para
 * la misma calidad de extracción.
 */

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant";

export type ExtraccionEdificio = {
  edificio: string | null;
  proyecto: string | null;
  zona: string | null;
};

export const EXTRACCION_VACIA: ExtraccionEdificio = {
  edificio: null,
  proyecto: null,
  zona: null,
};

function getGroqKey(): string | null {
  const enabled =
    process.env.AI_SUMMARY_ENABLED !== "false" && !!process.env.GROQ_API_KEY;
  return enabled ? (process.env.GROQ_API_KEY as string) : null;
}

const DESC_MAX = 600;
const MAX_RETRIES_429 = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function extraerEdificio(
  titulo: string | null,
  descripcion: string | null,
  attempt = 0,
): Promise<ExtraccionEdificio> {
  const key = getGroqKey();
  if (!key) return EXTRACCION_VACIA;
  if (!titulo && !descripcion) return EXTRACCION_VACIA;

  const desc = (descripcion ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DESC_MAX);

  const systemMsg = `Eres un asistente que extrae datos estructurados de anuncios inmobiliarios panameños. Respondes SOLO con JSON válido. Si no estás seguro de un campo, devuelves null en vez de inventar.`;

  const userMsg = `Extrae como JSON con keys "edificio", "proyecto", "zona":

1. "edificio": nombre del edificio/PH/torre específico (ej: "PH Dos Mares View", "Torre del Pacífico", "Allure at the Park"). Solo si aparece un nombre propio identificable. NO incluyas prefijos como "PH" si no son parte del nombre. Si es casa o terreno sin edificio, null.

2. "proyecto": nombre del desarrollo/condominio si distinto del edificio (ej: "Costa del Este", "Buenaventura"). null si no aplica.

3. "zona": barrio/corregimiento mencionado (ej: "Coco del Mar", "Punta Pacífica", "Bella Vista"). null si no se menciona uno reconocible.

NO inventes. Mejor null que dato falso.

Título: ${titulo ?? ""}
Descripción: ${desc}`;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemMsg },
          { role: "user", content: userMsg },
        ],
        temperature: 0.1,
        max_tokens: 200,
        response_format: { type: "json_object" },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Rate limit — reintentar con el retry-after que Groq indica en el
      // mensaje ("Please try again in 4.75s"). Con cap para no colgar.
      if (res.status === 429 && attempt < MAX_RETRIES_429) {
        const m = body.match(/try again in ([\d.]+)s/i);
        const waitS = Math.min(30, m ? parseFloat(m[1]) + 0.5 : 8);
        console.warn(`  extract-edificio: 429 → retry en ${waitS}s (intento ${attempt + 1}/${MAX_RETRIES_429})`);
        await sleep(waitS * 1000);
        return extraerEdificio(titulo, descripcion, attempt + 1);
      }
      console.warn(`  extract-edificio: HTTP ${res.status} ${body}`);
      return EXTRACCION_VACIA;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!raw) return EXTRACCION_VACIA;
    const parsed = JSON.parse(raw) as Partial<ExtraccionEdificio>;
    return {
      edificio: cleanString(parsed.edificio),
      proyecto: cleanString(parsed.proyecto),
      zona: cleanString(parsed.zona),
    };
  } catch (err) {
    console.warn(`  extract-edificio: ${(err as Error).message}`);
    return EXTRACCION_VACIA;
  }
}

function cleanString(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = String(s).trim();
  // Gemini a veces devuelve "null" como string en vez de null JSON.
  if (!t || t.toLowerCase() === "null" || t === "N/A") return null;
  // Cap razonable — un nombre de edificio no debería pasar de 80 chars.
  if (t.length > 80) return null;
  return t;
}

/**
 * Normaliza un nombre para usarlo como clave en `edificios_cache`.
 * Lower-case + sin acentos + espacios colapsados.
 * "PH Dos Mares View" → "ph dos mares view"
 */
export function normalizarNombre(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
