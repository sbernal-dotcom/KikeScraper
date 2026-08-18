// Malla vectorial abstracta de "calles" para el hero. Server Component
// puro: es un SVG estático sin estado. Diseño:
//   - Grid fino de fondo (calles menores)
//   - Avenidas más gruesas cada 100u
//   - Algunos "pines" fluorescentes como acento
//   - Fade a los bordes vía maskImage radial (para fundirse con el fondo)
//
// Todo en el verde de la marca #D6FF00 con opacidades bajas — la idea es
// que se sienta el mapa sin gritarlo, y que no compita con el texto del
// hero a la izquierda.
export function StreetGridBackground({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={className}
      aria-hidden
      // Fade radial: máscara que hace transparente hacia los bordes para
      // que el SVG "se funda" con el fondo negro del hero sin borde duro.
      style={{
        maskImage:
          "radial-gradient(ellipse at center, black 40%, transparent 85%)",
        WebkitMaskImage:
          "radial-gradient(ellipse at center, black 40%, transparent 85%)",
      }}
    >
      <svg
        viewBox="0 0 400 400"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id="street-grid-fine"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke="#D6FF00"
              strokeWidth="0.4"
              opacity="0.18"
            />
          </pattern>
        </defs>

        {/* Base: grid fino de "calles menores" */}
        <rect width="100%" height="100%" fill="url(#street-grid-fine)" />

        {/* Avenidas: líneas más gruesas cada 100u */}
        <g stroke="#D6FF00" fill="none">
          <path d="M 0 100 L 400 100" strokeWidth="1" opacity="0.35" />
          <path d="M 0 200 L 400 200" strokeWidth="1.8" opacity="0.5" />
          <path d="M 0 300 L 400 300" strokeWidth="1" opacity="0.35" />
          <path d="M 100 0 L 100 400" strokeWidth="1" opacity="0.35" />
          <path d="M 200 0 L 200 400" strokeWidth="1.8" opacity="0.5" />
          <path d="M 300 0 L 300 400" strokeWidth="1" opacity="0.35" />
        </g>

        {/* Diagonal tipo "corredor" (avenida Cincuentenario style) */}
        <path
          d="M 0 340 L 400 60"
          stroke="#D6FF00"
          strokeWidth="0.8"
          opacity="0.25"
          strokeDasharray="6 4"
          fill="none"
        />

        {/* Pines: puntos brillantes como propiedades destacadas */}
        <g fill="#D6FF00">
          <circle cx="150" cy="220" r="3" opacity="0.85" />
          <circle cx="240" cy="90" r="2.2" opacity="0.7" />
          <circle cx="80" cy="180" r="2" opacity="0.6" />
          <circle cx="310" cy="280" r="3" opacity="0.85" />
          <circle cx="180" cy="320" r="2" opacity="0.6" />
          <circle cx="260" cy="200" r="2.5" opacity="0.75" />
        </g>
      </svg>
    </div>
  );
}
