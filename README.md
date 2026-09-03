# One Kernel, Two Shaders — mesh-to-mesh particle morphing with TSL compute

Working code for the article "One Kernel, Two Shaders: Mesh-to-Mesh Particle Morphing with TSL
Compute".

The particle positions live on the GPU inside an `instancedArray` (storage buffer). The target
clouds come out of two mesh surfaces via **area-weighted CDF sampling**. **A single TSL
kernel** compiles to two backends:

| Backend               | What gets generated                                                 | Random-indexed read        |
| --------------------- | ------------------------------------------------------------------- | -------------------------- |
| WebGPU                | `var<storage, read_write>` + `@compute @workgroup_size( 64, 1, 1 )` | from the buffer itself     |
| WebGL2 (`forceWebGL`) | vertex shader + transform feedback varyings                         | `texelFetch` (PBO texture) |

Both can be dumped **without a GPU and without a browser**, in Node — which is why the
article's main claims are nailed down by pure vitest tests.

The version is pinned (**no** caret, deliberately): `three@0.185.1`. three changes the node
system across minor versions and the article cites source files by line number. No React/R3F,
no off-the-shelf particle/GPGPU library, **no hand-written WGSL/GLSL** — the shaders are
generated from TSL, we only dump them.

## Setup

```bash
npm install
```

`--legacy-peer-deps` is not needed.

## Running

```bash
npm run dev
```

`http://localhost:5173/` — the **port is fixed** (`vite.config.ts` → `strictPort: true`). If
the port is taken, Vite errors out instead of silently shifting; the measurement URLs below
point at exactly this address. **Do not open it with `file://`**, you get a blank screen.

### Demo controls

| Control          | Values                                                            | Default    |
| ---------------- | ----------------------------------------------------------------- | ---------- |
| Particles        | 100k / 200k / 500k                                                | **100k**   |
| Morph            | triggers the sphere ⇄ trefoil knot transition                     | sphere     |
| Pair bond        | Off / On / **On (No PBO)**                                        | On         |
| Resolution scale | 0.35 / 0.50 / 0.75 / 1.00                                         | **0.50**   |
| Pause/Resume     | —                                                                 | Running    |
| Backend          | reloads the page with `?backend=webgpu` / `?backend=webgl2`       | automatic  |

`devicePixelRatio` is clamped to 2 (`src/viewport.ts`), the loop stops when the tab is hidden
(`visibilitychange`), the HUD is split in two as **STRUCTURAL / METRIC**, and it reads the
backend badge from `renderer.backend.isWebGLBackend` — **not** from
`renderer.isWebGPURenderer`: the latter returns `true` on the `forceWebGL` branch too and would
make the badge lie.

Changing the particle count re-samples both meshes and rebuilds four buffers. This **freezes
the main thread**, and the freeze is deliberately not hidden: its duration is written to the
"Last rebuild stall" row of the HUD (on this machine ~220 ms at 500k, ~190 ms of it sampling).

### The "On (No PBO)" option is DELIBERATELY BROKEN

The `bond` mode inside `src/sim/simulation.ts` has three states:

| `bond`     | `setPBO(true)` | `bondPull` | Behaviour                                                |
| ---------- | -------------- | ---------- | -------------------------------------------------------- |
| `"off"`    | not called     | `0`        | no pair force                                            |
| `"on"`     | **called**     | `0.0008`   | the pair force works on both backends                    |
| `"broken"` | **not called** | `0.0008`   | like `"on"` on WebGPU; silently like `"off"` on WebGL2   |

`"broken"` is not a bug, it is the article's evidence: on WebGL2, if `.setPBO(true)` is not
given, the neighbour read **silently** collapses to the particle's own value. No error, no
warning, a clean console, a wrong result. The measurement mode proves this with a checksum
(below).

## Test

```bash
npm test
```

**94 tests green** (11 files). None of them uses `document`, `window`, `navigator`,
`WebGL2RenderingContext` or `GPUDevice`: there is no GPU in headless vitest. Even the shader
tests do not open a GPU — `WGSLNodeBuilder` and `GLSLNodeBuilder` run directly in Node against
a fake renderer object.

