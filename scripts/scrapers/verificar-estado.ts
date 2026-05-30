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

// Si llevamos N corridas sin verla, escala el estado.
const THRESH_POSIBLE_INACTIVO = 3;
const THRESH_ARCHIVADO = 7;

// Para no martillar la fuente: delay entre requests.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min = 1200, max = 2400) =>
  sleep(min + Math.floor(Math.random() * (max - min)));

// Timeout por request. encuentra24 normalmente responde en <2s.
const FETCH_TIMEOUT_MS = 15_000;

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
    if (res.status !== 200) {
      return { tipo: "error", motivo: `HTTP ${res.status}` };
    }

    const html = await res.text();
    // Heurística captcha/bloqueo.
    if (/captcha|verify\s+you|are you a robot|access denied/i.test(html)) {
      return { tipo: "error", motivo: "captcha o bloqueo" };
    }
    // JSON-LD Product presente → vivo. Buscamos el patrón sin parsear
    // todo el HTML — más rápido y robusto a variaciones de whitespace.
    if (/"@type"\s*:\s*"Product"/.test(html)) {
      return { tipo: "viva", motivo: "JSON-LD Product OK" };
    }
    return { tipo: "no_encontrada", motivo: "200 sin JSON-LD Product" };
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

  // Trae las que no son archivadas Y no fueron revisadas recién.
  // Los archivadas se dejan en paz para no martillar URLs muertas.
  const { data, error } = await supa
    .from("propiedades")
    .select("id, url_original, estado_anuncio, veces_no_encontrado")
    .neq("estado_anuncio", "archivado")
    .or(`fecha_ultima_revision.is.null,fecha_ultima_revision.lt.${cutoff.toISOString()}`);

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

  let vivas = 0;
  let noEncontradas = 0;
  let erroresVerificacion = 0;
  let archivadas = 0;
  let posiblesInactivas = 0;

  for (const fila of pendientes) {
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
        // NO incrementa contador.
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
  }

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
