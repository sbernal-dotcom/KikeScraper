"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Última corrida de cualquiera de los 3 scrapers de pase 1 (los que ingestan
 * propiedades nuevas: encuentra24, acobir, panamaequity). Excluye verificar-
 * estado y backfill-ia porque no traen anuncios nuevos.
 *
 * Filtro por fuente_id (más robusto que matchear notes — antes el hook
 * solo veía encuentra24 y se quedaba viejo si solo se corría ACOBIR o PE).
 *
 * RLS: la policy "anon read scraper_runs" permite leer desde anon.
 */

const SCRAPE_FUENTES = ["encuentra24", "acobir", "panamaequity", "mlsacobir"];

export type LastScraperRun = {
  finishedAt: string;
  inserted: number;
  found: number;
  errors: number;
  fuenteId: string;
};

export function useLastScraperRun(): LastScraperRun | null {
  const [run, setRun] = useState<LastScraperRun | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    supabase
      .from("scraper_runs")
      .select("finished_at, inserted, found, errors, fuente_id")
      .in("fuente_id", SCRAPE_FUENTES)
      .not("finished_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (cancelled) return;
        type Row = {
          finished_at: string | null;
          inserted: number | null;
          found: number | null;
          errors: number | null;
          fuente_id: string | null;
        };
        const row = (data?.[0] ?? null) as Row | null;
        if (!row?.finished_at) return;
        setRun({
          finishedAt: row.finished_at,
          inserted: row.inserted ?? 0,
          found: row.found ?? 0,
          errors: row.errors ?? 0,
          fuenteId: row.fuente_id ?? "",
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return run;
}
