// Smoke test w prawdziwym Chromium: ładuje zbudowane rozszerzenie (.output/chrome-mv3),
// podstawia makietę feedu (tests/fixtures/dom/feed.html) pod https://www.linkedin.com/feed/
// i sprawdza zwijanie, rozwijanie, „To nie slop”, zgłoszenie przez ⚑ i komentarze.
// Użycie: npm run build && npm run e2e [-- --screenshots <katalog>]
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSION = join(ROOT, '.output', 'chrome-mv3');
const FEED = readFileSync(join(ROOT, 'tests', 'fixtures', 'dom', 'feed.html'), 'utf8');
// Nowy DOM LinkedIn (SDUI): zaciemnione klasy, role=listitem, data-testid.
const FEED_SDUI = readFileSync(join(ROOT, 'tests', 'fixtures', 'dom', 'feed-sdui.html'), 'utf8');
const shotsArg = process.argv.indexOf('--screenshots');
const SHOTS = shotsArg > -1 ? process.argv[shotsArg + 1] : undefined;

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'ailiss-e2e-')), {
  headless: true,
  // Pełny Chromium (nowy tryb headless) — headless shell nie ładuje rozszerzeń.
  channel: 'chromium',
  args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  viewport: { width: 760, height: 1000 },
  deviceScaleFactor: SHOTS ? 2 : 1,
});

