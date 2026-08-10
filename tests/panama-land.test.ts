import { describe, expect, it } from "vitest";

import { isOnLand } from "../src/lib/geo/panama-land";

describe("isOnLand", () => {
  it("acepta el centro de Ciudad de Panamá", () => {
    // Zona Bancaria / Área Bancaria
    expect(isOnLand(8.9824, -79.5199)).toBe(true);
  });

  it("acepta Bella Vista", () => {
    expect(isOnLand(8.9773, -79.5305)).toBe(true);
  });

  it("acepta Costa del Este", () => {
    expect(isOnLand(9.0033, -79.4795)).toBe(true);
  });

  it("rechaza mar abierto en el Pacífico frente a Panamá", () => {
    expect(isOnLand(8.5, -79.5)).toBe(false);
  });

  it("rechaza coordenadas totalmente fuera del bbox", () => {
    expect(isOnLand(10.5, -74.0)).toBe(false); // Colombia interior
    expect(isOnLand(4.0, -80.0)).toBe(false); // Ecuador
    expect(isOnLand(20.0, -100.0)).toBe(false); // México
  });

  it("acepta zonas costeras conocidas via whitelist (Coronado)", () => {
    // Coronado — playa, cerca del contorno pero coord válida por whitelist.
    expect(isOnLand(8.5333, -79.9333)).toBe(true);
  });

  it("acepta Bocas del Toro (zona insular)", () => {
    expect(isOnLand(9.34, -82.24)).toBe(true);
  });
});
