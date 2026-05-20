"use client";

import {
  Bath,
  BedDouble,
  Car,
  ExternalLink,
  MapPin,
  Maximize2,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40 transition-colors hover:border-[#D6FF00]/40 hover:bg-card/60",
        className,
      )}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-zinc-800 via-zinc-900 to-black">
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

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            <MapPin className="size-3" />
            <span className="truncate">{localizacion}</span>
          </div>
          <h3 className="mt-1 line-clamp-1 text-sm font-semibold tracking-tight">
            {propiedad.titulo}
          </h3>
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <span
            className="text-2xl font-bold tracking-tight"
            style={{ color: "#D6FF00" }}
          >
            {fmt.currency(propiedad.precio)}
          </span>
          <div className="text-right text-[11px] leading-tight text-muted-foreground">
            {propiedad.tipoOperacion === "alquiler" ? (
              <div>{dict.card.per_month}</div>
            ) : null}
            {ppm2 ? <div>{fmt.currency(ppm2)} / m²</div> : null}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1 rounded-md border border-border/50 bg-card/30 p-2 text-xs">
          <Spec icon={<Maximize2 className="size-3" />}>
            {propiedad.areaM2 ? `${propiedad.areaM2}m²` : "—"}
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

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <KV label={dict.card.condition_label} value={labels.condicion(propiedad.condicion)} />
          <KV label={dict.card.source} value={propiedad.fuenteNombre} />
        </dl>

        {propiedad.resumenIA ? (
          <>
            <Separator />
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <Sparkles className="size-3" style={{ color: "#D6FF00" }} />
                <span>{dict.card.ai_summary}</span>
              </div>
              <p className="line-clamp-3 text-xs leading-relaxed text-foreground/85">
                {propiedad.resumenIA}
              </p>
            </div>
          </>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="text-[10px] text-muted-foreground">
            {dict.card.detected}: {fmt.date(propiedad.fechaDeteccion)}
          </span>
          <Button
            size="sm"
            className="font-medium"
            style={{ background: "#D6FF00", color: "#0a0a0a" }}
            render={
              <a
                href={propiedad.urlOriginal}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            {dict.card.view_original}
            <ExternalLink className="ml-1 size-3" />
          </Button>
        </div>
      </div>
    </article>
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
    <span className="inline-flex items-center justify-center gap-1 tabular-nums text-foreground/80">
      {icon}
      {children}
    </span>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2 border-b border-border/30 pb-0.5">
      <dt className="truncate text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
