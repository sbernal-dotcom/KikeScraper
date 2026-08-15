/**
 * Whitelist de protocolos seguros para links externos.
 *
 * S3 (auditoría 2026-08-06): antes hacíamos <a href={urlOriginal}> con
 * el valor crudo de la DB. Riesgo bajo pero mitigable: si algún scraper
 * futuro inserta accidentalmente `javascript:alert(1)` como url, un
 * click ejecuta el script en el contexto de la app. Con Supabase RLS
 * limitando escritura a service_role la superficie es chica, pero
 * validar en el borde es barato.
 */

const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Devuelve la URL si es segura (http/https) o `undefined` si no.
 * Los <a> con href={undefined} se renderizan sin atributo — el click
 * no navega a ninguna parte, versión inofensiva del bug.
 */
export function safeExternalHref(
  raw: string | null | undefined,
): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const u = new URL(trimmed);
    return SAFE_PROTOCOLS.has(u.protocol) ? trimmed : undefined;
  } catch {
    // URL relativa o malformada — asumimos que no es un link externo
    // seguro y lo descartamos.
    return undefined;
  }
}
