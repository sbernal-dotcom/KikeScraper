// Preview del mapa para el hero. Es un SVG estilizado que simula una
// vista aérea nocturna tipo Mapbox dark de una zona costera urbana:
//   - Bahía en curva a la izquierda-abajo (azul muy oscuro)
//   - Grid urbano fino en el resto (calles secundarias)
//   - Avenidas principales más gruesas con leves curvas
//   - Un par de "parques" (manchas verde oscuro)
//   - Manzanas rellenas sutiles
//   - Pines fluorescentes en verde marca (#D6FF00)
//   - Fade radial hacia los bordes para fundirse con el fondo negro
//
// No es Panamá literal — es abstracto pero se lee como "mapa" mucho más
// que la malla anterior. Si en el futuro querés reemplazarlo por un
// screenshot real del MapView, se cambia solo este archivo.
export function HeroMapPreview({
  className = "",
  fullBleed = false,
}: {
  className?: string;
  /**
   * Si es true, no aplica máscara radial — el mapa se ve edge-to-edge.
   * Pensado para usarse como fondo completo del hero, donde el fade
   * lo hace un overlay gradient del contenedor. Por defecto sigue con
   * la viñeta radial (para uso en columnas / cards).
   */
  fullBleed?: boolean;
}) {
  return (
    <div
      className={className}
      aria-hidden
      style={
        fullBleed
          ? undefined
          : {
              maskImage:
                "radial-gradient(ellipse at 55% 50%, black 45%, transparent 90%)",
              WebkitMaskImage:
                "radial-gradient(ellipse at 55% 50%, black 45%, transparent 90%)",
            }
      }
    >
      <svg
        viewBox="0 0 400 400"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          {/* Grid fino de calles secundarias */}
          <pattern
            id="hero-map-streets-fine"
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 16 0 L 0 0 0 16"
              fill="none"
              stroke="#D6FF00"
              strokeWidth="0.3"
              opacity="0.15"
            />
          </pattern>
        </defs>

        {/* Base: grid urbano fino */}
        <rect width="100%" height="100%" fill="url(#hero-map-streets-fine)" />

        {/* Bahía / masa de agua — curva orgánica abajo-izquierda */}
        <path
          d="M -20 320 Q 60 260 130 300 Q 200 340 240 380 L 240 440 L -20 440 Z"
          fill="#1e3a5f"
          opacity="0.55"
        />
        {/* Costa: línea fina más brillante sobre el borde del agua */}
        <path
          d="M -20 320 Q 60 260 130 300 Q 200 340 240 380"
          fill="none"
          stroke="#5b8ec4"
          strokeWidth="0.6"
          opacity="0.6"
        />

        {/* Parques / áreas verdes suaves */}
        <g fill="#D6FF00" opacity="0.08">
          <rect x="280" y="60" width="70" height="55" rx="6" />
          <ellipse cx="150" cy="140" rx="35" ry="22" />
        </g>

        {/* Manzanas sutiles (rectángulos rellenos) para dar densidad urbana */}
        <g fill="#ffffff" opacity="0.04">
          <rect x="60" y="60" width="30" height="20" />
          <rect x="100" y="60" width="20" height="20" />
          <rect x="130" y="60" width="40" height="20" />
          <rect x="60" y="90" width="20" height="30" />
          <rect x="90" y="90" width="30" height="30" />
          <rect x="130" y="90" width="40" height="30" />
          <rect x="220" y="70" width="40" height="25" />
          <rect x="220" y="105" width="40" height="30" />
          <rect x="270" y="130" width="35" height="25" />
          <rect x="310" y="130" width="30" height="25" />
          <rect x="60" y="200" width="35" height="25" />
          <rect x="105" y="200" width="45" height="25" />
          <rect x="270" y="220" width="40" height="35" />
          <rect x="320" y="220" width="30" height="35" />
        </g>

        {/* Avenidas principales — más gruesas, con leve curvatura */}
        <g stroke="#D6FF00" fill="none">
          {/* Horizontal principal */}
          <path
            d="M 0 180 Q 200 170 400 200"
            strokeWidth="1.8"
            opacity="0.45"
          />
          {/* Otra horizontal más al norte */}
          <path
            d="M 0 90 L 400 90"
            strokeWidth="1"
            opacity="0.35"
          />
          {/* Vertical principal */}
          <path
            d="M 210 0 Q 220 200 205 400"
            strokeWidth="1.5"
            opacity="0.4"
          />
          {/* Otra vertical al este */}
          <path
            d="M 310 0 L 305 400"
            strokeWidth="1"
            opacity="0.3"
          />
          {/* Diagonal tipo avenida ancha */}
          <path
            d="M 0 40 L 400 200"
            strokeWidth="1"
            opacity="0.25"
            strokeDasharray="4 3"
          />
        </g>

        {/* Pines destacados — como propiedades en el mapa */}
        <g>
          {/* Halo detrás de cada pin */}
          <circle cx="150" cy="220" r="8" fill="#D6FF00" opacity="0.15" />
          <circle cx="150" cy="220" r="3.2" fill="#D6FF00" opacity="0.95" />

          <circle cx="270" cy="100" r="7" fill="#D6FF00" opacity="0.15" />
          <circle cx="270" cy="100" r="2.6" fill="#D6FF00" opacity="0.85" />

          <circle cx="85" cy="170" r="6" fill="#D6FF00" opacity="0.12" />
          <circle cx="85" cy="170" r="2.2" fill="#D6FF00" opacity="0.75" />

          <circle cx="330" cy="260" r="8" fill="#D6FF00" opacity="0.15" />
          <circle cx="330" cy="260" r="3" fill="#D6FF00" opacity="0.9" />

          <circle cx="195" cy="80" r="6" fill="#D6FF00" opacity="0.12" />
          <circle cx="195" cy="80" r="2.2" fill="#D6FF00" opacity="0.75" />

          <circle cx="240" cy="230" r="7" fill="#D6FF00" opacity="0.13" />
          <circle cx="240" cy="230" r="2.6" fill="#D6FF00" opacity="0.85" />
        </g>
      </svg>
    </div>
  );
}
