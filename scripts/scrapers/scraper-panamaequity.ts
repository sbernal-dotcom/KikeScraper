/**
 * Scraper de panamaequity.com — bróker boutique de Panamá.
 *
 * Por qué esta fuente:
 *   - JSON-LD `RealEstateListing` con TODO (precio, lat/lng exactos, m²,
 *     recámaras, baños, año, dirección). No necesita parseo de HTML ni
 *     geocoding manual.
 *   - robots.txt permite los listados `/es/property-type/*`.
 *   - Sin Cloudflare WAF — curl directo funciona.
 *   - Inventario ~200 propiedades de gama media-alta, complementa
 *     encuentra24 con datos de alta calidad.
 *
 * Uso:
 *   npm run scrape:pe        # modo dry → public/scrape-preview-pe.json
 *   npm run scrape:pe:prod   # modo Supabase → upsert + scraper_runs
 *
 * Independiente del scraper principal: si falla, no rompe scrape:prod.
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
import { isOnLand } from "../../src/lib/geo/panama-land";
import { stripLifecycleIfNotActive } from "./_lifecycle";
import { computeRunStatus } from "./_run-status";
import { geocodeConEdificio } from "./geocode-edificio";
import { normalizeKey } from "./zonas-panama";
import { preflightCheck } from "./preflight-check";
import { createScraperClient } from "./supabase-admin";
import { type TagCerrado } from "./tags-caracteristicas";

loadEnv({ path: ".env.local" });
loadEnv();

const FUENTE_ID = "panamaequity";
const BASE_URL = "https://www.panamaequity.com";
const LIST_URL = `${BASE_URL}/es/listings/`;
const USER_AGENT =
  "MapaInteractivoInteligente/0.1 (+contacto: abilendesign@gmail.com)";

const MAX_PAGES = 25;
const MAX_EMPTY_PAGES = 2;
// Concurrencia para detail-fetch. 3 simultáneos es seguro:
// - el server responde sub-segundo y no ha mostrado rate-limit
// - Gemini free tier acepta ~15 req/min; con jitter 800-1500ms × 3 ≈ 10/min
const DETAIL_CONCURRENCY = 3;
// Upserts a Supabase también en paralelo. 5 es seguro para PostgREST.
const UPSERT_CONCURRENCY = 5;

const TARGET: "json" | "supabase" = process.argv.includes("--supabase")
  ? "supabase"
  : "json";

type LdRealEstate = {
  "@type"?: string;
  name?: string;
  description?: string;
  url?: string;
  address?: {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
  };
  geo?: { latitude?: string | number; longitude?: string | number };
  offers?: {
    price?: string | number;
    priceCurrency?: string;
    availability?: string;
  };
  additionalProperty?: Array<{
    "@type"?: string;
    name?: string;
    value?: string | number;
    unitText?: string;
  }>;
};

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
const jitter = (min = 800, max = 1500) =>
  sleep(min + Math.floor(Math.random() * (max - min)));

/**
 * Procesa items[] en chunks de tamaño `concurrency`. Items dentro del chunk
 * corren en paralelo (Promise.all), pero hay una barrera entre chunks para
 * no acumular requests si uno cuelga. Devuelve los resultados no-null en
 * orden de finalización.
 */
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
  // Preserva signo negativo SOLO si aparece al inicio (coords pueden ser -79.x).
  const raw = String(text).trim();
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
        if ("/es/listings/".startsWith(value)) return false;
      }
    }
    return true;
  } catch {
    return true;
  }
}

function categoriaFromTitleOrUrl(s: string): CategoriaDb {
  const t = s.toLowerCase();
  if (/apartamento|condominio|condo|penthouse|ph\b/.test(t)) return "apartamento";
  if (/\bcasa\b|villa|residencia/.test(t)) return "casa";
  if (/terreno|lote|finca|parcela/.test(t)) return "terreno";
  if (/local\s*comercial|comercio/.test(t)) return "local-comercial";
  if (/oficina/.test(t)) return "oficina";
  if (/galera|bodega/.test(t)) return "galera";
  return "apartamento";
}

