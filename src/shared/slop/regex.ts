/**
 * `\b` w JS jest ASCII-only nawet z flagą `u` — nie działa dla „się”, „ł”, „ż”.
 * `re()` podmienia `\b` na granicę słowa opartą o klasy Unicode.
 */
const UNICODE_BOUNDARY = '(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))';

export function re(source: string | RegExp, flags = 'iu'): RegExp {
  const src = typeof source === 'string' ? source : source.source;
  const finalFlags = flags.includes('u') ? flags : `${flags}u`;
  return new RegExp(src.replace(/\\b/g, UNICODE_BOUNDARY), finalFlags);
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function countMatches(text: string, pattern: RegExp): number {
  const global = pattern.flags.includes('g') ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
  return text.match(global)?.length ?? 0;
}
