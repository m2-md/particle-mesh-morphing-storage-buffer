import { createApp, probeVec3Padding, SUBSTEPS, type ParticleApp } from "../app";
import type { BondMode } from "../sim/simulation";
import { median, percentile, round } from "../stats";
import { positionChecksum } from "./checksum";
import type { BufferReport } from "./vram";

export const MEASURE_WIDTH = 960;
export const MEASURE_HEIGHT = 540;
export const WARMUP_FRAMES = 60;
export const MEASURE_FRAMES = 180;
export const CHECKSUM_STEPS = 240;
export const COUNTS = [100_000, 200_000, 500_000];

interface Band {
  median: number;
  p95: number;
}

interface SpeedRow {
  count: number;
  compute: Band | null;
  render: Band | null;
  frame: Band;
  cpu: Band;
}

export interface MeasureReport {
  backend: "webgpu" | "webgl2";
  forcedWebGL: boolean;
  adapter: string;
  three: string;
  timestamps: boolean;
  backing: { width: number; height: number };
  warmup: number;
  frames: number;
  substeps: number;
  speed: SpeedRow[];
  bond: {
    off: { computeMedian: number | null; cpuMedian: number };
    on: { computeMedian: number | null; cpuMedian: number };
    deltaMs: number | null;
  };
  morph: {
    t0: { computeMedian: number | null; cpuMedian: number };
    t05: { computeMedian: number | null; cpuMedian: number };
    t1: { computeMedian: number | null; cpuMedian: number };
  };
  checksum: {
    count: number;
    steps: number;
    off: number;
    on: number;
    broken: number;
    /** Every configuration runs twice; true if both are equal. */
    repeatable: { off: boolean; on: boolean; broken: boolean };
    brokenEqualsOff: boolean;
    brokenEqualsOn: boolean;
    maxAbsDiffBrokenOff: number;
    maxAbsDiffBrokenOn: number;
    maxAbsDiffOnOff: number;
  };
  rebuild: Array<{
    count: number;
    sampleMs: number;
    setupMs: number;
    totalMs: number;
    secondRunMs: number;
  }>;
  buffer: {
    probe: string;
    beforeFirstFrame: BufferReport;
    afterFirstFrame: BufferReport;
  };
}

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame((t) => resolve(t)));
}

function band(values: number[]): Band {
  return { median: round(median(values), 4), p95: round(percentile(values, 95), 4) };
}

interface BlockResult {
  compute: Band | null;
  render: Band | null;
  frame: Band;
  cpu: Band;
}

async function runBlock(app: ParticleApp, warmup: number, frames: number): Promise<BlockResult> {
  const computeSamples: number[] = [];
  const renderSamples: number[] = [];
  const frameSamples: number[] = [];
  const cpuSamples: number[] = [];

  let previous = await nextFrame();
  for (let i = 0; i < warmup; i++) {
    app.renderFrame();
    previous = await nextFrame();
  }
  await app.timings(); // warmup samples excluded

  for (let i = 0; i < frames; i++) {
    cpuSamples.push(app.renderFrame());
    const now = await nextFrame();
    frameSamples.push(now - previous);
    previous = now;

    const timings = await app.timings();
    if (timings.computeMs !== null) computeSamples.push(timings.computeMs);
    if (timings.renderMs !== null) renderSamples.push(timings.renderMs);
  }

  return {
    compute: computeSamples.length > 0 ? band(computeSamples) : null,
    render: renderSamples.length > 0 ? band(renderSamples) : null,
    frame: band(frameSamples),
    cpu: band(cpuSamples),
  };
}

/**
 * Every configuration runs in its OWN renderer: readback of a re-instantiated
 * simulation in the same session hits caching issues in three's WebGL2 path.
 * `trackTimestamp` is disabled because 240 consecutive compute queries exhaust the pool
 * (2048 queries) and trigger warnings; this block does not need timing anyway.
 */
async function checksumFor(
  forceWebGL: boolean,
  count: number,
  bond: BondMode,
): Promise<Float32Array> {
  const canvas = document.createElement("canvas");
  const app = await createApp({ canvas, forceWebGL, count, bond, trackTimestamp: false });
  app.resize(64, 64);
  app.step(CHECKSUM_STEPS);
  const data = await app.readPositions();
  app.dispose();
  return data;
}

function maxAbsDiff(a: Float32Array, b: Float32Array): number {
  let worst = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > worst) worst = d;
  }
  return worst;
}

/**
 * Deterministic measurement run (`?measure=1&backend=…`).
 * Interaction disabled, back buffer locked to 960×540, fixed seeds,
 * morph animation disabled. Emits single line to console at conclusion.
 */
