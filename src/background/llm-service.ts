import type { EngineStatus } from '../shared/messages';
import { minhash } from '../shared/slop/similarity';
import { getReports, getSettings, getStats, readKey, STORAGE_KEYS } from '../shared/storage';
import type { LlmVerdict, PostInput } from '../shared/types';
import { getCached, putCached } from './cache';
import { CircuitBreaker } from './circuit-breaker';
import { classifyBatch } from './openrouter/classify';
import { checkKey } from './openrouter/client';
import { selectExamples } from './reports/select-examples';
import { BatchQueue } from './queue';
import { countLlmRequest } from './stats';

const breaker = new CircuitBreaker();
const getApiKey = () => readKey<string>(STORAGE_KEYS.openrouterKey, '');

/** Powód, dla którego nie wołamy LLM (albo undefined, gdy można). */
async function unavailableReason(): Promise<string | undefined> {
  const settings = (await getSettings()).openrouter;
  if (!settings.enabled) return 'OpenRouter wyłączony';
  if (!settings.model) return 'Nie wybrano modelu';
  if (!(await getApiKey())) return 'Brak klucza API';
  if (breaker.isOpen) return `Przerwa po błędach: ${breaker.lastError ?? 'nieznany błąd'}`;
  if ((await getStats()).llmRequests >= settings.dailyLimit) return 'Wyczerpany dzienny limit żądań';
  return undefined;
}

const cacheKey = (mode: string, key: string) => `${mode}:${key}`;

const queue = new BatchQueue({
  classify: async (posts) => {
    const reason = await unavailableReason();
    if (reason) throw new Error(reason);
    const settings = (await getSettings()).openrouter;
    const examples = settings.useReportsAsContext
      ? selectExamples(
          await getReports(),
          posts.map((p) => ({ family: p.heuristic.family, minhash: minhash(p.text) })),
        )
      : [];
    await countLlmRequest();
    try {
      const verdicts = await classifyBatch(posts, settings, await getApiKey(), examples);
      breaker.success();
      await putCached([...verdicts].map(([key, v]) => [cacheKey(settings.mode, key), v] as [string, LlmVerdict]));
      return verdicts;
    } catch (error) {
      breaker.failure(error instanceof Error ? error.message : String(error));
      throw error;
    }
  },
});

export async function classifyPost(post: PostInput): Promise<{ verdict: LlmVerdict | null; error?: string }> {
  const { mode } = (await getSettings()).openrouter;
  const cached = await getCached(cacheKey(mode, post.key));
  if (cached) return { verdict: cached };
  const reason = await unavailableReason();
  if (reason) return { verdict: null, error: reason };
  const verdict = await queue.enqueue(post);
  return verdict ? { verdict } : { verdict: null, error: breaker.lastError ?? 'Model nie zwrócił oceny' };
}

const SAMPLE_POST = `Leadership isn't about titles.\n\nIt's about impact.\n\nAgree? 👇\n\n#leadership #growth #mindset #success`;

/** Sprawdza klucz i model na jednym przykładowym poście (1 żądanie). */
export async function testConnection(): Promise<{ ok: boolean; error?: string; sample?: string }> {
  const settings = (await getSettings()).openrouter;
  const apiKey = await getApiKey();
  if (!apiKey) return { ok: false, error: 'Brak klucza API' };
  try {
    await checkKey(apiKey);
    if (!settings.model) return { ok: true, sample: 'Klucz poprawny. Wybierz model, żeby przetestować klasyfikację.' };
    await countLlmRequest();
    const result = await classifyBatch(
      [{ key: 'test', text: SAMPLE_POST, heuristic: { score: 8, family: 'antithesis' } }],
      settings,
      apiKey,
      [],
    );
    breaker.reset();
    const verdict = result.get('test');
    if (!verdict) return { ok: false, error: 'Model odpowiedział, ale nie w oczekiwanym formacie' };
    return { ok: true, sample: `Przykładowy post: ${verdict.score}/12${verdict.family ? ` · ${verdict.family}` : ''}${verdict.reason ? ` — ${verdict.reason}` : ''}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function engineStatus(): Promise<EngineStatus> {
  const [settings, stats, apiKey, reports] = await Promise.all([getSettings(), getStats(), getApiKey(), getReports()]);
  return {
    stats,
    reportsCount: reports.length,
    openrouter: {
      enabled: settings.openrouter.enabled,
      hasKey: Boolean(apiKey),
      model: settings.openrouter.model,
      breakerOpenUntil: breaker.openUntilTime,
      requestsToday: stats.llmRequests,
      dailyLimit: settings.openrouter.dailyLimit,
      lastError: breaker.lastError,
    },
  };
}