function tipoOperacionFromTitleOrUrl(s: string): "venta" | "alquiler" {
  const t = s.toLowerCase();
  if (/alquiler|renta|rent\b|for\s*rent/.test(t)) return "alquiler";
  return "venta";
}

function normalizeMoneda(c: string | undefined): "USD" | "PAB" | null {
  if (!c) return null;
  const v = c.toUpperCase().trim();
  if (v === "USD" || v === "USD$" || v === "$" || v === "US$") return "USD";
  if (v === "PAB" || v === "B/.") return "PAB";
  return null;
}

/** Lee additionalProperty[].value buscando por name (case-insensitive). */
function readAdditional(
  arr: LdRealEstate["additionalProperty"],
  ...names: string[]
): string | null {
  if (!arr) return null;
  const lower = names.map((n) => n.toLowerCase());
  for (const p of arr) {
    if (p?.name && lower.includes(p.name.toLowerCase())) {
      const v = p.value;
      if (v != null && String(v).trim()) return String(v);
    }
  }
  return null;
}

/**
 * panamaequity detecta Playwright/headless Chromium y le hace tarpit (cuelga
 * la respuesta indefinidamente). Curl directo funciona perfecto. Como el
 * JSON-LD viene en HTML server-side renderizado, no necesitamos browser:
 * `fetch()` simple es más rápido y no se bloquea.
 */
async function fetchHtml(url: string, attempt = 1): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-PA,es;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return res.text();
  } catch (err) {
    // 1 retry con back-off para timeouts puntuales del server.
    if (attempt < 2) {
      console.warn(`  retry ${attempt}/1 en ${url}: ${(err as Error).message}`);
      await sleep(4000);
      return fetchHtml(url, attempt + 1);
    }
    throw err;
  }
}

function extractJsonLd(html: string): LdRealEstate[] {
  const out: LdRealEstate[] = [];
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
  const url = pageNum === 1 ? LIST_URL : `${LIST_URL}page/${pageNum}/`;
  const html = await fetchHtml(url);
  const urls = Array.from(
    new Set(
      Array.from(
        html.matchAll(/href="(https:\/\/www\.panamaequity\.com\/es\/listings\/[a-z0-9-]+\/?)"/g),
        (m) => m[1],
      ),
    ),
  );
  return urls;
}

