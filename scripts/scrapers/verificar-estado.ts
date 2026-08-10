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
// Antes usábamos "encuentra24" como workaround del FK — ensuciaba las
// métricas de encuentra24. Ahora "verify" es una fila propia en
// `fuentes` (migration 0018) para que las corridas de este job sean
// distinguibles en scraper_runs.
const FUENTE_ID = "verify";

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

// H6: sostener N corridas consecutivas con error transitorio antes de
// mover a "error_verificacion". Antes: primer 403 movía el estado y
// como el 403 persistía, la fila quedaba en error_verificacion sin
// salida (perdíamos estado "activo" legítimo por un bloqueo de red).
const THRESH_ERROR_CONSECUTIVO = 3;

// Para no martillar la fuente: delay entre requests.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min = 1200, max = 2400) =>
  sleep(min + Math.floor(Math.random() * (max - min)));

// Timeout por request. encuentra24 normalmente responde en <2s.
const FETCH_TIMEOUT_MS = 15_000;

// Concurrencia del pase de verify.
// 2026-07-09: bajado de 5 → 2 después de que concurrency 5 archivara
// masivamente props válidas de Panama Equity y Savitat (58→4, 90→14).
// 2026-07-16: subido de 2 → 3 tras estabilización. Defensas activas:
//  - Canary con circuit breaker (aborta si sospechosas > 25%)
//  - Retry con backoff en errores transitorios (network, 429, 5xx)
//  - Sitemap-based check para Savitat (evita re-fetch)
//  - Jitter 1.2-2.4s entre requests
// Ahorro esperado: verify baja de ~30 min a ~20 min.
const VERIFY_CONCURRENCY = 3;

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
  veces_error_consecutivo: number | null;
  fuente_id: string;
};

type Resultado =
  | { tipo: "viva"; motivo: string }
  | { tipo: "no_encontrada"; motivo: string }
  | { tipo: "error"; motivo: string };

// ---------------- Sitemap-based check (Savitat) ----------------
// Savitat NUNCA cambia el HTML de una ficha vendida: devuelve 200 con
// el mismo JSON-LD RealEstateListing → verify siempre la marca viva y
// no se archiva por lifecycle. Solución: usar el sitemap como fuente
// de verdad. Si la URL de savitat NO está en el sitemap, la propiedad
// fue removida del inventario (equivale a muerte).
//
// Si el sitemap no se pudo descargar, savitatSitemap queda null y no
// aplicamos el check — mejor no archivar por error de red que archivar
// mal.
const SAVITAT_SITEMAP_URL = "https://savitat.com/sitemap.xml";
let savitatSitemap: Set<string> | null = null;

/**
 * Normaliza una URL de Savitat para comparación robusta contra el sitemap.
 *
 * H5 fix: antes solo hacíamos `replace(/\/$/, "")` (drop trailing slash).
 * Un cambio de formato del sitemap (agregar www, cambiar http→https,
 * agregar utm, uppercase en el slug) archivaba 100+ propiedades vivas
 * porque el `.has()` fallaba por diferencia cosmética.
 *
 * Ahora normalizamos ambos lados idénticamente:
 *   - protocolo → https
 *   - hostname → lowercase, sin www.
 *   - pathname → lowercase, decode URI, sin trailing slash
 *   - query + fragment → descartados
 *
 * Si la URL no parsea, devuelve la original (comparación cruda).
 */
function normalizeSavitatUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = decodeURI(u.pathname).toLowerCase().replace(/\/+$/, "");
    return `https://${host}${path}`;
  } catch {
    return raw.trim();
  }
}

