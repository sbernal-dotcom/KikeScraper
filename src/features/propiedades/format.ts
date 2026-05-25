import type { Propiedad, TipoOperacion } from "./types";

export function precioPorM2(p: Propiedad): number | null {
  if (!p.areaM2 || p.areaM2 <= 0) return null;
  return Math.round(p.precio / p.areaM2);
}

/**
 * Accent color per operation type. Venta = lime, alquiler = amarillo.
 * Returns the hex + the comma-separated RGB triple for use in rgba() tints.
 */
export function operationAccent(op: TipoOperacion): {
  color: string;
  rgb: string;
} {
  return op === "alquiler"
    ? { color: "#FFBB00", rgb: "255, 187, 0" }
    : { color: "#D6FF00", rgb: "214, 255, 0" };
}

/**
 * Inline CSS variables to apply on the root of a property card so that
 * inner elements can reference `var(--accent)`, `var(--accent-soft)`, etc.
 */
export function accentVars(op: TipoOperacion): React.CSSProperties {
  const { color, rgb } = operationAccent(op);
  return {
    ["--accent" as never]: color,
    ["--accent-rgb" as never]: rgb,
    ["--accent-soft" as never]: `rgba(${rgb}, 0.10)`,
    ["--accent-medium" as never]: `rgba(${rgb}, 0.14)`,
    ["--accent-text-on" as never]: "#0a0a0a",
  };
}
