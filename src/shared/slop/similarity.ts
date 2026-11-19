/**
 * MinHash na 3-gramach słów — szybkie przybliżenie podobieństwa Jaccarda.
 * Służy do wykrywania kopii/szablonów zgłoszonych postów (DESIGN §6.3).
 */
export const MINHASH_SIZE = 64;
const SHINGLE_SIZE = 3;

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function fmix32(input: number): number {
  let h = input;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

const SEEDS = Array.from({ length: MINHASH_SIZE }, (_, i) => fmix32(0x9e3779b9 + i * 0x7f4a7c15));

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function shingles(text: string): Set<string> {
  const words = tokenize(text);
  const result = new Set<string>();
  if (words.length === 0) return result;
  if (words.length < SHINGLE_SIZE) {
    result.add(words.join(' '));
    return result;
  }
  for (let i = 0; i <= words.length - SHINGLE_SIZE; i++) {
    result.add(words.slice(i, i + SHINGLE_SIZE).join(' '));
  }
  return result;
}

export function minhash(text: string): number[] {
  const hashes = [...shingles(text)].map(fnv1a);
  return SEEDS.map((seed) => {
    let min = 0xffffffff;
    for (const h of hashes) {
      const v = fmix32(h ^ seed);
      if (v < min) min = v;
    }
    return min;
  });
}

export function minhashSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let same = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
  return same / a.length;
}

/** Dokładny Jaccard — do testów i małych zbiorów. */
export function jaccard(a: string, b: string): number {
  const sa = shingles(a);
  const sb = shingles(b);
  if (sa.size === 0 && sb.size === 0) return 0;
  let inter = 0;
  for (const s of sa) if (sb.has(s)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/** Krótki, stabilny hash tekstu (deduplikacja zgłoszeń, klucz cache). */
export function textHash(text: string): string {
  const normalized = tokenize(text).join(' ');
  return `${fnv1a(normalized).toString(36)}${fmix32(fnv1a(normalized) ^ normalized.length).toString(36)}`;
}
