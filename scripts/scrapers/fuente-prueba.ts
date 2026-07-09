/**
 * Scraper de prueba — fuente: compreoalquile.com
 *
 * Modo PRUEBA: imprime los resultados en consola, NO guarda en Supabase.
 *
 * Reglas (ver bitacora):
 *  - Límite por listado configurado en LISTADOS.
 *  - User-Agent honesto identifica al proyecto.
 *  - Respeta robots.txt — si el path está bloqueado, aborta.
 *  - Si la página responde 403/429/captcha/login → aborta.
 *  - Delay aleatorio entre acciones para no martillar el servidor.
 *  - No descarga imágenes, no copia descripciones completas.
 *
 * Uso:
 *   npm run scrape:test
 *   # o con URL custom:
 *   SCRAPE_URL="https://www.compreoalquile.com/..." npm run scrape:test
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { config as loadEnv } from "dotenv";
import { chromium, type Page } from "playwright";

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

// Next.js usa .env.local — cargarlo explícitamente.
loadEnv({ path: ".env.local" });
loadEnv();

const FUENTE_ID = "encuentra24";
// Si SCRAPE_URL está definido, se respeta como única fuente.
// Si no, se corre la lista por default. Distribuida por categoría
// (no en los listados genéricos `bienes-raices-venta-de-propiedades` y
// `bienes-raices-alquiler`, que se sesgan a apartamentos en Ciudad de
// Panamá). Total objetivo: ~100 anuncios por corrida.
const DEFAULT_LISTADOS: Array<{ url: string; limit: number }> = [
  // ── VENTA ──
  {
    url: "https://www.encuentra24.com/panama-es/bienes-raices-venta-de-propiedades-apartamentos",
    limit: 20,
  },
  {
    url: "https://www.encuentra24.com/panama-es/bienes-raices-venta-de-propiedades-casas",
    limit: 15,
  },
  {
    url: "https://www.encuentra24.com/panama-es/bienes-raices-venta-de-propiedades-lotes-y-terrenos",
    limit: 10,
  },
  // ── ALQUILER ──
  // Slug correcto: `bienes-raices-alquiler-*` (sin `-de-propiedades`).
  // La variante con `-de-propiedades` devuelve 200 pero no renderiza
  // listados (misconfig Next.js de encuentra24). Verificado vía probe.
  {
    url: "https://www.encuentra24.com/panama-es/bienes-raices-alquiler-apartamentos",
    limit: 20,
  },
  {
    url: "https://www.encuentra24.com/panama-es/bienes-raices-alquiler-casas",
    limit: 15,
  },
  {
    url: "https://www.encuentra24.com/panama-es/bienes-raices-alquiler-alquiler-de-oficinas",
    limit: 10,
  },
  {
    url: "https://www.encuentra24.com/panama-es/bienes-raices-alquiler-comercios",
    limit: 10,
  },
];
const LISTADOS: Array<{ url: string; limit: number }> = process.env.SCRAPE_URL
  ? [{ url: process.env.SCRAPE_URL, limit: 10 }]
  : DEFAULT_LISTADOS;
const USER_AGENT =
  "MapaInteractivoInteligente/0.1 (+contacto: abilendesign@gmail.com)";

// Modo de escritura. Por default escribe a public/scrape-preview.json
// (preview/prueba, seguro). Con --supabase hace upsert a la DB + scraper_runs.
const TARGET: "json" | "supabase" = process.argv.includes("--supabase")
  ? "supabase"
  : "json";

// Categorías válidas en el enum categoria_propiedad de Supabase.
type CategoriaDb =
  | "apartamento"
  | "casa"
  | "terreno"
  | "local-comercial"
  | "oficina"
  | "galera";

function tipoOperacionFromUrl(url: string): "venta" | "alquiler" {
  return /alquiler|renta/i.test(url) ? "alquiler" : "venta";
}

function categoriaFromUrl(url: string): CategoriaDb {
  if (/apartamento/i.test(url)) return "apartamento";
  if (/-casas?\b|-casa\b/i.test(url)) return "casa";
  if (/lotes-y-terrenos|terreno/i.test(url)) return "terreno";
  if (/comercios?|local-comercial|locales/i.test(url)) return "local-comercial";
  if (/oficinas?/i.test(url)) return "oficina";
  if (/galeras?/i.test(url)) return "galera";
  return "apartamento";
}

/**
 * Campos finales aprobados (ver project_flow_scraper_supabase.md):
 * solo datos factuales + resumen IA original. NO se persiste descripción,
 * imágenes, vendedor, email ni teléfono. La descripción solo existe como
 * variable LOCAL durante la corrida — nunca toca disco ni logs.
 */
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

