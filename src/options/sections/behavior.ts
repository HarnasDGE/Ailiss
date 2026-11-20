import { el } from '../../shared/dom';
import { HIDE_MODE_LABELS, SENSITIVITY_LABELS, THRESHOLDS, type Sensitivity, type Settings } from '../../shared/settings';
import { card, checkbox, select } from '../ui';

export type UpdateSettings = (mutate: (s: Settings) => void) => void;

export function behaviorSection(settings: Settings, update: UpdateSettings): HTMLElement {
  const sensitivityOptions = Object.fromEntries(
    (Object.keys(SENSITIVITY_LABELS) as Sensitivity[]).map((k) => [k, `${SENSITIVITY_LABELS[k]} (zwijaj od ${THRESHOLDS[k]}/12)`]),
  ) as Record<Sensitivity, string>;

  return card('Zachowanie', 'Wynik posta liczony jest na skali 0–12 z testu w raporcie (0–3 czysto, 4–6 podejrzane, 7+ slop).', [
    checkbox('Filtrowanie włączone', settings.enabled, (v) => update((s) => void (s.enabled = v))),
    el('div', { className: 'grid2' }, [
      select('Czułość', settings.sensitivity, sensitivityOptions, (v) => update((s) => void (s.sensitivity = v))),
      select('Sposób ukrywania', settings.hideMode, HIDE_MODE_LABELS, (v) => update((s) => void (s.hideMode = v))),
    ]),
    checkbox(
      'Zwijaj komentarze-slop',
      settings.hideComments,
      (v) => update((s) => void (s.hideComments = v)),
      '„Great post! 💯 Couldn’t agree more” i reklamy pod cudzymi postami.',
    ),
    checkbox(
      'Ukrywaj posty promowane (reklamy)',
      settings.hideSponsored,
      (v) => update((s) => void (s.hideSponsored = v)),
      'Każdy post z oznaczeniem „Promowane” zwija się do paska, niezależnie od oceny slopu.',
    ),
    checkbox(
      'Nie oceniaj reklam pod kątem slopu',
      settings.skipSponsored,
      (v) => update((s) => void (s.skipSponsored = v)),
      'Działa, gdy ukrywanie reklam jest wyłączone.',
    ),
    checkbox('Nie ruszaj repostów', settings.skipReposts, (v) => update((s) => void (s.skipReposts = v))),
  ]);
}
