import { readKey, STORAGE_KEYS, writeKey } from '../shared/storage';
import type { LlmVerdict } from '../shared/types';

export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CACHE_MAX_ENTRIES = 1000;

interface CacheEntry {
  verdict: LlmVerdict;
  at: number;
}
type CacheMap = Record<string, CacheEntry>;

export async function getCached(key: string, now = Date.now()): Promise<LlmVerdict | undefined> {
  const entry = (await readKey<CacheMap>(STORAGE_KEYS.llmCache, {}))[key];
  return entry && now - entry.at < CACHE_TTL_MS ? entry.verdict : undefined;
}

/** Usuwa przeterminowane i najstarsze ponad limit. */
export function prune(cache: CacheMap, now = Date.now(), max = CACHE_MAX_ENTRIES): CacheMap {
  const fresh = Object.entries(cache).filter(([, e]) => now - e.at < CACHE_TTL_MS);
  fresh.sort((a, b) => b[1].at - a[1].at);
  return Object.fromEntries(fresh.slice(0, max));
}

let chain: Promise<unknown> = Promise.resolve();

export function putCached(entries: Array<[string, LlmVerdict]>): Promise<void> {
  const run = chain.then(async () => {
    const cache = await readKey<CacheMap>(STORAGE_KEYS.llmCache, {});
    const now = Date.now();
    for (const [key, verdict] of entries) cache[key] = { verdict, at: now };
    await writeKey(STORAGE_KEYS.llmCache, prune(cache, now));
  });
  chain = run.catch(() => undefined);
  return run;
}

export const clearCache = () => writeKey(STORAGE_KEYS.llmCache, {});
