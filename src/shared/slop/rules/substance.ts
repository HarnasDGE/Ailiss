import { re } from '../regex';
import type { SignalRule } from './types';

/**
 * Antysygnały — „substancja” obniża wynik (raport §1: slop = forma + zero konkretu).
 * Wagi ujemne; nie liczą się do klastra.
 */
const UNCERTAINTY = re(
  /\b(?:jeszcze nie wiem|nie wiem,? czy|nie jestem pewien|nie jestem pewna|trzeba uważać|ciekawe,? czy|not sure (?:yet|if|whether)|i don['’]?t know (?:yet|if|whether)|still figuring (?:it )?out|i might be wrong|mogę się mylić)\b/,
  'iu',
);

const SOURCE_NAMES = re(
  /\b(?:gallup|mckinsey|gartner|forrester|deloitte|pwc|pew research|eurostat|gus|nbp|oecd|github|stack overflow)\b|https?:\/\//,
  'iu',
);
const SOURCE_ATTRIBUTION = re(/\bwg [\p{Lu}]|\baccording to [\p{Lu}]|\(\s*(?:19|20)\d\d\s*\)/, 'u');

const MEASURED_NUMBER = re(
  /\d[\d,.\s]*(?:%|pp|k\b|zł|pln|€|eur|usd|ms|gb|mb|linii|lines|osób|osoby|os\.|etap\w*|dni|tygodni\w*|miesięc\w*|kwarta\w*|godzin\w*|h\b|min\b)/,
  'giu',
);

export const SUBSTANCE_RULES: SignalRule[] = [
  {
    id: 'substance.long-paragraph',
    family: 'broetry',
    group: 'substance',
    weight: -1.5,
    familyWeight: 0,
    // Proza: akapit z ≥ 3 zdaniami i średnio ≥ 10 słów na zdanie (staccato „I panicked. I cried.” się nie liczy).
    match: (post) => {
      let best = 0;
      post.units.forEach((_, i) => {
        const sentences = post.unitSentenceCounts[i] ?? 1;
        const words = post.unitWordCounts[i] ?? 0;
        if (sentences < 3 || words / sentences < 10) return;
        best = Math.max(best, sentences >= 4 && words / sentences >= 12 ? 1 : 0.5);
      });
      return best;
    },
  },
  {
    id: 'substance.proper-nouns',
    family: 'broetry',
    group: 'substance',
    weight: -0.75,
    familyWeight: 0,
    match: (post) => (post.properNouns.length >= 5 ? 1.5 : post.properNouns.length >= 3 ? 1 : 0),
  },
  {
    id: 'substance.dates',
    family: 'broetry',
    group: 'substance',
    weight: -0.5,
    familyWeight: 0,
    match: (post) => (post.specificDates > 0 || post.dateMentions >= 2 ? 1 : post.dateMentions === 1 ? 0.5 : 0),
  },
  {
    id: 'substance.measured-numbers',
    family: 'broetry',
    group: 'substance',
    weight: -0.75,
    familyWeight: 0,
    match: (post) => {
      const n = post.text.match(MEASURED_NUMBER)?.length ?? 0;
      return n >= 3 ? 1 : n === 2 ? 0.5 : 0;
    },
  },
  {
    id: 'substance.uncertainty',
    family: 'broetry',
    group: 'substance',
    weight: -1,
    familyWeight: 0,
    match: (post) => (UNCERTAINTY.test(post.lower) ? 1 : 0),
  },
  {
    id: 'substance.named-source',
    family: 'broetry',
    group: 'substance',
    weight: -1,
    familyWeight: 0,
    match: (post) => (SOURCE_NAMES.test(post.text) || SOURCE_ATTRIBUTION.test(post.text) ? 1 : 0),
  },
];
