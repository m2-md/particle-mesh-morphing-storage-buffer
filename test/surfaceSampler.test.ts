import { describe, expect, it } from "vitest";
import { BufferAttribute, BufferGeometry, PlaneGeometry, SphereGeometry } from "three";
import { Vector3 } from "three";
import { buildSurfaceSampler } from "../src/sampling/surfaceSampler";
import { buildUniformTriangleSampler } from "../src/sampling/uniformTriangleSampler";
import { mulberry32 } from "../src/sampling/rng";

/**
 * Arşimet'in şapka kutusu teoremi: kürenin iki paralel düzlem arasında kalan
 * kuşağının alanı 2π·r·h. `y > 0.8` kepi için h = 0,2, toplam 4π·r².
 * Oran = 2π·1·0,2 / 4π = h / (2r) = 0,1.
 */
const POLAR_CAP_ANALYTIC = 0.1;

describe("alan-ağırlıklı örnekleme", () => {
  it("toplam alan 4π'ye ALTTAN yakınsar", () => {
    const coarse = buildSurfaceSampler(new SphereGeometry(1, 16, 8)).totalArea;
    const fine = buildSurfaceSampler(new SphereGeometry(1, 128, 64)).totalArea;
    const exact = 4 * Math.PI;

    expect(coarse).toBeLessThan(exact);
    expect(fine).toBeLessThan(exact);
    expect(exact - fine).toBeLessThan(exact - coarse);
    expect(fine).toBeGreaterThan(exact * 0.999);
  });

  it("kutup kepine düşen oran Arşimet'in verdiği sayıya yaklaşır", () => {
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

  it("aynı tohum aynı bulutu verir", () => {
    const sampler = buildSurfaceSampler(new SphereGeometry(1, 32, 16));
    const a = new Vector3();
    const b = new Vector3();
    sampler.sample(mulberry32(7), a);
    sampler.sample(mulberry32(7), b);
    expect(a.equals(b)).toBe(true);
  });

  it("tek üçgende toplam alan analitik değere eşit", () => {
    const geometry = new BufferGeometry();
    // (0,0,0) (1,0,0) (0,1,0) -> alan 0,5
    geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
    );
    const sampler = buildSurfaceSampler(geometry);
    expect(sampler.triangleCount).toBe(1);
    expect(sampler.totalArea).toBeCloseTo(0.5, 10);
  });

  it("üçgen sayısı indexed geometride index/3", () => {
    const geometry = new SphereGeometry(1, 64, 32);
    const index = geometry.getIndex();
    expect(index).not.toBeNull();
    expect(buildSurfaceSampler(geometry).triangleCount).toBe(index!.count / 3);
  });

  it("non-indexed geometride de çalışır", () => {
    const geometry = new PlaneGeometry(2, 2, 1, 1).toNonIndexed();
    expect(geometry.getIndex()).toBeNull();

    const sampler = buildSurfaceSampler(geometry);
    expect(sampler.triangleCount).toBe(2);
    expect(sampler.totalArea).toBeCloseTo(4, 6);

    const rng = mulberry32(3);
    const p = new Vector3();
    for (let i = 0; i < 500; i++) {
      sampler.sample(rng, p);
      expect(Math.abs(p.z)).toBeLessThan(1e-6); // düzlem z = 0
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1 + 1e-6);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it("üretilen nokta küre yüzeyinde: yarıçap 1'e yakın", () => {
    const sampler = buildSurfaceSampler(new SphereGeometry(1, 128, 64));
    const rng = mulberry32(11);
    const p = new Vector3();
    for (let i = 0; i < 20_000; i++) {
      sampler.sample(rng, p);
      expect(p.length()).toBeGreaterThan(0.999);
      expect(p.length()).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it("üçgen başına DÜZGÜN seçim kutupları şişiriyor: analitik sayının çok üstünde", () => {
    const sampler = buildUniformTriangleSampler(new SphereGeometry(1, 64, 32));
    const rng = mulberry32(42);
    const p = new Vector3();
    const N = 200_000;

    let cap = 0;
    for (let i = 0; i < N; i++) {
      sampler.sample(rng, p);
      if (p.y > 0.8) cap++;
    }

    // Beklenti testi: yanlış örnekleyici 0,1 bandını AŞMALI.
    expect(cap / N).toBeGreaterThan(0.15);
    expect(cap / N).toBeGreaterThan(POLAR_CAP_ANALYTIC * 1.5);
  });

  it("iki örnekleyici de aynı toplam alanı hesaplıyor", () => {
    const geometry = new SphereGeometry(1, 32, 16);
    expect(buildUniformTriangleSampler(geometry).totalArea).toBeCloseTo(
      buildSurfaceSampler(geometry).totalArea,
      10,
    );
  });
});
