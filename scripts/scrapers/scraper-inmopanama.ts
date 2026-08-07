/**
 * Scraper de inmopanama.com — agregador grande de propiedades.
 *
 * Inventario: ~9500 props en venta (476 pág × 20). Cap inicial: 50 pág
 * por listado (venta + alquiler) = ~2000 propiedades. Subible si funciona.
 *
 * Estructura:
 *   - Listing: /venta-propiedades-panama?page=N (y alquiler-...).
 *   - Detail: /{slug}_p-{ID}.htm.
 *
 * Datos del detalle (no hay JSON-LD ni microdata). Dos templates:
 *
 *   Nuevo (2026-07, activo):
 *     - Tabla de facts uniforme: <div class="nb-quick-fact-cell"><div class="nb-quick-fact-label">Precio</div><div class="nb-quick-fact-value">$225,000</div></div>
 *     - Título: <h1 class="nb-prop-title">…</h1>
 *     - Operación: <span class="nb-badge-op">En Venta|En Alquiler</span>
 *     - Zona: <div class="nb-prop-location-line">…</div>
 *     - Descripción: <div class="nb-desc-full-content">…</div> (o nb-desc-preview)
 *
 *   Viejo (pre 2026-07, fallback):
 *     - Precio: <span class="ib-prop-main-price">$X,XXX</span>
 *     - Operación: <span class="ib-prop-op-badge">En Venta|En Alquiler</span>
 *     - Título: <h2 class="ib-prop-info-card-title">…</h2>
 *     - Zona: <div class="ib-prop-info-card-location">…[svg]… ZONA — …</div>
 *     - Specs: <li><span>5 Dorm.</span></li>, <span>6 Baños</span>, <span>942 m²</span>
 *
 * NO trae lat/lng (el sitio dice "Ubicación no disponible") → 100% geocoding
 * por zona textual. Esperamos perder ~50-70% por falta de match.
 *
 * Uso:
 *   npm run scrape:inmo
 *   npm run scrape:inmo:prod
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
import {
  contadorLlamadasSemanticas,
  extraerCamposDesdeHtml,
  type CamposSemanticos,
} from "./extraer-html-ia";
import { stripLifecycleIfNotActive } from "./_lifecycle";
import { computeRunStatus } from "./_run-status";
import { geocodeConEdificio } from "./geocode-edificio";
import { preflightCheck } from "./preflight-check";
import { createScraperClient } from "./supabase-admin";
import { type TagCerrado } from "./tags-caracteristicas";
import { centroFromTable, normalizeKey } from "./zonas-panama";

loadEnv({ path: ".env.local" });
loadEnv();

const FUENTE_ID = "inmopanama";
const BASE_URL = "https://www.inmopanama.com";
const LIST_URLS: Array<{ url: string; tipo: "venta" | "alquiler" }> = [
  { url: `${BASE_URL}/venta-propiedades-panama`, tipo: "venta" },
  { url: `${BASE_URL}/alquiler-propiedades-panama`, tipo: "alquiler" },
];
const USER_AGENT =
  "MapaInteractivoInteligente/0.1 (+contacto: abilendesign@gmail.com)";

const MAX_PAGES_PER_LIST = 50;
const MAX_EMPTY_PAGES = 2;
// 2026-07-08: concurrency 3 → 5. Cada detail hace fetch + pipeline IA (Groq).
// 2026-07-23: bajado 5 → 3 tras observar cascada de 429s en Railway.
// 2026-07-24: bajado 3 → 1. Con 3 y retries generosos (5 intentos, cap 60s)
// el cron matutino seguía atascado 16h: 716 rate-limits, 403 URLs procesadas,
// sin terminar. La ventana de 6000 TPM se saturaba aún con 3 concurrentes
// porque InmoPanama tiene 1000+ detalles. Con 1 el throughput baja pero cada
// llamada respeta el rate limit y el pipeline TERMINA. Mejor lento que colgado.
const DETAIL_CONCURRENCY = 1;
const UPSERT_CONCURRENCY = 5;

// Red de seguridad wall-clock. Con concurrency 1 no debería atascarse
// (el bug de 16h fue por concurrency 3 peleando por el rate limit) pero
// esta cota garantiza que jamás una corrida vuelva a consumir el trial
// de Railway. Si la deadline expira, terminamos limpio: guardamos lo
// procesado y registramos en scraper_runs con notes="timeout".
// 40 min para scrapeAll (nuevas URLs del listado) + 8 min para el
// refresh directo (URLs viejas por fecha_ultima_revision) = 48 min
// wall-clock máximo → cabe en T_INMO=50m del pipeline. Antes era 45+0.
const MAX_RUNTIME_MS = 40 * 60 * 1000;
const REFRESH_BUDGET_MS = 8 * 60 * 1000;
let deadline = 0;
let hitDeadline = false;
function isExpired(): boolean {
  if (Date.now() > deadline) {
    if (!hitDeadline) {
      console.warn(`\n⏱ InmoPanama: alcanzado hard timeout de ${MAX_RUNTIME_MS / 60000} min — abortando limpio.`);
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
  tipoOperacion: "venta" | "alquiler";
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
const jitter = (min = 400, max = 900) =>
  sleep(min + Math.floor(Math.random() * (max - min)));

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
        if ("/venta-propiedades-panama".startsWith(value)) return false;
      }
    }
    return true;
  } catch {
    return true;
  }
}

async function fetchHtml(url: string, attempt = 1): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-PA,es;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
      },
      signal: AbortSignal.timeout(25_000),
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

let lastNominatimAt = 0;
async function nominatimQuery(q: string): Promise<{ lat: number; lng: number } | null> {
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

function categoriaFromTitle(titulo: string, url: string): CategoriaDb {
  const t = `${titulo} ${url}`.toLowerCase();
  if (/apartamento|condo|penthouse|\bph\b|duplex/.test(t)) return "apartamento";
  if (/\bcasa\b|villa|residencia|mansion/.test(t)) return "casa";
  if (/terreno|lote|finca|parcela/.test(t)) return "terreno";
  if (/local\s*comercial|comercio/.test(t)) return "local-comercial";
  if (/oficina/.test(t)) return "oficina";
  if (/galera|bodega/.test(t)) return "galera";
  return "apartamento";
}

/** Extrae el primer texto plano de una div clase X (saltando SVG anidado). */
function extractAfterClass(html: string, className: string): string | null {
  const idx = html.indexOf(`class="${className}"`);
  if (idx < 0) return null;
  // Avanza hasta el `>` que cierra la apertura de ese tag.
  const openEnd = html.indexOf(">", idx);
  if (openEnd < 0) return null;
  // Toma 800 chars y limpia SVG + tags.
  const slice = html.substring(openEnd + 1, openEnd + 1500);
  const cleaned = slice
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

// 2026-07-25: rediseño del sitio. InmoPanama migró todas las clases
// `ib-prop-*` (2024-25) a `nb-*` (nueva plantilla). Todos los selectores
// viejos fallaron simultáneamente y el cron pasó a insertar 0 propiedades
// de la fuente más grande. Nuevo diseño: los datos "duros" (precio,
// habitaciones, área, etc.) están agrupados en `nb-quick-fact-cell` con
// pares label→value uniformes. Extraemos la tabla completa y buscamos
// por label — así aunque agreguen/quiten campos el scraper sobrevive.
//
// Mantenemos los extractores viejos como fallback por si el sitio revierte
// o coexisten templates. El orden es: nuevo → viejo → null.
function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // sin acentos
    .replace(/[:.]/g, "")
    .trim();
}

