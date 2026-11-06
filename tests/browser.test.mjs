import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { loadCatalog } from '../scripts/catalog-data.mjs';
import { filterPoems, placeCounts } from '../src/catalog.mjs';

const port = 43817;
const base = `http://127.0.0.1:${port}/ai-poems/`;
let server, browser;
const poems = await loadCatalog();
const feedUpdates = JSON.parse(await readFile(new URL('../content/updates.json', import.meta.url), 'utf8'));
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
  await page.getByRole('status').getByText('Theme saved.').waitFor();
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
  assert.equal(await page.locator('#advanced-filters').getAttribute('open'), '');
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

test('returning from an expanded search restores the list and focuses the poem', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=English&sort=title#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'English' }).length} poems found`).waitFor();
  await page.getByRole('button', { name: /Show more poems/ }).click();
  const link = page.locator('#results .poem-card-link').nth(8);
  const href = await link.getAttribute('href');
  await link.focus();
  await page.keyboard.press('Enter');
  await page.getByText(/Poem 9 of .* in your search/).waitFor();
  await page.reload();
  await page.getByText(/Poem 9 of .* in your search/).waitFor();
  await page.getByRole('link', { name: 'Back to the library' }).click();
  await page.getByText(`${filterPoems(poems, { language: 'English' }).length} poems found`).waitFor();
  const restored = page.locator('#results .poem-card-link').nth(8);
  assert.equal(await page.locator('#results .poem-card').count(), 16);
  assert.equal(await restored.getAttribute('href'), href);
  assert.equal(await restored.evaluate(element => element === document.activeElement), true);
  assert.equal(await restored.evaluate(element => { const box = element.getBoundingClientRect(); return box.top < innerHeight && box.bottom > 0; }), true);
  assert.equal(new URL(page.url()).searchParams.get('sort'), 'title');
  assert.equal(new URL(page.url()).searchParams.get('language'), 'English');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), []);
  await context.close();
});

test('returning after moving beyond expanded results reveals the last poem read', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=English#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'English' }).length} poems found`).waitFor();
  await page.getByRole('button', { name: /Show more poems/ }).click();
  await page.locator('#results .poem-card-link').nth(15).click();
  await page.getByText(/Poem 16 of .* in your search/).waitFor();
  await page.getByRole('link', { name: /Next poem/ }).click();
  await page.getByText(/Poem 17 of .* in your search/).waitFor();
  const id = await page.locator('body').getAttribute('data-poem-id');
  await page.getByRole('link', { name: 'Back to results ↗' }).click();
  await page.getByText(`${filterPoems(poems, { language: 'English' }).length} poems found`).waitFor();
  assert.equal(await page.locator('#results .poem-card').count(), 24);
  const restored = page.locator('#results .poem-card-link').nth(16);
  assert.equal(await restored.getAttribute('href'), `/ai-poems/poems/${id}/`);
  assert.equal(await restored.evaluate(element => element === document.activeElement), true);
  await context.close();
});

test('a distant surprise returns to the loaded results without rendering the entire catalogue', async () => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.addInitScript(() => { Math.random = () => 0.999999; });
  const page = await context.newPage();
  await page.goto(`${base}?language=English#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'English' }).length} poems found`).waitFor();
  await page.getByRole('button', { name: /Show more poems/ }).click();
  await page.getByRole('button', { name: /Surprise me/ }).click();
  await page.locator('#reading-journey').waitFor();
  assert.ok(await page.evaluate(() => {
    const journey = JSON.parse(sessionStorage.getItem('verso-reading-journey-v1'));
    return journey.items.findIndex(item => item.id === journey.resumeId) >= 16;
  }));
  await page.getByRole('link', { name: 'Back to the library' }).click();
  await page.getByRole('status').getByText(/surprise poem is beyond the loaded results/).waitFor();
  assert.equal(await page.locator('#results .poem-card').count(), 16);
  assert.equal(await page.getByRole('button', { name: /Surprise me/ }).evaluate(element => element === document.activeElement), true);
  await context.close();
});

test('browser history restores the matching expanded search without affecting direct links', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=English#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'English' }).length} poems found`).waitFor();
  await page.getByRole('button', { name: /Show more poems/ }).click();
  const href = await page.locator('#results .poem-card-link').nth(8).getAttribute('href');
  await page.locator('#results .poem-card-link').nth(8).click();
  await page.getByText(/Poem 9 of .* in your search/).waitFor();
  await page.goBack();
  await page.waitForFunction(() => document.querySelectorAll('#results .poem-card').length === 16);
  assert.equal(await page.locator('#results .poem-card-link').nth(8).getAttribute('href'), href);
  await page.waitForFunction(() => document.activeElement === document.querySelectorAll('#results .poem-card-link')[8]);
  assert.equal(await page.locator('#results .poem-card-link').nth(8).evaluate(element => { const box = element.getBoundingClientRect(); return box.top < innerHeight && box.bottom > 0; }), true);
  await page.goForward();
  await page.locator('#original-panel .verse').waitFor();
  await page.goBack();
  await page.waitForFunction(() => document.querySelectorAll('#results .poem-card').length === 16);
  const other = await browser.newContext();
  const direct = await other.newPage();
  await direct.goto(`${base}?language=English#explore`);
  await direct.getByText(`${filterPoems(poems, { language: 'English' }).length} poems found`).waitFor();
  assert.equal(await direct.locator('#results .poem-card').count(), 8);
  await other.close();
  await context.close();
});

test('a direct poem visit does not reuse a previously completed search journey', async () => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=English#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'English' }).length} poems found`).waitFor();
  await page.getByRole('button', { name: /Show more poems/ }).click();
  const href = await page.locator('#results .poem-card-link').nth(8).getAttribute('href');
  await page.locator('#results .poem-card-link').nth(8).click();
  await page.getByText(/Poem 9 of .* in your search/).waitFor();
  await page.getByRole('link', { name: 'Back to the library' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#results .poem-card').length === 16);
  const referrer = page.url();
  await page.goto(new URL(href, base).href, { referer: referrer });
  await page.getByRole('button', { name: 'Focus mode' }).waitFor();
  assert.equal(await page.locator('#reading-journey').isVisible(), false);
  await page.getByRole('link', { name: 'Back to the library' }).click();
  await page.getByText(`${filterPoems(poems, { language: 'English' }).length} poems found`).waitFor();
  assert.equal(await page.locator('#results .poem-card').count(), 8);
  await context.close();
});

test('browser Back through a reading journey returns to the poem last viewed', async () => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=English#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'English' }).length} poems found`).waitFor();
  await page.getByRole('button', { name: /Show more poems/ }).click();
  const href = await page.locator('#results .poem-card-link').nth(8).getAttribute('href');
  await page.locator('#results .poem-card-link').nth(8).click();
  await page.getByText(/Poem 9 of .* in your search/).waitFor();
  await page.getByRole('link', { name: /Next poem/ }).click();
  await page.getByText(/Poem 10 of .* in your search/).waitFor();
  await page.goBack();
  await page.getByText(/Poem 9 of .* in your search/).waitFor();
  await page.goBack();
  await page.waitForFunction(() => document.querySelectorAll('#results .poem-card').length === 16);
  const restored = page.locator('#results .poem-card-link').nth(8);
  assert.equal(await restored.getAttribute('href'), href);
  await page.waitForFunction(() => document.activeElement === document.querySelectorAll('#results .poem-card-link')[8]);
  await context.close();
});

