import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { loadCatalog } from '../scripts/catalog-data.mjs';
import { filterPoems, placeCounts } from '../src/catalog.mjs';

const port = 43817;
const base = `http://127.0.0.1:${port}/ai-poems/`;
let server, browser;
const poems = await loadCatalog();
const totalText = `${poems.length} poems found`;
before(async () => {
  server = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Preview server did not start')), 5000);
    server.stdout.on('data', () => { clearTimeout(timeout); resolve(); });
    server.on('exit', code => { clearTimeout(timeout); reject(new Error(`Preview server exited: ${code}`)); });
  });
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
});
after(async () => { await browser?.close(); server?.kill(); });

test('search, filters, shelf and history work across page loads', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const hero = page.waitForResponse(response => response.url().endsWith('/assets/verso-garden.webp'));
  await page.goto(base);
  assert.equal((await hero).status(), 200);
  await page.getByText(totalText).waitFor();
  await page.getByRole('link', { name: /Chinese poetry/ }).click();
  const chineseCount = filterPoems(poems, { language: 'Chinese' }).length;
  await page.getByText(`${chineseCount} poems found`).waitFor();
  assert.equal(await page.getByLabel('Original language').inputValue(), 'Chinese');
  await page.getByRole('button', { name: 'Clear all' }).click();
  await page.getByLabel('Search the poetry library').fill('Cultivo una rosa blanca');
  await page.getByText('1 poem found').waitFor();
  assert.equal(await page.locator('#results').getByText('José Martí').count(), 1);
  await page.getByRole('button', { name: 'Clear all' }).click();
  await page.getByLabel('Original language').selectOption('Arabic');
  await page.getByText(`${filterPoems(poems, { language: 'Arabic' }).length} ${filterPoems(poems, { language: 'Arabic' }).length === 1 ? 'poem' : 'poems'} found`).waitFor();
  assert.ok(await page.locator('#results .card-excerpt[lang="ar"][dir="rtl"]').count() >= 1);
  await page.getByRole('button', { name: 'Clear all' }).click();
  await page.goto(`${base}poems/shakespeare-sonnet-18/`);
  await page.getByRole('button', { name: /Save poem/ }).click();
  assert.equal(await page.getByRole('button', { name: /Saved to your shelf/ }).getAttribute('aria-pressed'), 'true');
  await page.getByLabel('Reading theme').selectOption('sepia');
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'sepia');
  assert.equal(await page.locator('#shelf-items').getByText('Sonnet 18').count(), 1);
  assert.equal(await page.locator('#recent-items').getByText('Sonnet 18').count(), 1);
  await page.reload();
  await page.getByText(totalText).waitFor();
  assert.equal(await page.locator('#shelf-items').getByText('Sonnet 18').count(), 1);
  await context.close();
});

test('shareable filters survive the reader and surprise respects the current results', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedSearchLink = text; } } }));
  const page = await context.newPage();
  await page.goto(`${base}?language=Portuguese&sort=title#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'Portuguese' }).length} poems found`).waitFor();
  const search = page.getByLabel('Search the poetry library');
  await search.fill('Florbela');
  await page.getByText('32 poems found').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('q'), 'Florbela');
  await page.getByRole('button', { name: 'Copy search link' }).click();
  await page.getByRole('status').getByText('Search link copied.').waitFor();
  const copied = new URL(await page.evaluate(() => window.copiedSearchLink));
  assert.equal(copied.searchParams.get('language'), 'Portuguese');
  assert.equal(copied.searchParams.get('q'), 'Florbela');
  assert.equal(copied.hash, '#explore');
  // Hold the reader module to exercise the static fallback before hydration.
  let releaseReaderScript;
  const readerScriptGate = new Promise(resolve => { releaseReaderScript = resolve; });
  await page.route('**/app.mjs', async route => { await readerScriptGate; await route.continue(); });
  const returnLink = page.getByRole('link', { name: 'Back to the library' });
  try {
    await page.locator('#results .poem-card-link').first().click({ noWaitAfter: true });
    await page.waitForURL('**/poems/**', { waitUntil: 'commit' });
    await returnLink.waitFor({ state: 'attached' });
    assert.equal(await returnLink.getAttribute('href'), '/ai-poems/#explore');
  } finally {
    releaseReaderScript();
  }
  await page.waitForFunction(() => {
    const link = document.querySelector('[data-back-to-library]');
    if (!link) return false;
    const params = new URL(link.href).searchParams;
    return params.get('language') === 'Portuguese' && params.get('q') === 'Florbela' && params.get('sort') === 'title';
  });
  await page.unroute('**/app.mjs');
  await returnLink.click();
  await page.getByText('32 poems found').waitFor();
  assert.equal(await search.inputValue(), 'Florbela');
  assert.equal(await page.getByLabel('Original language').inputValue(), 'Portuguese');
  assert.equal(await page.getByLabel('Sort').inputValue(), 'title');
  await page.getByRole('button', { name: /Surprise me/ }).click();
  await page.waitForURL('**/poems/**');
  const id = await page.locator('body').getAttribute('data-poem-id');
  assert.equal(poems.find(p => p.id === id).author, 'Florbela Espanca');
  await context.close();
});

