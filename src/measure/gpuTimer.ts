import type { WebGPURenderer } from "three/webgpu";

export interface Timestamps {
  computeMs: number | null;
  renderMs: number | null;
}

/**
 * Actual signature `resolveTimestampsAsync( type = 'render' )` (Renderer.js:2856):
 * stage requested by NAME and resolved separately. If Renderer was not created
 * with `trackTimestamp: true`, three emits `warnOnce` to console —
 * instead we return null and leave column empty.
 */
export async function readTimestamps(renderer: WebGPURenderer): Promise<Timestamps> {
  if (!hasTimestamps(renderer)) return { computeMs: null, renderMs: null };

  await renderer.resolveTimestampsAsync("compute");
  await renderer.resolveTimestampsAsync("render");

  return {
    computeMs: renderer.info.compute.timestamp,
    renderMs: renderer.info.render.timestamp,
  };
}

export function hasTimestamps(renderer: WebGPURenderer): boolean {
  const backend = renderer.backend as unknown as { trackTimestamp?: boolean };
  return backend.trackTimestamp === true;
}
