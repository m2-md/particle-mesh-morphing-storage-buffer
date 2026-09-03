import { describe, expect, it } from "vitest";
import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import { buildSurfaceSampler } from "../src/sampling/surfaceSampler";

/**
 * `pickTriangle` is a closure; tested via sampling.
 * `sample` uses first `rng()` call for `x = rng() * total`, remaining
 * two for barycentric coords. With a scripted rng, which triangle
 * was picked can be deduced from generated point position.
 */
function scriptedRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

/** Two equal-area (0.5) triangles: one at y≈0, other at y≈10. */
function twoTriangles(): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions = new Float32Array([
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    // second triangle 10 units up
    0, 10, 0, 1, 10, 0, 0, 11, 0,
  ]);
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  return geometry;
}

function pickedTriangle(rngValues: number[]): number {
  const sampler = buildSurfaceSampler(twoTriangles());
  const p = new Vector3();
  sampler.sample(scriptedRng(rngValues), p);
  return p.y > 5 ? 1 : 0;
}

describe("triangle selection via binary search", () => {
  it("total area of two triangles is 1", () => {
    expect(buildSurfaceSampler(twoTriangles()).totalArea).toBeCloseTo(1, 10);
  });

  it("x = 0 selects first triangle", () => {
    expect(pickedTriangle([0, 0.1, 0.1])).toBe(0);
  });

  it("x nearing total selects last triangle", () => {
    expect(pickedTriangle([0.999999, 0.1, 0.1])).toBe(1);
  });

  it("value exactly on cumulative boundary does not advance to next triangle", () => {
    // total = 1, cumulative[0] = 0.5. x = 0.5 -> `cumulative[0] < x` false -> 0.
    expect(pickedTriangle([0.5, 0.1, 0.1])).toBe(0);
  });

  it("just above boundary transitions to next triangle", () => {
    expect(pickedTriangle([0.5 + 1e-9, 0.1, 0.1])).toBe(1);
  });

  it("barycentric folding keeps point inside triangle", () => {
    const sampler = buildSurfaceSampler(twoTriangles());
    const p = new Vector3();
    // u + v > 1 pair: folding takes effect.
    sampler.sample(scriptedRng([0, 0.9, 0.8]), p);
    // After folding u = 0.1, v = 0.2 -> point (0.1, 0.2, 0)
    expect(p.x).toBeCloseTo(0.1, 6);
    expect(p.y).toBeCloseTo(0.2, 6);
    expect(p.x + p.y).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("remains inside triangle without folding", () => {
    const sampler = buildSurfaceSampler(twoTriangles());
    const p = new Vector3();
    sampler.sample(scriptedRng([0, 0.25, 0.25]), p);
    expect(p.x).toBeCloseTo(0.25, 6);
    expect(p.y).toBeCloseTo(0.25, 6);
  });

  it("area-weighted selection: larger triangle receives more points", () => {
    // Triangle 0 area 0.5; triangle 1 area 4.5 (3x scaled) -> ratio 1:9
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(
        new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 10, 0, 3, 10, 0, 0, 13, 0]),
        3,
      ),
    );
    const sampler = buildSurfaceSampler(geometry);
    expect(sampler.totalArea).toBeCloseTo(5, 10);

    const p = new Vector3();
    let big = 0;
    const N = 20_000;
    for (let i = 0; i < N; i++) {
      // Uniform x scan: directly measuring area ratio.
      sampler.sample(scriptedRng([i / N, 0.1, 0.1]), p);
      if (p.y > 5) big++;
    }
    expect(big / N).toBeGreaterThan(0.88);
    expect(big / N).toBeLessThan(0.92);
  });
});
