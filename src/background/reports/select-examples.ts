import type { SlopFamily } from '../../shared/slop/families';
import { minhashSimilarity } from '../../shared/slop/similarity';
import type { ReportLabel, UserReport } from '../../shared/types';

export const MAX_EXAMPLES = 4;
const MAX_SLOP = 3;
const MAX_HUMAN = 2;
export const EXAMPLE_MAX_CHARS = 600;

export interface ExampleTarget {
  family: SlopFamily;
  minhash: number[];
}

export interface FewShotExample {
  label: ReportLabel;
  family?: SlopFamily;
  note?: string;
  text: string;
}

function relevance(report: UserReport, targets: readonly ExampleTarget[]): number {
  let best = 0;
  for (const t of targets) {
    const familyBonus = report.family && report.family === t.family ? 1 : 0;
    best = Math.max(best, familyBonus + minhashSimilarity(report.minhash, t.minhash));
  }
  return best;
}

/**
 * Few-shot do batcha (DESIGN §6.3): 2–3 „slop” + 1–2 „nie slop”, max 4.
 * Najpierw ta sama rodzina co wynik heurystyki, potem najbardziej podobne.
 */
export function selectExamples(reports: readonly UserReport[], targets: readonly ExampleTarget[]): FewShotExample[] {
  const ranked = reports
    .map((r) => ({ r, score: relevance(r, targets) }))
    .sort((a, b) => b.score - a.score || b.r.createdAt - a.r.createdAt);

  const human = ranked.filter((x) => x.r.label === 'human').slice(0, MAX_HUMAN);
  const slopLimit = Math.min(MAX_SLOP, MAX_EXAMPLES - Math.min(human.length, 1));
  const slop = ranked.filter((x) => x.r.label === 'slop').slice(0, slopLimit);
  const humanLimit = MAX_EXAMPLES - slop.length;

  return [...slop, ...human.slice(0, humanLimit)].map(({ r }) => ({
    label: r.label,
    family: r.family,
    note: r.note,
    text: r.text.length > EXAMPLE_MAX_CHARS ? `${r.text.slice(0, EXAMPLE_MAX_CHARS)}…` : r.text,
  }));
}
