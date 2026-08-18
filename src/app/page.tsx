import type { Metadata } from "next";

import { Hero } from "@/components/landing/Hero";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { ServiceCards } from "@/components/landing/ServiceCards";
import { StatBanner } from "@/components/landing/StatBanner";

export const metadata: Metadata = {
  title: "Mapa Interactivo Inteligente · Panamá",
  description:
    "El mapa inmobiliario de Panamá con todas las fuentes en un solo lugar. Precios reales, historial y sin registros.",
};

// Landing público del sitio. Vive en `/` fuera del route group (app) —
// por eso NO tiene AppShell (sidebar), solo el LandingHeader horizontal.
// El LocaleProvider global vive en `src/app/layout.tsx`, así los
// componentes client (Hero, ServiceCards, StatBanner, etc.) pueden
// usar `useDict()` sin problemas.
//
// StatBanner es Client Component desde 2026-08-18: usa el mismo Supabase
// client-side que /scraper y /mapa (garantía de conteos consistentes) y
// muestra siempre el número actual, sin cache — por eso esta página ya
// no exporta `revalidate` ni envuelve el StatBanner en Suspense.
export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <LandingHeader />
      {/* pt-16 para no quedar tapado por el header fixed (h-16) */}
      <main className="flex-1 pt-16">
        <Hero />
        <StatBanner />
        <ServiceCards />
      </main>
      <LandingFooter />
    </div>
  );
}
