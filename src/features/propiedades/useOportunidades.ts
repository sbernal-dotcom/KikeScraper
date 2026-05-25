"use client";

import { useEffect, useState } from "react";

import { fetchOportunidades } from "./api";
import { fetchPreviewOportunidades, isPreviewEnabled } from "./preview";
import type { Oportunidad } from "./types";

export function useOportunidades() {
  const [state, setState] = useState<{
    data: Oportunidad[];
    loading: boolean;
    error: string | null;
  }>({ data: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    // En modo preview, mostrar SOLO los scrapeados (no merge con Supabase).
    const promise = isPreviewEnabled()
      ? fetchPreviewOportunidades()
      : fetchOportunidades();
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
