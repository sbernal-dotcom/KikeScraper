/**
 * Centroides verificados a mano para corregimientos y zonas comunes de Panamá.
 *
 * ¿Por qué? Nominatim (OpenStreetMap) muchas veces devuelve el centroide
 * geométrico del polígono, que NO coincide con donde la gente "ubica" el barrio.
 * Ej. "Costa del Este" en Nominatim cae al borde costero (~9.0132, -79.4681),
 * pero el área residencial real está en (~9.0017, -79.4778).
 *
 * Esta tabla es la fuente PRIMARIA del geocoding. Nominatim queda como fallback
 * para zonas nuevas que aún no estén aquí.
 *
 * Cuando una zona nueva aparezca en los logs como "geocode → Nominatim fallback",
 * agregarla aquí con coords verificadas en Google Maps / Mapbox.
 *
 * El match es case-insensitive y se normaliza acentos (Santa María == Santa Maria).
 */

export type ZonaCentro = { lat: number; lng: number };

export const ZONAS_PANAMA: Record<string, ZonaCentro> = {
  // Ciudad de Panamá — corregimientos residenciales clave
  "casco viejo": { lat: 8.9519, lng: -79.535 },
  "san felipe": { lat: 8.9519, lng: -79.535 },
  calidonia: { lat: 8.9665, lng: -79.5318 },
  "avenida balboa": { lat: 8.9747, lng: -79.5292 },
  marbella: { lat: 8.9786, lng: -79.5224 },
  obarrio: { lat: 8.9858, lng: -79.5269 },
  "bella vista": { lat: 8.9824, lng: -79.53 },
  "el cangrejo": { lat: 8.9869, lng: -79.5275 },
  "san francisco": { lat: 8.9853, lng: -79.5167 },
  "punta paitilla": { lat: 8.9809, lng: -79.5189 },
  "punta pacífica": { lat: 8.975, lng: -79.5078 },
  "punta pacifica": { lat: 8.975, lng: -79.5078 },
  "coco del mar": { lat: 8.9777, lng: -79.4900 },
  // Costa del Este: el barrio residencial real está al NORTE del Corredor Sur.
  // El centroide 9.0017,-79.4778 caía cerca de la bahía. Verificado contra
  // landmarks (Town Center Costa del Este).
  "costa del este": { lat: 9.0140, lng: -79.4720 },
  "parque lefevre": { lat: 9.0095, lng: -79.476 },
  "río abajo": { lat: 9.0136, lng: -79.5028 },
  "rio abajo": { lat: 9.0136, lng: -79.5028 },
  "santa maría": { lat: 9.0307, lng: -79.4783 },
  "santa maria": { lat: 9.0307, lng: -79.4783 },
  "condado del rey": { lat: 9.0286, lng: -79.5239 },
  betania: { lat: 9.0085, lng: -79.5333 },
  "ricardo j. alfaro": { lat: 9.0167, lng: -79.5275 },
  "ricardo j alfaro": { lat: 9.0167, lng: -79.5275 },
  ancón: { lat: 8.9619, lng: -79.5567 },
  ancon: { lat: 8.9619, lng: -79.5567 },
  clayton: { lat: 8.9907, lng: -79.5775 },
  albrook: { lat: 8.9722, lng: -79.5564 },
  pedregal: { lat: 9.0436, lng: -79.5006 },
  "juan diaz": { lat: 9.0408, lng: -79.473 },
  "juan díaz": { lat: 9.0408, lng: -79.473 },
  "urbanización don bosco": { lat: 9.0560, lng: -79.4892 },
  "urbanizacion don bosco": { lat: 9.0560, lng: -79.4892 },
  "don bosco": { lat: 9.0560, lng: -79.4892 },
  // Vía España es una avenida, no un corregimiento — usamos el tramo
  // central (zona Bella Vista / El Cangrejo). Nominatim a veces devuelve
  // un punto raro fuera del área.
  "vía españa": { lat: 9.0014, lng: -79.5253 },
  "via espana": { lat: 9.0014, lng: -79.5253 },
  "via españa": { lat: 9.0014, lng: -79.5253 },
  "vía porras": { lat: 8.9844, lng: -79.5108 },
  "via porras": { lat: 8.9844, lng: -79.5108 },
  // "El Dorado" (centro comercial / barrio en Betania) — Nominatim cae
  // en Chiriquí por un caserío homónimo.
  "el dorado": { lat: 9.0034, lng: -79.5363 },
  // "Llano Bonito" (corregimiento de Juan Díaz, Ciudad de Panamá) —
  // Nominatim cae en Coclé por un pueblo homónimo.
  "llano bonito": { lat: 9.0383, lng: -79.4830 },
  // "La Locería" (corregimiento de Bethania) — el Nominatim acertó,
  // pero la anclamos para evitar dependencias futuras.
  "la locería": { lat: 8.9940, lng: -79.5359 },
  "la loceria": { lat: 8.9940, lng: -79.5359 },
  "villa de las fuentes": { lat: 9.0222, lng: -79.5378 },
  "panamá pacífico": { lat: 8.9248, lng: -79.6049 },
  "panama pacifico": { lat: 8.9248, lng: -79.6049 },

  // "Cerro Azul" (corregimiento E de Ciudad de Panamá, urbanización
  // residencial en la cordillera) — Nominatim cae en Cerro Azul de
  // Chiriquí (~8.79, -82.40), 400 km al oeste.
  "cerro azul": { lat: 9.1989, lng: -79.4127 },
  // "Veracruz" (corregimiento costero de Arraiján) — Nominatim a veces
  // acertaba con el área pero el hit era impreciso. Anclamos al centro
  // de la playa.
  veracruz: { lat: 8.8917, lng: -79.6250 },

  // Fuera de Ciudad de Panamá (interior y costa)
  // Antón (cabecera del distrito en Coclé) — Nominatim cae en zona
  // del Canal por un Antón homónimo.
  antón: { lat: 8.4022, lng: -80.2575 },
  anton: { lat: 8.4022, lng: -80.2575 },
  // Buenaventura (resort en Río Hato, distrito de Antón) — anuncios
  // de lujo lo usan como zona.
  buenaventura: { lat: 8.4250, lng: -80.2030 },
  "bajo boquete": { lat: 8.7833, lng: -82.4333 },
  "el valle": { lat: 8.6025, lng: -80.1142 },
  "el valle de antón": { lat: 8.6025, lng: -80.1142 },
  "el valle de anton": { lat: 8.6025, lng: -80.1142 },
  coronado: { lat: 8.5333, lng: -79.9667 },
  chame: { lat: 8.6333, lng: -79.7167 },
  arraiján: { lat: 8.9519, lng: -79.6675 },
  arraijan: { lat: 8.9519, lng: -79.6675 },
  "la chorrera": { lat: 8.8806, lng: -79.7833 },
  boquete: { lat: 8.7833, lng: -82.4333 },
  david: { lat: 8.4333, lng: -82.4333 },
  pedasí: { lat: 7.5333, lng: -80.0333 },
  pedasi: { lat: 7.5333, lng: -80.0333 },
};

