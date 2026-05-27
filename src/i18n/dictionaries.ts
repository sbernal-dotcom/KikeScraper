export type Locale = "es" | "en";

export const LOCALES: { code: Locale; label: string; short: string }[] = [
  { code: "es", label: "Español", short: "ES" },
  { code: "en", label: "English", short: "EN" },
];

export type Dictionary = {
  brand: {
    name: string;
    tagline: string;
    version: string;
    attribution: string;
  };
  nav: {
    section: string;
    section_project: string;
    map: string;
    properties: string;
    sources: string;
    analysis: string;
    about: string;
    soon: string;
    open_nav: string;
    language: string;
  };
  common: {
    of: string;
    clear: string;
    min: string;
    max: string;
    close: string;
    back: string;
    new_badge: string;
    results: string;
  };
  properties: {
    title: string;
    search_placeholder: string;
    filters: string;
    empty_state: string;
    missing_token: string;
  };
  filters: {
    operation: string;
    category: string;
    price_usd: string;
    bedrooms_min: string;
    bathrooms_min: string;
    condition: string;
    source: string;
  };
  card: {
    no_image: string;
    ai_summary: string;
    tags: string;
    tag_extra_hint: string;
    source: string;
    detected: string;
    published: string;
    view_original: string;
    per_m2: string;
    per_month: string;
    area: string;
    bedrooms: string;
    bathrooms: string;
    parking: string;
    condition_label: string;
    listing_status: string;
    also_listed_on: string;
    other_listings_count: string;
  };
  domain: {
    operation: Record<"venta" | "alquiler", string>;
    operation_short: Record<"venta" | "alquiler", string>;
    category: Record<
      | "apartamento"
      | "casa"
      | "terreno"
      | "local-comercial"
      | "oficina"
      | "galera",
      string
    >;
    condition: Record<"nueva" | "usada", string>;
    status: Record<"activo" | "vendido" | "alquilado" | "retirado", string>;
  };
  tags: Record<string, string>;
  compare: {
    add: string;
    remove: string;
    bar_count: string;
    compare_btn: string;
    clear_btn: string;
    title: string;
    subtitle_hint: string;
    field_image: string;
    field_price: string;
    field_price_m2: string;
    field_operation: string;
    field_category: string;
    field_zone: string;
    field_area: string;
    field_bedrooms: string;
    field_bathrooms: string;
    field_parking: string;
    field_tags: string;
    field_source: string;
    field_link: string;
    open_listing: string;
  };
  geocoder: { placeholder: string };
  analytics: {
    title: string;
    subtitle: string;
    column_score: string;
    column_property: string;
    column_zone: string;
    column_price: string;
    column_area: string;
    column_price_m2: string;
    column_benchmark: string;
    column_discount: string;
    column_confidence: string;
    column_source: string;
    confidence_low: string;
    confidence_medium: string;
    confidence_high: string;
    no_data: string;
    score_tier_strong: string;
    score_tier_good: string;
    score_tier_normal: string;
    score_tier_overpriced: string;
    kpi_strong_ops: string;
    kpi_strong_ops_caption: string;
    kpi_total_active: string;
    kpi_total_active_caption: string;
    kpi_avg_price_m2: string;
    kpi_avg_price_m2_caption: string;
    kpi_top_zone: string;
    kpi_top_zone_caption: string;
    filter_score_min: string;
    filter_zone: string;
  };
};

