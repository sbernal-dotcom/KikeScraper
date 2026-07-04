/**
 * Limpia entries de `edificios_cache` cuya coord está compartida por
 * MÁS DE UN edificio. Ese patrón indica que el sitio-fuente devolvió
 * una coord genérica (del barrio, de su propia página home, etc.) en
 * vez de la coord real del edificio buscado.
 *
 * Casos concretos que este script detecta (2026-07-04):
 *   - gogetit.com.pa usa (9.0233, -79.4986) como default para 24
 *     edificios en barrios completamente distintos
 *   - wikipedia.org da (9.0124, -79.4726) para "Costa del Este" y
 *     todos los edificios que pasan por su artículo caen ahí
 *   - realtor.com da (9.0132, -79.4681) para 9 edificios distintos
 *     de Costa del Este
 *
 * Acción:
 *   1. Marca las entries de cache como source='sin_resultado' con
 *      last_attempt_at reciente → el pipeline las re-buscará en la
 *      próxima corrida sin usar la coord falsa.
 *   2. Archiva las propiedades activas que apuntan a esas coords con
 *      motivo_estado='coord_falsa (compartida por N edificios)'. El
 *      cron siguiente intentará re-scrapearlas con el fix en
 *      buscar-edificio-web.ts (que ahora bloquea gogetit/wikipedia/etc).
 *
 * Uso:
 *   npm run limpiar-cache-duplicado          (dry-run)
 *   npm run limpiar-cache-duplicado:apply    (aplica)
 */

import { config as loadEnv } from "dotenv";

import { createScraperClient } from "./supabase-admin";

loadEnv({ path: ".env.local" });
loadEnv();

const APPLY = process.argv.includes("--apply");
const PAGE = 1000;

// Dominios que sabemos que dan coord genérica (barrio/artículo) en
// vez de coord del edificio. Cache entries con source_url en estos
// dominios se invalidan siempre, sin importar si están duplicados.
// Match parcial (substring case-insensitive) — cubre subdominios.
const DOMAINS_ALWAYS_INVALIDATE = [
  "wikipedia.org",
  "wikipedia.com",
  "gogetit.com",
  "laaparq.com",
];

type CacheRow = {
  id: string;
  nombre_norm: string;
  nombre_original: string;
  lat: number;
  lng: number;
  source: string;
  source_url: string | null;
};

