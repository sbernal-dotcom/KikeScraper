import type { Propiedad, TipoOperacion } from "./types";

export function precioPorM2(p: Propiedad): number | null {
  if (!p.areaM2 || p.areaM2 <= 0) return null;
  return Math.round(p.precio / p.areaM2);
}

/**
 * Accent color per operation type. Venta = lime, alquiler = azul.
 * Returns the hex + the comma-separated RGB triple for use in rgba() tints.
 */
export function operationAccent(op: TipoOperacion): {
  color: string;
  rgb: string;
} {
  return op === "alquiler"
    ? { color: "#0062FF", rgb: "0, 98, 255" }
    : { color: "#D6FF00", rgb: "214, 255, 0" };
}

/**
 * Inline CSS variables to apply on the root of a property card so que
 * los elementos hijos puedan referenciar `var(--accent)`, `var(--accent-soft)`, etc.
 *
 * `--accent-text-on` debe contrastar contra `--accent`. Lime → texto
 * negro; azul → texto blanco. Mantenerlo derivado del color de operación
 * evita botones primarios ilegibles (texto negro sobre azul oscuro).
 */
export function accentVars(op: TipoOperacion): React.CSSProperties {
  const { color, rgb } = operationAccent(op);
  return {
    ["--accent" as never]: color,
    ["--accent-rgb" as never]: rgb,
    ["--accent-soft" as never]: `rgba(${rgb}, 0.10)`,
    ["--accent-medium" as never]: `rgba(${rgb}, 0.14)`,
    ["--accent-text-on" as never]: op === "alquiler" ? "#fff" : "#0a0a0a",
  };
}
