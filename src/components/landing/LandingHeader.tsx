"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";

import { useDict } from "@/i18n/LocaleProvider";

const NAV = [
  { key: "map", href: "/mapa" },
  { key: "properties", href: "/propiedades" },
  { key: "analysis", href: "/analisis" },
  { key: "history", href: "/historial" },
  { key: "scraper", href: "/scraper" },
] as const;

// Header del landing. Fixed arriba de todo, pero se auto-oculta al
// scrollear hacia abajo (comportamiento tipo Medium / Notion): libera
// espacio de lectura y reaparece apenas el usuario scrollea hacia arriba.
//
// Usamos useRef en vez de useState para lastY para NO re-renderear en
// cada scroll event; solo re-renderea cuando cambia `hidden`.
export function LandingHeader() {
  const dict = useDict();
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const lastYRef = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const goingDown = y > lastYRef.current;
      // Umbral 80px: no ocultar en el rango del hero.
      if (goingDown && y > 80) setHidden(true);
      else setHidden(false);
      lastYRef.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-transform duration-300 ease-out ${
        hidden ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      {/* Vidrio esmerilado: fondo semitransparente + blur fuerte. Al
          scrollear, el dot-grid y el patrón del hero se ven difuminados
          detrás del header en vez de tapados por un rectángulo sólido. */}
      <div className="border-b border-border/60 bg-background/60 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo (placeholder hasta tener el real) */}
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
            <span className="hidden text-sm font-semibold sm:inline">
              {dict.brand.name}
            </span>
          </Link>

          {/* Nav desktop */}
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "text-foreground"
                      : "text-foreground/75 hover:text-foreground"
                  }`}
                >
                  {dict.nav[item.key]}
                  {active ? (
                    <span
                      className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full"
                      style={{ background: "#D6FF00" }}
                    />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          {/* Hamburguesa mobile */}
          <button
            type="button"
            onClick={() => {
              setMobileOpen((v) => !v);
              // Al abrir el menú, el header debe quedar visible. Se hace
              // acá y no en un efecto para no encadenar renders.
              setHidden(false);
            }}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border/60 text-foreground md:hidden"
            aria-label={dict.nav.open_nav}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? (
              <X className="size-5" />
            ) : (
              <Menu className="size-5" />
            )}
          </button>
        </div>

        {/* Drawer mobile */}
        {mobileOpen ? (
          <div className="border-t border-border/40 bg-background md:hidden">
            <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3 sm:px-6">
              {NAV.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`rounded-md px-3 py-2 text-sm font-medium ${
                      active
                        ? "bg-muted text-foreground"
                        : "text-foreground/75 hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    {dict.nav[item.key]}
                  </Link>
                );
              })}
            </nav>
          </div>
        ) : null}
      </div>
    </header>
  );
}
