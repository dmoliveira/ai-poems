import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCatalog } from '../scripts/catalog-data.mjs';
import { renderFeed } from '../scripts/feed.mjs';
import { groupPoets } from '../scripts/poets.mjs';
import { relatedPoems } from '../scripts/recommendations.mjs';
import { renderHome, renderPoem, renderPoet } from '../scripts/templates.mjs';
import { associatedPlaces, collectionLabel, contextualCounts, countedFilters, discoveryOrder, escapeHtml, filterPoems, lineCount, placeCounts, poemCard, recordedYearRanges, surprisePoem, yearRangeCounts } from '../src/catalog.mjs';

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
  assert.ok(associatedPlaces(byId('castellana-072')).includes('Venezuela'));
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
test('Brazilian originals retain their reviewed edition texts, evidence and discovery', () => {
  const cases = [
    ['cancao-do-exilio-goncalves-dias', 'CANCAO', 24, '4239dad4c9f1d576ea933ec77ed47cae35f77cecec5057dc8ecd8ca3719d8da7'],
    ['cachias-goncalves-dias', 'CACHIAS', 24, 'c854332c71ea705b40ef8e9296119ba614d5f75bde4c1ffe7f4e5dbc03e7878a'],
    ['desejo-goncalves-dias', 'DESEJO', 12, 'a21aa33fec72a42c90c536d094953330a373c8744bbd32d21bbda0356676e6ee'],
    ['te-deum-goncalves-dias', 'TE_DEUM', 32, 'fa6b39580f2cb0257672476c6c42ecfa0c3cdd9e5f660ad1d9e184b4f62e6ad4'],
  ];
  const selected = cases.map(([id]) => poems.find(p => p.id === id));
  for (const [id, anchor, lines, digest] of cases) {
    const poem = selected.find(p => p?.id === id);
    assert.ok(poem, id);
    assert.equal(poem.authorId, 'goncalves-dias');
    assert.equal(poem.author, 'Gonçalves Dias');
    assert.equal(poem.authorYears, '1823–1864');
    assert.deepEqual(associatedPlaces(poem), ['Brazil']);
    assert.equal(poem.language, 'Portuguese');
    assert.equal(poem.lang, 'pt');
    assert.equal(poem.source, `https://www.gutenberg.org/cache/epub/74854/pg74854-images.html#${anchor}`);
    assert.match(poem.sourceTitle, /third edition \(1860\)/);
    assert.match(poem.rights, /public domain in the United States.*Check local law/);
    assert.equal(lineCount(poem), lines);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), digest);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Portuguese', country: 'Brazil' }).includes(poem));
    assert.ok(filterPoems(poems, { query: 'goncalves dias' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  const [exile, cachias, desire, hymn] = selected;
  assert.equal(exile.year, 1843);
  assert.match(exile.yearLabel, /Dated.*1843/);
  assert.match(exile.creationPlace, /Coimbra/);
  for (const poem of [cachias, desire, hymn]) {
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
  }
  assert.match(cachias.text, /Na base da montanha;\nEs bella/);
  for (const poem of [exile, desire, hymn]) assert.match(poem.context, /epigraph is not included/);
  assert.match(hymn.context, /Christian Te Deum.*Catholic and other Christian traditions/);
  assert.ok(filterPoems(poems, { theme: 'Faith', query: 'te deum' }).includes(hymn));
  assert.ok(filterPoems(poems, { query: 'gorgeiao' }).includes(exile));
  const poet = groupPoets(poems).find(group => group.id === 'goncalves-dias');
  for (const [id] of cases) assert.ok(poet.poems.some(p => p.id === id), id);
  const home = renderHome(poems, '/ai-poems/');
  assert.ok(home.includes('/ai-poems/assets/flags/br.svg'));
  assert.ok(home.includes(`Brazil</strong><small>${placeCounts(poems).find(p => p.place === 'Brazil').count} poems`));
});
test('French classics retain their proofread texts, edition credits and complete discovery', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/hugo-1911.json', import.meta.url), 'utf8'));
  assert.equal(manifest.length, 55);
  const ids = manifest.map(item => `hugo-contemplations-${item.book}-${String(item.number).padStart(2, '0')}`);
  assert.equal(new Set(ids).size, ids.length);
  const selected = ids.map(id => poems.find(p => p.id === id));
  for (const [index, item] of manifest.entries()) {
    const poem = selected[index];
    assert.ok(poem, ids[index]);
    assert.equal(poem.authorId, 'victor-hugo');
    assert.equal(poem.author, 'Victor Hugo');
    assert.equal(poem.language, 'French');
    assert.equal(poem.lang, 'fr');
    assert.deepEqual(associatedPlaces(poem), ['France']);
    assert.equal(poem.source, item.source);
    assert.ok(new URL(poem.source).searchParams.has('oldid'));
    assert.match(poem.sourceTitle, /Nelson 1911/);
    assert.match(poem.rights, /Wikisource contributors under CC BY-SA 4\.0/);
    assert.match(poem.context, /1911.*1858 edition is linked for comparison/);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(lineCount(poem), item.lines);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), item.sha256);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'French', author: 'Victor Hugo' }).includes(poem));
    if (item.title.startsWith('«')) assert.equal(poem.title, poem.text.split('\n')[0]);
  }
  const coccinelle = poems.find(p => p.id === 'hugo-contemplations-1-15');
  const verses = poems.find(p => p.id === 'hugo-contemplations-2-02');
  const spider = poems.find(p => p.id === 'hugo-contemplations-3-27');
  assert.deepEqual(coccinelle.text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4, 4, 4, 4]);
  assert.match(verses.text, /^Mes vers fuiraient, doux et frêles,/);
  assert.match(spider.text, /^J’aime l’araignée et j’aime l’ortie,/);
  assert.ok(filterPoems(poems, { query: 'mes vers fuiraient' }).includes(verses));
  assert.ok(filterPoems(poems, { query: 'araignee et j’aime l’ortie' }).includes(spider));
  const poet = groupPoets(poems).find(p => p.id === 'victor-hugo');
  for (const id of ids) assert.ok(poet.poems.some(p => p.id === id), id);
  assert.ok(poet.poems.some(p => p.id === 'demain-des-laube-hugo'));
});
test('Italian classics retain reviewed texts, edition caveats and complete discovery', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/leopardi-1917.json', import.meta.url), 'utf8'));
  assert.equal(manifest.length, 32);
  const ids = manifest.map(item => `leopardi-canti-${String(item.number).padStart(2, '0')}`);
  assert.equal(new Set(ids).size, ids.length);
  const selected = ids.map(id => poems.find(p => p.id === id));
  for (const [index, item] of manifest.entries()) {
    const poem = selected[index];
    assert.ok(poem, ids[index]);
    assert.equal(poem.authorId, 'giacomo-leopardi');
    assert.equal(poem.author, 'Giacomo Leopardi');
    assert.equal(poem.language, 'Italian');
    assert.equal(poem.lang, 'it');
    assert.deepEqual(associatedPlaces(poem), ['Italy']);
    assert.equal(poem.source, item.source);
    assert.ok(new URL(poem.source).searchParams.has('oldid'));
    assert.match(poem.sourceTitle, /Donati edition 1917/);
    assert.match(poem.rights, /Wikisource contributors under CC BY-SA 4\.0/);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(lineCount(poem), item.lines);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), item.sha256);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Italian', author: 'Giacomo Leopardi' }).includes(poem));
    for (const review of item.scanReviews) assert.ok(review.line > 0 && review.line <= item.lines && review.page > 0);
  }
  for (const excluded of [12, 13, 14, 35]) assert.ok(!ids.includes(`leopardi-canti-${excluded}`));
  const byNumber = number => poems.find(p => p.id === `leopardi-canti-${String(number).padStart(2, '0')}`);
  const line = (number, index) => byNumber(number).text.split('\n').filter(Boolean)[index - 1];
  assert.equal(line(20, 41), 'Qual fui! quanto dissimile');
  assert.equal(line(20, 143), 'e d’un celeste foco');
  assert.equal(line(32, 7), 'l’uomo, o si può. Fra meraviglia e sdegno,');
  assert.equal(line(32, 38), 'Aureo secolo omai volgono, o Gino,');
  assert.equal(line(33, 63), 'Ma la vita mortal, poi che la bella');
  assert.equal(line(34, 75), 'dalla barbarie in parte, e per cui solo');
  assert.equal(line(34, 169), 'e sono immense in guisa');
  assert.match(byNumber(33).context, /1917 print.*immortal.*mortal.*Ranieri/);
  assert.match(byNumber(34).context, /John 3:19.*317-line.*three lines/);
  assert.deepEqual(byNumber(10).text.split('\n\n').map(stanza => stanza.split('\n').length), [...Array(34).fill(3), 1]);
  assert.ok(filterPoems(poems, { query: 'rimembri ancora' }).includes(byNumber(21)));
  assert.ok(filterPoems(poems, { query: 'sabato del villaggio' }).includes(byNumber(25)));
  const poet = groupPoets(poems).find(p => p.id === 'giacomo-leopardi');
  for (const id of [...ids, 'linfinito-leopardi', 'leopardi-ricordanza', 'leopardi-sera-giorno-festivo']) {
    assert.ok(poet.poems.some(p => p.id === id), id);
  }
});
test('Machado originals retain scan-reviewed readings, credits and discovery', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/machado-reviewed.json', import.meta.url), 'utf8'));
  assert.equal(manifest.length, 23);
  const ids = manifest.map(item => `machado-${item.slug}`);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of manifest) {
    const poem = poems.find(p => p.id === `machado-${item.slug}`);
    assert.ok(poem, item.slug);
    assert.equal(poem.author, 'Machado de Assis');
    assert.equal(poem.authorId, 'machado-de-assis');
    assert.equal(poem.authorYears, '1839–1908');
    assert.deepEqual(associatedPlaces(poem), ['Brazil']);
    assert.equal(poem.language, 'Portuguese');
    assert.equal(poem.lang, 'pt');
    assert.equal(poem.source, item.source);
    assert.ok(new URL(poem.source).searchParams.has('oldid'));
    assert.match(poem.sourceTitle, new RegExp(String(item.edition)));
    assert.match(poem.rights, /Wikisource contributors under CC BY-SA 4\.0/);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(lineCount(poem), item.lines);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), item.sha256);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Portuguese', country: 'Brazil', author: 'Machado de Assis' }).includes(poem));
    for (const correction of item.corrections) {
      assert.equal(poem.text.split('\n').filter(Boolean)[correction.line - 1], correction.after);
      assert.ok(correction.scanPage > 0);
    }
  }
  for (const slug of ['o-corvo', 'to-be-or-not-to-be', 'dante', 'a-elvira', 'lyra-chineza']) assert.ok(!ids.includes(`machado-${slug}`));
  const faith = poems.find(p => p.id === 'machado-fe');
  const charity = poems.find(p => p.id === 'machado-caridade');
  const visio = poems.find(p => p.id === 'machado-visio');
  assert.deepEqual(faith.text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4, 4, 4, 4, 4]);
  assert.match(faith.context, /epigraph.*authorship is disputed/);
  assert.match(charity.text, /Dando-lhes leito e pão, guarida e amor\.$/);
  assert.match(charity.text, /Parou\. E na anciedade ainda o mesmo encanto\nDescia-lhe/);
  assert.match(visio.text, /Entre lagrimas luziam/);
  assert.match(visio.text, /Com o olhar indifferente/);
  assert.match(poems.find(p => p.id === 'machado-lindoya').context, /Basílio da Gama’s O Uraguai/);
  assert.ok(filterPoems(poems, { theme: 'Faith', query: 'oracoes dos homens' }).includes(faith));
  assert.ok(filterPoems(poems, { query: 'bailando no ar' }).some(p => p.id === 'machado-circulo-vicioso'));
  const poet = groupPoets(poems).find(p => p.id === 'machado-de-assis');
  for (const id of ids) assert.ok(poet.poems.some(p => p.id === id), id);
});
test('Bashō travel verses retain reviewed originals, attribution and source variants', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/basho-oku-reviewed.json', import.meta.url), 'utf8'));
  assert.equal(manifest.length, 40);
  assert.equal(new Set(manifest.map(item => item.number)).size, 40);
  const ids = manifest.map(item => `basho-oku-${String(item.number).padStart(2, '0')}`);
  for (const [index, item] of manifest.entries()) {
    const poem = poems.find(p => p.id === ids[index]);
    assert.ok(poem, ids[index]);
    assert.equal(poem.authorId, 'matsuo-basho');
    assert.equal(poem.authorOriginal, '松尾芭蕉');
    assert.equal(poem.language, 'Japanese');
    assert.equal(poem.lang, 'ja');
    assert.deepEqual(associatedPlaces(poem), ['Japan']);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.source, item.source);
    assert.ok(new URL(poem.source).searchParams.has('oldid'));
    assert.match(poem.rights, /Wikisource transcription by contributors under CC BY-SA 4\.0/);
    assert.equal(poem.text, item.text);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), item.sha256);
    assert.equal(lineCount(poem), 1);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Japanese', country: 'Japan', author: 'Matsuo Bashō', query: poem.text }).includes(poem));
  }
  assert.ok(!ids.includes('basho-oku-16'));
  assert.ok(!ids.includes('basho-oku-23'));
  assert.equal(poems.find(p => p.id === 'basho-oku-20').text, '這ひ出でよかひやが下の蟾の聲');
  assert.match(poems.find(p => p.id === 'basho-oku-20').context, /scan reads かひや.*transcription reads かいや/);
  assert.equal(poems.find(p => p.id === 'basho-oku-38').text, 'あかあかと日はつれなくも秋の風');
  assert.equal(poems.find(p => p.id === 'basho-oku-40').text, 'むざんやな兜の下のきりぎりす');
  assert.match(poems.find(p => p.id === 'basho-oku-22').context, /しみ入る.*しみ込/);
  assert.match(poems.find(p => p.id === 'basho-oku-35').context, /右.*道/);
  const poet = groupPoets(poems).find(p => p.id === 'matsuo-basho');
  for (const id of [...ids, 'old-pond-basho', 'summer-grass-basho', 'mogami-river-basho']) assert.ok(poet.poems.some(p => p.id === id), id);
});
test('Bashō Nozarashi verses retain scan-reviewed readings, attribution and variants', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/basho-nozarashi-reviewed.json', import.meta.url), 'utf8'));
  assert.equal(manifest.length, 40);
  assert.equal(new Set(manifest.map(item => item.number)).size, 40);
  const ids = manifest.map(item => `basho-nozarashi-${String(item.number).padStart(2, '0')}`);
  for (const [index, item] of manifest.entries()) {
    const poem = poems.find(p => p.id === ids[index]);
    assert.ok(poem, ids[index]);
    assert.equal(poem.authorId, 'matsuo-basho');
    assert.equal(poem.authorOriginal, '松尾芭蕉');
    assert.equal(poem.language, 'Japanese');
    assert.equal(poem.lang, 'ja');
    assert.deepEqual(associatedPlaces(poem), ['Japan']);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.source, item.source);
    assert.ok(new URL(poem.source).searchParams.has('oldid'));
    assert.equal(poem.contextSource, 'https://www.basho-bp.jp/?page_id=20');
    assert.match(poem.rights, /Wikisource transcription by contributors under CC BY-SA 4\.0/);
    assert.equal(poem.text, item.text);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), item.sha256);
    assert.equal(lineCount(poem), 1);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Japanese', country: 'Japan', author: 'Matsuo Bashō', query: poem.text }).includes(poem));
  }
  for (const number of [10, 18, 25]) assert.ok(!ids.includes(`basho-nozarashi-${number}`));
  assert.equal(poems.find(p => p.id === 'basho-nozarashi-15').text, '露とくとくこゝろみにうき世すゝがばや');
  assert.match(poems.find(p => p.id === 'basho-nozarashi-05').context, /道ばた.*道の辺/);
  assert.match(poems.find(p => p.id === 'basho-nozarashi-30').context, /朝霞.*朝がすみ.*薄霞/);
  assert.match(poems.find(p => p.id === 'basho-nozarashi-31').context, /こもりの僧.*氷の僧/);
  assert.match(poems.find(p => p.id === 'basho-nozarashi-37').context, /ふたつ中に活けたる.*ふたつの中に活たる/);
  const poet = groupPoets(poems).find(p => p.id === 'matsuo-basho');
  for (const id of [...ids, 'basho-oku-22', 'old-pond-basho']) assert.ok(poet.poems.some(p => p.id === id), id);
});
test('Buson verses preserve the reviewed 1926 scans and existing poet identity', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/buson-1926-reviewed.json', import.meta.url), 'utf8'));
  assert.equal(manifest.poems.length, 32);
  assert.equal(Object.keys(manifest.scanSha256).length, 13);
  const selected = manifest.poems.map((item, index) => {
    const id = `buson-1926-${String(index + 1).padStart(2, '0')}`;
    const poem = poems.find(p => p.id === id);
    assert.ok(poem, id);
    assert.equal(poem.authorId, 'yosa-buson');
    assert.equal(poem.authorOriginal, '与謝蕪村');
    assert.equal(poem.authorYears, '1716–1783/84');
    assert.equal(poem.language, 'Japanese');
    assert.equal(poem.lang, 'ja');
    assert.deepEqual(associatedPlaces(poem), ['Japan']);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.source, `https://dl.ndl.go.jp/pid/1019573/1/${item.scan}`);
    assert.match(poem.sourceTitle, new RegExp(`1926.*p\\. ${item.page}$`));
    assert.equal(poem.contextSource, 'https://kigosai.sub.jp/bs/?page_id=25582');
    assert.match(poem.rights, /public domain in the United States.*Check local law/);
    assert.equal(poem.text, item.text);
    assert.equal(lineCount(poem), 1);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Japanese', country: 'Japan', author: 'Yosa Buson', query: poem.text }).includes(poem));
    return poem;
  });
  assert.equal(createHash('sha256').update(selected.map(p => p.text).join('\n')).digest('hex'), '9a8d7fe44e957f8eafd4a460c54aca77786aaf2714c2c67573b942496274c16e');
  assert.match(selected[0].context, /寢.*寝/);
  assert.match(selected[11].context, /ものがたり.*ものかたり/);
  assert.match(selected[29].context, /歸.*帰/);
  const poet = groupPoets(poems).find(p => p.id === 'yosa-buson');
  for (const id of [...selected.map(p => p.id), 'rapeseed-flowers-buson', 'spring-sea-buson']) assert.ok(poet.poems.some(p => p.id === id), id);
});
test('reviewed poet associations preserve sources, texts and legacy place filters', () => {
  const cases = [
    { id: 'castellana-072', authorId: 'andres-bello', years: '1781–1865', places: ['Venezuela', 'England', 'Chile'], source: 'https://www.gutenberg.org/files/65880/65880-h/65880-h.htm#P072', sourceTitle: 'Project Gutenberg · Las cien mejores poesías, 1910, no. 72', contextSource: 'https://uchile.cl/presentacion/historia/rectores-de-la-u-de-chile/andres-bello-lopez-1843-1865', digest: '17497bcd8cbbb154613010d62bb98115e0a8045ba32327bab819cca81565ce68' },
    { id: 'american-1922-00633', authorId: 'r-nathaniel-dett', years: '1882–1943', places: ['United States', 'Canada'], source: 'https://www.gutenberg.org/cache/epub/11986/pg11986-images.html#id00633', sourceTitle: 'Project Gutenberg · The Book of American Negro Poetry (1922)', contextSource: 'https://www.lva.virginia.gov/collections/dvb/bio/dett-r-nathaniel', digest: '0c0cdd668007b3e124c75e54c4464651daee41a1e78b62c4765bbad306abcf01' },
  ];
  const original = poems.map(p => p.id === cases[0].id ? { ...p, country: 'Venezuela' } : p.id === cases[1].id ? { ...p, country: 'United States' } : p);
  for (const { id, authorId, years, places, source, sourceTitle, contextSource, digest } of cases) {
    const poem = poems.find(p => p.id === id);
    assert.equal(poem.authorId, authorId);
    assert.equal(poem.authorYears, years);
    assert.deepEqual(associatedPlaces(poem), places);
    assert.equal(poem.source, source);
    assert.equal(poem.sourceTitle, sourceTitle);
    assert.equal(poem.contextSource, contextSource);
    assert.equal(poem.rights, 'Historical original in a pre-1931 edition; public domain in the United States. Check local law before reuse.');
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), digest);
    assert.deepEqual(poem.translations, []);
    assert.equal(poem.year, null);
    assert.equal(poem.yearLabel, 'Composition date not established');
    assert.equal(poem.creationPlace, undefined);
    assert.match(poem.context, /places describe the poet, not necessarily where this poem was written/);
    const page = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(page.includes(`href="${escapeHtml(contextSource)}"`));
    assert.match(page, /<dt>Created in<\/dt><dd>Not established<\/dd>/);
    const poet = groupPoets(poems).find(group => group.id === authorId);
    assert.ok(renderPoet(poet, '/ai-poems/').includes(escapeHtml(years)));
    for (const place of places) {
      assert.ok(filterPoems(poems, { country: place }).some(p => p.id === id), `${id}: ${place}`);
      assert.equal(contextualCounts(poems, { author: poem.author }).country.get(place), 1, `${id}: ${place}`);
    }
  }
  for (const place of ['Venezuela', 'United States']) assert.equal(filterPoems(poems, { country: place }).length, filterPoems(original, { country: place }).length);
  for (const place of ['England', 'Chile', 'Canada']) assert.equal(filterPoems(poems, { country: place }).length, filterPoems(original, { country: place }).length + 1);
  const home = renderHome(poems, '/ai-poems/');
  for (const code of ['ca', 'cl']) assert.ok(home.includes(`/ai-poems/assets/flags/${code}.svg`));
});
test('new circle flags match the pinned upstream revision', async () => {
  for (const [code, digest] of [
    ['br', '2333b293cbc44e8b736565ac84d4bd03cb136f017e5194d321dcc8ca46aa0464'],
    ['ca', 'be435f09cf3e411f2436202801a90d127800cc5f7b970fdd95aa4f177f8075a9'],
    ['cl', 'adc5239ae20b01235b9a6e62947c1b21f77d33adc21dae70b8cbb23f507b7fae'],
  ]) {
    const data = await readFile(new URL(`../assets/flags/${code}.svg`, import.meta.url));
    assert.equal(createHash('sha256').update(data).digest('hex'), digest, code);
  }
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
  assert.equal(collectionLabel('The Book of American Negro Poetry'), 'American poetry · 1922 anthology');
  assert.equal(collectionLabel('Oku no Hosomichi'), 'Oku no Hosomichi');
});
test('recorded-year ranges are inclusive, disjoint and respect other filters', () => {
  const years = [-44, 0, 1699, 1700, 1799, 1800, 1899, 1900, 1999, 2000, 2026, null];
  const sample = years.map((year, index) => ({ ...poems[0], id: `year-test-${index}`, year, language: index % 2 ? 'Japanese' : 'Chinese', country: index % 2 ? 'Japan / United States / United States' : 'China', text: index % 2 ? 'silver river' : 'quiet moon' }));
  assert.deepEqual(yearRangeCounts(sample).map(range => range.count), [3, 2, 2, 2, 2]);
  assert.equal(yearRangeCounts(sample).reduce((sum, range) => sum + range.count, 0), years.filter(year => year !== null).length);
  assert.deepEqual(filterPoems(sample, { from: '0', to: '0' }).map(poem => poem.year), [0]);
  for (const filters of [{ language: 'Japanese', from: '1900', to: '1999' }, { country: 'United States', query: 'silver', from: '1800' }, { language: 'French' }]) {
    const actual = yearRangeCounts(sample, filters).map(range => range.count);
    const expected = recordedYearRanges.map(range => filterPoems(sample, { ...filters, from: range.from, to: range.to }).length);
    assert.deepEqual(actual, expected, JSON.stringify(filters));
  }
  const home = renderHome(sample, '/ai-poems/');
  assert.match(home, /Across the library, 11 poems have a recorded year; 1 without one is excluded from year filters/);
  assert.match(home, /composition, publication, an edition or a traditional date/);
  assert.match(home, /Bounds are inclusive; counts reflect your other filters/);
  for (let index = 0; index < recordedYearRanges.length; index++) assert.match(home, new RegExp(`data-year-range="${index}"`));
  const current = renderHome(poems, '/ai-poems/');
  assert.match(current, /data-year-range="0"/);
  assert.match(current, /data-year-range="2"/);
  assert.doesNotMatch(current, /data-year-range="[134]"/);
  assert.match(renderHome([{ ...poems[0], year: 1609 }], '/ai-poems/'), /1 poem has a recorded year; 0 without one are excluded from year filters/);
  const noYears = renderHome([{ ...poems[0], year: null }], '/ai-poems/');
  assert.doesNotMatch(noYears, /year-range-entry|id="year-ranges"/);
  assert.match(noYears, /No poems currently have a recorded year/);
});
test('discovery classification is neutral while historical source titles and filter values remain intact', () => {
  const mckay = poems.find(p => p.id === 'american-1922-00659');
  const page = renderPoem(mckay, poems, '/ai-poems/');
  assert.match(page, /<dt>Collection<\/dt><dd>American poetry · 1922 anthology<\/dd>/);
  assert.ok(page.includes(escapeHtml(mckay.sourceTitle)));
  assert.ok(page.includes(escapeHtml(mckay.text)));
  assert.equal(mckay.collection, 'The Book of American Negro Poetry');
  assert.equal(filterPoems(poems, { collection: mckay.collection }).length, 113);
  const labels = poems.flatMap(p => [collectionLabel(p.collection), p.form, p.language, ...p.themes, ...associatedPlaces(p)]);
  assert.ok(labels.every(label => !/black american|african[ -]american|american negro/i.test(label)));
  const count = filterPoems(poems, { country: 'United States' }).length;
  const home = renderHome(poems, '/ai-poems/');
  assert.ok(home.includes(`href="/ai-poems/?country=United+States#explore"><span class="collection-icon"`));
  assert.ok(home.includes(`<strong>American poetry</strong><em>${count} poems</em>`));
  assert.ok(filterPoems(poems, { country: 'United States' }).some(p => p.author === 'Emily Dickinson'));
  assert.ok(filterPoems(poems, { country: 'United States' }).some(p => p.author === 'Claude McKay'));
});
test('contextual option counts match filtering and count overlapping metadata once per poem', () => {
  const sample = [
    { ...poems[0], id: 'a', title: 'River A', displayTitle: '', author: 'A', language: 'English', country: 'Jamaica / United States / Jamaica', collection: 'First', form: 'Haiku', themes: ['Nature', 'Nature'], translations: [{ language: 'French', title: 'Fleuve', text: 'river' }, { language: 'French', title: 'Rivière', text: 'river' }, { language: 'English', title: 'River', text: 'river' }], text: 'river', year: 1900 },
    { ...poems[0], id: 'b', title: 'River B', displayTitle: '', author: 'B', language: 'French', country: 'France / United States', collection: 'Second', form: 'Verse', themes: ['Nature'], translations: [{ language: 'English', title: 'River', text: 'river' }], text: 'river\n2\n3\n4\n5', year: 1950 },
    { ...poems[0], id: 'c', title: 'A third poem', displayTitle: '', author: 'A', language: 'French', country: 'France', collection: 'First', form: 'Verse', themes: [], translations: [], text: Array(15).fill('line').join('\n'), year: null },
  ];
  const all = contextualCounts(sample);
  assert.equal(all.country.get('Jamaica'), 1);
  assert.equal(all.country.get('United States'), 2);
  assert.equal(all.translation.get('French'), 1);
  assert.equal(all.readable.get('French'), 3);
  assert.equal(all.readable.get('English'), 2);
  assert.equal(all.readable.get('Arabic') || 0, 0);
  assert.equal(all.theme.get('Nature'), 2);
  assert.deepEqual(['1-4', '5-14', '15-plus'].map(value => all.length.get(value)), [1, 1, 1]);
  assert.equal(contextualCounts(sample, { country: 'France' }).country.get('United States'), 2);
  assert.equal(contextualCounts(sample, { country: 'France' }).country.get(''), 3);
  assert.equal(contextualCounts(sample, { country: 'France' }).language.get('English') || 0, 0);
  assert.equal(contextualCounts(sample, { country: 'France', query: 'river', readable: 'French' }).readable.get('English'), 1);
  assert.equal(contextualCounts(sample, { country: 'France', query: 'river', readable: 'French' }).readable.get('French'), 1);

  function compareToFiltering(records, combinations) {
    const options = contextualCounts(records);
    for (const filters of combinations) {
      const counts = contextualCounts(records, filters);
      for (const name of countedFilters) for (const value of options[name].keys()) {
        const expected = filterPoems(records, { ...filters, [name]: value }).length;
        assert.equal(counts[name].get(value) || 0, expected, `${JSON.stringify(filters)} ${name}=${value}`);
      }
    }
  }
  compareToFiltering(sample, [{}, { country: 'France', language: 'French' }, { query: 'river', from: '1901', readable: 'English' }, { author: 'A', length: '15-plus', translation: 'French' }, { query: 'no such words' }]);
  compareToFiltering(poems, [{}, { author: 'William Shakespeare', language: 'English', country: 'United States' }, { query: 'night', readable: 'English', country: 'China', from: '1', to: '1900' }, { collection: 'The Book of American Negro Poetry', theme: 'Love', length: '5-14', translation: 'English' }]);
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
test('related poems are deterministic, diverse, explainable and exclude authored connections', () => {
  const source = { id: 'source', authorId: 'a', language: 'English', country: 'Jamaica / United States', themes: ['Night'], connections: [{ targetId: 'linked' }] };
  const same = { id: 'same', authorId: 'a', language: 'English', country: 'Jamaica', themes: [] };
  const themed = { id: 'themed', authorId: 'b', language: 'French', country: 'France', themes: ['Night'] };
  const language = { id: 'language', authorId: 'c', language: 'English', country: 'England', themes: [] };
  const linked = { id: 'linked', authorId: 'a', language: 'English', country: 'Jamaica', themes: ['Night'] };
  const collection = [source, same, themed, language, linked, same];
  const chosen = relatedPoems(source, collection);
  assert.deepEqual(chosen.map(item => [item.poem.id, item.reason]), [['same', 'Same poet'], ['themed', 'Shared theme: Night'], ['language', 'Same original language: English']]);
  assert.deepEqual(relatedPoems(source, [...collection].reverse()).map(item => [item.poem.id, item.reason]), chosen.map(item => [item.poem.id, item.reason]));
  const placeOnly = { id: 'place', authorId: 'd', language: 'Arabic', country: 'United States', themes: [] };
  assert.deepEqual(relatedPoems({ ...source, themes: [] }, [source, placeOnly]).map(item => item.reason), ['Shared associated place: United States']);
  const anonymous = { id: 'anon-a', authorId: 'traditional', anonymous: true, language: 'Spanish', country: 'Not established', themes: [] };
  const anonymousOther = { ...anonymous, id: 'anon-b' };
  assert.deepEqual(relatedPoems(anonymous, [anonymous, anonymousOther]).map(item => item.reason), ['Same original language: Spanish']);
  assert.deepEqual(relatedPoems({ ...anonymous, language: 'Japanese' }, [{ ...anonymousOther, language: 'Arabic' }]), []);
  const sample = poems.find(poem => poem.id === 'shakespeare-sonnet-18');
  assert.match(poemCard(sample, '/ai-poems/', 'Shared theme: <script>'), /Shared theme: &lt;script&gt;/);
  assert.doesNotMatch(poemCard(sample, '/ai-poems/', 'Shared theme: <script>'), /<script>/);
});
test('real-catalogue recommendations use only supported relationships and vary across sonnets', () => {
  const samePoetChoices = new Set();
  for (const source of poems) {
    const suggestions = relatedPoems(source, poems);
    assert.ok(suggestions.length <= 3);
    assert.equal(new Set(suggestions.map(item => item.poem.id)).size, suggestions.length, source.id);
    const excluded = new Set([source.id, ...(source.connections || []).map(connection => connection.targetId)]);
    for (const { poem, reason } of suggestions) {
      assert.ok(!excluded.has(poem.id), `${source.id} -> ${poem.id}`);
      if (reason === 'Same poet') {
        assert.ok(!source.anonymous && !poem.anonymous && source.authorId === poem.authorId);
        if (source.authorId === 'william-shakespeare') samePoetChoices.add(poem.id);
      } else if (reason.startsWith('Shared theme: ')) {
        const theme = reason.slice('Shared theme: '.length);
        assert.ok(source.themes.includes(theme) && poem.themes.includes(theme));
      } else if (reason.startsWith('Same original language: ')) {
        assert.equal(source.language, poem.language);
        assert.equal(reason, `Same original language: ${source.language}`);
      } else if (reason.startsWith('Shared associated place: ')) {
        const place = reason.slice('Shared associated place: '.length);
        assert.notEqual(place, 'Not established');
        assert.ok(associatedPlaces(source).includes(place) && associatedPlaces(poem).includes(place));
      } else assert.fail(`Unexpected recommendation reason: ${reason}`);
    }
  }
  assert.ok(samePoetChoices.size >= 50, `varied sonnet suggestions: ${samePoetChoices.size}`);
  const sonnet = poems.find(poem => poem.id === 'shakespeare-sonnet-18');
  assert.ok(new Set(relatedPoems(sonnet, poems).map(item => item.poem.authorId)).size >= 2);
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
test('Japanese additions preserve sourced edition readings and leave translations and dates unasserted', () => {
  const expected = [
    ['summer-grass-basho', '夏草や兵どもが夢の跡', 'matsuo-basho', 'oldid=247172'],
    ['mogami-river-basho', '五月雨をあつめて早し最上川', 'matsuo-basho', 'oldid=247172'],
    ['rapeseed-flowers-buson', '菜の花や月は東に日は西に', 'yosa-buson', '/875927/1/75'],
    ['spring-sea-buson', '春の海ひねもすのたりのたりかな', 'yosa-buson', '/875927/1/75'],
  ];
  for (const [id, text, authorId, source] of expected) {
    const poem = poems.find(p => p.id === id);
    assert.ok(poem, id);
    assert.equal(poem.text, text);
    assert.equal(poem.authorId, authorId);
    assert.equal(poem.language, 'Japanese');
    assert.equal(poem.lang, 'ja');
    assert.equal(poem.country, 'Japan');
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.year, null);
    assert.equal(lineCount(poem), 1);
    assert.deepEqual(poem.translations, []);
    assert.ok(poem.source.includes(source));
    assert.ok(poem.contextSource && poem.contextSourceTitle);
    assert.match(poem.rights, /public domain in the United States/i);
    assert.ok(!filterPoems([poem], { readable: 'English' }).length);
    assert.ok(filterPoems([poem], { query: text }).length);
  }
  for (const id of ['summer-grass-basho', 'mogami-river-basho']) {
    assert.match(poems.find(p => p.id === id).rights, /CES1596.*CC BY-SA 4\.0: https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\//);
  }
  assert.match(poems.find(p => p.id === 'mogami-river-basho').context, /涼し as a variant/);
  assert.match(poems.find(p => p.id === 'spring-sea-buson').context, /repetition mark.*place.*debated/);
  const laterBasho = poems.filter(p => p.id.startsWith('basho-oku-') || p.id.startsWith('basho-nozarashi-')).length;
  const laterBuson = poems.filter(p => p.id.startsWith('buson-1926-')).length;
  assert.equal(filterPoems(poems, { language: 'Japanese', country: 'Japan' }).length, 5 + laterBasho + laterBuson);
  assert.equal(filterPoems(poems, { query: '松尾芭蕉' }).length, 3 + laterBasho);
  assert.equal(filterPoems(poems, { query: '与謝蕪村' }).length, 2 + laterBuson);
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
test('poet pages group by validated IDs, not names or assumed anonymous authorship', () => {
  const groups = groupPoets(poems);
  assert.equal(groups.reduce((total, group) => total + group.poems.length, 0), poems.length);
  assert.equal(new Set(groups.map(group => group.id)).size, groups.length);
  const li = groups.find(group => group.id === 'li-bai');
  const liPage = renderPoet(li, '/ai-poems/');
  assert.match(liPage, /701–762/);
  assert.match(liPage, /Tang dynasty/);
  assert.match(liPage, /not a biography/);
  const anonymous = groups.find(group => group.id === 'traditional-anonymous-romances-viejos');
  const anonymousPage = renderPoet(anonymous, '/ai-poems/');
  assert.match(anonymousPage, /not necessarily by the same person/);
  assert.doesNotMatch(anonymousPage, /"@type":"Person"/);
  const ambiguousTitle = renderPoet(groups.find(group => group.id === 'wang-wei'), '/ai-poems/');
  assert.match(ambiguousTitle, /Opening line:.*下馬飲君酒，/);
  assert.match(ambiguousTitle, /Opening line:.*山中相送罷，/);
  const shared = [
    { ...poems[0], authorId: 'shared-a', author: 'Shared Name' },
    { ...poems[0], authorId: 'shared-b', author: 'Shared Name' },
  ];
  const distinct = groupPoets(shared);
  assert.equal(distinct.length, 2);
  assert.ok(distinct.every(group => !group.uniqueName));
  assert.doesNotMatch(renderPoet(distinct[0], '/ai-poems/'), /Filter these poems in the library/);
  assert.match(renderPoet(distinct[0], '/ai-poems/'), /Catalogue ID: shared-a/);
  assert.match(renderHome(shared, '/ai-poems/'), /catalogue ID: shared-b/);
  assert.throws(() => groupPoets([shared[0], { ...shared[0], author: 'Different Name' }]), /Conflicting author identity/);
  assert.throws(() => groupPoets([shared[0], { ...shared[0], anonymous: true }]), /Conflicting author identity/);
  assert.throws(() => groupPoets([{ ...shared[0], authorId: '../escape' }]), /Invalid author ID/);
  const unsafe = groupPoets([{ ...poems[0], author: '</script><script>alert(1)</script>' }])[0];
  const page = renderPoet(unsafe, '/ai-poems/');
  assert.ok(!page.includes('</script><script>alert(1)</script>'));
  assert.match(page, /&lt;\/script&gt;/);
});
test('poet directory shows sourced original names once per identity and escapes them', () => {
  const japanese = renderHome(poems.filter(p => p.authorId === 'matsuo-basho'), '/ai-poems/');
  assert.match(japanese, /data-poet-original lang="ja" dir="ltr">松尾芭蕉<\/span>/);
  assert.equal((japanese.match(/data-poet-original/g) || []).length, 1);
  const sample = { ...poems[0], author: 'Shared Name', authorId: 'shared-a', authorOriginal: '原名 <script>', lang: 'zh-Hant', direction: 'ltr', anonymous: false };
  const home = renderHome([
    { ...sample, id: 'sample-a' }, { ...sample, id: 'sample-b' },
    { ...sample, id: 'sample-c', authorId: 'shared-b' },
    { ...sample, id: 'sample-d', authorId: 'same-name', author: 'Same Name', authorOriginal: 'same name' },
  ], '/ai-poems/');
  const directory = home.match(/<details class="poet-directory">[\s\S]*?<\/details>/)[0];
  assert.equal((directory.match(/data-author="Shared Name"/g) || []).length, 2);
  assert.equal((directory.match(/data-poet-original/g) || []).length, 2);
  assert.equal((directory.match(/原名 &lt;script&gt;/g) || []).length, 2);
  assert.doesNotMatch(directory, /原名 <script>/);
  assert.match(directory, /catalogue ID: shared-a/);
  assert.match(directory, /catalogue ID: shared-b/);
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
test('RSS updates are valid, stable, safely escaped and point to real poems', async () => {
  const updates = JSON.parse(await readFile('content/updates.json', 'utf8'));
  const feed = renderFeed(updates, poems);
  assert.equal(feed, renderFeed(updates.toReversed(), poems), 'feed order does not depend on ledger order');
  const latest = updates.map(update => update.publishedAt).toSorted().at(-1);
  assert.ok(feed.includes(`<lastBuildDate>${new Date(latest).toUTCString()}</lastBuildDate>`));
  for (const update of updates) {
    assert.ok(feed.includes(`<guid isPermaLink="false">verso:${update.id}</guid>`));
    assert.ok(feed.includes(`https://dmoliveira.github.io/ai-poems/poems/${update.poemId}/`));
  }
  const entry = { ...updates[0], id: 'sample-update', title: 'A & <B> "C"', description: "A poet's work & source" };
  const escaped = renderFeed([entry], poems);
  assert.match(escaped, /A &amp; &lt;B&gt; &quot;C&quot;/);
  assert.match(escaped, /A poet&#39;s work &amp; source/);
  assert.throws(() => renderFeed([entry, entry], poems), /duplicate feed update ID/);
  assert.throws(() => renderFeed([{ ...entry, poemId: 'missing-poem' }], poems), /Unknown feed poem/);
  assert.throws(() => renderFeed([{ ...entry, publishedAt: '2026-02-30T00:00:00Z' }], poems), /Invalid feed publication date/);
  assert.throws(() => renderFeed([{ ...entry, title: 'Invalid\u0001text' }], poems), /Invalid feed title/);
  assert.throws(() => renderFeed([{ ...entry, evidence: 'http://example.com/' }], poems), /Invalid feed publication evidence/);
});
test('homepage totals follow catalogue growth and use singular for one poem', () => {
  const one = renderHome([poems[0]], '/ai-poems/');
  assert.match(one, /Discover <strong>1 poem<\/strong> across languages/);
  assert.match(one, /class="catalogue-count">1 poem to discover/);
  const extended = [...poems, { ...poems[0], id: 'test-growth' }];
  const total = `${extended.length.toLocaleString('en-US')} poems`;
  const home = renderHome(extended, '/ai-poems/');
  assert.ok(home.includes(`Discover <strong>${total}</strong> across languages`));
  assert.ok(home.includes(`class="catalogue-count">${total} to discover`));
  assert.match(home, /Some works appear under more than one place/);
  assert.match(home, /<option value="">No preference<\/option>/);
  assert.match(home, /<noscript><a class="button primary" href="#complete-index">Browse poem index/);
  assert.doesNotMatch(home, /class="announcement"/);
});
test('the complete index groups each poem once by original language', () => {
  const index = records => renderHome(records, '/ai-poems/').match(/<details id="complete-index"[\s\S]*?<\/details>/)?.[0] || '';
  const html = index(poems);
  assert.match(html, /Browse by original language\. Translations and reading aids, when available, are on the poem pages/);
  const links = [...html.matchAll(/href="\/ai-poems\/poems\/([^/]+)\/"/g)].map(match => match[1]);
  assert.equal(links.length, poems.length);
  assert.deepEqual(links.toSorted(), poems.map(poem => poem.id).toSorted());
  for (const language of new Set(poems.map(poem => poem.language))) {
    const count = poems.filter(poem => poem.language === language).length;
    const id = `index-original-${encodeURIComponent(language)}`;
    assert.ok(html.includes(`href="#${encodeURIComponent(id)}">${escapeHtml(language)} <span>${count.toLocaleString('en-US')}<span class="sr-only"> ${count === 1 ? 'poem' : 'poems'}</span></span>`), language);
    assert.ok(html.includes(`id="${escapeHtml(id)}"><h3>${escapeHtml(language)} <small>${count.toLocaleString('en-US')} ${count === 1 ? 'poem' : 'poems'}</small>`), language);
  }
  const arabic = { ...poems.find(poem => poem.language === 'Arabic'), displayTitle: '' };
  assert.ok(index([arabic]).includes(`<span lang="ar" dir="rtl">${escapeHtml(arabic.title)}</span>`));
  const basho = poems.find(poem => poem.id === 'old-pond-basho');
  assert.ok(html.includes(`>${escapeHtml(basho.displayTitle)} — ${escapeHtml(basho.author)}</a>`));
  const unusual = [
    { ...poems[0], id: 'index-a', title: 'Zebra', displayTitle: '', language: 'A & <B>' },
    { ...poems[0], id: 'index-b', title: 'Alpha', displayTitle: '', language: 'A & <B>' },
    { ...poems[0], id: 'index-c', title: 'Another', displayTitle: '', language: 'A%20& <B>' },
  ];
  const sparse = index(unusual);
  for (const language of new Set(unusual.map(poem => poem.language))) {
    const id = `index-original-${encodeURIComponent(language)}`;
    assert.ok(sparse.includes(`id="${escapeHtml(id)}"`));
    assert.ok(sparse.includes(`href="#${escapeHtml(encodeURIComponent(id))}"`));
  }
  assert.ok(sparse.indexOf('index-b/') < sparse.indexOf('index-a/'));
  assert.match(sparse, /A &amp; &lt;B&gt; <small>2 poems<\/small>/);
  assert.match(sparse, /1 poem<\/small>/);
  assert.doesNotMatch(sparse, /A & <B>/);
  const empty = index([]);
  assert.match(empty, /No poems are currently listed/);
  assert.doesNotMatch(empty, /class="index-jumps"|class="index-group"/);
});
test('discovery cards match their filters and omit unavailable paths or examples', () => {
  const card = (html, filters) => {
    const href = escapeHtml(`/ai-poems/?${new URLSearchParams(filters)}#explore`);
    return [...html.matchAll(/<a class="collection-card [\s\S]*?<\/a>/g)].map(match => match[0]).find(markup => markup.includes(`href="${href}"`)) || '';
  };
  const paths = [
    [{ language: 'Chinese' }, ['li-bai', 'du-fu']],
    [{ language: 'Spanish' }, ['jose-marti', 'andres-bello']],
    [{ country: 'United States' }, ['emily-dickinson', 'claude-mckay']],
    [{ form: 'Sonnet' }, ['william-shakespeare', 'florbela-espanca']],
  ];
  const home = renderHome(poems, '/ai-poems/');
  assert.match(home, /A poem may appear in more than one path/);
  for (const [filters, ids] of paths) {
    const matches = filterPoems(poems, filters);
    const markup = card(home, filters);
    assert.ok(markup, JSON.stringify(filters));
    assert.ok(markup.includes(`<em>${matches.length.toLocaleString('en-US')} poems</em>`));
    for (const id of ids) assert.ok(markup.includes(escapeHtml(matches.find(poem => poem.authorId === id).author)), id);
  }
  const li = { ...poems.find(poem => poem.authorId === 'li-bai'), author: 'Li <Bai>', country: 'Japan / United States / United States', form: 'Sonnet' };
  const emily = { ...poems.find(poem => poem.authorId === 'emily-dickinson'), country: 'Canada', form: 'Verse' };
  const sparse = renderHome([li, emily], '/ai-poems/');
  assert.equal(card(sparse, { language: 'Spanish' }), '');
  assert.match(card(sparse, { language: 'Chinese' }), /<em>1 poem<\/em><span class="collection-examples">Featuring <span>Li &lt;Bai&gt;<\/span>/);
  assert.match(card(sparse, { country: 'United States' }), /<em>1 poem<\/em>/);
  assert.match(card(sparse, { form: 'Sonnet' }), /<em>1 poem<\/em>/);
  assert.doesNotMatch(card(sparse, { country: 'United States' }), /Emily Dickinson|collection-examples/);
  const large = Array.from({ length: 1000 }, (_, index) => ({ ...li, id: `sample-${index}` }));
  assert.match(card(renderHome(large, '/ai-poems/'), { language: 'Chinese' }), /<em>1,000 poems<\/em>/);
  const noPaths = renderHome([{ ...li, country: 'Canada', form: 'Verse', language: 'English' }], '/ai-poems/');
  assert.doesNotMatch(noPaths, /<a class="collection-card /);
});
test('editorial paths match the catalogue and require the sourced edition sequence', () => {
  const short = filterPoems(poems, { length: '1-4' }).length;
  const home = renderHome(poems, '/ai-poems/');
  assert.ok(home.includes(`${short.toLocaleString('en-US')} poems · lines in the original`));
  assert.match(home, /href="\/ai-poems\/\?length=1-4#explore"/);
  assert.match(home, /href="\/ai-poems\/poems\/linfinito-leopardi\/"/);
  assert.match(home, /Read in their 1826 edition order/);
  const extra = [...poems, { ...poems.find(p => p.id === 'quiet-night-thought-li-bai'), id: 'extra-short-test' }];
  assert.ok(renderHome(extra, '/ai-poems/').includes(`${(short + 1).toLocaleString('en-US')} poems · lines in the original`));
  const missing = poems.filter(p => p.id !== 'leopardi-sera-giorno-festivo');
  assert.doesNotMatch(renderHome(missing, '/ai-poems/'), /Three Leopardi idylls/);
  const unsourced = poems.map(p => p.id === 'linfinito-leopardi' ? { ...p, connections: [] } : p);
  assert.doesNotMatch(renderHome(unsourced, '/ai-poems/'), /Three Leopardi idylls/);
  const long = poems.find(p => lineCount(p) > 4);
  assert.doesNotMatch(renderHome([long], '/ai-poems/'), /A path into poetry/);
});
test('the sonnet discovery path requires both works and a sourced sequence connection', () => {
  const first = poems.find(poem => poem.id === 'shakespeare-sonnet-18');
  const next = poems.find(poem => poem.id === 'shakespeare-sonnet-19');
  const connection = first.connections[0];
  const card = records => renderHome(records, '/ai-poems/').match(/<section class="sequence-path"[\s\S]*?<\/section>/)?.[0] || '';
  const markup = card([first, next]);
  assert.match(markup, /Two sonnets by William Shakespeare/);
  assert.ok(markup.includes(`href="/ai-poems/poems/${first.id}/"`));
  assert.ok(markup.includes(`href="/ai-poems/poems/${next.id}/"`));
  assert.ok(markup.includes(`href="${escapeHtml(connection.source)}"`));
  assert.ok(markup.includes(escapeHtml(connection.note)));
  assert.equal(card([first]), '');
  assert.equal(card([next]), '');
  assert.equal(card([{ ...first, connections: [] }, next]), '');
  assert.equal(card([{ ...first, connections: [null, { ...connection, type: 'influenced_by' }] }, next]), '');
  assert.equal(card([{ ...first, connections: [{ ...connection, targetId: 'shakespeare-sonnet-20' }] }, next]), '');
  assert.equal(card([{ ...first, connections: [{ ...connection, source: 'javascript:alert(1)' }] }, next]), '');
  assert.equal(card([{ ...first, connections: [{ ...connection, source: 'http://example.org/' }] }, next]), '');
  assert.equal(card([{ ...first, connections: [{ ...connection, note: ' ' }] }, next]), '');
  assert.equal(card([first, { ...next, authorId: 'another-author' }]), '');
  const multi = { ...first, title: 'Sonnet <18>', connections: [{ ...connection, type: 'response_to' }, { ...connection, note: 'Sequence <note>' }] };
  const escaped = card([multi, next]);
  assert.match(escaped, /Read Sonnet &lt;18&gt;/);
  assert.match(escaped, /Sequence &lt;note&gt;/);
  assert.doesNotMatch(escaped, /<18>|<note>/);
});
test('featured reading uses sourced catalogue text and degrades safely when records change', () => {
  const poem = poems.find(item => item.id === 'old-pond-basho');
  const translation = poem.translations.find(item => item.translator === 'Lafcadio Hearn, 1898');
  const feature = items => renderHome(items, '/ai-poems/').match(/<article class="featured-reading"[\s\S]*?<\/article>/)?.[0] || '';
  const html = feature([poem]);
  assert.match(html, /FEATURED READING/);
  assert.ok(html.includes(`<p class="featured-reading-original" lang="ja" dir="ltr">${escapeHtml(poem.text)}</p>`));
  assert.ok(html.includes(`<p class="featured-reading-translation" lang="en" dir="ltr">${escapeHtml(translation.text)}</p>`));
  assert.ok(html.includes(escapeHtml(poem.sourceTitle)));
  assert.ok(html.includes(escapeHtml(translation.translator)));
  assert.match(html, /href="\/ai-poems\/poems\/old-pond-basho\/">Read poem &amp; sources/);
  assert.doesNotMatch(html, /today|daily|weekly/i);
  for (const change of [{ source: '' }, { source: 'http://example.com' }, { sourceTitle: '' }, { rights: '' }, { direction: 'invalid' }]) {
    assert.equal(feature([{ ...poem, ...change }]), '');
  }
  assert.equal(feature(poems.filter(item => item.id !== poem.id)), '');
  for (const translations of [[], [null], [{ ...translation, source: '' }], [{ ...translation, rights: '' }], [{ ...translation, translator: 'Unreviewed reading aid' }]]) {
    const originalOnly = feature([{ ...poem, translations }]);
    assert.match(originalOnly, /featured-reading-original/);
    assert.doesNotMatch(originalOnly, /featured-reading-translation|Lafcadio Hearn/);
  }
  const changed = { ...poem, displayTitle: '<Title & more>', author: 'Author <test>', language: 'Arabic', lang: 'ar', direction: 'rtl', text: 'أول <سطر>\nSECOND ORIGINAL LINE', sourceTitle: 'Source <edition>', translations: [{ ...translation, text: 'First <line>\nSECOND TRANSLATION LINE' }] };
  const escaped = feature([changed]);
  assert.match(escaped, /&lt;Title &amp; more&gt;/);
  assert.match(escaped, /Author &lt;test&gt;/);
  assert.match(escaped, /Opening line · Arabic original/);
  assert.match(escaped, /lang="ar" dir="rtl">أول &lt;سطر&gt;/);
  assert.match(escaped, /Opening line · English translation/);
  assert.match(escaped, /First &lt;line&gt;/);
  assert.match(escaped, /Source &lt;edition&gt;/);
  assert.doesNotMatch(escaped, /SECOND ORIGINAL LINE|SECOND TRANSLATION LINE/);
});
test('build creates crawlable pages, valid schema and a complete sitemap', async () => {
  execFileSync('node', ['scripts/build.mjs'], { stdio: 'pipe' });
  const home = await readFile('_site/index.html', 'utf8');
  const sitemap = await readFile('_site/sitemap.xml', 'utf8');
  const robots = await readFile('_site/robots.txt', 'utf8');
  const feed = await readFile('_site/feed.xml', 'utf8');
  assert.match(home, /Verso Poetry Library \| Poems Across Languages/);
  assert.match(home, /<link rel="alternate" type="application\/rss\+xml" title="Verso poetry updates" href="\/ai-poems\/feed.xml">/);
  assert.match(feed, /<rss version="2\.0"/);
  assert.ok(home.includes(`Browse the complete poetry index (${poems.length})`));
  for (const { place, count } of placeCounts(poems)) assert.ok(home.includes(`${escapeHtml(place)}</strong><small>${count} ${count === 1 ? 'poem' : 'poems'}</small>`), place);
  assert.match(home, /Places are associations, not necessarily where a poem was written/);
  const poets = groupPoets(poems);
  assert.equal((sitemap.match(/<loc>/g) || []).length, poems.length + poets.length + 1);
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
  for (const poet of poets) {
    const page = await readFile(`_site/poets/${poet.id}/index.html`, 'utf8');
    assert.ok(sitemap.includes(`/poets/${poet.id}/`), poet.id);
    assert.ok(page.includes(`https://dmoliveira.github.io/ai-poems/poets/${poet.id}/`), poet.id);
    assert.ok(home.includes(`/poets/${poet.id}/`), poet.id);
    for (const poem of poet.poems) assert.ok(page.includes(`/poems/${poem.id}/`), poem.id);
    const schema = JSON.parse(page.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.equal(schema['@type'], 'CollectionPage');
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
  assert.match(sonnet18, /href="\/ai-poems\/poets\/william-shakespeare\/"/);
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