| File                       | Tests | What it nails down                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shaders.test.ts`          | 16    | The same kernel on two backends: in WGSL `var<storage, read_write>` + the neighbour read + the bounds guard TSL generates on its own; in GLSL `texelFetch` **only** when PBO is on; on the no-PBO branch the neighbour read collapsing into `nodeVarying0 - nodeVarying0`; `@compute @workgroup_size( 64`; `.toReadOnly()` → `var<storage, read>`; transform feedback varying names; the dump body actually being full (the `three/tsl` ↔ `three/src` mixing regression) |
| `simulationShader.test.ts` | 16    | The same claims on **the application's real `step` kernel**: 5 bindings (2 read_write + 2 read + 1 uniform), the `1023u - instanceIndex` neighbour read, branchlessness (a single `if`), the `bond` modes changing the sampler count                                                                                                                                                                                            |
| `surfaceSampler.test.ts`   | 9     | The total area converging on `4π` **from below**; the polar cap ratio landing on the `0.1` Archimedes gives; uniform-per-triangle selection **overshooting** the same band; the analytic area of a single triangle; the indexed/non-indexed branches; the generated point lying on the surface                                                                                                                                  |
| `pickTriangle.test.ts`     | 8     | Binary search boundaries: `x = 0` → the first triangle, `x = total` → the last triangle, a value landing exactly on a cumulative boundary does not select the next one                                                                                                                                                                                                                                                        |
| `vram.test.ts`             | 8     | 16 bytes per `vec4` buffer element, versus the 12 you assume for `vec3`; the difference is positive; `bufferReport` fields come through from the input verbatim                                                                                                                                                                                                                                                               |
| `checksum.test.ts`         | 7     | FNV-1a: same input same output, a one-bit difference gives a different output, the `Uint32Array` view does not corrupt the original                                                                                                                                                                                                                                                                                            |
| `sampleGeometry.test.ts`   | 7     | Output length is `count * 4`, the w component is in `[0,1)`, the same seed gives a bit-identical array, no value is `NaN`                                                                                                                                                                                                                                                                                                     |
| `stats.test.ts`            | 7     | Median/percentile; `NaN` (**not** 0) on an empty array; the input array is not mutated                                                                                                                                                                                                                                                                                                                                        |
| `viewport.test.ts`         | 6     | The `MAX_DPR = 2` clamp, scale `[0.25, 1]`, the result is never 0                                                                                                                                                                                                                                                                                                                                                             |
| `rng.test.ts`              | 5     | `mulberry32`'s range, its reproducibility, a different seed giving a different sequence                                                                                                                                                                                                                                                                                                                                       |
| `backendName.test.ts`      | 5     | The badge reads the backend flag, not `isWebGPURenderer`                                                                                                                                                                                                                                                                                                                                                                      |

## Type checking and build

```bash
npx tsc --noEmit   # 0 errors
npm run build      # tsc && vite build → dist/
```

`vite build` passing does not prove the shader **works**: WGSL/GLSL is generated at runtime.
Browser verification is mandatory.

## Node-side measurements (no GPU)

### `npm run shaders` — shader dump

```bash
npm run shaders
```

Writes six files under `artifacts/` and prints a **single line** `SHADERS {json}` to the
console:

| File                 | Kernel                                | Backend |
| -------------------- | ------------------------------------- | ------- |
| `compute.wgsl`       | the dump kernel (1024, `vec3`)        | WebGPU  |
| `compute.pbo.glsl`   | the same kernel, `setPBO(true)`       | WebGL2  |
| `compute.nopbo.glsl` | the same kernel, **no** `setPBO`      | WebGL2  |
| `step.wgsl`          | the application's real `step` kernel  | WebGPU  |
| `step.pbo.glsl`      | the real `step`, `bond: "on"`         | WebGL2  |
| `step.nopbo.glsl`    | the real `step`, `bond: "broken"`     | WebGL2  |

The real output on this machine:

```json
{
  "three": "0.185.1",
  "header": "// Three.js r185 - Node System",
  "wgsl": {
    "lines": 65,
    "bindings": 3,
    "hasReadWrite": true,
    "hasReadOnly": false,
    "hasNeighbourRead": true,
    "hasBoundsGuard": true
  },
  "glslPbo": {
    "lines": 80,
    "samplers": 1,
    "hasTexelFetch": true,
    "varyings": ["nodeVarying0", "nodeVarying1"]
  },
  "glslNoPbo": {
    "lines": 75,
    "samplers": 0,
    "hasTexelFetch": false,
    "varyings": ["nodeVarying0", "nodeVarying1"]
  },
  "simulation": {
    "count": 1024,
    "wgsl": {
      "lines": 85,
      "bindings": 5,
      "readWrite": 2,
      "readOnly": 2,
      "hasNeighbourRead": true,
      "hasBoundsGuard": true,
      "branchless": true
    },
    "glslOn": { "lines": 98, "samplers": 1, "hasTexelFetch": true },
    "glslBroken": { "lines": 92, "samplers": 0, "hasTexelFetch": false },
    "glslOff": { "lines": 92, "samplers": 0, "hasTexelFetch": false }
  }
}
```

The only difference between `glslPbo.hasTexelFetch === true` and
`glslNoPbo.hasTexelFetch === false` is a one-line `.setPBO(true)` call.

**Module graph warning:** **every** three import inside `tools/dumpShaders.ts` comes from
under `three/src/`. `three/tsl` (the build output) and `three/src/...` are separate module
copies; if you mix them you get a `THREE.TSL: No stack defined for assign operation` warning
and the kernel body **silently compiles empty**. `tools/dumpSimulation.ts` does the exact
opposite (builder and kernel both from the build output) — what is forbidden is bringing the
two graphs together in a single builder.

### `npm run bench` — CPU measurements

```bash
npm run bench
```

A **single line** `BENCH {json}` to the console. On this machine (Node v22.22.2, Apple M2 Pro):

| Measurement                              | Value                                                              |
| ---------------------------------------- | ------------------------------------------------------------------ |
| Area convergence `16×8`                  | 224 triangles · 12.1667 · 3.181% off `4π`                          |
| Area convergence `32×16`                 | 960 triangles · 12.4657 · 0.801%                                   |
| Area convergence `64×32`                 | 3968 triangles · 12.5412 · 0.201%                                  |
| Area convergence `128×64`                | 16128 triangles · 12.5601 · 0.050%                                 |
| Polar cap (`y > 0.8`), CDF               | **0.10002** (analytic `0.1`)                                       |
| Polar cap, uniform per-triangle pick     | **0.19506** (2× over-represented)                                  |
| `setWeightAttribute` upper-half ratio    | 0.95324 (i.e. not 100%)                                            |
| CDF sampling 100k / 200k / 500k          | 17.63 / 31.83 / 79.16 ms → 176 / 159 / **158 ns/point**            |
| `MeshSurfaceSampler` 100k / 200k / 500k  | 25.33 / 43.72 / 112.88 ms → 253 / 219 / **226 ns/point**           |
| CDF setup (3968 triangles)               | 0.209 ms                                                           |
| VRAM 100k / 200k / 500k (4 × `vec4`)     | 6.10 / 12.21 / 30.52 MiB (assumed `vec3`: 4.58 / 9.16 / 22.89 MiB) |

Every timing measurement is **3 runs**, the median is reported; the raw runs are in the `runs`
field of the JSON. The analytic `4π = 12.5664`; the computed total is **always below** it (the
area of an inscribed polyhedron cannot exceed the sphere's) and shrinks monotonically with the
segment count — a free verification number.

## Deterministic measurement mode — MEASUREMENT URLS

```bash
npm run dev
```

| URL                                               | What it measures                            |
| ------------------------------------------------- | ------------------------------------------- |
| `http://localhost:5173/?measure=1&backend=webgpu` | The WebGPU run, a single `MEASURE {json}` line |
| `http://localhost:5173/?measure=1&backend=webgl2` | The `forceWebGL` run, the same fields       |

When `?measure=1` is on: the UI and the rAF loop shut down, the back buffer is locked to
**960×540** (`devicePixelRatio` and the scale are ignored), the seeds are fixed (source cloud
`seed = 1`, target `seed = 2`), the morph animation is off and `morphT` is set by hand, the
substep count is fixed (`SUBSTEPS = 2`, **no** delta-time), and the camera is hard-coded. Every
measurement block is **60 warm-up + 180 measured** frames. At the end a **single line**
`MEASURE {json}` lands in the console; there is no other `console.log`.

The run programme, in order: (1) speed sweep 100k/200k/500k · (2) pair bond off/on · (3) morph
cost `morphT ∈ {0, 0.5, 1}` · (4) checksum (`off`/`on`/`broken`, each one **twice**, 240 steps,
read back with `getArrayBufferAsync`) · (5) rebuild stall · (6) proof of the `vec3` padding.

The `MEASURE` schema — the numbers below are from a **real** WebGPU run on this machine (Apple
M2 Pro, headless Chrome 151); read it as a field list:

```json
{
  "backend": "webgpu",
  "forcedWebGL": false,
  "adapter": "apple / metal-3",
  "three": "0.185.1",
  "timestamps": true,
  "backing": { "width": 960, "height": 540 },
  "warmup": 60,
  "frames": 180,
  "substeps": 2,
  "speed": [
    {
      "count": 100000,
      "compute": { "median": 0.1409, "p95": 0.2654 },
      "render": { "median": 2.2395, "p95": 2.4692 },
      "frame": { "median": 8.3, "p95": 8.905 },
      "cpu": { "median": 0.3, "p95": 1 }
    }
  ],
  "bond": {
    "off": { "computeMedian": 0.1361, "cpuMedian": 0.2 },
    "on": { "computeMedian": 0.1347, "cpuMedian": 0.3 },
    "deltaMs": -0.0014
  },
  "morph": {
    "t0": { "computeMedian": 0.1345, "cpuMedian": 0.2 },
    "t05": { "computeMedian": 0.1357, "cpuMedian": 0.3 },
    "t1": { "computeMedian": 0.1358, "cpuMedian": 0.3 }
  },
  "checksum": {
    "count": 100000,
    "steps": 240,
    "off": 2846883600,
    "on": 3484484836,
    "broken": 375058886,
    "repeatable": { "off": true, "on": false, "broken": false },
    "brokenEqualsOff": false,
    "brokenEqualsOn": false,
    "maxAbsDiffBrokenOff": 0.08133101,
    "maxAbsDiffBrokenOn": 1.8e-7,
    "maxAbsDiffOnOff": 0.08133101
  },
  "rebuild": [
    { "count": 100000, "sampleMs": 41, "setupMs": 1.3, "totalMs": 42.3, "secondRunMs": 41.9 }
  ],
  "buffer": {
    "probe": "vec3",
    "beforeFirstFrame": { "itemSize": 3, "count": 1024, "arrayLength": 3072, "bytes": 12288 },
    "afterFirstFrame": { "itemSize": 4, "count": 1024, "arrayLength": 4096, "bytes": 16384 }
  }
}
```

Rules:

- **If there are no timestamps, none are invented.** If `timestamps: false` comes back, the
  `compute` and `render` fields stay `null`, and only `frame` and `cpu` are read.
- GPU timestamps are **quantized**: the same median repeating shows the counter's resolution,
  not stability.
- `frame.median` is locked to the display refresh rate (`8.3 ms` = 120 Hz). Read saturation
  from the `compute` and `render` columns, not from the frame duration.
- There is no timing in the `checksum` block and every configuration runs **in its own
  renderer**. `trackTimestamp` is off in this block: 240 consecutive computes fill the
  2048-query timestamp pool and trigger a warning.
- Measurements are **not taken in a hidden tab**: `requestAnimationFrame` gets throttled and
  the numbers are ruined.

### The article's main claim: `checksum.brokenEqualsOff`

Measured on this machine:

| Backend | `off`      | `on`                    | `broken`  | `brokenEqualsOff` | `maxAbsDiffBrokenOff` |
| ------- | ---------- | ----------------------- | --------- | ----------------- | --------------------- |
| WebGL2  | 2846883600 | 614728775               | 2846883600 | **`true`**       | **0**                 |
| WebGPU  | 2846883600 | (varies run to run)     | (varies)  | `false`           | 0.08133101            |

The WebGL2 row proves the claim **bit for bit**: without `setPBO`, `"broken"` gives the same
result as `"off"` — the pair force was never applied at all.

On the WebGPU side the **maximum absolute difference between `broken` and `on` is 1.8·10⁻⁷**
(i.e. the same simulation), but the checksums do not match bit for bit and the `repeatable`
field is `false`: because there is no synchronization between the neighbour read and the
neighbour write, the result wobbles in the last digit of the floating point from run to run.
The `off` configuration (no random read) comes out **identical** on every run — on both WebGPU
and WebGL2, and moreover the same number on both backends.

### Raw measurement log

Series convention: the `MEASURE {json}` lines a run drops into the console are written into a
`measurements-YYYY-MM-DD.jsonl` file, one run per line (the `id` field carries the URL label,
cold runs are marked with `note`). The tables in the article are based on that file.

## Known scope limits

- The kernel does not branch, does not use atomics/barriers, and does not **write** outside its
  own index. (Transform feedback cannot write to another slot; any kernel targeting both
  backends has to obey this rule.)
- When the particle count changes the buffers are rebuilt; `instancedArray` is not resized.
- The morph targets are sampled once; no new mesh is loaded at runtime.
- The pair bond is not a physical force: it is a visual link and the guinea pig for the random
  read.
- There is **no** 1,000,000 particle option (the series' demo weight rule). The limit is not
  memory — even at 1M the four buffers stay below WebGPU's default
  `maxStorageBufferBindingSize` limit — it is the CPU sampling stall.

## License

MIT — see `LICENSE`.
