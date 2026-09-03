/**
 * HUD iki gruba ayrılıyor:
 * - YAPISAL: kurulumun kendisi (parçacık sayısı, eş bağı, arka tampon, ölçek).
 * - ÖLÇÜM: koşarken sayılan şeyler (backend, FPS, kare ms, GPU ms, VRAM).
 * GPU saati yoksa hücreye 0 yazılmaz, "yok" yazılır.
 */
export interface HudReadings {
  backend: string;
  particles: string;
  bond: string;
  buffer: string;
  scale: string;
  fps: number;
  frameMs: number;
  computeMs: number | null;
  renderMs: number | null;
  vram: string;
  rebuildMs: string;
}

export interface Hud {
  update(readings: HudReadings): void;
  note(text: string | null): void;
}

const ROWS: Array<{ key: keyof HudReadings; label: string; group: "YAPISAL" | "ÖLÇÜM" }> = [
  { key: "particles", label: "Parçacık", group: "YAPISAL" },
  { key: "bond", label: "Eş bağı", group: "YAPISAL" },
  { key: "buffer", label: "Arka tampon", group: "YAPISAL" },
  { key: "scale", label: "Çözünürlük ölçeği", group: "YAPISAL" },
  { key: "vram", label: "Tampon toplamı", group: "YAPISAL" },
  { key: "backend", label: "Backend", group: "ÖLÇÜM" },
  { key: "fps", label: "FPS", group: "ÖLÇÜM" },
  { key: "frameMs", label: "Kare (ms)", group: "ÖLÇÜM" },
  { key: "computeMs", label: "Compute GPU (ms)", group: "ÖLÇÜM" },
  { key: "renderMs", label: "Render GPU (ms)", group: "ÖLÇÜM" },
  { key: "rebuildMs", label: "Son kurulum donması", group: "ÖLÇÜM" },
];

export function createHud(root: HTMLElement): Hud {
  const table = document.createElement("table");
  const cells = new Map<keyof HudReadings, HTMLTableCellElement>();

  for (const row of ROWS) {
    const tr = document.createElement("tr");
    const group = document.createElement("td");
    group.className = "group";
    group.textContent = row.group;
    const label = document.createElement("th");
    label.textContent = row.label;
    const value = document.createElement("td");
    value.textContent = "—";
    tr.append(group, label, value);
    table.append(tr);
    cells.set(row.key, value);
  }

  const noteBox = document.createElement("div");
  noteBox.className = "note";
  noteBox.hidden = true;

  root.append(table, noteBox);

  return {
    update(readings) {
      for (const row of ROWS) {
        const cell = cells.get(row.key);
        if (cell === undefined) continue;
        if (row.key === "backend") {
          cell.innerHTML = `<span class="badge">${readings.backend}</span>`;
          continue;
        }
        cell.textContent = format(row.key, readings[row.key]);
      }
    },
    note(text) {
      noteBox.hidden = text === null;
      noteBox.textContent = text ?? "";
    },
  };
}

function format(key: keyof HudReadings, value: string | number | null): string {
  if (value === null) return "yok"; // GPU saati yoksa 0 yazmıyoruz
  if (typeof value === "string") return value;
  if (key === "fps") return value.toFixed(0);
  return value.toFixed(2);
}
