/**
 * HUD is split into two groups:
 * - STRUCTURAL: configuration details (particle count, pair bond, back buffer, scale).
 * - METRIC: runtime counters (backend, FPS, frame ms, GPU ms, VRAM).
 * If GPU clock is unavailable, cells display "none" rather than 0.
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

const ROWS: Array<{ key: keyof HudReadings; label: string; group: "STRUCTURAL" | "METRIC" }> = [
  { key: "particles", label: "Particles", group: "STRUCTURAL" },
  { key: "bond", label: "Pair bond", group: "STRUCTURAL" },
  { key: "buffer", label: "Back buffer", group: "STRUCTURAL" },
  { key: "scale", label: "Resolution scale", group: "STRUCTURAL" },
  { key: "vram", label: "Total buffers", group: "STRUCTURAL" },
  { key: "backend", label: "Backend", group: "METRIC" },
  { key: "fps", label: "FPS", group: "METRIC" },
  { key: "frameMs", label: "Frame (ms)", group: "METRIC" },
  { key: "computeMs", label: "Compute GPU (ms)", group: "METRIC" },
  { key: "renderMs", label: "Render GPU (ms)", group: "METRIC" },
  { key: "rebuildMs", label: "Last rebuild stall", group: "METRIC" },
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
  if (value === null) return "none"; // does not write 0 if GPU clock missing
  if (typeof value === "string") return value;
  if (key === "fps") return value.toFixed(0);
  return value.toFixed(2);
}
