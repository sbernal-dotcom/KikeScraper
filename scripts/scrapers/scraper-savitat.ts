/**
 * Scraper de Savitat.com — afiliado local de CBRE en Panamá.
 * (cbre.com.pa redirige a savitat.com).
 *
 * Sistema: sitio Laravel/Blade con HTML server-rendered.
 * Datos: JSON-LD Schema.org `RealEstateListing` con:
 *   - name, description
 *   - offers.price, priceCurrency
 *   - address.addressRegion, streetAddress
 *   - geo.latitude, geo.longitude ← COORD EXACTA
 *
 * Inventario: mayormente comercial premium (oficinas, terrenos,
 * industrial) + inversión. ~150 propiedades únicas (ES + EN duplicadas
 * en sitemap → nos quedamos solo con las ES para evitar dobles).
 *
 * Discovery: sitemap.xml (NO paginación del listado — el sitio no está
 * bloqueado pero el sitemap es más limpio y rápido).
 *
 * Extracción: fetch() puro. Sin JS, sin Playwright.
 *
 * Uso:
 *   npm run scrape:savitat
 *   npm run scrape:savitat:prod
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { config as loadEnv } from "dotenv";

import { isOnLand } from "../../src/lib/geo/panama-land";
import { geocodeConEdificio } from "./geocode-edificio";
import {
  enriquecerConIA,
  trimDescripcion,
  type FichaIA,
  type ResumenBilingue,
} from "./ia";
import { createScraperClient } from "./supabase-admin";
import { type TagCerrado } from "./tags-caracteristicas";

loadEnv({ path: ".env.local" });
loadEnv();

const FUENTE_ID = "savitat";
const BASE_URL = "https://savitat.com";
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;
const USER_AGENT =
  "MapaInteractivoInteligente/0.1 (+contacto: abilendesign@gmail.com)";

// Concurrency 1 para no saturar el rate limit de Groq (6k TPM en free tier).
// Casi todas las páginas de Savitat sin coord del JSON-LD llaman al pipeline
// IA — si vamos con concurrency>1 se rate-limitea rápido y se pierden props.
const DETAIL_CONCURRENCY = 1;
const UPSERT_CONCURRENCY = 5;

const TARGET: "json" | "supabase" = process.argv.includes("--supabase")
  ? "supabase"
  : "json";

type CategoriaDb =
  | "apartamento"
  | "casa"
  | "terreno"
  | "local-comercial"
  | "oficina"
  | "galera";

type AnuncioRaw = {
  titulo: string | null;
  precio: number | null;
  moneda: "USD" | "PAB" | null;
  area_m2: number | null;
  habitaciones: number | null;
  banos: number | null;
  estacionamientos: number | null;
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
// Jitter alto: la mayoría de props llaman al pipeline IA (Groq 6k TPM
// free tier). Con concurrency 1 + jitter 1500-3000ms mantenemos ~20-40
// requests/min → holgado bajo el límite.
const jitter = (min = 1500, max = 3000) =>
  sleep(min + Math.floor(Math.random() * (max - min)));

async function chunkedParallel<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R | null>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(chunk.map((it, j) => fn(it, j)));
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value != null) out.push(r.value);
    }
  }
  return out;
}

function toNumber(text: string | number | null | undefined): number | null {
  if (text == null) return null;
  const raw = String(text)
    .replace(/&\w+;/g, " ")
    .replace(/&#\d+;/g, " ")
    .trim();
  let s = raw.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) s = s.replace(/,/g, "");
  else if (hasComma) {
    if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, "");
    else s = s.replace(",", ".");
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
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
        if ("/properties/".startsWith(value)) return false;
      }
    }
    return true;
  } catch {
    return true;
  }
}

async function fetchText(url: string, attempt = 1): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-PA,es;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return res.text();
  } catch (err) {
    if (attempt < 2) {
      await sleep(3000);
      return fetchText(url, attempt + 1);
    }
    throw err;
  }
}

/**
 * Descarga el sitemap y filtra URLs de propiedades en español.
 * Descarta /en/ para evitar duplicar cada listing (mismos datos).
 */
async function loadUrlsFromSitemap(): Promise<string[]> {
  const xml = await fetchText(SITEMAP_URL);
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)];
  const urls = matches
    .map((m) => m[1].trim())
    .filter(
      (u) =>
        u.startsWith(`${BASE_URL}/properties/`) &&
        !u.includes(`${BASE_URL}/en/`),
    );
  return Array.from(new Set(urls));
}

