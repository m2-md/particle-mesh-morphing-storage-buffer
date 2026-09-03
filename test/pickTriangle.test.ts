import { describe, expect, it } from "vitest";
import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import { buildSurfaceSampler } from "../src/sampling/surfaceSampler";

/**
 * `pickTriangle` bir kapanış (closure); dışarı açmadan sınıyoruz.
 * `sample` ilk `rng()` çağrısını `x = rng() * total` için kullanıyor, kalan
 * ikisini barycentric için. Sabit dizi veren bir rng ile hangi üçgenin
 * seçildiğini üretilen noktanın konumundan okuyabiliyoruz.
 */
function scriptedRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

/** İki eşit alanlı (0,5) üçgen: biri y≈0'da, öteki y≈10'da. */
function twoTriangles(): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions = new Float32Array([
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    // ikinci üçgen 10 birim yukarıda
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

describe("binary search ile üçgen seçimi", () => {
  it("iki üçgenin toplam alanı 1", () => {
    expect(buildSurfaceSampler(twoTriangles()).totalArea).toBeCloseTo(1, 10);
  });

  it("x = 0 ilk üçgeni seçer", () => {
    expect(pickedTriangle([0, 0.1, 0.1])).toBe(0);
  });

  it("x total'e dayandığında son üçgeni seçer", () => {
    expect(pickedTriangle([0.999999, 0.1, 0.1])).toBe(1);
  });

  it("kümülatif sınıra TAM denk gelen değer bir sonraki üçgeni seçmez", () => {
    // total = 1, cumulative[0] = 0,5. x = 0,5 -> `cumulative[0] < x` yanlış -> 0.
    expect(pickedTriangle([0.5, 0.1, 0.1])).toBe(0);
  });

  it("sınırın hemen üstü bir sonraki üçgene geçer", () => {
    expect(pickedTriangle([0.5 + 1e-9, 0.1, 0.1])).toBe(1);
  });

  it("barycentric katlama noktayı üçgenin içinde tutuyor", () => {
    const sampler = buildSurfaceSampler(twoTriangles());
    const p = new Vector3();
    // u + v > 1 olan bir çift: katlama devreye giriyor.
    sampler.sample(scriptedRng([0, 0.9, 0.8]), p);
    // Katlama sonrası u = 0,1 · v = 0,2 -> nokta (0,1 · 0,2 · 0)
    expect(p.x).toBeCloseTo(0.1, 6);
    expect(p.y).toBeCloseTo(0.2, 6);
    expect(p.x + p.y).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("katlama olmadan da üçgenin içinde kalıyor", () => {
    const sampler = buildSurfaceSampler(twoTriangles());
    const p = new Vector3();
    sampler.sample(scriptedRng([0, 0.25, 0.25]), p);
    expect(p.x).toBeCloseTo(0.25, 6);
    expect(p.y).toBeCloseTo(0.25, 6);
  });

  it("alanla orantılı seçim: büyük üçgen daha çok nokta alıyor", () => {
    // Üçgen 0 alanı 0,5; üçgen 1 alanı 4,5 (3x büyütülmüş) -> oran 1:9
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
      // Düzgün x taraması: alan oranını doğrudan ölçüyoruz.
      sampler.sample(scriptedRng([i / N, 0.1, 0.1]), p);
      if (p.y > 5) big++;
    }
    expect(big / N).toBeGreaterThan(0.88);
    expect(big / N).toBeLessThan(0.92);
  });
});
