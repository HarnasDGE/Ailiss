import type { OpenRouterModel } from '../../shared/messages';

const BASE_URL = 'https://openrouter.ai/api/v1';
const TIMEOUT_MS = 30_000;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  jsonSchema?: { name: string; schema: Record<string, unknown> };
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function request(path: string, init: RequestInit & { apiKey?: string }): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Title': 'Ailiss',
        ...(init.apiKey ? { Authorization: `Bearer ${init.apiKey}` } : {}),
        ...init.headers,
      },
    });
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    if (!response.ok) {
      throw new OpenRouterError(body.error?.message ?? `HTTP ${response.status}`, response.status);
    }
    return body;
  } catch (error) {
    if (error instanceof OpenRouterError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') throw new OpenRouterError('Przekroczono czas odpowiedzi');
    throw new OpenRouterError(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}

/** Modele, dla których structured outputs okazały się niewspierane — kolejne żądania bez `response_format`. */
const noStructuredOutputs = new Set<string>();

export async function chatCompletion(req: ChatRequest): Promise<string> {
  const useSchema = req.jsonSchema && !noStructuredOutputs.has(req.model);
  const body = {
    model: req.model,
    messages: req.messages,
    temperature: 0,
    max_tokens: req.maxTokens,
    ...(useSchema
      ? { response_format: { type: 'json_schema', json_schema: { name: req.jsonSchema!.name, strict: true, schema: req.jsonSchema!.schema } } }
      : {}),
  };
  try {
    const data = (await request('/chat/completions', { method: 'POST', apiKey: req.apiKey, body: JSON.stringify(body) })) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new OpenRouterError('Pusta odpowiedź modelu');
    return content;
  } catch (error) {
    // Model bez wsparcia dla response_format → jedno ponowienie bez schematu (prompt i tak prosi o JSON).
    if (useSchema && error instanceof OpenRouterError && error.status === 400 && /response_format|schema|structured/i.test(error.message)) {
      noStructuredOutputs.add(req.model);
      return chatCompletion(req);
    }
    throw error;
  }
}

export async function listModels(): Promise<OpenRouterModel[]> {
  const data = (await request('/models', { method: 'GET' })) as {
    data?: Array<{ id: string; name?: string; pricing?: { prompt?: string; completion?: string }; supported_parameters?: string[] }>;
  };
  return (data.data ?? [])
    .map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      promptPrice: Number(m.pricing?.prompt ?? 0) * 1e6,
      completionPrice: Number(m.pricing?.completion ?? 0) * 1e6,
      structuredOutputs: Boolean(m.supported_parameters?.some((p) => p === 'structured_outputs' || p === 'response_format')),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Sprawdza klucz bez kosztu (endpoint informacji o kluczu). */
export async function checkKey(apiKey: string): Promise<void> {
  try {
    await request('/key', { method: 'GET', apiKey });
  } catch (error) {
    if (error instanceof OpenRouterError && error.status === 404) {
      await request('/auth/key', { method: 'GET', apiKey });
      return;
    }
    throw error;
  }
}
