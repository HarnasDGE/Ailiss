import { re } from '../regex';
import { countWordsIn } from '../parse-post';
import { LIFE_SCENE_OPENERS } from './family-phrases';
import { phraseRule, type SignalRule } from './types';

const LIFE_SCENE = LIFE_SCENE_OPENERS.map((p) => re(p, 'imu'));
const BUSINESS_PIVOT = re(
  /\b(?:leadership|leader|sales|business|customer experience|customers?|teams?|strategy|marketing|hiring|recruit\w*|culture|career|management|przywództw\w*|lider\w*|sprzedaż\w*|biznes\w*|klient\w*|zesp\w*|strategi\w*|rekrutac\w*|kultur\w* organizac\w*|karier\w*)\b/,
  'iu',
);

/** „It's not X, it's Y” i warianty (raport §4.3, §5.4). `\s+` łapie też przejście przez pustą linię. */
const ANTITHESIS = [
  /\b(?:it['’]?s|it is|this is|that['’]?s)\s+not\s+(?:just\s+)?(?:about\s+)?[^.!?\n]{1,50}[.,;—–]\s*(?:it['’]?s|it is|but)\s+/,
  /\b\w+\s+(?:isn['’]?t|is not|aren['’]?t|are not|won['’]?t be|don['’]?t)\s+(?:about\s+|a\s+|an\s+|just\s+|built on\s+)?[^.!?\n]{1,40}[.!]\s+(?:it['’]?s|they['’]?re|it is|they are|it['’]?ll be|they['’]?ll be)\s+/,
  /\byou don['’]?t have an? [^.!?\n]{1,30} problem[.,]?\s+you have an? /,
  /\bnot (?:just|only) [^.!?\n]{1,30}\s*[—–,]\s*(?:but\s+)?\w+/,
  /\bno fluff\b|\bno excuses\.\s+just\b|\bjust results\b/,
  /\bto nie (?:jest )?(?:kwestia |o )?[^.!?\n]{1,50}[.,—–]\s*to (?:jest )?(?:kwestia )?/,
  /\bnie chodzi o [^.!?\n]{1,50}[.,—–]\s*chodzi o\b/,
  /\bnie masz problemu z [^.!?\n]{1,30}[.,]\s*masz problem z\b/,
  /\b(?:to )?nie tylko [^.!?\n]{1,40}\s*[—–,]\s*(?:chodzi o|to|ale)\b/,
  /\b\w+ (?:isn['’]?t|is not) an? [^.!?\n]{1,30} problem\b/,
  /\b(?:won['’]?t|will not) [^.!?\n]{1,30}[.!]\s+but\s+[^.!?\n]{1,30} will\b/,
].map((p) => re(p, 'imu'));

const ANTITHESIS_GLOBAL = ANTITHESIS.map((r) => new RegExp(r.source, `${r.flags}g`));

function antithesisCount(text: string): number {
  return ANTITHESIS_GLOBAL.reduce((n, r) => n + (text.match(r)?.length ?? 0), 0);
}

/** Sygnatury-podpisy (raport §5.1, §5.2). */
const SIGNATURES: Array<{ id: string; family: Parameters<typeof phraseRule>[1]; patterns: RegExp[] }> = [
  { id: 'signature.thats-the-post', family: 'fake-journey', patterns: [/\bthat['’]?s it\. that['’]?s the post\b/, /\bi tyle\. to jest cały post\b/] },
  { id: 'signature.simple-not-easy', family: 'emoji-framework', patterns: [/\bsimple\.\s+not easy\b/, /\bproste\.\s+nie łatwe\b/] },
  { id: 'signature.said-what-i-said', family: 'hot-take', patterns: [/\bi said what i said\b/, /\bpowiedziałem,? co powiedziałem\b/] },
  { id: 'signature.next-chapter', family: 'announcement', patterns: [/\bhere['’]?s to (?:the next chapter|new beginnings)\b/, /\bza nowy rozdział\b/] },
  {
    id: 'signature.stock-lines',
    family: 'broetry',
    patterns: [
      /\bread that again\b/, /\blet that sink in\b/, /\bhere['’]?s the thing\b/, /\bplot twist:/, /\bthe result\?/,
      /\byour move\.?$/m, /\blet['’]?s go\.?\s*🚀/, /\bkeep going\. your moment is coming\b/, /\bif this is you\b/,
      /\bi see you\.?\s*(?:\p{Extended_Pictographic}|$)/mu,
      /\bstop \w+ing\. start \w+ing\b/, /\bprzeczytaj to (?:jeszcze raz|ponownie)\b/, /\bzatrzymaj się na chwilę\b/,
    ],
  },
];

/** Przysłowia-wypełniacze typowe dla list lekcji (raport §4.5). */
const PROVERBS = [
  /\bconsistency (?:beats|wins|is key)\b/, /\byour network is your net worth\b/, /\bdone (?:is better than|>) perfect\b/,
  /\bfeedback is a gift\b/, /\bnever stop learning\b/, /\bshow up every day\b/, /\bwork smarter,? not harder\b/,
  /\bculture eats strategy\b/, /\bpeople don['’]?t leave (?:companies|jobs)\b/, /\bbe present\b/, /\btrust the process\b/,
  /\bprogress over perfection\b/, /\bfail fast\b/, /\bthe best teams aren['’]?t\b/,
  /\bkonsekwencja (?:wygrywa|jest kluczem|bije talent)\b/, /\bfeedback to (?:prezent|dar)\b/,
  /\bnigdy nie przestawaj się uczyć\b/, /\bzrobione jest lepsze niż idealne\b/, /\btwoja sieć (?:kontaktów )?to twój kapitał\b/,
].map((p) => re(p, 'iu'));

const ABSTRACT_SUFFIX = /(?:ship|ity|ness|ing|ion|ment|ence|ance|ism|ość|anie|enie|cja|stwo)$/u;
const TRIAD_RE = re(/\b([\p{L}-]+), ([\p{L}-]+),? (?:and|i|oraz) ([\p{L}-]+)\b/u, 'giu');

export const CONSTRUCTION_RULES: SignalRule[] = [
  {
    // Mechanika broetry: scena z życia w otwarciu → nagła pointa o biznesie dalej w poście.
    id: 'construction.scene-to-lesson',
    family: 'broetry',
    group: 'construction',
    weight: 1,
    familyWeight: 2,
    match: (post) => {
      if (!LIFE_SCENE.some((r) => r.test(post.head))) return 0;
      const rest = post.units.slice(2).join('\n');
      return BUSINESS_PIVOT.test(rest) ? 1 : 0;
    },
  },
  {
    // Anafora: 3+ kolejne akapity zaczynające się tym samym słowem („They want…”, „The…”).
    id: 'construction.anaphora',
    family: 'broetry',
    group: 'construction',
    weight: 0.75,
    familyWeight: 0.5,
    match: (post) => {
      let run = 1;
      for (let i = 1; i < post.units.length; i++) {
        const a = post.units[i - 1]?.split(/\s+/)[0]?.toLowerCase();
        const b = post.units[i]?.split(/\s+/)[0]?.toLowerCase();
        run = a && a === b ? run + 1 : 1;
        if (run >= 3) return 1;
      }
      return 0;
    },
  },
  {
    id: 'construction.proverbs',
    family: 'lessons-list',
    group: 'construction',
    weight: 1,
    familyWeight: 1.5,
    match: (post) => {
      const hits = PROVERBS.reduce((n, r) => n + (r.test(post.lower) ? 1 : 0), 0);
      return hits >= 2 ? 1 : hits === 1 ? 0.5 : 0;
    },
  },
  {
    // „ownership, curiosity, and belonging” — trzy abstrakcyjne rzeczowniki obok siebie (raport §5.4).
    id: 'construction.abstract-triad',
    family: 'ai-vocabulary',
    group: 'construction',
    weight: 0.5,
    familyWeight: 0.5,
    match: (post) => {
      for (const m of post.lower.matchAll(TRIAD_RE)) {
        const abstract = [m[1], m[2], m[3]].filter((w) => w && ABSTRACT_SUFFIX.test(w)).length;
        if (abstract >= 2) return 1;
      }
      return 0;
    },
  },
  {
    id: 'construction.antithesis',
    family: 'antithesis',
    group: 'construction',
    testItem: 4,
    weight: 1,
    familyWeight: 1.5,
    match: (post) => (antithesisCount(post.text) > 0 ? 1 : 0),
  },
  {
    id: 'construction.antithesis-repeat',
    family: 'antithesis',
    group: 'construction',
    weight: 1,
    familyWeight: 2,
    match: (post) => (antithesisCount(post.text) >= 2 ? 1 : 0),
  },
  {
    // „Mindset. / Discipline. / Consistency.” — 3+ kolejne jednostki po 1–2 słowa.
    id: 'construction.one-word-triad',
    family: 'fake-journey',
    group: 'construction',
    weight: 0.75,
    familyWeight: 0.5,
    match: (post) => {
      let run = 0;
      for (const unit of post.units) {
        run = countWordsIn(unit) <= 2 ? run + 1 : 0;
        if (run >= 3) return 1;
      }
      return 0;
    },
  },
  {
    // Porażka zamknięta sukcesem (raport §4.9, pytanie 9).
    id: 'construction.failure-to-success',
    family: 'fake-vulnerability',
    group: 'construction',
    testItem: 9,
    weight: 1,
    familyWeight: 1,
    match: (post) => {
      const failure = re(
        /\b(?:lost|fired|rejected|rejections?|failed|broke|panicked|cried|couch|\$0|questioned everything|straciłem|straciłam|zwolni\w*|odrzu\w*|porażk\w*|płakałem|płakałam|bez grosza)\b/,
        'iu',
      ).exec(post.lower);
      if (!failure) return 0;
      const after = post.lower.slice(failure.index);
      const success = re(
        /\b(?:today|yesterday i signed|biggest|\dx bigger|\dx\b|\d-figure|is back|we['’]?re \dx|grew|dziś|dzisiaj|wczoraj podpisałem|największ\w*)\b/,
        'iu',
      ).test(after);
      return success ? 1 : 0;
    },
  },
  ...SIGNATURES.map(({ id, family, patterns }) =>
    phraseRule(id, family, 'signature', 0.75, patterns, { familyWeight: id === 'signature.stock-lines' ? 0.75 : 1.5 }),
  ),
];