// Concurrencia para detail-scrape (pool de Pages de Playwright).
const DETAIL_CONCURRENCY = 3;
const UPSERT_CONCURRENCY = 5;

/** Procesa items en chunks paralelos. */
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

// Nominatim (OpenStreetMap) — geocoding gratis.
// Reglas: máx 1 req/seg, User-Agent identificable, atribución a OSM en la UI.
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
    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
      address?: Record<string, string>;
    }>;
    if (!data.length) return null;
    const top = data[0];
    const addr = top.address ?? {};
    const ok =
      addr.suburb ||
      addr.neighbourhood ||
      addr.quarter ||
      addr.city_district ||
      addr.city ||
      addr.town ||
      addr.village;
    if (!ok) return null;
    const lat = Number(top.lat);
    const lng = Number(top.lon);
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
  // Fuente PRIMARIA: tabla de centroides verificados.
  // Más confiable que Nominatim para corregimientos de Panamá.
  const fromTable = centroFromTable(zona);
  if (fromTable) return { ...fromTable, source: "table" };
  // Fallback: Nominatim (OSM). Si una zona cae aquí seguido,
  // agregarla a zonas-panama.ts con coords verificadas.
  const first = await nominatimQuery(`${zona}, Panamá`);
  if (first) return { ...first, source: "nominatim" };
  const second = await nominatimQuery(`${zona}, Ciudad de Panamá, Panamá`);
  return second ? { ...second, source: "nominatim" } : null;
}

/**
 * Parsea números asumiendo locale US (coma=miles, punto=decimal),
 * que es la convención dominante en inmuebles en Panamá.
 * Ejemplos:
 *   "20,536"     → 20536  (miles)
 *   "146 m²"     → 146
 *   "1,425.50"   → 1425.5 (miles + decimal)
 *   "1.42"       → 1.42   (decimal)
 */
function toNumber(text: string | null | undefined): number | null {
  if (text == null) return null;
  let s = String(text).replace(/[^\d.,]/g, "");
  if (!s) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    s = s.replace(/,/g, "");
  } else if (hasComma) {
    if (/^\d{1,3}(,\d{3})+$/.test(s)) {
      s = s.replace(/,/g, "");
    } else {
      s = s.replace(",", ".");
    }
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function checkRobotsTxt(origin: string, path: string): Promise<boolean> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
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
      if (key === "user-agent") {
        appliesToUs = value === "*";
      } else if (appliesToUs && key === "disallow" && value) {
        if (path.startsWith(value)) return false;
      }
    }
    return true;
  } catch {
    return true;
  }
}

type LdProduct = {
  "@type"?: string;
  name?: string;
  description?: string;
  offers?: {
    price?: number | string;
    priceCurrency?: string;
    availableAtOrFrom?: {
      address?: {
        streetAddress?: string;
        addressLocality?: string;
        addressRegion?: string;
      };
    };
    seller?: {
      name?: string;
    };
  };
  image?: { contentUrl?: string } | string;
};

function normalizeMoneda(c: string | undefined): "USD" | "PAB" | null {
  if (!c) return null;
  const v = c.toUpperCase();
  if (v === "USD" || v === "PAB") return v;
  return null;
}

type Caracteristicas = {
  area_m2: number | null;
  habitaciones: number | null;
  banos: number | null;
  estacionamientos: number | null;
};

/**
 * Lee el bloque "Características" del HTML de encuentra24, donde cada
 * par está estructurado como [valor][etiqueta] dentro de un mismo div.
 * Es más confiable que la descripción libre del agente.
 *
 * Devuelve pares {label, value} crudos; el parseo numérico se hace
 * fuera del browser (page.evaluate no tolera arrow functions anidadas
 * compiladas por tsx — inyectan helpers que no existen en el browser).
 */
