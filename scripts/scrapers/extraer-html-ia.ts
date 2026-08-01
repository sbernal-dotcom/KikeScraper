/**
 * Extractor semántico de campos duros desde HTML crudo con Groq + Llama 3.1.
 *
 * Última red de seguridad para cuando TODOS los regex/selectores del scraper
 * fallan porque el sitio cambió el HTML. En vez de que el scraper muera,
 * le pasamos un chunk del HTML al LLM y le pedimos que lea el precio /
 * área / habitaciones / baños directamente. Es tolerante a cambios de
 * clases CSS, orden de secciones, y hasta migraciones completas de template.
 *
 * Cuándo se usa:
 *   - Los extractores por regex del scraper devolvieron null para uno o
 *     más campos críticos (típicamente precio).
 *   - El HTML del detalle sí llegó (o sea, no es un problema de red / block
 *     de Cloudflare — es que las clases cambiaron).
 *
 * Guardarraíles anti-costo:
 *   - Hard cap: 100 llamadas semánticas por corrida (contador módulo). Si
 *     el sitio cambia MASIVAMENTE (todo InmoPanama a nuevo template) no
 *     detonamos 1000 llamadas Groq — cortamos y logueamos.
 *   - Cache por URL (in-process): si dos scrapers piden el mismo HTML por
 *     alguna razón, solo llamamos una vez.
 *
 * Guardarraíles anti-alucinación:
 *   - Chunk pre-filtrado por keywords: si no aparece `$` en el HTML no
 *     pedimos precio (evita que el LLM invente uno).
 *   - Validación de rangos: precio 100–10M USD, area 5–100k m², hab 0–20.
 *   - Si el LLM devuelve algo fuera de rango, se descarta (queda null).
 *   - temperature=0 y prompt explícito "mejor null que inventar".
 *
 * Nota: NO cachea en Supabase porque el HTML cambia por listing (a
 * diferencia de ia-extract-edificio que cachea por título+desc). Cada
 * URL es distinta y probablemente no se re-scrapea antes de que cambie
 * de nuevo. Cache in-process alcanza.
 */

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant";

export type CamposSemanticos = {
  precio: number | null;
  area_m2: number | null;
  habitaciones: number | null;
  banos: number | null;
};

const VACIO: CamposSemanticos = {
  precio: null,
  area_m2: null,
  habitaciones: null,
  banos: null,
};

// Hard cap por proceso. Si el sitio cambió masivamente y cada listing
// necesita fallback, no detonamos 1000 llamadas — cortamos limpio.
const MAX_LLAMADAS_POR_PROCESO = 100;
let llamadasEnProceso = 0;
let capAvisado = false;

// Cache por URL (in-process). Barato y evita duplicados si por alguna
// razón un mismo HTML se procesa dos veces en la corrida.
const sessionCache = new Map<string, CamposSemanticos>();

const MAX_RETRIES_429 = 3;
const MAX_WAIT_S = 30;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getGroqKey(): string | null {
  const enabled =
    process.env.AI_SUMMARY_ENABLED !== "false" && !!process.env.GROQ_API_KEY;
  return enabled ? (process.env.GROQ_API_KEY as string) : null;
}

/**
 * Recorta el HTML a lo relevante: quita scripts/styles/svg y busca el
 * chunk más denso en keywords ("precio", "$", "venta", "alquiler", "m²",
 * "habitaciones", "baños"). Devuelve ~4KB máximo.
 *
 * Estrategia: buscamos las posiciones de "$" y agarramos ~2KB alrededor
 * de la primera aparición (si hay). Sino, primeros 4KB de HTML limpio.
 */
function chunkRelevante(html: string): string {
  const limpio = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

  // Buscar el primer "$" o keyword de precio como ancla.
  const anchors = [
    limpio.indexOf("$"),
    limpio.search(/precio\s+(?:de\s+)?(?:venta|alquiler)/i),
    limpio.search(/venta:\s*\$/i),
    limpio.search(/alquiler:\s*\$/i),
  ].filter((i) => i > 0);
  const anchor = anchors.length ? Math.min(...anchors) : 0;

  const start = Math.max(0, anchor - 1500);
  const end = Math.min(limpio.length, anchor + 2500);
  return limpio.substring(start, end);
}

function tieneAnclaPrecio(chunk: string): boolean {
  return /\$|precio|venta|alquiler/i.test(chunk);
}

function tieneAnclaArea(chunk: string): boolean {
  return /m\s*[²2]|metros/i.test(chunk);
}

function tieneAnclaHabitaciones(chunk: string): boolean {
  return /habitaciones|recam|dormitorios|hab\.|dorm\./i.test(chunk);
}

function tieneAnclaBanos(chunk: string): boolean {
  return /ba(?:ñ|n)os?/i.test(chunk);
}

/**
 * Pide a Groq los campos que faltan. `camposPedidos` indica cuáles.
 * Devuelve solo los que el LLM pudo extraer con confianza y que pasan
 * validación de rango.
 */
