"use client";

import {
  MARKER_COLOR,
  MARKER_COLOR_ALQUILER,
  MARKER_COLOR_CLUSTER,
} from "@/lib/mapbox/config";
import { useDict } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

export function MarkerLegend({ className }: { className?: string }) {
  const dict = useDict();
  const items: Array<{ color: string; label: string }> = [
    { color: MARKER_COLOR, label: dict.nav.legend_venta },
    { color: MARKER_COLOR_ALQUILER, label: dict.nav.legend_alquiler },
    { color: MARKER_COLOR_CLUSTER, label: dict.nav.legend_cluster },
  ];
  return (
    <div className={cn("w-full px-1 py-0.5", className)}>
      <div className="mb-0.5 px-1 text-[9px] uppercase tracking-wider text-muted-foreground">
        {dict.nav.legend}
      </div>
      <div className="space-y-1 rounded-md border border-border/60 bg-card/40 px-2 py-1.5 text-[10px] leading-tight">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ background: it.color }}
            />
            <span className="text-foreground">{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
