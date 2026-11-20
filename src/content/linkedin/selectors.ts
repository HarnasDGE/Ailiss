/**
 * Selektory DOM LinkedIn — w jednym miejscu, z fallbackami (LinkedIn często zmienia klasy).
 * Dwa formaty feedu:
 * - nowy (SDUI, 2026): zaciemnione klasy, stabilne są tylko `role`, `componentkey` i `data-testid`;
 * - starszy: `data-urn` / `data-id` i klasy `.update-components-*`.
 */
export const SELECTORS = {
  post: [
    'div[role="listitem"][componentkey*="FeedType_"]',
    'div[data-urn^="urn:li:activity:"]',
    'div[data-urn^="urn:li:aggregate:"]',
    'div[data-id^="urn:li:activity:"]',
    'div[data-id^="urn:li:aggregate:"]',
    'div.feed-shared-update-v2',
  ],
  text: [
    '[data-testid="expandable-text-box"]',
    '.update-components-text',
    '.feed-shared-inline-show-more-text',
    '.feed-shared-update-v2__description',
    '.feed-shared-text',
  ],
  actorName: [
    '.update-components-actor__title span[aria-hidden="true"]',
    '.update-components-actor__name span[aria-hidden="true"]',
    '.update-components-actor__title',
    '.feed-shared-actor__name',
  ],
  actorLink: [
    'a.update-components-actor__meta-link',
    'a.update-components-actor__image',
    '.update-components-actor a[href*="/in/"]',
    '.update-components-actor a[href*="/company/"]',
    '.feed-shared-actor a[href*="/in/"]',
  ],
  actorDescription: ['.update-components-actor__sub-description', '.update-components-actor__description'],
  header: ['.update-components-header', '.feed-shared-header'],
  reshareInner: ['.update-components-mini-update-v2', '.feed-shared-mini-update-v2', '.update-components-reshare'],
  comment: ['article.comments-comment-entity', 'article.comments-comment-item', 'div.comments-comment-item'],
  commentText: [
    '.comments-comment-item__main-content',
    '.comments-comment-entity__content .update-components-text',
    '.comments-comment-item-content-body',
    '.update-components-text',
  ],
  commentAuthor: ['.comments-comment-meta__description-title', '.comments-post-meta__name-text', '.comments-comment-item__post-meta'],
} as const;

/** Linki do profili (autor w nowym formacie = ostatni taki link przed tekstem posta). */
export const PROFILE_LINK_SELECTOR = 'a[href*="/in/"], a[href*="/company/"], a[href*="/school/"], a[href*="/showcase/"]';

export const POST_SELECTOR = SELECTORS.post.join(',');
export const COMMENT_SELECTOR = SELECTORS.comment.join(',');

export function queryFirst<T extends Element = HTMLElement>(root: ParentNode, selectors: readonly string[]): T | null {
  for (const selector of selectors) {
    const el = root.querySelector<T & Element>(selector);
    if (el) return el;
  }
  return null;
}

export const SPONSORED_RE = /\b(?:promoted|sponsored|promowane|sponsorowane)\b/i;
export const REPOST_RE = /\b(?:reposted|reshared|udostępnił|udostępniła|repostował|repostowała|opublikował ponownie)\b/i;
