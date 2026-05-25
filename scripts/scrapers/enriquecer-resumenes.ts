/**
 * Lee public/scrape-preview.json, llama a Gemini para cada anuncio
 * que aún no tenga resumen_ia, y reescribe el archivo.
 *
 * Usar después de editar manualmente el JSON, o como un re-procesado
 * sin volver a scrapear.
 *
 *   npm run scrape:resumenes
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { GoogleGenAI } from "@google/genai";
import { config as loadEnv } from "dotenv";

// Next.js usa .env.local — cargarlo explícitamente.
loadEnv({ path: ".env.local" });
loadEnv();

type Row = {
  titulo: string | null;
  precio: number | null;
  moneda?: string | null;
  area_m2: number | null;
  habitaciones: number | null;
  banos: number | null;
  estacionamientos: number | null;
  zona: string | null;
  descripcion?: string | null;
  url_original: string;
  resumen_ia?: string | null;
};

const PATH = join(process.cwd(), "public", "scrape-preview.json");
const file = JSON.parse(readFileSync(PATH, "utf-8")) as {
  results: Row[];
  [k: string]: unknown;
};

if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY no está en .env.local");
  process.exit(1);
}
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function prompt(r: Row): string {
  const ficha = [
    `Título: ${r.titulo ?? ""}`,
    `Operación: ${r.url_original.includes("alquiler") ? "alquiler" : "venta"}`,
    `Precio: ${r.precio} ${r.moneda ?? ""}`,
    r.area_m2 ? `Área: ${r.area_m2} m²` : null,
    r.habitaciones ? `Recámaras: ${r.habitaciones}` : null,
    r.banos ? `Baños: ${r.banos}` : null,
    r.estacionamientos ? `Estacionamientos: ${r.estacionamientos}` : null,
    r.zona ? `Zona: ${r.zona}` : null,
    r.descripcion ? `Descripción: ${r.descripcion}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return `Eres un asistente de bienes raíces en Panamá. Resume el siguiente anuncio en 2-3 frases cortas en español, destacando lo más relevante para un comprador/inquilino (zona, características distintivas). NO inventes información, sé objetivo y conciso.\n\n${ficha}\n\nResumen:`;
}

async function main() {
  let updated = 0;
  for (const row of file.results) {
    if (row.resumen_ia) {
      console.log(`✓ "${row.titulo}" ya tiene resumen, skip`);
      continue;
    }
    try {
      console.log(`→ generando resumen para "${row.titulo}"...`);
      const res = await gemini.models.generateContent({
        model: "gemini-flash-lite-latest",
        contents: prompt(row),
      });
      const text =
        res.text?.replace(/^\s*resumen\s*:?\s*/i, "").trim() ?? null;
      if (text && text.length > 10) {
        row.resumen_ia = text;
        updated++;
        console.log(`  ✓ ${text.length} chars`);
      } else {
        console.warn(`  ✗ respuesta vacía`);
      }
      await new Promise((r) => setTimeout(r, 4500)); // 15 RPM safety
    } catch (err) {
      console.warn(`  ✗ ${(err as Error).message}`);
    }
  }

  writeFileSync(PATH, JSON.stringify(file, null, 2));
  console.log(`\n${updated} resúmenes nuevos guardados en ${PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