/**
 * Extrae el primer JSON-LD que sea RealEstateListing.
 */
function extractListingJsonLd(html: string): Record<string, unknown> | null {
  const blocks = [
    ...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b[1].trim());
      if (parsed?.["@type"] === "RealEstateListing") return parsed;
    } catch {
      // Ignorar bloques inválidos
    }
  }
  return null;
}

/**
 * Área en m² del bloque "Detalles de la Propiedad". Ej:
 *   <div>Área de Terreno</div>
 *   ...
 *   62,503
 *   m²
 */
function extractAreaM2(html: string): number | null {
  const m = html.match(
    /<div[^>]*>\s*(?:Área[^<]*|Superficie[^<]*)<\/div>[\s\S]{0,300}?<div[^>]*>[\s\S]{0,120}?([\d,.]+)[\s\S]{0,60}?m²/i,
  );
  return m ? toNumber(m[1]) : null;
}

function extractHabitacionesBanosEstacionamientos(html: string): {
  habitaciones: number | null;
  banos: number | null;
  estacionamientos: number | null;
} {
  const grab = (labelRe: RegExp): number | null => {
    const m = html.match(
      new RegExp(
        `<div[^>]*>\\s*${labelRe.source}[^<]*<\\/div>[\\s\\S]{0,300}?<div[^>]*>[\\s\\S]{0,120}?(\\d+)`,
        "i",
      ),
    );
    return m ? toNumber(m[1]) : null;
  };
  return {
    habitaciones: grab(/(?:Recámaras|Habitaciones|Dormitorios|Bedrooms)/),
    banos: grab(/(?:Baños|Bathrooms)/),
    estacionamientos: grab(/(?:Estacionamientos|Parqueos|Parking)/),
  };
}

/**
 * "Tipo" desde el sidebar "Información Adicional".
 */
function extractTipo(html: string): string | null {
  const m = html.match(
    /<span[^>]*>Tipo<\/span>[\s\S]{0,200}?<span[^>]*>([\s\S]*?)<\/span>/i,
  );
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : null;
}

function categoriaFromTipoYSlug(
  tipo: string | null,
  slug: string,
): CategoriaDb {
  const t = (tipo ?? "").toLowerCase();
  const s = slug.toLowerCase();
  if (/terreno|finca|lote/.test(t) || /-de-terreno-|-de-lote-|-de-lotes-/.test(s))
    return "terreno";
  if (/oficina/.test(t) || /-de-oficina/.test(s)) return "oficina";
  if (/galera|bodega|industrial/.test(t) || /-de-galera|-industrial/.test(s))
    return "galera";
  if (/local/.test(t) || /-de-local/.test(s)) return "local-comercial";
  if (/casa/.test(t) || /-de-casa/.test(s)) return "casa";
  if (/apartamento|apto/.test(t) || /-de-apartamento/.test(s))
    return "apartamento";
  // Default seguro: comercial (Savitat es sobre todo comercial)
  return "local-comercial";
}

function tipoOperacionFromSlug(slug: string): "venta" | "alquiler" {
  const s = slug.toLowerCase();
  if (/^venta-y-alquiler|^venta-o-alquiler/.test(s)) return "venta";
  if (/^alquiler-/.test(s)) return "alquiler";
  if (/^venta-/.test(s)) return "venta";
  return "venta";
}

