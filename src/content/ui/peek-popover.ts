import { createShadowHost, el, isDarkTheme } from './theme';

export interface PeekContent {
  preview: string;
  reasons: string[];
  llmReason?: string;
  footer?: string;
}

const CSS = `
.pop {
  position: fixed;
  z-index: 2147483000;
  max-width: 420px;
  background: var(--a-bg);
  color: var(--a-text-strong);
  border: 1px solid var(--a-border);
  border-radius: 8px;
  box-shadow: var(--a-shadow);
  padding: 10px 12px;
  pointer-events: none;
}
.preview { white-space: pre-line; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.reasons { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px; }
.chip { font-size: 11px; padding: 1px 6px; border-radius: 10px; background: var(--a-bg-hover); color: var(--a-text); }
.llm, .footer { margin-top: 6px; font-size: 12px; color: var(--a-text); }
[hidden] { display: none; }
`;

/** Jeden popover dla całej strony, renderowany w <body> (nie da się go uciąć przez overflow karty). */
class PeekPopover {
  private host?: HTMLElement;
  private box?: HTMLDivElement;

  private ensure(): HTMLDivElement {
    if (this.box && this.host?.isConnected) return this.box;
    const { host, root } = createShadowHost('ailiss-peek-host', CSS);
    this.box = el('div', { className: 'pop', attrs: { hidden: '' } });
    root.append(this.box);
    document.body.append(host);
    this.host = host;
    return this.box;
  }

  show(anchor: DOMRect, content: PeekContent): void {
    const box = this.ensure();
    this.host!.dataset.theme = isDarkTheme() ? 'dark' : 'light';
    box.replaceChildren(
      el('div', { className: 'preview', text: content.preview || '(brak tekstu)' }),
      el(
        'div',
        { className: 'reasons' },
        content.reasons.map((r) => el('span', { className: 'chip', text: r })),
      ),
    );
    if (content.llmReason) box.append(el('div', { className: 'llm', text: `LLM: ${content.llmReason}` }));
    if (content.footer) box.append(el('div', { className: 'footer', text: content.footer }));
    box.hidden = false;
    const width = Math.min(420, anchor.width);
    box.style.width = `${width}px`;
    box.style.left = `${Math.max(8, anchor.left)}px`;
    const below = anchor.bottom + 6;
    const height = box.offsetHeight;
    box.style.top = `${below + height > window.innerHeight - 8 ? Math.max(8, anchor.top - height - 6) : below}px`;
  }

  hide(): void {
    if (this.box) this.box.hidden = true;
  }
}

export const peekPopover = new PeekPopover();
