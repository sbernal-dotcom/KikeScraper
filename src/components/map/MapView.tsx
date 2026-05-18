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
          width: 13px;
          height: 13px;
          border-radius: 9999px;
          background: ${MARKER_COLOR};
          border: 1.5px solid rgba(0, 0, 0, 0.6);
          box-shadow:
            0 0 0 3px rgba(214, 255, 0, 0.18),
            0 0 12px rgba(214, 255, 0, 0.45);
          cursor: pointer;
          transition: transform 120ms ease, box-shadow 120ms ease;
        }
        .mii-marker:hover {
          transform: scale(1.3);
          box-shadow:
            0 0 0 4px rgba(214, 255, 0, 0.28),
            0 0 16px rgba(214, 255, 0, 0.7);
        }
      `}</style>
      <div ref={containerRef} className={cn("h-full w-full", className)} />
    </>
  );
}
