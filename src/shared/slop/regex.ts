/**
 * `\b` w JS jest ASCII-only nawet z flagą `u` — nie działa dla „się”, „ł”, „ż”.
 * `re()` podmienia `\b` na granicę słowa opartą o klasy Unicode.
 *
 * Wariant „poprzedni znak nie jest literą LUB następny nie jest literą” jest równoważny `\b`,
 * gdy po jednej stronie granicy wzorzec ma literę/cyfrę (tak jest we wszystkich regułach),
 * a jest kilkukrotnie tańszy niż pełna alternatywa z czterema lookaroundami.
 */
const WORD = '[\\p{L}\\p{N}_]';
const UNICODE_BOUNDARY = `(?:(?<!${WORD})|(?!${WORD}))`;

function source(pattern: string | RegExp): string {
  return typeof pattern === 'string' ? pattern : pattern.source;
}

export function re(pattern: string | RegExp, flags = 'iu'): RegExp {
  const finalFlags = flags.includes('u') ? flags : `${flags}u`;
  return new RegExp(source(pattern).replace(/\\b/g, UNICODE_BOUNDARY), finalFlags);
}

/**
 * Łączy wiele wzorców w jeden regex — tekst jest skanowany raz zamiast N razy.
 * Każdy wzorzec trafia do własnej grupy przechwytującej (wzorce nie mogą mieć własnych grup przechwytujących).
 */
export function combine(patterns: readonly (string | RegExp)[], flags = 'imu'): RegExp {
  return re(patterns.map((p) => `(${source(p)})`).join('|'), flags.includes('g') ? flags : `${flags}g`);
}

/** Ile różnych wzorców z `combine()` trafiło w tekst. */
export function distinctHits(text: string, combined: RegExp): number {
  const hit = new Set<number>();
  for (const m of text.matchAll(combined)) {
    for (let i = 1; i < m.length; i++) {
      if (m[i] !== undefined) {
        hit.add(i);
        break;
      }
    }
  }
  return hit.size;
}

/** Czy którykolwiek wzorzec z `combine()` trafił (bez stanu `lastIndex`). */
export function anyHit(text: string, combined: RegExp): boolean {
  combined.lastIndex = 0;
  const found = combined.test(text);
  combined.lastIndex = 0;
  return found;
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function countMatches(text: string, pattern: RegExp): number {
  const global = pattern.flags.includes('g') ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
  return text.match(global)?.length ?? 0;
}
