import { LLM_WEIGHT, THRESHOLDS, UNCERTAIN_MIN, type Settings } from '../shared/settings';
import type { SlopFamily } from '../shared/slop/families';
import type { AuthorLists, EngineSource, LlmVerdict, ReportLabel, ScoreResult } from '../shared/types';

export interface DecisionInput {
  heuristic: ScoreResult;
  llm?: LlmVerdict | null;
  /** true = LLM już pytany (także bez wyniku) — nie pytamy ponownie. */
  llmAsked?: boolean;
  settings: Settings;
  authorId: string;
  authors: AuthorLists;
  reported?: ReportLabel;
  isSponsored?: boolean;
  isRepost?: boolean;
}

export interface Decision {
  hide: boolean;
  /** Wysłać do OpenRoutera (strefa niepewna albo zakres „wszystkie”). */
  askLlm: boolean;
  score: number;
  family: SlopFamily;
  source: EngineSource;
}

export function combineScores(heuristic: number, llm: number): number {
  return Math.round(LLM_WEIGHT * llm + (1 - LLM_WEIGHT) * heuristic);
}

export function decide(input: DecisionInput): Decision {
  const { heuristic, llm, settings } = input;
  const family = llm?.family ?? heuristic.family;
  const base = { askLlm: false, family };

  if (input.reported === 'human') return { ...base, hide: false, score: heuristic.score, source: 'user' };
  if (input.reported === 'slop') return { ...base, hide: true, score: Math.max(heuristic.score, 12), source: 'user' };
  if (input.authors.alwaysShow.includes(input.authorId)) return { ...base, hide: false, score: heuristic.score, source: 'author' };
  if (input.authors.alwaysHide.includes(input.authorId)) return { ...base, hide: true, score: heuristic.score, source: 'author' };
  if ((settings.skipSponsored && input.isSponsored) || (settings.skipReposts && input.isRepost)) {
    return { ...base, hide: false, score: heuristic.score, source: 'heuristic' };
  }

  const threshold = THRESHOLDS[settings.sensitivity];
  const score = llm ? combineScores(heuristic.score, llm.score) : heuristic.score;
  const familyEnabled = !settings.disabledFamilies.includes(family);
  const hide = familyEnabled && score >= threshold;

  const or = settings.openrouter;
  const inScope = or.scope === 'all' || (heuristic.score >= UNCERTAIN_MIN && heuristic.score < threshold);
  const askLlm = or.enabled && !input.llmAsked && !llm && inScope;

  return { hide, askLlm, score, family, source: llm ? 'openrouter' : 'heuristic' };
}
