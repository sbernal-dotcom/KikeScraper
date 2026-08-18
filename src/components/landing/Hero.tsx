"use client";

import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";

import { useDict } from "@/i18n/LocaleProvider";

import { DotGridPattern } from "./patterns";
import { StreetGridBackground } from "./StreetGridBackground";

// Hero: título grande a la izquierda con dos CTAs, malla vectorial a la
// derecha. Grid 60/40 en desktop, stack vertical en móvil (imagen debajo).
// El título resalta la palabra "inmobiliario" en verde — es el único
// spot de color en el H1 para mantener la jerarquía visual.
//
// Fondo: dot-grid en verde a muy baja opacidad para dar textura sin
// competir con la lectura. La malla vectorial de la derecha es más
// densa y sigue siendo el acento visual principal.
export function Hero() {
  const dict = useDict();

  return (
    <section className="relative overflow-hidden">
      {/* Dot grid de fondo. -z-10 lo manda detrás del contenido; el
          radial-gradient de la máscara lo desvanece hacia los bordes
          para que no arranque bruscamente contra el header y el StatBanner. */}
      <DotGridPattern
        className="absolute inset-0 -z-10"
        color="rgba(214,255,0,0.05)"
        size={28}
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at 30% 50%, transparent 40%, rgba(0,0,0,0.6) 100%)",
        }}
      />
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-5 md:gap-8 md:py-24 lg:gap-12 lg:px-8 lg:py-32">
        {/* Texto — 3 columnas en desktop */}
        <div className="md:col-span-3">
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

        {/* Malla vectorial — 2 columnas en desktop, altura fija */}
        <div className="relative h-[280px] md:col-span-2 md:h-[420px] lg:h-[480px]">
          <StreetGridBackground className="absolute inset-0" />
        </div>
      </div>
    </section>
  );
}
