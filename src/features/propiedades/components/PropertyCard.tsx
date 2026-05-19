"use client";

import { ExternalLink, MapPin, Sparkles, X } from "lucide-react";

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
    <article
      className={cn(
        "w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-background/95 shadow-2xl backdrop-blur",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-2 px-4 pb-2 pt-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3.5" />
            <span className="truncate">{localizacion}</span>
          </div>
          <h3 className="mt-1 text-base font-semibold leading-tight">
            {labelCategoria(propiedad.categoria)}{" "}
            <span className="text-muted-foreground">
              {labelTipoOperacion(propiedad.tipoOperacion)}
            </span>
          </h3>
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

      <div className="px-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xl font-bold tracking-tight text-[color:#D6FF00]">
            {formatoPrecio(propiedad.precio, propiedad.moneda)}
          </span>
          {ppm2 ? (
            <span className="text-xs text-muted-foreground">
              {formatoPrecio(ppm2, propiedad.moneda)} / m²
            </span>
          ) : null}
        </div>
      </div>

      <Separator className="my-3" />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 text-sm">
        <Spec label="Área" value={propiedad.areaM2 ? `${propiedad.areaM2} m²` : "—"} />
        <Spec
          label="Recámaras"
          value={propiedad.habitaciones?.toString() ?? "—"}
        />
        <Spec label="Baños" value={propiedad.banos?.toString() ?? "—"} />
        <Spec
          label="Estacionamientos"
          value={propiedad.estacionamientos?.toString() ?? "—"}
        />
        <Spec label="Condición" value={labelCondicion(propiedad.condicion)} />
        <Spec label="Estado anuncio" value={labelEstado(propiedad.estadoAnuncio)} />
      </dl>

      {propiedad.resumenIA ? (
        <>
          <Separator className="my-3" />
          <div className="px-4">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5 text-[color:#D6FF00]" />
              <span>Resumen IA</span>
            </div>
            <p className="text-sm leading-snug text-foreground/90">
              {propiedad.resumenIA}
            </p>
          </div>
        </>
      ) : null}

      <Separator className="my-3" />

      <footer className="flex items-center justify-between gap-3 px-4 pb-3">
        <div className="min-w-0 text-xs leading-tight text-muted-foreground">
          <div className="truncate">
            Fuente:{" "}
            <span className="text-foreground">{propiedad.fuenteNombre}</span>
          </div>
          <div className="truncate">
            Detectada: {formatoFecha(propiedad.fechaDeteccion)}
          </div>
        </div>
        <Button
          size="sm"
          className="shrink-0"
          render={
            <a
              href={propiedad.urlOriginal}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          <ExternalLink className="mr-1 size-3.5" />
          Ver anuncio
        </Button>
      </footer>
    </article>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/40 pb-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}
