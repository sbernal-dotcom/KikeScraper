"use client";

import { useLayoutEffect, useRef } from "react";
import {
  ArrowLeft,
  Bath,
  BedDouble,
  Car,
  ExternalLink,
  Globe2,
  MapPin,
  Maximize2,
  Scale,
  Sparkles,
  Tag,
  X,
} from "lucide-react";

import {
  MAX_COMPARACION,
  useComparison,
} from "@/features/comparacion/ComparisonContext";

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

type PropertyCardProps = {
  propiedad: Propiedad;
  onClose: () => void;
  onBack?: () => void;
  className?: string;
  /** Compacta cuando hay 2+ cards apiladas (modo comparación). */
  compact?: boolean;
};

export function PropertyCard({
  propiedad,
  onClose,
  onBack,
  className,
  compact = false,
}: PropertyCardProps) {
  const dict = useDict();
  const { locale } = useLocale();
  const labels = useDomainLabels();
  const fmt = useFormatters();
  const comparison = useComparison();
  const inCompare = comparison.has(propiedad.id);
  const cantAdd = !inCompare && comparison.isFull;
  // Si no hay versión EN aún (resumenes legacy), caemos al ES para no
  // mostrar la sección vacía.
  const resumenTexto =
    propiedad.resumenIA?.[locale] || propiedad.resumenIA?.es || null;

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
        "flex h-dvh w-full flex-col border-l border-border/60 bg-background/95 font-sans backdrop-blur-md sm:max-w-[92vw]",
        compact ? "sm:w-[300px]" : "sm:w-[380px]",
        className,
      )}
    >
      <header
        className={cn(
          "flex items-start justify-between gap-2 border-b border-border/60",
          compact ? "px-3 py-2.5" : "px-5 py-4",
        )}
      >
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={dict.common.back}
            className="-ml-1 size-7 shrink-0"
            onClick={onBack}
          >
            <ArrowLeft className="size-4" />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            <MapPin className="size-3" />
            <span className="truncate">{localizacion}</span>
            {propiedad.ubicacion.precision !== "exacta" ? (
              <span
                className="inline-flex items-center rounded-sm border border-dashed border-amber-400/60 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-amber-300"
                title={dict.card.location_approximate_hint}
              >
                {dict.card.location_approximate}
              </span>
            ) : null}
            <span className="ml-1.5 inline-flex items-center rounded-sm bg-background/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground/85">
              {labels.categoria(propiedad.categoria)}
            </span>
            <span
              className="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              style={{
                color: "var(--accent)",
                background: "var(--accent-soft)",
              }}
            >
              {labels.estado(propiedad.estadoAnuncio)}
            </span>
            <span
              className="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              style={{
                color: "var(--accent)",
                background: "var(--accent-soft)",
              }}
            >
              {labels.tipoOperacionCorto(propiedad.tipoOperacion)}
            </span>
            {propiedad.id.startsWith("preview:") ? (
              <span
                className="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
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
          <FittedTitle
            text={propiedad.titulo}
            className={cn(
              "font-semibold leading-tight tracking-tight",
              compact ? "text-sm" : "text-lg",
            )}
            minPx={compact ? 11 : 13}
          />
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

      {propiedad.estadoAnuncio !== "activo" ? (
        <div
          className={cn(
            "flex flex-col gap-0.5 border-b border-destructive/40 bg-destructive/10 text-destructive",
            compact ? "px-3 py-2 text-[11px]" : "px-5 py-2.5 text-xs",
          )}
        >
          <div className="font-semibold uppercase tracking-wider">
            {dict.card.unavailable_banner} · {labels.estado(propiedad.estadoAnuncio)}
          </div>
          {propiedad.motivoEstado ? (
            <div className="opacity-90">{propiedad.motivoEstado}</div>
          ) : null}
          {propiedad.fechaUltimaRevision ? (
            <div className="text-[10px] opacity-70">
              {dict.card.unavailable_since}{" "}
              {/* M11: pasar el locale explícito — sin él el navegador usa
                  su locale de S.O., mezclando app-ES con fecha-EN. */}
              {new Date(propiedad.fechaUltimaRevision).toLocaleDateString(
                locale === "en" ? "en-US" : "es-PA",
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Imagen satelital — mismo enfoque que PropertyGridCard. Mapbox
         Static genera la vista del lugar; el pin rojo marca el edificio
         exacto. ToS-friendly (no scrapeamos fotos del source). `key`
         fuerza remount al cambiar de propiedad para evitar que se vea
         la imagen vieja mientras descarga la nueva. */}
      <div className="relative aspect-[16/10] shrink-0 overflow-hidden bg-muted">
        <img
          key={propiedad.id}
          src={satelliteUrl(propiedad.ubicacion.lat, propiedad.ubicacion.lng, {
            width: compact ? 280 : 380,
            height: compact ? 175 : 238,
          })}
          alt={`Vista satelital de ${propiedad.titulo}`}
          decoding="async"
          className="size-full object-cover opacity-0 transition-opacity duration-300 [&.loaded]:opacity-100"
          onLoad={(e) => e.currentTarget.classList.add("loaded")}
        />
      </div>

      <div
        className={cn(
          "flex-1 overflow-y-auto",
          compact ? "px-3 py-3" : "px-5 py-4",
        )}
      >
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "font-bold tracking-tight",
                compact ? "text-xl" : "text-3xl",
              )}
              style={{ color: "var(--accent)" }}
            >
              {fmt.currency(propiedad.precio)}
            </span>
            {propiedad.tipoOperacion === "alquiler" ? (
              <span
                className={cn(
                  "text-muted-foreground",
                  compact ? "text-[10px]" : "text-xs",
                )}
              >
                {dict.card.per_month}
              </span>
            ) : null}
          </div>
          {ppm2 ? (
            <p
              className={cn(
                "text-muted-foreground",
                compact ? "text-[10px]" : "text-xs",
              )}
            >
              {fmt.currency(ppm2)} {dict.card.per_m2}
            </p>
          ) : null}
        </div>

        <Separator className={compact ? "my-3" : "my-5"} />

        <div
          className={cn(
            "grid grid-cols-2",
            compact ? "gap-1.5 text-xs" : "gap-3 text-sm",
          )}
        >
          <SpecChip
            icon={<Maximize2 className="size-3.5" />}
            label={dict.card.area}
            value={propiedad.areaM2 ? `${propiedad.areaM2} m²` : "—"}
            compact={compact}
          />
          <SpecChip
            icon={<BedDouble className="size-3.5" />}
            label={dict.card.bedrooms}
            value={propiedad.habitaciones?.toString() ?? "—"}
            compact={compact}
          />
          <SpecChip
            icon={<Bath className="size-3.5" />}
            label={dict.card.bathrooms}
            value={propiedad.banos?.toString() ?? "—"}
            compact={compact}
          />
          <SpecChip
            icon={<Car className="size-3.5" />}
            label={dict.card.parking}
            value={propiedad.estacionamientos?.toString() ?? "—"}
            compact={compact}
          />
        </div>

        <div
          className={cn(
            "grid grid-cols-2",
            compact ? "mt-2 gap-1.5 text-xs" : "mt-4 gap-3 text-sm",
          )}
        >
          <SpecChip
            label={dict.card.condition_label}
            value={labels.condicion(propiedad.condicion)}
            compact={compact}
          />
          <SpecChip
            label={dict.card.listing_status}
            value={labels.estado(propiedad.estadoAnuncio)}
            compact={compact}
          />
        </div>

        {resumenTexto ? (
          <>
            <Separator className={compact ? "my-3" : "my-5"} />
            <section>
              <div
                className={cn(
                  "mb-2 flex items-center gap-1.5 font-medium uppercase tracking-wider text-muted-foreground",
                  compact ? "text-[10px]" : "text-xs",
                )}
              >
                <Sparkles className="size-3.5" style={{ color: "var(--accent)" }} />
                <span>{dict.card.ai_summary}</span>
              </div>
              <p
                className={cn(
                  "leading-relaxed text-foreground/90",
                  compact ? "text-xs" : "text-sm",
                )}
              >
                {resumenTexto}
              </p>
            </section>
          </>
        ) : null}

        {(propiedad.tagsCaracteristicas?.length ?? 0) +
          (propiedad.tagsExtra?.length ?? 0) >
        0 ? (
          <>
            <Separator className={compact ? "my-3" : "my-5"} />
            <section>
              <div
                className={cn(
                  "mb-2 flex items-center gap-1.5 font-medium uppercase tracking-wider text-muted-foreground",
                  compact ? "text-[10px]" : "text-xs",
                )}
              >
                <Tag className="size-3.5" />
                <span>{dict.card.tags}</span>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {(propiedad.tagsCaracteristicas ?? []).map((t) => (
                  <li
                    key={`c-${t}`}
                    className={cn(
                      "rounded-sm border border-border/60 bg-card/40 font-medium text-foreground/85",
                      compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
                    )}
                  >
                    {dict.tags[t] ?? t.replace(/-/g, " ")}
                  </li>
                ))}
                {(propiedad.tagsExtra ?? []).map((t) => (
                  <li
                    key={`x-${t}`}
                    className={cn(
                      "rounded-sm border border-dashed border-border/60 bg-card/20 font-medium text-muted-foreground",
                      compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
                    )}
                    title={dict.card.tag_extra_hint}
                  >
                    {t.replace(/-/g, " ")}
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}

        <Separator className={compact ? "my-3" : "my-5"} />

        <dl
          className={cn(
            "space-y-1",
            compact ? "text-[10px]" : "text-[11px]",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{dict.card.source}</dt>
            <dd className="font-medium">{propiedad.fuenteNombre}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{dict.card.detected}</dt>
            <dd className="font-medium tabular-nums">
              {fmt.date(propiedad.fechaDeteccion)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{dict.card.published}</dt>
            <dd className="font-medium tabular-nums">
              {fmt.date(propiedad.fechaPublicacion)}
            </dd>
          </div>
        </dl>

        {propiedad.otrosAnuncios && propiedad.otrosAnuncios.length > 0 ? (
          <>
            <Separator className={compact ? "my-3" : "my-5"} />
            <section>
              <div
                className={cn(
                  "mb-2 flex items-center gap-1.5 font-medium uppercase tracking-wider text-muted-foreground",
                  compact ? "text-[10px]" : "text-xs",
                )}
              >
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
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-md border border-border/50 bg-card/30 transition-colors hover:bg-card/60",
                        compact ? "px-2 py-1.5 text-[11px]" : "px-3 py-2 text-xs",
                      )}
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

      <footer
        className={cn(
          "space-y-2 border-t border-border/60",
          compact ? "px-3 py-2" : "px-5 py-3",
        )}
      >
        <Button
          type="button"
          variant={inCompare ? "default" : "outline"}
          size="sm"
          className={cn("w-full", compact && "h-7 text-[11px]")}
          // Cuando ya está en comparación, el botón cumple rol de "eliminar":
          // pasa a rojo para que sea inequívocamente una acción destructiva.
          style={
            inCompare ? { background: "#FF1F17", color: "#fff" } : undefined
          }
          disabled={cantAdd}
          title={cantAdd ? `${dict.common.max} ${MAX_COMPARACION}` : undefined}
          onClick={() => comparison.toggle(propiedad)}
        >
          <Scale className={cn("mr-1", compact ? "size-3" : "size-4")} />
          {inCompare ? dict.compare.remove : dict.compare.add}
        </Button>
        <Button
          size={compact ? "sm" : "lg"}
          className={cn("w-full font-medium", compact && "text-[11px]")}
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
          <ExternalLink className={cn("ml-1", compact ? "size-3" : "size-4")} />
        </Button>
      </footer>
    </aside>
  );
}

/**
 * Renderiza el título de la propiedad y baja el font-size 1px a la vez hasta
 * que entre en máximo 2 líneas (a ancho actual del contenedor). Si llega al
 * mínimo y todavía no entra, deja line-clamp-2 como safety net.
 *
 * Re-mide automáticamente cuando cambia el ancho (Resize del card).
 */
function FittedTitle({
  text,
  className,
  minPx,
}: {
  text: string;
  className?: string;
  minPx: number;
}) {
  const ref = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      // Reset al tamaño base que define la clase para empezar desde arriba.
      el.style.fontSize = "";
      const cs = window.getComputedStyle(el);
      let px = parseFloat(cs.fontSize);
      const lh = parseFloat(cs.lineHeight) || px * 1.25;
      const max = lh * 2 + 1; // tolerancia 1px
      // Guard: máximo 20 iteraciones por si algo raro.
      let i = 0;
      while (el.scrollHeight > max && px > minPx && i++ < 20) {
        px -= 1;
        el.style.fontSize = `${px}px`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, minPx]);

  return (
    <h2 ref={ref} className={cn(className, "line-clamp-2")}>
      {text}
    </h2>
  );
}

function SpecChip({
  icon,
  label,
  value,
  compact = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border/60 bg-card/40",
        compact ? "px-2 py-1" : "px-3 py-2",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 uppercase tracking-wide text-muted-foreground",
          compact ? "text-[9px]" : "text-[11px]",
        )}
      >
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          "mt-0.5 font-medium tabular-nums",
          compact ? "text-xs" : "text-sm",
        )}
      >
        {value}
      </div>
    </div>
  );
}
