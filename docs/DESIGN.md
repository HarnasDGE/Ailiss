# Ailiss — projekt wtyczki Chrome ukrywającej AI slop na LinkedIn

## 1. Cel i zasady

- Wykrywa posty w feedzie LinkedIn, które wyglądają na generowany „AI slop”, i **zwija** je do cienkiego, mało widocznego paska z możliwością podglądu/rozwinięcia.
- Klasyfikacja **lokalnie** przez wbudowany w Chrome model (Prompt API / Gemini Nano).
- Fallback: **OpenRouter** (model LLM lub tani model „decyzyjny”), a na końcu **heurystyka** bez modelu.
- Nic nie jest usuwane z DOM — tylko ukrywane klasą CSS (LinkedIn to React + wirtualizacja listy; usuwanie węzłów psuje feed).
- Wywołania API wyłącznie z service workera (nigdy z content scriptu), klucz API nie trafia do kontekstu strony.

## 2. Architektura

```
┌──────────────── linkedin.com (content script) ────────────────┐
│ observer ─► extract ─► heurystyka (natychmiast) ─► UI (zwiń)  │
│     │                                   ▲                      │
│     └── chrome.runtime.sendMessage ─────┼──────────────────────┘
│                                         │ wynik
┌─────────────── service worker (background) ───────────────────┐
│ router ─► cache ─► queue ─► pipeline ─► provider               │
│                              │  1. chrome-ai (Gemini Nano)    │
│                              │  2. openrouter (LLM/decyzyjny) │
│                              │  3. heuristic (zawsze dostępny)│
│                              └─ circuit breaker per provider  │
└───────────────────────────────────────────────────────────────┘
        offscreen document — host dla Prompt API, jeśli
        `LanguageModel` nie jest dostępny w service workerze
```

### Przepływ dla jednego posta
1. `MutationObserver` wykrywa nowy post, `IntersectionObserver` zgłasza go dopiero, gdy jest ~1,5 ekranu od widoku (nie klasyfikujemy całego feedu na zapas).
2. `extract` pobiera: URN posta, autora, pełny tekst (także ukryty za „…więcej”), typ (oryginalny / repost / sponsorowany), liczbę emoji/hashtagów.
3. Heurystyka liczy wynik w <1 ms. Jeśli ≥ progu „pewnego slopu” (np. 90) — zwijamy od razu, bez migania.
4. Wiadomość `CLASSIFY` do service workera → cache (klucz: URN + hash tekstu, TTL 7 dni) → kolejka → provider.
5. Wynik końcowy: `final = 0.7 * llm + 0.3 * heurystyka` (gdy brak LLM: sama heurystyka). Zwinięcie, jeśli `final ≥ próg`.

## 3. Silniki klasyfikacji

### 3.1 Chrome Built-in AI (domyślny)
- API: `LanguageModel.availability()` → `available | downloadable | downloading | unavailable`.
- `downloadable`: na stronie ustawień przycisk „Pobierz model lokalny” (pobranie wymaga gestu użytkownika), postęp z `monitor` → `downloadprogress`.
- Jedna sesja bazowa z promptem systemowym, dla każdego posta `session.clone()` — kontekst nie rośnie.
- `session.prompt(tekst, { responseConstraint: JSON_SCHEMA })` — wymuszony JSON.
- Współbieżność 1 (Nano jest ciężki), timeout 15 s.
- **Ograniczenia**: wymagania sprzętowe (dysk, GPU/RAM), oficjalnie wspierane tylko wybrane języki wejścia (en/es/ja). Dla postów PL: próbujemy, ale jeśli `create()` z danym językiem rzuca błąd albo jakość jest słaba → routing do OpenRoutera lub heurystyki (ustawienie „język → silnik”).

### 3.2 OpenRouter (fallback lub wybór ręczny)
- `POST https://openrouter.ai/api/v1/chat/completions`, `Authorization: Bearer <key>`, z service workera (`host_permissions`).
- Dwa tryby:
  - **LLM** — zwraca JSON `{score, verdict, signals[], reason}`; `response_format: json_schema` tam, gdzie model wspiera, inaczej parsowanie + walidacja.
  - **Decyzyjny** — tani/mały model, odpowiedź jednym tokenem `SLOP` / `OK` (`max_tokens: 3`, `temperature: 0`); jeśli model zwraca `logprobs` → z nich wynik 0–100. Taniej i szybciej, bez uzasadnienia.
- **Batching**: do 5 postów w jednym żądaniu (tablica JSON) — mniej kosztów i żądań.
- Lista modeli pobierana z `GET /api/v1/models` w ustawieniach (wybór z listy, z ceną).
- Limit dzienny żądań/kosztu, po przekroczeniu → heurystyka.
- Prywatność: wysyłamy tylko tekst posta (bez imion, linków, komentarzy), obcięty do ~1500 znaków. Klucz w `chrome.storage.local` (nie `sync`).

