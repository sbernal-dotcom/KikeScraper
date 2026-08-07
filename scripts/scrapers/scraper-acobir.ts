/**
 * Scraper de ACOBIR Proyectos — fuente independiente del scraper principal.
 *
 * ACOBIR (Asociación Panameña de Corredores y Promotores de Bienes Raíces) es
 * la gremial oficial. Su Buscador de Proyectos lista ~30 proyectos nuevos
 * curados, con JSON-LD Product en cada detalle. Inventario chico pero alta
 * calidad — frecuencia recomendada: semanal.
 *
 * Características vs encuentra24:
 *   - Categoría única: `proyecto_nuevo` (no compite con apartamento/casa).
 *   - estado_datos='parcial_verificado': precios y áreas son "desde X" (rangos
 *     de un proyecto multi-unidad), no datos exactos por unidad.
 *   - No persiste descripción (regla global del proyecto).
 *   - Independiente del scraper principal: si falla, no rompe scrape:prod.
 *
 * Uso:
 *   npm run scrape:acobir         # modo dry → public/scrape-preview-acobir.json
 *   npm run scrape:acobir:prod    # modo Supabase → upsert + scraper_runs
 *
 * Paginación: /proyectos/list/page2, page3, ... Cicla con solapamiento — para
 * cuando 2 páginas consecutivas no traen slugs nuevos (cap defensivo: 10 pág).
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { config as loadEnv } from "dotenv";

import {
  enriquecerConIA,
  trimDescripcion,
  type FichaIA,
  type ResumenBilingue,
} from "./ia";
import { stripLifecycleIfNotActive } from "./_lifecycle";
import { computeRunStatus } from "./_run-status";
import { geocodeConEdificio } from "./geocode-edificio";
import { preflightCheck } from "./preflight-check";
import { validarConMapbox } from "./mapbox-validate";
import { createScraperClient } from "./supabase-admin";
import { type TagCerrado } from "./tags-caracteristicas";
import { centroFromTable, normalizeKey } from "./zonas-panama";

loadEnv({ path: ".env.local" });
loadEnv();

const FUENTE_ID = "acobir";
const BASE_URL = "https://www.acobir.com";
const LIST_URL = `${BASE_URL}/proyectos/list/`;
const USER_AGENT =
  "MapaInteractivoInteligente/0.1 (+contacto: abilendesign@gmail.com)";

const MAX_PAGES = 10;
const MAX_EMPTY_PAGES = 2;
// Concurrencia para detail-fetch. ACOBIR es estático WordPress, tolera bien.
const DETAIL_CONCURRENCY = 3;
const UPSERT_CONCURRENCY = 5;

const TARGET: "json" | "supabase" = process.argv.includes("--supabase")
  ? "supabase"
  : "json";

type LdProduct = {
  "@type"?: string;
  name?: string;
  description?: string;
  brand?: string;
  image?: { url?: string } | string;
  offers?: {
    price?: number | string;
    priceCurrency?: string;
    seller?: { name?: string };
  };
};

type ProyectoRaw = {
  titulo: string | null;
  precio_desde: number | null;
  moneda: "USD" | "PAB" | null;
  area_desde_m2: number | null;
  habitaciones_desde: number | null;
  banos_desde: number | null;
  zona: string | null;
  lat: number | null;
  lng: number | null;
  precision_ubicacion: "exacta" | "zona-declarada" | "aproximada" | null;
  ubicacion_fuente: string | null;
  url_original: string;
  fuente: string;
  fecha_deteccion: string;
  fecha_actualizacion: string;
  resumen_ia: ResumenBilingue | null;
  tags_caracteristicas: TagCerrado[];
  tags_extra: string[];
  ai_source_flag: "generated_from_external_description" | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min = 800, max = 1500) =>
  sleep(min + Math.floor(Math.random() * (max - min)));

/** Procesa items en chunks paralelos. Ver scraper-panamaequity.ts. */
async function chunkedParallel<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R | null>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(chunk.map((it) => fn(it)));
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value != null) out.push(r.value);
    }
  }
  return out;
}

