"use client";

import { createClient } from "@/lib/supabase/client";

import type {
  AnuncioAdicional,
  CategoriaPropiedad,
  Condicion,
  EstadoAnuncio,
  Moneda,
  Propiedad,
  TipoOperacion,
} from "./types";

type DbAnuncio = {
  id: string;
  fuente_id: string;
  url_original: string;
  precio: number | null;
  moneda: Moneda | null;
  fecha_deteccion: string | null;
  fuente: { id: string; nombre: string } | null;
};

type DbPropiedad = {
  id: string;
  titulo: string;
  descripcion: string | null;
  precio: number | string;
  moneda: Moneda;
  tipo_operacion: TipoOperacion;
  categoria: CategoriaPropiedad;
  condicion: Condicion | null;
  estado_anuncio: EstadoAnuncio;
  lat: number;
  lng: number;
  direccion: string | null;
  provincia: string | null;
  distrito: string | null;
  corregimiento: string | null;
  area_m2: number | string | null;
  habitaciones: number | null;
  banos: number | null;
  estacionamientos: number | null;
  resumen_ia: string | null;
  fuente_id: string;
  url_original: string;
  imagenes: string[] | null;
  fecha_publicacion: string | null;
  fecha_deteccion: string;
  fecha_actualizacion: string;
  fuente: { id: string; nombre: string } | null;
  anuncios: DbAnuncio[] | null;
};

function toNumber(v: number | string | null | undefined): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : undefined;
}

function mapAnuncio(a: DbAnuncio): AnuncioAdicional {
  return {
    fuenteId: a.fuente_id,
    fuenteNombre: a.fuente?.nombre ?? a.fuente_id,
    urlOriginal: a.url_original,
    precio: toNumber(a.precio),
    moneda: a.moneda ?? undefined,
    fechaDeteccion: a.fecha_deteccion ?? undefined,
  };
}

function mapPropiedad(p: DbPropiedad): Propiedad {
  return {
    id: p.id,
    titulo: p.titulo,
    descripcion: p.descripcion ?? undefined,
    precio: toNumber(p.precio) ?? 0,
    moneda: p.moneda,
    tipoOperacion: p.tipo_operacion,
    categoria: p.categoria,
    ubicacion: {
      lat: p.lat,
      lng: p.lng,
      direccion: p.direccion ?? undefined,
      provincia: p.provincia ?? undefined,
      distrito: p.distrito ?? undefined,
      corregimiento: p.corregimiento ?? undefined,
    },
    areaM2: toNumber(p.area_m2),
    habitaciones: p.habitaciones ?? undefined,
    banos: p.banos ?? undefined,
    estacionamientos: p.estacionamientos ?? undefined,
    condicion: p.condicion ?? undefined,
    estadoAnuncio: p.estado_anuncio,
    resumenIA: p.resumen_ia ?? undefined,
    fuenteId: p.fuente_id,
    fuenteNombre: p.fuente?.nombre ?? p.fuente_id,
    urlOriginal: p.url_original,
    otrosAnuncios: (p.anuncios ?? []).map(mapAnuncio),
    imagenes: p.imagenes ?? [],
    fechaPublicacion: p.fecha_publicacion ?? "",
    fechaDeteccion: p.fecha_deteccion,
    fechaActualizacion: p.fecha_actualizacion,
  };
}

const SELECT = `
  *,
  fuente:fuentes!fuente_id(id, nombre),
  anuncios(*, fuente:fuentes!fuente_id(id, nombre))
`;

export async function fetchPropiedades(): Promise<Propiedad[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("propiedades")
    .select(SELECT)
    .order("fecha_deteccion", { ascending: false });

  if (error) throw error;
  const rows = (data ?? []) as unknown as DbPropiedad[];
  return rows.map(mapPropiedad);
}