test('blocked session storage falls back to the first results without breaking navigation', async () => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Storage blocked'); } }));
  const page = await context.newPage();
  await page.goto(`${base}?language=English#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'English' }).length} poems found`).waitFor();
  await page.getByRole('button', { name: /Show more poems/ }).click();
  await page.locator('#results .poem-card-link').nth(8).click();
  await page.waitForFunction(() => new URL(document.querySelector('[data-back-to-library]').href).searchParams.get('language') === 'English');
  assert.equal(await page.locator('#reading-journey').isVisible(), false);
  await page.getByRole('link', { name: 'Back to the library' }).click();
  await page.getByText(`${filterPoems(poems, { language: 'English' }).length} poems found`).waitFor();
  assert.equal(await page.locator('#results .poem-card').count(), 8);
  await context.close();
});

test('mismatched and malformed journeys do not expand or focus stale results', async () => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=English#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'English' }).length} poems found`).waitFor();
  await page.getByRole('button', { name: /Show more poems/ }).click();
  await page.locator('#results .poem-card-link').nth(8).click();
  await page.getByText(/Poem 9 of .* in your search/).waitFor();
  const reader = page.url();
  await page.goto(`${base}?language=Portuguese#explore`, { referer: reader });
  await page.getByText(`${filterPoems(poems, { language: 'Portuguese' }).length} poems found`).waitFor();
  assert.equal(await page.locator('#results .poem-card').count(), 8);
  await page.goto(`${base}?language=English#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'English' }).length} poems found`).waitFor();
  await page.getByRole('button', { name: /Show more poems/ }).click();
  await page.locator('#results .poem-card-link').nth(8).click();
  await page.getByText(/Poem 9 of .* in your search/).waitFor();
  await page.evaluate(() => {
    const journey = JSON.parse(sessionStorage.getItem('verso-reading-journey-v1'));
    journey.limit = Number.MAX_SAFE_INTEGER;
    sessionStorage.setItem('verso-reading-journey-v1', JSON.stringify(journey));
  });
  await page.getByRole('link', { name: 'Back to the library' }).click();
  await page.getByText(`${filterPoems(poems, { language: 'English' }).length} poems found`).waitFor();
  assert.equal(await page.locator('#results .poem-card').count(), 8);
  assert.equal(await page.locator('#results .poem-card-link').first().evaluate(element => element === document.activeElement), false);
  await page.goto(`${base}?language=Portuguese#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'Portuguese' }).length} poems found`).waitFor();
  assert.equal(await page.locator('#results .poem-card').count(), 8);
  await context.close();
});

test('clearing the shelf requires an explicit confirmation', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}poems/shakespeare-sonnet-18/`);
  await page.getByRole('button', { name: /Save poem/ }).click();
  await page.getByRole('status').getByText('Saved to your shelf.').waitFor();
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

test('typeface choice persists, scales and remains available in focus mode across scripts', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}poems/shakespeare-sonnet-18/`);
  const typeface = page.getByLabel('Poem typeface');
  const verse = page.locator('#original-panel .verse');
  await page.locator('.typeface-control summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.typeface-control').getAttribute('open'), '');
  assert.equal(await typeface.inputValue(), 'literary');
  assert.match(await verse.evaluate(element => getComputedStyle(element).fontFamily), /Cormorant/);
  await typeface.selectOption('clear');
  assert.match(await verse.evaluate(element => getComputedStyle(element).fontFamily), /DM Sans/);
  const size = await verse.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  await page.getByRole('button', { name: 'A+ Increase poem text size' }).click();
  assert.ok(await verse.evaluate(element => parseFloat(getComputedStyle(element).fontSize)) > size);
  await page.getByRole('button', { name: 'Focus mode' }).click();
  assert.equal(await typeface.isVisible(), true);
  await page.reload();
  await page.getByRole('button', { name: 'Exit focus mode' }).waitFor();
  assert.equal(await typeface.inputValue(), 'clear');
  await page.goto(`${base}poems/quiet-night-thought-li-bai/`);
  await page.getByRole('button', { name: 'Exit focus mode' }).waitFor();
  assert.equal(await typeface.inputValue(), 'clear');
  assert.match(await verse.evaluate(element => getComputedStyle(element).fontFamily), /PingFang TC/);
  await page.getByLabel('Translation language').selectOption({ label: 'Arabic' });
  const translated = page.locator('#translation-panel .verse');
  assert.equal(await translated.getAttribute('dir'), 'rtl');
  assert.match(await translated.evaluate(element => getComputedStyle(element).fontFamily), /Geeza Pro/);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), []);
  for (const width of [320, 390, 701, 768, 900, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => {
      const toolbar = document.querySelector('.reading-toolbar').getBoundingClientRect();
      const options = document.querySelector('.reading-options').getBoundingClientRect();
      return document.documentElement.scrollWidth <= innerWidth + 1 && options.right <= toolbar.right + 1;
    }), `typeface controls fit at ${width}px`);
  }
  await context.close();
});

