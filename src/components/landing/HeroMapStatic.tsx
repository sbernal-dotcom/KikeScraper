"use client";

import { useState } from "react";

import { MAPBOX_TOKEN } from "@/lib/mapbox/config";

import { HeroMapPreview } from "./HeroMapPreview";

// Mapa 3D pero renderizado por Mapbox Static Images API — no es Mapbox
// GL corriendo en el navegador, es un PNG generado del lado del server
// de Mapbox y cacheado por su CDN. Ventajas:
//   - 0 KB de JS extra (no cargamos mapbox-gl)
//   - 0 tiles descargados en el cliente
//   - 1 sola request HTTP (la imagen), cacheable por CDN
//   - Plan free de Mapbox = 50k requests/mes en Static API
//
// Pitch + bearing hacen que se vea 3D como si el usuario estuviera
// inclinando la cámara. El estilo Standard incluye edificios extruidos.
// Sin animación (bearing fijo) — el usuario decidió priorizar performance.
//
// Fallback: si no hay token o la imagen falla, cae al HeroMapPreview SVG.

const HERO_CENTER_LNG = -79.505;
const HERO_CENTER_LAT = 8.985;
const HERO_ZOOM = 15.2;
// Static API tope el pitch a 60° (aunque pidas más lo capea). Lo dejamos
// en 60 para no pedir un valor que la API va a rechazar/ignorar.
const HERO_PITCH = 60;
const HERO_BEARING = -18;

// 1280×720 (16:9). 1280 es el tope del plan free @1x — @2x se cobra
// diferente. Con object-cover se ve nítido en desktop.
const IMG_W = 1280;
const IMG_H = 720;

function buildStaticUrl(): string {
  // Standard style — soporta pitch/bearing y renderea edificios 3D.
  // logo=false / attribution=false los quitamos del PNG (el logo de
  // Mapbox aparece en el footer del landing igual, no somos evasores).
  return (
    `https://api.mapbox.com/styles/v1/mapbox/standard/static/` +
    `${HERO_CENTER_LNG},${HERO_CENTER_LAT},${HERO_ZOOM},${HERO_BEARING},${HERO_PITCH}/` +
    `${IMG_W}x${IMG_H}` +
    `?access_token=${MAPBOX_TOKEN}` +
    `&logo=false&attribution=false`
  );
}

export function HeroMapStatic({ className = "" }: { className?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  // Fallback total: SVG estático (token faltante, fetch bloqueado, etc).
  if (!MAPBOX_TOKEN || errored) {
    return <HeroMapPreview fullBleed className={className} />;
  }

  return (
    <div className={className}>
      {/* Skeleton SVG mientras el PNG viaja por la red. Se desvanece
          cuando la imagen dispara onLoad. */}
      {!loaded ? (
        <HeroMapPreview
          fullBleed
          className="absolute inset-0"
        />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- external
          Mapbox CDN, no queremos que Next lo re-optimice */}
      <img
        src={buildStaticUrl()}
        alt=""
        aria-hidden
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        loading="eager"
        fetchPriority="high"
      />
    </div>
  );
}
