import { textWithBreaks } from './extract-text';
import { queryFirst, REPOST_RE, SELECTORS, SPONSORED_RE } from './selectors';

export interface ExtractedPost {
  urn?: string;
  text: string;
  authorName: string;
  /** Ścieżka profilu (`/in/jan-kowalski`, `/company/acme`) albo imię, gdy brak linku. */
  authorId: string;
  isSponsored: boolean;
  isRepost: boolean;
}

function profilePath(href: string | null | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href, 'https://www.linkedin.com');
    const m = /^\/(in|company|school|showcase)\/[^/?#]+/.exec(url.pathname);
    return m?.[0];
  } catch {
    return undefined;
  }
}

/** Tekst z elementu, ale bez fragmentów należących do zagnieżdżonego (udostępnianego) posta. */
function ownText(el: Element, exclude: Element | null): string {
  if (!exclude || !el.contains(exclude)) return textWithBreaks(el);
  const clone = el.cloneNode(true) as Element;
  const selector = SELECTORS.reshareInner.join(',');
  clone.querySelectorAll(selector).forEach((n) => n.remove());
  return textWithBreaks(clone);
}

function findText(scope: Element, exclude: Element | null): string {
  for (const selector of SELECTORS.text) {
    for (const el of scope.querySelectorAll(selector)) {
      if (exclude && exclude !== scope && exclude.contains(el)) continue;
      const text = ownText(el, exclude === scope ? null : exclude);
      if (text) return text;
    }
  }
  // Fallback: najdłuższy blok tekstu w kierunku LTR/auto.
  let best = '';
  for (const el of scope.querySelectorAll('span[dir="ltr"], div[dir="ltr"], span[dir="auto"]')) {
    if (exclude && exclude !== scope && exclude.contains(el)) continue;
    const text = textWithBreaks(el);
    if (text.length > best.length) best = text;
  }
  return best;
}

export function extractPost(el: HTMLElement): ExtractedPost {
  const inner = queryFirst(el, SELECTORS.reshareInner);
  const header = queryFirst(el, SELECTORS.header);
  const description = queryFirst(el, SELECTORS.actorDescription);

  // Repost bez komentarza → oceniamy oryginał; z komentarzem → komentarz udostępniającego.
  let text = findText(el, inner);
  if (!text && inner) text = findText(inner, inner);

  const nameEl = queryFirst(el, SELECTORS.actorName);
  const authorName = (nameEl?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const linkEl = queryFirst<HTMLAnchorElement>(el, SELECTORS.actorLink);
  const authorId = profilePath(linkEl?.getAttribute('href')) ?? authorName;

  return {
    urn: el.getAttribute('data-urn') ?? el.getAttribute('data-id') ?? undefined,
    text,
    authorName,
    authorId,
    isSponsored: SPONSORED_RE.test(description?.textContent ?? ''),
    isRepost: Boolean(inner) || REPOST_RE.test(header?.textContent ?? ''),
  };
}
