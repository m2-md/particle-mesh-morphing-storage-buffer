/**
 * Renderer'ın kendisine değil, BACKEND'e soruyoruz: `renderer.isWebGPURenderer`
 * `forceWebGL` dalında da `true` döner ve rozete yalan söyletir.
 * `@types/three` bu iki bayrağı bildirmiyor; sözleşmeyi burada yazıyoruz.
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