async function scrapeDetail(url: string): Promise<AnuncioRaw | null> {
  console.log(`→ ${url}`);
  // Jitter de cortesía. Reducido de (1500, 3000) tras confirmar que el
  // server no rate-limita con esta cadencia.
  await jitter(400, 900);

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    console.warn(`  ${(err as Error).message} — saltando`);
    return null;
  }
  const candidates = extractJsonLd(html);
  const listing = candidates.find(
    (c) => c?.["@type"] === "RealEstateListing",
  );
  if (!listing) {
    console.warn("  Sin JSON-LD RealEstateListing — saltando");
    return null;
  }

  const titulo = listing.name?.trim() ?? null;
  const precio = toNumber(listing.offers?.price ?? null);
  const moneda = normalizeMoneda(listing.offers?.priceCurrency);
  const lat = toNumber(listing.geo?.latitude ?? null);
  const lng = toNumber(listing.geo?.longitude ?? null);
  // panamaequity pone "Playas del Pacífico" en addressLocality y la zona real
  // ("Punta Caelo, San Carlos, Panama") en streetAddress. Preferimos
  // streetAddress porque tiene granularidad de barrio/corregimiento.
  const zonaRaw =
    listing.address?.streetAddress?.split(",")[0]?.trim() ??
    listing.address?.addressLocality ??
    null;
  const zona = zonaRaw ?? null;

  const area_m2 = toNumber(readAdditional(listing.additionalProperty, "Area Size", "area size", "área"));
  const habitaciones = toNumber(
    readAdditional(listing.additionalProperty, "Bedrooms", "bedrooms", "recámaras"),
  );
  const banos = toNumber(
    readAdditional(listing.additionalProperty, "Bathrooms", "bathrooms", "baños"),
  );
  const estacionamientos = toNumber(
    readAdditional(listing.additionalProperty, "Garages", "garages", "parking", "estacionamientos"),
  );

  // Source-first: panamaequity casi siempre publica lat/lng en el JSON-LD
  // del Schema.org. Si está Y cae en tierra, ESA es la coord exacta —
  // la usamos sin tocar. Si falta o cae en el mar (broker con typo),
  // caemos al pipeline edificio→web→zona.
  let finalLat = lat;
  let finalLng = lng;
  let precision: AnuncioRaw["precision_ubicacion"] = null;
  let ubicacionFuente: string | null = null;
  if (finalLat && finalLng && isOnLand(finalLat, finalLng)) {
    console.log(`  geo ✓ ${finalLat.toFixed(4)}, ${finalLng.toFixed(4)} (de JSON-LD)`);
    precision = "exacta";
    ubicacionFuente = "jsonld_geo";
  } else {
    if (finalLat && finalLng) {
      console.log(`  ✗ geo del JSON-LD cae en mar (${finalLat.toFixed(4)}, ${finalLng.toFixed(4)}) — corriendo pipeline`);
    } else {
      console.log(`  ✗ sin geo en JSON-LD — corriendo pipeline edificio→cache→web→zona`);
    }
    finalLat = null;
    finalLng = null;
    // Pasamos la categoría: terrenos/casas activan zona-fallback automático.
    const geo = await geocodeConEdificio(
      titulo,
      listing.description ?? null,
      url,
      zona,
      { categoria: categoriaFromTitleOrUrl(`${titulo ?? ""} ${url}`) },
    );
    if (!geo) {
      console.log(`  pipeline tampoco resolvió — saltando`);
      return null;
    }
    finalLat = geo.lat;
    finalLng = geo.lng;
    precision = geo.precision;
    ubicacionFuente = geo.source;
  }

  const descripcionTemp = trimDescripcion(listing.description);
  const tipoOperacion = tipoOperacionFromTitleOrUrl(`${titulo ?? ""} ${url}`);
  const ahora = new Date().toISOString();

  const base: AnuncioRaw = {
    titulo,
    precio,
    moneda: moneda ?? "USD",
    area_m2,
    habitaciones,
    banos,
    estacionamientos,
    zona,
    lat: finalLat,
    lng: finalLng,
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

  return { ...base, ...enriq };
}

async function scrapeAll(skipUrls: Set<string>): Promise<AnuncioRaw[]> {
  const allowed = await checkRobotsTxt();
  if (!allowed) {
    console.warn("robots.txt prohíbe /es/listings/ — abortando.");
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
        console.log(`  ${MAX_EMPTY_PAGES} págs consecutivas sin nuevos — corto.`);
        break;
      }
      continue;
    }
    consecutiveEmpty = 0;

    // Marca todos como vistos (para que las próximas páginas no los re-procesen).
    nuevos.forEach((u) => seenUrls.add(u));
    const procesables = nuevos.filter((u) => {
      if (skipUrls.has(u)) {
        console.log(`  (skip ya en DB) ${u}`);
        return false;
      }
      return true;
    });

    const batch = await chunkedParallel(procesables, DETAIL_CONCURRENCY, (u) =>
      scrapeDetail(u).catch((err) => {
        // H2: antes solo logueábamos → status=ok ocultaba scrapes rotos.
        console.warn(`  Error en ${u}: ${(err as Error).message}`);
        if (runState) runState.errors++;
        return null;
      }),
    );
    results.push(...batch);
    await jitter(300, 700);
  }
  console.log(
    `\n┌─ Resumen Panama Equity: ${seenUrls.size} URLs únicas, ${results.length} nuevos scrapeados`,
  );
  return results;
}

