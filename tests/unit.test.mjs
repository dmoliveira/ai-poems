import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCatalog } from '../scripts/catalog-data.mjs';
import { renderHome, renderPoem } from '../scripts/templates.mjs';
import { associatedPlaces, discoveryOrder, escapeHtml, filterPoems, lineCount, placeCounts, surprisePoem } from '../src/catalog.mjs';

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
  assert.equal(filterPoems(poems, { collection: 'The Book of American Negro Poetry' }).length, 113);
});
test('varied discovery preserves all works and rotates languages and authors', () => {
  const varied = discoveryOrder(poems);
  assert.equal(varied.length, poems.length);
  assert.equal(new Set(varied.map(p => p.id)).size, poems.length);
  assert.equal(new Set(varied.slice(0, 8).map(p => p.language)).size, 8);
  const oneLanguage = discoveryOrder(poems.filter(p => p.language === 'English'));
  assert.equal(new Set(oneLanguage.slice(0, 10).map(p => p.authorId)).size, 10);
  const sample = [{ id: 'a1', authorId: 'a' }, { id: 'a2', authorId: 'a' }, { id: 'b1', authorId: 'b' }];
  assert.equal(surprisePoem([], () => 0), null);
  assert.equal(surprisePoem(sample, () => 0.75).id, 'b1');
  assert.equal(surprisePoem(sample, () => 0).id, 'a1');
});
test('country counts match results and explicit multi-place associations overlap', () => {
  assert.deepEqual(associatedPlaces({ country: 'Jamaica / United States' }), ['Jamaica', 'United States']);
  assert.deepEqual(associatedPlaces({ country: 'China / China' }), ['China']);
  for (const { place, count } of placeCounts(poems)) assert.equal(filterPoems(poems, { country: place }).length, count, place);
  const mckay = poems.find(p => p.id === 'american-1922-00659');
  assert.ok(filterPoems([mckay], { country: 'United States' }).includes(mckay));
  assert.ok(filterPoems([mckay], { country: 'Jamaica' }).includes(mckay));
  assert.ok(!filterPoems([mckay], { country: 'Cuba' }).length);
  const home = renderHome([{ ...mckay, country: 'United States / New place' }], '/test-base/');
  assert.match(home, /src="\/test-base\/assets\/flags\/us\.svg" alt=""/);
  assert.match(home, /class="country-flag" aria-hidden="true">⌁<\/span><span class="country-label"><strong>New place/);
});
test('length filters count transcribed nonblank lines and cover the whole catalogue', () => {
  assert.equal(lineCount({ text: 'First\n \nSecond\r\nThird' }), 3);
  assert.equal(lineCount(poems.find(p => p.id === 'old-pond-basho')), 1);
  const groups = ['1-4', '5-14', '15-plus'].map(length => filterPoems(poems, { length }));
  assert.ok(groups.every(group => group.length));
  assert.ok(groups[0].every(p => lineCount(p) <= 4));
  assert.ok(groups[1].every(p => lineCount(p) >= 5 && lineCount(p) <= 14));
  assert.ok(groups[2].every(p => lineCount(p) >= 15));
  assert.equal(groups.reduce((sum, group) => sum + group.length, 0), poems.length);
  assert.ok(filterPoems(poems, { country: 'Italy', length: '5-14' }).some(p => p.id === 'leopardi-ricordanza'));
});
test('available-language filtering includes originals and translations without inventing either', () => {
  const english = filterPoems(poems, { readable: 'English' });
  assert.ok(english.some(p => p.id === 'shakespeare-sonnet-18'));
  assert.ok(english.some(p => p.id === 'leopardi-ricordanza'));
  assert.ok(!english.some(p => p.id === 'let-the-days-do-as-they-will'));
  const italianEnglish = filterPoems(poems, { country: 'Italy', readable: 'English' });
  assert.ok(italianEnglish.some(p => p.id === 'linfinito-leopardi'));
  assert.ok(!italianEnglish.some(p => p.id === 'leopardi-sera-giorno-festivo'));
  assert.ok(filterPoems(poems, { readable: 'Arabic' }).some(p => p.id === 'quiet-night-thought-li-bai'));
  assert.ok(filterPoems(poems, { readable: 'Arabic' }).some(p => p.id === 'let-the-days-do-as-they-will'));
});
test('Italian additions retain early-edition texts and separately sourced translations', () => {
  const byId = id => poems.find(p => p.id === id);
  const moon = byId('leopardi-ricordanza');
  const evening = byId('leopardi-sera-giorno-festivo');
  const infinite = byId('linfinito-leopardi');
  assert.equal(lineCount(moon), 14);
  assert.equal(lineCount(evening), 46);
  assert.match(moon.text, /^O graziosa Luna/);
  assert.match(evening.text, /Al modo istesso mi stringeva il core\.$/);
  for (const poem of [moon, infinite]) {
    const translation = poem.translations.find(t => t.language === 'English');
    assert.match(translation.translator, /Frederick Townsend.*1887.*later textual version/);
    assert.match(translation.rights, /later/i);
    assert.match(translation.source, /gutenberg\.org\/files\/19315/);
  }
  assert.match(moon.source, /oldid=3768364/);
  assert.match(evening.source, /oldid=3768365/);
});
test('distinct same-titled works retain their texts and show their opening lines', () => {
  const first = poems.find(p => p.id === 'tang-013');
  const second = poems.find(p => p.id === 'tang-226');
  assert.equal(first.title, second.title);
  assert.equal(first.authorId, second.authorId);
  assert.notEqual(first.text, second.text);
  assert.equal(first.disambiguation, '下馬飲君酒，');
  assert.equal(second.disambiguation, '山中相送罷，');
});
test('historical English translations are individually credited and complete', () => {
  for (const id of ['baudelaire-la-muse-venale', 'baudelaire-la-vie-anterieure', 'baudelaire-don-juan-aux-enfers', 'baudelaire-remords-posthume']) {
    const poem = poems.find(p => p.id === id);
    const translation = poem.translations.find(t => t.language === 'English');
    assert.match(translation.translator, /F\. P\. Sturm/);
    assert.match(translation.source, /gutenberg\.org\/files\/47032/);
    assert.match(translation.rights, /1919.*public domain in the United States/i);
    assert.equal(translation.text.split('\n').filter(Boolean).length, id === 'baudelaire-don-juan-aux-enfers' ? 20 : 14);
  }
});
test('HTML escaping protects text and attribute contexts', () => {
  assert.equal(escapeHtml(`<script x='a'>&"`), '&lt;script x=&#39;a&#39;&gt;&amp;&quot;');
  const unsafe = { ...poems[0], title: '</script><script>alert(1)</script>', displayTitle: undefined };
  const page = renderPoem(unsafe, poems, '/ai-poems/');
  const embedded = page.match(/<script type="application\/json" id="reader-data">(.*?)<\/script>/s)[1];
  assert.equal(JSON.parse(embedded)[0].title, unsafe.title);
  assert.ok(!embedded.includes('</script>'));
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
  for (const { place, count } of placeCounts(poems)) assert.ok(home.includes(`${escapeHtml(place)}</strong><small>${count} ${count === 1 ? 'poem' : 'poems'}</small>`), place);
  assert.match(home, /Places are associations, not necessarily where a poem was written/);
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
  const ambiguous = await readFile('_site/poems/tang-013/index.html', 'utf8');
  assert.match(ambiguous, /Opening line:.*下馬飲君酒，/);
  assert.match(home, /送別.*下馬飲君酒，/);
  const translated = await readFile('_site/poems/baudelaire-la-muse-venale/index.html', 'utf8');
  assert.match(translated, /F\. P\. Sturm/);
  assert.match(translated, /jests to drive away thy spleen/);
  const untranslated = await readFile('_site/poems/shakespeare-sonnet-18/index.html', 'utf8');
  assert.match(untranslated, /Original only · translation not yet available/);
  assert.doesNotMatch(untranslated, /data-view="translation"/);
  assert.match(untranslated, /<dt>Themes<\/dt><dd>Love, Nature, Time<\/dd>/);
  assert.match(anonymous, /<dt>Themes<\/dt><dd>Not yet classified<\/dd>/);
});
