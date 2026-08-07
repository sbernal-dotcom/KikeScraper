/**
 * Refresh liviano diario — actualiza precio/área/hab/baños de TODAS las
 * propiedades activas de TODAS las fuentes SIN tocar IA.
 *
 * Motivación: los scrapers principales filtran URLs ya en DB para no
 * re-consumir Groq re-procesando el inventario. Consecuencia: cambios
 * de precio en anuncios ya guardados nunca se reflejan. Los scrapers
 * de InmoPanama y Savitat ya incluyen un refresh rotativo interno (N
 * más viejas por corrida), pero eso da precisión de 5-10 días.
 *
 * Este script cubre el resto: fetch + parseo de campos duros para
 * TODAS las activas cada corrida. Cero llamadas a IA (no re-genera
 * resúmenes, no re-geocodifica). Costo: solo HTTP.
 *
 * Qué actualiza:
 *   - precio, moneda
 *   - area_m2, habitaciones, banos, estacionamientos
 *   - fecha_ultima_revision, fecha_ultima_vista
 *
 * Qué NO toca:
 *   - resumen_ia_es/en (descripción de la propiedad no cambia)
 *   - tags_caracteristicas, tags_extra (mismo)
 *   - lat/lng (edificio no se mueve — coord ya validada)
 *   - estado_anuncio, veces_no_encontrado (eso es tarea de verify)
 *
 * Si el fetch devuelve 404/410 o el HTML ya no tiene precio, DEJA la
 * fila como estaba (no destruye datos). Verify es quien decide archivar.
 *
 * Uso: npm run refresh:precios[:prod]
 *
 * Se agrega al pipeline como paso adicional después de todos los
 * scrapers y antes de los post-passes.
 */

import { config as loadEnv } from "dotenv";

import { createScraperClient } from "./supabase-admin";
import { computeRunStatus } from "./_run-status";

loadEnv({ path: ".env.local" });
loadEnv();

const USER_AGENT =
  "MapaInteractivoInteligente/0.1 (+contacto: abilendesign@gmail.com)";

// Concurrencia por fuente (no total). Cada fuente se procesa en serie
// para no martillar. Dentro de una fuente, N requests concurrentes.
const CONCURRENCY = 3;

// Timeout wall-clock del script completo. 15 min es holgado: 666 URLs
// activas × ~700ms (fetch + parse) / concurrency 3 = ~2.5 min. El
// margen cubre reintentos y jitter.
const MAX_RUNTIME_MS = 15 * 60 * 1000;
let deadline = 0;
function isExpired(): boolean {
  return Date.now() > deadline;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min = 800, max = 1600) =>
  sleep(min + Math.floor(Math.random() * (max - min)));

type Fuente =
  | "inmopanama"
  | "savitat"
  | "encuentra24"
  | "mlsacobir"
  | "acobir"
  | "panamaequity";

type CamposDuros = {
  precio: number | null;
  moneda: "USD" | "PAB" | null;
  area_m2: number | null;
  habitaciones: number | null;
  banos: number | null;
  estacionamientos: number | null;
};

type FilaActiva = {
  id: string;
  url_original: string;
  fuente_id: string;
  precio: number | null;
  moneda: string | null;
  area_m2: number | null;
  habitaciones: number | null;
  banos: number | null;
  estacionamientos: number | null;
};

// ─────────────────────────────────────────────────────────────────────
// Helpers de parseo (genéricos)
// ─────────────────────────────────────────────────────────────────────

function toNumber(text: string | number | null | undefined): number | null {
  if (text == null) return null;
  const raw = String(text).replace(/&\w+;/g, " ").replace(/&#\d+;/g, " ").trim();
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
 * Busca todos los bloques JSON-LD del HTML y devuelve el primero que
 * tenga uno de los @type inmobiliarios. Tolerante a @graph (array
 * anidado — encuentra24 lo usa).
 */
function findRealEstateJsonLd(html: string): Record<string, unknown> | null {
  const blocks = [
    ...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  const wanted =
    /^(Product|RealEstateListing|Apartment|House|SingleFamilyResidence|Residence|Place|Accommodation)$/;
  for (const b of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(b[1].trim());
    } catch {
      continue;
    }
    const candidates: Array<Record<string, unknown>> = [];
    const push = (v: unknown) => {
      if (v && typeof v === "object") candidates.push(v as Record<string, unknown>);
    };
    push(parsed);
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>)["@graph"])) {
      for (const n of (parsed as Record<string, unknown>)["@graph"] as unknown[]) push(n);
    }
    if (Array.isArray(parsed)) for (const n of parsed) push(n);
    for (const c of candidates) {
      const t = c["@type"];
      const type = Array.isArray(t) ? t[0] : t;
      if (typeof type === "string" && wanted.test(type)) return c;
    }
  }
  return null;
}

