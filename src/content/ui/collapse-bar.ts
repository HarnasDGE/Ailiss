import type { EngineSource } from '../../shared/types';
import { peekPopover, type PeekContent } from './peek-popover';
import { createShadowHost, el, isDarkTheme } from './theme';

export type BarState = 'collapsed' | 'expanded' | 'dimmed' | 'labeled' | 'none';

export interface BarInfo {
  author: string;
  familyLabel: string;
  score: number;
  source: EngineSource;
  peek: PeekContent;
  isComment?: boolean;
}

export interface BarHandlers {
  onShow: () => void;
  onCollapse: () => void;
  onNotSlop: () => void;
  onUndoReport: () => void;
  onAlwaysHideAuthor: () => void;
  onAlwaysShowAuthor: () => void;
}

const CSS = `
.bar {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 2px 8px 2px 4px;
  background: var(--a-bg);
  border-radius: 8px;
  user-select: none;
}
.bar.compact { min-height: 22px; font-size: 12px; }
.summary { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chev { width: 22px; height: 22px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
.actions { display: flex; gap: 2px; flex-wrap: wrap; justify-content: flex-end; }
.toolbar { border-bottom: 1px solid var(--a-border); border-radius: 8px 8px 0 0; font-size: 12px; }
`;

const HOVER_DELAY_MS = 250;

function sourceText(info: BarInfo): string {
  if (info.isComment) return info.familyLabel;
  if (info.source === 'user') return 'zgłoszone przez Ciebie';
  if (info.source === 'author') return 'autor na liście ukrytych';
  return `${info.familyLabel} · ${info.score}/12${info.source === 'openrouter' ? ' · LLM' : ''}`;
}

/** Pasek Ailiss w Shadow DOM, wstawiany jako pierwsze dziecko posta/komentarza. */
export class CollapseBar {
  private readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private hoverTimer: ReturnType<typeof setTimeout> | undefined;
  private pinnedPeek = false;

  constructor(
    private readonly target: HTMLElement,
    private readonly handlers: BarHandlers,
  ) {
    const { host, root } = createShadowHost('ailiss-host', CSS);
    this.host = host;
    this.root = root;
  }

  render(state: BarState, info: BarInfo): void {
    this.pinnedPeek = false;
    peekPopover.hide();
    if (state === 'none') {
      this.target.removeAttribute('data-ailiss-state');
      this.host.remove();
      return;
    }
    this.host.dataset.theme = isDarkTheme() ? 'dark' : 'light';
    this.target.setAttribute('data-ailiss-state', state);
    if (this.host.parentElement !== this.target) this.target.prepend(this.host);

    const style = this.root.querySelector('style')!;
    this.root.replaceChildren(style, this.build(state, info));
  }

  destroy(): void {
    peekPopover.hide();
    this.target.removeAttribute('data-ailiss-state');
    this.host.remove();
  }

  private button(text: string, onClick: () => void, opts: { title?: string; className?: string } = {}): HTMLButtonElement {
    const b = el('button', { text, title: opts.title, className: opts.className, attrs: { type: 'button' } });
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  private build(state: Exclude<BarState, 'none'>, info: BarInfo): HTMLElement {
    const h = this.handlers;
    const what = info.isComment ? 'komentarz' : info.author || 'post';

    if (state === 'collapsed') {
      const chev = this.button('⌄', () => this.togglePeek(info.peek), { title: 'Podgląd', className: 'chev' });
      const summary = el('span', { className: 'summary', text: `Ukryto · ${what} · ${sourceText(info)}` });
      const actions = el('span', { className: 'actions' });
      if (info.source === 'user') actions.append(this.button('Cofnij', h.onUndoReport));
      actions.append(this.button('Pokaż', h.onShow, { className: 'link' }));
      const bar = el('div', { className: `bar${info.isComment ? ' compact' : ''}` }, [chev, summary, actions]);
      bar.addEventListener('mouseenter', () => this.scheduleHover(info.peek));
      bar.addEventListener('mouseleave', () => this.cancelHover());
      return bar;
    }

    if (state === 'expanded') {
      const summary = el('span', { className: 'summary', text: `Ailiss · ${sourceText(info)}` });
      const actions = el('span', { className: 'actions' }, [
        this.button('Zwiń', h.onCollapse),
        this.button('To nie slop', h.onNotSlop),
      ]);
      if (!info.isComment && info.author) {
        actions.append(
          this.button('Zawsze ukrywaj autora', h.onAlwaysHideAuthor),
          this.button('Zawsze pokazuj autora', h.onAlwaysShowAuthor),
        );
      }
      return el('div', { className: 'bar compact toolbar' }, [summary, actions]);
    }

    // dimmed / labeled: mała etykieta nad postem.
    const summary = el('span', { className: 'summary', text: `Prawdopodobny AI slop · ${sourceText(info)}` });
    summary.addEventListener('mouseenter', () => this.scheduleHover(info.peek));
    summary.addEventListener('mouseleave', () => this.cancelHover());
    const actions = el('span', { className: 'actions' }, [
      this.button('Zwiń', h.onCollapse),
      this.button('To nie slop', h.onNotSlop),
    ]);
    return el('div', { className: 'bar compact' }, [summary, actions]);
  }

  private scheduleHover(content: PeekContent): void {
    this.cancelHover();
    this.hoverTimer = setTimeout(() => peekPopover.show(this.host.getBoundingClientRect(), content), HOVER_DELAY_MS);
  }

  private cancelHover(): void {
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    this.hoverTimer = undefined;
    if (!this.pinnedPeek) peekPopover.hide();
  }

  private togglePeek(content: PeekContent): void {
    this.pinnedPeek = !this.pinnedPeek;
    if (this.pinnedPeek) peekPopover.show(this.host.getBoundingClientRect(), content);
    else peekPopover.hide();
  }
}
