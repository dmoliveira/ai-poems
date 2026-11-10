import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { loadCatalog } from '../scripts/catalog-data.mjs';
import { groupPoets } from '../scripts/poets.mjs';
import { renderHome } from '../scripts/templates.mjs';
import { associatedPlaces, filterPoems, placeCounts, readingLanguages, recordedYearRanges, yearRangeCounts } from '../src/catalog.mjs';

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
  const arabicCount = filterPoems(poems, { language: 'Arabic' }).length;
  await page.getByText(`${arabicCount} ${arabicCount === 1 ? 'poem' : 'poems'} found`, { exact: true }).waitFor();
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
  assert.deepEqual(flags.map(flag => flag.src.split('/').pop()).sort(), ['br.svg', 'ca.svg', 'cl.svg', 'cn.svg', 'cu.svg', 'es.svg', 'fr.svg', 'gb-eng.svg', 'it.svg', 'jm.svg', 'jp.svg', 'pt.svg', 'us.svg', 've.svg']);
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

test('Brazilian originals support place discovery, search and static reading', async () => {
  const ids = ['cancao-do-exilio-goncalves-dias', 'cachias-goncalves-dias', 'desejo-goncalves-dias', 'te-deum-goncalves-dias'];
  const selected = ids.map(id => poems.find(p => p.id === id));
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  const seed = { saved: ['shakespeare-sonnet-18'], recent: [], extra: { keep: true } };
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await page.locator('#countries .more-countries summary').click();
  const count = placeCounts(poems).find(p => p.place === 'Brazil').count;
  const card = page.locator('#countries').getByRole('link', { name: `Brazil ${count} poems`, exact: true });
  assert.equal(await card.locator('img').getAttribute('src'), '/ai-poems/assets/flags/br.svg');
  await card.click();
  await page.getByText(`${count} poems found`, { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('country'), 'Brazil');
  assert.ok(await page.locator('#results .poem-card-link').count() > 0);
  await page.locator('#filter-summary').click();
  await page.getByLabel('Original language').selectOption('Portuguese');
  await page.getByText(`${filterPoems(poems, { language: 'Portuguese', country: 'Brazil' }).length} poems found`, { exact: true }).waitFor();
  await page.getByLabel('Search the poetry library').fill('gorgeiao');
  const searchCount = filterPoems(poems, { language: 'Portuguese', country: 'Brazil', query: 'gorgeiao' }).length;
  await page.getByText(`${searchCount} ${searchCount === 1 ? 'poem' : 'poems'} found`, { exact: true }).waitFor();
  const exile = selected.find(p => p.id.startsWith('cancao-do-exilio'));
  await page.locator(`#results a[href$="/poems/${exile.id}/"]`).click();
  assert.equal(await page.locator('#original-panel .verse').textContent(), exile.text);
  assert.equal(await page.locator('#original-panel .verse').getAttribute('lang'), 'pt');
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.deepEqual(stored.saved, seed.saved);
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const poem of selected) {
    const link = staticPage.locator('#index-original-Portuguese').locator(`a[href$="/poems/${poem.id}/"]`);
    assert.equal(await link.count(), 1);
    await staticPage.goto(`${base}poems/${poem.id}/`);
    assert.equal(await staticPage.locator('#original-panel .verse').textContent(), poem.text);
    assert.equal(await staticPage.getByRole('link', { name: poem.sourceTitle }).getAttribute('href'), poem.source);
    assert.ok((await staticPage.locator('.source-note').textContent()).includes(poem.rights));
    await staticPage.getByRole('link', { name: poem.author, exact: true }).click();
    assert.equal(new URL(staticPage.url()).pathname, '/ai-poems/poets/goncalves-dias/');
    for (const other of selected) assert.equal(await staticPage.locator(`a[href$="/poems/${other.id}/"]`).count(), 1);
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await staticPage.goto(base);
    await staticPage.locator('#complete-index summary').click();
  }
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('Auta de Souza originals support Brazilian search, sources and static reading', async () => {
  const selected = poems.filter(p => p.id.startsWith('auta-horto-'));
  assert.equal(selected.length, 7);
  const seed = { saved: ['cancao-do-exilio-goncalves-dias'], recent: [], extra: { keep: true } };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=Portuguese&country=Brazil#explore`);
  const count = filterPoems(poems, { language: 'Portuguese', country: 'Brazil' }).length;
  await page.getByText(`${count} poems found`, { exact: true }).waitFor();
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await page.getByLabel('Search the poetry library').fill('Auta de Sousa');
  await page.getByText('7 poems found', { exact: true }).waitFor();
  await page.getByLabel('Search the poetry library').fill('tudo desparece');
  await page.getByText('1 poem found', { exact: true }).waitFor();
  const poem = selected.find(p => p.id === 'auta-horto-supplica');
  await page.locator(`#results a[href$="/poems/${poem.id}/"]`).click();
  assert.equal(await page.locator('#original-panel .verse').textContent(), poem.text);
  assert.equal(await page.getByRole('link', { name: poem.sourceTitle }).getAttribute('href'), poem.source);
  assert.equal(await page.getByRole('link', { name: `${poem.contextSourceTitle} ↗` }).getAttribute('href'), poem.contextSource);
  await page.getByRole('button', { name: /Save poem/ }).click();
  await page.getByRole('status').getByText('Saved to your shelf.').waitFor();
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.ok(stored.saved.includes(seed.saved[0]));
  assert.ok(stored.saved.includes(poem.id));
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const item of selected) assert.equal(await staticPage.locator(`#index-original-Portuguese a[href$="/poems/${item.id}/"]`).count(), 1);
  for (const item of selected) {
    await staticPage.goto(`${base}poems/${item.id}/`);
    const verse = staticPage.locator('#original-panel .verse');
    assert.equal(await verse.textContent(), item.text);
    assert.equal(await verse.getAttribute('lang'), 'pt');
    assert.equal(await verse.getAttribute('dir'), 'ltr');
    assert.equal(await staticPage.getByRole('link', { name: item.sourceTitle }).getAttribute('href'), item.source);
    assert.equal(await staticPage.getByRole('link', { name: `${item.contextSourceTitle} ↗` }).getAttribute('href'), item.contextSource);
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await staticPage.goto(`${base}poets/auta-de-souza/`);
  for (const item of selected) assert.equal(await staticPage.locator(`a[href$="/poems/${item.id}/"]`).count(), 1);
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('Castro Alves originals support Brazilian search, sources and static reading', async () => {
  const selected = poems.filter(p => p.id.startsWith('castro-alves-'));
  assert.equal(selected.length, 9);
  const seed = { saved: ['cancao-do-exilio-goncalves-dias'], recent: [], extra: { keep: true } };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=Portuguese&country=Brazil#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'Portuguese', country: 'Brazil' }).length} poems found`, { exact: true }).waitFor();
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await page.getByLabel('Search the poetry library').fill('Castro Alves');
  await page.getByText('9 poems found', { exact: true }).waitFor();
  await page.getByLabel('Search the poetry library').fill('quero viver');
  await page.getByText('1 poem found', { exact: true }).waitFor();
  const poem = selected.find(p => p.id === 'castro-alves-mocidade-e-morte');
  await page.locator(`#results a[href$="/poems/${poem.id}/"]`).click();
  assert.equal(await page.locator('#original-panel .verse').textContent(), poem.text);
  assert.equal(await page.getByRole('link', { name: poem.sourceTitle }).getAttribute('href'), poem.source);
  assert.equal(await page.getByRole('link', { name: `${poem.contextSourceTitle} ↗` }).getAttribute('href'), poem.contextSource);
  await page.getByRole('button', { name: /Save poem/ }).click();
  await page.getByRole('status').getByText('Saved to your shelf.').waitFor();
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.ok(stored.saved.includes(seed.saved[0]));
  assert.ok(stored.saved.includes(poem.id));
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const item of selected) assert.equal(await staticPage.locator(`#index-original-Portuguese a[href$="/poems/${item.id}/"]`).count(), 1);
  for (const item of selected) {
    await staticPage.goto(`${base}poems/${item.id}/`);
    const verse = staticPage.locator('#original-panel .verse');
    assert.equal(await verse.textContent(), item.text);
    assert.equal(await verse.getAttribute('lang'), 'pt');
    assert.equal(await verse.getAttribute('dir'), 'ltr');
    assert.equal(await staticPage.getByRole('link', { name: item.sourceTitle }).getAttribute('href'), item.source);
    assert.equal(await staticPage.getByRole('link', { name: `${item.contextSourceTitle} ↗` }).getAttribute('href'), item.contextSource);
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await staticPage.goto(`${base}poets/castro-alves/`);
  for (const item of selected) assert.equal(await staticPage.locator(`a[href$="/poems/${item.id}/"]`).count(), 1);
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('Alphonsus originals support historical and modern-title search and static reading', async () => {
  const selected = poems.filter(poem => poem.authorId === 'alphonsus-de-guimaraens');
  assert.equal(selected.length, 8);
  const seed = { saved: ['cancao-do-exilio-goncalves-dias'], recent: [], extra: { keep: true } };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=Portuguese&country=Brazil#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'Portuguese', country: 'Brazil' }).length} poems found`, { exact: true }).waitFor();
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await page.getByLabel('Search the poetry library').fill('Alphonsus de Guimaraens');
  await page.getByText('8 poems found', { exact: true }).waitFor();
  for (const poem of selected) {
    const heading = page.locator(`#results a[href$="/poems/${poem.id}/"] h3`);
    assert.equal(await heading.textContent(), poem.displayTitle || poem.title);
    assert.equal(await heading.getAttribute('lang'), 'pt');
    assert.equal(await heading.getAttribute('dir'), poem.displayTitle ? 'auto' : 'ltr');
  }
  const cardIds = await page.locator('#results .poem-card-link').evaluateAll(links => links.map(link => new URL(link.href).pathname.split('/').filter(Boolean).at(-1)));
  const nextIndex = cardIds.findIndex((id, index) => index > 0 && selected.find(poem => poem.id === id)?.displayTitleLang);
  assert.ok(nextIndex > 0);
  await page.locator('#results .poem-card-link').nth(nextIndex - 1).click();
  const nextTitle = page.locator('[data-journey-next] strong');
  await nextTitle.waitFor({ state: 'visible' });
  assert.equal(await nextTitle.textContent(), selected.find(poem => poem.id === cardIds[nextIndex]).displayTitle);
  assert.equal(await nextTitle.getAttribute('lang'), 'pt');
  assert.equal(await nextTitle.getAttribute('dir'), 'auto');
  await page.goBack();
  await page.getByText('8 poems found', { exact: true }).waitFor();
  const ysmalia = selected.find(poem => poem.id === 'alphonsus-ysmalia');
  for (const query of ['Ismália', 'Ysmalia']) {
    await page.getByLabel('Search the poetry library').fill(query);
    await page.getByText('1 poem found', { exact: true }).waitFor();
    assert.equal(await page.locator(`#results a[href$="/poems/${ysmalia.id}/"]`).count(), 1);
  }
  await page.locator(`#results a[href$="/poems/${ysmalia.id}/"]`).click();
  assert.equal(await page.locator('#original-panel .verse').textContent(), ysmalia.text);
  assert.ok((await page.locator('main').textContent()).includes('Ysmalia'));
  assert.equal(await page.getByRole('link', { name: ysmalia.sourceTitle }).getAttribute('href'), ysmalia.source);
  await page.getByRole('button', { name: /Save poem/ }).click();
  await page.getByRole('status').getByText('Saved to your shelf.').waitFor();
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.ok(stored.saved.includes(seed.saved[0]));
  assert.ok(stored.saved.includes(ysmalia.id));
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  for (const section of ['#shelf-items', '#recent-items']) {
    const title = page.locator(`${section} a[href$="/poems/${ysmalia.id}/"] strong`);
    assert.equal(await title.textContent(), 'Ismália');
    assert.equal(await title.getAttribute('lang'), 'pt');
    assert.equal(await title.getAttribute('dir'), 'auto');
  }
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const item of selected) {
    const link = staticPage.locator(`#index-original-Portuguese a[href$="/poems/${item.id}/"]`);
    assert.equal(await link.count(), 1);
    assert.equal(await link.locator('span').first().getAttribute('lang'), 'pt');
  }
  for (const item of selected) {
    await staticPage.goto(`${base}poems/${item.id}/`);
    const verse = staticPage.locator('#original-panel .verse');
    assert.equal(await staticPage.locator('.reader-intro h1').getAttribute('lang'), 'pt');
    assert.equal(await staticPage.locator('.reader-intro h1').getAttribute('dir'), item.displayTitle ? 'auto' : 'ltr');
    assert.equal(await verse.textContent(), item.text);
    assert.equal(await verse.getAttribute('lang'), 'pt');
    assert.equal(await verse.getAttribute('dir'), 'ltr');
    assert.equal(await staticPage.getByRole('link', { name: item.sourceTitle }).getAttribute('href'), item.source);
    assert.equal(await staticPage.getByRole('link', { name: `${item.contextSourceTitle} ↗` }).getAttribute('href'), item.contextSource);
    assert.ok((await staticPage.locator('.source-note').textContent()).includes(item.rights));
    assert.ok((await staticPage.locator('.story').textContent()).includes(item.context));
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await staticPage.goto(`${base}poets/alphonsus-de-guimaraens/`);
  for (const item of selected) {
    const link = staticPage.locator(`a[href$="/poems/${item.id}/"]`);
    assert.equal(await link.count(), 1);
    assert.equal(await link.locator('strong').getAttribute('lang'), 'pt');
  }
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('Francisca Júlia originals support discovery, preserved saves and static reading', async () => {
  const selected = poems.filter(poem => poem.authorId === 'francisca-julia');
  assert.equal(selected.length, 24);
  const seed = { saved: ['cancao-do-exilio-goncalves-dias'], recent: [], extra: { keep: true } };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=Portuguese&country=Brazil#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'Portuguese', country: 'Brazil' }).length} poems found`, { exact: true }).waitFor();
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await page.getByLabel('Search the poetry library').fill('Francisca Julia');
  await page.getByText('24 poems found', { exact: true }).waitFor();
  await page.getByLabel('Search the poetry library').fill('musa impassivel');
  await page.getByText('2 poems found', { exact: true }).waitFor();
  const opening = selected.find(poem => poem.id === 'francisca-julia-marmores-01');
  const closing = selected.find(poem => poem.id === 'francisca-julia-ballada-18');
  for (const poem of [opening, closing]) {
    const card = page.locator(`#results a[href$="/poems/${poem.id}/"]`);
    assert.equal(await card.count(), 1);
    assert.ok((await card.textContent()).includes(poem.disambiguation));
  }
  await page.locator(`#results a[href$="/poems/${opening.id}/"]`).click();
  assert.equal(await page.locator('#original-panel .verse').textContent(), opening.text);
  assert.equal(await page.getByRole('link', { name: opening.sourceTitle }).getAttribute('href'), opening.source);
  assert.equal(await page.getByRole('link', { name: `${opening.contextSourceTitle} ↗` }).getAttribute('href'), opening.contextSource);
  await page.getByRole('button', { name: /Save poem/ }).click();
  await page.getByRole('status').getByText('Saved to your shelf.').waitFor();
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.ok(stored.saved.includes(seed.saved[0]));
  assert.ok(stored.saved.includes(opening.id));
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const item of selected) assert.equal(await staticPage.locator(`#index-original-Portuguese a[href$="/poems/${item.id}/"]`).count(), 1);
  for (const item of selected) {
    await staticPage.goto(`${base}poems/${item.id}/`);
    const verse = staticPage.locator('#original-panel .verse');
    assert.equal(await verse.textContent(), item.text);
    assert.equal(await verse.getAttribute('lang'), 'pt');
    assert.equal(await verse.getAttribute('dir'), 'ltr');
    assert.equal(await staticPage.getByRole('link', { name: item.sourceTitle }).getAttribute('href'), item.source);
    assert.equal(await staticPage.getByRole('link', { name: `${item.contextSourceTitle} ↗` }).getAttribute('href'), item.contextSource);
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await staticPage.goto(`${base}poets/francisca-julia/`);
  for (const item of selected) assert.equal(await staticPage.locator(`a[href$="/poems/${item.id}/"]`).count(), 1);
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('expanded French classics support search, attribution and static reading', async () => {
  const selected = poems.filter(p => p.id.startsWith('hugo-contemplations-'));
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=French#explore`);
  const count = filterPoems(poems, { language: 'French' }).length;
  await page.getByText(`${count} poems found`, { exact: true }).waitFor();
  const seed = { saved: ['shakespeare-sonnet-18'], recent: [], extra: { keep: true } };
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await page.getByLabel('Search the poetry library').fill('mes vers fuiraient');
  const matches = filterPoems(poems, { language: 'French', query: 'mes vers fuiraient' });
  await page.getByText(`${matches.length} ${matches.length === 1 ? 'poem' : 'poems'} found`, { exact: true }).waitFor();
  const poem = selected.find(p => p.id === 'hugo-contemplations-2-02');
  await page.locator(`#results a[href$="/poems/${poem.id}/"]`).click();
  assert.equal(await page.locator('#original-panel .verse').textContent(), poem.text);
  assert.equal(await page.locator('#original-panel .verse').getAttribute('lang'), 'fr');
  assert.equal(await page.getByRole('link', { name: poem.sourceTitle }).getAttribute('href'), poem.source);
  assert.equal(await page.getByRole('link', { name: `${poem.contextSourceTitle} ↗` }).getAttribute('href'), poem.contextSource);
  assert.ok((await page.locator('.source-note').textContent()).includes('CC BY-SA 4.0'));
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.deepEqual(stored.saved, seed.saved);
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const item of selected) {
    assert.equal(await staticPage.locator(`#index-original-French a[href$="/poems/${item.id}/"]`).count(), 1);
  }
  for (const id of ['hugo-contemplations-1-15', 'hugo-contemplations-2-02', 'hugo-contemplations-3-27']) {
    const item = poems.find(p => p.id === id);
    await staticPage.goto(`${base}poems/${id}/`);
    assert.equal(await staticPage.locator('#original-panel .verse').textContent(), item.text);
    assert.equal(await staticPage.getByRole('link', { name: item.sourceTitle }).getAttribute('href'), item.source);
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await staticPage.getByRole('link', { name: 'Victor Hugo', exact: true }).click();
  assert.equal(new URL(staticPage.url()).pathname, '/ai-poems/poets/victor-hugo/');
  for (const item of selected) assert.equal(await staticPage.locator(`a[href$="/poems/${item.id}/"]`).count(), 1);
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('Apollinaire originals support complete discovery, saved data and static mobile reading', async () => {
  const selected = poems.filter(p => p.id.startsWith('apollinaire-alcools-'));
  assert.equal(selected.length, 34);
  const seed = { saved: ['demain-des-laube-hugo'], recent: [], extra: { keep: true } };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=French#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'French' }).length} poems found`, { exact: true }).waitFor();
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await page.getByLabel('Search the poetry library').fill('Guillaume Apollinaire');
  await page.getByText('34 poems found', { exact: true }).waitFor();
  await page.getByLabel('Search the poetry library').fill('devant devant le zinc');
  await page.getByText('1 poem found', { exact: true }).waitFor();
  const zone = selected.find(p => p.id === 'apollinaire-alcools-01');
  await page.locator(`#results a[href$="/poems/${zone.id}/"]`).click();
  assert.equal(await page.locator('#original-panel .verse').textContent(), zone.text);
  assert.equal(await page.getByRole('link', { name: zone.sourceTitle }).getAttribute('href'), zone.source);
  assert.equal(await page.getByRole('link', { name: `${zone.contextSourceTitle} ↗` }).getAttribute('href'), zone.contextSource);
  assert.ok((await page.locator('.source-note').textContent()).includes('CC BY-SA 4.0'));
  await page.getByRole('button', { name: /Save poem/ }).click();
  await page.getByRole('status').getByText('Saved to your shelf.').waitFor();
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.ok(stored.saved.includes(seed.saved[0]));
  assert.ok(stored.saved.includes(zone.id));
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const item of selected) assert.equal(await staticPage.locator(`#index-original-French a[href$="/poems/${item.id}/"]`).count(), 1);
  for (const item of selected) {
    await staticPage.goto(`${base}poems/${item.id}/`);
    const verse = staticPage.locator('#original-panel .verse');
    assert.equal(await verse.textContent(), item.text);
    assert.equal(await verse.getAttribute('lang'), 'fr');
    assert.equal(await verse.getAttribute('dir'), 'ltr');
    assert.equal(await staticPage.getByRole('link', { name: item.sourceTitle }).getAttribute('href'), item.source);
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await staticPage.goto(`${base}poets/guillaume-apollinaire/`);
  for (const item of selected) assert.equal(await staticPage.locator(`a[href$="/poems/${item.id}/"]`).count(), 1);
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('expanded Italian classics support search, attribution and static reading', async () => {
  const selected = poems.filter(p => p.id.startsWith('leopardi-canti-'));
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=Italian#explore`);
  const count = filterPoems(poems, { language: 'Italian' }).length;
  await page.getByText(`${count} poems found`, { exact: true }).waitFor();
  const seed = { saved: ['shakespeare-sonnet-18'], recent: [], extra: { keep: true } };
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await page.getByLabel('Search the poetry library').fill('rimembri ancora');
  const matches = filterPoems(poems, { language: 'Italian', query: 'rimembri ancora' });
  await page.getByText(`${matches.length} ${matches.length === 1 ? 'poem' : 'poems'} found`, { exact: true }).waitFor();
  const poem = selected.find(p => p.id === 'leopardi-canti-21');
  await page.locator(`#results a[href$="/poems/${poem.id}/"]`).click();
  assert.equal(await page.locator('#original-panel .verse').textContent(), poem.text);
  assert.equal(await page.locator('#original-panel .verse').getAttribute('lang'), 'it');
  assert.equal(await page.getByRole('link', { name: poem.sourceTitle }).getAttribute('href'), poem.source);
  assert.equal(await page.getByRole('link', { name: `${poem.contextSourceTitle} ↗` }).getAttribute('href'), poem.contextSource);
  assert.ok((await page.locator('.source-note').textContent()).includes('CC BY-SA 4.0'));
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.deepEqual(stored.saved, seed.saved);
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const item of selected) assert.equal(await staticPage.locator(`#index-original-Italian a[href$="/poems/${item.id}/"]`).count(), 1);
  for (const id of ['leopardi-canti-21', 'leopardi-canti-25', 'leopardi-canti-34']) {
    const item = poems.find(p => p.id === id);
    await staticPage.goto(`${base}poems/${id}/`);
    assert.equal(await staticPage.locator('#original-panel .verse').textContent(), item.text);
    assert.equal(await staticPage.getByRole('link', { name: item.sourceTitle }).getAttribute('href'), item.source);
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await staticPage.getByRole('link', { name: 'Giacomo Leopardi', exact: true }).click();
  assert.equal(new URL(staticPage.url()).pathname, '/ai-poems/poets/giacomo-leopardi/');
  for (const item of selected) assert.equal(await staticPage.locator(`a[href$="/poems/${item.id}/"]`).count(), 1);
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('Petrarch sonnets support Italian search, source credits and static mobile reading', async () => {
  const selected = poems.filter(p => p.id.startsWith('petrarch-rime-'));
  assert.equal(selected.length, 59);
  const seed = { saved: ['linfinito-leopardi'], recent: [], extra: { keep: true } };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=Italian#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'Italian' }).length} poems found`, { exact: true }).waitFor();
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await page.getByLabel('Search the poetry library').fill('Francesco Petrarca');
  await page.getByText('59 poems found', { exact: true }).waitFor();
  await page.getByLabel('Search the poetry library').fill('fuggir intenti');
  await page.getByText('1 poem found', { exact: true }).waitFor();
  const solo = selected.find(p => p.id === 'petrarch-rime-028');
  await page.locator(`#results a[href$="/poems/${solo.id}/"]`).click();
  assert.equal(await page.locator('#original-panel .verse').textContent(), solo.text);
  assert.equal(await page.getByRole('link', { name: solo.sourceTitle }).getAttribute('href'), solo.source);
  assert.equal(await page.getByRole('link', { name: `${solo.contextSourceTitle} ↗` }).getAttribute('href'), solo.contextSource);
  assert.ok((await page.locator('.source-note').textContent()).includes('CC BY-SA 4.0'));
  assert.ok((await page.locator('main').textContent()).includes('not the modern Canzoniere sequence'));
  await page.getByRole('button', { name: /Save poem/ }).click();
  await page.getByRole('status').getByText('Saved to your shelf.').waitFor();
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.ok(stored.saved.includes(seed.saved[0]));
  assert.ok(stored.saved.includes(solo.id));
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const item of selected) assert.equal(await staticPage.locator(`#index-original-Italian a[href$="/poems/${item.id}/"]`).count(), 1);
  for (const item of selected) {
    await staticPage.goto(`${base}poems/${item.id}/`);
    const verse = staticPage.locator('#original-panel .verse');
    assert.equal(await verse.textContent(), item.text);
    assert.equal(await verse.getAttribute('lang'), 'it');
    assert.equal(await verse.getAttribute('dir'), 'ltr');
    assert.equal(await staticPage.getByRole('link', { name: item.sourceTitle }).getAttribute('href'), item.source);
    assert.equal(await staticPage.getByRole('link', { name: `${item.contextSourceTitle} ↗` }).getAttribute('href'), item.contextSource);
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await staticPage.goto(`${base}poets/francesco-petrarca/`);
  for (const item of selected) assert.equal(await staticPage.locator(`a[href$="/poems/${item.id}/"]`).count(), 1);
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('Machado originals support Brazilian discovery, source credits and static reading', async () => {
  const selected = poems.filter(p => p.id.startsWith('machado-'));
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=Portuguese&country=Brazil#explore`);
  const count = filterPoems(poems, { language: 'Portuguese', country: 'Brazil' }).length;
  await page.getByText(`${count} poems found`, { exact: true }).waitFor();
  const seed = { saved: ['shakespeare-sonnet-18'], recent: [], extra: { keep: true } };
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await page.getByLabel('Search the poetry library').fill('bailando no ar');
  const matches = filterPoems(poems, { language: 'Portuguese', country: 'Brazil', query: 'bailando no ar' });
  await page.getByText(`${matches.length} ${matches.length === 1 ? 'poem' : 'poems'} found`, { exact: true }).waitFor();
  const poem = selected.find(p => p.id === 'machado-circulo-vicioso');
  await page.locator(`#results a[href$="/poems/${poem.id}/"]`).click();
  assert.equal(await page.locator('#original-panel .verse').textContent(), poem.text);
  assert.equal(await page.locator('#original-panel .verse').getAttribute('lang'), 'pt');
  assert.equal(await page.getByRole('link', { name: poem.sourceTitle }).getAttribute('href'), poem.source);
  assert.equal(await page.getByRole('link', { name: `${poem.contextSourceTitle} ↗` }).getAttribute('href'), poem.contextSource);
  assert.ok((await page.locator('.source-note').textContent()).includes('CC BY-SA 4.0'));
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.deepEqual(stored.saved, seed.saved);
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const item of selected) assert.equal(await staticPage.locator(`#index-original-Portuguese a[href$="/poems/${item.id}/"]`).count(), 1);
  for (const id of ['machado-circulo-vicioso', 'machado-fe', 'machado-caridade']) {
    const item = poems.find(p => p.id === id);
    await staticPage.goto(`${base}poems/${id}/`);
    assert.equal(await staticPage.locator('#original-panel .verse').textContent(), item.text);
    assert.equal(await staticPage.getByRole('link', { name: item.sourceTitle }).getAttribute('href'), item.source);
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await staticPage.getByRole('link', { name: 'Machado de Assis', exact: true }).click();
  assert.equal(new URL(staticPage.url()).pathname, '/ai-poems/poets/machado-de-assis/');
  for (const item of selected) assert.equal(await staticPage.locator(`a[href$="/poems/${item.id}/"]`).count(), 1);
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('Bashō travel verses support Japanese search, credits and static reading', async () => {
  const selected = poems.filter(p => p.id.startsWith('basho-oku-'));
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=Japanese#explore`);
  const count = filterPoems(poems, { language: 'Japanese' }).length;
  await page.getByText(`${count} poems found`, { exact: true }).waitFor();
  const seed = { saved: ['shakespeare-sonnet-18'], recent: [], extra: { keep: true } };
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await page.getByLabel('Search the poetry library').fill('閑さや岩にしみ入る');
  const matches = filterPoems(poems, { language: 'Japanese', query: '閑さや岩にしみ入る' });
  await page.getByText(`${matches.length} ${matches.length === 1 ? 'poem' : 'poems'} found`, { exact: true }).waitFor();
  const poem = selected.find(p => p.id === 'basho-oku-22');
  await page.locator(`#results a[href$="/poems/${poem.id}/"]`).click();
  assert.equal(await page.locator('#original-panel .verse').textContent(), poem.text);
  assert.equal(await page.locator('#original-panel .verse').getAttribute('lang'), 'ja');
  assert.equal(await page.getByRole('link', { name: poem.sourceTitle }).getAttribute('href'), poem.source);
  assert.equal(await page.getByRole('link', { name: `${poem.contextSourceTitle} ↗` }).getAttribute('href'), poem.contextSource);
  assert.ok((await page.locator('.source-note').textContent()).includes('CC BY-SA 4.0'));
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.deepEqual(stored.saved, seed.saved);
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const item of selected) assert.equal(await staticPage.locator(`#index-original-Japanese a[href$="/poems/${item.id}/"]`).count(), 1);
  for (const id of ['basho-oku-20', 'basho-oku-22', 'basho-oku-38', 'basho-oku-40', 'old-pond-basho', 'summer-grass-basho', 'mogami-river-basho']) {
    const item = poems.find(p => p.id === id);
    await staticPage.goto(`${base}poems/${id}/`);
    assert.equal(await staticPage.locator('#original-panel .verse').textContent(), item.text);
    assert.equal(await staticPage.getByRole('link', { name: item.sourceTitle }).getAttribute('href'), item.source);
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await staticPage.getByRole('link', { name: 'Matsuo Bashō', exact: true }).click();
  assert.equal(new URL(staticPage.url()).pathname, '/ai-poems/poets/matsuo-basho/');
  for (const item of selected) assert.equal(await staticPage.locator(`a[href$="/poems/${item.id}/"]`).count(), 1);
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('Bashō Nozarashi verses support search, credits and static reading', async () => {
  const selected = poems.filter(p => p.id.startsWith('basho-nozarashi-'));
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=Japanese&country=Japan#explore`);
  const count = filterPoems(poems, { language: 'Japanese', country: 'Japan' }).length;
  await page.getByText(`${count} poems found`, { exact: true }).waitFor();
  const seed = { saved: ['old-pond-basho'], recent: [], extra: { keep: true } };
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await page.getByLabel('Search the poetry library').fill('山路來て何やらゆかし');
  const matches = filterPoems(poems, { language: 'Japanese', country: 'Japan', query: '山路來て何やらゆかし' });
  await page.getByText(`${matches.length} ${matches.length === 1 ? 'poem' : 'poems'} found`, { exact: true }).waitFor();
  const poem = selected.find(p => p.id === 'basho-nozarashi-35');
  await page.locator(`#results a[href$="/poems/${poem.id}/"]`).click();
  assert.equal(await page.locator('#original-panel .verse').textContent(), poem.text);
  assert.equal(await page.locator('#original-panel .verse').getAttribute('lang'), 'ja');
  assert.equal(await page.getByRole('link', { name: poem.sourceTitle }).getAttribute('href'), poem.source);
  assert.equal(await page.getByRole('link', { name: `${poem.contextSourceTitle} ↗` }).getAttribute('href'), poem.contextSource);
  assert.match(await page.locator('.source-note').textContent(), /CC BY-SA 4\.0/);
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.deepEqual(stored.saved, seed.saved);
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const item of selected) assert.equal(await staticPage.locator(`#index-original-Japanese a[href$="/poems/${item.id}/"]`).count(), 1);
  for (const id of ['basho-nozarashi-15', 'basho-nozarashi-31', 'basho-nozarashi-35', 'basho-oku-22', 'old-pond-basho']) {
    const item = poems.find(p => p.id === id);
    await staticPage.goto(`${base}poems/${id}/`);
    assert.equal(await staticPage.locator('#original-panel .verse').textContent(), item.text);
    assert.equal(await staticPage.getByRole('link', { name: item.sourceTitle }).getAttribute('href'), item.source);
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await staticPage.getByRole('link', { name: 'Matsuo Bashō', exact: true }).click();
  assert.equal(new URL(staticPage.url()).pathname, '/ai-poems/poets/matsuo-basho/');
  for (const item of selected) assert.equal(await staticPage.locator(`a[href$="/poems/${item.id}/"]`).count(), 1);
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('Buson verses support search, preserved saves, credits and static reading', async () => {
  const selected = poems.filter(p => p.id.startsWith('buson-1926-'));
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=Japanese&country=Japan#explore`);
  const count = filterPoems(poems, { language: 'Japanese', country: 'Japan' }).length;
  await page.getByText(`${count} poems found`, { exact: true }).waitFor();
  const seed = { saved: ['spring-sea-buson'], recent: [], extra: { keep: true } };
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  const poem = selected.find(p => p.id === 'buson-1926-20');
  await page.getByLabel('Search the poetry library').fill(poem.text);
  await page.getByText('1 poem found', { exact: true }).waitFor();
  await page.locator(`#results a[href$="/poems/${poem.id}/"]`).click();
  assert.equal(await page.locator('#original-panel .verse').textContent(), poem.text);
  assert.equal(await page.locator('#original-panel .verse').getAttribute('lang'), 'ja');
  assert.equal(await page.getByRole('link', { name: poem.sourceTitle }).getAttribute('href'), poem.source);
  assert.equal(await page.getByRole('link', { name: `${poem.contextSourceTitle} ↗` }).getAttribute('href'), poem.contextSource);
  assert.match(await page.locator('.source-note').textContent(), /public domain in the United States/);
  await page.getByRole('button', { name: /Save poem/ }).click();
  assert.equal(await page.getByRole('button', { name: /Saved to your shelf/ }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('status').getByText('Saved to your shelf.').waitFor();
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.ok(stored.saved.includes('spring-sea-buson'));
  assert.ok(stored.saved.includes(poem.id));
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const item of selected) assert.equal(await staticPage.locator(`#index-original-Japanese a[href$="/poems/${item.id}/"]`).count(), 1);
  for (const id of ['buson-1926-01', 'buson-1926-12', 'buson-1926-20', 'buson-1926-30', 'spring-sea-buson', 'rapeseed-flowers-buson']) {
    const item = poems.find(p => p.id === id);
    await staticPage.goto(`${base}poems/${id}/`);
    assert.equal(await staticPage.locator('#original-panel .verse').textContent(), item.text);
    assert.equal(await staticPage.getByRole('link', { name: item.sourceTitle }).getAttribute('href'), item.source);
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await staticPage.getByRole('link', { name: 'Yosa Buson', exact: true }).click();
  assert.equal(new URL(staticPage.url()).pathname, '/ai-poems/poets/yosa-buson/');
  for (const item of selected) assert.equal(await staticPage.locator(`a[href$="/poems/${item.id}/"]`).count(), 1);
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('al-Mutanabbī poems support Arabic search, RTL, saved data and static reading', async () => {
  const selected = poems.filter(p => p.id.startsWith('mutanabbi-1890-'));
  assert.equal(selected.length, 10);
  const seed = { saved: ['let-the-days-do-as-they-will'], recent: [], extra: { keep: true } };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=Arabic#explore`);
  const count = filterPoems(poems, { language: 'Arabic' }).length;
  await page.getByText(`${count} poems found`, { exact: true }).waitFor();
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  const poem = selected[7];
  await page.getByLabel('Search the poetry library').fill(poem.title);
  await page.getByText('1 poem found', { exact: true }).waitFor();
  await page.locator(`#results a[href$="/poems/${poem.id}/"]`).click();
  assert.equal(await page.locator('#original-panel .verse').textContent(), poem.text);
  assert.equal(await page.locator('#original-panel .verse').getAttribute('lang'), 'ar');
  assert.equal(await page.locator('#original-panel .verse').getAttribute('dir'), 'rtl');
  assert.equal(await page.getByRole('link', { name: poem.sourceTitle }).getAttribute('href'), poem.source);
  assert.equal(await page.getByRole('link', { name: `${poem.contextSourceTitle} ↗` }).getAttribute('href'), poem.contextSource);
  await page.getByRole('button', { name: /Save poem/ }).click();
  await page.getByRole('status').getByText('Saved to your shelf.').waitFor();
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.ok(stored.saved.includes('let-the-days-do-as-they-will'));
  assert.ok(stored.saved.includes(poem.id));
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const item of selected) assert.equal(await staticPage.locator(`#index-original-Arabic a[href$="/poems/${item.id}/"]`).count(), 1);
  for (const item of selected) {
    await staticPage.goto(`${base}poems/${item.id}/`);
    const verse = staticPage.locator('#original-panel .verse');
    assert.equal(await verse.textContent(), item.text);
    assert.equal(await verse.getAttribute('lang'), 'ar');
    assert.equal(await verse.getAttribute('dir'), 'rtl');
    assert.equal(await staticPage.getByRole('link', { name: item.sourceTitle }).getAttribute('href'), item.source);
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await staticPage.getByRole('link', { name: 'al-Mutanabbī', exact: true }).click();
  assert.equal(new URL(staticPage.url()).pathname, '/ai-poems/poets/al-mutanabbi/');
  for (const item of selected) assert.equal(await staticPage.locator(`a[href$="/poems/${item.id}/"]`).count(), 1);
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('Abū Firās poems support Arabic search, RTL, saved data and static reading', async () => {
  const selected = poems.filter(poem => poem.id.startsWith('abu-firas-1895-'));
  assert.equal(selected.length, 10);
  const seed = { saved: ['let-the-days-do-as-they-will'], recent: [], extra: { keep: true } };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=Arabic#explore`);
  const count = filterPoems(poems, { language: 'Arabic' }).length;
  await page.getByText(`${count} poems found`, { exact: true }).waitFor();
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  const poem = selected.find(entry => entry.id === 'abu-firas-1895-dove');
  await page.getByLabel('Search the poetry library').fill(poem.title);
  await page.getByText('1 poem found', { exact: true }).waitFor();
  await page.locator(`#results a[href$="/poems/${poem.id}/"]`).click();
  const verse = page.locator('#original-panel .verse');
  assert.equal(await verse.textContent(), poem.text);
  assert.equal(await verse.getAttribute('lang'), 'ar');
  assert.equal(await verse.getAttribute('dir'), 'rtl');
  assert.equal(await page.getByRole('link', { name: poem.sourceTitle }).getAttribute('href'), poem.source);
  assert.equal(await page.getByRole('link', { name: `${poem.contextSourceTitle} ↗` }).getAttribute('href'), poem.contextSource);
  await page.getByRole('button', { name: /Save poem/ }).click();
  await page.getByRole('status').getByText('Saved to your shelf.').waitFor();
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.ok(stored.saved.includes('let-the-days-do-as-they-will'));
  assert.ok(stored.saved.includes(poem.id));
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const item of selected) assert.equal(await staticPage.locator(`#index-original-Arabic a[href$="/poems/${item.id}/"]`).count(), 1);
  for (const item of selected) {
    await staticPage.goto(`${base}poems/${item.id}/`);
    const original = staticPage.locator('#original-panel .verse');
    assert.equal(await original.textContent(), item.text);
    assert.equal(await original.getAttribute('lang'), 'ar');
    assert.equal(await original.getAttribute('dir'), 'rtl');
    assert.equal(await staticPage.getByRole('link', { name: item.sourceTitle }).getAttribute('href'), item.source);
    assert.equal(await staticPage.getByRole('link', { name: `${item.contextSourceTitle} ↗` }).getAttribute('href'), item.contextSource);
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await staticPage.getByRole('link', { name: 'Abū Firās al-Ḥamdānī', exact: true }).click();
  assert.equal(new URL(staticPage.url()).pathname, '/ai-poems/poets/abu-firas-al-hamdani/');
  for (const item of selected) assert.equal(await staticPage.locator(`a[href$="/poems/${item.id}/"]`).count(), 1);
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('al-Khansāʾ originals support Arabic search, source notes and static RTL reading', async () => {
  const selected = poems.filter(poem => poem.authorId === 'al-khansa');
  assert.equal(selected.length, 8);
  const seed = { saved: ['let-the-days-do-as-they-will'], recent: [], extra: { keep: true } };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=Arabic#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'Arabic' }).length} poems found`, { exact: true }).waitFor();
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await page.getByLabel('Search the poetry library').fill('الخنساء');
  const matches = filterPoems(poems, { language: 'Arabic', query: 'الخنساء' });
  assert.ok(matches.some(item => item.id === 'taymur-1303-biyad-al-afaf'));
  await page.getByText(`${matches.length} poems found`, { exact: true }).waitFor();
  const showMore = page.getByRole('button', { name: /Show more poems/ });
  while (await showMore.isVisible()) await showMore.click();
  for (const item of selected) assert.equal(await page.locator(`#results a[href$="/poems/${item.id}/"]`).count(), 1);
  assert.equal(await page.locator('#results a[href$="/poems/taymur-1303-biyad-al-afaf/"]').count(), 1);
  const poem = selected.find(item => item.id === 'khansa-1895-women-say');
  await page.getByLabel('Search the poetry library').fill(poem.title);
  await page.getByText('1 poem found', { exact: true }).waitFor();
  await page.locator(`#results a[href$="/poems/${poem.id}/"]`).click();
  const verse = page.locator('#original-panel .verse');
  assert.equal(await verse.textContent(), poem.text);
  assert.equal(await verse.getAttribute('lang'), 'ar');
  assert.equal(await verse.getAttribute('dir'), 'rtl');
  assert.equal(await page.getByRole('link', { name: poem.sourceTitle }).getAttribute('href'), poem.source);
  assert.equal(await page.getByRole('link', { name: `${poem.contextSourceTitle} ↗` }).getAttribute('href'), poem.contextSource);
  await page.getByRole('button', { name: /Save poem/ }).click();
  await page.getByRole('status').getByText('Saved to your shelf.').waitFor();
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.ok(stored.saved.includes('let-the-days-do-as-they-will'));
  assert.ok(stored.saved.includes(poem.id));
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const item of selected) assert.equal(await staticPage.locator(`#index-original-Arabic a[href$="/poems/${item.id}/"]`).count(), 1);
  for (const item of selected) {
    await staticPage.goto(`${base}poems/${item.id}/`);
    const original = staticPage.locator('#original-panel .verse');
    assert.equal(await original.textContent(), item.text);
    assert.equal(await original.getAttribute('lang'), 'ar');
    assert.equal(await original.getAttribute('dir'), 'rtl');
    assert.equal(await staticPage.getByRole('link', { name: item.sourceTitle }).getAttribute('href'), item.source);
    assert.equal(await staticPage.getByRole('link', { name: `${item.contextSourceTitle} ↗` }).getAttribute('href'), item.contextSource);
    assert.ok((await staticPage.locator('.source-note').textContent()).includes(item.rights));
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await staticPage.getByRole('link', { name: 'al-Khansāʾ', exact: true }).click();
  assert.equal(new URL(staticPage.url()).pathname, '/ai-poems/poets/al-khansa/');
  for (const item of selected) assert.equal(await staticPage.locator(`a[href$="/poems/${item.id}/"]`).count(), 1);
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('Warda al-Yazijī originals support Arabic search, saved data and static RTL reading', async () => {
  const selected = poems.filter(poem => poem.authorId === 'warda-al-yaziji');
  assert.equal(selected.length, 18);
  const seed = { saved: ['let-the-days-do-as-they-will'], recent: [], extra: { keep: true } };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=Arabic#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'Arabic' }).length} poems found`, { exact: true }).waitFor();
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await page.getByLabel('Search the poetry library').fill('وردة اليازجي');
  await page.getByText('18 poems found', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Show more poems/ }).click();
  await page.getByRole('button', { name: /Show more poems/ }).click();
  for (const item of selected) assert.equal(await page.locator(`#results a[href$="/poems/${item.id}/"]`).count(), 1);
  await page.getByLabel('Search the poetry library').fill('ذابت عليها بالصبابة مهجتي');
  await page.getByText('1 poem found', { exact: true }).waitFor();
  assert.equal(await page.locator('#results a[href$="/poems/warda-yaziji-more-friend-letter/"]').count(), 1);
  const poem = selected.find(item => item.id === 'warda-yaziji-1887-friend-away');
  await page.getByLabel('Search the poetry library').fill('فجرت دموعي كالسحائب عندما');
  await page.getByText('1 poem found', { exact: true }).waitFor();
  await page.locator(`#results a[href$="/poems/${poem.id}/"]`).click();
  const verse = page.locator('#original-panel .verse');
  assert.equal(await verse.textContent(), poem.text);
  assert.equal(await verse.getAttribute('lang'), 'ar');
  assert.equal(await verse.getAttribute('dir'), 'rtl');
  assert.equal(await page.getByRole('link', { name: poem.sourceTitle }).getAttribute('href'), poem.source);
  assert.equal(await page.getByRole('link', { name: `${poem.contextSourceTitle} ↗` }).getAttribute('href'), poem.contextSource);
  assert.ok((await page.locator('.source-note').textContent()).includes(poem.rights));
  await page.getByRole('button', { name: /Save poem/ }).click();
  await page.getByRole('status').getByText('Saved to your shelf.').waitFor();
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.ok(stored.saved.includes('let-the-days-do-as-they-will'));
  assert.ok(stored.saved.includes(poem.id));
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const item of selected) assert.equal(await staticPage.locator(`#index-original-Arabic a[href$="/poems/${item.id}/"]`).count(), 1);
  for (const item of selected) {
    await staticPage.goto(`${base}poems/${item.id}/`);
    const original = staticPage.locator('#original-panel .verse');
    assert.equal(await original.textContent(), item.text);
    assert.equal(await original.getAttribute('lang'), 'ar');
    assert.equal(await original.getAttribute('dir'), 'rtl');
    assert.equal(await staticPage.getByRole('link', { name: item.sourceTitle }).getAttribute('href'), item.source);
    assert.equal(await staticPage.getByRole('link', { name: `${item.contextSourceTitle} ↗` }).getAttribute('href'), item.contextSource);
    assert.ok((await staticPage.locator('.source-note').textContent()).includes(item.rights));
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await staticPage.getByRole('link', { name: 'Warda al-Yazijī', exact: true }).click();
  assert.equal(new URL(staticPage.url()).pathname, '/ai-poems/poets/warda-al-yaziji/');
  for (const item of selected) assert.equal(await staticPage.locator(`a[href$="/poems/${item.id}/"]`).count(), 1);
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('Marrash originals support Arabic discovery, faith and static RTL reading', async () => {
  const selected = poems.filter(poem => poem.authorId === 'maryana-marrash');
  assert.equal(selected.length, 12);
  const seed = { saved: ['let-the-days-do-as-they-will'], recent: [], extra: { keep: true } };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=Arabic#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'Arabic' }).length} poems found`, { exact: true }).waitFor();
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  for (const query of ['مريانا مراش', 'Maryana Marrash']) {
    await page.getByLabel('Search the poetry library').fill(query);
    await page.getByText('12 poems found', { exact: true }).waitFor();
    await page.getByRole('button', { name: /Show more poems/ }).click();
    for (const item of selected) assert.equal(await page.locator(`#results a[href$="/poems/${item.id}/"]`).count(), 1);
  }
  await page.getByLabel('Search the poetry library').fill('ليت النسا لا يلدن مثلهن');
  await page.getByText('1 poem found', { exact: true }).waitFor();
  assert.equal(await page.locator('#results a[href$="/poems/maryana-marrash-1893-salma-elegy/"]').count(), 1);
  const poem = selected.find(item => item.id === 'maryana-marrash-1893-mary-inscription');
  await page.goto(`${base}?language=Arabic&theme=Faith&q=${encodeURIComponent('مريانا مراش')}#explore`);
  await page.getByText('1 poem found', { exact: true }).waitFor();
  await page.locator(`#results a[href$="/poems/${poem.id}/"]`).click();
  const verse = page.locator('#original-panel .verse');
  assert.equal(await verse.textContent(), poem.text);
  assert.equal(await verse.getAttribute('lang'), 'ar');
  assert.equal(await verse.getAttribute('dir'), 'rtl');
  assert.equal(await page.getByRole('link', { name: poem.sourceTitle }).getAttribute('href'), poem.source);
  assert.equal(await page.getByRole('link', { name: `${poem.contextSourceTitle} ↗` }).getAttribute('href'), poem.contextSource);
  assert.ok((await page.locator('.source-note').textContent()).includes(poem.rights));
  await page.getByRole('button', { name: /Save poem/ }).click();
  await page.getByRole('status').getByText('Saved to your shelf.').waitFor();
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.ok(stored.saved.includes('let-the-days-do-as-they-will'));
  assert.ok(stored.saved.includes(poem.id));
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const item of selected) assert.equal(await staticPage.locator(`#index-original-Arabic a[href$="/poems/${item.id}/"]`).count(), 1);
  for (const item of selected) {
    await staticPage.goto(`${base}poems/${item.id}/`);
    const original = staticPage.locator('#original-panel .verse');
    assert.equal(await original.textContent(), item.text);
    assert.equal(await original.getAttribute('lang'), 'ar');
    assert.equal(await original.getAttribute('dir'), 'rtl');
    assert.equal(await staticPage.getByRole('link', { name: item.sourceTitle }).getAttribute('href'), item.source);
    assert.equal(await staticPage.getByRole('link', { name: `${item.contextSourceTitle} ↗` }).getAttribute('href'), item.contextSource);
    assert.ok((await staticPage.locator('.source-note').textContent()).includes(item.rights));
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await staticPage.getByRole('link', { name: 'Maryana Marrash', exact: true }).click();
  assert.equal(new URL(staticPage.url()).pathname, '/ai-poems/poets/maryana-marrash/');
  for (const item of selected) assert.equal(await staticPage.locator(`a[href$="/poems/${item.id}/"]`).count(), 1);
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('Taymur originals support Arabic search, saved data and static RTL reading', async () => {
  const selected = poems.filter(poem => poem.authorId === 'aisha-taymur');
  assert.equal(selected.length, 7);
  const seed = { saved: ['let-the-days-do-as-they-will'], recent: [], extra: { keep: true } };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=Arabic#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'Arabic' }).length} poems found`, { exact: true }).waitFor();
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await page.getByLabel('Search the poetry library').fill('عائشة التيمورية');
  await page.getByText('7 poems found', { exact: true }).waitFor();
  for (const item of selected) assert.equal(await page.locator(`#results a[href$="/poems/${item.id}/"]`).count(), 1);
  const poem = selected.find(item => item.id === 'taymur-1303-elegy-for-tawhida');
  await page.getByLabel('Search the poetry library').fill('Aisha Taymur');
  await page.getByText('7 poems found', { exact: true }).waitFor();
  await page.getByLabel('Search the poetry library').fill(poem.title);
  await page.getByText('1 poem found', { exact: true }).waitFor();
  await page.locator(`#results a[href$="/poems/${poem.id}/"]`).click();
  const verse = page.locator('#original-panel .verse');
  assert.equal(await verse.textContent(), poem.text);
  assert.equal(await verse.getAttribute('lang'), 'ar');
  assert.equal(await verse.getAttribute('dir'), 'rtl');
  assert.equal(await page.getByRole('link', { name: poem.sourceTitle }).getAttribute('href'), poem.source);
  assert.equal(await page.getByRole('link', { name: `${poem.contextSourceTitle} ↗` }).getAttribute('href'), poem.contextSource);
  assert.ok((await page.locator('.source-note').textContent()).includes(poem.rights));
  await page.getByRole('button', { name: /Save poem/ }).click();
  await page.getByRole('status').getByText('Saved to your shelf.').waitFor();
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.ok(stored.saved.includes('let-the-days-do-as-they-will'));
  assert.ok(stored.saved.includes(poem.id));
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const item of selected) assert.equal(await staticPage.locator(`#index-original-Arabic a[href$="/poems/${item.id}/"]`).count(), 1);
  for (const item of selected) {
    await staticPage.goto(`${base}poems/${item.id}/`);
    const original = staticPage.locator('#original-panel .verse');
    assert.equal(await original.textContent(), item.text);
    assert.equal(await original.getAttribute('lang'), 'ar');
    assert.equal(await original.getAttribute('dir'), 'rtl');
    assert.equal(await staticPage.getByRole('link', { name: item.sourceTitle }).getAttribute('href'), item.source);
    assert.equal(await staticPage.getByRole('link', { name: `${item.contextSourceTitle} ↗` }).getAttribute('href'), item.contextSource);
    assert.ok((await staticPage.locator('.source-note').textContent()).includes(item.rights));
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await staticPage.getByRole('link', { name: 'Aisha Taymur', exact: true }).click();
  assert.equal(new URL(staticPage.url()).pathname, '/ai-poems/poets/aisha-taymur/');
  for (const item of selected) assert.equal(await staticPage.locator(`a[href$="/poems/${item.id}/"]`).count(), 1);
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('Mutran magazine originals support complete-text search, saved data and static RTL reading', async () => {
  const selected = poems.filter(poem => poem.authorId === 'khalil-mutran');
  assert.equal(selected.length, 8);
  const seed = { saved: ['let-the-days-do-as-they-will'], recent: [], extra: { keep: true } };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=Arabic#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'Arabic' }).length} poems found`, { exact: true }).waitFor();
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await page.getByLabel('Search the poetry library').fill('خليل مطران');
  await page.getByText('8 poems found', { exact: true }).waitFor();
  for (const item of selected) assert.equal(await page.locator(`#results a[href$="/poems/${item.id}/"]`).count(), 1);
  await page.getByLabel('Search the poetry library').fill('Khalil Mutran');
  await page.getByText('8 poems found', { exact: true }).waitFor();
  const poem = selected.find(item => item.id === 'mutran-magazines-saba');
  await page.getByLabel('Search the poetry library').fill('معطفه رقة من الميد');
  await page.getByText('1 poem found', { exact: true }).waitFor();
  await page.locator(`#results a[href$="/poems/${poem.id}/"]`).click();
  const verse = page.locator('#original-panel .verse');
  assert.equal(await verse.textContent(), poem.text);
  assert.equal(await verse.getAttribute('lang'), 'ar');
  assert.equal(await verse.getAttribute('dir'), 'rtl');
  assert.equal(await page.getByRole('link', { name: poem.sourceTitle }).getAttribute('href'), poem.source);
  assert.equal(await page.getByRole('link', { name: `${poem.contextSourceTitle} ↗` }).getAttribute('href'), poem.contextSource);
  assert.ok((await page.locator('.source-note').textContent()).includes(poem.rights));
  await page.getByRole('button', { name: /Save poem/ }).click();
  await page.getByRole('status').getByText('Saved to your shelf.').waitFor();
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.ok(stored.saved.includes('let-the-days-do-as-they-will'));
  assert.ok(stored.saved.includes(poem.id));
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const item of selected) assert.equal(await staticPage.locator(`#index-original-Arabic a[href$="/poems/${item.id}/"]`).count(), 1);
  for (const item of selected) {
    await staticPage.goto(`${base}poems/${item.id}/`);
    const original = staticPage.locator('#original-panel .verse');
    assert.equal(await original.textContent(), item.text);
    assert.equal(await original.getAttribute('lang'), 'ar');
    assert.equal(await original.getAttribute('dir'), 'rtl');
    assert.equal(await staticPage.getByRole('link', { name: item.sourceTitle }).getAttribute('href'), item.source);
    assert.equal(await staticPage.getByRole('link', { name: `${item.contextSourceTitle} ↗` }).getAttribute('href'), item.contextSource);
    assert.ok((await staticPage.locator('.source-note').textContent()).includes(item.rights));
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await staticPage.getByRole('link', { name: 'Khalil Mutran', exact: true }).click();
  assert.equal(new URL(staticPage.url()).pathname, '/ai-poems/poets/khalil-mutran/');
  for (const item of selected) assert.equal(await staticPage.locator(`a[href$="/poems/${item.id}/"]`).count(), 1);
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('Sabri magazine originals support complete-text search, saved data and static RTL reading', async () => {
  const selected = poems.filter(poem => poem.authorId === 'ismail-sabri');
  assert.equal(selected.length, 6);
  const seed = { saved: ['let-the-days-do-as-they-will'], recent: [], extra: { keep: true } };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=Arabic#explore`);
  await page.getByText(`${filterPoems(poems, { language: 'Arabic' }).length} poems found`, { exact: true }).waitFor();
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  for (const query of ['إسماعيل صبري', 'Ismail Sabri']) {
    await page.getByLabel('Search the poetry library').fill(query);
    await page.getByText('6 poems found', { exact: true }).waitFor();
    for (const item of selected) assert.equal(await page.locator(`#results a[href$="/poems/${item.id}/"]`).count(), 1);
  }
  const poem = selected.find(item => item.id === 'sabri-magazines-friend');
  await page.getByLabel('Search the poetry library').fill('تقاص منك ظل');
  await page.getByText('1 poem found', { exact: true }).waitFor();
  await page.locator(`#results a[href$="/poems/${poem.id}/"]`).click();
  const verse = page.locator('#original-panel .verse');
  assert.equal(await verse.textContent(), poem.text);
  assert.equal(await verse.getAttribute('lang'), 'ar');
  assert.equal(await verse.getAttribute('dir'), 'rtl');
  assert.equal(await page.getByRole('link', { name: poem.sourceTitle }).getAttribute('href'), poem.source);
  assert.equal(await page.getByRole('link', { name: `${poem.contextSourceTitle} ↗` }).getAttribute('href'), poem.contextSource);
  assert.ok((await page.locator('.source-note').textContent()).includes(poem.rights));
  await page.getByRole('button', { name: /Save poem/ }).click();
  await page.getByRole('status').getByText('Saved to your shelf.').waitFor();
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.ok(stored.saved.includes(seed.saved[0]));
  assert.ok(stored.saved.includes(poem.id));
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const item of selected) assert.equal(await staticPage.locator(`#index-original-Arabic a[href$="/poems/${item.id}/"]`).count(), 1);
  for (const item of selected) {
    await staticPage.goto(`${base}poems/${item.id}/`);
    const original = staticPage.locator('#original-panel .verse');
    assert.equal(await original.textContent(), item.text);
    assert.equal(await original.getAttribute('lang'), 'ar');
    assert.equal(await original.getAttribute('dir'), 'rtl');
    assert.equal(await staticPage.getByRole('link', { name: item.sourceTitle }).getAttribute('href'), item.source);
    assert.equal(await staticPage.getByRole('link', { name: `${item.contextSourceTitle} ↗` }).getAttribute('href'), item.contextSource);
    assert.ok((await staticPage.locator('.source-note').textContent()).includes(item.rights));
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await staticPage.getByRole('link', { name: 'Ismail Sabri', exact: true }).click();
  assert.equal(new URL(staticPage.url()).pathname, '/ai-poems/poets/ismail-sabri/');
  for (const item of selected) assert.equal(await staticPage.locator(`a[href$="/poems/${item.id}/"]`).count(), 1);
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('Francis and Jacopone originals support search, sources, saved data and static reading', async () => {
  const selected = poems.filter(p => p.id === 'francis-laudes-creaturarum' || p.id.startsWith('jacopone-ferri-'));
  assert.equal(selected.length, 6);
  const seed = { saved: ['linfinito-leopardi'], recent: [], extra: { keep: true } };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=Italian#explore`);
  const count = filterPoems(poems, { language: 'Italian' }).length;
  await page.getByText(`${count} poems found`, { exact: true }).waitFor();
  await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  const poem = selected.find(p => p.id === 'jacopone-ferri-93');
  await page.getByLabel('Search the poetry library').fill('Donna del paradiso');
  await page.getByText('1 poem found', { exact: true }).waitFor();
  await page.locator(`#results a[href$="/poems/${poem.id}/"]`).click();
  assert.equal(await page.locator('#original-panel .verse').textContent(), poem.text);
  assert.match(await page.locator('#original-panel .verse').textContent(), /figlio, hatte la gente/);
  assert.equal(await page.getByRole('link', { name: poem.sourceTitle }).getAttribute('href'), poem.source);
  assert.equal(await page.getByRole('link', { name: `${poem.contextSourceTitle} ↗` }).getAttribute('href'), poem.contextSource);
  await page.getByRole('button', { name: /Save poem/ }).click();
  await page.getByRole('status').getByText('Saved to your shelf.').waitFor();
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
  assert.ok(stored.saved.includes('linfinito-leopardi'));
  assert.ok(stored.saved.includes(poem.id));
  assert.deepEqual(stored.extra, seed.extra);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base);
  await staticPage.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  await staticPage.locator('#complete-index summary').click();
  for (const item of selected) assert.equal(await staticPage.locator(`#index-original-Italian a[href$="/poems/${item.id}/"]`).count(), 1);
  for (const item of selected) {
    await staticPage.goto(`${base}poems/${item.id}/`);
    const verse = staticPage.locator('#original-panel .verse');
    assert.equal(await verse.textContent(), item.text);
    assert.equal(await verse.getAttribute('lang'), 'it');
    assert.equal(await verse.getAttribute('dir'), 'ltr');
    assert.equal(await staticPage.getByRole('link', { name: item.sourceTitle }).getAttribute('href'), item.source);
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  for (const [poet, id] of [['francis-of-assisi', 'francis-laudes-creaturarum'], ['jacopone-da-todi', 'jacopone-ferri-93']]) {
    await staticPage.goto(`${base}poets/${poet}/`);
    assert.equal(await staticPage.locator(`a[href$="/poems/${id}/"]`).count(), 1);
  }
  assert.deepEqual(JSON.parse(await staticPage.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await staticContext.close();
});

test('reviewed poet places have matching counts, sources and static reader pages', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  await page.locator('#countries .more-countries summary').click();
  for (const [place, code, id] of [['Canada', 'ca', 'american-1922-00633'], ['Chile', 'cl', 'castellana-072']]) {
    const card = page.locator('#countries').getByRole('link', { name: `${place} 1 poem` });
    assert.equal(await card.locator('img').getAttribute('src'), `/ai-poems/assets/flags/${code}.svg`);
    await card.click();
    await page.getByText('1 poem found', { exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('country'), place);
    assert.equal(await page.locator(`#results a[href*="/poems/${id}/"]`).count(), 1);
    await page.goto(base);
    await page.getByText(totalText).waitFor();
    await page.locator('#countries .more-countries summary').click();
  }
  for (const [place, author] of [['England', 'Andrés Bello'], ['Venezuela', 'Andrés Bello'], ['United States', 'R. Nathaniel Dett']]) {
    const params = new URLSearchParams({ country: place, author });
    await page.goto(`${base}?${params}#explore`);
    await page.getByText('1 poem found', { exact: true }).waitFor();
    assert.equal(await page.locator('#filter-country').inputValue(), place);
    assert.equal(await page.locator('#filter-country option:checked').textContent(), `${place} (1)`);
  }
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const staticPage = await staticContext.newPage();
  for (const [id, years] of [['castellana-072', '1781–1865'], ['american-1922-00633', '1882–1943']]) {
    const poem = poems.find(p => p.id === id);
    await staticPage.goto(`${base}poems/${id}/`);
    assert.equal(await staticPage.locator('#original-panel .verse').textContent(), poem.text);
    assert.equal(await staticPage.getByRole('link', { name: poem.sourceTitle }).getAttribute('href'), poem.source);
    assert.equal(await staticPage.getByRole('link', { name: `${poem.contextSourceTitle} ↗` }).getAttribute('href'), poem.contextSource);
    assert.equal(await staticPage.locator('.context-card dt').evaluateAll(items => items.find(item => item.textContent === 'Created in')?.nextElementSibling?.textContent), 'Not established');
    assert.match(await staticPage.locator('.story').textContent(), /places describe the poet, not necessarily where this poem was written/);
    await staticPage.getByRole('link', { name: poem.author, exact: true }).click();
    assert.equal(new URL(staticPage.url()).pathname, `/ai-poems/poets/${poem.authorId}/`);
    const facts = await staticPage.locator('.poet-facts').textContent();
    assert.match(facts, new RegExp(years));
    for (const place of associatedPlaces(poem)) assert.ok(facts.includes(place));
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await staticContext.close();
});

test('filter option counts follow the other filters without changing values or accessible chips', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?country=Jamaica&language=English#explore`);
  await page.getByText(`${filterPoems(poems, { country: 'Jamaica', language: 'English' }).length} poems found`).waitFor();
  await page.locator('#filter-summary').click();
  await page.locator('#advanced-filters summary').click();
  const option = (name, value) => page.locator(`#filter-${name}`).evaluate((select, selected) => [...select.options].find(item => item.value === selected)?.textContent, value);
  const expected = filters => filterPoems(poems, filters).length.toLocaleString('en-US');
  assert.equal(await option('country', ''), `All places (${expected({ language: 'English' })})`);
  assert.equal(await option('country', 'United States'), `United States (${expected({ language: 'English', country: 'United States' })})`);
  assert.equal(await option('country', 'Jamaica'), `Jamaica (${expected({ language: 'English', country: 'Jamaica' })})`);
  assert.equal(await option('language', 'French'), `French (${expected({ country: 'Jamaica', language: 'French' })})`);
  assert.equal(await option('length', '5-14'), `5–14 lines (${expected({ country: 'Jamaica', language: 'English', length: '5-14' })})`);
  assert.equal(await option('translation', ''), `All poems (${expected({ country: 'Jamaica', language: 'English' })})`);
  assert.equal(await page.locator('#filter-country').getAttribute('aria-describedby'), 'filter-count-note');
  assert.equal(await page.getByRole('button', { name: 'Remove Country or region: Jamaica filter' }).count(), 1);
  assert.equal(new URL(page.url()).searchParams.get('country'), 'Jamaica');
  await page.getByLabel('Search the poetry library').fill('nothing-matches-this-phrase');
  await page.getByText('0 poems found').waitFor();
  assert.equal(await option('country', 'United States'), 'United States (0)');
  assert.equal(await option('language', 'English'), 'English (0)');
  assert.equal(await page.locator('#filter-country').inputValue(), 'Jamaica');
  await page.reload();
  await page.getByText('0 poems found').waitFor();
  assert.equal(await page.locator('#filter-country').inputValue(), 'Jamaica');
  assert.equal(await option('country', 'Jamaica'), 'Jamaica (0)');
  await page.locator('#filter-summary').click();
  await page.locator('#advanced-filters summary').click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px`);
  }
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), []);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}?readable=Arabic#explore`);
  await page.getByText(`${filterPoems(poems, { readable: 'Arabic' }).length} poems found`).waitFor();
  assert.equal(await option('language', 'Chinese'), `Chinese (${expected({ readable: 'Arabic', language: 'Chinese' })})`);
  await page.locator('#filter-summary').click();
  const language = page.locator('#filter-language');
  await language.focus();
  await language.selectOption('Chinese');
  assert.equal(await language.inputValue(), 'Chinese');
  assert.equal(await language.evaluate(element => document.activeElement === element), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#filter-readable').evaluate(element => document.activeElement === element), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#filter-country').evaluate(element => document.activeElement === element), true);
  await context.close();
});

test('length filters and search journeys work on mobile', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  let releaseCatalogue;
  const catalogueGate = new Promise(resolve => { releaseCatalogue = resolve; });
  await page.route('**/data/catalog.json', async route => { await catalogueGate; await route.continue(); });
  const requested = page.waitForRequest('**/data/catalog.json');
  try {
    await page.goto(`${base}?country=Italy&length=5-14#explore`, { waitUntil: 'commit' });
    await requested;
    assert.equal(await page.locator('#advanced-filters').getAttribute('open'), null);
  } finally { releaseCatalogue(); }
  const shortCount = filterPoems(poems, { country: 'Italy', length: '5-14' }).length;
  await page.getByText(`${shortCount} ${shortCount === 1 ? 'poem' : 'poems'} found`).waitFor();
  assert.equal(await page.locator('#advanced-filters').getAttribute('open'), '');
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
  assert.equal(await page.locator('#static-reading-note').isVisible(), false);
  assert.equal(await page.locator('#translations').getAttribute('open'), null);
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

test('related poems explain varied suggestions and keep authored connections distinct', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}poems/shakespeare-sonnet-18/`);
  const related = page.locator('.related-section');
  assert.equal(await related.getByText(/not claims of historical influence/).isVisible(), true);
  assert.equal(await related.locator('.poem-card').count(), 3);
  const labels = await related.locator('.card-reason').allTextContents();
  assert.equal(labels[0], 'Same poet');
  assert.ok(labels.some(label => label.startsWith('Shared theme:')));
  assert.ok(labels.some(label => label.startsWith('Same original language:')));
  const links = await related.locator('.poem-card-link').evaluateAll(elements => elements.map(element => element.getAttribute('href')));
  assert.equal(new Set(links).size, links.length);
  assert.ok(!links.includes('/ai-poems/poems/shakespeare-sonnet-18/'));
  const save = related.locator('[data-save]').first();
  await save.click();
  assert.equal(await save.getAttribute('aria-pressed'), 'true');
  await page.getByRole('status').getByText('Saved to your shelf.').waitFor();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `related poems fit at ${width}px`);
  }
  for (const theme of ['light', 'sepia', 'dark']) {
    await page.getByLabel('Reading theme').selectOption(theme);
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], `related poems / ${theme}`);
  }
  await page.goto(`${base}poems/linfinito-leopardi/`);
  assert.equal(await page.locator('.connections-section').getByRole('link', { name: /La sera del giorno festivo/ }).count(), 1);
  assert.equal(await page.locator('.related-section a[href="/ai-poems/poems/leopardi-sera-giorno-festivo/"]').count(), 0);
  await context.close();
});

test('varied related poems remain readable and navigable without JavaScript', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}poems/shakespeare-sonnet-18/`);
  const section = page.locator('.related-section');
  assert.equal(await section.locator('.poem-card').count(), 3);
  assert.equal(await section.locator('.card-reason').first().textContent(), 'Same poet');
  assert.equal(await section.locator('[data-save]').first().isVisible(), false);
  const firstChoice = await section.locator('.poem-card-link').first().getAttribute('href');
  await page.goto(`${base}poems/shakespeare-sonnet-19/`);
  assert.notEqual(await section.locator('.poem-card-link').first().getAttribute('href'), firstChoice);
  const choice = section.locator('.poem-card-link').first();
  const target = await choice.getAttribute('href');
  await choice.focus();
  const navigation = page.waitForURL(url => url.pathname === target);
  await page.keyboard.press('Enter');
  await navigation;
  assert.equal(new URL(page.url()).pathname, target);
  assert.equal(await page.locator('#original-panel .verse').isVisible(), true);
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
  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem('verso-library-v1') || '{}');
    return state.focus === true && state.typeface === 'clear' && state.font === 1;
  });
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

test('focus mode is saved before a reload is treated as durable', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  await installReadingStateClock(context);
  const page = await context.newPage();
  await page.goto(`${base}poems/shakespeare-sonnet-18/`);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('verso-library-v1') || '{}').recent?.includes('shakespeare-sonnet-18'));
  const holder = await context.newPage();
  await holder.goto(base);
  await pauseReadingStateClock(context);
  await holdReadingStateLock(holder);
  try {
    await page.getByRole('button', { name: 'Focus mode' }).click();
    assert.equal(await page.getByRole('button', { name: 'Exit focus mode' }).isVisible(), true);
    assert.notEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('verso-library-v1')).focus), true);
    await page.getByRole('status').getByText('Saving changes…').waitFor();
    assert.equal(await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }), true);
    await holder.evaluate(() => window.releaseTestLock());
    await page.getByRole('status').getByText('Focus mode on.').waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('verso-library-v1')).focus), true);
    assert.equal(await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }), false);
    await page.reload();
    await page.getByRole('button', { name: 'Exit focus mode' }).waitFor();
  } finally {
    await holder.evaluate(() => window.releaseTestLock?.());
    await context.close();
  }
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

test('homepage entry and reading preference remain clear and usable at small widths', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  await page.evaluate(() => document.fonts.ready);
  const preferred = page.getByLabel('Preferred reading language', { exact: true });
  assert.equal(await preferred.inputValue(), '');
  assert.equal(await preferred.locator('option:checked').textContent(), 'No preference');
  assert.equal(await page.locator('.announcement').count(), 0);
  assert.equal(await page.locator('.hero').getByRole('link', { name: /Find a poem/ }).getAttribute('href'), '#explore');
  assert.equal(await page.locator('.trust-strip').textContent(), '♡ Free to read✧ No account needed');
  for (const width of [320, 390, 401, 440, 441, 768, 900, 1050, 1051, 1100, 1200, 1201, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await page.evaluate(() => {
      const select = document.querySelector('[data-preferred-language]');
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      context.font = getComputedStyle(select).font;
      return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, selectWidth: select.clientWidth, textWidth: context.measureText(select.selectedOptions[0].textContent).width };
    });
    assert.ok(layout.documentWidth <= layout.viewport + 1, `${width}px ${JSON.stringify(layout)}`);
    assert.ok(layout.selectWidth >= layout.textWidth + 16, `preference label should fit at ${width}px ${JSON.stringify(layout)}`);
    const controls = await page.locator('.nav-actions select:visible').evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height };
    }));
    assert.equal(controls.length, 2);
    assert.ok(controls.every(box => box.width >= 44 && box.height >= 44), `${width}px ${JSON.stringify(controls)}`);
    const targets = await page.locator('.site-header a:visible, .hero-actions a:visible').evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect();
      return { label: element.getAttribute('aria-label') || element.textContent.trim(), width: box.width, height: box.height };
    }));
    assert.ok(targets.every(box => box.width >= 44 && box.height >= 44), `${width}px ${JSON.stringify(targets)}`);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  const wideFallback = await page.addStyleTag({ content: '.site-header, .site-header * { font-family: monospace !important; }' });
  const wideLayout = await page.evaluate(() => {
    const select = document.querySelector('[data-preferred-language]');
    const context = document.createElement('canvas').getContext('2d');
    context.font = getComputedStyle(select).font;
    return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, selectWidth: select.clientWidth, textWidth: context.measureText(select.selectedOptions[0].textContent).width };
  });
  assert.ok(wideLayout.documentWidth <= wideLayout.viewport + 1, JSON.stringify(wideLayout));
  assert.ok(wideLayout.selectWidth >= wideLayout.textWidth + 16, JSON.stringify(wideLayout));
  await wideFallback.evaluate(element => element.remove());
  await preferred.selectOption('Portuguese');
  await page.getByRole('status').getByText('Language preference saved.').waitFor();
  await page.reload();
  assert.equal(await preferred.inputValue(), 'Portuguese');
  await preferred.selectOption('');
  await page.getByRole('status').getByText('Language preference saved.').waitFor();
  await page.reload();
  assert.equal(await preferred.inputValue(), '');
  assert.equal(await preferred.locator('option:checked').textContent(), 'No preference');
  await page.locator('.hero').getByRole('link', { name: /Find a poem/ }).focus();
  await page.keyboard.press('Enter');
  assert.equal(new URL(page.url()).hash, '#explore');
  assert.equal(await page.locator('#search').isEnabled(), true);
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

test('hero text remains legible over the artwork at mobile and tablet widths', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('verso-library-v1', JSON.stringify({ theme: 'dark', saved: [], recent: [] })));
  const page = await context.newPage();
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.hero-eyebrow span').evaluate(element => { element.style.visibility = 'hidden'; });
  for (const width of [320, 401, 701, 730]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [selector, minimum] of [['.hero-eyebrow', 4.5], ['.hero h1 em', 3], ['.hero-copy', 4.5]]) {
      const text = page.locator(selector);
      const info = await text.evaluate(element => ({ color: getComputedStyle(element).color, rect: element.getBoundingClientRect().toJSON() }));
      const visible = (await page.screenshot()).toString('base64');
      await text.evaluate(element => { element.style.visibility = 'hidden'; });
      const backdrop = (await page.screenshot()).toString('base64');
      await text.evaluate(element => { element.style.visibility = ''; });
      const contrast = await page.evaluate(async ({ visible, backdrop, info }) => {
        const pixels = async data => {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width; canvas.height = image.height;
          const context = canvas.getContext('2d');
          context.drawImage(image, 0, 0);
          return context;
        };
        const first = await pixels(visible), second = await pixels(backdrop);
        const left = Math.max(0, Math.ceil(info.rect.left)), top = Math.max(0, Math.ceil(info.rect.top));
        const right = Math.min(innerWidth, Math.floor(info.rect.right)), bottom = Math.min(innerHeight, Math.floor(info.rect.bottom));
        const visiblePixels = first.getImageData(left, top, right - left, bottom - top).data;
        const backgroundPixels = second.getImageData(left, top, right - left, bottom - top).data;
        const luminance = color => {
          const channels = color.map(value => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        const foreground = luminance(info.color.match(/[\d.]+/g).map(Number).slice(0, 3));
        let samples = 0, lowest = Infinity;
        for (let index = 0; index < visiblePixels.length; index += 4) {
          const difference = [0, 1, 2].reduce((sum, offset) => sum + Math.abs(visiblePixels[index + offset] - backgroundPixels[index + offset]), 0);
          if (difference <= 40) continue;
          const background = luminance([...backgroundPixels.slice(index, index + 3)]);
          lowest = Math.min(lowest, (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05));
          samples++;
        }
        return { samples, lowest };
      }, { visible, backdrop, info });
      assert.ok(contrast.samples > 20 && contrast.lowest >= minimum, `${width}px ${selector}: ${JSON.stringify(contrast)}`);
    }
  }
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
    await page.getByRole('status').getByText('Theme saved.').waitFor();
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], `focus / ${theme}`);
  }
  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem('verso-library-v1') || '{}');
    return state.focus === true && state.theme === 'dark' && state.preferredLanguage === 'Arabic';
  });
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

test('language availability is directly discoverable without changing the reading preference', async () => {
  const seed = { preferredLanguage: 'Portuguese', language: 'Portuguese', saved: ['shakespeare-sonnet-18'], recent: [], extra: { keep: true } };
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  await context.addInitScript(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
  const page = await context.newPage();
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  await page.locator('#filter-summary').click();
  const available = page.getByRole('combobox', { name: 'Available in (original or translation)', exact: true });
  const preferred = page.getByLabel('Preferred reading language', { exact: true });
  assert.equal(await preferred.inputValue(), 'Portuguese');
  for (const language of readingLanguages) {
    const count = filterPoems(poems, { readable: language }).length;
    assert.equal(await available.locator(`option[value="${language}"]`).textContent(), `${language} (${count.toLocaleString('en-US')})`);
  }
  await page.getByLabel('Original language').focus();
  await page.keyboard.press('Tab');
  assert.equal(await available.evaluate(element => document.activeElement === element), true);
  await page.keyboard.press('a');
  const arabic = filterPoems(poems, { readable: 'Arabic' }).length;
  await page.getByText(`${arabic} poems found`, { exact: true }).waitFor();
  assert.equal(await available.inputValue(), 'Arabic');
  assert.equal(new URL(page.url()).searchParams.get('readable'), 'Arabic');
  assert.match(await page.locator('#readable-note').textContent(), /originals and available translations.*AI-assisted.*not yet independently reviewed/);
  assert.equal(await preferred.inputValue(), 'Portuguese');
  assert.equal(await page.getByRole('button', { name: 'Show poems available in Portuguese' }).getAttribute('aria-pressed'), 'false');
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  await page.getByLabel('Original language').selectOption('Chinese');
  const arabicChinese = filterPoems(poems, { readable: 'Arabic', language: 'Chinese' });
  await page.getByText(`${arabicChinese.length} poem found`, { exact: true }).waitFor();
  assert.ok(arabicChinese.some(poem => poem.id === 'quiet-night-thought-li-bai'));
  for (const language of readingLanguages) {
    const count = filterPoems(poems, { readable: language, language: 'Chinese' }).length;
    assert.equal(await available.locator(`option[value="${language}"]`).textContent(), `${language} (${count.toLocaleString('en-US')})`);
  }
  assert.equal(await available.locator('option[value="Italian"]').textContent(), 'Italian (1)');
  await page.getByRole('button', { name: 'Show poems available in Portuguese' }).click();
  assert.equal(await available.inputValue(), 'Portuguese');
  assert.equal(new URL(page.url()).searchParams.get('readable'), 'Portuguese');
  assert.equal(await page.getByRole('button', { name: 'Show poems available in Portuguese' }).getAttribute('aria-pressed'), 'true');
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1'))), seed);
  for (const width of [320, 390, 700, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const box = await available.boundingBox();
    assert.ok(box && box.width >= 44 && box.height >= 44, `language target at ${width}px`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px`);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  for (const theme of ['light', 'sepia', 'dark']) {
    await page.getByLabel('Reading theme').selectOption(theme);
    await page.getByRole('status').getByText('Theme saved.').waitFor();
    const accessibility = await new AxeBuilder({ page }).include('.filter-drawer').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], theme);
  }
  await context.close();
});

test('unknown available-language links remain zero-result filters and survive reload', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const value = 'Unavailable <language>';
  await page.goto(`${base}?readable=${encodeURIComponent(value)}#explore`);
  await page.getByText('0 poems found', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('readable'), value);
  await page.locator('#filter-summary').click();
  const available = page.getByRole('combobox', { name: 'Available in (original or translation)', exact: true });
  assert.equal(await available.inputValue(), value);
  assert.equal(await available.locator('option:checked').textContent(), `${value} (0)`);
  assert.equal(await page.getByRole('button', { name: `Remove Available in: ${value} filter` }).count(), 1);
  await page.reload();
  await page.getByText('0 poems found', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('readable'), value);
  await page.locator('#filter-summary').click();
  assert.equal(await available.inputValue(), value);
  await page.getByRole('button', { name: `Remove Available in: ${value} filter` }).click();
  await page.getByText(totalText).waitFor();
  assert.equal(new URL(page.url()).searchParams.has('readable'), false);
  await context.close();
});

test('available-language options include catalogue languages and count overlapping translations once', async () => {
  const translation = { language: 'Welsh', title: 'Test', text: 'Test' };
  const sample = [
    { ...poems[0], id: 'language-sample-a', language: 'English', translations: [translation, translation] },
    { ...poems[0], id: 'language-sample-b', language: 'Welsh', translations: [translation] },
    { ...poems[0], id: 'language-sample-c', language: 'French', translations: [] },
  ];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.route('**/ai-poems/', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: renderHome(sample, '/ai-poems/') }));
  await page.route('**/data/catalog.json', route => route.fulfill({ contentType: 'application/json; charset=utf-8', body: JSON.stringify(sample) }));
  await page.goto(base);
  await page.getByText('3 poems found', { exact: true }).waitFor();
  await page.locator('#filter-summary').click();
  const available = page.getByRole('combobox', { name: 'Available in (original or translation)', exact: true });
  assert.equal(await available.locator('option[value="Welsh"]').textContent(), 'Welsh (2)');
  assert.equal(await available.locator('option[value="Arabic"]').textContent(), 'Arabic (0)');
  await available.selectOption('Welsh');
  await page.getByText('2 poems found', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('readable'), 'Welsh');
  await available.selectOption('Arabic');
  await page.getByText('0 poems found', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('readable'), 'Arabic');
  await context.close();
});

test('language discovery falls back to the static index when scripts or the catalogue fail', async () => {
  for (const mode of ['no JavaScript', 'catalogue failure', 'module failure']) {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 }, javaScriptEnabled: mode !== 'no JavaScript', reducedMotion: 'reduce' });
    const page = await context.newPage();
    if (mode === 'catalogue failure') await page.route('**/data/catalog.json', route => route.abort());
    if (mode === 'module failure') await page.route('**/app.mjs', route => route.abort());
    await page.goto(base);
    if (mode === 'catalogue failure') await page.getByText(/The library could not load/).waitFor();
    const seed = JSON.stringify({ saved: ['shakespeare-sonnet-18'], recent: [], extra: { keep: true } });
    await page.evaluate(value => localStorage.setItem('verso-library-v1', value), seed);
    assert.equal(await page.locator('#filter-readable').isDisabled(), true, mode);
    assert.equal(await page.locator('#filter-readable').isVisible(), false, mode);
    await page.locator('#complete-index summary').click();
    assert.equal(await page.locator('#complete-index').getByRole('link', { name: /The Old Pond — Matsuo Bashō/ }).count(), 1, mode);
    assert.equal(await page.evaluate(() => localStorage.getItem('verso-library-v1')), seed, mode);
    await context.close();
  }
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

test('availability links preserve year filters and mobile browser history', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const filters = { readable: 'English', from: '1800', to: '1899' };
  const expected = filterPoems(poems, filters).length;
  const resultText = `${expected} ${expected === 1 ? 'poem' : 'poems'} found`;
  await page.goto(`${base}?readable=English&from=1800&to=1899#explore`);
  await page.getByText(resultText, { exact: true }).waitFor();
  await page.locator('#filter-summary').click();
  const available = page.getByRole('combobox', { name: 'Available in (original or translation)', exact: true });
  assert.equal(await available.inputValue(), 'English');
  assert.equal(await page.locator('#filter-from').inputValue(), '1800');
  assert.equal(await page.locator('#filter-to').inputValue(), '1899');
  assert.equal(await page.getByLabel('Preferred reading language', { exact: true }).inputValue(), '');
  await page.goto(`${base}?readable=Arabic#explore`);
  await page.getByText(`${filterPoems(poems, { readable: 'Arabic' }).length} poems found`, { exact: true }).waitFor();
  await page.goBack();
  await page.getByText(resultText, { exact: true }).waitFor();
  if (await page.locator('#filter-drawer').getAttribute('open') === null) await page.locator('#filter-summary').click();
  assert.equal(await available.inputValue(), 'English');
  assert.equal(await page.locator('#filter-from').inputValue(), '1800');
  assert.equal(await page.locator('#filter-to').inputValue(), '1899');
  assert.equal(new URL(page.url()).searchParams.get('readable'), 'English');
  assert.equal(await page.getByLabel('Preferred reading language', { exact: true }).inputValue(), '');
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
  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem('verso-library-v1') || '{}');
    return state.focus === true && state.language === 'Arabic';
  });
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
  assert.equal(await page.locator('.poet-directory').isVisible(), true);
  assert.equal(await page.locator('#poets').getByText(/Poet filters need JavaScript/).count(), 0);
  await context.close();
});

test('the collection label is neutral without changing historical attribution or text', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const page = await context.newPage();
  const poem = poems.find(p => p.id === 'american-1922-00659');
  await page.goto(`${base}poems/${poem.id}/`);
  const collection = await page.locator('.context-card dt').evaluateAll(items => items.find(item => item.textContent === 'Collection')?.nextElementSibling?.textContent);
  assert.equal(collection, 'American poetry · 1922 anthology');
  assert.equal(await page.getByRole('link', { name: poem.sourceTitle }).getAttribute('href'), poem.source);
  assert.equal(await page.locator('#original-panel .verse').textContent(), poem.text);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();
});

test('Japanese additions are searchable and readable on mobile with and without JavaScript', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?language=Japanese&country=Japan#explore`);
  const japanese = filterPoems(poems, { language: 'Japanese', country: 'Japan' }).length;
  await page.getByText(`${japanese} poems found`).waitFor();
  assert.equal(japanese, 5 + poems.filter(p => p.id.startsWith('basho-oku-') || p.id.startsWith('basho-nozarashi-') || p.id.startsWith('buson-1926-')).length);
  await page.getByLabel('Search the poetry library').fill('のたりのたり');
  await page.getByText('1 poem found').waitFor();
  const result = page.locator('#results .poem-card-link');
  assert.equal(await result.getAttribute('href'), '/ai-poems/poems/spring-sea-buson/');
  await result.click();
  assert.equal(await page.locator('#original-panel .verse').textContent(), '春の海ひねもすのたりのたりかな');
  assert.equal(await page.locator('#original-panel .verse').getAttribute('lang'), 'ja');
  assert.equal(await page.getByText('Original only · translation not yet available').isVisible(), true);
  assert.ok(await page.locator('.source-note a[href="https://dl.ndl.go.jp/pid/875927/1/75"]').count());
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), []);
  await context.close();

  const staticContext = await browser.newContext({ viewport: { width: 320, height: 844 }, javaScriptEnabled: false, reducedMotion: 'reduce' });
  const staticPage = await staticContext.newPage();
  for (const id of ['summer-grass-basho', 'mogami-river-basho', 'rapeseed-flowers-buson', 'spring-sea-buson']) {
    const poem = poems.find(p => p.id === id);
    assert.equal((await staticPage.goto(`${base}poems/${id}/`)).status(), 200);
    assert.equal(await staticPage.locator('#original-panel .verse').textContent(), poem.text);
    assert.equal(await staticPage.getByText(/available in the original only/).isVisible(), true);
    assert.equal(await staticPage.locator('#translations').count(), 0);
    assert.equal(await staticPage.locator('.source-note a').getAttribute('href'), poem.source);
    assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), id);
  }
  await staticContext.close();
});

test('without JavaScript, translations and their sources are discoverable without dead controls', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, javaScriptEnabled: false, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}poems/quiet-night-thought-li-bai/`);
  assert.equal(await page.locator('#original-panel .verse').isVisible(), true);
  assert.equal(await page.locator('#translation-select').isDisabled(), true);
  assert.equal(await page.locator('#translation-select').isVisible(), false);
  assert.equal(await page.getByRole('button', { name: 'Translation', exact: true }).count(), 0);
  assert.equal(await page.locator('.reader-save').isDisabled(), true);
  assert.equal(await page.locator('.reader-save').isVisible(), false);
  const translations = page.locator('#translations');
  assert.equal(await translations.getAttribute('open'), '');
  assert.equal(await translations.locator('section').count(), 7);
  assert.equal(await translations.locator('.verse[lang="ar"][dir="rtl"]').count(), 1);
  assert.ok(await translations.getByText(/AI-assisted, not yet independently reviewed/).count() > 0);
  assert.equal(await translations.locator('section a[href^="https://"]').count(), 7);
  const jump = page.getByRole('link', { name: /Read the available translations and reading aids/ });
  await jump.focus();
  await page.keyboard.press('Enter');
  assert.equal(new URL(page.url()).hash, '#translations');
  assert.equal(await translations.locator('section').first().isVisible(), true);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `static reader fits at ${width}px`);
  }
  await page.goto(`${base}poems/old-pond-basho/`);
  const hearn = poems.find(poem => poem.id === 'old-pond-basho').translations[0];
  assert.equal(await page.locator('#translations').getAttribute('open'), '');
  assert.equal(await page.locator('#translations').getByText('Lafcadio Hearn, 1898').isVisible(), true);
  assert.equal(await page.locator('#translations').getByRole('link', { name: /Source/ }).getAttribute('href'), hearn.source);
  await page.goto(`${base}poems/shakespeare-sonnet-18/`);
  assert.equal(await page.locator('#original-panel .verse').isVisible(), true);
  assert.equal(await page.locator('#translations').count(), 0);
  assert.equal(await page.getByText(/available in the original only/).isVisible(), true);
  await context.close();
});

test('without JavaScript, the home page offers the static index instead of inert filters and shelf controls', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, javaScriptEnabled: false, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base);
  const seed = JSON.stringify({ saved: ['shakespeare-sonnet-18'], recent: ['old-pond-basho'] });
  await page.evaluate(value => localStorage.setItem('verso-library-v1', value), seed);
  await page.reload();
  assert.equal(await page.locator('#search').isDisabled(), true);
  assert.equal(await page.locator('#search-form').isVisible(), false);
  assert.equal(await page.locator('#filter-drawer').isVisible(), false);
  assert.equal(await page.locator('#clear-shelf').isDisabled(), true);
  assert.equal(await page.locator('#shelf-items').isVisible(), false);
  assert.equal(await page.locator('#shelf').getByText(/existing saved data is not changed/).isVisible(), true);
  assert.equal(await page.locator('#collections .collection-card').first().isVisible(), false);
  assert.equal(await page.locator('#countries .country-card').first().isVisible(), false);
  assert.equal(await page.locator('.poet-directory').isVisible(), true);
  const heroIndex = page.locator('.hero').getByRole('link', { name: /Browse poem index/ });
  assert.equal(await heroIndex.getAttribute('href'), '#complete-index');
  assert.equal(await page.locator('.hero').getByRole('link', { name: /Find a poem/ }).count(), 0);
  await heroIndex.focus();
  await page.keyboard.press('Enter');
  assert.equal(new URL(page.url()).hash, '#complete-index');
  const indexLink = page.locator('#explore').getByRole('link', { name: 'complete index' });
  await indexLink.focus();
  await page.keyboard.press('Enter');
  assert.equal(new URL(page.url()).hash, '#complete-index');
  await page.locator('#complete-index summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#complete-index').getAttribute('open'), '');
  assert.equal(await page.locator('#complete-index').getByRole('link', { name: /The Old Pond — Matsuo Bashō/ }).count(), 1);
  assert.equal(await page.evaluate(() => localStorage.getItem('verso-library-v1')), seed);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();
});

test('the complete index groups every poem once and supports keyboard browsing without JavaScript', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, javaScriptEnabled: false, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base);
  const seed = JSON.stringify({ saved: ['shakespeare-sonnet-18'], recent: [], extra: { keep: true } });
  await page.evaluate(value => localStorage.setItem('verso-library-v1', value), seed);
  const index = page.locator('#complete-index');
  await index.locator('summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await index.getAttribute('open'), '');
  assert.match(await index.locator('.index-intro').textContent(), /original language.*Translations and reading aids, when available/);
  const items = await index.locator('.index-group li a').evaluateAll(links => links.map(link => new URL(link.href).pathname.split('/').filter(Boolean).at(-1)));
  assert.equal(items.length, poems.length);
  assert.deepEqual(items.toSorted(), poems.map(poem => poem.id).toSorted());
  const languages = [...new Set(poems.map(poem => poem.language))];
  assert.equal(await index.locator('.index-group').count(), languages.length);
  for (const language of languages) {
    const count = poems.filter(poem => poem.language === language).length;
    const group = page.locator(`#index-original-${language}`);
    assert.equal(await group.locator('li a').count(), count, language);
    assert.equal(await index.getByRole('link', { name: `${language} ${count.toLocaleString('en-US')} ${count === 1 ? 'poem' : 'poems'}`, exact: true }).count(), 1, language);
  }
  assert.ok(await page.locator('#index-original-Chinese [lang|="zh"]').count() > 0);
  const navigation = index.getByRole('navigation', { name: 'Index by language of the original' });
  const arabicCount = poems.filter(poem => poem.language === 'Arabic').length;
  await navigation.getByRole('link', { name: `Arabic ${arabicCount} ${arabicCount === 1 ? 'poem' : 'poems'}`, exact: true }).focus();
  await page.keyboard.press('Tab');
  const chinese = navigation.getByRole('link', { name: `Chinese ${poems.filter(poem => poem.language === 'Chinese').length} poems`, exact: true });
  assert.equal(await chinese.evaluate(element => document.activeElement === element), true);
  await page.keyboard.press('Enter');
  await page.waitForURL('**/#index-original-Chinese');
  assert.equal(await page.locator('#index-original-Chinese').isVisible(), true);
  await navigation.getByRole('link', { name: `Japanese ${poems.filter(poem => poem.language === 'Japanese').length} poems`, exact: true }).click();
  await page.waitForURL('**/#index-original-Japanese');
  await page.locator('#index-original-Japanese').getByRole('link', { name: /The Old Pond — Matsuo Bashō/ }).click();
  assert.equal(await page.locator('#original-panel .verse').textContent(), poems.find(poem => poem.id === 'old-pond-basho').text);
  assert.equal(await page.evaluate(() => localStorage.getItem('verso-library-v1')), seed);
  await context.close();
});

test('index language fragments survive direct visits, reload and browser history', async () => {
  for (const js of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 }, javaScriptEnabled: js, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const verify = async (requireInView = true) => {
      if (js) await page.getByText(totalText).waitFor();
      const group = page.locator('#index-original-Japanese');
      await group.waitFor({ state: 'visible' });
      assert.equal(await page.locator('#complete-index').getAttribute('open'), '');
      if (requireInView) assert.ok(await group.evaluate(element => {
        const top = element.getBoundingClientRect().top;
        return top >= 0 && top < innerHeight;
      }), `Japanese group in viewport, JavaScript ${js}`);
    };
    await page.goto(`${base}#index-original-Japanese`);
    await verify();
    await page.reload();
    await verify();
    await page.locator('.index-jumps').getByRole('link', { name: /Chinese/ }).click();
    await page.waitForURL('**/#index-original-Chinese');
    await page.goBack();
    await page.waitForURL('**/#index-original-Japanese');
    await verify(false);
    await context.close();
  }
});

test('index navigation remains accessible and fits across themes and screen widths', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  await page.locator('#complete-index summary').click();
  const index = page.locator('#complete-index');
  for (const width of [320, 390, 700, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px`);
    for (const link of await index.locator('.index-jumps a').all()) {
      const box = await link.boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44, `index target at ${width}px`);
    }
  }
  await page.setViewportSize({ width: 320, height: 844 });
  for (const theme of ['light', 'sepia', 'dark']) {
    await page.getByLabel('Reading theme').selectOption(theme);
    await page.getByRole('status').getByText('Theme saved.').waitFor();
    const accessibility = await new AxeBuilder({ page }).include('.index-jumps').include('#index-original-Japanese').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], theme);
  }
  await context.close();
});

test('unusual original-language names have distinct safe index links', async () => {
  const sample = [
    { ...poems[0], id: 'index-sample-a', language: 'A & <B>' },
    { ...poems[0], id: 'index-sample-b', language: 'A%20& <B>' },
  ];
  for (const js of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 }, javaScriptEnabled: js, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.route('**/ai-poems/', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: renderHome(sample, '/ai-poems/') }));
    await page.route('**/data/catalog.json', route => route.fulfill({ contentType: 'application/json; charset=utf-8', body: JSON.stringify(sample) }));
    await page.goto(base);
    if (js) await page.getByText('2 poems found', { exact: true }).waitFor();
    await page.locator('#complete-index summary').click();
    for (const poem of sample) {
      const id = `index-original-${encodeURIComponent(poem.language)}`;
      const link = page.locator('.index-jumps').getByRole('link', { name: `${poem.language} 1 poem`, exact: true });
      assert.equal(await link.getAttribute('href'), `#${encodeURIComponent(id)}`);
      await link.click();
      assert.equal(decodeURIComponent(new URL(page.url()).hash.slice(1)), id);
      assert.equal(await page.evaluate(groupId => document.getElementById(groupId)?.querySelectorAll('li a').length, id), 1);
      await page.reload();
      if (js) await page.getByText('2 poems found', { exact: true }).waitFor();
      assert.equal(await page.locator('#complete-index').getAttribute('open'), '');
      assert.equal(await page.evaluate(groupId => document.getElementById(groupId)?.querySelectorAll('li a').length, id), 1);
    }
    await context.close();
  }
});

test('index groups remain usable when the catalogue or app module fails', async () => {
  for (const mode of ['catalogue failure', 'module failure']) {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    if (mode === 'catalogue failure') await page.route('**/data/catalog.json', route => route.abort());
    else await page.route('**/app.mjs', route => route.abort());
    await page.goto(base);
    if (mode === 'catalogue failure') await page.getByText(/The library could not load/).waitFor();
    const seed = JSON.stringify({ saved: ['shakespeare-sonnet-18'], recent: [], extra: { keep: true } });
    await page.evaluate(value => localStorage.setItem('verso-library-v1', value), seed);
    await page.locator('#complete-index summary').click();
    await page.locator('.index-jumps').getByRole('link', { name: /Japanese/ }).click();
    await page.waitForURL('**/#index-original-Japanese');
    assert.equal(await page.locator('#index-original-Japanese').getByRole('link', { name: /The Old Pond — Matsuo Bashō/ }).count(), 1, mode);
    assert.equal(await page.evaluate(() => localStorage.getItem('verso-library-v1')), seed, mode);
    await context.close();
  }
});

test('static fallback markup passes automated WCAG checks when the app module is blocked', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.route('**/app.mjs', route => route.abort());
  for (const path of ['', 'poems/quiet-night-thought-li-bai/']) {
    await page.goto(`${base}${path}`);
    // Axe needs script execution, so expose the same noscript markup in a script-enabled test page.
    await page.evaluate(() => {
      for (const node of [...document.querySelectorAll('noscript')]) {
        const template = document.createElement('template');
        template.innerHTML = node.textContent;
        if (node.parentElement.tagName === 'HEAD') node.replaceWith(template.content);
        else {
          const mirror = document.createElement('div');
          mirror.className = 'noscript-mirror';
          mirror.append(template.content);
          node.replaceWith(mirror);
        }
      }
      const style = document.createElement('style');
      style.textContent = 'main .noscript-mirror a{color:var(--olive-dark);font-weight:700;text-decoration:underline;text-underline-offset:3px}.reading-paths .noscript-mirror p{color:var(--muted);font-size:12px}';
      document.head.append(style);
    });
    if (path) assert.equal(await page.locator('.static-reading-note').isVisible(), true);
    else assert.equal(await page.locator('#explore .noscript-mirror').getByText(/Search needs JavaScript/).isVisible(), true);
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], path || 'home');
  }
  await context.close();
});

test('if the application module fails to load, interactive controls stay disabled and translations remain open', async () => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.route('**/app.mjs', route => route.abort());
  await page.goto(`${base}poems/quiet-night-thought-li-bai/`);
  assert.equal(await page.locator('#translation-select').isDisabled(), true);
  assert.equal(await page.locator('[data-view="translation"]').isDisabled(), true);
  assert.equal(await page.locator('.reader-save').isDisabled(), true);
  assert.equal(await page.getByLabel('Reading theme').isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'A+ Increase poem text size' }).isDisabled(), true);
  assert.equal(await page.locator('#translations').getAttribute('open'), '');
  assert.equal(await page.locator('#translations .verse[lang="ar"]').isVisible(), true);
  assert.equal(await page.getByRole('link', { name: /Read the available translations and reading aids/ }).isVisible(), true);
  await page.goto(base);
  assert.equal(await page.locator('#search').isDisabled(), true);
  assert.equal(await page.locator('#filter-language').isDisabled(), true);
  assert.equal(await page.locator('#sort').isDisabled(), true);
  assert.equal(await page.locator('#clear-shelf').isDisabled(), true);
  assert.equal(await page.getByText(/Search is unavailable until the library loads/).isVisible(), true);
  assert.equal(await page.locator('.hero').getByRole('link', { name: /Find a poem/ }).getAttribute('href'), '#explore');
  assert.equal(await page.locator('#collections .collection-card').first().isVisible(), false);
  assert.equal(await page.locator('#countries .country-card').first().isVisible(), false);
  assert.equal(await page.locator('.poet-directory').isVisible(), true);
  assert.equal(await page.locator('#poet-finder').isVisible(), false);
  assert.equal(await page.locator('#poet-list a').count(), groupPoets(poems).length);
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
  assert.equal(new URL(page.url()).pathname, '/ai-poems/poets/giacomo-leopardi/');
  await page.getByRole('link', { name: 'Filter these poems in the library ↗' }).click();
  const leopardi = filterPoems(poems, { author: 'Giacomo Leopardi' }).length;
  await page.getByText(`${leopardi} poems found`).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('author'), 'Giacomo Leopardi');
  await page.goto(base);
  await page.getByRole('link', { name: /American poetry/ }).click();
  const american = filterPoems(poems, { country: 'United States' }).length;
  await page.getByText(`${american} poems found`).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('country'), 'United States');
  assert.ok(filterPoems(poems, { country: 'United States' }).some(p => p.author === 'Emily Dickinson'));
  assert.ok(filterPoems(poems, { country: 'United States' }).some(p => p.author === 'Claude McKay'));
  await page.goto(`${base}?collection=${encodeURIComponent('The Book of American Negro Poetry')}#explore`);
  await page.getByText('113 poems found').waitFor();
  assert.equal(await page.locator('#filter-collection').inputValue(), 'The Book of American Negro Poetry');
  assert.equal(await page.locator('#filter-collection option:checked').textContent(), 'American poetry · 1922 anthology (113)');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();
});