export async function runMeasurement(
  canvas: HTMLCanvasElement,
  options: { forceWebGL: boolean; three: string },
): Promise<MeasureReport> {
  const app = await createApp({
    canvas,
    forceWebGL: options.forceWebGL,
    count: COUNTS[0],
    bond: "on",
  });
  app.resize(MEASURE_WIDTH, MEASURE_HEIGHT);
  app.setMorphT(0);

  // 1. Speed
  const speed: SpeedRow[] = [];
  for (const count of COUNTS) {
    await app.rebuild(count, "on");
    app.setMorphT(0);
    const result = await runBlock(app, WARMUP_FRAMES, MEASURE_FRAMES);
    speed.push({ count, ...result });
  }

  // 2. Bond cost
  await app.rebuild(COUNTS[0], "off");
  app.setMorphT(0);
  const bondOff = await runBlock(app, WARMUP_FRAMES, MEASURE_FRAMES);
  await app.rebuild(COUNTS[0], "on");
  app.setMorphT(0);
  const bondOn = await runBlock(app, WARMUP_FRAMES, MEASURE_FRAMES);

  // 3. Morph cost — same kernel, only uniform changes.
  const morphBlocks: BlockResult[] = [];
  for (const t of [0, 0.5, 1]) {
    app.setMorphT(t);
    morphBlocks.push(await runBlock(app, WARMUP_FRAMES, MEASURE_FRAMES));
  }

  // 4. Checksum — no timing, purely outcome. Every configuration runs twice:
  // In WebGPU without synchronization between partner read/write, outcome may vary across runs.
  // Repeatability is measured, not assumed.
  const wgl = options.forceWebGL;
  const off = await checksumFor(wgl, COUNTS[0], "off");
  const offRepeat = await checksumFor(wgl, COUNTS[0], "off");
  const on = await checksumFor(wgl, COUNTS[0], "on");
  const onRepeat = await checksumFor(wgl, COUNTS[0], "on");
  const broken = await checksumFor(wgl, COUNTS[0], "broken");
  const brokenRepeat = await checksumFor(wgl, COUNTS[0], "broken");
  const checksumOff = positionChecksum(off);
  const checksumOn = positionChecksum(on);
  const checksumBroken = positionChecksum(broken);

  // 5. Rebuild stall — first run is cold compile, second run is cached.
  const rebuild: MeasureReport["rebuild"] = [];
  for (const count of COUNTS) {
    const first = await app.rebuild(count, "on");
    const second = await app.rebuild(count, "on");
    rebuild.push({
      count,
      sampleMs: round(first.sampleMs, 2),
      setupMs: round(first.setupMs, 2),
      totalMs: round(first.totalMs, 2),
      secondRunMs: round(second.totalMs, 2),
    });
  }

  // 6. vec3 padding verification
  const buffer = await probeVec3Padding(app.renderer);

  const report: MeasureReport = {
    backend: app.backend,
    forcedWebGL: options.forceWebGL,
    adapter: adapterName(app),
    three: options.three,
    timestamps: app.timestampsAvailable,
    backing: { width: MEASURE_WIDTH, height: MEASURE_HEIGHT },
    warmup: WARMUP_FRAMES,
    frames: MEASURE_FRAMES,
    substeps: SUBSTEPS,
    speed,
    bond: {
      off: { computeMedian: bondOff.compute?.median ?? null, cpuMedian: bondOff.cpu.median },
      on: { computeMedian: bondOn.compute?.median ?? null, cpuMedian: bondOn.cpu.median },
      deltaMs:
        bondOff.compute === null || bondOn.compute === null
          ? null
          : round(bondOn.compute.median - bondOff.compute.median, 4),
    },
    morph: {
      t0: {
        computeMedian: morphBlocks[0].compute?.median ?? null,
        cpuMedian: morphBlocks[0].cpu.median,
      },
      t05: {
        computeMedian: morphBlocks[1].compute?.median ?? null,
        cpuMedian: morphBlocks[1].cpu.median,
      },
      t1: {
        computeMedian: morphBlocks[2].compute?.median ?? null,
        cpuMedian: morphBlocks[2].cpu.median,
      },
    },
    checksum: {
      count: COUNTS[0],
      steps: CHECKSUM_STEPS,
      off: checksumOff,
      on: checksumOn,
      broken: checksumBroken,
      repeatable: {
        off: checksumOff === positionChecksum(offRepeat),
        on: checksumOn === positionChecksum(onRepeat),
        broken: checksumBroken === positionChecksum(brokenRepeat),
      },
      brokenEqualsOff: checksumBroken === checksumOff,
      brokenEqualsOn: checksumBroken === checksumOn,
      maxAbsDiffBrokenOff: round(maxAbsDiff(broken, off), 8),
      maxAbsDiffBrokenOn: round(maxAbsDiff(broken, on), 8),
      maxAbsDiffOnOff: round(maxAbsDiff(on, off), 8),
    },
    rebuild,
    buffer,
  };

  app.dispose();
  return report;
}

function adapterName(app: ParticleApp): string {
  interface AdapterInfo {
    vendor?: string;
    architecture?: string;
    description?: string;
  }

  const backend = app.renderer.backend as unknown as {
    adapter?: { info?: AdapterInfo };
    device?: { adapterInfo?: AdapterInfo };
    gl?: WebGL2RenderingContext;
  };

  const info = backend.adapter?.info ?? backend.device?.adapterInfo;
  if (info !== undefined) {
    const parts = [info.vendor, info.architecture, info.description].filter(
      (p) => typeof p === "string" && p.length > 0,
    );
    if (parts.length > 0) return parts.join(" / ");
  }

  const gl = backend.gl;
  if (gl !== undefined) {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (ext !== null) return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  }

  return "unknown";
}