const es: Dictionary = {
  brand: {
    name: "Mapa Interactivo",
    tagline: "Inmobiliario Panamá",
    version: "v0.1.0 · alpha",
    attribution: "Geocoding © OpenStreetMap contributors",
  },
  nav: {
    section: "Navegación",
    section_project: "Proyecto",
    map: "Mapa",
    properties: "Propiedades",
    sources: "Fuentes",
    analysis: "Análisis",
    about: "Acerca de",
    soon: "Pronto",
    open_nav: "Abrir navegación",
    language: "Idioma",
  },
  common: {
    of: "de",
    clear: "Limpiar",
    min: "Mín",
    max: "Máx",
    close: "Cerrar",
    back: "Volver",
    new_badge: "Nuevo",
    results: "resultados",
  },
  properties: {
    title: "Propiedades",
    search_placeholder: "Buscar por título, zona, categoría…",
    filters: "Filtros",
    empty_state: "No hay propiedades que coincidan con los filtros aplicados.",
    missing_token:
      "Configura NEXT_PUBLIC_MAPBOX_TOKEN en .env.local para mostrar el mapa.",
  },
  filters: {
    operation: "Operación",
    category: "Categoría",
    price_usd: "Precio (USD)",
    bedrooms_min: "Recámaras (mín)",
    bathrooms_min: "Baños (mín)",
    condition: "Condición",
    source: "Fuente",
  },
  card: {
    no_image: "sin imagen",
    ai_summary: "Resumen IA",
    tags: "Características",
    tag_extra_hint: "Sugerencia automática (fuera de la lista oficial)",
    source: "Fuente",
    detected: "Detectada",
    published: "Publicada",
    view_original: "Ver anuncio original",
    per_m2: "por m²",
    per_month: "/ mes",
    area: "Área",
    bedrooms: "Recámaras",
    bathrooms: "Baños",
    parking: "Estacionamientos",
    condition_label: "Condición",
    listing_status: "Estado anuncio",
    also_listed_on: "También publicado en",
    other_listings_count: "otras fuentes",
  },
  domain: {
    operation: { venta: "en venta", alquiler: "en alquiler" },
    operation_short: { venta: "Venta", alquiler: "Alquiler" },
    category: {
      apartamento: "Apartamento",
      casa: "Casa",
      terreno: "Terreno",
      "local-comercial": "Local comercial",
      oficina: "Oficina",
      galera: "Galera",
    },
    condition: { nueva: "Nueva", usada: "Usada" },
    status: {
      activo: "Activo",
      vendido: "Vendido",
      alquilado: "Alquilado",
      retirado: "Retirado",
    },
  },
  tags: {
    piscina: "Piscina",
    gimnasio: "Gimnasio",
    "seguridad-24-7": "Seguridad 24/7",
    "area-social": "Área social",
    spa: "Spa",
    "a-estrenar": "A estrenar",
    remodelado: "Remodelado",
    "como-nuevo": "Como nuevo",
    amoblado: "Amoblado",
    "semi-amoblado": "Semi-amoblado",
    "linea-blanca": "Línea blanca",
    "aire-acondicionado": "Aire acondicionado",
    balcon: "Balcón",
    terraza: "Terraza",
    jardin: "Jardín",
    penthouse: "Penthouse",
    "vista-al-mar": "Vista al mar",
    "vista-a-la-ciudad": "Vista a la ciudad",
    ascensor: "Ascensor",
    "estacionamiento-techado": "Estacionamiento techado",
    deposito: "Depósito",
    "planta-electrica": "Planta eléctrica",
    centrico: "Céntrico",
    "frente-al-mar": "Frente al mar",
    "urbanizacion-cerrada": "Urbanización cerrada",
    "mascotas-permitidas": "Mascotas permitidas",
  },
  compare: {
    add: "Agregar a comparación",
    remove: "Quitar de comparación",
    bar_count: "{count}/{max} propiedades seleccionadas",
    compare_btn: "Comparar",
    clear_btn: "Limpiar",
    title: "Comparar propiedades",
    subtitle_hint: "Mínimo 2, máximo 3",
    field_image: "Foto",
    field_price: "Precio",
    field_price_m2: "Precio / m²",
    field_operation: "Operación",
    field_category: "Categoría",
    field_zone: "Zona",
    field_area: "Área",
    field_bedrooms: "Recámaras",
    field_bathrooms: "Baños",
    field_parking: "Estacionamientos",
    field_tags: "Características",
    field_source: "Fuente",
    field_link: "Anuncio",
    open_listing: "Abrir",
  },
  geocoder: { placeholder: "Buscar dirección o lugar…" },
  analytics: {
    title: "Analytics",
    subtitle: "Mejores oportunidades",
    column_score: "Score",
    column_property: "Propiedad",
    column_zone: "Zona",
    column_price: "Precio",
    column_area: "Área",
    column_price_m2: "$/m²",
    column_benchmark: "Promedio zona",
    column_discount: "Desc. %",
    column_confidence: "Confianza",
    column_source: "Fuente",
    confidence_low: "Baja",
    confidence_medium: "Media",
    confidence_high: "Alta",
    no_data: "Sin comparables suficientes en la zona.",
    score_tier_strong: "Oportunidad fuerte",
    score_tier_good: "Buena oportunidad",
    score_tier_normal: "Normal",
    score_tier_overpriced: "Sobrevalorado",
    kpi_strong_ops: "Oportunidades fuertes",
    kpi_strong_ops_caption: "score ≥ 70",
    kpi_total_active: "Propiedades activas",
    kpi_total_active_caption: "en análisis",
    kpi_avg_price_m2: "Precio/m² promedio",
    kpi_avg_price_m2_caption: "global",
    kpi_top_zone: "Zona más activa",
    kpi_top_zone_caption: "propiedades",
    filter_score_min: "Score mínimo",
    filter_zone: "Zona",
  },
};

