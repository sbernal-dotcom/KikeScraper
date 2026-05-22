"use client";

import { createContext, useContext, useMemo, useState } from "react";

import {
  applyAnalyticsFilters,
  countActiveAnalyticsFilters,
  emptyAnalyticsFilters,
  type AnalyticsFilters,
} from "./analyticsFilters";
import type { Propiedad } from "./types";

type Ctx = {
  filters: AnalyticsFilters;
  setFilters: (next: AnalyticsFilters) => void;
  reset: () => void;
  activeCount: number;
};

const AnalyticsFiltersCtx = createContext<Ctx | null>(null);

export function AnalyticsFiltersProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [filters, setFilters] = useState<AnalyticsFilters>(emptyAnalyticsFilters);
  const value = useMemo<Ctx>(
    () => ({
      filters,
      setFilters,
      reset: () => setFilters(emptyAnalyticsFilters),
      activeCount: countActiveAnalyticsFilters(filters),
    }),
    [filters],
  );
  return (
    <AnalyticsFiltersCtx.Provider value={value}>
      {children}
    </AnalyticsFiltersCtx.Provider>
  );
}

export function useAnalyticsFiltersCtx() {
  const ctx = useContext(AnalyticsFiltersCtx);
  if (!ctx)
    throw new Error(
      "useAnalyticsFiltersCtx must be used inside <AnalyticsFiltersProvider>",
    );
  return ctx;
}

/**
 * Filter a Propiedad[] using the subset of analytics filters that apply to
 * raw properties (operacion / categoria / zona). Score and confidence are
 * derived metrics from vw_oportunidades and are NOT applied here — the map
 * keeps showing terrenos and any rows missing from the oportunidades view.
 */
export function applyMapFilters(
  items: Propiedad[],
  f: AnalyticsFilters,
): Propiedad[] {
  if (
    !f.operacion.length &&
    !f.categoria.length &&
    !f.zonas.length
  )
    return items;
  return items.filter((p) => {
    if (f.operacion.length && !f.operacion.includes(p.tipoOperacion))
      return false;
    if (f.categoria.length && !f.categoria.includes(p.categoria)) return false;
    if (f.zonas.length) {
      const z = p.ubicacion.corregimiento;
      if (!z || !f.zonas.includes(z)) return false;
    }
    return true;
  });
}

export { applyAnalyticsFilters };
