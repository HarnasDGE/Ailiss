import { el } from '../shared/dom';

export function card(title: string, description: string | undefined, children: Array<Node | string>): HTMLElement {
  return el('section', { className: 'card' }, [
    el('h2', { text: title }),
    ...(description ? [el('p', { className: 'muted small', text: description })] : []),
    ...children,
  ]);
}

export function checkbox(label: string, checked: boolean, onChange: (v: boolean) => void, hint?: string): HTMLElement {
  const input = el('input', { attrs: { type: 'checkbox' } });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { className: 'check' }, [
    input,
    el('span', {}, [label, ...(hint ? [el('br'), el('span', { className: 'muted small', text: hint })] : [])]),
  ]);
}

export function select<T extends string>(
  label: string,
  value: T,
  options: Record<T, string>,
  onChange: (v: T) => void,
): HTMLElement {
  const s = el(
    'select',
    {},
    (Object.keys(options) as T[]).map((k) => el('option', { text: options[k], attrs: { value: k } })),
  );
  s.value = value;
  s.addEventListener('change', () => onChange(s.value as T));
  return el('label', { className: 'field' }, [el('span', { text: label }), s]);
}

export function button(text: string, onClick: () => void | Promise<void>, className = ''): HTMLButtonElement {
  const b = el('button', { text, className, attrs: { type: 'button' } });
  b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      await onClick();
    } finally {
      b.disabled = false;
    }
  });
  return b;
}

export function status(): { node: HTMLElement; set: (text: string, kind?: 'ok' | 'warn' | '') => void } {
  const node = el('div', { className: 'status', attrs: { role: 'status' } });
  return {
    node,
    set: (text, kind = '') => {
      node.textContent = text;
      node.className = `status ${kind}`;
    },
  };
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
