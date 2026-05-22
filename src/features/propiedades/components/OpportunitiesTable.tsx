"use client";

import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  useDict,
  useDomainLabels,
  useFormatters,
} from "@/i18n/LocaleProvider";

import { accentVars } from "../format";
import type { ConfianzaScore, Oportunidad } from "../types";

type Props = { items: Oportunidad[] };

function scoreTier(score: number | null): {
  bg: string;
  text: string;
  tier: "strong" | "good" | "normal" | "overpriced" | "none";
} {
  if (score === null) return { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.5)", tier: "none" };
  if (score >= 90) return { bg: "rgba(34,197,94,0.18)", text: "#86efac", tier: "strong" };
  if (score >= 70) return { bg: "rgba(214,255,0,0.18)", text: "#D6FF00", tier: "good" };
  if (score >= 50) return { bg: "rgba(255,236,0,0.16)", text: "#FFEC00", tier: "normal" };
  return { bg: "rgba(239,68,68,0.18)", text: "#fca5a5", tier: "overpriced" };
}

export function OpportunitiesTable({ items }: Props) {
  const dict = useDict();
  const labels = useDomainLabels();
  const fmt = useFormatters();

  return (
    <div className="overflow-hidden rounded-xl border border-border/60">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-card/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <Th className="w-[80px] text-center">{dict.analytics.column_score}</Th>
              <Th>{dict.analytics.column_property}</Th>
              <Th>{dict.analytics.column_zone}</Th>
              <Th className="text-right">{dict.analytics.column_price}</Th>
              <Th className="text-right">{dict.analytics.column_area}</Th>
              <Th className="text-right">{dict.analytics.column_price_m2}</Th>
              <Th className="text-right">{dict.analytics.column_benchmark}</Th>
              <Th className="text-right">{dict.analytics.column_discount}</Th>
              <Th className="text-center">{dict.analytics.column_confidence}</Th>
              <Th className="min-w-[220px]">{dict.analytics.column_source}</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <Row key={o.id} o={o} labels={labels} fmt={fmt} dict={dict} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  o,
  labels,
  fmt,
  dict,
}: {
  o: Oportunidad;
  labels: ReturnType<typeof useDomainLabels>;
  fmt: ReturnType<typeof useFormatters>;
  dict: ReturnType<typeof useDict>;
}) {
  const tier = scoreTier(o.opportunityScore);
  const accent = accentVars(o.tipoOperacion);

  return (
    <tr
      style={accent}
      className="border-t border-border/40 transition-colors hover:bg-card/40"
    >
      <Td className="text-center">
        <span
          className="inline-flex h-7 min-w-[44px] items-center justify-center rounded-md px-2 text-xs font-semibold tabular-nums"
          style={{ background: tier.bg, color: tier.text }}
        >
          {o.opportunityScore !== null ? Math.round(o.opportunityScore) : "—"}
        </span>
      </Td>
      <Td>
        <div className="flex flex-col">
          <span className="line-clamp-1 font-medium">{o.titulo}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {labels.categoria(o.categoria)} · {labels.tipoOperacionCorto(o.tipoOperacion)}
          </span>
        </div>
      </Td>
      <Td className="text-muted-foreground">{o.corregimiento ?? "—"}</Td>
      <Td
        className="text-right font-medium tabular-nums"
        style={{ color: "var(--accent)" }}
      >
        {fmt.currency(o.precio)}
      </Td>
      <Td className="text-right tabular-nums">{o.areaM2} m²</Td>
      <Td className="text-right tabular-nums">{fmt.currency(Math.round(o.precioM2))}</Td>
      <Td className="text-right tabular-nums text-muted-foreground">
        {o.benchmark !== null ? fmt.currency(Math.round(o.benchmark)) : "—"}
      </Td>
      <Td className="text-right tabular-nums">
        {o.descuentoPct !== null ? (
          <span
            className={cn(
              "font-medium",
              o.descuentoPct > 0
                ? "text-emerald-400"
                : o.descuentoPct < 0
                  ? "text-red-400"
                  : "text-muted-foreground",
            )}
          >
            {o.descuentoPct > 0 ? "+" : ""}
            {o.descuentoPct.toFixed(1)}%
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </Td>
      <Td className="text-center">
        <ConfianzaBadge value={o.confianza} n={o.nComparables} dict={dict} />
      </Td>
      <Td className="align-top">
        <div className="flex flex-col gap-1">
          <a
            href={o.urlOriginal}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs hover:bg-card/60"
            title={o.fuenteNombre}
          >
            <ExternalLink
              className="size-3 shrink-0"
              style={{ color: "var(--accent)" }}
            />
            <span className="truncate font-medium">{o.fuenteNombre}</span>
          </a>
          {o.otrosAnuncios.map((a) => (
            <a
              key={a.urlOriginal}
              href={a.urlOriginal}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-card/30 px-1.5 py-1 text-[11px] text-muted-foreground hover:border-border hover:text-foreground"
              title={a.fuenteNombre}
            >
              <ExternalLink className="size-3 shrink-0" />
              <span className="truncate">{a.fuenteNombre}</span>
            </a>
          ))}
        </div>
      </Td>
    </tr>
  );
}

function ConfianzaBadge({
  value,
  n,
  dict,
}: {
  value: ConfianzaScore;
  n: number | null;
  dict: ReturnType<typeof useDict>;
}) {
  const labelMap = {
    baja: dict.analytics.confidence_low,
    media: dict.analytics.confidence_medium,
    alta: dict.analytics.confidence_high,
  } as const;
  const styleMap = {
    baja: { bg: "rgba(239,68,68,0.14)", color: "#fca5a5" },
    media: { bg: "rgba(234,179,8,0.14)", color: "#fcd34d" },
    alta: { bg: "rgba(34,197,94,0.16)", color: "#86efac" },
  } as const;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide tabular-nums"
      style={styleMap[value]}
      title={`n = ${n ?? 0}`}
    >
      {labelMap[value]}
      {n !== null ? <span className="opacity-60">·{n}</span> : null}
    </span>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={cn("px-3 py-2 text-left font-medium", className)}>
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td className={cn("px-3 py-2.5 align-middle", className)} style={style}>
      {children}
    </td>
  );
}
