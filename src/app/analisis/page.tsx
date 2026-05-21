"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { useDict } from "@/i18n/LocaleProvider";
import { OpportunitiesTable } from "@/features/propiedades/components/OpportunitiesTable";
import { useOportunidades } from "@/features/propiedades/useOportunidades";

export default function AnalisisPage() {
  const dict = useDict();
  const { data, loading, error } = useOportunidades();

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
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {error ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-destructive/40 text-sm text-destructive">
              {error}
            </div>
          ) : loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              …
            </div>
          ) : data.length === 0 ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
              {dict.analytics.no_data}
            </div>
          ) : (
            <OpportunitiesTable items={data} />
          )}
        </div>
      </main>
    </div>
  );
}
