import { createClient } from "@/lib/supabase/server";
import { dictionaries, type Locale } from "@/i18n/dictionaries";

// StatBanner: número gigante con la cantidad de propiedades activas y una
// línea chica debajo con la cantidad de fuentes + cuándo fue la última
// corrida. Server Component async — se corre en el servidor, cuenta en la
// DB y devuelve HTML ya renderizado. Con `revalidate` en la página, este
// componente se cachea por 5 minutos.
//
// Opción B del landing plan: fondo negro, número en verde. El número es
// enorme (text-8xl) para que "grite" sin necesidad de fondo verde.

export async function StatBanner({ locale = "es" }: { locale?: Locale }) {
  const dict = dictionaries[locale];
  const supabase = await createClient();

  // 3 queries en paralelo. Cualquier fallo individual cae a null y
  // renderea "—" en vez de romper toda la página.
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

  const activas = activasRes.count ?? null;
  // Excluir jobs "sistema" (verify, refresh-precios, backfill-ia) — no son
  // fuentes de datos, solo comparten la tabla `fuentes` por el FK de
  // scraper_runs. El card debe reflejar "de cuántos portales scrapeamos".
  const SYSTEM_JOBS = new Set(["verify", "refresh-precios", "backfill-ia"]);
  const fuentes = fuentesRes.data
    ? fuentesRes.data.filter((f) => !SYSTEM_JOBS.has(f.id)).length
    : null;
  const lastRunISO = lastRunRes.data?.finished_at ?? null;

  const nfNumber = new Intl.NumberFormat(locale === "en" ? "en-US" : "es-PA");
  const activasLabel = activas !== null ? nfNumber.format(activas) : "—";
  const fuentesLabel = fuentes !== null ? String(fuentes) : "—";

  return (
    <section style={{ background: "#D6FF00" }}>
      <div className="mx-auto max-w-7xl px-4 py-10 text-center sm:px-6 md:py-14 lg:px-8">
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
          {lastRunISO ? (
            <>
              {" · "}
              {formatRelativeLabel(lastRunISO, dict.landing.stat, locale)}
            </>
          ) : null}
        </p>
      </div>
    </section>
  );
}

function formatRelativeLabel(
  iso: string,
  labels: { updated_today: string; updated_yesterday: string; updated_days_ago: string },
  locale: Locale,
): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffHr = diffMs / 3600_000;
  if (diffHr < 24) return labels.updated_today;
  if (diffHr < 48) return labels.updated_yesterday;
  const days = Math.floor(diffHr / 24);
  const nf = new Intl.NumberFormat(locale === "en" ? "en-US" : "es-PA");
  return labels.updated_days_ago.replace("{n}", nf.format(days));
}

// Skeleton para el Suspense fallback: reserva el mismo alto que el banner
// real para que no haya salto de layout (CLS) mientras se resuelve la DB.
// Sobre fondo verde igual que el banner real, con shimmer en negro suave.
export function StatBannerSkeleton() {
  return (
    <section style={{ background: "#D6FF00" }}>
      <div className="mx-auto max-w-7xl px-4 py-10 text-center sm:px-6 md:py-14 lg:px-8">
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
