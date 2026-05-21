"use client";

import { useEffect, useState } from "react";

import { fetchOportunidades } from "./api";
import type { Oportunidad } from "./types";

export function useOportunidades() {
  const [state, setState] = useState<{
    data: Oportunidad[];
    loading: boolean;
    error: string | null;
  }>({ data: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    fetchOportunidades()
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