async function parseFromHtml(page: Page): Promise<Caracteristicas> {
  const pairs = (await page.$$eval(
    'span.text-muted-foreground, span[class*="text-muted"]',
    (nodes) =>
      nodes
        .map((label) => {
          const text = (label.textContent || "").trim();
          if (!text || text.length > 40) return null;
          // En encuentra24 la etiqueta va primero y el valor es el sibling siguiente.
          const valueEl = label.nextElementSibling;
          if (!valueEl) return null;
          const value = (valueEl.textContent || "").trim();
          if (!value) return null;
          return { label: text, value };
        })
        .filter(Boolean),
  )) as Array<{ label: string; value: string }>;

  const out: Caracteristicas = {
    area_m2: null,
    habitaciones: null,
    banos: null,
    estacionamientos: null,
  };

  const reArea = /(?:^|\b)(?:área|area|m[²2]|metros?\s*cuadrados?)/i;
  const reHab = /recámaras?|recamaras?|habitaciones?|dormitorios?/i;
  const reBan = /ba(?:ñ|n)os?/i;
  const reEst = /estacionamientos?|parqueos?|puestos?|parking/i;

  for (const { label, value } of pairs) {
    if ((reArea.test(label) || reArea.test(value)) && out.area_m2 === null) {
      out.area_m2 = toNumber(value);
    } else if (reHab.test(label) && out.habitaciones === null) {
      out.habitaciones = toNumber(value);
    } else if (reBan.test(label) && out.banos === null) {
      out.banos = toNumber(value);
    } else if (reEst.test(label) && out.estacionamientos === null) {
      out.estacionamientos = toNumber(value);
    }
  }

  return out;
}

function parseFromDescription(desc: string): {
  area_m2: number | null;
  habitaciones: number | null;
  banos: number | null;
  estacionamientos: number | null;
} {
  const clean = desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  // Acepta: 146 m², 146 m2, 146 mt2, 146 mts2, 146 mtrs2, 20,536 Mts2,
  // 146 metros cuadrados, 146mts²
  const areaMatch = clean.match(
    /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*(?:m(?:t|ts|trs)?[²2]|metros?\s*cuadrados?)/i,
  );
  const area_m2 = toNumber(areaMatch?.[1] ?? null);
  const habitaciones = toNumber(
    clean.match(/(\d+)\s*(?:recámaras?|recamaras?|habitaciones?|dormitorios?)/i)?.[1] ??
      null,
  );
  const banos = toNumber(
    clean.match(/(\d+)\s*ba(?:ñ|n)os?/i)?.[1] ?? null,
  );
  const estacionamientos = toNumber(
    clean.match(/(\d+)\s*(?:estacionamientos?|puestos?\s*(?:de\s*)?estacionamiento|parqueos?)/i)?.[1] ??
      null,
  );
  return { area_m2, habitaciones, banos, estacionamientos };
}

/**
 * Scrape de UN anuncio de detalle. Usa el `page` asignado del pool.
 * Devuelve null si el anuncio no tiene JSON-LD Product o falla.
 */