let lastNominatimAt = 0;
async function nominatimQuery(
  q: string,
): Promise<{ lat: number; lng: number } | null> {
  const elapsed = Date.now() - lastNominatimAt;
  if (elapsed < 1100) await sleep(1100 - elapsed);
  lastNominatimAt = Date.now();
  const url =
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}` +
    `&format=jsonv2&limit=1&countrycodes=pa&addressdetails=1`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "es-PA,es;q=0.9",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;
    const lat = Number(data[0].lat);
    const lng = Number(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

async function geocodeZona(
  zona: string | null,
): Promise<{ lat: number; lng: number; source: "table" | "nominatim" } | null> {
  if (!zona || zona.trim().length < 3) return null;
  const fromTable = centroFromTable(zona);
  if (fromTable) return { ...fromTable, source: "table" };
  const first = await nominatimQuery(`${zona}, Panamá`);
  if (first) return { ...first, source: "nominatim" };
  const second = await nominatimQuery(`${zona}, Ciudad de Panamá, Panamá`);
  return second ? { ...second, source: "nominatim" } : null;
}

function toNumber(text: string | null | undefined): number | null {
  if (text == null) return null;
  const raw = String(text).trim();
  // Preservar signo negativo (coord.longitude PA es "-79.x"). Ver
  // scraper-savitat.ts para el bug histórico que este flag evita.
  const negative = raw.startsWith("-");
  let s = raw.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    s = s.replace(/,/g, "");
  } else if (hasComma) {
    if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, "");
    else s = s.replace(",", ".");
  }
  let n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (negative) n = -n;
  return n;
}

async function checkRobotsTxt(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/robots.txt`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return true;
    const txt = await res.text();
    const lines = txt.split(/\r?\n/);
    let appliesToUs = false;
    for (const raw of lines) {
      const line = raw.split("#")[0].trim();
      if (!line) continue;
      const [keyRaw, ...rest] = line.split(":");
      const key = keyRaw.trim().toLowerCase();
      const value = rest.join(":").trim();
      if (key === "user-agent") appliesToUs = value === "*";
      else if (appliesToUs && key === "disallow" && value) {
        if ("/proyectos/list/".startsWith(value)) return false;
      }
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Patrones tipo "desde 95 m²", "desde 1 recámara", "1-3 recámaras",
 * "desde USD 250,000". Tomamos el MÍNIMO porque el campo es _desde.
 */
function parseRangos(desc: string): {
  area_desde_m2: number | null;
  habitaciones_desde: number | null;
  banos_desde: number | null;
} {
  const clean = desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  const areaPatterns = [
    /desde\s*(\d{2,4}(?:[.,]\d+)?)\s*(?:m(?:t|ts|trs)?[²2]|metros?\s*cuadrados?)/i,
    /(\d{2,4}(?:[.,]\d+)?)\s*(?:m(?:t|ts|trs)?[²2])\s*(?:a|hasta|-)\s*\d/i,
    /(\d{2,4}(?:[.,]\d+)?)\s*(?:m(?:t|ts|trs)?[²2]|metros?\s*cuadrados?)/i,
  ];
  let area_desde_m2: number | null = null;
  for (const re of areaPatterns) {
    const m = clean.match(re);
    if (m) {
      area_desde_m2 = toNumber(m[1]);
      if (area_desde_m2) break;
    }
  }

  const habPatterns = [
    /desde\s*(\d)\s*(?:rec[áa]maras?|habitaciones?|dormitorios?)/i,
    /(\d)\s*(?:a|hasta|-)\s*\d\s*(?:rec[áa]maras?|habitaciones?|dormitorios?)/i,
    /(\d)\s*(?:rec[áa]maras?|habitaciones?|dormitorios?)/i,
  ];
  let habitaciones_desde: number | null = null;
  for (const re of habPatterns) {
    const m = clean.match(re);
    if (m) {
      habitaciones_desde = toNumber(m[1]);
      if (habitaciones_desde) break;
    }
  }

  const banPatterns = [
    /desde\s*(\d(?:[.,]\d)?)\s*ba(?:ñ|n)os?/i,
    /(\d(?:[.,]\d)?)\s*(?:a|hasta|-)\s*\d\s*ba(?:ñ|n)os?/i,
    /(\d(?:[.,]\d)?)\s*ba(?:ñ|n)os?/i,
  ];
  let banos_desde: number | null = null;
  for (const re of banPatterns) {
    const m = clean.match(re);
    if (m) {
      banos_desde = toNumber(m[1]);
      if (banos_desde) break;
    }
  }

  return { area_desde_m2, habitaciones_desde, banos_desde };
}

/**
 * Detecta la zona del proyecto desde la descripción. Busca patrones tipo
 * "ubicado en X", "en X, Panamá", "frente a X" — y los cruza con la tabla
 * de zonas conocidas. Fallback: null (el geocoder fallará y se saltará).
 */
function detectZonaFromDesc(desc: string, titulo: string | null): string | null {
  const text = `${titulo ?? ""} ${desc}`.toLowerCase();
  // Probar zonas conocidas primero — son las que tienen centroide verificado.
  const zonasComunes = [
    "costa del este", "punta pacífica", "punta pacifica", "punta paitilla",
    "san francisco", "obarrio", "marbella", "bella vista", "el cangrejo",
    "santa maría", "santa maria", "avenida balboa", "coco del mar",
    "casco viejo", "amador", "albrook", "clayton", "ancón",
    "buenaventura", "playa blanca", "coronado", "gorgona",
    "boquete", "volcán", "david",
    "panamá pacífico", "panama pacifico", "veracruz",
    "ciudad jardín", "ciudad jardin", "condado del rey",
    "hacienda", "betania", "pedregal", "juan díaz", "juan diaz",
    "el dorado", "los andes", "vista hermosa",
  ];
  for (const z of zonasComunes) {
    if (text.includes(z)) return z;
  }
  // Pattern: "en {zona}" / "ubicado en {zona}"
  const m = desc.match(
    /(?:ubicad[oa]\s+en|en\s+(?:el|la|los|las)?)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ\s]{4,30}?)(?:,|\.|\s+(?:dentro|en|cerca|a\s+\d))/i,
  );
  if (m) return m[1].trim();
  return null;
}

