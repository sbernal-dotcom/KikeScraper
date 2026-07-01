/**
 * Archiva propiedades cuya coord actual cae en el mar según el check
 * de tierra/mar (src/lib/geo/panama-land.ts).
 *
 * No borra ni tira la coord (schema tiene lat/lng NOT NULL): solo setea
 * estado_anuncio='archivado' + motivo_estado='pin_en_mar'. El frontend
 * filtra estado_anuncio='activo' → desaparece del mapa igual. La coord
 * queda como histórico para debug.
 *
 * Idempotente y seguro de correr repetidamente.
 *
 * También limpia las filas de `edificios_cache` cuya coord caiga en mar
 * — evita que el cache siga sirviendo la misma coord mala en próximos
 * lookups. Marca la fila como 'sin_resultado' para que el pipeline
 * intente re-buscar cuando pase el TTL.
 *
 * Uso:
 *   npm run archivar-en-mar          (dry-run)
 *   npm run archivar-en-mar:apply    (aplica)
 */

import { config as loadEnv } from "dotenv";

import { isOnLand } from "../../src/lib/geo/panama-land";
import { createScraperClient } from "./supabase-admin";

loadEnv({ path: ".env.local" });
loadEnv();

const APPLY = process.argv.includes("--apply");
const PAGE = 1000;

type Prop = {
  id: string;
  titulo: string | null;
  lat: number;
  lng: number;
  fuente_id: string;
};

type CacheRow = {
  id: string;
  nombre_original: string;
  lat: number;
  lng: number;
  source: string;
};

async function main() {
  const supa = createScraperClient();

  // 1. Propiedades activas con coord en mar.
  const props: Prop[] = [];
  {
    let from = 0;
    while (true) {
      const { data, error } = await supa
        .from("propiedades")
        .select("id, titulo, lat, lng, fuente_id")
        .eq("estado_anuncio", "activo")
        .not("lat", "is", null)
        .range(from, from + PAGE - 1);
      if (error) {
        console.error(error);
        process.exit(1);
      }
      if (!data || data.length === 0) break;
      props.push(...(data as Prop[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  const enMar = props.filter((p) => !isOnLand(p.lat, p.lng));
  console.log(`Activas: ${props.length} | en mar: ${enMar.length}`);
  for (const p of enMar) {
    console.log(
      `  [${p.fuente_id}] (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}) ${(p.titulo ?? "").slice(0, 60)}`,
    );
  }

  // 2. Edificios cache con coord en mar.
  const badCache: CacheRow[] = [];
  {
    let from = 0;
    while (true) {
      const { data, error } = await supa
        .from("edificios_cache")
        .select("id, nombre_original, lat, lng, source")
        .not("lat", "is", null)
        .range(from, from + PAGE - 1);
      if (error) {
        console.error(error);
        process.exit(1);
      }
      if (!data || data.length === 0) break;
      for (const row of data as CacheRow[]) {
        if (!isOnLand(row.lat, row.lng)) badCache.push(row);
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }
  console.log(`\nCache edificios con coord: revisadas | en mar: ${badCache.length}`);
  for (const c of badCache.slice(0, 10)) {
    console.log(
      `  (${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}) ${c.nombre_original} [${c.source}]`,
    );
  }

  if (!APPLY) {
    console.log("\nDry-run. Corre con --apply para escribir.");
    return;
  }

  const ahora = new Date().toISOString();

  // Archivar props
  let archivadas = 0;
  for (const p of enMar) {
    const { error } = await supa
      .from("propiedades")
      .update({
        estado_anuncio: "archivado",
        motivo_estado: "pin_en_mar (validación tierra/mar)",
        fecha_ultima_revision: ahora,
      })
      .eq("id", p.id);
    if (error) {
      console.warn(`  ✗ ${p.id}: ${error.message}`);
    } else {
      archivadas++;
    }
  }

  // Limpiar cache (marcar como sin_resultado para forzar re-búsqueda)
  let cacheLimpiadas = 0;
  for (const c of badCache) {
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
      .eq("id", c.id);
    if (error) {
      console.warn(`  ✗ cache ${c.id}: ${error.message}`);
    } else {
      cacheLimpiadas++;
    }
  }

  console.log(`\n✓ Archivadas: ${archivadas} | Cache limpiadas: ${cacheLimpiadas}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
