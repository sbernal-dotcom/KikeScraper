"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-geocoder/lib/mapbox-gl-geocoder.css";

import type { TipoOperacion } from "@/features/propiedades/types";
import { useDict, useLocale } from "@/i18n/LocaleProvider";
import {
  DEFAULT_ZOOM,
  MAPBOX_STYLE,
  MAPBOX_TOKEN,
  MARKER_COLOR,
  MARKER_COLOR_ALQUILER,
  MARKER_COLOR_CLUSTER,
  PANAMA_CITY_CENTER,
} from "@/lib/mapbox/config";
import { cn } from "@/lib/utils";

/**
 * Pin del mapa. Puede representar una sola propiedad (count=1) o un
 * cluster de varias en la misma zona+operación (count>1). El cluster
 * se ancla a las coords del primer item del grupo.
 */
export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  tipoOperacion: TipoOperacion;
  isPreview: boolean;
  count: number;
};

type MapViewProps = {
  className?: string;
  center?: [number, number];
  zoom?: number;
  pins?: MapPin[];
  selectedId?: string | null;
  onSelect?: (pinId: string) => void;
  /** Si se pasa, los pines NO incluidos en el Set se oscurecen
   *  (siguen visibles pero no interactuables). null = todos los pines normales. */
  matchedIds?: Set<string> | null;
  /** Px to reserve on the right of the map (e.g. width of the open detail card). */
  rightInsetPx?: number;
};

