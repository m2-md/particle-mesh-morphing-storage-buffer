import { Sprite, SpriteNodeMaterial } from "three/webgpu";
import { float, vec3 } from "three/tsl";
import type { StorageBufferNode } from "three/webgpu";

export function createParticles(positionBuffer: StorageBufferNode<"vec4">, count: number) {
  const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false });

  // Kopya yok: compute'un yazdığı tamponun ta kendisi vertex girdisi oluyor.
  const position = positionBuffer.toAttribute();
  material.positionNode = position.xyz;
  material.scaleNode = float(0.012);
  material.colorNode = vec3(0.55, 0.78, 1.0).mul(position.w.mul(0.6).add(0.7));

  const particles = new Sprite(material);
  particles.count = count;
  // Konumlar CPU'nun bilmediği bir tamponda; bounding sphere yalan söyler.
  particles.frustumCulled = false;

  return particles;
}
