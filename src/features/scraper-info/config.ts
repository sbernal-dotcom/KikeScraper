/**
 * Configuración estática del pipeline y de cada scraper.
 *
 * Fuente de verdad para los valores mostrados en /scraper. Mantener
 * sincronizado con:
 *   - scripts/run-pipeline.sh (timeouts globales por paso)
 *   - scripts/scrapers/scraper-*.ts (MAX_PAGES, CONCURRENCY, MAX_RUNTIME)
 *   - scripts/scrapers/verificar-estado.ts (umbrales lifecycle)
 *
 * Si tocás los scripts, tocá también estos números.
 */

export const PIPELINE_CONFIG = {
  globalTimeoutMin: 180, // 3h
  steps: [
    { key: "encuentra24", label: "Encuentra24", timeoutMin: 30, order: 1 },
    { key: "acobir", label: "Acobir (proyectos nuevos)", timeoutMin: 10, order: 2 },
    { key: "panamaequity", label: "Panama Equity", timeoutMin: 10, order: 3 },
    { key: "mlsacobir", label: "MLS Acobir", timeoutMin: 45, order: 4 },
    { key: "savitat", label: "Savitat", timeoutMin: 25, order: 5 },
    { key: "verify", label: "Verify (pase 2: ¿siguen vivas?)", timeoutMin: 30, order: 6 },
    { key: "inmopanama", label: "InmoPanama (agregador)", timeoutMin: 50, order: 7 },
    { key: "dedupe", label: "Dedupe cross-source", timeoutMin: 10, order: 8 },
    { key: "archivar-en-mar", label: "Archivar pines en mar", timeoutMin: 10, order: 9 },
    { key: "limpiar-cache", label: "Limpiar cache duplicado", timeoutMin: 10, order: 10 },
    { key: "presunta-venta", label: "Marcar presuntas ventas", timeoutMin: 10, order: 11 },
    { key: "alerta", label: "Auto-alerta por email", timeoutMin: 10, order: 12 },
  ],
} as const;

export type FuenteId =
  | "encuentra24"
  | "acobir"
  | "panamaequity"
  | "mlsacobir"
  | "savitat"
  | "inmopanama";

export type FuenteInfo = {
  id: FuenteId;
  nombre: string;
  descripcion: string;
  sitio: string;
  discovery: "listado" | "sitemap" | "listados-multi";
  maxPages: number | null; // null = usa sitemap
  detailConcurrency: number;
  upsertConcurrency: number;
  maxRuntimeMin: number | null; // null = no hay cap interno
  timeoutMinPipeline: number;
  usaGroq: boolean;
  usaPlaywright: boolean;
};

export const FUENTES: FuenteInfo[] = [
  {
    id: "encuentra24",
    nombre: "Encuentra24",
    descripcion: "Portal general Panamá. Alta prioridad para dedupe (listing más amplio).",
    sitio: "https://www.encuentra24.com",
    discovery: "listados-multi",
    maxPages: 20,
    detailConcurrency: 3,
    upsertConcurrency: 5,
    maxRuntimeMin: null,
    timeoutMinPipeline: 30,
    usaGroq: true,
    usaPlaywright: true,
  },
  {
    id: "acobir",
    nombre: "Acobir (proyectos nuevos)",
    descripcion: "Cámara de bienes raíces — solo proyectos brand-new.",
    sitio: "https://www.acobir.com",
    discovery: "listado",
    maxPages: 10,
    detailConcurrency: 3,
    upsertConcurrency: 5,
    maxRuntimeMin: null,
    timeoutMinPipeline: 10,
    usaGroq: true,
    usaPlaywright: false,
  },
  {
    id: "panamaequity",
    nombre: "Panama Equity",
    descripcion: "Bróker boutique — inventario curado.",
    sitio: "https://www.panamaequity.com",
    discovery: "listado",
    maxPages: 25,
    detailConcurrency: 3,
    upsertConcurrency: 5,
    maxRuntimeMin: null,
    timeoutMinPipeline: 10,
    usaGroq: true,
    usaPlaywright: false,
  },
  {
    id: "mlsacobir",
    nombre: "MLS Acobir",
    descripcion: "Sistema MLS gremial verificado. Bloqueado desde IP Railway — a veces falla el preflight.",
    sitio: "https://mlsacobir.com",
    discovery: "listado",
    maxPages: 100,
    detailConcurrency: 3,
    upsertConcurrency: 5,
    maxRuntimeMin: null,
    timeoutMinPipeline: 45,
    usaGroq: true,
    usaPlaywright: false,
  },
  {
    id: "savitat",
    nombre: "Savitat (CBRE afiliado)",
    descripcion: "Alta confianza — publica zona en streetAddress. Zone-fallback ON.",
    sitio: "https://savitat.com",
    discovery: "sitemap",
    maxPages: null,
    detailConcurrency: 1,
    upsertConcurrency: 5,
    maxRuntimeMin: 60,
    timeoutMinPipeline: 25,
    usaGroq: true,
    usaPlaywright: false,
  },
  {
    id: "inmopanama",
    nombre: "InmoPanama (agregador)",
    descripcion: "Agregador — sin lat/lng en source, 100% pipeline geocoding. Zone-fallback ON.",
    sitio: "https://www.inmopanama.com",
    discovery: "listados-multi",
    maxPages: 50,
    detailConcurrency: 1,
    upsertConcurrency: 5,
    maxRuntimeMin: 45,
    timeoutMinPipeline: 50,
    usaGroq: true,
    usaPlaywright: true,
  },
];

