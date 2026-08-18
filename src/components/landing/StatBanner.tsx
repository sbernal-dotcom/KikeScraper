"use client";

import { useEffect, useState } from "react";

import { useDict, useLocale } from "@/i18n/LocaleProvider";
import { createClient } from "@/lib/supabase/client";

import { DiagonalStripesPattern } from "./patterns";

// StatBanner: número gigante con la cantidad de propiedades activas y una
// línea chica debajo con la cantidad de fuentes + cuándo fue la última
// corrida.
//
// Client Component (antes era Server Component con revalidate=300). Razones
// del cambio:
//   - El Server Component con el cliente Supabase de server (que usa
//     cookies) mostraba números incorrectos porque el count venía
//     bloqueado por RLS sin sesión — RLS deja LEER las propiedades
//     con anon key, pero contar HEAD queries parece caer distinto.
//   - El cache de 5 min hacía que cualquier cambio en la DB tardara
//     hasta 5 minutos en reflejarse en el landing.
//   - El resto del app (/scraper, /mapa) usa el cliente client-side y
//     ese sí muestra el número correcto — este componente ahora
//     comparte esa misma pila, garantía de consistencia.
//
// Fondo verde plano (opción A del plan original) + diagonal stripes sutiles.

type StatData = {
  activas: number | null;
  fuentes: number | null;
  lastRunISO: string | null;
};

// Jobs "sistema" en la tabla `fuentes` — verify, refresh-precios,
// backfill-ia comparten esa tabla por el FK de scraper_runs pero no son
// portales scrapeados. El conteo debe reflejar "de cuántos portales
// origen se toma la data".
const SYSTEM_JOBS = new Set(["verify", "refresh-precios", "backfill-ia"]);

export function StatBanner() {
  const dict = useDict();
  const { locale } = useLocale();
  const [data, setData] = useState<StatData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [activasRes, fuentesRes, lastRunRes] = await Promise.all([
        supabase
          .from("propiedades")
          .select("*", { count: "exact", head: true })
          .eq("estado_anuncio", "activo"),
        supabase.from("fuentes").select("id"),
        supabase
          .from("scraper_runs")
          .select("finished_at")
          .not("finished_at", "is", null)
          .order("finished_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      setData({
        activas: activasRes.error ? null : activasRes.count ?? 0,
        fuentes: fuentesRes.data
          ? fuentesRes.data.filter((f) => !SYSTEM_JOBS.has(f.id)).length
          : null,
        lastRunISO: lastRunRes.data?.finished_at ?? null,
      });
    })().catch((err) => {
      console.warn("[StatBanner] fetch failed:", err);
      if (!cancelled) setData({ activas: null, fuentes: null, lastRunISO: null });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return <StatBannerSkeleton />;

  const nfNumber = new Intl.NumberFormat(locale === "en" ? "en-US" : "es-PA");
  const activasLabel =
    data.activas !== null ? nfNumber.format(data.activas) : "—";
  const fuentesLabel = data.fuentes !== null ? String(data.fuentes) : "—";

  return (
    <section
      className="relative overflow-hidden"
      style={{ background: "#D6FF00" }}
    >
      {/* Textura diagonal en negro sobre el verde. Muy sutil — se lee
          como "grain" que aporta profundidad sin desaturar el verde. */}
      <DiagonalStripesPattern
        className="absolute inset-0"
        color="rgba(0,0,0,0.05)"
        spacing={14}
      />
      <div className="relative mx-auto max-w-7xl px-4 py-10 text-center sm:px-6 md:py-14 lg:px-8">
        <p
          className="font-bold leading-none tracking-tight tabular-nums text-black"
          style={{ fontSize: "clamp(3.5rem, 10vw, 7.5rem)" }}
        >
          {activasLabel}
        </p>
        <div className="mx-auto mt-3 h-0.5 w-16 rounded-full bg-black/30" />
        <p className="mt-3 text-lg font-medium text-black md:text-xl">
          {dict.landing.stat.activas}
        </p>
        <p className="mt-1.5 text-sm text-black/70">
          {dict.landing.stat.from_sources.replace("{n}", fuentesLabel)}
          {data.lastRunISO ? (
            <>
              {" · "}
              {formatRelativeLabel(data.lastRunISO, dict.landing.stat, locale)}
            </>
          ) : null}
        </p>
      </div>
    </section>
  );
}

function formatRelativeLabel(
  iso: string,
  labels: {
    updated_today: string;
    updated_yesterday: string;
    updated_days_ago: string;
  },
  locale: "es" | "en",
): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffHr = diffMs / 3600_000;
  if (diffHr < 24) return labels.updated_today;
  if (diffHr < 48) return labels.updated_yesterday;
  const days = Math.floor(diffHr / 24);
  const nf = new Intl.NumberFormat(locale === "en" ? "en-US" : "es-PA");
  return labels.updated_days_ago.replace("{n}", nf.format(days));
}

// Skeleton mientras el fetch está pendiente. Mismo alto/paleta que el
// banner real para evitar CLS al reemplazarse.
export function StatBannerSkeleton() {
  return (
    <section
      className="relative overflow-hidden"
      style={{ background: "#D6FF00" }}
    >
      <DiagonalStripesPattern
        className="absolute inset-0"
        color="rgba(0,0,0,0.05)"
        spacing={14}
      />
      <div className="relative mx-auto max-w-7xl px-4 py-10 text-center sm:px-6 md:py-14 lg:px-8">
        <div
          className="mx-auto animate-pulse rounded-md bg-black/15"
          style={{ height: "clamp(3.5rem, 10vw, 7.5rem)", width: "10ch" }}
        />
        <div className="mx-auto mt-3 h-0.5 w-16 rounded-full bg-black/20" />
        <div className="mx-auto mt-3 h-6 w-64 animate-pulse rounded bg-black/15" />
        <div className="mx-auto mt-1.5 h-4 w-48 animate-pulse rounded bg-black/10" />
      </div>
    </section>
  );
}
