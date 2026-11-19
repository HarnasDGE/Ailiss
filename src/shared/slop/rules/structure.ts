import { countWordsIn, mean, stdDev } from '../parse-post';
import type { SignalRule } from './types';

/** Sygnatury strukturalne (raport §3, §6) — widać je przed przeczytaniem. */
export const STRUCTURE_RULES: SignalRule[] = [
  {
    // Pytanie 1: hook = jedno zdanie bez kontekstu i nazwy.
    id: 'structure.hook',
    family: 'broetry',
    group: 'structure',
    testItem: 1,
    weight: 1,
    familyWeight: 0.3,
    match: (post) => {
      const first = post.units[0];
      if (!first || post.units.length < 3 || (post.unitSentenceCounts[0] ?? 0) > 1) return 0;
      const words = countWordsIn(first);
      if (words > 15) return 0;
      // Liczby-dekoracje („87% of employees”, „3 years ago”, „5 lessons”, „$0”) nie są konkretem.
      const decorative = /\d+%\s+(?:of|z|wszystkich)\b|\b\d+\s+(?:years?|months?|lat|lata|lessons|things|lekcji|rzeczy)\b|\$0\b/i;
      const hasConcrete = /\d/.test(first) && !decorative.test(first);
      return hasConcrete ? 0.5 : 1;
    },
  },
  {
    // Pytanie 2: większość akapitów to jedno zdanie.
    id: 'structure.broetry',
    family: 'broetry',
    group: 'structure',
    testItem: 2,
    weight: 1,
    familyWeight: 0.6,
    match: (post) => {
      const n = post.units.length;
      if (n < 3) return 0;
      const single = post.unitSentenceCounts.filter((c) => c === 1).length / n;
      if (n >= 5 && single >= 0.6) return 1;
      if (single >= 0.75) return 0.5;
      return 0;
    },
  },
  {
    // Pytanie 5: lista z emoji-punktorami (✅ ➡️ 🔥 💡 🚀).
    id: 'structure.emoji-bullets',
    family: 'emoji-framework',
    group: 'structure',
    testItem: 5,
    weight: 1,
    familyWeight: 2,
    match: (post) => (post.emojiBulletLines >= 3 ? 1 : 0),
  },
  {
    // Pytanie 5: numerowana lista (1️⃣ / 1.) lub bold-headery.
    id: 'structure.numbered-list',
    family: 'lessons-list',
    group: 'structure',
    testItem: 5,
    weight: 1,
    familyWeight: 1.5,
    match: (post) => {
      const numbered = post.numberedEmojiLines + post.lines.filter((l) => /^\s*\d{1,2}[.)]\s/.test(l)).length;
      if (numbered >= 3) return 1;
      // Lista w jednej linii: „1) … 2) … 3) …” lub „(a) … (b) … (c)”.
      if (/\b1[.)]\s.+\b2[.)]\s.+\b3[.)]\s/su.test(post.text) || /\(a\).+\(b\).+\(c\)/su.test(post.text)) return 1;
      if (post.boldHeaderLines >= 3 && post.listLines.length >= 3) return 1;
      return 0;
    },
  },
  {
    // Pytanie 11: 4+ hashtagi.
    id: 'structure.hashtag-stack',
    family: 'emoji-framework',
    group: 'structure',
    testItem: 11,
    weight: 1,
    familyWeight: 0.75,
    match: (post) => (post.hashtags.length >= 4 ? 1 : 0),
  },
  {
    // Pytanie 11: emoji na końcu większości linii.
    id: 'structure.emoji-line-end',
    family: 'emoji-framework',
    group: 'structure',
    testItem: 11,
    weight: 1,
    familyWeight: 0.5,
    match: (post) => {
      if (post.units.length < 4) return 0;
      const ending = post.units.filter((u) => /\p{Extended_Pictographic}️?\s*$/u.test(u)).length;
      return ending / post.units.length >= 0.5 ? 1 : 0;
    },
  },
  {
    // Rytm: zdania podobnej długości (model trzyma tempo).
    id: 'structure.even-rhythm',
    family: 'broetry',
    group: 'structure',
    weight: 0.5,
    familyWeight: 0.2,
    match: (post) => {
      const counts = post.sentenceWordCounts;
      if (counts.length < 6) return 0;
      const m = mean(counts);
      return m >= 3 && m <= 14 && stdDev(counts) < 3.5 ? 1 : 0;
    },
  },
  {
    // Em-dash w dużej części zdań. Liczymy tylko „—”; polskie „–” to zwykła typografia.
    id: 'structure.em-dash',
    family: 'ai-vocabulary',
    group: 'structure',
    weight: 0.5,
    familyWeight: 0.3,
    match: (post) => (post.emDashCount >= 2 && post.emDashCount / Math.max(1, post.sentences.length) >= 0.3 ? 1 : 0),
  },
  {
    // Title Case w linii-nagłówku: „The Future Of Work Is Already Here”.
    id: 'structure.title-case',
    family: 'ai-thought-leadership',
    group: 'structure',
    weight: 0.5,
    familyWeight: 0.3,
    match: (post) =>
      post.units.some((u) => {
        const words = u.split(/\s+/).filter((w) => /^\p{L}/u.test(w));
        return words.length >= 4 && words.length <= 10 && words.every((w) => /^\p{Lu}\p{Ll}/u.test(w));
      })
        ? 1
        : 0,
  },
  {
    // Pytanie 8: zero nazwisk, firm, dat, sprawdzalnych liczb. Nie liczy się do klastra.
    id: 'absence.no-concrete',
    family: 'broetry',
    group: 'absence',
    testItem: 8,
    weight: 1,
    familyWeight: 0,
    match: (post) => {
      if (post.words.length < 15) return 0;
      const concreteNumbers = post.numbers.filter((n) => !/^\d$/.test(n)).length;
      return post.properNouns.length === 0 && post.dateMentions === 0 && concreteNumbers <= 1 ? 1 : 0;
    },
  },
];
