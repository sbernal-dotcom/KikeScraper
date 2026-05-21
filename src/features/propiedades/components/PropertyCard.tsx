"use client";

import {
  Bath,
  BedDouble,
  Car,
  ExternalLink,
  Globe2,
  MapPin,
  Maximize2,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  useDict,
  useDomainLabels,
  useFormatters,
} from "@/i18n/LocaleProvider";

import { accentVars, precioPorM2 } from "../format";
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
  const dict = useDict();
  const labels = useDomainLabels();
  const fmt = useFormatters();

  const ppm2 = precioPorM2(propiedad);
  const localizacion =
    propiedad.ubicacion.corregimiento ??
    propiedad.ubicacion.distrito ??
    propiedad.ubicacion.direccion ??
    "—";

  return (
    <aside
      style={accentVars(propiedad.tipoOperacion)}
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
                color: "var(--accent)",
                background: "var(--accent-soft)",
              }}
            >
              {labels.estado(propiedad.estadoAnuncio)}
            </span>
          </div>
          <h2 className="text-lg font-semibold leading-tight tracking-tight">
            {labels.categoria(propiedad.categoria)}{" "}
            <span className="font-normal text-muted-foreground">
              {labels.tipoOperacion(propiedad.tipoOperacion)}
            </span>
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={dict.common.close}
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
              style={{ color: "var(--accent)" }}
            >
              {fmt.currency(propiedad.precio)}
            </span>
            {propiedad.tipoOperacion === "alquiler" ? (
              <span className="text-xs text-muted-foreground">
                {dict.card.per_month}
              </span>
            ) : null}
          </div>
          {ppm2 ? (
            <p className="text-xs text-muted-foreground">
              {fmt.currency(ppm2)} {dict.card.per_m2}
            </p>
          ) : null}
        </div>

        <Separator className="my-5" />

        <div className="grid grid-cols-2 gap-3 text-sm">
          <SpecChip
            icon={<Maximize2 className="size-3.5" />}
            label={dict.card.area}
            value={propiedad.areaM2 ? `${propiedad.areaM2} m²` : "—"}
          />
          <SpecChip
            icon={<BedDouble className="size-3.5" />}
            label={dict.card.bedrooms}
            value={propiedad.habitaciones?.toString() ?? "—"}
          />
          <SpecChip
            icon={<Bath className="size-3.5" />}
            label={dict.card.bathrooms}
            value={propiedad.banos?.toString() ?? "—"}
          />
          <SpecChip
            icon={<Car className="size-3.5" />}
            label={dict.card.parking}
            value={propiedad.estacionamientos?.toString() ?? "—"}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <SpecChip
            label={dict.card.condition_label}
            value={labels.condicion(propiedad.condicion)}
          />
          <SpecChip
            label={dict.card.listing_status}
            value={labels.estado(propiedad.estadoAnuncio)}
          />
        </div>

        {propiedad.resumenIA ? (
          <>
            <Separator className="my-5" />
            <section>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Sparkles className="size-3.5" style={{ color: "var(--accent)" }} />
                <span>{dict.card.ai_summary}</span>
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
            <dt className="text-muted-foreground">{dict.card.source}</dt>
            <dd className="font-medium">{propiedad.fuenteNombre}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{dict.card.detected}</dt>
            <dd className="font-medium">
              {fmt.date(propiedad.fechaDeteccion)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{dict.card.published}</dt>
            <dd className="font-medium">
              {fmt.date(propiedad.fechaPublicacion)}
            </dd>
          </div>
        </dl>

        {propiedad.otrosAnuncios && propiedad.otrosAnuncios.length > 0 ? (
          <>
            <Separator className="my-5" />
            <section>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Globe2 className="size-3.5" />
                <span>
                  {dict.card.also_listed_on} · {propiedad.otrosAnuncios.length}{" "}
                  {dict.card.other_listings_count}
                </span>
              </div>
              <ul className="space-y-1.5">
                {propiedad.otrosAnuncios.map((a) => (
                  <li key={a.urlOriginal}>
                    <a
                      href={a.urlOriginal}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-card/30 px-3 py-2 text-xs transition-colors hover:bg-card/60"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">
                          {a.fuenteNombre}
                        </span>
                      </span>
                      {a.precio !== undefined ? (
                        <span
                          className="shrink-0 tabular-nums"
                          style={{ color: "var(--accent)" }}
                        >
                          {fmt.currency(a.precio)}
                        </span>
                      ) : null}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </div>

      <footer className="border-t border-border/60 px-5 py-3">
        <Button
          size="lg"
          className="w-full font-medium"
          style={{ background: "var(--accent)", color: "var(--accent-text-on)" }}
          render={
            <a
              href={propiedad.urlOriginal}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          {dict.card.view_original}
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