/**
 * Convertido de Playwright a fetch puro: el JSON-LD de ACOBIR viene
 * server-side renderizado, no necesitamos browser. Saca ~3-5s de overhead
 * de chromium launch y permite concurrencia real.
 */
async function fetchHtml(url: string, attempt = 1): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-PA,es;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return res.text();
  } catch (err) {
    if (attempt < 2) {
      await sleep(3000);
      return fetchHtml(url, attempt + 1);
    }
    throw err;
  }
}

function extractJsonLd(html: string): LdProduct[] {
  const out: LdProduct[] = [];
  const re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]+?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1]);
      if (Array.isArray(parsed)) out.push(...parsed);
      else if (parsed?.["@graph"]) out.push(...parsed["@graph"]);
      else out.push(parsed);
    } catch {
      // bloque malformado, ignorar
    }
  }
  return out;
}

async function scrapeListPage(pageNum: number): Promise<string[]> {
  const url = pageNum === 1 ? LIST_URL : `${BASE_URL}/proyectos/list/page${pageNum}`;
  const html = await fetchHtml(url);
  const slugs = Array.from(
    new Set(
      Array.from(
        html.matchAll(/\/proyectos\/list\/([a-z0-9-]+)\/?(?:"|<)/g),
        (m) => m[1],
      ).filter((s) => !/^page\d+$/.test(s) && s !== "page2"),
    ),
  );
  // ACOBIR mezcla anuncios individuales de alquiler/venta en /proyectos/list/.
  // Esos NO son proyectos nuevos curados — filtrarlos por slug prefix.
  return slugs.filter((s) => !/^(se-alquila|alquiler|se-vende|venta)-/.test(s));
}

async function scrapeDetail(slug: string): Promise<ProyectoRaw | null> {
  const url = `${BASE_URL}/proyectos/list/${slug}/`;
  console.log(`→ ${url}`);
  await jitter(400, 900);

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    console.warn(`  ${(err as Error).message} — saltando`);
    return null;
  }
  const products = extractJsonLd(html);
  const product = products.find((p) => p?.["@type"] === "Product");
  if (!product) {
    console.warn("  Sin JSON-LD Product — saltando");
    return null;
  }

  const titulo = product.name?.trim() ?? null;
  const precio_desde = toNumber(String(product.offers?.price ?? ""));
  const moneda = (() => {
    const c = (product.offers?.priceCurrency || "").toUpperCase();
    return c === "USD" || c === "PAB" ? (c as "USD" | "PAB") : null;
  })();
  const descripcion = product.description ?? "";
  const rangos = parseRangos(descripcion);
  const zona = detectZonaFromDesc(descripcion, titulo);
  // acobir publica proyectos (no listings individuales) y no incluye
  // lat/lng en el HTML. Pipeline siempre: edificio (proyecto) → cache → web → zona.
  const geo = await geocodeConEdificio(titulo, descripcion, url, zona);
  if (!geo) {
    console.log(`  geocode → sin resultado — saltando`);
    return null;
  }
  if (zona) await validarConMapbox(zona, { lat: geo.lat, lng: geo.lng });

  const descripcionTemp = trimDescripcion(descripcion);
  const ahora = new Date().toISOString();
  const base: ProyectoRaw = {
    titulo,
    precio_desde,
    moneda,
    area_desde_m2: rangos.area_desde_m2,
    habitaciones_desde: rangos.habitaciones_desde,
    banos_desde: rangos.banos_desde,
    zona,
    lat: geo.lat,
    lng: geo.lng,
    precision_ubicacion: geo.precision,
    ubicacion_fuente: geo.source,
    url_original: url,
    fuente: FUENTE_ID,
    fecha_deteccion: ahora,
    fecha_actualizacion: ahora,
    resumen_ia: null,
    tags_caracteristicas: [],
    tags_extra: [],
    ai_source_flag: null,
  };

  const ficha: FichaIA = {
    titulo: base.titulo,
    tipoOperacion: "venta",
    precio: base.precio_desde,
    moneda: base.moneda,
    area_m2: base.area_desde_m2,
    habitaciones: base.habitaciones_desde,
    banos: base.banos_desde,
    estacionamientos: null,
    zona: base.zona,
  };
  const enriq = await enriquecerConIA(ficha, descripcionTemp);
  if (enriq.resumen_ia)
    console.log(
      `  resumen-ia ✓ (es:${enriq.resumen_ia.es.length} en:${enriq.resumen_ia.en.length})`,
    );

  return { ...base, ...enriq };
}

// H2: errores de scrapeDetail (fetch/parse/geo). Antes se silenciaban
// con `.catch(()=>null)` → status "ok" mientras N slugs fallaban.
let scrapeErrors = 0;

async function scrapeAll(skipUrls: Set<string>): Promise<ProyectoRaw[]> {
  scrapeErrors = 0;
  const allowed = await checkRobotsTxt();
  if (!allowed) {
    console.warn("robots.txt prohíbe /proyectos/list/ — abortando.");
    return [];
  }

  const seenSlugs = new Set<string>();
  const results: ProyectoRaw[] = [];
  let consecutiveEmpty = 0;

  for (let n = 1; n <= MAX_PAGES; n++) {
    console.log(`\n▶ Listado pág ${n}`);
    let slugs: string[];
    try {
      slugs = await scrapeListPage(n);
    } catch (err) {
      console.warn(`  ${(err as Error).message} — corto.`);
      break;
    }

    const nuevos = slugs.filter((s) => !seenSlugs.has(s));
    console.log(`  ${slugs.length} en la página, ${nuevos.length} nuevos`);
    if (nuevos.length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= MAX_EMPTY_PAGES) {
        console.log(`  ${MAX_EMPTY_PAGES} págs consecutivas sin nuevos — corto.`);
        break;
      }
      continue;
    }
    consecutiveEmpty = 0;

    nuevos.forEach((s) => seenSlugs.add(s));
    const procesables = nuevos.filter((s) => {
      const detailUrl = `${BASE_URL}/proyectos/list/${s}/`;
      if (skipUrls.has(detailUrl)) {
        console.log(`  (skip ya en DB) ${s}`);
        return false;
      }
      return true;
    });

    const batch = await chunkedParallel(procesables, DETAIL_CONCURRENCY, (slug) =>
      scrapeDetail(slug).catch((err) => {
        // H2: contar el error para que el ratio dispare status=error.
        console.warn(`  Error en ${slug}: ${(err as Error).message}`);
        scrapeErrors++;
        return null;
      }),
    );
    results.push(...batch);
    await jitter(300, 700);
  }
  console.log(
    `\n┌─ Resumen ACOBIR: ${seenSlugs.size} slugs únicos, ${results.length} nuevos scrapeados`,
  );
  return results;
}

