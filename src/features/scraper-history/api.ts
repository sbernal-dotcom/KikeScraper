"use client";

import { createClient } from "@/lib/supabase/client";

export type ScraperRun = {
  id: string;
  fuenteId: string;
  status: string;
  found: number;
  inserted: number;
  updated: number;
  errors: number;
  archived: number;
  notes: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMin: number | null;
};

type DbRow = {
  id: string;
  fuente_id: string | null;
  status: string;
  found: number | null;
  inserted: number | null;
  updated: number | null;
  errors: number | null;
  archived: number | null;
  notes: string | null;
  started_at: string;
  finished_at: string | null;
};

function map(r: DbRow): ScraperRun {
  const durationMin =
    r.finished_at && r.started_at
      ? Math.round(
          (new Date(r.finished_at).getTime() -
            new Date(r.started_at).getTime()) /
            60000,
        )
      : null;
  return {
    id: r.id,
    fuenteId: r.fuente_id ?? "?",
    status: r.status,
    found: r.found ?? 0,
    inserted: r.inserted ?? 0,
    updated: r.updated ?? 0,
    errors: r.errors ?? 0,
    archived: r.archived ?? 0,
    notes: r.notes,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    durationMin,
  };
}

export async function fetchScraperRuns(days = 30): Promise<ScraperRun[]> {
  const supabase = createClient();
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  // Intento primero con `archived` (migración 0017). Si la columna aún
  // no está aplicada en la instancia, degradamos limpio a sin archived
  // en vez de romper toda la página.
  const withArchived = await supabase
    .from("scraper_runs")
    .select(
      "id, fuente_id, status, found, inserted, updated, errors, archived, notes, started_at, finished_at",
    )
    .gte("started_at", since)
    .order("started_at", { ascending: false });

  if (!withArchived.error) {
    return (withArchived.data ?? []).map((r) => map(r as DbRow));
  }

  // Fallback: retry sin `archived`. La UI mostrará 0 en esa columna
  // hasta que se aplique la migración 0017 en Supabase.
  const fallback = await supabase
    .from("scraper_runs")
    .select(
      "id, fuente_id, status, found, inserted, updated, errors, notes, started_at, finished_at",
    )
    .gte("started_at", since)
    .order("started_at", { ascending: false });
  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []).map((r) => map(r as DbRow));
}
