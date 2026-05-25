"use client";

import { Bath, BedDouble, ChevronRight, MapPin, Maximize2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useDict,
  useDomainLabels,
  useFormatters,
} from "@/i18n/LocaleProvider";

import { accentVars } from "../format";
import type { Propiedad } from "../types";

type Props = {
  zona: string;
  items: Propiedad[];
  onSelect: (p: Propiedad) => void;
  onClose: () => void;
  className?: string;
};

export function ZonaList({ zona, items, onSelect, onClose, className }: Props) {
  const dict = useDict();
  const labels = useDomainLabels();
  const fmt = useFormatters();

  // Ordenar por precio ascendente — "el mejor precio primero".
  const sorted = [...items].sort((a, b) => a.precio - b.precio);

  return (
    <aside
      className={cn(
        "flex h-dvh w-[380px] max-w-[92vw] flex-col border-l border-border/60 bg-background/95 font-sans backdrop-blur-md",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-2 border-b border-border/60 px-5 py-4">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            <MapPin className="size-3" />
            <span className="truncate">{zona}</span>
          </div>
          <h2 className="text-lg font-semibold leading-tight tracking-tight">
            {items.length} {dict.common.results}
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={dict.common.close}
          className="-mr-1 size-7 shrink-0"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-3">
        <ol className="space-y-2">
          {sorted.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelect(p)}
                style={accentVars(p.tipoOperacion)}
                className="flex w-full items-start gap-3 rounded-lg border border-border/40 bg-card/30 p-3 text-left transition-colors hover:border-border hover:bg-card/60"
              >
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums"
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
                  <div className="mt-1 line-clamp-1 text-sm font-medium leading-snug">
                    {p.titulo}
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span
                      className="text-base font-bold tabular-nums"
                      style={{ color: "var(--accent)" }}
                    >
                      {fmt.currency(p.precio)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground tabular-nums">
                    {p.areaM2 ? (
                      <span className="inline-flex items-center gap-1">
                        <Maximize2 className="size-3" />
                        {p.areaM2} m²
                      </span>
                    ) : null}
                    {p.habitaciones != null ? (
                      <span className="inline-flex items-center gap-1">
                        <BedDouble className="size-3" />
                        {p.habitaciones}
                      </span>
                    ) : null}
                    {p.banos != null ? (
                      <span className="inline-flex items-center gap-1">
                        <Bath className="size-3" />
                        {p.banos}
                      </span>
                    ) : null}
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 self-center text-muted-foreground" />
              </button>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
