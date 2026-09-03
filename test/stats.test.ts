import { describe, expect, it } from "vitest";
import { median, percentile, round } from "../src/stats";

describe("median / percentile", () => {
  it("odd element count selects middle", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("even element count averages middle two", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("returns NaN on empty array (not 0)", () => {
    expect(Number.isNaN(percentile([], 50))).toBe(true);
    expect(Number.isNaN(median([]))).toBe(true);
  });

  it("p0 minimum, p100 maximum", () => {
    const values = [5, 1, 9, 3];
    expect(percentile(values, 0)).toBe(1);
    expect(percentile(values, 100)).toBe(9);
  });

  it("clamps percentile bounds", () => {
    const values = [5, 1, 9, 3];
    expect(percentile(values, -10)).toBe(1);
    expect(percentile(values, 200)).toBe(9);
  });

  it("input array is NOT MUTATED", () => {
    const values = [5, 1, 9, 3];
    percentile(values, 50);
    median(values);
    expect(values).toEqual([5, 1, 9, 3]);
  });

  it("round returns 0 for non-finite values", () => {
    expect(round(Number.NaN, 2)).toBe(0);
    expect(round(Number.POSITIVE_INFINITY, 2)).toBe(0);
    expect(round(1.23456, 2)).toBe(1.23);
  });
});
