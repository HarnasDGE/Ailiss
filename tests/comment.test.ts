import { describe, expect, it } from 'vitest';
import { judgeComment } from '../src/shared/slop/comment';
import { REPORT_FIXTURES } from './fixtures/load';

const post = REPORT_FIXTURES.find((f) => f.id === 'r8.4-po')!.text;

describe('komentarze', () => {
  it.each(REPORT_FIXTURES.filter((f) => f.kind === 'comment').map((f) => [f.id, f] as const))('%s', (_, f) => {
    expect(judgeComment(f.text, post).isSlop).toBe(f.label === 'slop');
  });

  it('reklama pod postem to slop', () => {
    expect(judgeComment('Ciekawe! Pomagamy firmom B2B zwiększyć sprzedaż — napisz do mnie.').reason).toBe('promo');
  });

  it('same emoji to slop', () => {
    expect(judgeComment('🔥🔥🔥').isSlop).toBe(true);
  });

  it('pochwała z odniesieniem do treści posta nie jest slopem', () => {
    const comment = 'Świetny post — u nas boilerplate też przyspieszył, ale decyzje architektoniczne bez zmian.';
    expect(judgeComment(comment, post).isSlop).toBe(false);
  });
});
