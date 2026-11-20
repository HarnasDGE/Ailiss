import { combine, re } from '../regex';
import { countPatternHits, type SignalRule } from './types';

/** Closéry pisane pod algorytm (raport §4.7, §5.2, §5.5) — szukane w ostatnich akapitach. */
const TAIL_CLOSERS = combine([
  /\b(?:agree|thoughts|who['’]?s with me|am i wrong|right)\s*\?/,
  /\bwhich (?:one )?resonates\b/,
  /\bwhat (?:would|do) you add\b|\bwhat['’]?s the one thing you['’]?d add\b/,
  /\bzgadzasz się\s*\?|\bzgadzacie się\s*\?/,
  /\b(?:a )?(?:ty|wy),? co o tym (?:myślisz|myślicie)\s*\?|\bco o tym (?:myślisz|myślicie)\s*\?/,
  /\bdaj(?:cie)? znać w komentarzu\b/,
  /\bjakie są wasze doświadczenia\s*\?/,
  /👇\s*$/m,
  /\bare you ready\s*\?/,
  /\bjoin us!?\s*(?:\p{Extended_Pictographic}|$)/mu,
  /\bdołącz(?:cie)? do nas\b/,
  /\bjesteś gotowy\s*\?|\bjesteście gotowi\s*\?/,
]);

/** Closéry, które są baitem niezależnie od miejsca w poście. */
const ANYWHERE_CLOSERS = combine([
  /\bcomment\s+["“”]?[a-z]{2,}["“”]?\s+(?:below|in the comments)\b/,
  /\bdrop an? (?:["“][^"”]+["”]|\p{Extended_Pictographic}|\w+) (?:below|in the comments)?/u,
  /\brepost (?:if|to help)\b/,
  /♻️/,
  /\btag (?:someone|a friend|a colleague)\b/,
  /\bfollow (?:me )?for (?:more|daily)\b/,
  /\bsave this (?:post )?for later\b/,
  /\bif you made it this far\b/,
  /\bif this resonated\b/,
  /\bnapisz\s+["„“]?[a-ząćęłńóśźż]{2,}["”]?\s+w komentarzu\b/,
  /\budostępnij,? (?:jeśli|aby|żeby)\b/,
  /\bobserwuj (?:mnie )?(?:po więcej|aby nie przegapić|żeby nie przegapić)\b/,
  /\bzapisz (?:ten post|sobie)(?: na później)?\b/,
  /\boznacz (?:kogoś|osobę|znajomego)\b/,
]);

const PS_RE = re(/^p\.\s?(?:p\.\s?)?s\.?\s/, 'imu');

function closerHits(lowerTail: string, lowerText: string): number {
  return countPatternHits(lowerTail, TAIL_CLOSERS) + countPatternHits(lowerText, ANYWHERE_CLOSERS);
}

export const CLOSER_RULES: SignalRule[] = [
  {
    id: 'closer.bait',
    family: 'engagement-bait',
    group: 'closer',
    testItem: 7,
    weight: 1,
    familyWeight: 1.5,
    match: (post) => (closerHits(post.tail, post.lower) > 0 ? 1 : 0),
  },
  {
    id: 'closer.multiple',
    family: 'engagement-bait',
    group: 'closer',
    weight: 0.75,
    familyWeight: 1.5,
    match: (post) => {
      const hits = closerHits(post.tail, post.lower) + (PS_RE.test(post.text) ? 1 : 0);
      return hits >= 3 ? 2 : hits === 2 ? 1 : 0;
    },
  },
  {
    id: 'closer.ps',
    family: 'engagement-bait',
    group: 'closer',
    weight: 0.25,
    match: (post) => (PS_RE.test(post.text) ? 1 : 0),
  },
];