### 3.3 Heurystyka (zawsze aktywna)
- Pre-filtr (natychmiastowe zwijanie oczywistych przypadków, oszczędność wywołań LLM) i ostatni fallback.
- Reguły w `src/shared/signals/` (osobno `en.ts`, `pl.ts`) — **tu wchodzi research** o wyglądzie AI slopu.
- Przykładowe sygnały (wagi do strojenia na fiksturach):
  - „broetry” — większość linii to jedno zdanie, puste linie między nimi,
  - hook w 1. linii + pusta linia, zakończenie pytaniem-zaczepką („Agree?”, „Co o tym myślicie? 👇”),
  - emoji jako punktory (🚀 ✅ 👉 💡 🔥), ♻️ „Repost”, P.S.,
  - konstrukcja „To nie jest X. To jest Y.” / „It's not X. It's Y.”,
  - frazy: „In today's fast-paced world”, „game-changer”, „Let that sink in”, „delve”, „Here's the thing”, „W dzisiejszym dynamicznym świecie”, „Kluczem jest…”, „Oto 5 rzeczy, których…”,
  - duża gęstość pauz „—”, listy po 3 elementy, „X lekcji, których nauczyło mnie…”,
  - ściana hashtagów na końcu.
- Wynik = suma wag znormalizowana do 0–100 + lista kodów sygnałów (pokazywana w podglądzie).

### 3.4 Wybór silnika i odporność
- Kolejność konfigurowalna (domyślnie: Chrome AI → OpenRouter → heurystyka).
- Circuit breaker: 3 błędy/timeouty z rzędu → provider wyłączony na 10 min, ruch idzie do następnego.
- Health-check przy starcie i przy zmianie ustawień; status widoczny w popupie.

## 4. Prompt (wspólny dla LLM)

```
Jesteś klasyfikatorem postów z LinkedIn. Oceń, czy post to "AI slop":
generyczna, masowo generowana treść bez własnego doświadczenia autora,
z typowymi wzorcami (lista sygnałów z signals). Nie oceniasz tematu ani
poglądów — tylko styl i autentyczność. Ludzki, konkretny post z
emoji to NIE slop.
Zwróć JSON: {"score":0-100,"verdict":"slop|human|uncertain",
"signals":["broetry","hook",...],"reason":"max 12 słów"}
```
Kody sygnałów są wspólne z heurystyką → spójny podgląd w UI.

## 5. UI

### 5.1 Zwinięty post (w feedzie)
Pasek ~28 px, kolory tła LinkedIn, tekst w odcieniu szarości (niski kontrast, ale czytelny), bez ikon alarmowych:

```
┌─────────────────────────────────────────────────────────────┐
│ ⌄  Ukryto · Jan Kowalski · prawd. AI (87%)          Pokaż  │
└─────────────────────────────────────────────────────────────┘
```
- **Hover** (lub klik w „⌄”): popover z pierwszymi ~2 liniami posta i powodami („broetry · hook · pytanie-zaczepka”).
- **Pokaż**: rozwija post w miejscu; nad nim mała belka „Zwiń · To nie slop · Zawsze ukrywaj tego autora”.
- „To nie slop” → zapis do listy wyjątków (URN posta + opcjonalnie autor) i do lokalnych statystyk do strojenia wag.
- Implementacja: post dostaje `data-ailiss="collapsed"`, CSS ukrywa jego dzieci poza paskiem; pasek w **Shadow DOM** (izolacja od stylów LinkedIn). Wygląd dopasowany do motywu jasny/ciemny LinkedIn.
- Tryby do wyboru: **zwiń** (domyślnie) / **przyciemnij** (opacity 0.35, rozjaśnia na hover) / **tylko oznacz** (mała etykieta).

### 5.2 Popup (ikona rozszerzenia)
- Przełącznik włącz/wyłącz, „Ukryto dziś: 23”.
- Aktywny silnik + status (🟢 Gemini Nano lokalnie / 🟡 OpenRouter / ⚪ heurystyka).
- Suwak czułości: Łagodny (próg 85) · Normalny (70) · Agresywny (55).

### 5.3 Strona ustawień
- Silniki: kolejność, status Chrome AI, przycisk pobrania modelu, test połączenia.
- OpenRouter: klucz, model z listy, tryb LLM/decyzyjny, limit dzienny.
- Zachowanie: tryb ukrywania, czy pomijać posty sponsorowane / reposty / posty osób z sieci 1. stopnia.
- Wyjątki: lista autorów zawsze pokazywanych / zawsze ukrywanych.
- Prywatność: wyczyść cache, eksport/import ustawień (bez klucza).

