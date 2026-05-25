"use client";

import type {
  CategoriaPropiedad,
  Oportunidad,
  Propiedad,
  TipoOperacion,
} from "./types";

/**
 * Modo preview activo POR DEFAULT mientras estamos demostrando con
 * datos scrapeados (public/scrape-preview.json). Las 3 vistas
 * (mapa / propiedades / análisis) leen de la misma fuente.
 * Para volver a Supabase: usar ?preview=0 explícitamente.
 */
export function isPreviewEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const param = new URLSearchParams(window.location.search).get("preview");
  if (param === "0") return false;
  return true;
}

type ScrapedRow = {
  titulo: string | null;
  precio: number | null;
  moneda?: "USD" | "PAB" | null;
  area_m2: number | null;
  habitaciones: number | null;
  banos: number | null;
  estacionamientos: number | null;
  zona: string | null;
  lat: number | null;
  lng: number | null;
  descripcion?: string | null;
  imagen?: string | null;
  vendedor?: string | null;
  url_original: string;
  fuente: string;
  fecha_deteccion: string;
};

function buildDescripcion(row: ScrapedRow): string | undefined {
  const parts: string[] = [];
  if (row.vendedor) parts.push(`Vendedor: ${row.vendedor}`);
  if (row.descripcion) parts.push(row.descripcion);
  return parts.length ? parts.join(" · ") : undefined;
}

type ScrapePreviewFile = {
  generated_at: string;
  fuente: string;
  results: ScrapedRow[];
};

const FUENTE_NOMBRES: Record<string, string> = {
  encuentra24: "Encuentra24",
  compreoalquile: "CompreOalquile",
  inmuebles24: "Inmuebles24",
};

function categoriaFromUrl(url: string): CategoriaPropiedad {
  if (url.includes("-apartamentos")) return "apartamento";
  if (url.includes("-casas")) return "casa";
  if (url.includes("lotes-y-terrenos") || url.includes("-terrenos"))
    return "terreno";
  if (url.includes("-locales") || url.includes("local-comercial"))
    return "local-comercial";
  if (url.includes("-oficinas")) return "oficina";
  if (url.includes("-galeras")) return "galera";
  return "apartamento";
}

function tipoOperacionFromUrl(url: string): TipoOperacion {
  if (url.includes("alquiler") || url.includes("renta")) return "alquiler";
  return "venta";
}

function toPropiedad(row: ScrapedRow): Propiedad | null {
  if (row.lat === null || row.lng === null) return null;
  if (row.precio === null) return null;

  const fuenteNombre = FUENTE_NOMBRES[row.fuente] ?? row.fuente;

  return {
    id: `preview:${row.url_original}`,
    titulo: row.titulo ?? "(sin título)",
    descripcion: buildDescripcion(row),
    precio: row.precio,
    moneda: row.moneda ?? "USD",
    tipoOperacion: tipoOperacionFromUrl(row.url_original),
    categoria: categoriaFromUrl(row.url_original),
    ubicacion: {
      lat: row.lat,
      lng: row.lng,
      corregimiento: row.zona ?? undefined,
    },
    areaM2: row.area_m2 ?? undefined,
    habitaciones: row.habitaciones ?? undefined,
    banos: row.banos ?? undefined,
    estacionamientos: row.estacionamientos ?? undefined,
    estadoAnuncio: "activo",
    fuenteId: row.fuente,
    fuenteNombre,
    urlOriginal: row.url_original,
    otrosAnuncios: [],
    imagenes: row.imagen ? [row.imagen] : [],
    fechaPublicacion: row.fecha_deteccion,
    fechaDeteccion: row.fecha_deteccion,
    fechaActualizacion: row.fecha_deteccion,
  };
}

async function fetchPreviewFile(): Promise<ScrapePreviewFile | null> {
  try {
    const res = await fetch("/scrape-preview.json", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as ScrapePreviewFile;
  } catch {
    return null;
  }
}

export async function fetchPreviewPropiedades(): Promise<Propiedad[]> {
  const file = await fetchPreviewFile();
  if (!file) return [];
  return file.results
    .map(toPropiedad)
    .filter((p): p is Propiedad => p !== null);
}

function toOportunidad(row: ScrapedRow): Oportunidad | null {
  if (row.precio === null || row.area_m2 === null || row.area_m2 <= 0)
    return null;
  const fuenteNombre = FUENTE_NOMBRES[row.fuente] ?? row.fuente;
  return {
    id: `preview:${row.url_original}`,
    titulo: row.titulo ?? "(sin título)",
    precio: row.precio,
    moneda: row.moneda ?? "USD",
    areaM2: row.area_m2,
    precioM2: row.precio / row.area_m2,
    tipoOperacion: tipoOperacionFromUrl(row.url_original),
    categoria: categoriaFromUrl(row.url_original),
    estadoAnuncio: "activo",
    corregimiento: row.zona ?? undefined,
    fuenteId: row.fuente,
    fuenteNombre,
    urlOriginal: row.url_original,
    fechaDeteccion: row.fecha_deteccion,
    nComparables: null,
    avgPrecioM2: null,
    medianPrecioM2: null,
    benchmark: null,
    descuentoPct: null,
    opportunityScore: null,
    confianza: "baja",
    otrosAnuncios: [],
  };
}

export async function fetchPreviewOportunidades(): Promise<Oportunidad[]> {
  const file = await fetchPreviewFile();
  if (!file) return [];
  return file.results
    .map(toOportunidad)
    .filter((o): o is Oportunidad => o !== null);
}
