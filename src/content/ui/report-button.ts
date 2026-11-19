import { FAMILY_INFO, SLOP_FAMILIES, type SlopFamily } from '../../shared/slop/families';
import { createShadowHost, el, isDarkTheme } from './theme';

export interface ReportForm {
  family: SlopFamily;
  note: string;
  boostAuthor: boolean;
}

export interface ReportButtonOptions {
  /** Podpowiedź rodziny z heurystyki w chwili otwarcia formularza. */
  suggestFamily: () => SlopFamily;
  hasAuthor: () => boolean;
  onSubmit: (form: ReportForm) => void;
}

const CSS = `
.flag {
  width: 28px; height: 28px; padding: 0; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 15px; color: var(--a-text);
}
.form {
  position: fixed; z-index: 2147483000; width: 300px;
  background: var(--a-bg); color: var(--a-text-strong);
  border: 1px solid var(--a-border); border-radius: 8px; box-shadow: var(--a-shadow);
  padding: 12px; display: grid; gap: 8px;
}
.title { font-weight: 600; }
label { display: grid; gap: 3px; font-size: 12px; color: var(--a-text); }
label.check { display: flex; align-items: center; gap: 6px; }
select, input[type="text"] {
  font: inherit; color: var(--a-text-strong); background: var(--a-bg);
  border: 1px solid var(--a-border); border-radius: 4px; padding: 4px 6px;
}
.row { display: flex; justify-content: flex-end; gap: 6px; }
.primary { background: var(--a-accent); color: #fff; font-weight: 600; padding: 4px 10px; }
.primary:hover { background: var(--a-accent); color: #fff; filter: brightness(1.1); }
[hidden] { display: none; }
`;

/** Ikona ⚑ (widoczna na hover posta) + mini-formularz zgłoszenia (DESIGN §6.1). */
export class ReportButton {
  private readonly host: HTMLElement;
  /** Formularz w osobnym hoście w <body> — nie dziedziczy przezroczystości ikony i nie jest ucinany przez kartę. */
  private readonly formHost: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly family: HTMLSelectElement;
  private readonly note: HTMLInputElement;
  private readonly boost: HTMLInputElement;
  private readonly boostLabel: HTMLLabelElement;
  private readonly closeOnOutside = (e: Event) => {
    const path = e.composedPath();
    if (!path.includes(this.host) && !path.includes(this.formHost)) this.close();
  };
  private readonly closeOnKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
  };

  constructor(
    private readonly target: HTMLElement,
    private readonly options: ReportButtonOptions,
  ) {
    const { host, root } = createShadowHost('ailiss-flag-host', CSS);
    this.host = host;
    const formShadow = createShadowHost('ailiss-report-form-host', CSS);
    this.formHost = formShadow.host;

    const flag = el('button', { className: 'flag', text: '⚑', title: 'Ailiss: zgłoś jako AI slop', attrs: { type: 'button' } });
    flag.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.form.hidden) this.open(flag);
      else this.close();
    });

    this.family = el(
      'select',
      {},
      SLOP_FAMILIES.filter((f) => f !== 'comment-slop').map((f) => el('option', { text: FAMILY_INFO[f].label, attrs: { value: f } })),
    );
    this.note = el('input', { attrs: { type: 'text', placeholder: 'np. hook o dziecku, zero konkretu', maxlength: '300' } });
    this.boost = el('input', { attrs: { type: 'checkbox' } });
    this.boostLabel = el('label', { className: 'check' }, [this.boost, 'Ukrywaj więcej od tego autora']);

    const cancel = el('button', { text: 'Anuluj', attrs: { type: 'button' } });
    cancel.addEventListener('click', () => this.close());
    const submit = el('button', { text: 'Zgłoś i zwiń', className: 'primary', attrs: { type: 'submit' } });

    this.form = el('form', { className: 'form', attrs: { hidden: '' } }, [
      el('div', { className: 'title', text: 'Zgłoś jako slop' }),
      el('label', {}, ['Rodzina', this.family]),
      el('label', {}, ['Notatka (opcjonalnie)', this.note]),
      this.boostLabel,
      el('div', { className: 'row' }, [cancel, submit]),
    ]);
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.options.onSubmit({
        family: this.family.value as SlopFamily,
        note: this.note.value.trim(),
        boostAuthor: this.boost.checked,
      });
      this.close();
    });
    // Klawisze w formularzu nie mogą trafiać do skrótów LinkedIn.
    this.form.addEventListener('keydown', (e) => e.stopPropagation());

    root.append(flag);
    formShadow.root.append(this.form);
  }

  mount(): void {
    this.target.setAttribute('data-ailiss-flag', '');
    if (this.host.parentElement !== this.target) this.target.append(this.host);
  }

  destroy(): void {
    this.close();
    this.target.removeAttribute('data-ailiss-flag');
    this.host.remove();
  }

  private open(anchor: HTMLElement): void {
    if (!this.formHost.isConnected) document.body.append(this.formHost);
    this.formHost.dataset.theme = isDarkTheme() ? 'dark' : 'light';
    this.host.dataset.open = '';
    this.family.value = this.options.suggestFamily();
    this.note.value = '';
    this.boost.checked = false;
    this.boostLabel.hidden = !this.options.hasAuthor();
    this.form.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const height = this.form.offsetHeight;
    this.form.style.left = `${Math.max(8, Math.min(window.innerWidth - 308, rect.right - 300))}px`;
    this.form.style.top = `${rect.bottom + 6 + height > window.innerHeight ? Math.max(8, rect.top - height - 6) : rect.bottom + 6}px`;
    this.family.focus();
    document.addEventListener('pointerdown', this.closeOnOutside, true);
    document.addEventListener('keydown', this.closeOnKey, true);
    window.addEventListener('scroll', this.closeOnScroll, { passive: true });
  }

  private readonly closeOnScroll = () => this.close();

  private close(): void {
    this.form.hidden = true;
    this.formHost.remove();
    delete this.host.dataset.open;
    document.removeEventListener('pointerdown', this.closeOnOutside, true);
    document.removeEventListener('keydown', this.closeOnKey, true);
    window.removeEventListener('scroll', this.closeOnScroll);
  }
}
