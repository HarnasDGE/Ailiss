import { describe, expect, it, vi } from 'vitest';
import { prune } from '../src/background/cache';
import { CircuitBreaker } from '../src/background/circuit-breaker';
import { answersToScore, parseDecisionResponse, parseLlmResponse } from '../src/background/openrouter/response-schema';
import { buildLlmMessages } from '../src/background/openrouter/prompt';
import { BatchQueue } from '../src/background/queue';
import { computeRuleWeights, MIN_REPORTS_FOR_CALIBRATION } from '../src/background/reports/calibrate-weights';
import { parseImport, toExportFile } from '../src/background/reports/export-import';
import { enforceLimit } from '../src/background/reports/reports-store';
import { selectExamples } from '../src/background/reports/select-examples';
import { minhash } from '../src/shared/slop/similarity';
import type { LlmVerdict, PostInput, UserReport } from '../src/shared/types';
import { REPORT_FIXTURES } from './fixtures/load';

let seq = 0;
function report(partial: Partial<UserReport> & { text: string }): UserReport {
  seq++;
  return {
    id: `r${seq}`,
    textHash: `h${seq}`,
    label: 'slop',
    heuristic: { score: 5, signals: [] },
    minhash: minhash(partial.text),
    createdAt: seq,
    ...partial,
  };
}

describe('kalibracja wag', () => {
  it('poniżej progu zgłoszeń — brak korekt', () => {
    const reports = Array.from({ length: MIN_REPORTS_FOR_CALIBRATION - 1 }, () =>
      report({ text: 'x', heuristic: { score: 5, signals: ['structure.broetry'] } }),
    );
    expect(computeRuleWeights(reports)).toEqual({});
  });

  it('reguła trafiająca w „nie slop” traci wagę, w „slop” zyskuje (granice ±50%)', () => {
    const reports = [
      ...Array.from({ length: 12 }, () => report({ text: 'a', label: 'human', heuristic: { score: 5, signals: ['structure.hook'] } })),
      ...Array.from({ length: 12 }, () => report({ text: 'b', label: 'slop', heuristic: { score: 5, signals: ['closer.bait'] } })),
    ];
    const weights = computeRuleWeights(reports);
    expect(weights['structure.hook']).toBeLessThan(1);
    expect(weights['structure.hook']).toBeGreaterThanOrEqual(0.5);
    expect(weights['closer.bait']).toBeGreaterThan(1);
    expect(weights['closer.bait']).toBeLessThanOrEqual(1.5);
  });

  it('ignoruje antysygnały i nieznane reguły', () => {
    const reports = Array.from({ length: 25 }, () =>
      report({ text: 'c', label: 'human', heuristic: { score: 1, signals: ['substance.dates', 'nope'] } }),
    );
    expect(computeRuleWeights(reports)).toEqual({});
  });
});

describe('dobór przykładów few-shot', () => {
  const slopA = REPORT_FIXTURES.find((f) => f.id === 'r4.3-1')!.text;
  const reports = [
    report({ text: slopA, family: 'antithesis' }),
    report({ text: 'Inny slop o liście lekcji', family: 'lessons-list' }),
    report({ text: 'Trzeci slop', family: 'broetry' }),
    report({ text: 'Czwarty slop', family: 'hot-take' }),
    report({ text: 'Ludzki post o migracji bazy', label: 'human' }),
  ];

  it('max 4, z co najmniej jednym „nie slop”', () => {
    const examples = selectExamples(reports, [{ family: 'antithesis', minhash: minhash(slopA) }]);
    expect(examples).toHaveLength(4);
    expect(examples.filter((e) => e.label === 'human')).toHaveLength(1);
  });

  it('najpierw podobny post / ta sama rodzina', () => {
    const examples = selectExamples(reports, [{ family: 'antithesis', minhash: minhash(slopA) }]);
    expect(examples[0]!.text).toBe(slopA);
  });

  it('przykłady trafiają do promptu', () => {
    const examples = selectExamples(reports, [{ family: 'antithesis', minhash: minhash(slopA) }]);
    const [system] = buildLlmMessages([{ id: 'p1', text: 'test' }], examples);
    expect(system!.content).toContain('Przykłady oznaczone ręcznie');
    expect(system!.content).toContain('NIE SLOP');
  });
});

