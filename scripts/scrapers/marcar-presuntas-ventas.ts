/**
 * Marca propiedades como `presunta_venta = true` cuando su patrón de
 * duración sugiere que se vendieron/alquilaron.
 *
 * Regla:
 *   - `estado_anuncio = 'archivado'`
 *   - Estuvo activa ≥ DIAS_MINIMO_ACTIVA días
 *     (fecha_ultima_vista − fecha_deteccion)
 *   - Lleva ≥ DIAS_MINIMO_ARCHIVADA días sin volver a verse
 *     (now − fecha_ultima_vista)
 *
 * Razón: si murió rápido (< 30 días) es más probable pausa/re-listing.
 * Si estuvo mucho y no volvió, es más probable que se vendiera.
 *
 * También rectifica: si una prop marcada como presunta_venta reaparece
 * como activa (el vendedor la re-publicó, no era venta), limpia el flag.
 *
 * Idempotente. Solo escribe si el flag cambia.
 *
 * Uso:
 *   npm run presunta-venta          (dry-run)
 *   npm run presunta-venta:apply    (aplica)
 *   npm run presunta-venta:prod     (--apply en CI)
 */

import { config as loadEnv } from "dotenv";

import { createScraperClient } from "./supabase-admin";

loadEnv({ path: ".env.local" });
loadEnv();

const DIAS_MINIMO_ACTIVA = 30;
const DIAS_MINIMO_ARCHIVADA = 14;

const APPLY = process.argv.includes("--apply");
const PAGE = 1000;

type Fila = {
  id: string;
  titulo: string | null;
  fuente_id: string;
  estado_anuncio: string;
  fecha_deteccion: string | null;
  fecha_ultima_vista: string | null;
  presunta_venta: boolean;
};

function diasEntre(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return ms / 86_400_000;
}

async function main() {
  const supa = createScraperClient();
  const ahoraIso = new Date().toISOString();

  // Traemos TODAS (activas + archivadas + posibles_inactivos + error), para:
  //  a) marcar candidatas (archivadas que califiquen)
  //  b) rectificar: activas con presunta_venta=true → limpiar flag
  const all: Fila[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supa
      .from("propiedades")
      .select(
        "id, titulo, fuente_id, estado_anuncio, fecha_deteccion, fecha_ultima_vista, presunta_venta",
      )
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("Error leyendo propiedades:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    all.push(...(data as Fila[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  console.log(`Leídas ${all.length} propiedades. Reglas:`);
  console.log(`  - estado_anuncio = archivado`);
  console.log(`  - días activa ≥ ${DIAS_MINIMO_ACTIVA}`);
  console.log(`  - días archivada ≥ ${DIAS_MINIMO_ARCHIVADA}`);
  console.log();

  const marcar: Fila[] = [];
  const rectificar: Fila[] = [];

  for (const f of all) {
    // Rectificación: si volvió a estar activa y aún tenía el flag, limpiar.
    if (f.presunta_venta && f.estado_anuncio === "activo") {
      rectificar.push(f);
      continue;
    }

    if (f.presunta_venta) continue; // ya marcada, no hacer nada
    if (f.estado_anuncio !== "archivado") continue;

    const diasActiva = diasEntre(f.fecha_deteccion, f.fecha_ultima_vista);
    const diasArchivada = diasEntre(f.fecha_ultima_vista, ahoraIso);

    if (diasActiva === null || diasArchivada === null) continue;
    if (diasActiva < DIAS_MINIMO_ACTIVA) continue;
    if (diasArchivada < DIAS_MINIMO_ARCHIVADA) continue;

    marcar.push(f);
  }

  // Reporte
  console.log(`Candidatas a MARCAR como presunta_venta: ${marcar.length}`);
  console.log(`Candidatas a RECTIFICAR (re-activas): ${rectificar.length}`);
  console.log();

  // Distribución por fuente para saber dónde caen
  const porFuente: Record<string, number> = {};
  for (const f of marcar) {
    porFuente[f.fuente_id] = (porFuente[f.fuente_id] ?? 0) + 1;
  }
  console.log("Marcadas por fuente:");
  for (const [k, v] of Object.entries(porFuente).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${v}`);
  }
  console.log();

  // Sample para inspección
  const sample = marcar.slice(0, 5);
  if (sample.length > 0) {
    console.log("Sample (primeras 5):");
    for (const f of sample) {
      const da = diasEntre(f.fecha_deteccion, f.fecha_ultima_vista)!.toFixed(0);
      const dz = diasEntre(f.fecha_ultima_vista, ahoraIso)!.toFixed(0);
      console.log(
        `  [${f.fuente_id}] ${(f.titulo ?? "(sin título)").slice(0, 60)}  activa ${da}d, archivada ${dz}d`,
      );
    }
    console.log();
  }

  if (!APPLY) {
    console.log("Dry-run. Corre con --apply para escribir en DB.");
    return;
  }

  // Aplicar en batches para evitar timeouts.
  const BATCH = 200;
  let escritas = 0;

  for (let i = 0; i < marcar.length; i += BATCH) {
    const ids = marcar.slice(i, i + BATCH).map((f) => f.id);
    const { error } = await supa
      .from("propiedades")
      .update({
        presunta_venta: true,
        fecha_presunta_venta: ahoraIso,
      })
      .in("id", ids);
    if (error) {
      console.warn(`  ✗ batch marcar: ${error.message}`);
    } else {
      escritas += ids.length;
    }
  }

  let limpiadas = 0;
  for (let i = 0; i < rectificar.length; i += BATCH) {
    const ids = rectificar.slice(i, i + BATCH).map((f) => f.id);
    const { error } = await supa
      .from("propiedades")
      .update({
        presunta_venta: false,
        fecha_presunta_venta: null,
      })
      .in("id", ids);
    if (error) {
      console.warn(`  ✗ batch rectificar: ${error.message}`);
    } else {
      limpiadas += ids.length;
    }
  }

  console.log(`✓ Marcadas: ${escritas} | Rectificadas: ${limpiadas}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
