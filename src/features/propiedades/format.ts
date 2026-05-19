import type {
  CategoriaPropiedad,
  Condicion,
  EstadoAnuncio,
  Propiedad,
  TipoOperacion,
} from "./types";

const currencyFmt = new Intl.NumberFormat("es-PA", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const numberFmt = new Intl.NumberFormat("es-PA", {
  maximumFractionDigits: 0,
});

const dateFmt = new Intl.DateTimeFormat("es-PA", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatoPrecio(precio: number, moneda: Propiedad["moneda"]) {
  if (moneda === "USD") return currencyFmt.format(precio);
  return `${numberFmt.format(precio)} ${moneda}`;
}

export function precioPorM2(p: Propiedad): number | null {
  if (!p.areaM2 || p.areaM2 <= 0) return null;
  return Math.round(p.precio / p.areaM2);
}

export function formatoFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return dateFmt.format(d);
}

const categoriaLabels: Record<CategoriaPropiedad, string> = {
  apartamento: "Apartamento",
  casa: "Casa",
  terreno: "Terreno",
  "local-comercial": "Local comercial",
  oficina: "Oficina",
  galera: "Galera",
};

const tipoOperacionLabels: Record<TipoOperacion, string> = {
  venta: "en venta",
  alquiler: "en alquiler",
};

const condicionLabels: Record<Condicion, string> = {
  nueva: "Nueva",
  usada: "Usada",
};

const estadoLabels: Record<EstadoAnuncio, string> = {
  activo: "Activo",
  vendido: "Vendido",
  alquilado: "Alquilado",
  retirado: "Retirado",
};

export function labelCategoria(c: CategoriaPropiedad) {
  return categoriaLabels[c];
}
export function labelTipoOperacion(t: TipoOperacion) {
  return tipoOperacionLabels[t];
}
export function labelCondicion(c: Condicion | undefined) {
  return c ? condicionLabels[c] : "—";
}
export function labelEstado(e: EstadoAnuncio) {
  return estadoLabels[e];
}