async function scrapeDetail(url: string): Promise<AnuncioRaw | null> {
  console.log(`\n▶ ${url}`);
  let html: string;
  try {
    html = await fetchText(url);
  } catch (err) {
    console.warn(`  ✗ fetch: ${(err as Error).message}`);
    return null;
  }

  const listing = extractListingJsonLd(html);
  if (!listing) {
    console.warn(`  ✗ sin JSON-LD RealEstateListing`);
    return null;
  }

  const titulo = (listing.name as string | undefined)?.trim() ?? null;
  const descripcion = (listing.description as string | undefined) ?? null;
  const image = Array.isArray(listing.image) ? listing.image[0] : listing.image;

  const offers = (listing.offers as Record<string, unknown> | undefined) ?? {};
  const precio = toNumber((offers.price as string | number | null) ?? null);
  const moneda = ((offers.priceCurrency as string) ?? "USD") === "PAB"
    ? "PAB"
    : "USD";

  const address = (listing.address as Record<string, unknown> | undefined) ?? {};
  const zona =
    (address.streetAddress as string | undefined) ??
    (address.addressRegion as string | undefined) ??
    null;

  const geo = (listing.geo as Record<string, unknown> | undefined) ?? {};
  let lat = toNumber(geo.latitude as string | number | null);
  let lng = toNumber(geo.longitude as string | number | null);
  let precision: AnuncioRaw["precision_ubicacion"] = null;
  let ubicacionFuente: string | null = null;

  // Del HTML fuera del JSON-LD
  const area_m2 = extractAreaM2(html);
  const { habitaciones, banos, estacionamientos } =
    extractHabitacionesBanosEstacionamientos(html);
  const tipo = extractTipo(html);
  const slug = url.replace(`${BASE_URL}/properties/`, "");

  const categoria = categoriaFromTipoYSlug(tipo, slug);
  const tipoOperacion = tipoOperacionFromSlug(slug);

  // Validar coord del JSON-LD contra tierra/mar. Si mal, correr pipeline.
  if (lat != null && lng != null && !isOnLand(lat, lng)) {
    console.log(
      `  ✗ geo del JSON-LD en mar (${lat.toFixed(4)}, ${lng.toFixed(4)}) — corriendo pipeline`,
    );
    lat = null;
    lng = null;
  }
  if (lat == null || lng == null) {
    console.log(`  ✗ sin geo válido — corriendo pipeline edificio→cache→web→zona`);
    // Savitat es fuente de alta confianza (CBRE) y publica la zona en
    // streetAddress. allowZoneFallback:true acepta el centroide de zona
    // conocida como fallback cuando no hay coord exacta.
    const geoRes = await geocodeConEdificio(titulo, descripcion, url, zona, {
      allowZoneFallback: true,
    });
    if (!geoRes) {
      console.log(`  pipeline tampoco resolvió — saltando`);
      return null;
    }
    lat = geoRes.lat;
    lng = geoRes.lng;
    precision = geoRes.precision;
    ubicacionFuente = geoRes.source;
  } else {
    console.log(`  geo ✓ ${lat.toFixed(4)}, ${lng.toFixed(4)} (de JSON-LD)`);
    precision = "exacta";
    ubicacionFuente = "jsonld_geo";
  }

  const descripcionTemp = trimDescripcion(descripcion);
  const ahora = new Date().toISOString();

  const base: AnuncioRaw = {
    titulo,
    precio,
    moneda,
    area_m2,
    habitaciones,
    banos,
    estacionamientos,
    zona,
    lat,
    lng,
    precision_ubicacion: precision,
    ubicacion_fuente: ubicacionFuente,
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
    tipoOperacion,
    precio: base.precio,
    moneda: base.moneda,
    area_m2: base.area_m2,
    habitaciones: base.habitaciones,
    banos: base.banos,
    estacionamientos: base.estacionamientos,
    zona: base.zona,
  };
  const enriq = await enriquecerConIA(ficha, descripcionTemp);
  if (enriq.resumen_ia)
    console.log(
      `  resumen-ia ✓ (es:${enriq.resumen_ia.es.length} en:${enriq.resumen_ia.en.length})`,
    );

  // Categoría no viaja en AnuncioRaw, pero tipoOperacion sí lo hacemos
  // implícito vía el slug de URL cuando construimos toDbRow.
  void image;
  void categoria;
  return { ...base, ...enriq };
}

async function scrapeAll(skipUrls: Set<string>): Promise<AnuncioRaw[]> {
  const allowed = await checkRobotsTxt();
  if (!allowed) {
    console.warn("robots.txt prohíbe /properties/ — abortando.");
    return [];
  }

  console.log(`▶ Cargando sitemap...`);
  let urls: string[];
  try {
    urls = await loadUrlsFromSitemap();
  } catch (err) {
    console.warn(`  ${(err as Error).message} — abortando.`);
    return [];
  }
  console.log(`  ${urls.length} URLs en sitemap`);
  const procesables = urls.filter((u) => {
    if (skipUrls.has(u)) return false;
    return true;
  });
  console.log(`  ${procesables.length} tras filtrar existentes`);
  if (procesables.length === 0) return [];

  const results = await chunkedParallel(
    procesables,
    DETAIL_CONCURRENCY,
    async (u) => {
      const r = await scrapeDetail(u).catch((err) => {
        console.warn(`  Error en ${u}: ${(err as Error).message}`);
        return null;
      });
      await jitter();
      return r;
    },
  );

  console.log(
    `\n┌─ Resumen Savitat: ${urls.length} URLs, ${results.length} scrapeadas`,
  );
  return results;
}