test('poet pages are shareable, responsive and do not fetch the full catalogue', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  let catalogueRequests = 0;
  await page.route('**/data/catalog.json', route => { catalogueRequests++; return route.abort(); });
  const response = await page.goto(`${base}poets/william-shakespeare/`);
  assert.equal(response.status(), 200);
  const stored = JSON.stringify({ saved: ['old-pond-basho'], recent: ['old-pond-basho'], theme: 'sepia', extra: { keep: true } });
  await page.evaluate(value => localStorage.setItem('verso-library-v1', value), stored);
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'sepia');
  assert.equal(await page.evaluate(() => localStorage.getItem('verso-library-v1')), stored);
  assert.equal(await page.locator('[data-shelf-count]').first().textContent(), '1');
  assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), 'William Shakespeare');
  assert.equal(await page.locator('.poet-works-list a').count(), 154);
  assert.equal(await page.locator('.poet-more').getAttribute('open'), null);
  await page.locator('.poet-more summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.poet-more').getAttribute('open'), '');
  assert.equal(await page.locator('.poet-works-list').getByRole('link', { name: /Sonnet 154/ }).isVisible(), true);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px`);
  }
  for (const theme of ['light', 'sepia', 'dark']) {
    await page.getByLabel('Reading theme').selectOption(theme);
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], theme);
  }
  assert.equal(catalogueRequests, 0);
  await context.close();
});

test('poet directory search is usable while the catalogue request is pending', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/data/catalog.json', async route => { await gate; await route.abort(); });
  try {
    const request = page.waitForRequest('**/data/catalog.json');
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await request;
    await page.locator('.poet-directory summary').click();
    const input = page.getByRole('searchbox', { name: 'Find a poet or voice' });
    await input.fill('杜甫');
    assert.equal(await page.locator('#poet-count').textContent(), '1 match.');
    assert.equal(await page.locator('.poet-list a:not([hidden])').getAttribute('data-author'), 'Du Fu');
    assert.equal(await page.locator('#search').isDisabled(), true);
    release();
    await page.getByText(/The library could not load/).waitFor();
    assert.equal(await input.inputValue(), '杜甫');
  } finally {
    release();
    await context.close();
  }
});

test('poet directory search handles native names, accents, empty results and catalogue failure', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.route('**/data/catalog.json', route => route.abort());
  await page.goto(`${base}?country=Japan#poets`);
  await page.getByText(/The library could not load/).waitFor();
  const seed = JSON.stringify({ saved: ['old-pond-basho'], recent: [], extra: { keep: true } });
  await page.evaluate(value => localStorage.setItem('verso-library-v1', value), seed);
  const directory = page.locator('.poet-directory');
  await directory.locator('summary').focus();
  await page.keyboard.press('Enter');
  const input = page.getByRole('searchbox', { name: 'Find a poet or voice' });
  const clear = page.getByRole('button', { name: 'Clear', exact: true });
  const count = page.locator('#poet-count');
  const visible = directory.locator('.poet-list a:not([hidden])');
  assert.equal(await input.isVisible(), true);
  assert.equal(await input.getAttribute('aria-controls'), 'poet-list');
  assert.equal(await input.getAttribute('aria-describedby'), 'poet-count');
  assert.equal(await count.getAttribute('aria-live'), 'polite');
  assert.equal(await count.textContent(), 'Showing all names and voices.');
  assert.equal(await visible.count(), groupPoets(poems).length);
  assert.equal(await clear.isDisabled(), true);
  await input.fill('BASHO');
  assert.equal(await count.textContent(), '1 match.');
  assert.equal(await visible.count(), 1);
  assert.match(await visible.first().textContent(), /Matsuo Bashō.*松尾芭蕉/);
  await input.fill('松尾芭蕉');
  assert.equal(await visible.count(), 1);
  assert.equal(await visible.first().getAttribute('data-author'), 'Matsuo Bashō');
  await input.fill('杜甫');
  assert.equal(await visible.count(), 1);
  assert.equal(await visible.first().getAttribute('data-author'), 'Du Fu');
  await input.fill('jose marti');
  assert.equal(await visible.count(), 1);
  assert.equal(await visible.first().getAttribute('data-author'), 'José Martí');
  await input.fill('no-poet-matches-this');
  assert.equal(await visible.count(), 0);
  assert.equal(await count.textContent(), '0 matches. Try another name.');
  assert.equal(new URL(page.url()).searchParams.get('country'), 'Japan');
  assert.equal(await page.locator('#search').inputValue(), '');
  assert.equal(await page.evaluate(() => localStorage.getItem('verso-library-v1')), seed);
  await clear.click();
  assert.equal(await input.inputValue(), '');
  assert.equal(await input.evaluate(element => document.activeElement === element), true);
  assert.equal(await clear.isDisabled(), true);
  assert.equal(await count.textContent(), 'Showing all names and voices.');
  assert.equal(await visible.count(), groupPoets(poems).length);
  await input.fill('BASHO');
  await visible.first().focus();
  const navigation = page.waitForURL(url => url.pathname === '/ai-poems/poets/matsuo-basho/');
  await page.keyboard.press('Enter');
  await navigation;
  assert.equal(new URL(page.url()).pathname, '/ai-poems/poets/matsuo-basho/');
  await page.goBack();
  await directory.locator('summary').waitFor();
  if (!(await directory.evaluate(element => element.open))) await directory.locator('summary').click();
  const restored = await input.inputValue();
  assert.ok(restored === '' || restored === 'BASHO');
  assert.equal(await visible.count(), restored ? 1 : groupPoets(poems).length);
  await input.fill('杜甫');
  await page.reload();
  await page.getByText(/The library could not load/).waitFor();
  if (!(await directory.evaluate(element => element.open))) await directory.locator('summary').click();
  const reloaded = await input.inputValue();
  assert.ok(reloaded === '' || reloaded === '杜甫');
  assert.equal(await visible.count(), reloaded ? 1 : groupPoets(poems).length);
  await input.fill('杜甫');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await page.evaluate(() => {
      const documentWidth = document.documentElement.scrollWidth;
      const overflow = documentWidth <= innerWidth + 1 ? [] : [...document.querySelectorAll('body *')].flatMap(element => {
        const rect = element.getBoundingClientRect();
        if (!rect.width || rect.right + scrollX <= innerWidth + 1) return [];
        return [{ tag: element.tagName, id: element.id, class: element.getAttribute('class'), right: Math.round(rect.right + scrollX), width: Math.round(rect.width), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }];
      }).sort((a, b) => b.right - a.right).slice(0, 20);
      return { viewportWidth: innerWidth, documentWidth, scrollX, overflow };
    });
    assert.ok(layout.documentWidth <= layout.viewportWidth + 1, `${width}px ${JSON.stringify(layout)}`);
    assert.ok(await input.evaluate(element => parseFloat(getComputedStyle(element).fontSize) >= 16), `${width}px search text`);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  const wideFallback = await page.addStyleTag({ content: '.poet-directory, .poet-directory * { font-family: monospace !important; }' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'directory must fit with a wide fallback font');
  assert.equal(await input.inputValue(), '杜甫');
  assert.equal(await visible.count(), 1);
  await wideFallback.evaluate(element => element.remove());
  for (const theme of ['light', 'sepia', 'dark']) {
    await page.getByLabel('Reading theme', { exact: true }).selectOption(theme);
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], theme);
  }
  await context.close();
});