export function MapView({
  className,
  center = PANAMA_CITY_CENTER,
  zoom = DEFAULT_ZOOM,
  pins = [],
  selectedId = null,
  onSelect,
  matchedIds = null,
  rightInsetPx = 0,
}: MapViewProps) {
  const dict = useDict();
  const { locale } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const geocoderRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const geocoderInstanceRef = useRef<MapboxGeocoder | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE,
      center,
      zoom,
      pitch: 32,
      bearing: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    mapRef.current = map;

    map.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      "bottom-left",
    );

    map.on("load", () => {
      const layers = map.getStyle()?.layers ?? [];
      const labelLayerId = layers.find(
        (l) => l.type === "symbol" && l.layout && "text-field" in l.layout,
      )?.id;

      map.addLayer(
        {
          id: "3d-buildings",
          source: "composite",
          "source-layer": "building",
          filter: ["==", "extrude", "true"],
          type: "fill-extrusion",
          minzoom: 13,
          paint: {
            "fill-extrusion-color": "#2c2c30",
            "fill-extrusion-height": [
              "interpolate",
              ["linear"],
              ["zoom"],
              13,
              0,
              15,
              ["get", "height"],
            ],
            "fill-extrusion-base": [
              "interpolate",
              ["linear"],
              ["zoom"],
              13,
              0,
              15,
              ["get", "min_height"],
            ],
            "fill-extrusion-opacity": 1,
            "fill-extrusion-vertical-gradient": false,
          },
        },
        labelLayerId,
      );
    });

    const geocoder = new MapboxGeocoder({
      accessToken: MAPBOX_TOKEN,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mapboxgl: mapboxgl as any,
      countries: "pa",
      language: locale,
      placeholder: dict.geocoder.placeholder,
      marker: false,
      flyTo: { speed: 1.4 },
    });
    geocoderInstanceRef.current = geocoder;

    if (geocoderRef.current) {
      geocoderRef.current.appendChild(geocoder.onAdd(map));
    }

    const observer = new ResizeObserver(() => {
      mapRef.current?.resize();
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      geocoder.onRemove();
      geocoderInstanceRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update geocoder placeholder/language when locale changes
  useEffect(() => {
    const g = geocoderInstanceRef.current;
    if (!g) return;
    g.setLanguage(locale);
    g.setPlaceholder(dict.geocoder.placeholder);
  }, [locale, dict.geocoder.placeholder]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const newLabel = dict.common.new_badge.toUpperCase();
    pins.forEach((p) => {
      const el = document.createElement("div");
      el.className = "mii-marker";
      if (p.tipoOperacion === "alquiler") el.classList.add("mii-marker--alquiler");
      if (selectedId === p.id) el.classList.add("mii-marker--active");
      const isCluster = p.count > 1;
      // Chip arriba del pin: cluster muestra el número, single+preview muestra "NUEVO",
      // single normal no muestra nada.
      const badgeText = isCluster ? String(p.count) : p.isPreview ? newLabel : null;
      const hasBadge = badgeText !== null;
      if (hasBadge) el.classList.add("mii-marker--nuevo");
      if (isCluster) el.classList.add("mii-marker--cluster");
      const isDimmed = matchedIds !== null && !matchedIds.has(p.id);
      if (isDimmed) el.classList.add("mii-marker--dimmed");
      // El chip vive DENTRO del SVG del pin para garantizar que se mueve/
      // escala junto al pin (no como sibling HTML que se podía desincronizar
      // con el transform de Mapbox). viewBox negativo en Y reserva espacio
      // arriba del pin sin afectar su posición (el tip sigue siendo el bottom).
      el.innerHTML = hasBadge
        ? `
        <svg viewBox="-2 -11 28 43" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect class="mii-badge-bg" x="-2" y="-11" width="28" height="8" rx="1.5" />
          <text class="mii-badge-text" x="12" y="-5" font-size="6" font-weight="800" text-anchor="middle" letter-spacing="0.4">${badgeText}</text>
          <path fill-rule="evenodd" clip-rule="evenodd"
                d="M12 0C5.373 0 0 5.373 0 12c0 8.4 12 20 12 20s12-11.6 12-20c0-6.627-5.373-12-12-12zm0 7a5 5 0 100 10 5 5 0 000-10z" />
        </svg>`
        : `
        <svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path fill-rule="evenodd" clip-rule="evenodd"
                d="M12 0C5.373 0 0 5.373 0 12c0 8.4 12 20 12 20s12-11.6 12-20c0-6.627-5.373-12-12-12zm0 7a5 5 0 100 10 5 5 0 000-10z" />
        </svg>`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelect?.(p.id);
      });
      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([p.lng, p.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [pins, onSelect, selectedId, matchedIds, dict.common.new_badge]);

  if (!MAPBOX_TOKEN) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-muted p-6 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        <p>{dict.properties.missing_token}</p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        /* Marker root: positioned by mapbox via transform — NEVER transition this */
        .mii-marker {
          width: 18px;
          height: 24px;
          cursor: pointer;
          will-change: transform;
          --mii-fill: ${MARKER_COLOR};
          --mii-glow: 214, 255, 0;
        }
        .mii-marker--alquiler {
          --mii-fill: ${MARKER_COLOR_ALQUILER};
          --mii-glow: 255, 187, 0;
        }
        /* Pin cluster: amarillo distintivo (sobreescribe color de operación). */
        .mii-marker--cluster {
          --mii-fill: ${MARKER_COLOR_CLUSTER};
          --mii-glow: 255, 236, 0;
        }
        /* Pines preview ("NUEVO"): el badge va DENTRO del SVG, así que
           necesitan más altura. Mantenemos el ancho/aspecto para que el
           pin se vea igual de grande pero con el chip encima. */
        .mii-marker--nuevo {
          width: 22px;
          height: 34px;
        }
        .mii-marker svg .mii-badge-bg {
          fill: var(--mii-fill);
        }
        .mii-marker svg .mii-badge-text {
          fill: #0a0a0a;
          font-family: var(--font-geist-sans), system-ui, sans-serif;
        }
        /* Pines fuera del filtro: visibles pero apagados y no interactuables. */
        .mii-marker--dimmed {
          opacity: 0.18;
          pointer-events: none;
          filter: grayscale(0.7);
        }
        .mii-marker--dimmed svg {
          filter: none;
        }
        /* Hover/active effects live on the inner SVG so they don't fight
           the positional transform set by mapbox on the root. */
        .mii-marker svg {
          width: 100%;
          height: 100%;
          display: block;
          fill: var(--mii-fill);
          transform-origin: 50% 100%;
          filter:
            drop-shadow(0 1.5px 3px rgba(0, 0, 0, 0.55))
            drop-shadow(0 0 4px rgba(var(--mii-glow), 0.3));
          transition: transform 140ms ease, filter 140ms ease;
        }
        .mii-marker:hover svg,
        .mii-marker--active svg {
          transform: scale(1.25);
          filter:
            drop-shadow(0 3px 6px rgba(0, 0, 0, 0.6))
            drop-shadow(0 0 12px rgba(var(--mii-glow), 0.7));
        }

        /* Geocoder dark theme override */
        .mii-geocoder .mapboxgl-ctrl-geocoder {
          background: rgba(10, 10, 10, 0.92);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(8px);
          min-width: 100%;
          max-width: 100%;
          width: 100%;
          font-family: var(--font-geist-sans), system-ui, sans-serif;
        }
        .mii-geocoder .mapboxgl-ctrl-geocoder--input {
          color: #fff;
          height: 42px;
          padding: 6px 36px;
          font-size: 14px;
        }
        .mii-geocoder .mapboxgl-ctrl-geocoder--input:focus,
        .mii-geocoder .mapboxgl-ctrl-geocoder--input:focus-visible {
          outline: none;
          box-shadow: none;
          color: #fff;
        }
        .mii-geocoder .mapboxgl-ctrl-geocoder:focus-within {
          border-color: rgba(214, 255, 0, 0.45);
          box-shadow:
            0 0 0 3px rgba(214, 255, 0, 0.18),
            0 6px 20px rgba(0, 0, 0, 0.5);
        }
        .mii-geocoder .mapboxgl-ctrl-geocoder--input::placeholder {
          color: rgba(255, 255, 255, 0.45);
        }
        .mii-geocoder .mapboxgl-ctrl-geocoder--icon {
          fill: rgba(255, 255, 255, 0.55);
        }
        .mii-geocoder .mapboxgl-ctrl-geocoder--icon-search { top: 13px; }
        .mii-geocoder .mapboxgl-ctrl-geocoder--button { background: transparent; }
        .mii-geocoder .mapboxgl-ctrl-geocoder--button:hover .mapboxgl-ctrl-geocoder--icon { fill: #fff; }
        .mii-geocoder .suggestions {
          background: rgba(10, 10, 10, 0.96);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          margin-top: 6px;
          overflow: hidden;
        }
        .mii-geocoder .suggestions > li > a {
          color: rgba(255, 255, 255, 0.9);
          padding: 8px 12px;
        }
        .mii-geocoder .suggestions > .active > a,
        .mii-geocoder .suggestions > li > a:hover {
          background: rgba(214, 255, 0, 0.08);
          color: ${MARKER_COLOR};
        }
        .mii-geocoder .mapboxgl-ctrl-geocoder--powered-by { display: none; }
      `}</style>
      <div ref={containerRef} className={cn("h-full w-full", className)} />
      <div
        ref={geocoderRef}
        className="mii-geocoder pointer-events-auto absolute top-3 z-20 w-[420px] max-w-[calc(100vw-7rem)] -translate-x-1/2 transition-[left] duration-300 ease-out"
        style={{ left: `calc(50% - ${rightInsetPx / 2}px)` }}
      />
    </>
  );
}
