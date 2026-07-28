/**
 * Detector de duplicados cross-source.
 *
 * Por qué: una misma propiedad puede publicarse en E24 + ACOBIR + MLS +
 * InmoPanama (broker la sube a varios portales). Sin dedupe, el mapa
 * muestra el mismo inmueble 4 veces en pines casi-superpuestos.
 *
 * Estrategia (fuzzy geo + físico):
 *   1. Trae todas las propiedades 'activo' con lat/lng válida.
 *   2. Bucketing por celda ~111m (lat,lng rounded *1000) + 8 vecinas.
 *   3. Para cada par candidato, evalúa:
 *      - distancia haversine < 50m
 *      - misma categoria y misma operacion (estricto)
 *      - area_m2 dentro de ±5% (si ambas no-null)
 *      - precio dentro de ±10% (si ambos no-null)
 *      - si faltan área Y precio → descarta (muy arriesgado)
 *   4. Union-find para closure transitivo (A↔B, B↔C → grupo {A,B,C}).
 *   5. Por cada grupo, elige canónica via SOURCE_PRIORITY; los demás
 *      quedan en `propiedades_duplicados`.
 *
 * Idempotente: wipe + rebuild en cada corrida. La tabla es pequeña
 * (cientos de filas) y nunca crece sin techo.
 *
 * Uso:
 *   npm run dedupe         → dry-run (imprime grupos, no escribe)
 *   npm run dedupe:prod    → escribe en Supabase
 */

import { config as loadEnv } from "dotenv";

import { createScraperClient } from "./supabase-admin";

loadEnv({ path: ".env.local" });
loadEnv();

// Canónica = la fuente con índice MÁS BAJO de este array.
// Si dos rows comparten fuente, gana la más vieja (created_at).
const SOURCE_PRIORITY = [
  "encuentra24",
  "acobir",
  "mlsacobir",
  "panamaequity",
  "inmopanama",
  "savitat",
];

// Umbrales ajustados 2026-07-04 tras reportes de duplicados no
// detectados. Antes: 50m/5%/10%. Problema: cada scraper cachea el
// mismo edificio con coord ligeramente distinta (60-90m aparte por
// variabilidad del web-search) y brokers listan el mismo apto a
// precios ligeramente diferentes. Umbrales más flexibles = más
// grupos detectados sin generar falsos positivos (siempre exigimos
// mismo tipo_operacion + categoria + al menos área o precio).
const MAX_DIST_M = 100;
const MAX_AREA_PCT = 0.08; // ±8%
const MAX_PRECIO_PCT = 0.15; // ±15%

const WRITE = process.argv.includes("--supabase");

type Prop = {
  id: string;
  lat: number;
  lng: number;
  area_m2: number | null;
  precio: number | null;
  habitaciones: number | null;
  tipo_operacion: string;
  categoria: string;
  fuente_id: string;
  created_at: string;
};

function haversine(a: Prop, b: Prop): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

type Match = { score: number; motivo: string } | null;

function matches(a: Prop, b: Prop): Match {
  if (a.tipo_operacion !== b.tipo_operacion) return null;
  if (a.categoria !== b.categoria) return null;

  // Filtro estricto por habitaciones: si AMBOS tienen dato y son
  // distintas, no pueden ser el mismo inmueble aunque compartan coord,
  // área y precio (caso típico: pisos distintos del mismo edificio con
  // precio y área similares). Si uno o los dos son null, no bloquea
  // (soft-match — muchos scrapers no siempre extraen habitaciones).
  //
  // Sin este filtro veíamos 2-hab agrupado con 3-hab en Costa del Este
  // porque la coord era del edificio y el precio caía dentro del ±15%.
  if (
    a.habitaciones != null &&
    b.habitaciones != null &&
    a.habitaciones !== b.habitaciones
  ) {
    return null;
  }

  const dist = haversine(a, b);
  if (dist > MAX_DIST_M) return null;

  // Necesitamos al menos uno de los dos (área o precio) para confirmar.
  const tieneArea = a.area_m2 != null && b.area_m2 != null;
  const tienePrecio = a.precio != null && b.precio != null;
  if (!tieneArea && !tienePrecio) return null;

  const motivos: string[] = ["geo"];
  let scoreSum = 1 - dist / MAX_DIST_M;
  let scoreCount = 1;

  if (tieneArea) {
    const diff = Math.abs(a.area_m2! - b.area_m2!) / Math.max(a.area_m2!, b.area_m2!);
    if (diff > MAX_AREA_PCT) return null;
    motivos.push("area");
    scoreSum += 1 - diff / MAX_AREA_PCT;
    scoreCount++;
  }

  if (tienePrecio) {
    const diff = Math.abs(a.precio! - b.precio!) / Math.max(a.precio!, b.precio!);
    if (diff > MAX_PRECIO_PCT) return null;
    motivos.push("precio");
    scoreSum += 1 - diff / MAX_PRECIO_PCT;
    scoreCount++;
  }

  return { score: scoreSum / scoreCount, motivo: motivos.join("+") };
}