test('the poet directory and every linked work remain available without JavaScript', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, javaScriptEnabled: false, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base);
  await page.locator('.poet-directory summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#poet-finder').isVisible(), false);
  assert.equal(await page.locator('#poet-list a').count(), groupPoets(poems).length);
  assert.equal(await page.locator('.poet-directory [data-author="Matsuo Bashō"] [lang="ja"]').textContent(), '松尾芭蕉');
  await page.locator('.poet-directory [data-author="Matsuo Bashō"]').click();
  assert.equal(new URL(page.url()).pathname, '/ai-poems/poets/matsuo-basho/');
  assert.equal(await page.locator('.poet-works-list a').count(), groupPoets(poems).find(poet => poet.id === 'matsuo-basho').poems.length);
  assert.equal(await page.getByRole('link', { name: /Filter these poems/ }).count(), 0);
  await page.locator('.poet-works-list').getByRole('link', { name: /The Old Pond/ }).click();
  assert.equal(await page.locator('#original-panel .verse').textContent(), '古池や蛙とびこむ水の音');
  assert.equal(await page.locator('.reader-byline a').getAttribute('href'), '/ai-poems/poets/matsuo-basho/');
  await page.goto(`${base}poets/traditional-anonymous-romances-viejos/`);
  assert.equal(await page.getByText(/not necessarily by the same person/).isVisible(), true);
  assert.equal(await page.locator('.poet-works-list a').count(), 8);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await context.close();
});

