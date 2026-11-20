import type { SlopFamily } from './slop/families';
import type { AuthorLists, DailyStats, LlmVerdict, PostInput, ReportLabel, UserReport } from './types';

export interface NewReport {
  text: string;
  postUrn?: string;
  label: ReportLabel;
  family?: SlopFamily;
  note?: string;
  authorId?: string;
  /** „Ukrywaj więcej od tego autora”. */
  boostAuthor?: boolean;
  heuristic: { score: number; signals: string[] };
}

export interface OpenRouterModel {
  id: string;
  name: string;
  /** USD za 1 mln tokenów wejścia/wyjścia. */
  promptPrice: number;
  completionPrice: number;
  structuredOutputs: boolean;
}

export interface EngineStatus {
  stats: DailyStats;
  openrouter: {
    enabled: boolean;
    hasKey: boolean;
    model: string;
    breakerOpenUntil: number | null;
    requestsToday: number;
    dailyLimit: number;
    lastError?: string;
  };
  reportsCount: number;
}

export type AuthorRule = keyof AuthorLists | null;

/** Wiadomości do service workera i typy odpowiedzi. */
export interface RequestMap {
  CLASSIFY: { req: { post: PostInput }; res: { verdict: LlmVerdict | null; error?: string } };
  REPORT_POST: { req: { report: NewReport }; res: { report: UserReport } };
  DELETE_REPORT: { req: { id: string }; res: { ok: true } };
  UPDATE_REPORT: { req: { id: string; patch: Partial<Pick<UserReport, 'label' | 'family' | 'note'>> }; res: { ok: true } };
  ADD_PHRASE: { req: { phrase: string; family?: SlopFamily; weight?: number }; res: { ok: true } };
  UPDATE_PHRASE: { req: { id: string; weight: number }; res: { ok: true } };
  DELETE_PHRASE: { req: { id: string }; res: { ok: true } };
  SET_AUTHOR_RULE: { req: { authorId: string; rule: AuthorRule }; res: { ok: true } };
  COUNT_HIDDEN: { req: { family: SlopFamily; ad?: boolean }; res: { ok: true } };
  GET_STATUS: { req: Record<string, never>; res: EngineStatus };
  LIST_MODELS: { req: Record<string, never>; res: { models: OpenRouterModel[]; error?: string } };
  TEST_OPENROUTER: { req: Record<string, never>; res: { ok: boolean; error?: string; sample?: string } };
  CLEAR_CACHE: { req: Record<string, never>; res: { ok: true } };
  IMPORT_DATA: { req: { data: unknown }; res: { reports: number; phrases: number } };
  EXPORT_DATA: { req: Record<string, never>; res: { data: unknown } };
  RESET_WEIGHTS: { req: Record<string, never>; res: { ok: true } };
}

export type MessageType = keyof RequestMap;
export type Message = { [K in MessageType]: { type: K } & RequestMap[K]['req'] }[MessageType];
export type Response<K extends MessageType> = RequestMap[K]['res'] | { error: string };

export async function send<K extends MessageType>(
  type: K,
  payload: RequestMap[K]['req'],
): Promise<RequestMap[K]['res']> {
  const response = (await chrome.runtime.sendMessage({ type, ...payload })) as Response<K> | undefined;
  if (!response) throw new Error(`Brak odpowiedzi na ${type}`);
  if ('error' in response && Object.keys(response).length === 1) throw new Error(response.error);
  return response as RequestMap[K]['res'];
}

/** Wiadomości z service workera do content scriptu (menu kontekstowe). */
export type TabMessage = { type: 'CONTEXT_REPORT' };
