/**
 * Detector de anomalías del cron diario + email automático.
 *
 * Corre al FINAL del pipeline (último step de run-pipeline.sh). Consulta
 * scraper_runs de las últimas 3h y detecta problemas:
 *   - Fuentes esperadas ausentes (crash silencioso o timeout sin fila)
 *   - Fuentes con >50% errores (sitio cambió o rate-limit)
 *   - Pipeline duró >150 min (cerca del cap de 180)
 *   - Pipeline entero no corrió (0 runs en 3h)
 *
 * Si todo OK → silencio total (no envía nada). Si hay anomalías → email a
 * ALERT_EMAIL vía Resend.
 *
 * Env vars requeridas:
 *   RESEND_API_KEY    - free tier 3000 emails/mes en resend.com
 *   ALERT_EMAIL       - opcional, default abilendesign@gmail.com
 *
 * Uso:
 *   npm run alerta           # dry-run local (imprime pero no manda mail
 *                              si falta RESEND_API_KEY)
 *   Corre auto al final del cron.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { createScraperClient } from "./supabase-admin";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ALERT_EMAIL = process.env.ALERT_EMAIL ?? "abilendesign@gmail.com";
// Dominio de sandbox de Resend: no requiere verificación DNS, solo puede
// enviar al email del creador de la cuenta. Perfecto para 1-user alertas.
const FROM_EMAIL = "Mapa Panama <onboarding@resend.dev>";

// Fuentes que DEBERÍAN aparecer en scraper_runs de cada cron. Si falta
// alguna → alerta crítica (crash pre-DB o timeout sin SIGTERM handler).
const FUENTES_ESPERADAS = [
  "encuentra24",
  "acobir",
  "panamaequity",
  "mlsacobir",
  "savitat",
  "inmopanama",
];

const WINDOW_HOURS = 3;
const ERR_PCT_UMBRAL = 50;
const DURACION_UMBRAL_MIN = 150;

type Severity = "critical" | "warning";
type Anomalia = { severity: Severity; titulo: string; detalle: string };

type RunRow = {
  fuente_id: string;
  status: string;
  found: number | null;
  inserted: number | null;
  errors: number | null;
  notes: string | null;
  started_at: string;
  finished_at: string | null;
};

async function detectarAnomalias(): Promise<{ anomalias: Anomalia[]; runs: RunRow[] }> {
  const supa = createScraperClient();
  const anomalias: Anomalia[] = [];
  const desde = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();

  const { data, error } = await supa
    .from("scraper_runs")
    .select("fuente_id, status, found, inserted, errors, notes, started_at, finished_at")
    .gte("started_at", desde)
    .order("started_at", { ascending: true });

  if (error) {
    anomalias.push({
      severity: "critical",
      titulo: "No pude leer scraper_runs",
      detalle: error.message,
    });
    return { anomalias, runs: [] };
  }

  const runs = (data ?? []) as RunRow[];

  // 1. Sin runs → cron no corrió (o crasheó tempranísimo)
  if (runs.length === 0) {
    anomalias.push({
      severity: "critical",
      titulo: "Pipeline NO corrió",
      detalle: `Sin filas en scraper_runs en las últimas ${WINDOW_HOURS}h. Revisar Railway deployments.`,
    });
    return { anomalias, runs };
  }

  // 2. Fuentes esperadas ausentes
  const presentes = new Set(runs.map((r) => r.fuente_id));
  const faltantes = FUENTES_ESPERADAS.filter((f) => !presentes.has(f));
  if (faltantes.length > 0) {
    anomalias.push({
      severity: "critical",
      titulo: `${faltantes.length} fuente(s) sin scraper_run`,
      detalle: `Faltantes: ${faltantes.join(", ")}. Probable crash antes de escribir la fila (o SIGTERM handler no disparó).`,
    });
  }

  // 3. Cada fuente: >X% errores
  for (const r of runs) {
    const total = r.found ?? 0;
    const err = r.errors ?? 0;
    if (total === 0) continue;
    const pct = (err / total) * 100;
    if (pct >= ERR_PCT_UMBRAL) {
      anomalias.push({
        severity: "warning",
        titulo: `${r.fuente_id}: ${pct.toFixed(0)}% errores`,
        detalle: `found=${total} inserted=${r.inserted ?? 0} errors=${err}. Notes: ${r.notes ?? "—"}`,
      });
    }
  }

  // 4. Duración total del pipeline
  const inicios = runs.map((r) => new Date(r.started_at).getTime());
  const finales = runs
    .filter((r) => r.finished_at)
    .map((r) => new Date(r.finished_at!).getTime());
  if (finales.length > 0) {
    const dur = Math.round((Math.max(...finales) - Math.min(...inicios)) / 60000);
    if (dur >= DURACION_UMBRAL_MIN) {
      anomalias.push({
        severity: "warning",
        titulo: `Pipeline duró ${dur} min`,
        detalle: `Umbral de alerta: ${DURACION_UMBRAL_MIN} min. Cap absoluto: 180 min.`,
      });
    }
  }

  return { anomalias, runs };
}

function armarEmail(anomalias: Anomalia[], runs: RunRow[]): { subject: string; html: string } {
  const fecha = new Date().toISOString().slice(0, 10);
  const nCrit = anomalias.filter((a) => a.severity === "critical").length;
  const nWarn = anomalias.filter((a) => a.severity === "warning").length;
  const prefix = nCrit > 0 ? "🚨" : "⚠️";
  const subject = `${prefix} [Mapa Panama ${fecha}] ${nCrit} crítica(s) · ${nWarn} warning(s)`;

  const tablaRuns = runs
    .map((r) => {
      const dur =
        r.finished_at && r.started_at
          ? Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 60000)
          : "?";
      return `<tr><td>${r.fuente_id}</td><td>${r.status}</td><td>${dur}m</td><td>${r.found ?? 0}</td><td>${r.inserted ?? 0}</td><td>${r.errors ?? 0}</td></tr>`;
    })
    .join("\n");

  const listaAnomalias = anomalias
    .map((a) => {
      const badge = a.severity === "critical" ? "🚨 CRÍTICA" : "⚠️ WARNING";
      return `<li><b>${badge}</b>: ${a.titulo}<br><small>${a.detalle}</small></li>`;
    })
    .join("\n");

  const html = `
    <div style="font-family:sans-serif;max-width:640px">
      <h2>Cron del ${fecha} — anomalías detectadas</h2>
      <ul>${listaAnomalias}</ul>
      <h3>Corridas registradas (últimas ${WINDOW_HOURS}h)</h3>
      <table border="1" cellpadding="6" style="border-collapse:collapse;font-size:13px">
        <tr><th>Fuente</th><th>Status</th><th>Dur</th><th>Found</th><th>Ins</th><th>Err</th></tr>
        ${tablaRuns || '<tr><td colspan="6"><em>sin corridas</em></td></tr>'}
      </table>
      <p style="color:#666;font-size:12px">
        Auto-generado por <code>pipeline-alerta.ts</code>. Silenciar temporalmente:
        vaciar RESEND_API_KEY en Railway.
      </p>
    </div>
  `;

  return { subject, html };
}

async function enviarEmail(subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn("⚠ RESEND_API_KEY no configurada — imprimiendo email en consola en vez de mandar.");
    console.log(`\n--- EMAIL (dry) ---`);
    console.log(`To: ${ALERT_EMAIL}`);
    console.log(`Subject: ${subject}`);
    console.log(`HTML:\n${html}\n---`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [ALERT_EMAIL],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`✗ Resend ${res.status}: ${body}`);
    process.exit(1);
  }
  console.log(`✓ Email enviado a ${ALERT_EMAIL}`);
}

async function main() {
  const { anomalias, runs } = await detectarAnomalias();
  console.log(`Runs analizadas: ${runs.length}. Anomalías: ${anomalias.length}.`);
  if (anomalias.length === 0) {
    console.log("✓ Sin anomalías. Silencio.");
    return;
  }
  for (const a of anomalias) {
    console.log(`  [${a.severity}] ${a.titulo} — ${a.detalle}`);
  }
  const { subject, html } = armarEmail(anomalias, runs);
  await enviarEmail(subject, html);
}

main().catch((e) => {
  console.error("Fatal en pipeline-alerta:", e);
  // NUNCA fallar duro. El pipeline ya terminó — si el email falla,
  // logueamos y salimos limpio para no re-disparar reruns.
  process.exit(0);
});
