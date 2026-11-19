import type { ScoreResult, SignalHit, UserContext } from '../types';
import { SLOP_FAMILIES, type SlopFamily } from './families';
import { parsePost, type ParsedPost } from './parse-post';
import { escapeRegex, re } from './regex';
import { RULES, type RuleGroup } from './rules';
import { minhash, minhashSimilarity } from './similarity';
import type { TestItemId } from './test-items';

/**
 * Przeliczenie surowych punktów na skalę raportu 0–12. Heurystyka widzi 9 z 12 pytań,
 * a pozostałe (wata, przenośna pointa) zwykle współwystępują — stąd mnożnik 1,5.
 */
const SCALE = 1.5;
const MAX_ITEM_VALUE = 1.5;
/**
 * Zasada klastra (raport §1): bez klastra wynik nie przekracza „podejrzane”.
 * Klaster = ≥ 3 różne grupy sygnałów albo ≥ 2 grupy + brak konkretu + ≥ 4 sygnały.
 */
const MIN_CLUSTER_GROUPS = 3;
const UNCLUSTERED_CAP = 6;

export const SIMILARITY_THRESHOLD = 0.6;
const SIMILAR_SLOP_BONUS = 3;
const SIMILAR_HUMAN_PENALTY = -3;
const AUTHOR_BOOST = 2;

const NON_CLUSTER_GROUPS: ReadonlySet<RuleGroup> = new Set(['absence', 'substance']);

export interface ScoreOptions {
  context?: UserContext;
  authorId?: string;
  /** Pozwala podać gotowy MinHash (np. przy ponownym przeliczeniu). */
  minhash?: number[];
}

const phraseRegexCache = new Map<string, RegExp>();
function phraseRegex(phrase: string): RegExp {
  let r = phraseRegexCache.get(phrase);
  if (!r) {
    r = re(`\\b${escapeRegex(phrase.toLowerCase().trim())}\\b`, 'iu');
    phraseRegexCache.set(phrase, r);
  }
  return r;
}

function userHits(post: ParsedPost, options: ScoreOptions): { hits: SignalHit[]; matched?: ScoreResult['matchedReport'] } {
  const ctx = options.context;
  const hits: SignalHit[] = [];
  if (!ctx) return { hits };

  for (const p of ctx.phrases) {
    if (p.phrase.trim().length < 3) continue;
    if (phraseRegex(p.phrase).test(post.lower)) {
      hits.push({ id: `user.phrase:${p.id}`, family: p.family ?? 'ai-vocabulary', group: 'user', contribution: p.weight });
    }
  }

  let matched: ScoreResult['matchedReport'];
  if (ctx.reportSignatures.length > 0 && post.words.length >= 8) {
    const signature = options.minhash ?? minhash(post.text);
    let best: { id: string; label: 'slop' | 'human'; family?: SlopFamily; similarity: number } | undefined;
    for (const r of ctx.reportSignatures) {
      const similarity = minhashSimilarity(signature, r.minhash);
      if (similarity >= SIMILARITY_THRESHOLD && (!best || similarity > best.similarity)) {
        best = { id: r.id, label: r.label, family: r.family, similarity };
      }
    }
    if (best) {
      matched = { id: best.id, label: best.label, similarity: best.similarity };
      hits.push({
        id: best.label === 'slop' ? 'user.similar-slop' : 'user.similar-human',
        family: best.family ?? 'broetry',
        group: 'user',
        contribution: best.label === 'slop' ? SIMILAR_SLOP_BONUS : SIMILAR_HUMAN_PENALTY,
      });
    }
  }

  if (options.authorId && ctx.boostedAuthors.includes(options.authorId)) {
    hits.push({ id: 'user.author', family: 'broetry', group: 'user', contribution: AUTHOR_BOOST });
  }
  return { hits, matched };
}

export function scorePost(text: string, options: ScoreOptions = {}): ScoreResult {
  const post = parsePost(text);
  const weights = options.context?.ruleWeights ?? {};
  const familyVotes = new Map<SlopFamily, number>();
  const vote = (family: SlopFamily, amount: number) => familyVotes.set(family, (familyVotes.get(family) ?? 0) + amount);

  const matched = new Map<string, { strength: number }>();
  for (const rule of RULES) {
    const strength = rule.match(post);
    if (strength > 0) matched.set(rule.id, { strength });
  }

  const signals: SignalHit[] = [];
  const itemValues = new Map<TestItemId, number>();
  let extras = 0;

  for (const rule of RULES) {
    const m = matched.get(rule.id);
    if (!m) continue;
    if (rule.suppressedBy?.some((id) => matched.has(id))) continue;
    const weight = rule.weight * (weights[rule.id] ?? 1);
    const contribution = weight * m.strength;
    signals.push({ id: rule.id, family: rule.family, group: rule.group, testItem: rule.testItem, contribution });
    if (rule.testItem && contribution > 0) {
      itemValues.set(rule.testItem, Math.min(MAX_ITEM_VALUE, Math.max(itemValues.get(rule.testItem) ?? 0, contribution)));
    } else {
      extras += contribution;
    }
    if (contribution > 0) vote(rule.family, (rule.familyWeight ?? Math.abs(rule.weight)) * m.strength);
  }

  const user = userHits(post, options);
  let userTotal = 0;
  for (const hit of user.hits) {
    signals.push(hit);
    userTotal += hit.contribution;
    if (hit.contribution > 0) vote(hit.family, hit.contribution * 2);
  }

  const raw = [...itemValues.values()].reduce((a, b) => a + b, 0) + extras + userTotal;
  const clusterGroups = [
    ...new Set(signals.filter((s) => s.contribution > 0 && !NON_CLUSTER_GROUPS.has(s.group)).map((s) => s.group)),
  ];

  let score = Math.max(0, Math.min(12, Math.round(raw * SCALE)));
  const strongUserSignal = user.matched?.label === 'slop';
  const positiveSignals = signals.filter((s) => s.contribution > 0 && s.group !== 'absence').length;
  const noConcrete = signals.some((s) => s.group === 'absence');
  const hasCluster =
    clusterGroups.length >= MIN_CLUSTER_GROUPS || (clusterGroups.length >= 2 && noConcrete && positiveSignals >= 4);
  const capped = !hasCluster && !strongUserSignal && score > UNCLUSTERED_CAP;
  if (capped) score = UNCLUSTERED_CAP;

  return {
    score,
    raw,
    family: pickFamily(familyVotes),
    testItems: [...itemValues.entries()].filter(([, v]) => v >= 0.5).map(([k]) => k).sort((a, b) => a - b),
    signals,
    clusterGroups,
    capped,
    matchedReport: user.matched,
  };
}

function pickFamily(votes: Map<SlopFamily, number>): SlopFamily {
  let best: SlopFamily = 'broetry';
  let bestVotes = 0;
  for (const family of SLOP_FAMILIES) {
    const v = votes.get(family) ?? 0;
    if (v > bestVotes) {
      best = family;
      bestVotes = v;
    }
  }
  return best;
}
