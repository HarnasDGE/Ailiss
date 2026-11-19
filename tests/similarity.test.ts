import { describe, expect, it } from 'vitest';
import { jaccard, minhash, minhashSimilarity, textHash } from '../src/shared/slop/similarity';
import { REPORT_FIXTURES } from './fixtures/load';

const a = REPORT_FIXTURES.find((f) => f.id === 'r4.3-1')!.text;
const b = REPORT_FIXTURES.find((f) => f.id === 'r4.13-1')!.text;

describe('similarity', () => {
  it('identyczny tekst = 1', () => {
    expect(minhashSimilarity(minhash(a), minhash(a))).toBe(1);
  });

  it('ten sam szablon z drobną zmianą jest podobny', () => {
    const variant = a.replace('Leadership', 'Management').replace('impact', 'results');
    expect(minhashSimilarity(minhash(a), minhash(variant))).toBeGreaterThan(0.5);
  });

  it('różne posty są niepodobne', () => {
    expect(minhashSimilarity(minhash(a), minhash(b))).toBeLessThan(0.2);
  });

  it('MinHash przybliża Jaccarda', () => {
    const variant = `${a}\n\nThat's it.`;
    expect(Math.abs(minhashSimilarity(minhash(a), minhash(variant)) - jaccard(a, variant))).toBeLessThan(0.2);
  });

  it('textHash ignoruje różnice w białych znakach i wielkości liter', () => {
    expect(textHash('Hello   World!')).toBe(textHash('hello world'));
    expect(textHash('hello world')).not.toBe(textHash('hello there'));
  });
});