/**
 * Parsea todos los `nb-quick-fact-cell` del HTML y devuelve
 * un mapa `label_normalizado → value_raw`. Ejemplos de labels:
 *   "precio", "habitaciones", "banos", "area", "mantenimiento",
 *   "ano construccion", "estacionamiento", "condicion".
 */
function parseQuickFacts(html: string): Map<string, string> {
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
 * Detalles adicionales están en `nb-prop-detail-item` con label + value.
 * Es la sección "Detalles de la Propiedad" (contiene "Tipo", "Operación",
 * "Referencia", etc.). Usamos el mismo patrón label→value.
 */
function parsePropDetails(html: string): Map<string, string> {
  const details = new Map<string, string>();
  const re =
    /<div\s+class="[^"]*nb-prop-detail-item[^"]*"[^>]*>\s*<div\s+class="nb-prop-detail-label"[^>]*>\s*([^<]+?)\s*<\/div>\s*<div\s+class="nb-prop-detail-value"[^>]*>\s*([^<]+?)\s*<\/div>/gi;
  for (const m of html.matchAll(re)) {
    const label = normalizeLabel(m[1]);
    const value = m[2].trim();
    if (label && value) details.set(label, value);
  }
  return details;
}

function extractLocationText(html: string): string | null {
  // Nuevo (2026-07): `<div class="nb-prop-location-line">TEXTO[/svg]</div>`.
  // No usamos extractAfterClass porque toma 1500 chars y come divs
  // hermanos (el location line es corto y va justo antes de las quick-facts).
  // Regex directo hasta el </div> que balancea (sin divs anidados).
  let raw: string | null = null;
  // Realmente es un <p>, no <div>: `<p class="nb-prop-location-line">…</p>`.
  // Uso regex genérico por tag para no romper si el sitio cambia el elemento.
  const nuevo = html.match(
    /<(p|div|span)\s+class="[^"]*nb-prop-location-line[^"]*"[^>]*>([\s\S]*?)<\/\1>/i,
  );
  if (nuevo) {
    raw = nuevo[2]
      .replace(/<svg[\s\S]*?<\/svg>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&aacute;/gi, "á")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  }
  // Fallback viejo: `ib-prop-info-card-location` con formato [SVG] "Zona — Subzona".
  if (!raw) raw = extractAfterClass(html, "ib-prop-info-card-location");
  if (!raw) return null;
  // Split por dashes em / en / pipe — nos quedamos con la primera parte.
  const parts = raw.split(/\s+[—–\-|]\s+/);
  return parts[0]?.trim() ?? raw;
}

function extractFeatures(
  html: string,
  qf: Map<string, string>,
): {
  habitaciones: number | null;
  banos: number | null;
  area_m2: number | null;
  estacionamientos: number | null;
} {
  // Nuevo (2026-07): sacar de la tabla parseada.
  const hFromQf = qf.get("habitaciones") ?? qf.get("recamaras") ?? qf.get("dormitorios");
  const bFromQf = qf.get("banos") ?? qf.get("bathrooms");
  const aFromQf = qf.get("area") ?? qf.get("area total") ?? qf.get("m2");
  const eFromQf = qf.get("estacionamiento") ?? qf.get("estacionamientos") ?? qf.get("parking");

  if (hFromQf || bFromQf || aFromQf || eFromQf) {
    return {
      habitaciones: toNumber(hFromQf),
      banos: toNumber(bFromQf),
      area_m2: toNumber(aFromQf?.replace(/m\s*[²2]/i, "")),
      estacionamientos: toNumber(eFromQf),
    };
  }

  // Fallback viejo: parsear el texto libre del bloque de features.
  const features = extractAfterClass(html, "ib-prop-info-card-features");
  const text = features ?? "";
  const habs = text.match(/(\d+)\s*(?:dorm|hab|recám)/i);
  const bans = text.match(/(\d+(?:[.,]\d)?)\s*ba(?:ñ|n)os?/i);
  const area = text.match(/(\d+(?:[.,]\d+)?)\s*m\s*[²2]/i);
  return {
    habitaciones: toNumber(habs?.[1]),
    banos: toNumber(bans?.[1]),
    area_m2: toNumber(area?.[1]),
    estacionamientos: null,
  };
}

/**
 * Extrae precio. Nuevo: quick-fact con label "precio". Viejo:
 * <span class="ib-prop-main-price">. Fallback final: primer "$X,XXX"
 * en JSON-LD o metadatos (raro pero cubre casos borde).
 */
function extractPrecio(html: string, qf: Map<string, string>): number | null {
  // 1. Quick-fact con label "precio" (nb-* rediseño).
  const nuevoRaw = qf.get("precio");
  if (nuevoRaw) {
    const n = toNumber(nuevoRaw);
    if (n) return n;
  }
  // 2. Directo del bloque nb-price-cell (por si el label no matcheó
  //    en parseQuickFacts pero la clase específica sí existe).
  const nbPriceCell = html.match(
    /class="[^"]*nb-price-cell[^"]*"[\s\S]{0,500}?class="nb-quick-fact-value"[^>]*>\s*\$?\s*([\d,\.]+)/i,
  )?.[1];
  const nb = toNumber(nbPriceCell ?? null);
  if (nb) return nb;
  // 3. Diseño viejo <span class="ib-prop-main-price">.
  const viejoRaw =
    html.match(/class="ib-prop-main-price"[^>]*>\s*([^<]+?)\s*</i)?.[1] ?? null;
  const viejo = toNumber(viejoRaw);
  if (viejo) return viejo;
  // 4. Fallback final: texto tipo "PRECIO DE VENTA: 3,500.00" o
  //    "PRECIO DE ALQUILER: X" en descripción libre (visto en 2026-08-01
  //    para muchos listings sin bloque estructurado).
  const textoDesc = html.match(
    /PRECIO\s+DE\s+(?:VENTA|ALQUILER)[:\s]+\$?\s*([\d,\.]+)/i,
  )?.[1];
  return toNumber(textoDesc ?? null);
}

function extractTitulo(html: string): string | null {
  // Nuevo: <h1 class="nb-prop-title">TÍTULO</h1>
  const nuevo = html.match(/<h1[^>]*class="[^"]*nb-prop-title[^"]*"[^>]*>\s*([^<]+?)\s*<\/h1>/i)?.[1];
  if (nuevo) return nuevo.trim();
  // Viejo: class="ib-prop-info-card-title"
  const viejo = extractAfterClass(html, "ib-prop-info-card-title");
  if (viejo) return viejo;
  // Última resorte: <title> del documento (quitando " | InmoPanama").
  return (
    html.match(/<title>([^<]+)<\/title>/i)?.[1]?.replace(/\s*\|.*$/, "").trim() ??
    null
  );
}

function extractOperacion(
  html: string,
  details: Map<string, string>,
): "venta" | "alquiler" | null {
  // Nuevo (2026-07): <span class="nb-badge-op">En Venta|En Alquiler</span>
  const badgeNuevo =
    html.match(/class="[^"]*nb-badge-op[^"]*"[^>]*>\s*([^<]+?)\s*</i)?.[1] ?? "";
  // Fallback: label "operacion" en detalles.
  const detalle = details.get("operacion") ?? "";
  // Fallback antiguo.
  const badgeViejo =
    html.match(/class="ib-prop-op-badge"[^>]*>\s*([^<]+?)\s*</i)?.[1] ?? "";
  const combined = `${badgeNuevo} ${detalle} ${badgeViejo}`.toLowerCase();
  if (/alquiler|rent/.test(combined)) return "alquiler";
  if (/venta|sale/.test(combined)) return "venta";
  return null;
}

function extractDescripcion(html: string): string {
  // Nuevo: nb-desc-full-content (o nb-desc-preview). Fallback viejo y meta.
  return (
    extractAfterClass(html, "nb-desc-full-content") ??
    extractAfterClass(html, "nb-desc-preview") ??
    extractAfterClass(html, "ib-prop-description") ??
    html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1] ??
    ""
  );
}

