"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";

import { useDict } from "@/i18n/LocaleProvider";

import { HeroMapPreview } from "./HeroMapPreview";

// Mapbox necesita `window` — cargamos el 3D solo en cliente. Mientras
// se descarga (o durante SSR), mostramos el SVG estático como skeleton
// para no dejar el hero vacío.
const HeroMap3D = dynamic(
  () => import("./HeroMap3D").then((m) => m.HeroMap3D),
  {
    ssr: false,
    loading: () => (
      <HeroMapPreview
        fullBleed
        className="pointer-events-none absolute inset-0 opacity-45"
      />
    ),
  },
);

// Hero: mapa 3D interactivo:false como fondo full-bleed del hero. El
// texto vive encima a la izquierda, sobre un gradient horizontal que
// oscurece la mitad izquierda para asegurar legibilidad AAA sin sacar
// el mapa del contexto visual.
//
// Título con acento verde en "inmobiliario" (única palabra coloreada
// para mantener jerarquía). Dos CTAs alargados: primario en verde plano,
// secundario con borde verde.
export function Hero() {
  const dict = useDict();

  return (
    <section className="relative overflow-hidden">
      {/* Fondo: mapa 3D full-bleed. Opacidad baja porque cubre toda el
          área y no queremos que compita con el texto. `pointer-events-none`
          en el contenedor para que clicks/scroll pasen al hero. */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <HeroMap3D className="absolute inset-0 opacity-70" />
        {/* Overlay gradient: negro sólido a la izquierda → transparente a
            la derecha. Garantiza contraste AAA sobre el título/subtítulo
            sin tapar el mapa a la derecha. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.75) 35%, rgba(0,0,0,0.35) 70%, rgba(0,0,0,0.15) 100%)",
          }}
        />
        {/* Fade extra vertical en los bordes superior/inferior para que la
            transición con el header y con el StatBanner verde sea suave. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.3) 100%)",
          }}
        />
      </div>

      {/* Contenido: encima del mapa, alineado a la izquierda. max-w-2xl
          limita el ancho del bloque de texto para que respire y no invada
          la parte visible del mapa. Padding igual al del hero original con
          grid (16/24/32) — al hacer full-bleed lo había subido a 24/32/40
          y el título se sentía "flotando" mucho más abajo. */}
      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24 lg:px-8 lg:py-32">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
            {dict.landing.hero.title_before}{" "}
            <span style={{ color: "#D6FF00" }}>
              {dict.landing.hero.title_accent}
            </span>{" "}
            {dict.landing.hero.title_after}
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {dict.landing.hero.subtitle}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/mapa"
              className="inline-flex items-center justify-center gap-2 rounded-lg px-8 py-3.5 text-sm font-semibold text-black transition-transform hover:-translate-y-0.5"
              style={{ background: "#D6FF00" }}
            >
              {dict.landing.hero.cta_map}
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/propiedades"
              className="inline-flex items-center justify-center gap-2 rounded-lg border px-8 py-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40"
              style={{ borderColor: "#D6FF00" }}
            >
              <Building2 className="size-4" />
              {dict.landing.hero.cta_properties}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
