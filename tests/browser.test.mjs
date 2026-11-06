import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { loadCatalog } from '../scripts/catalog-data.mjs';
import { filterPoems } from '../src/catalog.mjs';

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
  await page.getByRole('button', { name: /A quiet moment/ }).click();
  const quietCount = filterPoems(poems, { theme: 'Quiet' }).length;
  await page.getByText(`${quietCount} ${quietCount === 1 ? 'poem' : 'poems'} found`).waitFor();
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

test('reader switches languages and shows provenance and RTL text', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}poems/quiet-night-thought-li-bai/`);
  await page.getByLabel('Read in').selectOption({ label: 'Arabic' });
  await page.getByText('AI-assisted, not yet independently reviewed', { exact: false }).first().waitFor();
  assert.equal(await page.locator('#translation-panel .verse').getAttribute('dir'), 'rtl');
  await page.getByRole('button', { name: 'Side by side' }).click();
  assert.equal(await page.locator('#original-panel').isVisible(), true);
  assert.equal(await page.locator('#translation-panel').isVisible(), true);
  assert.equal(await page.locator('#original-panel .verse').getAttribute('lang'), 'zh-Hant');
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
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.goto(base);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
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
