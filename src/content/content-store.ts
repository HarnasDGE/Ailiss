import type { Settings } from '../shared/settings';
import {
  buildUserContext,
  getAuthors,
  getPhrases,
  getReports,
  getRuleWeights,
  getSettings,
  onStorageChange,
  STORAGE_KEYS,
} from '../shared/storage';
import { EMPTY_AUTHORS } from '../shared/storage';
import { DEFAULT_SETTINGS } from '../shared/settings';
import type { AuthorLists, ReportLabel, UserContext } from '../shared/types';

export interface ContentState {
  settings: Settings;
  authors: AuthorLists;
  context: UserContext;
  /** textHash → zgłoszenie (do rozpoznania postów oznaczonych ręcznie). */
  reportsByHash: Map<string, { id: string; label: ReportLabel }>;
}

/** Stan potrzebny w content scripcie: ustawienia + dane użytkownika, odświeżane przy każdej zmianie storage. */
export class ContentStore {
  state: ContentState = {
    settings: DEFAULT_SETTINGS,
    authors: EMPTY_AUTHORS,
    context: { phrases: [], reportSignatures: [], boostedAuthors: [], ruleWeights: {} },
    reportsByHash: new Map(),
  };
  private listeners = new Set<() => void>();

  async load(): Promise<void> {
    const [settings, reports, phrases, authors, ruleWeights] = await Promise.all([
      getSettings(),
      getReports(),
      getPhrases(),
      getAuthors(),
      getRuleWeights(),
    ]);
    this.state = {
      settings,
      authors,
      context: buildUserContext(reports, phrases, authors, ruleWeights),
      reportsByHash: new Map(reports.map((r) => [r.textHash, { id: r.id, label: r.label }])),
    };
  }

  watch(): void {
    const keys = [STORAGE_KEYS.settings, STORAGE_KEYS.reports, STORAGE_KEYS.phrases, STORAGE_KEYS.authors, STORAGE_KEYS.ruleWeights];
    onStorageChange(keys, () => {
      void this.load().then(() => this.listeners.forEach((l) => l()));
    });
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }
}
