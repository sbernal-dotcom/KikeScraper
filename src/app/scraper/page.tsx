"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  Cog,
  Database,
  Globe2,
  Layers,
  Sparkles,
  Timer,
} from "lucide-react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { useDict } from "@/i18n/LocaleProvider";
import {
  CACHES,
  FUENTES,
  LIFECYCLE_TTL_DIAS_MAPA,
  PIPELINE_CONFIG,
  VERIFY_CONFIG,
} from "@/features/scraper-info/config";
import { fetchScraperInfo, type ScraperInfoData } from "@/features/scraper-info/api";

export default function ScraperPage() {
  const dict = useDict();
  const [data, setData] = useState<ScraperInfoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError(null);
    fetchScraperInfo()
      .then((d) => {
        if (!cancel) setData(d);
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
  }, []);

  const kpiUltimaCorrida =
    data?.ultimaCorrida.startedAt != null
      ? formatAgo(data.ultimaCorrida.startedAt)
      : "—";

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
        <SidebarTrigger
          aria-label={dict.nav.open_nav}
          className="size-9 shrink-0 rounded-md border bg-background"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="text-base font-semibold tracking-tight">
            {dict.scraper_info.title}
          </h1>
          <p className="text-xs text-muted-foreground">
            {dict.scraper_info.subtitle}
          </p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
          {error ? (
            <div className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {/* PANORAMA */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              icon={<Building2 className="size-3.5 text-muted-foreground" />}
              label={dict.scraper_info.kpi_active}
              value={loading ? "…" : String(data?.totalActivas ?? 0)}
              caption={dict.scraper_info.kpi_active_caption}
              accent
            />
            <KpiCard
              icon={<AlertTriangle className="size-3.5 text-muted-foreground" />}
              label={dict.scraper_info.kpi_recent_archived}
              value={loading ? "…" : String(data?.totalArchivadasRecientes ?? 0)}
              caption={`≤${LIFECYCLE_TTL_DIAS_MAPA}d`}
            />
            <KpiCard
              icon={<Clock3 className="size-3.5 text-muted-foreground" />}
              label={dict.scraper_info.kpi_last_run}
              value={loading ? "…" : kpiUltimaCorrida}
              caption={
                data?.ultimaCorrida.durationMin != null
                  ? `${data.ultimaCorrida.durationMin} min ${dict.scraper_info.kpi_duration_caption}`
                  : "—"
              }
            />
            <KpiCard
              icon={<Timer className="size-3.5 text-muted-foreground" />}
              label={dict.scraper_info.kpi_pipeline_cap}
              value={`${PIPELINE_CONFIG.globalTimeoutMin}m`}
              caption={dict.scraper_info.kpi_pipeline_cap_caption}
            />
          </section>

          {/* PIPELINE */}
          <Section
            icon={<Cog className="size-4" />}
            title={dict.scraper_info.section_pipeline}
            hint={`${dict.scraper_info.section_pipeline_hint} · cap ${PIPELINE_CONFIG.globalTimeoutMin}m`}
          >
            <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/40">
              <table className="w-full text-xs">
                <thead className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">
                      {dict.scraper_info.col_step}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {dict.scraper_info.col_timeout}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {PIPELINE_CONFIG.steps.map((s) => (
                    <tr
                      key={s.key}
                      className="border-b border-border/40 last:border-0"
                    >
                      <td className="px-3 py-1.5 text-muted-foreground tabular-nums">
                        {s.order}
                      </td>
                      <td className="px-3 py-1.5">{s.label}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {s.timeoutMin} min
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* FUENTES */}
          <Section
            icon={<Globe2 className="size-4" />}
            title={dict.scraper_info.section_sources}
            hint={dict.scraper_info.section_sources_hint}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {FUENTES.map((f) => {
                const stats = data?.porFuente.find((p) => p.fuenteId === f.id);
                const ok = stats?.ultimaCorridaOk ?? null;
                return (
                  <article
                    key={f.id}
                    className="rounded-xl border border-border/60 bg-card/40 px-4 py-3"
                  >
                    <header className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 font-semibold tracking-tight">
                          {f.nombre}
                          {ok != null ? (
                            <span
                              className={
                                "inline-flex items-center rounded-full border px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider " +
                                (ok
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                                  : "border-destructive/40 bg-destructive/10 text-destructive")
                              }
                            >
                              {ok
                                ? dict.scraper_info.status_ok
                                : dict.scraper_info.status_error}
                            </span>
                          ) : null}
                        </div>
                        <a
                          href={f.sitio}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                        >
                          {f.sitio.replace(/^https?:\/\//, "")}
                        </a>
                      </div>
                      <div className="text-right">
                        <div
                          className="text-lg font-bold tabular-nums"
                          style={{ color: "#D6FF00" }}
                        >
                          {stats?.activas ?? 0}
                        </div>
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                          {dict.scraper_info.col_active}
                        </div>
                      </div>
                    </header>
                    <p className="mb-3 text-[11px] leading-tight text-muted-foreground">
                      {f.descripcion}
                    </p>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                      <MetaRow
                        label={dict.scraper_info.meta_discovery}
                        value={f.discovery}
                      />
                      <MetaRow
                        label={dict.scraper_info.meta_max_pages}
                        value={f.maxPages != null ? String(f.maxPages) : "sitemap"}
                      />
                      <MetaRow
                        label={dict.scraper_info.meta_detail_concurrency}
                        value={String(f.detailConcurrency)}
                      />
                      <MetaRow
                        label={dict.scraper_info.meta_pipeline_timeout}
                        value={`${f.timeoutMinPipeline}m`}
                      />
                      <MetaRow
                        label={dict.scraper_info.meta_internal_cap}
                        value={f.maxRuntimeMin != null ? `${f.maxRuntimeMin}m` : "—"}
                      />
                      <MetaRow
                        label={dict.scraper_info.meta_uses_groq}
                        value={f.usaGroq ? "sí" : "no"}
                      />
                    </dl>
                    {stats?.ultimaCorridaAt ? (
                      <div className="mt-2 border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
                        {dict.scraper_info.last_run_ago}: {formatAgo(stats.ultimaCorridaAt)}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </Section>

          {/* VERIFY */}
          <Section
            icon={<CheckCircle2 className="size-4" />}
            title={dict.scraper_info.section_verify}
            hint={dict.scraper_info.section_verify_hint}
          >
            <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
              <p className="mb-3 text-xs text-muted-foreground">
                {VERIFY_CONFIG.descripcion}
              </p>
              <table className="w-full text-xs">
                <thead className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-1 text-left font-medium">
                      {dict.scraper_info.verify_range}
                    </th>
                    <th className="py-1 text-left font-medium">
                      {dict.scraper_info.verify_state}
                    </th>
                    <th className="py-1 text-left font-medium">
                      {dict.scraper_info.verify_effect}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {VERIFY_CONFIG.umbrales.map((u) => (
                    <tr key={u.estado} className="border-b border-border/40 last:border-0">
                      <td className="py-1.5 font-mono">{u.rango}</td>
                      <td className="py-1.5">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                          {u.estado}
                        </code>
                      </td>
                      <td className="py-1.5 text-muted-foreground">
                        {u.descripcion}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data?.ultimoVerify.startedAt ? (
                <div className="mt-4 rounded-lg border border-border/40 bg-background/60 px-3 py-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {dict.scraper_info.verify_last} · {formatAgo(data.ultimoVerify.startedAt)}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs">
                    <VerifyStat label="vivas" value={data.ultimoVerify.vivas} />
                    <VerifyStat label="no encontradas" value={data.ultimoVerify.noEncontradas} />
                    <VerifyStat label="posibles" value={data.ultimoVerify.posibles} />
                    <VerifyStat label="archivadas" value={data.ultimoVerify.archivadas} accent="destructive" />
                    <VerifyStat label="errores" value={data.ultimoVerify.errores} accent="destructive" />
                  </div>
                </div>
              ) : null}
            </div>
          </Section>

          {/* CACHES */}
          <Section
            icon={<Database className="size-4" />}
            title={dict.scraper_info.section_caches}
            hint={dict.scraper_info.section_caches_hint}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <CacheCard
                label={CACHES.iaExtract.tabla}
                count={data?.caches.iaExtract ?? null}
                description={CACHES.iaExtract.descripcion}
              />
              <CacheCard
                label={CACHES.urlsFallidas.tabla}
                count={data?.caches.urlsFallidas ?? null}
                description={CACHES.urlsFallidas.descripcion}
              />
              <CacheCard
                label={CACHES.edificioCoords.tabla}
                count={data?.caches.edificioCoords ?? null}
                description={CACHES.edificioCoords.descripcion}
              />
            </div>
            {data?.caches.urlsFallidasPorFuente.length ? (
              <div className="mt-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3">
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <Layers className="size-3" />
                  {dict.scraper_info.failed_urls_breakdown}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {data.caches.urlsFallidasPorFuente.map((r) => (
                    <span
                      key={`${r.fuenteId}::${r.motivo}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-[11px]"
                    >
                      <b>{r.fuenteId}</b>
                      <span className="text-muted-foreground">/ {r.motivo}</span>
                      <span className="tabular-nums font-semibold">{r.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </Section>

          {/* LIFECYCLE */}
          <Section
            icon={<Sparkles className="size-4" />}
            title={dict.scraper_info.section_lifecycle}
            hint={dict.scraper_info.section_lifecycle_hint}
          >
            <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3 text-xs">
              <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
                <li>{dict.scraper_info.lifecycle_l1}</li>
                <li>{dict.scraper_info.lifecycle_l2}</li>
                <li>
                  {dict.scraper_info.lifecycle_l3} <b>{LIFECYCLE_TTL_DIAS_MAPA}d</b>
                  .
                </li>
                <li>{dict.scraper_info.lifecycle_l4}</li>
              </ul>
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}

// ---------- Sub-componentes ----------

function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          {icon}
          {title}
        </h2>
        {hint ? (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </header>
      {children}
    </section>
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

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">
        {label}
      </dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </>
  );
}

function VerifyStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | null;
  accent?: "destructive";
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <b
        className={
          "tabular-nums " +
          (accent === "destructive" && (value ?? 0) > 0 ? "text-destructive" : "")
        }
      >
        {value ?? 0}
      </b>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function CacheCard({
  label,
  count,
  description,
}: {
  label: string;
  count: number | null;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <code className="text-[11px] font-mono">{label}</code>
        <span
          className="text-lg font-bold tabular-nums"
          style={{ color: "#D6FF00" }}
        >
          {count ?? "—"}
        </span>
      </div>
      <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function formatAgo(iso: string): string {
  const min = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 60000),
  );
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
