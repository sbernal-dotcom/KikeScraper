/**
 * Pre-flight check por fuente: antes de scrapear, verifica que el
 * listado sigue existiendo y devuelve suficientes URLs con el patrón
 * esperado. Si falla, el scraper aborta ANTES de tocar la DB y (en
 * modo CI) abre un GitHub Issue.
 *
 * Motivación: 2026-07-07 el sitio de MLS Acobir cambió su URL de
 * listado principal. El scraper devolvía 0 durante 3 días antes de
 * que alguien lo notara. Con preflight lo detectamos el día 0.
 *
 * Cada fuente registra su config en PREFLIGHT_CONFIG:
 *   - listUrl: URL de listado a consultar
 *   - minUrls: número mínimo de URLs de detalle que debe traer
 *   - detailPattern: regex del path de una URL de detalle válida
 *   - markers: (opcional) strings que deben aparecer en el HTML
 */
import { spawnSync } from "child_process";

const USER_AGENT =
  "MapaInteractivoInteligente/0.1 (+contacto: abilendesign@gmail.com)";
const FETCH_TIMEOUT_MS = 20_000;

type PreflightConfig = {
  listUrl: string;
  minUrls: number;
  detailPattern: RegExp;
  markers?: string[];
};

const PREFLIGHT_CONFIG: Record<string, PreflightConfig> = {
  encuentra24: {
    listUrl:
      "https://www.encuentra24.com/panama-es/bienes-raices-venta-de-propiedades-apartamentos",
    minUrls: 10,
    detailPattern: /\/panama-es\/bienes-raices[^"'?#]+\/\d{6,}/,
    markers: ["Apartamento", "encuentra24"],
  },
  acobir: {
    listUrl: "https://www.acobir.com/proyectos/list/",
    minUrls: 1, // pocos proyectos, umbral bajo
    detailPattern: /acobir\.com\/proyectos\/list\/[a-z0-9-]{3,}/,
  },
  panamaequity: {
    listUrl: "https://www.panamaequity.com/es/listings/",
    minUrls: 5,
    detailPattern: /panamaequity\.com\/es\/listings\/[a-z0-9-]{5,}/,
  },
  mlsacobir: {
    listUrl: "https://www.mlsacobir.com/propiedades-en-panama/",
    minUrls: 3,
    detailPattern: /mlsacobir\.com\/propiedades\/\d+-[a-z0-9-]+\//,
  },
  inmopanama: {
    listUrl: "https://www.inmopanama.com/venta-propiedades-panama",
    minUrls: 5,
    // inmopanama emite URLs relativas: href="/xxx_p-N.htm"
    detailPattern: /["'\/][a-z0-9-]{5,}_p-\d+\.htm/,
  },
  savitat: {
    listUrl: "https://savitat.com/sitemap.xml",
    minUrls: 20,
    detailPattern: /savitat\.com\/properties\/[a-z0-9-]{5,}/,
  },
};

export type PreflightResult =
  | { ok: true; foundUrls: number }
  | { ok: false; reason: string; foundUrls: number; sample: string };

function ghIssue(title: string, body: string) {
  if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) return;
  const r = spawnSync("gh", ["issue", "create", "--title", title, "--body", body], {
    stdio: "inherit",
  });
  if (r.status !== 0) console.warn(`  gh issue create falló (exit ${r.status}).`);
}

// Retry en errores transitorios (network/timeout/429/5xx) antes de
// abortar la fuente. Fix 2026-07-18: durante la caída de internet
// del user y ratos de latencia alta, un solo timeout hacía abortar
// toda la corrida de Panama Equity (transitorio, no bug del sitio).
// Ahora reintentamos hasta 3 veces con backoff 2s → 4s.
const PREFLIGHT_MAX_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchListingOnce(listUrl: string): Promise<
  | { ok: true; html: string }
  | { ok: false; status: number; message: string; transient: boolean }
> {
  try {
    const res = await fetch(listUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: `HTTP ${res.status}`,
        transient: res.status === 429 || res.status >= 500,
      };
    }
    return { ok: true, html: await res.text() };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    return {
      ok: false,
      status: 0,
      message,
      transient: /fetch failed|timeout|ECONN|abort/i.test(message),
    };
  }
}

/**
 * Verifica que el listado del sitio sigue devolviendo URLs con el
 * patrón esperado y suficientes markers. Retorna ok:true si todo
 * está bien; ok:false si el scraper debería abortar.
 *
 * Cuando falla, crea un GitHub Issue (solo si GH_TOKEN está seteado).
 */
