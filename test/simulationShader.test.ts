import { describe, expect, it } from "vitest";
import { buildStepKernel, dumpSimulation, DUMP_COUNT } from "../tools/dumpSimulation";
import { countMatches } from "../tools/dumpShaders";
import { createSimulation } from "../src/sim/simulation";

/**
 * Buradaki testler oyuncak bir kernel'ı değil, uygulamanın GERÇEK `step`
 * kernel'ını dökerek sınıyor. GPU yok, tarayıcı yok.
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

describe("simülasyon kernel'ının WGSL dökümü", () => {
  it("konum ve hız tamponu read_write", () => {
    expect(countMatches(wgsl, /var<storage, read_write>/g)).toBe(2);
  });

  it("iki hedef tamponu `.toReadOnly()` sayesinde read", () => {
    expect(countMatches(wgsl, /var<storage, read>/g)).toBe(2);
  });

  it("eş okuması korunuyor", () => {
    expect(wgsl).toContain(`${DUMP_COUNT - 1}u - instanceIndex`);
  });

  it("sınır korumasını TSL kendisi üretiyor", () => {
    expect(wgsl).toMatch(/if \( instanceIndex >= .+ \) \{ return; \}/);
  });

  it("kernel dallanmıyor: tek `if` sınır koruması", () => {
    expect(countMatches(wgsl, /\bif\s*\(/g)).toBe(1);
  });

  it("her invocation YALNIZ kendi indeksine yazıyor", () => {
    const writes = wgsl.match(/^\t(position|velocity)\.value\[[^\]]+\] = /gm) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    for (const write of writes) expect(write).toContain("[ instanceIndex ]");
  });

  it("vec4 tampon: WGSL'de array< vec4<f32> >", () => {
    expect(wgsl).toContain("array< vec4<f32> >");
    expect(wgsl).not.toContain("array< vec3<f32> >");
  });
});

describe("simülasyon kernel'ının GLSL dökümü", () => {
  it("bond=on: eş okuması texelFetch ile yapılıyor", () => {
    const glsl = dumpSimulation(buildStepKernel("on"), true);
    expect(glsl).toContain("texelFetch");
    expect(countMatches(glsl, /uniform highp sampler2D/g)).toBe(1);
  });

  it("bond=broken: setPBO YOK -> texelFetch YOK (sessiz çöküş)", () => {
    const glsl = dumpSimulation(buildStepKernel("broken"), true);
    expect(glsl).not.toContain("texelFetch");
    expect(countMatches(glsl, /uniform highp sampler2D/g)).toBe(0);
  });

  it("bond=broken dökümü bond=off dökümüyle aynı uzunlukta", () => {
    const broken = dumpSimulation(buildStepKernel("broken"), true).split("\n").length;
    const off = dumpSimulation(buildStepKernel("off"), true).split("\n").length;
    expect(broken).toBe(off);
  });
});

describe("bond sözleşmesi", () => {
  it("bond=on tek tamponda PBO açıyor", () => {
    expect(sim("on").positionBuffer.getPBO()).toBe(true);
  });

  it("bond=off PBO açmıyor ve kuvveti sıfırlıyor", () => {
    const s = sim("off");
    expect(s.positionBuffer.getPBO()).toBe(false);
    expect(s.bondPull.value).toBe(0);
  });

  it("bond=broken kuvveti açık bırakıp PBO'yu BİLEREK açmıyor", () => {
    const s = sim("broken");
    expect(s.positionBuffer.getPBO()).toBe(false);
    expect(s.bondPull.value).toBe(0.0008);
  });

  it("init ve step birer compute node, sayıları parçacık sayısına eşit", () => {
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

  it("instancedArray gerçekten StorageInstancedBufferAttribute üretiyor", () => {
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
    expect(value.usage).toBe(35044); // StaticDrawUsage — kare başına yeniden yükleme YOK
  });

  it("toAttribute() aynı attribute nesnesini döndürüyor (kopyasız geçiş)", () => {
    const s = sim("on");
    expect(s.positionBuffer.toAttribute().value).toBe(s.positionBuffer.value);
  });
});
