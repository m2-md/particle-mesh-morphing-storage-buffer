export interface BufferReport {
  itemSize: number;
  count: number;
  arrayLength: number;
  bytes: number;
}

export interface BufferLike {
  value: { itemSize: number; count: number; array: ArrayLike<number> };
}

export function bufferReport(node: BufferLike): BufferReport {
  return {
    itemSize: node.value.itemSize, // may be 3 before first frame, 4 afterwards
    count: node.value.count,
    arrayLength: node.value.array.length,
    bytes: node.value.array.length * 4,
  };
}

/** Number of buffers maintained by simulation: position, velocity, source target, dest target. */
export const BUFFER_COUNT = 4;

export interface VramRow {
  count: number;
  /** `vec4` buffer: 16 bytes per element. */
  perBufferBytes: number;
  totalBytes: number;
  /** Space that `vec3` buffers would have consumed without padding: 12 bytes per element. */
  vec3Bytes: number;
  deltaBytes: number;
}

export function vramTable(count: number): VramRow {
  const perBufferBytes = count * 4 * 4;
  const totalBytes = perBufferBytes * BUFFER_COUNT;
  const vec3Bytes = count * 3 * 4 * BUFFER_COUNT;
  return { count, perBufferBytes, totalBytes, vec3Bytes, deltaBytes: totalBytes - vec3Bytes };
}

export function toMb(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}
