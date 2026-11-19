# Ailiss — projekt wtyczki Chrome ukrywającej AI slop na LinkedIn

Źródło wiedzy o wzorcach: [`docs/research/ai-slop-linkedin.md`](research/ai-slop-linkedin.md) (dalej: *raport*).

## 1. Cel i zasady

- Wykrywa posty w feedzie LinkedIn, które są „AI slopem”, i **zwija** je do cienkiego, mało widocznego paska z podglądem i rozwinięciem.
- Dwa silniki:
  1. **Heurystyka** (domyślna, lokalna, darmowa, natychmiastowa) — implementacja testu 0–12 i banków sygnatur z raportu.
  2. **OpenRouter** (opcjonalny) — LLM lub tani model „decyzyjny”, wołany tylko dla przypadków niepewnych (albo dla wszystkich, jeśli użytkownik tak ustawi).
- **Zgłoszenia użytkownika** (§6) — posty oznaczone ręcznie jako slop / „nie slop” tworzą lokalny zbiór przykładów: kontekst (few-shot) dla LLM, wykrywanie kopii i szablonów, sygnały autora i własne frazy.
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
│ router ─► cache (storage.local) ─► queue (batch 5, limity) ─► openrouter│
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

Po prompcie systemowym — blok **przykładów ze zgłoszeń użytkownika** (few-shot, §6.3), jeśli użytkownik włączył tę opcję.

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

### 5.3 Przycisk zgłoszenia na niezwiniętym poście
Mała ikona `⚑` w prawym górnym rogu karty, widoczna tylko na hover (opacity 0 → 0.6), w Shadow DOM. Szczegóły w §6.

### 5.4 Popup
- Włącz/wyłącz, „Ukryto dziś: 23” (+ podział na rodziny).
- Status silnika: 🟢 heurystyka · 🟢/🔴 OpenRouter (z liczbą żądań dziś / limit).
- Czułość: Łagodny · Normalny · Agresywny.

### 5.5 Ustawienia
- OpenRouter: klucz, test połączenia, model, tryb LLM/decyzyjny, zakres (tylko niepewne / wszystkie), limit dzienny, „używaj zgłoszeń jako kontekstu”.
- **Zgłoszenia**: lista (etykieta, rodzina, fragment, data), edycja, usuwanie, filtr, eksport/import JSON; lista własnych fraz.
- Zachowanie: tryb ukrywania, komentarze tak/nie, pomijanie postów sponsorowanych / repostów / 1. stopnia sieci.
- Rodziny: możliwość wyłączenia wybranych (np. ktoś nie chce chować `announcement`).
- Wyjątki autorów, czyszczenie cache, eksport/import ustawień (bez klucza).

## 6. Zgłaszanie postów (dane użytkownika jako kontekst)

### 6.1 Skąd biorą się zgłoszenia
| Akcja | Etykieta |
|---|---|
| `⚑` na niezwiniętym poście (hover) → „Zgłoś jako slop” | `slop` |
| Prawy klik na poście → menu kontekstowe „Ailiss: zgłoś jako slop” | `slop` |
| „To nie slop” na zwiniętym poście | `human` |
| Zaznaczenie fragmentu → menu kontekstowe „Ailiss: dodaj frazę jako sygnał” | własna fraza (§6.4) |

Po kliknięciu `⚑` — mini-formularz w popoverze (wszystko opcjonalne, domyślnie wystarczy jeden klik):
```
┌ Zgłoś jako slop ───────────────────────────┐
│ Rodzina:  [broetry ▾]   (podpowiedź z heurystyki) │
│ Notatka:  [ hook o dziecku, zero konkretu ] │
│ [ ] Ukrywaj więcej od tego autora           │
│                      Anuluj   Zgłoś i zwiń  │
└────────────────────────────────────────────┘
```
Po zgłoszeniu post od razu się zwija (`Ukryto · zgłoszone przez Ciebie`), z możliwością cofnięcia.

### 6.2 Model danych (`chrome.storage.local`, wyłącznie lokalnie)
```ts
interface UserReport {
  id: string;
  postUrn: string;
  textHash: string;            // do deduplikacji
  text: string;                // obcięty do 2000 znaków, bez imienia autora
  label: 'slop' | 'human';
  family?: SlopFamily;
  note?: string;
  authorId?: string;           // tylko gdy zaznaczono „ukrywaj autora”
  heuristic: { score: number; signals: string[] };  // stan w chwili zgłoszenia
  shingles: number[];          // MinHash 3-gramów słów, do podobieństwa
  createdAt: number;
}

interface UserPhrase { id: string; phrase: string; lang: 'en' | 'pl' | 'any'; weight: number; family?: SlopFamily }
```
Limit 500 zgłoszeń (najstarsze `slop` wypadają pierwsze; `human` trzymane dłużej, bo są rzadsze i cenniejsze).

