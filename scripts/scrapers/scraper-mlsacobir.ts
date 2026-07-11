/**
 * Scraper del MLS de ACOBIR (mlsacobir.com).
 *
 * Sistema: Realtyna WPL (plugin WordPress de bienes raíces).
 * Datos: Schema.org microdata (itemprop="price/name/floorSize/...").
 * ~1300 propiedades en 26 páginas (?wplpage=N), 51 por página.
 *
 * Cubre TODO Panamá (Chiriquí, Los Santos, Veraguas, etc.) — el inventario
 * más amplio que tenemos. Complementa encuentra24 (mostly Ciudad de Panamá).
 *
 * - fetch() puro, sin Playwright (HTML server-side rendered).
 * - Coords: geocodificar por addressLocality (no vienen en el HTML).
 * - jitter 400-900ms, concurrencia 3, upsert paralelo 5.
 *
 * Uso:
 *   npm run scrape:mls
 *   npm run scrape:mls:prod
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
import { validarConMapbox } from "./mapbox-validate";
import { createScraperClient } from "./supabase-admin";
import { type TagCerrado } from "./tags-caracteristicas";
import { centroFromTable } from "./zonas-panama";

loadEnv({ path: ".env.local" });
loadEnv();

const FUENTE_ID = "mlsacobir";
const BASE_URL = "https://www.mlsacobir.com";
// 2026-07-07: el sitio movió el listado principal de /propiedades/ a
// /propiedades-en-panama/. La URL vieja ahora es un hub sin URLs
// individuales — solo apuntadores a subcategorías por zona/tipo.
// La nueva URL sirve las mismas ~1300 props paginadas con ?wplpage=N,
// aunque ahora devuelve 6 por página en vez de 51.
const LIST_URL = `${BASE_URL}/propiedades-en-panama/`;
const USER_AGENT =
  "MapaInteractivoInteligente/0.1 (+contacto: abilendesign@gmail.com)";

// El sitio devuelve 6 URLs por página. Con MAX_PAGES=100 cubrimos
// hasta 600 nuevas por corrida — muy por encima de la novedad típica
// (~70 nuevas/día tras el fix del listado). MAX_EMPTY_PAGES=3 corta
// antes cuando skipUrls tumba varias páginas seguidas.
// 2026-07-08: bajado de 250 → 100 para acotar corridas grandes.
const MAX_PAGES = 100;
const MAX_EMPTY_PAGES = 3;
const DETAIL_CONCURRENCY = 3;
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
const jitter = (min = 400, max = 900) =>
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
  // Strip entities HTML primero (`&sup2;` contiene un "2" que envenenaría
  // el parsing: "153 m&sup2;" → "1532" en vez de 153). Aplica al ²/³/etc.
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
  // NOTA: el sitio usa convención US (punto = decimal). "67.502 m²" = 67.5 m².
  // NO aplicar la heurística europea que tienen otros scrapers — confirmado
  // contra el sitio que apartamentos típicos son 60-150 m².
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
        if ("/propiedades/".startsWith(value)) return false;
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

/**
 * Categoría desde el slug de URL.
 * Patrón: /propiedades/{ID}-{categoria}-{operacion}-{slug}-mls{MLS_ID}/
 * Ej: 18419-terreno-venta-el-cangrejo-calle-arturo-d-motta-panama-mls25195
 */
function categoriaFromSlug(slug: string): CategoriaDb {
  const t = slug.toLowerCase();
  if (/^\d+-apartamento-/.test(t)) return "apartamento";
  if (/^\d+-casa-/.test(t)) return "casa";
  if (/^\d+-terreno-/.test(t)) return "terreno";
  if (/^\d+-local-comercial-|^\d+-comercial-/.test(t)) return "local-comercial";
  if (/^\d+-oficina-/.test(t)) return "oficina";
  if (/^\d+-galera-|^\d+-bodega-/.test(t)) return "galera";
  return "apartamento";
}

function tipoOperacionFromSlug(slug: string): "venta" | "alquiler" {
  // Patrones: "apartamento-alquiler-..." vs "apartamento-venta-..." vs
  // "apartamento-alquiler-y-venta-..." → si dice "alquiler-y-venta",
  // preferimos "venta" (más útil para benchmarks).
  if (/-alquiler-y-venta-/.test(slug)) return "venta";
  if (/-alquiler-/.test(slug)) return "alquiler";
  return "venta";
}

