import { CLOSER_RULES } from './closers';
import { CONSTRUCTION_RULES } from './constructions';
import { FAMILY_PHRASE_RULES } from './family-phrases';
import { STRUCTURE_RULES } from './structure';
import { SUBSTANCE_RULES } from './substance';
import type { SignalRule } from './types';
import { VOCABULARY_RULES } from './vocabulary';

const SUPPRESSIONS: Record<string, string[]> = {
  'phrase.vague-source': ['substance.named-source'],
};

export const RULES: readonly SignalRule[] = [
  ...STRUCTURE_RULES,
  ...FAMILY_PHRASE_RULES,
  ...CLOSER_RULES,
  ...VOCABULARY_RULES,
  ...CONSTRUCTION_RULES,
  ...SUBSTANCE_RULES,
].map((rule) => (SUPPRESSIONS[rule.id] ? { ...rule, suppressedBy: SUPPRESSIONS[rule.id] } : rule));

export const RULE_IDS: readonly string[] = RULES.map((r) => r.id);

export type { RuleGroup, SignalRule } from './types';