async function scrapeListPage(
  listUrl: string,
  pageNum: number,
): Promise<string[]> {
  const url = pageNum === 1 ? listUrl : `${listUrl}?page=${pageNum}`;
  const html = await fetchHtml(url);
  const urls = Array.from(
    new Set(
      Array.from(
        html.matchAll(/href="(\/[a-z0-9-]+_p-\d+\.htm)"/g),
        (m) => `${BASE_URL}${m[1]}`,
      ),
    ),
  );
  return urls;
}

async function scrapeDetail(
  url: string,
  tipoFromList: "venta" | "alquiler",
): Promise<AnuncioRaw | null> {
  console.log(`→ ${url}`);
  await jitter();

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    console.warn(`  ${(err as Error).message} — saltando`);
    return null;
  }

  // Parseo una sola vez las tablas quick-fact + detail (nuevo diseño 2026-07).
  // Se pasan a los extractores que las necesiten.
  const qf = parseQuickFacts(html);
  const details = parsePropDetails(html);

  const titulo = extractTitulo(html);
  let precio = extractPrecio(html, qf);
  const opFromHtml = extractOperacion(html, details);
  const tipoOperacion: "venta" | "alquiler" = opFromHtml ?? tipoFromList;
  let { habitaciones, banos, area_m2, estacionamientos: estacFromHtml } =
    extractFeatures(html, qf);
  const zona = extractLocationText(html);
  // Descripción solo en memoria (regla del proyecto).
  const descRaw = extractDescripcion(html);

  // Último fallback anti-cambio-de-HTML: si el precio (campo crítico que
  // decide si el listing se guarda o se descarta) vino null de los 4
  // extractores regex, le pedimos al LLM que lea el HTML directamente.
  // Los otros campos (m2/hab/banos) se piden de yapa mientras estamos
  // pagando la llamada — así también sobreviven cambios silenciosos.
  //
  // Se activa SOLO cuando precio es null. Si el listing tiene precio,
  // asumimos que el HTML entero se parseó bien y no molestamos al LLM.
  // Cap global de 100 llamadas por corrida vive en extraer-html-ia.ts.
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
      console.log(`  precio ← IA semántico: ${precio}`);
    }
    if (area_m2 == null && semant.area_m2 != null) area_m2 = semant.area_m2;
    if (habitaciones == null && semant.habitaciones != null)
      habitaciones = semant.habitaciones;
    if (banos == null && semant.banos != null) banos = semant.banos;
  }

  // inmopanama explícitamente dice "Ubicación no disponible" — nunca da
  // lat/lng en el source. Pipeline siempre: edificio → cache → web → zona.
  // allowZoneFallback:true (2026-07-30) porque el 28% de las URLs eran
  // apartamentos/oficinas/locales sin edificio identificable pero CON
  // zona conocida (Bella Vista, Calle 50, etc.) — antes se descartaban
  // silenciosos. Ahora quedan con precision="zona-declarada" y el badge
  // "Ubicación aproximada" en la card avisa al usuario.
  const geo = await geocodeConEdificio(titulo, descRaw, url, zona, {
    categoria: categoriaFromTitle(titulo ?? "", url),
    allowZoneFallback: true,
  });
  if (!geo) {
    console.log(`  geocode → sin resultado — saltando`);
    return null;
  }
  const descripcionTemp = trimDescripcion(descRaw);
  const ahora = new Date().toISOString();

  const base: AnuncioRaw = {
    titulo,
    precio,
    moneda: "USD",
    area_m2,
    habitaciones,
    banos,
    estacionamientos: estacFromHtml,
    zona,
    lat: geo.lat,
    lng: geo.lng,
    precision_ubicacion: geo.precision,
    ubicacion_fuente: geo.source,
    tipoOperacion,
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
    tipoOperacion: base.tipoOperacion,
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

  return { ...base, ...enriq };
}

