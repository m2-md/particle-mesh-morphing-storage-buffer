/**
 * CPU ölçümleri — GPU YOK, tarayıcı YOK. `npm run bench`.
 * Tek satır `BENCH {json}` basar; makaledeki CPU tabloları buradan doluyor.
 */
import { BufferAttribute, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from "three";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { buildSurfaceSampler } from "../src/sampling/surfaceSampler";
import { buildUniformTriangleSampler } from "../src/sampling/uniformTriangleSampler";
import { mulberry32 } from "../src/sampling/rng";
import { vramTable } from "../src/measure/vram";
import { median, round } from "../src/stats";
import { readThreeVersion } from "./threeVersion";

/**
 * `setRandomGenerator` r185 kaynağında var (`MeshSurfaceSampler.js:162`) ama
 * `@types/three` bildirmiyor. Tohumlanabilirlik olmadan kıyas tekrarlanamaz.
 */
type SeedableSampler = MeshSurfaceSampler & {
  setRandomGenerator(fn: () => number): MeshSurfaceSampler & SeedableSampler;
};

function seedable(sampler: MeshSurfaceSampler): SeedableSampler {
  return sampler as SeedableSampler;
}

const SEGMENTS = [16, 32, 64, 128];
const COUNTS = [100_000, 200_000, 500_000];
const RUNS = 3;
const CAP_SAMPLES = 200_000;

function timeIt(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

function areaConvergence() {
  return SEGMENTS.map((s) => {
    const geometry = new SphereGeometry(1, s, s / 2);
    const sampler = buildSurfaceSampler(geometry);
    const exact = 4 * Math.PI;
    return {
      segments: `${s}x${s / 2}`,
      triangles: sampler.triangleCount,
      totalArea: round(sampler.totalArea, 4),
      deviationPct: round(((exact - sampler.totalArea) / exact) * 100, 3),
    };
  });
}

function polarCapRatio(sampler: { sample(rng: () => number, t: Vector3): Vector3 }): number {
  const rng = mulberry32(42);
  const p = new Vector3();
  let cap = 0;
  for (let i = 0; i < CAP_SAMPLES; i++) {
    sampler.sample(rng, p);
    if (p.y > 0.8) cap++;
  }
  return cap / CAP_SAMPLES;
}

/**
 * `setWeightAttribute` tuzağı: köşe başına ağırlık, üçgenin ağırlığı köşelerinin
 * ortalaması. Ekvatoru kesen üçgenler ortalama ağırlıkla seçilmeye devam ediyor.
 */
function weightTrap() {
  const geometry = new SphereGeometry(1, 64, 32);
  const position = geometry.getAttribute("position");
  const weight = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) weight[i] = position.getY(i) > 0 ? 1 : 0;
  geometry.setAttribute("weight", new BufferAttribute(weight, 1));

  const mesh = new Mesh(geometry, new MeshBasicMaterial());
  const sampler = seedable(new MeshSurfaceSampler(mesh))
    .setWeightAttribute("weight")
    .setRandomGenerator(mulberry32(42))
    .build();

  const p = new Vector3();
  let upper = 0;
  for (let i = 0; i < CAP_SAMPLES; i++) {
    sampler.sample(p);
    if (p.y > 0) upper++;
  }
  return { segments: "64x32", upperHalfRatio: round(upper / CAP_SAMPLES, 5), samples: CAP_SAMPLES };
}

function samplingSpeed() {
  const geometry = new SphereGeometry(1, 64, 32);
  const mesh = new Mesh(geometry, new MeshBasicMaterial());

  return COUNTS.map((count) => {
    const cdfRuns: number[] = [];
    const mssRuns: number[] = [];

    for (let r = 0; r < RUNS; r++) {
      const cdf = buildSurfaceSampler(geometry);
      const rng = mulberry32(1 + r);
      const p = new Vector3();
      cdfRuns.push(
        round(
          timeIt(() => {
            for (let i = 0; i < count; i++) cdf.sample(rng, p);
          }),
          2,
        ),
      );

      const mss = seedable(new MeshSurfaceSampler(mesh))
        .setRandomGenerator(mulberry32(1 + r))
        .build();
      const q = new Vector3();
      mssRuns.push(
        round(
          timeIt(() => {
            for (let i = 0; i < count; i++) mss.sample(q);
          }),
          2,
        ),
      );
    }

    const cdfMs = median(cdfRuns);
    const mssMs = median(mssRuns);
    return {
      count,
      cdfMs: round(cdfMs, 2),
      cdfNsPerPoint: round((cdfMs * 1e6) / count, 1),
      mssMs: round(mssMs, 2),
      mssNsPerPoint: round((mssMs * 1e6) / count, 1),
      runs: { cdf: cdfRuns, mss: mssRuns },
    };
  });
}

function cdfSetup() {
  const geometry = new SphereGeometry(1, 64, 32);
  const runs: number[] = [];
  let triangles = 0;
  for (let r = 0; r < RUNS; r++) {
    runs.push(
      round(
        timeIt(() => {
          triangles = buildSurfaceSampler(geometry).triangleCount;
        }),
        3,
      ),
    );
  }
  return { triangles, ms: round(median(runs), 3), runs };
}

async function main(): Promise<void> {
  const sphere = new SphereGeometry(1, 64, 32);

  const report = {
    node: process.version,
    three: await readThreeVersion(),
    area: areaConvergence(),
    polarCap: {
      cdf: round(polarCapRatio(buildSurfaceSampler(sphere)), 5),
      uniformTriangle: round(polarCapRatio(buildUniformTriangleSampler(sphere)), 5),
      // Arşimet: kuşak alanı 2π·r·h = 2π·1·0,2 = 0,4π; toplam 4π. Oran h/(2r) = 0,1.
      analytic: 0.1,
      samples: CAP_SAMPLES,
    },
    weightTrap: weightTrap(),
    sampling: samplingSpeed(),
    cdfSetup: cdfSetup(),
    vram: COUNTS.map((count) => vramTable(count)),
  };

  console.log("BENCH " + JSON.stringify(report));
}

await main();
