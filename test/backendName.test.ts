import { describe, expect, it } from "vitest";
import { backendLabel, backendName } from "../src/backendName";

describe("backendName", () => {
  it("WebGPU backend'inde webgpu", () => {
    expect(backendName({ backend: { isWebGPUBackend: true } })).toBe("webgpu");
  });

  it("WebGL backend'inde webgl2", () => {
    expect(backendName({ backend: { isWebGLBackend: true } })).toBe("webgl2");
  });

  it("`isWebGPURenderer` bayrağına BAKMIYOR: forceWebGL'de o da true", () => {
    const renderer = { isWebGPURenderer: true, backend: { isWebGLBackend: true } };
    expect(backendName(renderer)).toBe("webgl2");
  });

  it("bilinmeyen backend webgpu sayılıyor (three'nin varsayılan dalı)", () => {
    expect(backendName({ backend: {} })).toBe("webgpu");
  });

  it("etiket rozete yazılan hâli veriyor", () => {
    expect(backendLabel("webgpu")).toBe("WebGPU");
    expect(backendLabel("webgl2")).toBe("WebGL2");
  });
});
