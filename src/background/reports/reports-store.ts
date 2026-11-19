import type { AuthorRule, NewReport } from '../../shared/messages';
import { scorePost } from '../../shared/slop/score';
import { minhash, textHash } from '../../shared/slop/similarity';
import {
  getAuthors,
  getPhrases,
  getReports,
  newId,
  STORAGE_KEYS,
  writeKey,
} from '../../shared/storage';
import type { AuthorLists, UserPhrase, UserReport } from '../../shared/types';
import { computeRuleWeights } from './calibrate-weights';
import { parseImport, toExportFile, type ExportFile } from './export-import';

export const MAX_REPORTS = 500;
const MAX_REPORT_TEXT = 2000;

/** Zapisy serializowane — kilka kart może zgłaszać naraz. */
let chain: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

/** Limit: najpierw wypadają najstarsze „slop”; „nie slop” są rzadsze i cenniejsze. */
export function enforceLimit(reports: UserReport[], max = MAX_REPORTS): UserReport[] {
  if (reports.length <= max) return reports;
  const sorted = [...reports].sort((a, b) => a.createdAt - b.createdAt);
  let excess = reports.length - max;
  const drop = new Set<string>();
  for (const label of ['slop', 'human'] as const) {
    for (const r of sorted) {
      if (excess === 0) break;
      if (r.label === label) {
        drop.add(r.id);
        excess--;
      }
    }
  }
  return reports.filter((r) => !drop.has(r.id));
}

async function saveReports(reports: UserReport[]): Promise<void> {
  const limited = enforceLimit(reports);
  await writeKey(STORAGE_KEYS.reports, limited);
  await writeKey(STORAGE_KEYS.ruleWeights, computeRuleWeights(limited));
}

function buildReport(input: NewReport): UserReport {
  const text = input.text.slice(0, MAX_REPORT_TEXT);
  return {
    id: newId('rep'),
    postUrn: input.postUrn,
    textHash: textHash(text),
    text,
    label: input.label,
    family: input.family,
    note: input.note?.trim() || undefined,
    authorId: input.boostAuthor ? input.authorId : undefined,
    heuristic: input.heuristic,
    minhash: minhash(text),
    createdAt: Date.now(),
  };
}

export function addReport(input: NewReport): Promise<UserReport> {
  return serialized(async () => {
    const report = buildReport(input);
    const reports = (await getReports()).filter((r) => r.textHash !== report.textHash);
    reports.push(report);
    await saveReports(reports);
    if (input.boostAuthor && input.authorId) await applyAuthorRule(input.authorId, 'boosted');
    return report;
  });
}

export function deleteReport(id: string): Promise<void> {
  return serialized(async () => saveReports((await getReports()).filter((r) => r.id !== id)));
}

export function updateReport(id: string, patch: Partial<Pick<UserReport, 'label' | 'family' | 'note'>>): Promise<void> {
  return serialized(async () => saveReports((await getReports()).map((r) => (r.id === id ? { ...r, ...patch } : r))));
}

export function resetWeights(): Promise<void> {
  return serialized(() => writeKey(STORAGE_KEYS.ruleWeights, {}));
}

export function addPhrase(phrase: string, family?: UserPhrase['family'], weight = 1): Promise<void> {
  return serialized(async () => {
    const clean = phrase.trim().replace(/\s+/g, ' ').slice(0, 120);
    if (clean.length < 3) return;
    const phrases = await getPhrases();
    if (phrases.some((p) => p.phrase.toLowerCase() === clean.toLowerCase())) return;
    phrases.push({ id: newId('phr'), phrase: clean, family, weight, createdAt: Date.now() });
    await writeKey(STORAGE_KEYS.phrases, phrases);
  });
}

export function updatePhrase(id: string, weight: number): Promise<void> {
  return serialized(async () => {
    const phrases = (await getPhrases()).map((p) => (p.id === id ? { ...p, weight } : p));
    await writeKey(STORAGE_KEYS.phrases, phrases);
  });
}

export function deletePhrase(id: string): Promise<void> {
  return serialized(async () => writeKey(STORAGE_KEYS.phrases, (await getPhrases()).filter((p) => p.id !== id)));
}

async function applyAuthorRule(authorId: string, rule: AuthorRule): Promise<void> {
  const authors = await getAuthors();
  const next: AuthorLists = {
    alwaysHide: authors.alwaysHide.filter((a) => a !== authorId),
    alwaysShow: authors.alwaysShow.filter((a) => a !== authorId),
    boosted: authors.boosted.filter((a) => a !== authorId),
  };
  if (rule) next[rule].push(authorId);
  await writeKey(STORAGE_KEYS.authors, next);
}

export function setAuthorRule(authorId: string, rule: AuthorRule): Promise<void> {
  return serialized(() => applyAuthorRule(authorId, rule));
}

export async function exportData(): Promise<ExportFile> {
  return toExportFile(await getReports(), await getPhrases());
}

export function importData(data: unknown): Promise<{ reports: number; phrases: number }> {
  return serialized(async () => {
    const parsed = parseImport(data);
    const reports = await getReports();
    const known = new Set(reports.map((r) => r.textHash));
    let addedReports = 0;
    for (const post of parsed.posts) {
      const heuristic = scorePost(post.text);
      const report = buildReport({
        ...post,
        heuristic: { score: heuristic.score, signals: heuristic.signals.filter((s) => s.contribution > 0).map((s) => s.id) },
      });
      if (known.has(report.textHash)) continue;
      known.add(report.textHash);
      reports.push(report);
      addedReports++;
    }
    await saveReports(reports);

    const phrases = await getPhrases();
    let addedPhrases = 0;
    for (const p of parsed.phrases) {
      if (phrases.some((x) => x.phrase.toLowerCase() === p.phrase.toLowerCase())) continue;
      phrases.push({ id: newId('phr'), ...p, createdAt: Date.now() });
      addedPhrases++;
    }
    await writeKey(STORAGE_KEYS.phrases, phrases);
    return { reports: addedReports, phrases: addedPhrases };
  });
}
