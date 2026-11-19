/**
 * Dostęp do chrome.storage.local. Zapisy danych użytkownika (zgłoszenia, frazy, autorzy, statystyki)
 * robi wyłącznie service worker — content script i strony UI tylko czytają i wysyłają wiadomości.
 * Wyjątek: ustawienia zapisują bezpośrednio popup/options.
 */
import { withDefaults, type Settings } from './settings';
import type { AuthorLists, DailyStats, UserContext, UserPhrase, UserReport } from './types';

export const STORAGE_KEYS = {
  settings: 'settings',
  /** Klucz OpenRoutera trzymany osobno; content script go nie czyta. */
  openrouterKey: 'openrouterKey',
  reports: 'reports',
  phrases: 'phrases',
  authors: 'authors',
  ruleWeights: 'ruleWeights',
  stats: 'stats',
  llmCache: 'llmCache',
} as const;

type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export const EMPTY_AUTHORS: AuthorLists = { alwaysHide: [], alwaysShow: [], boosted: [] };

export async function readKey<T>(key: StorageKey, fallback: T): Promise<T> {
  const result = await chrome.storage.local.get(key);
  return (result[key] as T | undefined) ?? fallback;
}

export async function writeKey<T>(key: StorageKey, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function getSettings(): Promise<Settings> {
  return withDefaults(await readKey<Partial<Settings> | undefined>(STORAGE_KEYS.settings, undefined));
}

export async function saveSettings(settings: Settings): Promise<void> {
  await writeKey(STORAGE_KEYS.settings, settings);
}

export const getReports = () => readKey<UserReport[]>(STORAGE_KEYS.reports, []);
export const getPhrases = () => readKey<UserPhrase[]>(STORAGE_KEYS.phrases, []);
export const getAuthors = async (): Promise<AuthorLists> => ({
  ...EMPTY_AUTHORS,
  ...(await readKey<Partial<AuthorLists>>(STORAGE_KEYS.authors, {})),
});
export const getRuleWeights = () => readKey<Record<string, number>>(STORAGE_KEYS.ruleWeights, {});

export function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export async function getStats(): Promise<DailyStats> {
  const stats = await readKey<DailyStats | undefined>(STORAGE_KEYS.stats, undefined);
  const today = todayKey();
  return stats?.date === today ? stats : { date: today, hidden: 0, byFamily: {}, llmRequests: 0 };
}

export function buildUserContext(
  reports: UserReport[],
  phrases: UserPhrase[],
  authors: AuthorLists,
  ruleWeights: Record<string, number>,
): UserContext {
  return {
    phrases,
    reportSignatures: reports.map((r) => ({ id: r.id, label: r.label, family: r.family, minhash: r.minhash })),
    boostedAuthors: authors.boosted,
    ruleWeights,
  };
}

/** Nasłuch zmian wybranych kluczy (dowolny kontekst rozszerzenia). */
export function onStorageChange(keys: StorageKey[], callback: () => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && keys.some((k) => k in changes)) callback();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
