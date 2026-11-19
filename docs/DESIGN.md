# Ailiss — projekt wtyczki Chrome ukrywającej AI slop na LinkedIn

Źródło wiedzy o wzorcach: [`docs/research/ai-slop-linkedin.md`](research/ai-slop-linkedin.md) (dalej: *raport*).

## 1. Cel i zasady

- Wykrywa posty w feedzie LinkedIn, które są „AI slopem”, i **zwija** je do cienkiego, mało widocznego paska z podglądem i rozwinięciem.
- Dwa silniki:
  1. **Heurystyka** (domyślna, lokalna, darmowa, natychmiastowa) — implementacja testu 0–12 i banków sygnatur z raportu.
  2. **OpenRouter** (opcjonalny) — LLM lub tani model „decyzyjny”, wołany tylko dla przypadków niepewnych (albo dla wszystkich, jeśli użytkownik tak ustawi).
- Wbudowany LLM przeglądarki (Gemini Nano) — **pominięty**. Interfejs providera zostaje, więc można go dodać później.
- **Zasada klastra** (raport §1): pojedynczy em-dash, lista czy emoji nigdy nie zwijają posta. Wymagane są sygnały z kilku kategorii naraz **i** brak konkretu.
- Nic nie jest usuwane z DOM — tylko ukrywane atrybutem + CSS (LinkedIn to React + wirtualizowana lista).
- Wywołania API wyłącznie z service workera; klucz nie trafia do kontekstu strony.

## 2. Architektura

```
┌──────────────────── linkedin.com (content script) ────────────────────┐
│ feed-observer ─► extract-post ─► heuristic.score() ─► decyzja ─► UI   │
│                                        │ wynik niepewny (4–6)   ▲      │
│                                        └─ sendMessage ──────────┤      │
└────────────────────────────────────────────────────────────────┼──────┘
┌──────────────────── service worker ────────────────────────────┼──────┐
│ router ─► cache (IndexedDB) ─► queue (batch 5, limity) ─► openrouter  │
│                                  circuit breaker ─► przy awarii: zostaje│
│                                  wynik heurystyki                      │
└───────────────────────────────────────────────────────────────────────┘
```

Heurystyka działa bezpośrednio w content scripcie (czysty TS, bez sieci) — zero opóźnienia, brak migania feedu.

### Przepływ dla jednego posta
1. `MutationObserver` wykrywa nowy post; `IntersectionObserver` zgłasza go, gdy jest ~1,5 ekranu przed widokiem.
2. `extract-post` pobiera: URN, autora, pełny tekst (także za „…więcej”), typ (oryginalny / repost / sponsorowany / z karuzelą PDF).
3. `heuristic.score(text)` → wynik 0–12, rodzina slopu, lista sygnałów.
4. Decyzja wg progów (§4.3). Strefa niepewna + włączony OpenRouter → `CLASSIFY` do SW → cache (URN + hash tekstu, TTL 7 dni) → kolejka → LLM.
5. Zwinięcie lub pozostawienie posta; wynik zapisany w cache.

## 3. Heurystyka — mapowanie raportu na reguły

### 3.1 Test 0–12 (raport §7) — co da się wykryć automatycznie

| # | Pytanie z raportu | Heurystyka | LLM |
|---|---|---|---|
| 1 | Hook = jedno zdanie bez kontekstu i nazwy | 1. akapit = 1 zdanie, ≤ 15 słów, bez liczby/nazwy własnej, po nim pusta linia | ✔ |
| 2 | Większość akapitów to jedno zdanie (broetry) | ≥ 60% akapitów ma 1 zdanie i akapitów ≥ 5 | ✔ |
| 3 | Da się usunąć 30% bez utraty sensu | ✘ (przybliżenie: powtórzenia leksykalne hook ↔ re-hook) | ✔ |
| 4 | `It's not X, it's Y` i warianty | regexy EN/PL z §5.4 | ✔ |
| 5 | Lista 3/5 z bold-headerami lub emoji | linie zaczynające się od emoji/1️⃣/✅, wzorzec `**X:**`/`X:` w ≥ 3 liniach | ✔ |
| 6 | Słownictwo AI | bank §5.3 + §5.5; ≥ 1 trafienie = punkt (≥ 3 = waga ×1,5) | ✔ |
| 7 | Closér-bait | bank §5.2 + PL, sprawdzany w ostatnich 3 akapitach | ✔ |
| 8 | Zero nazwisk, firm, dat, sprawdzalnych liczb | brak: nazw własnych w środku zdania, dat, kwot, %, liczb z jednostką | ✔ |
| 9 | Każda porażka zamknięta sukcesem | wzorzec „porażka (lost/fired/rejected/straciłem) → sukces (today/3x/biggest)” | ✔ |
| 10 | Pointa przenośna na inną branżę | ✘ | ✔ |
| 11 | 4+ hashtagi lub emoji w każdej linii listy | licznik `#tag` ≥ 4, emoji na końcu ≥ 50% linii | ✔ |
| 12 | Autor nie odpowiada w komentarzach | ✘ (niedostępne w feedzie) | ✘ |