function normalizeKey(zona: string): string {
  return zona
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/\s+/g, " ") // colapsa espacios múltiples
    .trim();
}

/**
 * Busca una zona conocida en la tabla. Match case+accent-insensitive.
 * Devuelve null si no está mapeada — el caller debe usar Nominatim como fallback.
 */
export function centroFromTable(zona: string | null): ZonaCentro | null {
  if (!zona) return null;
  const key = normalizeKey(zona);
  // intento exacto
  const direct = ZONAS_PANAMA[zona.toLowerCase()] ?? null;
  if (direct) return direct;
  // intento normalizado contra TODAS las keys también normalizadas
  for (const [k, v] of Object.entries(ZONAS_PANAMA)) {
    if (normalizeKey(k) === key) return v;
  }
  return null;
}

/**
 * Offset determinístico (mismo seed → mismas coords) dentro de un radio.
 * Sirve para que varios anuncios en la misma zona no se superpongan
 * exactamente en el centroide. Como es determinístico por URL, la posición
 * del mismo anuncio NO cambia entre corridas — sólo se separa de sus
 * vecinos dentro de la zona.
 *
 * Radio default: ~120 m (≈0.0012° en Panamá). Pequeño a propósito para
 * que el jitter NO empuje pines fuera del corregimiento ni a la costa.
 */
export function jitterCoords(
  center: ZonaCentro,
  seed: string,
  radiusDeg = 0.0012,
): ZonaCentro {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  const angle = ((h >>> 0) % 1000) / 1000 * Math.PI * 2;
  const r = (((h >>> 10) >>> 0) % 1000) / 1000 * radiusDeg;
  return {
    lat: center.lat + Math.sin(angle) * r,
    lng: center.lng + Math.cos(angle) * r,
  };
}
