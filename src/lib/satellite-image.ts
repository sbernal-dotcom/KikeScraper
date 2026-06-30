/**
 * Genera URL de imagen satelital de Mapbox Static API.
 *
 * No guardamos nada en DB ni en storage — la URL es determinística por
 * (lat, lng, zoom, size, style). El browser la cachea agresivamente,
 * y el CDN de Mapbox también, así que la mayoría de views NO cuentan
 * como request nuevo en el free tier (50k req/mes).
 *
 * Razón: ningún portal panameño nos permite re-publicar sus fotos (ToS
 * y derechos de autor). En lugar de jugar con eso, mostramos una vista
 * satelital del LUGAR — más útil que una foto cualquiera porque el
 * usuario ve el contexto (cerca del mar? con vista? avenidas?).
 */

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// satellite-streets-v12 = satélite + calles y nombres encima. Mejor
// que satellite-v9 (solo satélite, sin contexto). Para hero grandes
// quizás v9 se ve más limpio — exponemos `style` por si lo queremos.
type SatStyle = "satellite-streets-v12" | "satellite-v9";

export type SatelliteOptions = {
  /** Ancho en px (max 1280). Default 480. */
  width?: number;
  /** Alto en px (max 1280). Default 320. */
  height?: number;
  /** Zoom 0-22. 16 = manzanas, 17 = edificio, 18-19 = building close. Default 17. */
  zoom?: number;
  /** Estilo del basemap. Default satellite-streets-v12. */
  style?: SatStyle;
  /** Pinear un marker rojo en el centro. Default true. */
  pin?: boolean;
  /** Densidad: 1x o 2x para retina. Default 1 (suficiente y barato). */
  retina?: boolean;
};

export function satelliteUrl(
  lat: number,
  lng: number,
  opts: SatelliteOptions = {},
): string {
  const {
    width = 480,
    height = 320,
    // 16 (era 17) muestra ~media manzana, da contexto del barrio sin
    // pixelarse. 17 mostraba solo el edificio y se veía borroso.
    zoom = 16,
    style = "satellite-streets-v12",
    pin = true,
    // Retina @2x da 4x más píxeles. Mismo costo de quota (1 req), pero
    // se ve sharp en pantallas modernas. Mapbox tier free aguanta bien.
    retina = true,
  } = opts;
  if (!TOKEN) return "";
  const overlay = pin ? `pin-s+ff1f17(${lng},${lat})/` : "";
  const density = retina ? "@2x" : "";
  return (
    `https://api.mapbox.com/styles/v1/mapbox/${style}/static/` +
    `${overlay}${lng},${lat},${zoom},0/` +
    `${width}x${height}${density}?access_token=${TOKEN}`
  );
}
