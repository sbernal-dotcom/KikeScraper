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

// Supabase/PostgREST corta TODA respuesta en 1000 filas (db-max-rows).
// `.range(0, 19999)` NO lo evita: el tope se aplica igual. La unica
// forma de traer mas es pedir de a paginas hasta que una devuelva <1000.
//
// Sin esto el mapa mostraba 1000 propiedades de 3026, y el contador del
// landing calculaba sobre un subconjunto arbitrario.
const PAGINA = 1000;

async function fetchAllRows<T>(
  build: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const todas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await build(desde, desde + PAGINA - 1);
    if (error) throw error;
    const lote = data ?? [];
    todas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return todas;
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
  // M14: era `as unknown as DbOportunidad[]` (doble cast, sin verificación).
  // Ahora `data` viene tipado por el schema real y el cast simple deja que
  // TS chequee compatibilidad. vw_oportunidades es view — su Row incluye
  // más campos que DbOportunidad; el cast angosta a los que usamos.
  const rows = (data ?? []) as DbOportunidad[];
  return rows.map(mapOportunidad);
}

// Conteo de propiedades activas VISIBLES EN EL MAPA. Replica el filtro
// de `fetchPropiedades` (precio + area_m2 válidos, no duplicadas) sobre
// `estado_anuncio = 'activo'` — así el número matchea exactamente lo
// que el usuario ve como pines en /mapa.
//
// Usa `select('id')` en vez de `count: exact, head: true` porque
// necesitamos restar los duplicados y para eso hay que tener los IDs.
// Con ~3-5k activas trae ~150 KB de solo strings de UUID, aceptable
// para un stat del landing (una sola vez, al montar).
export async function fetchActiveCount(): Promise<number | null> {
  const supabase = createClient();

  try {
    // Ambas consultas pasan de 1000 filas (4337 activas, 1346 duplicados),
    // por eso van por fetchAllRows. `.order("id")` da un orden estable
    // entre paginas: sin él, PostgREST puede repetir u omitir filas.
    const [active, dups] = await Promise.all([
      fetchAllRows<{ id: string }>((desde, hasta) =>
        supabase
          .from("propiedades")
          .select("id")
          .eq("estado_anuncio", "activo")
          .not("precio", "is", null)
          .not("area_m2", "is", null)
          .gt("area_m2", 0)
          .order("id")
          .range(desde, hasta),
      ),
      fetchAllRows<{ propiedad_id: string }>((desde, hasta) =>
        supabase
          .from("propiedades_duplicados")
          .select("propiedad_id")
          .order("propiedad_id")
          .range(desde, hasta),
      ),
    ]);

    const dupSet = new Set(dups.map((r) => r.propiedad_id));
    return active.filter((r) => !dupSet.has(r.id)).length;
  } catch (err) {
    console.warn("[fetchActiveCount] error:", err);
    return null;
  }
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
  // Paginado obligatorio: hay 1346 pares y PostgREST corta en 1000.
  // Sin esto el Map quedaba incompleto y ~346 duplicados se colaban al
  // mapa como propiedades independientes.
  const dupPairs = await fetchAllRows<{
    propiedad_id: string;
    canonica_id: string;
  }>((desde, hasta) =>
    supabase
      .from("propiedades_duplicados")
      .select("propiedad_id, canonica_id")
      .order("propiedad_id")
      .range(desde, hasta),
  );
  const dupToCan = new Map<string, string>();
  dupPairs.forEach((r) => dupToCan.set(r.propiedad_id, r.canonica_id));
  const dupIds = Array.from(dupToCan.keys());

  // Trae los datos de los duplicados por separado para armar los
  // `AnuncioAdicional` de la canónica. Query aislada = evita el join
  // ambiguo (propiedades_duplicados tiene 2 FKs a propiedades) y
  // mantiene el SELECT principal limpio.
  //
  // Chunked: con ~700+ dupIds, .in("id", [...]) genera una URL de 25KB+
  // que PostgREST rechaza con "Bad Request". Troceamos en batches de
  // 200 para mantener cada request <8KB.
  const otrosByCanId = new Map<string, AnuncioAdicional[]>();
  const CHUNK = 200;
  for (let i = 0; i < dupIds.length; i += CHUNK) {
    const slice = dupIds.slice(i, i + CHUNK);
    const { data: dupData, error: dupDataErr } = await supabase
      .from("propiedades")
      .select(
        "id, fuente_id, url_original, precio, moneda, fecha_deteccion, fuente:fuentes!fuente_id(id, nombre)",
      )
      .in("id", slice);
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
  //  - archivadas/vendidas/etc en los últimos 3 días (pin rojo apagado
  //    + banner "Ya no está disponible" en la card). Así el user ve
  //    cuándo algo salió del mercado antes de que desaparezca del mapa.
  const archivedCutoff = new Date(
    Date.now() - 3 * 24 * 3600 * 1000,
  ).toISOString();
  // NOTA: NO usamos .not("id", "in", "(...)") aquí. Con 700+ dupIds
  // esa URL supera 25KB y falla con "Bad Request" o 414 URI Too Long
  // en algunos CDN/proxies (Vercel Edge, en particular). En vez de eso
  // traemos TODAS las filas y filtramos en cliente con el Set — es una
  // lista de ~3k, la iteración es instantánea.
  const dupIdSet = new Set(dupIds);
  // Paginado obligatorio: son ~4300 filas y PostgREST corta en 1000.
  // Antes el mapa mostraba solo las 1000 mas recientes por fecha_deteccion
  // y las otras ~3300 no existian para el usuario.
  //
  // Orden por (fecha_deteccion, id): fecha_deteccion sola no es unica, y
  // con empates PostgREST puede repetir u omitir filas entre paginas.
  const data = await fetchAllRows<DbPropiedad>((desde, hasta) =>
    supabase
      .from("propiedades")
      .select(SELECT)
      .not("precio", "is", null)
      .not("area_m2", "is", null)
      .gt("area_m2", 0)
      .or(
        `estado_anuncio.eq.activo,and(estado_anuncio.neq.activo,fecha_ultima_revision.gte.${archivedCutoff})`,
      )
      .order("fecha_deteccion", { ascending: false })
      .order("id")
      .range(desde, hasta) as unknown as PromiseLike<{
      data: DbPropiedad[] | null;
      error: unknown;
    }>,
  );
  // `data` ya viene tipado como DbPropiedad[] desde fetchAllRows y nunca
  // es null (el helper devuelve [] si no hay filas).
  return data
    .filter((r) => !dupIdSet.has(r.id))
    .map((r) => {
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