export const VERIFY_CONFIG = {
  descripcion:
    "Pase 2 del lifecycle. Consulta cada URL no vista en el pase 1 (scrapers) para saber si sigue viva. Detecta 404/410/redirect a página de 'no disponible' y va incrementando un contador de fallos consecutivos por propiedad.",
  umbrales: [
    { rango: "0–2 fallos", estado: "activo", descripcion: "Sigue apareciendo o volvió a aparecer" },
    { rango: "3–6 fallos", estado: "posible_inactivo", descripcion: "Marcada como sospechosa, aún visible" },
    { rango: "≥7 fallos", estado: "archivado", descripcion: "Retirada del mapa (queda en DB como historial)" },
  ],
};

export const CACHES = {
  iaExtract: {
    tabla: "ia_extract_cache",
    descripcion:
      "SHA-256(titulo+desc) → resultado de Groq. Evita re-preguntar la misma cadena. Sin TTL — el edificio no cambia.",
  },
  urlsFallidas: {
    tabla: "urls_fallidas_cache",
    descripcion:
      "URLs que fallaron en un intento anterior (sin_geo, 404, timeout). TTL 30 días: pasado ese plazo se re-intenta (por si el sitio arregló su lado).",
  },
  edificioCoords: {
    tabla: "edificio_coords_cache",
    descripcion:
      "Nombre de edificio/proyecto → (lat, lng, source). Evita re-buscar en Nominatim/web para cada URL del mismo edificio.",
  },
};

export const LIFECYCLE_TTL_DIAS_MAPA = 3;

export type IAServicio = {
  nombre: string;
  proveedor: string;
  modelo: string | null;
  proposito: string;
  usoEnPipeline: string;
  costoEstimado: string;
  activo: boolean;
  activoNota?: string;
  envVar: string;
  docsUrl: string;
};

export const IA_SERVICIOS: IAServicio[] = [
  {
    nombre: "Groq",
    proveedor: "Groq Cloud",
    modelo: "llama-3.1-8b-instant",
    proposito: "Extraer edificio, proyecto y zona del título + descripción del anuncio.",
    usoEnPipeline:
      "Se llama 1 vez por URL nueva (con cache SHA-256 titulo+desc). Todos los scrapers lo usan.",
    costoEstimado: "$0 · free tier (6000 tokens/min, 14400 req/día)",
    activo: true,
    envVar: "GROQ_API_KEY",
    docsUrl: "https://console.groq.com",
  },
  {
    nombre: "Google Gemini",
    proveedor: "Google AI Studio",
    modelo: "gemini-flash-lite-latest",
    proposito:
      "Generar resumen bilingüe ES/EN y tags de características para cada anuncio.",
    usoEnPipeline:
      "Deshabilitado en producción. Cuando esté ON, se llama 1 vez por URL nueva.",
    costoEstimado: "$0 · free tier",
    activo: false,
    activoNota: "AI_SUMMARY_ENABLED=false — se prende cuando queramos resúmenes",
    envVar: "GEMINI_API_KEY",
    docsUrl: "https://ai.google.dev",
  },
  {
    nombre: "Mapbox",
    proveedor: "Mapbox",
    modelo: null,
    proposito:
      "Renderizar el mapa interactivo, imágenes satelitales en cards y geocoder de búsqueda.",
    usoEnPipeline:
      "Frontend only. No corre en el scraper — se llama desde el navegador del user.",
    costoEstimado: "$0 · free tier (50k map loads/mes)",
    activo: true,
    envVar: "NEXT_PUBLIC_MAPBOX_TOKEN",
    docsUrl: "https://mapbox.com",
  },
  {
    nombre: "Nominatim (OSM)",
    proveedor: "OpenStreetMap",
    modelo: null,
    proposito:
      "Geocoding backup cuando la tabla ZONAS_PANAMA no tiene la zona.",
    usoEnPipeline:
      "Se llama solo si el edificio/zona no se resuelve por tabla local ni cache.",
    costoEstimado: "$0 · gratis (rate limit: 1 req/s)",
    activo: true,
    envVar: "—",
    docsUrl: "https://nominatim.org",
  },
  {
    nombre: "Resend",
    proveedor: "Resend",
    modelo: null,
    proposito:
      "Enviar el email de auto-alerta al final del cron si hay anomalías.",
    usoEnPipeline:
      "Se llama 1 vez al final del pipeline si hay ≥1 anomalía. Silencio si todo OK.",
    costoEstimado: "$0 · free tier (3000 emails/mes)",
    activo: true,
    envVar: "RESEND_API_KEY",
    docsUrl: "https://resend.com",
  },
];

