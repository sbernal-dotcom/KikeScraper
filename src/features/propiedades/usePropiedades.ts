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
    const preview = isPreviewEnabled();
    const tasks: [Promise<Propiedad[]>, Promise<Propiedad[]>] = [
      fetchPropiedades(),
      preview ? fetchPreviewPropiedades() : Promise.resolve([]),
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
