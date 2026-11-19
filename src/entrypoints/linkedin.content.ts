import { defineContentScript } from 'wxt/utils/define-content-script';
import { ContentStore } from '../content/content-store';
import { findPosts, observeFeed } from '../content/linkedin/feed-observer';
import { POST_SELECTOR } from '../content/linkedin/selectors';
import { CommentController, PostController } from '../content/post-controller';
import { injectPageStyle } from '../content/ui/page-style';
import type { TabMessage } from '../shared/messages';

export default defineContentScript({
  matches: ['https://www.linkedin.com/*'],
  runAt: 'document_idle',
  async main() {
    injectPageStyle();
    const store = new ContentStore();
    await store.load();
    store.watch();
    const getState = () => store.state;

    const controllers = new Map<HTMLElement, PostController | CommentController>();
    const track = (el: HTMLElement, controller: PostController | CommentController) => {
      controllers.set(el, controller);
      controller.evaluate();
    };

    observeFeed({
      onPost: (el) => track(el, new PostController(el, getState)),
      onComment: (el) => track(el, new CommentController(el, getState)),
    });

    // Zmiana ustawień / zgłoszeń → przelicz widoczne posty (heurystyka jest tania, LLM z cache).
    store.onChange(() => {
      for (const [el, controller] of controllers) {
        if (!el.isConnected) {
          controller.destroy();
          controllers.delete(el);
          continue;
        }
        controller.evaluate();
      }
    });

    // Menu kontekstowe „zgłoś ten post” — zapamiętujemy, gdzie kliknięto prawym przyciskiem.
    let lastContextTarget: Element | null = null;
    document.addEventListener('contextmenu', (e) => (lastContextTarget = e.target as Element), true);
    chrome.runtime.onMessage.addListener((message: TabMessage) => {
      if (message?.type !== 'CONTEXT_REPORT' || !lastContextTarget) return;
      const postEl = lastContextTarget.closest<HTMLElement>(POST_SELECTOR);
      const outer = postEl ? (findPosts(document).find((p) => p.contains(postEl)) ?? postEl) : null;
      const controller = outer ? controllers.get(outer) : undefined;
      if (controller instanceof PostController) controller.reportFromContextMenu();
    });
  },
});
