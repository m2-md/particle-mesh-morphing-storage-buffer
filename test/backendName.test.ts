import { describe, expect, it } from "vitest";
import { backendLabel, backendName } from "../src/backendName";

describe("backendName", () => {
  it("returns webgpu on WebGPU backend", () => {
    expect(backendName({ backend: { isWebGPUBackend: true } })).toBe("webgpu");
  });

  it("returns webgl2 on WebGL backend", () => {
    expect(backendName({ backend: { isWebGLBackend: true } })).toBe("webgl2");
  });

  it("DOES NOT read `isWebGPURenderer` flag: on forceWebGL that is also true", () => {
    const renderer = { isWebGPURenderer: true, backend: { isWebGLBackend: true } };
    expect(backendName(renderer)).toBe("webgl2");
  });

  it("unknown backend treated as webgpu (three default branch)", () => {
    expect(backendName({ backend: {} })).toBe("webgpu");
  });

  it("label returns formatted badge text", () => {
    expect(backendLabel("webgpu")).toBe("WebGPU");
    expect(backendLabel("webgl2")).toBe("WebGL2");
  });
});
