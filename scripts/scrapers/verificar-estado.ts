/**
 * Pase 2 del lifecycle — verifica el estado de las propiedades que el
 * scrape (pase 1) NO vio en su corrida más reciente.
 *
 * Flujo:
 *   1. SELECT id, url, estado_anuncio, veces_no_encontrado, fecha_ultima_revision
 *      FROM propiedades
 *      WHERE estado_anuncio != 'archivado'
 *        AND (fecha_ultima_revision IS NULL OR < now() - threshold)
 *   2. Para cada URL: GET ligero (fetch + parse HTML buscando JSON-LD Product).
 *   3. Clasificar:
 *      - 200 + Product encontrado → "viva" — reset contador, estado='activo'.
 *      - 404 | 410 | sin Product en la respuesta → "no_encontrada" — incrementa.
 *      - timeout | 5xx | captcha | network error → "error_verificacion" —
 *        NO incrementa contador, solo marca estado para visibilidad.
 *   4. Transiciones de contador:
 *      - 0–2: activo
 *      - 3–6: posible_inactivo
 *      - ≥7: archivado
 *   5. Audita en scraper_runs con notes='verificar-estado'.
 *
 * Reglas ToS (igual que el scraper):
 *   - UA honesto, delay aleatorio entre requests, abort en captcha.
 *   - NO descarga imágenes ni guarda descripción.
 *
 * Uso:
 *   npm run scrape:verify
 *
 * En el cron este script corre DESPUÉS de `scrape:prod`. Las URLs que
 * el scrape acaba de upsertar quedan con `fecha_ultima_revision = ahora`
 * y se saltan automáticamente (no caen en la ventana de re-verificación).
 */

import { spawnSync } from "child_process";

import { config as loadEnv } from "dotenv";

import { createScraperClient } from "./supabase-admin";

loadEnv({ path: ".env.local" });
loadEnv();

const USER_AGENT =
  "MapaInteractivoInteligente/0.1 (+contacto: abilendesign@gmail.com)";
const FUENTE_ID = "encuentra24";

// Solo re-verificamos filas con fecha_ultima_revision más vieja que esto.
// Mantenemos margen para que el scrape recién corrido no se vuelva a
// chequear en el mismo cron (ya quedó actualizado).
const REVERIFY_MIN_AGE_HOURS = 6;

// --force: ignora el cooldown y re-verifica TODO lo no archivado.
// Útil para recuperar de un bug del verificador (ej. heurística rota
// que dejó filas en error_verificacion erróneamente).
const FORCE = process.argv.includes("--force");

// Si llevamos N corridas sin verla, escala el estado.
const THRESH_POSIBLE_INACTIVO = 3;
const THRESH_ARCHIVADO = 7;

// Para no martillar la fuente: delay entre requests.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min = 1200, max = 2400) =>
  sleep(min + Math.floor(Math.random() * (max - min)));

// Timeout por request. encuentra24 normalmente responde en <2s.
const FETCH_TIMEOUT_MS = 15_000;

// Concurrencia del pase de verify.
// 2026-07-09: bajado de 5 → 2 después de que concurrency 5 archivara
// masivamente props válidas de Panama Equity y Savitat (58→4, 90→14).
const VERIFY_CONCURRENCY = 2;

// ---------------- Circuit breaker (2026-07-09) ----------------
// Antes de aplicar cambios sobre TODO el inventario, corremos verify
// sobre una muestra mezclada y medimos la tasa de "no_encontrada". Si
// pasa el umbral asumimos que el bug NO son las props sino la red o
// los portales devolviendo HTML sin JSON-LD → abortamos sin escribir
// nada. Esto evita el caso 2026-07-09 exacto: verify archivó 395 props
// válidas por un problema transitorio del sitio.
const CANARY_SIZE = 100;
const CANARY_NO_ENCONTRADA_MAX_RATIO = 0.25;

async function chunkedParallel<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(chunk.map(fn));
    for (const r of settled) {
      if (r.status === "fulfilled") out.push(r.value);
    }
  }
  return out;
}

/**
 * Selecciona una muestra mezclada: 1/3 más recientemente revisadas +
 * 1/3 más antiguas + 1/3 aleatorias. Sirve para detectar tanto
 * problemas de red genéricos como fallos por HTML nuevo del portal.
 */