test('mobile filters collapse, empty searches disable surprise, and translation credits remain visible', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  assert.equal(await page.locator('#filter-drawer').getAttribute('open'), null);
  await page.locator('#filter-summary').click();
  await page.getByLabel('Original language').selectOption('Arabic');
  await page.getByText('1 poem found').waitFor();
  assert.equal(await page.locator('#filter-summary').textContent(), 'Filters (1 active)');
  await page.getByLabel('Search the poetry library').fill('nothing-matches-this-phrase');
  await page.getByText('0 poems found').waitFor();
  assert.equal(await page.getByRole('button', { name: /Surprise me/ }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: /Show more poems/ }).isVisible(), false);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.goto(`${base}poems/baudelaire-la-muse-venale/`);
  await page.getByRole('button', { name: 'Side by side' }).click();
  await page.locator('#translation-panel').getByText(/F\. P\. Sturm/).waitFor();
  assert.equal(await page.locator('#original-panel').isVisible(), true);
  assert.equal(await page.locator('#translation-panel').isVisible(), true);
  await context.close();
});

test('country flags and counts link to the matching country results', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  const section = page.locator('#countries');
  const count = placeCounts(poems).find(item => item.place === 'United States').count;
  const card = section.getByRole('link', { name: new RegExp(`^United States ${count} poems$`) });
  assert.equal(await card.locator('.country-flag img').getAttribute('src'), '/ai-poems/assets/flags/us.svg');
  assert.equal(await card.locator('.country-flag img').getAttribute('alt'), '');
  await section.locator('.more-countries summary').click();
  assert.equal(await section.getByRole('link', { name: /Not established/ }).locator('.country-flag').textContent(), '⌁');
  assert.equal(await section.getByRole('link', { name: /Arabian Peninsula/ }).locator('.country-flag').textContent(), '⌁');
  const flags = await section.locator('.country-flag img').evaluateAll(async images => {
    return Promise.all(images.map(async image => {
      image.loading = 'eager';
      await image.decode();
      return { src: new URL(image.src).pathname, width: image.naturalWidth };
    }));
  });
  assert.deepEqual(flags.map(flag => flag.src.split('/').pop()).sort(), ['cn.svg', 'cu.svg', 'es.svg', 'fr.svg', 'gb-eng.svg', 'it.svg', 'jm.svg', 'jp.svg', 'pt.svg', 'us.svg', 've.svg']);
  assert.ok(flags.every(flag => flag.src.startsWith('/ai-poems/assets/flags/') && flag.width > 0));
  await card.click();
  await page.getByText(`${count} poems found`).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('country'), 'United States');
  await page.locator('#filter-summary').click();
  assert.equal(await page.getByRole('combobox', { name: 'Country or region', exact: true }).inputValue(), 'United States');
  assert.ok(filterPoems(poems, { country: 'United States' }).some(p => p.author === 'Claude McKay'));
  await page.getByRole('button', { name: 'Remove Country or region: United States filter' }).click();
  await page.getByText(totalText).waitFor();
  assert.equal(new URL(page.url()).searchParams.has('country'), false);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.setViewportSize({ width: 320, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();
});

test('length filters and search journeys work on mobile', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?country=Italy&length=5-14#explore`);
  const shortCount = filterPoems(poems, { country: 'Italy', length: '5-14' }).length;
  await page.getByText(`${shortCount} ${shortCount === 1 ? 'poem' : 'poems'} found`).waitFor();
  assert.equal(await page.locator('#results').getByText('La ricordanza').count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Remove Length: 5–14 lines filter' }).count(), 1);
  await page.getByRole('button', { name: 'Remove Length: 5–14 lines filter' }).click();
  const count = filterPoems(poems, { country: 'Italy' }).length;
  await page.getByText(`${count} poems found`).waitFor();
  await page.locator('#results .poem-card-link').first().click();
  await page.getByText(`Poem 1 of ${count} in your search`).waitFor();
  assert.equal(await page.locator('[data-journey-previous]').isVisible(), false);
  await page.getByRole('link', { name: /Next poem/ }).click();
  await page.getByText(`Poem 2 of ${count} in your search`).waitFor();
  assert.equal(await page.locator('[data-journey-previous]').isVisible(), true);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), []);
  await page.getByRole('link', { name: 'Back to results ↗' }).click();
  await page.getByText(`${count} poems found`).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('country'), 'Italy');
  await context.close();
});

