import { describe, expect, it } from "vitest";
import {
  buildDumpKernel,
  buildReadOnlyKernel,
  countMatches,
  dumpCompute,
  transformVaryings,
} from "../tools/dumpShaders";

describe("aynı kernel, iki backend", () => {
  it("WGSL kalıcı bir read_write storage buffer üretir", () => {
    const wgsl = dumpCompute(buildDumpKernel({ pbo: true }), false);
    expect(wgsl).toContain("var<storage, read_write>");
  });

  it("WGSL eş okumasını korur", () => {
    const wgsl = dumpCompute(buildDumpKernel({ pbo: true }), false);
    expect(wgsl).toContain("1023u - instanceIndex");
  });

  it("WGSL sınır korumasını kendisi ekler", () => {
    const wgsl = dumpCompute(buildDumpKernel({ pbo: true }), false);
    expect(wgsl).toMatch(/if \( instanceIndex >= .+ \) \{ return; \}/);
  });

  it("GLSL rastgele okumayı texelFetch ile yapar (PBO açıkken)", () => {
    const glsl = dumpCompute(buildDumpKernel({ pbo: true }), true);
    expect(glsl).toContain("texelFetch");
  });

  it("PBO kapalıyken texelFetch YOK: sessiz çöküşün regresyon testi", () => {
    const glsl = dumpCompute(buildDumpKernel({ pbo: false }), true);
    expect(glsl).not.toContain("texelFetch");
  });

  it("iki döküm de aynı sürümden çıkar", () => {
    expect(dumpCompute(buildDumpKernel({ pbo: true }), false)).toContain("r185");
    expect(dumpCompute(buildDumpKernel({ pbo: true }), true)).toContain("r185");
  });
});

describe("döküm gövdesi gerçekten dolu", () => {
  // `three/tsl` ile `three/src` karıştırılırsa gövde SESSİZCE boş derlenir.
  it("WGSL gövdesinde tampon erişimi var", () => {
    expect(dumpCompute(buildDumpKernel({ pbo: true }), false)).toContain("positionBuffer.value[");
  });

  it("GLSL gövdesinde atama var", () => {
    const glsl = dumpCompute(buildDumpKernel({ pbo: true }), true);
    expect(glsl).toContain("nodeVarying0 = (");
  });

  it("PBO'suz GLSL'de eş okuması parçacığın KENDİ değerine çöküyor", () => {
    const glsl = dumpCompute(buildDumpKernel({ pbo: false }), true);
    // Fark ifadesi aynı değişkenin kendisinden çıkarılması hâline gelmiş.
    expect(glsl).toMatch(/\(\s*nodeVarying0 - nodeVarying0\s*\)/);
  });
});

describe("WGSL yapısal iddialar", () => {
  it("varsayılan workgroup boyutu 64", () => {
    expect(dumpCompute(buildDumpKernel({ pbo: true }), false)).toContain(
      "@compute @workgroup_size( 64",
    );
  });

  it("`.toReadOnly()` uygulanan tampon var<storage, read> üretir", () => {
    const wgsl = dumpCompute(buildReadOnlyKernel(), false);
    expect(wgsl).toContain("var<storage, read>");
    expect(wgsl).toContain("var<storage, read_write>");
  });

  it("iki tamponlu kernel iki storage binding + bir uniform binding üretir", () => {
    const wgsl = dumpCompute(buildDumpKernel({ pbo: true }), false);
    expect(countMatches(wgsl, /@binding\(/g)).toBe(3);
    expect(countMatches(wgsl, /var<storage, read_write>/g)).toBe(2);
  });
});

describe("WebGL2 emülasyonu", () => {
  it("yazma transform feedback varying'lerinden gidiyor", () => {
    expect(transformVaryings(buildDumpKernel({ pbo: true }))).toEqual([
      "nodeVarying0",
      "nodeVarying1",
    ]);
  });

  it("PBO açıkken sampler beliriyor, kapalıyken hiç yok", () => {
    const withPbo = dumpCompute(buildDumpKernel({ pbo: true }), true);
    const without = dumpCompute(buildDumpKernel({ pbo: false }), true);
    expect(countMatches(withPbo, /uniform highp sampler2D/g)).toBe(1);
    expect(countMatches(without, /uniform highp sampler2D/g)).toBe(0);
  });

  it("compute programı vertex shader olarak çıkıyor: gl_PointSize var", () => {
    expect(dumpCompute(buildDumpKernel({ pbo: true }), true)).toContain("gl_PointSize = 1.0;");
  });

  it("GLSL'de WGSL'in storage sözdizimi HİÇ geçmiyor", () => {
    const glsl = dumpCompute(buildDumpKernel({ pbo: true }), true);
    expect(glsl).not.toContain("var<storage");
    expect(glsl).toContain("#version 300 es");
  });
});
