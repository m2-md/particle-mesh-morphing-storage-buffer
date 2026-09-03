import { describe, expect, it } from "vitest";
import { BUFFER_COUNT, bufferReport, toMb, vramTable } from "../src/measure/vram";

describe("vramTable", () => {
  it("vec4 tampon eleman başına 16 bayt", () => {
    expect(vramTable(100_000).perBufferBytes).toBe(100_000 * 16);
  });

  it("toplam dört tamponun toplamı", () => {
    expect(BUFFER_COUNT).toBe(4);
    expect(vramTable(100_000).totalBytes).toBe(100_000 * 16 * 4);
  });

  it("`vec3 sanılan` sütunu eleman başına 12 bayt", () => {
    expect(vramTable(500_000).vec3Bytes).toBe(500_000 * 12 * 4);
  });

  it("fark pozitif ve toplamın üçte biri kadar", () => {
    const row = vramTable(200_000);
    expect(row.deltaBytes).toBeGreaterThan(0);
    expect(row.deltaBytes).toBe(row.totalBytes - row.vec3Bytes);
    expect(row.deltaBytes / row.vec3Bytes).toBeCloseTo(1 / 3, 10);
  });

  it("500k dört vec4 tampon 30 MB üstü", () => {
    expect(toMb(vramTable(500_000).totalBytes)).toBeCloseTo(30.52, 2);
  });
});

describe("bufferReport", () => {
  it("alanlar girdiden birebir geçiyor", () => {
    const node = { value: { itemSize: 3, count: 1024, array: new Float32Array(3072) } };
    expect(bufferReport(node)).toEqual({
      itemSize: 3,
      count: 1024,
      arrayLength: 3072,
      bytes: 12288,
    });
  });

  it("dolgudan SONRA itemSize 4 ve dizi uzunluğu artıyor", () => {
    // three attribute'u YERİNDE mutasyona uğratıyor; rapor bunu görüyor.
    const node = { value: { itemSize: 4, count: 1024, array: new Float32Array(4096) } };
    const report = bufferReport(node);
    expect(report.itemSize).toBe(4);
    expect(report.arrayLength).toBe(4096);
    expect(report.bytes).toBe(16384);
  });

  it("bayt hesabı itemSize'dan DEĞİL dizi uzunluğundan geliyor", () => {
    // itemSize yalan söylese bile bayt sayısı doğru kalıyor.
    const node = { value: { itemSize: 3, count: 1024, array: new Float32Array(4096) } };
    expect(bufferReport(node).bytes).toBe(16384);
  });
});
