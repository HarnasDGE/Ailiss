import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SlopFamily } from '../../src/shared/slop/families';

export interface Fixture {
  id: string;
  label: 'slop' | 'human';
  kind: 'post' | 'comment';
  family?: SlopFamily;
  altFamilies?: SlopFamily[];
  /** Skrócony wariant z raportu (§8 „przed”, krótkie warianty z §4) — wystarczy strefa niepewna. */
  compact?: boolean;
  source: string;
  text: string;
}

function load(name: string): Fixture[] {
  return JSON.parse(readFileSync(join(__dirname, 'posts', name), 'utf8')) as Fixture[];
}

export const REPORT_FIXTURES = load('report-examples.json');
export const EXTRA_HUMAN_FIXTURES = load('extra-human.json');
export const ALL_FIXTURES = [...REPORT_FIXTURES, ...EXTRA_HUMAN_FIXTURES];