test('clearing the shelf requires an explicit confirmation', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}poems/shakespeare-sonnet-18/`);
  await page.getByRole('button', { name: /Save poem/ }).click();
  await page.goto(`${base}#shelf`);
  await page.getByText(totalText).waitFor();
  const shelf = page.locator('#shelf-items');
  assert.equal(await shelf.getByText('Sonnet 18').count(), 1);
  const confirm = page.getByRole('button', { name: 'Yes, clear saved poems' });
  assert.equal(await confirm.isVisible(), false);
  await page.getByText('Clear saved poems', { exact: true }).click();
  assert.equal(await shelf.getByText('Sonnet 18').count(), 1);
  await confirm.click();
  assert.equal(await shelf.getByText('Sonnet 18').count(), 0);
  assert.equal(await page.getByText('Clear saved poems', { exact: true }).evaluate(element => element === document.activeElement), true);
  await context.close();
});

test('reader switches languages and shows provenance and RTL text', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let catalogueRequests = 0;
  page.on('request', request => { if (request.url().endsWith('/data/catalog.json')) catalogueRequests++; });
  await page.goto(`${base}poems/quiet-night-thought-li-bai/`);
  await page.locator('#translation-select').selectOption({ label: 'Arabic' });
  assert.equal(await page.getByLabel('Preferred reading language', { exact: true }).inputValue(), '');
  await page.getByText('AI-assisted, not yet independently reviewed', { exact: false }).first().waitFor();
  assert.equal(await page.locator('#translation-panel .verse').getAttribute('dir'), 'rtl');
  await page.getByRole('button', { name: 'Side by side' }).click();
  assert.equal(await page.locator('#original-panel').isVisible(), true);
  assert.equal(await page.locator('#translation-panel').isVisible(), true);
  assert.equal(await page.locator('#original-panel .verse').getAttribute('lang'), 'zh-Hant');
  assert.equal(catalogueRequests, 0, 'reader does not download the whole catalogue');
  const relatedSave = page.locator('.related-section [data-save]').first();
  const relatedId = await relatedSave.getAttribute('data-save');
  await relatedSave.click();
  assert.equal(await relatedSave.getAttribute('aria-pressed'), 'true');
  assert.match(await relatedSave.getAttribute('aria-label'), /Remove from shelf/);
  assert.ok(poems.some(p => p.id === relatedId));
  await context.close();
});

