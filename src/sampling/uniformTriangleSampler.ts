import { Vector3 } from "three";
import type { BufferGeometry } from "three";
import type { SurfaceSampler } from "./surfaceSampler";

/**
 * CONTROL GROUP — intentionally biased sampler.
 *
 * Only difference is picking triangles with UNIFORM probability rather than area-weighted.
 * For geometry whose triangles shrink near poles (like a sphere), this generates excessive
 * density at poles. Measurement baseline for the "Polar Trap" section of the article.
 * Not used in production; retained solely as a reference in benchmarks and tests.
 */
export function buildUniformTriangleSampler(geometry: BufferGeometry): SurfaceSampler {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const triangleCount = index ? index.count / 3 : position.count / 3;

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
  }

  return {
    triangleCount,
    totalArea: total,
    sample(rng, target) {
      // Area ignored: every triangle selected with equal probability.
      const t = Math.min(triangleCount - 1, Math.floor(rng() * triangleCount));

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
