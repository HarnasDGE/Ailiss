import { RULES } from '../../shared/slop/rules';
import type { UserReport } from '../../shared/types';

/** Od tylu zgłoszeń zaczynamy korygować wagi (DESIGN §6.3). */
export const MIN_REPORTS_FOR_CALIBRATION = 20;
const MIN_RULE_OBSERVATIONS = 3;
const MIN_FACTOR = 0.5;
const MAX_FACTOR = 1.5;

const POSITIVE_RULES = new Set(RULES.filter((r) => r.weight > 0).map((r) => r.id));

/**
 * Mnożnik wagi reguły = 0.5 + precyzja (wygładzona Laplace’em), w granicach ±50%.
 * Reguła trafiająca głównie w zgłoszenia „slop” rośnie, w „nie slop” — maleje.
 */
export function computeRuleWeights(reports: readonly UserReport[]): Record<string, number> {
  if (reports.length < MIN_REPORTS_FOR_CALIBRATION) return {};
  const counts = new Map<string, { slop: number; human: number }>();
  for (const report of reports) {
    for (const id of new Set(report.heuristic.signals)) {
      if (!POSITIVE_RULES.has(id)) continue;
      const c = counts.get(id) ?? { slop: 0, human: 0 };
      c[report.label === 'slop' ? 'slop' : 'human']++;
      counts.set(id, c);
    }
  }
  const weights: Record<string, number> = {};
  for (const [id, { slop, human }] of counts) {
    if (slop + human < MIN_RULE_OBSERVATIONS) continue;
    const precision = (slop + 1) / (slop + human + 2);
    const factor = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, 0.5 + precision));
    if (Math.abs(factor - 1) >= 0.05) weights[id] = Math.round(factor * 100) / 100;
  }
  return weights;
}
