"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import type { Propiedad } from "@/features/propiedades/types";
import {
  DEFAULT_ZOOM,
  MAPBOX_STYLE,
  MAPBOX_TOKEN,
  MARKER_COLOR,
  PANAMA_CITY_CENTER,
} from "@/lib/mapbox/config";
import { cn } from "@/lib/utils";

type MapViewProps = {
  className?: string;
  center?: [number, number];
  zoom?: number;
  propiedades?: Propiedad[];
  selectedId?: string | null;
  onSelect?: (propiedad: Propiedad) => void;
};

export function MapView({
  className,
  center = PANAMA_CITY_CENTER,
  zoom = DEFAULT_ZOOM,
  propiedades = [],
  selectedId = null,
  onSelect,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE,
      center,
      zoom,
    });

    mapRef.current.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      "bottom-left",
    );

    const observer = new ResizeObserver(() => {
      mapRef.current?.resize();
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    propiedades.forEach((p) => {
      const el = document.createElement("div");
      el.className = "mii-marker";
      if (selectedId === p.id) el.classList.add("mii-marker--active");
      el.innerHTML = `
        <svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path fill-rule="evenodd" clip-rule="evenodd"
                d="M12 0C5.373 0 0 5.373 0 12c0 8.4 12 20 12 20s12-11.6 12-20c0-6.627-5.373-12-12-12zm0 7a5 5 0 100 10 5 5 0 000-10z" />
        </svg>
      `;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelect?.(p);
      });
      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([p.ubicacion.lng, p.ubicacion.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [propiedades, onSelect, selectedId]);

  if (!MAPBOX_TOKEN) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-muted p-6 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        <p>
          Configura{" "}
          <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">
            NEXT_PUBLIC_MAPBOX_TOKEN
          </code>{" "}
          en{" "}
          <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">
            .env.local
          </code>{" "}
          para mostrar el mapa.
        </p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .mii-marker {
          width: 18px;
          height: 24px;
          cursor: pointer;
          transform-origin: 50% 100%;
          filter:
            drop-shadow(0 1.5px 3px rgba(0, 0, 0, 0.55))
            drop-shadow(0 0 4px rgba(214, 255, 0, 0.3));
          transition: transform 140ms ease, filter 140ms ease;
        }
        .mii-marker svg {
          width: 100%;
          height: 100%;
          display: block;
          fill: ${MARKER_COLOR};
        }
        .mii-marker:hover,
        .mii-marker--active {
          transform: scale(1.25);
          filter:
            drop-shadow(0 3px 6px rgba(0, 0, 0, 0.6))
            drop-shadow(0 0 12px rgba(214, 255, 0, 0.7));
        }
      `}</style>
      <div ref={containerRef} className={cn("h-full w-full", className)} />
    </>
  );
}
