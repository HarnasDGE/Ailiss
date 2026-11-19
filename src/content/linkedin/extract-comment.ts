import { textWithBreaks } from './extract-text';
import { POST_SELECTOR, queryFirst, SELECTORS } from './selectors';
import { extractPost } from './extract-post';

export interface ExtractedComment {
  text: string;
  authorName: string;
  /** Tekst posta, pod którym jest komentarz (do sprawdzenia, czy komentarz się do niego odnosi). */
  postText: string;
}

export function extractComment(el: HTMLElement): ExtractedComment {
  const textEl = queryFirst(el, SELECTORS.commentText);
  const authorEl = queryFirst(el, SELECTORS.commentAuthor);
  const post = el.closest<HTMLElement>(POST_SELECTOR);
  return {
    text: textEl ? textWithBreaks(textEl) : '',
    authorName: (authorEl?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    postText: post ? extractPost(post).text : '',
  };
}