function readItempropContent(html: string, prop: string): string | null {
  const re = new RegExp(
    `<[^>]+itemprop=["']${prop}["'][^>]*content=["']([^"']+)["']`,
    "i",
  );
  const m = html.match(re);
  if (m) return m[1];
  // Fallback: valor como texto entre tags.
  const re2 = new RegExp(
    `<[^>]+itemprop=["']${prop}["'][^>]*>([\\s\\S]{0,120}?)<\\/`,
    "i",
  );
  return html.match(re2)?.[1]?.trim() ?? null;
}

// ─────────────────────────────────────────────────────────────────────
// Extractores por fuente
// ─────────────────────────────────────────────────────────────────────

function extractorJsonLd(html: string): CamposDuros {
  const ld = findRealEstateJsonLd(html);
  if (!ld) return vacio();
  const offers = (ld.offers as Record<string, unknown> | undefined) ?? {};
  const currency =
    (offers.priceCurrency as string | undefined)?.toUpperCase() ?? "USD";
  return {
    precio: toNumber(offers.price as string | number | null),
    moneda: currency === "PAB" ? "PAB" : "USD",
    area_m2: toNumber(
      (ld.floorSize as Record<string, unknown> | undefined)?.value as
        | string
        | number
        | null,
    ),
    habitaciones: toNumber(ld.numberOfBedrooms as string | number | null),
    banos: toNumber(ld.numberOfBathroomsTotal as string | number | null),
    estacionamientos: null,
  };
}

function extractorMicrodata(html: string): CamposDuros {
  return {
    precio: toNumber(readItempropContent(html, "price")),
    moneda: "USD",
    area_m2: toNumber(readItempropContent(html, "floorSize")),
    habitaciones: toNumber(readItempropContent(html, "numberOfRooms")),
    banos: toNumber(readItempropContent(html, "numberOfBathroomsTotal")),
    estacionamientos: null,
  };
}

function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[:.]/g, "")
    .trim();
}

/**
 * InmoPanama: parseo de nb-quick-fact-cell (nuevo diseño 2026-07) +
 * cadena de fallbacks para precio (mismos que scraper-inmopanama).
 * Sin IA (a diferencia del scraper principal que hace fallback semántico).
 */
function extractorInmoPanama(html: string): CamposDuros {
  const facts = new Map<string, string>();
  const re =
    /<div\s+class="[^"]*nb-quick-fact-cell[^"]*"[^>]*>\s*<div\s+class="nb-quick-fact-label"[^>]*>\s*([^<]+?)\s*<\/div>\s*<div\s+class="nb-quick-fact-value"[^>]*>\s*([^<]+?)\s*<\/div>/gi;
  for (const m of html.matchAll(re)) {
    const label = normalizeLabel(m[1]);
    const value = m[2].trim();
    if (label && value) facts.set(label, value);
  }

  // Precio: 4 fallbacks (nuevo, celda específica, viejo, texto libre).
  const p1 = facts.get("precio");
  let precio = toNumber(p1);
  if (!precio) {
    const nb = html.match(
      /class="[^"]*nb-price-cell[^"]*"[\s\S]{0,500}?class="nb-quick-fact-value"[^>]*>\s*\$?\s*([\d,\.]+)/i,
    )?.[1];
    precio = toNumber(nb ?? null);
  }
  if (!precio) {
    const viejo = html.match(/class="ib-prop-main-price"[^>]*>\s*([^<]+?)\s*</i)?.[1];
    precio = toNumber(viejo ?? null);
  }
  if (!precio) {
    const texto = html.match(
      /PRECIO\s+DE\s+(?:VENTA|ALQUILER)[:\s]+\$?\s*([\d,\.]+)/i,
    )?.[1];
    precio = toNumber(texto ?? null);
  }

  const hRaw = facts.get("habitaciones") ?? facts.get("recamaras") ?? facts.get("dormitorios");
  const bRaw = facts.get("banos") ?? facts.get("bathrooms");
  const aRaw = facts.get("area") ?? facts.get("area total") ?? facts.get("m2");
  const eRaw = facts.get("estacionamiento") ?? facts.get("estacionamientos") ?? facts.get("parking");

  return {
    precio,
    moneda: "USD",
    area_m2: toNumber(aRaw?.replace(/m\s*[²2]/i, "") ?? null),
    habitaciones: toNumber(hRaw ?? null),
    banos: toNumber(bRaw ?? null),
    estacionamientos: toNumber(eRaw ?? null),
  };
}

