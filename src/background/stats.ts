import type { SlopFamily } from '../shared/slop/families';
import { getStats, STORAGE_KEYS, writeKey } from '../shared/storage';

let chain: Promise<unknown> = Promise.resolve();

function update(mutate: (stats: Awaited<ReturnType<typeof getStats>>) => void): Promise<void> {
  const run = chain.then(async () => {
    const stats = await getStats();
    mutate(stats);
    await writeKey(STORAGE_KEYS.stats, stats);
  });
  chain = run.catch(() => undefined);
  return run;
}

export const countHidden = (family: SlopFamily, ad = false) =>
  update((s) => {
    if (ad) {
      s.ads = (s.ads ?? 0) + 1;
      return;
    }
    s.hidden++;
    s.byFamily[family] = (s.byFamily[family] ?? 0) + 1;
  });

export const countLlmRequest = () => update((s) => void s.llmRequests++);
