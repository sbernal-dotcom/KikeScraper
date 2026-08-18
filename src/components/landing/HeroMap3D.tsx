"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import {
  MAPBOX_STYLE_3D,
  MAPBOX_TOKEN,
  PANAMA_CITY_CENTER,
} from "@/lib/mapbox/config";

import { HeroMapPreview } from "./HeroMapPreview";

// Mapa 3D real (Mapbox Standard con night preset) como fondo del hero.
// Diferencias con MapView del /mapa:
//   - `interactive: false` — no responde a pan/zoom/rotate del usuario.
//     El hero tiene texto y botones encima; no queremos que scrollear
//     accidentalmente sobre el mapa mueva la cámara.
//   - Bearing en autoplay lento (rota ~1.5° cada segundo). Da vida sin
//     marear. Se pausa cuando el hero está fuera de viewport para no
//     desperdiciar GPU si el usuario scrolleó lejos.
//   - Sin controles, sin popups, sin markers — es puro fondo.
//   - Zoom + pitch fijos apuntados a Punta Pacífica para que los
//     rascacielos se vean bien extruidos.
//
// Si el token falta o Mapbox falla al cargar, cae al HeroMapPreview SVG
// (progressive enhancement). Renderiza el SVG mientras Mapbox está en
// style.load para no dejar un rectángulo negro en el primer paint.

// Centro apuntando a la zona bancaria de Panamá (Punta Pacífica /
// Cinta Costera) — hay rascacielos altos que quedan bien en 3D.
const HERO_CENTER: [number, number] = [-79.505, 8.985];
const HERO_ZOOM = 15.2;
const HERO_PITCH = 62;
const HERO_INITIAL_BEARING = -18;
// Grados por segundo — 1.5°/s = ~4 minutos por vuelta completa. Suave
// pero perceptible; un valor mayor marea, uno menor se siente estático.
const ROTATE_DEG_PER_SEC = 1.5;

export function HeroMap3D({ className = "" }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  // Estado del preview SVG: visible hasta que Mapbox termine style.load.
  // Así evitamos un flash negro mientras el estilo se descarga.
  const [ready, setReady] = useState(false);
  // Fallback a SVG si algo explota (token inválido, WebGL bloqueado, etc).
  const [failed, setFailed] = useState(false);
  // Auto-pause cuando el hero no está visible.
  const visibleRef = useRef(true);

  useEffect(() => {
    if (!MAPBOX_TOKEN) {
      setFailed(true);
      return;
    }
    if (!containerRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: MAPBOX_STYLE_3D,
        center: HERO_CENTER,
        zoom: HERO_ZOOM,
        pitch: HERO_PITCH,
        bearing: HERO_INITIAL_BEARING,
        interactive: false,
        attributionControl: false,
        // Sin logo del control (lo dejamos discretamente en el footer del
        // landing si Mapbox exige atribución; el estilo Standard igual
        // muestra su propio logo pequeño en la esquina).
      });
    } catch (err) {
      console.warn("[HeroMap3D] init failed:", err);
      setFailed(true);
      return;
    }
    mapRef.current = map;

    map.on("style.load", () => {
      try {
        // Preset nocturno + tema faded (matchea el /mapa 3D).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = map as any;
        m.setConfigProperty("basemap", "lightPreset", "night");
        m.setConfigProperty("basemap", "theme", "faded");
        m.setConfigProperty("basemap", "showPointOfInterestLabels", false);
        m.setConfigProperty("basemap", "showTransitLabels", false);
      } catch (err) {
        console.warn("[HeroMap3D] setConfigProperty:", err);
      }
      setReady(true);
    });

    map.on("error", (e) => {
      console.warn("[HeroMap3D] map error:", e?.error);
      // No seteamos failed en cada tile error — solo si algo crítico
      // ya rompió el mapa. El on('error') se dispara mucho para 401/403
      // de estilos, y en esos casos el usuario debe reaccionar de otra
      // forma. Aquí lo dejamos como log.
    });

    // IntersectionObserver: pausa animación si el hero no está visible.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibleRef.current = entry.isIntersecting;
        }
      },
      { threshold: 0 },
    );
    io.observe(containerRef.current);

    // Loop de rotación con requestAnimationFrame.
    let raf = 0;
    let lastT = performance.now();
    const tick = (t: number) => {
      const dt = (t - lastT) / 1000;
      lastT = t;
      if (visibleRef.current && mapRef.current) {
        const b = mapRef.current.getBearing();
        mapRef.current.setBearing(b + ROTATE_DEG_PER_SEC * dt);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Fallback total: SVG estático (mismo estilo del landing).
  if (failed) {
    return <HeroMapPreview fullBleed className={className} />;
  }

  return (
    <div className={className}>
      <div ref={containerRef} className="absolute inset-0" />
      {/* Preview mientras el estilo carga — se desvanece al primer paint. */}
      {!ready ? (
        <HeroMapPreview
          fullBleed
          className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        />
      ) : null}
    </div>
  );
}
