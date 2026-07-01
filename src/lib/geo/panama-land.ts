/**
 * Validación tierra/mar para coordenadas dentro del bbox de Panamá.
 *
 * Los pines en el mar aparecen porque el buscador web devuelve coords
 * de miradores, hoteles turísticos o listings con coord aproximada que
 * caen fuera del contorno costero (caso 2026-06-28: wanderlog devolvió
 * mirador de "PH Sky View" en Punta Chame → cayó en el mar).
 *
 * Enfoque híbrido:
 *   1. Point-in-polygon contra el contorno CONTINENTAL de Panamá
 *      (Natural Earth simplificado, ~50 puntos). Captura la ciudad de
 *      Panamá y el interior con buena precisión.
 *   2. Fallback whitelist: si el punto está a ≤LANDMARK_RADIUS_KM de
 *      alguna ciudad/playa conocida, lo aceptamos. Esto cubre zonas
 *      costeras (Coronado, Chame, Rio Hato, Colón, Pedasí, Bocas)
 *      donde el polígono grueso rechaza puntos legítimos.
 *
 * Rechaza claramente:
 *   - Coords en mar abierto (lejos del polígono Y lejos de landmarks)
 *   - Coords en lagos grandes
 *   - Coords fuera del país
 *
 * Trade-off aceptado: puede aceptar coords a <10 km de la costa aunque
 * caigan en agua. Preferimos ese falso positivo sobre rechazar props
 * legítimas en playa (que en Panamá son comunes en el inventario).
 */

const BBOX = { latMin: 7.0, latMax: 9.7, lngMin: -83.0, lngMax: -77.0 };

// Contorno continental de Panamá — [lng, lat] pairs.
// Fuente: https://github.com/johan/world.geo.json/blob/master/countries/PAN.geo.json
const PANAMA_CONTINENTAL: Array<[number, number]> = [
  [-77.881571, 7.223771],
  [-78.214936, 7.512255],
  [-78.429161, 8.052041],
  [-78.182096, 8.319182],
  [-78.435465, 8.387705],
  [-78.622121, 8.718124],
  [-79.120307, 8.996092],
  [-79.557877, 8.932375],
  [-79.760578, 8.584515],
  [-80.164481, 8.333316],
  [-80.382659, 8.298409],
  [-80.480689, 8.090308],
  [-80.00369, 7.547524],
  [-80.276671, 7.419754],
  [-80.421158, 7.271572],
  [-80.886401, 7.220541],
  [-81.059543, 7.817921],
  [-81.189716, 7.647906],
  [-81.519515, 7.70661],
  [-81.721311, 8.108963],
  [-82.131441, 8.175393],
  [-82.390934, 8.292362],
  [-82.820081, 8.290864],
  [-82.850958, 8.073823],
  [-82.965783, 8.225028],
  [-82.913176, 8.423517],
  [-82.829771, 8.626295],
  [-82.868657, 8.807266],
  [-82.719183, 8.925709],
  [-82.927155, 9.07433],
  [-82.932891, 9.476812],
  [-82.546196, 9.566135],
  [-82.187123, 9.207449],
  [-82.207586, 8.995575],
  [-81.808567, 8.950617],
  [-81.714154, 9.031955],
  [-81.439287, 8.786234],
  [-80.947302, 8.858504],
  [-80.521901, 9.111072],
  [-79.9146, 9.312765],
  [-79.573303, 9.61161],
  [-79.021192, 9.552931],
  [-79.05845, 9.454565],
  [-78.500888, 9.420459],
  [-78.055928, 9.24773],
  [-77.729514, 8.946844],
  [-77.353361, 8.670505],
  [-77.474723, 8.524286],
  [-77.242566, 7.935278],
  [-77.431108, 7.638061],
  [-77.753414, 7.70984],
  [-77.881571, 7.223771],
];

// Landmarks costeros / interior que el polígono simplificado no captura.
// Un punto se considera "tierra" si está a ≤LANDMARK_RADIUS_KM de alguno.
// Solo agregar puntos habitables reales (donde puede haber propiedades).
const LANDMARKS: Array<{ name: string; lat: number; lng: number }> = [
  // Panamá metropolitana — el polígono simplificado no captura bien
  // el borde del Canal (Amador, Balboa, Playa Bonita, Clayton).
  { name: "Panamá City centro", lat: 8.9824, lng: -79.5199 },
  { name: "Amador Causeway", lat: 8.9159, lng: -79.531 },
  { name: "Playa Bonita", lat: 8.898, lng: -79.575 },
  // Pacífico central — costa de playas
  { name: "Coronado", lat: 8.5427, lng: -79.95 },
  { name: "Nueva Gorgona", lat: 8.5347, lng: -79.8942 },
  { name: "San Carlos", lat: 8.4667, lng: -79.95 },
  { name: "Chame", lat: 8.6553, lng: -79.7118 },
  { name: "Punta Chame", lat: 8.63, lng: -79.6883 },
  { name: "Rio Hato / Farallón", lat: 8.38, lng: -80.1706 },
  { name: "Bijao", lat: 8.4167, lng: -80.15 },
  { name: "Playa Blanca", lat: 8.4, lng: -80.14 },
  // Península de Azuero
  { name: "Chitré", lat: 7.9647, lng: -80.43 },
  { name: "Las Tablas", lat: 7.7681, lng: -80.2803 },
  { name: "Pedasí", lat: 7.5391, lng: -80.0361 },
  { name: "Playa Venao", lat: 7.43, lng: -80.19 },
  { name: "Playa Corona / San Carlos oeste", lat: 7.64, lng: -81.26 },
  // Chiriquí
  { name: "David", lat: 8.4269, lng: -82.4326 },
  { name: "Boquete", lat: 8.7794, lng: -82.4353 },
  { name: "Volcán", lat: 8.7792, lng: -82.6386 },
  { name: "Puerto Armuelles", lat: 8.28, lng: -82.87 },
  // Atlántico
  { name: "Colón", lat: 9.355, lng: -79.9027 },
  { name: "Portobelo", lat: 9.5556, lng: -79.6553 },
  // Bocas
  { name: "Bocas del Toro", lat: 9.3406, lng: -82.2411 },
  { name: "Almirante", lat: 9.2914, lng: -82.3808 },
  // Islas urbanizadas del Pacífico
  { name: "Taboga", lat: 8.7895, lng: -79.5607 },
  { name: "Contadora", lat: 8.628, lng: -79.031 },
  { name: "Sabogá", lat: 8.6167, lng: -79.0667 },
];

const LANDMARK_RADIUS_KM = 10;

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function pointInPolygon(
  lng: number,
  lat: number,
  poly: Array<[number, number]>,
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * True si la coordenada representa una ubicación de tierra habitable
 * en Panamá. False si probablemente cae en el mar o fuera del país.
 */
export function isOnLand(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (
    lat < BBOX.latMin ||
    lat > BBOX.latMax ||
    lng < BBOX.lngMin ||
    lng > BBOX.lngMax
  )
    return false;
  if (pointInPolygon(lng, lat, PANAMA_CONTINENTAL)) return true;
  for (const l of LANDMARKS) {
    if (haversineKm(lat, lng, l.lat, l.lng) <= LANDMARK_RADIUS_KM) return true;
  }
  return false;
}
