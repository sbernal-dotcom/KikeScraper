/**
 * Validación cruzada de coordenadas contra Mapbox Geocoding.
 *
 * Estrategia A del plan de lifecycle: la tabla `zonas-panama` sigue
 * siendo la fuente PRIMARIA. Mapbox se llama solo para confirmar;
 * si el centroide que tenemos está a más de `THRESHOLD_KM` de lo que
 * Mapbox devuelve para la misma zona, se loguea un warning para que
 * revisemos manualmente. Nunca sobreescribe las coords.
 *
 * Free tier Mapbox Geocoding: 50k requests/mes. Nuestro volumen
 * (~100 props/día) cabe holgado.
 */

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Si tabla y Mapbox difieren más que esto, alertamos. 2 km cubre
// jitter razonable de centroides de corregimiento sin disparar por
// pequeñas diferencias.
const THRESHOLD_KM = 2;

// Cache por corrida: cada zona se valida una sola vez aunque aparezca
// en N anuncios.
const validatedThisRun = new Set<string>();

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function mapboxGeocode(
  query: string,
): Promise<{ lat: number; lng: number } | null> {
  if (!MAPBOX_TOKEN) return null;
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?access_token=${MAPBOX_TOKEN}&country=PA&limit=1&language=es`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{ center?: [number, number] }>;
    };
    const center = data.features?.[0]?.center;
    if (!center || center.length !== 2) return null;
    return { lng: center[0], lat: center[1] };
  } catch {
    return null;
  }
}

/**
 * Verifica nuestras `coords` contra lo que Mapbox devuelve para `zona`.
 * Solo loguea — nunca cambia las coords. Cachea por zona para no
 * repetir requests dentro de la misma corrida.
 */
export async function validarConMapbox(
  zona: string,
  coords: { lat: number; lng: number },
): Promise<void> {
  if (!MAPBOX_TOKEN) return; // sin token, skip silencioso
  const key = zona.toLowerCase().trim();
  if (validatedThisRun.has(key)) return;
  validatedThisRun.add(key);

  const mapbox = await mapboxGeocode(`${zona}, Panamá`);
  if (!mapbox) return; // Mapbox sin resultado — no penaliza nuestra coord

  const km = haversineKm(coords, mapbox);
  if (km > THRESHOLD_KM) {
    console.log(
      `    ⚠ "${zona}" — discrepancia con Mapbox: ${km.toFixed(2)} km ` +
        `(nuestro: ${coords.lat.toFixed(4)},${coords.lng.toFixed(4)} ↔ ` +
        `Mapbox: ${mapbox.lat.toFixed(4)},${mapbox.lng.toFixed(4)})`,
    );
  }
}
