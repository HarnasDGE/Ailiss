import { el } from '../../shared/dom';
import { send, type OpenRouterModel } from '../../shared/messages';
import type { OpenRouterMode, OpenRouterScope, Settings } from '../../shared/settings';
import { readKey, STORAGE_KEYS, writeKey } from '../../shared/storage';
import { button, card, checkbox, select, status } from '../ui';
import type { UpdateSettings } from './behavior';

const ORIGIN = 'https://openrouter.ai/*';

const MODE_LABELS: Record<OpenRouterMode, string> = {
  llm: 'LLM — odpowiedzi na test 0–12 + rodzina i uzasadnienie',
  decision: 'Decyzyjny — tylko SLOP / OK (taniej, szybciej)',
};
const SCOPE_LABELS: Record<OpenRouterScope, string> = {
  uncertain: 'Tylko posty niepewne (wynik heurystyki 4–6)',
  all: 'Wszystkie posty (drożej)',
};

function formatPrice(m: OpenRouterModel): string {
  if (m.promptPrice === 0 && m.completionPrice === 0) return 'darmowy';
  return `${m.promptPrice.toFixed(2)} / ${m.completionPrice.toFixed(2)} USD za 1M tok.`;
}

export function openrouterSection(settings: Settings, update: UpdateSettings): HTMLElement {
  const or = settings.openrouter;
  const info = status();

  const enable = checkbox('Używaj OpenRoutera', or.enabled, async (enabled) => {
    if (enabled) {
      // Uprawnienie do openrouter.ai prosimy dopiero przy włączeniu (optional_host_permissions).
      const granted = await chrome.permissions.request({ origins: [ORIGIN] }).catch(() => false);
      if (!granted) {
        info.set('Bez uprawnienia do openrouter.ai rozszerzenie nie wyśle zapytań.', 'warn');
        enable.querySelector('input')!.checked = false;
        return;
      }
    }
    update((s) => void (s.openrouter.enabled = enabled));
  });

  const key = el('input', { className: 'wide', attrs: { type: 'password', placeholder: 'sk-or-…', autocomplete: 'off' } });
  void readKey<string>(STORAGE_KEYS.openrouterKey, '').then((v) => (key.value = v));
  const saveKey = button('Zapisz klucz', async () => {
    await writeKey(STORAGE_KEYS.openrouterKey, key.value.trim());
    info.set(key.value.trim() ? 'Klucz zapisany lokalnie w przeglądarce.' : 'Klucz usunięty.', 'ok');
  });

  const model = el('input', {
    className: 'wide',
    attrs: { type: 'text', list: 'ailiss-models', placeholder: 'dostawca/nazwa-modelu' },
  });
  model.value = or.model;
  model.addEventListener('change', () => update((s) => void (s.openrouter.model = model.value.trim())));
  const datalist = el('datalist', { attrs: { id: 'ailiss-models' } });
  const modelHint = el('div', { className: 'muted small' });
  const loadModels = button('Pobierz listę modeli', async () => {
    const { models, error } = await send('LIST_MODELS', {});
    if (error) return info.set(`Nie udało się pobrać modeli: ${error}`, 'warn');
    datalist.replaceChildren(
      ...models.map((m) =>
        el('option', { attrs: { value: m.id, label: `${m.name} · ${formatPrice(m)}${m.structuredOutputs ? ' · JSON' : ''}` } }),
      ),
    );
    modelHint.textContent = `${models.length} modeli. „JSON” = wspiera structured outputs (zalecane w trybie LLM). Zacznij pisać, żeby filtrować.`;
  });

  const limit = el('input', { attrs: { type: 'number', min: '1', max: '10000', step: '10' } });
  limit.value = String(or.dailyLimit);
  limit.addEventListener('change', () =>
    update((s) => void (s.openrouter.dailyLimit = Math.max(1, Math.round(Number(limit.value) || 1)))),
  );

  const test = button('Testuj połączenie', async () => {
    info.set('Testuję…');
    const result = await send('TEST_OPENROUTER', {});
    info.set(result.ok ? `OK. ${result.sample ?? ''}` : `Błąd: ${result.error}`, result.ok ? 'ok' : 'warn');
  });

  return card(
    'OpenRouter (opcjonalnie)',
    'Model z OpenRoutera ocenia posty, których heurystyka nie jest pewna. Wysyłany jest tylko tekst posta (max 1500 znaków), bez danych autora i komentarzy.',
    [
      enable,
      el('label', { className: 'field' }, [el('span', { text: 'Klucz API' }), el('div', { className: 'row' }, [key, saveKey])]),
      el('div', { className: 'field' }, [
        el('span', { text: 'Model' }),
        el('div', { className: 'row' }, [model, loadModels]),
        datalist,
        modelHint,
      ]),
      el('div', { className: 'grid2' }, [
        select('Tryb', or.mode, MODE_LABELS, (v) => update((s) => void (s.openrouter.mode = v))),
        select('Zakres', or.scope, SCOPE_LABELS, (v) => update((s) => void (s.openrouter.scope = v))),
        el('label', { className: 'field' }, [el('span', { text: 'Dzienny limit żądań' }), limit]),
      ]),
      checkbox(
        'Używaj moich zgłoszeń jako przykładów dla modelu',
        or.useReportsAsContext,
        (v) => update((s) => void (s.openrouter.useReportsAsContext = v)),
        'Do każdego zapytania dołączane są do 4 najbardziej pasujące zgłoszone posty (bez danych autora).',
      ),
      el('div', { className: 'row' }, [test]),
      info.node,
    ],
  );
}
