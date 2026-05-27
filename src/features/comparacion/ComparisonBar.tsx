"use client";

import { Scale, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDict } from "@/i18n/LocaleProvider";

import { MAX_COMPARACION, useComparison } from "./ComparisonContext";

export function ComparisonBar() {
  const dict = useDict();
  const c = useComparison();
  if (c.items.length === 0) return null;

  const countText = dict.compare.bar_count
    .replace("{count}", String(c.items.length))
    .replace("{max}", String(MAX_COMPARACION));

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-2xl items-center gap-3 rounded-full border border-border/60 bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur">
        <Scale className="size-4 shrink-0" style={{ color: "#D6FF00" }} />
        <span className="text-xs font-medium tabular-nums">{countText}</span>
        <ul className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {c.items.map((p) => (
            <li
              key={p.id}
              className="flex max-w-[180px] items-center gap-1 truncate rounded-full border border-border/60 bg-card/50 px-2 py-0.5 text-[11px]"
            >
              <span className="truncate">{p.titulo}</span>
              <button
                type="button"
                aria-label={dict.compare.remove}
                className="text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => c.remove(p.id)}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={c.clear}
        >
          <Trash2 className="size-3.5" />
          {dict.compare.clear_btn}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8 font-medium"
          disabled={!c.canCompare}
          onClick={c.open}
          style={{ background: "#D6FF00", color: "#0a0a0a" }}
        >
          {dict.compare.compare_btn}
        </Button>
      </div>
    </div>
  );
}
