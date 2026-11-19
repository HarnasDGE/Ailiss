import { el } from '../../shared/dom';

export { el };

/** Motyw LinkedIn: klasa `theme--dark` na <html>; fallback na ustawienie systemu. */
export function isDarkTheme(): boolean {
  const html = document.documentElement;
  if (html.classList.contains('theme--dark')) return true;
  if (html.classList.contains('theme--light')) return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/** Wspólne tokeny kolorów dla komponentów w Shadow DOM. */
export const THEME_CSS = `
:host {
  --a-bg: #ffffff;
  --a-bg-hover: #f3f2ef;
  --a-border: rgba(0, 0, 0, 0.08);
  --a-text: rgba(0, 0, 0, 0.6);
  --a-text-strong: rgba(0, 0, 0, 0.9);
  --a-accent: #0a66c2;
  --a-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  all: initial;
  font-family: -apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: var(--a-text);
}
:host([data-theme="dark"]) {
  --a-bg: #1b1f23;
  --a-bg-hover: #2a2f34;
  --a-border: rgba(255, 255, 255, 0.1);
  --a-text: rgba(255, 255, 255, 0.6);
  --a-text-strong: rgba(255, 255, 255, 0.9);
  --a-accent: #71b7fb;
  --a-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}
button {
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
}
button:hover { background: var(--a-bg-hover); color: var(--a-text-strong); }
button:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 1px; }
.link { color: var(--a-accent); font-weight: 600; }
`;

export function createShadowHost(className: string, css: string): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement('div');
  host.className = className;
  host.dataset.theme = isDarkTheme() ? 'dark' : 'light';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = THEME_CSS + css;
  root.append(style);
  return { host, root };
}
