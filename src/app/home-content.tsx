"use client";

import { useMemo, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";

import { MapView, type MapPin } from "@/components/map/MapView";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useDict } from "@/i18n/LocaleProvider";
import { useComparison } from "@/features/comparacion/ComparisonContext";
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
  const comparison = useComparison();
  const [seleccionada, setSeleccionada] = useState<Propiedad | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Cards visibles a la derecha: las items en comparación + la seleccionada
  // si no está ya comparada. Se apilan de izquierda (más vieja) a derecha
  // (más nueva). Cada una ocupa 380px.
  const visibleCards = useMemo<Propiedad[]>(() => {
    const inCompare = new Set(comparison.items.map((p) => p.id));
    const list: Propiedad[] = [...comparison.items];
    if (seleccionada && !inCompare.has(seleccionada.id)) list.push(seleccionada);
    return list;
  }, [comparison.items, seleccionada]);
  // Lista lateral cuando hay >1 pin en la misma zona. Mantiene el grupo
  // abierto cuando el usuario clica una de las propiedades y luego "Volver".
  const [zonaList, setZonaList] = useState<{
    zona: string;
    items: Propiedad[];
  } | null>(null);

  // Propiedades que pasan los filtros (matched). Null = sin filtros = todas matched.
  const matchedSet = useMemo<Set<string> | null>(() => {
    if (activeCount === 0) return null;
    const list = applyMapFilters(propiedades, filters);
    return new Set(list.map((p) => p.id));
  }, [propiedades, filters, activeCount]);

  const matchedCount = matchedSet?.size ?? propiedades.length;

  // Agrupa propiedades por (zona, operación) → un pin por grupo.
  // Pin con count>1 representa un cluster; count=1 es una propiedad sola.
  // `clusters` mapea pinId → propiedades de ese pin para el click handler.
  const { pins, clusters } = useMemo(() => {
    const byKey = new Map<string, Propiedad[]>();
    for (const p of propiedades) {
      const zona = p.ubicacion.corregimiento ?? `_solo:${p.id}`;
      const key = `${zona}__${p.tipoOperacion}`;
      const existing = byKey.get(key);
      if (existing) existing.push(p);
      else byKey.set(key, [p]);
    }
    const pinsArr: MapPin[] = [];
    const clusterMap = new Map<string, Propiedad[]>();
    for (const [key, items] of byKey) {
      const first = items[0];
      const pinId = items.length > 1 ? `cluster:${key}` : first.id;
      pinsArr.push({
        id: pinId,
        lat: first.ubicacion.lat,
        lng: first.ubicacion.lng,
        tipoOperacion: first.tipoOperacion,
        isPreview: items.some((i) => i.id.startsWith("preview:")),
        count: items.length,
      });
      clusterMap.set(pinId, items);
    }
    return { pins: pinsArr, clusters: clusterMap };
  }, [propiedades]);

  // Pin matched si AL MENOS uno de sus items pasa el filtro.
  const matchedPinIds = useMemo<Set<string> | null>(() => {
    if (!matchedSet) return null;
    const ids = new Set<string>();
    for (const pin of pins) {
      const items = clusters.get(pin.id) ?? [];
      if (items.some((i) => matchedSet.has(i.id))) ids.add(pin.id);
    }
    return ids;
  }, [pins, clusters, matchedSet]);

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

  return (
    <>
      <SidebarTrigger
        aria-label={dict.nav.open_nav}
        className="absolute left-3 top-3 z-20 size-9 rounded-md border bg-background/80 shadow-sm backdrop-blur hover:bg-background"
      />

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
        pins={pins}
        matchedIds={matchedPinIds}
        selectedId={seleccionada?.id ?? null}
        onSelect={(pinId) => {
          const items = clusters.get(pinId) ?? [];
          // Si hay filtros activos, solo mostrar los items que pasan.
          const visibleItems = matchedSet
            ? items.filter((i) => matchedSet.has(i.id))
            : items;
          if (visibleItems.length === 0) return;
          if (visibleItems.length > 1) {
            // Cluster: abrir SOLO la lista. El usuario elige cuál ver.
            const zona = visibleItems[0].ubicacion.corregimiento ?? "";
            setZonaList({ zona, items: visibleItems });
            setSeleccionada(null);
          } else {
            // Pin único: abrir la card directo.
            setZonaList(null);
            setSeleccionada(visibleItems[0]);
          }
        }}
        rightInsetPx={
          zonaList
            ? 380
            : visibleCards.length === 0
              ? 0
              : visibleCards.length === 1
                ? 380
                : visibleCards.length * 300
        }
        leftInsetPx={activeCount > 0 ? 260 : 180}
      />
      {error ? (
        <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-md border border-destructive/60 bg-background/95 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}
      {zonaList ? (
        // Modo cluster: si el usuario ya eligió una de la lista, mostramos su
        // PropertyCard (con Back → vuelve al listado) para que pueda usar el
        // botón "Agregar a comparación". Si no, mostramos el listado.
        seleccionada ? (
          <div className="absolute inset-y-0 right-0 z-20 flex">
            <PropertyCard
              propiedad={seleccionada}
              onBack={() => setSeleccionada(null)}
              onClose={() => {
                setSeleccionada(null);
                setZonaList(null);
              }}
            />
          </div>
        ) : (
          <div className="absolute inset-y-0 right-0 z-20 flex">
            <ZonaList
              zona={zonaList.zona}
              items={zonaList.items}
              onSelect={(p) => setSeleccionada(p)}
              onClose={() => setZonaList(null)}
            />
          </div>
        )
      ) : visibleCards.length > 0 ? (
        <div className="absolute inset-y-0 right-0 z-20 flex">
          {visibleCards.map((p) => (
            <PropertyCard
              key={p.id}
              propiedad={p}
              compact={visibleCards.length > 1}
              onClose={() => {
                // Si está en comparación, sacarla de ahí (y de seleccionada si
                // coincidía). Si era la seleccionada sola, limpiar selección.
                if (comparison.has(p.id)) {
                  comparison.remove(p.id);
                  if (seleccionada?.id === p.id) setSeleccionada(null);
                } else {
                  setSeleccionada(null);
                }
              }}
            />
          ))}
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
