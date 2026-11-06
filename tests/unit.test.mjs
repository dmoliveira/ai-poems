import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCatalog } from '../scripts/catalog-data.mjs';
import { escapeHtml, filterPoems } from '../src/catalog.mjs';

const poems = await loadCatalog();
test('catalogue has distinct, sourced records in all eight original languages', () => {
  assert.ok(poems.length >= 1000);
  assert.equal(new Set(poems.map(p => p.id)).size, poems.length);
  assert.ok(new Set(poems.filter(p => !p.anonymous).map(p => p.authorId)).size >= 150);
  const normalizedText = poems.map(p => p.text.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''));
  assert.equal(new Set(normalizedText).size, poems.length, 'no identical works');
  for (const language of ['English', 'Spanish', 'Portuguese', 'French', 'Italian', 'Chinese', 'Japanese', 'Arabic']) assert.ok(poems.some(p => p.language === language), language);
  for (const p of poems) {
    assert.ok(p.text && p.source && p.rights && p.context && p.author && p.lang, p.id);
    assert.equal(new URL(p.source).protocol, 'https:');
    for (const translation of p.translations) assert.ok(translation.translator && translation.source && translation.rights && translation.text, p.id);
  }
});
test('historical imports retain complete lines, attribution, and edition caveats', () => {
  const byId = id => {
    const poem = poems.find(p => p.id === id);
    assert.ok(poem, id);
    return poem;
  };
  const tang = poems.filter(p => p.id.startsWith('tang-'));
  assert.equal(tang.length, 319);
  assert.ok(!tang.some(p => p.id === 'tang-233'), 'existing Li Bai work is not duplicated');
  assert.equal(byId('tang-108').author, 'Du Fu');
  assert.match(byId('tang-108').title, /左拾遺/);
  assert.equal(byId('tang-108').text.split('\n').length, 8);
  assert.match(byId('tang-179').title, /應制$/);
  assert.match(byId('tang-208').title, /弟妹。$/);
  assert.match(byId('tang-320').text, /莫待無花空折枝。$/);
  assert.equal(byId('castellana-003').text.split('\n').filter(Boolean).length, 46);
  assert.match(byId('castellana-003').text, /muy grande bien me quería\.$/);
  assert.match(byId('castellana-022').text, /RESPUESTA DE LAS CRIATURAS/);
  assert.match(byId('castellana-022').text, /ESPOSO/);
  assert.equal(byId('castellana-072').country, 'Venezuela');
  assert.equal(byId('castellana-086').country, 'Cuba');
  assert.match(byId('american-1922-00332').text, /^Done at Atlanta[\s\S]*O Silent God/);
  assert.match(byId('american-1922-00332').text, /In silence, O Silent God\.\nSelah!$/);
  assert.equal(byId('american-1922-00659').author, 'Claude McKay');
  assert.equal(new URL(byId('american-1922-00659').source).pathname, '/cache/epub/11986/pg11986-images.html');
  assert.equal(byId('american-1922-00659').text.split('\n').filter(Boolean).length, 14);
  assert.match(byId('american-1922-00611').text, /I am tired of civilization\.$/);
  assert.equal(byId('espanca-magoas-02').text.split('\n').filter(Boolean).length, 14);
  assert.equal(new URL(byId('espanca-magoas-02').source).pathname, '/cache/epub/17610/pg17610-images.html');
  assert.match(byId('espanca-magoas-02').text, /Acordo do meu sonho\.\.\. E não sou nada!/);
  assert.equal(byId('baudelaire-l-albatros').text.split('\n').filter(Boolean).length, 16);
  assert.match(byId('dickinson-2-1-06').context, /altered punctuation/);
  assert.match(byId('dickinson-2-1-06').text, /It asked a crumb of me\.$/);
  assert.equal(byId('castellana-003').anonymous, true);
  assert.equal(byId('tang-108').year, null);
});
test('sonnet import keeps all 154 poems and their authentic line-count exceptions', () => {
  const sonnets = poems.filter(p => p.authorId === 'william-shakespeare');
  assert.equal(sonnets.length, 154);
  for (let n = 1; n <= 154; n++) assert.equal(sonnets[n - 1].text.split('\n').length, ({ 99: 15, 126: 12 })[n] || 14);
  assert.match(sonnets[17].text, /^Shall I compare thee to a summer’s day\?/);
});
test('search combines text, accents, metadata, translation and dates without guessing unknown years', () => {
  assert.ok(filterPoems(poems, { query: 'jose marti' }).some(p => p.id === 'rosa-blanca-marti'));
  assert.ok(filterPoems(poems, { query: '蛙とびこむ' }).some(p => p.id === 'old-pond-basho'));
  assert.ok(filterPoems(poems, { query: '杜甫' }).some(p => p.id === 'tang-108'));
  assert.ok(filterPoems(poems, { query: 'florbela espanca' }).some(p => p.id === 'espanca-magoas-02'));
  assert.ok(filterPoems(poems, { query: 'if we must die' }).some(p => p.id === 'american-1922-00659'));
  assert.ok(filterPoems(poems, { language: 'Arabic' }).some(p => p.id === 'let-the-days-do-as-they-will'));
  assert.ok(filterPoems(poems, { translation: 'Arabic' }).some(p => p.id === 'quiet-night-thought-li-bai'));
  assert.ok(filterPoems(poems, { author: 'William Shakespeare', from: '1609', to: '1609' }).length >= 154);
  assert.ok(!filterPoems(poems, { language: 'Chinese', from: '1' }).some(p => p.id === 'quiet-night-thought-li-bai'));
  assert.ok(filterPoems(poems, { theme: 'Nature' }).every(p => p.themes.includes('Nature')));
});
test('HTML escaping protects text and attribute contexts', () => {
  assert.equal(escapeHtml(`<script x='a'>&"`), '&lt;script x=&#39;a&#39;&gt;&amp;&quot;');
});
test('additional individual or batched JSON files extend the catalogue', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'verso-catalog-test-'));
  const first = join(dir, 'a.json');
  const second = join(dir, 'b.json');
  t.after(async () => { await unlink(first); await unlink(second); await rmdir(dir); });
  await writeFile(first, JSON.stringify({ ...poems[0], id: 'test-individual' }));
  await writeFile(second, JSON.stringify([{ ...poems[1], id: 'test-batch' }]));
  const extended = await loadCatalog(pathToFileURL(`${dir}${sep}`));
  assert.ok(extended.some(p => p.id === 'test-individual'));
  assert.ok(extended.some(p => p.id === 'test-batch'));
});
test('build creates crawlable pages, valid schema and a complete sitemap', async () => {
  execFileSync('node', ['scripts/build.mjs'], { stdio: 'pipe' });
  const home = await readFile('_site/index.html', 'utf8');
  const sitemap = await readFile('_site/sitemap.xml', 'utf8');
  const robots = await readFile('_site/robots.txt', 'utf8');
  assert.match(home, /Verso Poetry Library \| Poems Across Languages/);
  assert.ok(home.includes(`Browse the complete poetry index (${poems.length})`));
  assert.equal((sitemap.match(/<loc>/g) || []).length, poems.length + 1);
  assert.match(robots, /https:\/\/dmoliveira\.github\.io\/ai-poems\/sitemap\.xml/);
  for (const p of poems) {
    const page = await readFile(`_site/poems/${p.id}/index.html`, 'utf8');
    assert.ok(page.includes(`https://dmoliveira.github.io/ai-poems/poems/${p.id}/`), p.id);
    assert.ok(page.includes(escapeHtml(p.text.split('\n')[0])), p.id);
    assert.ok(sitemap.includes(`/poems/${p.id}/`), p.id);
    const schema = JSON.parse(page.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.equal(schema['@type'], 'CreativeWork');
    assert.equal(schema.inLanguage, p.lang);
  }
  const chinese = await readFile('_site/poems/quiet-night-thought-li-bai/index.html', 'utf8');
  assert.match(chinese, /AI-assisted, not yet independently reviewed/);
  assert.match(chinese, /dir="rtl"/);
  const basho = await readFile('_site/poems/old-pond-basho/index.html', 'utf8');
  assert.doesNotMatch(basho, /"datePublished":/);
  const leopardi = await readFile('_site/poems/linfinito-leopardi/index.html', 'utf8');
  assert.match(leopardi, /"datePublished":"1825"/);
  assert.match(leopardi, /Research on the first publication of the Idilli/);
  const sonnet18 = await readFile('_site/poems/shakespeare-sonnet-18/index.html', 'utf8');
  assert.match(sonnet18, /Connections we can trace/);
  assert.match(sonnet18, /not a claim of influence/);
  const anonymous = await readFile('_site/poems/castellana-003/index.html', 'utf8');
  const anonymousSchema = JSON.parse(anonymous.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(anonymousSchema.author, undefined);
  assert.doesNotMatch(anonymous, /More poems by the same author/);
});
