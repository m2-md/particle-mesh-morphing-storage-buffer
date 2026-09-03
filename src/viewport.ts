export const MAX_DPR = 2;

export function backingSize(cssW: number, cssH: number, dpr: number, scale: number) {
  const clampedDpr = Math.min(Math.max(dpr, 1), MAX_DPR);
  const clampedScale = Math.min(Math.max(scale, 0.25), 1);
  return {
    width: Math.max(1, Math.round(cssW * clampedDpr * clampedScale)),
    height: Math.max(1, Math.round(cssH * clampedDpr * clampedScale)),
  };
}
