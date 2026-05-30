/**
 * Enriquecimiento IA — Gemini + validación anti-copia.
 *
 * Compartido entre `fuente-prueba.ts` (scrape inicial) y `backfill-ia.ts`
 * (re-enriquecimiento de filas ya guardadas). Mantener una sola fuente de
 * verdad para el prompt, el schema y la validación overlap.
 *
 * Reglas contractuales (ver AGENTS.md / bitácora ToS):
 *   1. La descripción se usa SOLO como input temporal. NO debe persistirse.
 *   2. Si el resumen copia frases literales → se descarta (overlapAlto).
 *   3. Feature flag AI_SUMMARY_ENABLED=false desactiva todo (no llamadas).
 */

import { GoogleGenAI } from "@google/genai";

import {
  filterTagsCerrados,
  filterTagsExtra,
  overlapAlto,
  TAGS_CERRADOS,
  type TagCerrado,
} from "./tags-caracteristicas";

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

// Lazy: la key se lee la PRIMERA vez que se llama a enriquecerConIA, no
// al importar el módulo. Necesario porque el caller corre `loadEnv()` AL
// FINAL del módulo, después de que los imports ya se evaluaron.
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

const DESCRIPCION_MAX = 280;

/**
 * Limpia y corta la descripción original a un cap razonable para Gemini.
 * NO persiste — se pasa como input y se descarta tras la llamada.
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

export async function enriquecerConIA(
  ficha: FichaIA,
  descripcion: string | null,
): Promise<EnriquecimientoIA> {
  const gemini = getGemini();
  if (!gemini) return ENRIQUECIMIENTO_VACIO;

  const fichaText = [
    `Título: ${ficha.titulo ?? ""}`,
    `Operación: ${ficha.tipoOperacion}`,
    `Precio: ${ficha.precio} ${ficha.moneda ?? ""}`,
    ficha.area_m2 ? `Área: ${ficha.area_m2} m²` : null,
    ficha.habitaciones ? `Recámaras: ${ficha.habitaciones}` : null,
    ficha.banos ? `Baños: ${ficha.banos}` : null,
    ficha.estacionamientos ? `Estacionamientos: ${ficha.estacionamientos}` : null,
    ficha.zona ? `Zona: ${ficha.zona}` : null,
    descripcion ? `Descripción (solo referencia, NO copiar): ${descripcion}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `Eres un asistente de bienes raíces en Panamá. Recibes una ficha de anuncio. Produce JSON con:

1. "resumen_ia_es": Texto ORIGINAL en ESPAÑOL, parafraseado, máximo 280 caracteres, 2 frases cortas. NO copies frases ni cláusulas literales de la descripción. NO inventes datos. Si no hay suficiente info, devuelve cadena vacía.

2. "resumen_ia_en": Traducción del resumen_ia_es al INGLÉS, mismo contenido (no agregues ni quites información), máximo 280 caracteres, también parafraseado para que NO copie frases literales si la descripción incluía inglés. Si resumen_ia_es está vacío, devuelve cadena vacía.

3. "tags": Subconjunto EXACTO (kebab-case) de esta lista cerrada, basado en evidencia clara. NO incluyas si no está soportado por la ficha.
Lista permitida: ${TAGS_CERRADOS.join(", ")}

4. "tags_extra": MÁXIMO 3 tags libres en kebab-case en español para características importantes fuera de la lista cerrada (ej: rooftop, coworking, smart-home). Vacío si nada relevante.

Ficha:
${fichaText}

Responde SOLO el JSON, sin texto adicional ni bloque markdown.`;

  try {
    const res = await gemini.models.generateContent({
      model: "gemini-flash-lite-latest",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            resumen_ia_es: { type: "string" },
            resumen_ia_en: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            tags_extra: { type: "array", items: { type: "string" } },
          },
          required: ["resumen_ia_es", "resumen_ia_en", "tags", "tags_extra"],
        },
      },
    });
    const raw = res.text?.trim() ?? "";
    if (!raw) return ENRIQUECIMIENTO_VACIO;
    const parsed = JSON.parse(raw) as {
      resumen_ia_es?: string;
      resumen_ia_en?: string;
      tags?: unknown;
      tags_extra?: unknown;
    };

    const tags_caracteristicas = filterTagsCerrados(parsed.tags);
    const tags_extra = filterTagsExtra(parsed.tags_extra, tags_caracteristicas);

    let resumen_ia: ResumenBilingue | null = null;
    const es = (parsed.resumen_ia_es ?? "").trim().slice(0, 280);
    const en = (parsed.resumen_ia_en ?? "").trim().slice(0, 280);
    if (es.length >= 20 && en.length >= 20) {
      if (overlapAlto(descripcion, es) || overlapAlto(descripcion, en)) {
        console.warn(`  resumen-ia descartado: overlap alto con descripción`);
      } else {
        resumen_ia = { es, en };
      }
    }

    return {
      resumen_ia,
      tags_caracteristicas,
      tags_extra,
      ai_source_flag:
        resumen_ia || tags_caracteristicas.length || tags_extra.length
          ? "generated_from_external_description"
          : null,
    };
  } catch (err) {
    console.warn(`  resumen-ia: ${(err as Error).message}`);
    return ENRIQUECIMIENTO_VACIO;
  }
}
