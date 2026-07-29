"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  History as HistoryIcon,
  Sparkles,
} from "lucide-react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { useDict } from "@/i18n/LocaleProvider";
import { fetchScraperRuns, type ScraperRun } from "@/features/scraper-history/api";

type DaysWindow = 7 | 30 | 90;

export default function HistorialPage() {
  const dict = useDict();
  const [days, setDays] = useState<DaysWindow>(30);
  const [source, setSource] = useState<string>("__all__");
  const [runs, setRuns] = useState<ScraperRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError(null);
    fetchScraperRuns(days)
      .then((r) => {
        if (!cancel) setRuns(r);
      })
      .catch((e) => {
        if (!cancel) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [days]);

  const sources = useMemo(
    () =>
      Array.from(new Set(runs.map((r) => r.fuenteId))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [runs],
  );

  const filtered = useMemo(
    () => (source === "__all__" ? runs : runs.filter((r) => r.fuenteId === source)),
    [runs, source],
  );

  const kpis = useMemo(() => computeKpis(filtered), [filtered]);
  const byRun = useMemo(() => groupByRun(filtered), [filtered]);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
        <SidebarTrigger
          aria-label={dict.nav.open_nav}
          className="size-9 shrink-0 rounded-md border bg-background"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="text-base font-semibold tracking-tight">
            {dict.history.title}
          </h1>
          <p className="text-xs text-muted-foreground">
            {dict.history.subtitle}
          </p>
        </div>
        <div className="hidden gap-2 sm:flex">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="__all__">{dict.history.filter_all_sources}</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="flex overflow-hidden rounded-md border border-border">
            {([7, 30, 90] as DaysWindow[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={
                  "px-3 text-xs font-medium " +
                  (days === d
                    ? "bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:bg-muted")
                }
              >
                {d === 7
                  ? dict.history.filter_days_7
                  : d === 30
                    ? dict.history.filter_days_30
                    : dict.history.filter_days_90}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              icon={<HistoryIcon className="size-3.5 text-muted-foreground" />}
              label={dict.history.kpi_total_runs}
              value={String(kpis.totalRuns)}
              caption={dict.history.kpi_total_runs_caption}
            />
            <KpiCard
              icon={<CheckCircle2 className="size-3.5 text-muted-foreground" />}
              label={dict.history.kpi_ok_pct}
              value={
                kpis.totalRuns
                  ? `${((kpis.okRuns / kpis.totalRuns) * 100).toFixed(0)}%`
                  : "—"
              }
              caption={dict.history.kpi_ok_pct_caption}
              accent={
                kpis.totalRuns > 0 && kpis.okRuns / kpis.totalRuns >= 0.8
              }
            />
            <KpiCard
              icon={<Clock3 className="size-3.5 text-muted-foreground" />}
              label={dict.history.kpi_last_run}
              value={
                kpis.lastRunAgoMin != null
                  ? formatAgo(kpis.lastRunAgoMin, dict.history.minutes_short)
                  : "—"
              }
              caption={dict.history.kpi_last_run_caption}
            />
            <KpiCard
              icon={<Sparkles className="size-3.5" style={{ color: "#D6FF00" }} />}
              label={dict.history.kpi_new_today}
              value={String(kpis.newTodayInserted)}
              caption={dict.history.kpi_new_today_caption}
              accent
            />
          </section>

          {error ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-destructive/40 text-sm text-destructive">
              {dict.history.load_error} <span className="ml-2 opacity-70">({error})</span>
            </div>
          ) : loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              …
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
              {dict.history.no_data}
            </div>
          ) : (
            <div className="space-y-6">
              {byRun.map(({ start, end, items }) => {
                const inserted = items.reduce((s, r) => s + r.inserted, 0);
                const errors = items.reduce((s, r) => s + r.errors, 0);
                const archived = items.reduce((s, r) => s + r.archived, 0);
                const totalMin = Math.round(
                  (new Date(end).getTime() - new Date(start).getTime()) / 60000,
                );
                return (
                  <section key={start} className="space-y-2">
                    <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2">
                      <h2 className="text-sm font-semibold tracking-tight">
                        {formatRunHeader(start)}
                      </h2>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
                        <span>
                          <b className="text-foreground">{items.length}</b>{" "}
                          {dict.history.run_header_sources}
                        </span>
                        <span>
                          <b className="text-foreground tabular-nums">
                            {totalMin}
                            {dict.history.minutes_short}
                          </b>{" "}
                          {dict.history.run_header_total}
                        </span>
                        <span>
                          <b style={{ color: "#D6FF00" }}>{inserted}</b>{" "}
                          {dict.history.run_header_inserted}
                        </span>
                        <span>
                          <b className={archived > 0 ? "text-destructive" : ""}>
                            {archived}
                          </b>{" "}
                          {dict.history.run_header_archived}
                        </span>
                        <span>
                          <b className={errors > 0 ? "text-destructive" : ""}>
                            {errors}
                          </b>{" "}
                          {dict.history.run_header_errors}
                        </span>
                      </div>
                    </header>
                    <RunsTable runs={items} />
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function RunsTable({ runs }: { runs: ScraperRun[] }) {
  const dict = useDict();
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/40">
      <table className="w-full text-xs">
        <thead className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">
              {dict.history.column_source}
            </th>
            <th className="px-3 py-2 text-left font-medium">
              {dict.history.column_start}
            </th>
            <th className="px-3 py-2 text-right font-medium">
              {dict.history.column_duration}
            </th>
            <th className="px-3 py-2 text-center font-medium">
              {dict.history.column_status}
            </th>
            <th className="px-3 py-2 text-right font-medium">
              {dict.history.column_found}
            </th>
            <th className="px-3 py-2 text-right font-medium">
              {dict.history.column_inserted}
            </th>
            <th className="px-3 py-2 text-right font-medium">
              {dict.history.column_updated}
            </th>
            <th className="px-3 py-2 text-right font-medium">
              {dict.history.column_errors}
            </th>
            <th className="px-3 py-2 text-right font-medium">
              {dict.history.column_archived}
            </th>
            <th className="px-3 py-2 text-left font-medium">
              {dict.history.column_notes}
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const isError = r.status !== "ok" || r.errors > 0;
            return (
              <tr
                key={r.id}
                className="border-b border-border/40 last:border-0 hover:bg-muted/30"
              >
                <td className="px-3 py-2 font-medium">{r.fuenteId}</td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">
                  {r.startedAt.slice(11, 16)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.durationMin != null
                    ? `${r.durationMin}${dict.history.minutes_short}`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-center">
                  <StatusBadge status={r.status} errors={r.errors} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.found}</td>
                <td
                  className="px-3 py-2 text-right tabular-nums font-semibold"
                  style={r.inserted > 0 ? { color: "#D6FF00" } : undefined}
                >
                  {r.inserted}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {r.updated}
                </td>
                <td
                  className={
                    "px-3 py-2 text-right tabular-nums " +
                    (r.errors > 0 ? "font-semibold text-destructive" : "text-muted-foreground")
                  }
                >
                  {r.errors}
                </td>
                <td
                  className={
                    "px-3 py-2 text-right tabular-nums " +
                    (r.archived > 0 ? "font-semibold text-destructive" : "text-muted-foreground")
                  }
                >
                  {r.archived}
                </td>
                <td className="max-w-[280px] px-3 py-2 text-muted-foreground">
                  <span className="line-clamp-2" title={r.notes ?? undefined}>
                    {r.notes ?? "—"}
                  </span>
                </td>
                {isError ? (
                  <td className="hidden">
                    <AlertTriangle className="size-3.5 text-destructive" />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status, errors }: { status: string; errors: number }) {
  const dict = useDict();
  const bad = status !== "ok" || errors > 0;
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
        (bad
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-emerald-500/40 bg-emerald-500/10 text-emerald-500")
      }
    >
      {bad ? (
        <AlertTriangle className="size-2.5" />
      ) : (
        <CheckCircle2 className="size-2.5" />
      )}
      {bad ? dict.history.status_error : dict.history.status_ok}
    </span>
  );
}

function KpiCard({
  icon,
  label,
  value,
  caption,
  accent = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  caption?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className="mt-1 text-2xl font-bold tracking-tight tabular-nums"
        style={accent ? { color: "#D6FF00" } : undefined}
      >
        {value}
      </div>
      {caption ? (
        <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {caption}
        </div>
      ) : null}
    </div>
  );
}

function computeKpis(runs: ScraperRun[]) {
  const totalRuns = runs.length;
  const okRuns = runs.filter((r) => r.status === "ok" && r.errors === 0).length;
  const lastRun = runs[0];
  const lastRunAgoMin = lastRun
    ? Math.max(
        0,
        Math.round((Date.now() - new Date(lastRun.startedAt).getTime()) / 60000),
      )
    : null;
  const since24h = Date.now() - 24 * 3600 * 1000;
  const newTodayInserted = runs
    .filter((r) => new Date(r.startedAt).getTime() >= since24h)
    .reduce((s, r) => s + r.inserted, 0);
  return { totalRuns, okRuns, lastRunAgoMin, newTodayInserted };
}

// Agrupa por CORRIDA del pipeline (no por día calendario). Heurístico:
// si entre el fin de un run y el inicio del siguiente pasan >GAP_MIN
// minutos, son corridas distintas. El cron diario más una manual el
// mismo día → 2 tablas separadas (antes se mostraban mezcladas y por
// eso aparecía inmopanama repetido en un mismo bloque).
function groupByRun(
  runs: ScraperRun[],
): Array<{ start: string; end: string; items: ScraperRun[] }> {
  const GAP_MIN = 30;
  if (runs.length === 0) return [];
  const asc = [...runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const groups: ScraperRun[][] = [];
  for (const r of asc) {
    const last = groups[groups.length - 1];
    if (!last) {
      groups.push([r]);
      continue;
    }
    const prev = last[last.length - 1];
    const prevEnd = prev.finishedAt ?? prev.startedAt;
    const gapMin =
      (new Date(r.startedAt).getTime() - new Date(prevEnd).getTime()) / 60000;
    if (gapMin <= GAP_MIN) {
      last.push(r);
    } else {
      groups.push([r]);
    }
  }
  return groups
    .map((items) => ({
      start: items[0].startedAt,
      end: items[items.length - 1].finishedAt ?? items[items.length - 1].startedAt,
      items,
    }))
    .reverse(); // más reciente primero
}

function formatRunHeader(startIso: string): string {
  const d = new Date(startIso);
  const dateStr = d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = startIso.slice(11, 16);
  return `${dateStr} · ${timeStr} UTC`;
}

function formatAgo(min: number, short: string): string {
  if (min < 60) return `${min} ${short}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
