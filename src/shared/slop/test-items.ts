/** Test 30 sekund / scoring 0–12 z raportu (§7). */
export type TestItemId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface TestItem {
  id: TestItemId;
  question: string;
  short: string;
  /** Czy heurystyka umie to sprawdzić automatycznie. */
  heuristic: boolean;
  /** Czy pytanie zadajemy LLM (12. jest niedostępne z poziomu feedu). */
  llm: boolean;
}

export const TEST_ITEMS: readonly TestItem[] = [
  { id: 1, short: 'hook', heuristic: true, llm: true, question: 'Czy hook (pierwsze zdanie) to jedno zdanie bez kontekstu i bez nazwy?' },
  { id: 2, short: 'broetry', heuristic: true, llm: true, question: 'Czy większość akapitów to jedno zdanie?' },
  { id: 3, short: 'wata', heuristic: false, llm: true, question: 'Czy da się usunąć 30% tekstu bez utraty sensu?' },
  { id: 4, short: 'antyteza', heuristic: true, llm: true, question: 'Czy jest konstrukcja „It’s not X, it’s Y” lub jej wariant?' },
  { id: 5, short: 'lista', heuristic: true, llm: true, question: 'Czy jest lista 3 lub 5 punktów z bold-headerami lub emoji?' },
  { id: 6, short: 'słownictwo AI', heuristic: true, llm: true, question: 'Czy jest słownictwo typu humbled / thrilled / resonates / journey / game-changer / delve / tapestry?' },
  { id: 7, short: 'closér', heuristic: true, llm: true, question: 'Czy jest closér typu „Agree?” / „Thoughts?” / „Repost” / „Follow”?' },
  { id: 8, short: 'brak konkretu', heuristic: true, llm: true, question: 'Czy brak nazwisk, firm, dat lub sprawdzalnych liczb?' },
  { id: 9, short: 'porażka→sukces', heuristic: true, llm: true, question: 'Czy brak własnej porażki, która nadal boli (wszystko zamknięte sukcesem)?' },
  { id: 10, short: 'przenośna pointa', heuristic: false, llm: true, question: 'Czy pointę da się podmienić na inną branżę bez zmiany zdania?' },
  { id: 11, short: 'hashtagi/emoji', heuristic: true, llm: true, question: 'Czy są 4+ hashtagi lub emoji w każdej linii listy?' },
  { id: 12, short: 'brak odpowiedzi autora', heuristic: false, llm: false, question: 'Czy autor nie odpowiada na komentarze?' },
];

export const LLM_TEST_ITEMS = TEST_ITEMS.filter((item) => item.llm);
export const HEURISTIC_TEST_ITEMS = TEST_ITEMS.filter((item) => item.heuristic);

export function testItemShort(id: TestItemId): string {
  return TEST_ITEMS.find((item) => item.id === id)?.short ?? String(id);
}