function toDbRow(a: ProyectoRaw): Record<string, unknown> | null {
  if (a.precio_desde == null || a.lat == null || a.lng == null) return null;
  return {
    titulo: a.titulo ?? "(sin título)",
    tipo_operacion: "venta",
    categoria: "proyecto_nuevo",
    estado_anuncio: "activo",
    estado_datos: "parcial_verificado",
    veces_no_encontrado: 0,
    fecha_ultima_vista: a.fecha_actualizacion,
    fecha_ultima_revision: a.fecha_actualizacion,
    motivo_estado: "visto en scrape acobir",
    lat: a.lat,
    lng: a.lng,
    precision_ubicacion: a.precision_ubicacion,
    ubicacion_fuente: a.ubicacion_fuente,
    corregimiento: a.zona ? normalizeKey(a.zona) : null,
    area_m2: a.area_desde_m2,
    habitaciones: a.habitaciones_desde,
    banos: a.banos_desde,
    precio: a.precio_desde,
    moneda: a.moneda ?? "USD",
    resumen_ia_es: a.resumen_ia?.es ?? null,
    resumen_ia_en: a.resumen_ia?.en ?? null,
    tags_caracteristicas: a.tags_caracteristicas,
    tags_extra: a.tags_extra,
    ai_source_flag: a.ai_source_flag,
    fuente_id: a.fuente,
    url_original: a.url_original,
    fecha_deteccion: a.fecha_deteccion,
    fecha_actualizacion: a.fecha_actualizacion,
  };
}

