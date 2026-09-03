/** Konum tamponunun düzen bağımsız özeti: bit deseni toplamı. */
export function positionChecksum(data: Float32Array): number {
  const view = new Uint32Array(data.buffer, data.byteOffset, data.length);
  let h = 0x811c9dc5;
  for (let i = 0; i < view.length; i++) {
    h ^= view[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
