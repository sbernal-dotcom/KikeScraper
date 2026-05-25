"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SlidersHorizontal, X } from "lucide-react";

import { MapView } from "@/components/map/MapView";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useDict } from "@/i18n/LocaleProvider";
import {
  applyMapFilters,
  useAnalyticsFiltersCtx,
} from "@/features/propiedades/AnalyticsFiltersContext";
import { PropertyCard } from "@/features/propiedades/components/PropertyCard";
import { ZonaList } from "@/features/propiedades/components/ZonaList";
import { usePropiedades } from "@/features/propiedades/usePropiedades";
import type { Propiedad } from "@/features/propiedades/types";

export function HomeContent() {
  const dict = useDict();
  const { data: propiedades, error } = usePropiedades();
  const { filters, reset, activeCount } = useAnalyticsFiltersCtx();
  const [seleccionada, setSeleccionada] = useState<Propiedad | null>(null);
  // Lista lateral cuando hay >1 pin en la misma zona. Mantiene el grupo
  // abierto cuando el usuario clica una de las propiedades y luego "Volver".
  const [zonaList, setZonaList] = useState<{
    zona: string;
    items: Propiedad[];
  } | null>(null);

  // Detectar preview por contenido (no por query param) para mantener
  // consistencia con /propiedades y /analisis.
  const previewEnabled = propiedades.some((p) => p.id.startsWith("preview:"));

  const visibles = useMemo(
    () => applyMapFilters(propiedades, filters),
    [propiedades, filters],
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

      {activeCount > 0 ? (
        <div className="absolute left-16 top-3 z-20 flex items-center gap-1 rounded-md border border-border/60 bg-background/85 px-2 py-1.5 text-xs shadow-sm backdrop-blur">
          <Link
            href="/analisis"
            className="inline-flex items-center gap-1.5 font-medium hover:text-foreground"
            title={dict.properties.filters}
          >
            <SlidersHorizontal className="size-3.5" />
            <span>
              {visibles.length} / {propiedades.length}
            </span>
            <span
              className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none"
              style={{ background: "#D6FF00", color: "#0a0a0a" }}
            >
              {activeCount}
            </span>
          </Link>
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

      <MapView
        className="h-full w-full"
        propiedades={visibles}
        selectedId={seleccionada?.id ?? null}
        onSelect={(p) => {
          const zona = p.ubicacion.corregimiento;
          const cluster = zona
            ? visibles.filter((x) => x.ubicacion.corregimiento === zona)
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
    </>
  );
}