### 6.3 Jak zgłoszenia są używane
1. **Few-shot dla LLM** — przy każdym batchu wybierane jest do 4 przykładów: 2–3 `slop` + 1–2 `human`, najpierw z tej samej rodziny co wynik heurystyki, potem najbardziej podobne (Jaccard na MinHash). Każdy przykład obcięty do ~600 znaków, z etykietą i notatką użytkownika. Opcja wyłączalna; przykłady wysyłane bez danych autora.
2. **Wykrywanie kopii i szablonów** (działa też bez OpenRoutera) — podobieństwo ≥ 0,6 do zgłoszonego `slop` → +3 do wyniku i rodzina ze zgłoszenia. Łapie ten sam szablon publikowany przez wiele kont. Podobieństwo do zgłoszonego `human` → −3.
3. **Sygnał autora** — „ukrywaj więcej od tego autora” → +2 do wyniku jego postów (nie zwija automatycznie wszystkiego; od tego jest „Zawsze ukrywaj autora”).
4. **Własne frazy** — trafiają do reguł heurystyki jako `SignalRule` z wagą 1 (edytowalną).
5. **Kalibracja wag** — lokalna statystyka: które reguły trafiają w zgłoszenia `slop`, a które w `human`. Po ≥ 20 zgłoszeniach wagi reguł korygowane automatycznie w granicach ±50% wartości domyślnej; reset jednym przyciskiem.

### 6.4 Eksport / import
- JSON zgodny z formatem fiksturek (`tests/fixtures/posts/*.json`, tablica `posts`) — zgłoszenia można przenieść do testów i stroić domyślne reguły na prawdziwych postach.
- Import cudzego zestawu (np. od znajomego) z deduplikacją po `textHash`.

## 7. Struktura projektu

