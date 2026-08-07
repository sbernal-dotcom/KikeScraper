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
import {
  contadorLlamadasSemanticas,
  extraerCamposDesdeHtml,
  type CamposSemanticos,
} from "./extraer-html-ia";
import { stripLifecycleIfNotActive } from "./_lifecycle";
import { geocodeConEdificio } from "./geocode-edificio";
import { preflightCheck } from "./preflight-check";
import {
  enriquecerConIA,
  trimDescripcion,
  type FichaIA,
  type ResumenBilingue,
} from "./ia";
import { createScraperClient } from "./supabase-admin";
import { type TagCerrado } from "./tags-caracteristicas";
import { fetchUrlsFallidasRecientes, marcarUrlFallida } from "./urls-fallidas";

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

// Hard timeout wall-clock. Savitat re-procesa cada corrida ~40 URLs que
// nunca resuelven geo (galeras/oficinas sin coord ni zona reconocible),
// consumiendo 3h+ en llamadas Groq que siempre fallan. 60 min es techo
// suficiente para procesar las URLs nuevas legítimas antes de rendirse.
// La solución estructural (cache de URLs ya intentadas fallidas) queda
// para más adelante.
const MAX_RUNTIME_MS = 60 * 60 * 1000;
let deadline = 0;
let hitDeadline = false;
function isExpired(): boolean {
  if (Date.now() > deadline) {
    if (!hitDeadline) {
      console.warn(`\n⏱ Savitat: alcanzado hard timeout de ${MAX_RUNTIME_MS / 60000} min — abortando limpio.`);
      hitDeadline = true;
    }
    return true;
  }
  return false;
}

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
  // Preservar signo negativo — coord.longitude de Panamá viene "-79.29" del
  // JSON-LD; sin esto quedaba "79.29" (Arabia) y isOnLand rechazaba →
  // pipeline geocode innecesario → 29/30 props no insertadas (fix 07-14).
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

