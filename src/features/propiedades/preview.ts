"use client";

import { useEffect, useState } from "react";

import type {
  CategoriaPropiedad,
  Oportunidad,
  Propiedad,
  TipoOperacion,
} from "./types";

/**
 * Modo preview (lectura desde public/scrape-preview.json) es OPT-IN.
 * Por default todas las vistas leen de Supabase. Para ver el preview
 * scrapeado: agregar ?preview=1 a la URL.
 */
export function isPreviewEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const param = new URLSearchParams(window.location.search).get("preview");
  return param === "1";
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
  resumen_ia?: { es: string; en: string } | string | null;
  tags_caracteristicas?: string[] | null;
  tags_extra?: string[] | null;
  ai_source_flag?: string | null;
  url_original: string;
  fuente: string;
  fecha_deteccion: string;
  fecha_actualizacion?: string | null;
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

// Acepta el shape nuevo { es, en } y también el legacy string (resumen
// generado antes del cambio bilingüe). Si es string lo asumimos en ES y
// dejamos en vacío hasta el próximo backfill.
function normalizeResumen(
  raw: ScrapedRow["resumen_ia"],
): { es: string; en: string } | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string") return raw.trim() ? { es: raw, en: "" } : undefined;
  if (raw.es || raw.en) return { es: raw.es ?? "", en: raw.en ?? "" };
  return undefined;
}

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
  const fechaAct = row.fecha_actualizacion ?? row.fecha_deteccion;

  return {
    id: `preview:${row.url_original}`,
    titulo: row.titulo ?? "(sin título)",
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
    resumenIA: normalizeResumen(row.resumen_ia),
    tagsCaracteristicas: row.tags_caracteristicas ?? [],
    tagsExtra: row.tags_extra ?? [],
    fuenteId: row.fuente,
    fuenteNombre,
    urlOriginal: row.url_original,
    otrosAnuncios: [],
    fechaPublicacion: row.fecha_deteccion,
    fechaDeteccion: row.fecha_deteccion,
    fechaActualizacion: fechaAct,
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

/**
 * Cuenta los anuncios scrapeados visibles (mismo criterio que el mapa:
 * descarta los que no tienen lat/lng/precio). Se usa para el indicador
 * "Preview · N scrapeados" en el sidebar.
 */
export function usePreviewMeta(): { enabled: boolean; count: number } {
  const [count, setCount] = useState(0);
  const enabled = isPreviewEnabled();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchPreviewPropiedades().then((items) => {
      if (!cancelled) setCount(items.length);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { enabled, count };
}
