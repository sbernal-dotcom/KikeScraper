/**
 * Cache de URLs con geo imposible — skip para no re-consumir Groq en
 * URLs que sabemos que no van a resolver.
 *
 * Ver migración 0016_urls_fallidas_cache.sql para el diseño.
 */
import { createScraperClient } from "./supabase-admin";

// Re-intentar URLs fallidas cada 30 días (por si el sitio agregó coord
// o zonas-panama.ts recibió el corregimiento).
const RETRY_AFTER_DAYS = 30;

/**
 * Trae el set de URLs a saltar para una fuente. Retorna set vacío en
 * caso de error (fail-open — mejor procesar de más que abortar).
 */
export async function fetchUrlsFallidasRecientes(
  fuenteId: string,
): Promise<Set<string>> {
  try {
    const supa = createScraperClient();
    const desde = new Date(Date.now() - RETRY_AFTER_DAYS * 24 * 3600 * 1000).toISOString();
    const skip = new Set<string>();
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supa
        .from("urls_fallidas_cache")
        .select("url")
        .eq("fuente_id", fuenteId)
        .gte("ultimo_intento_at", desde)
        .range(from, from + PAGE - 1);
      if (error) {
        console.warn(`  urls-fallidas: ${error.message}`);
        return skip;
      }
      const batch = (data ?? []).map((r) => r.url as string);
      batch.forEach((u) => skip.add(u));
      if (batch.length < PAGE) break;
      from += PAGE;
    }
    return skip;
  } catch (err) {
    console.warn(`  urls-fallidas fetch: ${(err as Error).message}`);
    return new Set();
  }
}

export type MotivoFallo =
  | "sin_geo"          // no resolvió coord por ningún camino
  | "sin_edificio"     // IA no identificó edificio y no hay zona en tabla
  | "html_invalido"    // scraper no pudo parsear el detalle
  | "otro";

/**
 * Marca una URL como fallida. Fire-and-forget — nunca lanza (fail-open).
 */
export function marcarUrlFallida(
  fuenteId: string,
  url: string,
  motivo: MotivoFallo,
  ultimoError: string | null = null,
): void {
  const supa = createScraperClient();
  void Promise.resolve(
    supa.rpc("marcar_url_fallida", {
      p_url: url,
      p_fuente_id: fuenteId,
      p_motivo: motivo,
      p_ultimo_error: ultimoError,
    }),
  ).catch(() => {});
}