// Retry con backoff + jitter para tolerar rate limit y errores de red.
// Fix 2026-07-11: antes solo 1 retry con 3s fijo — ante ráfagas de "fetch
// failed" caían URLs enteras. Con 3 intentos y jitter respetamos el sitio
// y aumentamos supervivencia. HTTP 4xx no-429 no se reintenta (es
// respuesta válida del servidor: no lo martillamos).
const FETCH_MAX_ATTEMPTS = 3;
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
    if (!res.ok) {
      const transient = res.status === 429 || res.status >= 500;
      const err = new Error(`HTTP ${res.status} en ${url}`);
      (err as Error & { transient?: boolean }).transient = transient;
      throw err;
    }
    return res.text();
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    const isNetwork = /fetch failed|timeout|ECONN|abort/i.test(msg);
    const transient = (err as Error & { transient?: boolean }).transient ?? isNetwork;
    if (transient && attempt < FETCH_MAX_ATTEMPTS) {
      // 2-4s → 4-8s.
      const base = 2000 * attempt;
      await sleep(base + Math.floor(Math.random() * base));
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
  let precio = toNumber((offers.price as string | number | null) ?? null);
  const moneda = ((offers.priceCurrency as string) ?? "USD") === "PAB"
    ? "PAB"
    : "USD";

  // 2026-08-01: Savitat dejó de publicar offers.price para ~21% de los
  // listings (galeras, oficinas, terrenos con "consultar precio").
  // Fallback: extraer del HTML. Prioridad:
  //   1) bloque estructurado <h4>Precio venta:</h4> <div>$X</div>
  //   2) meta description "Venta: $X - ..." o "Alquiler: $X - ..."
  // Solo si ninguno da, precio queda null (se descartará más abajo).
  if (precio == null) {
    const bloqueMatch = html.match(
      /Precio\s+(?:venta|alquiler)[:\s]*<\/h4>\s*<div[^>]*>\s*\$?\s*([\d,\.]+)/i,
    );
    const metaMatch = html.match(
      /<meta\s+name="description"[^>]*content="[^"]*?(?:Venta|Alquiler):\s*\$?\s*([\d,\.]+)/i,
    );
    precio =
      toNumber(bloqueMatch?.[1] ?? null) ?? toNumber(metaMatch?.[1] ?? null);
    if (precio != null) {
      console.log(`  precio ← HTML fallback: $${precio}`);
    }
  }

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
  let area_m2 = extractAreaM2(html);
  // eslint-disable-next-line prefer-const
  let { habitaciones, banos, estacionamientos } =
    extractHabitacionesBanosEstacionamientos(html);
  const tipo = extractTipo(html);
  const slug = url.replace(`${BASE_URL}/properties/`, "");

  const categoria = categoriaFromTipoYSlug(tipo, slug);
  const tipoOperacion = tipoOperacionFromSlug(slug);

  // Fallback semántico anti-cambio-de-HTML: si tras los 3 extractores
  // (JSON-LD + bloque estructurado + meta description) el precio sigue
  // null, le pedimos al LLM que lea el HTML directamente. Pasa cuando
  // Savitat renombra las clases CSS o cambia el layout — sin este paso
  // el listing se descarta y contamos error. Ver extraer-html-ia.ts
  // para guardarraíles (cap 100/corrida, validación de rango, etc.).
  if (precio == null) {
    const pedidos: Array<keyof CamposSemanticos> = ["precio"];
    if (area_m2 == null) pedidos.push("area_m2");
    if (habitaciones == null) pedidos.push("habitaciones");
    if (banos == null) pedidos.push("banos");
    const semant = await extraerCamposDesdeHtml(
      html,
      url,
      pedidos,
      tipoOperacion,
    );
    if (semant.precio != null) {
      precio = semant.precio;
      console.log(`  precio ← IA semántico: $${precio}`);
    }
    if (area_m2 == null && semant.area_m2 != null) area_m2 = semant.area_m2;
    if (habitaciones == null && semant.habitaciones != null)
      habitaciones = semant.habitaciones;
    if (banos == null && semant.banos != null) banos = semant.banos;
  }

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
      // Marcar URL como fallida para no re-consumir Groq mañana.
      marcarUrlFallida(FUENTE_ID, url, "sin_geo", "pipeline edificio→cache→web→zona sin resultado");
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
  deadline = Date.now() + MAX_RUNTIME_MS;
  hitDeadline = false;

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
  const urlsFallidas = await fetchUrlsFallidasRecientes(FUENTE_ID);
  console.log(`  ${urlsFallidas.size} URLs marcadas como fallidas recientes (skip)`);
  const procesables = urls.filter((u) => {
    if (skipUrls.has(u)) return false;
    if (urlsFallidas.has(u)) return false;
    return true;
  });
  console.log(`  ${procesables.length} tras filtrar existentes y fallidas`);
  if (procesables.length === 0) return [];

  const results = await chunkedParallel(
    procesables,
    DETAIL_CONCURRENCY,
    async (u) => {
      if (isExpired()) return null;
      const r = await scrapeDetail(u).catch((err) => {
        console.warn(`  Error en ${u}: ${(err as Error).message}`);
        return null;
      });
      await jitter();
      return r;
    },
  );

  const iaFallbacks = contadorLlamadasSemanticas();
  console.log(
    `\n┌─ Resumen Savitat: ${urls.length} URLs, ${results.length} scrapeadas` +
      (iaFallbacks > 0 ? ` — IA semántica: ${iaFallbacks} llamadas` : ""),
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

/**
 * Refresh rotativo: re-scrapea las N URLs activas más viejas por
 * `fecha_ultima_revision`. Mismo diseño que InmoPanama — evita que
 * cambios de precio/área en anuncios ya guardados queden invisibles
 * para siempre.
 *
 * Con 108 activas actuales y N=20 rotamos por todo el inventario en
 * ~5 corridas (~5 días). Devuelve Map<url, fecha_deteccion> para
 * preservar la fecha original en el upsert.
 */
const REFRESH_TARGETS = 20;
async function fetchRefreshTargets(
  supa: ReturnType<typeof createScraperClient>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data, error } = await supa
    .from("propiedades")
    .select("url_original, fecha_deteccion")
    .eq("fuente_id", FUENTE_ID)
    .eq("estado_anuncio", "activo")
    .order("fecha_ultima_revision", { ascending: true, nullsFirst: true })
    .limit(REFRESH_TARGETS);
  if (error) {
    console.warn(`  fetchRefreshTargets: ${error.message}`);
    return map;
  }
  for (const r of (data ?? []) as Array<{
    url_original: string;
    fecha_deteccion: string | null;
  }>) {
    map.set(r.url_original, r.fecha_deteccion ?? new Date().toISOString());
  }
  return map;
}

async function fetchExistingUrls(
  supa: ReturnType<typeof createScraperClient>,
): Promise<Map<string, { estado_anuncio: string }>> {
  // Trae TODAS las URLs de la fuente (activas + archivadas). Antes
  // filtraba `estado_anuncio='activo'` → propiedades archivadas por
  // verify se re-procesaban como si fueran nuevas y el upsert las
  // resucitaba (bug de auditoría scraper #7). Ahora traemos el estado
  // y stripLifecycleIfNotActive respeta la decisión de verify.
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
      console.warn(`  No se pudo leer propiedades existentes: ${error.message}`);
      return map;
    }
    const batch = (data ?? []) as Array<{ url_original: string; estado_anuncio: string }>;
    for (const r of batch) map.set(r.url_original, { estado_anuncio: r.estado_anuncio });
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return map;
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