async function main() {
  const supa = createScraperClient();
  const ahora = new Date().toISOString();

  // 1. Cargar TODAS las entries de cache con coord
  const all: CacheRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supa
      .from("edificios_cache")
      .select("id, nombre_norm, nombre_original, lat, lng, source, source_url")
      .not("lat", "is", null)
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(error);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    all.push(...(data as CacheRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`Cache con coord: ${all.length}`);

  // 2. Categoría A: entries con dominio blacklist en source_url.
  //    Invalidar siempre — sabemos que dan coord genérica.
  const domainBlacklisted: CacheRow[] = [];
  for (const row of all) {
    const url = (row.source_url ?? "").toLowerCase();
    if (DOMAINS_ALWAYS_INVALIDATE.some((d) => url.includes(d))) {
      domainBlacklisted.push(row);
    }
  }
  console.log(`\nA) Cache con source_url en dominio blacklist: ${domainBlacklisted.length}`);
  const blDomains: Record<string, number> = {};
  for (const r of domainBlacklisted) {
    const m = r.source_url?.match(/^https?:\/\/([^/]+)/);
    const dom = m?.[1] ?? "?";
    blDomains[dom] = (blDomains[dom] ?? 0) + 1;
  }
  for (const [d, n] of Object.entries(blDomains).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${d.padEnd(30)} ${n}`);
  }

  // 3. Categoría B: coords compartidas por >1 source_url distinto.
  //    Distintos source_urls → probablemente coord genérica del área.
  //    Si TODOS los source_urls son iguales → mismo edificio con
  //    nombres variantes (Yoo, Yoo&Arts) → NO invalidar.
  const byCoord = new Map<string, CacheRow[]>();
  for (const row of all) {
    const key = `${row.lat.toFixed(4)}__${row.lng.toFixed(4)}`;
    if (!byCoord.has(key)) byCoord.set(key, []);
    byCoord.get(key)!.push(row);
  }

  const genericCoord: CacheRow[] = [];
  const genericSample: Array<{ key: string; urls: number; rows: CacheRow[] }> = [];
  for (const [key, rows] of byCoord) {
    // Comparar por source_url normalizado (sin query/hash)
    const urlSet = new Set(
      rows.map((r) =>
        (r.source_url ?? "").split(/[?#]/)[0].replace(/\/$/, "").toLowerCase(),
      ),
    );
    if (urlSet.size >= 2) {
      genericCoord.push(...rows);
      genericSample.push({ key, urls: urlSet.size, rows });
    }
  }
  console.log(
    `\nB) Coords compartidas por >1 source_url distinto: ${genericSample.length} clusters (${genericCoord.length} entries)`,
  );
  genericSample.sort((a, b) => b.urls - a.urls);
  for (const c of genericSample.slice(0, 8)) {
    console.log(`\n  ${c.key} → ${c.urls} source_urls distintos`);
    for (const r of c.rows.slice(0, 4)) {
      console.log(`    "${r.nombre_original}" ← ${r.source_url?.slice(0, 60) ?? ""}`);
    }
    if (c.rows.length > 4) console.log(`    ...y ${c.rows.length - 4} más`);
  }

  // Compilar sin dobles (unión de A y B)
  const cacheIdsSet = new Set<string>();
  for (const r of domainBlacklisted) cacheIdsSet.add(r.id);
  for (const r of genericCoord) cacheIdsSet.add(r.id);
  const cacheIdsToInvalidate = [...cacheIdsSet];
  console.log(`\nTotal cache rows a invalidar (A ∪ B): ${cacheIdsToInvalidate.length}`);

  // 4. Encontrar propiedades activas que apuntan a esas coords.
  // Compilamos coords tanto de A (por su lat/lng) como de B (clusters).
  const coordsSet = new Set<string>();
  for (const r of domainBlacklisted) {
    coordsSet.add(`${r.lat.toFixed(4)}__${r.lng.toFixed(4)}`);
  }
  for (const c of genericSample) coordsSet.add(c.key);
  const props: {
    id: string;
    titulo: string | null;
    fuente_id: string;
    lat: number;
    lng: number;
  }[] = [];
  from = 0;
  while (true) {
    const { data, error } = await supa
      .from("propiedades")
      .select("id, titulo, fuente_id, lat, lng")
      .eq("estado_anuncio", "activo")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(error);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    for (const p of data) {
      const key = `${p.lat.toFixed(4)}__${p.lng.toFixed(4)}`;
      if (coordsSet.has(key)) props.push(p as (typeof props)[number]);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(
    `\nPropiedades activas a archivar (usan coord falsa): ${props.length}`,
  );
  const porFuente: Record<string, number> = {};
  for (const p of props) porFuente[p.fuente_id] = (porFuente[p.fuente_id] ?? 0) + 1;
  for (const [f, n] of Object.entries(porFuente).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${f.padEnd(18)} ${n}`);
  }

  if (!APPLY) {
    console.log("\nDry-run. Corre con --apply para escribir.");
    return;
  }

  // 5. Aplicar en batches
  const BATCH = 200;
  let cacheOk = 0;
  for (let i = 0; i < cacheIdsToInvalidate.length; i += BATCH) {
    const ids = cacheIdsToInvalidate.slice(i, i + BATCH);
    const { error } = await supa
      .from("edificios_cache")
      .update({
        lat: null,
        lng: null,
        source: "sin_resultado",
        source_url: null,
        confidence: null,
        last_attempt_at: ahora,
      })
      .in("id", ids);
    if (error) console.warn(`  ✗ batch cache: ${error.message}`);
    else cacheOk += ids.length;
  }

  let propsOk = 0;
  for (let i = 0; i < props.length; i += BATCH) {
    const ids = props.slice(i, i + BATCH).map((p) => p.id);
    const { error } = await supa
      .from("propiedades")
      .update({
        estado_anuncio: "archivado",
        motivo_estado: "coord_falsa (compartida entre edificios en cache)",
        fecha_ultima_revision: ahora,
      })
      .in("id", ids);
    if (error) console.warn(`  ✗ batch props: ${error.message}`);
    else propsOk += ids.length;
  }

  console.log(`\n✓ Cache invalidadas: ${cacheOk} | Props archivadas: ${propsOk}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
