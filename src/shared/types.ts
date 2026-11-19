import type { SlopFamily } from './slop/families';
import type { RuleGroup } from './slop/rules';
import type { TestItemId } from './slop/test-items';

export type ReportLabel = 'slop' | 'human';

/** Zgłoszenie użytkownika (DESIGN §6.2). Bez imienia autora. */
export interface UserReport {
  id: string;
  postUrn?: string;
  textHash: string;
  text: string;
  label: ReportLabel;
  family?: SlopFamily;
  note?: string;
  authorId?: string;
  heuristic: { score: number; signals: string[] };
  minhash: number[];
  createdAt: number;
}

export interface UserPhrase {
  id: string;
  phrase: string;
  weight: number;
  family?: SlopFamily;
  createdAt: number;
}

export interface AuthorLists {
  alwaysHide: string[];
  alwaysShow: string[];
  /** „Ukrywaj więcej od tego autora” — +2 do wyniku. */
  boosted: string[];
}

/** Dane użytkownika potrzebne heurystyce w content scripcie. */
export interface UserContext {
  phrases: UserPhrase[];
  reportSignatures: Array<{ id: string; label: ReportLabel; family?: SlopFamily; minhash: number[] }>;
  boostedAuthors: string[];
  ruleWeights: Record<string, number>;
}

export interface SignalHit {
  id: string;
  family: SlopFamily;
  group: RuleGroup;
  testItem?: TestItemId;
  contribution: number;
}

export interface ScoreResult {
  /** Skala testu z raportu: 0–12. */
  score: number;
  raw: number;
  family: SlopFamily;
  testItems: TestItemId[];
  signals: SignalHit[];
  clusterGroups: RuleGroup[];
  /** Wynik obcięty do 6, bo brak klastra sygnałów. */
  capped: boolean;
  matchedReport?: { id: string; label: ReportLabel; similarity: number };
}

export type EngineSource = 'heuristic' | 'openrouter' | 'user' | 'author';

export interface LlmVerdict {
  /** 0–12 (tryb LLM: suma odpowiedzi; tryb decyzyjny: 10 lub 1). */
  score: number;
  family?: SlopFamily;
  reason?: string;
  answers?: number[];
}

export interface PostInput {
  /** Klucz cache: hash tekstu. */
  key: string;
  text: string;
  heuristic: { score: number; family: SlopFamily };
}

export interface DailyStats {
  date: string;
  hidden: number;
  byFamily: Partial<Record<SlopFamily, number>>;
  llmRequests: number;
}
