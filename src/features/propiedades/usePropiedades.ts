"use client";

import { useEffect, useState } from "react";

import { fetchPropiedades } from "./api";
import { fetchPreviewPropiedades, isPreviewEnabled } from "./preview";
import type { Propiedad } from "./types";

type State = {
  data: Propiedad[];
  loading: boolean;
  error: string | null;
};

export function usePropiedades(): State {
  const [state, setState] = useState<State>({
    data: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    // En modo preview, mostrar SOLO los scrapeados (no merge con Supabase).
    const promise = isPreviewEnabled()
      ? fetchPreviewPropiedades()
      : fetchPropiedades();
    promise
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (!cancelled)
          setState({ data: [], loading: false, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
