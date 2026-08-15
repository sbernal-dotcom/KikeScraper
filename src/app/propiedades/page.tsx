"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useDict } from "@/i18n/LocaleProvider";
import { FilterPanel } from "@/features/propiedades/components/FilterPanel";
import { PropertyGridCard } from "@/features/propiedades/components/PropertyGridCard";
import {
  applyFilters,
  countActiveFilters,
  emptyFilters,
  type PropiedadFilters,
} from "@/features/propiedades/filters";
import { usePropiedades } from "@/features/propiedades/usePropiedades";

export default function PropiedadesPage() {
  const dict = useDict();
  const { data: propiedades, loading, error } = usePropiedades();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<PropiedadFilters>(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const fuentesDisponibles = useMemo(
    () => Array.from(new Set(propiedades.map((p) => p.fuenteNombre))).sort(),
    [propiedades],
  );

  const previewCount = useMemo(
    () => propiedades.filter((p) => p.id.startsWith("preview:")).length,
    [propiedades],
  );

  const filtradas = useMemo(
    () => applyFilters(propiedades, query, filters),
    [propiedades, query, filters],
  );

  const activos = countActiveFilters(filters);

  return (
    <div className="flex h-dvh flex-col">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3 min-w-0">
          <SidebarTrigger
            aria-label={dict.nav.open_nav}
            className="size-9 shrink-0 rounded-md border bg-background"
          />
          <h1 className="hidden text-base font-semibold tracking-tight sm:block">
            {dict.properties.title}
          </h1>
        </div>

        <div className="relative w-[420px] max-w-[calc(100vw-12rem)]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder={dict.properties.search_placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 w-full rounded-lg border border-border/60 bg-card/40 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-all focus:border-[#D6FF00]/45 focus:ring-3 focus:ring-[#D6FF00]/15"
          />
        </div>

        <div className="flex items-center justify-end gap-3">
          {previewCount > 0 ? (
            <span
              className="hidden rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider sm:inline-flex"
              style={{
                background: "rgba(214,255,0,0.18)",
                color: "#D6FF00",
                borderColor: "rgba(214,255,0,0.5)",
              }}
            >
              Preview · {previewCount}
            </span>
          ) : null}
          <span className="hidden text-xs text-muted-foreground sm:block">
            {filtradas.length} {dict.common.of} {propiedades.length}
          </span>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="relative h-10 shrink-0 gap-2"
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal className="size-4" />
            <span className="hidden sm:inline">
              {dict.properties.filters}
            </span>
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
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {error ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-destructive/40 text-sm text-destructive">
              {error}
            </div>
          ) : loading ? (
            // M12: skeleton en grid — 6 cards placeholder que respetan
            // el layout responsive (1/2/3 columnas).
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-64 w-full rounded-xl" />
              ))}
            </div>
          ) : filtradas.length === 0 ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
              {dict.properties.empty_state}
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
        {/* M13: sheet abre a la derecha para no colisionar con la Sidebar. */}
        <SheetContent side="right" className="w-[320px] p-0 sm:max-w-[320px]">
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
