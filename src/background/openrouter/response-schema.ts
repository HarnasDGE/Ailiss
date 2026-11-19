import { isSlopFamily, SLOP_FAMILIES } from '../../shared/slop/families';
import { LLM_TEST_ITEMS } from '../../shared/slop/test-items';
import type { LlmVerdict } from '../../shared/types';

const ANSWERS = LLM_TEST_ITEMS.length;

/** JSON Schema dla structured outputs (tryb LLM). */
export const LLM_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'answers', 'family', 'reason'],
        properties: {
          id: { type: 'string' },
          answers: { type: 'array', items: { type: 'integer', enum: [0, 1] }, minItems: ANSWERS, maxItems: ANSWERS },
          family: { type: 'string', enum: SLOP_FAMILIES.filter((f) => f !== 'comment-slop') },
          reason: { type: 'string' },
        },
      },
    },
  },
};

/** Wyciąga pierwszy obiekt JSON z odpowiedzi (modele bez structured outputs dodają czasem tekst / ```). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Brak JSON w odpowiedzi');
  return JSON.parse(text.slice(start, end + 1));
}

/** Skala 0–12: 11 pytań LLM (bez #12) → suma odpowiedzi przeskalowana do 12. */
export function answersToScore(answers: readonly number[]): number {
  const yes = answers.filter((a) => a === 1).length;
  return Math.round((yes / ANSWERS) * 12);
}

export function parseLlmResponse(text: string, ids: readonly string[]): Map<string, LlmVerdict> {
  const data = extractJson(text) as { results?: unknown };
  const results = Array.isArray(data.results) ? data.results : [];
  const out = new Map<string, LlmVerdict>();
  for (const item of results) {
    if (!item || typeof item !== 'object') continue;
    const r = item as { id?: unknown; answers?: unknown; family?: unknown; reason?: unknown };
    if (typeof r.id !== 'string' || !ids.includes(r.id) || !Array.isArray(r.answers)) continue;
    const answers = r.answers.slice(0, ANSWERS).map((a) => (a === 1 || a === '1' || a === true ? 1 : 0));
    if (answers.length !== ANSWERS) continue;
    out.set(r.id, {
      score: answersToScore(answers),
      answers,
      family: isSlopFamily(r.family) ? r.family : undefined,
      reason: typeof r.reason === 'string' ? r.reason.slice(0, 160) : undefined,
    });
  }
  return out;
}

/** Tryb decyzyjny: linie „p1: SLOP” / „p2: OK”. SLOP → 10, OK → 1 (skala 0–12). */
export function parseDecisionResponse(text: string, ids: readonly string[]): Map<string, LlmVerdict> {
  const out = new Map<string, LlmVerdict>();
  for (const line of text.split(/\r?\n/)) {
    const m = /([\w-]+)\s*[:=-]\s*\**\s*(SLOP|OK)\b/i.exec(line);
    if (!m || !ids.includes(m[1]!)) continue;
    out.set(m[1]!, { score: m[2]!.toUpperCase() === 'SLOP' ? 10 : 1 });
  }
  // Pojedynczy post: model czasem odpowiada samym „SLOP”/„OK”.
  if (out.size === 0 && ids.length === 1) {
    const m = /\b(SLOP|OK)\b/i.exec(text);
    if (m) out.set(ids[0]!, { score: m[1]!.toUpperCase() === 'SLOP' ? 10 : 1 });
  }
  return out;
}
