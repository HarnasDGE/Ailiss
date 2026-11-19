import { el } from '../../shared/dom';
import { send } from '../../shared/messages';
import { FAMILY_INFO, SLOP_FAMILIES, type SlopFamily } from '../../shared/slop/families';
import type { ReportLabel, UserReport } from '../../shared/types';
import { button, card, formatDate, status } from '../ui';

const MIN_FOR_CALIBRATION = 20;

function familySelect(report: UserReport): HTMLSelectElement {
  const s = el('select', { attrs: { 'aria-label': 'Rodzina' } }, [
    el('option', { text: '—', attrs: { value: '' } }),
    ...SLOP_FAMILIES.filter((f) => f !== 'comment-slop').map((f) => el('option', { text: FAMILY_INFO[f].label, attrs: { value: f } })),
  ]);
  s.value = report.family ?? '';
  s.addEventListener('change', () =>
    void send('UPDATE_REPORT', { id: report.id, patch: { family: (s.value || undefined) as SlopFamily | undefined } }),
  );
  return s;
}

function labelSelect(report: UserReport): HTMLSelectElement {
  const s = el('select', { attrs: { 'aria-label': 'Etykieta' } }, [
    el('option', { text: 'slop', attrs: { value: 'slop' } }),
    el('option', { text: 'nie slop', attrs: { value: 'human' } }),
  ]);
  s.value = report.label;
  s.addEventListener('change', () => void send('UPDATE_REPORT', { id: report.id, patch: { label: s.value as ReportLabel } }));
  return s;
}

function download(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { attrs: { href: url, download: filename } });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function reportsSection(reports: UserReport[], weights: Record<string, number>): HTMLElement {
  const info = status();
  let filter: 'all' | ReportLabel = 'all';

  const tbody = el('tbody');
  const renderRows = () => {
    const rows = [...reports]
      .filter((r) => filter === 'all' || r.label === filter)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) =>
        el('tr', {}, [
          el('td', { text: formatDate(r.createdAt) }),
          el('td', {}, [labelSelect(r)]),
          el('td', {}, [familySelect(r)]),
          el('td', { className: 'text', text: r.text }),
          el('td', { className: 'muted', text: r.note ?? '' }),
          el('td', {}, [button('Usuń', () => send('DELETE_REPORT', { id: r.id }).then(() => undefined), 'danger')]),
        ]),
      );
    tbody.replaceChildren(
      ...(rows.length ? rows : [el('tr', {}, [el('td', { className: 'muted', text: 'Brak zgłoszeń.', attrs: { colspan: '6' } })])]),
    );
  };
  renderRows();

  const filterSelect = el('select', { attrs: { 'aria-label': 'Filtr' } }, [
    el('option', { text: 'Wszystkie', attrs: { value: 'all' } }),
    el('option', { text: 'Tylko slop', attrs: { value: 'slop' } }),
    el('option', { text: 'Tylko „nie slop”', attrs: { value: 'human' } }),
  ]);
  filterSelect.addEventListener('change', () => {
    filter = filterSelect.value as typeof filter;
    renderRows();
  });

  const fileInput = el('input', { attrs: { type: 'file', accept: 'application/json,.json', hidden: '' } });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const data: unknown = JSON.parse(await file.text());
      const result = await send('IMPORT_DATA', { data });
      info.set(`Zaimportowano: ${result.reports} zgłoszeń, ${result.phrases} fraz.`, 'ok');
    } catch (error) {
      info.set(`Import nieudany: ${error instanceof Error ? error.message : String(error)}`, 'warn');
    }
    fileInput.value = '';
  });

  const slopCount = reports.filter((r) => r.label === 'slop').length;
  const calibration =
    reports.length < MIN_FOR_CALIBRATION
      ? `Kalibracja wag ruszy po ${MIN_FOR_CALIBRATION} zgłoszeniach (masz ${reports.length}).`
      : `Kalibracja aktywna: skorygowano ${Object.keys(weights).length} reguł (w granicach ±50%).`;

  return card(
    'Zgłoszenia',
    'Posty oznaczone przez Ciebie jako slop / „nie slop”. Służą jako przykłady dla LLM, do wykrywania kopii szablonów i do kalibracji wag heurystyki.',
    [
      el('div', { className: 'row' }, [
        el('span', { className: 'chip', text: `slop: ${slopCount}` }),
        el('span', { className: 'chip', text: `nie slop: ${reports.length - slopCount}` }),
        filterSelect,
      ]),
      el('div', { className: 'table-wrap' }, [
        el('table', {}, [
          el('thead', {}, [
            el('tr', {}, ['Data', 'Etykieta', 'Rodzina', 'Fragment', 'Notatka', ''].map((t) => el('th', { text: t }))),
          ]),
          tbody,
        ]),
      ]),
      el('div', { className: 'row' }, [
        button('Eksportuj JSON', async () => {
          const { data } = await send('EXPORT_DATA', {});
          download(`ailiss-zgloszenia-${new Date().toISOString().slice(0, 10)}.json`, data);
        }),
        button('Importuj JSON', () => fileInput.click()),
        fileInput,
      ]),
      el('div', { className: 'row' }, [
        el('span', { className: 'muted small', text: calibration }),
        button('Zresetuj kalibrację', async () => {
          await send('RESET_WEIGHTS', {});
          info.set('Wagi przywrócone do domyślnych (przeliczą się przy kolejnym zgłoszeniu).', 'ok');
        }),
      ]),
      info.node,
    ],
  );
}