test('mobile navigation has clear, keyboard-accessible targets', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base);
  const links = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link');
  assert.deepEqual(await links.allTextContents(), ['Explore', 'Collections', 'Countries', 'Poets', 'My shelf ']);
  const boxes = await links.evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, width: box.width, height: box.height };
  }));
  assert.ok(boxes.every(box => box.width >= 44 && box.height >= 44));
  assert.ok(boxes.every((box, index) => !index || box.left >= boxes[index - 1].right));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const collections = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Collections' });
  await collections.focus();
  await page.keyboard.press('Enter');
  assert.equal(new URL(page.url()).hash, '#collections');
  assert.equal(await page.locator('#collections').isVisible(), true);
  await page.evaluate(() => localStorage.setItem('verso-library-v1', JSON.stringify({ saved: ['test-one'] })));
  await page.goto(base);
  await page.getByText('1', { exact: true }).waitFor();
  const oneSavedTops = await links.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top));
  assert.equal(new Set(oneSavedTops).size, 1, 'one saved poem keeps navigation on one row');
  await page.evaluate(() => localStorage.setItem('verso-library-v1', JSON.stringify({ saved: Array.from({ length: 1000 }, (_, index) => `test-${index}`) })));
  await page.goto(base);
  await page.getByText('1000', { exact: true }).waitFor();
  const savedBoxes = await links.evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
  }));
  assert.ok(savedBoxes.every(box => box.width >= 44 && box.height >= 44 && box.right <= 320));
  assert.ok(savedBoxes.every((box, index) => savedBoxes.slice(0, index).every(other => box.left >= other.right || box.top >= other.bottom)));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();
});

test('interaction motion is subtle and stops for reduced-motion preferences', async () => {
  for (const reducedMotion of ['reduce', 'no-preference']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 844 }, reducedMotion });
    const page = await context.newPage();
    await page.goto(base);
    const link = page.locator('.hero-text-link');
    await link.hover();
    const arrow = link.locator('span');
    const duration = await arrow.evaluate(element => getComputedStyle(element).transitionDuration);
    if (reducedMotion === 'reduce') {
      assert.equal(duration, '0s');
      assert.equal(await arrow.evaluate(element => getComputedStyle(element).transform), 'none');
      const card = page.locator('.collection-card').first();
      await card.hover();
      assert.equal(await card.evaluate(element => getComputedStyle(element).transform), 'none');
    } else {
      assert.notEqual(duration, '0s');
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.hero-text-link span')).transform !== 'none');
    }
    await context.close();
  }
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
  await page.getByRole('status').getByText('Language preference saved.').waitFor();
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
  await page.getByRole('status').getByText('Language preference saved.').waitFor();
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
  assert.equal(await page.getByLabel('Poem typeface').inputValue(), 'literary');
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
  assert.equal(await page.getByLabel('Poem typeface').isDisabled(), true);
  assert.equal(await page.locator('.typeface-control').isVisible(), false);
  assert.equal(await page.locator('#reading-journey').isVisible(), false);
  assert.equal(await page.locator('#focus-toggle').isVisible(), false);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.goto(base);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.equal(await page.getByLabel('Preferred reading language', { exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('link', { name: 'RSS updates ↗' }).getAttribute('href'), '/ai-poems/feed.xml');
  assert.equal(await page.getByText(`Browse the complete poetry index (${poems.length})`).count(), 1);
  assert.equal(await page.getByRole('link', { name: 'complete index' }).first().getAttribute('href'), '#complete-index');
  await page.locator('.poet-directory summary').click();
  assert.equal(await page.locator('.poet-directory').getAttribute('open'), '');
  assert.equal(await page.locator('.poet-directory').getByText(/Poet filters need JavaScript/).isVisible(), true);
  await context.close();
});

test('homepage uses progressive discovery without breaking filters or poet links', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  assert.deepEqual(await page.locator('.page-wrap > section').evaluateAll(sections => sections.map(section => section.id)), ['collections', 'explore', 'countries', 'poets', 'shelf']);
  assert.equal(await page.locator('#results .poem-card').count(), 8);
  await page.getByRole('button', { name: /Show more poems/ }).click();
  assert.equal(await page.locator('#results .poem-card').count(), 16);
  await page.locator('#filter-summary').click();
  assert.equal(await page.locator('#advanced-filters').getAttribute('open'), null);
  assert.equal(await page.getByLabel('Original language').isVisible(), true);
  assert.equal(await page.getByLabel('Poem length').isVisible(), false);
  await page.locator('#advanced-filters summary').focus();
  await page.keyboard.press('Enter');
  await page.setViewportSize({ width: 320, height: 844 });
  assert.equal(await page.locator('.advanced-filter-fields').evaluate(element => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length), 1);
  const filtersA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  assert.deepEqual(filtersA11y.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), []);
  await page.getByLabel('Poem length').selectOption('1-4');
  assert.equal(new URL(page.url()).searchParams.get('length'), '1-4');
  const short = filterPoems(poems, { length: '1-4' }).length;
  await page.getByText(`${short} poems found`).waitFor();
  await page.reload();
  await page.getByText(`${short} poems found`).waitFor();
  assert.equal(await page.locator('#advanced-filters').getAttribute('open'), '');
  await page.locator('#filter-summary').click();
  assert.equal(await page.getByLabel('Poem length').inputValue(), '1-4');
  await page.getByRole('button', { name: 'Clear all' }).click();
  await page.getByText(totalText).waitFor();
  const directory = page.locator('.poet-directory');
  assert.equal(await directory.getAttribute('open'), null);
  await directory.locator('summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await directory.getAttribute('open'), '');
  const directoryA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  assert.deepEqual(directoryA11y.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), []);
  await directory.locator('[data-author="Giacomo Leopardi"]').click();
  const leopardi = filterPoems(poems, { author: 'Giacomo Leopardi' }).length;
  await page.getByText(`${leopardi} poems found`).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('author'), 'Giacomo Leopardi');
  await page.goto(base);
  await page.getByRole('link', { name: /Black American voices/ }).click();
  const anthology = filterPoems(poems, { collection: 'The Book of American Negro Poetry' }).length;
  await page.getByText(`${anthology} poems found`).waitFor();
  assert.equal(await page.locator('#advanced-filters').getAttribute('open'), '');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();
});

test('editorial paths lead to short poems and the sourced edition sequence', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base);
  const paths = page.getByRole('navigation', { name: 'Suggested reading paths' });
  const short = filterPoems(poems, { length: '1-4' }).length;
  assert.equal(await paths.getByText(`${short.toLocaleString('en-US')} poems · lines in the original`).isVisible(), true);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), []);
  const shortLink = paths.getByRole('link', { name: /Poems in 1–4 lines/ });
  await shortLink.focus();
  await page.keyboard.press('Enter');
  await page.getByText(`${short} poems found`).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('length'), '1-4');
  assert.equal(await page.locator('#advanced-filters').getAttribute('open'), '');
  await page.goto(base);
  await paths.getByRole('link', { name: /Three Leopardi idylls/ }).click();
  assert.equal(await page.locator('body').getAttribute('data-poem-id'), 'linfinito-leopardi');
  const connections = page.locator('.connections-section');
  await connections.getByText(/edition sequence, not a claim of influence/).waitFor();
  await connections.getByRole('link', { name: /La sera del giorno festivo/ }).click();
  assert.equal(await page.locator('body').getAttribute('data-poem-id'), 'leopardi-sera-giorno-festivo');
  await connections.getByRole('link', { name: /La ricordanza/ }).click();
  assert.equal(await page.locator('body').getAttribute('data-poem-id'), 'leopardi-ricordanza');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();
});

