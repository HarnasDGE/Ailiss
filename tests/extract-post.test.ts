// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { extractComment } from '../src/content/linkedin/extract-comment';
import { extractPost } from '../src/content/linkedin/extract-post';
import { findPosts } from '../src/content/linkedin/feed-observer';
import { judgeComment } from '../src/shared/slop/comment';
import { COMMENT_SELECTOR } from '../src/content/linkedin/selectors';
import { REPORT_FIXTURES } from './fixtures/load';

const fixture = (id: string) => REPORT_FIXTURES.find((f) => f.id === id)!.text;

beforeAll(() => {
  const html = readFileSync(join(__dirname, 'fixtures', 'dom', 'feed.html'), 'utf8');
  document.documentElement.innerHTML = html.replace(/^[\s\S]*?<html[^>]*>/, '').replace(/<\/html>\s*$/, '');
});

function post(urn: number): HTMLElement {
  return findPosts(document).find((el) => el.dataset.urn === `urn:li:activity:${urn}`)!;
}

describe('ekstrakcja z DOM LinkedIn (makieta)', () => {
  it('znajduje tylko zewnętrzne kontenery postów', () => {
    expect(findPosts(document)).toHaveLength(8);
  });

  it('zachowuje podziały akapitów i pomija przycisk „…więcej”', () => {
    const p = extractPost(post(1001));
    expect(p.text).toBe(fixture('r4.2-1'));
    expect(p.text).not.toContain('więcej');
  });

  it('autor: imię bez duplikatu z visually-hidden i ścieżka profilu', () => {
    const p = extractPost(post(1001));
    expect(p.authorName).toBe('Jan Kowalski');
    expect(p.authorId).toBe('/in/jan-kowalski');
  });

  it('hashtagi z linków nie zawierają słowa „hashtag”', () => {
    const p = extractPost(post(1003));
    expect(p.text).toContain('#leadership #growth');
    expect(p.text).not.toMatch(/hashtag#/);
  });

  it('rozpoznaje post sponsorowany i firmę jako autora', () => {
    const p = extractPost(post(1005));
    expect(p.isSponsored).toBe(true);
    expect(p.authorId).toBe('/company/acme');
  });

  it('repost bez komentarza → tekst oryginału', () => {
    const p = extractPost(post(1007));
    expect(p.isRepost).toBe(true);
    expect(p.text).toBe(fixture('r4.3-2'));
  });

  it('komentarze: slop vs odniesienie do posta', () => {
    const comments = [...document.querySelectorAll<HTMLElement>(COMMENT_SELECTOR)].map(extractComment);
    expect(comments).toHaveLength(2);
    expect(judgeComment(comments[0]!.text, comments[0]!.postText).isSlop).toBe(true);
    expect(judgeComment(comments[1]!.text, comments[1]!.postText).isSlop).toBe(false);
  });
});
