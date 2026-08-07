/**
 * Backfill IA — re-enriquece propiedades ya guardadas en Supabase que
 * quedaron sin `resumen_ia_es` (típicamente porque la corrida original
 * tenía la Gemini key expirada/inválida).
 *
 * Flujo:
 *   1. SELECT propiedades WHERE resumen_ia_es IS NULL AND ai_source_flag IS NULL.
 *   2. Para cada una: playwright.goto(url_original) → JSON-LD Product → description.
 *   3. enriquecerConIA(ficha, descripcionTemp) — descripción NO se persiste.
 *   4. UPDATE propiedades SET resumen_ia_es, resumen_ia_en, tags_caracteristicas,
 *      tags_extra, ai_source_flag, fecha_actualizacion WHERE id.
 *   5. Audita la corrida en scraper_runs (notes='backfill-ia').
 *
 * Reglas ToS (igual que el scraper):
 *   - UA honesto, delay aleatorio entre páginas, abort en captcha/4xx.
 *   - La descripción es VARIABLE LOCAL — no toca disco ni logs.
 *
 * Uso:
 *   npm run scrape:backfill-ia
 */

import { config as loadEnv } from "dotenv";
import { chromium, type Page } from "playwright";

import { enriquecerConIA, trimDescripcion, type FichaIA } from "./ia";
import { createScraperClient } from "./supabase-admin";

loadEnv({ path: ".env.local" });
loadEnv();

const USER_AGENT =
  "MapaInteractivoInteligente/0.1 (+contacto: abilendesign@gmail.com)";
// Fila propia en `fuentes` (migration 0018) para distinguir las corridas
// de este job de las de encuentra24 en scraper_runs.
const FUENTE_ID = "backfill-ia";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min = 1500, max = 3000) =>
  sleep(min + Math.floor(Math.random() * (max - min)));

type FilaPendiente = {
  id: string;
  titulo: string;
  url_original: string;
  precio: number | string | null;
  moneda: string | null;
  area_m2: number | string | null;
  habitaciones: number | null;
  banos: number | string | null;
  estacionamientos: number | null;
  corregimiento: string | null;
  tipo_operacion: "venta" | "alquiler";
  fuente_id: string;
};

type LdProduct = {
  "@type"?: string;
  description?: string;
};

function toNumber(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/**
 * Extrae solo la descripción del anuncio. Devuelve null si no hay JSON-LD,
 * captcha, 4xx, etc. La descripción es input TEMPORAL — el caller la pasa
 * a Gemini y la descarta. NO se persiste a disco ni a Supabase.
 */
async function fetchDescripcion(page: Page, url: string): Promise<string | null> {
  const res = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });
  if (!res || res.status() >= 400) {
    console.warn(`  HTTP ${res?.status() ?? "??"} — saltando`);
    return null;
  }
  await page
    .waitForLoadState("networkidle", { timeout: 8000 })
    .catch(() => null);
  if (
    await page
      .locator("text=/captcha|verify|robot/i")
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    console.error("  Captcha/bloqueo detectado. Abortando corrida.");
    throw new Error("captcha");
  }
  const products = (await page.$$eval(
    'script[type="application/ld+json"]',
    (nodes) =>
      nodes
        .map((n) => {
          try {
            return JSON.parse(n.textContent || "");
          } catch {
            return null;
          }
        })
        .filter(Boolean),
  )) as LdProduct[];
  const product = products.find((p) => p?.["@type"] === "Product");
  return product?.description ?? null;
}

async function main() {
  const supa = createScraperClient();

  // Selecciona solo las que tienen IA vacía. Si ai_source_flag ya está
  // seteado, la corrida pasada SÍ enriqueció — no la re-procesamos.
  const { data, error } = await supa
    .from("propiedades")
    .select(
      "id, titulo, url_original, precio, moneda, area_m2, habitaciones, banos, estacionamientos, corregimiento, tipo_operacion, fuente_id",
    )
    .is("resumen_ia_es", null)
    .is("ai_source_flag", null);

  if (error) {
    console.error("Error leyendo propiedades:", error.message);
    process.exit(1);
  }

  const pendientes = (data ?? []) as FilaPendiente[];
  console.log(`Propiedades pendientes de IA: ${pendientes.length}.`);
  if (pendientes.length === 0) {
    console.log("Nada que hacer.");
    return;
  }

  const runStart = new Date().toISOString();
  const { data: runRow } = await supa
    .from("scraper_runs")
    .insert({
      fuente_id: FUENTE_ID,
      status: "running",
      notes: "backfill-ia",
      started_at: runStart,
    })
    .select("id")
    .single();
  const runId = runRow?.id as string | undefined;

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 800 },
    locale: "es-PA",
  });
  const page = await ctx.newPage();

  let enriquecidos = 0;
  let errores = 0;
  let captchaAbort = false;

  try {
    for (const fila of pendientes) {
      await jitter();
      console.log(`→ ${fila.url_original}`);
      try {
        const desc = await fetchDescripcion(page, fila.url_original);
        const descripcionTemp = trimDescripcion(desc);
        if (!descripcionTemp) {
          console.log(`  sin descripción extraíble — skip`);
          errores++;
          continue;
        }

        const ficha: FichaIA = {
          titulo: fila.titulo,
          tipoOperacion: fila.tipo_operacion,
          precio: toNumber(fila.precio),
          moneda: fila.moneda,
          area_m2: toNumber(fila.area_m2),
          habitaciones: fila.habitaciones,
          banos: toNumber(fila.banos),
          estacionamientos: fila.estacionamientos,
          zona: fila.corregimiento,
        };
        const enriq = await enriquecerConIA(ficha, descripcionTemp);

        if (
          !enriq.resumen_ia &&
          enriq.tags_caracteristicas.length === 0 &&
          enriq.tags_extra.length === 0
        ) {
          console.log(`  IA no produjo contenido — skip update`);
          continue;
        }

        const { error: updErr } = await supa
          .from("propiedades")
          .update({
            resumen_ia_es: enriq.resumen_ia?.es ?? null,
            resumen_ia_en: enriq.resumen_ia?.en ?? null,
            tags_caracteristicas: enriq.tags_caracteristicas,
            tags_extra: enriq.tags_extra,
            ai_source_flag: enriq.ai_source_flag,
            fecha_actualizacion: new Date().toISOString(),
          })
          .eq("id", fila.id);

        if (updErr) {
          console.warn(`  update falló: ${updErr.message}`);
          errores++;
        } else {
          console.log(
            `  ✓ es:${enriq.resumen_ia?.es.length ?? 0} en:${enriq.resumen_ia?.en.length ?? 0} ` +
              `tags:${enriq.tags_caracteristicas.length}+${enriq.tags_extra.length}`,
          );
          enriquecidos++;
        }
      } catch (err) {
        const msg = (err as Error).message;
        if (msg === "captcha") {
          captchaAbort = true;
          break;
        }
        console.warn(`  error: ${msg}`);
        errores++;
      }
    }
  } finally {
    await browser.close();
  }

  if (runId) {
    await supa
      .from("scraper_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: captchaAbort ? "error" : "ok",
        found: pendientes.length,
        updated: enriquecidos,
        errors: errores,
        notes: captchaAbort
          ? "backfill-ia (captcha abort)"
          : "backfill-ia",
      })
      .eq("id", runId);
  }

  console.log(
    `\nBackfill terminado — enriquecidos: ${enriquecidos}, errores: ${errores}.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
