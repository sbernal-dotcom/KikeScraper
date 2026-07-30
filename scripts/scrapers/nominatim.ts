/**
 * Geocoder gratis de OpenStreetMap con validación estricta a Panamá.
 *
 * Reglas:
 *   1. Rate limit: 1 req/s.
 *   2. `countrycodes=pa` en la query — filtro server-side.
 *   3. Doble check post-response:
 *      a) address.country_code === "pa"
 *      b) isOnLand(lat, lng) === true
 *   4. VALIDADOR DE PROXIMIDAD (opts.zonaCentro): si venimos con un
 *      centroide de zona conocido (típicamente de nuestra tabla
 *      ZONAS_PANAMA), rechazamos coords que caigan a >30 km. Sin esto
 *      Nominatim puede devolver un homónimo — ej. "La Pulida, Panamá"
 *      caía en Darién a 350 km del barrio real de PTY.
 *   5. Sin zonaCentro → devuelve null. Es una decisión conservadora:
 *      preferimos NO tener pin que tener un pin en el lugar equivocado.
 *      El caller puede llamar sin validador solo cuando esté seguro
 *      (usar {skipValidator: true}) — no hacerlo por default.
 */

import { isOnLand } from "../../src/lib/geo/panama-land";

const USER_AGENT =
  "MapaInteractivoInteligente/0.1 (+contacto: abilendesign@gmail.com)";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const RATE_LIMIT_MS = 1100;

let lastAt = 0;

type NominatimRow = {
  lat: string;
  lon: string;
  display_name?: string;
  address?: { country_code?: string };
};

export type NominatimResult = {
  lat: number;
  lng: number;
  displayName: string;
  distanceFromCenterKm: number | null;
};

export type NominatimOpts = {
  /** Centroide para validar proximidad. Si viene, se rechaza cualquier
   *  hit a más de `maxDistanceKm` de este punto. */
  zonaCentro?: { lat: number; lng: number } | null;
  /** Distancia máxima permitida en km (default 30). */
  maxDistanceKm?: number;
  /** Escape hatch: aceptar hits sin validator de proximidad. Solo
   *  usar cuando estemos seguros de que el nombre es único (ej.
   *  edificios famosos). NO usar por default. */
  skipValidator?: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export async function nominatimPanama(
  query: string,
  opts: NominatimOpts = {},
): Promise<NominatimResult | null> {
  const { zonaCentro, maxDistanceKm = 30, skipValidator = false } = opts;
  // Guardarraíl: sin validador de proximidad no arriesgamos. Nominatim
  // puede devolver un homónimo en otra provincia y pasar countrycodes=pa
  // + isOnLand. Preferimos no-pin sobre pin-equivocado.
  if (!zonaCentro && !skipValidator) return null;
  const elapsed = Date.now() - lastAt;
  if (elapsed < RATE_LIMIT_MS) await sleep(RATE_LIMIT_MS - elapsed);
  lastAt = Date.now();

  const url =
    `${NOMINATIM_URL}?q=${encodeURIComponent(query)}` +
    `&format=jsonv2&limit=1&countrycodes=pa&addressdetails=1`;
  let data: NominatimRow[];
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "es-PA,es;q=0.9",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    data = (await res.json()) as NominatimRow[];
  } catch {
    return null;
  }
  if (!data.length) return null;

  const row = data[0];
  const lat = Number(row.lat);
  const lng = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  // Doble validación: aunque countrycodes=pa filtre servidor-side,
  // ocasionalmente Nominatim devuelve un hit con addresstype "unclassified"
  // que no está realmente en Panamá.
  const countryOk = row.address?.country_code?.toLowerCase() === "pa";
  const landOk = isOnLand(lat, lng);
  if (!countryOk || !landOk) return null;

  // Validador de proximidad: rechaza homónimos lejanos.
  let distanceFromCenterKm: number | null = null;
  if (zonaCentro) {
    distanceFromCenterKm = haversineKm({ lat, lng }, zonaCentro);
    if (distanceFromCenterKm > maxDistanceKm) return null;
  }

  return {
    lat,
    lng,
    displayName: row.display_name ?? "",
    distanceFromCenterKm,
  };
}
