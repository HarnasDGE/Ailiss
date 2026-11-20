import '../../ui/base.css';
import './style.css';
import { el } from '../../shared/dom';
import { send, type EngineStatus } from '../../shared/messages';
import {
  HIDE_MODE_LABELS,
  SENSITIVITY_LABELS,
  THRESHOLDS,
  type HideMode,
  type Sensitivity,
  type Settings,
} from '../../shared/settings';
import { FAMILY_INFO, type SlopFamily } from '../../shared/slop/families';
import { getSettings, onStorageChange, saveSettings, STORAGE_KEYS } from '../../shared/storage';

const app = document.getElementById('app')!;

function openrouterLine(status: EngineStatus): HTMLElement {
  const or = status.openrouter;
  let dot = '';
  let text: string;
  if (!or.enabled) text = 'OpenRouter wyłączony';
  else if (!or.hasKey || !or.model) {
    dot = 'warn';
    text = 'OpenRouter: brak klucza lub modelu';
  } else if (or.breakerOpenUntil) {
    dot = 'warn';
    text = `OpenRouter: przerwa do ${new Date(or.breakerOpenUntil).toLocaleTimeString()}`;
  } else {
    dot = or.requestsToday >= or.dailyLimit ? 'warn' : 'ok';
    text = `OpenRouter · ${or.model} · ${or.requestsToday}/${or.dailyLimit} dziś`;
  }
  const line = el('div', { className: 'engine' }, [el('span', { className: `dot ${dot}` }), el('span', { text })]);
  if (or.lastError) line.title = or.lastError;
  return line;
}

function render(settings: Settings, status: EngineStatus): void {
  const update = async (patch: Partial<Settings>) => saveSettings({ ...settings, ...patch });

  const toggle = el('input', { attrs: { type: 'checkbox', 'aria-label': 'Włącz filtrowanie' } });
  toggle.checked = settings.enabled;
  toggle.addEventListener('change', () => void update({ enabled: toggle.checked }));

  const families = Object.entries(status.stats.byFamily)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 5)
    .map(([family, count]) => el('span', { className: 'chip', text: `${FAMILY_INFO[family as SlopFamily].label} ${count}` }));

  const sensitivity = el(
    'div',
    { className: 'segmented', attrs: { role: 'group', 'aria-label': 'Czułość' } },
    (Object.keys(SENSITIVITY_LABELS) as Sensitivity[]).map((s) => {
      const b = el('button', {
        text: SENSITIVITY_LABELS[s],
        title: `Zwijaj od ${THRESHOLDS[s]}/12`,
        attrs: { type: 'button', 'aria-pressed': String(settings.sensitivity === s) },
      });
      b.addEventListener('click', () => void update({ sensitivity: s }));
      return b;
    }),
  );

  const mode = el(
    'select',
    { attrs: { 'aria-label': 'Sposób ukrywania' } },
    (Object.keys(HIDE_MODE_LABELS) as HideMode[]).map((m) => el('option', { text: HIDE_MODE_LABELS[m], attrs: { value: m } })),
  );
  mode.value = settings.hideMode;
  mode.addEventListener('change', () => void update({ hideMode: mode.value as HideMode }));

  const optionsLink = el('button', { text: 'Ustawienia', attrs: { type: 'button' } });
  optionsLink.addEventListener('click', () => void chrome.runtime.openOptionsPage());

  app.replaceChildren(
    el('header', {}, [el('h1', { text: 'Ailiss' }), el('label', { className: 'switch' }, [toggle, settings.enabled ? 'Włączony' : 'Wyłączony'])]),
    el('div', {}, [
      el('div', { className: 'stat' }, [el('strong', { text: String(status.stats.hidden) }), el('span', { className: 'muted', text: 'ukrytych postów dziś' })]),
      ...(status.stats.ads ? [el('div', { className: 'muted small', text: `+ ${status.stats.ads} reklam` })] : []),
      el('div', { className: 'families' }, families),
    ]),
    el('section', {}, [
      el('h2', { text: 'Silniki' }),
      el('div', { className: 'engine' }, [el('span', { className: 'dot ok' }), el('span', { text: 'Heurystyka (lokalnie)' })]),
      openrouterLine(status),
    ]),
    el('section', {}, [el('h2', { text: 'Czułość' }), sensitivity]),
    el('section', {}, [el('h2', { text: 'Ukrywanie' }), mode]),
    el('footer', {}, [el('span', { className: 'muted small', text: `Twoje zgłoszenia: ${status.reportsCount}` }), optionsLink]),
  );
}

async function refresh(): Promise<void> {
  const [settings, status] = await Promise.all([getSettings(), send('GET_STATUS', {})]);
  render(settings, status);
}

onStorageChange([STORAGE_KEYS.settings, STORAGE_KEYS.stats, STORAGE_KEYS.reports], () => void refresh());
void refresh();