async function loadSavitatSitemap(): Promise<Set<string> | null> {
  try {
    const res = await fetch(SAVITAT_SITEMAP_URL, {
      headers: { "user-agent": USER_AGENT, accept: "application/xml,text/xml" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const xml = await res.text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((m) => normalizeSavitatUrl(m[1]))
      .filter((u) => u.includes("savitat.com/properties/"));
    if (urls.length < 20) return null; // sanity check
    return new Set(urls);
  } catch {
    return null;
  }
}

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
 *
 * Retry (fix 2026-07-11): si el error es transitorio (network, timeout,
 * 429, 5xx), reintentamos hasta MAX_ATTEMPTS con backoff + jitter. Antes,
 * ráfagas de "fetch failed" (típico rate-limit de Savitat) contaban como
 * errores → 14 URLs/1000 en la corrida de prueba. Con retry esperamos
 * dejar solo los errores reales (server abajo, DNS caído).
 */
const MAX_ATTEMPTS = 3;

async function verificar(url: string): Promise<Resultado> {
  let last: Resultado = { tipo: "error", motivo: "sin intento" };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await verificarUnaVez(url);
    if (last.tipo !== "error") return last;
    // Solo retry cuando el error es transitorio.
    const transient = /timeout|fetch failed|ECONN|HTTP 5\d\d|HTTP 429/i.test(last.motivo);
    if (!transient) return last;
    if (attempt < MAX_ATTEMPTS) {
      // Backoff creciente + jitter: 2-4s → 4-8s.
      const base = 2000 * attempt;
      await sleep(base + Math.floor(Math.random() * base));
    }
  }
  return last;
}

async function verificarUnaVez(url: string): Promise<Resultado> {
  // Sitemap check para Savitat: si tenemos el sitemap descargado y la
  // URL no aparece, es muerte legítima (el sitio no cambia el HTML de
  // vendidas — sin este check nunca se archivan).
  if (savitatSitemap && url.includes("savitat.com/properties/")) {
    // H5: normalización simétrica en ambos lados (ver normalizeSavitatUrl).
    const hit = savitatSitemap.has(normalizeSavitatUrl(url));
    if (!hit) {
      return { tipo: "no_encontrada", motivo: "savitat: no en sitemap" };
    }
  }
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
      // Consideramos "viva" si el redirect es a otro detalle:
      //  - path incluye un patrón de detail (/propiedades/, /listings/, etc.)
      //    Y tiene un ID de al menos 4 dígitos.
      // Consideramos "no_encontrada" si redirige a listado/home/prop_unavailable.
      // Fix 2026-07-11: el regex antes exigía \d{6,} pero MLS Acobir usa IDs
      // de 5 dígitos — todos sus 301 (cambio de slug) caían como
      // no_encontrada y disparaban el canary.
      const isDetailRedirect =
        /\/(propiedades|listings|properties|propiedad|proyecto)\//i.test(loc) &&
        /\d{4,}/.test(loc);
      const isUnavailable = /prop_unavailable|removed|deleted|not[-_]?found/i.test(loc);
      if (isUnavailable) {
        return { tipo: "no_encontrada", motivo: `redirect a ${loc.slice(0, 80)}` };
      }
      if (isDetailRedirect) {
        return { tipo: "viva", motivo: `redirect mantiene detail` };
      }
      return { tipo: "no_encontrada", motivo: `redirect a ${loc.slice(0, 80)}` };
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
    // 1) JSON-LD @type de Product / RealEstate — encuentra24, acobir usan
    //    "Product"; panamaequity y savitat usan "RealEstateListing" (tema
    //    RealHomes de WordPress). Antes del fix 2026-07-11 solo aceptábamos
    //    "Product" → ambas fuentes daban "sin Product/microdata" (100%
    //    falsos negativos, disparaba el canary).
    // 2) Schema.org microdata para tipos inmobiliarios — mlsacobir usa
    //    itemtype="http://schema.org/SingleFamilyResidence".
    // NO usamos heurísticas de "captcha" en el body: el HTML legítimo
    // de encuentra24 contiene "recaptchaSiteKey" (config del form de
    // contacto), lo que generaba falsos positivos en el 100% de las
    // páginas reales. Si hay un challenge real, vendrá con 403/503 o
    // sin marker de real-estate — ambos casos ya quedan cubiertos.
    const REAL_ESTATE_TYPES =
      "Product|Apartment|House|SingleFamilyResidence|Residence|Place|RealEstate|RealEstateListing|Accommodation|Offer";
    if (
      new RegExp(`"@type"\\s*:\\s*"(${REAL_ESTATE_TYPES})"`).test(html)
    ) {
      return { tipo: "viva", motivo: "JSON-LD real-estate OK" };
    }
    if (
      new RegExp(
        `itemtype=["'][^"']*schema\\.org\\/(${REAL_ESTATE_TYPES})\\b`,
        "i",
      ).test(html)
    ) {
      return { tipo: "viva", motivo: "Microdata Schema.org OK" };
    }
    // Fallback dominio-específico para portales sin JSON-LD/microdata.
    // Fix 2026-07-11: reemplazo del heurístico débil (title + tamaño) por
    // markers del template de detail. El anterior era vulnerable — cualquier
    // página del sitio con el nombre en el <title> pasaba como viva.
    //
    // Estructura: `anchors` son markers EXCLUSIVOS del template de detail
    // (no aparecen en listado/home). `support` son adicionales de la ficha.
    // Regla: ≥1 anchor + ≥1 support total (o ≥2 anchors) → viva. Esto
    // rechaza al listado principal (tiene ib-prop-* y gallery pero NO
    // data-property-id ni og:type=product).
    const domainProfiles: Array<{
      host: string;
      anchors: Array<{ name: string; re: RegExp }>;
      support: Array<{ name: string; re: RegExp }>;
    }> = [
      {
        host: "inmopanama.com",
        anchors: [
          // og:type=product solo en fichas (listado usa website).
          { name: "og:type=product", re: /property=["']og:type["']\s+content=["']product/i },
          // ID interno del CMS. Solo en templates de propiedad.
          { name: "data-property-id", re: /data-property-id=["']\d+/i },
        ],
        support: [
          // Prefijo de clases del template — también en cards del listado,
          // pero como ancla ya restringe, este solo confirma.
          { name: "ib-prop-*", re: /class=["'][^"']*ib-prop-/i },
          // Carrusel/galería de la ficha. En el shell/error no está.
          {
            name: "gallery",
            re: /class=["'][^"']*(gallery|carousel|swiper|prop-slider)/i,
          },
        ],
      },
    ];
    for (const { host, anchors, support } of domainProfiles) {
      if (url.toLowerCase().includes(host)) {
        const anchorHits = anchors.filter((m) => m.re.test(html));
        const supportHits = support.filter((m) => m.re.test(html));
        const hasAnchor = anchorHits.length >= 1;
        const hasCorroboration = anchorHits.length >= 2 || supportHits.length >= 1;
        if (hasAnchor && hasCorroboration) {
          const names = [...anchorHits, ...supportHits].map((h) => h.name).join(",");
          return { tipo: "viva", motivo: `${host}: ${names}` };
        }
        return {
          tipo: "no_encontrada",
          motivo: `${host}: anchors=${anchorHits.length} support=${supportHits.length} size=${Math.round(html.length / 1024)}KB`,
        };
      }
    }
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
    .select("id, url_original, estado_anuncio, veces_no_encontrado, veces_error_consecutivo, fuente_id")
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

  // Precarga del sitemap de Savitat (opcional: si falla, continuamos sin
  // el check). Se hace UNA vez y sirve para todas las URLs de savitat.
  savitatSitemap = await loadSavitatSitemap();
  if (savitatSitemap) {
    console.log(`✓ Sitemap Savitat cargado: ${savitatSitemap.size} URLs`);
  } else {
    console.log("⚠ No se pudo cargar sitemap de Savitat — check omitido");
  }

  // ---------------- CANARY (circuit breaker) ----------------
  const canary = makeCanarySample(pendientes);
  console.log(`\n▶ Canary: ${canary.length} URLs (recientes + antiguas + aleatorias)`);
  const canarySamples: Array<{
    url: string;
    fuente_id: string;
    tipo: "viva" | "no_encontrada" | "error";
    motivo: string;
  }> = [];
  await chunkedParallel(canary, VERIFY_CONCURRENCY, async (fila) => {
    await jitter();
    const r = await verificar(fila.url_original);
    canarySamples.push({
      url: fila.url_original,
      fuente_id: fila.fuente_id,
      tipo: r.tipo,
      motivo: r.motivo,
    });
    return null;
  });
  const canaryVivas = canarySamples.filter((s) => s.tipo === "viva").length;
  const canaryNo = canarySamples.filter((s) => s.tipo === "no_encontrada").length;
  const canaryErr = canarySamples.filter((s) => s.tipo === "error").length;
  // Distinguimos "muerte legítima" (404/410/redirect a prop_unavailable/
  // page dead) de "posible bug del sitio" (200 sin Product/microdata,
  // HTML shell). Solo lo segundo cuenta como sospechoso — el circuit
  // breaker solo debe activarse contra bugs del sitio, no contra
  // props reales que están archivadas y hay que procesar.
  const sospechosas = canarySamples.filter((s) => {
    if (s.tipo !== "no_encontrada") return false;
    const m = s.motivo.toLowerCase();
    if (/^http (?:404|410)/.test(m)) return false;
    if (/prop_unavailable/.test(m)) return false;
    return /sin product|microdata|title=false|shell/.test(m) || !/redirect|http/.test(m);
  }).length;
  const noRatio = canary.length > 0 ? canaryNo / canary.length : 0;
  const suspRatio = canary.length > 0 ? sospechosas / canary.length : 0;
  console.log(
    `  Canary result: vivas=${canaryVivas} no_encontradas=${canaryNo} (sospechosas=${sospechosas}) errores=${canaryErr}`,
  );
  console.log(
    `  Total no_encontrada: ${(noRatio * 100).toFixed(1)}% | Sospechosas (bug potencial): ${(suspRatio * 100).toFixed(1)}%`,
  );
  // Desglose por fuente (útil para saber si el problema es un solo portal)
  const desglose: Record<string, Record<string, number>> = {};
  for (const s of canarySamples) {
    desglose[s.fuente_id] = desglose[s.fuente_id] ?? {};
    desglose[s.fuente_id][s.tipo] = (desglose[s.fuente_id][s.tipo] ?? 0) + 1;
  }
  console.log("  Por fuente:");
  for (const [f, e] of Object.entries(desglose)) {
    const total = Object.values(e).reduce((a, b) => a + b, 0);
    const no = e.no_encontrada ?? 0;
    console.log(`    ${f.padEnd(15)} ${JSON.stringify(e)} → ${((no / total) * 100).toFixed(0)}% no_encontrada`);
  }

  // Log de detalle: muestra 8 URLs no_encontrada para debug
  const falsos = canarySamples.filter((s) => s.tipo === "no_encontrada");
  if (falsos.length > 0) {
    console.log("  Muestra no_encontrada:");
    for (const f of falsos.slice(0, 8)) {
      console.log(`    [${f.fuente_id}] ${f.motivo} — ${f.url.slice(0, 80)}`);
    }
  }

  if (suspRatio > CANARY_NO_ENCONTRADA_MAX_RATIO) {
    // Ranking de fuentes por ratio de sospechosas (no cualquier
    // no_encontrada — muerte legítima no cuenta para el diagnóstico).
    const susPorFuente: Record<string, { total: number; susp: number }> = {};
    for (const s of canarySamples) {
      susPorFuente[s.fuente_id] = susPorFuente[s.fuente_id] ?? { total: 0, susp: 0 };
      susPorFuente[s.fuente_id].total++;
      if (s.tipo === "no_encontrada") {
        const m = s.motivo.toLowerCase();
        const legitima =
          /^http (?:404|410)/.test(m) || /prop_unavailable/.test(m);
        if (!legitima) susPorFuente[s.fuente_id].susp++;
      }
    }
    const topFuentes = Object.entries(susPorFuente)
      .map(([f, e]) => ({ fuente: f, total: e.total, susp: e.susp, ratio: e.susp / e.total }))
      .filter((r) => r.susp > 0)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 3);

    // Elegimos hasta 3 URLs sospechosas: 1 por cada fuente del top.
    // Fetch adicional con timeout corto para capturar status + snippet
    // HTML (útil para diagnosticar shell vs bloqueo vs cambio de HTML).
    const sospechosasParaSnippet = topFuentes
      .map((tf) =>
        canarySamples.find(
          (s) =>
            s.fuente_id === tf.fuente &&
            s.tipo === "no_encontrada" &&
            !/^http (?:404|410)/.test(s.motivo.toLowerCase()) &&
            !/prop_unavailable/.test(s.motivo.toLowerCase()),
        ),
      )
      .filter((s): s is (typeof canarySamples)[number] => Boolean(s));

    const snippets = await Promise.all(
      sospechosasParaSnippet.map(async (s) => {
        try {
          const res = await fetch(s.url, {
            headers: { "user-agent": USER_AGENT, accept: "text/html" },
            signal: AbortSignal.timeout(8_000),
            redirect: "manual",
          });
          let body = "";
          if (res.status >= 200 && res.status < 300) {
            const full = await res.text();
            body = full.slice(0, 500).replace(/\s+/g, " ");
          }
          return {
            url: s.url,
            fuente: s.fuente_id,
            motivo: s.motivo,
            status: res.status,
            location: res.headers.get("location") ?? "",
            body,
          };
        } catch (err) {
          return {
            url: s.url,
            fuente: s.fuente_id,
            motivo: s.motivo,
            status: 0,
            location: "",
            body: `[fetch failed: ${(err as Error).message}]`,
          };
        }
      }),
    );

    const rankMd =
      topFuentes.length > 0
        ? [
            "",
            "## Top fuentes por ratio de sospechosas",
            "| Fuente | Total | Sospechosas | Ratio |",
            "|---|---|---|---|",
            ...topFuentes.map(
              (t) => `| ${t.fuente} | ${t.total} | ${t.susp} | ${(t.ratio * 100).toFixed(0)}% |`,
            ),
          ].join("\n")
        : "";

    const snippetMd =
      snippets.length > 0
        ? [
            "",
            "## Muestras sospechosas (1 por fuente)",
            ...snippets.map((sn) =>
              [
                "",
                `### ${sn.fuente} — HTTP ${sn.status}${sn.location ? ` → ${sn.location.slice(0, 80)}` : ""}`,
                `- URL: ${sn.url}`,
                `- Motivo del verify: \`${sn.motivo}\``,
                sn.body
                  ? "- HTML snippet (primeros 500 chars, whitespace colapsado):"
                  : "",
                sn.body ? "```" : "",
                sn.body ? sn.body : "",
                sn.body ? "```" : "",
              ]
                .filter(Boolean)
                .join("\n"),
            ),
          ].join("\n")
        : "";

    const body = [
      `Circuit breaker en verify: la muestra canary tuvo ${(suspRatio * 100).toFixed(1)}% de sospechosas (bug potencial del sitio) — umbral ${(CANARY_NO_ENCONTRADA_MAX_RATIO * 100).toFixed(0)}%.`,
      "",
      `Muestra: ${canary.length} URLs (recientes + antiguas + aleatorias).`,
      `- vivas: ${canaryVivas}`,
      `- no_encontradas: ${canaryNo}`,
      `- errores: ${canaryErr}`,
      "",
      "**Verify ABORTADO** — no se aplicaron cambios de estado ni contadores. La causa más probable es que uno o varios portales están devolviendo HTML shell (sin JSON-LD) por problema transitorio o por cambio del template.",
      rankMd,
      snippetMd,
      "",
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
        veces_error_consecutivo: 0,
        fecha_ultima_vista: ahoraIso,
        fecha_ultima_revision: ahoraIso,
        motivo_estado: `verificado activo (${r.motivo})`,
      };
      vivas++;
    } else if (r.tipo === "no_encontrada") {
      // H18: cap en THRESH_ARCHIVADO. Antes: filas archivadas seguían
      // subiendo el contador (veces=15, 200, 999) sin sentido —
      // el estado ya no puede escalar más allá de "archivado".
      const veces = Math.min(
        THRESH_ARCHIVADO,
        (fila.veces_no_encontrado ?? 0) + 1,
      );
      const estado = nuevoEstado(veces);
      update = {
        estado_anuncio: estado,
        veces_no_encontrado: veces,
        veces_error_consecutivo: 0,
        fecha_ultima_revision: ahoraIso,
        motivo_estado: `${r.motivo} (fallo ${veces})`,
      };
      noEncontradas++;
      if (estado === "archivado") archivadas++;
      else if (estado === "posible_inactivo") posiblesInactivas++;
    } else {
      // H6: no escalamos a error_verificacion en el primer error.
      // Sostener N corridas consecutivas con error transitorio antes
      // de mover el estado — un 403 aislado no debe borrar "activo".
      const errores = (fila.veces_error_consecutivo ?? 0) + 1;
      const escala = errores >= THRESH_ERROR_CONSECUTIVO;
      update = {
        estado_anuncio: escala ? "error_verificacion" : fila.estado_anuncio,
        veces_error_consecutivo: errores,
        fecha_ultima_revision: ahoraIso,
        motivo_estado: escala
          ? `error: ${r.motivo} (${errores} corridas consecutivas)`
          : `error transitorio: ${r.motivo} (${errores}/${THRESH_ERROR_CONSECUTIVO})`,
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
        archived: archivadas,
        notes: `verificar-estado | vivas:${vivas} no_encontradas:${noEncontradas} errores:${erroresVerificacion} archivadas:${archivadas} posibles:${posiblesInactivas}`,
      })
      .eq("id", runId);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
