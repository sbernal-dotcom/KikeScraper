"use client";

import { X } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import type {
  CategoriaPropiedad,
  Condicion,
  TipoOperacion,
} from "../types";
import {
  countActiveFilters,
  emptyFilters,
  type PropiedadFilters,
} from "../filters";
import {
  labelCategoria,
  labelCondicion,
  labelTipoOperacion,
} from "../format";

type FilterPanelProps = {
  filters: PropiedadFilters;
  onChange: (next: PropiedadFilters) => void;
  fuentesDisponibles: string[];
  className?: string;
};

const OPERACIONES: TipoOperacion[] = ["venta", "alquiler"];
const CATEGORIAS: CategoriaPropiedad[] = [
  "apartamento",
  "casa",
  "terreno",
  "local-comercial",
  "oficina",
  "galera",
];
const CONDICIONES: Condicion[] = ["nueva", "usada"];

export function FilterPanel({
  filters,
  onChange,
  fuentesDisponibles,
  className,
}: FilterPanelProps) {
  const activos = countActiveFilters(filters);

  const toggle = <K extends "operacion" | "categoria" | "condicion" | "fuentes">(
    key: K,
    value: PropiedadFilters[K][number],
  ) => {
    const current = filters[key] as string[];
    const next = current.includes(value as string)
      ? current.filter((v) => v !== value)
      : [...current, value as string];
    onChange({ ...filters, [key]: next });
  };

  const setMin = (key: "habitacionesMin" | "banosMin", value: number) => {
    const current = filters[key];
    onChange({ ...filters, [key]: current === value ? undefined : value });
  };

  return (
    <div className={cn("flex h-full w-full flex-col", className)}>
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3 pr-14">
        <h2 className="text-sm font-semibold tracking-tight">Filtros</h2>
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
            onClick={() => onChange(emptyFilters)}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
            Limpiar
          </button>
        ) : null}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <Group label="Operación">
          <div className="flex flex-wrap gap-1.5">
            {OPERACIONES.map((op) => (
              <Pill
                key={op}
                active={filters.operacion.includes(op)}
                onClick={() => toggle("operacion", op)}
              >
                {labelTipoOperacion(op).replace("en ", "")}
              </Pill>
            ))}
          </div>
        </Group>

        <Separator />

        <Group label="Categoría">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIAS.map((c) => (
              <Pill
                key={c}
                active={filters.categoria.includes(c)}
                onClick={() => toggle("categoria", c)}
              >
                {labelCategoria(c)}
              </Pill>
            ))}
          </div>
        </Group>

        <Separator />

        <Group label="Precio (USD)">
          <div className="flex items-center gap-2">
            <NumberInput
              placeholder="Mín"
              value={filters.precioMin}
              onChange={(v) => onChange({ ...filters, precioMin: v })}
            />
            <span className="text-xs text-muted-foreground">–</span>
            <NumberInput
              placeholder="Máx"
              value={filters.precioMax}
              onChange={(v) => onChange({ ...filters, precioMax: v })}
            />
          </div>
        </Group>

        <Separator />

        <Group label="Recámaras (mín)">
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4].map((n) => (
              <Pill
                key={n}
                active={filters.habitacionesMin === n}
                onClick={() => setMin("habitacionesMin", n)}
              >
                {n === 4 ? "4+" : n}
              </Pill>
            ))}
          </div>
        </Group>

        <Separator />

        <Group label="Baños (mín)">
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3].map((n) => (
              <Pill
                key={n}
                active={filters.banosMin === n}
                onClick={() => setMin("banosMin", n)}
              >
                {n === 3 ? "3+" : n}
              </Pill>
            ))}
          </div>
        </Group>

        <Separator />

        <Group label="Condición">
          <div className="flex flex-wrap gap-1.5">
            {CONDICIONES.map((c) => (
              <Pill
                key={c}
                active={filters.condicion.includes(c)}
                onClick={() => toggle("condicion", c)}
              >
                {labelCondicion(c)}
              </Pill>
            ))}
          </div>
        </Group>

        {fuentesDisponibles.length > 0 ? (
          <>
            <Separator />
            <Group label="Fuente">
              <div className="flex flex-wrap gap-1.5">
                {fuentesDisponibles.map((f) => (
                  <Pill
                    key={f}
                    active={filters.fuentes.includes(f)}
                    onClick={() => toggle("fuentes", f)}
                  >
                    {f}
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

function NumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === "" ? undefined : Number(raw));
      }}
      className="h-9 w-full min-w-0 rounded-md border border-border/60 bg-card/40 px-2 text-xs text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-[#D6FF00]/45 focus:ring-3 focus:ring-[#D6FF00]/15"
    />
  );
}
