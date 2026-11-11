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
import { associatedPlaces, collectionLabel, contextualCounts, countedFilters, discoveryOrder, escapeHtml, filterPoems, lineCount, placeCounts, poemCard, recordedYearRanges, surprisePoem, titleAttributes, yearRangeCounts } from '../src/catalog.mjs';

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
test('Lorca romances preserve the reviewed 1928 works, sections and source caveats', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/lorca-romancero-1928.json', import.meta.url), 'utf8'));
  const selected = poems.filter(poem => poem.authorId === 'federico-garcia-lorca');
  assert.equal(selected.length, 18);
  assert.deepEqual(manifest.poems.map(item => item.number), Array.from({ length: 18 }, (_, i) => i + 1));
  for (const item of manifest.poems) {
    const poem = selected.find(entry => entry.id === `lorca-romancero-${String(item.number).padStart(2, '0')}`);
    assert.ok(poem, item.number);
    assert.equal(poem.title, item.title);
    assert.equal(poem.author, 'Federico García Lorca');
    assert.equal(poem.authorYears, '1898–1936');
    assert.deepEqual(associatedPlaces(poem), ['Spain']);
    assert.equal(poem.language, 'Spanish');
    assert.equal(poem.lang, 'es');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.form, 'Romance');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.match(poem.yearLabel, /Printed 1928.*composition date not established/);
    assert.equal(poem.source, `https://www.gutenberg.org/cache/epub/72665/pg72665-images.html#Ch${String(item.number).padStart(2, '0')}`);
    assert.equal(new URL(poem.contextSource).hash, `#page=${item.pages[0] + 2}`);
    assert.ok(poem.context.includes(item.dedication));
    assert.match(poem.context, /OCR.*not every witness.*not a diplomatic transcription/);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.equal(lineCount(poem), item.lines);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), item.sha256);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Spanish', country: 'Spain', author: poem.author }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  const byNumber = number => selected.find(poem => poem.id === `lorca-romancero-${String(number).padStart(2, '0')}`);
  assert.match(byNumber(1).text, /^La luna vino a la fragua[\s\S]*El aire la está velando\.$/);
  assert.match(byNumber(4).text, /^Verde que te quiero verde\./);
  assert.ok(filterPoems(poems, { query: 'verde que te quiero verde' }).includes(byNumber(4)));
  assert.match(byNumber(9).text, /^II$/m);
  assert.match(byNumber(9).context, /printed ‘II’/);
  assert.match(byNumber(9).context, /Creselles.*Croselles/);
  assert.match(byNumber(10).text, /^II$/m);
  assert.match(byNumber(13).text, /las cuatro luces clamaban/);
  assert.match(byNumber(13).context, /la cuatro luces/);
  assert.match(byNumber(14).context, /Romance del emplazado/);
  assert.match(byNumber(15).text, /y las orzas de moneda/);
  assert.match(byNumber(15).context, /horzas/);
  assert.match(byNumber(16).text, /^I\n\nPANORAMA DE MÉRIDA[\s\S]*\nII\n\nEL MARTIRIO[\s\S]*\nIII\n\nINFIERNO Y GLORIA/);
  assert.match(byNumber(17).text, /PRIMERA LAGUNA[\s\S]*SIGUE[\s\S]*SEGUNDA LAGUNA[\s\S]*SIGUE[\s\S]*ÚLTIMA LAGUNA/);
  assert.doesNotMatch(byNumber(17).text, /SECUNDA/);
  assert.match(byNumber(17).context, /partly obscured.*undated Chilean edition/);
  assert.match(byNumber(18).text, /y en las yemas de tus dedos/);
  assert.match(byNumber(18).context, /llemas/);
  for (const number of [16, 17, 18]) assert.match(byNumber(number).context, /Tres romances históricos/);
  assert.equal(groupPoets(poems).find(group => group.id === 'federico-garcia-lorca').poems.length, 18);
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
test('Gonçalves Dias additions preserve 1860 readings, complete works and earlier variants', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/goncalves-dias-cantos-1860.json', import.meta.url), 'utf8'));
  const expected = [
    ['guerreiro', 88], ['piaga', 83], ['indio', 59], ['pedido', 28], ['leito', 36],
    ['maraba', 54], ['tamoyo', 90], ['mangueira', 49], ['olhos', 58], ['cumprimento', 50],
    ['urge', 21], ['tumulo', 11], ['menina', 40], ['concha', 24], ['pedes', 16],
  ];
  assert.deepEqual(manifest.poems.map(item => [item.slug, item.lines]), expected);
  const selected = expected.map(([slug, count]) => {
    const item = manifest.poems.find(entry => entry.slug === slug);
    const poem = poems.find(entry => entry.id === `dias-cantos-1860-${slug}`);
    assert.ok(poem, slug);
    assert.equal(poem.title, item.title);
    assert.equal(poem.author, 'Gonçalves Dias');
    assert.equal(poem.authorId, 'goncalves-dias');
    assert.equal(poem.authorYears, '1823–1864');
    assert.deepEqual(associatedPlaces(poem), ['Brazil']);
    assert.equal(poem.language, 'Portuguese');
    assert.equal(poem.lang, 'pt');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.year, item.year ?? null);
    assert.equal(poem.creationPlace, undefined);
    if (item.year) assert.equal(poem.yearLabel, item.yearLabel);
    else assert.match(poem.yearLabel, /Printed 1860.*composition date not established/);
    assert.equal(poem.collection, 'Cantos (1860 edition)');
    assert.equal(poem.source, 'https://www.gutenberg.org/ebooks/74854');
    assert.equal(new URL(poem.contextSource).hash, `#page=${item.pages[0] + 28}`);
    assert.match(poem.context, /1860 scan.*earlier separately printed edition.*not a diplomatic or exhaustive collation/);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.equal(lineCount(poem), count);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), item.sha256);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Portuguese', country: 'Brazil', query: 'goncalves dias' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  const bySlug = slug => selected.find(poem => poem.id === `dias-cantos-1860-${slug}`);
  assert.equal((bySlug('guerreiro').text.match(/^[IVX]+\.$/gm) || []).length, 9);
  assert.match(bySlug('guerreiro').text, /Que estimem a vida/);
  assert.match(bySlug('guerreiro').context, /Que estimão a vida/);
  assert.equal((bySlug('piaga').text.match(/^[IVX]+\.$/gm) || []).length, 3);
  assert.match(bySlug('piaga').text, /Seos estridulos torva soltar/);
  assert.match(bySlug('piaga').context, /Seus estridulos/);
  assert.match(bySlug('indio').text, /Que antes me dera por feliz de ver-te/);
  assert.match(bySlug('indio').context, /Que eu fôra/);
  assert.match(bySlug('leito').text, /^Porque tardas, Jatyr[\s\S]*A brisa da manhã sacuda as folhas!$/);
  assert.match(bySlug('maraba').text, /Qual d’uma palmeira/);
  assert.match(bySlug('maraba').text, /E as doces palavras[\s\S]*Que sou Marabá!$/);
  assert.match(bySlug('maraba').context, /closing marks absent from the scan/);
  assert.equal((bySlug('tamoyo').text.match(/^[IVX]+\.$/gm) || []).length, 10);
  assert.match(bySlug('tamoyo').text, /Robuste, fragueiro,[\s\S]*Das setas ligeiras,/);
  assert.match(bySlug('tamoyo').context, /1851 reads ‘Robusto/);
  assert.doesNotMatch(bySlug('olhos').text, /Elles verdes são/);
  assert.doesNotMatch(bySlug('urge').text, /Move incessante as azas/);
  assert.match(bySlug('cumprimento').text, /^Se ao misero cantor[\s\S]*A estrella, que fulge[\s\S]*Estes versos na mente/);
  assert.match(bySlug('tumulo').text, /Como offrenda de amor/);
  assert.match(bySlug('tumulo').context, /25 October 1848.*not independently established/);
  assert.doesNotMatch(bySlug('menina').text, /CHENIER|28 de Julho/);
  assert.match(bySlug('concha').text, /Que faces no teu scismar\?/);
  assert.match(bySlug('concha').context, /1851 edition has ‘Que fazes/);
  assert.match(bySlug('pedes').text, /^Tu pedes-me um canto[\s\S]*Ao bardo trahido só resta chorar\.$/);
  assert.equal(manifest.poems.find(item => item.slug === 'pedes').datingLeaf, 311);
  assert.equal(bySlug('pedes').year, 1849);
  assert.match(bySlug('pedes').context, /1851 edition dates this composition 9 March 1849/);
  assert.ok(filterPoems(poems, { from: '1849', to: '1849' }).includes(bySlug('pedes')));
  assert.equal(groupPoets(poems).find(group => group.id === 'goncalves-dias').poems.length, 19);
});
test('Auta de Souza originals retain 1910 scan readings, boundaries and provenance', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/auta-horto-reviewed.json', import.meta.url), 'utf8'));
  const expected = [
    ['cantiga', 16, 'c4d2e06b7f353ca3c8d368030ef8f09341ec5e036246454e61954d2b3fcdc4cc'],
    ['caminho', 14, 'b952aba2e87f299bbc0daff04789714d384d451a07d6548819dc7e2560915cc0'],
    ['nunca-mais', 20, '09a947ae5f313681692b2d41b8dd326c55d01c14d9af6b9d1292700ee7a7d074'],
    ['bohemias', 32, 'dc721f9a4a6419359de5137932a737228dad7afdf21a2956fa2441bae0554ad4'],
    ['regina', 48, '7a5cfcc50ec5496f9dd4d2001b814484eb293ec7aa51b93b6ca7e8b61bf97d58'],
    ['supplica', 14, '211b81ccd1c9b682ff265164fbe5782db0b464eec6e490e6708f0dfd02d29808'],
    ['fio-partido', 25, '8df338268638f86b2eb1a4274cd3b26a04fabfb8d72ccd683d61ef3affcdebe5'],
  ];
  assert.deepEqual(manifest.poems.map(p => p.slug), expected.map(([slug]) => slug));
  const selected = expected.map(([slug, lines, hash]) => {
    const item = manifest.poems.find(entry => entry.slug === slug);
    const poem = poems.find(entry => entry.id === `auta-horto-${slug}`);
    assert.ok(poem, slug);
    assert.equal(poem.author, 'Auta de Souza');
    assert.equal(poem.authorOriginal, 'Auta de Sousa');
    assert.equal(poem.authorId, 'auta-de-souza');
    assert.equal(poem.authorYears, '1876–1901');
    assert.equal(poem.language, 'Portuguese');
    assert.equal(poem.lang, 'pt');
    assert.deepEqual(associatedPlaces(poem), ['Brazil']);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.source, item.source);
    assert.ok(new URL(poem.source).searchParams.has('oldid'));
    assert.equal(poem.text, item.text);
    assert.equal(lineCount(poem), lines);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.ok(poem.context.includes(item.note));
    assert.match(poem.rights, /public domain in the United States.*CC BY-SA 4\.0.*check local law/);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Portuguese', country: 'Brazil', author: poem.author, query: poem.title }).includes(poem));
    assert.ok(filterPoems(poems, { query: 'auta de sousa' }).includes(poem));
    assert.match(renderPoem(poem, poems, '/ai-poems/'), /<dt>Created in<\/dt><dd>Not established<\/dd>/);
    return poem;
  });
  const [cantiga, caminho, nunca, bohemias, regina, supplica, fio] = selected;
  assert.deepEqual(cantiga.text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4, 4, 4]);
  assert.deepEqual(caminho.text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4, 3, 3]);
  assert.deepEqual(nunca.text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4, 4, 4, 4]);
  assert.equal(bohemias.text.split('\n\n').length, 8);
  assert.match(bohemias.text, /Que faz desbrochar as rosas\./);
  assert.match(bohemias.text, /Responde, se não chorasses\?/);
  assert.match(bohemias.context, /comparison stops after five/);
  assert.deepEqual(regina.text.split('\n\n').map(stanza => stanza.split('\n').length), Array(12).fill(4));
  assert.match(supplica.text, /^Se tudo foge e tudo desparece,/);
  assert.match(supplica.context, /desparece.*desaparece/);
  assert.match(fio.text, /Será morrer\?\n\nII\n\nLá vai a pomba voando/);
  assert.match(fio.text, /Aqui, n’amplidão liberta/);
  assert.doesNotMatch(fio.text, /Janeiro, 1901/);
  for (const poem of [regina, supplica, fio]) assert.deepEqual(poem.themes, ['Faith']);
  for (const poem of [cantiga, caminho, nunca, bohemias]) assert.deepEqual(poem.themes, []);
  const poet = groupPoets(poems).find(group => group.id === 'auta-de-souza');
  assert.equal(poet.poems.length, 7);
  for (const poem of selected) assert.ok(poet.poems.some(entry => entry.id === poem.id));
  assert.ok(!poems.some(poem => poem.id === 'auta-horto-oracao' || poem.id === 'auta-horto-leque'));
});
test('Castro Alves originals preserve scan-reviewed readings and edition variants', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/castro-alves-reviewed.json', import.meta.url), 'utf8'));
  const expected = [
    ['dedicatoria', 24], ['hebrea', 36], ['laco-de-fita', 40], ['mocidade-e-morte', 70],
    ['tres-amores', 24], ['fantasma-e-cancao', 70], ['adeus-de-thereza', 24],
    ['volta-da-primavera', 32], ['a-maciel-pinheiro', 48],
  ];
  assert.deepEqual(manifest.poems.map(item => item.slug), expected.map(([slug]) => slug));
  const selected = expected.map(([slug, count]) => {
    const item = manifest.poems.find(entry => entry.slug === slug);
    const poem = poems.find(entry => entry.id === `castro-alves-${slug}`);
    assert.ok(poem, slug);
    assert.equal(poem.author, 'Castro Alves');
    assert.equal(poem.authorYears, '1847–1871');
    assert.deepEqual(associatedPlaces(poem), ['Brazil']);
    assert.equal(poem.language, 'Portuguese');
    assert.equal(poem.lang, 'pt');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.source, item.source);
    assert.ok(new URL(poem.source).searchParams.has('oldid'));
    assert.match(poem.contextSource, new RegExp(`#page=${item.firstPages[0]}$`));
    assert.match(poem.context, /1913.*undated.*question mark/);
    assert.match(poem.rights, /public domain in the United States.*CC BY-SA 4\.0.*check local law/);
    assert.equal(lineCount(poem), count);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), item.textSha256);
    assert.deepEqual(poem.translations, []);
    assert.deepEqual(poem.themes, []);
    assert.ok(filterPoems(poems, { language: 'Portuguese', country: 'Brazil', query: 'castro alves' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  const bySlug = slug => selected.find(poem => poem.id === `castro-alves-${slug}`);
  assert.match(bySlug('hebrea').text, /inclina\?\n\nSonhas acaso/);
  assert.match(bySlug('hebrea').text, /Não vês\?/);
  assert.match(bySlug('laco-de-fita').text, /Ha pouco voavas/);
  assert.match(bySlug('laco-de-fita').text, /c′rôa/);
  assert.match(bySlug('mocidade-e-morte').text, /lagea fria\.\n\nMorrer/);
  assert.match(bySlug('tres-amores').text, /^I\n[\s\S]*\nII\n[\s\S]*\nIII\n/);
  assert.match(bySlug('fantasma-e-cancao').text, /Tambem meu tumulo morreu\.\n— «Silencio/);
  assert.match(bySlug('fantasma-e-cancao').context, /opposite order/);
  assert.match(bySlug('adeus-de-thereza').text, /Era eu\.\.\. Era a a pallida Thereza/);
  assert.match(bySlug('adeus-de-thereza').context, /single “a”/);
  assert.match(bySlug('volta-da-primavera').text, /Responde o ramo:[\s\S]*me penetra n′alma[\s\S]*Deus fez a neve/);
  assert.match(bySlug('a-maciel-pinheiro').text, /deixa a lyra e ruge/);
  assert.equal(groupPoets(poems).find(group => group.id === 'castro-alves').poems.length, 9);
});

test('Alphonsus originals retain the reviewed 1923 readings and complete works', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/alphonsus-pastoral-reviewed.json', import.meta.url), 'utf8'));
  assert.equal(manifest.scanSha256, '8b447a98b191d11a5d856e5a1f41b029b8deb38e47a72a71ec8f8e0e9974ce9b');
  assert.deepEqual(manifest.poems.map(item => item.articleNumber), [1, 2, 3, 4, 5, 6, 7, 8]);
  const selected = manifest.poems.map(item => {
    const poem = poems.find(entry => entry.id === `alphonsus-${item.slug}`);
    assert.ok(poem, item.slug);
    assert.equal(poem.title, item.title);
    assert.equal(poem.displayTitle, item.displayTitle || undefined);
    assert.equal(poem.displayTitleLang, item.displayTitle ? 'pt' : undefined);
    assert.equal(poem.author, 'Alphonsus de Guimaraens');
    assert.equal(poem.authorYears, '1870–1921');
    assert.deepEqual(associatedPlaces(poem), ['Brazil']);
    assert.equal(poem.language, 'Portuguese');
    assert.equal(poem.lang, 'pt');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.yearLabel, item.yearLabel);
    assert.equal(poem.form, item.form);
    assert.deepEqual(poem.themes, item.themes);
    assert.equal(poem.source, item.source);
    assert.ok(new URL(poem.source).searchParams.has('oldid'));
    assert.equal(new URL(poem.contextSource).hash, `#page=${item.pages[0]}`);
    assert.match(poem.rights, /public domain in the United States.*CC BY-SA 4\.0.*all-rights-reserved notice.*scan is linked, not reproduced/);
    assert.match(poem.context, /posthumous.*1923.*place of composition is not established/);
    if (item.restoredBreaks.length) assert.match(poem.context, /page turn follows the surrounding pattern; the page turn alone does not establish it/);
    assert.equal(lineCount(poem), item.lines);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), item.sha256);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Portuguese', country: 'Brazil', query: 'alphonsus de guimaraens' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(`<h1${titleAttributes(poem)}>${escapeHtml(poem.displayTitle || poem.title)}</h1>`));
    assert.ok(poemCard(poem, '/ai-poems/').includes(`<h3${titleAttributes(poem)}>${escapeHtml(poem.displayTitle || poem.title)}</h3>`));
    return poem;
  });
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\n')).digest('hex'), '0bb97531f086cecebbbd37d5d1a7f53775f514081ad76b53bdd25d17baac85d8');
  const byId = suffix => selected.find(poem => poem.id === `alphonsus-${suffix}`);
  assert.match(byId('olhos').text, /Rôxas violetas impassiveis/);
  assert.doesNotMatch(byId('olhos').text, /impassoveis/);
  assert.deepEqual(byId('olhos').text.split('\n\n').map(stanza => stanza.split('\n').length), Array(6).fill(4));
  assert.deepEqual(byId('cysnes-brancos').text.split('\n\n').map(stanza => stanza.split('\n').length), Array(6).fill(4));
  assert.deepEqual(byId('minhalma-torre').text.split('\n\n').map(stanza => stanza.split('\n').length), Array(8).fill(4));
  assert.deepEqual(byId('ysmalia').text.split('\n\n').map(stanza => stanza.split('\n').length), Array(5).fill(4));
  for (const poem of selected.filter(entry => entry.form === 'Sonnet')) assert.deepEqual(poem.text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4, 3, 3]);
  const cathedral = byId('a-cathedral');
  assert.deepEqual(cathedral.text.split('\n\n').map(stanza => stanza.split('\n').length), [6, 2, 6, 2, 6, 2, 6, 2]);
  assert.doesNotMatch(cathedral.text, /Julho.*1914/);
  assert.match(cathedral.context, /separately dates the poem July 14, 1914.*omitted from the verse/);
  assert.match(cathedral.context, /not an inferred denomination/);
  for (const query of ['ismalia', 'ysmalia']) assert.deepEqual(filterPoems(selected, { query }).map(p => p.id), ['alphonsus-ysmalia']);
  for (const query of ['a catedral', 'a cathedral']) assert.deepEqual(filterPoems(selected, { query }).map(p => p.id), ['alphonsus-a-cathedral']);
  assert.equal(groupPoets(poems).find(group => group.id === 'alphonsus-de-guimaraens').poems.length, 8);
  assert.equal(titleAttributes(byId('ysmalia')), ' lang="pt" dir="auto"');
  assert.equal(titleAttributes({ ...byId('ysmalia'), displayTitleLang: undefined }), '');
  assert.equal(titleAttributes({ ...byId('ysmalia'), displayTitleLang: 'pt" onmouseover="x' }), ' lang="pt&quot; onmouseover=&quot;x" dir="auto"');
});

