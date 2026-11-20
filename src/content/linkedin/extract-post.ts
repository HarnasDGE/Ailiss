import { textWithBreaks } from './extract-text';
import { PROFILE_LINK_SELECTOR, queryFirst, REPOST_RE, SELECTORS, SPONSORED_RE } from './selectors';

export interface ExtractedPost {
  urn?: string;
  text: string;
  authorName: string;
  /** Ścieżka profilu (`/in/jan-kowalski`, `/company/acme`) albo imię, gdy brak linku. */
  authorId: string;
  isSponsored: boolean;
  isRepost: boolean;
}

interface FoundText {
  text: string;
  el: Element | null;
}

export function profilePath(href: string | null | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href, 'https://www.linkedin.com');
    const m = /^\/(in|company|school|showcase)\/[^/?#]+/.exec(url.pathname);
    return m?.[0];
  } catch {
    return undefined;
  }
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Tekst z elementu, ale bez fragmentów należących do zagnieżdżonego (udostępnianego) posta. */
function ownText(el: Element, exclude: Element | null): string {
  if (!exclude || !el.contains(exclude)) return textWithBreaks(el);
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll(SELECTORS.reshareInner.join(',')).forEach((n) => n.remove());
  return textWithBreaks(clone);
}

function findText(scope: Element, exclude: Element | null): FoundText {
  for (const selector of SELECTORS.text) {
    for (const el of scope.querySelectorAll(selector)) {
      if (exclude && exclude !== scope && exclude.contains(el)) continue;
      const text = ownText(el, exclude === scope ? null : exclude);
      if (text) return { text, el };
    }
  }
  // Fallback: najdłuższy blok tekstu w kierunku LTR/auto.
  let best: FoundText = { text: '', el: null };
  for (const el of scope.querySelectorAll('span[dir="ltr"], div[dir="ltr"], span[dir="auto"]')) {
    if (exclude && exclude !== scope && exclude.contains(el)) continue;
    const text = textWithBreaks(el);
    if (text.length > best.text.length) best = { text, el };
  }
  return best;
}

/**
 * Nowy feed (SDUI): autor = ostatni link do profilu przed tekstem posta.
 * Wcześniejsze linki to kontekst społeczny („X poleca to”, „X skomentował(a)”).
 */
function sduiAuthor(post: Element, textEl: Element | null): { authorId?: string; authorName: string } {
  const links = [...post.querySelectorAll<HTMLAnchorElement>(PROFILE_LINK_SELECTOR)].filter(
    (a) => !textEl || Boolean(textEl.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_PRECEDING),
  );
  const authorId = profilePath(links.at(-1)?.getAttribute('href'));
  if (!authorId) return { authorName: '' };
  const same = links.filter((a) => profilePath(a.getAttribute('href')) === authorId);
  // Link z nazwą ma <p><span>Imię Nazwisko</span></p>; kolejne <p> to stopień kontaktu, nagłówek itp.
  for (const a of same) {
    const name = clean(a.querySelector('p')?.textContent);
    if (name) return { authorId, authorName: name };
  }
  for (const a of same) {
    const name = clean(a.textContent);
    if (name) return { authorId, authorName: name };
  }
  return { authorId, authorName: '' };
}

/** Tekst nagłówka posta (wszystko przed treścią) — do wykrycia „Promowane” / „udostępnił(a)”. */
function headerText(post: Element, textEl: Element | null): string {
  if (!textEl) return '';
  const range = document.createRange();
  range.setStart(post, 0);
  range.setEndBefore(textEl);
  return range.toString();
}

export function extractPost(el: HTMLElement): ExtractedPost {
  const inner = queryFirst(el, SELECTORS.reshareInner);
  const header = queryFirst(el, SELECTORS.header);
  const description = queryFirst(el, SELECTORS.actorDescription);

  // Repost bez komentarza → oceniamy oryginał; z komentarzem → komentarz udostępniającego.
  let found = findText(el, inner);
  if (!found.text && inner) found = findText(inner, inner);

  let authorName = clean(queryFirst(el, SELECTORS.actorName)?.textContent);
  let authorId = profilePath(queryFirst<HTMLAnchorElement>(el, SELECTORS.actorLink)?.getAttribute('href'));
  if (!authorId) {
    const sdui = sduiAuthor(el, found.el);
    authorId = sdui.authorId;
    authorName ||= sdui.authorName;
  }

  const head = description || header ? '' : headerText(el, found.el);
  return {
    urn: el.getAttribute('data-urn') ?? el.getAttribute('data-id') ?? el.getAttribute('componentkey') ?? undefined,
    text: found.text,
    authorName,
    authorId: authorId ?? authorName,
    isSponsored: SPONSORED_RE.test(description?.textContent ?? head),
    isRepost: Boolean(inner) || REPOST_RE.test(header?.textContent ?? head),
  };
}
