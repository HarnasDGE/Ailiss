import { describe, expect, it } from 'vitest';
import { combineScores, decide, type DecisionInput } from '../src/content/decide';
import { DEFAULT_SETTINGS, type Settings } from '../src/shared/settings';
import type { ScoreResult } from '../src/shared/types';

function heuristic(score: number): ScoreResult {
  return { score, raw: score, family: 'broetry', testItems: [], signals: [], clusterGroups: [], capped: false };
}

function input(score: number, patch: Partial<DecisionInput> = {}, settings: Partial<Settings> = {}): DecisionInput {
  return {
    heuristic: heuristic(score),
    settings: { ...DEFAULT_SETTINGS, ...settings, openrouter: { ...DEFAULT_SETTINGS.openrouter, ...settings.openrouter } },
    authorId: '/in/a',
    authors: { alwaysHide: [], alwaysShow: [], boosted: [] },
    ...patch,
  };
}

const withOpenRouter = { openrouter: { ...DEFAULT_SETTINGS.openrouter, enabled: true } };

describe('decyzja', () => {
  it('progi czułości', () => {
    expect(decide(input(7)).hide).toBe(true);
    expect(decide(input(6)).hide).toBe(false);
    expect(decide(input(7, {}, { sensitivity: 'gentle' })).hide).toBe(false);
    expect(decide(input(5, {}, { sensitivity: 'aggressive' })).hide).toBe(true);
  });

  it('strefa niepewna idzie do LLM tylko z włączonym OpenRouterem', () => {
    expect(decide(input(5)).askLlm).toBe(false);
    expect(decide(input(5, {}, withOpenRouter)).askLlm).toBe(true);
    expect(decide(input(3, {}, withOpenRouter)).askLlm).toBe(false);
    expect(decide(input(8, {}, withOpenRouter)).askLlm).toBe(false);
    expect(decide(input(5, { llmAsked: true }, withOpenRouter)).askLlm).toBe(false);
  });

  it('wynik LLM łączy się z heurystyką (0.6 / 0.4) i nadpisuje rodzinę', () => {
    const d = decide(input(5, { llm: { score: 10, family: 'hot-take' } }, withOpenRouter));
    expect(d.score).toBe(combineScores(5, 10));
    expect(d.hide).toBe(true);
    expect(d.family).toBe('hot-take');
    expect(d.source).toBe('openrouter');
  });

  it('zgłoszenia użytkownika i listy autorów mają pierwszeństwo', () => {
    expect(decide(input(12, { reported: 'human' })).hide).toBe(false);
    expect(decide(input(0, { reported: 'slop' })).hide).toBe(true);
    expect(decide(input(12, { authors: { alwaysHide: [], alwaysShow: ['/in/a'], boosted: [] } })).hide).toBe(false);
    expect(decide(input(0, { authors: { alwaysHide: ['/in/a'], alwaysShow: [], boosted: [] } })).source).toBe('author');
  });

  it('wyłączona rodzina i pomijane typy postów', () => {
    expect(decide(input(10, {}, { disabledFamilies: ['broetry'] })).hide).toBe(false);
    expect(decide(input(10, { isSponsored: true }, { skipSponsored: true })).hide).toBe(false);
    expect(decide(input(10, { isRepost: true }, { skipReposts: true })).hide).toBe(false);
  });
});
