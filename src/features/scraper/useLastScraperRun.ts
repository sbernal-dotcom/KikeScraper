"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Última corrida del scraper (pase 1 = `scrape:prod`).
 *
 * Filtramos por `notes ILIKE 'listados%'` para excluir las corridas
 * del pase 2 (`verificar-estado`) y del backfill IA — esas no
 * "scrapean", solo verifican/enriquecen. El usuario quiere ver
 * cuántos anuncios nuevos entraron, no cuántos URLs se revisaron.
 *
 * RLS: la policy "anon read scraper_runs" de la migration 0003
 * permite leer desde el cliente público sin auth.
 */

export type LastScraperRun = {
  finishedAt: string;
  inserted: number;
  found: number;
  errors: number;
};

export function useLastScraperRun(): LastScraperRun | null {
  const [run, setRun] = useState<LastScraperRun | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    supabase
      .from("scraper_runs")
      .select("finished_at, inserted, found, errors")
      .ilike("notes", "listados%")
      .not("finished_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (cancelled) return;
        // El stub de tipos Database está vacío (regenerar pendiente),
        // así que el row viene como `never`. Casteamos explícito.
        type Row = {
          finished_at: string | null;
          inserted: number | null;
          found: number | null;
          errors: number | null;
        };
        const row = (data?.[0] ?? null) as Row | null;
        if (!row?.finished_at) return;
        setRun({
          finishedAt: row.finished_at,
          inserted: row.inserted ?? 0,
          found: row.found ?? 0,
          errors: row.errors ?? 0,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return run;
}