try {
  await context.route('https://www.linkedin.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: route.request().url().includes('sdui') ? FEED_SDUI : FEED,
    }),
  );
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  // Strona ustawień otwiera się po instalacji — zamykamy ją.
  await new Promise((r) => setTimeout(r, 500));
  for (const p of context.pages()) if (p.url().startsWith('chrome-extension://')) await p.close();

  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/feed/');
  // Przewiń, żeby IntersectionObserver zgłosił wszystkie posty.
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);

  const state = (urn) =>
    page.evaluate((u) => document.querySelector(`[data-urn="urn:li:activity:${u}"]`)?.getAttribute('data-ailiss-state') ?? 'none', urn);

  const expected = {
    1001: 'collapsed', // broetry (§4.2)
    1002: 'none', // ludzki: postmortem z godzinami
    1003: 'collapsed', // emoji-framework (§4.13)
    1004: 'none', // ludzki: test Copilota (§8.4 po)
    1005: 'collapsed', // korpo-kultura, sponsorowany
    1006: 'none', // krótki hot take — strefa niepewna (5/12)
    1007: 'collapsed', // repost antytezy (§4.3)
    1008: 'none', // ludzki: rekrutacja
  };
  for (const [urn, want] of Object.entries(expected)) {
    const got = await state(urn);
    check(`post ${urn}: ${want}`, got === want, `jest: ${got}`);
  }

  const bar = page.locator('[data-urn="urn:li:activity:1001"] .ailiss-host');
  const barText = (await bar.locator('.summary').innerText()).replace(/\s+/g, ' ');
  check('pasek: autor, rodzina i wynik', /Jan Kowalski · broetry · \d+\/12/.test(barText), barText);
  const height = await page.locator('[data-urn="urn:li:activity:1001"]').evaluate((el) => el.getBoundingClientRect().height);
  check('zwinięty post jest niski', height <= 40, `${Math.round(height)} px`);

  // Podgląd po najechaniu.
  await bar.hover();
  await page.waitForTimeout(400);
  const peek = page.locator('.ailiss-peek-host .pop');
  check('podgląd na hover', await peek.isVisible());
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'feed-collapsed.png') });

  // Pokaż → pasek narzędzi → To nie slop.
  await bar.getByRole('button', { name: 'Pokaż' }).click();
  check('Pokaż rozwija post', (await state(1001)) === 'expanded');
  if (SHOTS) await page.locator('[data-urn="urn:li:activity:1001"]').screenshot({ path: join(SHOTS, 'post-expanded.png') });
  await bar.getByRole('button', { name: 'To nie slop' }).click();
  await page.waitForTimeout(300);
  check('„To nie slop” zostawia post widoczny', (await state(1001)) === 'none');

  // Zgłoszenie ⚑ na niezwiniętym poście.
  const target = page.locator('[data-urn="urn:li:activity:1006"]');
  await target.hover();
  await target.locator('.ailiss-flag-host button.flag').click();
  const form = page.locator('.ailiss-report-form-host form');
  check('formularz zgłoszenia', await form.isVisible());
  const suggested = await form.locator('select').inputValue();
  check('rodzina podpowiedziana z heurystyki', suggested === 'hot-take', suggested);
  await form.locator('input[type="text"]').fill('zapowiedź kontrowersji bez treści');
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'report-form.png') });
  await form.getByRole('button', { name: 'Zgłoś i zwiń' }).click();
  await page.waitForTimeout(400);
  check('zgłoszony post jest zwinięty', (await state(1006)) === 'collapsed');
  check('pasek: zgłoszone przez Ciebie', (await target.locator('.ailiss-host .summary').innerText()).includes('zgłoszone przez Ciebie'));

  const reports = await worker.evaluate(async () => (await chrome.storage.local.get('reports')).reports ?? []);
  check('zgłoszenia w storage', reports.length === 2, reports.map((r) => `${r.label}/${r.family ?? '-'}`).join(', '));

  // Cofnij.
  await target.locator('.ailiss-host').getByRole('button', { name: 'Cofnij' }).click();
  await page.waitForTimeout(400);
  check('Cofnij przywraca post', (await state(1006)) === 'none');

  // Komentarze: włączamy w ustawieniach.
  await worker.evaluate(async () => {
    const { settings = {} } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, hideComments: true } });
  });
  await page.waitForTimeout(500);
  const commentStates = await page.evaluate(() =>
    [...document.querySelectorAll('article.comments-comment-entity')].map((c) => c.getAttribute('data-ailiss-state') ?? 'none'),
  );
  check('komentarz-slop zwinięty, merytoryczny nie', commentStates.join(',') === 'collapsed,none', commentStates.join(','));

  // OpenRouter (zamockowany): post 1006 (5/12, strefa niepewna) → tryb decyzyjny „SLOP” → 0.6·10 + 0.4·5 = 8 → zwinięty.
  let llmBody;
  await context.route('https://openrouter.ai/**', async (route) => {
    llmBody = route.request().postDataJSON();
    const ids = [...JSON.stringify(llmBody).matchAll(/post id=\\"(p\d+)\\"/g)].map((m) => m[1]);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ choices: [{ message: { content: ids.map((id) => `${id}: SLOP`).join('\n') } }] }),
    });
  });
  await worker.evaluate(async () => {
    const { settings = {} } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({
      openrouterKey: 'sk-or-test',
      settings: { ...settings, openrouter: { ...settings.openrouter, enabled: true, model: 'test/model', mode: 'decision' } },
    });
  });
  await page.waitForTimeout(1500);
  check('OpenRouter: niepewny post zwinięty po ocenie LLM', (await state(1006)) === 'collapsed');
  const llmBar = await target.locator('.ailiss-host .summary').innerText().catch(() => '');
  check('pasek pokazuje źródło LLM', llmBar.includes('LLM'), llmBar);
  check('do modelu nie trafia imię autora', Boolean(llmBody) && !JSON.stringify(llmBody).includes('Karol Mazur'));
  check('few-shot ze zgłoszeń w prompcie', JSON.stringify(llmBody ?? {}).includes('NIE SLOP'));
  const cacheSize = await worker.evaluate(async () => Object.keys((await chrome.storage.local.get('llmCache')).llmCache ?? {}).length);
  check('wynik LLM w cache', cacheSize >= 1, String(cacheSize));
  await worker.evaluate(async () => {
    const { settings = {} } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, openrouter: { ...settings.openrouter, enabled: false } } });
  });
  await page.waitForTimeout(400);

  // Czułość agresywna → krótki hot take (5/12) też się zwija.
  await worker.evaluate(async () => {
    const { settings = {} } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, sensitivity: 'aggressive' } });
  });
  await page.waitForTimeout(500);
  check('czułość agresywna zwija post 5/12', (await state(1006)) === 'collapsed');

  const stats = await worker.evaluate(async () => (await chrome.storage.local.get('stats')).stats);
  check('statystyki ukrytych', (stats?.hidden ?? 0) >= 4, JSON.stringify(stats?.byFamily ?? {}));

  // Nowy DOM LinkedIn (SDUI).
  const sdui = await context.newPage();
  await sdui.goto('https://www.linkedin.com/feed/?sdui=1');
  await sdui.waitForTimeout(800);
  const cards = sdui.locator('[role="listitem"][componentkey*="FeedType_"]');
  const sduiStates = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-ailiss-state') ?? 'none'));
  check('SDUI: post z konkretem widoczny, slop zwinięty', sduiStates.join(',') === 'none,collapsed', sduiStates.join(','));
  const sduiBar = await cards.nth(1).locator('.ailiss-host .summary').innerText().catch(() => '');
  check('SDUI: pasek z autorem i rodziną', sduiBar.includes('Coach Produktywności') && sduiBar.includes('emoji-framework'), sduiBar);
  const sduiHeight = await cards.nth(1).evaluate((el) => el.getBoundingClientRect().height);
  check('SDUI: zwinięta karta jest niska', sduiHeight <= 48, `${Math.round(sduiHeight)} px`);
  await cards.nth(0).hover();
  check('SDUI: ⚑ na hover', await cards.nth(0).locator('.ailiss-flag-host button.flag').isVisible());
  if (SHOTS) await sdui.screenshot({ path: join(SHOTS, 'feed-sdui.png') });
  await sdui.close();

  // Popup i ustawienia renderują się bez błędów.
  const extId = new URL(worker.url()).host;
  const errors = [];
  for (const path of ['popup.html', 'options.html']) {
    const p = await context.newPage();
    p.on('pageerror', (e) => errors.push(`${path}: ${e.message}`));
    await p.goto(`chrome-extension://${extId}/${path}`);
    await p.waitForTimeout(500);
    if (SHOTS) await p.screenshot({ path: join(SHOTS, path.replace('.html', '.png')), fullPage: true });
    await p.close();
  }
  check('popup i ustawienia bez błędów JS', errors.length === 0, errors.join('; '));
} finally {
  await context.close();
}

console.log(failures ? `\n${failures} niepowodzeń` : '\nWszystko OK');
process.exit(failures ? 1 : 0);
