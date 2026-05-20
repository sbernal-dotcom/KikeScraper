import type { Propiedad } from "./types";

export function precioPorM2(p: Propiedad): number | null {
  if (!p.areaM2 || p.areaM2 <= 0) return null;
  return Math.round(p.precio / p.areaM2);
}
