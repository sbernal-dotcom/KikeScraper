/**
 * Revive URLs archivadas de InmoPanama que siguen vivas en el sitio.
 *
 * Contexto: el 2026-07-15 hicimos skip de TODAS las archivadas en
 * scraper-inmopanama.ts (antes se re-procesaban las < 7 días
 * consumiendo 3h+ en Groq). Perdimos la reactivación automática:
 * si InmoPanama re-publica una URL archivada, no la detectamos.
 *
 * Este script compensa: recorre archivadas de InmoPanama y para
 * cada una hace HEAD al url_original:
 *   - 200 → URL viva de nuevo → reactivar (estado='activo',
 *          reset veces_no_encontrado, motivo='reactivada por HEAD OK')
 *   - 404/410 → confirmar muerta, sólo touch fecha_ultima_revision
 *   - Otros errores → no tocar
 *
 * Uso:
 *   npm run revivir:inmo                 # dry-run, primeras 500
 *   npm run revivir:inmo:apply           # apply, primeras 500
 *   npm run revivir:inmo:apply -- --limit=2000
 *
 * Diseñado para correrse manualmente 1x/semana desde el PC del user.
 * NO corre en Railway porque ese cron ya está ocupado con el pipeline
 * diario y esto es best-effort de mantenimiento.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { createScraperClient } from "./supabase-admin";

const APPLY = process.argv.includes("--apply");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  if (i >= 0) {
    const n = Number(process.argv[i + 1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 500;
})();

const USER_AGENT =
  "MapaInteractivoInteligente/0.1 (+contacto: abilendesign@gmail.com)";
const FETCH_TIMEOUT_MS = 15_000;
const CONCURRENCY = 5;
const JITTER_MS = 300;

// Solo re-verificar archivadas revisadas hace > MIN_DAYS (para no
// martillar el sitio con URLs recién comprobadas).
const MIN_DAYS_SINCE_LAST_REVIEW = 14;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Row = {
  id: string;
  url_original: string;
  fecha_ultima_revision: string | null;
  veces_no_encontrado: number | null;
};

type HeadResult =
  | { kind: "vive"; status: number }
  | { kind: "muerta"; status: number }
  | { kind: "otro"; status: number; message: string };

async function headUrl(url: string): Promise<HeadResult> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "manual",
    });
    if (res.status === 200) return { kind: "vive", status: 200 };
    if (res.status === 404 || res.status === 410)
      return { kind: "muerta", status: res.status };
    // 3xx: solo lo consideramos viva si el redirect es a la misma URL
    // canonical (mismo path). Cualquier otra cosa cuenta como muerta.
    //
    // Casos reales observados en InmoPanama (2026-07-26):
    //   /prop_p-XYZ.htm → /venta-propiedades-panama?prop_unavailable=XYZ
    //   → esto es MUERTA (propiedad no disponible)
    //   → antes lo pasábamos como viva por error, reactivando 1000 URLs
    //   muertas. Ahora es opt-in: si el location contiene el mismo path
    //   original o difiere solo en query/hash, es canonical → viva.
    //   Cualquier otro redirect → muerta.
    if (res.status >= 300 && res.status < 400) {
      const loc = (res.headers.get("location") ?? "").trim();
      if (!loc) return { kind: "muerta", status: res.status };
      // Extraer el path del URL original
      let origPath: string;
      try {
        origPath = new URL(url).pathname;
      } catch {
        return { kind: "muerta", status: res.status };
      }
      // Location puede ser relativo o absoluto
      let redirPath: string;
      try {
        redirPath = loc.startsWith("http")
          ? new URL(loc).pathname
          : loc.split("?")[0];
      } catch {
        return { kind: "muerta", status: res.status };
      }
      // Vive solo si mismo path (permitir cambio de query/hash)
      return origPath === redirPath
        ? { kind: "vive", status: res.status }
        : { kind: "muerta", status: res.status };
    }
    return { kind: "otro", status: res.status, message: `HTTP ${res.status}` };
  } catch (err) {
    return { kind: "otro", status: 0, message: (err as Error).message };
  }
}

async function main() {
  const supa = createScraperClient();

  // Filtro: archivadas de InmoPanama, con fecha_ultima_revision > 14 días
  // (o sin fecha), ordenadas por fecha ascendente (procesamos las más viejas
  // primero).
  const cutoff = new Date(
    Date.now() - MIN_DAYS_SINCE_LAST_REVIEW * 24 * 3600 * 1000,
  ).toISOString();

  const { data, error } = await supa
    .from("propiedades")
    .select("id, url_original, fecha_ultima_revision, veces_no_encontrado")
    .eq("fuente_id", "inmopanama")
    .eq("estado_anuncio", "archivado")
    .or(`fecha_ultima_revision.lt.${cutoff},fecha_ultima_revision.is.null`)
    .order("fecha_ultima_revision", { ascending: true, nullsFirst: true })
    .limit(LIMIT);
  if (error) {
    console.error("Error leyendo propiedades:", error.message);
    process.exit(1);
  }
  const rows = (data ?? []) as Row[];
  console.log(`Archivadas de InmoPanama a chequear: ${rows.length} (límite ${LIMIT})`);
  console.log(`Modo: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  if (rows.length === 0) return;

  let vivas = 0;
  let muertas = 0;
  let otros = 0;
  const t0 = Date.now();

  // Procesar en batches concurrentes.
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (r) => ({ row: r, head: await headUrl(r.url_original) })),
    );
    for (const s of results) {
      if (s.status !== "fulfilled") continue;
      const { row, head } = s.value;

      if (head.kind === "vive") {
        vivas++;
        console.log(`  ✓ VIVE ${head.status} ${row.url_original}`);
        if (APPLY) {
          const nowIso = new Date().toISOString();
          const { error: upErr } = await supa
            .from("propiedades")
            .update({
              estado_anuncio: "activo",
              veces_no_encontrado: 0,
              fecha_ultima_vista: nowIso,
              fecha_ultima_revision: nowIso,
              motivo_estado: "reactivada manual: HEAD OK tras skip archivadas",
            })
            .eq("id", row.id);
          if (upErr) console.warn(`    ✗ update falló: ${upErr.message}`);
        }
      } else if (head.kind === "muerta") {
        muertas++;
        // Touch fecha_ultima_revision para no volver a chequearla en 14 días.
        if (APPLY) {
          await supa
            .from("propiedades")
            .update({ fecha_ultima_revision: new Date().toISOString() })
            .eq("id", row.id);
        }
      } else {
        otros++;
      }
    }
    if ((i + CONCURRENCY) % 100 === 0 || i + CONCURRENCY >= rows.length) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(
        `  [${Math.min(i + CONCURRENCY, rows.length)}/${rows.length}] ${elapsed}s | vivas=${vivas} muertas=${muertas} otros=${otros}`,
      );
    }
    await sleep(JITTER_MS);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(
    `\nResumen (${elapsed}s): vivas=${vivas} muertas=${muertas} otros=${otros}`,
  );
  if (vivas > 0 && !APPLY) {
    console.log("(dry-run — re-correr con --apply para reactivar)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