async function fetchExistingUrls(
  supa: ReturnType<typeof createScraperClient>,
): Promise<Map<string, { estado_anuncio: string }>> {
  // Trae TODAS (activas + archivadas). stripLifecycleIfNotActive
  // respeta lo que verify o mantenimiento haya decidido (auditoría C2).
  const PAGE = 1000;
  const map = new Map<string, { estado_anuncio: string }>();
  let from = 0;
  while (true) {
    const { data, error } = await supa
      .from("propiedades")
      .select("url_original, estado_anuncio")
      .eq("fuente_id", FUENTE_ID)
      .range(from, from + PAGE - 1);
    if (error) {
      // H3: retornar parcial hacía que URLs de páginas siguientes se
      // creyeran nuevas → re-procesamiento en Groq y potencial resurrección
      // de archivadas. Abortamos ruidoso.
      throw new Error(
        `fetchExistingUrls falló en range=${from}-${from + PAGE - 1}: ${error.message}`,
      );
    }
    const batch = (data ?? []) as Array<{ url_original: string; estado_anuncio: string }>;
    for (const r of batch) map.set(r.url_original, { estado_anuncio: r.estado_anuncio });
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return map;
}

function loadExisting(outPath: string): ProyectoRaw[] {
  if (!existsSync(outPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(outPath, "utf-8")) as {
      results?: ProyectoRaw[];
    };
    return Array.isArray(parsed.results) ? parsed.results : [];
  } catch {
    return [];
  }
}

async function runJsonMode() {
  const outPath = join(process.cwd(), "public", "scrape-preview-acobir.json");
  const existing = loadExisting(outPath);
  const skipUrls = new Set(existing.map((r) => r.url_original));
  console.log(`JSON existente: ${existing.length} proyectos.`);
  const allNew = await scrapeAll(skipUrls);
  const merged = [...existing, ...allNew];
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        fuente: FUENTE_ID,
        results: merged,
      },
      null,
      2,
    ),
  );
  console.log(
    `\nPreview escrito en ${outPath} — total ${merged.length} (${existing.length} previos + ${allNew.length} nuevos).`,
  );
}