## 6. Struktura projektu

Stack: TypeScript + Manifest V3 + [WXT](https://wxt.dev) (build, HMR, generowanie manifestu). Alternatywa: Vite + `@crxjs/vite-plugin`.

```
ailiss/
├─ docs/
│  └─ DESIGN.md
├─ src/
│  ├─ entrypoints/
│  │  ├─ background.ts              # service worker: rejestracja routera
│  │  ├─ linkedin.content.ts        # content script dla *.linkedin.com/feed*
│  │  ├─ offscreen/                 # host Prompt API (gdy brak w SW)
│  │  ├─ popup/
│  │  └─ options/
│  ├─ background/
│  │  ├─ router.ts                  # obsługa wiadomości
│  │  ├─ cache.ts                   # IndexedDB, TTL
│  │  ├─ queue.ts                   # współbieżność, batching, limity
│  │  ├─ circuit-breaker.ts
│  │  └─ classifier/
│  │     ├─ pipeline.ts             # wybór providera, łączenie wyników
│  │     ├─ prompt.ts
│  │     ├─ schema.ts               # JSON schema odpowiedzi + walidacja
│  │     └─ providers/
│  │        ├─ provider.types.ts    # interfejs ClassifierProvider
│  │        ├─ chrome-ai.provider.ts
│  │        ├─ openrouter.provider.ts
│  │        └─ heuristic.provider.ts
│  ├─ content/
│  │  ├─ linkedin/
│  │  │  ├─ selectors.ts            # selektory z fallbackami (LinkedIn często zmienia klasy)
│  │  │  ├─ extract-post.ts
│  │  │  └─ feed-observer.ts
│  │  └─ ui/
│  │     ├─ collapse-bar.ts         # Shadow DOM
│  │     ├─ peek-popover.ts
│  │     └─ collapse.css
│  └─ shared/
│     ├─ messages.ts                # typy wiadomości SW <-> content
│     ├─ settings.ts                # schemat + domyślne ustawienia, storage
│     ├─ types.ts                   # Post, ClassificationResult
│     └─ signals/
│        ├─ index.ts                # kody sygnałów + wagi
│        ├─ en.ts
│        └─ pl.ts
├─ tests/
│  ├─ fixtures/posts/               # przykładowe posty: slop / human (z researchu)
│  ├─ heuristic.test.ts
│  └─ extract-post.test.ts          # na zapisanych snapshotach DOM LinkedIn
├─ wxt.config.ts
└─ package.json
```

### Kluczowe typy
```ts
interface ClassifierProvider {
  id: 'chrome-ai' | 'openrouter' | 'heuristic';
  isAvailable(): Promise<boolean>;
  classify(posts: PostInput[]): Promise<ClassificationResult[]>;
}

interface ClassificationResult {
  urn: string;
  score: number;            // 0–100
  verdict: 'slop' | 'human' | 'uncertain';
  signals: SignalCode[];
  reason?: string;
  provider: ClassifierProvider['id'];
}
```

## 7. Manifest (szkic)
- `permissions`: `storage`, `offscreen`
- `host_permissions`: `https://www.linkedin.com/*`, `https://openrouter.ai/*`
- content script: `https://www.linkedin.com/*` (SPA — observer działa na całej domenie, aktywny tylko na feedzie/profilach)
- brak `<all_urls>`, brak zdalnego kodu.

## 8. Ryzyka
| Ryzyko | Mitygacja |
|---|---|
| LinkedIn zmienia DOM | selektory z fallbackami w jednym pliku, testy na snapshotach, atrybuty `data-urn` zamiast klas |
| Gemini Nano słabo radzi sobie z PL / niedostępny sprzętowo | routing wg języka, fallback OpenRouter/heurystyka |
| Fałszywe pozytywy | domyślnie „zwiń”, nie „usuń”; „To nie slop”; wyjątki dla autorów; strojenie wag na fiksturach |
| Koszt OpenRouter | heurystyka jako pre-filtr, cache, batching, limit dzienny, tryb decyzyjny |
| Miganie feedu | natychmiastowa heurystyka dla oczywistych przypadków, LLM tylko doprecyzowuje |

## 9. Etapy
1. **MVP**: content script + ekstrakcja + heurystyka + zwijanie + popup.
2. Chrome AI provider + strona ustawień + pobieranie modelu.
3. OpenRouter (LLM + decyzyjny), batching, limity, circuit breaker.
4. Feedback „To nie slop”, wyjątki autorów, strojenie wag na fiksturach z researchu.
