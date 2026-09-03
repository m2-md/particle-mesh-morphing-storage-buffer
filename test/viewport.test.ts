import { describe, expect, it } from "vitest";
import { backingSize, MAX_DPR } from "../src/viewport";

describe("backingSize", () => {
  it("clamps dpr to 2", () => {
    expect(MAX_DPR).toBe(2);
    expect(backingSize(960, 540, 3, 1)).toEqual({ width: 1920, height: 1080 });
  });

  it("dpr does not drop below 1", () => {
    expect(backingSize(960, 540, 0.5, 1)).toEqual({ width: 960, height: 540 });
  });

  it("scale lower bound is 0.25", () => {
    expect(backingSize(960, 540, 1, 0.1)).toEqual({ width: 240, height: 135 });
  });

  it("scale upper bound is 1", () => {
    expect(backingSize(960, 540, 1, 2)).toEqual({ width: 960, height: 540 });
  });

  it("result is never 0", () => {
    const size = backingSize(1, 1, 1, 0.25);
    expect(size.width).toBeGreaterThanOrEqual(1);
    expect(size.height).toBeGreaterThanOrEqual(1);
  });

  it("scale and dpr multiply together", () => {
    expect(backingSize(960, 540, 2, 0.5)).toEqual({ width: 960, height: 540 });
  });
});
