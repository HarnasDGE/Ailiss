import { FAMILY_INFO, SLOP_FAMILIES } from '../../shared/slop/families';
import { LLM_TEST_ITEMS } from '../../shared/slop/test-items';
import type { FewShotExample } from '../reports/select-examples';
import type { ChatMessage } from './client';

/** Ile znaków posta wysyłamy (prywatność + koszt, DESIGN §4.1). */
export const POST_MAX_CHARS = 1500;

export interface PromptPost {
  id: string;
  text: string;
}

const DEFINITION = `AI slop = jednocześnie:
(1) przewidywalna forma (hook, broetry, lista, closér),
(2) zero konkretu (nazwiska, liczby, daty, miejsca, konsekwencje),
(3) brak autora — post pasowałby do dowolnego konta w dowolnej branży.
Pojedynczy em-dash, emoji czy lista NIE czynią posta slopem — liczy się klaster sygnałów i brak substancji.
Nie oceniasz tematu ani poglądów autora — tylko styl i autentyczność.`;

function familiesList(): string {
  return SLOP_FAMILIES.filter((f) => f !== 'comment-slop')
    .map((f) => `- ${f}: ${FAMILY_INFO[f].description}`)
    .join('\n');
}

function examplesBlock(examples: readonly FewShotExample[]): string {
  if (examples.length === 0) return '';
  const items = examples
    .map((e, i) => {
      const meta = [e.label === 'slop' ? 'SLOP' : 'NIE SLOP', e.family, e.note ? `notatka: ${e.note}` : '']
        .filter(Boolean)
        .join(' · ');
      return `### Przykład ${i + 1} (${meta})\n${e.text}`;
    })
    .join('\n\n');
  return `\n\nPrzykłady oznaczone ręcznie przez użytkownika — kalibruj się na nich:\n\n${items}`;
}

export function truncatePost(text: string): string {
  return text.length > POST_MAX_CHARS ? `${text.slice(0, POST_MAX_CHARS)}…` : text;
}

function postsBlock(posts: readonly PromptPost[]): string {
  return posts.map((p) => `<post id="${p.id}">\n${truncatePost(p.text)}\n</post>`).join('\n\n');
}

export function buildLlmMessages(posts: readonly PromptPost[], examples: readonly FewShotExample[]): ChatMessage[] {
  const questions = LLM_TEST_ITEMS.map((q, i) => `${i + 1}. ${q.question}`).join('\n');
  const system = `Klasyfikujesz posty z LinkedIn (po polsku lub angielsku).
${DEFINITION}

Dla każdego posta odpowiedz 1 (tak) lub 0 (nie) na ${LLM_TEST_ITEMS.length} pytań:
${questions}

Wskaż rodzinę slopu z listy:
${familiesList()}

Zwróć wyłącznie JSON: {"results":[{"id":"<id posta>","answers":[${LLM_TEST_ITEMS.map(() => '0|1').join(',')}],"family":"<rodzina>","reason":"<max 12 słów po polsku>"}]}${examplesBlock(examples)}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: postsBlock(posts) },
  ];
}

export function buildDecisionMessages(posts: readonly PromptPost[], examples: readonly FewShotExample[]): ChatMessage[] {
  const system = `Klasyfikujesz posty z LinkedIn.
${DEFINITION}

Dla każdego posta zwróć jedną linię: "<id>: SLOP" albo "<id>: OK". Nic więcej.${examplesBlock(examples)}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: postsBlock(posts) },
  ];
}