describe('eksport / import', () => {
  it('eksport jest zgodny z formatem fiksturek i wraca przez import', () => {
    const file = toExportFile([report({ text: 'Tekst posta', family: 'broetry', note: 'n' })], [
      { id: 'p', phrase: 'synergia', weight: 1, createdAt: 0 },
    ]);
    expect(file.posts[0]).toMatchObject({ label: 'slop', kind: 'post', family: 'broetry', text: 'Tekst posta' });
    const back = parseImport(JSON.parse(JSON.stringify(file)));
    expect(back.posts).toEqual([{ label: 'slop', text: 'Tekst posta', family: 'broetry', note: 'n' }]);
    expect(back.phrases).toEqual([{ phrase: 'synergia', weight: 1, family: undefined }]);
  });

  it('import przyjmuje gołą tablicę fiksturek i odrzuca śmieci', () => {
    const parsed = parseImport([...REPORT_FIXTURES, { label: 'x', text: 'a' }, { text: '' }, null]);
    expect(parsed.posts.length).toBe(REPORT_FIXTURES.filter((f) => f.kind === 'post').length);
  });
});

describe('limit zgłoszeń', () => {
  it('najpierw wypadają najstarsze „slop”', () => {
    const reports = [
      report({ text: '1', label: 'human' }),
      report({ text: '2' }),
      report({ text: '3' }),
      report({ text: '4', label: 'human' }),
    ];
    const kept = enforceLimit(reports, 3);
    expect(kept.map((r) => r.text)).toEqual(['1', '3', '4']);
  });
});

describe('odpowiedzi OpenRoutera', () => {
  it('tryb LLM: JSON w otoczce tekstu, nieznane id ignorowane', () => {
    const answers = [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0];
    const text = `Oto wynik:\n\`\`\`json\n${JSON.stringify({
      results: [
        { id: 'p1', answers, family: 'broetry', reason: 'scena → lekcja' },
        { id: 'p9', answers, family: 'broetry', reason: '' },
        { id: 'p2', answers: [1], family: 'x', reason: '' },
      ],
    })}\n\`\`\``;
    const out = parseLlmResponse(text, ['p1', 'p2']);
    expect([...out.keys()]).toEqual(['p1']);
    expect(out.get('p1')).toMatchObject({ score: answersToScore(answers), family: 'broetry' });
  });

  it('tryb decyzyjny', () => {
    const out = parseDecisionResponse('p1: SLOP\np2: ok\n', ['p1', 'p2']);
    expect(out.get('p1')?.score).toBe(10);
    expect(out.get('p2')?.score).toBe(1);
    expect(parseDecisionResponse('SLOP', ['p1']).get('p1')?.score).toBe(10);
  });
});

describe('kolejka i bezpiecznik', () => {
  const post = (key: string): PostInput => ({ key, text: key, heuristic: { score: 5, family: 'broetry' } });

  it('łączy żądania w batche po max 5 i deduplikuje', async () => {
    const calls: string[][] = [];
    const queue = new BatchQueue({
      delayMs: 5,
      classify: async (posts) => {
        calls.push(posts.map((p) => p.key));
        return new Map<string, LlmVerdict>(posts.map((p) => [p.key, { score: 9 }]));
      },
    });
    const results = await Promise.all(['a', 'b', 'c', 'd', 'e', 'f', 'a'].map((k) => queue.enqueue(post(k))));
    expect(results.every((r) => r?.score === 9)).toBe(true);
    expect(calls.flat().sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(Math.max(...calls.map((c) => c.length))).toBeLessThanOrEqual(5);
  });

  it('błąd providera → null (zostaje heurystyka)', async () => {
    const queue = new BatchQueue({ delayMs: 1, classify: () => Promise.reject(new Error('500')) });
    expect(await queue.enqueue(post('x'))).toBeNull();
  });

  it('bezpiecznik otwiera się po 3 błędach na 10 minut', () => {
    let now = 0;
    const breaker = new CircuitBreaker(3, 600_000, () => now);
    breaker.failure('a');
    breaker.failure('b');
    expect(breaker.isOpen).toBe(false);
    breaker.failure('c');
    expect(breaker.isOpen).toBe(true);
    now = 600_001;
    expect(breaker.isOpen).toBe(false);
  });

  it('cache: usuwa przeterminowane i najstarsze ponad limit', () => {
    vi.useFakeTimers();
    const now = 10 * 24 * 3600 * 1000;
    const cache = {
      old: { verdict: { score: 1 }, at: 0 },
      a: { verdict: { score: 2 }, at: now - 3 },
      b: { verdict: { score: 3 }, at: now - 2 },
      c: { verdict: { score: 4 }, at: now - 1 },
    };
    expect(Object.keys(prune(cache, now, 2)).sort()).toEqual(['b', 'c']);
    vi.useRealTimers();
  });
});
