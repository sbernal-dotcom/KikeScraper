import { describe, expect, it } from "vitest";

import { computeRunStatus } from "../scripts/scrapers/_run-status";

describe("computeRunStatus", () => {
  it('devuelve "ok" cuando no hay actividad (corrida vacía legítima)', () => {
    expect(computeRunStatus({ ok: 0, errors: 0 })).toBe("ok");
  });

  it('devuelve "error" cuando todos los intentos fallaron', () => {
    expect(computeRunStatus({ ok: 0, errors: 5 })).toBe("error");
  });

  it('devuelve "ok" cuando todo salió bien', () => {
    expect(computeRunStatus({ ok: 100, errors: 0 })).toBe("ok");
  });

  it('devuelve "error" cuando el ratio supera 20% (default)', () => {
    // 30 errores / 100 total (70 ok) = 30% → error
    expect(computeRunStatus({ ok: 70, errors: 30 })).toBe("error");
  });

  it('devuelve "ok" cuando el ratio está bajo el umbral', () => {
    // 10 errores / 100 total (90 ok) = 10% → ok
    expect(computeRunStatus({ ok: 90, errors: 10 })).toBe("ok");
  });

  it("respeta un umbral custom", () => {
    // 15 errores / 100 = 15% → ok con 20% default, error con 10%
    expect(computeRunStatus({ ok: 85, errors: 15 })).toBe("ok");
    expect(computeRunStatus({ ok: 85, errors: 15 }, 0.1)).toBe("error");
  });

  it("no dispara error por 1 error solo con muchos éxitos", () => {
    // El caso del bug histórico: 1 inserted + muchos ok, 1 error único
    expect(computeRunStatus({ ok: 200, errors: 1 })).toBe("ok");
  });

  it("dispara error apenas hay actividad pequeña con errores grandes", () => {
    // Caso del bug H1: 1 inserted + 200 errores → antes "ok", ahora error
    expect(computeRunStatus({ ok: 1, errors: 200 })).toBe("error");
  });
});