test('the edition path remains readable without JavaScript', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(base);
  assert.equal(await page.getByText(/Short-poem filtering needs JavaScript/).isVisible(), true);
  await page.getByRole('link', { name: /Three Leopardi idylls/ }).click();
  assert.equal(await page.locator('#original-panel .verse').isVisible(), true);
  assert.equal(await page.locator('.connections-section').getByRole('link', { name: /La sera del giorno festivo/ }).count(), 1);
  await context.close();
});

test('the real catalogue total is visible near the entry point without JavaScript', async () => {
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const total = `${poems.length.toLocaleString('en-US')} poems`;
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(base);
    const count = page.locator('.hero-copy strong');
    assert.equal(await count.textContent(), total);
    const box = await count.boundingBox();
    assert.ok(box && box.y >= 0 && box.y + box.height <= 844, `hero total in viewport at ${width}px`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.match(await page.locator('#countries .country-note').textContent(), /Some works appear under more than one place/);
  }
  await context.close();
});

test('RSS is discoverable and parses as a feed of real, dated poem updates', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base);
  const alternate = page.locator('head link[rel="alternate"][type="application/rss+xml"]');
  assert.equal(await alternate.getAttribute('href'), '/ai-poems/feed.xml');
  assert.equal(await page.getByRole('link', { name: 'RSS updates ↗' }).getAttribute('href'), '/ai-poems/feed.xml');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const response = await page.request.get(`${base}feed.xml`);
  assert.equal(response.status(), 200);
  const parsed = await page.evaluate(text => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const items = [...doc.querySelectorAll('channel > item')].map(item => ({
      title: item.querySelector('title')?.textContent,
      link: item.querySelector('link')?.textContent,
      guid: item.querySelector('guid')?.textContent,
      isPermaLink: item.querySelector('guid')?.getAttribute('isPermaLink'),
      date: item.querySelector('pubDate')?.textContent,
      description: item.querySelector('description')?.textContent,
    }));
    const self = doc.getElementsByTagNameNS('http://www.w3.org/2005/Atom', 'link')[0];
    return { errors: doc.getElementsByTagName('parsererror').length, version: doc.documentElement.getAttribute('version'), self: self?.getAttribute('href'), items };
  }, await response.text());
  assert.equal(parsed.errors, 0);
  assert.equal(parsed.version, '2.0');
  assert.equal(parsed.self, 'https://dmoliveira.github.io/ai-poems/feed.xml');
  assert.equal(parsed.items.length, feedUpdates.length);
  assert.equal(new Set(parsed.items.map(item => item.guid)).size, parsed.items.length);
  assert.deepEqual(parsed.items.map(item => Date.parse(item.date)), parsed.items.map(item => Date.parse(item.date)).toSorted((a, b) => b - a));
  for (const item of parsed.items) {
    const update = feedUpdates.find(entry => item.guid === `verso:${entry.id}`);
    assert.ok(update);
    assert.equal(item.title, update.title);
    assert.equal(item.description, update.description);
    assert.equal(item.isPermaLink, 'false');
    assert.equal(item.date, new Date(update.publishedAt).toUTCString());
    const path = new URL(item.link).pathname;
    assert.match(path, /^\/ai-poems\/poems\/[a-z0-9-]+\/$/);
    assert.equal(path, `/ai-poems/poems/${update.poemId}/`);
    assert.equal((await page.request.get(`${base}${path.slice('/ai-poems/'.length)}`)).status(), 200);
  }
  await page.goto(`${base}poems/leopardi-ricordanza/`);
  assert.equal(await alternate.getAttribute('href'), '/ai-poems/feed.xml');
  await context.close();
});

test('blocked browser storage does not falsely claim a durable save', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } }));
  const page = await context.newPage();
  await page.clock.install();
  await page.goto(`${base}poems/quiet-night-thought-li-bai/`);
  const warning = page.locator('main > .storage-warning');
  await warning.getByText(/This page will not overwrite it/).waitFor();
  await page.getByRole('button', { name: /Save poem/ }).click();
  await page.getByRole('status').getByText(/Added to the shelf on this page only/).waitFor();
  await page.getByLabel('Preferred reading language', { exact: true }).selectOption('Portuguese');
  await page.getByRole('status').getByText(/Language preference changed on this page/).waitFor();
  await page.locator('.typeface-control summary').click();
  await page.getByLabel('Poem typeface').selectOption('clear');
  await page.getByRole('status').getByText(/Typeface changed on this page/).waitFor();
  await page.getByLabel('Translation language').selectOption({ label: 'Arabic' });
  await page.getByRole('status').getByText(/Translation choice changed on this page/).waitFor();
  await page.getByRole('button', { name: 'A+ Increase poem text size' }).click();
  await page.getByRole('status').getByText(/Text size changed on this page/).waitFor();
  await page.getByRole('button', { name: 'Focus mode' }).click();
  assert.equal(await page.getByRole('button', { name: 'Exit focus mode' }).isVisible(), true);
  await page.clock.fastForward(5000);
  assert.equal(await warning.isVisible(), true);
  for (const theme of ['light', 'sepia', 'dark']) {
    await page.getByLabel('Focus theme').selectOption(theme);
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], `blocked storage / ${theme}`);
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.goto(`${base}#shelf`);
  await page.getByText(totalText).waitFor();
  assert.equal(await page.locator('#shelf .shelf-storage-warning').isVisible(), true);
  assert.equal(await page.locator('#shelf-items').getByText(/saved poems will appear here/).count(), 0);
  assert.equal(await page.locator('#recent-items').getByText(/could not be read/).count(), 1);
  await page.locator('#results [data-save]').first().click();
  assert.equal(await page.locator('#shelf-items a').count(), 1);
  await page.getByText('Clear saved poems', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Yes, clear saved poems' }).click();
  assert.equal(await page.locator('#shelf-items a').count(), 0);
  assert.equal(await page.getByText('Clear saved poems', { exact: true }).evaluate(element => element === document.activeElement), true);
  await page.getByText('Clear history', { exact: true }).click();
  await page.getByRole('button', { name: 'Yes, clear history' }).click();
  await page.getByRole('status').getByText(/Reading history cleared on this page only/).waitFor();
  await page.reload();
  await page.getByText(totalText).waitFor();
  assert.equal(await page.locator('#shelf-items a').count(), 0);
  assert.equal(await page.locator('#shelf .shelf-storage-warning').isVisible(), true);
  await page.route('**/data/catalog.json', route => route.abort());
  await page.reload();
  await page.getByText(/The library could not load/).waitFor();
  assert.equal(await page.locator('#shelf .shelf-storage-warning').isVisible(), true);
  assert.equal(await page.locator('#shelf-items').getByText(/saved poems will appear here/).count(), 0);
  await context.close();
});

