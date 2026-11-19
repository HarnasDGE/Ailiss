import { re } from './regex';
import { tokenize } from './similarity';

/** Komentarz-slop (raport §4.14, §9): pasuje pod każdy post albo jest reklamą. */
const GENERIC = [
  /\bgreat (?:post|share|insights?|read)\b/, /\bcouldn['’]?t agree more\b/, /\btotally agree\b/, /\bso true\b/,
  /\bthanks for sharing\b/, /\bthis (?:really )?resonates\b/, /^insightful\b/, /\bwell said\b/, /\blove this\b/,
  /\bspot on\b/, /\bgreat insights?\b/, /\bvery (?:insightful|informative|inspiring)\b/, /\bpowerful (?:post|message)\b/,
  /\bświetny (?:post|wpis|tekst)\b/, /\bsuper (?:post|wpis)\b/, /\bdzięki za (?:podzielenie się|ten post|wpis)\b/,
  /\bzgadzam się w 100\s?%/, /\bmega (?:wartościow\w*|inspirując\w*)\b/, /\bbardzo trafne\b/, /\bdokładnie tak\b/,
  /\bnic dodać,? nic ująć\b/, /\bcenne spostrzeżeni\w*\b/,
].map((p) => re(p, 'iu'));

const PROMO = [
  /\bdm me\b/, /\bwe help (?:\w+ ){0,3}(?:companies|businesses|founders|teams)\b/, /\bfree (?:audit|consultation|call)\b/,
  /\bbook a (?:call|demo)\b/, /\bcheck (?:out )?my profile\b/, /\blink in (?:my )?bio\b/, /\bby the way,? we\b/,
  /\bnapisz do mnie\b/, /\bpomagamy (?:\S+ ){0,3}(?:firmom|markom|zespołom)\b/, /\bdarmow\w* (?:audyt|konsultacj\w*)\b/,
  /\bsprawdź mój profil\b/, /\bzapraszam na priv\b/,
].map((p) => re(p, 'iu'));

const EMOJI_ONLY = /^[\p{Extended_Pictographic}️‍\s!.]+$/u;

export interface CommentVerdict {
  isSlop: boolean;
  reason?: 'promo' | 'generic' | 'emoji-only';
}

/**
 * @param postText tekst posta — komentarz odnoszący się do jego treści (wspólne słowa) nie jest uznawany za generyczny.
 */
export function judgeComment(comment: string, postText = ''): CommentVerdict {
  const text = comment.trim();
  if (!text) return { isSlop: false };
  if (EMOJI_ONLY.test(text)) return { isSlop: true, reason: 'emoji-only' };

  const lower = text.toLowerCase();
  if (PROMO.some((r) => r.test(lower))) return { isSlop: true, reason: 'promo' };

  const words = tokenize(text);
  const generic = GENERIC.filter((r) => r.test(lower)).length;
  if (generic === 0 || words.length > 30) return { isSlop: false };

  // Prymitywny stemming (6 znaków) — wystarcza dla odmiany PL: „decyzje” ~ „decyzjach”.
  const stem = (w: string) => w.slice(0, 6);
  const postStems = new Set(tokenize(postText).filter((w) => w.length >= 5).map(stem));
  const overlap = new Set(words.filter((w) => w.length >= 5 && postStems.has(stem(w))).map(stem)).size;
  const quotesPost = /["„“”«]/.test(text) && overlap >= 2;
  if (quotesPost || overlap >= 3) return { isSlop: false };
  return { isSlop: true, reason: 'generic' };
}