export async function preflightCheck(fuenteId: string): Promise<PreflightResult> {
  const cfg = PREFLIGHT_CONFIG[fuenteId];
  if (!cfg) {
    console.warn(`  preflight: sin config para "${fuenteId}" — skip`);
    return { ok: true, foundUrls: 0 };
  }
  console.log(`  preflight ${fuenteId} → ${cfg.listUrl}`);

  let html: string | null = null;
  let lastFail: { status: number; message: string } | null = null;
  for (let attempt = 1; attempt <= PREFLIGHT_MAX_ATTEMPTS; attempt++) {
    const r = await fetchListingOnce(cfg.listUrl);
    if (r.ok) {
      html = r.html;
      break;
    }
    lastFail = { status: r.status, message: r.message };
    if (!r.transient || attempt === PREFLIGHT_MAX_ATTEMPTS) break;
    const backoffMs = 2000 * attempt;
    console.warn(`  preflight intento ${attempt} falló (${r.message}) — retry en ${backoffMs}ms`);
    await sleep(backoffMs);
  }

  if (html == null) {
    const reason = lastFail?.status
      ? `HTTP ${lastFail.status} al pedir el listado (${PREFLIGHT_MAX_ATTEMPTS} intentos)`
      : `Fetch falló: ${lastFail?.message ?? "?"} (${PREFLIGHT_MAX_ATTEMPTS} intentos)`;
    raiseIssue(fuenteId, cfg, reason, 0, lastFail?.message ?? "fetch error");
    return { ok: false, reason, foundUrls: 0, sample: lastFail?.message ?? "fetch error" };
  }

  const matches = html.match(new RegExp(cfg.detailPattern.source, "g")) ?? [];
  const unique = new Set(matches);
  if (unique.size < cfg.minUrls) {
    const reason = `Listado devolvió ${unique.size} URLs (esperado ≥${cfg.minUrls})`;
    raiseIssue(
      fuenteId,
      cfg,
      reason,
      unique.size,
      matches.slice(0, 3).join(", ") || "(sin matches)",
    );
    return { ok: false, reason, foundUrls: unique.size, sample: matches.slice(0, 3).join(", ") };
  }

  if (cfg.markers) {
    const missing = cfg.markers.filter((m) => !html.includes(m));
    if (missing.length > 0) {
      const reason = `Faltan markers en el HTML: ${missing.join(", ")}`;
      raiseIssue(fuenteId, cfg, reason, unique.size, missing.join(", "));
      return { ok: false, reason, foundUrls: unique.size, sample: missing.join(", ") };
    }
  }

  console.log(`  preflight ✓ ${unique.size} URLs (≥${cfg.minUrls})`);
  return { ok: true, foundUrls: unique.size };
}

function raiseIssue(
  fuenteId: string,
  cfg: PreflightConfig,
  reason: string,
  found: number,
  sample: string,
) {
  const runUrl = `https://github.com/${process.env.GITHUB_REPOSITORY ?? "?"}/actions/runs/${process.env.GITHUB_RUN_ID ?? "?"}`;
  const body = [
    `Pre-flight check falló para \`${fuenteId}\` — el scraper NO va a correr para no corromper la DB.`,
    "",
    `**Causa:** ${reason}`,
    "",
    `**Config esperada:**`,
    `- URL listado: ${cfg.listUrl}`,
    `- Mínimo URLs esperadas: ${cfg.minUrls}`,
    `- Patrón detalle: \`${cfg.detailPattern.source}\``,
    ...(cfg.markers ? [`- Markers esperados: ${cfg.markers.join(", ")}`] : []),
    "",
    `**Encontrado:**`,
    `- URLs con patrón esperado: ${found}`,
    `- Muestra / detalle: ${sample}`,
    "",
    "**Acción sugerida:**",
    "1. Abrir manualmente la URL de listado y ver si el sitio cambió estructura.",
    "2. Actualizar el regex en \`scripts/scrapers/preflight-check.ts\` y en el scraper.",
    "",
    `Log del run: ${runUrl}`,
  ].join("\n");
  console.warn(`  preflight ✗ ${reason}`);
  ghIssue(
    `preflight: ${fuenteId} falló — ${reason.slice(0, 60)}`,
    body,
  );
}
