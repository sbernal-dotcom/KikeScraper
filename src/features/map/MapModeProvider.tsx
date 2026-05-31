"use client";

/**
 * Provider del modo de mapa: 2D (`dark-v11` plano) o 3D (`standard` con
 * edificios + landmarks + preset nocturno). El estado se persiste en
 * localStorage para que respete la elección del usuario entre sesiones.
 *
 * MapView consume `mode` para hacer `map.setStyle(...)`. Cambiar de
 * estilo NO recrea el mapa — preserva centro/zoom/markers (los markers
 * viven en el DOM por fuera del canvas).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "mii.mapMode";

export type MapMode = "2d" | "3d";

type MapModeContextValue = {
  mode: MapMode;
  setMode: (m: MapMode) => void;
};

const MapModeContext = createContext<MapModeContextValue | null>(null);

export function MapModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<MapMode>("2d");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación de localStorage en mount es el patrón correcto
    if (saved === "2d" || saved === "3d") setModeState(saved);
  }, []);

  const setMode = useCallback((m: MapMode) => {
    setModeState(m);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, m);
    }
  }, []);

  const value = useMemo<MapModeContextValue>(() => ({ mode, setMode }), [mode, setMode]);

  return (
    <MapModeContext.Provider value={value}>{children}</MapModeContext.Provider>
  );
}

export function useMapMode() {
  const ctx = useContext(MapModeContext);
  if (!ctx) throw new Error("useMapMode must be used inside MapModeProvider");
  return ctx;
}
