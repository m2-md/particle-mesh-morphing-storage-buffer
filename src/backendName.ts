/**
 * We query the BACKEND rather than the Renderer itself: `renderer.isWebGPURenderer`
 * returns `true` even on `forceWebGL` branch and makes the badge report incorrectly.
 * `@types/three` does not declare these flags; we declare the contract here.
 */
export interface BackendFlags {
  isWebGPUBackend?: boolean;
  isWebGLBackend?: boolean;
}

export type BackendName = "webgpu" | "webgl2";

export function backendName(renderer: { backend: unknown }): BackendName {
  const flags = renderer.backend as BackendFlags;
  return flags.isWebGLBackend === true ? "webgl2" : "webgpu";
}

export function backendLabel(name: BackendName): string {
  return name === "webgpu" ? "WebGPU" : "WebGL2";
}
