// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { extractPost } from '../src/content/linkedin/extract-post';
import { findPosts } from '../src/content/linkedin/feed-observer';
import { scorePost } from '../src/shared/slop/score';
import { REPORT_FIXTURES } from './fixtures/load';

beforeAll(() => {
  const html = readFileSync(join(__dirname, 'fixtures', 'dom', 'feed-sdui.html'), 'utf8');
  document.documentElement.innerHTML = html.replace(/^[\s\S]*?<html[^>]*>/, '').replace(/<\/html>\s*$/, '');
});

const posts = () => findPosts(document);

describe('nowy feed LinkedIn (SDUI, zaciemnione klasy)', () => {
  it('znajduje karty postów po role=listitem + componentkey', () => {
    expect(posts()).toHaveLength(2);
    expect(posts()[0]!.getAttribute('role')).toBe('listitem');
  });

  it('tekst z data-testid="expandable-text-box", bez „… więcej”', () => {
    const p = extractPost(posts()[0]!);
    expect(p.text.startsWith('Dziś wieczorem dowiem się')).toBe(true);
    expect(p.text).toContain('\n\nW 2021 roku Robert Lewandowski');
    expect(p.text.endsWith('kłaniam się Wam nisko i dziękuję...')).toBe(true);
    expect(p.text).not.toContain('więcej');
  });

  it('autor = ostatni profil przed tekstem, nie osoba z „poleca to”', () => {
    const p = extractPost(posts()[0]!);
    expect(p.authorId).toBe('/in/autor-posta');
    expect(p.authorName).toBe('Autor Posta');
    expect(p.isSponsored).toBe(false);
    expect(p.isRepost).toBe(false);
    expect(p.urn).toContain('update-card-focus');
  });

  it('post z konkretem (nazwiska, liczby, daty) nie jest slopem', () => {
    expect(scorePost(extractPost(posts()[0]!).text).score).toBeLessThan(4);
  });

  it('slop w nowym DOM: tekst, autor, „Promowane”, wynik', () => {
    const p = extractPost(posts()[1]!);
    expect(p.text).toBe(REPORT_FIXTURES.find((f) => f.id === 'r4.13-1')!.text);
    expect(p.authorName).toBe('Coach Produktywności');
    expect(p.isSponsored).toBe(true);
    expect(scorePost(p.text).score).toBeGreaterThanOrEqual(7);
  });
});