test('recorded-year shortcuts preserve other filters and report contextual counts', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  const entry = page.getByRole('link', { name: 'Browse by recorded year' });
  await entry.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL('**/#year-ranges');
  assert.equal(await page.locator('#filter-drawer').getAttribute('open'), '');
  assert.equal(await page.locator('#advanced-filters').getAttribute('open'), '');
  const ranges = page.locator('#year-ranges');
  assert.equal(await ranges.evaluate(element => document.activeElement === element), true);
  const dated = poems.filter(poem => poem.year !== null).length;
  const unknown = poems.length - dated;
  const countLabel = count => `${count.toLocaleString('en-US')} ${count === 1 ? 'poem' : 'poems'}`;
  assert.ok((await ranges.textContent()).includes(`${dated.toLocaleString('en-US')} ${dated === 1 ? 'poem has' : 'poems have'} a recorded year; ${unknown.toLocaleString('en-US')} without one ${unknown === 1 ? 'is' : 'are'} excluded from year filters`));
  assert.match(await ranges.textContent(), /composition, publication, an edition or a traditional date/);
  assert.match(await ranges.textContent(), /Bounds are inclusive; counts reflect your other filters/);
  const before = ranges.locator('[data-year-range="0"]');
  const nineteenth = ranges.locator('[data-year-range="2"]');
  assert.equal(await ranges.locator('[data-year-range]').count(), 2);
  assert.equal(await before.locator('small').textContent(), countLabel(yearRangeCounts(poems)[0].count));
  assert.equal(await nineteenth.locator('small').textContent(), countLabel(yearRangeCounts(poems)[2].count));
  for (const width of [320, 390, 700, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px`);
    for (const button of await ranges.locator('[data-year-range]').all()) {
      const box = await button.boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44, `year-range target at ${width}px`);
    }
  }
  await page.setViewportSize({ width: 320, height: 844 });
  for (const theme of ['light', 'sepia', 'dark']) {
    await page.getByLabel('Reading theme').selectOption(theme);
    await page.getByRole('status').getByText('Theme saved.').waitFor();
    const accessibility = await new AxeBuilder({ page }).include('#year-ranges').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], theme);
  }
  await page.getByLabel('Original language').selectOption('Japanese');
  const japanese = { language: 'Japanese' };
  const beforeJapanese = yearRangeCounts(poems, japanese)[0].count;
  assert.equal(await before.locator('small').textContent(), countLabel(beforeJapanese));
  assert.equal(await nineteenth.locator('small').textContent(), '0 poems');
  assert.equal(await nineteenth.isDisabled(), true);
  await before.focus();
  await page.keyboard.press('Enter');
  await page.getByText(`${beforeJapanese} ${beforeJapanese === 1 ? 'poem' : 'poems'} found`, { exact: true }).waitFor();
  assert.equal(await page.locator('#filter-language').inputValue(), 'Japanese');
  assert.equal(await page.locator('#filter-from').inputValue(), '');
  assert.equal(await page.locator('#filter-to').inputValue(), '1699');
  assert.equal(new URL(page.url()).searchParams.get('language'), 'Japanese');
  assert.equal(new URL(page.url()).searchParams.get('to'), '1699');
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  const search = page.getByLabel('Search the poetry library');
  await search.fill('Leopardi');
  const leopardi = { query: 'Leopardi' };
  assert.equal(await before.isDisabled(), yearRangeCounts(poems, leopardi)[0].count === 0);
  const nineteenthCount = yearRangeCounts(poems, leopardi)[2].count;
  assert.equal(await nineteenth.locator('small').textContent(), countLabel(nineteenthCount));
  await nineteenth.click();
  await page.getByText(`${nineteenthCount} ${nineteenthCount === 1 ? 'poem' : 'poems'} found`, { exact: true }).waitFor();
  assert.equal(await search.inputValue(), 'Leopardi');
  assert.equal(await page.locator('#filter-from').inputValue(), '1800');
  assert.equal(await page.locator('#filter-to').inputValue(), '1899');
  assert.equal(new URL(page.url()).searchParams.get('q'), 'Leopardi');
  assert.equal(new URL(page.url()).searchParams.get('from'), '1800');
  assert.equal(new URL(page.url()).searchParams.get('to'), '1899');
  await page.goBack();
  await page.getByText(totalText).waitFor();
  assert.equal(await search.inputValue(), '');
  assert.equal(new URL(page.url()).searchParams.has('from'), false);
  await context.close();
});

test('recorded-year links reopen the filters on mobile after reload and browser history', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const url = `${base}?language=Japanese#year-ranges`;
  const verify = async () => {
    const ranges = page.locator('#year-ranges');
    await ranges.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#filter-drawer').getAttribute('open'), '');
    assert.equal(await page.locator('#advanced-filters').getAttribute('open'), '');
    assert.equal(await page.locator('#filter-language').inputValue(), 'Japanese');
    assert.equal(await ranges.locator('[data-year-range="0"] small').textContent(), '1 poem');
    assert.equal(await ranges.locator('[data-year-range="2"]').isDisabled(), true);
    assert.ok(await ranges.evaluate(element => {
      const box = element.getBoundingClientRect();
      return box.top >= 0 && box.top < innerHeight;
    }), 'year controls are scrolled into view');
  };
  await page.goto(url);
  await verify();
  await page.reload();
  await verify();
  await page.goto(`${base}?language=Japanese#explore`);
  await page.goBack();
  await verify();
  await context.close();
});

test('all recorded-year shortcuts honor synthetic boundary years and unknown dates', async () => {
  const years = [-44, 0, 1699, 1700, 1799, 1800, 1899, 1900, 1999, 2000, 2026, null];
  const sample = years.map((year, index) => ({ ...poems[0], id: `year-sample-${index}`, title: `Year sample ${index}`, displayTitle: `Year sample ${index}`, year, yearLabel: year === null ? 'Exact year unknown' : `Recorded ${year}` }));
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.route('**/ai-poems/', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: renderHome(sample, '/ai-poems/') }));
  await page.route('**/data/catalog.json', route => route.fulfill({ contentType: 'application/json; charset=utf-8', body: JSON.stringify(sample) }));
  await page.goto(base);
  await page.getByText('12 poems found', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Browse by recorded year' }).click();
  const ranges = page.locator('#year-ranges');
  assert.match(await ranges.textContent(), /11 poems have a recorded year; 1 without one is excluded from year filters/);
  assert.equal(await ranges.locator('[data-year-range]').count(), recordedYearRanges.length);
  for (const [index, range] of recordedYearRanges.entries()) {
    const expected = filterPoems(sample, { from: range.from, to: range.to }).map(poem => poem.id).sort();
    const button = ranges.locator(`[data-year-range="${index}"]`);
    assert.equal(await button.locator('small').textContent(), `${expected.length} poems`);
    await button.click();
    await page.waitForFunction(ids => [...document.querySelectorAll('#results .poem-card-link')].map(link => new URL(link.href).pathname.split('/').filter(Boolean).at(-1)).sort().join(',') === ids.join(','), expected);
    assert.equal(await page.locator('#filter-from').inputValue(), range.from);
    assert.equal(await page.locator('#filter-to').inputValue(), range.to);
    assert.equal(new URL(page.url()).searchParams.get('from') || '', range.from);
    assert.equal(new URL(page.url()).searchParams.get('to') || '', range.to);
  }
  await context.close();
});

