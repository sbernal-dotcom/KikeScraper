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

export type EstadoAnuncio = "activo" | "vendido" | "alquilado" | "retirado";

export interface Ubicacion {
  lat: number;
  lng: number;
  direccion?: string;
  provincia?: string;
  distrito?: string;
  corregimiento?: string;
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
  descripcion?: string;
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
  resumenIA?: string;
  fuenteId: string;
  fuenteNombre: string;
  urlOriginal: string;
  otrosAnuncios?: AnuncioAdicional[];
  imagenes: string[];
  fechaPublicacion: string;
  fechaDeteccion: string;
  fechaActualizacion: string;
}
