"use client";

import type { CategoriaPropiedad, Propiedad, TipoOperacion } from "./types";

type ScrapedRow = {
  titulo: string | null;
  precio: number | null;
  area_m2: number | null;
  habitaciones: number | null;
  banos: number | null;
  estacionamientos: number | null;
  zona: string | null;
  lat: number | null;
  lng: number | null;
  url_original: string;
  fuente: string;
  fecha_deteccion: string;
};

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
    precio: row.precio,
    moneda: "USD",
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
    imagenes: [],
    fechaPublicacion: row.fecha_deteccion,
    fechaDeteccion: row.fecha_deteccion,
    fechaActualizacion: row.fecha_deteccion,
  };
}

export async function fetchPreviewPropiedades(): Promise<Propiedad[]> {
  try {
    const res = await fetch("/scrape-preview.json", { cache: "no-store" });
    if (!res.ok) return [];
    const file = (await res.json()) as ScrapePreviewFile;
    return file.results
      .map(toPropiedad)
      .filter((p): p is Propiedad => p !== null);
  } catch {
    return [];
  }
}