test('a catalogue without recorded years has no empty shortcut entry', async () => {
  const sample = [{ ...poems[0], year: null }];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.route('**/ai-poems/', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: renderHome(sample, '/ai-poems/') }));
  await page.route('**/data/catalog.json', route => route.fulfill({ contentType: 'application/json; charset=utf-8', body: JSON.stringify(sample) }));
  await page.goto(base);
  await page.getByText('1 poem found', { exact: true }).waitFor();
  assert.equal(await page.locator('.year-range-entry').count(), 0);
  assert.equal(await page.locator('#year-ranges').count(), 0);
  await page.locator('#filter-summary').click();
  await page.locator('#advanced-filters summary').click();
  assert.equal(await page.getByText(/No poems currently have a recorded year/).isVisible(), true);
  await page.getByLabel('From year').fill('0');
  await page.getByText('0 poems found', { exact: true }).waitFor();
  await context.close();
});

test('recorded-year entry does not become a dead control without JavaScript or catalogue access', async () => {
  for (const mode of ['no JavaScript', 'catalogue failure', 'module failure']) {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 }, javaScriptEnabled: mode !== 'no JavaScript', reducedMotion: 'reduce' });
    const page = await context.newPage();
    if (mode === 'catalogue failure') await page.route('**/data/catalog.json', route => route.abort());
    if (mode === 'module failure') await page.route('**/app.mjs', route => route.abort());
    await page.goto(base);
    if (mode === 'catalogue failure') await page.getByText(/The library could not load/).waitFor();
    const seed = JSON.stringify({ saved: ['shakespeare-sonnet-18'], recent: [], extra: { keep: true } });
    await page.evaluate(value => localStorage.setItem('verso-library-v1', value), seed);
    assert.equal(await page.locator('.year-range-entry').isVisible(), false, mode);
    assert.equal(await page.locator('[data-year-range]').first().isDisabled(), true, mode);
    await page.locator('#complete-index summary').click();
    assert.equal(await page.locator('#complete-index').getAttribute('open'), '', mode);
    assert.equal(await page.locator('#complete-index').getByRole('link', { name: /The Old Pond — Matsuo Bashō/ }).count(), 1, mode);
    assert.equal(await page.evaluate(() => localStorage.getItem('verso-library-v1')), seed, mode);
    await context.close();
  }
});

