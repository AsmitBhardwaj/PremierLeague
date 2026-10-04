/** Mix integers and strings into one 32-bit seed (FNV-1a). Pure and order-sensitive. */
export function hashSeed(...parts: readonly (number | string)[]): number {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    const text = `${part}|`;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash | 0;
}
