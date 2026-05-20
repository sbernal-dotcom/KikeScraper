"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { FilterPanel } from "@/features/propiedades/components/FilterPanel";
import { PropertyGridCard } from "@/features/propiedades/components/PropertyGridCard";
import {
  applyFilters,
  countActiveFilters,
  emptyFilters,
  type PropiedadFilters,
} from "@/features/propiedades/filters";
import { mockPropiedades } from "@/features/propiedades/mock";

export default function PropiedadesPage() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<PropiedadFilters>(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const fuentesDisponibles = useMemo(
    () => Array.from(new Set(mockPropiedades.map((p) => p.fuenteNombre))).sort(),
    [],
  );

  const filtradas = useMemo(
    () => applyFilters(mockPropiedades, query, filters),
    [query, filters],
  );

  const activos = countActiveFilters(filters);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
        <SidebarTrigger
          aria-label="Abrir navegación"
          className="size-9 shrink-0 rounded-md border bg-background"
        />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="hidden text-base font-semibold tracking-tight sm:block">
            Propiedades
          </h1>
          <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
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
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="relative h-10 shrink-0 gap-2"
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal className="size-4" />
            <span className="hidden sm:inline">Filtros</span>
            {activos > 0 ? (
              <span
                className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold leading-none"
                style={{ background: "#D6FF00", color: "#0a0a0a" }}
              >
                {activos}
              </span>
            ) : null}
          </Button>
        </div>
        <div className="hidden text-xs text-muted-foreground sm:block">
          {filtradas.length} de {mockPropiedades.length}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {filtradas.length === 0 ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
              No hay propiedades que coincidan con los filtros aplicados.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtradas.map((p) => (
                <PropertyGridCard key={p.id} propiedad={p} />
              ))}
            </div>
          )}
        </div>
      </main>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="left" className="w-[320px] p-0 sm:max-w-[320px]">
          <FilterPanel
            filters={filters}
            onChange={setFilters}
            fuentesDisponibles={fuentesDisponibles}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
