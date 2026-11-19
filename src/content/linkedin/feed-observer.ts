import { COMMENT_SELECTOR, POST_SELECTOR } from './selectors';

export interface FeedObserverOptions {
  onPost: (el: HTMLElement) => void;
  onComment?: (el: HTMLElement) => void;
  /** Ile przed widokiem zaczynamy klasyfikację (DESIGN §2: ~1,5 ekranu). */
  rootMargin?: string;
}

/** Zewnętrzne kontenery postów (pomija zagnieżdżone, np. udostępniany post w reposcie). */
export function findPosts(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(POST_SELECTOR)].filter(
    (el) => !el.parentElement?.closest(POST_SELECTOR),
  );
}

/**
 * MutationObserver wykrywa nowe posty/komentarze, IntersectionObserver zgłasza je,
 * gdy zbliżają się do widoku — nie klasyfikujemy całego feedu na zapas.
 */
export function observeFeed(options: FeedObserverOptions): () => void {
  const seen = new WeakSet<Element>();
  const intersection = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        intersection.unobserve(entry.target);
        const el = entry.target as HTMLElement;
        if (el.matches(COMMENT_SELECTOR)) options.onComment?.(el);
        else options.onPost(el);
      }
    },
    { rootMargin: options.rootMargin ?? '150% 0px' },
  );

  const scan = () => {
    for (const el of findPosts(document)) {
      if (seen.has(el)) continue;
      seen.add(el);
      intersection.observe(el);
    }
    if (options.onComment) {
      for (const el of document.querySelectorAll<HTMLElement>(COMMENT_SELECTOR)) {
        if (seen.has(el)) continue;
        seen.add(el);
        intersection.observe(el);
      }
    }
  };

  let scheduled = false;
  const mutation = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  });
  mutation.observe(document.body, { childList: true, subtree: true });
  scan();

  return () => {
    mutation.disconnect();
    intersection.disconnect();
  };
}