test('Dante Vita nuova poems retain complete 1903 readings and distinct work boundaries', () => {
  const selected = poems.filter(poem => poem.id.startsWith('dante-vita-nuova-'));
  const numbers = Array.from({ length: 31 }, (_, index) => index + 1).filter(number => number !== 20);
  assert.deepEqual(selected.map(poem => Number(poem.id.slice(-3))), numbers);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\n')).digest('hex'), '3c18540948c5bc2aeac2152e33e75b2935224769113bc0b61ba3b3e70ce9dfff');
  const pages = [39, 45, 48, 50, 54, 61, 66, 71, 74, 77, 83, 89, 91, 96, 98, 105, 112, 119, 121, 131, 136, 139, 142, 144, 146, 149, 153, 156, 160, 163];
  const leaves = [49, 55, 58, 60, 66, 77, 82, 87, 88, 91, 97, 103, 105, 110, 112, 125, 136, 147, 149, 165, 170, 173, 178, 180, 182, 189, 193, 196, 200, 207];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.author, 'Dante Alighieri');
    assert.equal(poem.authorId, 'dante-alighieri');
    assert.equal(poem.authorYears, '1265–1321');
    assert.equal(poem.language, 'Italian');
    assert.equal(poem.lang, 'it');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['Italy']);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.context, /compared in order with OCR/);
    assert.match(poem.context, /separate scanned 1903 second edition/);
    assert.match(poem.context, /not a diplomatic transcription/);
    assert.match(poem.context, /not a claim about this poem's exact composition place or date/);
    assert.match(poem.rights, /public domain in the United States/);
    assert.match(poem.rights, /Barbara Magni and the Online Distributed Proofreading Team/);
    assert.equal(poem.source, `https://www.gutenberg.org/files/71218/71218-h/71218-h.htm#Page_${pages[index]}`);
    assert.equal(poem.contextSource, `https://archive.org/download/lavitanuova04aliggoog/lavitanuova04aliggoog.pdf#page=${leaves[index]}`);
    assert.ok(filterPoems(poems, { language: 'Italian', country: 'Italy', query: 'dante alighieri' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    if (poem.displayTitle) assert.equal(poem.displayTitleLang, 'it');
  }
  const item = n => selected.find(poem => poem.id === `dante-vita-nuova-${String(n).padStart(3, '0')}`);
  for (const n of [2, 4]) {
    assert.equal(lineCount(item(n)), 20);
    assert.deepEqual(item(n).text.split('\n\n').map(stanza => stanza.split('\n').length), [6, 6, 4, 4]);
    assert.match(item(n).context, /complete 20-line sonetto doppio/);
  }
  assert.equal(lineCount(item(6)), 44);
  assert.deepEqual(item(6).text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 10, 10, 10, 10]);
  assert.equal(item(6).form, 'Ballata');
  assert.equal(lineCount(item(11)), 70);
  assert.equal(lineCount(item(16)), 84);
  assert.deepEqual(item(16).text.split('\n\n').map(stanza => stanza.split('\n').length), [14, 14, 14, 14, 14, 14]);
  assert.match(item(16).text, /Mort’è la donna tua, ch’era sì bella\.\n\nLevava gli occhi miei/);
  assert.doesNotMatch(item(16).text, /Illustrazione/);
  assert.deepEqual(item(21).text.split('\n\n').map(stanza => stanza.split('\n').length), [14, 14, 14, 14, 14, 6]);
  assert.match(item(21).text, /Vattene sconsolata a star con elle\.$/);
  assert.deepEqual(item(23).text.split('\n\n').map(stanza => stanza.split('\n').length), [13, 13]);
  assert.match(item(23).context, /two stanzas for two voices/);
  assert.match(item(24).text, /^Era venuta nella mente mia\nQuella donna gentil/);
  assert.doesNotMatch(item(24).text, /La gentil donna, che per suo valore|COMINCIAMENTO/);
  assert.equal(lineCount(item(24)), 14);
  assert.match(item(24).context, /two alternative first quatrains/);
  assert.match(item(24).context, /not counted as another work/);
  assert.equal(selected.some(poem => /Sì lungamente m’ha tenuto Amore/.test(poem.text)), false);
  assert.equal(groupPoets(poems).find(group => group.id === 'dante-alighieri').poems.length, 30);
  for (const [query, number] of [['tanto gentile e tanto onesta pare', 18], ['ne li occhi porta la mia donna amore', 13], ['li occhi dolenti per pieta del core', 21], ['era venuta ne la mente mia', 24], ['face maravigliar; tanto e gentile', 23]]) {
    assert.deepEqual(filterPoems(selected, { query }).map(poem => poem.id), [item(number).id]);
  }
});

