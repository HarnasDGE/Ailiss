import { COMMENT_SELECTOR, POST_SELECTOR } from './selectors';

export interface FeedObserverOptions {
  /** Nowy post/komentarz w DOM albo zmiana w jego wnętrzu (doładowany tekst, rozwinięcie). */
  onPost: (el: HTMLElement) => void;
  onComment?: (el: HTMLElement) => void;
}

/** Zewnętrzne kontenery postów (pomija zagnieżdżone, np. udostępniany post w reposcie). */
export function findPosts(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(POST_SELECTOR)].filter(
    (el) => !el.parentElement?.closest(POST_SELECTOR),
  );
}

function outermostPost(el: Element): HTMLElement | null {
  let post = el.closest<HTMLElement>(POST_SELECTOR);
  let parent = post?.parentElement?.closest<HTMLElement>(POST_SELECTOR) ?? null;
  while (parent) {
    post = parent;
    parent = parent.parentElement?.closest<HTMLElement>(POST_SELECTOR) ?? null;
  }
  return post;
}

/** Nasze własne elementy (paski, ⚑, popovery) — ich wstawienie nie może wyzwalać ponownej oceny. */
function isOwnNode(node: Element): boolean {
  return [...node.classList].some((c) => c.startsWith('ailiss-'));
}

/**
 * Obserwuje DOM od razu przy wstawieniu postów — ocena dzieje się w callbacku MutationObservera,
 * czyli przed narysowaniem klatki, więc slop jest zwinięty, zanim użytkownik go zobaczy.
 * Nie zależy od IntersectionObservera (feed LinkedIn przewija się w kontenerze, gdzie rootMargin nie działa).
 */
export function observeFeed(options: FeedObserverOptions): () => void {
  const handle = (posts: Set<HTMLElement>, comments: Set<HTMLElement>) => {
    for (const el of posts) options.onPost(el);
    if (options.onComment) for (const el of comments) options.onComment(el);
  };

  const collect = (node: Element, posts: Set<HTMLElement>, comments: Set<HTMLElement>) => {
    const post = outermostPost(node);
    if (post) posts.add(post);
    else for (const p of findPosts(node)) posts.add(p);
    if (options.onComment) {
      const comment = node.closest<HTMLElement>(COMMENT_SELECTOR);
      if (comment) comments.add(comment);
      else node.querySelectorAll<HTMLElement>(COMMENT_SELECTOR).forEach((c) => comments.add(c));
    }
  };

  const mutation = new MutationObserver((records) => {
    const posts = new Set<HTMLElement>();
    const comments = new Set<HTMLElement>();
    for (const record of records) {
      for (const node of record.addedNodes) {
        const el = node instanceof Element ? node : node.parentElement;
        if (!el || isOwnNode(el)) continue;
        collect(el, posts, comments);
      }
    }
    handle(posts, comments);
  });
  mutation.observe(document.documentElement, { childList: true, subtree: true });

  const initialPosts = new Set(findPosts(document));
  const initialComments = new Set(options.onComment ? document.querySelectorAll<HTMLElement>(COMMENT_SELECTOR) : []);
  handle(initialPosts, initialComments);

  return () => mutation.disconnect();
}
