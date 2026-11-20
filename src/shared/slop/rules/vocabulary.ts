import type { ParsedPost } from '../parse-post';
import { combine, distinctHits } from '../regex';
import { phraseRule, type SignalRule } from './types';

/** Słowa wprost wymienione w pytaniu 6 testu (raport §7) — jedno trafienie wystarcza. */
const CORE_WORDS = combine([
  /\bhumbled\b/,
  /\bthrilled\b/,
  /\bresonat(?:e|es|ed|ing)\b/,
  /\bjourney\b/,
  /\bgame[- ]?changer\b/,
  /\bdelv(?:e|es|ing)\b/,
  /\btapestry\b/,
], 'iu');

/** Bank słownictwa AI (raport §5.3 i §5.5). */
const AI_WORDS = combine([
  // EN
  /\btestament\b/, /\bunderscor(?:e|es|ing)\b/, /\bshowcas(?:e|es|ing)\b/, /\bfoster(?:s|ing|ed)?\b/,
  /\bnavigat(?:e|es|ing)\b/, /\blandscape\b/, /\brealm\b/, /\bpivotal\b/, /\brobust\b/, /\bseamless(?:ly)?\b/,
  /\bleverag(?:e|es|ing)\b/, /\bharness(?:es|ing)?\b/, /\bunlock(?:s|ing)?\b/, /\belevat(?:e|es|ing)\b/,
  /\bempower(?:s|ing|ed|ment)?\b/, /\bholistic\b/, /\bintricate\b/, /\bmyriad\b/, /\bparamount\b/,
  /\bsynerg(?:y|ies)\b/, /\becosystem\b/, /\bparadigm\b/, /\bcatalyst\b/, /\bcornerstone\b/, /\bbeacon\b/,
  /\bembark(?:s|ing)?\b/, /\bmeticulous(?:ly)?\b/, /\btransformative\b/, /\bcutting[- ]edge\b/,
  /\bbest[- ]in[- ]class\b/, /\bworld[- ]class\b/, /\bnext[- ]level\b/, /\bfuture[- ]proof\b/,
  /\baction[- ]oriented\b/, /\bvalue[- ]add\b/,
  // PL
  /\bholistyczn\w*/, /\bsynergi\w*/, /\binnowacyjn\w* rozwiąza\w*/, /\bkompleksow\w* wsparci\w*/,
  /\bkluczow\w* moment\w*/, /\bogromn\w* potencja\w*/, /\bnawigowa\w*/, /\bmistern\w*/, /\bpielęgnuj\w*/,
  /\bekosystem\w*/, /\btransformacyjn\w*/, /\bprzełomow\w*/, /\brewolucyjn\w*/, /\bwartoś\w* dodan\w*/,
  /\bskrojon\w* na miarę\b/, /\bzłożonoś\w*/, /\bludzkiego potencjału\b/, /\bpotencjał\w* ludzk\w*/, /\bwyzwania i możliwości\b/, /\bkluczem (?:jest|do sukcesu)\b/,
], 'iu');

/** Liczone raz na post (obie reguły słownictwa korzystają z tych samych liczników). */
const cache = new WeakMap<ParsedPost, { core: number; ai: number }>();
function counts(post: ParsedPost): { core: number; ai: number } {
  let c = cache.get(post);
  if (!c) {
    c = { core: distinctHits(post.lower, CORE_WORDS), ai: distinctHits(post.lower, AI_WORDS) };
    cache.set(post, c);
  }
  return c;
}

export const VOCABULARY_RULES: SignalRule[] = [
  {
    id: 'vocab.words',
    family: 'ai-vocabulary',
    group: 'vocabulary',
    testItem: 6,
    weight: 1,
    familyWeight: 0.6,
    match: (post) => {
      const { core, ai: hits } = counts(post);
      if (core > 0) return 1;
      return hits >= 3 ? 1 : hits === 2 ? 0.75 : hits === 1 ? 0.5 : 0;
    },
  },
  {
    id: 'vocab.dense',
    family: 'ai-vocabulary',
    group: 'vocabulary',
    weight: 1.25,
    familyWeight: 3,
    match: (post) => {
      const { core, ai } = counts(post);
      const hits = core + ai;
      return hits >= 6 ? 1 : hits >= 4 ? 0.6 : 0;
    },
  },
  phraseRule('vocab.fast-paced-world', 'ai-vocabulary', 'vocabulary', 1, [
    /\bin today['’]?s (?:[\w-]+ ){0,3}(?:world|landscape|environment|market|age|era|economy)\b/,
    /\bw dzisiejszym (?:dynamicznym|dynamicznie zmieniającym się|szybko zmieniającym się|cyfrowym) (?:świecie|otoczeniu)\b/,
    /\bw dzisiejszych (?:dynamicznych |szybko zmieniających się )?czasach\b/,
  ], { testItem: 6, familyWeight: 2 }),
];
