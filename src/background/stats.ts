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

export const countHidden = (family: SlopFamily) =>
  update((s) => {
    s.hidden++;
    s.byFamily[family] = (s.byFamily[family] ?? 0) + 1;
  });

export const countLlmRequest = () => update((s) => void s.llmRequests++);
