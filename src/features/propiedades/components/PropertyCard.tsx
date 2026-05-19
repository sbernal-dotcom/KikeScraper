"use client";

import {
  Bath,
  BedDouble,
  Car,
  ExternalLink,
  MapPin,
  Maximize2,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import {
  formatoFecha,
  formatoPrecio,
  labelCategoria,
  labelCondicion,
  labelEstado,
  labelTipoOperacion,
  precioPorM2,
} from "../format";
import type { Propiedad } from "../types";

type PropertyCardProps = {
  propiedad: Propiedad;
  onClose: () => void;
  className?: string;
};

export function PropertyCard({
  propiedad,
  onClose,
  className,
}: PropertyCardProps) {
  const ppm2 = precioPorM2(propiedad);
  const localizacion =
    propiedad.ubicacion.corregimiento ??
    propiedad.ubicacion.distrito ??
    propiedad.ubicacion.direccion ??
    "—";

  return (
    <aside
      className={cn(
        "flex h-dvh w-[380px] max-w-[92vw] flex-col border-l border-border/60 bg-background/95 font-sans backdrop-blur-md",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-2 border-b border-border/60 px-5 py-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            <MapPin className="size-3" />
            <span className="truncate">{localizacion}</span>
            <span
              className="ml-1.5 inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              style={{
                color: "#D6FF00",
                background: "rgba(214,255,0,0.1)",
              }}
            >
              {labelEstado(propiedad.estadoAnuncio)}
            </span>
          </div>
          <h2 className="text-lg font-semibold leading-tight tracking-tight">
            {labelCategoria(propiedad.categoria)}{" "}
            <span className="font-normal text-muted-foreground">
              {labelTipoOperacion(propiedad.tipoOperacion)}
            </span>
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Cerrar"
          className="-mr-1 size-7 shrink-0"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-2">
            <span
              className="text-3xl font-bold tracking-tight"
              style={{ color: "#D6FF00" }}
            >
              {formatoPrecio(propiedad.precio, propiedad.moneda)}
            </span>
            {propiedad.tipoOperacion === "alquiler" ? (
              <span className="text-xs text-muted-foreground">/ mes</span>
            ) : null}
          </div>
          {ppm2 ? (
            <p className="text-xs text-muted-foreground">
              {formatoPrecio(ppm2, propiedad.moneda)} por m²
            </p>
          ) : null}
        </div>

        <Separator className="my-5" />

        <div className="grid grid-cols-2 gap-3 text-sm">
          <SpecChip
            icon={<Maximize2 className="size-3.5" />}
            label="Área"
            value={propiedad.areaM2 ? `${propiedad.areaM2} m²` : "—"}
          />
          <SpecChip
            icon={<BedDouble className="size-3.5" />}
            label="Recámaras"
            value={propiedad.habitaciones?.toString() ?? "—"}
          />
          <SpecChip
            icon={<Bath className="size-3.5" />}
            label="Baños"
            value={propiedad.banos?.toString() ?? "—"}
          />
          <SpecChip
            icon={<Car className="size-3.5" />}
            label="Estacionamientos"
            value={propiedad.estacionamientos?.toString() ?? "—"}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <SpecChip label="Condición" value={labelCondicion(propiedad.condicion)} />
          <SpecChip
            label="Estado anuncio"
            value={labelEstado(propiedad.estadoAnuncio)}
          />
        </div>

        {propiedad.resumenIA ? (
          <>
            <Separator className="my-5" />
            <section>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Sparkles className="size-3.5" style={{ color: "#D6FF00" }} />
                <span>Resumen IA</span>
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">
                {propiedad.resumenIA}
              </p>
            </section>
          </>
        ) : null}

        <Separator className="my-5" />

        <dl className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Fuente</dt>
            <dd className="font-medium">{propiedad.fuenteNombre}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Detectada</dt>
            <dd className="font-medium">
              {formatoFecha(propiedad.fechaDeteccion)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Publicada</dt>
            <dd className="font-medium">
              {formatoFecha(propiedad.fechaPublicacion)}
            </dd>
          </div>
        </dl>
      </div>

      <footer className="border-t border-border/60 px-5 py-3">
        <Button
          size="lg"
          className="w-full font-medium"
          style={{ background: "#D6FF00", color: "#0a0a0a" }}
          render={
            <a
              href={propiedad.urlOriginal}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          Ver anuncio original
          <ExternalLink className="ml-1 size-4" />
        </Button>
      </footer>
    </aside>
  );
}

function SpecChip({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-card/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-0.5 text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}