function makeCanarySample(pendientes: FilaPendiente[]): FilaPendiente[] {
  if (pendientes.length <= CANARY_SIZE) return pendientes.slice();
  const third = Math.floor(CANARY_SIZE / 3);
  const recent = pendientes.slice(0, third);
  const old = pendientes.slice(-third);
  const remainingPool = pendientes.slice(third, pendientes.length - third);
  const random: FilaPendiente[] = [];
  const need = CANARY_SIZE - recent.length - old.length;
  // Muestra determinística por índice — evitamos Math.random() para
  // que dos corridas seguidas peguen las mismas URLs.
  const step = Math.max(1, Math.floor(remainingPool.length / need));
  for (let i = 0, j = 0; j < need && i < remainingPool.length; i += step, j++) {
    random.push(remainingPool[i]);
  }
  return [...recent, ...random, ...old];
}

function ghIssue(title: string, body: string) {
  if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
    console.warn("  (sin GH_TOKEN — issue no creado)");
    return;
  }
  const r = spawnSync("gh", ["issue", "create", "--title", title, "--body", body], {
    stdio: "inherit",
  });
  if (r.status !== 0) console.warn(`  gh issue create falló (exit ${r.status}).`);
}

type FilaPendiente = {
  id: string;
  url_original: string;
  estado_anuncio: string;
  veces_no_encontrado: number | null;
};

type Resultado =
  | { tipo: "viva"; motivo: string }
  | { tipo: "no_encontrada"; motivo: string }
  | { tipo: "error"; motivo: string };

/**
 * Hace GET a la URL y decide si la propiedad sigue viva. Heurística:
 *   - status 404 / 410 → no_encontrada (caso explícito).
 *   - redirect a otra cosa (ej. listado o home) → no_encontrada.
 *   - status >= 500 o timeout → error (no penaliza).
 *   - status 200 pero el HTML no contiene `"@type":"Product"` → no_encontrada.
 *   - status 200 con Product → viva.
 *
 * Usamos `Accept: text/html` y un UA de browser para que el server no
 * devuelva una versión adelgazada. `redirect: 'manual'` para detectar
 * redirects raros sin perder la URL final.
 */
async function verificar(url: string): Promise<Resultado> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "es-PA,es;q=0.9",
      },
      redirect: "manual",
      signal: ctrl.signal,
    });

    if (res.status === 404 || res.status === 410) {
      return { tipo: "no_encontrada", motivo: `HTTP ${res.status}` };
    }
    // Redirect: si la URL final pierde el slug del anuncio o vuelve al
    // listado / home, lo tomamos como removido. encuentra24 a veces
    // redirige a /panama-es/bienes-raices... cuando el ad muere.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location") ?? "";
      const lostId = !/\/\d{6,}/.test(loc); // sin ID de anuncio
      if (lostId) {
        return { tipo: "no_encontrada", motivo: `redirect a ${loc.slice(0, 80)}` };
      }
      // Redirect que mantiene un ID → seguimos manualmente una vez más.
      // Por simplicidad lo tratamos como vivo si el redirect parece a otro anuncio.
      return { tipo: "viva", motivo: `redirect mantiene id` };
    }
    if (res.status >= 500) {
      return { tipo: "error", motivo: `HTTP ${res.status}` };
    }
    // 2xx no-200 (201, 202, 203, 206...) son respuestas válidas con
    // cuerpo HTML. mlsacobir devuelve 202 a requests con UA bot-like.
    // Antes este caso caía a "error_verificacion" y archivaba props
    // vivas. Ahora procesamos el HTML igual.
    if (res.status < 200 || res.status >= 300) {
      return { tipo: "error", motivo: `HTTP ${res.status}` };
    }

    const html = await res.text();
    // Patrones de "página de propiedad viva":
    // 1) JSON-LD Product (encuentra24, panamaequity, inmopanama, acobir)
    // 2) Schema.org microdata para tipos inmobiliarios — mlsacobir usa
    //    itemtype="http://schema.org/SingleFamilyResidence". Genérico:
    //    Product, Apartment, House, SingleFamilyResidence, Residence,
    //    Place, RealEstateListing, Accommodation, Offer.
    // NO usamos heurísticas de "captcha" en el body: el HTML legítimo
    // de encuentra24 contiene "recaptchaSiteKey" (config del form de
    // contacto), lo que generaba falsos positivos en el 100% de las
    // páginas reales. Si hay un challenge real, vendrá con 403/503 o
    // sin Product — ambos casos ya quedan cubiertos.
    if (/"@type"\s*:\s*"Product"/.test(html)) {
      return { tipo: "viva", motivo: "JSON-LD Product OK" };
    }
    if (
      /itemtype=["'][^"']*schema\.org\/(Product|Apartment|House|SingleFamilyResidence|Residence|Place|RealEstateListing|Accommodation|Offer)\b/i.test(
        html,
      )
    ) {
      return { tipo: "viva", motivo: "Microdata Schema.org OK" };
    }
    // 200 sin Product: posibles causas legítimas (anuncio borrado por
    // el publicador, página de error custom del sitio). El contador
    // tolera 2 misses antes de cambiar el estado, así que un falso
    // negativo aislado no archiva una propiedad viva.
    return { tipo: "no_encontrada", motivo: "sin Product/microdata" };
  } catch (err) {
    const msg = (err as Error).name === "AbortError" ? "timeout" : (err as Error).message;
    return { tipo: "error", motivo: msg };
  } finally {
    clearTimeout(t);
  }
}