async function runSupabaseMode() {
  const supa = createScraperClient();
  const startedAt = new Date().toISOString();
  console.log("Modo Supabase: upsert por url_original + registro en scraper_runs.");

  const existingMap = await fetchExistingUrls(supa);
  const skipUrls = new Set(existingMap.keys());
  console.log(`Proyectos ACOBIR en DB: ${skipUrls.size} (se saltan).`);

  const allNew = await scrapeAll(skipUrls);
  console.log(`\nNuevos scrapeados: ${allNew.length}`);

  let inserted = 0;
  let errors = 0;
  const rows: Array<{ a: ProyectoRaw; row: Record<string, unknown> }> = [];
  for (const a of allNew) {
    const row = toDbRow(a);
    if (!row) {
      {
        const falta = [a.precio_desde == null && "precio_desde", a.lat == null && "lat", a.lng == null && "lng"].filter(Boolean).join(",");
        console.warn(`  ✗ saltado (falta: ${falta}): ${a.url_original}`);
      }
      errors++;
      continue;
    }
    rows.push({ a, row });
  }

  await chunkedParallel(rows, UPSERT_CONCURRENCY, async ({ a, row }) => {
    const payload = stripLifecycleIfNotActive(row, existingMap.get(a.url_original));
    const { error } = await supa
      .from("propiedades")
      .upsert(payload, { onConflict: "url_original" });
    if (error) {
      console.warn(`  ✗ upsert falló (${a.url_original}): ${error.message}`);
      errors++;
    } else {
      inserted++;
    }
    return null;
  });

  errors += scrapeErrors;
  const status = computeRunStatus({ ok: inserted, errors });
  const { error: runErr } = await supa.from("scraper_runs").insert({
    fuente_id: FUENTE_ID,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status,
    found: allNew.length,
    inserted,
    updated: 0,
    errors,
    notes: "acobir proyectos (semanal)",
  });
  if (runErr) console.warn(`  No se pudo registrar scraper_run: ${runErr.message}`);

  console.log(
    `\nUpsert terminado — insertados: ${inserted}, errores: ${errors}, status: ${status}.`,
  );
}

async function main() {
  if (TARGET === "supabase") {
    const pf = await preflightCheck("acobir");
    if (!pf.ok) {
      console.error(`Preflight abort: ${pf.reason}`);
      process.exit(1);
    }
    await runSupabaseMode();
  } else {
    await runJsonMode();
  }
}

main().catch((err) => {
  // CRÍTICO: errores aquí NO deben romper el scraper principal (scrape:prod).
  // El cron de ACOBIR es independiente, exit con código != 0 sí marca el job
  // como fallido pero queda aislado del pipeline principal.
  console.error("Fatal scraper-acobir:", err);
  process.exit(1);
});
