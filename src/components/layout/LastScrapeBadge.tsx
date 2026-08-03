"use client";

import { Clock } from "lucide-react";

import { useLastScraperRun } from "@/features/scraper/useLastScraperRun";
import { useDict, useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

function relative(iso: string, locale: "es" | "en"): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return locale === "es" ? "recién" : "just now";
  }
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return locale === "es" ? "recién" : "just now";
  if (minutes < 60)
    return locale === "es" ? `hace ${minutes} min` : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === "es" ? `hace ${hours} h` : `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return locale === "es" ? `hace ${days} d` : `${days} d ago`;
}

export function LastScrapeBadge({ className }: { className?: string }) {
  const run = useLastScraperRun();
  const dict = useDict();
  const { locale } = useLocale();

  return (
    <div className={cn("w-full px-1 py-0.5", className)}>
      <div className="mb-0.5 flex items-center gap-1 px-1 text-[9px] uppercase tracking-wider text-muted-foreground">
        <Clock className="size-2.5" />
        <span>{dict.nav.last_scrape}</span>
      </div>
      <div className="rounded-md border border-border/60 bg-card/40 px-2 py-1 text-[10px] leading-tight">
        {run ? (
          <>
            <div className="text-foreground">{relative(run.finishedAt, locale)}</div>
            <div className="text-muted-foreground tabular-nums">
              +{run.inserted} {dict.nav.last_scrape_new}
              {run.updated > 0
                ? ` · ${run.updated} ${dict.nav.last_scrape_updated}`
                : ""}
            </div>
          </>
        ) : (
          <div className="text-muted-foreground">
            {dict.nav.last_scrape_never}
          </div>
        )}
      </div>
    </div>
  );
}
