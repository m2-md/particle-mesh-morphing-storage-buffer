import { REVISION } from "three";
import { createApp, type ParticleApp } from "./app";
import { createHud, type Hud } from "./hud";
import { backingSize } from "./viewport";
import { runMeasurement } from "./measure/run";
import type { BondMode } from "./sim/simulation";
import "./style.css";

const THREE_VERSION = `0.${REVISION}.1`;

const params = new URLSearchParams(location.search);
const forceWebGL = params.get("backend") === "webgl2";
const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;

if (params.get("measure") === "1") {
  document.body.classList.add("measuring");
  void runMeasurement(canvas, { forceWebGL, three: THREE_VERSION }).then((report) => {
    console.log("MEASURE " + JSON.stringify(report));
    const done = document.querySelector<HTMLElement>("#measure-status");
    if (done !== null) done.textContent = "MEASURE tamam — konsola bakın.";
  });
} else {
  void boot();
}

const MORPH_STEP = 1 / 90; // kare başına sabit adım; duvar saati ölçüme girmiyor

async function boot(): Promise<void> {
  const hudRoot = document.querySelector<HTMLElement>("#hud")!;
  const countButtons = document.querySelectorAll<HTMLButtonElement>("#count button");
  const morphButton = document.querySelector<HTMLButtonElement>("#morph")!;
  const bondSelect = document.querySelector<HTMLSelectElement>("#bond")!;
  const scaleSelect = document.querySelector<HTMLSelectElement>("#scale")!;
  const toggleButton = document.querySelector<HTMLButtonElement>("#toggle")!;
  const backendLink = document.querySelector<HTMLAnchorElement>("#backend")!;

  const hud: Hud = createHud(hudRoot);
  const app: ParticleApp = await createApp({ canvas, forceWebGL, count: 100_000, bond: "on" });

  let running = true;
  let frameId = 0;
  let scale = Number(scaleSelect.value);
  let morphDirection = 0; // açılışta küre; geçişi Morph düğmesi tetikliyor
  let morphT = 0;
  let backing = { width: 0, height: 0 };

  let frames = 0;
  let fpsWindowStart = performance.now();
  let fps = 0;
  let frameMs = 0;
  let computeMs: number | null = null;
  let renderMs: number | null = null;
  let timingPending = false;

  backendLink.textContent = app.backend === "webgpu" ? "WebGL2'ye geç" : "WebGPU'ya geç";
  backendLink.href = app.backend === "webgpu" ? "?backend=webgl2" : "?backend=webgpu";

  if (!app.timestampsAvailable) {
    hud.note("GPU zaman damgası yok: compute/render sütunları boş kalıyor.");
  }

  function applySize(): void {
    const rect = canvas.getBoundingClientRect();
    backing = backingSize(rect.width, rect.height, window.devicePixelRatio, scale);
    app.resize(backing.width, backing.height);
  }

  applySize();
  window.addEventListener("resize", applySize);

  function stats() {
    return {
      backend: app.backend === "webgpu" ? "WebGPU" : "WebGL2",
      particles: app.count.toLocaleString("tr-TR"),
      bond: bondLabel(app.bond),
      buffer: `${backing.width}×${backing.height}`,
      scale: scale.toFixed(2),
      fps,
      frameMs,
      computeMs,
      renderMs,
      vram: app.vramLabel(),
      rebuildMs: `${app.lastRebuild.totalMs.toFixed(1)} ms (örnekleme ${app.lastRebuild.sampleMs.toFixed(1)})`,
    };
  }

  function morphAdvance(): void {
    morphT += MORPH_STEP * morphDirection;
    if (morphT >= 1) {
      morphT = 1;
      morphDirection = 0;
    } else if (morphT <= 0) {
      morphT = 0;
      morphDirection = 0;
    }
    app.setMorphT(morphT);
  }

  function frame(): void {
    frameId = requestAnimationFrame(frame);

    morphAdvance();
    frameMs = app.renderFrame();

    frames++;
    const now = performance.now();
    if (now - fpsWindowStart >= 500) {
      fps = (frames * 1000) / (now - fpsWindowStart);
      frames = 0;
      fpsWindowStart = now;
    }

    if (!timingPending && app.timestampsAvailable) {
      timingPending = true;
      void app.timings().then((t) => {
        computeMs = t.computeMs;
        renderMs = t.renderMs;
        timingPending = false;
      });
    }

    hud.update(stats());
  }

  function setRunning(next: boolean): void {
    if (next === running) return;
    running = next;
    toggleButton.textContent = running ? "Dur" : "Devam";
    if (running) frameId = requestAnimationFrame(frame);
    else cancelAnimationFrame(frameId);
  }

  toggleButton.addEventListener("click", () => setRunning(!running));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) setRunning(false);
  });

  morphButton.addEventListener("click", () => {
    morphDirection = morphT >= 0.5 ? -1 : 1;
  });

  for (const button of countButtons) {
    button.addEventListener("click", () => {
      const next = Number(button.dataset.count);
      hud.note("yeniden kuruluyor…");
      void app.rebuild(next, app.bond).then((timing) => {
        for (const b of countButtons) b.classList.toggle("active", b === button);
        morphT = 0;
        morphDirection = 0;
        app.setMorphT(0);
        hud.note(
          `${next.toLocaleString("tr-TR")} parçacık: örnekleme ${timing.sampleMs.toFixed(1)} ms, ` +
            `kurulum ${timing.setupMs.toFixed(1)} ms, toplam ${timing.totalMs.toFixed(1)} ms`,
        );
      });
    });
  }

  bondSelect.addEventListener("change", () => {
    const next = bondSelect.value as BondMode;
    void app.rebuild(app.count, next).then(() => {
      morphT = 0;
      morphDirection = 0;
      app.setMorphT(0);
      hud.note(
        next === "broken"
          ? "Eş bağı açık ama setPBO YOK. WebGL2'de bağ sessizce kayboluyor; WebGPU'da fark yok."
          : null,
      );
    });
  });

  scaleSelect.addEventListener("change", () => {
    scale = Number(scaleSelect.value);
    applySize();
  });

  frameId = requestAnimationFrame(frame);
}

function bondLabel(bond: BondMode): string {
  if (bond === "off") return "Kapalı";
  if (bond === "on") return "Açık (PBO)";
  return "Açık (PBO'suz)";
}
