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
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      `;
      const marker = new mapboxgl.Marker({ element: el })
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
          width: 28px;
          height: 28px;
          border-radius: 9999px;
          background: #0a0a0a;
          border: 1.5px solid ${MARKER_COLOR};
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow:
            0 0 0 3px rgba(214, 255, 0, 0.14),
            0 2px 6px rgba(0, 0, 0, 0.6);
          transition: transform 140ms ease, box-shadow 140ms ease;
        }
        .mii-marker svg {
          width: 14px;
          height: 14px;
          stroke: ${MARKER_COLOR};
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
          fill: none;
        }
        .mii-marker:hover {
          transform: scale(1.15);
          box-shadow:
            0 0 0 4px rgba(214, 255, 0, 0.22),
            0 4px 10px rgba(0, 0, 0, 0.7),
            0 0 14px rgba(214, 255, 0, 0.55);
        }
      `}</style>
      <div ref={containerRef} className={cn("h-full w-full", className)} />
    </>
  );
}
