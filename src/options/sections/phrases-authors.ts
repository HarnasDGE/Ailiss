import { el } from '../../shared/dom';
import { send, type AuthorRule } from '../../shared/messages';
import { FAMILY_INFO, SLOP_FAMILIES, type SlopFamily } from '../../shared/slop/families';
import type { AuthorLists, UserPhrase } from '../../shared/types';
import { button, card, status } from '../ui';

export function phrasesSection(phrases: UserPhrase[]): HTMLElement {
  const info = status();
  const input = el('input', { className: 'wide', attrs: { type: 'text', placeholder: 'np. „synergia działań”', maxlength: '120' } });
  const family = el('select', { attrs: { 'aria-label': 'Rodzina' } }, [
    el('option', { text: 'rodzina (opcjonalnie)', attrs: { value: '' } }),
    ...SLOP_FAMILIES.filter((f) => f !== 'comment-slop').map((f) => el('option', { text: FAMILY_INFO[f].label, attrs: { value: f } })),
  ]);
  const add = button('Dodaj', async () => {
    if (input.value.trim().length < 3) return info.set('Fraza musi mieć min. 3 znaki.', 'warn');
    await send('ADD_PHRASE', { phrase: input.value, family: (family.value || undefined) as SlopFamily | undefined });
    input.value = '';
  });

  const items = phrases.map((p) => {
    const weight = el('input', { className: 'weight', attrs: { type: 'number', min: '-3', max: '3', step: '0.25', 'aria-label': 'Waga' } });
    weight.value = String(p.weight);
    weight.addEventListener('change', () => {
      const value = Math.max(-3, Math.min(3, Number(weight.value) || 0));
      void send('UPDATE_PHRASE', { id: p.id, weight: value });
    });
    return el('div', { className: 'list-item' }, [
      el('span', {}, [p.phrase, ...(p.family ? [' ', el('span', { className: 'chip', text: FAMILY_INFO[p.family].label })] : [])]),
      el('span', { className: 'row' }, [weight, button('Usuń', () => send('DELETE_PHRASE', { id: p.id }).then(() => undefined), 'danger')]),
    ]);
  });

  return card(
    'Własne frazy',
    'Frazy liczone jako sygnał slopu (waga w punktach surowych; ujemna = antysygnał). Możesz je też dodać z menu kontekstowego: zaznacz tekst na LinkedIn → „Ailiss: dodaj jako sygnał slopu”.',
    [
      el('div', { className: 'row' }, [input, family, add]),
      el('div', { className: 'list' }, items.length ? items : [el('span', { className: 'muted small', text: 'Brak fraz.' })]),
      info.node,
    ],
  );
}

const AUTHOR_LIST_LABELS: Record<keyof AuthorLists, string> = {
  alwaysHide: 'Zawsze ukrywaj',
  alwaysShow: 'Zawsze pokazuj',
  boosted: 'Ukrywaj więcej (+2 do wyniku)',
};

export function authorsSection(authors: AuthorLists): HTMLElement {
  const lists = (Object.keys(AUTHOR_LIST_LABELS) as Array<keyof AuthorLists>).map((key) => {
    const items = authors[key].map((authorId) =>
      el('div', { className: 'list-item' }, [
        el('span', { text: authorId }),
        button('Usuń', () => send('SET_AUTHOR_RULE', { authorId, rule: null as AuthorRule }).then(() => undefined), 'danger'),
      ]),
    );
    return el('div', { className: 'field' }, [
      el('span', { text: AUTHOR_LIST_LABELS[key] }),
      el('div', { className: 'list' }, items.length ? items : [el('span', { className: 'muted small', text: 'Pusto.' })]),
    ]);
  });
  return card('Autorzy', 'Listy ustawiane z paska nad rozwiniętym postem lub z formularza zgłoszenia.', [
    el('div', { className: 'grid2' }, lists),
  ]);
}

export function dataSection(): HTMLElement {
  const info = status();
  return card('Dane', 'Wszystko jest przechowywane lokalnie w przeglądarce (chrome.storage.local).', [
    el('div', { className: 'row' }, [
      button('Wyczyść cache ocen LLM', async () => {
        await send('CLEAR_CACHE', {});
        info.set('Cache wyczyszczony.', 'ok');
      }),
    ]),
    info.node,
  ]);
}