test('mobile focus mode keeps reading controls and provenance, persists, and is easy to exit', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}poems/quiet-night-thought-li-bai/`);
  await page.getByLabel('Reading theme').selectOption('dark');
  const focus = page.getByRole('button', { name: 'Focus mode' });
  await focus.click();
  const exitFocus = page.getByRole('button', { name: 'Exit focus mode' });
  assert.equal(await exitFocus.isVisible(), true);
  assert.equal(await page.locator('.site-header').isVisible(), false);
  assert.equal(await page.locator('.story').isVisible(), false);
  assert.equal(await page.locator('.source-note').isVisible(), true);
  assert.equal(await page.locator('#original-panel .verse').isVisible(), true);
  assert.equal(await page.getByText('Li Bai', { exact: true }).first().isVisible(), true);
  await page.getByLabel('Preferred reading language in focus mode').selectOption({ label: 'Arabic' });
  await page.getByRole('button', { name: 'Side by side' }).click();
  assert.equal(await page.locator('#translation-panel .verse').getAttribute('dir'), 'rtl');
  assert.equal(await page.locator('#translation-panel .translation-rights').isVisible(), true);
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.getByLabel('Focus theme').selectOption('sepia');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'sepia');
  await page.getByLabel('Focus theme').selectOption('dark');
  await page.locator('.source-note').scrollIntoViewIfNeeded();
  const bounds = await exitFocus.boundingBox();
  assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 844);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  for (const theme of ['light', 'sepia', 'dark']) {
    await page.getByLabel('Focus theme').selectOption(theme);
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], `focus / ${theme}`);
  }
  await page.reload();
  await page.getByRole('button', { name: 'Exit focus mode' }).waitFor();
  assert.equal(await page.locator('.site-header').isVisible(), false);
  await page.goto(`${base}poems/old-pond-basho/`);
  await page.getByRole('button', { name: 'Exit focus mode' }).waitFor();
  assert.equal(await page.locator('#original-panel .verse').isVisible(), true);
  await exitFocus.focus();
  await page.keyboard.press('Space');
  assert.equal(await focus.isVisible(), true);
  assert.equal(await page.locator('.site-header').isVisible(), true);
  assert.equal(await page.locator('.story').isVisible(), true);
  await context.close();
});

test('preferred language finds originals and translations and explains missing ones', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  const preferred = page.getByLabel('Preferred reading language', { exact: true });
  assert.equal(await preferred.inputValue(), '');
  await preferred.selectOption('English');
  const button = page.getByRole('button', { name: 'Show poems available in English' });
  await button.click();
  const count = filterPoems(poems, { readable: 'English' }).length;
  await page.getByText(`${count} poems found`).waitFor();
  assert.equal(await page.locator('#readable-note').isVisible(), true);
  assert.equal(new URL(page.url()).searchParams.get('readable'), 'English');
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), []);
  await preferred.selectOption('Portuguese');
  const portuguese = filterPoems(poems, { readable: 'Portuguese' }).length;
  await page.getByText(`${portuguese} poems found`).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('readable'), 'Portuguese');
  await preferred.selectOption('English');
  await page.getByText(`${count} poems found`).waitFor();
  await page.goto(`${base}poems/leopardi-ricordanza/`);
  await page.locator('#translation-panel').getByText(/Frederick Townsend/).waitFor();
  assert.equal(await page.locator('#original-panel .verse').isVisible(), true);
  assert.equal(await preferred.inputValue(), 'English');
  await preferred.selectOption('Japanese');
  await page.getByText('No Japanese translation is available.', { exact: false }).waitFor();
  assert.equal(await page.locator('#original-panel .verse').isVisible(), true);
  assert.equal(await page.locator('#translation-panel').isVisible(), false);
  await page.getByRole('button', { name: 'Focus mode' }).click();
  await page.getByLabel('Preferred reading language in focus mode').selectOption('English');
  await page.locator('#translation-panel').getByText(/Frederick Townsend/).waitFor();
  assert.equal(await page.locator('#original-panel .verse').isVisible(), true);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.reload();
  await page.locator('#translation-panel').getByText(/Frederick Townsend/).waitFor();
  assert.equal(await page.getByLabel('Preferred reading language in focus mode').inputValue(), 'English');
  await context.close();
});

test('a shared available-language link works without changing the reader preference', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}?readable=Arabic#explore`);
  const count = filterPoems(poems, { readable: 'Arabic' }).length;
  await page.getByText(`${count} poems found`).waitFor();
  assert.equal(await page.getByLabel('Preferred reading language', { exact: true }).inputValue(), '');
  assert.equal(await page.getByRole('button', { name: 'Remove Available in: Arabic filter' }).isVisible(), true);
  assert.equal(await page.locator('#readable-note').isVisible(), true);
  await page.getByLabel('Preferred reading language', { exact: true }).selectOption('Portuguese');
  assert.equal(new URL(page.url()).searchParams.get('readable'), 'Arabic');
  assert.equal(await page.getByText(`${count} poems found`).isVisible(), true);
  await page.getByLabel('Preferred reading language', { exact: true }).selectOption('');
  assert.equal(new URL(page.url()).searchParams.get('readable'), 'Arabic');
  await context.close();
});

