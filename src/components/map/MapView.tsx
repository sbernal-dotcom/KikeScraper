"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import {
  DEFAULT_ZOOM,
  MAPBOX_STYLE,
  MAPBOX_TOKEN,
  PANAMA_CITY_CENTER,
} from "@/lib/mapbox/config";
import { cn } from "@/lib/utils";

type MapViewProps = {
  className?: string;
  center?: [number, number];
  zoom?: number;
};

export function MapView({
  className,
  center = PANAMA_CITY_CENTER,
  zoom = DEFAULT_ZOOM,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE,
      center,
      zoom,
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [center, zoom]);

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
          en <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">.env.local</code> para mostrar el mapa.
        </p>
      </div>
    );
  }

  return <div ref={containerRef} className={cn("h-full w-full", className)} />;
}