test('discovery cards show matching poets and counts and lead to the same filters', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const paths = [
    ['Chinese poetry', { language: 'Chinese' }, ['li-bai', 'du-fu']],
    ['Spanish poetry', { language: 'Spanish' }, ['jose-marti', 'andres-bello']],
    ['American poetry', { country: 'United States' }, ['emily-dickinson', 'claude-mckay']],
    ['The sonnet', { form: 'Sonnet' }, ['william-shakespeare', 'florbela-espanca']],
  ];
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  const grid = page.locator('.collection-grid');
  assert.equal(await grid.locator('.collection-card').count(), paths.length);
  assert.match(await page.locator('#collections .section-heading').textContent(), /associated place.*more than one path/);
  for (const [label, filters, ids] of paths) {
    const matches = filterPoems(poems, filters);
    const card = grid.getByRole('link', { name: new RegExp(label) });
    assert.equal(await card.locator('em').textContent(), `${matches.length.toLocaleString('en-US')} poems`);
    assert.equal(await card.locator('.collection-examples').textContent(), `Featuring ${ids.map(id => matches.find(poem => poem.authorId === id).author).join(' · ')}`);
    assert.equal(await card.getAttribute('href'), `/ai-poems/?${new URLSearchParams(filters)}#explore`);
  }
  for (const width of [320, 390, 440, 441, 700, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px`);
    for (const card of await grid.locator('.collection-card').all()) {
      const box = await card.boundingBox();
      const copy = await card.locator('.collection-copy').boundingBox();
      assert.ok(box && copy && box.width >= 44 && box.height >= 44, `touch target at ${width}px`);
      assert.ok(copy.x >= box.x && copy.x + copy.width <= box.x + box.width + 1 && copy.y >= box.y && copy.y + copy.height <= box.y + box.height + 1, `card content fits at ${width}px`);
      assert.equal(await card.locator('.collection-example-secondary').isVisible(), width > 440, `secondary example at ${width}px`);
    }
  }
  await page.setViewportSize({ width: 320, height: 844 });
  for (const theme of ['light', 'sepia', 'dark']) {
    await page.getByLabel('Reading theme').selectOption(theme);
    const accessibility = await new AxeBuilder({ page }).include('.collection-grid').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], theme);
  }
  await page.locator('#collections .text-link').focus();
  await page.keyboard.press('Tab');
  assert.equal(await grid.locator('.collection-card').first().evaluate(element => document.activeElement === element), true);
  await page.keyboard.press('Enter');
  await page.getByText(`${filterPoems(poems, paths[0][1]).length} poems found`, { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('language'), 'Chinese');
  for (const [label, filters] of paths.slice(1)) {
    await page.goto(base);
    await page.getByText(totalText).waitFor();
    await grid.getByRole('link', { name: new RegExp(label) }).click();
    const count = filterPoems(poems, filters).length;
    await page.getByText(`${count} ${count === 1 ? 'poem' : 'poems'} found`, { exact: true }).waitFor();
    const [name, value] = Object.entries(filters)[0];
    assert.equal(new URL(page.url()).searchParams.get(name), value);
    assert.equal(await page.locator(`#filter-${name}`).inputValue(), value);
  }
  await context.close();
});

