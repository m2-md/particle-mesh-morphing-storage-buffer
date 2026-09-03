import { Fn, float, instanceIndex, instancedArray, mix, uint, uniform, vec4 } from "three/tsl";

/**
 * Pair bond has three modes:
 * - "off"    : no pair force, no random read.
 * - "on"     : pair force active, `setPBO(true)` applied. Runs on both backends.
 * - "broken" : pair force active, `setPBO` INTENTIONALLY omitted — demonstrates silent fallback.
 *              Matches "on" in WebGPU; silently matches "off" in WebGL2.
 */
export type BondMode = "off" | "on" | "broken";

export interface SimulationOptions {
  count: number;
  source: Float32Array; // count * 4
  target: Float32Array; // count * 4
  bond: BondMode;
}

export function createSimulation(options: SimulationOptions) {
  const { count, source, target, bond } = options;

  const positionBuffer = instancedArray(count, "vec4").setName("position");
  const velocityBuffer = instancedArray(count, "vec4").setName("velocity");
  const sourceBuffer = instancedArray(source, "vec4").setName("sourceTarget").toReadOnly();
  const targetBuffer = instancedArray(target, "vec4").setName("morphTarget").toReadOnly();

  // The ONLY buffer read with random index. Required on WebGL2 path.
  if (bond !== "off" && bond !== "broken") positionBuffer.setPBO(true);

  const morphT = uniform(0); // 0 -> 1, driven on CPU side
  const stiffness = uniform(0.018);
  const damping = uniform(0.92);
  const bondPull = uniform(bond === "off" ? 0 : 0.0008);

  const init = Fn(() => {
    // Phase is also copied in w component.
    positionBuffer.element(instanceIndex).assign(sourceBuffer.element(instanceIndex));
    velocityBuffer.element(instanceIndex).assign(vec4(0));
  })().compute(count);

  const step = Fn(() => {
    const pos = positionBuffer.element(instanceIndex);
    const vel = velocityBuffer.element(instanceIndex);
    const from = sourceBuffer.element(instanceIndex).xyz;
    const to = targetBuffer.element(instanceIndex).xyz;

    // Per-particle staggered time: phase 0 starts early, phase 1 starts late.
    const SPREAD = 0.35;
    const local = morphT
      .mul(float(1 + SPREAD))
      .sub(pos.w.mul(float(SPREAD)))
      .clamp(0, 1);
    // Handwritten smoothstep: t*t*(3 - 2t)
    const eased = local.mul(local).mul(float(3).sub(local.mul(2)));

    const destination = mix(from, to, eased);

    // Partner: i and (n-1-i) form reciprocal pairs. Read OUTSIDE own index.
    const partnerIndex = uint(count - 1).sub(instanceIndex);
    const partner = positionBuffer.element(partnerIndex).xyz;

    const nextVel = vel.xyz
      .add(destination.sub(pos.xyz).mul(stiffness))
      .add(partner.sub(pos.xyz).mul(bondPull))
      .mul(damping);

    velocityBuffer.element(instanceIndex).assign(vec4(nextVel, 0));
    positionBuffer.element(instanceIndex).assign(vec4(pos.xyz.add(nextVel), pos.w));
  })().compute(count);

  return { positionBuffer, init, step, morphT, stiffness, damping, bondPull };
}

export type Simulation = ReturnType<typeof createSimulation>;
