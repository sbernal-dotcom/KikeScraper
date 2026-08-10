import { describe, expect, it } from "vitest";

import {
  chunkedParallel,
  chunkedParallelKeepAll,
} from "../scripts/scrapers/_common";

describe("chunkedParallel", () => {
  it("procesa todos los items respetando el orden de fulfillment", async () => {
    const items = [1, 2, 3, 4, 5];
    const out = await chunkedParallel(items, 2, async (n) => n * 2);
    expect(out.sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10]);
  });

  it("filtra null y undefined del resultado", async () => {
    const out = await chunkedParallel(
      [1, 2, 3, 4],
      2,
      async (n) => (n % 2 === 0 ? n : null),
    );
    expect(out.sort((a, b) => a - b)).toEqual([2, 4]);
  });

  it("descarta silenciosamente items que rechazan", async () => {
    const out = await chunkedParallel([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("kaboom");
      return n;
    });
    expect(out.sort((a, b) => a - b)).toEqual([1, 3]);
  });

  it("respeta la concurrencia — nunca corren más de N en paralelo", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await chunkedParallel(items, 3, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return n;
    });
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("pasa el índice original al callback", async () => {
    const seen: Array<[number, number]> = [];
    await chunkedParallel([10, 20, 30, 40], 2, async (val, idx) => {
      seen.push([val, idx]);
      return val;
    });
    seen.sort((a, b) => a[0] - b[0]);
    expect(seen).toEqual([
      [10, 0],
      [20, 1],
      [30, 2],
      [40, 3],
    ]);
  });

  it("corta el loop si shouldStop devuelve true", async () => {
    let processed = 0;
    let allow = 4;
    await chunkedParallel(
      Array.from({ length: 20 }, (_, i) => i),
      2,
      async (n) => {
        processed++;
        return n;
      },
      { shouldStop: () => processed >= allow },
    );
    // Puede sobrepasarse un chunk (evalúa al inicio de cada bloque).
    expect(processed).toBeLessThanOrEqual(allow + 2);
    expect(processed).toBeGreaterThanOrEqual(allow);
  });

  it("array vacío devuelve array vacío", async () => {
    const out = await chunkedParallel<number, number>(
      [],
      3,
      async (n) => n,
    );
    expect(out).toEqual([]);
  });
});

describe("chunkedParallelKeepAll", () => {
  it("conserva null en el resultado", async () => {
    const out = await chunkedParallelKeepAll<number, number | null>(
      [1, 2, 3],
      2,
      async (n) => (n === 2 ? null : n),
    );
    expect(out.sort((a, b) => (a ?? -1) - (b ?? -1))).toEqual([null, 1, 3]);
  });

  it("descarta rechazados (Promise.allSettled)", async () => {
    const out = await chunkedParallelKeepAll<number, number>(
      [1, 2, 3],
      2,
      async (n) => {
        if (n === 2) throw new Error("kaboom");
        return n;
      },
    );
    expect(out.sort((a, b) => a - b)).toEqual([1, 3]);
  });
});