// Ver comentario del mismo bloque en scraper-inmopanama.ts: SIGTERM
// handler para no perder scraper_runs cuando el pipeline nos mata por
// hard timeout externo.
type RunState = {
  startedAt: string;
  supa: ReturnType<typeof createScraperClient>;
  found: number;
  inserted: number;
  updated: number;
  errors: number;
  refreshUrls: Set<string>;
  writing: boolean;
  written: boolean;
};
let runState: RunState | null = null;

async function writeRunOnce(notes: string): Promise<void> {
  if (!runState || runState.written || runState.writing) return;
  runState.writing = true;
  const status =
    runState.errors > 0 && runState.inserted === 0 && runState.updated === 0
      ? "error"
      : "ok";
  try {
    const { error } = await runState.supa.from("scraper_runs").insert({
      fuente_id: FUENTE_ID,
      started_at: runState.startedAt,
      finished_at: new Date().toISOString(),
      status,
      found: runState.found,
      inserted: runState.inserted,
      updated: runState.updated,
      errors: runState.errors,
      notes,
    });
    if (error) console.warn(`  scraper_runs: ${error.message}`);
    runState.written = true;
  } catch (err) {
    console.warn(`  scraper_runs falló: ${(err as Error).message}`);
  }
}

process.on("SIGTERM", () => {
  console.warn("\n⚠ SIGTERM recibido — escribiendo scraper_runs antes de salir...");
  hitDeadline = true;
  const notes = "savitat (CBRE Panamá afiliado) — cortado por SIGTERM del pipeline";
  void writeRunOnce(notes).finally(() => process.exit(0));
});

async function runSupabaseMode() {
  const supa = createScraperClient();
  console.log("Modo Supabase: upsert por url_original.");
  runState = {
    startedAt: new Date().toISOString(),
    supa,
    found: 0,
    inserted: 0,
    updated: 0,
    errors: 0,
    refreshUrls: new Set(),
    writing: false,
    written: false,
  };

  const existingMap = await fetchExistingUrls(supa);
  const skipUrls = new Set(existingMap.keys());
  const refreshMap = await fetchRefreshTargets(supa);
  for (const u of refreshMap.keys()) {
    skipUrls.delete(u);
    runState.refreshUrls.add(u);
  }
  console.log(
    `En DB: ${existingMap.size} (se saltan ${skipUrls.size}, se refrescan ${refreshMap.size} más viejas).`,
  );
  const allNew = await scrapeAll(skipUrls);
  const nuevos = allNew.filter((a) => !refreshMap.has(a.url_original));
  const refrescados = allNew.filter((a) => refreshMap.has(a.url_original));
  console.log(
    `\nNuevos: ${nuevos.length} — Refrescados: ${refrescados.length}`,
  );
  runState.found = allNew.length;

  const rows: Array<{ a: AnuncioRaw; row: Record<string, unknown> }> = [];
  for (const a of allNew) {
    const row = toDbRow(a);
    if (!row) {
      const falta = [a.precio == null && "precio", a.lat == null && "lat", a.lng == null && "lng"].filter(Boolean).join(",");
      console.warn(`  ✗ saltado (falta: ${falta}): ${a.url_original}`);
      runState.errors++;
      continue;
    }
    // Refresh: preservar fecha_deteccion original.
    const fechaOriginal = refreshMap.get(a.url_original);
    if (fechaOriginal) row.fecha_deteccion = fechaOriginal;
    rows.push({ a, row });
  }
  await chunkedParallel(rows, UPSERT_CONCURRENCY, async ({ a, row }) => {
    const payload = stripLifecycleIfNotActive(row, existingMap.get(a.url_original));
    const { error } = await supa
      .from("propiedades")
      .upsert(payload, { onConflict: "url_original" });
    if (error) {
      console.warn(`  ✗ upsert falló (${a.url_original}): ${error.message}`);
      runState!.errors++;
    } else if (runState!.refreshUrls.has(a.url_original)) {
      runState!.updated++;
    } else {
      runState!.inserted++;
    }
    return null;
  });

  const notes = hitDeadline
    ? `savitat (CBRE Panamá afiliado) — cortado por hard timeout ${MAX_RUNTIME_MS / 60000}min`
    : `savitat (CBRE Panamá afiliado) — refresh: ${runState.updated}/${runState.refreshUrls.size} más viejas`;
  await writeRunOnce(notes);
  const okStatus =
    runState.errors > 0 && runState.inserted === 0 && runState.updated === 0
      ? "error"
      : "ok";
  console.log(
    `\nUpsert — insertados: ${runState.inserted}, actualizados: ${runState.updated}, errores: ${runState.errors}, status: ${okStatus}.`,
  );
}

async function main() {
  if (TARGET === "supabase") {
    const pf = await preflightCheck("savitat");
    if (!pf.ok) {
      console.error(`Preflight abort: ${pf.reason}`);
      process.exit(1);
    }
    await runSupabaseMode();
  } else await runJsonMode();
}

main().catch((err) => {
  console.error("Fatal scraper-savitat:", err);
  process.exit(1);
});
