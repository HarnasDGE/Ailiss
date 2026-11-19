import type { SlopFamily } from '../families';
import type { ParsedPost } from '../parse-post';
import { re } from '../regex';
import type { TestItemId } from '../test-items';

/**
 * Grupy sygnałów — do zasady klastra (raport §1): slop to kilka różnych grup naraz.
 * `absence` (brak konkretu) i `substance` (antysygnały) nie liczą się do klastra.
 */
export type RuleGroup =
  | 'structure'
  | 'opener'
  | 'closer'
  | 'vocabulary'
  | 'construction'
  | 'signature'
  | 'absence'
  | 'substance'
  | 'user';

export interface SignalRule {
  id: string;
  family: SlopFamily;
  group: RuleGroup;
  /** Pytanie z testu 0–12, które reguła realizuje (wartość pytania = max z jego reguł, cap 1). */
  testItem?: TestItemId;
  /** Ujemna = antysygnał. */
  weight: number;
  /** Ile reguła „głosuje” na rodzinę; domyślnie |weight|. Reguły strukturalne mają mało. */
  familyWeight?: number;
  /** Reguła ignorowana, jeśli trafiła któraś z podanych (np. „mgliste dane” przy nazwanym źródle). */
  suppressedBy?: string[];
  /** Siła trafienia 0..1 (0 = brak). */
  match: (post: ParsedPost) => number;
}

type Scope = 'text' | 'head' | 'tail';

interface PhraseRuleOptions {
  scope?: Scope;
  testItem?: TestItemId;
  familyWeight?: number;
}

/** Reguła „jakakolwiek fraza z listy występuje w danym zakresie tekstu”. */
export function phraseRule(
  id: string,
  family: SlopFamily,
  group: RuleGroup,
  weight: number,
  patterns: (string | RegExp)[],
  options: PhraseRuleOptions = {},
): SignalRule {
  const compiled = patterns.map((p) => re(p, 'imu'));
  const scope = options.scope ?? 'text';
  return {
    id,
    family,
    group,
    weight,
    testItem: options.testItem,
    familyWeight: options.familyWeight,
    match: (post) => {
      const haystack = scope === 'head' ? post.head : scope === 'tail' ? post.tail : post.lower;
      return compiled.some((r) => r.test(haystack)) ? 1 : 0;
    },
  };
}

/** Liczba różnych wzorców z listy, które trafiły. */
export function countPatternHits(text: string, patterns: RegExp[]): number {
  return patterns.reduce((n, r) => n + (r.test(text) ? 1 : 0), 0);
}
