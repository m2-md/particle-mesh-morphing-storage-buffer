import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/sampling/rng";

describe("mulberry32", () => {
  it("generated values are in [0,1) range", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 5000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("same seed yields same sequence", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const first = Array.from({ length: 5 }, () => a());
    const second = Array.from({ length: 5 }, () => b());
    expect(first).toEqual(second);
  });

  it("different seed yields different array", () => {
    const a = mulberry32(42);
    const b = mulberry32(43);
    const first = Array.from({ length: 5 }, () => a());
    const second = Array.from({ length: 5 }, () => b());
    expect(first).not.toEqual(second);
  });

  it("two instances do not share state", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    a();
    a();
    expect(b()).toBe(mulberry32(7)());
  });

  it("distribution is roughly uniform: 8-12% in each of 10 buckets", () => {
    const rng = mulberry32(1);
    const buckets = new Array(10).fill(0);
    const N = 100_000;
    for (let i = 0; i < N; i++) buckets[Math.floor(rng() * 10)]++;
    for (const b of buckets) {
      expect(b / N).toBeGreaterThan(0.08);
      expect(b / N).toBeLessThan(0.12);
    }
  });
});
