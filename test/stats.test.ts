import { describe, expect, it } from "vitest";
import { median, percentile, round } from "../src/stats";

describe("median / percentile", () => {
  it("tek elemanlı ortada", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("çift elemanda ortalama alınıyor", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("boş dizide NaN (0 DEĞİL)", () => {
    expect(Number.isNaN(percentile([], 50))).toBe(true);
    expect(Number.isNaN(median([]))).toBe(true);
  });

  it("p0 minimum, p100 maksimum", () => {
    const values = [5, 1, 9, 3];
    expect(percentile(values, 0)).toBe(1);
    expect(percentile(values, 100)).toBe(9);
  });

  it("p sınırları kelepçeleniyor", () => {
    const values = [5, 1, 9, 3];
    expect(percentile(values, -10)).toBe(1);
    expect(percentile(values, 200)).toBe(9);
  });

  it("girdi dizisi MUTASYONA UĞRAMIYOR", () => {
    const values = [5, 1, 9, 3];
    percentile(values, 50);
    median(values);
    expect(values).toEqual([5, 1, 9, 3]);
  });

  it("round sonlu olmayan değerde 0 döndürüyor", () => {
    expect(round(Number.NaN, 2)).toBe(0);
    expect(round(Number.POSITIVE_INFINITY, 2)).toBe(0);
    expect(round(1.23456, 2)).toBe(1.23);
  });
});
