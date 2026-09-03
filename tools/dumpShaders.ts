/**
 * Aynı TSL kernel'ından iki shader döküyoruz — GPU YOK, tarayıcı YOK.
 *
 * DİKKAT: bu dosyadaki HER three import'u `three/src/` altından geliyor.
 * `three/tsl` (build çıktısı) ile `three/src/...` ayrı modül kopyalarıdır;
 * karıştırırsanız `THREE.TSL: No stack defined for assign operation` uyarısı
 * alırsınız ve kernel gövdesi SESSİZCE boş derlenir.
 */
import {
  Fn,
  context,
  float,
  instanceIndex,
  instancedArray,
  uint,
  vec3,
} from "three/src/nodes/TSL.js";
import WGSLNodeBuilder from "three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js";
import GLSLNodeBuilder from "three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js";
import { readThreeVersion } from "./threeVersion";

/** Node builder'ın beklediği en küçük renderer yüzeyi. Test dublörü. */
function fakeRenderer(isWebGL: boolean) {
  const backend = isWebGL
    ? { isWebGLBackend: true, extensions: { has: () => false } }
    : { isWebGPUBackend: true, device: null };

  return {
    backend: {
      ...backend,
      hasFeature: () => false,
      getMaxAnisotropy: () => 1,
      get: () => ({}),
      has: () => false,
    },
    isWebGPURenderer: true,
    library: null,
    getRenderTarget: () => null,
    getMRT: () => null,
    contextNode: context(vec3(0)), // null OLAMAZ
    coordinateSystem: 2000,
    outputColorSpace: "srgb",
    currentColorSpace: "srgb-linear",
    toneMapping: 0,
    getDrawingBufferSize: () => ({ x: 1, y: 1 }),
    getPixelRatio: () => 1,
    debug: {},
    hasFeature: () => false,
  };
}

/**
 * `@types/three`'de `NodeBuilder` neredeyse boş bir soyut sınıf: `build()` de
 * `computeShader` de bildirilmemiş. Kullandığımız yüzeyi burada yazıyoruz.
 */
interface ComputeBuilder {
  build(): void;
  computeShader: string;
  transforms?: Array<{ varyingName: string }>;
}

function makeBuilder(kernel: unknown, isWebGL: boolean): ComputeBuilder {
  const Builder = isWebGL ? GLSLNodeBuilder : WGSLNodeBuilder;
  return new Builder(kernel as never, fakeRenderer(isWebGL) as never) as unknown as ComputeBuilder;
}

export function dumpCompute(kernel: unknown, isWebGL: boolean): string {
  const builder = makeBuilder(kernel, isWebGL);
  builder.build();
  return builder.computeShader;
}

/**
 * Döküm kerneli: kasten küçük. Üç satır, iki tampon, bir eş okuması.
 * `vec3` kullanıyoruz — WGSL çıktısında `array< vec3<f32> >` görünsün diye.
 */
export function buildDumpKernel({ pbo }: { pbo: boolean }) {
  const positionBuffer = instancedArray(1024, "vec3").setName("positionBuffer");
  const velocityBuffer = instancedArray(1024, "vec3").setName("velocityBuffer");

  // Rastgele indeksle okunan TEK tampon konum tamponu — simülasyondaki kuralın aynısı.
  if (pbo) positionBuffer.setPBO(true);

  return Fn(() => {
    const pos = positionBuffer.element(instanceIndex);
    const vel = velocityBuffer.element(instanceIndex);
    const partner = positionBuffer.element(uint(1023).sub(instanceIndex));
    positionBuffer
      .element(instanceIndex)
      .assign(pos.add(vel).add(partner.sub(pos).mul(float(0.001))));
  })().compute(1024);
}

/** `.toReadOnly()` kanıtı için ayrı, tek tamponlu kernel. */
export function buildReadOnlyKernel() {
  const positionBuffer = instancedArray(1024, "vec3").setName("positionBuffer");
  const morphTarget = instancedArray(1024, "vec3").setName("morphTarget").toReadOnly();

  return Fn(() => {
    const pos = positionBuffer.element(instanceIndex);
    const goal = morphTarget.element(instanceIndex);
    positionBuffer.element(instanceIndex).assign(pos.add(goal.sub(pos).mul(float(0.05))));
  })().compute(1024);
}

export function countLines(source: string): number {
  return source.split("\n").length;
}

export function countMatches(source: string, pattern: RegExp): number {
  const matches = source.match(pattern);
  return matches === null ? 0 : matches.length;
}

