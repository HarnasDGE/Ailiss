import { re } from './regex';

/**
 * Jednorazowa analiza tekstu posta — wszystkie reguły korzystają z tego samego wyniku.
 */
export interface ParsedPost {
  /** Tekst po normalizacji (zachowane podziały linii). */
  text: string;
  lower: string;
  lang: 'pl' | 'en';
  /** Niepuste linie. */
  lines: string[];
  /** Bloki rozdzielone pustą linią. */
  paragraphs: string[];
  /** Linie treści (bez linii z samymi hashtagami) — jednostka „akapitu” dla broetry. */
  units: string[];
  unitSentenceCounts: number[];
  unitWordCounts: number[];
  sentences: string[];
  sentenceWordCounts: number[];
  words: string[];
  listLines: string[];
  emojiBulletLines: number;
  numberedEmojiLines: number;
  boldHeaderLines: number;
  emojiCount: number;
  hashtags: string[];
  emDashCount: number;
  properNouns: string[];
  dateMentions: number;
  /** Godzina, pełna data lub rok — mocniejszy konkret niż sam dzień tygodnia. */
  specificDates: number;
  numbers: string[];
  /** Ostatnie 3 jednostki — tu szukamy closérów. */
  tail: string;
  /** Pierwsze 2 jednostki — tu szukamy otwarć. */
  head: string;
}

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const EMOJI_START_RE = /^\s*(?:\p{Extended_Pictographic}|\d️?⃣)/u;
const NUMBERED_EMOJI_RE = /^\s*\d️?⃣/u;
const LIST_MARKER_RE = /^\s*(?:\p{Extended_Pictographic}|\d️?⃣|[-•·▪►→*]\s|\d{1,2}[.)]\s|\([a-z]\)\s)/u;
const BOLD_HEADER_RE = /^\s*(?:\S+\s+)?\*\*[^*]{2,60}\*\*|^\s*(?:\S+\s+)?[\p{Lu}][^:\n]{1,40}:\s+\S/u;
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;
const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu;
const HAS_WORD_RE = /[\p{L}\p{N}]/u;
const SENTENCE_SPLIT_RE = /(?<=[.!?…])["”’)]*\s+/u;
const PL_CHARS_RE = /[ąćęłńóśźż]/giu;
const PL_WORDS_RE = re(String.raw`\b(?:się|nie|jest|że|to|na|w|i|z|do|jak|ale|czy)\b`, 'giu');
const EN_WORDS_RE = re(String.raw`\b(?:the|and|is|are|you|your|that|this|it's|with|for|of)\b`, 'giu');

const MONTHS_DAYS_RE = re(
  String.raw`\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|poniedziałek|poniedziałku|wtorek|wtorku|środa|środę|środy|czwartek|czwartku|piątek|piątku|sobota|sobotę|niedziela|niedzielę|stycznia|styczeń|lutego|luty|marca|marzec|kwietnia|kwiecień|maja|czerwca|czerwiec|lipca|lipiec|sierpnia|sierpień|września|wrzesień|października|październik|listopada|listopad|grudnia|grudzień|q[1-4]\s?20\d\d|20\d\d|\d{1,2}:\d{2}|\d{1,2}\.\d{1,2}\.\d{2,4})\b`,
  'giu',
);

/** Wyrazy z wielkiej litery, które nie są konkretem (nie liczą się jako nazwa własna). */
const CAPITALIZED_STOPLIST = new Set(
  [
    'i', "i'm", "i've", "i'd", "i'll", 'ai', 'ceo', 'cto', 'cfo', 'hr', 'b2b', 'b2c', 'ps', 'p.s', 'ok', 'dad', 'mom', 'mum',
    'mama', 'tata', 'god', 'linkedin', 'yes', 'no', 'tak', 'nie', 'ty', 'ciebie', 'ci', 'you', 'we', 'my', 'it', 'this',
    'that', 'step', 'krok', 'senior', 'manager', 'head', 'lead', 'leader', 'leadership', 'today', 'dziś',
  ],
);

function isDateWord(word: string): boolean {
  MONTHS_DAYS_RE.lastIndex = 0;
  const hit = MONTHS_DAYS_RE.test(word.toLowerCase());
  MONTHS_DAYS_RE.lastIndex = 0;
  return hit;
}

function normalize(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[   ]/g, ' ')
    .replace(/hashtag#/gi, '#')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitSentences(unit: string): string[] {
  return unit
    .split(SENTENCE_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => HAS_WORD_RE.test(s));
}

function countWords(s: string): number {
  return s.match(WORD_RE)?.length ?? 0;
}

function detectLang(text: string): 'pl' | 'en' {
  const plScore = (text.match(PL_CHARS_RE)?.length ?? 0) + (text.match(PL_WORDS_RE)?.length ?? 0);
  const enScore = text.match(EN_WORDS_RE)?.length ?? 0;
  return plScore > enScore ? 'pl' : 'en';
}

/** Nazwy własne: wyraz z wielkiej litery, który nie otwiera zdania/cytatu i nie jest na stopliście. */
function findProperNouns(sentences: string[]): string[] {
  const found = new Set<string>();
  for (const sentence of sentences) {
    const tokens = sentence.split(/\s+/);
    for (let i = 1; i < tokens.length; i++) {
      const prev = tokens[i - 1] ?? '';
      const raw = tokens[i] ?? '';
      if (/[:"“„«(—–-]$/.test(prev) || /^["“„«(\[]/.test(raw)) continue;
      if (/^(?:\d{1,2}[.)]|\(?[a-z]\)|[-•·>]|\p{Extended_Pictographic}+)$/u.test(prev)) continue;
      const word = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}'’]+$/gu, '');
      if (!/^\p{Lu}/u.test(word) || word.length < 2) continue;
      if (CAPITALIZED_STOPLIST.has(word.toLowerCase())) continue;
      if (isDateWord(word)) continue;
      found.add(word);
    }
  }
  return [...found];
}

export function parsePost(raw: string): ParsedPost {
  const text = normalize(raw);
  const lower = text.toLowerCase();
  const lines = text.split('\n').filter((l) => l.length > 0);
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const hashtagOnly = (line: string) => line.replace(HASHTAG_RE, '').replace(/[\s,.]/g, '') === '';
  const units = lines.filter((l) => !hashtagOnly(l) && countWords(l) > 0);
  const unitSentences = units.map(splitSentences);
  const sentences = unitSentences.flat();
  const listLines = lines.filter((l) => LIST_MARKER_RE.test(l));

  return {
    text,
    lower,
    lang: detectLang(lower),
    lines,
    paragraphs,
    units,
    unitSentenceCounts: unitSentences.map((s) => Math.max(1, s.length)),
    unitWordCounts: units.map(countWords),
    sentences,
    sentenceWordCounts: sentences.map(countWords),
    words: lower.match(WORD_RE) ?? [],
    listLines,
    emojiBulletLines: lines.filter((l) => EMOJI_START_RE.test(l) && !NUMBERED_EMOJI_RE.test(l)).length,
    numberedEmojiLines: lines.filter((l) => NUMBERED_EMOJI_RE.test(l)).length,
    boldHeaderLines: lines.filter((l) => BOLD_HEADER_RE.test(l)).length,
    emojiCount: text.match(EMOJI_RE)?.length ?? 0,
    hashtags: text.match(HASHTAG_RE) ?? [],
    emDashCount: text.match(/—/g)?.length ?? 0,
    properNouns: findProperNouns(sentences),
    dateMentions: lower.match(MONTHS_DAYS_RE)?.length ?? 0,
    specificDates: lower.match(/\b(?:\d{1,2}:\d{2}|\d{1,2}\.\d{1,2}\.\d{2,4}|(?:19|20)\d\d)\b|\b\d{1,2} (?:stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)/gu)?.length ?? 0,
    numbers: text.match(/(?<![\p{L}#])\$?\d[\d,.]*(?:k|%|x)?/giu) ?? [],
    tail: units.slice(-3).join('\n').toLowerCase(),
    head: units.slice(0, 2).join('\n').toLowerCase(),
  };
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

export function countWordsIn(text: string): number {
  return countWords(text);
}