const en: Dictionary = {
  brand: {
    name: "Interactive Map",
    tagline: "Panama Real Estate",
    version: "v0.1.0 · alpha",
    attribution: "Geocoding © OpenStreetMap contributors",
  },
  nav: {
    section: "Navigation",
    section_project: "Project",
    map: "Map",
    properties: "Properties",
    sources: "Sources",
    analysis: "Analytics",
    about: "About",
    soon: "Soon",
    open_nav: "Open navigation",
    language: "Language",
  },
  common: {
    of: "of",
    clear: "Clear",
    min: "Min",
    max: "Max",
    close: "Close",
    back: "Back",
    new_badge: "New",
    results: "results",
  },
  properties: {
    title: "Properties",
    search_placeholder: "Search by title, area, category…",
    filters: "Filters",
    empty_state: "No properties match the applied filters.",
    missing_token:
      "Set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local to display the map.",
  },
  filters: {
    operation: "Operation",
    category: "Category",
    price_usd: "Price (USD)",
    bedrooms_min: "Bedrooms (min)",
    bathrooms_min: "Bathrooms (min)",
    condition: "Condition",
    source: "Source",
  },
  card: {
    no_image: "no image",
    ai_summary: "AI summary",
    tags: "Features",
    tag_extra_hint: "Auto-suggested (not in the official list)",
    source: "Source",
    detected: "Detected",
    published: "Published",
    view_original: "View original listing",
    per_m2: "per m²",
    per_month: "/ month",
    area: "Area",
    bedrooms: "Bedrooms",
    bathrooms: "Bathrooms",
    parking: "Parking",
    condition_label: "Condition",
    listing_status: "Listing status",
    also_listed_on: "Also listed on",
    other_listings_count: "other sources",
  },
  domain: {
    operation: { venta: "for sale", alquiler: "for rent" },
    operation_short: { venta: "Sale", alquiler: "Rent" },
    category: {
      apartamento: "Apartment",
      casa: "House",
      terreno: "Land",
      "local-comercial": "Commercial space",
      oficina: "Office",
      galera: "Warehouse",
    },
    condition: { nueva: "New", usada: "Used" },
    status: {
      activo: "Active",
      vendido: "Sold",
      alquilado: "Rented",
      retirado: "Withdrawn",
    },
  },
  tags: {
    piscina: "Pool",
    gimnasio: "Gym",
    "seguridad-24-7": "24/7 security",
    "area-social": "Social area",
    spa: "Spa",
    "a-estrenar": "Brand new",
    remodelado: "Remodeled",
    "como-nuevo": "Like new",
    amoblado: "Furnished",
    "semi-amoblado": "Semi-furnished",
    "linea-blanca": "Appliances included",
    "aire-acondicionado": "Air conditioning",
    balcon: "Balcony",
    terraza: "Terrace",
    jardin: "Garden",
    penthouse: "Penthouse",
    "vista-al-mar": "Ocean view",
    "vista-a-la-ciudad": "City view",
    ascensor: "Elevator",
    "estacionamiento-techado": "Covered parking",
    deposito: "Storage",
    "planta-electrica": "Power generator",
    centrico: "Central location",
    "frente-al-mar": "Beachfront",
    "urbanizacion-cerrada": "Gated community",
    "mascotas-permitidas": "Pets allowed",
  },
  compare: {
    add: "Add to comparison",
    remove: "Remove from comparison",
    bar_count: "{count}/{max} properties selected",
    compare_btn: "Compare",
    clear_btn: "Clear",
    title: "Compare properties",
    subtitle_hint: "At least 2, up to 3",
    field_image: "Photo",
    field_price: "Price",
    field_price_m2: "Price / m²",
    field_operation: "Operation",
    field_category: "Category",
    field_zone: "Area",
    field_area: "Size",
    field_bedrooms: "Bedrooms",
    field_bathrooms: "Bathrooms",
    field_parking: "Parking",
    field_tags: "Features",
    field_source: "Source",
    field_link: "Listing",
    open_listing: "Open",
  },
  geocoder: { placeholder: "Search address or place…" },
  analytics: {
    title: "Analytics",
    subtitle: "Top opportunities",
    column_score: "Score",
    column_property: "Property",
    column_zone: "Area",
    column_price: "Price",
    column_area: "Size",
    column_price_m2: "$/m²",
    column_benchmark: "Area avg",
    column_discount: "Disc. %",
    column_confidence: "Confidence",
    column_source: "Source",
    confidence_low: "Low",
    confidence_medium: "Medium",
    confidence_high: "High",
    no_data: "Not enough comparables in this area.",
    score_tier_strong: "Strong opportunity",
    score_tier_good: "Good opportunity",
    score_tier_normal: "Normal",
    score_tier_overpriced: "Overpriced",
    kpi_strong_ops: "Strong opportunities",
    kpi_strong_ops_caption: "score ≥ 70",
    kpi_total_active: "Active properties",
    kpi_total_active_caption: "in analysis",
    kpi_avg_price_m2: "Avg price/m²",
    kpi_avg_price_m2_caption: "global",
    kpi_top_zone: "Most active area",
    kpi_top_zone_caption: "properties",
    filter_score_min: "Min score",
    filter_zone: "Area",
  },
};

export const dictionaries: Record<Locale, Dictionary> = { es, en };

export const DEFAULT_LOCALE: Locale = "es";