Heurystyka pokrywa 9 z 12 pytań → wynik skalowany do 0–12: `score = round(punkty / 9 * 12)`.

### 3.2 Sygnały dodatkowe (raport §5.1, §6)
- **Otwarcia** z §5.1 (humbled, unpopular opinion, 3 years ago I was, I wasn't going to post this…) — przypisują też **rodzinę**.
- **Rytm**: niska wariancja długości zdań (odchylenie std < 3 słowa przy średniej 8–14).
- **Kreski**: em-dash w > 40% zdań; curly quotes (niska waga — LinkedIn bywa normalizuje).
- **Title Case** w linii-nagłówku.
- **Sygnatury-podpisy**: `That's it. That's the post.`, `Simple. Not easy.`, `I said what I said`, `Read that again`.
- **Mgliste atrybucje** (§4.12): `Studies show`, `Research suggests`, `Badania pokazują` bez nazwy źródła w tym samym zdaniu.

### 3.3 Antysygnały — „substancja” obniża wynik
Zgodnie z definicją (slop = forma + **zero konkretu**):
- konkretne liczby z jednostką/kontekstem, daty, nazwy narzędzi/firm, cytat źródła → −1 do −3,
- nierówne akapity (min. jeden ≥ 4 zdania) → −1,
- wątpliwość/niezamknięty wynik („jeszcze nie wiem”, „not sure yet”) → −1.

Przykłady „po” z raportu §8 muszą wychodzić **< 4**.

### 3.4 Rodziny (raport §4) — etykieta w UI
Każda reguła ma przypisaną rodzinę; wygrywa ta z największą sumą wag:
`announcement` (4.1) · `broetry` (4.2) · `antithesis` (4.3) · `fake-journey` (4.4) · `lessons-list` (4.5) · `hot-take` (4.6) · `engagement-bait` (4.7) · `ai-vocabulary` (4.8) · `fake-vulnerability` (4.9) · `ai-thought-leadership` (4.10) · `corporate-hr` (4.11) · `fake-data` (4.12) · `emoji-framework` (4.13) · `comment-slop` (4.14).

### 3.5 Format reguł
```ts
interface SignalRule {
  id: string;                    // 'closer.agree'
  family: SlopFamily;
  testItem?: 1 | 2 | 4 | 5 | 6 | 7 | 8 | 9 | 11;  // pytanie z testu 0–12
  lang: 'en' | 'pl' | 'any';
  weight: number;                // ujemna = antysygnał
  match: RegExp | ((post: ParsedPost) => boolean);
}
```
`ParsedPost` liczony raz: akapity, zdania, liczba słów na zdanie, linie listy, emoji, hashtagi, encje (liczby, daty, nazwy własne).

## 4. OpenRouter

### 4.1 Wywołanie
- `POST https://openrouter.ai/api/v1/chat/completions`, `Authorization: Bearer <key>`, z service workera.
- Lista modeli z `GET /api/v1/models` w ustawieniach (wybór z listy z ceną).
- Batching do 5 postów w jednym żądaniu; limit dzienny żądań; circuit breaker (3 błędy → przerwa 10 min, zostaje wynik heurystyki).
- Prywatność: tylko tekst posta, bez imion autora/komentarzy, obcięty do ~1500 znaków. Klucz w `chrome.storage.local`.

### 4.2 Tryby
- **LLM (z uzasadnieniem)** — model odpowiada na 12 pytań testu (bez #12) → JSON:
  ```json
  {"answers":[1,1,0,1,0,1,1,1,0,1,0], "family":"broetry", "reason":"historia z dzieckiem → lekcja o przywództwie"}
  ```
  `score = suma answers`. Wymuszenie `response_format: json_schema` tam, gdzie model wspiera; inaczej walidacja + 1 ponowienie.
- **Decyzyjny** — tani model, `temperature: 0`, `max_tokens: 3`, odpowiedź `SLOP` / `OK` (jeśli są `logprobs`, z nich prawdopodobieństwo). Taniej, bez etykiety rodziny (bierzemy ją z heurystyki).

### 4.3 Prompt systemowy (skrót)
```
Klasyfikujesz posty LinkedIn. AI slop = jednocześnie: (1) przewidywalna
forma (hook, broetry, lista, closér), (2) zero konkretu (nazwiska, liczby,
daty, konsekwencje), (3) brak autora — post pasuje do każdego konta.
Pojedynczy em-dash/emoji/lista NIE czyni posta slopem. Nie oceniasz tematu
ani poglądów. Odpowiedz 0/1 na pytania: [11 pytań z testu]. Wskaż rodzinę
z listy: [14 rodzin].
```
Treść pytań i rodzin generowana z tych samych stałych co heurystyka (`src/shared/slop/`), więc prompt i reguły się nie rozjeżdżają.

### 4.4 Progi decyzji (skala raportu)

| Wynik | Raport | Bez OpenRoutera | Z OpenRouterem |
|---|---|---|---|
| 0–3 | czysto | pokaż | pokaż |
| 4–6 | podejrzane | zależnie od czułości | wyślij do LLM |
| 7–9 | slop | zwiń | zwiń (LLM opcjonalnie) |
| 10–12 | slop generowany | zwiń | zwiń |

Czułość: **Łagodny** (zwijaj ≥ 8) · **Normalny** (≥ 7) · **Agresywny** (≥ 5). Wynik łączony, gdy LLM odpowiedział: `final = round(0.6 * llm + 0.4 * heur)`.

## 5. UI

### 5.1 Zwinięty post
Pasek ~28 px, tło jak karta LinkedIn, szary tekst, bez ikon alarmowych:

```
┌──────────────────────────────────────────────────────────────┐
│ ⌄  Ukryto · Jan Kowalski · broetry · 8/12             Pokaż │
└──────────────────────────────────────────────────────────────┘
```
- **Hover / klik „⌄”** — popover: pierwsze 2 linie posta + trafione punkty testu („hook · broetry · closér · brak konkretu”).
- **Pokaż** — rozwija w miejscu; nad postem belka: `Zwiń · To nie slop · Zawsze ukrywaj autora · Zawsze pokazuj autora`.
- „To nie slop” → wyjątek dla posta + lokalna statystyka trafień reguł (do strojenia wag).
- Pasek w **Shadow DOM**; post dostaje `data-ailiss="collapsed"`, CSS chowa jego zawartość poza paskiem. Wsparcie jasnego/ciemnego motywu LinkedIn.
- Tryby: **zwiń** (domyślnie) · **przyciemnij** (opacity 0.35, pełna na hover) · **tylko oznacz** (mała etykieta).

### 5.2 Komentarze (rodzina 4.14, opcja)
Komentarze typu „Great post! 💯 Couldn't agree more” lub reklama pod postem → zwinięcie do jednej linii `Ukryto komentarz · Pokaż`. Reguła: krótki tekst, zero odniesienia do treści posta (brak wspólnych słów kluczowych), fraza z banku lub CTA „DM me”.

### 5.3 Popup
- Włącz/wyłącz, „Ukryto dziś: 23” (+ podział na rodziny).
- Status silnika: 🟢 heurystyka · 🟢/🔴 OpenRouter (z liczbą żądań dziś / limit).
- Czułość: Łagodny · Normalny · Agresywny.

### 5.4 Ustawienia
- OpenRouter: klucz, test połączenia, model, tryb LLM/decyzyjny, zakres (tylko niepewne / wszystkie), limit dzienny.
- Zachowanie: tryb ukrywania, komentarze tak/nie, pomijanie postów sponsorowanych / repostów / 1. stopnia sieci.
- Rodziny: możliwość wyłączenia wybranych (np. ktoś nie chce chować `announcement`).
- Wyjątki autorów, czyszczenie cache, eksport/import ustawień (bez klucza).

## 6. Struktura projektu

Stack: TypeScript + Manifest V3 + [WXT](https://wxt.dev). Testy: Vitest.

```
ailiss/
├─ docs/
│  ├─ DESIGN.md
│  └─ research/ai-slop-linkedin.md
├─ src/
│  ├─ entrypoints/
│  │  ├─ background.ts               # service worker
│  │  ├─ linkedin.content.ts         # content script
│  │  ├─ popup/
│  │  └─ options/
│  ├─ background/
│  │  ├─ router.ts
│  │  ├─ cache.ts                    # IndexedDB, TTL
│  │  ├─ queue.ts                    # batching, limity
│  │  ├─ circuit-breaker.ts
│  │  └─ openrouter/
│  │     ├─ client.ts
│  │     ├─ prompt.ts                # budowany ze stałych z shared/slop
│  │     └─ response-schema.ts
│  ├─ content/
│  │  ├─ linkedin/
│  │  │  ├─ selectors.ts             # selektory z fallbackami, data-urn
│  │  │  ├─ extract-post.ts
│  │  │  ├─ extract-comment.ts
│  │  │  └─ feed-observer.ts
│  │  ├─ decide.ts                   # progi, łączenie wyników
│  │  └─ ui/
│  │     ├─ collapse-bar.ts          # Shadow DOM
│  │     ├─ peek-popover.ts
│  │     └─ collapse.css
│  └─ shared/
│     ├─ messages.ts
│     ├─ settings.ts
│     ├─ types.ts
│     └─ slop/                       # cała wiedza z raportu
│        ├─ families.ts              # 14 rodzin + opisy (UI i prompt)
│        ├─ test-items.ts            # 12 pytań testu (UI i prompt)
│        ├─ parse-post.ts            # ParsedPost: akapity, zdania, encje
│        ├─ score.ts                 # silnik heurystyki
│        └─ rules/
│           ├─ openers.ts            # §5.1 + PL
│           ├─ closers.ts            # §5.2 + PL
│           ├─ vocabulary.ts         # §5.3, §5.5
│           ├─ constructions.ts      # §5.4 (antyteza, rule of three…)
│           ├─ structure.ts          # §6 (broetry, rytm, emoji, hashtagi)
│           └─ substance.ts          # antysygnały (konkret)
├─ tests/
│  ├─ fixtures/
│  │  ├─ slop/                       # wszystkie przykłady z raportu §4
│  │  ├─ human/                      # wersje „po” z §8 + dobry komentarz §9
│  │  └─ dom/                        # snapshoty HTML feedu LinkedIn
│  ├─ score.test.ts
│  └─ extract-post.test.ts
├─ wxt.config.ts
└─ package.json
```

### Kryteria akceptacji heurystyki (testy na fiksturach)
- ≥ 90% przykładów z §4 ma wynik ≥ 7 (krótkie warianty typu „Unpopular opinion: … I said what I said.” mogą lądować w 4–6).
- 100% wersji „po” z §8 ma wynik < 4 (żadnego fałszywego zwinięcia).
- Każdy przykład z §4 dostaje poprawną rodzinę.

## 7. Manifest (szkic)
- `permissions`: `storage`
- `host_permissions`: `https://www.linkedin.com/*`, `https://openrouter.ai/*` (to drugie jako `optional_host_permissions`, prośba dopiero po włączeniu OpenRoutera)
- brak `<all_urls>`, brak zdalnego kodu.

## 8. Ryzyka

| Ryzyko | Mitygacja |
|---|---|
| Fałszywe pozytywy (ludzki post w stylu broetry) | zasada klastra, antysygnały konkretu, domyślnie „zwiń” a nie „usuń”, „To nie slop”, wyłączanie rodzin |
| Slop bez fraz z banku (model omija słowa kluczowe) | reguły strukturalne (rytm, akapity, brak encji) + LLM dla strefy 4–6 |
| LinkedIn zmienia DOM | selektory w jednym pliku, `data-urn`, testy na snapshotach |
| Koszt OpenRouter | tylko strefa niepewna, cache, batching, limit, tryb decyzyjny |
| Wykrywanie nazw własnych w PL/EN bez NLP | proste reguły (wielka litera w środku zdania, liczby, daty) — wystarczą jako antysygnał, nie muszą być dokładne |

## 9. Etapy
1. **MVP**: `shared/slop` (parser + reguły + score) z testami na fiksturach z raportu → content script + zwijanie + popup.
2. Popover z powodami, „To nie slop”, wyjątki autorów, wyłączanie rodzin.
3. OpenRouter (LLM + decyzyjny), cache, batching, limity, circuit breaker.
4. Komentarze (rodzina 4.14).
