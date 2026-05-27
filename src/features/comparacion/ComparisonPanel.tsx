"use client";

import { ExternalLink, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useDict, useDomainLabels, useFormatters } from "@/i18n/LocaleProvider";

import { precioPorM2 } from "@/features/propiedades/format";
import type { Propiedad } from "@/features/propiedades/types";

import { useComparison } from "./ComparisonContext";

export function ComparisonPanel() {
  const dict = useDict();
  const c = useComparison();

  return (
    <Sheet open={c.isOpen} onOpenChange={(v) => (v ? c.open() : c.close())}>
      <SheetContent
        side="right"
        className="w-full p-0 sm:max-w-[min(960px,95vw)]"
      >
        <Header onClose={c.close} />
        <div className="h-[calc(100dvh-3.5rem)] overflow-auto p-5">
          <ComparisonTable items={c.items} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Header({ onClose }: { onClose: () => void }) {
  const dict = useDict();
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border/60 px-5 py-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight">
          {dict.compare.title}
        </h2>
        <p className="text-[11px] text-muted-foreground">
          {dict.compare.subtitle_hint}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={dict.common.close}
        className="size-7"
        onClick={onClose}
      >
        <X className="size-4" />
      </Button>
    </header>
  );
}

function ComparisonTable({ items }: { items: Propiedad[] }) {
  const dict = useDict();
  const labels = useDomainLabels();
  const fmt = useFormatters();

  const rows: { label: string; render: (p: Propiedad) => React.ReactNode }[] = [
    {
      label: dict.compare.field_price,
      render: (p) => (
        <span className="text-base font-semibold tabular-nums">
          {fmt.currency(p.precio)}
          {p.tipoOperacion === "alquiler" ? (
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">
              {dict.card.per_month}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      label: dict.compare.field_price_m2,
      render: (p) => {
        const v = precioPorM2(p);
        return v ? <span className="tabular-nums">{fmt.currency(v)}</span> : "—";
      },
    },
    {
      label: dict.compare.field_operation,
      render: (p) => labels.tipoOperacionCorto(p.tipoOperacion),
    },
    {
      label: dict.compare.field_category,
      render: (p) => labels.categoria(p.categoria),
    },
    {
      label: dict.compare.field_zone,
      render: (p) =>
        p.ubicacion.corregimiento ?? p.ubicacion.distrito ?? "—",
    },
    {
      label: dict.compare.field_area,
      render: (p) => (p.areaM2 ? `${p.areaM2} m²` : "—"),
    },
    {
      label: dict.compare.field_bedrooms,
      render: (p) => p.habitaciones ?? "—",
    },
    {
      label: dict.compare.field_bathrooms,
      render: (p) => p.banos ?? "—",
    },
    {
      label: dict.compare.field_parking,
      render: (p) => p.estacionamientos ?? "—",
    },
    {
      label: dict.compare.field_tags,
      render: (p) => <TagsCell propiedad={p} />,
    },
    {
      label: dict.compare.field_source,
      render: (p) => p.fuenteNombre,
    },
    {
      label: dict.compare.field_link,
      render: (p) => (
        <a
          href={p.urlOriginal}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline"
          style={{ color: "#D6FF00" }}
        >
          {dict.compare.open_listing}
          <ExternalLink className="size-3" />
        </a>
      ),
    },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 w-[180px] bg-background py-2 pr-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            />
            {items.map((p) => (
              <th
                key={p.id}
                scope="col"
                className="border-b border-border/60 px-3 py-2 text-left align-top"
              >
                <TitleCell propiedad={p} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label}>
              <th
                scope="row"
                className={cn(
                  "sticky left-0 z-10 bg-background py-2 pr-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground",
                  i > 0 && "border-t border-border/40",
                )}
              >
                {r.label}
              </th>
              {items.map((p) => (
                <td
                  key={p.id}
                  className={cn(
                    "px-3 py-2 align-top",
                    i > 0 && "border-t border-border/40",
                  )}
                >
                  {r.render(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TitleCell({ propiedad }: { propiedad: Propiedad }) {
  const c = useComparison();
  const dict = useDict();
  return (
    <div className="flex items-start justify-between gap-2">
      <h3 className="line-clamp-2 max-w-[260px] text-sm font-semibold leading-snug">
        {propiedad.titulo}
      </h3>
      <button
        type="button"
        aria-label={dict.compare.remove}
        onClick={() => c.remove(propiedad.id)}
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function TagsCell({ propiedad }: { propiedad: Propiedad }) {
  const dict = useDict();
  const all = [
    ...(propiedad.tagsCaracteristicas ?? []),
    ...(propiedad.tagsExtra ?? []),
  ];
  if (all.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="flex flex-wrap gap-1">
      {all.map((t) => (
        <li
          key={t}
          className="rounded-sm border border-border/60 bg-card/40 px-1.5 py-0.5 text-[10px]"
        >
          {dict.tags[t] ?? t.replace(/-/g, " ")}
        </li>
      ))}
    </ul>
  );
}
