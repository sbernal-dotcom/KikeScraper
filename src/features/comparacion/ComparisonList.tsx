"use client";

import {
  Bath,
  BedDouble,
  Car,
  Maximize2,
  Scale,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useDict,
  useDomainLabels,
  useFormatters,
} from "@/i18n/LocaleProvider";

import { accentVars, precioPorM2 } from "@/features/propiedades/format";
import type { Propiedad } from "@/features/propiedades/types";

import { MAX_COMPARACION, useComparison } from "./ComparisonContext";

type Props = {
  items: Propiedad[];
  selectedId: string | null;
  onSelect: (p: Propiedad) => void;
  className?: string;
};

/**
 * Panel lateral derecho que reemplaza la PropertyCard cuando hay 2+
 * propiedades en comparación. Mismo formato que ZonaList (lista numerada,
 * 300px de ancho), pero cada item muestra TODA la info factual de la
 * propiedad (excepto resumen_ia). Click en un item abre su PropertyCard
 * completa a la izquierda.
 */
export function ComparisonList({
  items,
  selectedId,
  onSelect,
  className,
}: Props) {
  const dict = useDict();
  const labels = useDomainLabels();
  const fmt = useFormatters();
  const comparison = useComparison();

  return (
    <aside
      className={cn(
        "flex h-dvh w-[300px] max-w-[92vw] flex-col border-l border-border/60 bg-background/95 font-sans backdrop-blur-md",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-2 border-b border-border/60 px-3 py-2.5">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Scale className="size-3" />
            <span className="truncate">{dict.compare.title}</span>
          </div>
          <h2 className="text-sm font-semibold leading-tight tracking-tight">
            {items.length} {dict.common.results}{" "}
            <span className="ml-0.5 text-[11px] font-normal text-muted-foreground tabular-nums">
              {items.length}/{MAX_COMPARACION}
            </span>
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={dict.common.clear}
          title={dict.common.clear}
          className="-mr-1 size-7 shrink-0"
          onClick={() => comparison.clear()}
        >
          <X className="size-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-2">
        <ol className="space-y-1.5">
          {items.map((p, i) => {
            const ppm2 = precioPorM2(p);
            const isSelected = p.id === selectedId;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  style={accentVars(p.tipoOperacion)}
                  className={cn(
                    "relative flex w-full flex-col gap-1.5 rounded-lg border bg-card/30 p-2 text-left transition-colors",
                    isSelected
                      ? "border-[color:var(--accent)] bg-card/60"
                      : "border-border/40 hover:border-border hover:bg-card/60",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums"
                      style={{
                        background: "var(--accent-soft)",
                        color: "var(--accent)",
                      }}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <span
                          className="inline-flex items-center rounded-sm px-1 py-0.5 font-semibold"
                          style={{
                            color: "var(--accent)",
                            background: "var(--accent-soft)",
                          }}
                        >
                          {labels.tipoOperacionCorto(p.tipoOperacion)}
                        </span>
                        <span>{labels.categoria(p.categoria)}</span>
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug">
                        {p.titulo}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={dict.compare.remove}
                      title={dict.compare.remove}
                      onClick={(e) => {
                        e.stopPropagation();
                        comparison.remove(p.id);
                      }}
                      className="-mr-0.5 -mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-sm font-bold tabular-nums"
                      style={{ color: "var(--accent)" }}
                    >
                      {fmt.currency(p.precio)}
                    </span>
                    {ppm2 ? (
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {fmt.currency(ppm2)} {dict.card.per_m2}
                      </span>
                    ) : null}
                  </div>

                  {p.ubicacion.corregimiento ? (
                    <div className="text-[10px] text-muted-foreground">
                      {p.ubicacion.corregimiento}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-4 gap-1 text-[10px] tabular-nums text-muted-foreground">
                    <Stat icon={<Maximize2 className="size-3" />} value={p.areaM2 ? `${p.areaM2}` : "—"} suffix="m²" />
                    <Stat icon={<BedDouble className="size-3" />} value={p.habitaciones ?? "—"} />
                    <Stat icon={<Bath className="size-3" />} value={p.banos ?? "—"} />
                    <Stat icon={<Car className="size-3" />} value={p.estacionamientos ?? "—"} />
                  </div>

                  <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                    <span>{p.fuenteNombre}</span>
                    <span className="tabular-nums">
                      {fmt.date(p.fechaActualizacion)}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}

function Stat({
  icon,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  value: string | number;
  suffix?: string;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      {icon}
      <span>
        {value}
        {suffix ? <span className="ml-0.5">{suffix}</span> : null}
      </span>
    </div>
  );
}