async function scrapeOne(
  page: Page,
  item: { url: string; titulo: string | null },
): Promise<AnuncioRaw | null> {
  await jitter(500, 1100);
  console.log(`→ ${item.url}`);
  const res = await page.goto(item.url, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });
  if (!res || res.status() >= 400) {
    console.warn(`  HTTP ${res?.status() ?? "??"} — saltando`);
    return null;
  }
  await page
    .waitForLoadState("networkidle", { timeout: 8000 })
    .catch(() => null);

  const products = (await page.$$eval(
    'script[type="application/ld+json"]',
    (nodes) =>
      nodes
        .map((n) => {
          try {
            return JSON.parse(n.textContent || "");
          } catch {
            return null;
          }
        })
        .filter(Boolean),
  )) as LdProduct[];
  const product = products.find((p) => p?.["@type"] === "Product");

  if (!product) {
    console.warn("  Sin JSON-LD Product — saltando");
    return null;
  }

  const titulo = product.name?.trim() ?? item.titulo ?? null;
  const precio = toNumber(String(product.offers?.price ?? ""));
  const addr = product.offers?.availableAtOrFrom?.address;
  const zona = addr?.addressLocality ?? addr?.streetAddress ?? null;
  const fromHtml = await parseFromHtml(page);
  const fromDesc = parseFromDescription(product.description ?? "");
  const area_m2 = fromHtml.area_m2 ?? fromDesc.area_m2;
  const habitaciones = fromHtml.habitaciones ?? fromDesc.habitaciones;
  const banos = fromHtml.banos ?? fromDesc.banos;
  const estacionamientos =
    fromHtml.estacionamientos ?? fromDesc.estacionamientos;

  // Pipeline nuevo: prioridad EDIFICIO → PROYECTO → ZONA → null (descartar).
  // El antiguo geocodeZona caía siempre al centroide del barrio + jitter,
  // dando coords aproximadas (a veces en el mar). Este pipeline:
  //  1. IA extrae nombre del edificio del titulo + descripción
  //  2. Lookup en edificios_cache (DB)
  //  3. Web search si miss (cachea positivo y negativo)
  //  4. Si nada, fallback al zone-centroide
  //  5. Si tampoco zona, descarta la propiedad
  // Pasamos la categoría al pipeline: terrenos/casas activan zona-fallback
  // automático (no exigimos edificio identificable para esas categorías).
  const categoria = categoriaFromUrl(item.url);
  const geo = await geocodeConEdificio(
    titulo,
    product.description ?? null,
    item.url,
    zona,
    { categoria },
  );
  if (!geo) {
    console.warn("  Sin ubicación resoluble — saltando");
    return null;
  }
  if (zona) await validarConMapbox(zona, { lat: geo.lat, lng: geo.lng });

  const descripcionTemp = trimDescripcion(product.description);
  const ahora = new Date().toISOString();
  const anuncioBase: AnuncioRaw = {
    titulo,
    precio,
    moneda: normalizeMoneda(product.offers?.priceCurrency),
    area_m2,
    habitaciones,
    banos,
    estacionamientos,
    zona,
    lat: geo.lat,
    lng: geo.lng,
    url_original: item.url,
    fuente: FUENTE_ID,
    fecha_deteccion: ahora,
    fecha_actualizacion: ahora,
    resumen_ia: null,
    tags_caracteristicas: [],
    tags_extra: [],
    ai_source_flag: null,
  };
  const ficha: FichaIA = {
    titulo: anuncioBase.titulo,
    tipoOperacion: tipoOperacionFromUrl(anuncioBase.url_original),
    precio: anuncioBase.precio,
    moneda: anuncioBase.moneda,
    area_m2: anuncioBase.area_m2,
    habitaciones: anuncioBase.habitaciones,
    banos: anuncioBase.banos,
    estacionamientos: anuncioBase.estacionamientos,
    zona: anuncioBase.zona,
  };
  const enriq = await enriquecerConIA(ficha, descripcionTemp);
  if (enriq.resumen_ia)
    console.log(
      `  resumen-ia ✓ (es:${enriq.resumen_ia.es.length} en:${enriq.resumen_ia.en.length})`,
    );
  return { ...anuncioBase, ...enriq };
}

/**
 * Procesa los candidatos de UNA página de listado en paralelo usando un
 * pool de Pages. Devuelve los anuncios scrapeados exitosos.
 */
