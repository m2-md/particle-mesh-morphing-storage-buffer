import { describe, expect, it } from "vitest";
import {
  buildDumpKernel,
  buildReadOnlyKernel,
  countMatches,
  dumpCompute,
  transformVaryings,
} from "../tools/dumpShaders";

describe("same kernel, two backends", () => {
  it("WGSL produces persistent read_write storage buffer", () => {
    const wgsl = dumpCompute(buildDumpKernel({ pbo: true }), false);
    expect(wgsl).toContain("var<storage, read_write>");
  });

  it("WGSL preserves partner read", () => {
    const wgsl = dumpCompute(buildDumpKernel({ pbo: true }), false);
    expect(wgsl).toContain("1023u - instanceIndex");
  });

  it("WGSL adds bounds guard automatically", () => {
    const wgsl = dumpCompute(buildDumpKernel({ pbo: true }), false);
    expect(wgsl).toMatch(/if \( instanceIndex >= .+ \) \{ return; \}/);
  });

  it("GLSL performs random read via texelFetch when PBO enabled", () => {
    const glsl = dumpCompute(buildDumpKernel({ pbo: true }), true);
    expect(glsl).toContain("texelFetch");
  });

  it("when PBO disabled no texelFetch: regression test for silent fallback", () => {
    const glsl = dumpCompute(buildDumpKernel({ pbo: false }), true);
    expect(glsl).not.toContain("texelFetch");
  });

  it("both dumps originate from same version", () => {
    expect(dumpCompute(buildDumpKernel({ pbo: true }), false)).toContain("r185");
    expect(dumpCompute(buildDumpKernel({ pbo: true }), true)).toContain("r185");
  });
});

describe("dump body is populated", () => {
  it("WGSL body contains buffer access", () => {
    expect(dumpCompute(buildDumpKernel({ pbo: true }), false)).toContain("positionBuffer.value[");
  });

  it("GLSL body contains assignment", () => {
    const glsl = dumpCompute(buildDumpKernel({ pbo: true }), true);
    expect(glsl).toContain("nodeVarying0 = (");
  });

  it("in GLSL without PBO partner read collapses to particle own value", () => {
    const glsl = dumpCompute(buildDumpKernel({ pbo: false }), true);
    expect(glsl).toMatch(/\(\s*nodeVarying0 - nodeVarying0\s*\)/);
  });
});

describe("WGSL structural assertions", () => {
  it("default workgroup dimension 64", () => {
    expect(dumpCompute(buildDumpKernel({ pbo: true }), false)).toContain(
      "@compute @workgroup_size( 64",
    );
  });

  it("buffer with `.toReadOnly()` produces var<storage, read>", () => {
    const wgsl = dumpCompute(buildReadOnlyKernel(), false);
    expect(wgsl).toContain("var<storage, read>");
    expect(wgsl).toContain("var<storage, read_write>");
  });

  it("two buffer kernel produces two storage bindings + one uniform binding", () => {
    const wgsl = dumpCompute(buildDumpKernel({ pbo: true }), false);
    expect(countMatches(wgsl, /@binding\(/g)).toBe(3);
    expect(countMatches(wgsl, /var<storage, read_write>/g)).toBe(2);
  });
});

describe("WebGL2 emulation", () => {
  it("writes pass through transform feedback varyings", () => {
    expect(transformVaryings(buildDumpKernel({ pbo: true }))).toEqual([
      "nodeVarying0",
      "nodeVarying1",
    ]);
  });

  it("sampler appears when PBO is on, absent when off", () => {
    const withPbo = dumpCompute(buildDumpKernel({ pbo: true }), true);
    const without = dumpCompute(buildDumpKernel({ pbo: false }), true);
    expect(countMatches(withPbo, /uniform highp sampler2D/g)).toBe(1);
    expect(countMatches(without, /uniform highp sampler2D/g)).toBe(0);
  });

  it("compute program emits as vertex shader: gl_PointSize exists", () => {
    expect(dumpCompute(buildDumpKernel({ pbo: true }), true)).toContain("gl_PointSize = 1.0;");
  });

  it("GLSL contains no WGSL storage syntax", () => {
    const glsl = dumpCompute(buildDumpKernel({ pbo: true }), true);
    expect(glsl).not.toContain("var<storage");
    expect(glsl).toContain("#version 300 es");
  });
});
