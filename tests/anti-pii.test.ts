import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * L10 — Test contractual anti-PII.
 *
 * Regla del proyecto (ver AGENTS.md / bitácora): los 6 `toDbRow()`
 * NO deben incluir descripcion, teléfono, email, contacto, ni fotos.
 * Este test lee el bloque `function toDbRow` de cada scraper y falla
 * si detecta alguno de los campos prohibidos.
 *
 * No es infalible (si alguien introduce el campo con otro nombre no lo
 * atrapamos), pero cubre el 95% de los descuidos típicos: agregar
 * "telefono:" o "email:" copy-pasteando desde el HTML de la fuente.
 */

const SCRAPERS = [
  "fuente-prueba.ts",
  "scraper-inmopanama.ts",
  "scraper-savitat.ts",
  "scraper-mlsacobir.ts",
  "scraper-panamaequity.ts",
  "scraper-acobir.ts",
] as const;

// Campos que NUNCA deben aparecer en el output de toDbRow (regla ToS).
// Se buscan como key de objeto: `<campo>:` (con o sin quote), con
// tolerancia a mayúsculas.
const FORBIDDEN_KEYS = [
  "descripcion",
  "descripcion_original",
  "description", // por si copia-pega del HTML en inglés
  "telefono",
  "phone",
  "email",
  "vendedor",
  "contacto",
  "contact",
  "fotos",
  "images",
  "imagenes",
] as const;

/**
 * Extrae el bloque de código entre `function toDbRow` y su `}` matching.
 * Cuenta balance de llaves para encontrar el cierre correcto.
 */
function extractToDbRowBlock(source: string): string | null {
  const startMatch = source.match(/function toDbRow[^{]*\{/);
  if (!startMatch) return null;
  const start = startMatch.index! + startMatch[0].length;
  let depth = 1;
  let i = start;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  return depth === 0 ? source.slice(start, i - 1) : null;
}

describe("anti-PII: toDbRow no debe persistir campos prohibidos", () => {
  it.each(SCRAPERS)("%s — toDbRow encontrado y parseado", (file) => {
    const path = join(process.cwd(), "scripts", "scrapers", file);
    const source = readFileSync(path, "utf-8");
    const block = extractToDbRowBlock(source);
    expect(block, `toDbRow no encontrado en ${file}`).toBeTruthy();
  });

  it.each(SCRAPERS)("%s — sin campos PII/descripción como key", (file) => {
    const path = join(process.cwd(), "scripts", "scrapers", file);
    const source = readFileSync(path, "utf-8");
    const block = extractToDbRowBlock(source);
    if (!block) throw new Error(`toDbRow no encontrado en ${file}`);

    for (const key of FORBIDDEN_KEYS) {
      // Match keys de objeto: `<key>:` o `"<key>":`, no dentro de un
      // comentario. Regex tolerante a case.
      const re = new RegExp(
        `(^|[\\s{,(])["']?${key}["']?\\s*:`,
        "im",
      );
      // Filtramos líneas que son solo comentario para reducir falsos positivos.
      const nonCommentLines = block
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
      const hit = re.test(nonCommentLines);
      expect(
        hit,
        `${file}: encontrado key prohibido "${key}" en toDbRow`,
      ).toBe(false);
    }
  });
});