/** WebGL2 yolunda yazma transform feedback varying'lerinden gidiyor; adlarını topluyoruz. */
export function transformVaryings(kernel: unknown): string[] {
  const builder = makeBuilder(kernel, true);
  builder.build();
  return (builder.transforms ?? []).map((t) => t.varyingName);
}

async function main(): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const threeVersion = await readThreeVersion();

  const wgsl = dumpCompute(buildDumpKernel({ pbo: true }), false);
  const glslPbo = dumpCompute(buildDumpKernel({ pbo: true }), true);
  const glslNoPbo = dumpCompute(buildDumpKernel({ pbo: false }), true);

  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/compute.wgsl", wgsl);
  await writeFile("artifacts/compute.pbo.glsl", glslPbo);
  await writeFile("artifacts/compute.nopbo.glsl", glslNoPbo);

  const report = {
    three: threeVersion,
    header: wgsl.split("\n")[0],
    wgsl: {
      lines: countLines(wgsl),
      bindings: countMatches(wgsl, /@binding\(/g),
      hasReadWrite: wgsl.includes("var<storage, read_write>"),
      hasReadOnly: wgsl.includes("var<storage, read>"),
      hasNeighbourRead: wgsl.includes("1023u - instanceIndex"),
      hasBoundsGuard: /if \( instanceIndex >= .+ \) \{ return; \}/.test(wgsl),
    },
    glslPbo: {
      lines: countLines(glslPbo),
      samplers: countMatches(glslPbo, /uniform highp sampler2D/g),
      hasTexelFetch: glslPbo.includes("texelFetch"),
      varyings: transformVaryings(buildDumpKernel({ pbo: true })),
    },
    glslNoPbo: {
      lines: countLines(glslNoPbo),
      samplers: countMatches(glslNoPbo, /uniform highp sampler2D/g),
      hasTexelFetch: glslNoPbo.includes("texelFetch"),
      varyings: transformVaryings(buildDumpKernel({ pbo: false })),
    },
    simulation: await dumpRealKernel(writeFile),
  };

  console.log("SHADERS " + JSON.stringify(report));
}

/**
 * İkinci döküm: uygulamanın GERÇEK `step` kernel'ı. Ayrı modül grafiği kullandığı
 * için (bkz. `tools/dumpSimulation.ts`) dinamik import ediliyor.
 */
async function dumpRealKernel(writeFile: typeof import("node:fs/promises").writeFile) {
  const { buildStepKernel, dumpSimulation, DUMP_COUNT } = await import("./dumpSimulation");

  const wgsl = dumpSimulation(buildStepKernel("on"), false);
  const glslOn = dumpSimulation(buildStepKernel("on"), true);
  const glslBroken = dumpSimulation(buildStepKernel("broken"), true);
  const glslOff = dumpSimulation(buildStepKernel("off"), true);

  await writeFile("artifacts/step.wgsl", wgsl);
  await writeFile("artifacts/step.pbo.glsl", glslOn);
  await writeFile("artifacts/step.nopbo.glsl", glslBroken);

  const partner = `${DUMP_COUNT - 1}u - instanceIndex`;
  return {
    count: DUMP_COUNT,
    wgsl: {
      lines: countLines(wgsl),
      bindings: countMatches(wgsl, /@binding\(/g),
      readWrite: countMatches(wgsl, /var<storage, read_write>/g),
      readOnly: countMatches(wgsl, /var<storage, read>/g),
      hasNeighbourRead: wgsl.includes(partner),
      hasBoundsGuard: /if \( instanceIndex >= .+ \) \{ return; \}/.test(wgsl),
      // Dallanma yok: morph maliyetinin sabit çıkması buna bağlı.
      branchless: countMatches(wgsl, /\bif\s*\(/g) === 1,
    },
    glslOn: {
      lines: countLines(glslOn),
      samplers: countMatches(glslOn, /uniform highp sampler2D/g),
      hasTexelFetch: glslOn.includes("texelFetch"),
    },
    glslBroken: {
      lines: countLines(glslBroken),
      samplers: countMatches(glslBroken, /uniform highp sampler2D/g),
      hasTexelFetch: glslBroken.includes("texelFetch"),
    },
    glslOff: {
      lines: countLines(glslOff),
      samplers: countMatches(glslOff, /uniform highp sampler2D/g),
      hasTexelFetch: glslOff.includes("texelFetch"),
    },
  };
}

// vite-node altında `process.argv` yalnız [node, vite-node] içeriyor — giriş dosyasının
// adı orada yok. Bu yüzden "doğrudan mı çalıştırıldım" sorusunu tersinden soruyoruz:
// vitest bu modülü import ettiğinde `VITEST` dolu olur ve döküm yan etkisi çalışmaz.
if (process.env.VITEST === undefined) {
  await main();
}