/**
 * Procesa las URLs del refresh directamente (fetch → detail → IA),
 * SIN depender del listado paginado del sitio. Necesario porque las
 * URLs del refresh son "las más viejas por fecha_ultima_revision" y
 * casi siempre están en las últimas páginas del listado — el corte
 * temprano de scrapeAll ("2 páginas sin procesables → break") las
 * descarta antes de que las alcancemos.
 *
 * Bug histórico: entre 2026-08-01 y 2026-08-03 el refresh interno
 * mostraba "0/50 más viejas" corrida tras corrida por este motivo.
 *
 * tipoOperacion se pasa como "venta" por default — scrapeDetail lo
 * corrige leyendo del HTML (extractOperacion).
 */
async function scrapeRefreshDirect(
  refreshMap: Map<string, string>,
): Promise<AnuncioRaw[]> {
  const urls = [...refreshMap.keys()];
  if (urls.length === 0) return [];
  console.log(`\n▶ Refresh directo: ${urls.length} URLs (las más viejas)`);
  const results = await chunkedParallel(urls, DETAIL_CONCURRENCY, async (u) => {
    if (isExpired()) return null;
    const r = await scrapeDetail(u, "venta").catch((err) => {
      // H2: contar el error para que el ratio dispare status=error.
      console.warn(`    Error refresh ${u}: ${(err as Error).message}`);
      if (runState) runState.errors++;
      return null;
    });
    await jitter(300, 700);
    return r;
  });
  console.log(`  Refresh directo: ${results.length}/${urls.length} procesadas`);
  return results;
}

