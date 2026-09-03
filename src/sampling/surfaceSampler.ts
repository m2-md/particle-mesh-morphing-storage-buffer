import { Vector3 } from "three";
import type { BufferGeometry } from "three";

export interface SurfaceSampler {
  readonly triangleCount: number;
  readonly totalArea: number;
  /** rng(): [0,1) — passed externally so it can be seeded. */
  sample(rng: () => number, target: Vector3): Vector3;
}

export function buildSurfaceSampler(geometry: BufferGeometry): SurfaceSampler {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const triangleCount = index ? index.count / 3 : position.count / 3;

  // Cumulative sum in Float64: with 32-bit floats, summing tens of thousands
  // of small areas starts swallowing increments near the end and makes final triangles unselectable.
  const cumulative = new Float64Array(triangleCount);

  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const ab = new Vector3();
  const ac = new Vector3();
  const cross = new Vector3();

  const vertexOf = (triangle: number, corner: number): number =>
    index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner;

  let total = 0;
  for (let t = 0; t < triangleCount; t++) {
    a.fromBufferAttribute(position, vertexOf(t, 0));
    b.fromBufferAttribute(position, vertexOf(t, 1));
    c.fromBufferAttribute(position, vertexOf(t, 2));
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    total += cross.crossVectors(ab, ac).length() * 0.5;
    cumulative[t] = total;
  }

  function pickTriangle(x: number): number {
    let lo = 0;
    let hi = triangleCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  return {
    triangleCount,
    totalArea: total,
    sample(rng, target) {
      const t = pickTriangle(rng() * total);

      a.fromBufferAttribute(position, vertexOf(t, 0));
      b.fromBufferAttribute(position, vertexOf(t, 1));
      c.fromBufferAttribute(position, vertexOf(t, 2));

      let u = rng();
      let v = rng();
      if (u + v > 1) {
        u = 1 - u;
        v = 1 - v;
      }

      return target
        .copy(a)
        .addScaledVector(ab.subVectors(b, a), u)
        .addScaledVector(ac.subVectors(c, a), v);
    },
  };
}
