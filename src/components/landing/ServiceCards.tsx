"use client";

import Link from "next/link";
import { Building2, Cog, History, TrendingUp } from "lucide-react";

import { useDict } from "@/i18n/LocaleProvider";

// 4 tarjetas de servicios — las 4 secciones NO-mapa. El mapa ya tiene su
// CTA principal en el hero, no lo repetimos acá para no diluir. Cada card
// linkea a su sección y la card entera es clickable.

const CARDS = [
  { key: "properties", href: "/propiedades", icon: Building2 },
  { key: "analysis", href: "/analisis", icon: TrendingUp },
  { key: "history", href: "/historial", icon: History },
  { key: "scraper", href: "/scraper", icon: Cog },
] as const;

export function ServiceCards() {
  const dict = useDict();

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
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
              className="group relative flex flex-col rounded-xl border border-border/50 bg-card/40 p-6 transition-all hover:-translate-y-0.5 hover:border-[color:#D6FF00]/60"
            >
              <span
                className="mb-4 inline-flex size-11 items-center justify-center rounded-lg"
                style={{
                  background: "rgba(214,255,0,0.10)",
                  color: "#D6FF00",
                }}
              >
                <Icon className="size-5" />
              </span>
              <h3 className="text-lg font-semibold text-foreground">
                {label.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {label.description}
              </p>
              <span
                className="mt-4 text-xs font-medium text-muted-foreground group-hover:text-[color:#D6FF00]"
                style={{ transition: "color 200ms" }}
              >
                {label.cta} →
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
