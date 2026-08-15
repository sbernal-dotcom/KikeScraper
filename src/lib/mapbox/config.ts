export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// Estilo 2D plano oscuro (default).
export const MAPBOX_STYLE = "mapbox://styles/mapbox/dark-v11";

// Estilo 3D: Mapbox Standard con preset nocturno aplicado por
// setConfigProperty('basemap', 'lightPreset', 'night') tras style.load.
// Trae edificios + landmarks 3D + atmósfera/cielo de fábrica.
export const MAPBOX_STYLE_3D = "mapbox://styles/mapbox/standard";

export const PANAMA_CITY_CENTER: [number, number] = [-79.5199, 8.9824];

export const DEFAULT_ZOOM = 11;

export const MARKER_COLOR = "#D6FF00";
export const MARKER_COLOR_ALQUILER = "#FF7A00";
export const MARKER_COLOR_CLUSTER = "#3B82F6";
// H15: subimos de #7a1010 a #EF4444 (Tailwind red-500). El anterior
// con opacity 0.55 sobre fondo dark quedaba casi negro (contraste <3:1,
// fallaba WCAG AA). El nuevo mantiene el "rojo apagado" pero visible.
export const MARKER_COLOR_ARCHIVED = "#EF4444";
