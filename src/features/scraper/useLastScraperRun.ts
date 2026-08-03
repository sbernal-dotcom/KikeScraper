"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Resumen del último cron completo (no de la última fuente).
 *
 * Antes esta hook devolvía solo la última fila de scraper_runs → si el
 * cron corría 6 fuentes, la sidebar solo mostraba los números de la
 * última (ej. "inmopanama +824") en vez del total del pipeline.
 *
 * Ahora agrupamos las últimas corridas por proximidad temporal: filas
 * separadas por menos de CRON_GAP_MIN pertenecen al mismo cron.
 * Sumamos inserted + updated de todas las del último cron.
 *
 * `finishedAt` es la última fila del cron. `inserted`/`updated` son el
 * total. `sources` cuántas fuentes participaron.
 */

const CRON_GAP_MIN = 30;
const LOOKBACK_HOURS = 6;

const SCRAPE_FUENTES = [
  "encuentra24",
  "acobir",
  "panamaequity",
  "mlsacobir",
  "inmopanama",
  "savitat",
];

export type LastScraperRun = {
  finishedAt: string;
  inserted: number;
  updated: number;
  errors: number;
  sources: number;
};

export function useLastScraperRun(): LastScraperRun | null {
  const [run, setRun] = useState<LastScraperRun | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    supabase
      .from("scraper_runs")
      .select("started_at, finished_at, inserted, updated, errors, fuente_id")
      .in("fuente_id", SCRAPE_FUENTES)
      .not("finished_at", "is", null)
      .gte(
        "started_at",
        new Date(Date.now() - LOOKBACK_HOURS * 3600_000).toISOString(),
      )
      .order("started_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (cancelled) return;
        type Row = {
          started_at: string | null;
          finished_at: string | null;
          inserted: number | null;
          updated: number | null;
          errors: number | null;
          fuente_id: string | null;
        };
        const rows = (data ?? []) as Row[];
        if (!rows.length) return;
        // Agrupar: mientras la fila siguiente esté a <CRON_GAP_MIN de la
        // anterior, pertenece al mismo cron. Al primer gap grande, corto.
        const cron: Row[] = [];
        let lastStart = new Date(rows[0].started_at ?? 0).getTime();
        for (const r of rows) {
          const t = new Date(r.started_at ?? 0).getTime();
          if (!cron.length || lastStart - t <= CRON_GAP_MIN * 60_000) {
            cron.push(r);
            lastStart = t;
          } else {
            break;
          }
        }
        const inserted = cron.reduce((a, r) => a + (r.inserted ?? 0), 0);
        const updated = cron.reduce((a, r) => a + (r.updated ?? 0), 0);
        const errors = cron.reduce((a, r) => a + (r.errors ?? 0), 0);
        // La más reciente por finished_at (la primera del array descendente).
        const finishedAt = cron[0].finished_at ?? "";
        setRun({
          finishedAt,
          inserted,
          updated,
          errors,
          sources: cron.length,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return run;
}
