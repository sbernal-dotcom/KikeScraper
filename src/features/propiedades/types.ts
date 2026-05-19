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
  imagenes: string[];
  fechaPublicacion: string;
  fechaDeteccion: string;
  fechaActualizacion: string;
}