test('a transient initial storage read failure cannot overwrite data after storage recovers', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  const stored = JSON.stringify({ saved: ['shakespeare-sonnet-18'], recent: ['shakespeare-sonnet-18'], theme: 'sepia', extra: { keep: true } });
  await page.evaluate(value => localStorage.setItem('verso-library-v1', value), stored);
  await context.addInitScript(() => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    window.versoWriteAttempts = 0;
    Storage.prototype.getItem = function (key) {
      if (this === localStorage && key === 'verso-library-v1' && !getItem.call(sessionStorage, 'verso-test-read-failed')) {
        setItem.call(sessionStorage, 'verso-test-read-failed', 'yes');
        throw new Error('Transient read failure');
      }
      return getItem.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'verso-library-v1') window.versoWriteAttempts++;
      return setItem.call(this, key, value);
    };
  });
  await page.goto(`${base}poems/old-pond-basho/`);
  await page.getByRole('status').getByText(/Saved data could not be read/).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('verso-library-v1')), stored);
  await page.getByRole('button', { name: /Save poem/ }).click();
  await page.getByLabel('Reading theme').selectOption('dark');
  assert.equal(await page.evaluate(() => window.versoWriteAttempts), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('verso-library-v1')), stored);
  await page.goto(`${base}#shelf`);
  await page.getByText(totalText).waitFor();
  assert.equal(await page.locator('#shelf-items').getByText('Sonnet 18').count(), 1);
  assert.equal(await page.locator('#shelf-items a').count(), 1);
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'sepia');
  assert.equal(await page.locator('main > .storage-warning').isVisible(), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('verso-library-v1')), stored);
  await context.close();
});

test('malformed saved state is preserved byte for byte, including when clearing temporary lists', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  await context.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    window.versoWriteAttempts = 0;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'verso-library-v1') window.versoWriteAttempts++;
      return setItem.call(this, key, value);
    };
  });
  const invalid = ['', '{', 'null', '[]', '1', '"text"', '{"saved":null}', '{"saved":{}}', '{"saved":["shakespeare-sonnet-18",4]}', '{"recent":null}', '{"recent":["old-pond-basho",false]}', '{"font":{"valueOf":1,"toString":2}}', '{"theme":"unknown"}', '{"focus":"true"}', '{"preferredLanguage":null}', '{"typeface":[]}', '{"_versoRevision":"1"}'];
  for (const raw of invalid) {
    await page.evaluate(value => localStorage.setItem('verso-library-v1', value), raw);
    await page.goto(`${base}poems/old-pond-basho/`);
    await page.getByRole('status').getByText(/Saved data could not be read/).waitFor();
    await page.getByRole('button', { name: /Save poem/ }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem('verso-library-v1')), raw, `preserve ${raw}`);
    assert.equal(await page.evaluate(() => window.versoWriteAttempts), 0, `no writes for ${raw}`);
  }
  const raw = invalid.at(-1);
  await page.goto(`${base}#shelf`);
  await page.getByText(totalText).waitFor();
  await page.getByText('Clear saved poems', { exact: true }).click();
  await page.getByRole('button', { name: 'Yes, clear saved poems' }).click();
  await page.getByText('Clear history', { exact: true }).click();
  await page.getByRole('button', { name: 'Yes, clear history' }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('verso-library-v1')), raw);
  assert.equal(await page.evaluate(() => window.versoWriteAttempts), 0);
  await context.close();
});

test('a failed storage write is not retried from stale state even when storage recovers', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  const stored = JSON.stringify({ saved: ['shakespeare-sonnet-18'], recent: [], theme: 'sepia', extra: { keep: true } });
  await page.evaluate(value => localStorage.setItem('verso-library-v1', value), stored);
  await context.addInitScript(() => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    window.versoWriteAttempts = 0;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'verso-library-v1') {
        window.versoWriteAttempts++;
        if (!getItem.call(sessionStorage, 'verso-test-write-failed')) {
          setItem.call(sessionStorage, 'verso-test-write-failed', 'yes');
          throw new Error('Transient write failure');
        }
      }
      return setItem.call(this, key, value);
    };
  });
  await page.goto(`${base}poems/shakespeare-sonnet-18/`);
  await page.getByRole('status').getByText(/Browser storage could not be updated/).waitFor();
  assert.equal(await page.getByRole('button', { name: /Saved to your shelf/ }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: /Saved to your shelf/ }).click();
  await page.getByLabel('Reading theme').selectOption('dark');
  assert.equal(await page.locator('main > .storage-warning').isVisible(), true);
  assert.equal(await page.evaluate(() => window.versoWriteAttempts), 1);
  assert.equal(await page.evaluate(() => localStorage.getItem('verso-library-v1')), stored);
  await page.reload();
  await page.getByRole('button', { name: /Saved to your shelf/ }).waitFor();
  assert.equal(await page.locator('main > .storage-warning').isVisible(), false);
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'sepia');
  const recovered = await page.evaluate(() => JSON.parse(localStorage.getItem('verso-library-v1')));
  assert.deepEqual(recovered.saved, ['shakespeare-sonnet-18']);
  assert.deepEqual(recovered.recent, ['shakespeare-sonnet-18']);
  assert.deepEqual(recovered.extra, { keep: true });
  await context.close();
});

