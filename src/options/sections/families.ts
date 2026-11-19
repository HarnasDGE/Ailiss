import { el } from '../../shared/dom';
import type { Settings } from '../../shared/settings';
import { FAMILY_INFO, SLOP_FAMILIES } from '../../shared/slop/families';
import { card, checkbox } from '../ui';
import type { UpdateSettings } from './behavior';

export function familiesSection(settings: Settings, update: UpdateSettings): HTMLElement {
  const items = SLOP_FAMILIES.filter((f) => f !== 'comment-slop').map((family) =>
    checkbox(
      FAMILY_INFO[family].label,
      !settings.disabledFamilies.includes(family),
      (enabled) =>
        update((s) => {
          s.disabledFamilies = enabled ? s.disabledFamilies.filter((f) => f !== family) : [...s.disabledFamilies, family];
        }),
      FAMILY_INFO[family].description,
    ),
  );
  return card('Rodziny slopu', 'Odznacz rodziny, których nie chcesz ukrywać (np. ogłoszenia o nowej pracy).', [
    el('div', { className: 'grid2' }, items),
  ]);
}