/**
 * Savitat: prioriza JSON-LD, fallback a HTML si offers.price está null
 * (mismo comportamiento que el scraper principal).
 */
function extractorSavitat(html: string): CamposDuros {
  const base = extractorJsonLd(html);
  if (base.precio != null) return base;

  // Fallback: bloque estructurado o meta description.
  const bloque = html.match(
    /Precio\s+(?:venta|alquiler)[:\s]*<\/h4>\s*<div[^>]*>\s*\$?\s*([\d,\.]+)/i,
  )?.[1];
  const meta = html.match(
    /<meta\s+name="description"[^>]*content="[^"]*?(?:Venta|Alquiler):\s*\$?\s*([\d,\.]+)/i,
  )?.[1];
  const precio = toNumber(bloque ?? null) ?? toNumber(meta ?? null);
  return { ...base, precio };
}

function extractor(fuente: Fuente): (html: string) => CamposDuros {
  switch (fuente) {
    case "inmopanama":
      return extractorInmoPanama;
    case "savitat":
      return extractorSavitat;
    case "mlsacobir":
      return extractorMicrodata;
    case "acobir":
    case "panamaequity":
    case "encuentra24":
      return extractorJsonLd;
  }
}

function vacio(): CamposDuros {
  return {
    precio: null,
    moneda: null,
    area_m2: null,
    habitaciones: null,
    banos: null,
    estacionamientos: null,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Fetch con timeout + retry corto
// ─────────────────────────────────────────────────────────────────────

async function fetchHtml(url: string, attempt = 1): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-PA,es;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(15_000),
    });
    // 404/410 → devolver null (verify decide archivar).
    if (res.status === 404 || res.status === 410) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  } catch (err) {
    if (attempt < 2) {
      await sleep(2000);
      return fetchHtml(url, attempt + 1);
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Detectar cambios y actualizar
// ─────────────────────────────────────────────────────────────────────

/**
 * Devuelve solo los campos que efectivamente cambiaron. Si un campo
 * viene null en el HTML nuevo, NO lo actualizamos (dato viejo era
 * mejor que perder el dato).
 */
function computeUpdate(
  before: FilaActiva,
  after: CamposDuros,
): Partial<Record<string, unknown>> | null {
  const patch: Record<string, unknown> = {};
  let hasChange = false;
  const check = <K extends keyof CamposDuros>(k: K, dbCol: string) => {
    const nu = after[k];
    if (nu == null) return; // no destruye datos existentes
    const cur = (before as unknown as Record<string, unknown>)[dbCol];
    if (cur !== nu) {
      patch[dbCol] = nu;
      hasChange = true;
    }
  };
  check("precio", "precio");
  check("moneda", "moneda");
  check("area_m2", "area_m2");
  check("habitaciones", "habitaciones");
  check("banos", "banos");
  check("estacionamientos", "estacionamientos");
  return hasChange ? patch : null;
}

// ─────────────────────────────────────────────────────────────────────
// Pipeline principal
// ─────────────────────────────────────────────────────────────────────

async function chunkedParallel<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    if (isExpired()) break;
    const chunk = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(chunk.map(fn));
    for (const r of settled) {
      if (r.status === "fulfilled") out.push(r.value);
    }
  }
  return out;
}

type Stats = {
  fuente: Fuente;
  total: number;
  cambiados: number;
  sinCambio: number;
  errores: number;
  no_encontrada: number;
};