// Union-find sobre índices del array de props.
class UnionFind {
  parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    if (this.parent[x] === x) return x;
    this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

function priorityIndex(fuente: string): number {
  const i = SOURCE_PRIORITY.indexOf(fuente);
  return i === -1 ? 999 : i;
}

function elegirCanonica(props: Prop[]): Prop {
  // Menor prioridad de fuente gana; empate → menor created_at.
  return props.slice().sort((a, b) => {
    const pa = priorityIndex(a.fuente_id);
    const pb = priorityIndex(b.fuente_id);
    if (pa !== pb) return pa - pb;
    return a.created_at.localeCompare(b.created_at);
  })[0];
}

async function main() {
  const supa = createScraperClient();

  // Trae todas las activas con lat/lng (las archivadas no nos importan).
  // Supabase JS pagina a 1000 por defecto — iteramos con .range() hasta
  // que devuelve menos de PAGE_SIZE.
  const PAGE_SIZE = 1000;
  const all: Prop[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supa
      .from("propiedades")
      .select(
        "id, lat, lng, area_m2, precio, habitaciones, tipo_operacion, categoria, fuente_id, created_at",
      )
      .eq("estado_anuncio", "activo")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("Error leyendo propiedades:", error.message);
      process.exit(1);
    }
    const batch = (data ?? []) as Prop[];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const props = all.filter((p) => p.lat != null && p.lng != null);
  console.log(`Analizando ${props.length} propiedades activas.`);

  // Bucket por celda ~111m. lat*1000 ≈ 111m por unidad; lng*1000 cerca
  // del ecuador ≈ 111m también. En Panamá (lat ~9°), lng se contrae
  // a ~110m — diferencia despreciable.
  const buckets = new Map<string, number[]>();
  const bkey = (lat: number, lng: number) =>
    `${Math.round(lat * 1000)}:${Math.round(lng * 1000)}`;

  props.forEach((p, i) => {
    const k = bkey(p.lat, p.lng);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(i);
  });

  const uf = new UnionFind(props.length);
  const edges = new Map<string, { score: number; motivo: string }>(); // "i:j" → meta

  // Para cada prop, candidatos = misma celda + 8 vecinas. Cap el trabajo
  // a O(n × densidad_local). En zonas con muchas props (Costa del Este,
  // Punta Pacífica) habrá más comparaciones, pero sigue siendo manejable.
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    const lat = Math.round(p.lat * 1000);
    const lng = Math.round(p.lng * 1000);
    for (let dlat = -1; dlat <= 1; dlat++) {
      for (let dlng = -1; dlng <= 1; dlng++) {
        const k = `${lat + dlat}:${lng + dlng}`;
        const candidates = buckets.get(k);
        if (!candidates) continue;
        for (const j of candidates) {
          if (j <= i) continue; // evita (i,j) y (j,i)
          const m = matches(p, props[j]);
          if (m) {
            uf.union(i, j);
            edges.set(`${i}:${j}`, m);
          }
        }
      }
    }
  }

  // Agrupa por raíz.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < props.length; i++) {
    const root = uf.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }

  // Solo los grupos con ≥2 miembros tienen duplicados.
  const duplicados: Array<{
    propiedad_id: string;
    canonica_id: string;
    score: number;
    motivo: string;
  }> = [];

  let gruposConDup = 0;
  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    gruposConDup++;

    const miembros = indices.map((i) => props[i]);
    const canonica = elegirCanonica(miembros);

    for (const m of miembros) {
      if (m.id === canonica.id) continue;
      // Busca el edge más fuerte del miembro a CUALQUIER otro del grupo.
      // (Usamos eso como score del par; el motivo viene del mismo edge.)
      let best = { score: 0, motivo: "geo" };
      for (const other of miembros) {
        if (other.id === m.id) continue;
        const i = props.indexOf(m);
        const j = props.indexOf(other);
        const key = i < j ? `${i}:${j}` : `${j}:${i}`;
        const edge = edges.get(key);
        if (edge && edge.score > best.score) best = edge;
      }
      duplicados.push({
        propiedad_id: m.id,
        canonica_id: canonica.id,
        score: Math.round(best.score * 1000) / 1000,
        motivo: best.motivo,
      });
    }
  }

  console.log(
    `Grupos con duplicados: ${gruposConDup}. Filas marcadas como duplicado: ${duplicados.length}.`,
  );

  // Sample para inspección.
  if (duplicados.length > 0) {
    console.log("\nMuestra (5 primeros):");
    duplicados.slice(0, 5).forEach((d) => {
      const dup = props.find((p) => p.id === d.propiedad_id)!;
      const can = props.find((p) => p.id === d.canonica_id)!;
      console.log(
        `  ${dup.fuente_id} → ${can.fuente_id} | ${d.motivo} | score=${d.score} | ${dup.categoria}/${dup.tipo_operacion}`,
      );
    });
  }

  if (!WRITE) {
    console.log("\n(dry-run — usa --supabase para escribir)");
    return;
  }

  // Wipe + rebuild. La PK en propiedad_id no admite duplicados; con
  // wipe garantizamos que un cambio de canónica entre corridas no deje
  // filas huérfanas.
  const { error: delErr } = await supa
    .from("propiedades_duplicados")
    .delete()
    .neq("propiedad_id", "00000000-0000-0000-0000-000000000000"); // delete all
  if (delErr) {
    console.error("Error limpiando tabla:", delErr.message);
    process.exit(1);
  }

  if (duplicados.length === 0) {
    console.log("Sin duplicados que escribir.");
    return;
  }

  // Insert en chunks para no exceder límites del API.
  const CHUNK = 500;
  for (let i = 0; i < duplicados.length; i += CHUNK) {
    const slice = duplicados.slice(i, i + CHUNK);
    const { error: insErr } = await supa
      .from("propiedades_duplicados")
      .insert(slice);
    if (insErr) {
      console.error(`Error insertando chunk ${i}:`, insErr.message);
      process.exit(1);
    }
  }
  console.log(`✓ ${duplicados.length} duplicados escritos en Supabase.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