function toDbRow(a: AnuncioRaw): Record<string, unknown> | null {
  if (a.precio == null || a.lat == null || a.lng == null) return null;
  const tipoOperacion = tipoOperacionFromTitleOrUrl(`${a.titulo ?? ""} ${a.url_original}`);
  return {
    titulo: a.titulo ?? "(sin título)",
    tipo_operacion: tipoOperacion,
    categoria: categoriaFromTitleOrUrl(`${a.titulo ?? ""} ${a.url_original}`),
    estado_anuncio: "activo",
    estado_datos: "completo_verificado",
    veces_no_encontrado: 0,
    fecha_ultima_vista: a.fecha_actualizacion,
    fecha_ultima_revision: a.fecha_actualizacion,
    motivo_estado: "visto en scrape panamaequity",
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

async function fetchExistingUrls(
  supa: ReturnType<typeof createScraperClient>,
): Promise<Map<string, { estado_anuncio: string }>> {
  // Trae TODAS (auditoría C2). stripLifecycleIfNotActive respeta el
  // estado de lifecycle si no está activo.
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
  const outPath = join(process.cwd(), "public", "scrape-preview-pe.json");
  const existing = loadExisting(outPath);
  const skipUrls = new Set(existing.map((r) => r.url_original));
  console.log(`JSON existente: ${existing.length} propiedades.`);
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

// SIGTERM handler para no perder scraper_runs cuando el pipeline nos
// mata por hard timeout externo (mismo patrón que savitat/inmopanama).
type RunState = {
  startedAt: string;
  supa: ReturnType<typeof createScraperClient>;
  found: number;
  inserted: number;
  errors: number;
  writing: boolean;
  written: boolean;
};
let runState: RunState | null = null;

async function writeRunOnce(notes: string): Promise<void> {
  if (!runState || runState.written || runState.writing) return;
  runState.writing = true;
  const status = computeRunStatus({
    ok: runState.inserted,
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
      updated: 0,
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
  const notes = "panamaequity (bróker boutique) — cortado por SIGTERM del pipeline";
  void writeRunOnce(notes).finally(() => process.exit(0));
});

async function runSupabaseMode() {
  const supa = createScraperClient();
  console.log("Modo Supabase: upsert por url_original + scraper_runs.");
  runState = {
    startedAt: new Date().toISOString(),
    supa,
    found: 0,
    inserted: 0,
    errors: 0,
    writing: false,
    written: false,
  };

  const existingMap = await fetchExistingUrls(supa);
  const skipUrls = new Set(existingMap.keys());
  console.log(`Propiedades Panama Equity en DB: ${skipUrls.size} (se saltan).`);

  const allNew = await scrapeAll(skipUrls);
  console.log(`\nNuevos scrapeados: ${allNew.length}`);
  runState.found = allNew.length;

  const rows: Array<{ a: AnuncioRaw; row: Record<string, unknown> }> = [];
  for (const a of allNew) {
    const row = toDbRow(a);
    if (!row) {
      {
        const falta = [a.precio == null && "precio", a.lat == null && "lat", a.lng == null && "lng"].filter(Boolean).join(",");
        console.warn(`  ✗ saltado (falta: ${falta}): ${a.url_original}`);
      }
      runState.errors++;
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
      runState!.errors++;
    } else {
      runState!.inserted++;
    }
    return null;
  });

  await writeRunOnce("panamaequity (bróker boutique)");
  const status = computeRunStatus({
    ok: runState.inserted,
    errors: runState.errors,
  });
  console.log(
    `\nUpsert terminado — insertados: ${runState.inserted}, errores: ${runState.errors}, status: ${status}.`,
  );
}

async function main() {
  if (TARGET === "supabase") {
    const pf = await preflightCheck("panamaequity");
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
  // Independiente del scraper principal — exit != 0 marca este job como fallido
  // pero no rompe scrape:prod.
  console.error("Fatal scraper-panamaequity:", err);
  process.exit(1);
});
