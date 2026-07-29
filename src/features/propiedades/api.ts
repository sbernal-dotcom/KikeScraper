"use client";

import { createClient } from "@/lib/supabase/client";

import type {
  AnuncioAdicional,
  CategoriaPropiedad,
  Condicion,
  ConfianzaScore,
  EstadoAnuncio,
  Moneda,
  Oportunidad,
  PrecisionUbicacion,
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
  precision_ubicacion: PrecisionUbicacion | null;
  motivo_estado: string | null;
  fecha_ultima_revision: string | null;
  area_m2: number | string | null;
  habitaciones: number | null;
  banos: number | null;
  estacionamientos: number | null;
  resumen_ia_es: string | null;
  resumen_ia_en: string | null;
  tags_caracteristicas: string[] | null;
  tags_extra: string[] | null;
  fuente_id: string;
  url_original: string;
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
      precision: p.precision_ubicacion ?? undefined,
    },
    areaM2: toNumber(p.area_m2),
    habitaciones: p.habitaciones ?? undefined,
    banos: p.banos ?? undefined,
    estacionamientos: p.estacionamientos ?? undefined,
    condicion: p.condicion ?? undefined,
    estadoAnuncio: p.estado_anuncio,
    resumenIA:
      p.resumen_ia_es || p.resumen_ia_en
        ? { es: p.resumen_ia_es ?? "", en: p.resumen_ia_en ?? "" }
        : undefined,
    tagsCaracteristicas: p.tags_caracteristicas ?? [],
    tagsExtra: p.tags_extra ?? [],
    fuenteId: p.fuente_id,
    fuenteNombre: p.fuente?.nombre ?? p.fuente_id,
    urlOriginal: p.url_original,
    otrosAnuncios: (p.anuncios ?? []).map(mapAnuncio),
    fechaPublicacion: p.fecha_publicacion ?? "",
    fechaDeteccion: p.fecha_deteccion,
    fechaActualizacion: p.fecha_actualizacion,
    motivoEstado: p.motivo_estado ?? undefined,
    fechaUltimaRevision: p.fecha_ultima_revision ?? undefined,
  };
}

const SELECT = `
  *,
  fuente:fuentes!fuente_id(id, nombre),
  anuncios(*, fuente:fuentes!fuente_id(id, nombre))
`;

type DbOportunidad = {
  id: string;
  titulo: string;
  precio: number | string;
  moneda: Moneda;
  area_m2: number | string;
  precio_m2: number | string;
  tipo_operacion: TipoOperacion;
  categoria: CategoriaPropiedad;
  condicion: Condicion | null;
  estado_anuncio: EstadoAnuncio;
  corregimiento: string | null;
  distrito: string | null;
  provincia: string | null;
  fuente_id: string;
  fuente_nombre: string | null;
  url_original: string;
  fecha_deteccion: string;
  n_comparables: number | null;
  avg_precio_m2: number | string | null;
  median_precio_m2: number | string | null;
  benchmark: number | string | null;
  descuento_pct: number | string | null;
  opportunity_score: number | string | null;
  confianza: ConfianzaScore;
  otros_anuncios: Array<{
    fuente_id: string;
    fuente_nombre: string | null;
    url_original: string;
    precio: number | string | null;
    moneda: Moneda | null;
    fecha_deteccion: string | null;
  }> | null;
};

function mapOportunidad(r: DbOportunidad): Oportunidad {
  return {
    id: r.id,
    titulo: r.titulo,
    precio: toNumber(r.precio) ?? 0,
    moneda: r.moneda,
    areaM2: toNumber(r.area_m2) ?? 0,
    precioM2: toNumber(r.precio_m2) ?? 0,
    tipoOperacion: r.tipo_operacion,
    categoria: r.categoria,
    condicion: r.condicion ?? undefined,
    estadoAnuncio: r.estado_anuncio,
    corregimiento: r.corregimiento ?? undefined,
    distrito: r.distrito ?? undefined,
    provincia: r.provincia ?? undefined,
    fuenteId: r.fuente_id,
    fuenteNombre: r.fuente_nombre ?? r.fuente_id,
    urlOriginal: r.url_original,
    fechaDeteccion: r.fecha_deteccion,
    nComparables: r.n_comparables,
    avgPrecioM2: toNumber(r.avg_precio_m2) ?? null,
    medianPrecioM2: toNumber(r.median_precio_m2) ?? null,
    benchmark: toNumber(r.benchmark) ?? null,
    descuentoPct: toNumber(r.descuento_pct) ?? null,
    opportunityScore: toNumber(r.opportunity_score) ?? null,
    confianza: r.confianza,
    otrosAnuncios: (r.otros_anuncios ?? []).map((a) => ({
      fuenteId: a.fuente_id,
      fuenteNombre: a.fuente_nombre ?? a.fuente_id,
      urlOriginal: a.url_original,
      precio: toNumber(a.precio),
      moneda: a.moneda ?? undefined,
      fechaDeteccion: a.fecha_deteccion ?? undefined,
    })),
  };
}

