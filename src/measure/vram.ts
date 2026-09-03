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
    itemSize: node.value.itemSize, // ilk kareden önce 3, sonra 4 olabilir
    count: node.value.count,
    arrayLength: node.value.array.length,
    bytes: node.value.array.length * 4,
  };
}

/** Simülasyonun tuttuğu tampon sayısı: konum, hız, kaynak hedef, varış hedefi. */
export const BUFFER_COUNT = 4;

export interface VramRow {
  count: number;
  /** `vec4` tampon: eleman başına 16 bayt. */
  perBufferBytes: number;
  totalBytes: number;
  /** Dolgu olmasaydı `vec3` tamponların tutacağı yer: eleman başına 12 bayt. */
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
