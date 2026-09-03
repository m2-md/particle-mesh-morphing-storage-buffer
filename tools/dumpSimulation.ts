/**
 * GERÇEK simülasyon kernel'ının dökümü — GPU YOK, tarayıcı YOK.
 *
 * `tools/dumpShaders.ts` her şeyi `three/src` altından alıyor; burası tam tersi:
 * builder'lar `three/webgpu`'dan, kernel `three/tsl`'den geliyor. İkisi de aynı
 * modül grafiği (`build/three.tsl.js` zaten `three/webgpu`'yu re-export ediyor),
 * o yüzden karışım YOK. Yasak olan, iki grafiği tek builder'da buluşturmak.
 *
 * Kazanç: makalenin tezi oyuncak bir kernel üzerinde değil, uygulamanın
 * gerçekten koşturduğu `step` kernel'ı üzerinde sınanıyor.
 */
import { GLSLNodeBuilder, WGSLNodeBuilder } from "three/webgpu";
import { context, vec3 } from "three/tsl";
import { createSimulation, type BondMode } from "../src/sim/simulation";

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
    contextNode: context(vec3(0)),
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

interface ComputeBuilder {
  build(): void;
  computeShader: string;
}

export const DUMP_COUNT = 1024;

/** Ölçüm/test için sabit boyutlu bir simülasyon kurar. GPU'ya dokunmaz. */
export function buildStepKernel(bond: BondMode) {
  const source = new Float32Array(DUMP_COUNT * 4);
  const target = new Float32Array(DUMP_COUNT * 4);
  return createSimulation({ count: DUMP_COUNT, source, target, bond }).step;
}

export function dumpSimulation(kernel: unknown, isWebGL: boolean): string {
  const Builder = isWebGL ? GLSLNodeBuilder : WGSLNodeBuilder;
  const builder = new Builder(
    kernel as never,
    fakeRenderer(isWebGL) as never,
  ) as unknown as ComputeBuilder;
  builder.build();
  return builder.computeShader;
}