async function scrapeAll(skipUrls: Set<string>): Promise<AnuncioRaw[]> {
  deadline = Date.now() + MAX_RUNTIME_MS;
  hitDeadline = false;

  const allowed = await checkRobotsTxt();
  if (!allowed) {
    console.warn("robots.txt prohíbe — abortando.");
    return [];
  }

  const seenUrls = new Set<string>();
  const results: AnuncioRaw[] = [];

  outer: for (const { url: listUrl, tipo } of LIST_URLS) {
    if (isExpired()) break;
    console.log(`\n▶ Listado: ${listUrl}`);
    let consecutiveEmpty = 0;
    for (let n = 1; n <= MAX_PAGES_PER_LIST; n++) {
      if (isExpired()) break outer;
      console.log(`  pág ${n}`);
      let urls: string[];
      try {
        urls = await scrapeListPage(listUrl, n);
      } catch (err) {
        console.warn(`    ${(err as Error).message} — corto.`);
        break;
      }
      const nuevos = urls.filter((u) => !seenUrls.has(u));
      nuevos.forEach((u) => seenUrls.add(u));

      const procesables = nuevos.filter((u) => !skipUrls.has(u));
      const yaEnDb = nuevos.length - procesables.length;
      console.log(
        `    ${urls.length} en la página, ${nuevos.length} nuevos p/run, ${procesables.length} nuevos p/DB (${yaEnDb} ya guardados)`,
      );

      // 2026-07-28: fix bug de raíz — el corte temprano se disparaba solo
      // cuando la página no traía URLs nuevas p/run. Pero con 2500+ URLs
      // en skipUrls (DB), las últimas 30-40 páginas siempre traían URLs
      // "nuevas p/run" pero TODAS ya en DB → nunca cortaba, procesaba las
      // 50 páginas siempre, ~50min innecesarios por corrida.
      //
      // Ahora cortamos cuando `procesables.length === 0` (no hay nada
      // nuevo que insertar). Como InmoPanama lista recientes primero,
      // ver N páginas sin ninguna nueva significa que ya barrimos todo
      // el material nuevo del día.
      if (procesables.length === 0) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= MAX_EMPTY_PAGES) {
          console.log(`    ${MAX_EMPTY_PAGES} págs sin nuevas p/DB — corto.`);
          break;
        }
        continue;
      }
      consecutiveEmpty = 0;

      const batch = await chunkedParallel(procesables, DETAIL_CONCURRENCY, (u) =>
        scrapeDetail(u, tipo).catch((err) => {
          // H2: contar el error para que el ratio dispare status=error.
          console.warn(`    Error en ${u}: ${(err as Error).message}`);
          if (runState) runState.errors++;
          return null;
        }),
      );
      results.push(...batch);
      // Actualizar contadores en tiempo real para que el SIGTERM handler
      // capture progreso aunque nos maten a mitad de camino. Antes
      // `runState.found = allNew.length` corría SOLO al terminar
      // scrapeAll; si el pipeline mataba antes, quedaba en 0.
      if (runState) runState.found = results.length;
      if (isExpired()) break outer;
      await jitter(300, 700);
    }
  }
  const iaFallbacks = contadorLlamadasSemanticas();
  console.log(
    `\n┌─ Resumen InmoPanama: ${seenUrls.size} URLs únicas, ${results.length} scrapeadas${hitDeadline ? " (cortado por timeout)" : ""}` +
      (iaFallbacks > 0 ? ` — IA semántica: ${iaFallbacks} llamadas` : ""),
  );
  return results;
}

