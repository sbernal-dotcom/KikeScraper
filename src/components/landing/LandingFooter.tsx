"use client";

import Link from "next/link";

import { useDict } from "@/i18n/LocaleProvider";

const CONTACT_EMAIL = "abilendesign@gmail.com";

const NAV = [
  { key: "map", href: "/mapa" },
  { key: "properties", href: "/propiedades" },
  { key: "analysis", href: "/analisis" },
  { key: "history", href: "/historial" },
  { key: "scraper", href: "/scraper" },
] as const;

// Footer del landing. Chico y funcional: logo, links a las 5 secciones,
// email de contacto (público — el userEmail del sistema NO va acá) y año.
export function LandingFooter() {
  const dict = useDict();
  // Fecha "current year" hardcodeada: en Server Component esto se evalúa
  // en build/render, no en runtime — para no crear un hydration mismatch
  // usamos el año fijo. Actualizar manualmente si el proyecto sigue vivo
  // en enero.
  const year = 2026;

  return (
    <footer className="relative overflow-hidden border-t border-border/40 bg-background">
      {/* Glow tenue arriba centro — cierra la página con el mismo
          "ambient green" que tienen las otras secciones. Solo arriba
          para no distraer del contenido del footer. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-40"
        style={{
          background:
            "radial-gradient(ellipse 60% 100% at 50% 0%, rgba(214,255,0,0.12), transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <Link
              href="/"
              className="flex items-center gap-2"
              aria-label={dict.brand.name}
            >
              <span
                className="flex size-9 items-center justify-center rounded-md font-bold text-black"
                style={{ background: "#D6FF00" }}
              >
                MI
              </span>
              <span className="text-sm font-semibold">{dict.brand.name}</span>
            </Link>
            <p className="mt-3 max-w-sm text-xs text-muted-foreground">
              {dict.brand.tagline}
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground hover:text-foreground"
              >
                {dict.nav[item.key]}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-border/40 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div>
            © {year} {dict.brand.name}
          </div>
          <div>
            {dict.landing.footer.contact}:{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="hover:text-foreground"
            >
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
