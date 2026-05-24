/**
 * Scraper de prueba — fuente: compreoalquile.com
 *
 * Modo PRUEBA: imprime los resultados en consola, NO guarda en Supabase.
 *
 * Reglas (ver bitacora):
 *  - Máximo MAX_ANUNCIOS por ejecución.
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

import { writeFileSync } from "fs";
import { join } from "path";

import { chromium, type Page } from "playwright";

const FUENTE_ID = "encuentra24";
const DEFAULT_URL =
  "https://www.encuentra24.com/panama-es/bienes-raices-venta-de-propiedades";
const URL_LISTADO = process.env.SCRAPE_URL ?? DEFAULT_URL;
const MAX_ANUNCIOS = 5;
const USER_AGENT =
  "MapaInteractivoInteligente/0.1 (+contacto: abilendesign@gmail.com)";

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
  descripcion: string | null;
  imagen: string | null;
  vendedor: string | null;
  url_original: string;
  fuente: string;
  fecha_deteccion: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min = 800, max = 2000) =>
  sleep(min + Math.floor(Math.random() * (max - min)));

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
): Promise<{ lat: number; lng: number } | null> {
  if (!zona || zona.trim().length < 3) return null;
  // Intento 1: "Zona, Panamá"
  const first = await nominatimQuery(`${zona}, Panamá`);
  if (first) return first;
  // Intento 2: "Zona, Ciudad de Panamá, Panamá" para corregimientos
  // poco identificables a nivel país (ej. "Santa María").
  return nominatimQuery(`${zona}, Ciudad de Panamá, Panamá`);
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

const DESCRIPCION_MAX = 280;
function trimDescripcion(desc: string | undefined): string | null {
  if (!desc) return null;
  const clean = desc
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return null;
  if (clean.length <= DESCRIPCION_MAX) return clean;
  return clean.slice(0, DESCRIPCION_MAX).trimEnd() + "…";
}

function normalizeMoneda(c: string | undefined): "USD" | "PAB" | null {
  if (!c) return null;
  const v = c.toUpperCase();
  if (v === "USD" || v === "PAB") return v;
  return null;
}

function extractImage(img: LdProduct["image"]): string | null {
  if (!img) return null;
  if (typeof img === "string") return img;
  return img.contentUrl ?? null;
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

async function scrape(page: Page): Promise<AnuncioRaw[]> {
  // Solo anuncios individuales. Descartamos /bienes-raices-proyectos-nuevos/
  // porque son rangos promocionales ("desde X, 1-3 recámaras") no comparables
  // y romperían los cálculos de opportunity_score.
  const found = await page
    .locator('a[href*="/panama-es/bienes-raices"][href*="-a"]')
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
        if (url.split("/").filter(Boolean).length < 5) continue;
        seen.add(url);
        out.push({ url, titulo: a.textContent?.trim() ?? null });
      }
      return out;
    }, MAX_ANUNCIOS);

  console.log(`Encontrados ${found.length} candidatos en el listado.`);

  const results: AnuncioRaw[] = [];
  for (const item of found.slice(0, MAX_ANUNCIOS)) {
    await jitter(1500, 3000);
    console.log(`→ ${item.url}`);
    try {
      const res = await page.goto(item.url, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      if (!res || res.status() >= 400) {
        console.warn(`  HTTP ${res?.status() ?? "??"} — saltando`);
        continue;
      }
      // Espera a que React hidrate el bloque de características.
      // SPA con hidratación lenta — networkidle es más confiable que DOM ready.
      await page
        .waitForLoadState("networkidle", { timeout: 8000 })
        .catch(() => null);
      if (
        await page.locator('text=/captcha|verify|robot/i').first().isVisible().catch(() => false)
      ) {
        console.error("  Captcha/bloqueo detectado. Abortando.");
        break;
      }

      // Fuente primaria: JSON-LD (schema.org/Product) que encuentra24 publica oficialmente.
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
        continue;
      }

      const titulo = product.name?.trim() ?? item.titulo ?? null;
      const precio = toNumber(String(product.offers?.price ?? ""));
      const addr = product.offers?.availableAtOrFrom?.address;
      const zona = addr?.addressLocality ?? addr?.streetAddress ?? null;
      // Fuente primaria: HTML estructurado. Fallback: parseo de la descripción.
      const fromHtml = await parseFromHtml(page);
      const fromDesc = parseFromDescription(product.description ?? "");
      const area_m2 = fromHtml.area_m2 ?? fromDesc.area_m2;
      const habitaciones = fromHtml.habitaciones ?? fromDesc.habitaciones;
      const banos = fromHtml.banos ?? fromDesc.banos;
      const estacionamientos =
        fromHtml.estacionamientos ?? fromDesc.estacionamientos;

      const coords = await geocodeZona(zona);
      if (coords) {
        console.log(`  geocode → ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
      } else if (zona) {
        console.log(`  geocode → sin resultado confiable para "${zona}"`);
      }

      results.push({
        titulo,
        precio,
        moneda: normalizeMoneda(product.offers?.priceCurrency),
        area_m2,
        habitaciones,
        banos,
        estacionamientos,
        zona,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        descripcion: trimDescripcion(product.description),
        imagen: extractImage(product.image),
        vendedor: product.offers?.seller?.name?.trim() || null,
        url_original: item.url,
        fuente: FUENTE_ID,
        fecha_deteccion: new Date().toISOString(),
      });
    } catch (err) {
      console.warn(`  Error procesando ${item.url}:`, (err as Error).message);
    }
  }

  return results;
}

async function main() {
  const url = new URL(URL_LISTADO);
  const allowed = await checkRobotsTxt(url.origin, url.pathname);
  if (!allowed) {
    console.error(`robots.txt prohíbe ${url.pathname} — abortando.`);
    process.exit(1);
  }
  console.log(`robots.txt OK para ${url.pathname}`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 800 },
    locale: "es-PA",
  });
  const page = await ctx.newPage();

  try {
    const res = await page.goto(URL_LISTADO, {
      waitUntil: "domcontentloaded",
      timeout: 25_000,
    });
    if (!res || res.status() >= 400) {
      console.error(`Listado respondió ${res?.status() ?? "??"} — abortando.`);
      return;
    }
    await jitter(1000, 2000);

    const data = await scrape(page);
    console.log("\n=== RESULTADOS (modo prueba — NO guardado en Supabase) ===");
    console.log(JSON.stringify(data, null, 2));
    console.log(`\nTotal: ${data.length}/${MAX_ANUNCIOS}`);

    // Modo preview: escribe el JSON a public/ para que el mapa lo pueda mostrar
    // sin tocar la DB. Abrir el mapa con ?preview=1 para verlo.
    const outPath = join(process.cwd(), "public", "scrape-preview.json");
    writeFileSync(
      outPath,
      JSON.stringify(
        { generated_at: new Date().toISOString(), fuente: FUENTE_ID, results: data },
        null,
        2,
      ),
    );
    console.log(`\nPreview escrito en ${outPath}`);
    console.log(`Abrir el mapa con ?preview=1 para verlos.`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