function nuevoEstado(vecesNoEncontrado: number): string {
  if (vecesNoEncontrado >= THRESH_ARCHIVADO) return "archivado";
  if (vecesNoEncontrado >= THRESH_POSIBLE_INACTIVO) return "posible_inactivo";
  return "activo";
}

async function main() {
  const supa = createScraperClient();
  const ahora = new Date();
  const cutoff = new Date(ahora.getTime() - REVERIFY_MIN_AGE_HOURS * 3600_000);

  // Trae las que no son archivadas Y no fueron revisadas recién (a menos
  // que pasen --force). Los archivadas se dejan en paz para no martillar
  // URLs muertas.
  const baseQuery = supa
    .from("propiedades")
    .select("id, url_original, estado_anuncio, veces_no_encontrado")
    .neq("estado_anuncio", "archivado");
  const { data, error } = FORCE
    ? await baseQuery
    : await baseQuery.or(
        `fecha_ultima_revision.is.null,fecha_ultima_revision.lt.${cutoff.toISOString()}`,
      );

  if (error) {
    console.error("Error leyendo propiedades:", error.message);
    process.exit(1);
  }

  const pendientes = (data ?? []) as FilaPendiente[];
  console.log(`Por verificar: ${pendientes.length} propiedades.`);
  if (pendientes.length === 0) {
    console.log("Nada que hacer.");
    return;
  }

  const startedAt = ahora.toISOString();
  const { data: runRow } = await supa
    .from("scraper_runs")
    .insert({
      fuente_id: FUENTE_ID,
      started_at: startedAt,
      status: "running",
      notes: "verificar-estado",
    })
    .select("id")
    .single();
  const runId = runRow?.id as string | undefined;

  // ---------------- CANARY (circuit breaker) ----------------
  const canary = makeCanarySample(pendientes);
  console.log(`\n▶ Canary: ${canary.length} URLs (recientes + antiguas + aleatorias)`);
  const canarySamples: Array<{
    url: string;
    tipo: "viva" | "no_encontrada" | "error";
    motivo: string;
  }> = [];
  await chunkedParallel(canary, VERIFY_CONCURRENCY, async (fila) => {
    await jitter();
    const r = await verificar(fila.url_original);
    canarySamples.push({ url: fila.url_original, tipo: r.tipo, motivo: r.motivo });
    return null;
  });
  const canaryVivas = canarySamples.filter((s) => s.tipo === "viva").length;
  const canaryNo = canarySamples.filter((s) => s.tipo === "no_encontrada").length;
  const canaryErr = canarySamples.filter((s) => s.tipo === "error").length;
  const noRatio = canary.length > 0 ? canaryNo / canary.length : 0;
  console.log(
    `  Canary result: vivas=${canaryVivas} no_encontradas=${canaryNo} errores=${canaryErr} → ratio no_encontrada = ${(noRatio * 100).toFixed(1)}%`,
  );

  if (noRatio > CANARY_NO_ENCONTRADA_MAX_RATIO) {
    const muestraFalsos = canarySamples
      .filter((s) => s.tipo === "no_encontrada")
      .slice(0, 10)
      .map((s) => `- \`${s.motivo}\` ${s.url}`)
      .join("\n");
    const body = [
      `Circuit breaker en verify: la muestra canary tuvo ${(noRatio * 100).toFixed(1)}% de "no_encontrada" (umbral ${(CANARY_NO_ENCONTRADA_MAX_RATIO * 100).toFixed(0)}%).`,
      "",
      `Muestra: ${canary.length} URLs (recientes + antiguas + aleatorias).`,
      `- vivas: ${canaryVivas}`,
      `- no_encontradas: ${canaryNo}`,
      `- errores: ${canaryErr}`,
      "",
      "**Verify ABORTADO** — no se aplicaron cambios de estado ni contadores. La causa más probable es que uno o varios portales están devolviendo HTML shell (sin JSON-LD) por problema transitorio.",
      "",
      "Ejemplos de las URLs marcadas como no_encontrada:",
      muestraFalsos,
      "",
      "Log completo: " + `https://github.com/${process.env.GITHUB_REPOSITORY ?? "?"}/actions/runs/${process.env.GITHUB_RUN_ID ?? "?"}`,
    ].join("\n");
    console.warn(`\n✗ ABORT: canary ${(noRatio * 100).toFixed(1)}% > ${(CANARY_NO_ENCONTRADA_MAX_RATIO * 100).toFixed(0)}%`);
    ghIssue(
      `verify: canary abort ${(noRatio * 100).toFixed(0)}% no_encontrada (${new Date().toISOString().slice(0, 10)})`,
      body,
    );
    if (runId) {
      await supa
        .from("scraper_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: "error",
          found: canary.length,
          notes: `verify canary abort — ratio ${(noRatio * 100).toFixed(1)}% > ${(CANARY_NO_ENCONTRADA_MAX_RATIO * 100).toFixed(0)}%`,
        })
        .eq("id", runId);
    }
    process.exit(1);
  }
  console.log(`  Canary OK — procediendo con las ${pendientes.length} URLs.`);

  let vivas = 0;
  let noEncontradas = 0;
  let erroresVerificacion = 0;
  let archivadas = 0;
  let posiblesInactivas = 0;

  await chunkedParallel(pendientes, VERIFY_CONCURRENCY, async (fila) => {
    await jitter();
    const r = await verificar(fila.url_original);
    const ahoraIso = new Date().toISOString();
    let update: Record<string, unknown>;

    if (r.tipo === "viva") {
      update = {
        estado_anuncio: "activo",
        veces_no_encontrado: 0,
        fecha_ultima_vista: ahoraIso,
        fecha_ultima_revision: ahoraIso,
        motivo_estado: `verificado activo (${r.motivo})`,
      };
      vivas++;
    } else if (r.tipo === "no_encontrada") {
      const veces = (fila.veces_no_encontrado ?? 0) + 1;
      const estado = nuevoEstado(veces);
      update = {
        estado_anuncio: estado,
        veces_no_encontrado: veces,
        fecha_ultima_revision: ahoraIso,
        motivo_estado: `${r.motivo} (fallo ${veces})`,
      };
      noEncontradas++;
      if (estado === "archivado") archivadas++;
      else if (estado === "posible_inactivo") posiblesInactivas++;
    } else {
      update = {
        estado_anuncio: "error_verificacion",
        fecha_ultima_revision: ahoraIso,
        motivo_estado: `error: ${r.motivo}`,
      };
      erroresVerificacion++;
    }

    const { error: updErr } = await supa
      .from("propiedades")
      .update(update)
      .eq("id", fila.id);
    if (updErr) {
      console.warn(`  ✗ ${fila.url_original}: update ${updErr.message}`);
    } else {
      const tag =
        r.tipo === "viva" ? "✓" : r.tipo === "no_encontrada" ? "✗" : "?";
      console.log(`  ${tag} ${r.tipo} — ${r.motivo}`);
    }
    return null;
  });

  console.log(
    `\nVerificadas: ${pendientes.length} | vivas: ${vivas} | no encontradas: ${noEncontradas} (→ ${posiblesInactivas} posible_inactivo, ${archivadas} archivado) | errores: ${erroresVerificacion}.`,
  );

  if (runId) {
    await supa
      .from("scraper_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "ok",
        found: pendientes.length,
        inserted: 0,
        updated: vivas + noEncontradas + erroresVerificacion,
        errors: 0,
        notes: `verificar-estado | vivas:${vivas} no_encontradas:${noEncontradas} errores:${erroresVerificacion} archivadas:${archivadas} posibles:${posiblesInactivas}`,
      })
      .eq("id", runId);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
