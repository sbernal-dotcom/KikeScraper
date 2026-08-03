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
    history: string;
    scraper: string;
    soon: string;
    open_nav: string;
    language: string;
    map_view: string;
    map_view_2d: string;
    map_view_3d: string;
    last_scrape: string;
    last_scrape_new: string;
    last_scrape_updated: string;
    last_scrape_never: string;
    legend: string;
    legend_venta: string;
    legend_alquiler: string;
    legend_cluster: string;
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
    location_approximate: string;
    location_approximate_hint: string;
    unavailable_banner: string;
    unavailable_since: string;
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
    status: Record<
      | "activo"
      | "vendido"
      | "alquilado"
      | "retirado"
      | "archivado"
      | "posible_inactivo"
      | "error_verificacion",
      string
    >;
  };
  tags: Record<string, string>;
  compare: {
    add: string;
    remove: string;
    title: string;
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
  };
  scraper_info: {
    title: string;
    subtitle: string;
    kpi_active: string;
    kpi_active_caption: string;
    kpi_recent_archived: string;
    kpi_last_run: string;
    kpi_duration_caption: string;
    kpi_pipeline_cap: string;
    kpi_pipeline_cap_caption: string;
    section_pipeline: string;
    section_pipeline_hint: string;
    col_step: string;
    col_timeout: string;
    section_ai: string;
    section_ai_hint: string;
    ai_on: string;
    ai_off: string;
    ai_model: string;
    ai_usage: string;
    ai_cost: string;
    ai_env: string;
    section_sources: string;
    section_sources_hint: string;
    col_active: string;
    meta_discovery: string;
    meta_max_pages: string;
    meta_detail_concurrency: string;
    meta_pipeline_timeout: string;
    meta_internal_cap: string;
    meta_uses_groq: string;
    last_run_ago: string;
    status_ok: string;
    status_error: string;
    section_verify: string;
    section_verify_hint: string;
    verify_range: string;
    verify_state: string;
    verify_effect: string;
    verify_last: string;
    section_caches: string;
    section_caches_hint: string;
    failed_urls_breakdown: string;
    section_lifecycle: string;
    section_lifecycle_hint: string;
    lifecycle_l1: string;
    lifecycle_l2: string;
    lifecycle_l3: string;
    lifecycle_l4: string;
  };
  history: {
    title: string;
    subtitle: string;
    kpi_total_runs: string;
    kpi_total_runs_caption: string;
    kpi_ok_pct: string;
    kpi_ok_pct_caption: string;
    kpi_last_run: string;
    kpi_last_run_caption: string;
    kpi_new_today: string;
    kpi_new_today_caption: string;
    column_date: string;
    column_source: string;
    column_start: string;
    column_duration: string;
    column_status: string;
    column_found: string;
    column_inserted: string;
    column_updated: string;
    column_errors: string;
    column_archived: string;
    column_notes: string;
    status_ok: string;
    status_error: string;
    run_header_sources: string;
    run_header_total: string;
    run_header_inserted: string;
    run_header_errors: string;
    run_header_archived: string;
    no_data: string;
    minutes_short: string;
    load_error: string;
    filter_all_sources: string;
    filter_days_7: string;
    filter_days_30: string;
    filter_days_90: string;
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
    history: "Historial",
    scraper: "Scraper",
    soon: "Pronto",
    open_nav: "Abrir navegación",
    language: "Idioma",
    map_view: "Vista del mapa",
    map_view_2d: "2D",
    map_view_3d: "3D",
    last_scrape: "Último scrape",
    last_scrape_new: "nuevas",
    last_scrape_updated: "actualizadas",
    last_scrape_never: "Sin corridas aún",
    legend: "Leyenda",
    legend_venta: "Venta",
    legend_alquiler: "Alquiler",
    legend_cluster: "Varios en un punto",
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
    location_approximate: "Ubicación aproximada",
    location_approximate_hint:
      "El pin muestra el centroide de la zona — el edificio exacto no está confirmado.",
    unavailable_banner: "Ya no está disponible",
    unavailable_since: "desde",
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
      archivado: "Archivado",
      posible_inactivo: "Posiblemente inactivo",
      error_verificacion: "Error de verificación",
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
    title: "Comparación",
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
  },
  scraper_info: {
    title: "Cómo funciona el scraper",
    subtitle: "Configuración actual, fuentes activas y estado en vivo",
    kpi_active: "Propiedades activas",
    kpi_active_caption: "en el mapa hoy",
    kpi_recent_archived: "Archivadas recientes",
    kpi_last_run: "Última corrida",
    kpi_duration_caption: "duración total",
    kpi_pipeline_cap: "Cap del pipeline",
    kpi_pipeline_cap_caption: "hard timeout global",
    section_pipeline: "Pipeline diario",
    section_pipeline_hint: "orden y timeouts",
    col_step: "Paso",
    col_timeout: "Timeout",
    section_ai: "IA y servicios externos",
    section_ai_hint: "modelos, uso y costo",
    ai_on: "Activo",
    ai_off: "Off",
    ai_model: "Modelo",
    ai_usage: "Uso",
    ai_cost: "Costo",
    ai_env: "Env var",
    section_sources: "Fuentes",
    section_sources_hint: "6 sitios · scrape diario",
    col_active: "activas",
    meta_discovery: "descubrimiento",
    meta_max_pages: "páginas máx",
    meta_detail_concurrency: "concurrency",
    meta_pipeline_timeout: "timeout pipeline",
    meta_internal_cap: "cap interno",
    meta_uses_groq: "usa Groq",
    last_run_ago: "última corrida hace",
    status_ok: "OK",
    status_error: "Error",
    section_verify: "Verify (pase 2)",
    section_verify_hint: "¿siguen vivas?",
    verify_range: "Fallos consecutivos",
    verify_state: "Estado",
    verify_effect: "Efecto",
    verify_last: "Último resultado",
    section_caches: "Caches",
    section_caches_hint: "ahorran Groq + web-search",
    failed_urls_breakdown: "URLs fallidas por fuente / motivo",
    section_lifecycle: "Ciclo de vida",
    section_lifecycle_hint: "cuando una propiedad desaparece",
    lifecycle_l1:
      "El scraper (pase 1) marca como vistas las URLs que aparecen hoy.",
    lifecycle_l2:
      "Verify (pase 2) consulta las no vistas. Si dan 404/410/redirect raro, incrementa contador de fallos consecutivos.",
    lifecycle_l3:
      "Cuando una prop pasa a archivado/vendido, sigue visible en el mapa (pin rojo apagado + banner en la card) por",
    lifecycle_l4:
      "Pasado el TTL desaparece del mapa pero queda en DB como historial.",
  },
  history: {
    title: "Historial del scraper",
    subtitle: "Cada corrida por fuente: qué scrapeó y en cuánto tiempo",
    kpi_total_runs: "Corridas registradas",
    kpi_total_runs_caption: "en el rango",
    kpi_ok_pct: "% OK",
    kpi_ok_pct_caption: "sin errores duros",
    kpi_last_run: "Última corrida",
    kpi_last_run_caption: "hace",
    kpi_new_today: "Nuevas hoy",
    kpi_new_today_caption: "insertadas 24h",
    column_date: "Fecha",
    column_source: "Fuente",
    column_start: "Inicio",
    column_duration: "Duración",
    column_status: "Estado",
    column_found: "Encontradas",
    column_inserted: "Nuevas",
    column_updated: "Actualizadas",
    column_errors: "Errores",
    column_archived: "Eliminadas",
    column_notes: "Notas",
    status_ok: "OK",
    status_error: "Error",
    run_header_sources: "fuentes",
    run_header_total: "total",
    run_header_inserted: "nuevas",
    run_header_errors: "errores",
    run_header_archived: "eliminadas",
    no_data: "Aún no hay corridas registradas en el rango seleccionado.",
    minutes_short: "min",
    load_error: "No se pudo cargar el historial.",
    filter_all_sources: "Todas las fuentes",
    filter_days_7: "7 días",
    filter_days_30: "30 días",
    filter_days_90: "90 días",
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
    history: "History",
    scraper: "Scraper",
    soon: "Soon",
    open_nav: "Open navigation",
    language: "Language",
    map_view: "Map view",
    map_view_2d: "2D",
    map_view_3d: "3D",
    last_scrape: "Last scrape",
    last_scrape_new: "new",
    last_scrape_updated: "updated",
    last_scrape_never: "No runs yet",
    legend: "Legend",
    legend_venta: "For sale",
    legend_alquiler: "For rent",
    legend_cluster: "Multiple at one point",
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
    location_approximate: "Approximate location",
    location_approximate_hint:
      "The pin shows the zone centroid — the exact building is not confirmed.",
    unavailable_banner: "No longer available",
    unavailable_since: "since",
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
      archivado: "Archived",
      posible_inactivo: "Possibly inactive",
      error_verificacion: "Verification error",
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
    title: "Comparison",
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
  },
  scraper_info: {
    title: "How the scraper works",
    subtitle: "Current config, active sources and live status",
    kpi_active: "Active listings",
    kpi_active_caption: "on the map today",
    kpi_recent_archived: "Recently archived",
    kpi_last_run: "Last run",
    kpi_duration_caption: "total duration",
    kpi_pipeline_cap: "Pipeline cap",
    kpi_pipeline_cap_caption: "global hard timeout",
    section_pipeline: "Daily pipeline",
    section_pipeline_hint: "order and timeouts",
    col_step: "Step",
    col_timeout: "Timeout",
    section_ai: "AI & external services",
    section_ai_hint: "models, usage and cost",
    ai_on: "On",
    ai_off: "Off",
    ai_model: "Model",
    ai_usage: "Usage",
    ai_cost: "Cost",
    ai_env: "Env var",
    section_sources: "Sources",
    section_sources_hint: "6 sites · daily scrape",
    col_active: "active",
    meta_discovery: "discovery",
    meta_max_pages: "max pages",
    meta_detail_concurrency: "concurrency",
    meta_pipeline_timeout: "pipeline timeout",
    meta_internal_cap: "internal cap",
    meta_uses_groq: "uses Groq",
    last_run_ago: "last run",
    status_ok: "OK",
    status_error: "Error",
    section_verify: "Verify (pass 2)",
    section_verify_hint: "still live?",
    verify_range: "Consecutive fails",
    verify_state: "State",
    verify_effect: "Effect",
    verify_last: "Last result",
    section_caches: "Caches",
    section_caches_hint: "save Groq + web-search calls",
    failed_urls_breakdown: "Failed URLs by source / reason",
    section_lifecycle: "Lifecycle",
    section_lifecycle_hint: "when a listing disappears",
    lifecycle_l1: "The scraper (pass 1) marks URLs seen today as alive.",
    lifecycle_l2:
      "Verify (pass 2) checks the ones not seen. On 404/410/weird redirect it increments a consecutive-fail counter.",
    lifecycle_l3:
      "When a listing turns archived/sold, it stays on the map (dimmed red pin + card banner) for",
    lifecycle_l4:
      "Past TTL it disappears from the map but stays in DB as history.",
  },
  history: {
    title: "Scraper history",
    subtitle: "Every run per source: what it scraped and how long it took",
    kpi_total_runs: "Runs logged",
    kpi_total_runs_caption: "in range",
    kpi_ok_pct: "% OK",
    kpi_ok_pct_caption: "no hard errors",
    kpi_last_run: "Last run",
    kpi_last_run_caption: "ago",
    kpi_new_today: "New today",
    kpi_new_today_caption: "inserted 24h",
    column_date: "Date",
    column_source: "Source",
    column_start: "Start",
    column_duration: "Duration",
    column_status: "Status",
    column_found: "Found",
    column_inserted: "New",
    column_updated: "Updated",
    column_errors: "Errors",
    column_archived: "Removed",
    column_notes: "Notes",
    status_ok: "OK",
    status_error: "Error",
    run_header_sources: "sources",
    run_header_total: "total",
    run_header_inserted: "new",
    run_header_errors: "errors",
    run_header_archived: "removed",
    no_data: "No runs logged in the selected range yet.",
    minutes_short: "min",
    load_error: "Could not load history.",
    filter_all_sources: "All sources",
    filter_days_7: "7 days",
    filter_days_30: "30 days",
    filter_days_90: "90 days",
  },
};

export const dictionaries: Record<Locale, Dictionary> = { es, en };

export const DEFAULT_LOCALE: Locale = "es";
