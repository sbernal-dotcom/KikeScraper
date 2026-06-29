/**
 * Búsqueda web de coordenadas de un edificio.
 *
 * Paso 3 del pipeline de geocoding exacto: cuando un edificio NO está en
 * `edificios_cache`, intentamos resolverlo automáticamente:
 *
 *   1. DuckDuckGo HTML search (sin API key) por "<nombre> Panamá".
 *   2. Filtramos resultados — skip portales (encuentra24, etc.), redes,
 *      buscadores, y nos quedamos con sitios de broker/realtor.
 *   3. Para los TOP 3 candidatos:
 *      - GET de la página
 *      - Buscamos coords en JSON-LD `geo`, scripts JS, data-attributes,
 *        Google Maps embeds.
 *   4. Validamos que las coords caigan dentro del bbox de Panamá.
 *   5. Devolvemos la primera coord válida + URL de origen + confidence.
 *
 * No paga API. Es rate-limit friendly (delay entre fetches). Sigue los
 * mismos principios ToS del scraper principal: UA honesto, robots.txt,
 * timeout corto.
 */

const USER_AGENT =
  "MapaInteractivoInteligente/0.1 (+contacto: abilendesign@gmail.com)";

// Bbox holgado de Panamá. Filtramos cualquier coord fuera.
const PA_BBOX = {
  latMin: 7.0,
  latMax: 9.7,
  lngMin: -83.0,
  lngMax: -77.0,
};

const SKIP_DOMAINS = [
  // Portales que ya scrapeamos
  "encuentra24.com",
  "inmopanama.com",
  "acobir.com",
  "mlsacobir.com",
  "panamaequity.com",
  "compreoalquile.com",
  "inmuebles24.com",
  // Redes / no-content
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "pinterest.com",
  "linkedin.com",
  // Buscadores
  "google.com",
  "bing.com",
  "duckduckgo.com",
  "yahoo.com",
  // Clasificados que no aportan
  "olx.com",
  "mercadolibre.com",
  // Blogs / turismo / viewpoints — NO son inmuebles, dan coords
  // de miradores y puntos turísticos que NO corresponden al edificio.
  // Caso 2026-06-28: wanderlog devolvió coord de mirador para
  // "PH Sky View" que cayó en el mar.
  "wanderlog.com",
  "tripadvisor.com",
  "tripadvisor.es",
  "lonelyplanet.com",
  "wikitravel.org",
  "yelp.com",
  "foursquare.com",
  "booking.com",
  "airbnb.com",
  "expedia.com",
  "hotels.com",
];

// Sitios que dan coords muy buenas (priorizar)
const PREFERRED_DOMAINS = ["realtor.com", "zillow.com", "remax", "century21"];

export type ResultadoBusqueda = {
  lat: number;
  lng: number;
  source_url: string;
  confidence: number; // 0.5-0.95
};

/**
 * Si se pasa un validator, solo se aceptan coords que pasen el check.
 * Útil para validar contra el centroide de la zona conocida — evita
 * aceptar coords aleatorias de listings vecinos en páginas que listan
 * múltiples propiedades.
 */
export type Validator = (lat: number, lng: number) => boolean;

const FETCH_TIMEOUT_MS = 12_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function buscarEdificioWeb(
  nombre: string,
  validator?: Validator,
): Promise<ResultadoBusqueda | null> {
  // 1. Search en DuckDuckGo HTML (sin API key)
  const candidatos = await duckduckgoSearch(`${nombre} Panamá`);
  if (candidatos.length === 0) return null;

  // 2. Priorizar dominios de calidad + URLs single-listing (con "/unit-",
  // "/apt-", o un ID largo al final) sobre páginas de búsqueda/colección.
  candidatos.sort((a, b) => {
    const aScore = urlPriority(a);
    const bScore = urlPriority(b);
    return bScore - aScore;
  });

  // 3. Probar TOP 4 candidatos
  for (const url of candidatos.slice(0, 4)) {
    await sleep(400 + Math.floor(Math.random() * 400));
    try {
      const coords = await extraerCoordsDeURL(url, validator);
      if (coords) {
        const preferred = PREFERRED_DOMAINS.some((d) => url.includes(d));
        return {
          ...coords,
          source_url: url,
          confidence: preferred ? 0.85 : 0.65,
        };
      }
    } catch {
      // Silencioso — vamos al siguiente
    }
  }
  return null;
}

