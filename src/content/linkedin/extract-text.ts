const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'SECTION', 'ARTICLE']);
const SKIP_TAGS = new Set(['BUTTON', 'SCRIPT', 'STYLE', 'SVG', 'NOSCRIPT', 'TEMPLATE']);

function isSkipped(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  // Tekst tylko dla czytników ekranu (dubluje widoczny tekst).
  return el.classList.contains('visually-hidden') || el.classList.contains('a11y-text');
}

/**
 * Tekst z zachowaniem podziałów linii (`<br>`, bloki), bez przycisków „…więcej”.
 * Nie używa `innerText`, żeby działać tak samo w testach i na zwiniętych (`display:none`) postach.
 */
export function textWithBreaks(root: Element): string {
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? '');
      return;
    }
    if (!(node instanceof Element) || isSkipped(node)) return;
    if (node.tagName === 'BR') {
      parts.push('\n');
      return;
    }
    const block = BLOCK_TAGS.has(node.tagName);
    if (block) parts.push('\n');
    node.childNodes.forEach(walk);
    if (block) parts.push('\n');
  };
  walk(root);
  return parts
    .join('')
    .replace(/[ \t ]+\n/g, '\n')
    .replace(/\n[ \t ]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
