import { describe, expect, it } from "vitest";
import { positionChecksum } from "../src/measure/checksum";

describe("positionChecksum", () => {
  it("aynı girdi aynı çıktı", () => {
    const a = new Float32Array([1, 2, 3, 4, 5]);
    const b = new Float32Array([1, 2, 3, 4, 5]);
    expect(positionChecksum(a)).toBe(positionChecksum(b));
  });

  it("tek bitlik değişiklik farklı çıktı üretiyor", () => {
    const a = new Float32Array([1, 2, 3, 4, 5]);
    const b = new Float32Array([1, 2, 3, 4, 5]);
    b[3] = Math.fround(4 + 1e-6);
    expect(b[3]).not.toBe(a[3]);
    expect(positionChecksum(a)).not.toBe(positionChecksum(b));
  });

  it("boş dizide FNV-1a başlangıç değerini döndürüyor", () => {
    expect(positionChecksum(new Float32Array(0))).toBe(0x811c9dc5);
  });

  it("çıktı her zaman 32 bit işaretsiz", () => {
    const data = new Float32Array(1024);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(i) * 1000;
    const h = positionChecksum(data);
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it("Uint32Array görünümü orijinali bozmuyor", () => {
    const data = new Float32Array([1.5, -2.25, 3.75]);
    const before = Array.from(data);
    positionChecksum(data);
    expect(Array.from(data)).toEqual(before);
  });

  it("sıra önemli: aynı değerlerin permütasyonu farklı özet veriyor", () => {
    expect(positionChecksum(new Float32Array([1, 2, 3]))).not.toBe(
      positionChecksum(new Float32Array([3, 2, 1])),
    );
  });

  it("alt dizi görünümünde (byteOffset > 0) de çalışıyor", () => {
    const backing = new Float32Array([9, 9, 1, 2, 3]);
    const view = backing.subarray(2);
    expect(view.byteOffset).toBe(8);
    expect(positionChecksum(view)).toBe(positionChecksum(new Float32Array([1, 2, 3])));
  });
});
