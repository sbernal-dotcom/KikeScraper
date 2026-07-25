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
 * Datos del detalle (no hay JSON-LD ni microdata):
 *   - Precio: <span class="ib-prop-main-price">$X,XXX</span>
 *   - Operación: <span class="ib-prop-op-badge">En Venta|En Alquiler</span>
 *   - Título: <h2 class="ib-prop-info-card-title">…</h2>
 *   - Zona (texto): <div class="ib-prop-info-card-location">…[svg]… ZONA — …</div>
 *   - Specs: <li><span>5 Dorm.</span></li>, <span>6 Baños</span>, <span>942 m²</span>
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
import { geocodeConEdificio } from "./geocode-edificio";
import { preflightCheck } from "./preflight-check";
import { createScraperClient } from "./supabase-admin";
import { type TagCerrado } from "./tags-caracteristicas";
import { centroFromTable } from "./zonas-panama";

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
const MAX_RUNTIME_MS = 90 * 60 * 1000; // 90 min
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

function extractLocationText(html: string): string | null {
  // El ib-prop-info-card-location tiene formato:
  //   [SVG icon] "Zona Texto — Subzona ..."
  // Tomamos antes de "—" / "-" / "|" si existe, esa suele ser la zona principal.
  const raw = extractAfterClass(html, "ib-prop-info-card-location");
  if (!raw) return null;
  // Split por dashes em / en / pipe
  const parts = raw.split(/\s+[—–\-|]\s+/);
  return parts[0]?.trim() ?? raw;
}

function extractFeatures(html: string): {
  habitaciones: number | null;
  banos: number | null;
  area_m2: number | null;
} {
  const features = extractAfterClass(html, "ib-prop-info-card-features");
  const text = features ?? "";
  // Patrones:
  //   "5 Dorm." / "5 Dormitorios" / "5 Hab."
  //   "6 Baños" / "6 Bath"
  //   "942 m²"
  const habs = text.match(/(\d+)\s*(?:dorm|hab|recám)/i);
  const bans = text.match(/(\d+(?:[.,]\d)?)\s*ba(?:ñ|n)os?/i);
  const area = text.match(/(\d+(?:[.,]\d+)?)\s*m\s*[²2]/i);
  return {
    habitaciones: toNumber(habs?.[1]),
    banos: toNumber(bans?.[1]),
    area_m2: toNumber(area?.[1]),
  };
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

  // Título
  const titulo =
    extractAfterClass(html, "ib-prop-info-card-title") ??
    (html.match(/<title>([^<]+)<\/title>/i)?.[1]?.replace(/\s*\|.*$/, "").trim() ??
      null);

  // Precio
  const precioRaw =
    html.match(/class="ib-prop-main-price"[^>]*>\s*([^<]+?)\s*</i)?.[1] ?? null;
  const precio = toNumber(precioRaw);

  // Operación — verificar contra lo que vino del listing
  const opBadge =
    html.match(/class="ib-prop-op-badge"[^>]*>\s*([^<]+?)\s*</i)?.[1] ?? "";
  const tipoOperacion: "venta" | "alquiler" = /alquiler|rent/i.test(opBadge)
    ? "alquiler"
    : /venta|sale/i.test(opBadge)
      ? "venta"
      : tipoFromList;

  // Specs
  const { habitaciones, banos, area_m2 } = extractFeatures(html);

  // Zona (texto)
  const zona = extractLocationText(html);

  // Descripción solo en memoria (regla del proyecto).
  const descRaw =
    extractAfterClass(html, "ib-prop-description") ??
    html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1] ??
    "";

  // inmopanama explícitamente dice "Ubicación no disponible" — nunca da
  // lat/lng en el source. Pipeline siempre: edificio → cache → web → zona.
  // Pasamos la categoría: terrenos/casas activan zona-fallback automático.
  const geo = await geocodeConEdificio(titulo, descRaw, url, zona, {
    categoria: categoriaFromTitle(titulo ?? "", url),
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
    estacionamientos: null,
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
      console.log(`    ${urls.length} en la página, ${nuevos.length} nuevos`);
      if (nuevos.length === 0) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= MAX_EMPTY_PAGES) {
          console.log(`    ${MAX_EMPTY_PAGES} págs vacías — corto.`);
          break;
        }
        continue;
      }
      consecutiveEmpty = 0;
      nuevos.forEach((u) => seenUrls.add(u));

      const procesables = nuevos.filter((u) => {
        if (skipUrls.has(u)) {
          console.log(`    (skip ya en DB) ${u}`);
          return false;
        }
        return true;
      });
      const batch = await chunkedParallel(procesables, DETAIL_CONCURRENCY, (u) =>
        scrapeDetail(u, tipo).catch((err) => {
          console.warn(`    Error en ${u}: ${(err as Error).message}`);
          return null;
        }),
      );
      results.push(...batch);
      if (isExpired()) break outer;
      await jitter(300, 700);
    }
  }
  console.log(
    `\n┌─ Resumen InmoPanama: ${seenUrls.size} URLs únicas, ${results.length} scrapeadas${hitDeadline ? " (cortado por timeout)" : ""}`,
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
    corregimiento: a.zona,
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

async function fetchExistingUrls(
  supa: ReturnType<typeof createScraperClient>,
): Promise<Set<string>> {
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
  const all: string[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supa
      .from("propiedades")
      .select("url_original")
      .eq("fuente_id", FUENTE_ID)
      .range(from, from + PAGE - 1);
    if (error) {
      console.warn(`  No se pudo leer propiedades existentes: ${error.message}`);
      return new Set(all);
    }
    const batch = (data ?? []) as Array<{ url_original: string }>;
    for (const r of batch) all.push(r.url_original);
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
      {
        const falta = [a.precio == null && "precio", a.lat == null && "lat", a.lng == null && "lng"].filter(Boolean).join(",");
        console.warn(`  ✗ saltado (falta: ${falta}): ${a.url_original}`);
      }
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
  const notes = hitDeadline
    ? `inmopanama (agregador) — cortado por hard timeout ${MAX_RUNTIME_MS / 60000}min`
    : "inmopanama (agregador)";
  const { error: runErr } = await supa.from("scraper_runs").insert({
    fuente_id: FUENTE_ID,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status,
    found: allNew.length,
    inserted,
    updated: 0,
    errors,
    notes,
  });
  if (runErr) console.warn(`  scraper_runs: ${runErr.message}`);
  console.log(
    `\nUpsert — insertados: ${inserted}, errores: ${errors}, status: ${status}.`,
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
