"use client";

import { Bath, BedDouble, Car, MapPin, Maximize2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  useDict,
  useDomainLabels,
  useFormatters,
} from "@/i18n/LocaleProvider";

import { precioPorM2 } from "../format";
import type { Propiedad } from "../types";

type Props = {
  propiedad: Propiedad;
  className?: string;
};

export function PropertyGridCard({ propiedad, className }: Props) {
  const dict = useDict();
  const labels = useDomainLabels();
  const fmt = useFormatters();

  const ppm2 = precioPorM2(propiedad);
  const localizacion =
    propiedad.ubicacion.corregimiento ??
    propiedad.ubicacion.distrito ??
    "—";

  return (
    <a
      href={propiedad.urlOriginal}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40 transition-all hover:border-[#D6FF00]/40 hover:bg-card/60",
        className,
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-zinc-800 via-zinc-900 to-black">
        <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-widest text-muted-foreground/60">
          {dict.card.no_image}
        </div>
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          <span className="rounded-sm bg-background/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider backdrop-blur">
            {labels.categoria(propiedad.categoria)}
          </span>
          <span
            className="rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
            style={{ background: "rgba(214,255,0,0.14)", color: "#D6FF00" }}
          >
            {labels.tipoOperacion(propiedad.tipoOperacion)}
          </span>
        </div>
        <span
          className="absolute right-2 top-2 rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
          style={{
            background: "rgba(0,0,0,0.6)",
            color: "rgba(255,255,255,0.9)",
          }}
        >
          {labels.estado(propiedad.estadoAnuncio)}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          <MapPin className="size-3" />
          <span className="truncate">{localizacion}</span>
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <span
            className="text-xl font-bold tracking-tight"
            style={{ color: "#D6FF00" }}
          >
            {fmt.currency(propiedad.precio)}
          </span>
          {ppm2 ? (
            <span className="text-[11px] text-muted-foreground">
              {fmt.currency(ppm2)}/m²
            </span>
          ) : null}
        </div>

        <div className="mt-auto flex items-center gap-3 pt-1 text-xs text-muted-foreground">
          <Spec icon={<Maximize2 className="size-3" />}>
            {propiedad.areaM2 ? `${propiedad.areaM2} m²` : "—"}
          </Spec>
          <Spec icon={<BedDouble className="size-3" />}>
            {propiedad.habitaciones ?? "—"}
          </Spec>
          <Spec icon={<Bath className="size-3" />}>
            {propiedad.banos ?? "—"}
          </Spec>
          <Spec icon={<Car className="size-3" />}>
            {propiedad.estacionamientos ?? "—"}
          </Spec>
        </div>
      </div>
    </a>
  );
}

function Spec({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      {icon}
      {children}
    </span>
  );
}
