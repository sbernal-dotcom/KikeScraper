// Patrones de fondo reutilizables para el landing. Son puros divs con
// CSS backgrounds (radial-gradient / repeating-linear-gradient), no
// SVG — así se pueden renderear a cualquier tamaño sin sobrecarga y no
// pesan nada en el bundle.
//
// Todos aceptan `className` para que el consumidor decida posición,
// opacidad y color-mix con el fondo de su sección. Van con `aria-hidden`
// porque son decorativos.

// Grilla de puntos tenues — el patrón más "seguro", agrega textura sin
// dirección visual (no sesga la mirada hacia ningún lado). Uso ideal:
// fondo de secciones grandes con mucho texto encima.
//
// Color por defecto: el verde de la marca al 6% — se lee como "hay algo
// ahí" pero no compite con lectura de texto blanco.
export function DotGridPattern({
  className = "",
  color = "rgba(214,255,0,0.06)",
  size = 24,
  dotSize = 1,
}: {
  className?: string;
  color?: string;
  size?: number;
  dotSize?: number;
}) {
  return (
    <div
      aria-hidden
      className={className}
      style={{
        backgroundImage: `radial-gradient(circle, ${color} ${dotSize}px, transparent ${dotSize}px)`,
        backgroundSize: `${size}px ${size}px`,
      }}
    />
  );
}

// Líneas diagonales finas — sensación de "tela" o "grain" direccional.
// Uso ideal: encima de fondos de color plano (ej. el verde del StatBanner)
// para agregar profundidad sin desaturar el color.
export function DiagonalStripesPattern({
  className = "",
  color = "rgba(0,0,0,0.06)",
  spacing = 12,
  angle = 45,
}: {
  className?: string;
  color?: string;
  spacing?: number;
  angle?: number;
}) {
  return (
    <div
      aria-hidden
      className={className}
      style={{
        backgroundImage: `repeating-linear-gradient(${angle}deg, transparent, transparent ${spacing}px, ${color} ${spacing}px, ${color} ${spacing + 1}px)`,
      }}
    />
  );
}
