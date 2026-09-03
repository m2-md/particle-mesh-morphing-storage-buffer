import { SphereGeometry, TorusKnotGeometry } from "three";
import type { BufferGeometry } from "three";

/** Kaynak bulut: küre. Enlem halkalarından oluşuyor, kutup tuzağının sahnesi. */
export function createSourceGeometry(): BufferGeometry {
  return new SphereGeometry(1, 64, 32);
}

/** Hedef bulut: burgu düğümü. Yüzey alanı küreninkinden farklı, üçgenleri düzgün. */
export function createTargetGeometry(): BufferGeometry {
  return new TorusKnotGeometry(0.7, 0.25, 220, 32);
}
