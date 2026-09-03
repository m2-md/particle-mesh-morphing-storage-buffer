import { describe, expect, it } from "vitest";
import { backingSize, MAX_DPR } from "../src/viewport";

describe("backingSize", () => {
  it("dpr 2'ye kelepçeleniyor", () => {
    expect(MAX_DPR).toBe(2);
    expect(backingSize(960, 540, 3, 1)).toEqual({ width: 1920, height: 1080 });
  });

  it("dpr 1'in altına inmiyor", () => {
    expect(backingSize(960, 540, 0.5, 1)).toEqual({ width: 960, height: 540 });
  });

  it("ölçek alt sınırı 0,25", () => {
    expect(backingSize(960, 540, 1, 0.1)).toEqual({ width: 240, height: 135 });
  });

  it("ölçek üst sınırı 1", () => {
    expect(backingSize(960, 540, 1, 2)).toEqual({ width: 960, height: 540 });
  });

  it("sonuç asla 0 olmuyor", () => {
    const size = backingSize(1, 1, 1, 0.25);
    expect(size.width).toBeGreaterThanOrEqual(1);
    expect(size.height).toBeGreaterThanOrEqual(1);
  });

  it("ölçek ve dpr birlikte çarpılıyor", () => {
    expect(backingSize(960, 540, 2, 0.5)).toEqual({ width: 960, height: 540 });
  });
});
