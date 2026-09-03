import { describe, expect, it } from "vitest";
import { buildStepKernel, dumpSimulation, DUMP_COUNT } from "../tools/dumpSimulation";
import { countMatches } from "../tools/dumpShaders";
import { createSimulation } from "../src/sim/simulation";

/**
 * Tests here verify the REAL `step` kernel of application, not a toy kernel.
 * No GPU, no browser.
 */
const wgsl = dumpSimulation(buildStepKernel("on"), false);

function sim(bond: "off" | "on" | "broken") {
  const n = 8;
  return createSimulation({
    count: n,
    source: new Float32Array(n * 4),
    target: new Float32Array(n * 4),
    bond,
  });
}

describe("WGSL dump of simulation kernel", () => {
  it("position and velocity buffers are read_write", () => {
    expect(countMatches(wgsl, /var<storage, read_write>/g)).toBe(2);
  });

  it("two target buffers are read via `.toReadOnly()`", () => {
    expect(countMatches(wgsl, /var<storage, read>/g)).toBe(2);
  });

  it("partner read is preserved", () => {
    expect(wgsl).toContain(`${DUMP_COUNT - 1}u - instanceIndex`);
  });

  it("TSL generates bounds guard itself", () => {
    expect(wgsl).toMatch(/if \( instanceIndex >= .+ \) \{ return; \}/);
  });

  it("kernel does not branch: single `if` bounds guard", () => {
    expect(countMatches(wgsl, /\bif\s*\(/g)).toBe(1);
  });

  it("every invocation ONLY writes to its own index", () => {
    const writes = wgsl.match(/^\t(position|velocity)\.value\[[^\]]+\] = /gm) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    for (const write of writes) expect(write).toContain("[ instanceIndex ]");
  });

  it("vec4 buffer: in WGSL array< vec4<f32> >", () => {
    expect(wgsl).toContain("array< vec4<f32> >");
    expect(wgsl).not.toContain("array< vec3<f32> >");
  });
});

describe("GLSL dump of simulation kernel", () => {
  it("bond=on: partner read uses texelFetch", () => {
    const glsl = dumpSimulation(buildStepKernel("on"), true);
    expect(glsl).toContain("texelFetch");
    expect(countMatches(glsl, /uniform highp sampler2D/g)).toBe(1);
  });

  it("bond=broken: no setPBO -> no texelFetch (silent failure)", () => {
    const glsl = dumpSimulation(buildStepKernel("broken"), true);
    expect(glsl).not.toContain("texelFetch");
    expect(countMatches(glsl, /uniform highp sampler2D/g)).toBe(0);
  });

  it("bond=broken dump matches bond=off dump length", () => {
    const broken = dumpSimulation(buildStepKernel("broken"), true).split("\n").length;
    const off = dumpSimulation(buildStepKernel("off"), true).split("\n").length;
    expect(broken).toBe(off);
  });
});

describe("bond contract", () => {
  it("bond=on enables PBO on single buffer", () => {
    expect(sim("on").positionBuffer.getPBO()).toBe(true);
  });

  it("bond=off does not enable PBO and zeroes force", () => {
    const s = sim("off");
    expect(s.positionBuffer.getPBO()).toBe(false);
    expect(s.bondPull.value).toBe(0);
  });

  it("bond=broken leaves force active and INTENTIONALLY omits PBO", () => {
    const s = sim("broken");
    expect(s.positionBuffer.getPBO()).toBe(false);
    expect(s.bondPull.value).toBe(0.0008);
  });

  it("init and step are compute nodes with count equal to particle count", () => {
    const s = sim("on");
    const init = s.init as unknown as { isComputeNode: boolean; count: number };
    const step = s.step as unknown as {
      isComputeNode: boolean;
      count: number;
      workgroupSize: number[];
    };
    expect(init.isComputeNode).toBe(true);
    expect(init.count).toBe(8);
    expect(step.isComputeNode).toBe(true);
    expect(step.count).toBe(8);
    expect(step.workgroupSize).toEqual([64, 1, 1]);
  });

  it("instancedArray truly produces StorageInstancedBufferAttribute", () => {
    const value = sim("on").positionBuffer.value as unknown as {
      isStorageInstancedBufferAttribute?: boolean;
      isInstancedBufferAttribute?: boolean;
      itemSize: number;
      count: number;
      usage: number;
    };
    expect(value.isStorageInstancedBufferAttribute).toBe(true);
    expect(value.isInstancedBufferAttribute).toBe(true);
    expect(value.itemSize).toBe(4);
    expect(value.count).toBe(8);
    expect(value.usage).toBe(35044); // StaticDrawUsage — NO per-frame upload
  });

  it("toAttribute() returns same attribute instance (zero-copy transition)", () => {
    const s = sim("on");
    expect(s.positionBuffer.toAttribute().value).toBe(s.positionBuffer.value);
  });
});
