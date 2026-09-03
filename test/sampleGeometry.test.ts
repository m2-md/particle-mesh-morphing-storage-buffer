import { describe, expect, it } from "vitest";
import { SphereGeometry } from "three";
import { sampleGeometry } from "../src/sampling/sampleGeometry";
import { createSourceGeometry, createTargetGeometry } from "../src/geometry";

const geometry = new SphereGeometry(1, 32, 16);

describe("sampleGeometry", () => {
  it("çıktı uzunluğu count * 4", () => {
    const result = sampleGeometry(geometry, 1000, 1);
    expect(result.data.length).toBe(4000);
  });

  it("w bileşeni (faz) [0,1) aralığında", () => {
    const { data } = sampleGeometry(geometry, 2000, 5);
    for (let i = 0; i < 2000; i++) {
      const w = data[i * 4 + 3];
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThan(1);
    }
  });

  it("aynı tohum bit-birebir aynı Float32Array", () => {
    const a = sampleGeometry(geometry, 500, 9);
    const b = sampleGeometry(geometry, 500, 9);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it("farklı tohum farklı bulut", () => {
    const a = sampleGeometry(geometry, 500, 9);
    const b = sampleGeometry(geometry, 500, 10);
    expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
  });

  it("hiçbir değer NaN değil", () => {
    const { data } = sampleGeometry(createTargetGeometry(), 5000, 2);
    for (let i = 0; i < data.length; i++) expect(Number.isNaN(data[i])).toBe(false);
  });

  it("totalArea ve triangleCount örnekleyiciden geçiyor", () => {
    const result = sampleGeometry(geometry, 10, 1);
    expect(result.triangleCount).toBe(960);
    expect(result.totalArea).toBeGreaterThan(12.4);
    expect(result.totalArea).toBeLessThan(4 * Math.PI);
  });

  it("kaynak ve hedef geometriler farklı bulut üretiyor", () => {
    const source = sampleGeometry(createSourceGeometry(), 1000, 1);
    const target = sampleGeometry(createTargetGeometry(), 1000, 2);
    expect(source.totalArea).not.toBeCloseTo(target.totalArea, 3);
    expect(Array.from(source.data)).not.toEqual(Array.from(target.data));
  });
});
