import { describe, expect, it } from "vitest";

import { stripLifecycleIfNotActive } from "../scripts/scrapers/_lifecycle";

describe("stripLifecycleIfNotActive", () => {
  const fullRow = {
    titulo: "Apto Bella Vista",
    precio: 200_000,
    lat: 9,
    lng: -79,
    estado_anuncio: "activo",
    veces_no_encontrado: 0,
    motivo_estado: "scrapeado",
    fecha_deteccion: "2026-01-01",
  };

  it("URL nueva (no existe) → devuelve row completo", () => {
    const out = stripLifecycleIfNotActive(fullRow, undefined);
    expect(out).toEqual(fullRow);
  });

  it("URL existente con estado=activo → devuelve row completo", () => {
    const out = stripLifecycleIfNotActive(fullRow, {
      estado_anuncio: "activo",
    });
    expect(out).toEqual(fullRow);
  });

  it("URL existente archivada → quita campos de lifecycle", () => {
    const out = stripLifecycleIfNotActive(fullRow, {
      estado_anuncio: "archivado",
    });
    expect(out).not.toHaveProperty("estado_anuncio");
    expect(out).not.toHaveProperty("veces_no_encontrado");
    expect(out).not.toHaveProperty("motivo_estado");
    expect(out).not.toHaveProperty("fecha_deteccion");
    // Pero mantiene datos técnicos:
    expect(out.titulo).toBe("Apto Bella Vista");
    expect(out.precio).toBe(200_000);
    expect(out.lat).toBe(9);
    expect(out.lng).toBe(-79);
  });

  it.each([
    "archivado",
    "error_verificacion",
    "posible_inactivo",
    "vendido",
    "alquilado",
    "retirado",
  ])(
    "estado=%s bloqueado → strip lifecycle",
    (estado) => {
      const out = stripLifecycleIfNotActive(fullRow, { estado_anuncio: estado });
      expect(out).not.toHaveProperty("estado_anuncio");
    },
  );

  it("no muta el input original", () => {
    const clone = { ...fullRow };
    stripLifecycleIfNotActive(fullRow, { estado_anuncio: "archivado" });
    expect(fullRow).toEqual(clone);
  });
});