async function procesarFuente(
  supa: ReturnType<typeof createScraperClient>,
  fuente: Fuente,
): Promise<Stats> {
  const stats: Stats = {
    fuente,
    total: 0,
    cambiados: 0,
    sinCambio: 0,
    errores: 0,
    no_encontrada: 0,
  };

  const PAGE = 1000;
  const rows: FilaActiva[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supa
      .from("propiedades")
      .select(
        "id, url_original, fuente_id, precio, moneda, area_m2, habitaciones, banos, estacionamientos",
      )
      .eq("fuente_id", fuente)
      .eq("estado_anuncio", "activo")
      .range(from, from + PAGE - 1);
    if (error) {
      console.warn(`  [${fuente}] SELECT falló: ${error.message}`);
      return stats;
    }
    const batch = (data ?? []) as FilaActiva[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  stats.total = rows.length;
  if (rows.length === 0) return stats;

  console.log(`\n▶ ${fuente}: ${rows.length} activas`);
  const ex = extractor(fuente);
  const ahora = new Date().toISOString();

  await chunkedParallel(rows, CONCURRENCY, async (row) => {
    if (isExpired()) return;
    await jitter();
    let html: string | null;
    try {
      html = await fetchHtml(row.url_original);
    } catch {
      stats.errores++;
      return;
    }
    if (html == null) {
      // 404/410 — verify se encarga de escalar el contador.
      stats.no_encontrada++;
      return;
    }
    const nuevo = ex(html);
    const patch = computeUpdate(row, nuevo);
    if (!patch) {
      // Sin cambios en datos: solo bumping de fecha_ultima_revision para
      // que verify no la re-verifique innecesariamente.
      //
      // Fix (auditoría CRITICAL C5): antes ignorábamos el error del
      // update — si fallaba (RLS, network), stats.sinCambio se
      // incrementaba igual, la fila NO se actualizaba, y verify la
      // re-verificaba al día siguiente escalando veces_no_encontrado.
      // Ahora capturamos el error y lo contamos como stats.errores.
      const { error: bumpErr } = await supa
        .from("propiedades")
        .update({ fecha_ultima_revision: ahora, fecha_ultima_vista: ahora })
        .eq("id", row.id);
      if (bumpErr) {
        console.warn(
          `  [${fuente}] bump fecha_ultima_revision falló (${row.url_original}): ${bumpErr.message}`,
        );
        stats.errores++;
      } else {
        stats.sinCambio++;
      }
      return;
    }
    patch.fecha_ultima_revision = ahora;
    patch.fecha_ultima_vista = ahora;
    patch.fecha_actualizacion = ahora;
    const { error } = await supa
      .from("propiedades")
      .update(patch)
      .eq("id", row.id);
    if (error) {
      console.warn(`  [${fuente}] update falló (${row.url_original}): ${error.message}`);
      stats.errores++;
    } else {
      stats.cambiados++;
      // Log solo si cambió precio (el más significativo).
      if (patch.precio != null) {
        console.log(
          `  ✎ precio ${row.precio} → ${patch.precio}  ${row.url_original.substring(0, 70)}`,
        );
      }
    }
  });

  console.log(
    `  ${fuente}: total=${stats.total} cambiados=${stats.cambiados} sinCambio=${stats.sinCambio} 404=${stats.no_encontrada} errores=${stats.errores}`,
  );
  return stats;
}

async function main() {
  deadline = Date.now() + MAX_RUNTIME_MS;
  const supa = createScraperClient();
  const startedAt = new Date().toISOString();

  const fuentes: Fuente[] = [
    "acobir",
    "panamaequity",
    "savitat",
    "mlsacobir",
    "encuentra24",
    "inmopanama",
  ];

  const allStats: Stats[] = [];
  for (const f of fuentes) {
    if (isExpired()) {
      console.warn(`\n⏱ Deadline alcanzado — se saltan las fuentes restantes.`);
      break;
    }
    try {
      allStats.push(await procesarFuente(supa, f));
    } catch (err) {
      console.error(`  [${f}] procesarFuente crasheó: ${(err as Error).message}`);
      allStats.push({ fuente: f, total: 0, cambiados: 0, sinCambio: 0, errores: 1, no_encontrada: 0 });
    }
  }

  const total = allStats.reduce((a, s) => a + s.total, 0);
  const cambiados = allStats.reduce((a, s) => a + s.cambiados, 0);
  const sinCambio = allStats.reduce((a, s) => a + s.sinCambio, 0);
  const errores = allStats.reduce((a, s) => a + s.errores, 0);
  const noEnc = allStats.reduce((a, s) => a + s.no_encontrada, 0);

  console.log(
    `\n┌─ Refresh precios: ${total} revisadas, ${cambiados} actualizadas, ${sinCambio} sin cambio, ${noEnc} 404, ${errores} errores`,
  );

  const detalle = allStats
    .map((s) => `${s.fuente}:${s.cambiados}/${s.total}`)
    .join(" ");
  const notes = `refresh-precios | ${detalle}`;
  // Fila propia bajo fuente_id="refresh-precios" (agregada en migration
  // 0018). Antes reusábamos "encuentra24" como workaround del FK y
  // ensuciaba las métricas de encuentra24 con datos de este job.
  const { error: insertErr } = await supa.from("scraper_runs").insert({
    fuente_id: "refresh-precios",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status: computeRunStatus({
      ok: cambiados + sinCambio + noEnc,
      errors: errores,
    }),
    found: total,
    inserted: 0,
    updated: cambiados,
    errors: errores,
    notes,
  });
  if (insertErr) {
    console.warn(`\n⚠ scraper_runs insert falló: ${insertErr.message}`);
  }
}

main().catch((err) => {
  console.error("Fatal refresh-precios:", err);
  process.exit(1);
});