async function scrape(
  page: Page,
  pagePool: Page[],
  limit: number,
  skipUrls: Set<string>,
): Promise<AnuncioRaw[]> {
  // Pedimos más candidatos de los que queremos: muchos serán duplicados
  // (ya en skipUrls) o se descartarán por el filtro de proyectos-nuevos.
  const overscan = Math.max(limit * 4, 30);
  // Solo anuncios individuales. Descartamos /bienes-raices-proyectos-nuevos/
  // porque son rangos promocionales ("desde X, 1-3 recámaras") no comparables
  // y romperían los cálculos de opportunity_score.
  const allCandidates = await page
    .locator('a[href*="/panama-es/bienes-raices"]')
    .evaluateAll((nodes, max) => {
      const seen = new Set<string>();
      const out: Array<{ url: string; titulo: string | null }> = [];
      for (const n of nodes) {
        if (out.length >= max) break;
        const a = n as HTMLAnchorElement;
        const url = a.href;
        if (!url || seen.has(url)) continue;
        if (/[?&]page=|#/.test(url)) continue;
        if (url.includes("/bienes-raices-proyectos-nuevos/")) continue;
        // El anuncio real termina en `/{slug}/{ID_numérico}`. Las páginas
        // estructurales (`/map`, `/panama-oeste`, `/prov-chiriqui`,
        // `/ciudad-de-panama`) NO tienen ID y comparten el mismo prefijo
        // del listado — sin este filtro se procesarían como candidatos.
        const segs = url.split("/").filter(Boolean);
        const last = segs[segs.length - 1] ?? "";
        if (!/^\d{5,}$/.test(last)) continue;
        seen.add(url);
        out.push({ url, titulo: a.textContent?.trim() ?? null });
      }
      return out;
    }, overscan);

  const found = allCandidates.filter((c) => !skipUrls.has(c.url)).slice(0, limit);
  const skippedDupes = allCandidates.length - found.length;
  console.log(
    `Encontrados ${allCandidates.length} candidatos (${skippedDupes} ya en JSON) → procesaré ${found.length}.`,
  );

  // Procesa los `found` candidatos en paralelo usando el pool de Pages.
  // Cada chunk asigna 1 Page por item del pool.
  const results = await chunkedParallel<
    { url: string; titulo: string | null },
    AnuncioRaw
  >(found, Math.min(DETAIL_CONCURRENCY, pagePool.length), (item, j) => {
    const detailPage = pagePool[j];
    return scrapeOne(detailPage, item).catch((err) => {
      console.warn(`  Error procesando ${item.url}: ${(err as Error).message}`);
      return null;
    });
  });
  return results;
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

/**
 * Mapea un AnuncioRaw a una fila de la tabla `propiedades`. Solo campos
 * factuales + resumen IA bilingüe + tags. NO escribe descripcion/imagenes/
 * vendedor (contrato ToS). Devuelve null si faltan campos NOT NULL.
 */
function toDbRow(a: AnuncioRaw): Record<string, unknown> | null {
  if (a.precio == null || a.lat == null || a.lng == null) return null;
  return {
    titulo: a.titulo ?? "(sin título)",
    tipo_operacion: tipoOperacionFromUrl(a.url_original),
    categoria: categoriaFromUrl(a.url_original),
    // Vista en este scrape → resetea el lifecycle. Si era posible_inactivo
    // o error_verificacion, vuelve a activo. Si era archivado, también
    // resucita — significa que la fuente la volvió a publicar.
    estado_anuncio: "activo",
    veces_no_encontrado: 0,
    fecha_ultima_vista: a.fecha_actualizacion,
    fecha_ultima_revision: a.fecha_actualizacion,
    motivo_estado: "visto en scrape",
    lat: a.lat,
    lng: a.lng,
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

/**
 * Devuelve el set de url_original ya ACTIVAS en la DB (skip list).
 *
 * Solo filtramos por 'activo' para que los archivados se re-procesen
 * en cada cron — si el pipeline ahora puede resolver el edificio (ya
 * sea por cache o por web), revivimos la prop con coord exacta. Si no,
 * el scraper no upsertea (scrapeOne devuelve null) y queda archivada.
 *
 * Paginación: Supabase JS cap 1000 por defecto.
 */
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

// Tope de páginas a recorrer por listado. encuentra24 pagina con el
// formato `{listado}.{N}` (ej. `...apartamentos.2`). Cap defensivo
// para no quedar en loop si una categoría tiene cientos de páginas.
// Subimos a 20 (era 8) porque la DB ya empezó a saturarse y necesitamos
// más profundidad para conseguir URLs frescas.
const MAX_PAGES_PER_LISTADO = 20;

// Razón por la que el loop de un listado terminó. Se usa en el summary.
type StopReason =
  | "limit alcanzado"
  | "listado agotado"
  | "max páginas"
  | "robots.txt"
  | "HTTP error";

type ListadoSummary = {
  url: string;
  target: number;
  collected: number;
  pages: number;
  reason: StopReason;
};

function slugFromUrl(url: string): string {
  // Corta tras `bienes-raices-` para que el resumen sea legible:
  // "alquiler-apartamentos" en vez del URL completo.
  const m = url.match(/bienes-raices-(.+)$/);
  return m?.[1] ?? url;
}

async function scrapeAll(skipUrls: Set<string>): Promise<AnuncioRaw[]> {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 800 },
    locale: "es-PA",
  });
  // Page principal: navega listados. Pool: páginas para detalles en paralelo.
  const page = await ctx.newPage();
  const pagePool: Page[] = [];
  for (let i = 0; i < DETAIL_CONCURRENCY; i++) {
    pagePool.push(await ctx.newPage());
  }
  const allNew: AnuncioRaw[] = [];
  const summary: ListadoSummary[] = [];
  try {
    for (const { url: listadoUrl, limit } of LISTADOS) {
      const parsed = new URL(listadoUrl);
      const allowed = await checkRobotsTxt(parsed.origin, parsed.pathname);
      if (!allowed) {
        console.warn(`robots.txt prohíbe ${parsed.pathname} — saltando.`);
        summary.push({
          url: listadoUrl,
          target: limit,
          collected: 0,
          pages: 0,
          reason: "robots.txt",
        });
        continue;
      }
      console.log(`\n▶ Listado: ${listadoUrl} (target: ${limit})`);

      let collected = 0;
      let pagesVisited = 0;
      let reason: StopReason = "max páginas";
      for (
        let pageNum = 1;
        pageNum <= MAX_PAGES_PER_LISTADO && collected < limit;
        pageNum++
      ) {
        // Página 1 es la URL base; 2+ se construye como `{base}.{N}`.
        const pagedUrl = pageNum === 1 ? listadoUrl : `${listadoUrl}.${pageNum}`;
        if (pageNum > 1) console.log(`  → página ${pageNum}: ${pagedUrl}`);

        const res = await page.goto(pagedUrl, {
          waitUntil: "domcontentloaded",
          timeout: 25_000,
        });
        if (!res || res.status() >= 400) {
          console.warn(`  Listado respondió ${res?.status() ?? "??"} — corto.`);
          reason = "HTTP error";
          break;
        }
        await page
          .waitForLoadState("networkidle", { timeout: 10_000 })
          .catch(() => null);
        await page
          .locator('a[href*="/panama-es/bienes-raices"]')
          .first()
          .waitFor({ state: "attached", timeout: 10_000 })
          .catch(() => null);
        await jitter(400, 800);

        pagesVisited++;
        const remaining = limit - collected;
        const data = await scrape(page, pagePool, remaining, skipUrls);
        if (data.length === 0) {
          console.log(`  (sin nuevos en esta página — corto el listado)`);
          reason = "listado agotado";
          break;
        }
        for (const d of data) skipUrls.add(d.url_original);
        allNew.push(...data);
        collected += data.length;
        if (collected >= limit) {
          reason = "limit alcanzado";
        }
      }
      console.log(
        `  ▣ ${collected}/${limit} nuevos · ${pagesVisited} pág${pagesVisited !== 1 ? "s" : ""} · ${reason}`,
      );
      summary.push({
        url: listadoUrl,
        target: limit,
        collected,
        pages: pagesVisited,
        reason,
      });
    }

    // Resumen final por listado: tabla compacta para ver de un vistazo
    // qué categorías llenaron su target y cuáles se quedaron cortas
    // (y por qué). Útil en los logs del cron y para decidir si hay que
    // subir MAX_PAGES_PER_LISTADO o agregar categorías.
    if (summary.length > 0) {
      const totalCollected = summary.reduce((a, s) => a + s.collected, 0);
      const totalTarget = summary.reduce((a, s) => a + s.target, 0);
      const slugWidth = Math.max(
        ...summary.map((s) => slugFromUrl(s.url).length),
      );
      console.log(
        `\n┌─ Resumen scrape (total: ${totalCollected}/${totalTarget})`,
      );
      for (const s of summary) {
        const slug = slugFromUrl(s.url).padEnd(slugWidth);
        const ratio = `${s.collected}/${s.target}`.padStart(7);
        console.log(`│ ${slug}  ${ratio}  ${s.pages} pág  ${s.reason}`);
      }
      console.log(`└─`);
    }
  } finally {
    await browser.close();
  }
  return allNew;
}

async function runJsonMode() {
  const outPath = join(process.cwd(), "public", "scrape-preview.json");
  const existing = loadExisting(outPath);
  const skipUrls = new Set(existing.map((r) => r.url_original));
  console.log(
    `JSON existente: ${existing.length} anuncios — se hará merge (dedupe por url_original).`,
  );

  const allNew = await scrapeAll(skipUrls);
  console.log(`\nNuevos en esta corrida: ${allNew.length}`);
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
    `Preview escrito en ${outPath} — total: ${merged.length} (${existing.length} previos + ${allNew.length} nuevos).`,
  );
}

async function runSupabaseMode() {
  const supa = createScraperClient();
  const startedAt = new Date().toISOString();
  console.log("Modo Supabase: upsert por url_original + registro en scraper_runs.");

  const skipUrls = await fetchExistingUrls(supa);
  console.log(`Propiedades existentes en DB: ${skipUrls.size} (se saltan).`);

  const allNew = await scrapeAll(skipUrls);
  console.log(`\nNuevos scrapeados: ${allNew.length}`);

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

  // Como scrapeAll salta los url_original ya presentes, todos los escritos
  // son nuevos (updated=0). El refresco de existentes se hará en otra corrida.
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
    notes: `listados: ${LISTADOS.map((l) => l.url).join(", ")}`,
  });
  if (runErr) console.warn(`  No se pudo registrar scraper_run: ${runErr.message}`);

  console.log(
    `\nUpsert terminado — insertados: ${inserted}, errores: ${errors}, status: ${status}.`,
  );
}

async function main() {
  if (TARGET === "supabase") {
    const pf = await preflightCheck("encuentra24");
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
  console.error("Fatal:", err);
  process.exit(1);
});