function toDbRow(a: AnuncioRaw): Record<string, unknown> | null {
  if (a.precio == null || a.lat == null || a.lng == null) return null;
  return {
    titulo: a.titulo ?? "(sin título)",
    tipo_operacion: a.tipoOperacion,
    categoria: categoriaFromTitle(a.titulo ?? "", a.url_original),
    estado_anuncio: "activo",
    estado_datos: "completo_verificado",
    veces_no_encontrado: 0,
    fecha_ultima_vista: a.fecha_actualizacion,
    fecha_ultima_revision: a.fecha_actualizacion,
    motivo_estado: "visto en scrape inmopanama",
    lat: a.lat,
    lng: a.lng,
    precision_ubicacion: a.precision_ubicacion,
    ubicacion_fuente: a.ubicacion_fuente,
    corregimiento: a.zona ? normalizeKey(a.zona) : null,
    area_m2: a.area_m2,
    habitaciones: a.habitaciones,
    banos: a.banos,
    estacionamientos: a.estacionamientos,
    precio: a.precio,
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

/**
 * Refresh rotativo: agarra las N URLs activas de InmoPanama con la
 * `fecha_ultima_revision` más antigua para re-scrapearlas.
 *
 * Motivo: el scraper filtra URLs ya en DB para no re-procesar 2500+
 * cada corrida (rate limit Groq). Consecuencia: cambios de precio/área
 * en anuncios ya guardados NUNCA se reflejan.
 *
 * Estrategia: cada corrida re-visita las N más viejas. Con 483 activas
 * y N=50, rotamos por todo el inventario en ~10 corridas (~10 días).
 * Cada refresh es una URL más al processing, +~3-5min al total del cron.
 *
 * Devuelve Map<url, fecha_deteccion_original> para que al upsertar
 * NO sobreescribamos la fecha original con hoy.
 */
const REFRESH_TARGETS = 50;
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
  // Saltamos TODAS las URLs ya en DB (activas + archivadas).
  //
  // Fix 2026-07-15: el diseño anterior re-procesaba archivadas viejas
  // (>7 días) para "poder revivirlas si el edificio vuelve a listar",
  // pero con 1418 archivadas cumpliendo ese criterio, cada corrida
  // llamaba al pipeline IA (Groq rate-limited) 1418 veces → InmoPanama
  // consumía 3h+ y quedaba cancelado por timeout del workflow.
  //
  // La reactivación de archivadas ya está cubierta por otros mecanismos:
  //  1. Si InmoPanama re-publica una URL archivada, aparece en el
  //     listado. Aquí la saltamos, pero el pase de VERIFY la revive
  //     porque su HTML sigue viva (elimina el bug de "muerta legítima").
  //  2. Manual: script separado para re-intentar archivadas específicas
  //     si se agregan al cache de edificios.
  //
  // Perdemos: la reactivación automática vía scraper. Ganamos: corrida
  // de InmoPanama estable en <60 min.
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
      // creyeran nuevas → gasto Groq y potencial resurrección de
      // archivadas. Abortamos ruidoso.
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
  const outPath = join(process.cwd(), "public", "scrape-preview-inmo.json");
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

// Estado compartido entre runSupabaseMode y el SIGTERM handler. Sirve
// para que — si el pipeline nos mata con SIGTERM antes de terminar —
// igual escribamos scraper_runs con lo procesado hasta ese momento.
// Sin esto, un timeout externo nos deja sin observability (no aparece
// la fila del run en scraper_runs y no sabemos qué pasó).
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
  const status = computeRunStatus({
    ok: runState.inserted + runState.updated,
    errors: runState.errors,
  });
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

// Al recibir SIGTERM del pipeline (`timeout` de bash envía SIGTERM
// primero y espera --kill-after=30s antes de SIGKILL), aprovechamos
// esos 30s para escribir scraper_runs con lo que llevamos.
process.on("SIGTERM", () => {
  console.warn("\n⚠ SIGTERM recibido — escribiendo scraper_runs antes de salir...");
  hitDeadline = true;
  const progreso = runState
    ? ` (progreso: found=${runState.found} ins=${runState.inserted} upd=${runState.updated} err=${runState.errors})`
    : "";
  const notes = `inmopanama (agregador) — cortado por SIGTERM del pipeline${progreso}`;
  // Fire-and-forget: el `timeout --kill-after=30s` nos deja tiempo real
  // para completar el insert (Supabase es <1s típicamente).
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
  // Registrar las URLs del refresh en el runState para clasificarlas
  // como "updated" cuando entren al upsert. NO las sacamos del skipSet
  // porque scrapeAll no las alcanzaría igual (están en páginas finales
  // del listado y el corte temprano dispara antes). Las procesamos por
  // separado con scrapeRefreshDirect.
  for (const u of refreshMap.keys()) runState.refreshUrls.add(u);
  console.log(
    `En DB: ${existingMap.size} activas totales — se refrescan ${refreshMap.size} más viejas por separado.`,
  );
  // Pase 1: scrapear URLs nuevas del listado (con corte temprano).
  const nuevosScrape = await scrapeAll(skipUrls);
  // Pase 2: refresh directo de las N más viejas (sin corte temprano).
  const refrescados = await scrapeRefreshDirect(refreshMap);
  const allNew = [...nuevosScrape, ...refrescados];
  console.log(
    `\nNuevos: ${nuevosScrape.length} — Refrescados: ${refrescados.length}`,
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
    // Refresh: preservar fecha_deteccion original — solo cambia
    // fecha_actualizacion / fecha_ultima_vista / fecha_ultima_revision.
    const fechaOriginal = refreshMap.get(a.url_original);
    if (fechaOriginal) row.fecha_deteccion = fechaOriginal;
    rows.push({ a, row });
  }
  await chunkedParallel(rows, UPSERT_CONCURRENCY, async ({ a, row }) => {
    // No pisar lifecycle si la fila ya está archivada / marcada como
    // problemática por verify. Ver `_lifecycle.ts` (CRITICAL C2).
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
    ? `inmopanama (agregador) — cortado por hard timeout ${MAX_RUNTIME_MS / 60000}min`
    : `inmopanama (agregador) — refresh: ${runState.updated}/${runState.refreshUrls.size} más viejas`;
  await writeRunOnce(notes);
  const okStatus = computeRunStatus({
    ok: runState.inserted + runState.updated,
    errors: runState.errors,
  });
  console.log(
    `\nUpsert — insertados: ${runState.inserted}, actualizados: ${runState.updated}, errores: ${runState.errors}, status: ${okStatus}.`,
  );
}

async function main() {
  if (TARGET === "supabase") {
    const pf = await preflightCheck("inmopanama");
    if (!pf.ok) {
      console.error(`Preflight abort: ${pf.reason}`);
      process.exit(1);
    }
    await runSupabaseMode();
  } else await runJsonMode();
}

main().catch((err) => {
  console.error("Fatal scraper-inmopanama:", err);
  process.exit(1);
});
