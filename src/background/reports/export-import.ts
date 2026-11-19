import { isSlopFamily, type SlopFamily } from '../../shared/slop/families';
import type { ReportLabel, UserPhrase, UserReport } from '../../shared/types';

/**
 * Format eksportu zgodny z fiksturami testów (tests/fixtures/posts/*.json):
 * tablicę `posts` można wkleić jako plik fiksturek i stroić na niej reguły.
 */
export interface ExportedPost {
  id: string;
  label: ReportLabel;
  kind: 'post';
  family?: SlopFamily;
  note?: string;
  source: string;
  text: string;
}

export interface ExportFile {
  app: 'ailiss';
  version: 1;
  exportedAt: string;
  posts: ExportedPost[];
  phrases: Array<Pick<UserPhrase, 'phrase' | 'weight' | 'family'>>;
}

export interface ImportedData {
  posts: Array<{ label: ReportLabel; text: string; family?: SlopFamily; note?: string }>;
  phrases: Array<{ phrase: string; weight: number; family?: SlopFamily }>;
}

export function toExportFile(reports: readonly UserReport[], phrases: readonly UserPhrase[], now = new Date()): ExportFile {
  return {
    app: 'ailiss',
    version: 1,
    exportedAt: now.toISOString(),
    posts: reports.map((r) => ({
      id: r.id,
      label: r.label,
      kind: 'post',
      family: r.family,
      note: r.note,
      source: 'zgłoszenie użytkownika',
      text: r.text,
    })),
    phrases: phrases.map(({ phrase, weight, family }) => ({ phrase, weight, family })),
  };
}

const MAX_TEXT = 2000;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/** Przyjmuje plik eksportu albo samą tablicę fiksturek. Odrzuca niepoprawne wpisy. */
export function parseImport(data: unknown): ImportedData {
  const root = asRecord(data);
  const rawPosts: unknown[] = Array.isArray(data) ? data : Array.isArray(root?.posts) ? (root.posts as unknown[]) : [];
  const rawPhrases: unknown[] = Array.isArray(root?.phrases) ? (root.phrases as unknown[]) : [];

  const posts: ImportedData['posts'] = [];
  for (const item of rawPosts) {
    const r = asRecord(item);
    if (!r || typeof r.text !== 'string' || !r.text.trim()) continue;
    if (r.label !== 'slop' && r.label !== 'human') continue;
    if (r.kind !== undefined && r.kind !== 'post') continue;
    posts.push({
      label: r.label,
      text: r.text.slice(0, MAX_TEXT),
      family: isSlopFamily(r.family) ? r.family : undefined,
      note: typeof r.note === 'string' ? r.note.slice(0, 300) : undefined,
    });
  }

  const phrases: ImportedData['phrases'] = [];
  for (const item of rawPhrases) {
    const r = asRecord(item);
    if (!r || typeof r.phrase !== 'string' || r.phrase.trim().length < 3) continue;
    const weight = typeof r.weight === 'number' && Number.isFinite(r.weight) ? Math.max(-3, Math.min(3, r.weight)) : 1;
    phrases.push({ phrase: r.phrase.trim().slice(0, 120), weight, family: isSlopFamily(r.family) ? r.family : undefined });
  }
  return { posts, phrases };
}