test('discovery falls back to the static index when JavaScript or the catalogue is unavailable', async () => {
  for (const mode of ['no JavaScript', 'catalogue failure', 'module failure']) {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 }, javaScriptEnabled: mode !== 'no JavaScript', reducedMotion: 'reduce' });
    const page = await context.newPage();
    if (mode === 'catalogue failure') await page.route('**/data/catalog.json', route => route.abort());
    if (mode === 'module failure') await page.route('**/app.mjs', route => route.abort());
    await page.goto(base);
    if (mode === 'catalogue failure') await page.getByText(/The library could not load/).waitFor();
    const seed = JSON.stringify({ saved: ['shakespeare-sonnet-18'], recent: [], extra: { keep: true } });
    await page.evaluate(value => localStorage.setItem('verso-library-v1', value), seed);
    assert.equal(await page.locator('.collection-grid').isVisible(), false, mode);
    assert.equal(await page.locator('.featured-reading').isVisible(), true, mode);
    await page.locator('#complete-index summary').click();
    assert.equal(await page.locator('#complete-index').getAttribute('open'), '', mode);
    assert.equal(await page.locator('#complete-index').getByRole('link', { name: /The Old Pond — Matsuo Bashō/ }).count(), 1, mode);
    assert.equal(await page.evaluate(() => localStorage.getItem('verso-library-v1')), seed, mode);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), mode);
    await context.close();
  }
});

