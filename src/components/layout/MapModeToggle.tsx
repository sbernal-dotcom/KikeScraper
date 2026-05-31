"use client";

import { Box } from "lucide-react";

import { useMapMode, type MapMode } from "@/features/map/MapModeProvider";
import { useDict } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ code: MapMode; labelKey: "map_view_2d" | "map_view_3d" }> = [
  { code: "2d", labelKey: "map_view_2d" },
  { code: "3d", labelKey: "map_view_3d" },
];

export function MapModeToggle({ className }: { className?: string }) {
  const { mode, setMode } = useMapMode();
  const dict = useDict();

  return (
    <div className={cn("w-full px-1 py-0.5", className)}>
      <div className="mb-0.5 flex items-center gap-1 px-1 text-[9px] uppercase tracking-wider text-muted-foreground">
        <Box className="size-2.5" />
        <span>{dict.nav.map_view}</span>
      </div>
      <div
        role="group"
        aria-label={dict.nav.map_view}
        className="grid grid-cols-2 gap-0.5 rounded-md border border-border/60 bg-card/40 p-0.5"
      >
        {OPTIONS.map((o) => (
          <button
            key={o.code}
            type="button"
            onClick={() => setMode(o.code)}
            aria-pressed={mode === o.code}
            className={cn(
              "rounded-sm px-1.5 py-0.5 text-[11px] font-medium tracking-wide transition-colors",
              mode === o.code
                ? "bg-[#D6FF00]/15 text-[#D6FF00]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {dict.nav[o.labelKey]}
          </button>
        ))}
      </div>
    </div>
  );
}
