import { describe, expect, it } from "vitest";
import { BufferAttribute, BufferGeometry, PlaneGeometry, SphereGeometry, Vector3 } from "three";
import { buildSurfaceSampler } from "../src/sampling/surfaceSampler";
import { buildUniformTriangleSampler } from "../src/sampling/uniformTriangleSampler";
import { mulberry32 } from "../src/sampling/rng";

/**
 * Archimedes hat-box theorem: the area of a spherical zone between two parallel planes
 * is 2π·r·h. For `y > 0.8` polar cap with h = 0.2, total area 4π·r².
 * Ratio = 2π·1·0.2 / 4π = h / (2r) = 0.1.
 */
const POLAR_CAP_ANALYTIC = 0.1;

describe("area-weighted sampling", () => {
  it("total area converges to 4pi from below", () => {
    const coarse = buildSurfaceSampler(new SphereGeometry(1, 16, 8)).totalArea;
    const fine = buildSurfaceSampler(new SphereGeometry(1, 128, 64)).totalArea;
    const exact = 4 * Math.PI;

    expect(coarse).toBeLessThan(exact);
    expect(fine).toBeLessThan(exact);
    expect(exact - fine).toBeLessThan(exact - coarse);
    expect(fine).toBeGreaterThan(exact * 0.999);
  });

  it("proportion on polar cap approaches Archimedes formula", () => {
    const sampler = buildSurfaceSampler(new SphereGeometry(1, 64, 32));
    const rng = mulberry32(42);
    const p = new Vector3();
    const N = 200_000;

    let cap = 0;
    for (let i = 0; i < N; i++) {
      sampler.sample(rng, p);
      if (p.y > 0.8) cap++;
    }

    // 2π·r·h / 4π·r² = (1 - 0.8) / 2 = 0.1
    expect(cap / N).toBeGreaterThan(0.095);
    expect(cap / N).toBeLessThan(0.105);
  });

  it("same seed yields same cloud", () => {
    const sampler = buildSurfaceSampler(new SphereGeometry(1, 32, 16));
    const a = new Vector3();
    const b = new Vector3();
    sampler.sample(mulberry32(7), a);
    sampler.sample(mulberry32(7), b);
    expect(a.equals(b)).toBe(true);
  });

  it("total area of single triangle equals analytic value", () => {
    const geometry = new BufferGeometry();
    // (0,0,0) (1,0,0) (0,1,0) -> area 0.5
    geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
    );
    const sampler = buildSurfaceSampler(geometry);
    expect(sampler.triangleCount).toBe(1);
    expect(sampler.totalArea).toBeCloseTo(0.5, 10);
  });

  it("triangle count in indexed geometry is index/3", () => {
    const geometry = new SphereGeometry(1, 64, 32);
    const index = geometry.getIndex();
    expect(index).not.toBeNull();
    expect(buildSurfaceSampler(geometry).triangleCount).toBe(index!.count / 3);
  });

  it("operates on non-indexed geometry as well", () => {
    const geometry = new PlaneGeometry(2, 2, 1, 1).toNonIndexed();
    expect(geometry.getIndex()).toBeNull();

    const sampler = buildSurfaceSampler(geometry);
    expect(sampler.triangleCount).toBe(2);
    expect(sampler.totalArea).toBeCloseTo(4, 6);

    const rng = mulberry32(3);
    const p = new Vector3();
    for (let i = 0; i < 500; i++) {
      sampler.sample(rng, p);
      expect(Math.abs(p.z)).toBeLessThan(1e-6); // plane z = 0
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1 + 1e-6);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it("generated point is on sphere surface: radius close to 1", () => {
    const sampler = buildSurfaceSampler(new SphereGeometry(1, 128, 64));
    const rng = mulberry32(11);
    const p = new Vector3();
    for (let i = 0; i < 20_000; i++) {
      sampler.sample(rng, p);
      expect(p.length()).toBeGreaterThan(0.999);
      expect(p.length()).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it("uniform selection per triangle inflates poles far above analytic expectation", () => {
    const sampler = buildUniformTriangleSampler(new SphereGeometry(1, 64, 32));
    const rng = mulberry32(42);
    const p = new Vector3();
    const N = 200_000;

    let cap = 0;
    for (let i = 0; i < N; i++) {
      sampler.sample(rng, p);
      if (p.y > 0.8) cap++;
    }

    // Biased sampler must exceed 0.1 band.
    expect(cap / N).toBeGreaterThan(0.15);
    expect(cap / N).toBeGreaterThan(POLAR_CAP_ANALYTIC * 1.5);
  });

  it("both samplers calculate same total area", () => {
    const geometry = new SphereGeometry(1, 32, 16);
    expect(buildUniformTriangleSampler(geometry).totalArea).toBeCloseTo(
      buildSurfaceSampler(geometry).totalArea,
      10,
    );
  });
});