test('focus mode can choose a translation without changing the preferred language', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${base}poems/quiet-night-thought-li-bai/`);
  await page.getByRole('button', { name: 'Focus mode' }).click();
  await page.getByLabel('Translation language', { exact: true }).selectOption({ label: 'Arabic' });
  assert.equal(await page.locator('#translation-panel .verse').getAttribute('dir'), 'rtl');
  assert.equal(await page.getByLabel('Preferred reading language in focus mode').inputValue(), '');
  for (const width of [320, 390, 701, 768, 900, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => {
      const toolbar = document.querySelector('.reading-toolbar').getBoundingClientRect();
      const options = document.querySelector('.reading-options').getBoundingClientRect();
      return document.documentElement.scrollWidth <= innerWidth + 1 && options.right <= toolbar.right + 1;
    }), `focus controls fit at ${width}px`);
  }
  await page.reload();
  await page.getByRole('button', { name: 'Exit focus mode' }).waitFor();
  assert.equal(await page.getByLabel('Preferred reading language in focus mode').inputValue(), '');
  assert.equal(await page.getByLabel('Translation language', { exact: true }).inputValue(), '6');
  assert.equal(await page.locator('#original-panel').isVisible(), true);
  await context.close();
});

test('existing saved translation settings do not silently enable a preferred language', async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('verso-library-v1', JSON.stringify({ language: 'Arabic', saved: [], recent: [] })));
  const page = await context.newPage();
  await page.goto(`${base}poems/quiet-night-thought-li-bai/`);
  await page.getByRole('button', { name: 'Focus mode' }).waitFor();
  assert.equal(await page.getByLabel('Preferred reading language', { exact: true }).inputValue(), '');
  assert.equal(await page.locator('#original-panel .verse').isVisible(), true);
  assert.equal(await page.locator('#translation-panel').isVisible(), false);
  assert.equal(await page.locator('#translation-select').inputValue(), '6');
  await context.close();
});

test('expanded catalogue supports multilingual and native-name searches', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  const search = page.getByLabel('Search the poetry library');
  await search.fill('杜甫');
  await page.locator('#results').getByText('Du Fu').first().waitFor();
  await search.fill('Florbela Espanca');
  await page.locator('#results').getByText('Florbela Espanca').first().waitFor();
  await search.fill('If we must die');
  await page.locator('#results').getByText('Claude McKay').first().waitFor();
  await page.goto(`${base}poems/american-1922-00659/`);
  assert.equal(await page.locator('#original-panel .verse').getAttribute('lang'), 'en');
  assert.ok(await page.getByText('Pressed to the wall, dying, but—fighting back!', { exact: false }).count());
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();
});

test('mobile layout fits and static poems remain readable without JavaScript', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const page = await context.newPage();
  const response = await page.goto(`${base}poems/old-pond-basho/`);
  assert.equal(response.status(), 200);
  assert.equal(await page.getByText('古池や蛙とびこむ水の音').count(), 1);
  assert.equal(await page.getByText('Lafcadio Hearn, 1898').count(), 1);
  assert.equal(await page.locator('#reading-journey').isVisible(), false);
  assert.equal(await page.locator('#focus-toggle').isVisible(), false);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.goto(base);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.equal(await page.getByLabel('Preferred reading language', { exact: true }).isDisabled(), true);
  assert.equal(await page.getByText(`Browse the complete poetry index (${poems.length})`).count(), 1);
  await context.close();
});

test('blocked browser storage does not falsely claim a durable save', async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } }));
  const page = await context.newPage();
  await page.goto(`${base}poems/shakespeare-sonnet-18/`);
  await page.getByRole('button', { name: /Save poem/ }).click();
  await page.getByRole('status').getByText(/lasts only for this visit/).waitFor();
  await page.getByLabel('Preferred reading language', { exact: true }).selectOption('Portuguese');
  await page.getByRole('status').getByText(/Language preference is available for this visit only/).waitFor();
  await page.getByRole('button', { name: 'Focus mode' }).click();
  assert.equal(await page.getByRole('button', { name: 'Exit focus mode' }).isVisible(), true);
  await page.getByRole('status').getByText(/Focus preference is available for this visit only/).waitFor();
  await context.close();
});

test('blocked session storage keeps the reader and filtered return link usable', async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Storage blocked'); } }));
  const page = await context.newPage();
  await page.goto(`${base}?country=Italy#explore`);
  const count = filterPoems(poems, { country: 'Italy' }).length;
  await page.getByText(`${count} poems found`).waitFor();
  await page.locator('#results .poem-card-link').first().click();
  await page.waitForFunction(() => new URL(document.querySelector('[data-back-to-library]').href).searchParams.get('country') === 'Italy');
  assert.equal(await page.locator('#reading-journey').isVisible(), false);
  assert.equal(await page.locator('#original-panel .verse').isVisible(), true);
  await page.getByRole('link', { name: 'Back to the library' }).click();
  await page.getByText(`${count} poems found`).waitFor();
  await context.close();
});

test('home and reader pass automated WCAG checks in each theme', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  for (const path of ['', 'poems/quiet-night-thought-li-bai/']) {
    await page.goto(`${base}${path}`);
    if (!path) await page.getByText(totalText).waitFor();
    for (const theme of ['light', 'sepia', 'dark']) {
      await page.getByLabel('Reading theme').selectOption(theme);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      assert.deepEqual(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], `${path || 'home'} / ${theme}`);
    }
  }
  await context.close();
});
