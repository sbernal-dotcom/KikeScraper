/**
 * Post-run del workflow scraper: decide si abrir un GitHub Issue.
 *
 * Dos casos:
 *   1. El step de scrape falló (exit != 0). Recibimos SCRAPE_STATUS=failure
 *      por env desde el workflow. Abrimos issue con link al run log.
 *      No consultamos Supabase porque puede no tener registro (error
 *      pudo ser pre-DB, ej. env vars faltantes o WebSocket).
 *
 *   2. El scrape "tuvo éxito" (exit 0) pero la última fila de
 *      scraper_runs tiene status='error' o errors>0. Esos son errores
 *      blandos (ej. 8 upserts fallidos por banos smallint). Abrimos
 *      issue con detalles de la fila.
 *
 * En cualquier otro caso, no hace nada (script sale 0, sin issue).
 *
 * Crea el issue con `gh issue create` — gh CLI viene preinstalado en
 * ubuntu-latest. Usa GH_TOKEN (passthrough de secrets.GITHUB_TOKEN).
 */
import { spawnSync } from "child_process";

import { config as loadEnv } from "dotenv";

import { createScraperClient } from "./supabase-admin";

loadEnv({ path: ".env.local" });
loadEnv();

const SCRAPE_FAILED = process.env.SCRAPE_STATUS === "failure";
const REPO = process.env.GITHUB_REPOSITORY ?? "abilendesign/mapa-interactivo-inteligente";
const RUN_ID = process.env.GITHUB_RUN_ID ?? "?";
const RUN_URL = `https://github.com/${REPO}/actions/runs/${RUN_ID}`;
const DATE = new Date().toISOString().slice(0, 10);

function ghIssue(title: string, body: string) {
  const r = spawnSync("gh", ["issue", "create", "--title", title, "--body", body], {
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error(`gh issue create falló (exit ${r.status}).`);
    process.exit(1);
  }
}

type RunRow = {
  id: string;
  status: string;
  found: number | null;
  inserted: number | null;
  updated: number | null;
  errors: number | null;
  notes: string | null;
  started_at: string;
  finished_at: string | null;
};

async function main() {
  if (SCRAPE_FAILED) {
    ghIssue(
      `Scraper falló (${DATE})`,
      [
        "El step de scrape terminó con exit code distinto de 0.",
        "",
        `**Run:** ${RUN_URL}`,
        "",
        "Probablemente NO hay fila en `scraper_runs` para esta corrida (error pre-DB:",
        "env vars faltantes, WebSocket, captcha, etc). Revisar los logs del run.",
      ].join("\n"),
    );
    return;
  }

  // Scrape exit 0 — chequeamos si hubo errores blandos en scraper_runs.
  const supa = createScraperClient();
  const { data, error } = await supa
    .from("scraper_runs")
    .select("id, status, found, inserted, updated, errors, notes, started_at, finished_at")
    .order("started_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("No pude leer scraper_runs:", error.message);
    // No abrimos issue por esto solo — el script post-run ya es defensivo.
    return;
  }

  const run = (data?.[0] ?? null) as RunRow | null;
  if (!run) {
    console.log("Sin filas en scraper_runs — nada que reportar.");
    return;
  }

  const hasErrors = run.status === "error" || (run.errors ?? 0) > 0;
  if (!hasErrors) {
    console.log(
      `OK — found:${run.found} inserted:${run.inserted} updated:${run.updated} errors:${run.errors}`,
    );
    return;
  }

  ghIssue(
    `Scraper con errores blandos (${DATE}) — ${run.errors ?? 0} fallidos`,
    [
      `**Run:** ${RUN_URL}`,
      `**scraper_runs.id:** \`${run.id}\``,
      "",
      "| campo | valor |",
      "|---|---|",
      `| status | \`${run.status}\` |`,
      `| found | ${run.found ?? 0} |`,
      `| inserted | ${run.inserted ?? 0} |`,
      `| updated | ${run.updated ?? 0} |`,
      `| errors | ${run.errors ?? 0} |`,
      `| started_at | ${run.started_at} |`,
      `| finished_at | ${run.finished_at ?? "?"} |`,
      `| notes | ${run.notes ?? "—"} |`,
    ].join("\n"),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
