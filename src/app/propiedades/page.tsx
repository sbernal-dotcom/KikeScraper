"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { PropertyGridCard } from "@/features/propiedades/components/PropertyGridCard";
import { mockPropiedades } from "@/features/propiedades/mock";
import {
  labelCategoria,
  labelTipoOperacion,
} from "@/features/propiedades/format";

export default function PropiedadesPage() {
  const [query, setQuery] = useState("");

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mockPropiedades;
    return mockPropiedades.filter((p) => {
      const haystack = [
        p.titulo,
        p.ubicacion.corregimiento,
        p.ubicacion.distrito,
        labelCategoria(p.categoria),
        labelTipoOperacion(p.tipoOperacion),
        p.fuenteNombre,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query]);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
        <SidebarTrigger
          aria-label="Abrir navegación"
          className="size-9 shrink-0 rounded-md border bg-background"
        />
        <div className="flex min-w-0 flex-1 items-center">
          <h1 className="hidden text-base font-semibold tracking-tight sm:block">
            Propiedades
          </h1>
          <span className="mx-3 hidden h-4 w-px bg-border sm:block" />
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Buscar por título, zona, categoría…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 w-full rounded-lg border border-border/60 bg-card/40 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-all focus:border-[#D6FF00]/45 focus:ring-3 focus:ring-[#D6FF00]/15"
            />
          </div>
        </div>
        <div className="hidden text-xs text-muted-foreground sm:block">
          {filtradas.length} de {mockPropiedades.length}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {filtradas.length === 0 ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
              No hay propiedades que coincidan con “{query}”.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtradas.map((p) => (
                <PropertyGridCard key={p.id} propiedad={p} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