function urlPriority(url: string): number {
  let score = 0;
  // Dominio preferido (realtor.com, etc.)
  if (PREFERRED_DOMAINS.some((d) => url.includes(d))) score += 10;
  // URL de listing individual (no collection/search)
  if (/\/unit-|\/apt(o|artamento)?-|\/listing[\/-]/i.test(url)) score += 5;
  // Wikipedia: edificios famosos tienen artículo
  if (/wikipedia\.org/i.test(url)) score += 3;
  return score;
}

async function duckduckgoSearch(query: string): Promise<string[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const html = await res.text();

    // Extraer URLs de los resultados de DDG
    const matches = [...html.matchAll(/class="result__url"[^>]*href="([^"]+)"/g)];
    const decoded = matches
      .map((m) => decodeDDGUrl(m[1]))
      .filter(Boolean) as string[];

    // Filtrar dominios no útiles
    return decoded.filter(
      (u) => !SKIP_DOMAINS.some((d) => u.toLowerCase().includes(d)),
    );
  } catch {
    return [];
  }
}

function decodeDDGUrl(href: string): string | null {
  // DDG wrappea URLs como //duckduckgo.com/l/?uddg=<url-encoded>
  const m = href.match(/uddg=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return null;
    }
  }
  // Caso raro: href directo
  if (/^https?:\/\//.test(href)) return href;
  return null;
}

async function extraerCoordsDeURL(
  url: string,
  validator?: Validator,
): Promise<{ lat: number; lng: number } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  // Patrones por orden de confiabilidad. Frenamos en el primero válido.
  const patterns: Array<{ re: RegExp; lat: number; lng: number }> = [
    // JSON-LD geo o Next.js __NEXT_DATA__: "latitude":X,"longitude":Y
    {
      re: /"latitude"\s*:\s*(-?\d+\.\d+)[\s\S]{0,400}?"longitude"\s*:\s*(-?\d+\.\d+)/g,
      lat: 1,
      lng: 2,
    },
    // Schema.org geo: lat / lng
    {
      re: /"lat"\s*:\s*(-?\d+\.\d+)[\s\S]{0,200}?"l(?:ng|on)"\s*:\s*(-?\d+\.\d+)/g,
      lat: 1,
      lng: 2,
    },
    // Google Maps embed: !2d<lng>!3d<lat>
    {
      re: /!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/g,
      lat: 2,
      lng: 1,
    },
    // Google Maps URL: ?q=<lat>,<lng>  o  @<lat>,<lng>
    { re: /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/g, lat: 1, lng: 2 },
    { re: /@(-?\d+\.\d+),(-?\d+\.\d+)/g, lat: 1, lng: 2 },
    // data attributes
    {
      re: /data-lat=["'](-?\d+\.\d+)["'][\s\S]{0,100}?data-l(?:ng|on)=["'](-?\d+\.\d+)["']/g,
      lat: 1,
      lng: 2,
    },
  ];

  for (const { re, lat: ilat, lng: ilng } of patterns) {
    for (const m of html.matchAll(re)) {
      const lat = parseFloat(m[ilat]);
      const lng = parseFloat(m[ilng]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (!isInPanama(lat, lng)) continue;
      // Validator es opcional. Si está, debe pasar; si no, se acepta.
      // Sirve para descartar coords aleatorias de listings vecinos en
      // páginas multi-listing — exige cercanía a la zona conocida.
      if (validator && !validator(lat, lng)) continue;
      return { lat, lng };
    }
  }
  return null;
}

function isInPanama(lat: number, lng: number): boolean {
  return (
    lat >= PA_BBOX.latMin &&
    lat <= PA_BBOX.latMax &&
    lng >= PA_BBOX.lngMin &&
    lng <= PA_BBOX.lngMax
  );
}
