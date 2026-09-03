import { describe, expect, it } from "vitest";
import { BUFFER_COUNT, bufferReport, toMb, vramTable } from "../src/measure/vram";

describe("vramTable", () => {
  it("vec4 buffer is 16 bytes per element", () => {
    expect(vramTable(100_000).perBufferBytes).toBe(100_000 * 16);
  });

  it("total is sum of four buffers", () => {
    expect(BUFFER_COUNT).toBe(4);
    expect(vramTable(100_000).totalBytes).toBe(100_000 * 16 * 4);
  });

  it("assumed vec3 column is 12 bytes per element", () => {
    expect(vramTable(500_000).vec3Bytes).toBe(500_000 * 12 * 4);
  });

  it("difference is positive and equals one-third of vec3 total", () => {
    const row = vramTable(200_000);
    expect(row.deltaBytes).toBeGreaterThan(0);
    expect(row.deltaBytes).toBe(row.totalBytes - row.vec3Bytes);
    expect(row.deltaBytes / row.vec3Bytes).toBeCloseTo(1 / 3, 10);
  });

  it("500k four vec4 buffers exceed 30 MB", () => {
    expect(toMb(vramTable(500_000).totalBytes)).toBeCloseTo(30.52, 2);
  });
});

describe("bufferReport", () => {
  it("fields pass input through directly", () => {
    const node = { value: { itemSize: 3, count: 1024, array: new Float32Array(3072) } };
    expect(bufferReport(node)).toEqual({
      itemSize: 3,
      count: 1024,
      arrayLength: 3072,
      bytes: 12288,
    });
  });

  it("after padding itemSize is 4 and array length increases", () => {
    // three mutates attribute IN PLACE; report reflects this.
    const node = { value: { itemSize: 4, count: 1024, array: new Float32Array(4096) } };
    const report = bufferReport(node);
    expect(report.itemSize).toBe(4);
    expect(report.arrayLength).toBe(4096);
    expect(report.bytes).toBe(16384);
  });

  it("byte calculation comes from array length not itemSize", () => {
    // Even if itemSize is misleading, byte count remains accurate.
    const node = { value: { itemSize: 3, count: 1024, array: new Float32Array(4096) } };
    expect(bufferReport(node).bytes).toBe(16384);
  });
});
