import type { OpenRouterSettings } from '../../shared/settings';
import type { LlmVerdict, PostInput } from '../../shared/types';
import type { FewShotExample } from '../reports/select-examples';
import { chatCompletion } from './client';
import { buildDecisionMessages, buildLlmMessages } from './prompt';
import { LLM_RESPONSE_SCHEMA, parseDecisionResponse, parseLlmResponse } from './response-schema';

/** Klasyfikuje batch postów; zwraca werdykty po `post.key`. Brak werdyktu = model nie odpowiedział o ten post. */
export async function classifyBatch(
  posts: readonly PostInput[],
  settings: OpenRouterSettings,
  apiKey: string,
  examples: readonly FewShotExample[],
): Promise<Map<string, LlmVerdict>> {
  const promptPosts = posts.map((p, i) => ({ id: `p${i + 1}`, text: p.text }));
  const ids = promptPosts.map((p) => p.id);

  let byId: Map<string, LlmVerdict>;
  if (settings.mode === 'decision') {
    const content = await chatCompletion({
      apiKey,
      model: settings.model,
      messages: buildDecisionMessages(promptPosts, examples),
      maxTokens: 8 * posts.length + 8,
    });
    byId = parseDecisionResponse(content, ids);
  } else {
    const content = await chatCompletion({
      apiKey,
      model: settings.model,
      messages: buildLlmMessages(promptPosts, examples),
      maxTokens: 120 * posts.length + 50,
      jsonSchema: { name: 'slop_verdicts', schema: LLM_RESPONSE_SCHEMA },
    });
    byId = parseLlmResponse(content, ids);
  }

  const out = new Map<string, LlmVerdict>();
  posts.forEach((p, i) => {
    const verdict = byId.get(`p${i + 1}`);
    if (verdict) out.set(p.key, verdict);
  });
  return out;
}
