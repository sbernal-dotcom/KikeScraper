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
    const preview = isPreviewEnabled();
    const tasks: [Promise<Oportunidad[]>, Promise<Oportunidad[]>] = [
      fetchOportunidades(),
      preview ? fetchPreviewOportunidades() : Promise.resolve([]),
    ];
    Promise.all(tasks)
      .then(([base, extra]) => {
        if (!cancelled)
          setState({ data: [...base, ...extra], loading: false, error: null });
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