Stack: TypeScript + Manifest V3 + [WXT](https://wxt.dev). Testy: Vitest (+ happy-dom), smoke test: Playwright.

```
ailiss/
├─ docs/
│  ├─ DESIGN.md
│  └─ research/ai-slop-linkedin.md      # raport — źródło reguł i fiksturek
├─ public/icon/                         # ikony (npm run icons)
├─ scripts/
│  ├─ generate-icons.mjs
│  └─ e2e-smoke.mjs                     # Chromium + rozszerzenie + makieta feedu
├─ src/
│  ├─ entrypoints/
│  │  ├─ background.ts                  # service worker
│  │  ├─ linkedin.content.ts            # content script
│  │  ├─ popup/                         # index.html, main.ts, style.css
│  │  └─ options/                       # index.html, main.ts, style.css
│  ├─ background/
│  │  ├─ router.ts                      # obsługa wiadomości
│  │  ├─ llm-service.ts                 # cache → limity → bezpiecznik → kolejka → OpenRouter
│  │  ├─ cache.ts                       # oceny LLM, TTL 7 dni, max 1000
│  │  ├─ queue.ts                       # batching (5 postów / 400 ms), max 2 równolegle
│  │  ├─ circuit-breaker.ts
│  │  ├─ stats.ts
│  │  ├─ context-menu.ts                # „zgłoś jako slop”, „dodaj frazę”
│  │  ├─ openrouter/
│  │  │  ├─ client.ts                   # chat/completions, models, key
│  │  │  ├─ prompt.ts                   # stałe z shared/slop + few-shot ze zgłoszeń
│  │  │  ├─ response-schema.ts          # JSON schema + parsowanie (LLM i decyzyjny)
│  │  │  └─ classify.ts
│  │  └─ reports/
│  │     ├─ reports-store.ts            # zgłoszenia, frazy, autorzy (zapisy serializowane)
│  │     ├─ select-examples.ts          # dobór few-shot
│  │     ├─ calibrate-weights.ts        # korekta wag reguł ±50%
│  │     └─ export-import.ts
│  ├─ content/
│  │  ├─ content-store.ts               # ustawienia + kontekst użytkownika ze storage
│  │  ├─ post-controller.ts             # cykl życia posta/komentarza
│  │  ├─ decide.ts                      # progi, łączenie wyników, priorytety
│  │  ├─ linkedin/
│  │  │  ├─ selectors.ts                # selektory z fallbackami, data-urn
│  │  │  ├─ extract-text.ts             # tekst z <br>, bez „…więcej” i visually-hidden
│  │  │  ├─ extract-post.ts
│  │  │  ├─ extract-comment.ts
│  │  │  └─ feed-observer.ts
│  │  └─ ui/
│  │     ├─ page-style.ts               # jedyny CSS wstrzykiwany do strony
│  │     ├─ theme.ts                    # tokeny, jasny/ciemny motyw, Shadow DOM
│  │     ├─ collapse-bar.ts
│  │     ├─ peek-popover.ts
│  │     └─ report-button.ts            # ⚑ + mini-formularz
│  ├─ options/                          # sekcje strony ustawień
│  ├─ ui/base.css                       # wspólny styl popupu i ustawień
│  └─ shared/
│     ├─ messages.ts                    # typowane wiadomości SW <-> UI
│     ├─ settings.ts                    # ustawienia, progi
│     ├─ storage.ts                     # klucze i odczyt chrome.storage.local
│     ├─ types.ts
│     ├─ dom.ts
│     └─ slop/                          # cała wiedza z raportu
│        ├─ families.ts                 # 14 rodzin (UI i prompt)
│        ├─ test-items.ts               # 12 pytań testu (UI i prompt)
│        ├─ parse-post.ts               # ParsedPost: akapity, zdania, encje
│        ├─ regex.ts                    # unicode'owa granica słowa (\b nie działa z „ł”, „ę”)
│        ├─ score.ts                    # silnik heurystyki + reguły użytkownika
│        ├─ similarity.ts               # MinHash 3-gramów, Jaccard, textHash
│        ├─ comment.ts                  # komentarz-slop
│        └─ rules/
│           ├─ structure.ts             # §6 (hook, broetry, listy, emoji, hashtagi, rytm)
│           ├─ family-phrases.ts        # otwarcia i frazy rodzin (§4, §5.1, §5.5)
│           ├─ closers.ts               # §5.2 + PL
│           ├─ vocabulary.ts            # §5.3, §5.5
│           ├─ constructions.ts         # §5.4 (antyteza, anafora, przysłowia, triady)
│           └─ substance.ts             # antysygnały (konkret)
└─ tests/
   ├─ fixtures/
   │  ├─ posts/report-examples.json     # wszystkie przykłady z raportu (§4, §8, §9)
   │  ├─ posts/extra-human.json         # dodatkowe ludzkie posty (kontrola fałszywych pozytywów)
   │  └─ dom/feed.html                  # makieta feedu LinkedIn
   └─ *.test.ts                         # score, comment, similarity, extract-post, decide, background
```

### Odstępstwa od pierwotnego projektu
- **`chrome.storage.local` zamiast IndexedDB** — content script nie ma dostępu do IndexedDB rozszerzenia, a storage.local czyta bezpośrednio i dostaje zdarzenia `onChanged`. Zapisy danych użytkownika robi tylko service worker; klucz API leży pod osobnym kluczem, którego content script nie czyta.
- **Skala heurystyki**: surowe punkty × 1,5 (heurystyka widzi 9 z 12 pytań). Klaster = ≥ 3 grupy sygnałów **albo** ≥ 2 grupy + brak konkretu + ≥ 4 sygnały; bez klastra wynik ≤ 6.
- **LLM** odpowiada na 11 pytań (bez #12), wynik przeskalowany do 0–12.
- **Formularz zgłoszenia** renderowany w osobnym hoście w `<body>` (nie dziedziczy przezroczystości ikony, nie jest ucinany przez kartę).

### Kryteria akceptacji heurystyki (testy na fiksturach) — spełnione
- ≥ 90% pełnych przykładów z §4 ma wynik ≥ 7 (jest 21/22; wyjątek: 3-linijkowy „Unpopular opinion … I said what I said.” = 5).
- Skrócone warianty (§8 „przed”, wariant §4.5) — co najmniej strefa niepewna (≥ 4).
- 100% wersji „po” z §8 i dodatkowych ludzkich postów ma wynik < 4 (najwyższy: 2).
- Każdy przykład z §4 dostaje poprawną rodzinę (dla 2 przykładów, które raport sam łączy — antyteza w „AI won’t replace you” — dopuszczona rodzina alternatywna).

## 8. Manifest (szkic)
- `permissions`: `storage`, `contextMenus`
- `host_permissions`: `https://www.linkedin.com/*`, `https://openrouter.ai/*` (to drugie jako `optional_host_permissions`, prośba dopiero po włączeniu OpenRoutera)
- brak `<all_urls>`, brak zdalnego kodu.

## 9. Ryzyka

| Ryzyko | Mitygacja |
|---|---|
| Fałszywe pozytywy (ludzki post w stylu broetry) | zasada klastra, antysygnały konkretu, domyślnie „zwiń” a nie „usuń”, „To nie slop”, wyłączanie rodzin |
| Slop bez fraz z banku (model omija słowa kluczowe) | reguły strukturalne (rytm, akapity, brak encji) + LLM dla strefy 4–6 |
| LinkedIn zmienia DOM | selektory w jednym pliku, `data-urn`, testy na snapshotach |
| Koszt OpenRouter | tylko strefa niepewna, cache, batching, limit, tryb decyzyjny |
| Zgłoszenia zawężają filtr do gustu jednej osoby / błędne zgłoszenia | granice korekty wag ±50%, reset, edycja i cofanie zgłoszeń, przykłady `human` w few-shot |
| Wykrywanie nazw własnych w PL/EN bez NLP | proste reguły (wielka litera w środku zdania, liczby, daty) — wystarczą jako antysygnał, nie muszą być dokładne |

## 10. Etapy
1. **MVP**: `shared/slop` (parser + reguły + score) z testami na fiksturach z raportu → content script + zwijanie + popup.
2. Popover z powodami, „To nie slop”, wyjątki autorów, wyłączanie rodzin, **zgłaszanie postów** (⚑, menu kontekstowe, magazyn, wykrywanie kopii, własne frazy, eksport/import).
3. OpenRouter (LLM + decyzyjny), cache, batching, limity, circuit breaker, few-shot ze zgłoszeń.
4. Kalibracja wag ze zgłoszeń.
5. Komentarze (rodzina 4.14).
