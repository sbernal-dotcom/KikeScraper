export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// Estilo 2D plano oscuro (default).
export const MAPBOX_STYLE = "mapbox://styles/mapbox/dark-v11";

// Estilo 3D: Mapbox Standard con preset nocturno aplicado por
// setConfigProperty('basemap', 'lightPreset', 'night') tras style.load.
// Trae edificios + landmarks 3D + atmósfera/cielo de fábrica.
export const MAPBOX_STYLE_3D = "mapbox://styles/mapbox/standard";

export const PANAMA_CITY_CENTER: [number, number] = [-79.5199, 8.9824];

export const PANAMA_BOUNDS: [[number, number], [number, number]] = [
  [-83.0517, 7.1986],
  [-77.1583, 9.6477],
];

export const DEFAULT_ZOOM = 11;

export const MARKER_COLOR = "#D6FF00";
export const MARKER_COLOR_ALQUILER = "#0062FF";
export const MARKER_COLOR_CLUSTER = "#EF4444";
