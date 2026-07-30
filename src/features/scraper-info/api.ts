"use client";

import { createClient } from "@/lib/supabase/client";

export type FuenteStats = {
  fuenteId: string;
  activas: number;
  archivadas: number;
  ultimaCorridaAt: string | null;
  ultimaCorridaOk: boolean;
};

export type ScraperInfoData = {
  totalActivas: number;
  totalArchivadasRecientes: number;
  ultimaCorrida: {
    startedAt: string | null;
    finishedAt: string | null;
    durationMin: number | null;
  };
  porFuente: FuenteStats[];
  caches: {
    iaExtract: number | null;
    urlsFallidas: number | null;
    edificioCoords: number | null;
    urlsFallidasPorFuente: Array<{ fuenteId: string; motivo: string; count: number }>;
  };
  ultimoVerify: {
    startedAt: string | null;
    vivas: number | null;
    noEncontradas: number | null;
    archivadas: number | null;
    posibles: number | null;
    errores: number | null;
  };
};

async function safeCount(
  supabase: ReturnType<typeof createClient>,
  table: string,
): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

function parseVerifyNotes(notes: string | null) {
  if (!notes) return null;
  const grab = (key: string) => {
    const m = notes.match(new RegExp(`${key}:(\\d+)`));
    return m ? Number(m[1]) : null;
  };
  return {
    vivas: grab("vivas"),
    noEncontradas: grab("no_encontradas"),
    archivadas: grab("archivadas"),
    posibles: grab("posibles"),
    errores: grab("errores"),
  };
}

export async function fetchScraperInfo(): Promise<ScraperInfoData> {
  const supabase = createClient();

  // Total activas y archivadas recientes (últimos 3 días)
  const archivedCutoff = new Date(
    Date.now() - 3 * 24 * 3600 * 1000,
  ).toISOString();
  const [{ count: activas }, { count: archivadasRecientes }, runsRes] =
    await Promise.all([
      supabase
        .from("propiedades")
        .select("*", { count: "exact", head: true })
        .eq("estado_anuncio", "activo"),
      supabase
        .from("propiedades")
        .select("*", { count: "exact", head: true })
        .neq("estado_anuncio", "activo")
        .gte("fecha_ultima_revision", archivedCutoff),
      supabase
        .from("scraper_runs")
        .select("fuente_id, status, started_at, finished_at, errors, notes")
        .gte(
          "started_at",
          new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
        )
        .order("started_at", { ascending: false }),
    ]);

  type RunRow = {
    fuente_id: string | null;
    status: string;
    started_at: string;
    finished_at: string | null;
    errors: number | null;
    notes: string | null;
  };
  // Cast: types.ts no incluye scraper_runs (pendiente regenerar tras 0003).
  const runsArr = (runsRes.data ?? []) as unknown as RunRow[];
  const startedFirst = runsArr.length
    ? runsArr[runsArr.length - 1].started_at
    : null;
  const finishedLast = runsArr[0]?.finished_at ?? null;
  const durationMin =
    startedFirst && finishedLast
      ? Math.round(
          (new Date(finishedLast).getTime() -
            new Date(startedFirst).getTime()) /
            60000,
        )
      : null;

  // Última corrida por fuente
  const porFuenteMap = new Map<string, FuenteStats>();
  const seenPerFuente = new Set<string>();
  for (const r of runsArr) {
    if (!r.fuente_id) continue;
    if (seenPerFuente.has(r.fuente_id)) continue;
    seenPerFuente.add(r.fuente_id);
    porFuenteMap.set(r.fuente_id, {
      fuenteId: r.fuente_id,
      activas: 0,
      archivadas: 0,
      ultimaCorridaAt: r.started_at,
      ultimaCorridaOk: r.status === "ok" && (r.errors ?? 0) === 0,
    });
  }

  // Activas por fuente
  const { data: fuentesCount } = await supabase
    .from("propiedades")
    .select("fuente_id")
    .eq("estado_anuncio", "activo");
  for (const row of (fuentesCount ?? []) as Array<{ fuente_id: string }>) {
    const existing = porFuenteMap.get(row.fuente_id) ?? {
      fuenteId: row.fuente_id,
      activas: 0,
      archivadas: 0,
      ultimaCorridaAt: null,
      ultimaCorridaOk: false,
    };
    existing.activas++;
    porFuenteMap.set(row.fuente_id, existing);
  }

  // Caches
  const [iaExtract, urlsFallidas, edificioCoords, { data: urlsFallidasPorFuenteRaw }] =
    await Promise.all([
      safeCount(supabase, "ia_extract_cache"),
      safeCount(supabase, "urls_fallidas_cache"),
      safeCount(supabase, "edificio_coords_cache"),
      supabase
        .from("urls_fallidas_cache")
        .select("fuente_id, motivo"),
    ]);

  // Agrupar urlsFallidas por (fuente, motivo)
  const groupedMap = new Map<string, number>();
  for (const r of (urlsFallidasPorFuenteRaw ?? []) as Array<{ fuente_id: string; motivo: string }>) {
    const k = `${r.fuente_id}::${r.motivo}`;
    groupedMap.set(k, (groupedMap.get(k) ?? 0) + 1);
  }
  const urlsFallidasPorFuente = Array.from(groupedMap.entries())
    .map(([k, count]) => {
      const [fuenteId, motivo] = k.split("::");
      return { fuenteId, motivo, count };
    })
    .sort((a, b) => b.count - a.count);

  // Último run de verify (fuente_id="encuentra24" con notes que comienzan con "verificar-estado")
  const ultimoVerifyRow = runsArr.find(
    (r) => r.notes && String(r.notes).startsWith("verificar-estado"),
  );
  const ultimoVerify = ultimoVerifyRow
    ? {
        startedAt: ultimoVerifyRow.started_at,
        ...(parseVerifyNotes(ultimoVerifyRow.notes) ?? {
          vivas: null,
          noEncontradas: null,
          archivadas: null,
          posibles: null,
          errores: null,
        }),
      }
    : {
        startedAt: null,
        vivas: null,
        noEncontradas: null,
        archivadas: null,
        posibles: null,
        errores: null,
      };

  return {
    totalActivas: activas ?? 0,
    totalArchivadasRecientes: archivadasRecientes ?? 0,
    ultimaCorrida: {
      startedAt: startedFirst,
      finishedAt: finishedLast,
      durationMin,
    },
    porFuente: Array.from(porFuenteMap.values()).sort(
      (a, b) => b.activas - a.activas,
    ),
    caches: {
      iaExtract,
      urlsFallidas,
      edificioCoords,
      urlsFallidasPorFuente,
    },
    ultimoVerify,
  };
}