test('legacy saved state without newer fields remains usable and preserves unknown fields', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  await page.evaluate(() => localStorage.setItem('verso-library-v1', JSON.stringify({ saved: ['shakespeare-sonnet-18'], language: 'Arabic', extra: { keep: true } })));
  await page.goto(`${base}poems/quiet-night-thought-li-bai/`);
  await page.getByRole('button', { name: 'Focus mode' }).waitFor();
  assert.equal(await page.locator('main > .storage-warning').isVisible(), false);
  assert.equal(await page.getByLabel('Preferred reading language', { exact: true }).inputValue(), '');
  assert.equal(await page.getByLabel('Translation language').inputValue(), '6');
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('verso-library-v1')));
  assert.deepEqual(state.saved, ['shakespeare-sonnet-18']);
  assert.deepEqual(state.recent, ['quiet-night-thought-li-bai']);
  assert.deepEqual(state.extra, { keep: true });
  await context.close();
});

async function pausePageTime(page) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'));
}

async function holdReadingStateLock(page) {
  await page.evaluate(() => {
    window.testLockHeld = false;
    window.testLockRequest = navigator.locks.request('verso-library-v1', async () => {
      await new Promise(resolve => { window.releaseTestLock = resolve; window.testLockHeld = true; });
    });
  });
  await page.waitForFunction(() => window.testLockHeld);
}

test('simultaneous saves in open tabs preserve both poems and synchronize their controls', async () => {
  const context = await browser.newContext();
  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto(`${base}poems/shakespeare-sonnet-18/`);
  await second.goto(`${base}poems/old-pond-basho/`);
  await second.waitForFunction(() => JSON.parse(localStorage.getItem('verso-library-v1') || '{}').recent?.includes('old-pond-basho'));
  await Promise.all([
    first.getByRole('button', { name: /Save poem/ }).click(),
    second.getByRole('button', { name: /Save poem/ }).click(),
  ]);
  await first.waitForFunction(() => {
    const saved = JSON.parse(localStorage.getItem('verso-library-v1') || '{}').saved || [];
    return saved.includes('shakespeare-sonnet-18') && saved.includes('old-pond-basho');
  });
  await first.goto(`${base}#shelf`);
  await first.getByText(totalText).waitFor();
  assert.equal(await first.locator('#shelf-items a').count(), 2);
  await second.getByRole('button', { name: /Saved to your shelf/ }).click();
  await second.getByRole('status').getByText('Removed from your shelf.').waitFor();
  await first.locator('#shelf-items').getByText('Sonnet 18').waitFor();
  await first.waitForFunction(() => document.querySelectorAll('#shelf-items a').length === 1);
  assert.deepEqual(await first.evaluate(() => JSON.parse(localStorage.getItem('verso-library-v1')).saved), ['shakespeare-sonnet-18']);
  const shelfLink = first.locator('#shelf-items a').first();
  await shelfLink.focus();
  await second.goto(`${base}poems/quiet-night-thought-li-bai/`);
  await first.locator('#recent-items').getByText('Quiet Night Thought').waitFor();
  assert.equal(await shelfLink.evaluate(element => element === document.activeElement), true);
  await context.close();
});

test('queued writes cancel a stale shelf clear rather than discard a concurrent addition', async () => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const home = await context.newPage();
  await home.goto(base);
  await home.getByText(totalText).waitFor();
  await home.evaluate(() => localStorage.setItem('verso-library-v1', JSON.stringify({ saved: ['shakespeare-sonnet-18'], recent: [], extra: { keep: true } })));
  await home.reload();
  await home.locator('#shelf-items').getByText('Sonnet 18').waitFor();
  const reader = await context.newPage();
  await reader.goto(`${base}poems/old-pond-basho/`);
  await reader.waitForFunction(() => JSON.parse(localStorage.getItem('verso-library-v1')).recent.includes('old-pond-basho'));
  const holder = await context.newPage();
  await holder.goto(base);
  await pausePageTime(reader);
  await pausePageTime(home);
  await holdReadingStateLock(holder);
  try {
    await reader.getByRole('button', { name: /Save poem/ }).click();
    await reader.getByRole('status').getByText('Saving changes…').waitFor();
    assert.equal(await reader.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }), true);
    const dialogPromise = reader.waitForEvent('dialog');
    const navigation = reader.getByRole('link', { name: 'Back to the library' }).click({ noWaitAfter: true });
    const dialog = await dialogPromise;
    assert.equal(dialog.type(), 'beforeunload');
    await dialog.dismiss();
    await navigation;
    assert.match(reader.url(), /old-pond-basho/);
    await home.getByText('Clear saved poems', { exact: true }).click();
    await home.getByRole('button', { name: 'Yes, clear saved poems' }).click();
    await home.getByRole('status').getByText('Saving changes…').waitFor();
    await holder.evaluate(() => window.releaseTestLock());
    await home.locator('.clear-conflict').getByText(/Review your shelf and confirm again/).waitFor();
    await home.waitForFunction(() => {
      const saved = JSON.parse(localStorage.getItem('verso-library-v1')).saved;
      return saved.length === 2 && saved.includes('old-pond-basho') && saved.includes('shakespeare-sonnet-18');
    });
    assert.deepEqual(await home.evaluate(() => JSON.parse(localStorage.getItem('verso-library-v1')).extra), { keep: true });
    assert.equal(await reader.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }), false);
    await home.getByRole('button', { name: 'Yes, clear saved poems' }).click();
    await home.getByRole('status').getByText('Saved poems present at confirmation were cleared.').waitFor();
    assert.deepEqual(await home.evaluate(() => JSON.parse(localStorage.getItem('verso-library-v1')).saved), []);
  } finally {
    await holder.evaluate(() => window.releaseTestLock?.());
    await context.close();
  }
});

test('tabs merge preference changes with queued saves without overwriting unrelated state', async () => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const first = await context.newPage();
  const second = await context.newPage();
  const holder = await context.newPage();
  await first.goto(`${base}poems/shakespeare-sonnet-18/`);
  await second.goto(`${base}poems/old-pond-basho/`);
  await second.waitForFunction(() => JSON.parse(localStorage.getItem('verso-library-v1') || '{}').recent?.includes('old-pond-basho'));
  await holder.goto(base);
  await pausePageTime(first);
  await pausePageTime(second);
  await holdReadingStateLock(holder);
  try {
    await first.getByLabel('Reading theme').selectOption('sepia');
    await second.getByRole('button', { name: /Save poem/ }).click();
    await holder.evaluate(() => window.releaseTestLock());
    await second.getByRole('status').getByText('Saved to your shelf.').waitFor();
    await second.waitForFunction(() => document.documentElement.dataset.theme === 'sepia');
    const stored = await first.evaluate(() => JSON.parse(localStorage.getItem('verso-library-v1')));
    assert.equal(stored.theme, 'sepia');
    assert.deepEqual(stored.saved, ['old-pond-basho']);
    assert.ok(stored.recent.includes('shakespeare-sonnet-18') && stored.recent.includes('old-pond-basho'));
  } finally {
    await holder.evaluate(() => window.releaseTestLock?.());
    await context.close();
  }
});