/**
 * Microdata extractor. Busca <ELEMENT itemprop="X" ...>VALUE</ELEMENT>.
 * Si el ELEMENT es <meta>, usa el atributo content.
 * Si tiene `content="$X"` o `content="X"`, lo prefiere sobre el texto inner.
 */
function readItemprop(html: string, prop: string): string | null {
  // 1) <meta itemprop="X" content="Y">
  const meta = html.match(
    new RegExp(`<meta[^>]*itemprop=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i"),
  );
  if (meta) return meta[1].trim();
  // 2) <ELEMENT itemprop="X" ... content="Y">...
  const withContent = html.match(
    new RegExp(`<[^>]*itemprop=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i"),
  );
  if (withContent) return withContent[1].trim();
  // 3) <ELEMENT itemprop="X" ...>INNER</ELEMENT>
  const inner = html.match(
    new RegExp(`<[^>]*itemprop=["']${prop}["'][^>]*>\\s*([^<]+?)\\s*<`, "i"),
  );
  return inner ? inner[1].trim() : null;
}

/**
 * Lee el `value` anidado dentro de un bloque QuantitativeValue identificado
 * por una clase CSS (bedroom, bathroom).
 *
 * El bloque tiene SVG inline anidado con su propio `</...>` — no podemos
 * delimitar por el cierre del wrapper. Buscamos `class="X"` y al siguiente
 * `itemprop="value"` con un lazy match `[\s\S]*?` (cruza el SVG).
 */
function readQuantitativeByClass(html: string, className: string): string | null {
  const re = new RegExp(
    `class=["'][^"']*${className}[^"']*["'][\\s\\S]*?itemprop=["']value["'][^>]*>\\s*([^<]+?)\\s*<`,
    "i",
  );
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

function readFloorSize(html: string): string | null {
  const re = /itemprop=["']floorSize["'][\s\S]*?itemprop=["']value["'][^>]*>\s*([^<]+?)\s*</i;
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

function readOg(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta\\s+property=["']og:${prop}["']\\s+content=["']([^"']*)["']`,
    "i",
  );
  const m = html.match(re);
  if (!m) return null;
  return m[1]
    .replace(/&aacute;/g, "á")
    .replace(/&eacute;/g, "é")
    .replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó")
    .replace(/&uacute;/g, "ú")
    .replace(/&ntilde;/g, "ñ")
    .replace(/&amp;/g, "&")
    .trim();
}

async function scrapeListPage(pageNum: number): Promise<string[]> {
  const url =
    pageNum === 1 ? LIST_URL : `${LIST_URL}?wplpage=${pageNum}`;
  const html = await fetchHtml(url);
  const urls = Array.from(
    new Set(
      Array.from(
        html.matchAll(
          /https:\/\/www\.mlsacobir\.com\/propiedades\/(\d+-[a-z0-9-]+)\//g,
        ),
        (m) => `${BASE_URL}/propiedades/${m[1]}/`,
      ),
    ),
  );
  return urls;
}

async function scrapeDetail(url: string): Promise<AnuncioRaw | null> {
  console.log(`→ ${url}`);
  await jitter();

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    console.warn(`  ${(err as Error).message} — saltando`);
    return null;
  }

  // Slug para deducir categoría/operación
  const slugMatch = url.match(/\/propiedades\/([^/]+)/);
  const slug = slugMatch?.[1] ?? "";

  const titulo = readItemprop(html, "name") ?? readOg(html, "title") ?? null;
  const precio = toNumber(readItemprop(html, "price"));
  // mlsacobir usa $ → asumimos USD por default (lo más común en Panamá).
  // Si en el futuro aparece "B/." en algún listing → cambiar a heurística.
  const moneda: "USD" | "PAB" = "USD";

  const habitaciones = toNumber(readQuantitativeByClass(html, "bedroom"));
  const banos = toNumber(readQuantitativeByClass(html, "bathroom"));
  const area_m2 = toNumber(readFloorSize(html));

  // Zona: addressLocality es la mejor pista. A veces viene vacía → fallback
  // a parsing del keywords meta o título.
  let zona = readItemprop(html, "addressLocality");
  if (!zona || zona.length < 3) {
    // Keywords: "Comodo apartamento... , CALLE PUNTA COLON, PUNTA PACIFICA, Panamá, 25228"
    const kw = html.match(/<meta\s+name="keywords"\s+content="([^"]+)"/i);
    if (kw) {
      const parts = kw[1].split(",").map((s) => s.trim());
      // Penúltimo o antepenúltimo suelen ser zona/ciudad. Tomamos el primero
      // que matchee la tabla de zonas-panama.
      for (const p of parts) {
        if (centroFromTable(p)) {
          zona = p;
          break;
        }
      }
    }
  }

  // mlsacobir no publica lat/lng en el source → pipeline siempre.
  // Pipeline edificio→cache→web→zona. Si nada, descarta.
  const descRaw = readOg(html, "description") ?? "";
  // Pasamos la categoría: terrenos/casas activan zona-fallback automático.
  const slugForCategoria = url.match(/\/propiedades\/([^/]+)/)?.[1] ?? "";
  const geo = await geocodeConEdificio(titulo, descRaw, url, zona, {
    categoria: categoriaFromSlug(slugForCategoria),
  });
  if (!geo) {
    console.log(`  geocode → sin resultado — saltando`);
    return null;
  }
  if (zona) await validarConMapbox(zona, { lat: geo.lat, lng: geo.lng });

  const descripcionTemp = trimDescripcion(descRaw);
  const tipoOperacion = tipoOperacionFromSlug(slug);
  const ahora = new Date().toISOString();
  const base: AnuncioRaw = {
    titulo,
    precio,
    moneda,
    area_m2,
    habitaciones,
    banos,
    estacionamientos: null,
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
    tipoOperacion,
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
  const allowed = await checkRobotsTxt();
  if (!allowed) {
    console.warn("robots.txt prohíbe /propiedades/ — abortando.");
    return [];
  }

  const seenUrls = new Set<string>();
  const results: AnuncioRaw[] = [];
  let consecutiveEmpty = 0;

  for (let n = 1; n <= MAX_PAGES; n++) {
    console.log(`\n▶ Listado pág ${n}`);
    let urls: string[];
    try {
      urls = await scrapeListPage(n);
    } catch (err) {
      console.warn(`  ${(err as Error).message} — corto.`);
      break;
    }
    const nuevos = urls.filter((u) => !seenUrls.has(u));
    console.log(`  ${urls.length} en la página, ${nuevos.length} nuevos`);
    if (nuevos.length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= MAX_EMPTY_PAGES) {
        console.log(`  ${MAX_EMPTY_PAGES} págs vacías — corto.`);
        break;
      }
      continue;
    }
    consecutiveEmpty = 0;
    nuevos.forEach((u) => seenUrls.add(u));

    const procesables = nuevos.filter((u) => {
      if (skipUrls.has(u)) {
        console.log(`  (skip ya en DB) ${u}`);
        return false;
      }
      return true;
    });
    const batch = await chunkedParallel(
      procesables,
      DETAIL_CONCURRENCY,
      (u) =>
        scrapeDetail(u).catch((err) => {
          console.warn(`  Error en ${u}: ${(err as Error).message}`);
          return null;
        }),
    );
    results.push(...batch);
    await jitter(300, 700);
  }
  console.log(
    `\n┌─ Resumen MLS Acobir: ${seenUrls.size} URLs únicas, ${results.length} scrapeadas`,
  );
  return results;
}

function toDbRow(a: AnuncioRaw): Record<string, unknown> | null {
  if (a.precio == null || a.lat == null || a.lng == null) return null;
  const slug = a.url_original.match(/\/propiedades\/([^/]+)/)?.[1] ?? "";
  return {
    titulo: a.titulo ?? "(sin título)",
    tipo_operacion: tipoOperacionFromSlug(slug),
    categoria: categoriaFromSlug(slug),
    estado_anuncio: "activo",
    estado_datos: "completo_verificado",
    veces_no_encontrado: 0,
    fecha_ultima_vista: a.fecha_actualizacion,
    fecha_ultima_revision: a.fecha_actualizacion,
    motivo_estado: "visto en scrape mlsacobir",
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
  // Solo URLs activas. Archivadas se re-procesan para poder revivirlas.
  // Paginado por cap de 1000.
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
  const outPath = join(process.cwd(), "public", "scrape-preview-mls.json");
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
    notes: "mlsacobir (gremial MLS)",
  });
  if (runErr) console.warn(`  scraper_runs: ${runErr.message}`);
  console.log(
    `\nUpsert — insertados: ${inserted}, errores: ${errors}, status: ${status}.`,
  );
}

async function main() {
  if (TARGET === "supabase") {
    const pf = await preflightCheck("mlsacobir");
    if (!pf.ok) {
      console.error(`Preflight abort: ${pf.reason}`);
      process.exit(1);
    }
    await runSupabaseMode();
  } else await runJsonMode();
}

main().catch((err) => {
  console.error("Fatal scraper-mlsacobir:", err);
  process.exit(1);
});
