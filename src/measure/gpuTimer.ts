import type { WebGPURenderer } from "three/webgpu";

export interface Timestamps {
  computeMs: number | null;
  renderMs: number | null;
}

/**
 * Gerçek imza `resolveTimestampsAsync( type = 'render' )` (Renderer.js:2856):
 * aşama ADIYLA isteniyor ve iki aşama ayrı ayrı çözülüyor. Renderer
 * `trackTimestamp: true` ile kurulmamışsa three konsola `warnOnce` basar —
 * onun yerine null döndürüp sütunu boş bırakıyoruz.
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