function toDbRow(a: AnuncioRaw): Record<string, unknown> | null {
  if (a.precio == null || a.lat == null || a.lng == null) return null;
  const slug = a.url_original.replace(`${BASE_URL}/properties/`, "");
  return {
    titulo: a.titulo ?? "(sin título)",
    tipo_operacion: tipoOperacionFromSlug(slug),
    categoria: categoriaFromTipoYSlug(null, slug),
    estado_anuncio: "activo",
    estado_datos: "completo_verificado",
    veces_no_encontrado: 0,
    fecha_ultima_vista: a.fecha_actualizacion,
    fecha_ultima_revision: a.fecha_actualizacion,
    motivo_estado: "visto en scrape savitat",
    lat: a.lat,
    lng: a.lng,
    corregimiento: a.zona,
    area_m2: a.area_m2,
    habitaciones: a.habitaciones,
    banos: a.banos,
    estacionamientos: a.estacionamientos,
    precio: a.precio,
    moneda: a.moneda ?? "USD",
    precision_ubicacion: a.precision_ubicacion,
    ubicacion_fuente: a.ubicacion_fuente,
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
): Promise<Set<string>> {
  const PAGE = 1000;
  const all: string[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supa
      .from("propiedades")
      .select("url_original")
      .eq("fuente_id", FUENTE_ID)
      .eq("estado_anuncio", "activo")
      .range(from, from + PAGE - 1);
    if (error) {
      console.warn(`  No se pudo leer propiedades existentes: ${error.message}`);
      return new Set(all);
    }
    const batch = (data ?? []).map((r) => r.url_original as string);
    all.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return new Set(all);
}

function loadExisting(outPath: string): AnuncioRaw[] {
  if (!existsSync(outPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(outPath, "utf-8")) as {
      results?: AnuncioRaw[];
    };
    return Array.isArray(parsed.results) ? parsed.results : [];
  } catch {
    return [];
  }
}

async function runJsonMode() {
  const outPath = join(process.cwd(), "public", "scrape-preview-savitat.json");
  const existing = loadExisting(outPath);
  const skipUrls = new Set(existing.map((r) => r.url_original));
  console.log(`JSON existente: ${existing.length}.`);
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
    `\nPreview escrito en ${outPath} — total ${merged.length} (${existing.length} + ${allNew.length}).`,
  );
}

async function runSupabaseMode() {
  const supa = createScraperClient();
  const startedAt = new Date().toISOString();
  console.log("Modo Supabase: upsert por url_original.");
  const skipUrls = await fetchExistingUrls(supa);
  console.log(`En DB: ${skipUrls.size} (se saltan).`);
  const allNew = await scrapeAll(skipUrls);
  console.log(`\nNuevos: ${allNew.length}`);

  let inserted = 0;
  let errors = 0;
  const rows: Array<{ a: AnuncioRaw; row: Record<string, unknown> }> = [];
  for (const a of allNew) {
    const row = toDbRow(a);
    if (!row) {
      console.warn(`  ✗ saltado (sin precio/lat/lng): ${a.url_original}`);
      errors++;
      continue;
    }
    rows.push({ a, row });
  }
  await chunkedParallel(rows, UPSERT_CONCURRENCY, async ({ a, row }) => {
    const { error } = await supa
      .from("propiedades")
      .upsert(row, { onConflict: "url_original" });
    if (error) {
      console.warn(`  ✗ upsert falló (${a.url_original}): ${error.message}`);
      errors++;
    } else {
      inserted++;
    }
    return null;
  });

  const status = errors > 0 && inserted === 0 ? "error" : "ok";
  const { error: runErr } = await supa.from("scraper_runs").insert({
    fuente_id: FUENTE_ID,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status,
    found: allNew.length,
    inserted,
    updated: 0,
    errors,
    notes: "savitat (CBRE Panamá afiliado)",
  });
  if (runErr) console.warn(`  scraper_runs: ${runErr.message}`);
  console.log(
    `\nUpsert — insertados: ${inserted}, errores: ${errors}, status: ${status}.`,
  );
}

async function main() {
  if (TARGET === "supabase") await runSupabaseMode();
  else await runJsonMode();
}

main().catch((err) => {
  console.error("Fatal scraper-savitat:", err);
  process.exit(1);
});
