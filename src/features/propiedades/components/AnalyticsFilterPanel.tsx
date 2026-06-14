"use client";

import { X } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useDict, useDomainLabels } from "@/i18n/LocaleProvider";

import {
  countActiveAnalyticsFilters,
  emptyAnalyticsFilters,
  type AnalyticsFilters,
} from "../analyticsFilters";
import type {
  CategoriaPropiedad,
  ConfianzaScore,
  TipoOperacion,
} from "../types";

type Props = {
  filters: AnalyticsFilters;
  onChange: (next: AnalyticsFilters) => void;
  zonasDisponibles: string[];
  fuentesDisponibles: string[];
  className?: string;
};

const OPERACIONES: TipoOperacion[] = ["venta", "alquiler"];
const CATEGORIAS: CategoriaPropiedad[] = [
  "apartamento",
  "casa",
  "local-comercial",
  "oficina",
  "galera",
];
const CONFIANZAS: ConfianzaScore[] = ["baja", "media", "alta"];
const SCORE_MIN_OPTIONS = [50, 70, 90];

export function AnalyticsFilterPanel({
  filters,
  onChange,
  zonasDisponibles,
  fuentesDisponibles,
  className,
}: Props) {
  const dict = useDict();
  const labels = useDomainLabels();
  const activos = countActiveAnalyticsFilters(filters);

  const toggleArray = <
    K extends "operacion" | "categoria" | "confianza" | "zonas" | "fuentes",
  >(
    key: K,
    value: AnalyticsFilters[K][number],
  ) => {
    const cur = filters[key] as string[];
    const next = cur.includes(value as string)
      ? cur.filter((v) => v !== value)
      : [...cur, value as string];
    onChange({ ...filters, [key]: next });
  };

  const confianzaLabel: Record<ConfianzaScore, string> = {
    baja: dict.analytics.confidence_low,
    media: dict.analytics.confidence_medium,
    alta: dict.analytics.confidence_high,
  };

  return (
    <div className={cn("flex h-full w-full flex-col", className)}>
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3 pr-14">
        <h2 className="text-sm font-semibold tracking-tight">
          {dict.properties.filters}
        </h2>
        {activos > 0 ? (
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none"
            style={{ background: "rgba(214,255,0,0.15)", color: "#D6FF00" }}
          >
            {activos}
          </span>
        ) : null}
        {activos > 0 ? (
          <button
            type="button"
            onClick={() => onChange(emptyAnalyticsFilters)}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
            {dict.common.clear}
          </button>
        ) : null}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <Group label={dict.analytics.filter_score_min}>
          <div className="flex flex-wrap gap-1.5">
            {SCORE_MIN_OPTIONS.map((n) => (
              <Pill
                key={n}
                active={filters.scoreMin === n}
                onClick={() =>
                  onChange({
                    ...filters,
                    scoreMin: filters.scoreMin === n ? undefined : n,
                  })
                }
              >
                ≥ {n}
              </Pill>
            ))}
          </div>
        </Group>

        <Separator />

        <Group label={dict.filters.operation}>
          <div className="flex flex-wrap gap-1.5">
            {OPERACIONES.map((op) => (
              <Pill
                key={op}
                active={filters.operacion.includes(op)}
                onClick={() => toggleArray("operacion", op)}
              >
                {labels.tipoOperacionCorto(op)}
              </Pill>
            ))}
          </div>
        </Group>

        <Separator />

        <Group label={dict.filters.category}>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIAS.map((c) => (
              <Pill
                key={c}
                active={filters.categoria.includes(c)}
                onClick={() => toggleArray("categoria", c)}
              >
                {labels.categoria(c)}
              </Pill>
            ))}
          </div>
        </Group>

        <Separator />

        <Group label={dict.analytics.column_confidence}>
          <div className="flex flex-wrap gap-1.5">
            {CONFIANZAS.map((c) => (
              <Pill
                key={c}
                active={filters.confianza.includes(c)}
                onClick={() => toggleArray("confianza", c)}
              >
                {confianzaLabel[c]}
              </Pill>
            ))}
          </div>
        </Group>

        {fuentesDisponibles.length > 0 ? (
          <>
            <Separator />
            <Group label={dict.filters.source}>
              <div className="flex flex-wrap gap-1.5">
                {fuentesDisponibles.map((f) => (
                  <Pill
                    key={f}
                    active={filters.fuentes.includes(f)}
                    onClick={() => toggleArray("fuentes", f)}
                  >
                    {f}
                  </Pill>
                ))}
              </div>
            </Group>
          </>
        ) : null}

        {zonasDisponibles.length > 0 ? (
          <>
            <Separator />
            <Group label={dict.analytics.filter_zone}>
              <div className="flex flex-wrap gap-1.5">
                {zonasDisponibles.map((z) => (
                  <Pill
                    key={z}
                    active={filters.zonas.includes(z)}
                    onClick={() => toggleArray("zonas", z)}
                  >
                    {z}
                  </Pill>
                ))}
              </div>
            </Group>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </h3>
      {children}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-[#D6FF00]/55 bg-[#D6FF00]/10 text-[#D6FF00]"
          : "border-border/60 bg-card/40 text-foreground/75 hover:border-border hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