test('Camões sonnets retain reviewed 1843 readings, attribution caveats and the existing record', () => {
  const selected = poems.filter(poem => poem.id.startsWith('camoes-soneto-1843-'));
  const numbers = [9, 10, 12, 15, 16, 17, 19, 20, 21, 23, 26, 28, 29, 30, 32, 33, 34, 40, 41, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 56, 58, 59, 60, 61, 63, 68, 69, 73, 92, 93, 98, 99, 211, 212, 220, 228];
  assert.deepEqual(selected.map(poem => Number(poem.id.slice(-3))), numbers);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\n')).digest('hex'), 'cff20401935a18800b9b71f183e4866b2c09818010cf48f8b755b47136d4b316');
  for (const poem of selected) {
    assert.equal(poem.author, 'Luís de Camões');
    assert.equal(poem.authorId, 'luis-de-camoes');
    assert.equal(poem.authorYears, 'c. 1524–1580');
    assert.equal(poem.language, 'Portuguese');
    assert.equal(poem.lang, 'pt');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.form, 'Sonnet');
    assert.deepEqual(associatedPlaces(poem), ['Portugal']);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.equal(lineCount(poem), 14);
    assert.deepEqual(poem.text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4, 3, 3]);
    assert.doesNotMatch(poem.text, /\[~[eu]\]|_/);
    assert.match(poem.context, /48-sonnet minimum/);
    assert.match(poem.context, /not proof of unanimous attribution/);
    assert.match(poem.context, /compared in order with OCR/);
    assert.match(poem.context, /silently corrected some typographical errors/);
    assert.match(poem.context, /not a diplomatic transcription/);
    assert.match(poem.context, /not a claim about the poem's place or exact date/);
    assert.match(poem.rights, /public domain in the United States/);
    assert.match(poem.rights, /Pedro Saborano and the Online Distributed Proofreading Team/);
    const page = Number(poem.source.match(/#pag_(\d+)$/)[1]);
    assert.equal(poem.source, `https://www.gutenberg.org/files/31509/31509-h/31509-h.htm#pag_${page}`);
    assert.equal(poem.contextSource, `https://archive.org/download/obrascompletasd00montgoog/obrascompletasd00montgoog.pdf#page=${page + 79}`);
    assert.equal(poem.contextSourceTitle, `Internet Archive · 1843 scan, p. ${page}`);
    assert.ok(filterPoems(poems, { language: 'Portuguese', country: 'Portugal', query: 'luis de camoes' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    if (poem.displayTitle) assert.equal(poem.displayTitleLang, 'pt');
  }
  const byNumber = n => selected.find(poem => poem.id === `camoes-soneto-1843-${String(n).padStart(3, '0')}`);
  assert.equal(byNumber(19).contextSource.split('#page=')[1], '89');
  assert.match(byNumber(19).text, /^Alma minha gentil, que te partiste[\s\S]*Algũa cousa a dor que me ficou[\s\S]*Quão cedo de meus olhos te levou\.$/);
  assert.equal(byNumber(23).contextSource.split('#page=')[1], '91');
  assert.match(byNumber(23).context, /scan appears to print XXXIII/);
  assert.match(byNumber(29).text, /^Sete annos de pastor Jacob servia[\s\S]*Para tão longo amor tão curta a vida\.$/);
  assert.deepEqual(byNumber(29).themes, []);
  assert.match(byNumber(29).context, /does not classify it as devotional/);
  assert.match(byNumber(44).context, /1595 Rhythmas begins ‘Pellos estremos raros’/);
  assert.match(byNumber(47).context, /1595 Rhythmas begins ‘Se algũa hora/);
  assert.match(byNumber(49).text, /\nAh dura lei de Amor, que não consente\n/);
  assert.doesNotMatch(byNumber(49).text, /Ali dura lei/);
  assert.match(byNumber(49).context, /scan reads ‘Ah dura lei’; Gutenberg has ‘Ali dura lei’/);
  assert.match(byNumber(211).context, /list begins ‘Ficou-se’; this printing has ‘Fiou-se’/);
  assert.match(byNumber(228).context, /colonial expansion/);
  assert.match(byNumber(228).context, /1576 printing/);
  assert.deepEqual(selected.filter(poem => poem.textLanguageOverrides).map(poem => poem.id), ['camoes-soneto-1843-043']);
  assert.deepEqual(byNumber(43).textLanguageOverrides, [{ line: 14, lang: 'es' }]);
  assert.match(byNumber(43).text, /La vuestra falsa fe, y el amor mio\.$/);
  assert.match(byNumber(43).context, /final line is in Spanish/);
  const old = poems.find(poem => poem.id === 'amor-e-fogo-camoes');
  assert.equal(createHash('sha256').update(JSON.stringify(old)).digest('hex'), '767af002c6bc4d7d1108cf48bc4f33b6e5eaedeb43b50e12c5c99ff0459db219');
  assert.equal(groupPoets(poems).find(group => group.id === 'luis-de-camoes').poems.length, 49);
  for (const [query, number] of [['alma minha gentil', 19], ['sete anos de pastor jaco', 29], ['pelos extremos raros', 44], ['se alguma hora em vos a piedade', 47], ['razao e ja que minha confianca', 49]]) {
    assert.deepEqual(filterPoems(selected, { query }).map(poem => poem.id), [byNumber(number).id]);
  }
  assert.equal(selected.some(poem => /Mudão-se os tempos|Todo animal da calma/.test(poem.text)), false);
});

test('original verse language overrides preserve text and reject invalid markup', () => {
  const poem = poems.find(item => item.id === 'camoes-soneto-1843-043');
  const html = renderPoem(poem, poems, '/ai-poems/');
  assert.ok(html.includes('<span lang="es" dir="auto">La vuestra falsa fe, y el amor mio.</span>'));
  const sample = { ...poem, text: 'Primeira & <linha>\n\nSegunda & <línea>', textLanguageOverrides: [{ line: 2, lang: 'es' }] };
  assert.ok(renderPoem(sample, poems, '/ai-poems/').includes('Primeira &amp; &lt;linha&gt;\n\n<span lang="es" dir="auto">Segunda &amp; &lt;línea&gt;</span>'));
  for (const overrides of [null, {}, [{ line: 0, lang: 'es' }], [{ line: 3, lang: 'es' }], [{ line: 1, lang: 'es" onmouseover="x' }], [{ line: 1, lang: 'es' }, { line: 1, lang: 'pt' }]]) {
    assert.throws(() => renderPoem({ ...sample, textLanguageOverrides: overrides }, poems, '/ai-poems/'), /verse language/i);
  }
  assert.ok(renderPoem({ ...sample, textLanguageOverrides: undefined }, poems, '/ai-poems/').includes('Primeira &amp; &lt;linha&gt;\n\nSegunda &amp; &lt;línea&gt;'));
});

test('Bécquer Rimas preserve the 1912 selection, source caveats and existing works', () => {
  const selected = poems.filter(poem => poem.id.startsWith('becquer-rima-'));
  const expectedNumbers = Array.from({ length: 76 }, (_, i) => i + 1).filter(i => i !== 7 && i !== 73);
  assert.deepEqual(selected.map(poem => Number(poem.id.slice(-3))), expectedNumbers);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\n')).digest('hex'), '2d369bd2d845d9a8bcc9c2e29831d244ea593d3e221e78c784e9f31695d63f1b');
  for (const poem of selected) {
    assert.equal(poem.author, 'Gustavo A. Bécquer');
    assert.equal(poem.authorId, 'gustavo-a-becquer');
    assert.equal(poem.authorOriginal, 'Gustavo Adolfo Bécquer');
    assert.equal(poem.authorYears, '1836–1870');
    assert.equal(poem.language, 'Spanish');
    assert.equal(poem.lang, 'es');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['Spain']);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.context, /numbering belongs to this edition/);
    assert.match(poem.context, /compared in order with OCR/);
    assert.match(poem.context, /Completeness refers to this printing, not every witness/);
    assert.match(poem.context, /silently corrected obvious printing errors and normalized inconsistent spellings/);
    assert.match(poem.context, /not a diplomatic transcription/);
    assert.match(poem.context, /not an assertion of this poem's composition place or date/);
    assert.match(poem.source, /^https:\/\/www\.gutenberg\.org\/files\/53552\/53552-h\/53552-h\.htm#Rima_[IVXL]+$/);
    assert.match(poem.contextSource, /^https:\/\/archive\.org\/download\/obrasescogidas00bcqu\/obrasescogidas00bcqu\.pdf#page=\d+$/);
    assert.match(poem.rights, /public domain in the United States/);
    assert.match(poem.rights, /Josep Cols Canals, Ramon Pajares Box and the Online Distributed Proofreading Team/);
    assert.ok(filterPoems(poems, { language: 'Spanish', country: 'Spain', query: 'gustavo adolfo becquer' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  const byNumber = n => selected.find(poem => poem.id === `becquer-rima-${String(n).padStart(3, '0')}`);
  assert.equal(byNumber(1).contextSource.split('#page=')[1], '317');
  assert.equal(byNumber(3).contextSource.split('#page=')[1], '318');
  assert.match(byNumber(3).context, /printed section divider is represented by a blank line/);
  assert.doesNotMatch(byNumber(3).text, /\*\s+\*/);
  assert.equal(byNumber(21).text, '—¿Qué es poesía?—dices mientras clavas\nEn mi pupila tu pupila azul;—\n¿Qué es poesía? ¿Y tú me lo preguntas?\nPoesía... eres tú.');
  assert.equal(byNumber(53).title, 'Rima LIII · Volverán las oscuras golondrinas');
  assert.equal(byNumber(53).contextSource.split('#page=')[1], '351');
  assert.deepEqual(byNumber(53).text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4, 4, 4, 4, 4]);
  assert.match(byNumber(53).text, /¡Así no te querrán!$/);
  assert.match(byNumber(29).text, /Mas guardábamos entrambos/);
  assert.match(byNumber(29).context, /1912 text reads ‘entrambos’; the 1885 printing has ‘ambos’/);
  assert.deepEqual(selected.filter(poem => /\. \. \. \. \. \./.test(poem.text)).map(poem => Number(poem.id.slice(-3))), [29, 40, 71, 72, 76]);
  for (const number of [29, 40, 71, 72, 76]) assert.match(byNumber(number).context, /Dotted rows.*1885 edition; their significance is not established/);
  assert.match(byNumber(72).text, /^PRIMERA VOZ[\s\S]*SEGUNDA VOZ[\s\S]*TERCERA VOZ[\s\S]*Así los barqueros[\s\S]*La ropa en la playa tendida á secar\.$/);
  assert.match(byNumber(72).context, /voice headings are retained as part of this single poem/);
  assert.match(byNumber(76).text, /¡Qué sueño el del sepulcro tan tranquilo!$/);
  for (const [id, expected] of [
    ['castellana-095', '2f8826865439bf72fec5eb67335ad82fbac74baa7d163f24baa1420544b2edb6'],
    ['castellana-096', 'f1caea7b615cac53ed5248795edda174bf69e7d4fc63ddcf1ed21e2a75ff8c3a'],
  ]) assert.equal(createHash('sha256').update(JSON.stringify(poems.find(poem => poem.id === id))).digest('hex'), expected);
  assert.equal(groupPoets(poems).find(group => group.id === 'gustavo-a-becquer').poems.length, 76);
  assert.equal(filterPoems(poems, { query: 'gustavo a. becquer' }).length, 76);
  for (const [query, number] of [['volverán las oscuras golondrinas', 53], ['poesia... eres tu', 21], ['mas guardabamos entrambos', 29]]) {
    assert.deepEqual(filterPoems(selected, { query }).map(poem => poem.id), [byNumber(number).id]);
  }
});

test('Maria Firmina originals retain reviewed historical texts and explicit page mappings', async () => {
  const source = await readFile(new URL('../scripts/sources/firmina-historical-readings.txt', import.meta.url), 'utf8');
  assert.equal(createHash('sha256').update(source).digest('hex'), '6f9607a3ad8a67e39ab8f1ed33984af359dce4b950bc6974f4eebe25a27e2bc3');
  const sections = source.split(/^=== ([a-z0-9-]+) ===\n/gm);
  assert.equal(sections.shift(), '');
  const readings = new Map();
  while (sections.length) readings.set(sections.shift(), sections.shift().trim());
  const selections = [
    ['parnaso', 'por-ver-te', 222, 223, 234, [5, 4, 4, 4, 4, 5, 4]],
    ['parnaso', 'minha-vida', 223, 225, 235, Array(8).fill(4)],
    ['cantos', 'uma-tarde-no-cuman', 25, 26, 23, Array(8).fill(4)],
    ['cantos', 'supplica', 27, 29, 25, Array(10).fill(6)],
    ['cantos', 'ah-nao-posso', 45, 46, 43, Array(4).fill(6)],
    ['cantos', 'um-bouquet', 125, 127, 69, Array(5).fill(8)],
    ['cantos', 'hosana', 149, 151, 93, Array(7).fill(8)],
    ['cantos', 'o-pedido', 157, 158, 101, Array(4).fill(4)],
    ['cantos', 'amor', 159, 159, 103, Array(3).fill(4)],
    ['cantos', 'scismar', 161, 162, 105, [7, 8, 8, 8]],
    ['cantos', 'uns-olhos', 205, 206, 150, Array(6).fill(4)],
  ];
  assert.deepEqual([...readings.keys()], selections.map(([, id]) => id));
  const selected = selections.map(([edition, id, first, last, pdf, stanzas]) => {
    const poem = poems.find(item => item.id === `firmina-${edition}-${id}`);
    assert.ok(poem, id);
    assert.equal(poem.text, readings.get(id));
    assert.deepEqual(poem.text.split('\n\n').map(stanza => stanza.split('\n').length), stanzas);
    assert.equal(poem.author, 'Maria Firmina dos Reis');
    assert.equal(poem.authorYears, '1822 or 1825–1917');
    assert.equal(poem.language, 'Portuguese');
    assert.equal(poem.lang, 'pt');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['Brazil']);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.source, `https://literaturabrasileira.ufsc.br/midias/stream?id=${edition === 'parnaso' ? '147845' : '155427'}&raw=1#page=${pdf}`);
    assert.ok(poem.sourceTitle.endsWith(`pp. ${first === last ? first : `${first}–${last}`}`));
    assert.match(poem.context, /completeness refers to this printing, not every witness/);
    assert.match(poem.context, /birth year is disputed[\s\S]*1822[\s\S]*1825/);
    assert.match(poem.context, /not an assertion of this poem's composition place/);
    assert.match(poem.rights, /public domain in the United States/);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Portuguese', country: 'Brazil', query: 'maria firmina' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\n')).digest('hex'), 'abc4566cd1081f3e6309542d7d0913fbd87ce4b30f0bb8bc6921a019e2971df1');
  const byId = id => selected.find(poem => poem.id.endsWith(`-${id}`));
  assert.match(byId('minha-vida').context, /‘tristesa’ is a provisional reading/);
  assert.match(byId('por-ver-te').context, /place marker ‘Guimarães/);
  assert.match(byId('uma-tarde-no-cuman').text, /dessas phrases tuas/);
  assert.match(byId('uma-tarde-no-cuman').context, /phrases[\s\S]*2024[\s\S]*fases/);
  assert.match(byId('uma-tarde-no-cuman').context, /footnote identifies Cuman/);
  assert.match(byId('supplica').text, /Que vale a vida sem gozos/);
  assert.match(byId('supplica').context, /2024 transcription has ‘seus gozos’/);
  assert.match(byId('hosana').text, /Hosana! Senhor!$/);
  assert.match(byId('hosana').context, /earlier scan was not independently checked/);
  assert.match(byId('amor').text, /quero revelar-te a medo/);
  assert.match(byId('amor').context, /2022 UFRGS selection gives ‘rever-te’/);
  assert.match(byId('uns-olhos').text, /que fazem solemnes/);
  assert.match(byId('uns-olhos').context, /que fazem sem custo/);
  assert.deepEqual(selected.filter(poem => poem.themes.includes('Faith')).map(poem => poem.id), [
    byId('supplica').id, byId('hosana').id, byId('scismar').id,
  ]);
  for (const query of ['uma tarde no cuma', 'súplica', 'phrases tuas', 'revelar-te a medo', 'pelo ceo vagando']) {
    assert.equal(filterPoems(selected, { query }).length, 1, query);
  }
  assert.equal(byId('uma-tarde-no-cuman').displayTitleLang, 'pt');
  assert.match(byId('uma-tarde-no-cuman').context, /display title is a discovery aid/);
  assert.equal(groupPoets(poems).find(group => group.id === 'maria-firmina-dos-reis').poems.length, 11);
});

test('Sor Juana originals retain the 1689 readings, boundaries and disclosed variants', async () => {
  const source = await readFile(new URL('../scripts/sources/sor-juana-1689-readings.txt', import.meta.url), 'utf8');
  assert.equal(createHash('sha256').update(source).digest('hex'), 'e647ffb2a19987c5dbe056a0d0c1153d612c907bee22ce3a6bea7f980089074a');
  const sections = source.split(/^=== ([a-z0-9-]+) ===\n/gm);
  assert.equal(sections.shift(), '');
  const readings = new Map();
  while (sections.length) readings.set(sections.shift(), sections.shift().trim());
  const pages = [
    ['hijo-esclava', 1, 1], ['engano-colorido', 3, 3], ['fabio-sylvio', 3, 4],
    ['ingrato-amante', 4, 4], ['feliciano-lysardo', 5, 5], ['fabio-beldades', 5, 6],
    ['perseguirme-mundo', 6, 6], ['tan-grande-hado', 6, 7], ['miro-celia-rosa', 7, 7],
    ['famosa-lucrecia', 8, 8], ['tarquino-artificio', 8, 9], ['esposa-pompeyo', 9, 9],
    ['passion-porcia', 9, 10], ['funesto-moral', 10, 10], ['vesme-alcino', 11, 11],
    ['mandas-anarda', 11, 12], ['ausente-zeloso', 12, 12], ['hombres-necios', 85, 86],
    ['encarnacion-romance', 205, 205], ['san-jose-romance', 209, 209],
    ['san-pedro-romance', 209, 209], ['pilatos-soneto', 210, 210],
  ];
  assert.deepEqual([...readings.keys()], pages.map(([id]) => id));
  const selected = pages.map(([id, first, last]) => {
    const poem = poems.find(item => item.id === `sor-juana-1689-${id}`);
    assert.ok(poem, id);
    assert.equal(poem.text, readings.get(id));
    assert.equal(poem.title, poem.text.split('\n')[0].replace(/[.,;:!?]+$/, ''));
    assert.equal(poem.author, 'Sor Juana Inés de la Cruz');
    assert.equal(poem.authorYears, '1648 or 1651–1695');
    assert.equal(poem.language, 'Spanish');
    assert.equal(poem.lang, 'es');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['Mexico']);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.source, `https://archive.org/details/A086A273/page/n${first + (first <= 12 ? 19 : 21)}/mode/1up`);
    assert.ok(poem.sourceTitle.endsWith(`pp. ${first === last ? first : `${first}–${last}`}`));
    assert.match(poem.context, /completeness here refers to this printing/);
    assert.match(poem.context, /birth year is disputed between 1648 and 1651/);
    assert.match(poem.context, /not a claim about this poem’s composition place/);
    assert.match(poem.rights, /public domain in the United States/);
    assert.deepEqual(poem.translations, []);
    const stanzas = poem.text.split('\n\n').map(stanza => stanza.split('\n').length);
    if (poem.form === 'Sonnet') assert.deepEqual(stanzas, [4, 4, 3, 3]);
    else if (poem.form === 'Redondillas') assert.deepEqual(stanzas, Array(17).fill(4));
    else assert.deepEqual(stanzas, Array(id === 'encarnacion-romance' ? 8 : 6).fill(4));
    assert.ok(filterPoems(poems, { language: 'Spanish', country: 'Mexico', query: 'sor juana ines' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\n')).digest('hex'), '14209c1d48aff06ac14a2969da071a6c94fa24c8d17fc3ee1121f3fb57dab9ae');
  const byId = id => selected.find(poem => poem.id === `sor-juana-1689-${id}`);
  assert.match(byId('engano-colorido').text, /con falsos sylogismos/);
  assert.match(byId('engano-colorido').context, /1901 anthology[\s\S]*Son falsos silogismos/);
  assert.match(byId('fabio-beldades').text, /en viendo a muchos/);
  assert.match(byId('fabio-beldades').context, /1901 anthology[\s\S]*muchas/);
  assert.match(byId('perseguirme-mundo').text, /poner riquezas en mi entendimiento,\nque no mi entendimiento/);
  assert.match(byId('perseguirme-mundo').context, /later editions use ‘pensamiento’/);
  for (const id of ['feliciano-lysardo', 'miro-celia-rosa', 'famosa-lucrecia', 'esposa-pompeyo', 'passion-porcia', 'vesme-alcino']) {
    assert.match(byId(id).context, /1873/);
  }
  assert.match(byId('passion-porcia').text, /no acabes con tu vida su sossiego/);
  assert.match(byId('passion-porcia').context, /con tu muerte/);
  assert.match(byId('vesme-alcino').text, /passo, en sus hierros aerrojada/);
  assert.match(byId('hombres-necios').text, /que obre bien,[\s\S]*juntáis diablo, carne, y mundo\.$/);
  assert.match(byId('hombres-necios').context, /1873 transcription reads ‘obren bien’/);
  assert.equal(byId('hombres-necios').source, 'https://archive.org/details/A086A273/page/n106/mode/1up');
  assert.equal(byId('san-pedro-romance').source, 'https://archive.org/details/A086A273/page/n230/mode/1up');
  assert.match(byId('san-pedro-romance').text, /un gallo Pedro os avisa/);
  assert.match(byId('pilatos-soneto').text, /que en la agena firméis vuestras sentencias\.$/);
  assert.deepEqual(selected.filter(poem => poem.themes.includes('Faith')).map(poem => poem.id), [
    byId('encarnacion-romance').id, byId('san-jose-romance').id,
    byId('san-pedro-romance').id, byId('pilatos-soneto').id,
  ]);
  for (const query of ['al que ingrato me deja', 'en perseguirme, mundo, que interesas', 'despojo civil', 'firma pilatos', 'que hoy bajo dios', 'hombres necios']) {
    assert.equal(filterPoems(selected, { query }).length, 1, query);
  }
  assert.equal(byId('perseguirme-mundo').displayTitleLang, 'es');
  assert.match(byId('perseguirme-mundo').context, /modernized display title is a discovery aid/);
  assert.equal(groupPoets(poems).find(group => group.id === 'sor-juana-ines-de-la-cruz').poems.length, 22);
});

test('May Ziadé originals retain scan readings, attribution and separate printed works', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/may-ziade-fleurs-reviewed.json', import.meta.url), 'utf8'));
  assert.equal(manifest.scanSha256, 'cb19a354da073f305bc8855aa575b2f405120f04cd2f52abccd4523b397e0086');
  const expected = [
    ['a-la-lune', [25]], ['a-pauline', [26]], ['superstition', [27, 28]],
    ['apres-le-travail', [33, 34]], ['a-mon-cousin', [35]], ['immortelles', [41]],
    ['un-matin', [42, 43]], ['acte-de-foi', [51]], ['a-la-muse', [52]],
    ['automne', [53, 54]], ['a-mademoiselle-c', [55]], ['balance-toi', [60, 61, 62]],
    ['le-printemps-sendort', [68, 69]], ['abord', [76]], ['en-foret', [79, 80]],
    ['ennui', [83]], ['crepuscule', [84, 85]], ['espoir', [96]],
  ];
  assert.deepEqual(manifest.poems.map(item => [item.id, item.pages]), expected);
  assert.deepEqual(Object.keys(manifest.pageSnapshots).map(Number).sort((a, b) => a - b), expected.flatMap(([, pages]) => pages).sort((a, b) => a - b));
  const revisionSet = Object.entries(manifest.pageSnapshots).map(([number, page]) => [Number(number), page.revision, page.sha256]).sort((a, b) => a[0] - b[0]);
  assert.equal(createHash('sha256').update(JSON.stringify(revisionSet)).digest('hex'), '631ed1ffd0bc957e338a065bb06552d8c16a496a7c8b2fe1ddfb1693b015fe49');
  for (const page of Object.values(manifest.pageSnapshots)) {
    assert.ok(Number.isInteger(page.revision));
    assert.equal(createHash('sha256').update(page.wikitext).digest('hex'), page.sha256);
  }
  const selected = manifest.poems.map(item => {
    const poem = poems.find(entry => entry.id === `may-ziade-fleurs-${item.id}`);
    assert.ok(poem, item.id);
    assert.equal(poem.title, item.title);
    assert.equal(poem.author, 'May Ziadé');
    assert.equal(poem.authorOriginal, 'مي زيادة');
    assert.equal(poem.authorYears, '1886–1941');
    assert.deepEqual(associatedPlaces(poem), ['Palestine', 'Lebanon', 'Egypt']);
    assert.equal(poem.language, 'French');
    assert.equal(poem.lang, 'fr');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    const source = new URL(poem.source);
    assert.equal(source.searchParams.get('title'), `Page:Isis Copia - Fleurs de rêve, 1911.pdf/${item.pages[0]}`);
    assert.equal(Number(source.searchParams.get('oldid')), manifest.pageSnapshots[item.pages[0]].revision);
    assert.equal(poem.contextSource, 'https://poets.org/poet/may-ziadeh');
    assert.match(poem.context, /pseudonym Isis Copia/);
    assert.match(poem.context, /completeness refers to that printing/);
    assert.match(poem.context, /not claims about this poem’s place of composition/);
    assert.match(poem.rights, /public domain in the United States/);
    assert.match(poem.rights, /Wikisource contributors under CC BY-SA 4\.0/);
    assert.match(poem.rights, /page histories for contributors/);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), item.sha256);
    assert.deepEqual(poem.text.split('\n\n').map(stanza => stanza.split('\n').length), item.stanzas);
    assert.deepEqual(poem.themes, item.themes);
    assert.deepEqual(poem.translations, []);
    for (const country of associatedPlaces(poem)) assert.ok(filterPoems(poems, { language: 'French', country, query: 'may ziade' }).includes(poem));
    for (const query of ['مي زيادة', 'isis copia']) assert.ok(filterPoems(poems, { language: 'French', query }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\n')).digest('hex'), '43f4935f480340f4496b8ff02e4622eb7f3cb71e32f6d43bd54d4a1441105c69');
  const byId = id => selected.find(poem => poem.id === `may-ziade-fleurs-${id}`);
  assert.match(byId('a-pauline').text, /n’oubIie[\s\S]*pourqoui/);
  assert.match(byId('a-pauline').context, /n’oublie and pourquoi/);
  assert.match(byId('superstition').context, /Araignée du soir \/ Espoir/);
  assert.match(byId('automne').text, /Et des cœurs de regret souillés/);
  assert.match(byId('automne').context, /Et de cœurs/);
  assert.match(byId('balance-toi').text, /Quand à l’entour[\s\S]*Balance-toi, dance, petite/);
  assert.match(byId('balance-toi').context, /Wikisource corrects it to “danse”/);
  assert.deepEqual(byId('balance-toi').text.split('\n\n').map(stanza => stanza.split('\n').length), Array(8).fill(6));
  assert.deepEqual(selected.filter(poem => poem.themes.includes('Faith')).map(poem => poem.id), [
    byId('apres-le-travail').id, byId('acte-de-foi').id, byId('balance-toi').id, byId('espoir').id,
  ]);
  for (const query of ['frisson de baiser', 'mon dieu, je crois', 'pourqoui']) assert.equal(filterPoems(selected, { query }).length, 1);
  assert.ok(!selected.some(poem => /^(Fragment|Les oiseaux du Nil|Au moukattam|Qui conduit la lune)/i.test(poem.title)));
  const poet = groupPoets(poems).find(group => group.id === 'may-ziade');
  assert.equal(poet.poems.length, 18);
  for (const poem of selected) assert.ok(poet.poems.some(entry => entry.id === poem.id));
});

test('Narcisa Amália originals retain scan readings, printed boundaries and provenance', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/narcisa-nebulosas-reviewed.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.sourceSha256, {
    'nebulosas-ufsc.pdf': 'ec501f4b15fcdf08473d0265c090ab135c12844205b1498d502746d4e3dad0bf',
    'nebulosas-archive.pdf': '06146ba5b5b5aba7ee9db2db06ede1ddce317301cd0728842b20224f7c6a7028',
  });
  assert.deepEqual(manifest.poems.map(item => item.id), [
    'voto', 'saudades', 'afflicta', 'aspiracao', 'confidencia', 'agonia', 'scisma',
    'recordacao', 'amor-de-violeta', 'o-africano-e-o-poeta', 'sadness',
  ]);
  const selected = manifest.poems.map(item => {
    const poem = poems.find(entry => entry.id === `narcisa-nebulosas-${item.id}`);
    assert.ok(poem, item.id);
    assert.equal(poem.title, item.title);
    assert.equal(poem.author, 'Narcisa Amália');
    assert.equal(poem.authorId, 'narcisa-amalia');
    assert.equal(poem.authorYears, '1852?–1924');
    assert.deepEqual(associatedPlaces(poem), ['Brazil']);
    assert.equal(poem.language, 'Portuguese');
    assert.equal(poem.lang, 'pt');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(new URL(poem.source).searchParams.get('id'), '153383');
    assert.equal(new URL(poem.source).hash, `#page=${item.ufsc[0]}`);
    assert.match(poem.sourceTitle, new RegExp(`${item.pages[0]}–${item.pages.at(-1)}`));
    assert.equal(poem.contextSource, 'https://literaturabrasileira.ufsc.br/documentos?id=133827');
    assert.match(poem.context, /1852.*1856/);
    assert.match(poem.context, /boundary does not establish every other edition/);
    assert.match(poem.context, /not a claim about this poem’s place of composition/);
    assert.match(poem.rights, /public domain in the United States; check local law/);
    assert.equal(poem.text, item.text);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), item.sha256);
    assert.deepEqual(poem.text.split('\n\n').map(stanza => stanza.split('\n').length), item.stanzas);
    assert.deepEqual(poem.translations, []);
    assert.deepEqual(poem.themes, item.themes);
    assert.ok(filterPoems(poems, { language: 'Portuguese', country: 'Brazil', query: 'narcisa amalia' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\n')).digest('hex'), '30758c5f4d3ef81f834d3ab52d4a99a8eac9293e1238df3a72f74a9689b1b3b2');
  const byId = id => selected.find(poem => poem.id === `narcisa-nebulosas-${id}`);
  assert.deepEqual(byId('voto').themes, ['Faith']);
  assert.equal(selected.filter(poem => poem.themes.includes('Faith')).length, 1);
  assert.match(byId('voto').context, /epigraph is attributed to Álvares de Azevedo/);
  assert.match(byId('afflicta').text, /afflijas, volta rei, descança/);
  assert.match(byId('afflicta').context, /spacing is retained provisionally/);
  assert.equal(byId('afflicta').displayTitle, 'Aflita');
  assert.equal(byId('scisma').displayTitle, 'Cisma');
  assert.match(byId('agonia').context, /Consolação.*J\. Ezequiel Freire/);
  assert.match(byId('recordacao').context, /endnote.*early composition/);
  assert.match(byId('amor-de-violeta').text, /labios lúbricos/);
  assert.match(byId('amor-de-violeta').text, /melancolica[\s\S]*precípites/);
  assert.deepEqual(byId('o-africano-e-o-poeta').text.split('\n\n').map(stanza => stanza.split('\n').length), [12, 12, 12, 12, 12, 12]);
  assert.match(byId('o-africano-e-o-poeta').text, /Sulcado de dôr,/);
  assert.match(byId('o-africano-e-o-poeta').context, /enslaved African.*historical language/i);
  assert.match(byId('sadness').context, /English title.*Portuguese/);
  assert.ok(!selected.some(poem => /^(Consolação|Os dous trophéos|Fragmentos|Desalento)$/i.test(poem.title)));
  for (const query of ['aflita', 'afflicta']) assert.ok(filterPoems(selected, { query }).includes(byId('afflicta')));
  for (const query of ['cisma', 'scisma']) assert.ok(filterPoems(selected, { query }).includes(byId('scisma')));
  assert.deepEqual(filterPoems(selected, { query: 'sulcado de dor' }).map(poem => poem.id), [byId('o-africano-e-o-poeta').id]);
  const poet = groupPoets(poems).find(group => group.id === 'narcisa-amalia');
  assert.equal(poet.poems.length, 11);
  for (const poem of selected) assert.ok(poet.poems.some(entry => entry.id === poem.id));
});

test('Francisca Júlia originals retain reviewed first-edition readings and distinct works', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/francisca-julia-marmores-reviewed.json', import.meta.url), 'utf8'));
  const numbers = [...Array.from({ length: 21 }, (_, i) => i + 1), 23, 24, 36];
  assert.deepEqual(manifest.poems.map(item => item.articleNumber), numbers);
  assert.equal(manifest.scanSha256, '78b520b348ce8f986f618e8d2ee2b1724eea272c05ef09e0c1ed1cf405f085f6');
  const selected = manifest.poems.map(item => {
    const poem = poems.find(entry => entry.id === `francisca-julia-${item.slug}`);
    assert.ok(poem, item.slug);
    assert.equal(poem.title, item.title);
    assert.equal(poem.author, 'Francisca Júlia');
    assert.equal(poem.authorId, 'francisca-julia');
    assert.equal(poem.authorYears, '1871?–1920');
    assert.deepEqual(associatedPlaces(poem), ['Brazil']);
    assert.equal(poem.language, 'Portuguese');
    assert.equal(poem.lang, 'pt');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.source, item.source);
    assert.ok(new URL(poem.source).searchParams.has('oldid'));
    assert.equal(new URL(poem.contextSource).searchParams.get('page'), String(item.pages[0]));
    assert.ok(poem.contextSourceTitle.includes(String(item.pages[0] - 36)));
    assert.match(poem.context, /birth year is disputed.*1871.*1874/);
    assert.match(poem.rights, /public domain in the United States.*CC BY-SA 4\.0.*check local law/);
    assert.match(poem.rights, /USP states non-commercial-use.*scan is linked, not reproduced/);
    assert.equal(poem.form, item.form);
    assert.equal(lineCount(poem), item.lines);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), item.sha256);
    assert.deepEqual(poem.translations, []);
    assert.deepEqual(poem.themes, item.faith ? ['Faith'] : []);
    assert.ok(filterPoems(poems, { language: 'Portuguese', country: 'Brazil', query: 'francisca julia' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\n')).digest('hex'), 'fe2137250949c8799b834fd1092982abb41e58d48964646978a576fe903ae617');
  const byId = suffix => selected.find(poem => poem.id === `francisca-julia-${suffix}`);
  for (const poem of selected.filter(entry => entry.form === 'Sonnet')) {
    assert.deepEqual(poem.text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4, 3, 3]);
  }
  assert.deepEqual(byId('ballada-01').text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4, 4, 2, 2, 2, 2]);
  assert.deepEqual(byId('ballada-03').text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4, 4, 4, 4]);
  assert.deepEqual(byId('ballada-05').text.split('\n\n').map(stanza => stanza.split('\n').length), Array(9).fill(4));
  assert.match(byId('ballada-05').context, /print does not establish the break/);
  assert.match(byId('ballada-05').context, /prayer to Christ.*does not establish the poet’s denomination/);
  assert.match(byId('marmores-05').text, /tritão de escameo dorso louro/);
  assert.match(byId('marmores-06').text, /Pensa na longe patria.*[\s\S]*negros pituns/);
  assert.match(byId('marmores-06').context, /pátria, além.*negros reptis.*incomplete year/);
  assert.match(byId('marmores-17').text, /^Eis-me a pensar, emquanto a noite envolve a terra;/);
  assert.match(byId('ballada-01').text, /Terras extranhas e remotos mares/);
  assert.match(byId('ballada-06').text, /^Aguarda o joven conde[\s\S]*A um canto do boudoir[\s\S]*Entra e murmura/);
  assert.match(byId('ballada-18').context, /marked over dos/);
  assert.equal(byId('marmores-01').title, byId('ballada-18').title);
  assert.notEqual(byId('marmores-01').disambiguation, byId('ballada-18').disambiguation);
  assert.notEqual(byId('marmores-13').disambiguation, byId('marmores-17').disambiguation);
  assert.equal(filterPoems(poems, { language: 'Portuguese', country: 'Brazil', query: 'musa impassivel' }).length, 2);
  assert.ok(!selected.some(poem => poem.title === 'Estella'));
  const poet = groupPoets(poems).find(group => group.id === 'francisca-julia');
  assert.equal(poet.poems.length, 24);
  for (const poem of selected) assert.ok(poet.poems.some(entry => entry.id === poem.id));
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
test('Baudelaire originals preserve distinct complete 1861 readings and evidence', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/baudelaire-fleurs-1861.json', import.meta.url), 'utf8'));
  const expected = [
    4, 11, 22, 24, 27, 34, 35, 36, 39, 40, 43, 46, 47, 48, 50, 53,
    55, 59, 63, 64, 65, 66, 67, 68, 70, 71, 72, 77, 78, 79, 80, 81,
    82, 85, 86, 92, 93, 95, 98, 104, 107, 108, 109, 112, 118, 122, 124, 125,
  ];
  const sonnets = [4, 11, 22, 27, 34, 35, 39, 40, 43, 46, 55, 59, 63, 64, 65, 66, 67, 68, 70, 72, 79, 81, 82, 92, 93, 107, 108, 109, 112, 122, 124, 125];
  assert.deepEqual(manifest.poems.map(item => item.number), expected);
  assert.deepEqual(manifest.poems.filter(item => item.form === 'Sonnet').map(item => item.number), sonnets);
  assert.equal(Object.keys(manifest.pages).length, 100);
  assert.equal(Object.keys(manifest.scanSha256).length, 9);
  const all = poems.filter(poem => poem.authorId === 'charles-baudelaire');
  assert.equal(all.length, 62);
  assert.equal(all.filter(poem => poem.id.startsWith('baudelaire-fleurs-1861-')).length, expected.length);
  const incipit = poem => poem.text.split('\n').find(Boolean).normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  assert.equal(new Set(all.map(incipit)).size, all.length, 'legacy works and repeated titles stay distinct');
  for (const item of manifest.poems) {
    const id = `baudelaire-fleurs-1861-${String(item.number).padStart(3, '0')}`;
    const poem = all.find(entry => entry.id === id);
    assert.ok(poem, id);
    assert.equal(poem.title, item.title);
    assert.equal(poem.author, 'Charles Baudelaire');
    assert.equal(poem.authorYears, '1821–1867');
    assert.equal(poem.language, 'French');
    assert.equal(poem.lang, 'fr');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.form, sonnets.includes(item.number) ? 'Sonnet' : 'Verse');
    if (poem.form === 'Sonnet') assert.deepEqual(poem.text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4, 3, 3]);
    assert.deepEqual(associatedPlaces(poem), ['France']);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.match(poem.yearLabel, /1861.*composition date not established/);
    assert.equal(poem.source, item.source);
    assert.ok(new URL(poem.source).searchParams.has('oldid'));
    assert.equal(poem.contextSource, 'https://www.gutenberg.org/cache/epub/61565/pg61565-images.html');
    assert.match(poem.rights, /public domain in the United States.*CC BY-SA 4\.0.*Check local law/);
    assert.equal(lineCount(poem), item.lines);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), item.sha256);
    assert.ok(item.pages.every(page => manifest.pages[page]?.revid && manifest.pages[page]?.sha256));
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'French', country: 'France', author: poem.author }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  const byNumber = number => all.find(poem => poem.id === `baudelaire-fleurs-1861-${String(number).padStart(3, '0')}`);
  for (const number of [24, 27, 39]) {
    assert.equal(byNumber(number).title, byNumber(number).text.split('\n')[0]);
    assert.match(byNumber(number).context, /without a title/);
  }
  assert.deepEqual(byNumber(53).text.split('\n\n').map(stanza => stanza.split('\n').length), [12, 2, 12, 2, 12, 2]);
  assert.equal((byNumber(53).text.match(/Là, tout n’est qu’ordre et beauté/g) || []).length, 3);
  assert.equal(byNumber(77).title, 'Spleen');
  assert.equal(byNumber(78).title, 'Spleen');
  assert.match(byNumber(77).disambiguation, /^Je suis comme le roi/);
  assert.match(byNumber(78).disambiguation, /^Quand le ciel bas et lourd/);
  assert.match(byNumber(93).text, /Ô toi que j’eusse aimée, ô toi qui le savais !$/);
  for (const number of [53, 86, 95]) assert.match(byNumber(number).context, /page transitions can be ambiguous/);
  for (const query of ['la nature est un temple', 'luxe, calme et volupté', 'la rue assourdissante autour de moi hurlait']) {
    assert.ok(filterPoems(poems, { query }).some(poem => expected.some(number => poem.id === byNumber(number).id)), query);
  }
  assert.equal(groupPoets(poems).find(group => group.id === 'charles-baudelaire').poems.length, 62);
  assert.deepEqual(filterPoems(poems, { author: 'Charles Baudelaire', form: 'Sonnet' }).map(poem => poem.id), sonnets.map(number => byNumber(number).id));
  for (const number of [2, 3, 8, 10, 12, 13, 14, 15, 17, 18, 30, 33, 37, 38, 51, 60, 126]) {
    assert.equal(byNumber(number), undefined, `legacy, Latin or multipart work ${number} is not reimported`);
  }
});
test('Apollinaire originals retain complete 1920 readings and source evidence', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/apollinaire-alcools-1920.json', import.meta.url), 'utf8'));
  const expected = [1, 2, 4, 6, 7, 8, 10, 12, 14, 15, 17, 18, 19, 21, 23, 25, 27, 29, 31, 32, 34, 35, 36, 37, 38, 39, 40, 41, 42, 44, 45, 47, 48, 49];
  assert.deepEqual(manifest.poems.map(item => item.number), expected);
  const selected = manifest.poems.map(item => {
    const id = `apollinaire-alcools-${String(item.number).padStart(2, '0')}`;
    const poem = poems.find(entry => entry.id === id);
    assert.ok(poem, id);
    assert.equal(poem.title, item.title);
    assert.equal(poem.author, 'Guillaume Apollinaire');
    assert.equal(poem.authorId, 'guillaume-apollinaire');
    assert.equal(poem.authorYears, '1880–1918');
    assert.equal(poem.language, 'French');
    assert.equal(poem.lang, 'fr');
    assert.deepEqual(associatedPlaces(poem), ['France']);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.source, item.source);
    assert.ok(new URL(poem.source).searchParams.has('oldid'));
    assert.equal(new URL(poem.contextSource).hash, `#${item.comparisonStart}`);
    assert.match(poem.rights, /public domain in the United States.*CC BY-SA 4\.0.*check local law/);
    assert.equal(lineCount(poem), item.lines);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), item.sha256);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'French', country: 'France', author: poem.author }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  const byNumber = number => selected.find(p => p.id === `apollinaire-alcools-${String(number).padStart(2, '0')}`);
  const zone = byNumber(1);
  assert.equal(lineCount(zone), 155);
  assert.equal(createHash('sha256').update(zone.text).digest('hex'), '111ee70dd9ba70cc65ff80fa531cb01629f2de02dead52a994311a34bae19b7e');
  assert.match(zone.text, /Vous n’aimez rien tant que les pompes de l’Église\nIl est neuf heures/);
  assert.match(zone.text, /Tu es debout devant devant le zinc d’un bar crapuleux/);
  assert.match(zone.text, /Ils sont des Christ d’une autre forme et d’une autre croyance/);
  assert.match(zone.text, /Adieu Adieu\n\nSoleil cou coupé$/);
  const pont = byNumber(2);
  assert.equal(lineCount(pont), 24);
  assert.equal((pont.text.match(/Vienne la nuit sonne l’heure/g) || []).length, 4);
  assert.match(pont.text, /Vienne la nuit sonne l’heure\nLes jours s’en vont je demeure$/);
  assert.match(pont.context, /refrain.*missing from the comparison/);
  assert.deepEqual(byNumber(4).text.split('\n\n').map(stanza => stanza.split('\n').length), [7, 4, 1, 3]);
  assert.equal(byNumber(6).text, 'Et l’unique cordeau des trompettes marines');
  assert.match(byNumber(12).context, /antisemitic stereotype/);
  assert.match(byNumber(14).text, /Des masques sont silencieux/);
  assert.match(byNumber(29).text, /Puis lentement je m’allai/);
  assert.match(byNumber(32).text, /Les pétales flétris/);
  assert.match(byNumber(36).context, /planning to kill a Jewish character/);
  assert.match(byNumber(37).text, /La croix nous pousse entre les pieds\n\nLe vent du Rhin/);
  assert.deepEqual(byNumber(37).text.split('\n\n').map(stanza => stanza.split('\n').length), [5, 5, 7, 1, 7, 6, 4, 2, 5, 4, 1, 5]);
  assert.match(byNumber(38).text, /De longues robes revêtus/);
  assert.doesNotMatch(byNumber(39).text, /Septembre 1901|Mai 1902/);
  assert.deepEqual(byNumber(45).text.split('\n\n').map(stanza => stanza.split('\n').length), [5, 5, 3, 1, 6, 2, 3, 4]);
  assert.ok(filterPoems(poems, { query: 'devant devant le zinc' }).includes(zone));
  assert.ok(filterPoems(poems, { query: 'sous le pont mirabeau' }).includes(pont));
  const poet = groupPoets(poems).find(group => group.id === 'guillaume-apollinaire');
  assert.equal(poet.poems.length, expected.length);
  for (const poem of selected) assert.ok(poet.poems.some(entry => entry.id === poem.id));
  for (const number of [3, 5, 9, 11, 13, 16, 20, 22, 24, 26, 28, 30, 33, 43, 46, 50]) assert.ok(!byNumber(number));
});
test('Desbordes-Valmore originals preserve complete 1834 readings and attribution caveats', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/desbordes-valmore-pleurs-1834.json', import.meta.url), 'utf8'));
  const expected = [
    ['attente', 20], ['dors-tu', 16], ['amour', 16], ['jumeau', 46], ['adieu-tout-bas', 32],
    ['ne-me-plains-pas', 24], ['detachement', 14], ['croix-belge', 24], ['sincere', 32],
    ['une-fleur', 16], ['les-fleurs', 16], ['rameau', 30], ['fiancee', 48], ['ondine', 32],
  ];
  assert.deepEqual(manifest.poems.map(item => [item.slug, item.lines]), expected);
  assert.equal(manifest.scanSha256['les-pleurs-1834.djvu'], '13a98edaf06224a2c935357dcb89638c275c4bdef4cd4cffe5f7f68a98734cfd');
  assert.ok(manifest.scanSha256['fiancee-memorial-1831.jpg']);
  assert.equal(manifest.scanSha256['leaf-166.jpg'], undefined);
  const selected = manifest.poems.map(item => {
    const poem = poems.find(entry => entry.id === `desbordes-valmore-pleurs-${item.slug}`);
    assert.ok(poem, item.slug);
    assert.equal(poem.title, item.title);
    assert.equal(poem.author, 'Marceline Desbordes-Valmore');
    assert.equal(poem.authorId, 'marceline-desbordes-valmore');
    assert.equal(poem.authorYears, '1786–1859');
    assert.equal(poem.language, 'French');
    assert.equal(poem.lang, 'fr');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['France']);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.match(poem.yearLabel, /1834 edition.*composition date not established/);
    assert.equal(poem.source, item.source);
    assert.ok(new URL(poem.source).searchParams.has('oldid'));
    assert.match(poem.sourceTitle, new RegExp(`1834\\), no\\. ${item.roman}$`));
    assert.match(poem.context, /1834 Goullet second edition.*composition date and place are not established/);
    assert.match(poem.rights, /public domain in the United States.*CC BY-SA 4\.0.*Check local law/);
    assert.ok(poem.context.includes(item.note));
    assert.deepEqual(poem.text.split('\n\n').map(stanza => stanza.split('\n').length), item.stanzas);
    assert.equal(lineCount(poem), item.lines);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), item.sha256);
    assert.deepEqual(poem.translations, []);
    assert.deepEqual(poem.themes, item.slug === 'rameau' ? ['Faith'] : []);
    assert.ok(filterPoems(poems, { language: 'French', country: 'France', query: 'marceline desbordes-valmore' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\n')).digest('hex'), '69f9bb248cd9f7cb32ebc2106fbe39b73de0e7a4c260fe6412b9770aedcc2d40');
  const bySlug = slug => selected.find(poem => poem.id === `desbordes-valmore-pleurs-${slug}`);
  assert.deepEqual(bySlug('jumeau').text.split('\n\n').map(stanza => stanza.split('\n').length), [30, 16]);
  assert.match(bySlug('jumeau').context, /Henriette Duthillœil/);
  assert.doesNotMatch(bySlug('jumeau').context, /Duthilloeul/);
  assert.match(bySlug('detachement').text, /De quel astre inclément s’est échappé l’orage\.\n/);
  assert.match(bySlug('detachement').context, /Scan-based punctuation correction/);
  assert.match(bySlug('ondine').text, /Par ses yeux fervens d’amour,\n/);
  assert.match(bySlug('ondine').context, /Goethe.*translator.*punctuation correction/);
  assert.doesNotMatch(bySlug('sincere').text, /Hernani|Doña Sol/);
  assert.match(bySlug('sincere').context, /Victor Hugo.*Hernani.*absent/);
  assert.doesNotMatch(bySlug('amour').text, /Trop faibles que nous sommes/);
  assert.match(bySlug('amour').context, /André Chénier.*not included/);
  const fiancee = bySlug('fiancee');
  assert.match(fiancee.text, /^« Ouvrez ! » — Qui frappe à l’heure/);
  assert.match(fiancee.text, /Des anges sentinelles/);
  assert.doesNotMatch(fiancee.text, /Des mânes sentinelles/);
  assert.match(fiancee.context, /partly ink-obscured.*1831.*mânes.*anges/);
  assert.equal(fiancee.contextSource, manifest.poems.find(item => item.slug === 'fiancee').comparisonSource);
  assert.ok(filterPoems(poems, { query: 'lointain hameau' }).includes(fiancee));
  assert.ok(filterPoems(poems, { theme: 'Faith', query: 'rameau' }).includes(bySlug('rameau')));
  const poet = groupPoets(poems).find(group => group.id === 'marceline-desbordes-valmore');
  assert.equal(poet.poems.length, expected.length);
  for (const poem of selected) assert.ok(poet.poems.some(entry => entry.id === poem.id));
  for (const excluded of ['crainte', 'agar', 'oreiller', 'coucher']) {
    assert.ok(!poems.some(poem => poem.id === `desbordes-valmore-pleurs-${excluded}`));
  }
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
test('Petrarch sonnets retain reviewed 1739 readings, boundaries and distinct numbering', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/petrarch-rime-1739.json', import.meta.url), 'utf8'));
  const expected = [...Array.from({ length: 56 }, (_, i) => i + 1), 69, 98, 126];
  assert.deepEqual(manifest.poems.map(item => item.number), expected);
  assert.equal(Object.keys(manifest.scanSha256).length, 37);
  const selected = manifest.poems.map(item => {
    const id = `petrarch-rime-${String(item.number).padStart(3, '0')}`;
    const poem = poems.find(entry => entry.id === id);
    assert.ok(poem, id);
    assert.equal(poem.title, item.title);
    assert.equal(poem.author, 'Petrarch');
    assert.equal(poem.authorOriginal, 'Francesco Petrarca');
    assert.equal(poem.authorId, 'francesco-petrarca');
    assert.equal(poem.authorYears, '1304–1374');
    assert.equal(poem.language, 'Italian');
    assert.equal(poem.lang, 'it');
    assert.equal(poem.form, 'Sonnet');
    assert.deepEqual(associatedPlaces(poem), ['Italy']);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.source, item.source);
    assert.ok(new URL(poem.source).searchParams.has('oldid'));
    assert.equal(new URL(poem.contextSource).pathname, `/details/ScansionePIII200MiscellaneaOpal/page/n${item.scanPage - 1}/mode/1up`);
    assert.ok(manifest.scanSha256[`scan-${String(item.scanPage).padStart(3, '0')}.jp2`]);
    assert.match(poem.context, /sonnet-only numbering is not the modern Canzoniere sequence/);
    assert.match(poem.context, /punctuation may follow the Wikisource transcription/);
    assert.match(poem.rights, /public domain in the United States.*CC BY-SA 4\.0.*check local law/);
    assert.equal(lineCount(poem), 14);
    assert.deepEqual(poem.text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4, 3, 3]);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), item.sha256);
    assert.deepEqual(poem.themes, item.number === 48 ? ['Faith'] : []);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Italian', author: 'Petrarch' }).includes(poem));
    assert.ok(filterPoems(poems, { query: 'Francesco Petrarca' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    const lines = poem.text.split('\n').filter(Boolean);
    assert.equal(poem.title, lines[0].replace(/[.,;:?!]+$/, ''));
    for (const edit of item.corrections) {
      assert.equal(lines[edit.line - 1], edit.after);
      assert.ok(poem.context.includes(edit.before));
      assert.ok(poem.context.includes(edit.after));
    }
    return poem;
  });
  const byNumber = number => selected.find(p => p.id === `petrarch-rime-${String(number).padStart(3, '0')}`);
  const line = (number, index) => byNumber(number).text.split('\n').filter(Boolean)[index - 1];
  assert.equal(line(1, 1), 'Voi ch’ascoltate in rime sparse il suono');
  assert.equal(line(2, 1), 'Per far una leggiadra sua vendetta,');
  assert.equal(line(8, 10), 'Condotte dalla vita altra serena,');
  assert.equal(line(10, 3), 'Ch’ancor non torse dal vero cammino');
  assert.equal(line(12, 11), 'Poco prezzando quel ch’ogni uom desia:');
  assert.equal(line(25, 1), 'Quanto più m’avvicino al giorno estremo');
  assert.equal(line(28, 3), 'E gli occhi porto per fuggir intenti');
  assert.equal(line(41, 7), 'Sempre più fredda; e se parole fai,');
  assert.equal(line(42, 1), 'Poco era ad appressarsi agli occhi miei');
  assert.equal(line(47, 13), 'Ov’io fama le acquisto: e ’l pensier mio,');
  assert.equal(line(48, 13), 'Riduci i pensier vaghi a miglior luogo:');
  assert.equal(line(56, 5), 'Non me n’avvidi, lasso, se non quando');
  assert.equal(line(98, 7), 'Quel pietoso pensier ch’altri non scerse:');
  assert.equal(line(126, 2), 'Era l’esempio onde Natura tolse');
  assert.match(byNumber(28).context, /fuggire.*Ove vestigio uman l’arena/);
  assert.match(byNumber(69).context, /a l’aura.*meraviglia.*all’aura.*maraviglia/);
  assert.match(byNumber(98).context, /sì come.*fusse.*siccome.*fosse/);
  assert.deepEqual(manifest.poems.filter(item => item.comparison).map(item => item.number), [1, 7, 28, 69, 98, 126]);
  assert.ok(filterPoems(poems, { query: 'pensoso i piu deserti campi' }).includes(byNumber(28)));
  assert.ok(filterPoems(poems, { query: 'benedetto sia' }).includes(byNumber(47)));
  assert.ok(filterPoems(poems, { query: 'padre del ciel' }).includes(byNumber(48)));
  const poet = groupPoets(poems).find(group => group.id === 'francesco-petrarca');
  assert.equal(poet.poems.length, expected.length);
  for (const poem of selected) assert.ok(poet.poems.some(entry => entry.id === poem.id));
  assert.ok(poems.filter(poem => poem.language === 'Italian').length >= 100);
});
test('Italian women sonnets retain distinct editions, complete texts and source credits', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/italian-women-sonnets.json', import.meta.url), 'utf8'));
  const expected = [
    ...Array.from({ length: 12 }, (_, i) => ['stampa', i + 1]),
    ...Array.from({ length: 4 }, (_, i) => ['colonna-love', i + 1]),
    ...Array.from({ length: 10 }, (_, i) => ['colonna-spiritual', i + 1]),
  ];
  assert.deepEqual(manifest.poems.map(item => [item.group, item.number]), expected);
  assert.equal(Object.keys(manifest.scanSha256).length, 26);
  assert.equal(manifest.scanSha256['stampa-1554-full.pdf'], '564d9b447b8e15955fad9279974e1a2b97ffde6a2dcd33ad34823d383fffbfa2');
  const selected = manifest.poems.map(item => {
    const id = `${item.group}-${String(item.number).padStart(3, '0')}`;
    const poem = poems.find(entry => entry.id === id);
    assert.ok(poem, id);
    assert.equal(poem.title, item.title);
    assert.equal(poem.author, item.group === 'stampa' ? 'Gaspara Stampa' : 'Vittoria Colonna');
    assert.equal(poem.authorId, item.group === 'stampa' ? 'gaspara-stampa' : 'vittoria-colonna');
    assert.equal(poem.language, 'Italian');
    assert.equal(poem.lang, 'it');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.form, 'Sonnet');
    assert.deepEqual(associatedPlaces(poem), ['Italy']);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.source, item.source);
    assert.ok(new URL(poem.source).searchParams.has('oldid'));
    assert.match(poem.rights, /public domain in the United States.*CC BY-SA 4\.0.*Check local law/);
    assert.equal(lineCount(poem), 14);
    assert.deepEqual(poem.text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4, 3, 3]);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), item.sha256);
    assert.equal(poem.title, poem.text.split('\n')[0].replace(/[.,;:?!]+$/, ''));
    assert.deepEqual(poem.themes, item.group === 'colonna-spiritual' ? ['Faith'] : []);
    assert.deepEqual(poem.translations, []);
    const scan = item.group === 'stampa' ? 'stampa-1913' : 'colonna-1760';
    assert.ok(manifest.scanSha256[`${scan}-leaf-${String(item.scanLeaf).padStart(3, '0')}.jpg`]);
    if (item.group === 'stampa') {
      assert.match(poem.context, /numbering and headings are editorial/);
      assert.equal(new URL(poem.contextSource).hash, `#page=${item.comparisonPdfPage}`);
      assert.ok(manifest.scanSha256[`stampa-1554-leaf-${String(item.comparisonPdfPage).padStart(3, '0')}.png`]);
    } else {
      assert.match(poem.context, /numbered separately/);
      assert.ok(poem.contextSource.endsWith(`1760.djvu/${item.scanLeaf}`));
    }
    if (item.note) assert.ok(poem.context.includes(item.note));
    for (const edit of item.corrections) {
      assert.equal(poem.text.split('\n').filter(Boolean)[edit.line - 1], edit.after);
      assert.ok(poem.context.includes(edit.before));
      assert.ok(poem.context.includes(edit.after));
    }
    assert.ok(filterPoems(poems, { language: 'Italian', author: poem.author }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  const byId = id => selected.find(poem => poem.id === id);
  assert.match(byId('stampa-002').text, /quanto ’l sol giri e guardi/);
  assert.match(byId('stampa-002').context, /miri/);
  assert.match(byId('stampa-007').context, /sembiante.*sembianti/);
  assert.match(byId('stampa-009').context, /non vorrebbe.*nol vorrebbe/);
  assert.match(byId('colonna-love-001').text, /Per altra lingua/);
  assert.match(byId('colonna-love-001').context, /per altra tromba/);
  assert.match(byId('colonna-spiritual-009').text, /il ghiaccio duro/);
  assert.match(byId('colonna-spiritual-009').context, /ghìaccio.*ghiaccio/);
  assert.match(byId('colonna-love-004').text, /^S’Alla/);
  assert.match(byId('colonna-spiritual-004').text, /^S’In/);
  assert.ok(filterPoems(poems, { query: 'santi chiodi omai sieno mie penne' }).includes(byId('colonna-spiritual-001')));
  assert.equal(groupPoets(poems).find(group => group.id === 'gaspara-stampa').poems.length, 12);
  assert.equal(groupPoets(poems).find(group => group.id === 'vittoria-colonna').poems.length, 14);
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
test('Issa hokku preserve reviewed 1902 readings, attribution and distinct discovery', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/issa-1902-reviewed.json', import.meta.url), 'utf8'));
  assert.equal(manifest.poems.length, 39);
  assert.equal(Object.keys(manifest.scanSha256).length, 7);
  assert.equal(Object.keys(manifest.comparisons).length, 17);
  const selected = manifest.poems.map((item, index) => {
    const id = `issa-1902-${String(index + 1).padStart(2, '0')}`;
    const poem = poems.find(entry => entry.id === id);
    assert.ok(poem, id);
    assert.equal(poem.author, 'Kobayashi Issa');
    assert.equal(poem.authorOriginal, '小林一茶');
    assert.equal(poem.authorId, 'kobayashi-issa');
    assert.equal(poem.authorYears, '1763–1827/28');
    assert.equal(poem.language, 'Japanese');
    assert.equal(poem.lang, 'ja');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['Japan']);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.text, item.text);
    assert.equal(poem.title, item.text);
    assert.equal(lineCount(poem), 1);
    assert.equal(poem.source, `https://dl.ndl.go.jp/pid/874848/1/${item.scan}`);
    assert.match(poem.sourceTitle, new RegExp(`1902.*p\\. ${item.page}$`));
    assert.equal(poem.contextSource, manifest.comparisons[item.comparison].url);
    assert.match(poem.context, /separately printed hokku.*Lanoue.*character forms.*composition date and place/);
    if (item.note) assert.ok(poem.context.includes(item.note));
    assert.match(poem.rights, /public domain in the United States.*Check local law/);
    assert.deepEqual(poem.translations, []);
    assert.deepEqual(poem.themes, []);
    assert.ok(filterPoems(poems, { language: 'Japanese', country: 'Japan', author: 'Kobayashi Issa', query: poem.text }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\n')).digest('hex'), 'bba946c63f3d4a429f55d2453e79c9735213cee422f8311056a3084ef502c1c6');
  assert.match(selected[2].context, /頭.*首/);
  assert.match(selected[8].context, /寺へ.*寺に/);
  assert.match(selected[18].context, /市の雛.*雛の市/);
  assert.match(selected[27].context, /出したり.*出しけり/);
  assert.match(selected[32].context, /まま.*嫁事/);
  assert.match(selected[35].context, /いまいま.*夕.*いふべ/);
  const poet = groupPoets(poems).find(group => group.id === 'kobayashi-issa');
  assert.equal(poet.poems.length, 39);
  for (const poem of selected) assert.ok(poet.poems.some(entry => entry.id === poem.id));
  assert.equal(filterPoems(poems, { language: 'Japanese', query: '小林一茶' }).filter(poem => poem.authorId === 'kobayashi-issa').length, 39);
});
test('Teresa poems preserve 1877 boundaries and independently sourced complete translations', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/teresa-1877-reviewed.json', import.meta.url), 'utf8'));
  const numbers = [1, 4, 5, 6, 7, 9, 10, 15, 16, 25, 26];
  assert.deepEqual(manifest.poems.map(item => item.number), numbers);
  assert.equal(Object.keys(manifest.sourceSha256).length, 17);
  const selected = manifest.poems.map(item => {
    const id = `teresa-fuente-1877-${String(item.number).padStart(2, '0')}`;
    const poem = poems.find(entry => entry.id === id);
    assert.ok(poem, id);
    assert.equal(poem.author, 'Teresa of Ávila');
    assert.equal(poem.authorOriginal, 'Teresa de Jesús');
    assert.equal(poem.authorId, 'teresa-of-avila');
    assert.equal(poem.authorYears, '1515–1582');
    assert.equal(poem.language, 'Spanish');
    assert.equal(poem.lang, 'es');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['Spain']);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, ['Faith']);
    assert.equal(poem.title, item.title);
    assert.equal(poem.text, item.text);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), item.sha256);
    assert.deepEqual(poem.text.split('\n\n').map(stanza => stanza.split('\n').length), item.stanzas);
    assert.equal(new URL(poem.source).searchParams.get('position'), String(item.pages[0] + 48));
    assert.match(poem.context, /complete printed text and boundary.*not all witnesses/);
    assert.match(poem.context, /attribution and text.*complicated manuscript history/);
    assert.equal(poem.contextSource, 'https://teresavila.com/poesias/');
    assert.match(poem.rights, /1877 edition.*public domain in the United States.*check local law/i);
    if (item.note) assert.ok(poem.context.includes(item.note));
    assert.ok(filterPoems(poems, { language: 'Spanish', country: 'Spain', query: 'Teresa de Jesus' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    if (item.translation) {
      assert.equal(poem.translations.length, 1);
      const translation = poem.translations[0];
      assert.equal(translation.language, 'English');
      assert.equal(translation.title, item.translation.title);
      assert.equal(translation.translator, 'Benedictines of Stanbrook · 1913');
      assert.equal(translation.text, item.translation.text);
      assert.equal(createHash('sha256').update(translation.text).digest('hex'), item.translation.sha256);
      assert.deepEqual(translation.text.split('\n\n').map(stanza => stanza.split('\n').length), item.stanzas);
      assert.ok(translation.source.endsWith(`/page/n${item.translation.pages[0] + 43}/mode/1up`));
      assert.match(translation.rights, /1913.*public domain in the United States.*Check local law/);
    } else assert.deepEqual(poem.translations, []);
    return poem;
  });
  assert.equal(selected.filter(poem => poem.translations.length).length, 7);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\n')).digest('hex'), '5360b6d44c672432c1bc0fd3772ccaa14804b1ccc2dea26be9cddae44f46b25d');
  assert.equal(createHash('sha256').update(selected.flatMap(poem => poem.translations.map(t => t.text)).join('\n')).digest('hex'), '09b964b494349917c2612e7fd59706a4b9ef6c06e3e08d5e78f34667d63ed84e');
  const first = selected[0];
  assert.deepEqual(first.text.split('\n\n').map(stanza => stanza.split('\n').length), [3, ...Array(13).fill(7)]);
  assert.match(first.text, /Lloraré mi muerte ya[\s\S]*Cuando yo diga de vero,\nQue muero porque no muero\.$/);
  assert.match(first.translations[0].text, /Henceforth I will bewail my living death[\s\S]*That now I die because I do not die\?$/);
  const sixth = selected.find(poem => poem.id === 'teresa-fuente-1877-06');
  assert.match(sixth.text, /Que mi Amado es pura mí/);
  assert.match(sixth.context, /‘pura mí’.*‘para mí’/);
  assert.match(selected.find(poem => poem.id.endsWith('-25')).context, /Guadalajara manuscript copy.*Madrid manuscript copy/);
  assert.ok(filterPoems(poems, { language: 'Spanish', theme: 'Faith', query: 'aquese velo gracioso' }).includes(selected.find(poem => poem.id.endsWith('-16'))));
  assert.ok(filterPoems(poems, { query: 'wherein I die because I do not die' }).includes(first));
  assert.equal(groupPoets(poems).find(group => group.id === 'teresa-of-avila').poems.length, 11);
});
test('Labé sonnets retain Boy readings, complete boundaries and attribution caveats', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/labe-1887-reviewed.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.poems.map(item => item.number), Array.from({ length: 24 }, (_, index) => index + 1));
  assert.equal(Object.keys(manifest.pageSnapshots).length, 15);
  assert.equal(Object.keys(manifest.scanSha256).length, 28);
  const selected = manifest.poems.map(item => {
    const id = `labe-1887-${String(item.number).padStart(2, '0')}`;
    const poem = poems.find(entry => entry.id === id);
    assert.ok(poem, id);
    assert.equal(poem.author, 'Louise Labé');
    assert.equal(poem.authorId, 'louise-labe');
    assert.equal(poem.authorYears, 'c. 1524–1566');
    assert.equal(poem.language, item.number === 1 ? 'Italian' : 'French');
    assert.equal(poem.lang, item.number === 1 ? 'it' : 'fr');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['France']);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.form, 'Sonnet');
    assert.equal(poem.title, item.title);
    assert.equal(poem.title, poem.text.split('\n')[0].replace(/[.,;:?!]+$/, ''));
    assert.equal(lineCount(poem), 14);
    assert.deepEqual(poem.text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4, 3, 3]);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), item.sha256);
    assert.equal(new URL(poem.source).searchParams.get('oldid'), String(manifest.pageSnapshots[String(item.scans[0])].revision));
    for (const page of item.scans) assert.ok(manifest.scanSha256[`labe-1887-${String(page).padStart(3, '0')}.jpg`]);
    assert.match(poem.context, /published under Labé's name in 1555.*Huchon.*Clément and Michel Jourde dispute/);
    assert.match(poem.context, /Long s and spacing are normalized, stanza breaks are editorial/);
    assert.equal(poem.contextSource, 'https://www.france-memoire.fr/qui-etait-louise-labe-2/');
    assert.match(poem.rights, /public domain in the United States.*CC BY-SA 4\.0.*Check local law/);
    assert.deepEqual(poem.translations, []);
    assert.deepEqual(poem.themes, []);
    if (item.note) assert.ok(poem.context.includes(item.note));
    for (const edit of item.corrections) assert.equal(poem.text.split('\n').filter(Boolean)[edit.line - 1], edit.after);
    assert.ok(filterPoems(poems, { language: poem.language, country: 'France', author: poem.author }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\n')).digest('hex'), '370766e39a95ff7522369348400bdbb7fb22d12ca006bb0f66fcb7bd48f0b3b4');
  const byNumber = number => selected[number - 1];
  assert.match(byNumber(1).text, /gratie.*\nSperato qual i sento affanni/);
  assert.match(byNumber(7).context, /par si long temps.*pas si long tems/);
  assert.match(byNumber(12).text, /Et d’un dous mal douce fin esperer/);
  assert.match(byNumber(14).context, /A l’heur passé.*tes graces.*A leur passé.*ces graces/);
  assert.match(byNumber(16).context, /‘que’.*‘pue’/);
  assert.match(byNumber(18).context, /l’autre.*l’antre/);
  assert.match(byNumber(19).context, /compagne.*flesches.*campagne.*flesche/);
  assert.ok(filterPoems(poems, { language: 'French', query: 'larmes espandre' }).includes(byNumber(14)));
  assert.equal(groupPoets(poems).find(group => group.id === 'louise-labe').poems.length, 24);
});
test('Chiyo-ni hokku preserve reviewed 1927 readings and museum attribution', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/chiyo-ni-1927-reviewed.json', import.meta.url), 'utf8'));
  assert.equal(manifest.poems.length, 73);
  assert.equal(Object.keys(manifest.scanSha256).length, 6);
  assert.equal(new Set(manifest.poems.map(item => item.museumRow)).size, 73);
  const selected = manifest.poems.map((item, index) => {
    const id = `chiyo-ni-1927-${String(index + 1).padStart(2, '0')}`;
    const poem = poems.find(entry => entry.id === id);
    assert.ok(poem, id);
    assert.equal(poem.author, 'Kaga no Chiyo (Chiyo-ni)');
    assert.equal(poem.authorOriginal, '加賀千代女');
    assert.equal(poem.authorId, 'kaga-no-chiyo');
    assert.equal(poem.authorYears, '1703–1775');
    assert.equal(poem.language, 'Japanese');
    assert.equal(poem.lang, 'ja');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['Japan']);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.text, item.text);
    assert.equal(poem.title, item.text);
    assert.equal(lineCount(poem), 1);
    assert.equal(poem.source, `https://dl.ndl.go.jp/pid/1179392/1/${item.scan}`);
    assert.match(poem.sourceTitle, new RegExp(`1927.*p\\. ${item.page}$`));
    assert.equal(poem.contextSource, 'https://www.hakusan-museum.jp/chiyojohaiku/about/');
    assert.match(poem.context, /separately printed hokku.*Museum.*character forms.*composition date and place/);
    if (item.note) assert.ok(poem.context.includes(item.note));
    assert.match(poem.rights, /public domain in the United States.*Check local law/);
    assert.deepEqual(poem.translations, []);
    assert.deepEqual(poem.themes, []);
    assert.ok(filterPoems(poems, { language: 'Japanese', country: 'Japan', author: poem.author, query: poem.text }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\n')).digest('hex'), 'b343d3b90e0806c8119d270da2ed916efb47478444dfaec16e8c0e1eb7b0ec0f');
  assert.equal(selected.filter(poem => poem.context.includes('autograph among its sources')).length, 25);
  assert.match(selected.find(poem => poem.text.includes('何所に植ても')).context, /静なり.*静かなり/);
  assert.match(selected.find(poem => poem.text.includes('日の暮る紅葉')).context, /日の暮る.*日の暮るゝ/);
  assert.match(selected.find(poem => poem.text.startsWith('清水には')).context, /真如平等/);
  assert.match(selected.find(poem => poem.text.startsWith('百生や')).context, /三界唯心/);
  const poet = groupPoets(poems).find(group => group.id === 'kaga-no-chiyo');
  assert.equal(poet.poems.length, 73);
  for (const poem of selected) assert.ok(poet.poems.some(entry => entry.id === poem.id));
  assert.equal(filterPoems(poems, { language: 'Japanese', query: '加賀千代女' }).filter(poem => poem.authorId === 'kaga-no-chiyo').length, 73);
  assert.equal(filterPoems(poems, { language: 'Japanese', query: '千代尼' }).filter(poem => poem.authorId === 'kaga-no-chiyo').length, 73);
});
test('al-Mutanabbī poems retain their reviewed scan readings, comparison notes and RTL identity', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/mutanabbi-1890-reviewed.json', import.meta.url), 'utf8'));
  assert.equal(manifest.poems.length, 10);
  assert.equal(manifest.scanSha256, '16a2cae7fc3a9747346122652b8780a518a03c1e9973b693dcc5045258efadd8');
  const selected = manifest.poems.map((item, index) => {
    const id = `mutanabbi-1890-${String(index + 1).padStart(2, '0')}`;
    const poem = poems.find(p => p.id === id);
    assert.ok(poem, id);
    assert.equal(poem.authorId, 'al-mutanabbi');
    assert.equal(poem.authorOriginal, 'المتنبي');
    assert.equal(poem.authorYears, 'c. 915–965');
    assert.equal(poem.language, 'Arabic');
    assert.equal(poem.lang, 'ar');
    assert.equal(poem.direction, 'rtl');
    assert.deepEqual(associatedPlaces(poem), ['Not established']);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.source, `https://odyssee.univ-amu.fr/files/original/1/15/Mutanabbi-Vol1.pdf#page=${482 - item.pages[0]}`);
    assert.equal(poem.contextSource, `https://shamela.ws/book/754/${item.comparisonPage}`);
    assert.match(poem.context, /Vowel marks are omitted.*composition date and place are not established/);
    if (item.note) assert.ok(poem.context.includes(item.note));
    assert.match(poem.rights, /public domain in the United States.*Check local law/);
    assert.equal(poem.text, item.text);
    assert.equal(lineCount(poem), item.anchors.length * 2);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Arabic', author: 'al-Mutanabbī', query: poem.title }).includes(poem));
    return poem;
  });
  assert.equal(createHash('sha256').update(selected.map(p => p.text).join('\n')).digest('hex'), '76e5400719a9d168020429b4de2199f74239f6b0df54eadf9269e1d34657b6c6');
  assert.match(selected[3].context, /وصوت الغناء.*وحسن الغناء/);
  assert.match(selected[7].context, /مناخا.*مناخنا/);
  const poet = groupPoets(poems).find(p => p.id === 'al-mutanabbi');
  assert.equal(poet.poems.length, selected.length);
  for (const poem of selected) assert.ok(poet.poems.some(p => p.id === poem.id));
  const existing = poems.find(p => p.id === 'let-the-days-do-as-they-will');
  assert.equal(createHash('sha256').update(existing.text).digest('hex'), 'a03835cb05af40ff28c11f5887acf29c18fda7cfe0272774b0826aa8c74d7809');
});
test('Abū Firās poems retain historical readings, comparison boundaries and RTL identity', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/abu-firas-1895-reviewed.json', import.meta.url), 'utf8'));
  assert.equal(manifest.poems.length, 10);
  assert.deepEqual(manifest.scanSha256, {
    'dvorak-1895.pdf': '0d400e3ae355612f6dea79627dec6c9ca429876d5358400cfe9deeb1a628677d',
    'abu-firas-1910.pdf': '1615dcbbe3b94fe57d8ee25509ea9cb9da87079a19f4fa0b078b05e12ac161fd',
    'ahlwardt-1859.pdf': '9568a82c8b6e4ce7a2e72859e0e3163078ad0c7391d7d77254aa625a0a90859d',
  });
  const selected = manifest.poems.map(item => {
    const id = `abu-firas-1895-${item.slug}`;
    const poem = poems.find(entry => entry.id === id);
    assert.ok(poem, id);
    assert.equal(poem.author, 'Abū Firās al-Ḥamdānī');
    assert.equal(poem.authorId, 'abu-firas-al-hamdani');
    assert.equal(poem.authorOriginal, 'أبو فراس الحمداني');
    assert.equal(poem.authorYears, 'c. 932–968');
    assert.equal(poem.language, 'Arabic');
    assert.equal(poem.lang, 'ar');
    assert.equal(poem.direction, 'rtl');
    assert.deepEqual(associatedPlaces(poem), ['Not established']);
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.title, item.text.split('\n')[0]);
    assert.equal(poem.text, item.text);
    assert.equal(lineCount(poem), item.couplets * 2);
    assert.equal(poem.source, `https://archive.org/download/abfirseinara00abfi/abfirseinara00abfi.pdf#page=${item.pages[0] + 6}`);
    const comparisonId = item.comparison === 'ahlwardt' ? 'chalefelahmarsq00ahlwgoog' : 'diwanabifiras00abufuoft';
    assert.equal(poem.contextSource, `https://archive.org/download/${comparisonId}/${comparisonId}.pdf#page=${item.comparisonPages[0]}`);
    assert.ok(poem.contextSourceTitle.includes(String(item.comparisonPrintedPages[0])));
    assert.match(poem.context, /other traditions may differ.*not claimed to have independent manuscript descent/);
    assert.ok(poem.context.includes(item.note));
    assert.match(poem.rights, /public domain in the United States.*Check local law/);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Arabic', author: poem.author, query: poem.title }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  assert.equal(new Set(selected.map(poem => poem.id)).size, 10);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\n')).digest('hex'), 'eacbd7444a440f126eed0284bedfb2a9310fb4563f5e8a5d1ba390b4c4150628');
  const bySlug = slug => selected.find(poem => poem.id === `abu-firas-1895-${slug}`);
  assert.equal(lineCount(bySlug('dove')), 14);
  assert.match(bySlug('dove').context, /1859.*seven couplets.*1910.*five couplets/);
  assert.match(bySlug('dove').text, /معا ذا الهوى.*\nولا خطرت منك الهموم ببال\n/);
  assert.match(bySlug('dove').context, /ببال.*ببالي/);
  assert.match(bySlug('eid').context, /في كل حسن فيك مكذوب.*عن كل حسن فيك محجوب/);
  assert.match(bySlug('bridge').text, /لما تهيأ العبر\nأسرة موسى حين شق البحر/);
  assert.match(bySlug('mortal').contextSourceTitle, /127–128/);
  assert.match(bySlug('messenger').context, /تطرفا.*تظرفا/);
  const poet = groupPoets(poems).find(group => group.id === 'abu-firas-al-hamdani');
  assert.equal(poet.poems.length, 10);
  for (const poem of selected) assert.ok(poet.poems.some(entry => entry.id === poem.id));
});
test('al-Khansāʾ readings retain their printed boundaries, variants and RTL identity', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/khansa-1895-reviewed.json', import.meta.url), 'utf8'));
  assert.equal(manifest.poems.length, 8);
  assert.deepEqual(manifest.scanSha256, {
    'khansa-1895.pdf': '61bded8a868bad0617816587b2bbd2a9f67000a3dc2dc59ff71b136e672552a4',
    'khansa-1929.pdf': '2e0f0964d3181688708610a0b360912d81dba04c0c89d4239868072bfec6ef67',
  });
  const selected = manifest.poems.map(item => {
    const id = `khansa-1895-${item.slug}`;
    const poem = poems.find(entry => entry.id === id);
    assert.ok(poem, id);
    assert.equal(poem.author, 'al-Khansāʾ');
    assert.equal(poem.authorId, 'al-khansa');
    assert.equal(poem.authorOriginal, 'الخنساء');
    assert.equal(poem.language, 'Arabic');
    assert.equal(poem.lang, 'ar');
    assert.equal(poem.direction, 'rtl');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(associatedPlaces(poem), ['Not established']);
    assert.equal(poem.title, item.text.split('\n')[0]);
    assert.equal(poem.text, item.text);
    assert.equal(lineCount(poem), item.couplets * 2);
    assert.equal(poem.source, `https://archive.org/download/ansaljulasfmulak00khan/ansaljulasfmulak00khan.pdf#page=${157 - item.printedPages[0]}`);
    assert.match(poem.contextSource, new RegExp(`#page=${item.comparisonPrintedPages[0] + 4}$`));
    assert.ok(poem.context.includes(item.note));
    assert.match(poem.context, /not claimed as independent manuscript witnesses.*other traditions may differ/);
    assert.match(poem.rights, /public domain in the United States/);
    if (item.wikiPageId) {
      assert.match(poem.rights, /CC BY-SA 4\.0/);
      assert.ok(poem.rights.includes(`curid=${item.wikiPageId}&oldid=${item.wikiRevision}`));
    } else assert.doesNotMatch(poem.rights, /Wikisource/);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Arabic', author: poem.author, query: poem.title }).includes(poem));
    assert.ok(filterPoems(poems, { language: 'Arabic', query: 'الخنساء' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\n')).digest('hex'), 'a7f440469497010471f6d1b0fb3edc504c54d841090fb17c12d20fcde7c77c5a');
  const bySlug = slug => selected.find(poem => poem.id === `khansa-1895-${slug}`);
  assert.match(bySlug('women-say').text, /ويقصم عود النصب وهو صليب$/);
  assert.match(bySlug('women-say').context, /النبع.*النصب/);
  assert.match(bySlug('reply-to-salma').text, /معانا بإذن الله يزجي مصمما\nسوانح لا تكبو له وبوارحا\nنعوا مالكا بالتاج لما هبطنه/);
  assert.match(bySlug('bird-omen').text, /لوقعتها يبيض سود المسائح/);
  assert.match(bySlug('bird-omen').context, /يسود بيض المسائح/);
  assert.match(bySlug('wakeful-companions').context, /not proof of the original extent/);
  const poet = groupPoets(poems).find(group => group.id === 'al-khansa');
  assert.equal(poet.poems.length, 8);
  for (const poem of selected) assert.ok(poet.poems.some(entry => entry.id === poem.id));
});
test('Warda al-Yazijī readings retain their printed boundaries, sources and Arabic identity', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/warda-yaziji-1887-reviewed.json', import.meta.url), 'utf8'));
  assert.equal(manifest.poems.length, 9);
  assert.deepEqual(manifest.scanSha256, {
    'warda-1887.pdf': '9670ac4b3e64cc0c1eef2f6a4390f321fc28e4be2e100a01775334d8a1aa3a37',
    'warda-cairo.pdf': 'ff15c19e69fd162401258599bf23308eca769edd01f859b3ea3ae982534183d6',
  });
  const selected = manifest.poems.map(item => {
    const id = `warda-yaziji-1887-${item.slug}`;
    const poem = poems.find(entry => entry.id === id);
    assert.ok(poem, id);
    assert.equal(poem.author, 'Warda al-Yazijī');
    assert.equal(poem.authorId, 'warda-al-yaziji');
    assert.equal(poem.authorOriginal, 'وردة اليازجي');
    assert.equal(poem.language, 'Arabic');
    assert.equal(poem.lang, 'ar');
    assert.equal(poem.direction, 'rtl');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(associatedPlaces(poem), ['Lebanon']);
    assert.equal(poem.title, item.text.split('\n')[0]);
    assert.equal(poem.text, item.text);
    assert.equal(lineCount(poem), item.couplets * 2);
    assert.equal(poem.source, `https://archive.org/download/adqatalwardnam00yzijuoft/adqatalwardnam00yzijuoft.pdf#page=${63 - item.printedPages[0]}`);
    assert.match(poem.contextSource, new RegExp(`#page=${item.comparisonPrintedPages[0] + 4}$`));
    assert.ok(poem.context.includes(item.note));
    assert.match(poem.context, /boundaries in these printings, not in every tradition/);
    assert.match(poem.rights, /public domain in the United States/);
    assert.match(poem.rights, /CC BY-SA 4\.0/);
    assert.ok(poem.rights.includes(`curid=${item.wikiPageId}&oldid=${item.wikiRevision}`));
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Arabic', author: poem.author, query: poem.title }).includes(poem));
    assert.ok(filterPoems(poems, { language: 'Arabic', query: 'وردة اليازجي' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\n')).digest('hex'), 'f3bfdcc03a06f1f13c59ee24eb25bcb1239c2eaf5f5807d94fd1c30d077c3923');
  const bySlug = slug => selected.find(poem => poem.id === `warda-yaziji-1887-${slug}`);
  assert.match(bySlug('friend-away').text, /أن يجعل القرب الإله مقدما$/);
  assert.match(bySlug('friend-away').context, /أن يجعل الله اللقاء مقدما/);
  assert.match(bySlug('welcome-home').text, /وجلا علينا وجهه المتبسما/);
  assert.match(bySlug('welcome-home').context, /Wikisource has المتسما/);
  assert.match(bySlug('marun-naqqash-elegy').text, /أبكى العشيرة دمعا فاض منسجما/);
  assert.match(bySlug('marun-naqqash-elegy').text, /واليوم في العرش لاقى حسن مختتم$/);
  assert.ok(!poems.some(poem => poem.authorId === 'warda-al-yaziji' && poem.title.startsWith('الجهل شاع')));
  const poet = groupPoets(poems).find(group => group.id === 'warda-al-yaziji');
  assert.equal(poet.poems.length, 18);
  for (const poem of selected) assert.ok(poet.poems.some(entry => entry.id === poem.id));
});
test('Further Warda readings preserve distinct printings, corrected readings and credits', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/warda-yaziji-1887-more.json', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../scripts/sources/warda-yaziji-1887-more.txt', import.meta.url), 'utf8');
  const sections = source.split(/^=== ([a-z-]+) ===\n/gm);
  assert.equal(sections.shift(), '');
  const readings = new Map();
  while (sections.length) readings.set(sections.shift(), sections.shift().trim().replaceAll(' | ', '\n'));
  assert.deepEqual(manifest.scanSha256, {
    'warda-1887.pdf': '9670ac4b3e64cc0c1eef2f6a4390f321fc28e4be2e100a01775334d8a1aa3a37',
    'warda-cairo.pdf': 'ff15c19e69fd162401258599bf23308eca769edd01f859b3ea3ae982534183d6',
  });
  const expected = [
    ['patriarch', 22, '0ac0975418a26f71cb3fd76fa944c3da2e9b0d7fc0d9e12b6cb6b81dddf0cb2c'],
    ['friend-letter', 12, 'f32532dbf18578fdb126f44b0b5f22f82d7d261eb1cbac28947b1e011de1dd07'],
    ['palm-praise', 22, '6038ca162e96676607707446b6d2a373c57cb19c911552cffcd2ec244ed7d808'],
    ['taj-visit', 4, '11b00de5e7960d43a29d6152a5a602a03e350f301367166597df5b5724f0002d'],
    ['smith-return', 22, '0a2eec6f0ad40d125a423aac391ba57fec09dda1b2c3cc9e2220223fdc90487c'],
    ['taj-greeting', 20, 'b950351a4ece66695f1e587b0d987466ff0607734dd9d8e279e62af594adb88f'],
    ['taj-return', 4, '303686d95660423e71b56c19e8714d9ccac2d037f01538184763ae3aca77e533'],
    ['smith-elegy', 32, '47efe1b9d9f6ea1a482a69ab38e933913d25c4436335793987b667f970669e8e'],
    ['congratulations', 22, '4f1ac6d5ec4531e99fcf84eba23f773f324047f4e70514671851aab2764f7aac'],
  ];
  assert.deepEqual(manifest.poems.map(item => item.slug), expected.map(([slug]) => slug));
  const selected = expected.map(([slug, lines, hash], index) => {
    const item = manifest.poems[index];
    const poem = poems.find(entry => entry.id === `warda-yaziji-more-${slug}`);
    assert.ok(poem, slug);
    assert.equal(poem.author, 'Warda al-Yazijī');
    assert.equal(poem.authorId, 'warda-al-yaziji');
    assert.equal(poem.authorOriginal, 'وردة اليازجي');
    assert.deepEqual(associatedPlaces(poem), ['Lebanon']);
    assert.equal(poem.language, 'Arabic');
    assert.equal(poem.lang, 'ar');
    assert.equal(poem.direction, 'rtl');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.text, readings.get(slug));
    assert.equal(poem.title, poem.text.split('\n')[0]);
    assert.equal(lineCount(poem), lines);
    assert.equal(lines, item.couplets * 2);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.match(poem.source, new RegExp(`#page=${63 - item.printedPages[0]}$`));
    assert.match(poem.contextSource, new RegExp(`#page=${item.comparisonPrintedPages[0] + 4}$`));
    assert.ok(poem.context.includes(item.note));
    assert.match(poem.context, /not every tradition/);
    assert.match(poem.rights, /public domain in the United States/);
    assert.match(poem.rights, /CC BY-SA 4\.0/);
    assert.ok(poem.rights.includes(`curid=${item.wikiPageId}&oldid=${item.wikiRevision}`));
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Arabic', author: poem.author, query: poem.title }).includes(poem));
    assert.ok(filterPoems(poems, { language: 'Arabic', query: 'وردة اليازجي' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  const bySlug = slug => selected.find(poem => poem.id === `warda-yaziji-more-${slug}`);
  assert.match(bySlug('patriarch').context, /not classified as devotional/);
  assert.match(bySlug('friend-letter').text, /ذابت عليها بالصبابة مهجتي/);
  assert.match(bySlug('friend-letter').text, /في الحي حي ما برحت كميت$/);
  assert.match(bySlug('palm-praise').text, /إن هز أقلامه في كفه خجلت/);
  assert.match(bySlug('taj-greeting').text, /أو انتقلت عن الأحياء لا عجب/);
  assert.match(bySlug('taj-greeting').context, /الأحياء.*الأوطان/);
  assert.match(bySlug('taj-greeting').text, /لا تحسبوا أن كل الفضل للرجل/);
  assert.match(bySlug('taj-visit').context, /not a fragment/);
  assert.match(bySlug('taj-return').context, /distinguish it from the longer preceding greeting/);
  assert.match(bySlug('congratulations').text, /رآه في الأنام جليل شان/);
  assert.ok(filterPoems(poems, { query: 'ذابت عليها بالصبابة مهجتي' }).includes(bySlug('friend-letter')));
  const poet = groupPoets(poems).find(group => group.id === 'warda-al-yaziji');
  for (const poem of selected) assert.ok(poet.poems.some(entry => entry.id === poem.id));
});
test('Nasif response retains its bounded printed text and documented uncertainties', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/nasif-nisaiyat-1910.json', import.meta.url), 'utf8'));
  const source = (await readFile(new URL('../scripts/sources/nasif-nisaiyat-1910.txt', import.meta.url), 'utf8')).trimEnd();
  assert.deepEqual(manifest.scanSha256, {
    'nasif-nisaiyat-1910.pdf': '24b5bbe63a0fabf2878f2abef72e753e3e6bd5b6d0996863823662cf925840fb',
    'nisaiyat-alex-unknown.pdf': '00cb5ca5b3b9f7761da3bc0eaf4be2801063389c5257b9155e7f72ef3cd8ce0c',
    'muqtabas-year-5.pdf': '2830748149d092b96be646751fcf8275dd090a89f279c2557868423e433cbebf',
  });
  const item = manifest.poem;
  const selected = poems.filter(poem => poem.authorId === 'malak-hifni-nasif');
  assert.equal(selected.length, 1);
  const [poem] = selected;
  assert.equal(poem.id, 'nasif-1910-womens-poem');
  assert.equal(poem.author, 'Malak Hifni Nasif');
  assert.equal(poem.authorOriginal, 'ملك حفني ناصف');
  assert.equal(poem.authorYears, '1886–1918');
  assert.deepEqual(associatedPlaces(poem), ['Egypt']);
  assert.equal(poem.language, 'Arabic');
  assert.equal(poem.lang, 'ar');
  assert.equal(poem.direction, 'rtl');
  assert.equal(poem.year, null);
  assert.equal(poem.creationPlace, undefined);
  assert.equal(poem.title, 'يا هذه لا تعذلي');
  assert.equal(poem.text, source);
  assert.equal(lineCount(poem), 60);
  assert.equal(item.couplets, 60);
  assert.equal(createHash('sha256').update(poem.text).digest('hex'), '67b97f3c839ba80a035ff43a41b4f8ca43afd230263971d0a462756fadabf767');
  assert.equal(item.textSha256, createHash('sha256').update(source).digest('hex'));
  assert.deepEqual(item.printedPages, [144, 145, 146]);
  assert.deepEqual(item.pdfPages, [156, 157, 158]);
  assert.deepEqual(item.comparisonPdfPages, [154, 155, 156]);
  assert.equal(item.reviewPdfPage, 493);
  assert.equal(new URL(poem.source).hash, '#page=156');
  assert.match(poem.contextSource, /AAlexandrina-140749\/page\/n153/);
  assert.match(poem.text, /^يا هذه لا تعذلي وإذا أبيت فقللي\n/);
  assert.match(poem.text, /تجدي مقاما بالعراء/);
  assert.match(poem.text, /بين الدخول فحومل/);
  assert.match(poem.text, /يكون خلاخل في الأرجل/);
  assert.match(poem.text, /الضرورة للخروج فحيهل/);
  assert.match(poem.text, /أمارة بتبذل/);
  assert.match(poem.text, /للعب باريس ولهو بروكسل/);
  assert.match(poem.text, /فتفسري وتؤولي/);
  assert.match(poem.text, /غير الفضيلة للنساء/);
  assert.match(poem.text, /إن لم ترى رأيي فيا ويل الشجي من الخلي$/);
  assert.doesNotMatch(poem.text, /صداح يا ملك الكنار|سميتني ملك الكنار/);
  assert.match(poem.context, /title page.*library catalogues date it 1910/);
  assert.match(poem.context, /not independent descent or completeness in every tradition/);
  assert.match(poem.context, /فحومل.*فحنا.*خومل.*بتبذل.*بتبدل/);
  assert.match(poem.context, /خلاخل.*خلاخلا.*ambiguous/);
  assert.match(poem.rights, /public domain in the United States.*CC BY-SA 4\.0/);
  assert.match(poem.rights, /curid=92957&oldid=465123/);
  assert.deepEqual(poem.themes, []);
  assert.deepEqual(poem.translations, []);
  for (const query of ['ملك حفني ناصف', 'Malak Hifni Nasif', 'الضرورة للخروج فحيهل', 'لم ترى رأيي فيا ويل']) {
    assert.ok(filterPoems(poems, { language: 'Arabic', query }).includes(poem), query);
  }
  assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  assert.equal(groupPoets(poems).find(group => group.id === poem.authorId).poems[0].id, poem.id);
});
test('al-Zahawi readings retain the two corroborated 1909 printed texts and variants', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/zahawi-kalim-1909.json', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../scripts/sources/zahawi-kalim-1909.txt', import.meta.url), 'utf8');
  const sections = source.split(/^=== ([a-z-]+) ===\n/gm);
  assert.equal(sections.shift(), '');
  const readings = new Map();
  while (sections.length) readings.set(sections.shift(), sections.shift().trim().replaceAll(' | ', '\n'));
  assert.deepEqual(manifest.scanSha256, {
    'zahawi-1909.pdf': 'dba0ee8b9f1792f0ec3564815275eeca6a127fd737cf2205fe0721fceb06d6ab',
    'zahawi-1924.pdf': 'a63a0f9db1c7d9fc29c1bb9cd02c3ed4adcd94f51d9415f456ccf889c7dd55fa',
  });
  const expected = [
    ['weary-labors', 10, 40, 206, '840fdb321d74f9c4879fcbf892fa792cceb3982f43b1c22e2c43dc942ad93d9c'],
    ['tumbler-pigeons', 14, 13, 140, '00ae4d9a0e5a1ee57b3b8da8d05b78304c3253cb3832cb216bb333b1a72f8fd7'],
  ];
  assert.deepEqual(manifest.poems.map(item => item.slug), expected.map(([slug]) => slug));
  assert.deepEqual([...readings.keys()], expected.map(([slug]) => slug));
  const selected = expected.map(([slug, lines, page, comparison, hash], index) => {
    const item = manifest.poems[index];
    const poem = poems.find(entry => entry.id === `zahawi-1909-${slug}`);
    assert.ok(poem, slug);
    assert.equal(poem.author, 'Jamīl Ṣidqī al-Zahāwī');
    assert.equal(poem.authorOriginal, 'جميل صدقي الزهاوي');
    assert.equal(poem.authorYears, '1863–1936');
    assert.deepEqual(associatedPlaces(poem), ['Iraq']);
    assert.equal(poem.language, 'Arabic');
    assert.equal(poem.lang, 'ar');
    assert.equal(poem.direction, 'rtl');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.text, readings.get(slug));
    assert.equal(poem.title, poem.text.split('\n')[0]);
    assert.equal(lineCount(poem), lines);
    assert.equal(item.couplets * 2, lines);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(item.textSha256, hash);
    assert.equal(item.pdfPage, page);
    assert.equal(item.comparisonPdfPage, comparison);
    assert.equal(new URL(poem.source).hash, `#page=${page}`);
    assert.equal(new URL(poem.contextSource).hash, `#page=${comparison}`);
    assert.match(poem.context, /omitted some verses.*without identifying every affected work/);
    assert.match(poem.context, /as printed, not independent descent or completeness in every tradition/);
    assert.ok(poem.context.includes(item.note));
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Arabic', country: 'Iraq', query: poem.title }).includes(poem));
    assert.ok(filterPoems(poems, { language: 'Arabic', query: 'جميل صدقي الزهاوي' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  const [labors, pigeons] = selected;
  assert.match(labors.text, /بقيت برغم من دلالة مرشدي/);
  assert.match(labors.context, /برغم السعي والعلم والنهى/);
  assert.match(pigeons.text, /حمائم هن زينة كل راء/);
  assert.match(pigeons.text, /فطرن من الصباح إلى المساء/);
  assert.match(pigeons.context, /زينة.*المساء.*بهجة.*السماء/);
  assert.deepEqual(filterPoems(poems, { query: 'تصعيد ورقص في الهواء' }).map(poem => poem.id), [pigeons.id]);
  for (const slug of ['future-humanity', 'cooperation', 'regret', 'death-and-life']) {
    assert.ok(!poems.some(poem => poem.id === `zahawi-1909-${slug}`));
  }
  const poet = groupPoets(poems).find(group => group.id === 'jamil-sidqi-al-zahawi');
  assert.equal(poet.poems.length, 2);
  for (const poem of selected) assert.ok(poet.poems.some(entry => entry.id === poem.id));
});
test('Marrash readings preserve printed boundaries, source credits and specific faith classification', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/maryana-marrash-bint-fikr-1893.json', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../scripts/sources/maryana-marrash-bint-fikr-1893.txt', import.meta.url), 'utf8');
  const sections = source.split(/^=== ([a-z-]+) ===\n/gm);
  assert.equal(sections.shift(), '');
  const readings = new Map();
  while (sections.length) readings.set(sections.shift(), sections.shift().trim().replaceAll(' | ', '\n'));
  assert.equal(manifest.scanSha256, 'fb138913fddf153646069e625e24bf326d823fef91b1d1cb770e02bf4607e053');
  const expected = [
    ['wise-praise', 18, 'fb15fc0b9e39bf813aa3802b304e27bb8303f7891e98e7730b7270303a9c0c65'],
    ['reason-praise', 14, '1dc5492fddb726cfe9bd4ab419ad6589d8d64215582464cfdc95ceab3f98c0ef'],
    ['mary-inscription', 4, '65ce371f1d6c67127c6d1f248d45479fbf3ff41d59de1134a31e9101c938d590'],
    ['virtue', 10, '9350b0d065b9c4c645b83958a597fc870754429a06cac693466062f0aef10054'],
    ['francis-elegy', 30, '81d1186e065ed9bca6f9724446ba4316af9ee3f4a0e70428240061badec7a06e'],
    ['salma-elegy', 42, '9c868c635e3a13e5ff605f1395e7d655caac74d8d89be922ee84b9c525a19e66'],
    ['literary-work', 12, 'fff5210c0f333abef893e3d823988b9902cadcea9cbb01c21b0d6fd6f2b97c5d'],
    ['friends-family', 10, '7684954f80d8b54272f0c11dbf0967e50251efd08ab8dc1c12e9ad4cbe2729dc'],
    ['captive-heart', 10, '5514ad605bc86af95b2b06fa0e74016e50ce11b1bfa019d272c309e439410b97'],
    ['absent-friends', 10, 'db5faa37ce194ae3dfdee85c85330abbd1460b94f3846f9530718c4f8ac09637'],
    ['lasting-affection', 6, '573cf0607f918fb28e61e6ed1c5e3729aba5d71df6498fd5a6f0302de1124e9a'],
    ['friend-filmo', 10, '59c27dc2a8ae874ac7240f20941fbfa9c6e0f1bc30d80b80c046fc4211e9f06e'],
  ];
  assert.deepEqual(manifest.poems.map(item => item.slug), expected.map(([slug]) => slug));
  const selected = expected.map(([slug, lines, hash], index) => {
    const item = manifest.poems[index];
    const poem = poems.find(entry => entry.id === `maryana-marrash-1893-${slug}`);
    assert.ok(poem, slug);
    assert.equal(poem.author, 'Maryana Marrash');
    assert.equal(poem.authorOriginal, 'مريانا مراش');
    assert.equal(poem.authorYears, 'Born 1846 or 1848; died 1919');
    assert.deepEqual(associatedPlaces(poem), ['Syria']);
    assert.equal(poem.language, 'Arabic');
    assert.equal(poem.lang, 'ar');
    assert.equal(poem.direction, 'rtl');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.text, readings.get(slug));
    assert.equal(poem.title, poem.text.split('\n')[0]);
    assert.equal(lineCount(poem), lines);
    assert.equal(lines, item.couplets * 2);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.match(poem.source, new RegExp(`#page=${item.printedPages[0]}$`));
    assert.ok(poem.context.includes(item.note));
    assert.match(poem.context, /not a claim about all textual traditions/);
    assert.match(poem.context, /birth year is disputed/i);
    assert.match(poem.rights, /public domain in the United States/);
    assert.match(poem.rights, /CC BY-SA 4\.0/);
    for (const page of item.wikiPages) assert.ok(poem.rights.includes(`curid=${page.pageId}&oldid=${page.revision}`));
    assert.deepEqual(poem.themes, item.faith ? ['Faith'] : []);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Arabic', country: 'Syria', query: poem.title }).includes(poem));
    assert.ok(filterPoems(poems, { language: 'Arabic', query: 'مريانا مراش' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  const bySlug = slug => selected.find(poem => poem.id === `maryana-marrash-1893-${slug}`);
  assert.match(bySlug('mary-inscription').text, /وبك الخلاص غدا وإبليس انقهر/);
  assert.match(bySlug('mary-inscription').context, /غدا.*عدا.*uncertain/);
  assert.match(bySlug('mary-inscription').context, /no denomination is asserted/);
  assert.match(bySlug('francis-elegy').text, /خنساء صخر بكته حينما نظرت/);
  assert.match(bySlug('francis-elegy').text, /ويلاه من حزن قلب نال غايته/);
  assert.match(bySlug('francis-elegy').context, /death to 1874, not the poem's composition/);
  assert.match(bySlug('salma-elegy').text, /ليت النسا لا يلدن مثلهن ولا/);
  assert.match(bySlug('salma-elegy').text, /هذا لعمري قضاء كان في القدر$/);
  assert.match(bySlug('friends-family').text, /فسبحان من أولاكم حلة الفخر/);
  assert.match(bySlug('captive-heart').text, /وكبدي تقطع/);
  assert.match(bySlug('absent-friends').text, /في الطبيعة أعجم$/);
  assert.deepEqual(filterPoems(poems, { language: 'Arabic', theme: 'Faith', query: 'مريانا مراش' }).map(poem => poem.id), [bySlug('mary-inscription').id]);
  assert.ok(filterPoems(poems, { query: 'ليت النسا لا يلدن مثلهن' }).includes(bySlug('salma-elegy')));
  const poet = groupPoets(poems).find(group => group.id === 'maryana-marrash');
  assert.equal(poet.poems.length, 22);
  for (const poem of selected) assert.ok(poet.poems.some(entry => entry.id === poem.id));
});
test('additional Arabic works retain their bounded readings, credits and variants', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/arabic-voices-reviewed.json', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../scripts/sources/arabic-voices-reviewed.txt', import.meta.url), 'utf8');
  const sections = source.split(/^=== ([a-z-]+) ===\n/gm);
  assert.equal(sections.shift(), '');
  const readings = new Map();
  while (sections.length) readings.set(sections.shift(), sections.shift().trim().replaceAll(' | ', '\n'));
  assert.deepEqual(manifest.scanSha256, {
    'bint-fikr-commons.pdf': 'fb138913fddf153646069e625e24bf326d823fef91b1d1cb770e02bf4607e053',
    'mashahir-1922.pdf': '5871bd12d1d4b8bef093e8690dd5ac3330975fcd3d11cf5b891c80db53dba31e',
    'ibrahim-collected-undated.pdf': '78d00d3a59fd1314795a08b48334469c9a225de05411b53b423f8218dc757bc3',
  });
  const expected = [
    ['francis-coffin', 2, '241959a8fcd067da0c74cacd83bdf535aa85d2a50ecec1eab23ce5f770320a97'],
    ['evening-gathering', 5, '5d08a6800dcad6fa39e33661a5ea1a8f06e8984c0983ad1c454b25ad84d9006c'],
    ['bashir-elegy', 2, 'bb6497a0700518e343ae5fe8fe901955681f8955bc430d5a61d04543a4582f37'],
    ['steadfast-friend', 3, '6a4dfc3b30fa91c25c49a714ee26a4837b80e264adb987175dfd7b76c855014d'],
    ['unlearned-physician', 2, 'a692cb3df492b7ec9b589d480eeb12287ace2600002aed3bb98de135c8edb1f7'],
    ['fragrant-pouch', 2, 'a14a1adb3f4ecde137f6f85c391d9400c2c8f70df7eac91fef92207bcdc350dd'],
    ['photograph', 2, 'd16a6ef8e6dfccf46f62abe79808772eac1f4ec35702586b9c446865c4411ea3'],
    ['newborn-greeting', 3, '0057812124f1f852676e82225c9e437ff9d2fd70a5d2fb62b006e5301ed1c71a'],
    ['barber', 2, '8ffec41f5993eea5279e6c7ba977bd94ea54c21b84a71456fb3cc200e1465851'],
    ['bereaved-mother', 2, '99c87d1c053ecc7a8d0e100f7a34f4d6985fb08dc65bdaaee24d208d044f196d'],
    ['truth-and-homeland', 32, '257bb3ea9503b56dfb664c600b879482e16562159d5ca94bc43eb442f26fe945'],
  ];
  const marrashSources = {
    'francis-coffin': [[19], [[174584, 311907]]],
    'evening-gathering': [[19], [[174584, 311907]]],
    'bashir-elegy': [[20], [[174586, 311908]]],
    'steadfast-friend': [[21], [[174587, 311909]]],
    'unlearned-physician': [[22], [[174588, 311910]]],
    'fragrant-pouch': [[22], [[174588, 311910]]],
    'photograph': [[23], [[174589, 311911]]],
    'newborn-greeting': [[23, 24], [[174589, 311911], [174590, 311912]]],
    'barber': [[24], [[174590, 311912]]],
    'bereaved-mother': [[24], [[174590, 311912]]],
  };
  assert.deepEqual(manifest.poems.map(item => item.slug), expected.map(([slug]) => slug));
  for (const [index, [slug, couplets, hash]] of expected.entries()) {
    const item = manifest.poems[index];
    const id = item.poet === 'marrash' ? `maryana-marrash-1893-${slug}` : `hafiz-ibrahim-1922-${slug}`;
    const poem = poems.find(entry => entry.id === id);
    assert.ok(poem, id);
    assert.equal(poem.language, 'Arabic');
    assert.equal(poem.lang, 'ar');
    assert.equal(poem.direction, 'rtl');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.text, readings.get(slug));
    assert.equal(lineCount(poem), couplets * 2);
    assert.equal(item.couplets, couplets);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(item.textSha256, hash);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States/);
    assert.ok(filterPoems(poems, { language: 'Arabic', query: poem.title }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    if (item.poet === 'marrash') {
      assert.deepEqual(item.printedPages, marrashSources[slug][0]);
      assert.deepEqual(item.wikiPages.map(page => [page.pageId, page.revision]), marrashSources[slug][1]);
      assert.equal(poem.authorId, 'maryana-marrash');
      assert.deepEqual(associatedPlaces(poem), ['Syria']);
      assert.equal(poem.title, poem.text.split('\n')[0]);
      assert.match(poem.source, new RegExp(`#page=${item.printedPages[0]}$`));
      assert.ok(poem.context.includes(item.note));
      assert.match(poem.context, /not a claim about all textual traditions/);
      assert.match(poem.rights, /CC BY-SA 4\.0/);
      for (const page of item.wikiPages) assert.ok(poem.rights.includes(`curid=${page.pageId}&oldid=${page.revision}`));
    } else {
      assert.equal(poem.authorId, 'hafiz-ibrahim');
      assert.equal(poem.authorOriginal, 'حافظ إبراهيم');
      assert.deepEqual(associatedPlaces(poem), ['Egypt']);
      assert.deepEqual(item.printedPages, [204, 205, 206]);
      assert.deepEqual(item.pdfPages, [167, 166, 165]);
      assert.deepEqual(item.comparisonPrintedPages, [94, 95, 96, 97]);
      assert.deepEqual(item.comparisonPdfPages, [466, 467, 468, 469]);
      assert.equal(new URL(poem.source).hash, '#page=167');
      assert.equal(new URL(poem.contextSource).hash, '#page=466');
      assert.match(poem.context, /rarely reprints.*previously published poems whole/);
      assert.match(poem.context, /not independent descent or completeness in every tradition/);
      assert.match(poem.context, /يزكو.*ولتنتخب.*يذكو.*وتنتخب/);
      assert.match(poem.context, /يسجح.*يسجج/);
      assert.ok(filterPoems(poems, { language: 'Arabic', query: 'Hafiz Ibrahim' }).includes(poem));
      assert.ok(filterPoems(poems, { language: 'Arabic', query: 'فإنما في القلة المنجح' }).includes(poem));
    }
  }
  const baby = poems.find(poem => poem.id === 'maryana-marrash-1893-newborn-greeting');
  assert.match(baby.text, /فإنها ملاك بالبشر يبتسم\nخط مولدها بالسعد مقترن/);
  assert.match(baby.context, /one couplet on p\. 23 continues with two on p\. 24/);
  const mother = poems.find(poem => poem.id === 'maryana-marrash-1893-bereaved-mother');
  assert.match(mother.text, /قد قصدت شتاتي/);
  assert.match(mother.context, /not as an established event in the poet's own life/);
  const hafiz = poems.find(poem => poem.id === 'hafiz-ibrahim-1922-truth-and-homeland');
  assert.match(hafiz.text, /والروض لا يزكو ولا ينفح/);
  assert.match(hafiz.text, /ولتنتخب صفوة أبنائها/);
  assert.match(hafiz.text, /أيديكم فالقيد لا يسجح/);
  assert.match(hafiz.text, /فإنما في القلة المنجح$/);
  assert.deepEqual(groupPoets(poems).find(group => group.id === 'hafiz-ibrahim').poems.map(poem => poem.id), [hafiz.id]);
});
test('Qābāḍū originals retain historical boundaries, source rights and complete readings', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/qabadu-tunis-reviewed.json', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../scripts/sources/qabadu-tunis-reviewed.txt', import.meta.url), 'utf8');
  const sections = source.split(/^=== ([a-z-]+) ===\n/gm);
  assert.equal(sections.shift(), '');
  const readings = new Map();
  while (sections.length) readings.set(sections.shift(), sections.shift().trim().replaceAll(' | ', '\n'));
  assert.deepEqual(manifest.scanSha256, {
    'tunis-library-1877-candidate.pdf': '818f0a31586b2d97efd3b199ab3e5c6acf96852289a2fe1e6d510c246c2a5cbd',
    'bsb-v1-p21.jpg': '5497dbd0b65c4f7969077492fb076664167fc463cb8bdbab0c58adbc7a538246',
    'bsb-v1-p22.jpg': '4f6ce9e5cd867dd9d5e5cee9f3ffe53edb2335fc021320c71c2e70ae4a3d5571',
    'bsb-v1-p23.jpg': 'aec13e8650e330e5db5af3ae7035b361aec9411e2b9a6ab0d50aaad2bdc984dd',
    'bsb-v1-p50.jpg': 'e07fbd66dbc324ffcf4149632ec863b8d0bc74e5b0acca00b430ba09a2327510',
    'bsb-v1-p51.jpg': '516d98295a9bc0cf8914e263a6fbab9962871a675bec30db25e8c7809c703f06',
  });
  const cases = [
    ['reward', 4, [22], '128cb523211720b93ea22dec40d2540918fcfc2e70a9e89173668523c311ae42'],
    ['toothache', 10, [22], '3f9bd9ee2df858222123a83bc9877c482624631411562e57812f948a7c2315ca'],
    ['messenger', 5, [22, 23], '7b864f97340038af7403ed09ee9b4b3a79c5175645efefcee877ebc66a81def3'],
    ['couscous', 7, [23], '80ad31d18408a8a25e826647e8cf9308fb662c3c6a410f06024bb08e87cd8f57'],
    ['birth-chronogram', 3, [50], 'ca98820efe4bb4ad21e4bef6199b666895f52547109d132ec8d565f725a00e55'],
    ['visit', 4, [51], 'ea76b0cf14e4ff6628a2841ba39c57b980e160823702689ce777844aeb2fed88'],
    ['almonds', 4, [51], 'ed687e5a3c1f4a6a334d70d4f08b002052c2214f87d59ffda23b0be19f3713a6'],
    ['seal-chronogram', 2, [51], 'e896014961e22ed5a3f05c43e31c69a83cc03d9780454e9fc07c9edf549fb6e6'],
  ];
  assert.deepEqual(manifest.poems.map(item => item.slug), cases.map(([slug]) => slug));
  const image = page => `https://api.digitale-sammlungen.de/iiif/image/v2/bsb11368507_${String(177 - page).padStart(5, '0')}/full/full/0/default.jpg`;
  for (const [index, [slug, couplets, pages, hash]] of cases.entries()) {
    const item = manifest.poems[index];
    const poem = poems.find(p => p.id === `qabadu-tunis-${slug}`);
    assert.ok(poem, slug);
    assert.deepEqual(item.printedPages, pages);
    assert.deepEqual(item.tunisPdfPages, pages.map(page => page + 4));
    assert.deepEqual(item.bsbImages, pages.map(page => 177 - page));
    assert.equal(item.couplets, couplets);
    assert.equal(item.textSha256, hash);
    assert.equal(poem.text, readings.get(slug));
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(lineCount(poem), couplets * 2);
    assert.equal(poem.title, poem.text.split('\n')[0]);
    assert.equal(poem.author, 'Mahmud Qabadu');
    assert.equal(poem.authorOriginal, 'محمود قابادو');
    assert.equal(poem.authorYears, 'c. 1815–1871');
    assert.deepEqual(associatedPlaces(poem), ['Tunisia']);
    assert.equal(poem.language, 'Arabic');
    assert.equal(poem.lang, 'ar');
    assert.equal(poem.direction, 'rtl');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.source, image(pages[0]));
    assert.equal(poem.contextSource, pages.length > 1 ? image(pages[1]) : item.comparison);
    assert.match(poem.context, /same typesetting, not independent editions/);
    assert.match(poem.context, /source edition is not established/);
    assert.ok(poem.context.includes(item.note));
    assert.match(poem.rights, /public domain in the United States/);
    assert.match(poem.rights, /digital images NoC-NC; the scans are linked, not republished/);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    for (const query of [poem.title, 'محمود قابادو', 'Mahmud Qabadu']) {
      assert.ok(filterPoems(poems, { language: 'Arabic', query }).includes(poem), query);
    }
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  const bySlug = slug => poems.find(poem => poem.id === `qabadu-tunis-${slug}`);
  assert.match(bySlug('toothache').text, /وجعا بضرسي قد أطال عناء/);
  assert.match(bySlug('toothache').context, /عناء.*شفاء.*عنائي.*شفائي/);
  assert.match(bySlug('messenger').text, /حيث انقضى أجل للاستعفاء/);
  assert.match(bySlug('messenger').context, /للاستعفاء.*بلا استعفاء/);
  assert.match(bySlug('couscous').context, /half-line by another writer/);
  assert.match(bySlug('couscous').text, /يكسكس ما تلا صبحا مساء$/);
  assert.match(bySlug('seal-chronogram').context, /not independently asserted as a composition date/);
  assert.ok(filterPoems(poems, { query: 'يكسكس ما تلا صبحا مساء' }).includes(bySlug('couscous')));
  assert.equal(groupPoets(poems).find(group => group.id === 'mahmud-qabadu').poems.length, cases.length);
});
test('al-Maʿarrī originals retain reviewed readings, source boundaries and variants', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/al-maarri-1901-reviewed.json', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../scripts/sources/al-maarri-1901-reviewed.txt', import.meta.url), 'utf8');
  const sections = source.split(/^=== ([a-z-]+) ===\n/gm);
  assert.equal(sections.shift(), '');
  const readings = new Map();
  while (sections.length) readings.set(sections.shift(), sections.shift().trim().replaceAll(' | ', '\n'));
  assert.deepEqual(manifest.scanSha256, {
    'siqt-hindiyya-1901.pdf': '9001ba79fd4800b6cf66314e1bb5202f8ac0ace49d11efd81dc43d7fab0c597e',
    'siqt-bulaq-1869.pdf': '989b3e8f4cf0cf1fd81b9417707f1090f8c466e131eeb0327884c44bebd77743',
    'shuruh-1948-vol4.pdf': '1ec50b0f5a3500e7b0bda75d02fa92ae7926e0b6bbe0986bf1c48afea1ed878e',
  });
  const expected = [
    { slug: 'farewell', couplets: 3, hash: '4f05560a0894df0fe55d8a5b3880f9040bcdabf19d0396a8610d8c89f9e10d78', primary: [132], pdf: [136], bulaq: [136], bulaqPdf: [97], critical: [1721], criticalPdf: [275], number: 70 },
    { slug: 'candle', couplets: 4, hash: '4eb8d8bc869d53b5be15adba875bc12b2698a6eba542ea5d73602fec952697f6', primary: [132, 133], pdf: [136, 137], bulaq: [136, 137], bulaqPdf: [97, 96], critical: [1723, 1724], criticalPdf: [277, 278], number: 71 },
    { slug: 'mother-elegy', couplets: 10, hash: '869c990a378ebabaf1ef33f036844d298aae84d0c49167e294b66e0af285e33c', primary: [133], pdf: [137], bulaq: [137, 138], bulaqPdf: [96, 95], critical: [1725, 1726, 1727, 1728, 1729, 1730, 1731], criticalPdf: [279, 280, 281, 282, 283, 284, 285], number: 72 },
    { slug: 'gifts', couplets: 8, hash: '5e68c20ae08e3b65bb8ae6b61651c63022980fde5190495567a4f11784af0167', primary: [133, 134], pdf: [137, 138], bulaq: [138, 139], bulaqPdf: [95, 94], critical: [1732, 1733, 1734, 1735], criticalPdf: [286, 287, 288, 289], number: 73 },
    { slug: 'past-endeavors', couplets: 15, hash: '8ab1cff7dd47630fe43052b24c718fb220f6252708170edf87871327b0c16bbc', primary: [134, 135], pdf: [138, 139], bulaq: [139, 140, 141], bulaqPdf: [94, 93, 92], critical: [1736, 1737, 1738, 1739, 1740, 1741, 1742, 1743], criticalPdf: [290, 291, 292, 293, 294, 295, 296, 297], number: 74 },
    { slug: 'armor', couplets: 10, hash: '8e12a1a2667e9cf7c32f05395bf34a5fe68cc9b24ef28f5d49ee1270999e5873', primary: [135], pdf: [139], bulaq: [141, 142], bulaqPdf: [92, 91], critical: [1747, 1748, 1749, 1750, 1751], criticalPdf: [301, 302, 303, 304, 305], number: 75 },
  ];
  assert.deepEqual(manifest.poems.map(item => item.slug), expected.map(item => item.slug));
  const selected = expected.map((entry, index) => {
    const item = manifest.poems[index];
    const poem = poems.find(p => p.id === `al-maarri-1901-${entry.slug}`);
    assert.ok(poem, entry.slug);
    assert.deepEqual([item.printedPages, item.pdfPages, item.bulaqPrintedPages, item.bulaqPdfPages, item.criticalPrintedPages, item.criticalPdfPages, item.criticalNumber],
      [entry.primary, entry.pdf, entry.bulaq, entry.bulaqPdf, entry.critical, entry.criticalPdf, entry.number]);
    assert.equal(item.couplets, entry.couplets);
    assert.equal(item.textSha256, entry.hash);
    assert.equal(poem.text, readings.get(entry.slug));
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), entry.hash);
    assert.equal(lineCount(poem), entry.couplets * 2);
    assert.equal(poem.title, poem.text.split('\n')[0]);
    assert.equal(poem.author, 'Abu al-Ala al-Maarri');
    assert.equal(poem.authorOriginal, 'أبو العلاء المعري');
    assert.equal(poem.authorId, 'abu-al-ala-al-maarri');
    assert.equal(poem.authorYears, '973–1057 or 1058');
    assert.deepEqual(associatedPlaces(poem), ['Syria']);
    assert.equal(poem.language, 'Arabic');
    assert.equal(poem.lang, 'ar');
    assert.equal(poem.direction, 'rtl');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.source, `https://dlib.nyu.edu/files/books/columbia_aco000324/columbia_aco000324_lo.pdf#page=${entry.pdf[0]}`);
    assert.equal(poem.contextSource, `https://dlib.nyu.edu/files/books/columbia_aco001465/columbia_aco001465_lo.pdf#page=${entry.criticalPdf[0]}`);
    assert.match(poem.context, /derived from Bulāq; they are not independent witnesses/);
    assert.match(poem.context, /not a claim about every textual tradition/);
    assert.match(poem.context, /not an asserted composition place/);
    assert.ok(poem.context.includes(item.note));
    assert.match(poem.rights, /public domain in the United States/);
    assert.match(poem.rights, /1948 scholarly edition is linked for comparison, not reproduced/);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    for (const query of [poem.title, 'أبو العلاء المعري', 'Abu al-Ala al-Maarri']) {
      assert.ok(filterPoems(poems, { language: 'Arabic', query }).includes(poem), query);
    }
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  const [farewell, candle, mother, gifts, past, armor] = selected;
  assert.match(farewell.text, /فمتى أودع خلي التوديعا$/);
  assert.match(farewell.context, /al-Balkhī.*not proof of an autobiographical event/);
  assert.match(farewell.context, /عن instead of من/);
  assert.match(candle.text, /فقد تدمع الأحداق من كثرة الضحك$/);
  assert.match(candle.context, /على غير الأيام.*على نوب الأيام/);
  assert.match(candle.context, /1884 Beirut edition omitted the last two couplets/);
  assert.match(mother.text, /طوتهم شهور في التراب وأحوال$/);
  assert.match(mother.context, /1884 Beirut printing omitted the elegy/);
  assert.match(mother.text, /أبالشأم حفرة/);
  assert.match(mother.context, /الشأم.*الشام.*uncertain/);
  assert.ok(filterPoems(poems, { query: 'طوتهم شهور في التراب وأحوال' }).includes(mother));
  assert.match(gifts.text, /لإسباغ طهر حان أو لشراب$/);
  assert.match(gifts.context, /تفتش.*تكشف.*بجدة.*نجدة.*وأهلها.*وإنسها/);
  assert.match(past.text, /فليس مثلي بناس ذلك العصرا/);
  assert.match(past.text, /وصغت في الوارد المأمول تهنئة/);
  assert.match(past.text, /عشرين حولا فلما نبه اعتذرا$/);
  assert.match(past.context, /الشعر.*أحيا.*الجزء.*أعيا/);
  assert.match(past.context, /al-Baṭalyawsī did not transmit the sixth couplet/);
  assert.match(armor.text, /أعاذل طال ما أتلفت مالي\nولكن الحوادث أتلفتني$/);
  assert.match(armor.context, /al-Baṭalyawsī did not include this poem/);
  assert.match(armor.context, /two occurrences of الكر have different vowel marks/);
  assert.ok(filterPoems(poems, { query: 'ولكن الحوادث أتلفتني' }).includes(armor));
  const poet = groupPoets(poems).find(group => group.id === 'abu-al-ala-al-maarri');
  assert.deepEqual(new Set(poet.poems.map(poem => poem.id)), new Set(selected.map(poem => poem.id)));
});
test('Taymur readings retain complete historical boundaries, variants and Arabic identity', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/taymur-1303-reviewed.json', import.meta.url), 'utf8'));
  assert.equal(manifest.poems.length, 7);
  assert.deepEqual(manifest.scanSha256, {
    'taymur-1303.pdf': '17a2fa7dd43c122cfd761515bd06e25f40638fe919924acf505db3e390ce9d8c',
    'taymur-other.pdf': '42f862d03fa44eaa9cf8ae1e45a34ddc4b00fe97ec3fd139b1cce6635d497fe4',
    'fawwaz-1895.pdf': 'de55f320fb4a2f6837d7d2131989a23b8e6bc09685d8c7b0ea013b66307d2f02',
  });
  const selected = manifest.poems.map(item => {
    const id = `taymur-1303-${item.slug}`;
    const poem = poems.find(entry => entry.id === id);
    assert.ok(poem, id);
    assert.equal(poem.author, 'Aisha Taymur');
    assert.equal(poem.authorId, 'aisha-taymur');
    assert.equal(poem.authorOriginal, 'عائشة التيمورية');
    assert.equal(poem.language, 'Arabic');
    assert.equal(poem.lang, 'ar');
    assert.equal(poem.direction, 'rtl');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(associatedPlaces(poem), ['Egypt']);
    assert.equal(poem.title, item.text.split('\n')[0]);
    assert.equal(poem.text, item.text);
    assert.equal(lineCount(poem), item.couplets * 2);
    assert.match(poem.source, new RegExp(`#page=${item.printedPages[0] + 4}$`));
    assert.match(poem.contextSource, new RegExp(`#page=${item.comparisonPrintedPages[0] + 40}$`));
    assert.ok(poem.context.includes(item.note));
    assert.match(poem.context, /boundaries in these printings, not in every tradition/);
    assert.match(poem.rights, /public domain in the United States/);
    assert.match(poem.rights, /CC BY-SA 4\.0/);
    assert.ok(poem.rights.includes(`curid=${item.wikiPageId}&oldid=${item.wikiRevision}`));
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Arabic', author: poem.author, query: poem.title }).includes(poem));
    assert.ok(filterPoems(poems, { language: 'Arabic', query: 'عائشة التيمورية' }).includes(poem));
    assert.ok(filterPoems(poems, { language: 'Arabic', query: 'Aisha Taymur' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\n')).digest('hex'), '2e3cad28dcaab1e302679372ee9648c2dbfb80237e0449c9989fa72c9fb65ea8');
  const bySlug = slug => selected.find(poem => poem.id === `taymur-1303-${slug}`);
  const elegy = bySlug('elegy-for-tawhida');
  assert.equal(lineCount(elegy), 100);
  assert.match(elegy.text, /ورجاء عفو أو تلاوة منزل\nفسواك من لي بالحنين يزور\nفلعلما أحظى برحمة خالق/);
  assert.match(elegy.text, /بنتاه يا كبدي ولوعة مهجتي/);
  assert.match(elegy.context, /internal response, not a separate work/);
  assert.ok(!selected.some(poem => poem.title.startsWith('بنتاه يا كبدي') || poem.title.startsWith('منشور حسنك')));
  assert.match(bySlug('birth-congratulation').text, /عن البشرى فأشرقت الليالي/);
  assert.match(bySlug('birth-congratulation').context, /عن البشرى كإشراق الليالي/);
  assert.match(bySlug('beloved-and-heart').text, /ورأيته متبسما/);
  assert.match(bySlug('beloved-and-heart').context, /وأتيته متبسما/);
  assert.equal(bySlug('beloved-and-reed').text.split('\n').length, 6);
  const poet = groupPoets(poems).find(group => group.id === 'aisha-taymur');
  assert.equal(poet.poems.length, 7);
  for (const poem of selected) assert.ok(poet.poems.some(entry => entry.id === poem.id));
});
test('Mutran magazine readings retain their boundaries, dates, variants and attribution', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/mutran-magazines-reviewed.json', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../scripts/sources/mutran-magazines-reviewed.txt', import.meta.url), 'utf8');
  const sections = source.split(/^=== ([a-z]+) ===\n/gm);
  assert.equal(sections.shift(), '');
  const readings = new Map();
  while (sections.length) readings.set(sections.shift(), sections.shift().trim().replaceAll(' | ', '\n'));
  const expected = [
    ['baalbek', 118, '71907e02005dd9157680f0d4dbd2144c5a5988bb0fcaf51c850c912492f42a19'],
    ['flowers', 44, '569744cf36aefe0bb1484bb3d36cee9235fe8ddf336103032b5ab9b4983e0f52'],
    ['musset', 16, 'fe2305bead40c636c28ae9a50c8e44f57ed53b837b7226414b43ef78cf86488d'],
    ['jasmine', 4, '3a10ba191880be1a2b073e2ca69decf9c7a3b3ee80ee095f8efccd58775e31f5'],
    ['blood', 4, '4af404533c7b92af77d38e9439cb00372d8665147f471471234719d4dc0dd4bf'],
    ['saba', 32, '568dfe3f6a6b09865be7e83631d30af25d664cada044a8f0d81f33b9e5564d66'],
    ['zurayq', 24, 'b818264add5ac2ae015ebc5bde5aa83f90439747d664184544bf09d4767ebe9d'],
    ['tears', 4, 'f7b161e0152e20ce47ab069dde336b0fd16cdeab572669dbab0085df642510d0'],
  ];
  assert.deepEqual(manifest.poems.map(item => item.slug), expected.map(([slug]) => slug));
  assert.equal(Object.keys(manifest.witnesses).length, 9);
  const selected = expected.map(([slug, lines, hash], index) => {
    const item = manifest.poems[index];
    const poem = poems.find(entry => entry.id === `mutran-magazines-${slug}`);
    assert.ok(poem, slug);
    assert.equal(poem.title, item.title);
    assert.equal(poem.author, 'Khalil Mutran');
    assert.equal(poem.authorOriginal, 'خليل مطران');
    assert.equal(poem.authorId, 'khalil-mutran');
    assert.equal(poem.authorYears, '1872–1949');
    assert.deepEqual(associatedPlaces(poem), ['Lebanon', 'Egypt']);
    assert.equal(poem.language, 'Arabic');
    assert.equal(poem.lang, 'ar');
    assert.equal(poem.direction, 'rtl');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.text, readings.get(slug));
    assert.equal(lineCount(poem), lines);
    assert.equal(lines, item.couplets * 2);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.match(poem.source, new RegExp(`#page=${item.pdfPages[0]}$`));
    assert.ok(poem.source.includes(`/download/${manifest.witnesses[item.sourceFile].archiveId}/`));
    if (item.comparisonFile) assert.match(poem.contextSource, new RegExp(`#page=${item.comparisonPdfPages[0]}$`));
    else assert.match(poem.contextSource, /catalogue\.bnf\.fr/);
    assert.ok(poem.context.includes(item.note));
    assert.match(poem.rights, /public domain in the United States/);
    for (const [page, revision] of item.wikiRevisions) {
      assert.match(poem.rights, /CC BY-SA 4\.0/);
      assert.ok(poem.rights.includes(`curid=${page}&oldid=${revision}`));
    }
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Arabic', query: poem.title }).includes(poem));
    assert.ok(filterPoems(poems, { language: 'Arabic', query: 'خليل مطران' }).includes(poem));
    assert.ok(filterPoems(poems, { country: 'Lebanon', query: 'Khalil Mutran' }).includes(poem));
    assert.ok(filterPoems(poems, { country: 'Egypt', author: poem.author }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  const bySlug = slug => selected.find(poem => poem.id === `mutran-magazines-${slug}`);
  assert.match(bySlug('baalbek').text, /وتحلت من الليال بشامات/);
  assert.match(bySlug('baalbek').context, /الليالي.*1949/);
  assert.match(bySlug('flowers').text, /تاج عهن/);
  assert.match(bySlug('flowers').context, /one poem.*تاج قطن/);
  assert.match(bySlug('musset').text, /دمع عينه/);
  assert.match(bySlug('musset').context, /1977.*same eight couplets.*دمع عينيه/);
  assert.match(bySlug('blood').text, /في شكل قلب/);
  assert.match(bySlug('saba').text, /ماد نسيم به فمات وفي\nمعطفه رقة من الميد/);
  assert.match(bySlug('saba').context, /16 couplets.*15-couplet.*ساهمتك.*شاركتك/);
  assert.ok(filterPoems(poems, { query: 'معطفه رقة من الميد' }).includes(bySlug('saba')));
  assert.match(bySlug('zurayq').context, /separates this elegy/);
  assert.match(bySlug('tears').context, /after a rule/);
  const poet = groupPoets(poems).find(group => group.id === 'khalil-mutran');
  assert.equal(poet.poems.length, 8);
  for (const poem of selected) assert.ok(poet.poems.some(entry => entry.id === poem.id));
});
test('Shawqi aviation poem retains its complete school-edition reading and provenance', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/shawqi-schools-1927.json', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../scripts/sources/shawqi-schools-1927.txt', import.meta.url), 'utf8');
  const poem = poems.find(entry => entry.id === 'shawqi-schools-aviation');
  assert.ok(poem);
  assert.equal(poems.filter(entry => entry.authorId === 'ahmad-shawqi').length, 3);
  assert.equal(poem.title, 'آية العصر في سماء مصر');
  assert.equal(poem.author, 'Ahmad Shawqi');
  assert.equal(poem.authorOriginal, 'أحمد شوقي');
  assert.equal(poem.authorYears, '1868–1932');
  assert.deepEqual(associatedPlaces(poem), ['Egypt']);
  assert.equal(poem.language, 'Arabic');
  assert.equal(poem.lang, 'ar');
  assert.equal(poem.direction, 'rtl');
  assert.equal(poem.year, null);
  assert.equal(poem.creationPlace, undefined);
  assert.match(poem.yearLabel, /Published 1927.*composition date not independently established/);
  assert.deepEqual(manifest.poem.coupletsBySection, [23, 18, 17]);
  assert.deepEqual(manifest.poem.printedPages, [8, 9, 10, 11, 12]);
  assert.deepEqual(manifest.poem.pdfPages, [6, 7, 8]);
  assert.deepEqual(manifest.poem.comparisonPrintedPages, [3, 4, 5, 6]);
  assert.deepEqual(manifest.poem.comparisonPdfPages, [5, 6, 7, 8]);
  assert.deepEqual(Object.fromEntries(Object.entries(manifest.witnesses).map(([name, item]) => [name, item.sha256])), {
    'schools-unknown.pdf': 'd380285b00cbf4512d51f55563bd41187c8ce343990d4b6be882eecc69c98280',
    'correct-137947.pdf': 'c921bb983458ad90eac5cc925132b6ebd31b63c86c64828f6aa4f3e1994e8196',
  });
  assert.ok(source.startsWith('=== aviation ===\n'));
  assert.equal(poem.text, source.slice('=== aviation ===\n'.length).trim().replaceAll(' | ', '\n'));
  assert.deepEqual(poem.text.split('\n\n').map(section => section.split('\n').length), [46, 36, 34]);
  assert.equal(lineCount(poem), 116);
  assert.equal(createHash('sha256').update(poem.text).digest('hex'), '0ad28d53ef550b83d930c55c6a502753f4dd944bd9dd5c216b7576cf3a4113a9');
  assert.equal(manifest.poem.textSha256, createHash('sha256').update(poem.text).digest('hex'));
  assert.match(poem.text, /^يا فرنسا نلت أسباب السماء\nوتملكت مقاليد الجواء/);
  assert.match(poem.text, /بسلاء الأنس والجن فدى\nلفريق من بنيك البسلاء\nضاقت الأرض بهم فاتخذوا\nفي السموات قبور الشهداء/);
  assert.match(poem.text, /جرح الأهرام في عزتها\nفمشى للقبر مجروح الإباء/);
  assert.match(poem.text, /عزها في عهد خوفو وميناء\nأمة للخلد ما تبني إذا\nما بنى الناس جميعا للعفاء\nتعصم الأجسام من عادي البلا/);
  assert.match(poem.text, /لا تقولوا حطنا الدهر فما\nهو إلا من خيال الشعراء/);
  assert.match(poem.text, /واحكموا الدنيا بسلطان فما\nخلقت نضرتها للضعفاء/);
  assert.match(poem.text, /واطلبوا المجد على الأرض فإن\nهي ضاقت فاطلبوه في السماء$/);
  assert.match(poem.source, /\/1525pdf_201912\/.*#page=6$/);
  assert.match(poem.contextSource, /\/AAlexandrina-137947\/.*#page=5$/);
  assert.match(poem.context, /1914.*not independent proof.*composition date/);
  assert.match(poem.context, /completeness in these printings, not all traditions or independent textual descent/);
  assert.match(poem.context, /الأنس.*الإِ?نس/);
  assert.match(poem.context, /حطنا الدهر.*حظنا الدهر.*school reading is retained/);
  assert.match(poem.context, /في يمين الله.*في عين الله.*scan has not been verified.*unresolved/);
  assert.match(poem.rights, /public domain in the United States.*comparison, not reproduced/);
  assert.deepEqual(poem.themes, []);
  assert.deepEqual(poem.translations, []);
  for (const query of ['أحمد شوقي', 'Ahmad Shawqi', 'آية العصر في سماء مصر', 'ما بنى الناس جميعا للعفاء']) {
    assert.ok(filterPoems(poems, { language: 'Arabic', country: 'Egypt', query }).includes(poem), query);
  }
  assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  assert.ok(groupPoets(poems).find(group => group.id === 'ahmad-shawqi').poems.some(entry => entry.id === poem.id));
});
test('additional Shawqi poems retain complete 1927 school readings and comparison evidence', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/shawqi-schools-more-1927.json', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../scripts/sources/shawqi-schools-more-1927.txt', import.meta.url), 'utf8');
  const parts = source.split(/^=== ([a-z]+) ===\n/gm);
  assert.equal(parts.shift(), '');
  const readings = new Map();
  while (parts.length) readings.set(parts.shift(), parts.shift().trim().replaceAll(' | ', '\n'));
  const expected = [
    ['bank', 34, [17], '9c55bd0d0b469b31215b9ee9631b441f5db5013035fc0f55aa08e03709bd596f'],
    ['exile', 120, [9, 8, 8, 7, 28], 'f7d83794cddda1838d52bb01eda2deca4fc7e939b974e828654bbec8fa1fe087'],
  ];
  assert.deepEqual(manifest.poems.map(item => item.slug), expected.map(([slug]) => slug));
  for (const [slug, count, sections, hash] of expected) {
    const item = manifest.poems.find(entry => entry.slug === slug);
    const poem = poems.find(entry => entry.id === `shawqi-schools-${slug}`);
    assert.ok(poem, slug);
    assert.equal(poem.title, item.title);
    assert.equal(poem.author, 'Ahmad Shawqi');
    assert.equal(poem.authorOriginal, 'أحمد شوقي');
    assert.equal(poem.authorYears, '1868–1932');
    assert.deepEqual(associatedPlaces(poem), ['Egypt']);
    assert.equal(poem.language, 'Arabic');
    assert.equal(poem.lang, 'ar');
    assert.equal(poem.direction, 'rtl');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.match(poem.yearLabel, /Published 1927.*composition date not independently established/);
    assert.deepEqual(item.coupletsBySection, sections);
    assert.deepEqual(poem.text.split('\n\n').map(section => section.split('\n').length), sections.map(n => n * 2));
    assert.equal(poem.text, readings.get(slug));
    assert.equal(lineCount(poem), count);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(item.textSha256, hash);
    assert.match(poem.source, new RegExp(`/1525pdf_201912/.*#page=${item.pdfPages[0]}$`));
    assert.match(poem.contextSource, new RegExp(`/AAlexandrina-101217/.*#page=${item.comparisonPdfPages[0]}$`));
    assert.match(poem.context, /completeness in these printings, not in every tradition or independent manuscript descent/);
    assert.match(poem.context, /not a fully vocalized diplomatic edition/);
    assert.match(poem.rights, /public domain in the United States.*comparison, not reproduced/);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Arabic', country: 'Egypt', query: 'أحمد شوقي' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    assert.ok(groupPoets(poems).find(group => group.id === 'ahmad-shawqi').poems.some(entry => entry.id === poem.id));
  }
  const bank = poems.find(poem => poem.id === 'shawqi-schools-bank');
  const exile = poems.find(poem => poem.id === 'shawqi-schools-exile');
  assert.match(bank.text, /^قف بالممالك وانظر دولة المال\nواذكر رجالا أدالوها بإجمال/);
  assert.match(bank.text, /هذا هو الحجر الدري بينكمو/);
  assert.match(bank.text, /فابنوا على بركات الله واغتنموا\nما هيأ الله من حظ وإقبال$/);
  assert.ok(filterPoems(poems, { query: 'بالعلم والمال يبني الناس ملكهم' }).includes(bank));
  assert.match(exile.text, /^أنادي الرسم لو ملك الجوابا\nوأجزيه بدمعي لو أثابا/);
  assert.match(exile.text, /نثرت الدمع في الدمن البوالي/);
  assert.doesNotMatch(exile.text, /فنثري الدمع/);
  assert.match(exile.context, /نثرت الدمع.*فنثري الدمع/);
  assert.match(exile.text, /ويا وطني لقيتك بعد يأس\nكأني قد لقيت بك الشبابا/);
  assert.match(exile.text, /ولولا البر لم يبعث رسول\nولم يحمل إلى قوم كتابا$/);
  assert.ok(filterPoems(poems, { query: 'ويا وطني لقيتك بعد يأس' }).includes(exile));
});
test('Sabri magazine originals retain their complete printings, variants and provenance', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/sabri-magazines-reviewed.json', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../scripts/sources/sabri-magazines-reviewed.txt', import.meta.url), 'utf8');
  const sections = source.split(/^=== ([a-z]+) ===\n/gm);
  assert.equal(sections.shift(), '');
  const readings = new Map();
  while (sections.length) readings.set(sections.shift(), sections.shift().trim().replaceAll(' | ', '\n'));
  const expected = [
    ['tear', 24, 'ecbf9127cea7b7834af0d7aff5fa1a95cbec3d01435ea8773bc67d250ecaf675'],
    ['saba', 18, '0b258b49b18c1dcbd2dd0553ee942e93837e9906f7eeb01f7f6308d26f297ed4'],
    ['thaman', 10, 'f50e6b7604361f36e803b77dd8053cf5d4471ed25f0ce89d255fabf8229e3f6d'],
    ['opposition', 28, 'eadf293a9de51db64de10f0f5607b54f6bf958e94c8676bf2d0f8494fbd67ac5'],
    ['friend', 38, '96e85464c4322c54186a2fbf2b08a8e52d41c545337c81159e5d7c3e230123df'],
    ['tusun', 30, 'fe3361ba7d5f88d5c16be681da7e60a69740b3feb51929e4a6d4fbf5dcdea46e'],
  ];
  assert.deepEqual(manifest.poems.map(item => item.slug), expected.map(([slug]) => slug));
  assert.deepEqual(Object.fromEntries(Object.entries(manifest.witnesses).map(([name, item]) => [name, item.sha256])), {
    'zouhour-1910.pdf': '71cf0a2ee277c5c63be8472e1bdea892e107802517d7446e4006de7ab46811aa',
    'zouhour-1911.pdf': '0c8cd4f16ab9db5b4b756efc2dc73e264cf863a7ee8d0fdd2c5bdbd8a8d70979',
    'zouhour-1913.pdf': '82a41ee469834f30ff5973a6d62048c6124126c921dd269d81009c91cffcc95b',
    'sabri-1357.pdf': '01dd164683cc34fd5736cb92b1c14dbfffe059637c226a31ae705079bca790ba',
  });
  const selected = expected.map(([slug, lines, hash], index) => {
    const item = manifest.poems[index];
    const poem = poems.find(entry => entry.id === `sabri-magazines-${slug}`);
    assert.ok(poem, slug);
    assert.equal(poem.title, item.title);
    assert.equal(poem.author, 'Ismail Sabri');
    assert.equal(poem.authorOriginal, 'إسماعيل صبري');
    assert.equal(poem.authorId, 'ismail-sabri');
    assert.equal(poem.authorYears, '1854–1923');
    assert.deepEqual(associatedPlaces(poem), ['Egypt']);
    assert.equal(poem.language, 'Arabic');
    assert.equal(poem.lang, 'ar');
    assert.equal(poem.direction, 'rtl');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.text, readings.get(slug));
    assert.equal(lineCount(poem), lines);
    assert.equal(lines, item.couplets * 2);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.ok(poem.source.includes(`/download/${manifest.witnesses[item.sourceFile].archiveId}/`));
    assert.match(poem.source, new RegExp(`#page=${item.pdfPages[0]}$`));
    assert.match(poem.contextSource, new RegExp(`#page=${item.comparisonPdfPages[0]}$`));
    assert.ok(poem.context.includes(item.note));
    assert.match(poem.rights, /public domain in the United States/);
    assert.match(poem.rights, /1938 edition is linked for comparison, not reproduced/);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Arabic', query: poem.title }).includes(poem));
    assert.ok(filterPoems(poems, { language: 'Arabic', query: 'إسماعيل صبري' }).includes(poem));
    assert.ok(filterPoems(poems, { country: 'Egypt', author: poem.author }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    return poem;
  });
  const bySlug = slug => selected.find(poem => poem.id === `sabri-magazines-${slug}`);
  assert.match(bySlug('tear').text, /ويحفظ العهد كما شاءه\nأحمد سمحا واسع المشرع/);
  assert.match(bySlug('tear').context, /ويأخذ البر وآي الوفا.*ويحفظ العهد كما شاءه/);
  assert.match(bySlug('saba').context, /distinct poem from Khalil Mutran/);
  assert.notEqual(bySlug('saba').text, poems.find(poem => poem.id === 'mutran-magazines-saba').text);
  assert.match(bySlug('thaman').text, /من لؤلؤ بالنهى/);
  assert.match(bySlug('thaman').context, /عن لؤلؤ.*في أوجه.*من لؤلؤ.*في أفقه/);
  assert.match(bySlug('opposition').context, /not a translation/);
  assert.match(bySlug('friend').text, /برغمي أن تقاص منك ظل/);
  assert.match(bySlug('friend').context, /تقاص منك ظل.*تقلص منك ظل/);
  assert.match(bySlug('tusun').context, /prose reply, which is not part of the poem/);
  assert.ok(filterPoems(poems, { query: 'تقاص منك ظل' }).includes(bySlug('friend')));
  assert.equal(poems.filter(poem => poem.authorId === 'ismail-sabri').length, 6);
  const poet = groupPoets(poems).find(group => group.id === 'ismail-sabri');
  for (const poem of selected) assert.ok(poet.poems.some(entry => entry.id === poem.id));
});
test('Francis and Jacopone originals retain reviewed editions and separate witnesses', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/francis-jacopone-reviewed.json', import.meta.url), 'utf8'));
  const francis = poems.find(p => p.id === 'francis-laudes-creaturarum');
  assert.ok(francis);
  const selected = [francis, ...manifest.jacopone.map(item => {
    const poem = poems.find(p => p.id === `jacopone-ferri-${String(item.number).padStart(2, '0')}`);
    assert.ok(poem, item.roman);
    assert.equal(poem.authorId, 'jacopone-da-todi');
    assert.equal(poem.authorOriginal, 'Iacopone da Todi');
    assert.equal(poem.source, item.source);
    assert.equal(lineCount(poem), item.stanzas.reduce((sum, size) => sum + size, 0));
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), item.textSha256);
    assert.ok(poem.context.includes(item.note));
    assert.match(poem.context, /same edition, not independent historical editions/);
    return poem;
  })];
  assert.equal(selected.length, 6);
  assert.equal(francis.authorId, 'francis-of-assisi');
  assert.equal(francis.authorOriginal, 'Francesco d’Assisi');
  assert.equal(francis.source, manifest.francis.source);
  assert.equal(francis.contextSource, manifest.francis.comparison);
  assert.equal(lineCount(francis), 33);
  assert.equal(createHash('sha256').update(francis.text).digest('hex'), manifest.francis.textSha256);
  assert.match(francis.text, /^Altissimu onnipotente bon signore,\nTue so le laude/);
  assert.match(francis.text, /La quale è molto utile e humele e pretiosa e casta\./);
  assert.match(francis.text, /Et serviateli cum grande humilitate\. Amen\.$/);
  assert.match(francis.context, /1910.*Codex 338 transcription is a separate comparison/);
  assert.match(francis.context, /lu jorno allumeni per nui.*è iorno et allumini noi per loi/);
  const passion = selected.find(p => p.id === 'jacopone-ferri-93');
  assert.match(passion.text, /figlio, hatte la gente — malamente trattato!/);
  assert.doesNotMatch(passion.text, /figlio, batte la gente/);
  assert.equal(passion.displayTitle, 'Donna del paradiso');
  assert.ok(filterPoems(poems, { query: 'Iacopone' }).includes(passion));
  assert.ok(filterPoems(poems, { query: 'Donna del paradiso' }).includes(passion));
  for (const poem of selected) {
    assert.equal(poem.language, 'Italian');
    assert.equal(poem.lang, 'it');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(associatedPlaces(poem), ['Italy']);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*CC BY-SA 4\.0.*check local law/);
    assert.ok(filterPoems(poems, { language: 'Italian', country: 'Italy', author: poem.author, query: poem.title }).includes(poem));
    assert.match(renderPoem(poem, poems, '/ai-poems/'), /<dt>Created in<\/dt><dd>Not established<\/dd>/);
  }
  assert.deepEqual(francis.themes, ['Faith', 'Nature']);
  assert.deepEqual(passion.themes, ['Faith']);
  for (const poem of selected.filter(p => p.authorId === 'jacopone-da-todi' && p.id !== passion.id)) assert.deepEqual(poem.themes, []);
  for (const [id, count] of [['francis-of-assisi', 1], ['jacopone-da-todi', 5]]) {
    const poet = groupPoets(poems).find(p => p.id === id);
    assert.equal(poet.poems.length, count);
    for (const poem of selected.filter(p => p.authorId === id)) assert.ok(poet.poems.some(p => p.id === poem.id));
  }
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
  const issa = poems.filter(p => p.id.startsWith('issa-1902-')).length;
  const chiyo = poems.filter(p => p.id.startsWith('chiyo-ni-1927-')).length;
  assert.equal(filterPoems(poems, { language: 'Japanese', country: 'Japan' }).length, 5 + laterBasho + laterBuson + issa + chiyo);
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
