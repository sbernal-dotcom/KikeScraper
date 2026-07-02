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
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { satelliteUrl } from "@/lib/satellite-image";
import { cn } from "@/lib/utils";
import {
  useDict,
  useDomainLabels,
  useFormatters,
  useLocale,
} from "@/i18n/LocaleProvider";

import { accentVars, precioPorM2 } from "../format";
import type { Propiedad } from "../types";

type Props = {
  propiedad: Propiedad;
  className?: string;
};

export function PropertyGridCard({ propiedad, className }: Props) {
  const dict = useDict();
  const { locale } = useLocale();
  const labels = useDomainLabels();
  const fmt = useFormatters();
  const resumenTexto =
    propiedad.resumenIA?.[locale] || propiedad.resumenIA?.es || null;

  const ppm2 = precioPorM2(propiedad);
  const localizacion =
    propiedad.ubicacion.corregimiento ??
    propiedad.ubicacion.distrito ??
    "—";

  const otros = propiedad.otrosAnuncios ?? [];

  return (
    <article
      style={accentVars(propiedad.tipoOperacion)}
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40 transition-colors hover:bg-card/55",
        className,
      )}
    >
      {/* Imagen satelital. Generada on-the-fly por Mapbox a partir de
         lat/lng — no scrapeamos fotos del source (ToS-friendly). El
         pin rojo indica la ubicación exacta del edificio. `key`
         garantiza remount al cambiar de prop (sin esto el browser
         mantiene la imagen vieja mientras descarga la nueva). */}
      <div className="relative aspect-[21/9] overflow-hidden bg-muted">
        <img
          key={propiedad.id}
          src={satelliteUrl(propiedad.ubicacion.lat, propiedad.ubicacion.lng, {
            width: 320,
            height: 137,
          })}
          alt={`Vista satelital de ${propiedad.titulo}`}
          decoding="async"
          className="size-full object-cover opacity-0 transition-[opacity,transform] duration-300 group-hover:scale-105 [&.loaded]:opacity-100"
          onLoad={(e) => e.currentTarget.classList.add("loaded")}
        />
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-border/50 bg-card/60 px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="rounded-sm bg-background/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider">
            {labels.categoria(propiedad.categoria)}
          </span>
          <span
            className="rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
            style={{ background: "var(--accent-medium)", color: "var(--accent)" }}
          >
            {labels.tipoOperacion(propiedad.tipoOperacion)}
          </span>
          {propiedad.id.startsWith("preview:") ? (
            <span
              className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{
                color: "#D6FF00",
                background: "rgba(214,255,0,0.18)",
                border: "1px solid rgba(214,255,0,0.5)",
              }}
            >
              {dict.common.new_badge}
            </span>
          ) : null}
        </div>
        <span
          className="shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
          style={{
            background: "rgba(0,0,0,0.5)",
            color: "rgba(255,255,255,0.85)",
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
          <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug tracking-tight">
            {propiedad.titulo}
          </h3>
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <span
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--accent)" }}
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

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
          <KV
            label={dict.card.condition_label}
            value={labels.condicion(propiedad.condicion)}
          />
          <KV label={dict.card.source} value={propiedad.fuenteNombre} />
          <KV
            label={dict.card.detected}
            value={fmt.date(propiedad.fechaDeteccion)}
          />
          <KV
            label={dict.card.published}
            value={fmt.date(propiedad.fechaPublicacion)}
          />
        </dl>

        {resumenTexto ? (
          <>
            <Separator />
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <Sparkles className="size-3" style={{ color: "var(--accent)" }} />
                <span>{dict.card.ai_summary}</span>
              </div>
              <p className="line-clamp-3 text-xs leading-relaxed text-foreground/85">
                {resumenTexto}
              </p>
            </div>
          </>
        ) : null}

        {otros.length > 0 ? (
          <>
            <Separator />
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <Globe2 className="size-3" />
                <span>
                  {dict.card.also_listed_on} · {otros.length}{" "}
                  {dict.card.other_listings_count}
                </span>
              </div>
              <ul className="space-y-1">
                {otros.map((a) => (
                  <li key={a.urlOriginal}>
                    <a
                      href={a.urlOriginal}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-card/30 px-2 py-1.5 text-xs transition-colors hover:bg-card/60"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
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
            </div>
          </>
        ) : null}

        <div className="mt-auto pt-1">
          <Button
            size="sm"
            className="w-full font-medium"
            style={{ background: "var(--accent)", color: "var(--accent-text-on)" }}
            nativeButton={false}
            render={
              <a
                href={propiedad.urlOriginal}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            {dict.card.view_original} — {propiedad.fuenteNombre}
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
