import { Vector3 } from "three";
import type { BufferGeometry } from "three";
import { buildSurfaceSampler } from "./surfaceSampler";
import { mulberry32 } from "./rng";

export interface SampleResult {
  readonly data: Float32Array; // count * 4: x, y, z, phase
  readonly totalArea: number;
  readonly triangleCount: number;
}

export function sampleGeometry(
  geometry: BufferGeometry,
  count: number,
  seed: number,
): SampleResult {
  const sampler = buildSurfaceSampler(geometry);
  const rng = mulberry32(seed);
  const data = new Float32Array(count * 4);
  const p = new Vector3();

  for (let i = 0; i < count; i++) {
    sampler.sample(rng, p);
    data[i * 4 + 0] = p.x;
    data[i * 4 + 1] = p.y;
    data[i * 4 + 2] = p.z;
    data[i * 4 + 3] = rng(); // phase: offset morph per particle
  }

  return {
    data,
    totalArea: sampler.totalArea,
    triangleCount: sampler.triangleCount,
  };
}