export async function fetchOportunidades(): Promise<Oportunidad[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("vw_oportunidades")
    .select("*")
    .order("opportunity_score", { ascending: false, nullsFirst: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as DbOportunidad[];
  return rows.map(mapOportunidad);
}

export async function fetchPropiedades(): Promise<Propiedad[]> {
  const supabase = createClient();

  // Dedupe (0009/0010): trae los pares (duplicado → canónica) para (a)
  // excluir los duplicados del listado principal y (b) adjuntarlos como
  // `otrosAnuncios` de la canónica para que la card muestre "también
  // publicado en X" con el precio de cada fuente.
  //
  // La tabla `anuncios` (0001_init.sql) está vacía en producción: ningún
  // scraper la escribe. `propiedades_duplicados` es la fuente real de
  // verdad para cross-source.
  const { data: dupRows, error: dupErr } = await supabase
    .from("propiedades_duplicados")
    .select("propiedad_id, canonica_id");
  if (dupErr) throw dupErr;
  const dupPairs = (dupRows ?? []) as Array<{
    propiedad_id: string;
    canonica_id: string;
  }>;
  const dupToCan = new Map<string, string>();
  dupPairs.forEach((r) => dupToCan.set(r.propiedad_id, r.canonica_id));
  const dupIds = Array.from(dupToCan.keys());

  // Trae los datos de los duplicados por separado para armar los
  // `AnuncioAdicional` de la canónica. Query aislada = evita el join
  // ambiguo (propiedades_duplicados tiene 2 FKs a propiedades) y
  // mantiene el SELECT principal limpio.
  const otrosByCanId = new Map<string, AnuncioAdicional[]>();
  if (dupIds.length > 0) {
    const { data: dupData, error: dupDataErr } = await supabase
      .from("propiedades")
      .select(
        "id, fuente_id, url_original, precio, moneda, fecha_deteccion, fuente:fuentes!fuente_id(id, nombre)",
      )
      .in("id", dupIds);
    if (dupDataErr) throw dupDataErr;
    for (const d of (dupData ?? []) as Array<{
      id: string;
      fuente_id: string;
      url_original: string;
      precio: number | string | null;
      moneda: Moneda | null;
      fecha_deteccion: string | null;
      fuente: { id: string; nombre: string } | null;
    }>) {
      const canId = dupToCan.get(d.id);
      if (!canId) continue;
      const arr = otrosByCanId.get(canId) ?? [];
      arr.push({
        fuenteId: d.fuente_id,
        fuenteNombre: d.fuente?.nombre ?? d.fuente_id,
        urlOriginal: d.url_original,
        precio: toNumber(d.precio),
        moneda: d.moneda ?? undefined,
        fechaDeteccion: d.fecha_deteccion ?? undefined,
      });
      otrosByCanId.set(canId, arr);
    }
  }

  // Mismo filtro que vw_oportunidades para mantener paridad mapa ↔ análisis.
  // Muestra:
  //  - todas las 'activo'
  //  - archivadas/vendidas/etc en los últimos 7 días (pin rojo apagado
  //    + banner "Ya no está disponible" en la card). Así el user ve
  //    cuándo algo salió del mercado antes de que desaparezca del mapa.
  const archivedCutoff = new Date(
    Date.now() - 7 * 24 * 3600 * 1000,
  ).toISOString();
  let query = supabase
    .from("propiedades")
    .select(SELECT)
    .not("precio", "is", null)
    .not("area_m2", "is", null)
    .gt("area_m2", 0)
    .or(
      `estado_anuncio.eq.activo,and(estado_anuncio.neq.activo,fecha_ultima_revision.gte.${archivedCutoff})`,
    );

  if (dupIds.length > 0) {
    query = query.not("id", "in", `(${dupIds.join(",")})`);
  }

  const { data, error } = await query.order("fecha_deteccion", {
    ascending: false,
  });

  if (error) throw error;
  const rows = (data ?? []) as unknown as DbPropiedad[];
  return rows.map((r) => {
    const p = mapPropiedad(r);
    const extras = otrosByCanId.get(p.id);
    if (extras && extras.length > 0) {
      // Merge: `mapPropiedad` ya sembró desde tabla `anuncios` (vacía en
      // prod, pero podría llenarse en el futuro). Concat sin dedupe por
      // urlOriginal — si el mismo url termina en ambos lados es un bug
      // aguas arriba, y verlo doble es más útil que ocultarlo.
      p.otrosAnuncios = [...(p.otrosAnuncios ?? []), ...extras];
    }
    return p;
  });
}