test('clear confirmation cannot erase a concurrent remove and re-add of the same poem', async () => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const reader = await context.newPage();
  await reader.goto(`${base}poems/shakespeare-sonnet-18/`);
  await reader.getByRole('button', { name: /Save poem/ }).click();
  await reader.getByRole('status').getByText('Saved to your shelf.').waitFor();
  const home = await context.newPage();
  await home.goto(`${base}#shelf`);
  await home.locator('#shelf-items').getByText('Sonnet 18').waitFor();
  const holder = await context.newPage();
  await holder.goto(base);
  await pausePageTime(reader);
  await pausePageTime(home);
  await holdReadingStateLock(holder);
  try {
    await reader.getByRole('button', { name: /Saved to your shelf/ }).click();
    await reader.getByRole('button', { name: /Save poem/ }).click();
    await home.getByText('Clear saved poems', { exact: true }).click();
    await home.getByRole('button', { name: 'Yes, clear saved poems' }).click();
    await holder.evaluate(() => window.releaseTestLock());
    await home.locator('.clear-conflict').getByText(/Review your shelf and confirm again/).waitFor();
    assert.deepEqual(await home.evaluate(() => JSON.parse(localStorage.getItem('verso-library-v1')).saved), ['shakespeare-sonnet-18']);
    assert.equal(await home.locator('#shelf-items').getByText('Sonnet 18').count(), 1);
  } finally {
    await holder.evaluate(() => window.releaseTestLock?.());
    await context.close();
  }
});

test('success feedback waits for newer queued preference changes', async () => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  const holder = await context.newPage();
  await page.goto(`${base}poems/quiet-night-thought-li-bai/`);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('verso-library-v1') || '{}').recent?.includes('quiet-night-thought-li-bai'));
  await holder.goto(base);
  await pausePageTime(page);
  await holdReadingStateLock(holder);
  try {
    const preferred = page.getByLabel('Preferred reading language', { exact: true });
    await preferred.selectOption('Japanese');
    await preferred.selectOption('English');
    await page.getByRole('status').getByText('Saving changes…').waitFor();
    await holder.evaluate(() => window.releaseTestLock());
    await page.getByRole('status').getByText('Language preference saved.').waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('verso-library-v1')).preferredLanguage), 'English');
    await page.reload();
    assert.equal(await preferred.inputValue(), 'English');
  } finally {
    await holder.evaluate(() => window.releaseTestLock?.());
    await context.close();
  }
});

test('clear history asks for reconfirmation when a poem is read concurrently', async () => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const first = await context.newPage();
  await first.goto(`${base}poems/shakespeare-sonnet-18/`);
  await first.waitForFunction(() => JSON.parse(localStorage.getItem('verso-library-v1') || '{}').recent?.includes('shakespeare-sonnet-18'));
  const home = await context.newPage();
  await home.goto(`${base}#shelf`);
  await home.locator('#recent-items').getByText('Sonnet 18').waitFor();
  const holder = await context.newPage();
  await holder.goto(base);
  const reader = await context.newPage();
  await pausePageTime(reader);
  await pausePageTime(home);
  await holdReadingStateLock(holder);
  try {
    await reader.goto(`${base}poems/old-pond-basho/`);
    await reader.getByRole('button', { name: 'Focus mode' }).waitFor();
    await home.getByText('Clear history', { exact: true }).click();
    await home.getByRole('button', { name: 'Yes, clear history' }).click();
    await holder.evaluate(() => window.releaseTestLock());
    await home.locator('.clear-conflict').getByText(/Review your history and confirm again/).waitFor();
    const recent = await home.evaluate(() => JSON.parse(localStorage.getItem('verso-library-v1')).recent);
    assert.ok(recent.includes('shakespeare-sonnet-18') && recent.includes('old-pond-basho'));
  } finally {
    await holder.evaluate(() => window.releaseTestLock?.());
    await context.close();
  }
});

test('unavailable browser locks and malformed external updates preserve existing stored data', async () => {
  const context = await browser.newContext();
  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto(`${base}poems/shakespeare-sonnet-18/`);
  await second.goto(base);
  await second.getByText(totalText).waitFor();
  const raw = '{"saved":["shakespeare-sonnet-18",null]}';
  await first.evaluate(value => localStorage.setItem('verso-library-v1', value), raw);
  await second.locator('main > .storage-warning').getByText(/Saved data could not be read/).waitFor();
  await second.locator('#results [data-save]').first().click();
  assert.equal(await second.evaluate(() => localStorage.getItem('verso-library-v1')), raw);
  await context.close();

  const noLocks = await browser.newContext();
  const page = await noLocks.newPage();
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  const seed = JSON.stringify({ saved: ['shakespeare-sonnet-18'], recent: [], theme: 'sepia' });
  await page.evaluate(value => localStorage.setItem('verso-library-v1', value), seed);
  await noLocks.addInitScript(() => Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined }));
  await page.goto(`${base}poems/old-pond-basho/`);
  await page.locator('main > .storage-warning').getByText(/cannot safely coordinate/).waitFor();
  await page.getByRole('button', { name: /Save poem/ }).click();
  await page.getByRole('status').getByText(/on this page only/).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('verso-library-v1')), seed);
  await noLocks.close();
});

