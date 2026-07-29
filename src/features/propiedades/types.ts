export type TipoOperacion = "venta" | "alquiler";

export type CategoriaPropiedad =
  | "apartamento"
  | "casa"
  | "terreno"
  | "local-comercial"
  | "oficina"
  | "galera";

export type Moneda = "USD" | "PAB";

export type Condicion = "nueva" | "usada";

export type EstadoAnuncio =
  | "activo"
  | "vendido"
  | "alquilado"
  | "retirado"
  | "archivado"
  | "posible_inactivo"
  | "error_verificacion";

export type PrecisionUbicacion = "exacta" | "zona-declarada" | "aproximada";

export interface Ubicacion {
  lat: number;
  lng: number;
  direccion?: string;
  provincia?: string;
  distrito?: string;
  corregimiento?: string;
  /**
   * Nivel de confianza de la coord — mapea a la columna
   * `propiedades.precision_ubicacion`. Null (histórico sin backfill)
   * se trata como "aproximada" en UI para no falso-positivar el badge.
   */
  precision?: PrecisionUbicacion;
}

export type ConfianzaScore = "baja" | "media" | "alta";

export interface Oportunidad {
  id: string;
  titulo: string;
  precio: number;
  moneda: Moneda;
  areaM2: number;
  precioM2: number;
  tipoOperacion: TipoOperacion;
  categoria: CategoriaPropiedad;
  condicion?: Condicion;
  estadoAnuncio: EstadoAnuncio;
  corregimiento?: string;
  distrito?: string;
  provincia?: string;
  fuenteId: string;
  fuenteNombre: string;
  urlOriginal: string;
  fechaDeteccion: string;
  nComparables: number | null;
  avgPrecioM2: number | null;
  medianPrecioM2: number | null;
  benchmark: number | null;
  descuentoPct: number | null;
  opportunityScore: number | null;
  confianza: ConfianzaScore;
  otrosAnuncios: AnuncioAdicional[];
}

export interface AnuncioAdicional {
  fuenteId: string;
  fuenteNombre: string;
  urlOriginal: string;
  precio?: number;
  moneda?: Moneda;
  fechaDeteccion?: string;
}

export interface Propiedad {
  id: string;
  titulo: string;
  precio: number;
  moneda: Moneda;
  tipoOperacion: TipoOperacion;
  categoria: CategoriaPropiedad;
  ubicacion: Ubicacion;
  areaM2?: number;
  habitaciones?: number;
  banos?: number;
  estacionamientos?: number;
  condicion?: Condicion;
  estadoAnuncio: EstadoAnuncio;
  resumenIA?: { es: string; en: string };
  tagsCaracteristicas?: string[];
  tagsExtra?: string[];
  fuenteId: string;
  fuenteNombre: string;
  urlOriginal: string;
  otrosAnuncios?: AnuncioAdicional[];
  fechaPublicacion: string;
  fechaDeteccion: string;
  fechaActualizacion: string;
  /** Razón humana de la última transición (ej. "vendido detectado por
   *  scraper", "404 en verificación"). Solo relevante cuando
   *  estadoAnuncio !== "activo". */
  motivoEstado?: string;
  /** Última vez que verificar-estado tocó esta fila. Se usa como
   *  fecha aproximada de "cuándo se archivó" en la card. */
  fechaUltimaRevision?: string;
}
