import { SphereGeometry, TorusKnotGeometry } from "three";
import type { BufferGeometry } from "three";

/** Source cloud: sphere. Formed of latitude rings; stage for the polar trap. */
export function createSourceGeometry(): BufferGeometry {
  return new SphereGeometry(1, 64, 32);
}

/** Target cloud: trefoil knot. Surface area differs from sphere; triangles uniform. */
export function createTargetGeometry(): BufferGeometry {
  return new TorusKnotGeometry(0.7, 0.25, 220, 32);
}
