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
};

export function MapView({
  className,
  center = PANAMA_CITY_CENTER,
  zoom = DEFAULT_ZOOM,
  propiedades = [],
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
      "top-right",
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
      el.innerHTML = `
        <svg viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M4 1 H20 Q23 1 23 4 V18 Q23 21 20 21 H14 L12 27 L10 21 H4 Q1 21 1 18 V4 Q1 1 4 1 Z"
                fill="${MARKER_COLOR}"
                stroke="rgba(0,0,0,0.6)"
                stroke-width="1.25"
                stroke-linejoin="round" />
        </svg>
      `;
      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([p.ubicacion.lng, p.ubicacion.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [propiedades]);

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
          width: 26px;
          height: 32px;
          cursor: pointer;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.55))
                  drop-shadow(0 0 6px rgba(214,255,0,0.35));
          transition: transform 120ms ease, filter 120ms ease;
          transform-origin: 50% 100%;
        }
        .mii-marker:hover {
          transform: scale(1.15);
          filter: drop-shadow(0 3px 6px rgba(0,0,0,0.6))
                  drop-shadow(0 0 10px rgba(214,255,0,0.6));
        }
        .mii-marker svg { width: 100%; height: 100%; display: block; }
      `}</style>
      <div ref={containerRef} className={cn("h-full w-full", className)} />
    </>
  );
}
