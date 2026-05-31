"use client";

/**
 * Provider del modo de mapa: 2D (`dark-v11` plano) o 3D (`standard`
 * faded night).
 *
 * Por decisión de producto SIEMPRE arranca en 2D en cada visita —
 * el toggle solo dura la sesión y NO se persiste en localStorage.
 * Si en el futuro se quiere persistir, hidratar acá desde localStorage.
 *
 * MapView consume `mode` para hacer `map.setStyle(...)`. Cambiar de
 * estilo NO recrea el mapa — preserva centro/zoom/markers (los markers
 * viven en el DOM por fuera del canvas).
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type MapMode = "2d" | "3d";

type MapModeContextValue = {
  mode: MapMode;
  setMode: (m: MapMode) => void;
};

const MapModeContext = createContext<MapModeContextValue | null>(null);

export function MapModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<MapMode>("2d");

  const stableSetMode = useCallback((m: MapMode) => setMode(m), []);

  const value = useMemo<MapModeContextValue>(
    () => ({ mode, setMode: stableSetMode }),
    [mode, stableSetMode],
  );

  return (
    <MapModeContext.Provider value={value}>{children}</MapModeContext.Provider>
  );
}

export function useMapMode() {
  const ctx = useContext(MapModeContext);
  if (!ctx) throw new Error("useMapMode must be used inside MapModeProvider");
  return ctx;
}
