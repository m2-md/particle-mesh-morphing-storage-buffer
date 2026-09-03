/**
 * REAL simulation kernel dump — no GPU, no browser.
 *
 * `tools/dumpShaders.ts` imports everything under `three/src`; here is the exact opposite:
 * builders come from `three/webgpu`, kernel from `three/tsl`. Both share the same
 * module graph (`build/three.tsl.js` re-exports `three/webgpu`), so no collision.
 * What is prohibited is bringing the two graphs together in a single builder.
 *
 * Benefit: article thesis is tested not on a toy kernel, but on the real `step`
 * kernel executed by the application.
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

/** Sets up a fixed-size simulation for measurement/testing. Touches no GPU. */
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
