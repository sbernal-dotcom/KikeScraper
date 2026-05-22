"use client";

import { useMemo, useState } from "react";
import { useAnalyticsFiltersCtx } from "@/features/propiedades/AnalyticsFiltersContext";
import {
  Building2,
  MapPin,
  Sparkles,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useDict, useFormatters } from "@/i18n/LocaleProvider";
import { AnalyticsFilterPanel } from "@/features/propiedades/components/AnalyticsFilterPanel";
import { OpportunitiesTable } from "@/features/propiedades/components/OpportunitiesTable";
import { applyAnalyticsFilters } from "@/features/propiedades/analyticsFilters";
import { useOportunidades } from "@/features/propiedades/useOportunidades";
import type { Oportunidad } from "@/features/propiedades/types";

export default function AnalisisPage() {
  const dict = useDict();
  const fmt = useFormatters();
  const { data, loading, error } = useOportunidades();
  const { filters, setFilters, activeCount: activos } = useAnalyticsFiltersCtx();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const zonasDisponibles = useMemo(
    () =>
      Array.from(
        new Set(data.map((o) => o.corregimiento).filter(Boolean) as string[]),
      ).sort(),
    [data],
  );

  const filtradas = useMemo(
    () => applyAnalyticsFilters(data, filters),
    [data, filters],
  );

  const kpis = useMemo(() => computeKpis(filtradas), [filtradas]);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
        <SidebarTrigger
          aria-label={dict.nav.open_nav}
          className="size-9 shrink-0 rounded-md border bg-background"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="text-base font-semibold tracking-tight">
            {dict.analytics.title}
          </h1>
          <p className="text-xs text-muted-foreground">
            {dict.analytics.subtitle}
          </p>
        </div>
        <span className="hidden text-xs text-muted-foreground sm:block">
          {filtradas.length} {dict.common.of} {data.length}
        </span>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="relative h-10 shrink-0 gap-2"
          onClick={() => setFiltersOpen(true)}
        >
          <SlidersHorizontal className="size-4" />
          <span className="hidden sm:inline">{dict.properties.filters}</span>
          {activos > 0 ? (
            <span
              className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold leading-none"
              style={{ background: "#D6FF00", color: "#0a0a0a" }}
            >
              {activos}
            </span>
          ) : null}
        </Button>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              icon={<Sparkles className="size-3.5" style={{ color: "#D6FF00" }} />}
              label={dict.analytics.kpi_strong_ops}
              value={String(kpis.oportunidadesFuertes)}
              caption={dict.analytics.kpi_strong_ops_caption}
              accent
            />
            <KpiCard
              icon={<Building2 className="size-3.5 text-muted-foreground" />}
              label={dict.analytics.kpi_total_active}
              value={String(kpis.totalActivas)}
              caption={dict.analytics.kpi_total_active_caption}
            />
            <KpiCard
              icon={<TrendingUp className="size-3.5 text-muted-foreground" />}
              label={dict.analytics.kpi_avg_price_m2}
              value={
                kpis.precioM2Avg
                  ? `${fmt.currency(Math.round(kpis.precioM2Avg))} /m²`
                  : "—"
              }
              caption={dict.analytics.kpi_avg_price_m2_caption}
            />
            <KpiCard
              icon={<MapPin className="size-3.5 text-muted-foreground" />}
              label={dict.analytics.kpi_top_zone}
              value={kpis.zonaMasActiva ?? "—"}
              caption={
                kpis.zonaMasActivaCount
                  ? `${kpis.zonaMasActivaCount} ${dict.analytics.kpi_top_zone_caption}`
                  : "—"
              }
            />
          </section>

          {error ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-destructive/40 text-sm text-destructive">
              {error}
            </div>
          ) : loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              …
            </div>
          ) : filtradas.length === 0 ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
              {dict.analytics.no_data}
            </div>
          ) : (
            <OpportunitiesTable items={filtradas} />
          )}
        </div>
      </main>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="left" className="w-[320px] p-0 sm:max-w-[320px]">
          <AnalyticsFilterPanel
            filters={filters}
            onChange={setFilters}
            zonasDisponibles={zonasDisponibles}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  caption,
  accent = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  caption?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className="mt-1 text-2xl font-bold tracking-tight tabular-nums"
        style={accent ? { color: "#D6FF00" } : undefined}
      >
        {value}
      </div>
      {caption ? (
        <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {caption}
        </div>
      ) : null}
    </div>
  );
}

function computeKpis(data: Oportunidad[]) {
  const oportunidadesFuertes = data.filter(
    (o) => (o.opportunityScore ?? 0) >= 70,
  ).length;
  const totalActivas = data.length;
  const precioM2Avg = data.length
    ? data.reduce((sum, o) => sum + o.precioM2, 0) / data.length
    : 0;
  const zonas = data.reduce<Record<string, number>>((acc, o) => {
    const z = o.corregimiento ?? "—";
    acc[z] = (acc[z] ?? 0) + 1;
    return acc;
  }, {});
  const sorted = Object.entries(zonas).sort(([, a], [, b]) => b - a);
  const zonaMasActiva = sorted[0]?.[0] ?? null;
  const zonaMasActivaCount = sorted[0]?.[1] ?? 0;
  return {
    oportunidadesFuertes,
    totalActivas,
    precioM2Avg,
    zonaMasActiva,
    zonaMasActivaCount,
  };
}
