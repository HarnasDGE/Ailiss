import type { Message, RequestMap } from '../shared/messages';
import { clearCache } from './cache';
import { listModels } from './openrouter/client';
import { classifyPost, engineStatus, testConnection } from './llm-service';
import {
  addPhrase,
  addReport,
  deletePhrase,
  deleteReport,
  exportData,
  importData,
  resetWeights,
  setAuthorRule,
  updatePhrase,
  updateReport,
} from './reports/reports-store';
import { countHidden } from './stats';

type Handlers = { [K in keyof RequestMap]: (msg: Extract<Message, { type: K }>) => Promise<RequestMap[K]['res']> };

const ok = { ok: true } as const;

const handlers: Handlers = {
  CLASSIFY: ({ post }) => classifyPost(post),
  REPORT_POST: async ({ report }) => ({ report: await addReport(report) }),
  DELETE_REPORT: async ({ id }) => (await deleteReport(id), ok),
  UPDATE_REPORT: async ({ id, patch }) => (await updateReport(id, patch), ok),
  ADD_PHRASE: async ({ phrase, family, weight }) => (await addPhrase(phrase, family, weight), ok),
  UPDATE_PHRASE: async ({ id, weight }) => (await updatePhrase(id, weight), ok),
  DELETE_PHRASE: async ({ id }) => (await deletePhrase(id), ok),
  SET_AUTHOR_RULE: async ({ authorId, rule }) => (await setAuthorRule(authorId, rule), ok),
  COUNT_HIDDEN: async ({ family }) => (await countHidden(family), ok),
  GET_STATUS: () => engineStatus(),
  LIST_MODELS: async () => {
    try {
      return { models: await listModels() };
    } catch (error) {
      return { models: [], error: error instanceof Error ? error.message : String(error) };
    }
  },
  TEST_OPENROUTER: () => testConnection(),
  CLEAR_CACHE: async () => (await clearCache(), ok),
  IMPORT_DATA: ({ data }) => importData(data),
  EXPORT_DATA: async () => ({ data: await exportData() }),
  RESET_WEIGHTS: async () => (await resetWeights(), ok),
};

export function registerRouter(): void {
  chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
    // Tylko nasze konteksty (content script i strony rozszerzenia).
    if (sender.id !== chrome.runtime.id) return false;
    const handler = handlers[message?.type] as ((m: Message) => Promise<unknown>) | undefined;
    if (!handler) return false;
    handler(message)
      .then(sendResponse)
      .catch((error: unknown) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
    return true;
  });
}
