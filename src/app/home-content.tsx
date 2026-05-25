"use client";

import { useMemo, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";

import { MapView } from "@/components/map/MapView";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useDict } from "@/i18n/LocaleProvider";
import {
  applyMapFilters,
  useAnalyticsFiltersCtx,
} from "@/features/propiedades/AnalyticsFiltersContext";
import { AnalyticsFilterPanel } from "@/features/propiedades/components/AnalyticsFilterPanel";
import { PropertyCard } from "@/features/propiedades/components/PropertyCard";
import { ZonaList } from "@/features/propiedades/components/ZonaList";
import { usePropiedades } from "@/features/propiedades/usePropiedades";
import type { Propiedad } from "@/features/propiedades/types";

export function HomeContent() {
  const dict = useDict();
  const { data: propiedades, error } = usePropiedades();
  const { filters, setFilters, reset, activeCount } = useAnalyticsFiltersCtx();
  const [seleccionada, setSeleccionada] = useState<Propiedad | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Lista lateral cuando hay >1 pin en la misma zona. Mantiene el grupo
  // abierto cuando el usuario clica una de las propiedades y luego "Volver".
  const [zonaList, setZonaList] = useState<{
    zona: string;
    items: Propiedad[];
  } | null>(null);

  // Detectar preview por contenido (no por query param) para mantener
  // consistencia con /propiedades y /analisis.
  const previewEnabled = propiedades.some((p) => p.id.startsWith("preview:"));

  // Set de IDs que pasan los filtros. Si no hay filtros activos → null
  // (todos los pines se ven normales). Con filtros → los no-matched se
  // oscurecen pero siguen visibles.
  const matchedIds = useMemo<Set<string> | null>(() => {
    if (activeCount === 0) return null;
    const list = applyMapFilters(propiedades, filters);
    return new Set(list.map((p) => p.id));
  }, [propiedades, filters, activeCount]);

  const matchedCount = matchedIds?.size ?? propiedades.length;

  const zonasDisponibles = useMemo(
    () =>
      Array.from(
        new Set(
          propiedades
            .map((p) => p.ubicacion.corregimiento)
            .filter(Boolean) as string[],
        ),
      ).sort(),
    [propiedades],
  );

  const previewCount = useMemo(
    () => propiedades.filter((p) => p.id.startsWith("preview:")).length,
    [propiedades],
  );

  return (
    <>
      <SidebarTrigger
        aria-label={dict.nav.open_nav}
        className="absolute left-3 top-3 z-20 size-9 rounded-md border bg-background/80 shadow-sm backdrop-blur hover:bg-background"
      />

      {previewEnabled ? (
        <div
          className="absolute right-3 top-3 z-20 rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider shadow-sm backdrop-blur"
          style={{
            background: "rgba(214,255,0,0.18)",
            color: "#D6FF00",
            borderColor: "rgba(214,255,0,0.5)",
          }}
          title="Mostrando anuncios scrapeados desde public/scrape-preview.json (no guardados en DB)"
        >
          Preview · {previewCount} scrapeados
        </div>
      ) : null}

      <div className="absolute left-16 top-3 z-20 flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="relative h-9 gap-2 bg-background/85 backdrop-blur"
          onClick={() => setFiltersOpen(true)}
        >
          <SlidersHorizontal className="size-4" />
          <span>{dict.properties.filters}</span>
          {activeCount > 0 ? (
            <span
              className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold leading-none"
              style={{ background: "#D6FF00", color: "#0a0a0a" }}
            >
              {activeCount}
            </span>
          ) : null}
        </Button>
        {activeCount > 0 ? (
          <div className="flex items-center gap-1 rounded-md border border-border/60 bg-background/85 px-2 py-1.5 text-xs shadow-sm backdrop-blur">
            <span className="tabular-nums">
              {matchedCount} / {propiedades.length}
            </span>
            <button
              type="button"
              onClick={reset}
              aria-label={dict.common.clear}
              className="ml-0.5 inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      <MapView
        className="h-full w-full"
        propiedades={propiedades}
        matchedIds={matchedIds}
        selectedId={seleccionada?.id ?? null}
        onSelect={(p) => {
          // Solo pines matched (no oscurecidos) son clickeables; el cluster
          // se calcula sobre el set matched cuando hay filtros activos.
          const pool = matchedIds
            ? propiedades.filter((x) => matchedIds.has(x.id))
            : propiedades;
          const zona = p.ubicacion.corregimiento;
          const cluster = zona
            ? pool.filter((x) => x.ubicacion.corregimiento === zona)
            : [p];
          if (cluster.length > 1) {
            setZonaList({ zona: zona ?? "", items: cluster });
            setSeleccionada(p);
          } else {
            setZonaList(null);
            setSeleccionada(p);
          }
        }}
        rightInsetPx={seleccionada || zonaList ? 380 : 0}
      />
      {error ? (
        <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-md border border-destructive/60 bg-background/95 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}
      {seleccionada ? (
        <div className="absolute inset-y-0 right-0 z-20 flex">
          <PropertyCard
            propiedad={seleccionada}
            onClose={() => {
              setSeleccionada(null);
              setZonaList(null);
            }}
            onBack={zonaList ? () => setSeleccionada(null) : undefined}
          />
        </div>
      ) : zonaList ? (
        <div className="absolute inset-y-0 right-0 z-20 flex">
          <ZonaList
            zona={zonaList.zona}
            items={zonaList.items}
            onSelect={(p) => setSeleccionada(p)}
            onClose={() => setZonaList(null)}
          />
        </div>
      ) : null}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="left" className="w-[320px] p-0 sm:max-w-[320px]">
          <AnalyticsFilterPanel
            filters={filters}
            onChange={setFilters}
            zonasDisponibles={zonasDisponibles}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
