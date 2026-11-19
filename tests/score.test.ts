import { describe, expect, it } from 'vitest';
import { scorePost } from '../src/shared/slop/score';
import { minhash } from '../src/shared/slop/similarity';
import type { UserContext } from '../src/shared/types';
import { ALL_FIXTURES } from './fixtures/load';

const posts = ALL_FIXTURES.filter((f) => f.kind === 'post');
const fullSlop = posts.filter((f) => f.label === 'slop' && !f.compact);
const compactSlop = posts.filter((f) => f.label === 'slop' && f.compact);
const human = posts.filter((f) => f.label === 'human');

const emptyContext = (): UserContext => ({ phrases: [], reportSignatures: [], boostedAuthors: [], ruleWeights: {} });

describe('heurystyka na przykładach z raportu', () => {
  it('≥ 90% pełnych przykładów slopu (§4) ma wynik ≥ 7', () => {
    const passed = fullSlop.filter((f) => scorePost(f.text).score >= 7);
    expect(passed.length / fullSlop.length).toBeGreaterThanOrEqual(0.9);
  });

  it.each(fullSlop.map((f) => [f.id, f] as const))('%s: co najmniej strefa niepewna (≥ 4)', (_, f) => {
    expect(scorePost(f.text).score).toBeGreaterThanOrEqual(4);
  });

  it.each(compactSlop.map((f) => [f.id, f] as const))('%s (skrócony wariant): ≥ 4', (_, f) => {
    expect(scorePost(f.text).score).toBeGreaterThanOrEqual(4);
  });

  it.each(human.map((f) => [f.id, f] as const))('%s (ludzki): < 4', (_, f) => {
    expect(scorePost(f.text).score).toBeLessThan(4);
  });

  it.each(posts.filter((f) => f.label === 'slop' && f.family).map((f) => [f.id, f] as const))(
    '%s: poprawna rodzina',
    (_, f) => {
      expect([f.family, ...(f.altFamilies ?? [])]).toContain(scorePost(f.text).family);
    },
  );
});

describe('zasada klastra', () => {
  it('pojedyncze sygnały nie zwijają posta', () => {
    const text = 'Wdrożyliśmy dziś nową wersję API — szczegóły w changelogu.\n\nAgree?';
    expect(scorePost(text).score).toBeLessThan(7);
  });

  it('sama struktura (krótkie linie + hashtagi) jest obcięta do 6', () => {
    const text = [
      'Nowy tydzień.',
      'Nowe zadania.',
      'Nowy sprint.',
      'Kawa gotowa.',
      'Plan gotowy.',
      'Czas działać.',
      '#praca #sprint #kawa #poniedziałek',
    ].join('\n\n');
    const result = scorePost(text);
    expect(result.score).toBeLessThanOrEqual(6);
  });
});

describe('kontekst użytkownika', () => {
  const template = [
    'Most people think success is about talent.',
    'It is not.',
    'Success is a decision you make every single morning when the alarm rings.',
    'Make the decision today and never look back again.',
  ].join('\n\n');

  it('podobieństwo do zgłoszonego slopu podbija wynik i ustawia rodzinę', () => {
    const ctx = emptyContext();
    ctx.reportSignatures.push({ id: 'r1', label: 'slop', family: 'hot-take', minhash: minhash(template) });
    const base = scorePost(template).score;
    const withCtx = scorePost(`${template}\n\n#mindset`, { context: ctx });
    expect(withCtx.matchedReport?.label).toBe('slop');
    expect(withCtx.score).toBeGreaterThan(base);
    expect(withCtx.family).toBe('hot-take');
  });

  it('podobieństwo do zgłoszonego „nie slop” obniża wynik', () => {
    const ctx = emptyContext();
    ctx.reportSignatures.push({ id: 'h1', label: 'human', minhash: minhash(template) });
    expect(scorePost(template, { context: ctx }).score).toBeLessThanOrEqual(scorePost(template).score);
  });

  it('własna fraza jest sygnałem', () => {
    const ctx = emptyContext();
    ctx.phrases.push({ id: 'p1', phrase: 'synergia działań', weight: 2, createdAt: 0 });
    const text = 'Synergia działań to podstawa. Wdrażamy ją od poniedziałku w całym dziale.';
    const result = scorePost(text, { context: ctx });
    expect(result.signals.some((s) => s.id === 'user.phrase:p1')).toBe(true);
  });

  it('autor z listy „ukrywaj więcej” dostaje +2', () => {
    const ctx = emptyContext();
    ctx.boostedAuthors.push('/in/jan');
    const text = fullSlop[0]!.text;
    expect(scorePost(text, { context: ctx, authorId: '/in/jan' }).raw).toBeCloseTo(scorePost(text).raw + 2);
  });

  it('wagi reguł z kalibracji są stosowane', () => {
    const ctx = emptyContext();
    ctx.ruleWeights['structure.broetry'] = 0.5;
    const text = fullSlop[0]!.text;
    expect(scorePost(text, { context: ctx }).raw).toBeLessThan(scorePost(text).raw);
  });
});
