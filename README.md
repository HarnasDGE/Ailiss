# Ailiss — filtr AI slopu na LinkedIn

Rozszerzenie Chrome (Manifest V3), które zwija posty na LinkedIn wyglądające na „AI slop” do cienkiego, szarego paska z podglądem i przyciskiem **Pokaż**.

- **Heurystyka lokalna** (domyślna, darmowa, natychmiastowa) — test 0–12 i banki sygnatur z [raportu](docs/research/ai-slop-linkedin.md), z zasadą klastra: pojedynczy em-dash czy emoji nigdy nie zwijają posta.
- **OpenRouter** (opcjonalnie) — LLM albo tani model „decyzyjny” ocenia tylko posty niepewne (wynik 4–6).
- **Zgłoszenia** — ⚑ na poście lub menu kontekstowe; zgłoszone posty są przykładami dla LLM, wykrywają kopie szablonów i kalibrują wagi reguł.
- Wszystkie dane zostają lokalnie w przeglądarce. Do OpenRoutera trafia tylko tekst posta (max 1500 znaków), bez autora i komentarzy.

Projekt: [docs/DESIGN.md](docs/DESIGN.md).

## Instalacja (tryb deweloperski)

```bash
npm install
npm run build
```

Chrome → `chrome://extensions` → włącz **Tryb dewelopera** → **Załaduj rozpakowane** → wskaż `.output/chrome-mv3`.

Po instalacji otworzy się strona ustawień. OpenRouter włączasz tam: klucz API → **Pobierz listę modeli** → wybierz model → **Testuj połączenie**.

## Skrypty

| Komenda | Co robi |
|---|---|
| `npm run dev` | WXT z HMR (otwiera Chromium z rozszerzeniem) |
| `npm run build` | build produkcyjny do `.output/chrome-mv3` |
| `npm run zip` | paczka do Chrome Web Store |
| `npm test` | testy jednostkowe (heurystyka na przykładach z raportu, ekstrakcja DOM, decyzje, kolejka, parsowanie odpowiedzi LLM) |
| `npm run typecheck` | TypeScript |
| `npm run e2e` | smoke test w prawdziwym Chromium na makiecie feedu (wymaga `npm run build` i Playwright) |
| `npm run icons` | generuje ikony do `public/icon/` |

## Strojenie reguł

Reguły są w `src/shared/slop/rules/`, każda z rodziną, grupą i (opcjonalnie) pytaniem z testu 0–12. Zmiany sprawdzaj testami na fiksturach z raportu (`tests/fixtures/posts/`).

Zgłoszenia wyeksportowane ze strony ustawień (**Eksportuj JSON**) mają format fiksturek — tablicę `posts` można zapisać jako nowy plik w `tests/fixtures/posts/` i dołączyć w `tests/fixtures/load.ts`, żeby stroić reguły na prawdziwych postach.

## Ograniczenia

- Obsługiwane są dwa formaty feedu LinkedIn: nowy (SDUI, zaciemnione klasy — kotwice: `role="listitem"` + `componentkey`, `data-testid="expandable-text-box"`, linki `/in/…`) i starszy (`data-urn`, `.update-components-*`). Nowy format zweryfikowano na zanonimizowanej próbce prawdziwego posta (`tests/fixtures/dom/feed-sdui.html`). Selektory są w `src/content/linkedin/selectors.ts`.
- **Komentarze** w nowym formacie nie są jeszcze obsługiwane (brak próbki DOM) — przełącznik „Zwijaj komentarze-slop” działa tylko na starszym DOM.
- Heurystyka nie sprawdza 3 pytań z testu (wata, przenośna pointa, brak odpowiedzi autora) — dwa pierwsze ocenia LLM.
