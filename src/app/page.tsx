import { Suspense } from "react";
import type { Metadata } from "next";

import { Hero } from "@/components/landing/Hero";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { ServiceCards } from "@/components/landing/ServiceCards";
import {
  StatBanner,
  StatBannerSkeleton,
} from "@/components/landing/StatBanner";

// Revalidación cada 5 minutos: el StatBanner cuenta propiedades y última
// corrida en Supabase — no hace falta que sea fresco al segundo, y el
// caching evita que cada visita al landing golpee la DB.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Mapa Interactivo Inteligente · Panamá",
  description:
    "El mapa inmobiliario de Panamá con todas las fuentes en un solo lugar. Precios reales, historial y sin registros.",
};

// Landing público del sitio. Vive en `/` fuera del route group (app) —
// por eso NO tiene AppShell (sidebar), solo el LandingHeader horizontal.
// El LocaleProvider global vive en `src/app/layout.tsx`, así los
// componentes client (Hero, ServiceCards, etc.) pueden usar `useDict()`.
export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <LandingHeader />
      {/* pt-16 para no quedar tapado por el header fixed (h-16) */}
      <main className="flex-1 pt-16">
        <Hero />
        <Suspense fallback={<StatBannerSkeleton />}>
          <StatBanner />
        </Suspense>
        <ServiceCards />
      </main>
      <LandingFooter />
    </div>
  );
}
