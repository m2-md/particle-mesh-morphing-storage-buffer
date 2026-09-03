import { Color, PerspectiveCamera, Scene } from "three";
import { WebGPURenderer } from "three/webgpu";
import { instancedArray, instanceIndex, Fn, vec3 } from "three/tsl";
import { backendName } from "./backendName";
import { createSourceGeometry, createTargetGeometry } from "./geometry";
import { sampleGeometry } from "./sampling/sampleGeometry";
import { createSimulation, type BondMode, type Simulation } from "./sim/simulation";
import { createParticles } from "./sim/renderable";
import { bufferReport, toMb, vramTable, type BufferReport } from "./measure/vram";
import { readTimestamps, hasTimestamps } from "./measure/gpuTimer";

/** Delta-zaman YOK: ölçüm modunun deterministik olması buna bağlı. */
export const SUBSTEPS = 2;
export const SOURCE_SEED = 1;
export const TARGET_SEED = 2;

export interface AppOptions {
  canvas: HTMLCanvasElement;
  forceWebGL: boolean;
  count: number;
  bond: BondMode;
  /**
   * Zaman damgası havuzu 2048 sorguda doluyor ve çözülmezse three uyarı basıyor.
   * Uzun compute serileri (checksum bloğu) için kapatılıyor.
   */
  trackTimestamp?: boolean;
}

interface Disposable {
  dispose(): void;
}

export interface RebuildTiming {
  sampleMs: number;
  setupMs: number;
  totalMs: number;
}

export interface FrameTiming {
  cpuMs: number;
  computeMs: number | null;
  renderMs: number | null;
}

export async function createApp(options: AppOptions) {
  const { canvas, forceWebGL } = options;

  const renderer = new WebGPURenderer({
    canvas,
    forceWebGL,
    antialias: false,
    trackTimestamp: options.trackTimestamp ?? true,
  });
  await renderer.init();

  // `forceWebGL: true` HİÇBİR uyarı basmıyor; hangi yolda olduğumuzu kendimiz soruyoruz.
  const backend = backendName(renderer);

  const scene = new Scene();
  scene.background = new Color(0x05070d);

  const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 100);
  camera.position.set(0, 0.6, 3.6);
  camera.lookAt(0, 0, 0);

  const sourceGeometry = createSourceGeometry();
  const targetGeometry = createTargetGeometry();

  let count = options.count;
  let bond = options.bond;
  let sim: Simulation | null = null;
  let particles: ReturnType<typeof createParticles> | null = null;
  let lastRebuild: RebuildTiming = { sampleMs: 0, setupMs: 0, totalMs: 0 };

  async function rebuild(nextCount: number, nextBond: BondMode): Promise<RebuildTiming> {
    count = nextCount;
    bond = nextBond;

    const sampleStart = performance.now();
    const source = sampleGeometry(sourceGeometry, count, SOURCE_SEED).data;
    const target = sampleGeometry(targetGeometry, count, TARGET_SEED).data;
    const sampleMs = performance.now() - sampleStart;

    const setupStart = performance.now();
    if (particles !== null) {
      scene.remove(particles);
      particles.material.dispose();
    }
    // Eski compute node'larını AT. `Renderer.compute()` her ComputeNode için bir
    // `dispose` dinleyicisi kuruyor (Renderer.js:2769) ve pipeline/binding
    // önbelleğini o dinleyici temizliyor. Atmazsak WebGL2 yolunda `init`
    // programı (kaynağı sayıdan bağımsız, yani birebir aynı) önbellekten
    // dönüyor ve VAO'da HÂLÂ eski, küçük tampon bağlı kalıyor:
    // `glDrawArraysInstanced: Vertex buffer is not big enough for the draw call.`
    if (sim !== null) {
      (sim.init as unknown as Disposable).dispose();
      (sim.step as unknown as Disposable).dispose();
    }
    sim = createSimulation({ count, source, target, bond });
    particles = createParticles(sim.positionBuffer, count);
    scene.add(particles);
    await renderer.computeAsync(sim.init);
    const setupMs = performance.now() - setupStart;

    lastRebuild = { sampleMs, setupMs, totalMs: sampleMs + setupMs };
    return lastRebuild;
  }

  await rebuild(count, bond);

  function requireSim(): Simulation {
    if (sim === null) throw new Error("simülasyon kurulmadı");
    return sim;
  }

  return {
    renderer,
    backend,
    scene,
    camera,
    get count() {
      return count;
    },
    get bond() {
      return bond;
    },
    get simulation() {
      return requireSim();
    },
    get lastRebuild() {
      return lastRebuild;
    },
    timestampsAvailable: hasTimestamps(renderer),

    rebuild,

    setMorphT(t: number): void {
      requireSim().morphT.value = t;
    },

    getMorphT(): number {
      return requireSim().morphT.value as number;
    },

    resize(width: number, height: number): void {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },

    /** Bir kare: sabit alt adım sayısı kadar compute, sonra render. */
    renderFrame(): number {
      const current = requireSim();
      const start = performance.now();
      for (let i = 0; i < SUBSTEPS; i++) renderer.compute(current.step);
      renderer.render(scene, camera);
      return performance.now() - start;
    },

    async timings(): Promise<{ computeMs: number | null; renderMs: number | null }> {
      return readTimestamps(renderer);
    },

    /** Yalnız compute; ölçüm modunun checksum bloğu bunu kullanıyor. */
    step(times: number): void {
      const current = requireSim();
      for (let i = 0; i < times; i++) renderer.compute(current.step);
    },

    /**
     * Konum tamponunu GPU'dan geri okur. WebGL2 yolunda three tamponu PBO
     * dokusuna sığdırmak için BÜYÜTÜYOR (100.000 vec4 -> 100.352); iki backend'in
     * özetleri kıyaslanabilsin diye ilk `count * 4` elemanı kesiyoruz.
     */
    async readPositions(): Promise<Float32Array> {
      const data = (await renderer.getArrayBufferAsync(
        requireSim().positionBuffer.value as never,
      )) as ArrayBuffer;
      return new Float32Array(data, 0, count * 4);
    },

    vramLabel(): string {
      return `${toMb(vramTable(count).totalBytes)} MB`;
    },

    dispose(): void {
      if (particles !== null) {
        scene.remove(particles);
        particles.material.dispose();
      }
      renderer.dispose();
    },
  };
}

export type ParticleApp = Awaited<ReturnType<typeof createApp>>;

/**
 * `vec3` dolgusunun kanıtı. Uygulamanın kendi tamponları `vec4`; bu tampon
 * yalnız ölçüm için açılıyor ve simülasyona girmiyor.
 * three ilk kullanımda `itemSize`'ı 3'ten 4'e YERİNDE çeviriyor.
 */
export async function probeVec3Padding(renderer: WebGPURenderer): Promise<{
  probe: string;
  beforeFirstFrame: BufferReport;
  afterFirstFrame: BufferReport;
}> {
  const probe = instancedArray(1024, "vec3").setName("probeVec3");
  const before = bufferReport(probe as never);

  const kernel = Fn(() => {
    probe.element(instanceIndex).assign(vec3(1, 2, 3));
  })().compute(1024);

  await renderer.computeAsync(kernel);

  return { probe: "vec3", beforeFirstFrame: before, afterFirstFrame: bufferReport(probe as never) };
}

export type { FrameTiming as AppFrameTiming };
