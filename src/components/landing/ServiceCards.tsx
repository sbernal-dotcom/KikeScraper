"use client";

import Link from "next/link";
import { ArrowUpRight, Building2, Cog, History, TrendingUp } from "lucide-react";

import { useDict } from "@/i18n/LocaleProvider";

import { DotGridPattern } from "./patterns";

// 4 tarjetas de servicios — las 4 secciones NO-mapa. El mapa ya tiene su
// CTA principal en el hero, no lo repetimos acá para no diluir. Cada card
// linkea a su sección y la card entera es clickable.
//
// Sección con dot-grid sutil de fondo. Cards con gradient interno + glow
// verde tenue en hover para darles peso sin cambiar tamaño.

const CARDS = [
  { key: "properties", href: "/propiedades", icon: Building2 },
  { key: "analysis", href: "/analisis", icon: TrendingUp },
  { key: "history", href: "/historial", icon: History },
  { key: "scraper", href: "/scraper", icon: Cog },
] as const;

export function ServiceCards() {
  const dict = useDict();

  return (
    <section className="relative overflow-hidden">
      {/* Dot grid de fondo — patrón principal de la sección. Un pelín
          más denso que el del hero (size=32) para diferenciar. */}
      <DotGridPattern
        className="absolute inset-0"
        color="rgba(214,255,0,0.04)"
        size={32}
      />
      {/* Halo verde radial muy tenue en el centro superior — le da un
          punto de "gravedad" visual al bloque de cards. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(214,255,0,0.06), transparent 60%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
        <div className="mb-10 text-center md:mb-14">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {dict.landing.services.title}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            {dict.landing.services.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((card) => {
            const Icon = card.icon;
            const label = dict.landing.services.cards[card.key];
            return (
              <Link
                key={card.href}
                href={card.href}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-card/70 to-card/20 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[color:#D6FF00]/60 hover:shadow-[0_15px_40px_-20px_rgba(214,255,0,0.35)]"
              >
                {/* Glow verde tenue en la esquina superior derecha que se
                    intensifica en hover — micro-detalle que hace la card
                    más "viva" sin robar atención. */}
                <div
                  aria-hidden
                  className="absolute -right-8 -top-8 size-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                  style={{ background: "rgba(214,255,0,0.15)" }}
                />
                {/* Flecha diagonal en la esquina, aparece en hover */}
                <ArrowUpRight
                  className="absolute right-4 top-4 size-4 text-muted-foreground opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{ color: "#D6FF00" }}
                />

                <span
                  className="relative mb-4 inline-flex size-11 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110"
                  style={{
                    background: "rgba(214,255,0,0.10)",
                    color: "#D6FF00",
                  }}
                >
                  <Icon className="size-5" />
                </span>
                <h3 className="relative text-lg font-semibold text-foreground">
                  {label.title}
                </h3>
                <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">
                  {label.description}
                </p>
                <span
                  className="relative mt-4 text-xs font-medium text-muted-foreground transition-colors group-hover:text-[color:#D6FF00]"
                >
                  {label.cta} →
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
