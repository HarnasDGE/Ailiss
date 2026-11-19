export interface ElementProps {
  className?: string;
  text?: string;
  title?: string;
  attrs?: Record<string, string>;
}

/** Minimalny helper do budowania DOM bez frameworka (content script, popup, ustawienia). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.title) node.title = props.title;
  for (const [k, v] of Object.entries(props.attrs ?? {})) node.setAttribute(k, v);
  node.append(...children);
  return node;
}
