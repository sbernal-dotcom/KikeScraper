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
 * Usa Gemini Flash-lite por velocidad y costo. Cacheable por (titulo+desc).
 */

import { GoogleGenAI } from "@google/genai";

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

let geminiCache: GoogleGenAI | null | undefined;
function getGemini(): GoogleGenAI | null {
  if (geminiCache !== undefined) return geminiCache;
  const enabled =
    process.env.AI_SUMMARY_ENABLED !== "false" && !!process.env.GEMINI_API_KEY;
  geminiCache = enabled
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : null;
  return geminiCache;
}

const DESC_MAX = 600;

export async function extraerEdificio(
  titulo: string | null,
  descripcion: string | null,
): Promise<ExtraccionEdificio> {
  const gemini = getGemini();
  if (!gemini) return EXTRACCION_VACIA;
  if (!titulo && !descripcion) return EXTRACCION_VACIA;

  const desc = (descripcion ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DESC_MAX);

  const prompt = `Extrae del siguiente anuncio inmobiliario panameño:

1. "edificio": nombre del edificio/PH/torre específico donde está el apartamento (ej: "PH Dos Mares View", "Torre del Pacífico", "Allure at the Park"). Solo si aparece un nombre propio identificable. NO incluyas prefijos como "PH" si no son parte del nombre. Si es una casa o terreno sin edificio, null.

2. "proyecto": nombre del desarrollo/condominio si es distinto del edificio (ej: "Costa del Este", "Buenaventura"). null si no aplica.

3. "zona": barrio o corregimiento mencionado (ej: "Coco del Mar", "Punta Pacífica", "Bella Vista"). null si no se menciona ninguno reconocible.

NO inventes. Si no estás seguro, devuelve null. Mejor null que un dato falso.

Título: ${titulo ?? ""}
Descripción: ${desc}

Responde SOLO el JSON.`;

  try {
    const res = await gemini.models.generateContent({
      model: "gemini-flash-lite-latest",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            edificio: { type: ["string", "null"] },
            proyecto: { type: ["string", "null"] },
            zona: { type: ["string", "null"] },
          },
          required: ["edificio", "proyecto", "zona"],
        },
      },
    });
    const raw = res.text?.trim() ?? "";
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