export async function extraerCamposDesdeHtml(
  html: string,
  urlOriginal: string,
  camposPedidos: Array<keyof CamposSemanticos>,
  tipoOperacion?: "venta" | "alquiler",
  attempt = 0,
): Promise<CamposSemanticos> {
  if (camposPedidos.length === 0) return VACIO;

  // Cache in-process. Key = url + los campos pedidos (si en un mismo
  // scrape un listing necesita precio y luego area, cada llamada cachea
  // independientemente).
  const cacheKey = `${urlOriginal}|${camposPedidos.sort().join(",")}`;
  const cached = sessionCache.get(cacheKey);
  if (cached) return cached;

  const key = getGroqKey();
  if (!key) return VACIO;

  // Hard cap. Si el sitio cambió masivamente, cortamos aquí.
  if (llamadasEnProceso >= MAX_LLAMADAS_POR_PROCESO) {
    if (!capAvisado) {
      console.warn(
        `  ⚠ extractor-semántico: alcanzado cap de ${MAX_LLAMADAS_POR_PROCESO} llamadas — resto se ignorará.`,
      );
      capAvisado = true;
    }
    return VACIO;
  }

  const chunk = chunkRelevante(html);

  // Filtrar los campos que NO tienen ancla en el chunk — evita alucinaciones.
  const anclaPorCampo: Record<keyof CamposSemanticos, (s: string) => boolean> = {
    precio: tieneAnclaPrecio,
    area_m2: tieneAnclaArea,
    habitaciones: tieneAnclaHabitaciones,
    banos: tieneAnclaBanos,
  };
  const pedidosValidos = camposPedidos.filter((c) => anclaPorCampo[c](chunk));
  if (pedidosValidos.length === 0) return VACIO;

  const descripcionCampos = pedidosValidos
    .map((c) => {
      switch (c) {
        case "precio":
          return `- "precio": número USD sin símbolo ni comas (ej: 225000). Si es alquiler mensual, el mismo campo. Si no se puede determinar con certeza, null.`;
        case "area_m2":
          return `- "area_m2": número de metros cuadrados (ej: 120). Solo el área total construida o del terreno. Si no aparece, null.`;
        case "habitaciones":
          return `- "habitaciones": número entero de dormitorios/recámaras/cuartos (ej: 3). Si no aparece, null.`;
        case "banos":
          return `- "banos": número de baños (puede ser decimal como 2.5). Si no aparece, null.`;
      }
    })
    .join("\n");

  const systemMsg = `Eres un extractor de datos inmobiliarios. Lees fragmentos HTML/texto de anuncios y devuelves los datos duros en JSON. NUNCA inventes números. Si un dato no aparece claramente en el texto, devuelve null. Es MEJOR null que un dato falso.`;

  const opContext = tipoOperacion
    ? `Este anuncio es de ${tipoOperacion.toUpperCase()}. `
    : "";

  const userMsg = `${opContext}Extrae del siguiente HTML/texto los campos pedidos como JSON:

${descripcionCampos}

Recuerda: null si no aparece o no estás seguro. No calcules, no infieras — solo extrae lo que está escrito literalmente.

HTML/texto:
"""
${chunk}
"""`;

  llamadasEnProceso++;

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
        temperature: 0,
        max_tokens: 150,
        response_format: { type: "json_object" },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429 && attempt < MAX_RETRIES_429) {
        const m = body.match(/try again in ([\d.]+)s/i);
        const waitS = Math.min(MAX_WAIT_S, m ? parseFloat(m[1]) + 0.5 : 5);
        console.warn(
          `  extractor-semántico: 429 → retry en ${waitS}s (intento ${attempt + 1}/${MAX_RETRIES_429})`,
        );
        // Rebajar el contador — el retry no debe consumir doble.
        llamadasEnProceso--;
        await sleep(waitS * 1000);
        return extraerCamposDesdeHtml(
          html,
          urlOriginal,
          camposPedidos,
          tipoOperacion,
          attempt + 1,
        );
      }
      console.warn(`  extractor-semántico: HTTP ${res.status}`);
      sessionCache.set(cacheKey, VACIO);
      return VACIO;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!raw) {
      sessionCache.set(cacheKey, VACIO);
      return VACIO;
    }

    let parsed: Partial<Record<keyof CamposSemanticos, unknown>>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      sessionCache.set(cacheKey, VACIO);
      return VACIO;
    }

    const result: CamposSemanticos = {
      precio: validarPrecio(parsed.precio),
      area_m2: validarArea(parsed.area_m2),
      habitaciones: validarHabitaciones(parsed.habitaciones),
      banos: validarBanos(parsed.banos),
    };

    sessionCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn(`  extractor-semántico: ${(err as Error).message}`);
    sessionCache.set(cacheKey, VACIO);
    return VACIO;
  }
}

/** Solo acepta números en rangos realistas — descarta alucinaciones. */
function validarPrecio(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 100 || n > 10_000_000) return null;
  return n;
}

function validarArea(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 5 || n > 100_000) return null;
  return n;
}

function validarHabitaciones(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 20) return null;
  return Math.round(n);
}

function validarBanos(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 20) return null;
  return n;
}

/** Diagnóstico: cuántas llamadas se hicieron esta corrida. */
export function contadorLlamadasSemanticas(): number {
  return llamadasEnProceso;
}