test('an unavailable catalogue keeps saved and recent IDs usable and recovers after refresh', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const home = await context.newPage();
  await home.goto(base);
  await home.getByText(totalText).waitFor();
  const seed = JSON.stringify({ saved: ['shakespeare-sonnet-18'], recent: ['old-pond-basho'], theme: 'sepia', extra: { keep: true } });
  await home.evaluate(value => localStorage.setItem('verso-library-v1', value), seed);
  await home.route('**/data/catalog.json', route => route.abort());
  await home.goto(`${base}#shelf`);
  await home.reload();
  await home.getByText(/The library could not load/).waitFor();
  assert.equal(await home.evaluate(() => localStorage.getItem('verso-library-v1')), seed);
  const shelf = home.locator('#shelf-items');
  assert.equal(await shelf.getByText(/Saved poems could not be loaded/).isVisible(), true);
  assert.equal(await shelf.getByText(/Your saved poems will appear here/).count(), 0);
  assert.equal(await shelf.getByRole('link', { name: /shakespeare-sonnet-18/ }).getAttribute('href'), '/ai-poems/poems/shakespeare-sonnet-18/');
  assert.equal(await home.locator('#recent-items').getByRole('link', { name: /old-pond-basho/ }).getAttribute('href'), '/ai-poems/poems/old-pond-basho/');
  assert.ok(await home.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const accessibility = await new AxeBuilder({ page: home }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), []);
  await shelf.getByRole('link', { name: /Browse the complete index/ }).focus();
  await home.keyboard.press('Enter');
  assert.equal(await home.locator('#complete-index').getAttribute('open'), '');
  assert.equal(await home.locator('#complete-index summary').evaluate(element => element === document.activeElement), true);

  const other = await context.newPage();
  await other.goto(`${base}poems/old-pond-basho/`);
  await other.getByRole('button', { name: /Save poem/ }).click();
  await other.getByRole('status').getByText('Saved to your shelf.').waitFor();
  await shelf.getByRole('link', { name: /old-pond-basho/ }).waitFor();
  assert.equal(await shelf.getByText(/Saved poems could not be loaded/).isVisible(), true);
  const stored = await home.evaluate(() => JSON.parse(localStorage.getItem('verso-library-v1')));
  assert.deepEqual(stored.saved, ['shakespeare-sonnet-18', 'old-pond-basho']);
  assert.deepEqual(stored.extra, { keep: true });
  await home.unroute('**/data/catalog.json');
  await home.reload();
  await home.getByText(totalText).waitFor();
  assert.equal(await shelf.getByText('Sonnet 18').count(), 1);
  assert.equal(await shelf.getByText('The Old Pond').count(), 1);
  assert.equal(await shelf.getByText(/Saved poems could not be loaded/).count(), 0);
  await context.close();
});

test('catalogue errors never turn invalid or empty stored IDs into unsafe links or a false empty shelf', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  await page.route('**/data/catalog.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  for (const saved of [['shakespeare-sonnet-18', '../other', '<script>'], []]) {
    const seed = JSON.stringify({ saved, recent: [] });
    await page.evaluate(value => localStorage.setItem('verso-library-v1', value), seed);
    await page.goto(`${base}#shelf`);
    await page.reload();
    await page.getByText(/The library could not load/).waitFor();
    const shelf = page.locator('#shelf-items');
    assert.equal(await shelf.getByText(/Saved poems could not be loaded/).isVisible(), true);
    assert.equal(await shelf.getByText(/Your saved poems will appear here/).count(), 0);
    assert.equal(await shelf.locator('script').count(), 0);
    assert.equal(await shelf.locator('a[href*="../"]').count(), 0);
    assert.equal(await shelf.getByText(/Some stored IDs cannot be displayed as links/).count(), saved.length ? 1 : 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('verso-library-v1')), seed);
  }
  await context.close();
});

test('repeated pending toggles and simultaneous saves of the same poem do not duplicate it', async () => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const first = await context.newPage();
  const second = await context.newPage();
  const holder = await context.newPage();
  await first.goto(`${base}poems/shakespeare-sonnet-18/`);
  await second.goto(`${base}poems/shakespeare-sonnet-18/`);
  await second.waitForFunction(() => JSON.parse(localStorage.getItem('verso-library-v1') || '{}').recent?.includes('shakespeare-sonnet-18'));
  await holder.goto(base);
  await pausePageTime(first);
  await pausePageTime(second);
  await holdReadingStateLock(holder);
  try {
    await first.getByRole('button', { name: /Save poem/ }).click();
    await first.getByRole('button', { name: /Saved to your shelf/ }).click();
    await first.getByRole('button', { name: /Save poem/ }).click();
    await second.getByRole('button', { name: /Save poem/ }).click();
    await holder.evaluate(() => window.releaseTestLock());
    await second.getByRole('status').getByText('Saved to your shelf.').waitFor();
    assert.deepEqual(await second.evaluate(() => JSON.parse(localStorage.getItem('verso-library-v1')).saved), ['shakespeare-sonnet-18']);
    await first.reload();
    await first.getByRole('button', { name: /Saved to your shelf/ }).waitFor();
  } finally {
    await holder.evaluate(() => window.releaseTestLock?.());
    await context.close();
  }
});

test('a timed-out browser lock cannot later write stale pending changes', async () => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  const holder = await context.newPage();
  await page.goto(`${base}poems/shakespeare-sonnet-18/`);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('verso-library-v1') || '{}').recent?.includes('shakespeare-sonnet-18'));
  await holder.goto(base);
  await pausePageTime(page);
  await holdReadingStateLock(holder);
  const before = await page.evaluate(() => localStorage.getItem('verso-library-v1'));
  try {
    await page.getByRole('button', { name: /Save poem/ }).click();
    await page.getByRole('status').getByText('Saving changes…').waitFor();
    await page.clock.fastForward(5000);
    await page.locator('main > .storage-warning').getByText(/cannot safely coordinate/).waitFor();
    await holder.evaluate(() => window.releaseTestLock());
    await holder.evaluate(() => window.testLockRequest);
    assert.equal(await page.evaluate(() => localStorage.getItem('verso-library-v1')), before);
    assert.equal(await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }), false);
  } finally {
    await holder.evaluate(() => window.releaseTestLock?.());
    await context.close();
  }
});

test('external corruption while a write is queued cancels the pending durable update', async () => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  const holder = await context.newPage();
  await page.goto(`${base}poems/shakespeare-sonnet-18/`);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('verso-library-v1') || '{}').recent?.includes('shakespeare-sonnet-18'));
  await holder.goto(base);
  await pausePageTime(page);
  await holdReadingStateLock(holder);
  try {
    await page.getByRole('button', { name: /Save poem/ }).click();
    await page.getByRole('status').getByText('Saving changes…').waitFor();
    await holder.evaluate(() => localStorage.setItem('verso-library-v1', '{bad'));
    await page.locator('main > .storage-warning').getByText(/Saved data could not be read/).waitFor();
    await holder.evaluate(() => window.releaseTestLock());
    await page.getByRole('status').getByText(/on this page only/).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('verso-library-v1')), '{bad');
    assert.equal(await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }), false);
  } finally {
    await holder.evaluate(() => window.releaseTestLock?.());
    await context.close();
  }
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