test('featured reading is sourced, responsive, accessible and keyboard navigable', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const poem = poems.find(item => item.id === 'old-pond-basho');
  const translation = poem.translations.find(item => item.translator === 'Lafcadio Hearn, 1898');
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  const feature = page.locator('.featured-reading');
  const link = feature.getByRole('link', { name: 'Read poem & sources' });
  assert.equal(await feature.getByRole('heading', { name: 'The Old Pond' }).count(), 1);
  assert.equal(await feature.locator('.featured-reading-byline').textContent(), 'Matsuo Bashō · Japanese');
  assert.equal(await feature.locator('.featured-reading-original[lang="ja"][dir="ltr"]').textContent(), '古池や蛙とびこむ水の音');
  assert.equal(await feature.locator('.featured-reading-translation[lang="en"][dir="ltr"]').textContent(), 'Old pond—frogs jumping in—sound of water.');
  assert.match(await feature.locator('.featured-reading-footer p').textContent(), /Wikisource · Bashō Haiku Collection \(1903\).*Lafcadio Hearn, 1898/);
  assert.equal(await link.getAttribute('href'), `/ai-poems/poems/${poem.id}/`);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px`);
    const box = await link.boundingBox();
    assert.ok(box && box.width >= 44 && box.height >= 44, `touch target at ${width}px`);
    assert.ok(await feature.evaluate(element => element.scrollWidth <= element.clientWidth + 1), `feature fits at ${width}px`);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  for (const theme of ['light', 'sepia', 'dark']) {
    await page.getByLabel('Reading theme').selectOption(theme);
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
    const accessibility = await new AxeBuilder({ page }).include('.featured-reading').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], theme);
  }
  await page.locator('.collection-card').last().focus();
  await page.keyboard.press('Tab');
  assert.equal(await link.evaluate(element => document.activeElement === element), true);
  await page.keyboard.press('Enter');
  await page.waitForURL(`**/poems/${poem.id}/`);
  assert.equal(new URL(page.url()).pathname, `/ai-poems/poems/${poem.id}/`);
  assert.equal(await page.locator('#original-panel .verse').textContent(), poem.text);
  assert.equal(await page.locator('.source-note a').getAttribute('href'), poem.source);
  assert.equal(await page.locator('#translations .verse').textContent(), translation.text);
  assert.equal(await page.locator('#translations a').getAttribute('href'), translation.source);
  await context.close();
});

test('featured reading and its sources remain available with no JavaScript, a failed catalogue or a failed module', async () => {
  const poem = poems.find(item => item.id === 'old-pond-basho');
  const translation = poem.translations.find(item => item.translator === 'Lafcadio Hearn, 1898');
  for (const mode of ['no JavaScript', 'catalogue failure', 'module failure']) {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 }, javaScriptEnabled: mode !== 'no JavaScript', reducedMotion: 'reduce' });
    const page = await context.newPage();
    if (mode === 'catalogue failure') await page.route('**/data/catalog.json', route => route.abort());
    if (mode === 'module failure') await page.route('**/app.mjs', route => route.abort());
    await page.goto(base);
    if (mode === 'catalogue failure') await page.getByText(/The library could not load/).waitFor();
    const seed = JSON.stringify({ saved: ['shakespeare-sonnet-18'], recent: [], extra: { keep: true } });
    await page.evaluate(value => localStorage.setItem('verso-library-v1', value), seed);
    const feature = page.locator('.featured-reading');
    assert.equal(await feature.locator('.featured-reading-original').textContent(), poem.text, mode);
    assert.equal(await feature.locator('.featured-reading-translation').textContent(), translation.text, mode);
    assert.match(await feature.textContent(), /Lafcadio Hearn, 1898/, mode);
    assert.equal(await page.evaluate(() => localStorage.getItem('verso-library-v1')), seed, mode);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), mode);
    const link = feature.getByRole('link', { name: 'Read poem & sources' });
    await link.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(`**/poems/${poem.id}/`);
    assert.equal(new URL(page.url()).pathname, `/ai-poems/poems/${poem.id}/`, mode);
    assert.equal(await page.locator('#original-panel .verse').textContent(), poem.text, mode);
    assert.equal(await page.locator('.source-note a').getAttribute('href'), poem.source, mode);
    assert.equal(await page.locator('#translations .verse').textContent(), translation.text, mode);
    assert.equal(await page.locator('#translations a').getAttribute('href'), translation.source, mode);
    if (mode !== 'catalogue failure') assert.equal(await page.evaluate(() => localStorage.getItem('verso-library-v1')), seed, mode);
    await context.close();
  }
});

test('the sourced sonnet path exposes both works and evidence accessibly', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByText(totalText).waitFor();
  const first = poems.find(poem => poem.id === 'shakespeare-sonnet-18');
  const next = poems.find(poem => poem.id === 'shakespeare-sonnet-19');
  const card = page.locator('.sequence-path');
  const start = card.getByRole('link', { name: 'Read Sonnet 18' });
  const target = card.getByRole('link', { name: 'Read Sonnet 19' });
  const source = card.getByRole('link', { name: 'View sequence source' });
  assert.equal(await card.getByRole('heading', { name: 'Two sonnets by William Shakespeare' }).count(), 1);
  assert.equal(await card.locator('.sequence-note').textContent(), first.connections[0].note);
  assert.match(await card.textContent(), /sequence link, not a claim of influence/);
  assert.equal(await start.getAttribute('href'), `/ai-poems/poems/${first.id}/`);
  assert.equal(await target.getAttribute('href'), `/ai-poems/poems/${next.id}/`);
  assert.equal(await source.getAttribute('href'), first.connections[0].source);
  assert.equal(await source.getAttribute('rel'), 'noopener noreferrer');
  for (const width of [320, 390, 700, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px`);
    for (const link of [start, target, source]) {
      const box = await link.boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44, `sequence target at ${width}px`);
    }
    assert.ok(await card.evaluate(element => element.scrollWidth <= element.clientWidth + 1), `sequence fits at ${width}px`);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  for (const theme of ['light', 'sepia', 'dark']) {
    await page.getByLabel('Reading theme').selectOption(theme);
    await page.getByRole('status').getByText('Theme saved.').waitFor();
    const accessibility = await new AxeBuilder({ page }).include('.sequence-path').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], theme);
  }
  await start.focus();
  await page.keyboard.press('Tab');
  assert.equal(await target.evaluate(element => document.activeElement === element), true);
  await page.keyboard.press('Tab');
  assert.equal(await source.evaluate(element => document.activeElement === element), true);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await page.waitForURL(`**/poems/${next.id}/`);
  assert.equal(await page.locator('#original-panel .verse').textContent(), next.text);
  await context.close();
});

test('the sourced sonnet path works without JavaScript or catalogue access', async () => {
  for (const mode of ['no JavaScript', 'catalogue failure', 'module failure']) {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 }, javaScriptEnabled: mode !== 'no JavaScript', reducedMotion: 'reduce' });
    const page = await context.newPage();
    if (mode === 'catalogue failure') await page.route('**/data/catalog.json', route => route.abort());
    if (mode === 'module failure') await page.route('**/app.mjs', route => route.abort());
    await page.goto(base);
    if (mode === 'catalogue failure') await page.getByText(/The library could not load/).waitFor();
    const seed = { saved: ['old-pond-basho'], recent: [], extra: { keep: true } };
    await page.evaluate(value => localStorage.setItem('verso-library-v1', JSON.stringify(value)), seed);
    const card = page.locator('.sequence-path');
    assert.equal(await card.isVisible(), true, mode);
    assert.equal(await card.getByRole('link', { name: 'View sequence source' }).getAttribute('href'), 'https://www.gutenberg.org/ebooks/1041', mode);
    await card.getByRole('link', { name: 'Read Sonnet 18' }).focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/poems/shakespeare-sonnet-18/');
    assert.equal(await page.locator('#original-panel .verse').textContent(), poems.find(poem => poem.id === 'shakespeare-sonnet-18').text, mode);
    assert.equal(await page.locator('.connections-section').getByRole('link', { name: /Sonnet 19/ }).count(), 1, mode);
    const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('verso-library-v1')));
    assert.deepEqual(stored.saved, seed.saved, mode);
    assert.deepEqual(stored.extra, seed.extra, mode);
    if (mode !== 'catalogue failure') assert.deepEqual(stored, seed, mode);
    await context.close();
  }
});

test('editorial paths lead to short poems and the sourced edition sequence', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  let releaseCatalogue;
  const catalogueGate = new Promise(resolve => { releaseCatalogue = resolve; });
  await page.route('**/data/catalog.json', async route => { await catalogueGate; await route.continue(); });
  const requested = page.waitForRequest('**/data/catalog.json');
  const paths = page.getByRole('navigation', { name: 'Suggested reading paths' });
  const short = filterPoems(poems, { length: '1-4' }).length;
  const shortCount = paths.getByText(`${short.toLocaleString('en-US')} poems · lines in the original`);
  try {
    await page.goto(base, { waitUntil: 'commit' });
    await requested;
    assert.equal(await shortCount.isVisible(), false);
  } finally { releaseCatalogue(); }
  await shortCount.waitFor({ state: 'visible' });
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

async function installReadingStateClock(context) {
  // Playwright's clock is shared by every page in a context. Install it once,
  // before application code creates any native timers.
  await context.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
}

async function pauseReadingStateClock(context) {
  const page = context.pages().find(item => item.url().startsWith(base));
  await page.waitForFunction(async () => {
    const locks = await navigator.locks.query();
    return ![...locks.held, ...locks.pending].some(lock => lock.name === 'verso-library-v1');
  });
  const paused = new Date('2026-01-01T01:00:00Z');
  await context.clock.pauseAt(paused);
  const pages = context.pages().filter(item => item.url().startsWith(base));
  assert.deepEqual(await Promise.all(pages.map(item => item.evaluate(() => Date.now()))), pages.map(() => paused.getTime()));
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

async function pendingReadingStateLocks(page, count) {
  // A visible saving message precedes the asynchronous lock-manager enqueue.
  try {
    await page.waitForFunction(async expected => {
      const snapshot = await navigator.locks.query();
      return snapshot.held.some(lock => lock.name === 'verso-library-v1')
        && snapshot.pending.filter(lock => lock.name === 'verso-library-v1').length === expected;
    }, count);
  } catch (error) {
    throw new Error(`Expected ${count} pending shelf locks: ${JSON.stringify(await readingStateDiagnostics(page))}`, { cause: error });
  }
  return page.evaluate(async () => (await navigator.locks.query()).pending.filter(lock => lock.name === 'verso-library-v1'));
}

async function readingStateDiagnostics(holder) {
  const pages = await Promise.all(holder.context().pages().map(async page => {
    try {
      return await page.evaluate(() => ({
        path: location.pathname,
        documentMarker: window.__shelfTestMarker,
        navigationType: performance.getEntriesByType('navigation')[0]?.type,
        stored: localStorage.getItem('verso-library-v1'),
        notice: document.querySelector('.toast[role="status"]')?.textContent,
        readerSave: document.querySelector('.reader-save')?.outerHTML,
        warning: document.querySelector('main > .storage-warning')?.textContent,
        warningHidden: document.querySelector('main > .storage-warning')?.hidden,
        conflict: document.querySelector('.clear-conflict')?.textContent,
      }));
    } catch (error) { return { error: String(error) }; }
  }));
  let locks;
  try { locks = await holder.evaluate(() => navigator.locks.query()); }
  catch (error) { locks = { error: String(error) }; }
  return { pages, locks };
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
  await installReadingStateClock(context);
  const home = await context.newPage();
  await home.goto(base);
  await home.getByText(totalText).waitFor();
  await home.evaluate(() => localStorage.setItem('verso-library-v1', JSON.stringify({ saved: ['shakespeare-sonnet-18'], recent: [], extra: { keep: true } })));
  await home.reload();
  await home.locator('#shelf-items').getByText('Sonnet 18').waitFor();
  const reader = await context.newPage();
  await reader.goto(`${base}poems/old-pond-basho/`);
  await reader.waitForFunction(() => JSON.parse(localStorage.getItem('verso-library-v1')).recent.includes('old-pond-basho'));
  await reader.evaluate(() => { window.__shelfTestMarker = 'original reader document'; });
  const holder = await context.newPage();
  await holder.goto(base);
  await pauseReadingStateClock(context);
  await holdReadingStateLock(holder);
  try {
    await reader.getByRole('button', { name: /Save poem/ }).click();
    await reader.getByRole('status').getByText('Saving changes…').waitFor();
    const [saveRequest] = await pendingReadingStateLocks(holder, 1);
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
    assert.equal(await reader.evaluate(() => window.__shelfTestMarker), 'original reader document');
    assert.equal((await pendingReadingStateLocks(holder, 1))[0].clientId, saveRequest.clientId);
    await home.getByText('Clear saved poems', { exact: true }).click();
    await home.getByRole('button', { name: 'Yes, clear saved poems' }).click();
    await home.getByRole('status').getByText('Saving changes…').waitFor();
    const queued = await pendingReadingStateLocks(holder, 2);
    assert.equal(queued[0].clientId, saveRequest.clientId);
    assert.notEqual(queued[1].clientId, saveRequest.clientId);
    await context.clock.fastForward(3999);
    const stillQueued = await pendingReadingStateLocks(holder, 2);
    assert.equal(stillQueued[0].clientId, saveRequest.clientId);
    const beforeRelease = await readingStateDiagnostics(holder);
    const readerBeforeRelease = beforeRelease.pages.find(page => page.path === '/ai-poems/poems/old-pond-basho/');
    assert.deepEqual(JSON.parse(readerBeforeRelease.stored).saved, ['shakespeare-sonnet-18']);
    assert.equal(readerBeforeRelease.notice, 'Saving changes…');
    assert.equal(readerBeforeRelease.warningHidden, true);
    await holder.evaluate(() => window.releaseTestLock());
    try {
      await reader.getByRole('status').getByText('Saved to your shelf.').waitFor();
      await home.locator('.clear-conflict').getByText(/Review your shelf and confirm again/).waitFor();
    } catch (error) {
      throw new Error(`Missing saved state or shelf conflict: ${JSON.stringify({ beforeRelease, afterRelease: await readingStateDiagnostics(holder) })}`, { cause: error });
    }
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

test('a clear queued before a new save removes only the confirmed poems', async () => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await installReadingStateClock(context);
  const home = await context.newPage();
  await home.goto(base);
  await home.getByText(totalText).waitFor();
  await home.evaluate(() => localStorage.setItem('verso-library-v1', JSON.stringify({ saved: ['shakespeare-sonnet-18'], recent: [], extra: { keep: true } })));
  await home.reload();
  await home.locator('#shelf-items').getByText('Sonnet 18').waitFor();
  const reader = await context.newPage();
  await reader.goto(`${base}poems/old-pond-basho/`);
  await home.locator('#recent-items').getByText('The Old Pond').waitFor();
  const holder = await context.newPage();
  await holder.goto(base);
  await pauseReadingStateClock(context);
  await holdReadingStateLock(holder);
  try {
    await home.getByText('Clear saved poems', { exact: true }).click();
    await home.getByRole('button', { name: 'Yes, clear saved poems' }).click();
    await home.getByRole('status').getByText('Saving changes…').waitFor();
    const [clearRequest] = await pendingReadingStateLocks(holder, 1);
    await reader.getByRole('button', { name: /Save poem/ }).click();
    await reader.getByRole('status').getByText('Saving changes…').waitFor();
    const queued = await pendingReadingStateLocks(holder, 2);
    assert.equal(queued[0].clientId, clearRequest.clientId);
    assert.notEqual(queued[1].clientId, clearRequest.clientId);
    await holder.evaluate(() => window.releaseTestLock());
    await reader.getByRole('status').getByText('Saved to your shelf.').waitFor();
    const stored = await home.evaluate(() => JSON.parse(localStorage.getItem('verso-library-v1')));
    assert.deepEqual(stored.saved, ['old-pond-basho']);
    assert.deepEqual(stored.extra, { keep: true });
    assert.equal(await home.locator('.clear-conflict').count(), 0);
  } finally {
    await holder.evaluate(() => window.releaseTestLock?.());
    await context.close();
  }
});

test('tabs merge preference changes with queued saves without overwriting unrelated state', async () => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await installReadingStateClock(context);
  const first = await context.newPage();
  const second = await context.newPage();
  const holder = await context.newPage();
  await first.goto(`${base}poems/shakespeare-sonnet-18/`);
  await second.goto(`${base}poems/old-pond-basho/`);
  await second.waitForFunction(() => JSON.parse(localStorage.getItem('verso-library-v1') || '{}').recent?.includes('old-pond-basho'));
  await holder.goto(base);
  await pauseReadingStateClock(context);
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
  await installReadingStateClock(context);
  const reader = await context.newPage();
  await reader.goto(`${base}poems/shakespeare-sonnet-18/`);
  await reader.getByRole('button', { name: /Save poem/ }).click();
  await reader.getByRole('status').getByText('Saved to your shelf.').waitFor();
  const home = await context.newPage();
  await home.goto(`${base}#shelf`);
  await home.locator('#shelf-items').getByText('Sonnet 18').waitFor();
  const holder = await context.newPage();
  await holder.goto(base);
  await pauseReadingStateClock(context);
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
  await installReadingStateClock(context);
  const page = await context.newPage();
  const holder = await context.newPage();
  await page.goto(`${base}poems/quiet-night-thought-li-bai/`);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('verso-library-v1') || '{}').recent?.includes('quiet-night-thought-li-bai'));
  await holder.goto(base);
  await pauseReadingStateClock(context);
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
  await installReadingStateClock(context);
  const first = await context.newPage();
  await first.goto(`${base}poems/shakespeare-sonnet-18/`);
  await first.waitForFunction(() => JSON.parse(localStorage.getItem('verso-library-v1') || '{}').recent?.includes('shakespeare-sonnet-18'));
  const home = await context.newPage();
  await home.goto(`${base}#shelf`);
  await home.locator('#recent-items').getByText('Sonnet 18').waitFor();
  const holder = await context.newPage();
  await holder.goto(base);
  const reader = await context.newPage();
  await pauseReadingStateClock(context);
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
  await home.locator('.hero').getByRole('link', { name: /Find a poem/ }).focus();
  await home.keyboard.press('Enter');
  await home.waitForURL('**/#explore');
  assert.equal(new URL(home.url()).hash, '#explore');
  assert.equal(await home.locator('#search').isDisabled(), true);
  assert.equal(await home.getByText(/The library could not load/).isVisible(), true);
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
  await installReadingStateClock(context);
  const first = await context.newPage();
  const second = await context.newPage();
  const holder = await context.newPage();
  await first.goto(`${base}poems/shakespeare-sonnet-18/`);
  await second.goto(`${base}poems/shakespeare-sonnet-18/`);
  await second.waitForFunction(() => JSON.parse(localStorage.getItem('verso-library-v1') || '{}').recent?.includes('shakespeare-sonnet-18'));
  await holder.goto(base);
  await pauseReadingStateClock(context);
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
  await installReadingStateClock(context);
  const page = await context.newPage();
  const holder = await context.newPage();
  await page.goto(`${base}poems/shakespeare-sonnet-18/`);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('verso-library-v1') || '{}').recent?.includes('shakespeare-sonnet-18'));
  await holder.goto(base);
  await pauseReadingStateClock(context);
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
  await installReadingStateClock(context);
  const page = await context.newPage();
  const holder = await context.newPage();
  await page.goto(`${base}poems/shakespeare-sonnet-18/`);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('verso-library-v1') || '{}').recent?.includes('shakespeare-sonnet-18'));
  await holder.goto(base);
  await pauseReadingStateClock(context);
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
  const heroLinkContrast = link => link.evaluate(element => {
    const style = getComputedStyle(element);
    const parse = value => value.match(/[\d.]+/g).map(Number);
    const foreground = parse(style.color), background = parse(style.backgroundColor);
    if ((foreground[3] ?? 1) !== 1 || (background[3] ?? 1) !== 1) return 0;
    const luminance = color => {
      const channels = color.slice(0, 3).map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const first = luminance(foreground), second = luminance(background);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  });
  for (const path of ['', 'poems/quiet-night-thought-li-bai/']) {
    await page.goto(`${base}${path}`);
    if (!path) await page.getByText(totalText).waitFor();
    for (const theme of ['light', 'sepia', 'dark']) {
      await page.getByLabel('Reading theme').selectOption(theme);
      if (!path) {
        const heroLink = page.locator('.hero-text-link');
        assert.ok(await heroLinkContrast(heroLink) >= 4.5, `${theme} hero link`);
        await heroLink.hover();
        assert.ok(await heroLinkContrast(heroLink) >= 4.5, `${theme} hero link hover`);
        await heroLink.focus();
        assert.ok(await heroLinkContrast(heroLink) >= 4.5, `${theme} hero link focus`);
      }
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      assert.deepEqual(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], `${path || 'home'} / ${theme}`);
    }
  }
  await context.close();
});
