import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCatalog } from '../scripts/catalog-data.mjs';
import { chamberlainTranslations } from '../content/chamberlain-translations.mjs';
import { curated } from '../content/curated.mjs';
import { quietNightTranslations } from '../content/quiet-night-translations.mjs';
import { obataLiBaiTranslations } from '../content/obata-li-bai-translations.mjs';
import { renderFeed } from '../scripts/feed.mjs';
import { groupPoets } from '../scripts/poets.mjs';
import { relatedPoems } from '../scripts/recommendations.mjs';
import { renderHome, renderPoem, renderPoet } from '../scripts/templates.mjs';
import { associatedPlaces, collectionLabel, contextualCounts, countedFilters, discoveryOrder, escapeHtml, filterPoems, lineCount, normalize, normalizeFinnish, normalizeGalician, placeCounts, poemCard, readingLanguages, recordedYearRanges, surprisePoem, titleAttributes, yearRangeCounts } from '../src/catalog.mjs';

const poems = await loadCatalog();
test('Russian first printings preserve four distinct complete source-specific lyrics', () => {
  const ids = ['fet-greeting', 'fet-whisper', 'tyutchev-russia', 'pushkin-siberia']
    .map(key => `russian-first-${key}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('russian-first-')).length, 4);
  assert.deepEqual(selected.map(lineCount), [16, 12, 4, 16]);
  assert.ok(selected.every(poem => !poem.text.includes('\n\n')));
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    'c20d80904a7f296ccb06b9b6baee433a42aabd11d276ea60c8ec35dcfb04911c',
    '1645685acbba4224d3124cef060dca2dd4e12b63b04484a19e14b0e7e2400111',
    '6a6fd406c4c200eb40155f9ba08d465f5e3c28c1852d0f473ef32807c24fbc52',
    'fca0117154b0959e636b038addc823362b32ea4b04a69570a47d8ff6c1930b59',
  ]);
  const [greeting, whisper, russia, siberia] = selected;
  assert.match(greeting.text, /Весь проснулся веткой каждой,[\s\S]*Что душа всё также счастью/);
  assert.match(greeting.context, /1843.*16 printed lines.*no stanza breaks.*также.*проснулся/s);
  assert.match(whisper.text, /^Шёпот сердца, уст дыханье,[\s\S]*Бледный блеск и пурпур розы,\nРечь не говоря,/);
  assert.match(whisper.context, /1850.*1856.*Шёпот, робкое дыханье.*one work.*authorship.*not established/s);
  assert.match(russia.text, /^Умом Россию не понять,\nАршином общим не измерить;\nУ ней особенная стать —\nВ Россию можно только верить\.$/);
  assert.match(russia.context, /printed date is not a verse line.*semicolon.*other witnesses differ/s);
  assert.doesNotMatch(russia.text, /1866|ноября/);
  assert.match(siberia.text, /Надежда в мрачном подземельи,\nРазбудит бодрость и веселье\.\nПридёт желанная пора\nЛюбовь/);
  assert.match(siberia.context, /footnote.*not part of the poem.*No autograph survives.*1903.*Пробудит/s);
  assert.doesNotMatch(siberia.text, /1827|Пробудит|Стихи эти были присланы/);
  assert.deepEqual(selected.map(poem => poem.authorId), ['afanasy-fet', 'afanasy-fet', 'fyodor-tyutchev', 'alexander-pushkin']);
  const queries = [
    ['Я пришел к тебе с приветом', 'Рассказать, что солнце встало', 'Афанасий Шеншин'],
    ['Шёпот, робкое дыханье', 'Шепот робкое дыханье', 'Трели соловья'],
    ['Умом Россию не понять', 'Аршином общим не измерить', 'Федор Тютчев'],
    ['Во глубине сибирских руд', 'Послание в Сибирь', 'Александр Пушкин'],
  ];
  const fold = text => String(text || '').normalize('NFKD').toLowerCase()
    .replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.language, 'Russian');
    assert.equal(poem.lang, 'ru');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law.*no translation, score or recording/s);
    for (const query of [poem.title, ...queries[index]]) {
      assert.ok(filterPoems([poem], { language: 'Russian', query }).includes(poem), query);
    }
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="ru" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
    // Normalized originals and attached translations cannot catch every paraphrase or translation.
    const full = fold(poem.text);
    const opening = fold(poem.text.split('\n').slice(0, 2).join(''));
    for (const other of poems.filter(item => item.id !== poem.id)) {
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), other.id);
        assert.ok(!candidate.includes(opening), other.id);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-russian-first-printings.py', '--check'], { encoding: 'utf8' }), /Verified 4 historical readings/);
});

test('Housman poems preserve seven complete Riccardi readings and their boundaries', () => {
  const keys = ['loveliest', 'one-and-twenty', 'athlete', 'bredon-hill', 'wenlock', 'blue-hills', 'rue'];
  const ids = keys.map(key => `recognized-housman-1914-${key}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-housman-1914-')).length, 7);
  assert.deepEqual(selected.map(lineCount), [12, 16, 28, 35, 20, 8, 8]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    [4, 4, 4], [8, 8], [4, 4, 4, 4, 4, 4, 4], [5, 5, 5, 5, 5, 5, 5], [4, 4, 4, 4, 4], [4, 4], [4, 4],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    'e0232c5a1e61fc38e9a7f39af37530b1818219d232d9792b0617990b92324252',
    '0ee852c67b320a077257667b6044a6675f96dc6337b7b7af96bf743fcd956898',
    '0612e483a607e35c867c60a7f200e4f6d370f75d2de8dcd7e56cab0075923c00',
    '869a4743a14bdd7e8c66b9d27472713ad9aed7f2317b596c36e5690af2c38a38',
    '23016d625717329fc90a7b01d6a8933cc41553dd65eec69aa06876172c0fe7b6',
    '645241c98ebb94b59da49cd179a46a63b982a9a93eb45db37717d9f0edfac952',
    '6223041d11f8f5db7d4c7d9bce86ff0db5420739d80bbf14378feb494033d445',
  ]);
  assert.match(selected[2].text, /before its echoes fade,[\s\S]*strengthless dead\nAnd find/);
  assert.match(selected[2].context, /its echoes.*no comma.*the echoes/s);
  assert.match(selected[3].context, /pronounced 'Breedon'.*footnote is not a verse line/s);
  assert.doesNotMatch(selected[3].text, /Pronounced Breedon/);
  assert.match(selected[1].context, /two eight-line stanzas.*three stanzas/s);
  assert.match(selected[4].text, /^On Wenlock Edge the wood’s in trouble;[\s\S]*Are ashes under Uricon\.$/);
  assert.match(selected[5].text, /land of lost content,\nI see it shining plain/);
  const pages = [18, 27, 30, 31, 39, 45, 58];
  const fold = text => String(text || '').normalize('NFKD').toLowerCase()
    .replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.authorId, 'a-e-housman');
    assert.equal(poem.language, 'English');
    assert.equal(poem.lang, 'en');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.yearLabel, /1914 printing.*1896/);
    assert.match(poem.rights, /public domain in the United States.*check local law.*no translation, score or recording/s);
    assert.ok(poem.source.endsWith(`#page=${pages[index]}`));
    for (const query of [poem.title, ...poem.searchAliases, 'Alfred Edward Housman']) {
      assert.ok(filterPoems([poem], { language: 'English', query }).includes(poem), query);
    }
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="en" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
    // Same-titled works may be distinct; text screens cannot exclude every translation or paraphrase.
    const full = fold(poem.text);
    const opening = fold(poem.text.split('\n').filter(Boolean).slice(0, 2).join(''));
    for (const other of poems.filter(item => item.id !== poem.id)) {
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), other.id);
        assert.ok(!candidate.includes(opening), other.id);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-housman-riccardi-1914.py', '--check'], { encoding: 'utf8' }), /Verified 7 historical readings/);
});

test('Ady’s Őrizem a szemed preserves its complete corroborated reading', () => {
  const id = 'recognized-ady-1918-orizem';
  const selected = poems.filter(poem => poem.id === id);
  assert.equal(selected.length, 1);
  const [poem] = selected;
  assert.equal(lineCount(poem), 16);
  assert.deepEqual(poem.text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4, 4, 4]);
  assert.equal(poem.text.split('\n\n')[0], poem.text.split('\n\n')[2]);
  assert.equal(createHash('sha256').update(poem.text).digest('hex'), '22e453eb3b45f87d0243e0359c143ff568240a24711fb7cca3b9a0ac99d92eb4');
  assert.match(poem.text, /^Már vénülő kezemmel[\s\S]*S őrizem a szemedet\.$/);
  assert.equal(poem.authorId, 'endre-ady');
  assert.equal(poem.language, 'Hungarian');
  assert.equal(poem.lang, 'hu');
  assert.equal(poem.creationPlace, undefined);
  assert.deepEqual(poem.themes, []);
  assert.deepEqual(poem.translations, []);
  assert.match(poem.sourceTitle, /p\. 193 \/ PDF p\. 199/);
  assert.match(poem.context, /1916 Nyugat.*agrees.*not a facsimile.*Hatvany.*brother Lajos Ady/s);
  assert.match(poem.rights, /public domain in the United States.*Hatvany.*check local law/s);
  for (const query of ['Őrizem a szemed', 'Orizem a szemed', 'Már vénülő kezemmel', 'Ady Endre']) {
    assert.ok(filterPoems([poem], { language: 'Hungarian', query }).includes(poem), query);
  }
  const html = renderPoem(poem, poems, '/ai-poems/');
  assert.ok(html.includes(`class="verse" lang="hu" dir="ltr">${escapeHtml(poem.text)}`));
  assert.ok(html.includes(escapeHtml(poem.source)));
  assert.ok(html.includes(escapeHtml(poem.contextSource)));
  // Exact-title and reading screens cannot exclude every historical translation or paraphrase.
  const fold = text => String(text || '').normalize('NFKD').toLowerCase()
    .replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  const full = fold(poem.text);
  const opening = fold(poem.text.split('\n').filter(Boolean).slice(0, 2).join(''));
  for (const other of poems.filter(item => item.id !== id)) {
    assert.notEqual(fold(other.title), fold(poem.title), other.id);
    for (const text of [other.text, ...other.translations.map(item => item.text)]) {
      const candidate = fold(text);
      if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), other.id);
      assert.ok(!candidate.includes(opening), other.id);
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-ady-orizem.py', '--check'], { encoding: 'utf8' }), /Verified one historical reading/);
});

test('historical elegies retain distinct complete source-specific readings', () => {
  const ids = ['egidius', 'vondel-kinder-lijck', 'quevedo-amor-constante']
    .map(key => `recognized-elegies-${key}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-elegies-')).length, 3);
  assert.deepEqual(selected.map(lineCount), [19, 16, 14]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(block => block.split('\n').length)), [
    [5, 3, 3, 5, 3], [16], [14],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '2ec77b34c230317df4b45709eeda2f378b396266bbf6ebcc35606deda4055901',
    '3d0a3c9bd559be7a71500da4e4c8dfcfe1ce87af9a89e4997710d56b4f6677ae',
    'db9045149cd54ed8e6407fee2f79f4177feffd9f5c45c338c7ffcd65e0154cfa',
  ]);
  const [egidius, vondel, quevedo] = selected;
  assert.equal(egidius.anonymous, true);
  assert.match(egidius.text, /^Egidius, waer bestu bleven\?[\s\S]*Du coors de doot, du liets mi tleven\.[\s\S]*Du coors die doot, du liets mi tleven\.$/);
  assert.match(egidius.context, /1849.*19 lines.*de doot.*die doot.*abbreviates.*21 lines.*Authorship.*disputed/s);
  assert.match(vondel.text, /^Konstantijntje, ’t saligh kijntje,[\s\S]*boven sweef ick,[\s\S]*Na palleysen, uyt het slick[\s\S]*Eeuwigh gaet voor oogenblick\.$/);
  assert.ok(vondel.text.split('\n').every((line, index) => index % 2 === 0 ? !line.startsWith(' ') : line.startsWith('  ')));
  assert.match(vondel.context, /1857.*16 lines.*Konstantijntje.*1644.*Constantijntje.*1632.*1633.*indentation/s);
  assert.match(quevedo.text, /^Cerrar podrà mis ojos la postrera[\s\S]*Mas no se de essotra parte en la rivera[\s\S]*Su cuerpo dejaràn, no su cuidado\nSeran ceniça, mas tendrà sentido;\nPolvo seràn, mas polvo enamorado\.$/);
  assert.match(quevedo.context, /1650.*14-line.*extra 'se'.*1648.*plural.*ceniça.*modern editions/s);
  assert.equal(quevedo.authorId, 'francisco-de-quevedo');
  const queries = [
    ['Egidiuslied', 'Egidius waer bestu bleven', 'Gruuthuse II 98'],
    ['Kinder-lyck', 'Constantijntje', 'Joost van den Vondel'],
    ['Amor constante mas alla de la muerte', 'Cerrar podrá mis ojos la postrera', 'Francisco de Quevedo'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.lang, index === 2 ? 'es' : 'nl');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: poem.language, query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="${poem.lang}" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Exact readings and openings cannot exclude every historical translation or paraphrase.
  const fold = text => String(text || '').normalize('NFKD').toLowerCase()
    .replace(/\p{M}/gu, '').replace(/[\u017f]/gu, 's').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const opening = fold(added.text.split('\n').filter(Boolean).slice(0, 2).join(''));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-elegies.py', '--check'], { encoding: 'utf8' }), /Verified 3 historical readings/);
});

test('Dutch lyrics retain complete source-specific readings and distinct works', () => {
  const ids = ['hooft-grysaert', 'gezelle-ruischen', 'gezelle-dien-avond']
    .map(key => `recognized-dutch-lyrics-${key}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-dutch-lyrics-')).length, 3);
  assert.deepEqual(selected.map(lineCount), [14, 48, 32]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(block => block.split('\n').length)), [
    [14], [8, 8, 8, 8, 8, 8], [32],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '72d547a9a3d787d745b6c9ca4830f517653204060ea3556c733fd271ec540c70',
    '0c9d4c1dc7769806ac4daf0ed821e4baa4c5156f544cad81ddcdbe27fa5ddef9',
    'd6c29362b59fa7ab86508e1a21727501246a784c0a8bb77115a5bbf2c6360566',
  ]);
  const [hooft, riet, avond] = selected;
  assert.match(hooft.text, /^Ghesvvinde Grysaert,[\s\S]*en tob de langhe daghen[\s\S]*Dat ick de Tijt die ick vercorten vvil, verlangh\.$/);
  assert.match(hooft.context, /1611.*Sonnet.*opening.*vv spellings.*1610.*line 10/s);
  assert.match(riet.text, /^O! ’t ruischen van het ranke riet![\s\S]*’t windtje kwam,[\s\S]*eenen rieten staal,[\s\S]*klagend riet!$/);
  assert.doesNotMatch(riet.text, /Homer|δονακ/);
  assert.match(riet.context, /Homeric motto.*not part.*1903.*undated.*1858.*windtje.*rieten staal/s);
  assert.match(avond.text, /^’k Heb menig menig uur bij u\n  gesleten en genoten,[\s\S]*\n  dien avond — en — die rooze!$/);
  assert.ok(avond.text.split('\n').every((line, index) => index % 2 === 0 ? !line.startsWith(' ') : line.startsWith('  ')));
  assert.match(avond.context, /Aan den voorgaande.*first printed in 1863.*1862.*1879.*menig menig.*indentation/s);
  const queries = [
    ['Gezwinde grijsaard', 'Geswinde grijsart', 'Pieter Corneliszoon Hooft'],
    ["O 't ruisen van het ranke riet", 'De Bedroefde', 'Guido Gezelle'],
    ['Dien avond en die roze', 'menig menig uur bij u', 'Guido Gezelle'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.language, 'Dutch');
    assert.equal(poem.lang, 'nl');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'Dutch', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="nl" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // This screen cannot exclude every historical variant, translation or paraphrase.
  const fold = text => String(text || '').normalize('NFKD').toLowerCase()
    .replace(/\p{M}/gu, '').replace(/vv/gu, 'w').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const opening = fold(added.text.split('\n').filter(Boolean).slice(0, 2).join(''));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-dutch-lyrics.py', '--check'], { encoding: 'utf8' }), /Verified 3 historical readings/);
});

test('German women poets retain complete source-specific readings and distinct works', () => {
  const ids = ['brun-chamounix', 'guenderrode-die-eine-klage'].map(key => `recognized-german-women-${key}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-german-women-')).length, 2);
  assert.deepEqual(selected.map(lineCount), [20, 24]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(block => block.split('\n').length)), [
    [4, 4, 4, 4, 4], [6, 6, 6, 6],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '251ff6d696e74847e31dce19124b89b7e63bd2245276127671e64ff99c53cea9',
    '2fb148494831c2cb823f58cbaa125f4f701cf4ac78304d71d4e447cf362ff6b9',
  ]);
  const [brun, klage] = selected;
  assert.match(brun.text, /^Aus tiefem Schatten des schweigenden Tannenhains[\s\S]*Wer goß Euch hoch aus des ewigen Winters Reich,[\s\S]*Lavinendonner rollen’s die Kluft hinab:[\s\S]*Flüstert’s an rieselnden Silberbächen\.$/);
  assert.doesNotMatch(brun.text, /Metastasio|Gentiana|La Terra/);
  assert.match(brun.context, /Metastasio motto and three prose notes.*'Euch'.*colon.*26 lines.*20.*recast/s);
  assert.match(klage.text, /^Wer die tiefste aller Wunden[\s\S]*Wer geliebt was er verlohren,[\s\S]*Lassen muß was er erkohren,[\s\S]*Giebt kein Gott zurück\.$/);
  assert.match(klage.context, /Ägypten.*1906.*suppressed.*larger contents.*incomplete.*four complete stanzas.*cycle/s);
  assert.deepEqual(associatedPlaces(brun), ['Denmark', 'Germany']);
  assert.deepEqual(associatedPlaces(klage), ['Germany']);
  const queries = [
    ['Chamounix beym Sonnenaufgange', 'Chamonix', 'Frederikke Brun', 'Scheitel der Ewigkeit'],
    ['Die eine Klage', 'Karoline von Guenderrode', 'Wer die tiefste aller Wunden', 'Gränzen'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.language, 'German');
    assert.equal(poem.lang, 'de');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'German', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="de" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Exact readings and openings cannot exclude every translation or paraphrase.
  const fold = text => String(text || '').normalize('NFKD').toLowerCase()
    .replace(/\p{M}/gu, '').replace(/ß/gu, 'ss').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const opening = fold(added.text.split('\n').filter(Boolean).slice(0, 2).join(''));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-german-women.py', '--check'], { encoding: 'utf8' }), /Verified 2 historical readings/);
});

test('Czech classics retain three complete, distinct historical readings', () => {
  const ids = ['vrchlicky-za-trochu-lasky', 'sladek-lesni-studanka', 'nemcova-zenam-ceskym']
    .map(key => `recognized-czech-classics-${key}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-czech-classics-')).length, 3);
  assert.ok(readingLanguages.includes('Czech'));
  assert.deepEqual(selected.map(lineCount), [7, 12, 32]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(block => block.split('\n').length)), [
    [7], [4, 4, 4], Array(8).fill(4),
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    'd7acd169da09087487685b83eb335a8ec0c720efc608b9dc38f07336c2334f26',
    '97c2abe913c4029b13f5127bd91bba4941c315e177dcf333777fc7029d016f16',
    'f68fba193a806386e1a6d51cb1becf828d7821fbb3213efa05304758ea3dd7ff',
  ]);
  const [love, spring, women] = selected;
  assert.match(love.text, /^Za trochu lásky šel bych světa kraj,[\s\S]*šel v ledu — ale v duši věčný máj,[\s\S]*jak ten, kdo zpívá u dveří a prosí\.$/);
  assert.match(love.context, /1894 scan reads 'šel v ledu'.*'šel v lednu'/);
  assert.match(spring.text, /^Znám křišťálovou studánku,[\s\S]*a nebesa i studánka\njsou plny zlatých hvězd\.$/);
  assert.match(spring.context, /1907.*Lilie.*1894.*a nebesa.*tu nebesa.*musical setting/);
  assert.match(women.text, /^Ženy české, matky české![\s\S]*ale útlá, slabá žena[\s\S]*Jmenujme jim slavné otce,[\s\S]*Ať z nich zrostou reci statní,[\s\S]*pro tu slavnou, drahou vlast\.$/);
  assert.match(women.context, /signed 1843.*1891.*útlá.*Jmenujme.*zrostou.*Gmenugte.*two columns.*censorship-proof variant/);
  assert.equal(women.authorYears, '1820?–1862');
  const queries = [
    ['Za trochu lásky', 'Za trochu lasky', 'šel v ledu'],
    ['Lesní studánka', 'Lesni studanka', 'Znam kristalovou studanku'],
    ['Ženám českým', 'Zenam ceskym', 'Bozena Nemcova'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.language, 'Czech');
    assert.equal(poem.lang, 'cs');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'Czech', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="cs" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  const fold = text => String(text || '').normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const opening = fold(added.text.split('\n').filter(Boolean).slice(0, 2).join(''));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-czech-classics.py', '--check'], { encoding: 'utf8' }), /Verified 3 historical readings/);
});

test('Czech search preserves distinguishing marks and other-language translation behavior', () => {
  const common = { ...poems[0], author: 'Test', authorOriginal: '', title: 'Test', displayTitle: '',
    country: 'Czechia', era: '', form: 'Verse', collection: '', language: 'Czech', lang: 'cs', themes: [], authorAliases: [], searchAliases: [], translations: [] };
  const order = { ...common, id: 'czech-order', text: 'řád', authorAliases: ['Bozena Nemcova'], translations: [
    { language: 'French', title: 'Étoile', text: 'rivière' }, { language: 'Czech', title: 'básník', text: 'kůň' },
  ] };
  const glad = { ...common, id: 'czech-glad', text: 'rád' };
  const ids = query => filterPoems([order, glad], { query }).map(poem => poem.id);
  assert.deepEqual(ids('řád'), ['czech-order']);
  assert.deepEqual(ids('r\u030ca\u0301d'), ['czech-order']);
  assert.deepEqual(ids('rád'), ['czech-glad']);
  assert.deepEqual(ids('rad'), []);
  assert.deepEqual(ids('\u030c'), []);
  assert.deepEqual(ids('Bozena Nemcova'), ['czech-order']);
  assert.deepEqual(ids('básník'), ['czech-order']);
  assert.deepEqual(ids('basnik'), []);
  assert.deepEqual(ids('etoile'), ['czech-order']);
  assert.deepEqual(ids('riviere'), ['czech-order']);
  const html = renderPoem({ ...poems[0], translations: order.translations }, poems, '/ai-poems/');
  assert.ok(html.includes('class="verse" lang="cs"'));
});

test('early Nynorsk classics retain complete historical readings and distinct works', () => {
  const ids = ['gamle-norig', 'nordmannen', 'gamle-grendi', 'den-saerde', 'vaaren']
    .map(key => `recognized-nynorsk-${key}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-nynorsk-')).length, 5);
  assert.deepEqual(selected.map(lineCount), [24, 20, 32, 15, 24]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(block => block.split('\n').length)), [
    [8, 8, 8], [4, 4, 4, 4, 4], [8, 8, 8, 8], [5, 5, 5], [24],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '6ec31ea18203fa4687878ab86e1a8fd9b25f543c315f7d01ff25891f7f3cf88d',
    '75ab5bd2326567d97b10936b8b5da7e2a2730038985cbef08755e16a1c105093',
    '42d5b7a056e21069715a5c32bb9de564e58b09522a516ffab60b5822f052e2ee',
    '59bfc5fea9766b3c096f30312456776a10dd148ae2b6ae70527f0c9f655d6400',
    'd79d3d2fc1ba82dd95171277e3e83e9546e69441d0217395434a202bf76a4148',
  ]);
  const [norig, nordmannen, grendi, wounded, spring] = selected;
  assert.match(norig.text, /^1\. Gamle Norig, nørdst i Grendom,[\s\S]*trutt paa Tuftom i Trygd og Ro!$/);
  assert.match(nordmannen.text, /^1\. Millom Bakkar og Berg[\s\S]*med Hugnad ei Røda[\s\S]*at faa raada min Arv, som eg vil\.“$/);
  assert.match(nordmannen.context, /entry 184 says six stanzas.*entry 212 says five.*si Røda.*ei Røda/);
  assert.match(grendi.text, /^1\. Tidt eg minnest ein gamall Gard[\s\S]*Skjorerna sitt gamle Reid[\s\S]*likar paa Leiken illa\.$/);
  assert.match(wounded.text, /^Mit Hjarta har voret i Livets Strid[\s\S]*so vexa Blomar i Saaret\.$/);
  assert.match(spring.text, /^Enno ein Gong fekk eg Vetren[\s\S]*ut af Banken[\s\S]*myket af Vænt[\s\S]*den vaarlige Eim[\s\S]*meg tyktes at graata\.$/);
  assert.doesNotMatch(spring.text, /vaarlege|ut av Banken|myket av Vænt/);
  assert.match(spring.context, /four glosses, not verse.*kralla.*Saagiddren.*Fivreld.*Eim/);
  assert.match(spring.context, /Grieg's later setting uses only lines 1–6 and 19–24/);
  assert.match(spring.context, /first printing in Dølen to 3 June 1860/);
  for (const poem of [wounded, spring]) assert.match(poem.yearLabel, /1864.*December 1863/);
  const queries = [
    ['Gamle Noreg', 'Ættarland'], ['Mellom bakkar og berg', 'ei Røda'],
    ['Gamle grenda', 'Skjorerna'], ['Den sårede', 'mangteit Saar'], ['Våren', 'vaarlige Eim'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.language, 'Norwegian');
    assert.equal(poem.lang, 'nn');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(associatedPlaces(poem), ['Norway']);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.context, /Landsmaal.*later called Nynorsk.*not modernized/);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'Norwegian', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="nn" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Exact readings and openings cannot identify every translation or paraphrase.
  const fold = text => String(text || '').replace(/^\s*\d+\.\s*/gm, '').normalize('NFKD').toLowerCase()
    .replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const opening = fold(added.text.split('\n').filter(Boolean).slice(0, 2).join('\n'));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.equal(groupPoets(poems).find(group => group.id === 'ivar-aasen').poems.length, 4);
  assert.equal(groupPoets(poems).find(group => group.id === 'aasmund-olavsson-vinje').poems.length, 2);
  assert.match(execFileSync('python3', ['scripts/import-recognized-nynorsk-classics.py', '--check'], { encoding: 'utf8' }), /Verified 5 historical readings/);
});

test('Norwegian classics retain complete first-printing readings and distinct works', () => {
  const ids = ['pigen', 'foraaret', 'gyldenlak', 'vaarnat', 'digtets-aand', 'fjelli']
    .map(key => `recognized-norwegian-${key}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-norwegian-')).length, 6);
  assert.deepEqual(selected.map(lineCount), [30, 31, 20, 28, 60, 40]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(block => block.split('\n').length)), [
    [6, 6, 6, 6, 6], [2, 3, 3, 3, 2, 2, 2, 4, 2, 2, 2, 4], [4, 4, 4, 4, 4],
    [7, 7, 7, 7], Array(15).fill(4), [8, 8, 8, 8, 8],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '6c9b30edf259ea5a07421f34602c7a5749baaed27daf0bc071c6022b733959f6',
    'e9b4c74850550f3c3f06bf81f82515dc4551866e1ac46f9c8c274c96a9e09932',
    '2b52f7a396799516c3a1b751b46b378bd50c8561d64533220c0d59fbb54c7428',
    'd99010e86a68e364d8ca2d5373b84bae415ac1c79a068cb31ecd879f973d445c',
    '89e8f7bdcdba1c6dac8c42a01bbf1089b46482b6561baa7cef14a5e93a745821',
    'ed21f8c15605692bcadad21a6e64ee5445c7bac5bc9d4bdcefb217e33ed3391c',
  ]);
  const [pigen, spring, flower, night, spirit, mountains] = selected;
  assert.match(pigen.text, /^— — Jo det er Hende![\s\S]*Isen frossen ind[\s\S]*Tvertsover[\s\S]*Stedmorsblommen[\s\S]*Sneglens Sliim paa Løvet\.$/);
  assert.match(spring.text, /^O Foraar! Foraar! red mig![\s\S]*redde mig — mig, der elsker dig saa ømt\.$/);
  assert.match(flower.text, /^Gyldenlak, før Du din Glands har tabt,[\s\S]*bring mig Hilsen[\s\S]*den blomstrer af\.[\s\S]*dens Brudeblus!$/);
  assert.match(night.text, /^Vaarnatten stille og sval[\s\S]*Smerten i dit Savn og i din Klage\.$/);
  assert.match(spirit.text, /^Hvad ei med Ord kan nævnes[\s\S]*Digtets Rhythmer[\s\S]*hans Verk et evigt Liv\.$/);
  assert.match(mountains.text, /^1\. Dei gamle Fjell i Syningom[\s\S]*at ganga til og fraa[\s\S]*som saag sin Fødestad\.[\s\S]*dei gjera Hugen glad\.$/);
  assert.doesNotMatch(mountains.text, /at ganga til og staa|fin Fødestad/);
  assert.match(mountains.context, /Landsmaal.*later called Nynorsk/);
  assert.match(night.yearLabel, /1844.*1845/);
  const queries = [
    ['Pigen på Anatomikammeret', 'frossen ind'], ['Til våren', 'Leerfivel'],
    ['Til min gyllenlakk', 'blomstrer af'], ['En vårnatt'.normalize('NFD'), 'maanelyse Grene'],
    ['Diktets ånd', 'Strophens Liv'], ['Dei gamle fjella', 'sin Fødestad'],
  ];
  assert.ok(readingLanguages.includes('Danish'));
  assert.ok(readingLanguages.includes('Norwegian'));
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.language, index === 5 ? 'Norwegian' : 'Danish');
    assert.equal(poem.lang, index === 5 ? 'nn' : 'da');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: poem.language, query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="${poem.lang}" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // This catches exact overlaps, not every translation or independently titled variant.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const opening = fold(added.text.split('\n').filter(Boolean).slice(0, 2).join(' '));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-norwegian-classics.py', '--check'], { encoding: 'utf8' }), /Verified 6 historical readings/);
});

test('Danish and Norwegian searches preserve letters without changing other-language translations', () => {
  for (const language of ['Danish', 'Norwegian']) {
    const fixture = {
      title: 'Båt', displayTitle: '', author: 'Åsen', authorOriginal: '', country: '', era: '', form: 'Lyric',
      collection: '', language, lang: language === 'Danish' ? 'da' : 'nn', themes: [],
      text: 'blåbær og øer', searchAliases: [], authorAliases: [],
      translations: [{ language: 'French', title: 'Étoile', text: 'rivière' }, { language, title: 'båt', text: 'rød' }],
    };
    for (const query of ['Ba\u030at', 'båt', 'blåbær', 'øer', 'rød', 'etoile', 'riviere']) {
      assert.equal(filterPoems([fixture], { query }).length, 1, `${language}: ${query}`);
    }
    for (const query of ['bat', 'blabaer', 'ro\u0301d', '\u0301']) {
      assert.equal(filterPoems([fixture], { query }).length, 0, `${language}: ${query}`);
    }
    const html = renderPoem({ ...poems[0], translations: fixture.translations }, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="${language === 'Danish' ? 'da' : 'no'}"`));
  }
  assert.equal(filterPoems([{ ...poems.find(poem => poem.language === 'French'), text: 'étoile' }], { query: 'etoile' }).length, 1);
});

test('additional Dutch classics retain complete scan-checked readings and distinct works', () => {
  const ids = ['ik-ween-om-bloemen', 'de-waterlelie'].map(key => `recognized-dutch-classics-2-${key}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-dutch-classics-2-')).length, 2);
  assert.deepEqual(selected.map(lineCount), [14, 8]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(block => block.split('\n').length)), [
    [4, 4, 3, 3], [3, 3, 2],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    'bf9de824f431c11478cbaf6b4961cdc5da4ef7229e9505d12ce1f318547ab5b9',
    '16b49aa94d5cd1cd5f2a83e77f2339830c7ab4f98b23e381e95328aebdd55871',
  ]);
  const [kloos, eeden] = selected;
  assert.equal(kloos.era, '19th century');
  assert.equal(kloos.year, 1902);
  assert.ok(kloos.text.startsWith('Ik ween om bloemen, in den knop gebroken\nEn vóór den uchtend'));
  assert.ok(kloos.text.includes('gij zijt weer heen-gegaan...'));
  assert.ok(kloos.text.endsWith('Door ’t sluimerend geblaêrte een zwakke klacht.'));
  assert.match(kloos.context, /numbered LXI.*opening supplies its title.*heen-gegaan.*heengegaan/);
  assert.ok(eeden.text.startsWith('Ik heb de witte water-lelie lief,\ndaar die zoo blank'));
  assert.ok(eeden.text.endsWith('Nu rust zij peinzend op het watervlak\nen wenscht niet meer....'));
  assert.match(eeden.context, /first poem page, before De Lente.*wenscht.*wenst/);
  const queries = [
    ['Willem Kloos', 'Ik ween om bloemen in de knop gebroken', 'geblaerte'],
    ['Frederik van Eeden', 'De waterlelie', 'Ik heb de witte waterlelie lief', 'donker-koelen vijvergrond'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.language, 'Dutch');
    assert.equal(poem.lang, 'nl');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.yearLabel, /printing.*not necessarily composition/);
    assert.match(poem.rights, /public domain in the United States.*check local law.*no translation/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'Dutch', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="nl" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Exact readings and openings cannot identify every translation or paraphrase.
  const fold = text => String(text || '').normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const opening = fold(added.text.split('\n').slice(0, 2).join(' '));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) {
        for (const title of [added.title, ...(added.searchAliases || [])]) {
          assert.ok(![other.title, other.displayTitle, ...(other.searchAliases || []), ...other.translations.map(item => item.title)]
            .filter(Boolean).some(candidate => fold(candidate) === fold(title)), other.id);
        }
      }
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-dutch-classics-2.py', '--check'], { encoding: 'utf8' }), /Verified 2 historical readings/);
});

test('additional Swedish classics retain complete scan-checked readings and distinct works', () => {
  const ids = ['spelmannen', 'minnet', 'jag-har-dromt']
    .map(key => `recognized-swedish-classics-2-andersson-${key}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-swedish-classics-2-')).length, 3);
  assert.deepEqual(selected.map(lineCount), [24, 18, 32]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(block => block.split('\n').length)), [
    [4, 4, 4, 4, 4, 4], [8, 8, 2], [4, 4, 4, 4, 4, 4, 4, 4],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '1117168a37fec6fd39558483caa4fdfa27b3b214a00e77198cffe41051334ba3',
    'ad101a70e0e2480b713b3b0418c6fe17e3ad46b3f4626f61a2ae2a1119ab5bec',
    'fb06d6833e9af74a638ca15921ba1f2379f3c407ef0afe7951ea4cc22d738948',
  ]);
  const [spelmannen, minnet, dream] = selected;
  assert.ok(spelmannen.text.startsWith('Jag är spelman, jag skall spela på gravöl och på dans,\n'));
  assert.ok(spelmannen.text.endsWith('och jag vill dö och jag vill spela till uppståndelse en gång.'));
  assert.match(spelmannen.context, /distinct from En spelmans jordafärd/);
  assert.ok(minnet.text.includes('såg jag ditt mörka hår.\nOch het av lust jag smekte'));
  assert.ok(minnet.text.endsWith('och nu är allt ett minne,\nen saga från i går.'));
  assert.match(minnet.context, /page turn is not treated as a stanza break.*posthumous poem also titled Minnet/);
  assert.ok(dream.text.includes('Jag har drömt att en liten, liten kvinna,'));
  assert.ok(dream.text.endsWith('som en stråkton i dödsmörkret ned?'));
  assert.match(dream.context, /school text omits that comma/);
  const queries = [
    ['Spelmannen', 'gravöl'],
    ['Minnet', 'Raiskis'],
    ['Jag har drömt'.normalize('NFD'), 'tjärnlanden'.normalize('NFD')],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.authorId, 'dan-andersson');
    assert.equal(poem.language, 'Swedish');
    assert.equal(poem.lang, 'sv');
    assert.equal(poem.year, 1921);
    assert.match(poem.yearLabel, /printing.*not necessarily composition/);
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law.*No translation or recording/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'Swedish', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="sv" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  assert.deepEqual(filterPoems([dream], { language: 'Swedish', query: 'Jag har dromt' }), []);
  const fold = text => String(text || '').normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const opening = fold(added.text.split('\n').slice(0, 2).join(''));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        assert.ok(!fold(text).includes(opening), `${added.id} overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-swedish-classics-2.py', '--check'], { encoding: 'utf8' }), /Verified 3 historical readings/);
});

test('central Greek classics retain complete historical readings and source uncertainties', () => {
  const ids = ['city', 'barbarians'].map(id => `recognized-greek-classics-3-cavafy-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-greek-classics-3-')).length, 2);
  const [city, barbarians] = selected;
  assert.deepEqual(selected.map(lineCount), [16, 36]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(block => block.split('\n').length)), [
    [8, 8], [1, 1, 2, 3, 3, 5, 6, 2, 2, 2, 4, 3, 2],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '6bb3f6f07068777628e274c67580c4d0a1889e37dbe81045061b28fdc99d99ba',
    '648394398ed84383a2e0b9c4f6aeec35857d117a56a7b535610b066662fc6e2a',
  ]);
  assert.match(city.text, /^Εἶπες· «Θὰ πάγω σ’ ἄλλη γῆ,[\s\S]*\n\nΚαινούριους τόπους[\s\S]*τὴν ζωή σου ρήμαξες ἐδῶ[\s\S]*τὴν χάλασες\.$/);
  assert.ok(city.text.includes('δὲν θἄβρεις ἄλλες θάλασσες.'));
  assert.equal(city.year, null);
  assert.match(city.yearLabel, /1909–1910.*uncertain/);
  assert.match(city.context, /catalogue.*1910.*bibliography.*1909–1910/);
  assert.match(city.context, /faint mark.*not treated as a certain comma/);
  assert.deepEqual(filterPoems([city], { from: '1900', to: '1999' }), []);
  assert.ok(barbarians.text.startsWith('— Τί περιμένουμε στὴν ἀγορὰ συνασθροισμένοι;\n\nΕἶναι'));
  assert.ok(barbarians.text.includes('τόσο πρωῒ σηκώθη,'));
  assert.ok(barbarians.text.includes('γιατὶ βραχιόλια φόρεσαν μὲ τόσους ἀμεθύστους,\nκαὶ δαχτυλίδια μὲ λαμπρὰ γυαλιστερὰ σμαράγδια·'));
  assert.ok(barbarians.text.includes('μ’ ἀσήμια καὶ μαλάματα ἔκτακτα σκαλιγμένα;'));
  assert.ok(barbarians.text.includes('κ’ οἱ βάρβαροι βαρυοῦνται τὲς δημηγορίες.'));
  assert.ok(barbarians.text.includes('κ’ ἡ σύγχισις;'));
  assert.ok(barbarians.text.includes('οἱ δρόμοι κ’ ἡ πλατέες,'));
  assert.ok(barbarians.text.endsWith('Καὶ τώρα τὶ θὰ γένουμε χωρὶς βαρβάρους.\nΟἱ ἄνθρωποι αὐτοὶ ἦσαν μιὰ κάποια λύσις.'));
  assert.equal(barbarians.year, 1908);
  assert.match(barbarians.context, /issue 51–52.*issue 51, December 1908/);
  assert.match(barbarians.context, /possibly printing errors/);
  const queries = [
    ['Η πολις', 'The Town', 'Καινουριους', 'ἀκολουθεῖ'.normalize('NFD')],
    ['Περιμενοντας τους βαρβαρους', 'Waiting for the Barbarians', 'συναθροισμένοι', 'σκαλιγμένα'.normalize('NFD')],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.authorId, 'c-p-cavafy');
    assert.equal(poem.language, 'Greek');
    assert.equal(poem.lang, 'el');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*CC BY-SA 4\.0.*University of Patras.*check local law/);
    assert.match(poem.rights, index === 0 ? /Origenis/ : /Dada/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'Greek', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="el" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  const fold = text => String(text || '').normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  const openings = ['Εἶπες Θὰ πάγω σ’ ἄλλη γῆ', 'Τί περιμένουμε στὴν ἀγορὰ συνασθροισμένοι', 'Τι περιμένουμε στην αγορά συναθροισμένοι'];
  for (const other of poems.filter(poem => !ids.includes(poem.id))) {
    if (other.authorId === 'c-p-cavafy') {
      const titles = [other.title, other.displayTitle, ...(other.searchAliases || []), ...other.translations.map(item => item.title)];
      for (const title of ['Η πόλις', 'The City', 'The Town', 'Περιμένοντας τους βαρβάρους', 'Waiting for the Barbarians']) {
        assert.ok(titles.every(candidate => fold(candidate) !== fold(title)), `${title} matches ${other.id}`);
      }
    }
    for (const opening of openings) for (const text of [other.text, ...other.translations.map(item => item.text)]) {
      assert.ok(!fold(text).includes(fold(opening)), `${opening} overlaps ${other.id}`);
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-greek-classics-3.py', '--check'], { encoding: 'utf8' }), /Verified 2 historical readings/);
});

test('additional Greek classics preserve source-specific complete works and variants', () => {
  const ids = ['trojans', 'first-step'].map(id => `recognized-greek-classics-2-cavafy-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-greek-classics-2-')).length, 2);
  const [trojans, step] = selected;
  assert.deepEqual(selected.map(lineCount), [22, 26]); // The first count includes its two printed section labels.
  assert.deepEqual(trojans.text.split('\n\n').map(block => block.split('\n').length), [1, 4, 3, 1, 3, 3, 3, 4]);
  assert.deepEqual(step.text.split('\n\n').map(block => block.split('\n').length), [26]);
  assert.equal(trojans.text.split('\n').filter(line => line && !['Α΄.', 'Β΄.'].includes(line)).length, 20);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '1f8ead69910bfe9deb33f5569964ff857428c3aa718475d96ac9242d78aaa95b',
    '10751afb2c44d7eb1190ed2c3b861aeca7e79c492ba9310e3bce216e47de74d4',
  ]);
  assert.match(trojans.text, /^Α΄\.\n\nΕἶν’ ἡ προσπάθειές μας σὰν τῶν Τρώων\.[\s\S]*\n\nΒ΄\.\n\nΕἶν’ ἡ προσπάθειές μας σὰν τῶν Τρώων\.[\s\S]*κλαῖνε,$/);
  assert.match(trojans.context, /two numbered sections.*counted as one work/);
  assert.match(trojans.context, /1908 printing.*wording differs/);
  assert.match(trojans.context, /reason for the difference is uncertain/);
  assert.match(trojans.context, /additional opening line/);
  assert.match(trojans.context, /last line with a comma/);
  assert.ok(step.text.startsWith('Εἰς τὸν Θεόκριτο παραπονιούνταν\n'));
  assert.ok(step.text.includes('Ἀλλοίμονον, εἶν’ ὑψηλὴ τὸ βλέπω,'));
  assert.ok(step.text.includes('ποτὲ δὲν θ’ ἀναιβῶ ὁ δυστυχισμένος.'));
  assert.equal(step.text.match(/νᾶσαι/g).length, 2);
  assert.ok(step.text.endsWith('τόσο ποῦ ἔκαμες, μεγάλη δόξα».'));
  assert.match(step.context, /schoolbook.*modern edition/);
  const queries = [['Τρωες', 'Ἀχιλλεὺς'], ['πρωτο σκαλι', 'ἀναιβῶ'.normalize('NFD')]];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.authorId, 'c-p-cavafy');
    assert.equal(poem.language, 'Greek');
    assert.equal(poem.lang, 'el');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*Ntetos.*CC BY-SA 4\.0.*check local law/);
    assert.match(poem.context, /first page prints January 1927.*metadata says December/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'Greek', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="el" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  const fold = text => String(text || '').normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const opening = fold(added.text.split('\n').filter(line => line && !['Α΄.', 'Β΄.'].includes(line)).slice(0, 2).join(''));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        assert.ok(!fold(text).includes(opening), `${added.id} overlaps ${other.id}`);
      }
    }
  }
  for (const phrase of ['Trojans', 'The First Step']) for (const poem of poems.filter(item => !ids.includes(item.id))) {
    assert.ok([poem.title, poem.displayTitle, poem.text, ...(poem.searchAliases || []), ...poem.translations.flatMap(item => [item.title, item.text])]
      .every(text => !fold(text).includes(fold(phrase))), phrase);
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-greek-classics-2.py', '--check'], { encoding: 'utf8' }), /Verified 2 historical readings/);
});

test('additional Hungarian poems preserve complete historical readings and distinct works', () => {
  const ids = ['petofi-egy-gondolat-bant-engemet', 'petofi-foltamadott-a-tenger', 'petofi-az-alfold', 'petofi-a-tisza', 'kolcsey-hymnus']
    .map(id => `recognized-hungarian-poems-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-hungarian-poems-')).length, 5);
  assert.deepEqual(selected.map(lineCount), [36, 25, 48, 60, 64]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    [36], [5, 5, 5, 5, 5], Array(12).fill(4), Array(15).fill(4), Array(8).fill(8),
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    'aa80621c35b3664cf470e1576b70e1f8bce05e62bd32edc26a803ff809bd5a8f',
    'acd1dc99f606e219d7248c693097d19c7cb57d3c33c77e325c33b479566d3e18',
    'cb8a3706f1779592c634d6501d91def333410546f79c10e2a3b4821555ef8cb2',
    'c3504f5dbc2fe882b18028a2d7e5ee2edf7c65c71e0ed5983d728b95d84c21e7',
    '2b004e4ad4a34e955a4898abc0b6b2dbb03810300cf4575f3381e9cdd4122afe',
  ]);
  const [thought, sea, plain, river, hymn] = selected;
  assert.match(thought.text, /^Egy gondolat bánt engemet:[\s\S]*Elharsogják kelettől nyúgatig,[\s\S]*Kik érted haltak, szent világszabadság!$/);
  assert.match(sea.text, /^Föltámadott a tenger,[\s\S]*Sűlyednek a pokolra,[\s\S]*Habár fölűl a gálya,\nS alúl a víznek árja,\nAzért a víz az úr!$/);
  assert.match(plain.text, /^Mit nekem te zordon Kárpátoknak[\s\S]*Deleléskor hosszu gémü kútnál[\s\S]*S a smaragdnak eleven szinével[\s\S]*A vadlúdak esti szürkületben,[\s\S]*Domborodjék a sir is fölöttem\.$/);
  assert.match(river.text, /^Nyári napnak alkonyúlatánál[\s\S]*Megbotoljék habjai fodrába\.[\s\S]*„Jön az árviz! jön az árviz!“ hangzék,[\s\S]*El akarta nyelni a világot!$/);
  assert.ok(hymn.text.startsWith("Isten! áldd-meg a' Magyart\n"));
  assert.ok(hymn.text.includes("A' múltat 's jövendőt."));
  assert.ok(hymn.text.includes("Tokaj' szőllővesszejin\nNektárt csepegtettél"));
  assert.ok(hymn.text.includes("Hányszor támadt fenn fiad,\nSzép Hazám, kebledre;"));
  assert.ok(hymn.text.includes("Árvánk' hő szeméből."));
  assert.ok(hymn.text.endsWith("A' multat 's jövendőt."));
  assert.equal(hymn.year, 1829);
  assert.match(hymn.yearLabel, /December 1828/);
  assert.match(hymn.context, /heading has no subtitle/);
  assert.match(hymn.contextSource, /^https:\/\/erkel\.oszk\.hu\/tan\/hymnustol-himnuszig/);
  assert.ok(selected.slice(0, 4).every(poem => poem.authorId === 'sandor-petofi'));
  assert.ok(selected.slice(0, 4).every(poem => poem.sourceTitle.includes('afterword by György Király') && poem.rights.includes('Király in 1922')));
  assert.equal(hymn.authorId, 'ferenc-kolcsey');
  const queries = [
    ['Egy gondolat bant engemet', 'nyúgatig'],
    ['Foltamadott a tenger', 'fölűl'.normalize('NFD')],
    ['Az alfold', 'vadlúdak'],
    ['A Tisza', 'alkonyúlatánál'],
    ['Himnusz', "Tokaj'"],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.language, 'Hungarian');
    assert.equal(poem.lang, 'hu');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'Hungarian', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="hu" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  assert.equal(filterPoems([sea], { query: 'sűlyednek' }).length, 1);
  assert.equal(filterPoems([sea], { query: 'sülyednek' }).length, 0);
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const opening = fold(added.text.split('\n').filter(Boolean).slice(0, 2).join(''));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        assert.ok(!fold(text).includes(opening), `${added.id} overlaps ${other.id}`);
      }
    }
  }
  // Alternate titles and selected translated openings are limited duplicate signals, not exhaustive proof.
  const alternatives = ['One thought troubles me', 'The sea has risen', 'The Great Plain', 'The Tisza', 'God bless the Hungarians'];
  for (const phrase of alternatives) for (const poem of poems.filter(item => !ids.includes(item.id))) {
    assert.ok([poem.title, poem.text, ...(poem.searchAliases || []), ...poem.translations.flatMap(item => [item.title, item.text])]
      .every(text => !fold(text || '').includes(fold(phrase))), phrase);
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-hungarian-poems.py', '--check'], { encoding: 'utf8' }), /Verified 5 historical readings/);
});

test('Slovenian classics preserve two complete historical readings and distinct works', () => {
  const ids = ['preseren-kam', 'preseren-slovo-od-mladosti']
    .map(id => `recognized-slovenian-classics-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-slovenian-classics-')).length, 2);
  assert.deepEqual(selected.map(lineCount), [12, 40]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    [2, 2, 2, 2, 2, 2], [8, 8, 8, 8, 8],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    'acdfa60b20fa8cdf687e15f1f15db33c585ab5cd404f63ee00be18570bc3c75c',
    'a73abd02c29e74522d6b42282845ffd5d338a4e8172afcb14bbdd8b8d3132fc0',
  ]);
  const [kam, farewell] = selected;
  assert.match(kam.text, /^Ko brez miru okrog divjam,[\s\S]*Prašajte raj’ oblak neba,\nPrašajte raji val morja,[\s\S]*Drvi jih sèmtertjè vihar\.[\s\S]*Kjer bi pozabil to gorjé\. —$/);
  assert.match(farewell.text, /^Dni môjih lepši polovica kmalo,[\s\S]*Sem zvedel, da vest čisto, dôbro d’janje[\s\S]*Kar um slepi z golj’fijami, ležami\.[\s\S]*Srcé zdih’valo bo mi, Bog te obvarji!$/);
  assert.equal(kam.authorId, 'france-preseren');
  assert.equal(farewell.authorId, kam.authorId);
  assert.ok(readingLanguages.includes('Slovenian'));
  const queries = [
    ['Kam?', 'praŠajo me', 'semtertje'],
    ['Slovo od mladosti', 'Farewell to Youth', 'vender po tvoji temni'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.language, 'Slovenian');
    assert.equal(poem.lang, 'sl');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'Slovenian', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="sl" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const opening = fold(added.text.split('\n').filter(Boolean).slice(0, 2).join(''));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        assert.ok(!fold(text).includes(opening), `${added.id} overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-slovenian-classics.py', '--check'], { encoding: 'utf8' }), /Verified 2 historical readings/);
});

test('Danish classics retain five complete, distinct historical readings', () => {
  const ids = [
    'oehlenschlaeger-faedrelands-sang', 'andersen-danmark', 'andersen-jylland',
    'boennelycke-gaden', 'knudsen-se-nu-stiger-solen',
  ].map(id => `recognized-danish-classics-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-danish-classics-')).length, 5);
  assert.deepEqual(selected.map(lineCount), [72, 32, 30, 49, 28]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    Array(12).fill(6), Array(4).fill(8), Array(5).fill(6), Array(7).fill(7), Array(7).fill(4),
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    'c925bb5c832f1f85d4435fd37564db5fdebed8f95445d22d955b3e1d9357ce9d',
    '721cc417eece37ae30f0af110c477902fba86326ba228d3aa95d9c22094aacdf',
    '05c41bfdc896edb6bda245da88d663b67f007faaa60f817bb22c4e4615babdcf',
    'a4b3ac6eef3f3e414d464fcf5870696d22e183ec81e1b9dfdaf532fa5b871cdc',
    '788abe355082f79449c8b885fe8b1434428443a43ce6e52b173b7be07a7d2876',
  ]);
  const [anthem, homeland, jutland, street, morning] = selected;
  assert.match(anthem.text, /^Der er et yndigt Land,[\s\S]*Din axbeklædte Jord\.[\s\S]*Sin Top i Bølgen blaa\.$/);
  assert.match(anthem.context, /twelve six-line stanzas.*epigraph.*four- and five-stanza/);
  assert.match(homeland.text, /^I Danmark er jeg født,[\s\S]*Kløver-Engen[\s\S]*End høres Danskens Sang og Meiselslag\.[\s\S]*Danmark, mit Fædreland!$/);
  assert.match(homeland.context, /1854.*not the 1850 first printing/);
  assert.equal((jutland.text.match(/Som en Runestav er lagt,/g) || []).length, 2);
  assert.match(jutland.text, /Lyngen er et pragtfuldt Teppe,\nBlomster mylre milevidt\.\nSkynd Dig/);
  assert.match(jutland.context, /Runestav.*Runesten.*repeat marks are omitted/);
  assert.match(street.text, /^Sporvogn, der brummer\. Klokker der kimer og slaar\.\nTravle Butikker,[\s\S]*Vindver[\s\S]*Sporvogn, der brummer, og Klokker, der klinger og kimer\.$/);
  assert.match(street.context, /drop cap.*extra O.*Klokker.*Vindver/);
  assert.match(morning.text, /^Se, nu stiger Solen af Havets Skød,[\s\S]*Livets Gud mig skærmer[\s\S]*Lyset stander stille paa Livets Kyst\.$/);
  assert.match(morning.context, /not the first printing.*no denomination is inferred/);
  const queries = [
    ['Der er et yndigt land', 'Faedrelands-Sang'], ['I Danmark er jeg født', 'I Danmark er jeg fodt'],
    ['Jylland mellem tvende have', 'Runestav'], ['Sporvogn, der brummer', 'Vindver'],
    ['Se, nu stiger solen', 'Morgensang'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.language, 'Danish');
    assert.equal(poem.lang, 'da');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'Danish', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="da" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  const fold = text => String(text || '').normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const opening = fold(added.text.split('\n').filter(Boolean).slice(0, 2).join(''));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        assert.ok(!fold(text).includes(opening), `${added.id} overlaps ${other.id}`);
      }
    }
  }
  for (const phrase of ['Der er et yndigt land', 'I Danmark er jeg født', 'Jylland mellem tvende have', 'Se, nu stiger Solen']) {
    for (const poem of poems.filter(item => !ids.includes(item.id))) {
      assert.ok([poem.title, poem.displayTitle, ...(poem.searchAliases || []), ...poem.translations.map(item => item.title)]
        .every(text => !fold(text).includes(fold(phrase))), `${phrase}: ${poem.id}`);
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-danish-classics.py', '--check'], { encoding: 'utf8' }), /Verified 5 historical readings/);
});

test('Further Danish classics retain four complete, distinct historical readings', () => {
  const ids = [
    'oehlenschlaeger-guldhornene', 'aakjaer-jens-vejmand', 'aakjaer-havren', 'ingemann-boernenes-julesang',
  ].map(id => `recognized-danish-poems-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-danish-poems-')).length, 4);
  assert.deepEqual(selected.map(lineCount), [166, 48, 48, 24]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    [8, 12, 10, 15, 8, 24, 4, 8, 1, 9, 26, 8, 4, 7, 2, 4, 4, 4, 4, 4],
    Array(6).fill(8), Array(12).fill(4), Array(3).fill(8),
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    'fa50cf6ee9751c2b0a822ee6a7f618d8153b76c36aae5685ae515d5e0aa9471e',
    '3706f4178edde57a8167f5491ee08839d51c020acf456cc48fe0994d5ac75e13',
    'b6529449e17a2964c7760f6c7b3209a1fa23cebb317754fe9749b1e08ee91c2a',
    'b94b911ea20a737645b70523325b897d827a38c82799ed6ea4b23deb3799e48c',
  ]);
  const [horns, roadman, oats, christmas] = selected;
  assert.match(horns.text, /^De higer og söger[\s\S]*giv et Glimt tilbage!\n\nSkyen suser,[\s\S]*men som sine Fædre\nkraftig og stor,[\s\S]*ham vil vi hædre\.\nhan skal atter finde!”[\s\S]*Fugleskarer[\s\S]*Evig bortsvandt Helligdommen\.$/);
  assert.match(horns.context, /1803.*1802.*1803.*no closing quotation mark.*paragraph breaks/);
  assert.match(roadman.text, /^Hvem sidder dér bag Skjærmen[\s\S]*hvis Øjne staar i Vand[\s\S]*det var saamænd Jens Vejmand\nhan tabte Ham’ren brat,[\s\S]*man gav ham aldrig en\.$/);
  assert.match(roadman.context, /first printed.*1905.*1906.*musical setting/);
  assert.match(oats.text, /^Jeg er Havren\. Jeg har Bjælder paa;[\s\S]*for at gi mig Helse med paa Vej\.[\s\S]*forstaa:\nJeg er Lærkesangen[\s\S]*Landets lyse Bøgetrær,[\s\S]*herligt sammen paa den danske Jord\.$/);
  assert.match(oats.context, /twelve quatrains.*only eight stanzas.*Bøgetrær/);
  assert.match(christmas.text, /^Julen har bragt velsignet Bud,[\s\S]*den Have, Guds Engle flyvé i,[\s\S]*og lover os Englevinger\.$/);
  assert.match(christmas.context, /three eight-line stanzas.*original six quatrains.*no denomination is inferred/);
  const queries = [
    ['Guldhornene', 'De higer og soger'], ['Jens Vejmand', 'Hvem sidder der bag skærmen'],
    ['Jeg er havren', 'Bøgetrær'], ['Børnenes Julesang', 'Julen har bragt velsignet bud'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.language, 'Danish');
    assert.equal(poem.lang, 'da');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'Danish', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="da" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  const fold = text => String(text || '').normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const opening = fold(added.text.split('\n').filter(Boolean).slice(0, 2).join(''));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        assert.ok(!fold(text).includes(opening), `${added.id} overlaps ${other.id}`);
      }
    }
  }
  for (const phrase of ['Guldhornene', 'Jens Vejmand', 'Jeg er Havren', 'Julen har bragt velsignet bud']) {
    for (const poem of poems.filter(item => !ids.includes(item.id))) {
      assert.ok([poem.title, poem.displayTitle, ...(poem.searchAliases || []), ...poem.translations.map(item => item.title)]
        .every(text => !fold(text).includes(fold(phrase))), `${phrase}: ${poem.id}`);
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-danish-classics-2.py', '--check'], { encoding: 'utf8' }), /Verified 4 historical readings/);
});

test('Slovenian lyrics retain seven complete, distinct 1914 readings', () => {
  const ids = ['pod-oknom', 'prosnja', 'ukazi', 'k-slovesu', 'sila-spomina', 'izgubljena-vera', 'mornar']
    .map(id => `recognized-slovenian-lyrics-preseren-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-slovenian-lyrics-')).length, 7);
  assert.deepEqual(selected.map(lineCount), [42, 36, 24, 24, 28, 22, 42]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    Array(7).fill(6), Array(9).fill(4), Array(6).fill(4), Array(6).fill(4),
    Array(7).fill(4), Array(11).fill(2), Array(7).fill(6),
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '49d678363af72b9de0c0dcb33be5ea6f22c5974a4a15770b5278cc0791bf21cb',
    '45e2c1f57ab621b3e90e0664e0263a4649aa8cdb292e3bb78729eedc167c53ee',
    'e28ccfad4dd59d8ef4c642dbab5ab1a418c6c1e6c6e06cb6c2afd9bc6d274087',
    '65c3cd876c821d2dc1c0f098fd5014b01662dd79178215b3b2b578e16d3dd4d2',
    '9bfd0132553b2dfdfa0a301e4524d1bc7bd9bd74bf6b3f73880c0697dc997ba4',
    'f85623ad38415d0c33829dc4f066a26682a0d90a35b228ddf9833fa3df77c05c',
    'd85ea88d718cbe291ab4eac7964457fa0981ec69cef6dbaacc396d494a80a3d3',
  ]);
  const [window, plea, orders, farewell, memory, faith, sailor] = selected;
  assert.match(window.text, /^Luna sije,\nKladvo bije[\s\S]*Druz’ga, poč’lo bo srcé\.$/);
  assert.match(plea.text, /^Po drugih se oziraj,[\s\S]*Al repetnic razpeti[\s\S]*Mi gledat’ dàj njih svit! —$/);
  assert.match(orders.text, /^Da ne smem, si ukazala,[\s\S]*Al srce mi drugo vstvari,[\s\S]*Pred ni moč te pozabit’\. —$/);
  assert.match(farewell.text, /^Kaj od mêne pròč oko,[\s\S]*Žàl-besede v ustih ni\.[\s\S]*Dòkler zmaga sreče jezo[\s\S]*Zadnja ljub’ca, — bela smrt\.$/);
  assert.match(memory.text, /^Drug ti je v skrbno nastavljene mreže[\s\S]*Marsikdaj tvôje srce me pogreša,[\s\S]*Vèčkrat, ko vtrujena[\s\S]*Pomnila boš ti do zadnjega dne\. —$/);
  assert.match(memory.context, /tvôje srce me pogreša.*tvoje oko me pogreša.*not combined/);
  assert.match(faith.text, /^Nebeško sijejo oči,[\s\S]*Srcé je môje biló oltár,\nPred bogstvo ti, zdaj — lepa stvár\.$/);
  assert.match(faith.context, /Zgubljena vera.*same work.*letter-spaced/);
  assert.match(sailor.text, /^Nezvesta, bodi zdrava,[\s\S]*Prinêsla me nazaj;\nDekleta môj’ga žêno[\s\S]*Le jadrajmo za njim!$/);
  const queries = [
    ['Pod oknam', 'Luna sije'], ['Prosnja', 'repetnic'], ['Ukazi', 'pokoren bit'],
    ['K slovesu', 'Bog te obar'], ['Sila spomina', 'tvoje srce me pogresa'],
    ['Zgubljena vera', 'Izgubljena vera'], ['Mornar', 'nezvesta bodi zdrava'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.authorId, 'france-preseren');
    assert.equal(poem.language, 'Slovenian');
    assert.equal(poem.lang, 'sl');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'Slovenian', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="sl" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  const fold = text => String(text || '').normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const opening = fold(added.text.split('\n').filter(Boolean).slice(0, 2).join(''));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        assert.ok(!fold(text).includes(opening), `${added.id} overlaps ${other.id}`);
      }
    }
  }
  // Alternate names are limited signals; generic translated titles may identify unrelated poems.
  for (const phrase of ['Pod oknam', 'Bog te obar', 'Zgubljena vera']) {
    for (const poem of poems.filter(item => !ids.includes(item.id))) {
      assert.ok([poem.title, poem.displayTitle, ...(poem.searchAliases || []), ...poem.translations.map(item => item.title)]
        .every(text => !fold(text).includes(fold(phrase))), `${phrase}: ${poem.id}`);
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-slovenian-lyrics.py', '--check'], { encoding: 'utf8' }), /Verified 7 historical readings/);
});

test('Hungarian classics preserve three complete historical readings and distinct works', () => {
  const ids = ['petofi-szeptember-vegen', 'petofi-nemzeti-dal', 'vorosmarty-szozat']
    .map(id => `recognized-hungarian-classics-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-hungarian-classics-')).length, 3);
  assert.deepEqual(selected.map(lineCount), [24, 48, 56]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    [8, 8, 8], [8, 8, 8, 8, 8, 8], [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '198a56c7a7ac7b195e257af118a64f201f7a3a9569ee4bcc4751642f252cea0a',
    'd583d8a0a019bcf5feb3337625dab35fba8a301c0e37fe6d55b46ac3c1bf43bd',
    '74ec3323eb2fb583d96267df8024625cf0e1109ee8fad6b5fc018539161f8e59',
  ]);
  const [september, national, appeal] = selected;
  assert.match(september.text, /^Még nyílnak a völgyben a kerti virágok,[\s\S]*De íme sötét hajam őszbe vegyűl már,[\s\S]*Űlj, hitvesem, űlj az ölembe ide![\s\S]*Még akkor is, ott is, örökre szeret!$/);
  assert.match(national.text, /^Talpra magyar, hí a haza![\s\S]*Méltó régi nagy hiréhez;[\s\S]*Eszküszünk, hogy rabok tovább[\s\S]*Nem leszünk!$/);
  assert.match(national.context, /fifth-stanza refrain prints Eszküszünk.*apparently a typesetting error/);
  assert.match(appeal.text, /^Hazádnak rendületlenűl[\s\S]*A hosszu harc alatt\.[\s\S]*S a sírt, hol nemzet sűlyed el,\nNépek veszik körűl,[\s\S]*Itt élned, halnod kell\.$/);
  assert.equal(september.authorId, national.authorId);
  assert.ok(readingLanguages.includes('Hungarian'));
  const queries = [
    ['Szeptember ve\u0301ge\u0301n', 'Szeptember vegen', 'Petofi Sandor'],
    ['Nemzeti dal', 'Talpra magyar', 'Sándor Petőfi'],
    ['Szózat', 'Szozat', 'Vorosmarty Mihaly'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.language, 'Hungarian');
    assert.equal(poem.lang, 'hu');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'Hungarian', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="hu" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  assert.equal(filterPoems([september], { query: 'oszbe' }).length, 0);
  assert.equal(filterPoems([september], { query: 'o\u030bszbe' }).length, 1);
  assert.equal(filterPoems([september], { query: 'űlj' }).length, 1);
  assert.equal(filterPoems([september], { query: 'ülj' }).length, 0);
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const opening = fold(added.text.split('\n').filter(Boolean).slice(0, 2).join(''));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        assert.ok(!fold(text).includes(opening), `${added.id} overlaps ${other.id}`);
      }
    }
  }
  // Known translated openings are screened, but other translations and paraphrases can differ.
  const translations = ['the garden flowers still blossom in the vale', 'rise Magyar is the country',
    'below in the valley the flowers are resplendent', 'on your feet now Hungary calls you',
    'oh Magyar keep immovably', 'to your homeland without fail'];
  for (const phrase of translations) for (const poem of poems.filter(item => !ids.includes(item.id))) {
    assert.ok([poem.text, ...poem.translations.map(item => item.text)].every(text => !fold(text).includes(fold(phrase))), phrase);
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-hungarian-classics.py', '--check'], { encoding: 'utf8' }), /Verified 3 historical readings/);
});

test('Hungarian search preserves vowel distinctions and canonical equivalence without changing legacy matching', () => {
  const example = { ...poems[0], author: 'Test', authorOriginal: '', title: 'Test', displayTitle: '',
    country: '', era: '', form: 'Verse', collection: '', language: 'Hungarian', lang: 'hu', themes: [], translations: [], authorAliases: [], searchAliases: [] };
  const a = { ...example, id: 'hungarian-a', text: 'árvíz tűz ősz', translations: [
    { language: 'French', title: 'Étoile', text: 'rivière' }, { language: 'Hungarian', title: 'föld', text: 'kő' },
  ] };
  const b = { ...example, id: 'hungarian-b', text: 'arviz tuz osz' };
  const ids = query => filterPoems([a, b], { query }).map(poem => poem.id);
  assert.deepEqual(ids('a\u0301rvi\u0301z'), ['hungarian-a']);
  assert.deepEqual(ids('ÁRVÍZ'), ['hungarian-a']);
  assert.deepEqual(ids('arviz'), ['hungarian-b']);
  assert.deepEqual(ids('o\u030bsz'), ['hungarian-a']);
  assert.deepEqual(ids('osz'), ['hungarian-b']);
  assert.deepEqual(ids('tu\u030bz'), ['hungarian-a']);
  assert.deepEqual(ids('tuz'), ['hungarian-b']);
  assert.deepEqual(ids('ko\u030b'), ['hungarian-a']);
  assert.deepEqual(ids('ko'), []);
  assert.deepEqual(ids('etoile'), ['hungarian-a']);
  assert.deepEqual(ids('riviere'), ['hungarian-a']);
  assert.deepEqual(ids('\u0301'), []);
  const english = { ...example, id: 'english', language: 'English', lang: 'en', text: 'résumé' };
  assert.deepEqual(filterPoems([english, a, b], { query: '\u0301' }).map(poem => poem.id), ['english']);
  assert.deepEqual(filterPoems([english], { query: 'resume' }).map(poem => poem.id), ['english']);
});

test('British classics preserve four complete historical readings and distinct works', () => {
  const ids = ['davies-leisure', 'kipling-way-through-woods', 'kipling-glory-of-garden', 'chesterton-donkey']
    .map(id => `recognized-british-classics-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-british-classics-')).length, 4);
  assert.deepEqual(selected.map(lineCount), [14, 25, 33, 16]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    [2, 2, 2, 2, 2, 2, 2], [12, 13], [4, 4, 4, 4, 4, 4, 4, 5], [4, 4, 4, 4],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '5a27cac27755f30673c4b328f592ad8bc5dfaef93633c3a5ed6707b23e7672bf',
    '5123072d71de91557fbb72469cc0a237072a61d5c979350de464784c82beafab',
    'c5bbe86f15bd109f7f8b039ce1235ab98c367d9d3ec985532b2c4da68b753fd9',
    'ced8e002a0ae6ebada2a7564896a48822a0a3c8b08a7cbeeb3089cf3b7d6540e',
  ]);
  const [leisure, woods, garden, donkey] = selected;
  assert.match(leisure.text, /^What is this life if, full of care,[\s\S]*A poor life this if, full of care,\nWe have no time to stand and stare\.$/);
  assert.match(woods.text, /^They shut the road through the woods[\s\S]*Where the otter whistles his mate\.\n\(They fear not men in the woods\nBecause they see so few\)[\s\S]*But there is no road through the woods\.$/);
  assert.match(woods.context, /Toronto printing has a period after mate/);
  assert.match(garden.text, /^Our England is a garden[\s\S]*tool and potting-sheds[\s\S]*For the Glory of the Garden that it may not pass away!\nAnd the Glory of the Garden it shall never pass away!$/);
  assert.match(garden.context, /eight stanzas and a final repeated line, printed in italics/);
  assert.match(donkey.text, /^When fishes flew and forests walked[\s\S]*There was a shout about my ears,\nAnd palms before my feet\.$/);
  assert.match(donkey.context, /1914 fourth edition.*not a claim that it is textually identical to the 1900 volume/);
  const queries = [
    ['William Henry Davies', 'stand and stare'], ['Rudyard Kipling', 'the old lost road through the woods'],
    ['Glory of the Garden', 'Our England is a garden'], ['Gilbert Keith Chesterton', 'palms before my feet'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.language, 'English');
    assert.equal(poem.lang, 'en');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'English', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="en" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  assert.equal(poems.find(poem => poem.id === 'recognized-kipling-if').authorId, woods.authorId);
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const opening = fold(added.text.split('\n').filter(Boolean).slice(0, 2).join(''));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        assert.ok(!fold(text).includes(opening), `${added.id} overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-british-classics.py', '--check'], { encoding: 'utf8' }), /Verified 4 historical readings/);
});

test('additional Ukrainian classics preserve complete historical readings and work boundaries', () => {
  const ids = ['dosvitni', 'yak-dytynoyu', 'slovo', 'kamenyari', 'hymn']
    .map(key => `recognized-ukrainian-2-${key}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-ukrainian-2-')).length, 5);
  assert.deepEqual(selected.map(lineCount), [35, 16, 24, 55, 40]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(block => block.split('\n').length)), [
    [5, 5, 5, 5, 5, 5, 5], [4, 4, 4, 4], [4, 4, 4, 4, 4, 4], [55], [10, 10, 10, 10],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '08217ae769ad917cb7fccfb612e5f788d00ec331f88d631521a6388822fa022e',
    '3514934cd5f3e89f007235249f5051558c51dc1e1b9ea8e39ca981ddf2c9fb64',
    'e14b0c7ee94f20574fdab476b718469116cc097f7a2abb48bbf74f0c0d6bc5c2',
    '9729f8552cde6b912deab5403fa552d0805262ae8e369e5f3bab4d532521598a',
    'c6e166fc15f8f59bdbf3164868512d51baf6068661f2804bbb99f6231217db96',
  ]);
  const [dawn, childhood, word, stonebreakers, hymn] = selected;
  assert.match(dawn.text, /^Ніч те́мна людей всіх пото́млених скрила[\s\S]*стяга́ та просвітла[\s\S]*Мов кличуть: до праці! до світла!$/);
  assert.match(dawn.context, /omitted two stanzas in the 1904 edition/);
  assert.match(childhood.text, /^Як дитиною бувало[\s\S]*Плачу я, щоб не сьміятись\.$/);
  assert.match(word.text, /^Слово, чому ти не твердая криця[\s\S]*мого серця прольлєш[\s\S]*кращим мечем[\s\S]*хворим рукам!$/);
  assert.doesNotMatch(word.text, /мого сєрця|справжнім мечем/);
  assert.match(word.context, /correcting the credited page transcription/);
  assert.match(stonebreakers.text, /^Я бачив дивний сон[\s\S]*з силою роспуски[\s\S]*щастя всіх прийде по наших аж кістках\.$/);
  assert.match(stonebreakers.context, /possibly a printing error.*розпуки/);
  assert.match(hymn.text, /^Вічний революцйонер[\s\S]*Дух, наука, думка воля[\s\S]*Розвидняющий ся день\?\.\.\.$/);
  assert.match(hymn.context, /1908 anthology printing stops after three stanzas/);
  const queries = [
    ['Досвітні вогні', 'Dosvitni ogni'], ['Як дитиною, бувало', 'Щоб не плакать, я сміялась'],
    ['Слово, чому ти не твердая криця', 'Слово моя ти єдиная зброє'],
    ['Я бачив дивний сон', 'Kamenyari'], ['Вічний революціонер', 'Гімн'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.language, 'Ukrainian');
    assert.equal(poem.lang, 'uk');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*CC BY-SA 4\.0.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'Ukrainian', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="uk" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Exact titles, texts and openings cannot rule out every variant or translation.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const opening = fold(added.text.split('\n').filter(Boolean).slice(0, 2).join(' '));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-ukrainian-classics-2.py', '--check'], { encoding: 'utf8' }), /Verified 5 historical readings/);
});

test('additional Galician classics preserve complete 1880 readings and work boundaries', () => {
  const ids = ['xusticia', 'pra-habana'].map(key => `recognized-galician-2-${key}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-galician-2-')).length, 2);
  // Counts include the printed separator and section labels, not just verse.
  assert.deepEqual(selected.map(lineCount), [29, 85]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(block => block.split('\n').length)), [
    [4, 5, 4, 1, 4, 5, 4, 2], [1, 4, 4, 4, 4, 1, 4, 4, 4, 4, 1, 4, 4, 4, 4, 6, 1, 10, 4, 1, 12],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    'efef0bf07391c8dd045eed7f6a0537851cd37a9cbe0e25b465fc3abeb3a8f9e6',
    '46d74a3e891a0268f9f1efee84138e4a18e2adf9f84a87dfa1fc45d2a4fbce9f',
  ]);
  const [justice, havana] = selected;
  assert.match(justice.text, /^Aquês que tên fama d’honrados n’a vila[\s\S]*Fiẍeronm’un leito de toẍos e silvas,[\s\S]*\n\n—\n\n—Salvademe[\s\S]*Y-a lua escondiese,[\s\S]*Eu, n’eles; y as leises, n’a man qu’os ferira\.$/);
  assert.match(justice.context, /Spanish self-translation.*same work.*not included/);
  assert.deepEqual([...havana.text.matchAll(/^(I|II|III|IV|V)$/gm)].map(match => match[1]), ['I', 'II', 'III', 'IV', 'V']);
  assert.match(havana.text, /^I\n\nVenderonll’os bois,[\s\S]*\n\nV\n\nEste vaise y aquel vaise[\s\S]*Que ninguen consolará\.$/);
  assert.match(havana.context, /five numbered parts form one work.*last part, not a separate poem/);
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.authorId, 'rosalia-de-castro');
    assert.equal(poem.lang, 'gl');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.match(poem.yearLabel, /1880 printing · not necessarily composition date/);
    assert.match(poem.source, index === 0 ? /#page=93$/ : /#page=247$/);
    for (const query of [poem.title, ...poem.searchAliases]) {
      assert.ok(filterPoems([poem], { language: 'Galician', query }).includes(poem), query);
    }
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="gl" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Exact titles, texts and openings cannot rule out every variant or translation.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const opening = fold(added.text.split('\n').filter(line => line && !/^(I|II|III|IV|V|—)$/.test(line)).slice(0, 2).join(' '));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-galician-classics-2.py', '--check'], { encoding: 'utf8' }), /Verified 2 historical readings/);
});

test('Galician classics preserve three complete 1863 readings and source boundaries', () => {
  const ids = ['adios-rios', 'airinos', 'campanas-de-bastabales'].map(id => `recognized-galician-classics-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-galician-classics-')).length, 3);
  assert.deepEqual(selected.map(lineCount), [52, 106, 100]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '7503d6a4f3c5691141af6f6c26d9daeef1a6e4f0d99c48ca9e6e14eb84de3aa0',
    'c0853ce133fe0b4da7302f0cc2f9fedb06883e84b3767e72b55960dfaba2c2fb',
    '460c3a56fad43dd1af52c4649c59f26e76ba240632163c8c8104010163162a15',
  ]);
  const [adios, airinos, campanas] = selected;
  assert.match(adios.text, /^Adios rios, adios fontes,[\s\S]*· · · · · · · · · · ·[\s\S]*¡Miña casiña! meu lar!$/);
  assert.match(adios.context, /later editions add and alter stanzas.*attribution are not independently established.*not a separate work/);
  assert.match(airinos.text, /^Airiños, airiños aires,[\s\S]*Éivos de berrar: ¡airiños\nAiriños, leváime á ela!$/);
  assert.match(airinos.context, /introductory copla.*attribution are not independently established/);
  assert.deepEqual(campanas.text.split('\n').filter(line => /^(I|II|III|IV|V)\.$/.test(line)), ['I.', 'II.', 'III.', 'IV.', 'V.']);
  assert.match(campanas.context, /five numbered sections are one complete work.*not five poems/);
  assert.match(campanas.text, /· · · · · · · · · · ·[\s\S]*Campanas de Bastabales,\nCando vos oyo tocar,\nMórrome de soidades\.$/);
  assert.ok(readingLanguages.includes('Galician'));
  const queries = [
    ['Adiós ríos, adiós fontes', 'Miña terra', 'Rosalia de Castro'],
    ['Airiños, airiños, aires', 'airin\u0303os da min\u0303a terra'],
    ['Campanas de Bastavales', 'Cando vos oio tocar'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.language, 'Galician');
    assert.equal(poem.lang, 'gl');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'Galician', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="gl" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const opening = fold(added.text.split('\n').filter(Boolean).slice(0, 2).join(''));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        assert.ok(!fold(text).includes(opening), `${added.id} overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-galician-classics.py', '--check'], { encoding: 'utf8' }), /Verified 3 historical readings/);
});

test('Galician search preserves ñ and canonical equivalence without changing other-language translations', () => {
  const example = { ...poems[0], author: 'Test', authorOriginal: '', title: 'Test', displayTitle: '',
    country: '', era: '', form: 'Verse', collection: '', language: 'Galician', lang: 'gl', themes: [], translations: [], authorAliases: [], searchAliases: [] };
  const a = { ...example, id: 'galician-a', text: 'niño canón', searchAliases: ['añada'], translations: [
    { language: 'French', title: 'Étoile', text: 'rivière' }, { language: 'Galician', title: 'Peña', text: 'señor' },
  ] };
  const b = { ...example, id: 'galician-b', text: 'nino canon' };
  const ids = query => filterPoems([a, b], { query }).map(poem => poem.id);
  assert.deepEqual(ids('nin\u0303o'), ['galician-a']);
  assert.deepEqual(ids('NIÑO'), ['galician-a']);
  assert.deepEqual(ids('nino'), ['galician-b']);
  assert.deepEqual(ids('canón'), ['galician-a', 'galician-b']);
  assert.deepEqual(ids('an\u0303ada'), ['galician-a']);
  assert.deepEqual(ids('anada'), []);
  assert.deepEqual(ids('sen\u0303or'), ['galician-a']);
  assert.deepEqual(ids('senor'), []);
  assert.deepEqual(ids('etoile'), ['galician-a']);
  assert.deepEqual(ids('riviere'), ['galician-a']);
  assert.equal(normalizeGalician('nin\u0303o'), normalizeGalician('niño'));
  assert.notEqual(normalizeGalician('niño'), normalizeGalician('nino'));
  assert.equal(normalizeGalician('canón'), normalizeGalician('canon'));
  const spanish = { ...example, id: 'spanish', language: 'Spanish', text: 'niño' };
  assert.deepEqual(filterPoems([spanish], { query: 'nino' }).map(poem => poem.id), ['spanish']);
});

test('world classics 8 preserve complete historical readings and distinct works', () => {
  const ids = ['luo-feng', 'castro-dicen', 'hopkins-gods-grandeur', 'yeats-wandering-aengus']
    .map(id => `recognized-world-classics-8-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-world-classics-8-')).length, 4);
  assert.deepEqual(selected.map(lineCount), [4, 15, 14, 24]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    [4], [8, 5, 2], [8, 6], [8, 8, 8],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    'a97772274876d42d0561ebb592b12a25ab8d6408b22cda464b86ab5715db0819',
    '8dcba39ed04fe0f286d19876cd7e94ddfba637534fe6ec8f1fbb478403cedc25',
    '92d096e58fc8eb4fbb2026a894f718de2a04ea606b6ddab2fcb0675f3338860f',
    'f82832470aed82407beddbd97b5c2cbc4e072d1b0b2020a4c9f73ee6ba98ba44',
  ]);
  const [bee, castro, grandeur, aengus] = selected;
  assert.equal(bee.text, '不論平地與山尖，\n無限風光盡被占。\n採得百花成蜜後，\n為誰辛苦為誰甜。');
  assert.match(bee.context, /title ends p\. 20.*p\. 21.*不知 as an alternative to 為誰/);
  assert.match(castro.text, /^Dicen que no hablan las plantas[\s\S]*murmureis de mis sueños,\nSin ellos, ¿cómo admiraros ni como vivir sin ellos\?$/);
  assert.match(castro.context, /untitled poem.*asterisk marker.*unaccented second como/);
  assert.match(grandeur.text, /^The world is charged with the grandeur of God\.[\s\S]*World broods with warm breast and with ah! bright wings\.$/);
  assert.match(grandeur.context, /title page does not print a year.*catalogues the Bridges edition as 1918/);
  assert.match(aengus.text, /^I went out to the hazel wood,[\s\S]*The silver apples of the moon,\nThe golden apples of the sun\.$/);
  assert.match(aengus.context, /second crosses the page turn.*author's note is prose/);
  const queries = [
    ['不论平地与山尖', '不知辛苦为谁甜', '罗隐'],
    ['Dicen que no hablan las plantas', 'Astros y fuentes y flores', 'Rosalia de Castro'],
    ['God’s Grandeur', 'the dearest freshness deep down things'],
    ['Song of the Wandering Aengus', 'the silver apples of the moon'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: poem.language, query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="${poem.lang}" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Opening checks include translations, but cannot rule out all paraphrases or variants.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const opening = fold(added.text.split('\n').filter(Boolean).slice(0, 2).join(''));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        assert.ok(!fold(text).includes(opening), `${added.id} overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-world-classics-8.py', '--check'], { encoding: 'utf8' }), /Verified 4 historical readings/);
});

test('world classics 7 preserve complete historical readings and distinct works', () => {
  const ids = ['li-wujiang', 'lu-shi-er', 'ouyang-huamei-niao', 'rilke-herbst',
    'yeats-wild-swans', 'yeats-irish-airman', 'yeats-stolen-child'].map(id => `recognized-world-classics-7-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-world-classics-7-')).length, 7);
  assert.deepEqual(selected.map(lineCount), [4, 4, 4, 9, 30, 16, 53]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    [4], [4], [4], [3, 2, 2, 2], [6, 6, 6, 6, 6], [16], [12, 15, 14, 12],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    'ea5f19febc73e99ee9e4df9f2aa6925ee23989b17a0f30863355545cc3cf15f7',
    '16990dd062ecf7246706c37810e15b3c3414a119fb4b36deaf28eaf8e7e50d65',
    '67137f818e49e7e068926368e4f937d53d4d0488612214e7bdc3c19aad8e55ba',
    'eaa18fd39167141fbc7973a4b3c236a7b7cac5207be99ba6a7de1fbce2f159d9',
    '64c6877d00b3fb5a26a9aa6ba85cec54f2ce8e2d0b62a15b8c5b39a784b181a4',
    '417c0ea6367b933da8601ac580f709558fa89a46ee0471be54a67905746b15b8',
    '099f3e76400443965a67c570639547df4ba11d95fc0bd5ad1e39252869cb598d',
  ]);
  const [li, lu, ouyang, herbst, swans, airman, stolen] = selected;
  assert.match(li.text, /^生當作人傑，\n死亦為鬼雄。\n至今思項羽，\n不肯過江東。$/);
  assert.match(li.context, /rather than printing a separate heading.*分得知字/);
  assert.match(lu.text, /^死去元知萬事空，\n但悲不見九州同。\n王師北定中原日，\n家祭無忘告乃翁。$/);
  assert.match(lu.context, /元知 and 無忘.*原知 and 毋忘.*same title/);
  assert.match(ouyang.text, /^百囀千聲隨意移，\n山花紅紫樹高低。\n始知鎖向金籠聽，\n不及林間自在啼。$/);
  assert.match(ouyang.context, /郡齋聞百舌.*任 as an alternate to 隨/);
  assert.match(herbst.text, /^Die Blätter fallen[\s\S]*Und doch ist Einer welcher dieses Fallen\nunendlich sanft in seinen Händen hält\.$/);
  assert.match(herbst.context, /distinct from Herbsttag.*without a comma/);
  assert.equal(poems.filter(poem => poem.id === 'recognized-crossroads-rilke-herbsttag').length, 1);
  assert.match(swans.text, /^The trees are in their autumn beauty,[\s\S]*The nineteenth Autumn[\s\S]*Delight men’s eyes when I awake some day\nTo find they have flown away\?$/);
  assert.match(airman.text, /^I know that I shall meet my fate[\s\S]*Nor public man, nor angry crowds,[\s\S]*In balance with this life, this death\.$/);
  assert.match(airman.context, /1919 printing reads Nor public man, nor angry crowds.*men and\/or cheering/);
  assert.match(stolen.text, /^Where dips the rocky highland[\s\S]*faery vats\.\nFull of berries,[\s\S]*And is anxious in its sleep\.[\s\S]*From a world more full of weeping than he can understand\.$/);
  assert.match(stolen.context, /title page is dated 1920.*publication in 1906.*does not establish/);
  assert.match(stolen.context, /italic refrains are presented in plain text/);
  assert.equal(stolen.era, '19th century');

  const queries = [
    ['夏日绝句', '生当作人杰'],
    ['示儿', '死去原知萬事空', '家祭毋忘告乃翁'],
    ['画眉鸟', '百啭千声任意移', '郡齋聞百舌', 'The Hwamei'],
    ['Die Blätter fallen', 'Einer, welcher dieses Fallen'],
    ['The Wild Swans at Coole', 'nine and fifty swans'],
    ['An Irish Airman Foresees His Death', 'Nor public men, nor cheering crowds'],
    ['The Stolen Child', 'Come away O human child'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: poem.language, query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="${poem.lang}" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Openings include translations, but cannot exclude every paraphrase or attribution.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const opening = fold(added.text.split('\n').filter(Boolean).slice(0, 2).join(''));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        assert.ok(!fold(text).includes(opening), `${added.id} overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-world-classics-7.py', '--check'], { encoding: 'utf8' }), /Verified 7 historical readings/);
});

test('world classics 6 preserve complete 1921 Swedish readings and distinct works', () => {
  const ids = ['andersson-omkring-tiggarn', 'andersson-spelmans-jordafard', 'andersson-till-min-syster']
    .map(id => `recognized-world-classics-6-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-world-classics-6-')).length, 3);
  assert.deepEqual(selected.map(lineCount), [36, 49, 16]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    Array(9).fill(4), [...Array(5).fill(8), 9], Array(4).fill(4),
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    'aca50c3383d0133c3e2f7f6146deab449a5bd06db2791d925590a3f4389a0b17',
    'fb58ef526de8c818d35d72dc40fcfc7ea92382f228596458b39029780fb6c94b',
    '33fcd8cd9d74d8e0468a05c8e821f941ec8b3d2caaa4d553f3761ac12c0fc2a9',
  ]);
  const [beggar, funeral, sister] = selected;
  assert.match(beggar.text, /^Omkring tiggarn från Luossa satt allt folket i en ring,[\s\S]*Det är något bortom bergen[\s\S]*barn av saligheten bo\.»$/);
  assert.match(beggar.context, /1921 contents names it at p\. 81.*page itself has no title/);
  assert.match(funeral.text, /^Förr än rosig morgon lyser över Himmelmora kamm,[\s\S]*han led ofta brist på husrum och bröd\.[\s\S]*en spelman och en drömmare är död\.$/);
  assert.match(funeral.context, /Himmelmora kamm.*kam and adds av/);
  assert.match(sister.text, /det starka oss till läkedom[\s\S]*En sång till däj, min syster[\s\S]*kom ut till oss och sov!$/);
  assert.match(sister.context, /four complete quatrains.*En gamling/);

  const queries = [
    ['Omkring tiggarn från Luossa', 'Det är något bortom bergen'],
    ['En spelmans jordafärd', 'Himmelmora kam'],
    ['Till min syster', 'En sång till dej min syster'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'Swedish', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="sv" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Openings include translations, but cannot exclude every paraphrase.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const opening = fold(added.text.split('\n').filter(Boolean).slice(0, 2).join(''));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        assert.ok(!fold(text).includes(opening), `${added.id} overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-world-classics-6.py', '--check'], { encoding: 'utf8' }), /Verified 3 historical readings/);
});

test('world classics 5 preserve complete historical readings and distinct works', () => {
  const ids = ['su-ti-xilin-bi', 'cao-guancang-shu', 'yu-yong-ying', 'andersson-jag-vantar',
    'andersson-halgdagskvall'].map(id => `recognized-world-classics-5-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-world-classics-5-')).length, 5);
  assert.deepEqual(selected.map(lineCount), [4, 4, 4, 16, 36]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    [4], [4], [4], [4, 4, 4, 4], Array(9).fill(4),
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '491f43c0c21df7e8dc40632bab6c60871a2322ca6cac1c99e5998d428deaf184',
    'c26b99619b950b69be5ffcf92de901c95f0302d3e3af070747d7f18c86165552',
    '4a113bd05d548083c16047eac8d7ceb728686f65f00769ab2a81f49ca2254b55',
    '6cbbfb97ae72a77efa596a55c80bbe26c7d9787267eccc6a92104abd5336539d',
    'f3a1dda72d14b2ade11ea7d37f66f954a2f4971206a8322c6c679f738b1a4784',
  ]);
  const [su, cao, yu, waiting, evening] = selected;
  assert.match(su.text, /^橫看成嶺側成峰，\n遠近高低各不同。\n不識廬山真面目，\n只緣身在此山中。$/);
  assert.match(su.context, /看山了 and 無一 as alternatives, not extra verse.*prose 記遊廬山, not a second work/);
  assert.match(cao.text, /^官倉老鼠大如斗，\n見人開倉亦不走。\n健兒無糧百姓饑，\n誰遣朝朝入君口。$/);
  assert.match(cao.context, /大如斗.*牛 as an alternative, not additional verse/);
  assert.match(yu.text, /^的歷流光小，\n飄颻弱翅輕。\n恐畏無人識，\n獨自暗中明。$/);
  assert.match(yu.context, /heading is at the end of PDF p\. 14.*p\. 15 before 蟬/);
  assert.match(waiting.text, /Jag tänkt mig en vandrande snöhöljd blomma,\n[\s\S]*Jag väntar vid min mila[\s\S]*den käraste, den käraste med ögon blå\.$/);
  assert.match(waiting.context, /four complete quatrains.*Till kvinnan.*comma after blomma/);
  assert.match(evening.text, /här är hälg, djupt i skogarnas ro![\s\S]*spela en vals[\s\S]*medan elden falnar och dör\.$/);
  assert.match(evening.context, /nine complete quatrains.*När Gasken dog.*hälg.*helg.*spela en vals/);

  const queries = [
    ['題西林壁', '题西林壁', '横看成岭侧成峰', '遠近高低無一同'],
    ['官倉鼠', '官仓鼠', '官仓老鼠大如斗', '官倉老鼠大如牛'],
    ['詠螢', '咏萤', '的历流光小', '飘摇弱翅轻'],
    ['Jag väntar', 'Jag väntar vid min mila', 'Dan Andersson'],
    ['Hälgdagskväll i timmerkojan', 'Helgdagskväll i timmerkojan', 'här är helg'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: poem.language, query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="${poem.lang}" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Opening checks include translations but cannot exclude every paraphrase.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const opening = fold(added.text.split('\n').filter(Boolean).slice(0, 2).join(''));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        assert.ok(!fold(text).includes(opening), `${added.id} overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-world-classics-5.py', '--check'], { encoding: 'utf8' }), /Verified 5 historical readings/);
});

test('world classics 4 preserve complete historical readings and distinct works', () => {
  const ids = ['shelley-ode-west-wind', 'hopkins-windhover', 'hopkins-pied-beauty', 'trakl-grodek',
    'tyutchev-silentium', 'tyutchev-vesennyaya-groza'].map(id => `recognized-world-classics-4-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-world-classics-4-')).length, 6);
  assert.deepEqual(selected.map(lineCount), [75, 14, 11, 17, 18, 16]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    Array(5).fill([1, 3, 3, 3, 3, 2]).flat(), [8, 3, 3], [6, 5], [17], [6, 6, 6], [4, 4, 4, 4],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '82612be9a52fdcd73ddfbf5f4ca6b483cfaeb35992ad37a4e0b990504ce13a29',
    '94766b060cec939be812a113e18a19940931a7996f15cde9cb12d0697ce400e6',
    'fc2ba08a21677fc502674e74f8f6834530bcbc3b95f5764b52a827f757b1af4f',
    '625ca7ac44dca5dc1ac540cc8d5d5805043cbb0d181ca8f0b569bdb5a8751b67',
    '3ea94e0e04f280db743805a50ac1e782056f97057f0809277d2f79fab3f9a36f',
    '5987027bf0157eac3952e70eff5d24cf8b61fe1f965e47fc63b3631ed27b8037',
  ]);
  const [shelley, windhover, pied, grodek, silentium, spring] = selected;
  assert.deepEqual(shelley.text.split('\n').filter(line => /^(I|II|III|IV|V)\.$/.test(line)), ['I.', 'II.', 'III.', 'IV.', 'V.']);
  assert.match(shelley.text, /O, wild West Wind[\s\S]*moving every where;[\s\S]*airy surge[\s\S]*uncontroulable![\s\S]*If Winter comes, can Spring be far behind\?$/);
  assert.match(shelley.context, /five numbered fourteen-line sections.*line count includes the five section numbers/);
  assert.match(shelley.context, /Shelley's printed footnote reads: 'This poem was conceived[\s\S]*winds which announce it\.' This is the poet's historical note/);
  assert.match(windhover.text, /minion, king-\ndom of daylight’s dauphin[\s\S]*ecstacy![\s\S]*shéer plód[\s\S]*gold-vermillion\.$/);
  assert.match(windhover.context, /dedication is To Christ our Lord.*Pied Beauty begins on the next page/);
  assert.match(pied.text, /trout that swim:[\s\S]*áll trádes[\s\S]*fathers-forth[\s\S]*Praise him\.$/);
  assert.match(grodek.text, /Von tötlichen Waffen[\s\S]*Düster hinrollt[\s\S]*Die ungebornen Enkel\.$/);
  assert.match(grodek.context, /1914 date is not verse.*tötlichen and Düster.*tödlichen and Düstrer/);
  assert.match(grodek.rights, /Ficker died in 1967.*check local law/);
  assert.match(silentium.text, /И всходят и зайдут оне\nКак звезды ясные в ночи:[\s\S]*Дневные ослепят лучи:/);
  assert.match(silentium.context, /1836 printing.*Встают и заходят оне.*Дневные разгонят лучи.*one work/);
  assert.equal(titleAttributes(silentium), ' lang="la" dir="ltr"');
  assert.match(spring.text, /Ты скажешь: ветренная Геба,[\s\S]*Смеясь, на землю пролила\.$/);
  assert.match(spring.context, /four quatrains, including the final Hebe stanza.*Сон на море follows/);
  assert.equal(poems.filter(poem => poem.id === 'goethe-ein-gleiches').length, 1);
  assert.ok(!selected.some(poem => /ein gleiches|über allen gipfeln/i.test(`${poem.title} ${poem.text}`)));

  const queries = [
    ['Ode to the West Wind', 'everywhere', 'O uncontrollable', 'If Winter comes'],
    ['The Windhover', "kingdom of daylight's dauphin", 'sheer plod makes plough down sillion'],
    ['Pied Beauty', 'Glory be to God for dappled things', 'He fathers forth'],
    ['Grodek', 'Gródek', 'Von tödlichen Waffen', 'Düstrer hinrollt'],
    ['Silentium!', 'Молчи скрывайся и таи', 'Безмолвно как звезды в ночи', 'Федор Тютчев'],
    ['Весенняя гроза', 'Люблю грозу в начале мая', 'ветреная Геба', 'Spring Thunderstorm'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: poem.language, query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="${poem.lang}" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Title/opening checks include translations, but cannot exclude every paraphrase.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '')
    .replace(/æ/g, 'ae').replace(/ß/g, 'ss').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const opening = fold(added.text.split('\n').filter(line => line.trim() && !/^(I|II|III|IV|V)\.$/.test(line)).slice(0, 2).join(''));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        assert.ok(!fold(text).includes(opening), `${added.id} overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-world-classics-4.py', '--check'], { encoding: 'utf8' }), /Verified 6 historical readings/);
});

test('world classics 3 preserve complete readings, source distinctions and discovery', () => {
  const ids = ['zhang-chunjiang-huayueye', 'bai-mujiangyin', 'sikong-jiangcun-jishi', 'wang-xiaosong',
    'dario-a-roosevelt', 'dario-cancion-otono', 'gongora-soneto-x', 'leino-rauhattoman-rukous']
    .map(id => `recognized-world-classics-3-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-world-classics-3-')).length, 8);
  assert.deepEqual(selected.map(lineCount), [36, 4, 4, 4, 51, 69, 14, 48]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    [36], [4], [4], [4], [8, 6, 5, 10, 21, 1], [...Array(17).fill(4), 1], [4, 4, 3, 3], Array(6).fill(8),
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '28dbf54df6142bdbd25f51fbec61a048e2cb31f9bc82eb11a63a93e21be3415e',
    '6a907e1dfccfd57d73f286f05cadcf2d1260333602d63f472f6d5d9988350ad9',
    '5872a1530259644c9dc2077a9aac3b9cdfe5289815674963032ee79132617940',
    'adcafa1249ab9fad4e1b23b8782435394ad93dd9c81eca520349139dcdddf481',
    '1f0c7376225b699a7bfd6eb508a6157dc120df209e68ef2b49b1b33466fd65ee',
    '38c5ff652b79cff7522c8494714bc2618da6c332f713c6166333d5a81c1c1948',
    'ffb8fa88b8794ea435e9386e33cd81ebe8ccfe06c6cbc4eff1d1bc1a08544f63',
    'ae00e33ffdbcf43147c9e9f07e83edd44bd645b3e508c79b1d8ab24bb4c5fb76',
  ]);
  const [zhang, bai, sikong, wang, roosevelt, cancion, gongora, leino] = selected;
  assert.match(zhang.text, /江月年年祇相似。[\s\S]*斜月沈沈藏海霧，[\s\S]*落月遙情滿江樹。$/);
  assert.match(zhang.context, /遥情滿江樹.*遙情.*搖情.*variants.*not additional verse/);
  assert.match(bai.text, /可憐九月初三夜，\n露似真珠月似弓。$/);
  assert.match(bai.context, /competing accounts of when and where/);
  assert.match(sikong.context, /heading is at the end of PDF p\. 83.*verse ends the volume on p\. 84.*next volume begins on p\. 85/);
  assert.match(wang.context, /傍\/旁 as variant/);
  assert.match(roosevelt.text, /Eres el futuro invasor[\s\S]*Netzahualcoyotl,[\s\S]*Vive de luz, de fuego, de perfume, de amor,[\s\S]*falta una cosa: Dios!$/);
  assert.match(roosevelt.context, /historical generalizations.*poet's rhetoric, not the library's claims/);
  assert.match(cancion.text, /La otra fué más sensitiva,\nY más consoladora y más\nHalagadora y expresiva,/);
  assert.match(cancion.text, /En sus brazos tomó mi ensueño[\s\S]*Imaginar siempre un Eden,[\s\S]*Mas es mía el Alba de oro!$/);
  assert.match(cancion.context, /seventeen quatrains and a final line.*1918 transcription orders.*differently/);
  assert.match(gongora.text, /el Sol relumbra en vano[\s\S]*luciente marfil[\s\S]*marfil luciente[\s\S]*En tierra, en humo, en polvo, en sombra, en nada\.$/);
  assert.match(gongora.context, /long-s, u\/v, ç\/z.*punctuation and sonnet stanza breaks are supplied independently/);
  assert.match(leino.text, /^Minä tääll’ olen vieras[\s\S]*joka joutunut tääll’ ei harhaan\?[\s\S]*viedä suurelle virittäjälleen\.$/);
  assert.match(leino.context, /fifth stanza crosses a page.*Mua pelottaa/);
  const queries = [
    ['张若虚', '春江潮水连海平', '落月摇情满江树', '江月年年只相似'],
    ['白居易', '一道残阳铺水中', '露似珍珠月似弓'],
    ['江村即事', '钓罢归来不系船', '纵然一夜风吹去'],
    ['小松初数尺', '闲即旁边立', '看多长却迟'],
    ['A Roosevelt', 'Walt Whitman', 'Nueva-York'],
    ['Canción de otoño en primavera', 'Juventud, divino tesoro', 'Era su cabellera oscura'],
    ['Mientras por competir con tu cabello', 'del luciente cristal', 'en tierra en polvo en humo'],
    ['Rauhattoman rukous', 'Minä täällä olen vieras', 'joulu-yö'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: poem.language, query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="${poem.lang}" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Opening and title checks cannot rule out every paraphrase or translation.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const readings = [added.text, ...(added.searchAliases || []).filter(alias => alias.includes('\n'))];
    for (const reading of readings) {
      const opening = fold(reading.split('\n').filter(Boolean).slice(0, 2).join(''));
      for (const other of poems.filter(poem => poem.id !== added.id)) {
        if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
        for (const text of [other.text, ...other.translations.map(item => item.text)]) {
          assert.ok(!fold(text).includes(opening), `${added.id} overlaps ${other.id}`);
        }
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-world-classics-3.py', '--check'], { encoding: 'utf8' }), /Verified 8 historical readings/);
});

test('world classics preserve complete witness readings, variants and source limits', () => {
  const ids = ['wang-bochuan-guazhou', 'su-huaizhong-wanbo-dutou', 'garcilaso-soneto-v', 'garcilaso-soneto-xiii',
    'rimbaud-sensation', 'dubellay-regrets-xxxi', 'lamartine-le-lac'].map(id => `recognized-world-classics-2-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-world-classics-2-')).length, 7);
  assert.deepEqual(selected.map(lineCount), [4, 4, 14, 14, 8, 14, 64]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    [4], [4], [4, 4, 3, 3], [4, 4, 3, 3], [4, 4], [4, 4, 3, 3], Array(16).fill(4),
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '3d419182e68f2852fcd5928bd2e43d1a4bf1be4b7ab60b28001eec26d4d897ea',
    '668b92e08137926e657914b3778b1057d44b88358ec61a9ee4e28e256c08934b',
    '4b96b9e41bb3fdf3ef624b5b09ded1b1dd495468d10686a2baff31e7dad269bf',
    '1668aa8bd7561a95208df0ddc6d487df10ee66f773a6464d555daeea454906a7',
    '02fecbfe33b2c8054424786f5c1854084e0e507d98ba75dbf241b05b6334b514',
    '079aff81fabb3e5c0421b31c5f1bde928621b2657df5f93f245472d3656e0ef0',
    '290cb0eada58ebf72eee46010dad89d992553e14727fb1c9d4815873f206d273',
  ]);
  const [wang, su, quinto, dafne, sensation, ulysse, lac] = selected;
  assert.match(wang.text, /鍾山祇隔數重山。\n春風自綠江南岸，/);
  assert.match(wang.context, /春風自綠江南岸.*春風又綠江南岸.*quotation/);
  assert.match(su.context, /following page begins 暑中閑詠.*exact 四部叢刊 impression.*隂 and 㸔/);
  assert.match(quinto.text, /escrebir.*\nvos sola lo escrebistes[\s\S]*cortado á su medida/);
  assert.match(dafne.text, /los cabellos que al oro escurecían[\s\S]*lloralla cresca cada día/);
  assert.match(dafne.context, /que al oro and cresca.*qu’el oro and crezca/);
  assert.match(quinto.rights, /public domain in the United States.*1979.*check local law/);
  assert.match(sensation.text, /je ne penserai rien ;[\s\S]*avec une femme !$/);
  assert.match(sensation.context, /Mars 1870.*not independently verified/);
  assert.match(ulysse.text, /basty mes ayeux\.\nQue des palais Romains.*\nPlus que le marbre dur me plaist l’ardoise fine\./);
  assert.match(ulysse.context, /title page visibly says 1910.*metadata says 1903/);
  assert.equal(lac.title, 'Le Lac de B***');
  assert.match(lac.text, /O temps ! suspends ton vol ; et vous, heures propices !/);
  assert.match(lac.text, /Que les jours du malheur \?[\s\S]*Tout dise : Ils ont aimé !$/);
  assert.match(lac.context, /16-quatrain.*first edition was unsigned.*attributed|16-quatrain.*first edition was unsigned.*attributes/);
  const queries = [
    ['泊船瓜洲', '春风自绿江南岸', '春風又綠江南岸', '钟山只隔数重山'],
    ['淮中晚泊犊头', '苏舜钦', '春阴垂野草青青', '滿川風雨㸔潮生'],
    ['Escrito está en mi alma', 'escribir de vos deseo', 'vos sola lo escribistes'],
    ['A Dafne ya los brazos', 'los cabellos qu’el oro escurecían', 'llorarla crezca cada día'],
    ['Sensation', 'Arthur Rimbaud', 'soirs bleus d’été'],
    ['Heureux qui, comme Ulysse', 'Quand reverrai-je', 'Plus mon Loire gaulois'],
    ['Le Lac', 'Ô temps suspends ton vol', 'devoit revoir', 'Alphonse de Lamartine'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: poem.language, query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="${poem.lang}" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Matching openings and titles cannot exclude every translated paraphrase.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const readings = [added.text, ...(added.searchAliases || []).filter(alias => alias.includes('\n'))];
    for (const reading of readings) {
      const opening = fold(reading.split('\n').filter(Boolean).slice(0, 2).join(''));
      for (const other of poems.filter(poem => poem.id !== added.id)) {
        if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
        for (const text of [other.text, ...other.translations.map(item => item.text)]) {
          assert.ok(!fold(text).includes(opening), `${added.id} overlaps ${other.id}`);
        }
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-world-classics-2.py', '--check'], { encoding: 'utf8' }), /Verified 7 historical readings/);
});

test('multilingual classics preserve complete historical readings and source cautions', () => {
  const ids = ['du-jiangnan-chun', 'zhu-chunri', 'ye-youyuan-buzhi', 'lin-ti-linan-di', 'su-zeng-liu-jingwen', 'frost-mending-wall']
    .map(id => `recognized-multilingual-classics-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-multilingual-classics-')).length, 6);
  assert.deepEqual(selected.map(lineCount), [4, 4, 4, 4, 4, 45]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '52b003b27b19cf009cc9aff9ca83364618f930f529b6388722f9315cd95f6279',
    '2484dc7f347e44308465840a05f8282305df7f41d2444b847c60ad8457ce72dd',
    '503134a55141ebcfa6a1374f94f25b4be6aa48d938ca3c24757c35c661efe826',
    'b0f71ade66f74b73283a2b468f8d437d70e822df2eb0e5cf46360d585c72184c',
    'fc1f2156134105ca8af51e8a39c6946206705704102a4c82359af8b8c5eacd06',
    '946459f7c7dbe821f4338856634db322b3183f07e1d0c52e1205a77aaa52b462',
  ]);
  const [du, zhu, ye, lin, su, frost] = selected;
  assert.equal(du.authorId, 'du-mu');
  assert.match(du.context, /exact 四部叢刊 impression has not been independently dated/);
  assert.match(zhu.text, /^勝日尋芳泗水濱/);
  assert.match(ye.text, /^應嫌屐齒印蒼苔，\n十扣柴扉九不開。/);
  assert.match(ye.context, /葉清逸.*靖逸.*應憐.*小扣柴扉久不開/);
  assert.match(lin.context, /西湖.*林夢屏.*題臨安邸.*薰.*熏/);
  assert.match(su.context, /冬景.*蘇東坡.*贈劉景文.*蘇軾/);
  assert.equal(frost.authorId, 'robert-frost');
  assert.match(frost.text, /neighbour know[\s\S]*neighbours[\s\S]*offence[\s\S]*neighbours\.”$/);
  assert.match(frost.rights, /public domain in the United States.*died in 1963.*check local law/);
  assert.match(frost.context, /hanging printer wraps are rejoined into 45 verse lines/);
  const queries = [
    ['江南春', '江南春绝句', '千里莺啼绿映红'],
    ['朱熹', '胜日寻芳泗水滨', '万紫千红总是春'],
    ['叶绍翁', '游园不值', '应嫌屐齿印苍苔', '应怜屐齿印苍苔', '小扣柴扉久不开'],
    ['林梦屏', '题临安邸', '暖风熏得游人醉'],
    ['苏东坡', '赠刘景文', '荷尽已无擎雨盖'],
    ['Mending Wall', 'Robert Frost', 'frozen-ground-swell'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: poem.language, query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="${poem.lang}" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Exact openings cannot rule out every variant or translated paraphrase.
  const fold = text => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const readings = [added.text, ...(added.searchAliases || []).filter(alias => alias.includes('\n'))];
    for (const reading of readings) {
      const opening = fold(reading.split('\n').slice(0, 2).join(''));
      for (const other of poems.filter(poem => poem.id !== added.id)) {
        if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
        for (const text of [other.text, ...other.translations.map(item => item.text)]) {
          assert.ok(!fold(text).includes(opening), `${added.id} overlaps ${other.id}`);
        }
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-multilingual-classics.py', '--check'], { encoding: 'utf8' }), /Verified 6 historical readings/);
});

test('Song classics preserve distinct historical readings, variants and source limits', () => {
  const ids = ['wang-meihua', 'wang-yuanri', 'wang-deng-feilaifeng', 'yang-xiaochi']
    .map(id => `recognized-song-classics-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-song-classics-')).length, 4);
  assert.deepEqual(selected.map(lineCount), [4, 4, 4, 4]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '26610cdd4fc6e9c4fd46ea2b81368f2966f3c46d865bbc868db51fe2270a1f8a',
    '334b20f6e7f9497504c34cb3c5c865f8eee6ab2cf7dca6f55d8f4f26b0d5b8b9',
    '167f87c38e2310b94e8e56bdb31f52394f0d97612a9444c6bfa5efdedc156a03',
    '35e10b62606a1919115855296a43f2e0e53c4cd631f93f13c9ee7af20efa3c27',
  ]);
  const [plum, newYear, peak, pond] = selected;
  assert.match(plum.context, /ends before the separately headed 紅梅/);
  assert.match(newYear.text, /東風送暖入屠蘇。\n千門萬戶曈曈日，\n爭插新桃換舊符。$/);
  assert.match(newYear.context, /next page.*before 九日.*東風 and 爭插.*春風 and 總把/);
  assert.match(peak.text, /^飛來山上千尋塔，[\s\S]*自緣身在最高層。$/);
  assert.match(peak.context, /飛來山上.*飛來峰上.*geographical identification is disputed/);
  assert.match(pond.text, /小荷纔露尖尖角/);
  assert.match(pond.context, /小荷纔露.*小荷才露.*隂 glyph is normalized to 陰/);
  const queries = [
    ['梅花', '王安石', 'Wang An-shih', '墙角数枝梅', '凌寒独自开'],
    ['元日', '爆竹声中一岁除', '东风送暖入屠苏', '春風送暖入屠蘇', '总把新桃换旧符'],
    ['登飛來峯', '登飛來峰', '登飞来峰', '飞来山上千寻塔', '飞来峰上千寻塔'],
    ['小池', '楊萬里', '杨万里', 'Yang Wan-li', '泉眼无声惜细流', '小荷才露尖尖角'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.year, null);
    assert.equal(poem.lang, 'zh-Hant');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.match(poem.context, /Line breaks and punctuation are supplied/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'Chinese', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="zh-Hant" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Historical and simplified openings cannot rule out every variant or translated paraphrase.
  const fold = text => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const simplified = added.searchAliases.find(alias => alias.includes('\n'));
    for (const reading of [added.text, simplified]) {
      const full = fold(reading);
      const opening = fold(reading.split('\n').slice(0, 2).join(''));
      for (const other of poems.filter(poem => poem.id !== added.id)) {
        if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
        for (const text of [other.text, ...other.translations.map(item => item.text)]) {
          const candidate = fold(text);
          assert.ok(!candidate.includes(full) && !candidate.includes(opening), `${added.id} overlaps ${other.id}`);
        }
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-song-classics.py', '--check'], { encoding: 'utf8' }), /Verified 4 historical readings/);
});

test('Dutch classics preserve distinct historical readings and source limits', () => {
  const ids = ['zie-je-ik-hou-van-je', 'de-pruimeboom', 'het-schryverke']
    .map(id => `recognized-dutch-classics-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => ids.includes(poem.id)).length, 3);
  assert.deepEqual(selected.map(lineCount), [16, 24, 44]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    [4, 4, 4, 4], [24], [44],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    'ee0b9f79cfb6745cd24d061c8d1b4312b35dea7bafe04be80f24d61748e2d194',
    'c2a6423d2c228a94e0739563af3efb6aeba7155c061b236b0430153f3400972f',
    '4d082d7b3f9930f1bb766b7f8584a64eddc5b9a957afba64341790d79f2a39ca',
  ]);
  const [gorter, alphen, gezelle] = selected;
  assert.match(gorter.text, /^Zie je ik hou van je,\nik vin je zoo lief en zoo licht —[\s\S]*Maar ik kan het toch niet zeggen\.$/);
  assert.match(gorter.context, /prints no title; the opening words serve as the title/);
  assert.match(alphen.text, /^Jantje zag eens pruimen hangen,\no! als eijeren zoo groot,[\s\S]*Jantje raapte schielijk op;\nJantje kreeg zijn hoed vol pruimen,\nen liep heen op een galop\.$/);
  assert.match(alphen.context, /continues for two lines on p\. 394.*Eene vertelling/);
  assert.match(gezelle.text, /^O krinklende winklende waterding,\nMet ’t zwarte kabotseken aen,[\s\S]*Het stelde en het regtte zyn oorkes flink,[\s\S]*Den heiligen Name van God!$/);
  assert.match(gezelle.context, /DBNL's diplomatic transcription.*not inspected page images.*Gyrinus natans.*later readings differ/);
  const queries = [
    ['Zie je, ik hou van je', 'Herman Gorter'],
    ['De pruimenboom', 'The plumtree', 'Hieronymus van Alphen'],
    ['Het schrijverke', 'Gyrinus natans', 'Guido Gezelle'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.lang, 'nl');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.yearLabel, /printing · not necessarily composition date/);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'Dutch', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="nl" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Exact text and openings do not exhaust every translated or variant duplicate.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const opening = fold(added.text.split('\n').slice(0, 2).join(' '));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-dutch-classics.py', '--check'], { encoding: 'utf8' }), /Verified 3 historical readings/);
});

test('Owen classics preserve complete 1920 readings and Latin markings', () => {
  const ids = ['anthem-for-doomed-youth', 'dulce-et-decorum-est', 'futility']
    .map(id => `recognized-owen-classics-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-owen-classics-')).length, 3);
  assert.deepEqual(selected.map(lineCount), [14, 28, 14]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    [8, 6], [8, 6, 2, 12], [7, 7],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '5d23ea32896f447c91fe1c0648583c707522659cbcf677a368e4810dde69eb3f',
    'c0bb2fd32233330de7a87bc676693498ebcefb89d93823a0937c3f7a36491218',
    'f0fb693076f327532baa3809b169bdb3160dd374c09136926fe9debb6820bff4',
  ]);
  const [anthem, dulce, futility] = selected;
  assert.match(anthem.text, /^What passing-bells for these who die as cattle\?[\s\S]*And each slow dusk a drawing-down of blinds\.$/);
  assert.match(dulce.text, /^Bent double, like old beggars under sacks,[\s\S]*Come gargling from the froth-corrupted lungs\nBitten as the cud\nOf vile, incurable sores[\s\S]*The old Lie: Dulce et decorum est\nPro patria mori\.$/);
  assert.match(dulce.context, /Bitten as the cud.*Bitter as the cud.*Obscene as cancer, bitter as the cud.*not a claim about Owen's final intention/);
  assert.match(futility.text, /^Move him into the sun—[\s\S]*Woke, once, the clays of a cold star\.[\s\S]*To break earth’s sleep at all\?$/);
  assert.equal(dulce.titleLang, 'la');
  assert.deepEqual(dulce.textLanguageSpans, [{ line: 27, text: 'Dulce et decorum est', lang: 'la' }]);
  assert.deepEqual(dulce.textLanguageOverrides, [{ line: 28, lang: 'la' }]);
  const dulceHtml = renderPoem(dulce, poems, '/ai-poems/');
  assert.match(dulceHtml, /<h1 lang="la" dir="ltr">Dulce et Decorum Est<\/h1>/);
  assert.ok(dulceHtml.includes('The old Lie: <span lang="la" dir="auto">Dulce et decorum est</span>\n<span lang="la" dir="auto">Pro patria mori.</span>'));
  const queries = [
    ['Anthem for Doomed Youth', 'What passing-bells for these'],
    ['Dulce et Decorum Est', 'Bitter as the cud', 'Obscene as cancer, bitter as the cud'],
    ['Futility', 'Move him into the sun'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.lang, 'en');
    assert.equal(poem.authorId, 'wilfred-owen');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.yearLabel, /1920 printing · not necessarily composition date/);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    for (const query of [...queries[index], 'Wilfred Owen']) {
      assert.ok(filterPoems([poem], { language: 'English', query }).includes(poem), query);
    }
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes('class="verse" lang="en" dir="ltr">'));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Exact text and openings do not exhaust every translated or variant duplicate.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const opening = fold(added.text.split('\n').slice(0, 2).join(' '));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-owen-classics.py', '--check'], { encoding: 'utf8' }), /Verified 3 historical readings/);
});

test('Coșbuc classics preserve complete, distinct 1897 readings', () => {
  const ids = ['nunta-zamfirei', 'rea-de-plata'].map(id => `recognized-cosbuc-classics-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-cosbuc-classics-')).length, 2);
  assert.deepEqual(selected.map(lineCount), [168, 24]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    Array(28).fill(6), Array(3).fill(8),
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '953b3027534d7a02d95d667f6a6c83dd6234da33ed5fc85e0b74895ef5150ac8',
    '529a13d6dd6db2f3ce0f053448d0b19bc9452c6660f2cfb48f13342e714e0f60',
  ]);
  const [wedding, payment] = selected;
  assert.match(wedding.text, /^E lung pământul, ba e lat,[\s\S]*să-și dee zor[\s\S]*Și Tinteș, cel cu trainic rost,[\s\S]*Pe-un grad de-alături privitor,[\s\S]*Și la botez!»$/);
  assert.match(wedding.context, /twenty-eight six-line stanzas.*Pe-un grad.*Pe-un gard/);
  assert.match(payment.text, /^Ea vine de la moară;\nȘi jos în ulicioară\nPunând un sac, în urmă[\s\S]*Dar uite, felul ei:\nStă ’n drum și să socoate,[\s\S]*P’un singur sărutat!$/);
  assert.match(payment.context, /three eight-line stanzas.*crosses a page break/);
  const queries = [
    ['Nunta Zamfirei', 'Nunta Zamfirii', 's-alerge-n zbor', 'Pe-un gard de-alături'],
    ['Rea de plata', 'Punându-și sacul, iacă'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.lang, 'ro');
    assert.equal(poem.authorId, 'george-cosbuc');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.yearLabel, /1897 second edition · not necessarily composition date/);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    for (const query of [...queries[index], 'Gheorghe Cosbuc']) {
      assert.ok(filterPoems([poem], { language: 'Romanian', query }).includes(poem), query);
    }
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="ro" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Exact text and openings do not exhaust every translated or variant duplicate.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const opening = fold(added.text.split('\n').slice(0, 2).join(' '));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-cosbuc-classics.py', '--check'], { encoding: 'utf8' }), /Verified 2 historical readings/);
});

test('additional Romanian classics retain complete 1884 readings and edition variants', () => {
  const ids = ['o-ramai', 'glossa'].map(key => `recognized-romanian-2-${key}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-romanian-2-')).length, 2);
  assert.deepEqual(selected.map(lineCount), [28, 80]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    Array(7).fill(4), Array(10).fill(8),
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '7a55bed07ac1d7844afbe9e56972288530c150766f7c32f9fb39b7ca07a3c741',
    '843ce4c5e52e957f47922b9909e864525266bdbf8edc28f5668a930602f1430b',
  ]);
  const [stay, glossa] = selected;
  assert.match(stay.text, /^«O rĕmăi, rĕmăi la mine[\s\S]*vuetul de valuri[\s\S]*Șueram l’a a ei chemare[\s\S]*Cu pădurea ta cu tot\?$/);
  assert.match(stay.text, /Clipe dulci se par ca veacuri\.»\n\nAstfel zise lin pădurea/);
  assert.match(stay.context, /repeats an opening quotation mark.*one opening mark/);
  assert.match(glossa.text, /^Vremea trece, vremea vine,[\s\S]*Să supun căte există,[\s\S]*Nu spera cănd vezi mizerii[\s\S]*Vremea trece, vremea vine\.$/);
  assert.match(glossa.context, /closing stanza.*reverse order.*omitting the opening 'Tu'/);
  const stanzas = glossa.text.split('\n\n').map(stanza => stanza.split('\n'));
  assert.equal(stanzas[0][3], 'Tu te ’ntreabă și socoate.');
  assert.equal(stanzas[9][4], 'Te intreabă și socoate,');
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.authorId, 'mihai-eminescu');
    assert.equal(poem.lang, 'ro');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.match(poem.yearLabel, /1884 title-page printing · not necessarily composition date/);
    assert.match(poem.source, index === 0 ? /#page=45$/ : /#page=157$/);
    for (const query of [poem.title, ...poem.searchAliases]) {
      assert.ok(filterPoems([poem], { language: 'Romanian', query }).includes(poem), query);
    }
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="ro" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Exact titles, texts and openings cannot rule out every variant or translation.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const opening = fold(added.text.split('\n').slice(0, 2).join(' '));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-romanian-classics-2.py', '--check'], { encoding: 'utf8' }), /Verified 2 historical readings/);
});

test('Romanian classics preserve complete, distinct historical readings', () => {
  const ids = ['lacul', 'dorinta', 'floare-albastra', 'somnoroase-pasarele', 'si-daca', 'pe-langa-plopii']
    .map(id => `recognized-romanian-classics-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-romanian-classics-')).length, 6);
  assert.deepEqual(selected.map(lineCount), [20, 24, 57, 16, 12, 44]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    Array(5).fill(4), Array(6).fill(4), [...Array(13).fill(4), 1, 4],
    Array(4).fill(4), Array(3).fill(4), Array(11).fill(4),
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '3234d151b4cae2af69ac73cd0534cc9e715df41a564f93a5b4a7de2e9065ea93',
    'fe0e2bae8d535d8af68b3d35822545f0e4922da3e3ec9d49af06c567095ebe27',
    'ec45100615762221edc75085a8ef1c5e0414f246dcd11960eb6f36370d9abc79',
    '3e19c1e8c5af2f78a1fc699debb930647c36cc2f5ddfb090d8ab0d3abc2c34f0',
    '0bb75babe0c4ecb10457c7687c876821843622e914beedd2f504f5201b9494ba',
    'd5fa601ff67fca48ccb6b58ac14a9da16f06b6a8aea747bff1d2c7cabb7de0d8',
  ]);
  const [lake, wish, flower, birds, ifPoem, poplars] = selected;
  assert.match(lake.text, /^Lacul codrilor albastru[\s\S]*Ea din trestii să resară[\s\S]*Incărcat cu flori de nufĕr\.$/);
  assert.match(wish.text, /^Vino ’n codru la isvorul[\s\S]*O să-ți cază flori de tei\.[\s\S]*Ori să cadă rĕnduri-rĕnduri\.$/);
  assert.match(flower.text, /^Iar te-ai cufundat in stele[\s\S]*riuri in soare[\s\S]*bolta cea senină[\s\S]*· · · · · · · · · · ·\n\nȘi te-ai dus[\s\S]*Totuși este trist in lume\.$/);
  assert.match(flower.context, /fourteen quatrains.*dotted divider.*not a fifteenth stanza/);
  assert.match(birds.text, /^Somnoroase păsĕrele[\s\S]*Trece lebeda pe apă[\s\S]*Noapte bună!$/);
  assert.match(ifPoem.text, /^Și dacă ramuri bat in geam[\s\S]*De tine ’n tot deauna\.$/);
  assert.match(poplars.text, /^Pe lăngă plopii fără soț[\s\S]*O oară să fi fost amici[\s\S]*Iubirii pe pămĕnt\.$/);
  assert.ok(readingLanguages.includes('Romanian'));
  const queries = [
    ['Lacul', 'Nuferi galbeni îl încarcă'],
    ['Dorinta', 'Vino-n codru la izvorul'],
    ['Floare albastra', 'râuri de soare', 'balta cea senină'],
    ['Somnoroase păsărele', 'Trece lebăda pe ape'],
    ['Și dacă', 'si daca ramuri bat in geam'],
    ['Pe lângă plopii fără soț', 'Pe langa plopii fara sot'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.lang, 'ro');
    assert.equal(poem.authorId, 'mihai-eminescu');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.match(poem.yearLabel, /1884 title-page printing · not necessarily composition date/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'Romanian', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="ro" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Exact readings and openings do not exhaust translated or variant duplicates.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const opening = fold(added.text.split('\n').slice(0, 2).join(' '));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-romanian-classics.py', '--check'], { encoding: 'utf8' }), /Verified 6 historical readings/);
});

test('Slovenian and Dutch classics preserve complete, distinct historical readings', () => {
  const ids = ['preseren-zdravljica', 'preseren-povodnji-moz', 'anonymous-wilhelmus']
    .map(id => `recognized-european-classics-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-european-classics-')).length, 3);
  assert.deepEqual(selected.map(lineCount), [56, 84, 120]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    Array(8).fill(7), Array(14).fill(6), Array(15).fill(8),
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    'adac40b3aff67648cb63d2f9e28ce3b0a104d93eff48fdfcbc45a1fc28f550c1',
    'cf624fd34126c4437c6d4d4d22dc41aa67ce6d104cfa948ef540f95495b9fe00',
    'e8a0f7597367450d995232c809f327e7619874517a11ba6ada92277f4ec8d604',
  ]);
  const [toast, water, anthem] = selected;
  assert.match(toast.text, /^Spet trte so rodile,[\s\S]*Ki dôbro v srcu mislimo\.[\s\S]*Bog, kar nas dobrih je ljudi! —$/);
  assert.match(toast.context, /1914 reading.*not the 1848 newspaper text.*seventh stanza/);
  assert.match(water.text, /^Od nekdaj lepé so Ljubljanke slovele,[\s\S]*Zagleda pri mizi rumêni junaka;[\s\S]*Al Uršike videl nobêden ni vèč\. —$/);
  assert.match(water.context, /Povodni mož.*same work.*Zalika.*Urška.*mark after 'mizi'.*unclear/);
  assert.equal(anthem.text.split('\n\n').map(stanza => stanza[0]).join(''), 'WILLEMVANNASSOV');
  assert.match(anthem.text, /^Wilhelmus van Nassouwe[\s\S]*Voor Godt wil ick belijden[\s\S]*inder gherechticheyt\.$/);
  assert.ok(anthem.anonymous);
  assert.match(anthem.context, /fifteen eight-line stanzas.*two columns.*German text B.*not included.*Authorship is disputed/);
  assert.deepEqual(selected.map(poem => poem.lang), ['sl', 'sl', 'nl']);
  for (const language of ['Slovenian', 'Dutch']) assert.ok(readingLanguages.includes(language));
  const queries = [
    ['Zdravljica', 'Zdravica', 'France Preseren', 'A Toast'],
    ['Povodnji mož', 'Povodni moz', 'France Preserin', 'The Water Man'],
    ['Wilhelmus', 'Willem van Nassov', 'van Nassouwe'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.match(poem.yearLabel, /printing · not necessarily composition date/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: poem.language, query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="${poem.lang}" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // This screens the full readings and openings, not every translation or textual variant.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const opening = fold(added.text.split('\n').slice(0, 2).join(' '));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-european-classics.py', '--check'], { encoding: 'utf8' }), /Verified 3 historical readings/);
});

test('anthology classics preserve complete historical readings and distinct work boundaries', () => {
  const ids = [
    'browning-my-last-duchess', 'herbert-love', 'hardy-darkling-thrush',
    'marvell-coy-mistress', 'tennyson-ulysses', 'waller-lovely-rose',
  ].map(id => `recognized-anthology-classics-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-anthology-classics-')).length, 6);
  assert.deepEqual(selected.map(lineCount), [56, 18, 32, 46, 70, 20]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(part => part.split('\n').length)), [
    [56], [6, 6, 6], [8, 8, 8, 8], [20, 12, 14], [32, 11, 27], [5, 5, 5, 5],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '35c38f14d4e66e96a4ffec749738dad1096d0af463a34181fe70e095ed926ea4',
    '319e94ac1684869840f128f9d8680ce89ba473e070d31f97533f6382d195279a',
    'a61119e515f50973b5779c87612d0e67e0a6efc69067035730662936c8d250ad',
    'aff1365aa29a9b06ceb8b38ae29ee35eeac77cc2ead2abf98174d2249a4709ac',
    '7cd9df11a26ba60091928e6936e97ef63ed99f70d1f6d34e18be86229582b627',
    'b279e337ca82123f4871cb3550a01891320ead9412db9bda903453be1230a3f4',
  ]);
  const [duchess, love, thrush, mistress, ulysses, rose] = selected;
  assert.match(duchess.text, /^That's my last Duchess painted on the wall,[\s\S]*She thanked men,—good! but thanked\nSomehow[\s\S]*Which Claus of Innsbruck cast in bronze for me!$/);
  assert.match(duchess.context, /earlier title 'Italy'.*same work.*Count Gismond/);
  assert.match(duchess.context, /copyright page is dated 1898.*impression itself is undated/);
  assert.equal(duchess.yearLabel, '1898 edition · scanned impression undated');
  assert.ok(filterPoems([duchess], { query: 'Italy' }).includes(duchess));
  assert.equal(love.title, 'Love');
  assert.equal(love.displayTitle, 'Love (III)');
  assert.deepEqual(associatedPlaces(love), ['Wales', 'England']);
  assert.match(love.text, /Love bade me welcome;[\s\S]*So I did sit and eat\.$/);
  assert.doesNotMatch(love.text, /FINIS|Glorie be to God/);
  assert.ok(filterPoems([love], { query: 'Love (III)' }).includes(love));
  assert.match(thrush.text, /^I leant upon a coppice gate[\s\S]*And I was unaware\.$/);
  assert.doesNotMatch(thrush.text, /December 1900/);
  assert.match(thrush.context, /December 1900.*not another verse line/);
  assert.match(mistress.text, /This coyness, Lady, were no crime\nWe would sit down[\s\S]*Time's wingèd chariot[\s\S]*Thorough the iron gates of life:/);
  assert.match(mistress.context, /second copy.*gloss is not part of the poem/);
  assert.match(ulysses.text, /Vext the dim sea:[\s\S]*arch wherethro'[\s\S]*To strive, to seek, to find, and not to yield\.$/);
  assert.match(rose.text, /^Go, lovely Rose—[\s\S]*That are so wondrous sweet and fair!$/);
  assert.match(rose.context, /four-stanza reading.*Henry Kirke White/);
  for (const poem of selected) {
    assert.equal(poem.language, 'English');
    assert.equal(poem.lang, 'en');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    if (poem !== duchess) assert.match(poem.yearLabel, /printing · not necessarily composition date/);
    for (const query of [poem.title, poem.displayTitle, poem.author].filter(Boolean)) {
      assert.ok(filterPoems([poem], { language: 'English', query }).includes(poem), `${poem.id}: ${query}`);
    }
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="en" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Full readings and distinctive openings screen originals and translations;
  // paraphrases and unlisted translated incipits can still evade this check.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const opening = fold(added.text.split('\n').slice(0, 2).join(' '));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) {
        for (const title of [added.title, added.displayTitle, ...(added.searchAliases || [])].filter(Boolean)) {
          assert.ok(![other.title, other.displayTitle, ...(other.searchAliases || [])].filter(Boolean).some(candidate => fold(candidate) === fold(title)), other.id);
        }
      }
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-anthology-classics.py', '--check'], { encoding: 'utf8' }), /Verified 6 historical readings/);
});

test('Chinese classics preserve complete historical readings and opt-in discovery aliases', () => {
  const ids = ['jiangnan', 'chang-ge-xing', 'yong-e', 'feng', 'yong-liu'].map(id => `recognized-chinese-classics-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-chinese-classics-')).length, 5);
  assert.deepEqual(selected.map(lineCount), [7, 10, 4, 4, 4]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    'eb0bb9fc8a249354d8a3fc3a817a4673bd62bf6a6acce98933edbf430a7c730a',
    '277cfe16fdd70bc15053dce30b07bff28c331c514abdcb7c73ea2a0d4af07ccc',
    'b6f3948e8417b6248a4e9e85f25f20665f027e1e6fdee681f9eebd9304e352ac',
    '231e0dbd29a87ecac60e9c9ee16ed1eb720f30a5973de7d21cfab17a21d8b6ce',
    'b57c742bd452a0753b42a7ab55100bffd99043b0920d7565ef645a32ae60fef8',
  ]);
  const [jiangnan, changge, goose, wind, willow] = selected;
  assert.ok(jiangnan.anonymous && changge.anonymous);
  assert.equal(jiangnan.authorId, changge.authorId); // A browsing group, not a claim of common authorship.
  assert.match(changge.context, /next ancient song.*separate text/);
  assert.match(goose.context, /written at seven.*tradition.*not independently established/);
  assert.match(wind.context, /another, eight-line poem.*same title/);
  assert.match(willow.text, /綠絲縧/);
  const queries = [
    ['江南可採蓮', '江南可采莲', '鱼戏莲叶东', '江南可采莲莲叶何田田'],
    ['長歌行', '长歌行', '青青园中葵', '少壮不努力'],
    ['詠鵝', '咏鹅', '骆宾王', '曲项向天歌', '詠鵞'],
    ['風', '风', '李峤', 'Li Jiao', '解落三秋叶'],
    ['詠柳', '咏柳', '贺知章', '绿丝绦', '綠絲絛', '柳枝词', '詠栁'],
  ];
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.year, null);
    assert.equal(poem.lang, 'zh-Hant');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.match(poem.context, /Line breaks and punctuation are supplied/);
    for (const query of queries[index]) assert.ok(filterPoems([poem], { language: 'Chinese', query }).includes(poem), query);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="zh-Hant" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Screen historical and simplified openings against originals and translations;
  // a paraphrased translation or an unlisted variant can still escape this check.
  const fold = text => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const simplified = added.searchAliases.find(alias => alias.includes('\n'));
    for (const reading of [added.text, simplified]) {
      const full = fold(reading);
      const opening = fold(reading.split('\n').slice(0, 2).join(''));
      for (const other of poems.filter(poem => poem.id !== added.id)) {
        for (const text of [other.text, ...other.translations.map(item => item.text)]) {
          const candidate = fold(text);
          assert.ok(!candidate.includes(full) && !candidate.includes(opening), `${added.id} overlaps ${other.id}`);
        }
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-chinese-classics.py', '--check'], { encoding: 'utf8' }), /Verified 5 historical readings/);
});

test('author aliases are opt-in, escaped and aggregated by poet', () => {
  const legacy = poems.find(poem => poem.id === 'tang-093');
  const added = poems.find(poem => poem.id === 'recognized-chinese-classics-yong-e');
  assert.ok(legacy && added);
  assert.deepEqual(filterPoems([legacy, added], { query: '骆宾王' }).map(poem => poem.id), [added.id]);
  assert.deepEqual(filterPoems([legacy, added], { query: '駱賓王' }).map(poem => poem.id), [legacy.id, added.id]);
  const markup = renderHome([legacy, added], '/ai-poems/');
  assert.match(markup, /data-author="Luo Binwang" data-author-aliases="骆宾王"/);
  const escaped = renderHome([{ ...added, authorAliases: ['alias"<test>'] }], '/ai-poems/');
  assert.ok(escaped.includes('data-author-aliases="alias&quot;&lt;test&gt;"'));
});

test('lyric classics preserve complete witnesses, epigraph attribution and distinct works', () => {
  const ids = [
    'recognized-lyric-classics-machado-retrato', 'recognized-lyric-classics-machado-anoche-cuando-dormia',
    'recognized-lyric-classics-machado-la-saeta', 'recognized-lyric-classics-ronsard-mignonne',
    'recognized-lyric-classics-teasdale-soft-rains', 'recognized-lyric-classics-frost-fire-and-ice',
    'recognized-lyric-classics-yeats-cloths-of-heaven',
  ];
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.id.startsWith('recognized-lyric-classics-')).length, 7);
  assert.deepEqual(selected.map(lineCount), [36, 28, 21, 18, 12, 9, 8]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    Array(9).fill(4), [8, 8, 8, 4], [4, 1, 16], [6, 6, 6], [2, 2, 2, 2, 2, 2], [9], [8],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '294d83ee51cfc3dc10079985c33b3f75e37f2c26b8760eb9f7955c1f2d71be9c',
    '90bb9196da3ba652417a0ed106d1efdca39a81f4518bd8a5a65b8f9937bb5eaa',
    'd7e8177d1d027d8b43a335d730aed6fad1d600295c7af9b0ecb4be4e9f6f1b46',
    'bfbbac4706ea0f028501f8adc878eb7a8b8ff057576fe59d5792ecc3796cd042',
    'c8827df268ecf35a6e8690a58386a89ceb290c6ad172bdaddc9fced8312014d4',
    '38e14415df4149103218d1a4427c4cd4b7967b34663e0481d91a89bcef3a16c2',
    '406accb8a678e8f827eee5869ce8e3a21e6e6a61371ad662d894aebb30df6382',
  ]);
  const [retrato, anoche, saeta, ronsard, rains, fire, cloths] = selected;
  assert.match(retrato.text, /Hay en mi venas gotas de sangre jacobina;[\s\S]*me encontraréis á bordo, ligero de equipaje,/);
  assert.match(retrato.context, /apparently|apparent error/);
  assert.match(anoche.text, /Di, ¿por qué acequia escondida,[\s\S]*en donde nunca bebí\?[\s\S]*con las amarguras viejas\nblanca cera y dulce miel\.[\s\S]*dentro de mi corazón\.$/);
  assert.match(anoche.context, /numbered LX.*third stanza crosses a page break/i);
  assert.match(anoche.context, /1928.*'en donde nunca bebí'.*'de donde nunca bebí'/);
  assert.equal(anoche.year, 1928);
  assert.match(anoche.source, /bdh0000252161\.pdf\?page=80$/);
  assert.match(saeta.text, /^¿Quién me presta una escalera,[\s\S]*a Jesús el Nazareno\?\n\nSAETA POPULAR\.\n\n¡Oh, la saeta, el cantar[\s\S]*sino al que anduvo en el mar!$/);
  assert.match(saeta.context, /traditional epigraph.*not attributed to Machado.*sixteen-line poem.*line count/s);
  assert.match(ronsard.text, /avoit desclose[\s\S]*Las, las, ses beautez laissé cheoir ![\s\S]*Fera ternir vostre beauté\.$/);
  assert.match(ronsard.context, /stanza breaks.*indentations/i);
  assert.match(rains.text, /swallows circling[\s\S]*wild plum-trees[\s\S]*Would scarcely know that we were gone\.$/);
  assert.match(rains.context, /1918.*calling.*circling.*same work/);
  assert.match(fire.text, /To say that for destruction ice/);
  assert.match(fire.context, /1920.*To know.*not separate works/);
  assert.match(cloths.text, /the half light,[\s\S]*Tread softly because you tread on my dreams\.$/);
  assert.ok(filterPoems([ronsard], { query: 'a cassandre' }).includes(ronsard));
  assert.ok(filterPoems([ronsard], { query: 'mignonne, allons voir si la rose' }).includes(ronsard));
  assert.ok(filterPoems([cloths], { query: 'aedh wishes for the cloths of heaven' }).includes(cloths));
  assert.ok(filterPoems([cloths], { query: 'he wishes for the cloths of heaven' }).includes(cloths));
  for (const poem of selected) {
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.yearLabel, /printing · not necessarily composition date/);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    for (const title of [poem.title, poem.displayTitle].filter(Boolean)) {
      assert.ok(filterPoems([poem], { language: poem.language, query: title }).includes(poem));
    }
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="${poem.lang}" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Screen originals and translations for the full reading and its own opening;
  // these checks cannot identify every translated or substantially altered version.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/œ/g, 'oe').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const original = added === saeta ? added.text.split('SAETA POPULAR.\n\n')[1] : added.text;
    const full = fold(original);
    const opening = fold(original.split('\n').slice(0, 2).join(' '));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) {
        for (const title of [added.title, added.displayTitle].filter(Boolean)) {
          assert.ok(![other.title, other.displayTitle].filter(Boolean).some(candidate => fold(candidate) === fold(title)), other.id);
        }
      }
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-lyric-classics.py', '--check'], { encoding: 'utf8' }), /Verified 7 historical readings/);
});

test('early classics preserve complete scan-backed readings and distinct work boundaries', () => {
  const ids = [
    'recognized-early-classics-leino-hyva-on-hiihtajan-hiihdella',
    'recognized-early-classics-leino-laulu-onnesta', 'recognized-early-classics-leino-hautalaulu',
    'recognized-early-classics-leino-mirjamin-laulu', 'recognized-early-classics-marlowe-passionate-shepherd',
  ];
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.deepEqual(selected.map(lineCount), [24, 8, 9, 12, 24]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    [6, 6, 6, 6], [4, 4], [3, 3, 3], [4, 4, 4], [4, 4, 4, 4, 4, 4],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    'fe830ce2b9f45c49ea8391e2699e3250fe58f628a14a83318bc15a36e574e5d0',
    '41d1eaf366ca3e72a731e1fcbc58d585b9b507dd4abb2dbb8c2c9497cf5f8699',
    '9d22550aae8952d17c4452742d56edc1cba148836183812765c4bd491554c033',
    '8e4be5d37413f3a55caa5ea093cb5f24f0e52ac288d7338b4c2312ac043df104',
    '149ad2e4ef307a5296fbedf675872528eda3c098d77ef8657f3b8e16d5e0199e',
  ]);
  const [skier, happiness, grave, mirjam, shepherd] = selected;
  assert.match(skier.context, /not the separately printed Yksin hiihtäjä section/);
  assert.match(skier.text, /ja yksin uhmata yötä\.[\s\S]*ja kuolema kupeellansa\.$/);
  assert.match(happiness.context, /page 84.*contents page gives 83/);
  assert.match(grave.text, /Ei se ijäks sammu/);
  assert.match(mirjam.text, /missä on Mirjamin soljet\?[\s\S]*vaiko jo löysit toisen\?$/);
  assert.match(shepherd.text, /That hills and valleys, dales and fields,[\s\S]*And see the shepherds feed their flocks/);
  assert.match(shepherd.context, /modernizes spelling and sometimes omits material.*six-stanza boundary/);
  for (const poem of selected) {
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.yearLabel, /printing · not necessarily composition date/);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.ok(filterPoems([poem], { language: poem.language, query: poem.title }).includes(poem));
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="${poem.lang}" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // This screens exact or embedded text and openings, not all translations or variants.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const opening = fold(added.text.split('\n').slice(0, 2).join(' '));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-early-classics.py', '--check'], { encoding: 'utf8' }), /Verified 5 historical readings/);
});

test('Finnish readings preserve complete historical witnesses and individual work boundaries', () => {
  const ids = [
    'recognized-finnish-leino-nocturne', 'recognized-finnish-kivi-kaukametsa',
    'recognized-finnish-kivi-sunnuntai', 'recognized-finnish-kivi-onnelliset',
  ];
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.deepEqual(selected.map(lineCount), [20, 28, 36, 35]);
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(stanza => stanza.split('\n').length)), [
    [10, 10], [4, 4, 4, 4, 4, 4, 4], [6, 6, 6, 6, 6, 6], [7, 7, 7, 7, 7],
  ]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '224a9aacf10d79e936e71383ce8aa24cc36283754c59bfe0cb4f5ffe7084b34c',
    '2d91b0bdb2131920a2cb57b0bcc2c37d173dd0da50e877043dfb722c1a98d2ef',
    '2d370dd4340204475479acad0f79911e33d50ba80605c6560f96c13e2fbd23b4',
    'cf9fa831242ac7d07ab779ff89a1b2669674195b0854e68e54d629a2c0827bb1',
  ]);
  const [nocturne, kaukametsa, sunnuntai, onnelliset] = selected;
  assert.equal((nocturne.text.match(/En ma /g) || []).length, 2);
  assert.match(nocturne.context, /stanza break.*editorial.*not counted as additional works/);
  assert.match(kaukametsa.text, /^Alas kalliolta lapsi riensi,/);
  assert.match(kaukametsa.text, /missä ilmanrannat\nKaukametsä haamottaa/);
  assert.match(sunnuntai.text, /Kultaset santarannat\.[\s\S]*Mut vait oil impeni kaino/);
  assert.match(sunnuntai.text, /Ja poskellans kyynele kiilsi/);
  assert.match(onnelliset.text, /Hän hymyen luokseni käy,[\s\S]*Ja linnut laulelee\./);
  assert.match(onnelliset.context, /without 'ne'.*punctuation varies/);
  assert.ok(readingLanguages.includes('Finnish'));
  for (const poem of selected) {
    assert.equal(poem.language, 'Finnish');
    assert.equal(poem.lang, 'fi');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.yearLabel, /printing · not necessarily composition date/);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.ok(filterPoems([poem], { language: 'Finnish', query: poem.title }).includes(poem));
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="fi" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // This catches exact or embedded originals and openings, not every translation or variant.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const opening = fold(added.text.split('\n').slice(0, 2).join(' '));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-finnish.py', '--check'], { encoding: 'utf8' }), /Verified 4 historical readings/);
});

test('Finnish search preserves distinct letters and canonical equivalence without weakening translations', () => {
  const example = { ...poems[0], author: 'Test', authorOriginal: '', title: 'Test', displayTitle: '',
    country: 'Finland', era: '', form: 'Verse', collection: '', language: 'Finnish', lang: 'fi', themes: [], translations: [] };
  const a = { ...example, id: 'finnish-a', text: 'pää yö', translations: [
    { language: 'French', title: 'Étoile', text: 'rivière' },
    { language: 'Finnish', title: 'Hökkö', text: 'hökkö' },
  ] };
  const b = { ...example, id: 'finnish-b', text: 'paa yo' };
  const sample = [a, b];
  const ids = query => filterPoems(sample, { query }).map(poem => poem.id);
  assert.deepEqual(ids('pää'), ['finnish-a']);
  assert.deepEqual(ids('pa\u0308a\u0308'), ['finnish-a']);
  assert.deepEqual(ids('PÄÄ'), ['finnish-a']);
  assert.deepEqual(ids('paa'), ['finnish-b']);
  assert.deepEqual(ids('yö'), ['finnish-a']);
  assert.deepEqual(ids('yo'), ['finnish-b']);
  assert.deepEqual(ids('hökko\u0308'), ['finnish-a']);
  assert.deepEqual(ids('hokko'), []);
  assert.deepEqual(ids('etoile'), ['finnish-a']);
  assert.deepEqual(ids('riviere'), ['finnish-a']);
  assert.equal(normalizeFinnish('pa\u0308a\u0308'), normalizeFinnish('pää'));
  assert.notEqual(normalizeFinnish('pää'), normalizeFinnish('paa'));
  assert.ok(filterPoems(poems, { language: 'Finnish', query: 'pa\u0308iva\u0308' }).some(poem => poem.id === 'recognized-finnish-leino-nocturne'));
  assert.equal(filterPoems(poems, { language: 'Finnish', query: 'paiva' }).length, 0);
});

test('Swedish readings preserve complete works, source variants and individual boundaries', () => {
  const ids = [
    'dagen-svalnar', 'vierge-moderne', 'landet-som-icke-ar', 'i-rorelse', 'jag-vill-mota',
    'fran-en-stygg-flicka', 'du-ar-min-renaste-trost', 'morgon',
  ].map(id => `recognized-swedish-classics-${id}`);
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.deepEqual(selected.map(lineCount), [34, 13, 22, 10, 20, 8, 8, 12]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    'ea3efec5be44695dd00a5e2bbfa2f5eae3da06b4968fb14434caa75bf2251f71',
    '59095ee77c23a6ae786aa4568c014fc1ffecf471f9a79de0d2a66be0026be05c',
    '1e9fea5b993063370325295f9cd6f81416844e6f4ca0ed293d8176c240eab7e0',
    '30b8940f94c6c0c02d18474ae63c144e6866e3fb856a6528db82820e59efb22b',
    'f755deade3f734acceef6db69d816c5a9e8982a4c28eca803f9887e68430117e',
    'b887e9932032defb43593b3b1de50ecde36660e7666d038f0cb15ec6fabd743f',
    '3179177a4d0e2113f5b1a25577eb122693ce65c9f420289800f0333fb55dccbe',
    '3eb4755b457acc9e8f3cdf6887ad45566c5c44578de095d3d884da4dc13baddc',
  ]);
  const [dagen, vierge, landet, rorelse, mota, stygg, trost, morgon] = selected;
  assert.deepEqual(dagen.text.split('\n\n').map(section => section.split('\n')[0]), ['I', 'II', 'III', 'IV']);
  assert.match(dagen.text, /mot mina skära, skära drömmar\./);
  assert.ok(dagen.text.endsWith('och fann en själ –\ndu är besviken.'));
  assert.match(dagen.context, /four numbered sections.*one work.*Two copies/);
  assert.equal(vierge.titleLang, 'fr');
  assert.match(renderPoem(vierge, poems, '/ai-poems/'), /<h1 lang="fr" dir="ltr">Vierge moderne<\/h1>/);
  assert.match(landet.text, /verkligen vunnit –\nvägen till landet som icke är\.\n\nI landet som icke är/);
  assert.ok(landet.text.endsWith('Jag är den du älskar och alltid skall älska.'));
  assert.deepEqual(rorelse.text.split('\n\n').map(stanza => stanza.split('\n').length), [2, 2, 2, 2, 2]);
  assert.deepEqual(mota.text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4, 4, 4, 4]);
  assert.match(stygg.text, /stund …\nJag hoppas du inte får en blund!$/);
  assert.match(stygg.context, /lowercase 'jag'/);
  assert.deepEqual(trost.text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4]);
  assert.ok(morgon.text.endsWith('väntande livet är du!'));
  assert.ok(readingLanguages.includes('Swedish'));
  assert.deepEqual(dagen.authorAliases, ['Edith Irene Södergran']);
  for (const poem of selected) {
    assert.equal(poem.language, 'Swedish');
    assert.equal(poem.lang, 'sv');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.match(poem.yearLabel, /printing · not necessarily composition date/);
    assert.ok(filterPoems([poem], { language: 'Swedish', query: poem.title }).includes(poem));
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="sv" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const opening = fold(added.text.split('\n').filter(line => line && !/^(I|II|III|IV)$/.test(line)).slice(0, 2).join(' '));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-swedish-classics.py', '--check'], { encoding: 'utf8' }), /Verified 8 historical readings/);
});

test('Swedish search distinguishes å, ä and ö, including aliases and same-language translations', () => {
  const example = { ...poems[0], author: 'Test', authorOriginal: '', title: 'Test', displayTitle: '',
    country: 'Sweden', era: '', form: 'Verse', collection: '', language: 'Swedish', lang: 'sv', themes: [], translations: [], authorAliases: [], searchAliases: [] };
  const a = { ...example, id: 'swedish-a', text: 'så läs öl', searchAliases: ['stålblå'], authorAliases: ['Aino Åberg'], translations: [
    { language: 'French', title: 'Étoile', text: 'rivière' }, { language: 'Swedish', title: 'Röda', text: 'båt' },
  ] };
  const b = { ...example, id: 'swedish-b', text: 'sa las ol' };
  const ids = query => filterPoems([a, b], { query }).map(poem => poem.id);
  assert.deepEqual(ids('sa\u030a'), ['swedish-a']);
  assert.deepEqual(ids('SÅ'), ['swedish-a']);
  assert.deepEqual(ids('sa'), ['swedish-b']);
  assert.deepEqual(ids('lä'), ['swedish-a']);
  assert.deepEqual(ids('las'), ['swedish-b']);
  assert.deepEqual(ids('öl'), ['swedish-a']);
  assert.deepEqual(ids('ol'), ['swedish-b']);
  assert.deepEqual(ids('stålblå'), ['swedish-a']);
  assert.deepEqual(ids('stalbla'), []);
  assert.deepEqual(ids('a\u030aberg'), ['swedish-a']);
  assert.deepEqual(ids('aberg'), []);
  assert.deepEqual(ids('röda'), ['swedish-a']);
  assert.deepEqual(ids('roda'), []);
  assert.deepEqual(ids('etoile'), ['swedish-a']);
  assert.deepEqual(ids('riviere'), ['swedish-a']);
  assert.equal(filterPoems(poems, { language: 'Swedish', query: 'edith irene so\u0308dergran' }).length, 3);
  assert.equal(filterPoems(poems, { language: 'Swedish', query: 'edith irene sodergran' }).length, 0);
});

test('the new search path leaves prior catalogue search results unchanged', () => {
  const previous = poems.filter(poem => !['Finnish', 'Swedish', 'Galician', 'Hungarian', 'Czech'].includes(poem.language) && !poem.id.startsWith('recognized-danish-poems-') && !poem.id.startsWith('recognized-danish-classics-') && !poem.id.startsWith('recognized-nynorsk-') && !poem.id.startsWith('recognized-norwegian-') && !poem.id.startsWith('recognized-british-classics-') && !poem.id.startsWith('recognized-chinese-classics-') && !poem.id.startsWith('recognized-song-classics-') && !poem.id.startsWith('recognized-multilingual-classics-') && !poem.id.startsWith('recognized-world-classics-2-') && !poem.id.startsWith('recognized-world-classics-3-') && !poem.id.startsWith('recognized-world-classics-4-') && !poem.id.startsWith('recognized-world-classics-5-') && !poem.id.startsWith('recognized-world-classics-7-') && !poem.id.startsWith('recognized-world-classics-8-') && !poem.id.startsWith('recognized-european-classics-'));
  const legacy = new Map(previous.map(poem => [poem.id, normalize([
    poem.title, poem.displayTitle, poem.author, poem.authorOriginal, poem.country, poem.era, poem.form,
    poem.collection, poem.language, poem.text, ...poem.themes,
    ...poem.translations.flatMap(item => [item.language, item.title, item.text]),
  ].join(' '))]));
  const queries = new Set(['jose marti', 'BASHO', '蛙とびこむ', '杜甫', 'hafez', 'حافظ', 'कबीर',
    'বাংলা', 'Ιθακη', 'Заповіт', 'fiancée', 'FianCee', 'pa\u0308a\u0308', 'paa', '\u0308', '']);
  for (const [index, poem] of previous.entries()) {
    if (index % 103 === 0) {
      queries.add(poem.author);
      queries.add(poem.title);
      queries.add(poem.text.split('\n').find(Boolean).slice(0, 24));
    }
  }
  for (const query of queries) {
    const normalized = normalize(query).trim();
    const expected = previous.filter(poem => !normalized || legacy.get(poem.id).includes(normalized)).map(poem => poem.id);
    assert.deepEqual(filterPoems(previous, { query }).map(poem => poem.id), expected, JSON.stringify(query));
  }
});

test('crossroads readings preserve complete works, witnesses and variant boundaries', () => {
  const ids = [
    'recognized-crossroads-henley-invictus', 'recognized-crossroads-mistral-balada',
    'recognized-crossroads-rilke-herbsttag', 'recognized-crossroads-dario-lo-fatal',
  ];
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.deepEqual(selected.map(lineCount), [16, 24, 12, 13]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '8bf1060768e3213544d5604b503c74fd2439be8439e8ba6aa209ba0db90d1999',
    '546395dd70bb7c6857dc432d996ac570f855e293f3853b06f36551413e3e238e',
    '25ffffeb32ca3240c5e97dccdbabfe835efebf10040eae35956b5ec9a8ebe42d',
    'eb25997600ac51544e40bc28e3042162a04895629f1727043bc5b6183dbbcaf7',
  ]);
  const [henley, mistral, rilke, dario] = selected;
  assert.deepEqual(selected.map(poem => poem.text.split('\n\n').map(part => part.split('\n').length)), [
    [4, 4, 4, 4], [6, 6, 6, 6], [3, 4, 5], [4, 4, 5],
  ]);
  assert.match(henley.context, /heading is IV.*dedication.*1875.*later familiar title.*not a second work/);
  assert.ok(henley.text.endsWith('I am the master of my fate:\nI am the captain of my soul.'));
  assert.match(mistral.text, /^El pasó con otra;\nyo le vi pasar\n/);
  assert.match(mistral.text, /\(Dios quiere callar\)\n¡Y él irá con otra\npor la eternidad!$/);
  assert.match(mistral.rights, /CC BY-SA 4\.0.*oldid=1604056.*oldid=1604054/);
  assert.match(rilke.text, /Leg Deinen Schatten.*\ngieb ihnen/s);
  assert.ok(rilke.text.endsWith('unruhig wandern wenn die Blätter treiben.'));
  assert.match(rilke.rights, /CC BY-SA 4\.0.*oldid=2353125/);
  assert.ok(dario.text.endsWith('Y no saber á donde vamos,\nNi de donde venimos...!'));
  assert.match(dario.context, /René Pérez.*FIN.*complete as printed, not an excerpt/);
  for (const poem of selected) {
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.ok(filterPoems([poem], { language: poem.language, query: poem.title }).includes(poem));
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="${poem.lang}" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // Screen originals and translations, including German ß/ss; variants can still escape this check.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/ß/g, 'ss').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const opening = fold(added.text.split('\n').slice(0, 2).join(' '));
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      if (other.authorId === added.authorId) assert.notEqual(fold(other.title), fold(added.title), other.id);
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) {
          assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        }
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-crossroads.py', '--check'], { encoding: 'utf8' }), /Verified 4 historical readings/);
});

test('Atlantic readings preserve both complete works and their edition boundaries', () => {
  const ids = ['recognized-atlantic-rimbaud-bateau-ivre', 'recognized-atlantic-mistral-sonetos'];
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.deepEqual(selected.map(lineCount), [100, 45]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '423aab21d124237826f80c1a087f8200baaaa40b85f4086a1b3fb28ea7bf5b19',
    '191c1dcdd03fc1b944c10510989f2f233d5b97aa59d4ab0a8d1c25c816c91e56',
  ]);
  const [rimbaud, mistral] = selected;
  assert.deepEqual(rimbaud.text.split('\n\n').map(stanza => stanza.split('\n').length), Array(25).fill(4));
  assert.match(rimbaud.text, /vos lyres[\s\S]*Sons songer[\s\S]*Planche folle/);
  assert.ok(rimbaud.text.endsWith('Ni nager sous les yeux horribles des pontons !'));
  assert.match(rimbaud.context, /potentially erroneous readings are retained/);
  assert.ok(filterPoems([rimbaud], { query: 'Le Bateau ivre' }).includes(rimbaud));
  assert.deepEqual(mistral.text.split('\n\n').map(stanza => stanza.split('\n').length),
    [1, 4, 4, 3, 3, 1, 4, 4, 3, 3, 1, 4, 4, 3, 3]);
  assert.ok(mistral.text.endsWith('¡Tú, que vas a juzgarme, lo comprendes, Señor!'));
  assert.match(mistral.context, /counted together, not as three additional works/);
  assert.match(mistral.rights, /Wikisource contributors under CC BY-SA 4\.0.*oldid=1604047.*oldid=1604046.*oldid=1604045/);
  for (const poem of selected) {
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.ok(filterPoems([poem], { language: poem.language, query: poem.title }).includes(poem));
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="${poem.lang}" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  // A normalized containment and opening screen cannot exclude every translation or variant.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const openings = added === rimbaud ? [added.text.split('\n')[0]] : [
      'Del nicho helado en que los hombres te pusieron', 'Este largo cansancio se hará mayor un día',
      'Malas manos tomaron tu vida, desde el día',
    ];
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (candidate.length > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        for (const opening of openings) assert.ok(!candidate.includes(fold(opening)), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-atlantic.py', '--check'], { encoding: 'utf8' }), /Verified 2 historical readings/);
});

test('next recognized readings preserve complete texts, witnesses and work boundaries', () => {
  const ids = [
    'recognized-next-yosano-kimi-shinitamau', 'recognized-next-keats-belle-dame',
    'recognized-next-dunbar-we-wear-the-mask', 'recognized-next-dunbar-sympathy',
  ];
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.deepEqual(selected.map(lineCount), [41, 48, 15, 21]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '2be11094b2ca15bbbaebd0579c167af91223ca73a80d60eec48572626ab89bf7',
    '463ec97eab02d3e3c948632c46490fcd273fec4bbb188514e044ad763d6167ed',
    'c46759522e9b30cf8bca11ce5fb13d4d68b3d006d7fad7250230aa0f0f2cdc9a',
    'e6181b9506769eb04e033c824d9e2c2b94e4f1a4b19e5f87d1a83fdcfec1fcb1',
  ]);
  for (const poem of selected) {
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.ok(filterPoems([poem], { language: poem.language, query: poem.title }).includes(poem));
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="${poem.lang}" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  const [yosano, keats, mask, sympathy] = selected;
  assert.deepEqual(yosano.text.split('\n\n').map(part => part.split('\n').length), [1, 8, 8, 8, 8, 8]);
  assert.match(yosano.text, /^旅順口包囲軍の中に在る弟を歎きて\n\nあゝをとうとよ、君を泣く、/);
  assert.ok(yosano.text.endsWith('君死にたまふことなかれ。'));
  assert.match(yosano.context, /1980 facsimile, not a directly inspected historical scan/);
  assert.match(yosano.rights, /武田秀男.*kazuishi.*2 June 2004/);
  assert.ok(filterPoems([yosano], { query: yosano.displayTitle }).includes(yosano));
  assert.deepEqual(keats.text.split('\n\n').map(part => part.split('\n').length), Array(12).fill(4));
  assert.equal((keats.text.match(/wretched wight/g) || []).length, 2);
  assert.match(keats.text, /sedge is wither'd.*thy cheek/s);
  assert.ok(!keats.text.includes('knight-at-arms'));
  assert.ok(!keats.text.includes('Caviare'));
  assert.equal(keats.titleLang, 'fr');
  assert.equal(keats.displayTitleLang, 'fr');
  assert.ok(filterPoems([keats], { query: 'La Belle Dame sans Merci' }).includes(keats));
  assert.deepEqual(mask.text.split('\n\n').map(part => part.split('\n').length), [5, 4, 6]);
  assert.match(mask.rights, /Wikisource contributors under CC BY-SA 4\.0.*oldid=15845393/);
  assert.deepEqual(sympathy.text.split('\n\n').map(part => part.split('\n').length), [7, 7, 7]);
  assert.ok(sympathy.text.endsWith('I know why the caged bird sings!'));
  assert.match(sympathy.context, /Maya Angelou.*not included or counted as this poem/);

  // Check exact and contained originals, translations and openings; variants can still escape this screen.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    const opening = fold(added === yosano ? added.text.split('\n\n')[1].split('\n')[0] : added.text.split('\n')[0]);
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        if (Math.min(full.length, candidate.length) > 80) {
          assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
        }
        assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-readings.py', '--check'], { encoding: 'utf8' }), /Verified 4 historical readings/);
});

test('recognized global works preserve historical readings, boundaries and language markings', () => {
  const ids = [
    'recognized-konopnicka-rota', 'recognized-mickiewicz-romantycznosc', 'recognized-kipling-if',
    'recognized-arnold-dover-beach', 'recognized-vallejo-heraldos', 'recognized-garcilaso-soneto-xxiii',
  ];
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.deepEqual(selected.map(lineCount), [18, 75, 32, 37, 17, 14]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '4c5432c45b3e1f1740df3a466c1393858236cb76b60247b51e10059035033345',
    'b15fbe6c3a3b5998d1a0b389b672cf71bcdf0cb4bb3b38aef766b8fbd00ec48c',
    '07149d28e34f325a2b40ef7c3ff6d12d06ea3db8a8e147e97ed8a82f4565e3b8',
    '59661fd74b5d6458ad8ca25418df3cfa82bd8cdc81c44af8d98e794cb7ecd920',
    '2aa8b4c42f8fefc38dc883f23de312f3c744f6a08c3790ea34f2338363928a9a',
    'c546863a6dbd35451f9f10c3cce7befbc90fe1ae189d29c0590ece8ac1288086',
  ]);
  for (const poem of selected) {
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.ok(filterPoems([poem], { language: poem.language, query: poem.title }).includes(poem), poem.id);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(escapeHtml(poem.source)), poem.id);
    assert.ok(html.includes(escapeHtml(poem.contextSource)), poem.id);
  }
  const [rota, romantic, kipling, dover, vallejo, garcilaso] = selected;
  assert.deepEqual(rota.text.split('\n\n').map(stanza => stanza.split('\n').length), [6, 6, 6]);
  assert.match(rota.context, /additional stanza as an autograph variant.*Other versions have four/s);
  assert.match(romantic.text, /^Methinks I see\.\.\.[\s\S]*Przed oczyma duszy mojej\.[\s\S]*Słuchaj, dzieweczko!/);
  assert.ok(romantic.text.endsWith('Miej serce i patrzaj w serce!«'));
  assert.ok(!romantic.text.includes('Ktokolwiek będziesz'));
  assert.deepEqual(romantic.textLanguageOverrides, [1, 2, 3, 4].map(line => ({ line, lang: 'en' })));
  const romanticHtml = renderPoem(romantic, poems, '/ai-poems/');
  assert.equal((romanticHtml.match(/<span lang="en" dir="auto">/g) || []).length, 4);
  assert.ok(poemCard(romantic, '/ai-poems/').includes('<span lang="en" dir="auto">Methinks I see...</span>'));
  assert.deepEqual(kipling.text.split('\n\n').map(stanza => stanza.split('\n').length), [8, 8, 8, 8]);
  assert.match(kipling.text, /your loss:\nIf you can force your heart/);
  assert.match(dover.text, /moon-blanched sand/);
  assert.match(dover.context, /moon-blanched sand.*moon-blanched land/);
  assert.deepEqual(vallejo.text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4, 4, 4, 1]);
  assert.match(vallejo.text, /rostro mas fiero.*talvez.*caidas[\s\S]*Esos golpes/s);
  assert.match(vallejo.text, /los heraldos negros que nos manda la Muerte,\n/);
  assert.match(vallejo.context, /title page is dated 1918.*distributed in 1919/);
  assert.match(vallejo.yearLabel, /1918 title-page date.*1919/);
  assert.deepEqual(garcilaso.text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4, 3, 3]);
  assert.match(garcilaso.rights, /Navarro Tomás died in 1979.*rights may differ outside/s);
  assert.match(garcilaso.context, /enciende el corazón y lo refrena.*con clara luz la tempestad serena/);
  assert.match(garcilaso.context, /Stanza breaks are editorial/);
  assert.ok(selected.slice(0, 4).every(poem => /Wikisource contributors under CC BY-SA 4\.0.*oldid=/s.test(poem.rights)));

  // Exact and contained readings, including translations; this is not an exhaustive variant screen.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const full = fold(added.text);
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      for (const text of [other.text, ...other.translations.map(translation => translation.text)]) {
        const candidate = fold(text);
        if (candidate.length > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-recognized-global.py', '--check'], { encoding: 'utf8' }), /Verified 6 historical readings/);
});

test('world classics retain complete historical readings, independent credits and work boundaries', () => {
  const selected = poems.filter(poem => poem.id.startsWith('world-'));
  assert.deepEqual(selected.map(poem => poem.id), [
    'world-rizal-farewell', 'world-pushkin-kern', 'world-pushkin-i-loved-you', 'world-pushkin-winter-morning',
    'world-wordsworth-daffodils', 'world-shelley-ozymandias', 'world-yeats-innisfree', 'world-lazarus-new-colossus',
    'world-frost-nothing-gold', 'world-frost-stopping-by-woods', 'world-hughes-rivers', 'world-hughes-mother-to-son',
    'world-hughes-i-too',
  ]);
  assert.deepEqual(selected.map(lineCount), [70, 24, 8, 30, 24, 14, 12, 14, 8, 16, 10, 20, 18]);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\0')).digest('hex'), '2a1ba9829f1e07169b246da06e021f4c6e6eb6db315f7b520d03157b35dcd698');
  for (const poem of selected) {
    assert.deepEqual(poem.themes, []);
    assert.match(poem.yearLabel, /printing.*not necessarily composition/);
    assert.match(poem.rights, /public domain in the United States.*jurisdiction/);
    assert.ok(filterPoems([poem], { language: poem.language, query: poem.title }).includes(poem), poem.id);
    assert.ok(filterPoems([poem], { query: poem.text.split('\n')[0] }).includes(poem), poem.id);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="${poem.lang}" dir="ltr">${escapeHtml(poem.text)}`), poem.id);
    assert.ok(html.includes(escapeHtml(poem.source)), poem.id);
  }
  const rizal = selected[0];
  assert.match(rizal.text, /amigos de la infancia an el perdido hogar!/);
  assert.match(rizal.context, /'an el'.*retained/);
  assert.equal(rizal.translations.length, 1);
  const translation = rizal.translations[0];
  assert.equal(translation.text.split('\n').filter(Boolean).length, 70);
  assert.equal(createHash('sha256').update(translation.text).digest('hex'), '6c3f21a9bfad888a2b59a4a79ba2c4128c2a3dea9e13a75411a53aac3a5640e5');
  assert.match(translation.translator, /Derbyshire/);
  assert.match(translation.rights, /1921.*not necessarily a translation of the selected 1903/);
  assert.ok(filterPoems([rizal], { readable: 'English', query: 'Farewell, dear Fatherland' }).includes(rizal));
  assert.match(selected.find(poem => poem.id === 'world-pushkin-kern').context, /Pre-reform Russian spelling is modernized/);
  assert.match(selected.find(poem => poem.id === 'world-wordsworth-daffodils').text, /the shew to me had brought/);
  assert.match(selected.find(poem => poem.id === 'world-shelley-ozymandias').text, /Stand in the desart/);
  assert.match(selected.find(poem => poem.id === 'world-hughes-i-too').text, /I'll sit at the table/);
  assert.match(selected.find(poem => poem.id === 'world-hughes-i-too').context, /Epilogue.*later circulated versions/);
  assert.ok(selected.filter(poem => poem.language === 'English').every(poem => /CC BY-SA 4\.0.*oldid=/.test(poem.rights)));

  // This screen catches exact and contained readings, not every translation or variant.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    for (const reading of [added.text, ...added.translations.map(item => item.text)]) {
      const full = fold(reading), opening = fold(reading.split('\n')[0]);
      for (const other of poems.filter(poem => poem.id !== added.id)) {
        for (const text of [other.text, ...other.translations.map(item => item.text)]) {
          const candidate = fold(text);
          assert.notEqual(full, candidate, `${added.id} duplicates ${other.id}`);
          if (Math.min(full.length, candidate.length) > 80) assert.ok(!candidate.includes(full) && !full.includes(candidate), `${added.id} overlaps ${other.id}`);
          if (opening.length > 24) assert.ok(!candidate.includes(opening), `${added.id} opening overlaps ${other.id}`);
        }
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-world-classics.py', '--check'], { encoding: 'utf8' }), /Verified 13 readings and one translation/);
});

test('1916 Tagore readings retain complete sources and a separately credited self-reworking', () => {
  const selected = poems.filter(poem => poem.id.startsWith('tagore-1916-'));
  assert.deepEqual(selected.map(poem => poem.id), [
    'tagore-1916-naibedya-72', 'tagore-1916-banglar-mati', 'tagore-1916-ami-chini',
  ]);
  assert.deepEqual(selected.map(lineCount), [14, 18, 11]);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\0')).digest('hex'), '5e964f5d7a1be674f805d7c575f21361a53ac6b059daa208bdb6efd7eafcd23e');
  for (const poem of selected) {
    assert.equal(poem.authorId, 'rabindranath-tagore');
    assert.equal(poem.language, 'Bengali');
    assert.equal(poem.lang, 'bn');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.displayTitleLang, 'bn-Latn');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.match(poem.yearLabel, /1916 printing.*composition date not established/);
    assert.match(poem.rights, /public domain in the United States.*unproofread.*CC BY-SA 4\.0.*oldid=/);
    assert.ok(filterPoems([poem], { language: 'Bengali', query: poem.displayTitle }).includes(poem));
    assert.ok(filterPoems([poem], { query: poem.text.split('\n')[0] }).includes(poem));
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="bn" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  const [prayer, bengal, foreigner] = selected;
  assert.match(prayer.text, /নিজ হস্তে নির্দয় আঘাত করি’ পিতঃ\nভারতেরে সেই স্বর্গে কর জাগরিত।$/);
  assert.equal(prayer.translations.length, 1);
  const english = prayer.translations[0];
  assert.equal(createHash('sha256').update(english.text).digest('hex'), 'ce9e461db9e45d9e3ab482aeaa291131d496999025a53da881d324bb02bc579b');
  assert.match(english.translator, /Tagore.*self-reworking.*1913/);
  assert.match(english.rights, /predates the selected 1916.*not a literal line-by-line translation/);
  assert.match(english.rights, /oldid=7781783.*oldid=15393716/);
  assert.ok(filterPoems([prayer], { readable: 'English', query: 'Where the mind is without fear' }).includes(prayer));
  assert.ok(renderPoem(prayer, poems, '/ai-poems/').includes(`class="verse" lang="en" dir="ltr">${escapeHtml(english.text)}`));
  assert.match(bengal.text, /বাঙালীর ঘরে যত ভাই বোন,\nএক হউক\nএক হউক\nএক হউক\nহে ভগবান॥$/);
  assert.match(foreigner.text, /আমি তোমারে সঁপেচি প্রাণ.*আমি অতিথি তোমারি দ্বারে ওগো বিদেশিনী॥$/s);
  assert.deepEqual(bengal.translations, []);
  assert.deepEqual(foreigner.translations, []);

  // Exact opening screening cannot exclude all spellings or translated variants.
  const fold = text => text.normalize('NFC').toLowerCase().replace(/[\u200c\u200d]/gu, '').replace(/[^\p{L}\p{M}\p{N}]/gu, '');
  for (const added of selected) {
    const openings = [added.text.split('\n')[0], ...added.translations.map(item => item.text.split('\n')[0])].map(fold);
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        for (const opening of openings) assert.ok(!fold(text).includes(opening), `${added.id} overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-tagore-1916.py', '--check'], { encoding: 'utf8' }), /Verified 3 readings/);
});

test('Baul songs retain complete early readings, individual identities and source caveats', () => {
  const selected = poems.filter(poem => poem.id.startsWith('tagore-baul-'));
  assert.deepEqual(selected.map(poem => poem.id), [
    'tagore-baul-sonar-bangla', 'tagore-baul-desher-mati', 'tagore-baul-eka',
  ]);
  assert.deepEqual(selected.map(lineCount), [39, 24, 29]);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\0')).digest('hex'), 'c87686c00a75b14f3e8f6c7b388898cd7432d73ebd7986a808927a482a37150f');
  for (const poem of selected) {
    assert.equal(poem.authorId, 'rabindranath-tagore');
    assert.equal(poem.language, 'Bengali');
    assert.equal(poem.lang, 'bn');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.displayTitleLang, 'bn-Latn');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.yearLabel, /catalogued 1905/);
    assert.match(poem.context, /title page has no printed year.*stamp is dated 1907/);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.ok(filterPoems([poem], { language: 'Bengali', query: poem.displayTitle }).includes(poem));
    assert.ok(filterPoems([poem], { query: poem.text.split('\n')[0] }).includes(poem));
    const reader = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(reader.includes(`class="verse" lang="bn" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(reader.includes(escapeHtml(poem.source)));
    assert.ok(reader.includes(escapeHtml(poem.contextSource)));
    assert.equal(titleAttributes(poem), ' lang="bn-Latn" dir="auto"');
  }
  assert.match(selected[0].text, /আমি পরের ঘরে কিনব না তোর\nভূষণ বলে' গলার ফাঁসি॥$/);
  assert.match(selected[0].context, /anthem, not a separate poem/);
  assert.match(selected[1].text, /তোমাতে বিশ্বময়ীর\n\(তোমাতে বিশ্বমায়ের\)/);
  assert.match(selected[1].text, /আমার জনম গেল মিছে কাজে/);
  assert.match(selected[1].context, /মিছে কাজে.*বৃথা কাজে/);
  assert.equal(selected[2].text.match(/যদি তোর ডাক শুনে কেউ না আসে/g)?.length, 2);
  assert.match(selected[2].text, /একলা চল, একলা চল\nএকলা চলরে!$/);
  assert.match(selected[2].context, /explicitly repeats the opening refrain/);

  // Check opening lines against all other originals and translations. This
  // does not rule out different spellings or independently translated texts.
  const fold = text => text.normalize('NFC').toLowerCase().replace(/[\u200c\u200d]/gu, '').replace(/[^\p{L}\p{M}\p{N}]/gu, '');
  for (const added of selected) {
    const openings = added.text.split('\n').filter(Boolean).slice(0, 2).map(fold);
    for (const other of poems.filter(poem => poem.id !== added.id)) {
      for (const text of [other.text, ...other.translations.map(item => item.text)]) {
        const candidate = fold(text);
        for (const opening of openings) assert.ok(!candidate.includes(opening), `${added.id} overlaps ${other.id}`);
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-tagore-baul.py', '--check'], { encoding: 'utf8' }), /Verified 3 readings/);
});

test('Hafez ghazals preserve distinct historical readings, Arabic lines and paraphrase provenance', () => {
  const selected = poems.filter(poem => poem.authorId === 'hafez-shirazi');
  assert.deepEqual(selected.map(poem => poem.id), ['hafez-1802-ala-ya-ayyoha-saqi', 'hafez-1902-shirazi-turk']);
  assert.deepEqual(selected.map(lineCount), [14, 18]);
  assert.deepEqual(selected.map(poem => createHash('sha256').update(poem.text).digest('hex')), [
    '099263a65be5df70148347e983756bfb519b70b50a3225c6c31b60125ca90545',
    'e9a05f8242ba6a05496390d155cee204dff81c548e7649c5b3992beae75d605f',
  ]);
  for (const poem of selected) {
    assert.equal(poem.language, 'Persian');
    assert.equal(poem.lang, 'fa');
    assert.equal(poem.direction, 'rtl');
    assert.equal(poem.country, 'Iran');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.match(poem.yearLabel, /edition.*composition date unknown/);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.ok(filterPoems([poem], { language: 'Persian', readable: 'Persian', query: poem.title }).includes(poem));
    assert.ok(filterPoems([poem], { query: 'حافظ' }).includes(poem));
    const reader = renderPoem(poem, poems, '/ai-poems/');
    assert.match(reader, /class="verse" lang="fa" dir="rtl"/);
    assert.ok(reader.includes(escapeHtml(poem.source)));
    assert.ok(reader.includes(escapeHtml(poem.contextSource)));
    const schema = JSON.parse(reader.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
    assert.equal(schema.inLanguage, 'fa');
    assert.equal(schema.author.name, 'Hafez');
  }
  const [first, turk] = selected;
  assert.equal(first.titleLang, 'ar');
  assert.equal(titleAttributes(first), ' lang="ar" dir="rtl"');
  assert.equal(titleAttributes(turk), ' lang="fa" dir="rtl"');
  assert.deepEqual(first.textLanguageOverrides, [{ line: 1, lang: 'ar' }, { line: 14, lang: 'ar' }]);
  assert.equal((renderPoem(first, poems, '/ai-poems/').match(/<span lang="ar" dir="auto">/g) || []).length, 2);
  const [arabicLine, persianLine] = first.text.split('\n');
  assert.ok(poemCard(first, '/ai-poems/').includes(`<p class="card-excerpt" lang="fa" dir="rtl"><span lang="ar" dir="auto">${escapeHtml(arabicLine)}</span> / ${escapeHtml(persianLine)}</p>`));
  const mixedSample = { ...first, text: 'A & <one>\n\nB & <two>', textLanguageOverrides: [{ line: 2, lang: 'ar' }] };
  assert.ok(poemCard(mixedSample, '/').includes('A &amp; &lt;one&gt; / <span lang="ar" dir="auto">B &amp; &lt;two&gt;</span>'));
  assert.ok(poemCard({ ...mixedSample, textLanguageOverrides: [{ line: 2, lang: 'ar" onclick="x' }] }, '/').includes('lang="ar&quot; onclick=&quot;x"'));
  assert.match(first.text, /چه جای عیش/);
  assert.match(first.context, /چه امن عیش.*reverses/);
  assert.match(turk.text, /بدم گفتی و خرسندم عفاک الله نکو گفتی/);
  assert.deepEqual(turk.textLanguageSpans, [{ line: 15, text: 'عفاک الله', lang: 'ar' }]);
  assert.ok(renderPoem(turk, poems, '/ai-poems/').includes('بدم گفتی و خرسندم <span lang="ar" dir="auto">عفاک الله</span> نکو گفتی'));
  assert.match(turk.context, /اگر دشنام فرمایی.*بدم گفتی/);
  assert.match(turk.context, /Bashiri.*may be later additions.*hypothesis/);
  assert.match(turk.context, /‘کاین’ may instead be ‘کین’.*‘به آب و رنگ’ is also uncertain/);
  assert.deepEqual(turk.translations, []);
  assert.equal(first.translations.length, 1);
  assert.equal(first.translations[0].text.split('\n').filter(Boolean).length, 42);
  assert.equal(createHash('sha256').update(first.translations[0].text).digest('hex'), '17034c2768a32aadf7dc5069abb4c4ebda470c1a5ad3cfd33ba2661725ae7a49');
  assert.match(first.translations[0].translator, /John Richardson.*paraphrase.*Rousseau/);
  assert.match(first.translations[0].rights, /public domain in the United States.*not a literal translation.*Leila/);
  assert.match(first.translations[0].rights, /Punctuation is normalized.*look'd.*unclear/);
  assert.equal(filterPoems(selected, { readable: 'English' }).length, 1);
  const synthetic = { ...turk, translations: [{ language: 'Persian', title: 'نمونه', text: 'متن نمونه', translator: 'Example', rights: 'Example', source: 'https://example.org/' }] };
  assert.match(renderPoem(synthetic, poems, '/ai-poems/'), /class="verse" lang="fa" dir="rtl">متن نمونه/);
  assert.match(renderPoem(synthetic, poems, '/ai-poems/'), /<h3><span lang="fa" dir="rtl">نمونه<\/span> · Persian<\/h3>/);
  assert.equal(titleAttributes({ ...first, titleLang: 'ar" onmouseover="x' }), ' lang="ar&quot; onmouseover=&quot;x" dir="rtl"');

  // Normalized containment catches exact and embedded repeats, not every
  // manuscript variant or translation of the same work.
  const fold = text => text.normalize('NFKC').toLowerCase().replace(/[\u064a\u0649]/gu, 'ی').replace(/\u0643/gu, 'ک').replace(/[^\p{L}\p{M}\p{N}]/gu, '');
  for (const added of selected) {
    for (const reading of [added.text, ...added.translations.map(item => item.text)].map(fold)) {
      for (const other of poems.filter(item => item.id !== added.id)) {
        for (const text of [other.text, ...other.translations.map(item => item.text)]) {
          const candidate = fold(text);
          if (candidate.length >= 40 && reading.length >= 40) {
            assert.ok(!reading.includes(candidate) && !candidate.includes(reading), `${added.id} overlaps ${other.id}`);
          }
        }
      }
    }
  }
  assert.match(execFileSync('python3', ['scripts/import-hafez-persian.py', '--check'], { encoding: 'utf8' }), /Verified 2 readings and one paraphrase/);
});

test('Kabir-attributed dohas preserve complete historical readings and textual caveats', () => {
  const ids = [
    'kabir-1928-jis-maranai', 'kabir-1928-maya-papani', 'kabir-1928-kaba-phir-kasi',
    'kabir-1928-maya-mui', 'kabir-1928-yahu-ghar-prem', 'kabir-1928-sab-jag-suta', 'kabir-1928-had-jalai',
  ];
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(poems.filter(poem => poem.authorId === 'kabir').length, 7);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\0')).digest('hex'), '766cb9dc7b706db9592f40093aa992b9b4d73ef6c8843831428dbdfb72756e31');
  assert.deepEqual(selected.map(lineCount), [2, 2, 2, 2, 2, 2, 2]);
  for (const poem of selected) {
    assert.equal(poem.language, 'Hindi');
    assert.equal(poem.lang, 'hi');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.country, 'India');
    assert.equal(poem.anonymous, true);
    assert.equal(poem.uncertainAttribution, true);
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.year, 1928);
    assert.match(poem.yearLabel, /edition.*composition date unknown/);
    assert.match(poem.context, /Traditionally attributed.*disputed attributions.*historical mixed Hindavi.*not a claim of modern standard Hindi/);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.doesNotMatch(poem.text, /\s[।॥]/);
    assert.match(poem.rights, /public domain in the United States.*Hindi Wikisource.*CC BY-SA 4\.0.*check local law/);
    assert.match(poem.source, /hi\.wikisource\.org\/w\/index\.php\?title=.*&oldid=\d+$/);
    assert.match(poem.contextSource, /archive\.org\/download\/.*\.pdf#page=\d+$/);
    assert.ok(filterPoems([poem], { language: 'Hindi', readable: 'Hindi', query: poem.title }).includes(poem));
    assert.equal(filterPoems([poem], { readable: 'English' }).length, 0);
    const reader = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(reader.includes(`class="verse" lang="hi" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(reader.includes('Attribution: <strong><a href="/ai-poems/poets/kabir/">Kabir</a></strong>'));
    assert.ok(reader.includes(`${escapeHtml(poem.title)} attributed to Kabir`));
    const schema = JSON.parse(reader.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
    assert.equal(schema.author, undefined);
    assert.ok(reader.includes(escapeHtml(poem.source)));
    assert.ok(reader.includes(escapeHtml(poem.contextSource)));
  }
  assert.match(selected[3].text, /आसा त्रिष्णां/);
  assert.match(selected[3].context, /आसा.*प्रासा.*यौं कहि गया कबीर.*यौं कहै दास कबीर/);
  assert.match(selected[4].text, /घर नांहिं/);
  assert.match(selected[4].context, /नांहिं.*नंहिं.*number is 19.*gives 16/);
  assert.match(selected[5].text, /तोरणि आया बींद/);
  assert.match(selected[5].context, /आया.*पाया/);
  assert.match(selected[6].context, /not proofread.*checked against the scan/);
  assert.ok(!selected.some(poem => /पोथी पढ़ि|कस्तूरी कुंडलि/.test(poem.text)));

  // Preserve vowel marks in Indic scripts; these checks cannot recognize every
  // variant, translation or independent oral reworking.
  const fold = text => text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '');
  for (const added of selected) {
    const reading = fold(added.text);
    for (const other of poems) {
      const texts = [...(other.id === added.id ? [] : [other.text]), ...other.translations.map(item => item.text)];
      for (const text of texts) {
        const candidate = fold(text);
        if (candidate.length >= 35 && reading.length >= 35) {
          assert.ok(!reading.includes(candidate) && !candidate.includes(reading), `${added.id} overlaps ${other.id}`);
        }
      }
    }
  }
  const synthetic = { ...selected[0], translations: [{ language: 'Hindi', title: 'उदाहरण', text: 'उदाहरण पाठ', translator: 'Example', rights: 'Example', source: 'https://example.org/' }] };
  assert.match(renderPoem(synthetic, poems, '/ai-poems/'), /class="verse" lang="hi" dir="ltr">उदाहरण पाठ/);
  const prior = poems.find(poem => poem.id === 'shakespeare-sonnet-18');
  assert.match(renderPoem(prior, poems, '/ai-poems/'), /<title>Sonnet 18 by William Shakespeare/);
  assert.match(execFileSync('python3', ['scripts/import-kabir-hindavi.py', '--check'], { encoding: 'utf8' }), /Verified 7 readings/);
});

test('Polish classics retain distinct work boundaries, historical sources and credited readings', () => {
  const historicIds = new Set([
    'mickiewicz-1826-stepy-akermanskie', 'mickiewicz-1899-oda-do-mlodosci',
    'mickiewicz-1899-smierc-pulkownika', 'konopnicka-1903-a-jak-poszedl-krol',
  ]);
  const selected = poems.filter(poem => poem.id.startsWith('pawlikowska-1926-') || historicIds.has(poem.id));
  const short = selected.filter(poem => poem.authorId === 'maria-pawlikowska-jasnorzewska');
  const mickiewicz = selected.filter(poem => poem.authorId === 'adam-mickiewicz');
  assert.equal(selected.length, 59);
  assert.equal(short.length, 55);
  assert.equal(mickiewicz.length, 3);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\0')).digest('hex'), '3b44a12f93ef6c4087f96cd7f732c66b3ab4693ac5dd176c38bb77d54df0e7cf');
  assert.ok(short.every(poem => lineCount(poem) === 4 && poem.year === 1926));
  assert.deepEqual(mickiewicz.map(lineCount), [14, 75, 36]);
  for (const poem of selected) {
    assert.equal(poem.lang, 'pl');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.country, 'Poland');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*Polish Wikisource contributors.*CC BY-SA 4\.0.*check local law/);
    assert.match(poem.contextSource, /pl\.wikisource\.org\/w\/index\.php\?title=.*&oldid=\d+$/);
    assert.ok(filterPoems([poem], { language: 'Polish', readable: 'Polish', query: poem.title }).includes(poem));
    assert.equal(filterPoems([poem], { readable: 'English' }).length, 0);
    const reader = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(reader.includes(`class="verse" lang="pl" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(reader.includes(escapeHtml(poem.source)));
    assert.ok(reader.includes(escapeHtml(poem.contextSource)));
  }
  assert.ok(short.every(poem => /1927 Wachlarz reprints Pocałunki/.test(poem.context)));
  assert.ok(!selected.some(poem => /kobieta-w-morzu|oczy-na-skrzydlach|wiersz-ukradziony|spozniony-list/.test(poem.id)));
  const byId = id => selected.find(poem => poem.id === id);
  const photograph = byId('pawlikowska-1926-fotografja');
  assert.equal(photograph.displayTitle, 'Fotografia');
  assert.ok(filterPoems(selected, { query: 'Fotografia' }).includes(photograph));
  assert.ok(filterPoems(selected, { query: 'Fotografja' }).includes(photograph));
  assert.match(byId('pawlikowska-1926-milosc').text, /^Nie widziałam cię już od miesiąca\.[\s\S]*bez powietrza!$/);
  assert.match(byId('mickiewicz-1826-stepy-akermanskie').text, /Wpłynąłem[\s\S]*jedźmy, nikt nie woła\.$/);
  const colonel = byId('mickiewicz-1899-smierc-pulkownika');
  assert.match(colonel.text, /^W głuchej puszczy, przed chatą leśnika,/);
  assert.match(colonel.context, /chatą leśnika.*chatką leśnika/);
  assert.match(colonel.rights, /oldid=2633517.*oldid=2633518/);
  const song = byId('konopnicka-1903-a-jak-poszedl-krol');
  assert.equal(lineCount(song), 24);
  assert.equal(song.era, '19th century');
  assert.match(song.text, /A jak poszedł król na wojnę[\s\S]*Te dzwoneczki, te liliowe/);
  assert.match(song.context, /liliowe.*liljowe/);
  assert.match(song.rights, /oldid=1916199.*oldid=1916198/);
  const synthetic = { ...short[0], translations: [{ language: 'Polish', title: 'Przykład', text: 'Przykład tekstu', translator: 'Example', rights: 'Example', source: 'https://example.org/' }] };
  assert.match(renderPoem(synthetic, poems, '/ai-poems/'), /class="verse" lang="pl" dir="ltr">Przykład tekstu/);
});

test('Ukrainian classics retain complete scan readings, page credits and edition differences', () => {
  const ids = [
    'shevchenko-1908-zapovit', 'shevchenko-1908-vechir',
    'ukrainka-1892-contra-spem-spero', 'ukrainka-1892-nadiya',
    'petrenko-1908-nedolia', 'hlibov-1908-zhurba', 'starytskyi-1908-vyklyk',
  ];
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\0')).digest('hex'), '3bb6cdb9e6474ca3a737e319ed82d9e21bd4c105d9d11c465c5eb1e450f880d9');
  assert.deepEqual(selected.map(lineCount), [24, 15, 36, 10, 24, 40, 32]);
  assert.equal(new Set(selected.map(poem => poem.authorId)).size, 5);
  for (const poem of selected) {
    assert.equal(poem.lang, 'uk');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.country, 'Ukraine');
    assert.equal(poem.era, '19th century');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*Ukrainian Wikisource contributors.*CC BY-SA 4\.0.*check local law/);
    assert.match(poem.contextSource, /uk\.wikisource\.org\/w\/index\.php\?title=.*&oldid=\d+$/);
    assert.ok(filterPoems([poem], { language: 'Ukrainian', readable: 'Ukrainian', query: poem.title }).includes(poem));
    assert.equal(filterPoems([poem], { readable: 'English' }).length, 0);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="uk" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  const byId = id => selected.find(poem => poem.id === id);
  const testament = byId('shevchenko-1908-zapovit');
  assert.match(testament.text, /Як понесе з Украіни[\s\S]*Я не знаю Бога!/);
  assert.match(testament.context, /Було видно, було чути.*Були видні, було чути/);
  const contra = byId('ukrainka-1892-contra-spem-spero');
  assert.equal(contra.year, null);
  assert.match(contra.yearLabel, /1892.*1893/);
  assert.match(contra.text, /Я не дам сьому серденьку спати[\s\S]*Смерть наляже на груди важенько/);
  assert.match(contra.rights, /oldid=560107.*oldid=560111/);
  assert.match(contra.context, /36-line.*28-line/);
  const nedolia = byId('petrenko-1908-nedolia');
  assert.match(nedolia.text, /У в світі іх яснім/);
  assert.match(nedolia.rights, /oldid=1128366.*oldid=1128367/);
  assert.match(nedolia.context, /1841.*Небо triptych/);
  assert.ok(filterPoems(selected, { query: 'Недоля' }).includes(nedolia));
  assert.match(byId('hlibov-1908-zhurba').context, /любе літечко.*тепле літечко/);
  assert.match(byId('starytskyi-1908-vyklyk').text, /^Ніч яка, Господи, місяшна/);
  assert.ok(filterPoems(selected, { query: 'ніч яка місячна' }).some(poem => poem.id === 'starytskyi-1908-vyklyk'));
  assert.ok(filterPoems(selected, { query: 'Леся Українка' }).length === 2);
  const synthetic = { ...selected[0], translations: [{ language: 'Ukrainian', title: 'Приклад', text: 'Приклад тексту', translator: 'Example', rights: 'Example', source: 'https://example.org/' }] };
  assert.match(renderPoem(synthetic, poems, '/ai-poems/'), /class="verse" lang="uk" dir="ltr">Приклад тексту/);
});

test('Greek and Russian historical-print readings preserve work boundaries, sources and variants', () => {
  const ids = [
    'cavafy-1926-candles', 'cavafy-1926-supplication', 'cavafy-1926-walls', 'cavafy-1926-windows',
    'cavafy-1927-voices', 'cavafy-1927-thermopylae', 'cavafy-1911-antony', 'cavafy-1911-ithaka',
    'akhmatova-1912-clasped-hands', 'akhmatova-1912-last-meeting', 'akhmatova-1912-grey-eyed-king',
  ];
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\0')).digest('hex'), '660a178715ec2a93b8ec0acb3712d441c1b5d4cb3a3acdcd3865cb3072fe0907');
  assert.deepEqual(selected.map(lineCount), [13, 8, 8, 8, 8, 14, 19, 36, 12, 16, 14]);
  assert.equal(selected.filter(poem => poem.language === 'Greek').length, 8);
  assert.equal(selected.filter(poem => poem.language === 'Russian').length, 3);
  for (const poem of selected) {
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.ok(filterPoems([poem], { language: poem.language, readable: poem.language, query: poem.title }).includes(poem));
    assert.equal(filterPoems([poem], { readable: 'English' }).length, 0);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="${poem.lang}" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  const byId = id => selected.find(poem => poem.id === id);
  assert.ok(byId('cavafy-1911-ithaka').text.endsWith('ἤδη θὰ τὸ κατάλαβες ἡ Ἰθάκες τὶ σημαίνουν.'));
  assert.match(byId('cavafy-1911-ithaka').context, /final three lines.*page 287/);
  assert.match(byId('cavafy-1926-candles').text, /^Τοῦ μέλλοντος ἡ μέρες/);
  assert.match(byId('cavafy-1926-candles').rights, /Greek Wikisource contributors.*CC BY-SA 4\.0/);
  assert.match(byId('cavafy-1926-candles').context, /θλιβερὴ σειρὰ.*θλιβερή γραμμή/);
  assert.match(byId('cavafy-1926-windows').context, /Πλὴν τὰ παράθυρα.*Μα τα παράθυρα/);
  assert.match(byId('akhmatova-1912-last-meeting').text, /Я обманут, слышишь, унылый/);
  assert.match(byId('akhmatova-1912-last-meeting').context, /page 26.*Я обманут моей унылой/);
  assert.match(byId('akhmatova-1912-grey-eyed-king').rights, /died in 1966.*may persist elsewhere/);
  assert.ok(filterPoems(selected, { query: 'Καβάφης', language: 'Greek' }).length === 8);
  assert.ok(filterPoems(selected, { query: 'Αντωνιον', language: 'Greek' }).some(poem => poem.id === 'cavafy-1911-antony'));
  const synthetic = { ...selected[8], translations: [{ language: 'Greek', title: 'Παράδειγμα', text: 'Παράδειγμα', translator: 'Example', rights: 'Example', source: 'https://example.org/' }] };
  assert.match(renderPoem(synthetic, poems, '/ai-poems/'), /class="verse" lang="el" dir="ltr">Παράδειγμα/);
});

test('international classics retain complete scan readings, variants and separately credited translations', () => {
  const ids = [
    'pushkin-1917-winter-evening', 'pushkin-1917-the-cloud', 'pushkin-1917-monument',
    'lermontov-1917-the-angel', 'lermontov-1917-the-sail', 'lermontov-1917-prayer',
    'lermontov-1917-alone-on-the-road', 'lermontov-1917-the-clouds',
    'nekrasov-1917-schoolboy', 'nekrasov-1917-forgive', 'nekrasov-1917-hearing-the-horrors-of-war',
    'shijing-1871-guan-ju', 'shijing-1871-jian-jia', 'goethe-1900-erlkoenig',
  ];
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(new Set(selected.map(poem => poem.id)).size, 14);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\0')).digest('hex'), '8423bd7f97563c6f47c16bf59e9934701deb49d54a9980aa7891d07913fac8be');
  assert.equal(createHash('sha256').update(selected.flatMap(poem => poem.translations).map(item => item.text).join('\0')).digest('hex'), 'fed0ed679ba0118cd9f7efef87c6641acb7e432d05471d9bbf325a28ab33971c');
  assert.deepEqual(selected.map(lineCount), [32, 12, 20, 16, 12, 12, 20, 12, 40, 8, 17, 10, 12, 32]);
  assert.equal(selected.filter(poem => poem.language === 'Russian').length, 11);
  assert.deepEqual(new Set(selected.slice(0, 11).map(poem => poem.authorId)), new Set(['alexander-pushkin', 'mikhail-lermontov', 'nikolai-nekrasov']));
  for (const poem of selected) {
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.ok(filterPoems([poem], { query: poem.title, readable: poem.language }).includes(poem));
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="${poem.lang}" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
    for (const translation of poem.translations) {
      assert.match(translation.rights, /public domain in the United States/);
      assert.ok(html.includes(escapeHtml(translation.text)));
      assert.ok(filterPoems([poem], { readable: 'English', query: translation.text.split('\n')[0] }).includes(poem));
    }
  }
  const byId = id => selected.find(poem => poem.id === id);
  assert.match(byId('pushkin-1917-winter-evening').context, /запоздалой.*запоздалый/);
  assert.match(byId('lermontov-1917-alone-on-the-road').context, /дремали.*дрожали/);
  assert.match(byId('nekrasov-1917-schoolboy').context, /пустых.*тупых/);
  assert.match(byId('lermontov-1917-the-sail').context, /скрипит.*скрыпит/);
  assert.match(byId('shijing-1871-jian-jia').context, /淒淒.*萋萋/);
  assert.equal(byId('shijing-1871-guan-ju').anonymous, true);
  assert.match(byId('goethe-1900-erlkoenig').text, /Erlkönig hat mir ein Leids gethan!/);
  assert.equal(byId('lermontov-1917-the-angel').translations.length, 1);
  assert.match(byId('lermontov-1917-the-angel').translations[0].translator, /Babette Deutsch and Avrahm Yarmolinsky/);
  assert.match(byId('lermontov-1917-the-angel').translations[0].rights, /may persist elsewhere/);
  assert.equal(selected.flatMap(poem => poem.translations).length, 3);
  assert.equal(filterPoems(selected, { readable: 'English' }).length, 3);
  assert.equal(selected.some(poem => /^(?:Осень|Зимняя дорога)$/.test(poem.title)), false);
  const synthetic = { ...selected[0], translations: [{ language: 'Russian', title: 'Пример', text: 'Пример текста', translator: 'Example', rights: 'Example', source: 'https://example.org/' }] };
  assert.match(renderPoem(synthetic, poems, '/ai-poems/'), /class="verse" lang="ru" dir="ltr">Пример текста/);
});

test('Bengali Gitanjali songs retain complete readings, page credits and the self-reworking', () => {
  const selected = poems.filter(poem => poem.id.startsWith('tagore-gitanjali-bengali-') && poem.id !== 'tagore-gitanjali-bengali-021');
  assert.equal(selected.length, 21);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\0')).digest('hex'), 'ce9ced7686c9b17e3423a11e6bdcc610a43e8bf34349017702f33df5d0f0d468');
  assert.deepEqual(selected.map(lineCount), [20, 20, 20, 22, 18, 12, 13, 16, 20, 16, 28, 18, 25, 10, 22, 16, 20, 30, 16, 20, 24]);
  assert.deepEqual(selected.map(poem => poem.id), [...Array.from({ length: 20 }, (_, index) => `tagore-gitanjali-bengali-${String(index + 1).padStart(3, '0')}`), 'tagore-gitanjali-bengali-120']);
  for (const poem of selected) {
    assert.equal(poem.lang, 'bn');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.authorId, 'rabindranath-tagore');
    assert.equal(poem.country, 'India');
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.year, null);
    assert.match(poem.yearLabel, /1320.*1913–1914/);
    assert.deepEqual(poem.themes, []);
    assert.match(poem.source, /bn\.wikisource\.org\/w\/index\.php\?title=.*&oldid=\d+$/);
    assert.match(poem.rights, /public domain in the United States.*Bengali Wikisource contributors.*CC BY-SA 4\.0.*check local law/);
    assert.ok(filterPoems([poem], { language: 'Bengali', readable: 'Bengali', query: poem.title }).includes(poem));
    assert.ok(filterPoems([poem], { query: 'রবীন্দ্রনাথ ঠাকুর' }).includes(poem));
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="bn" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  const first = selected[0];
  assert.match(first.rights, /oldid=1794741.*oldid=1962841/);
  assert.ok(first.text.endsWith('ডুবাও চোখের জলে।'));
  assert.ok(!selected.find(poem => poem.id.endsWith('-016')).text.includes('আষাঢ় ১৩১৬'));
  const adapted = selected.at(-1);
  assert.match(adapted.text, /বারো মাস/);
  assert.match(adapted.text, /রাখোরে ধ্যান/);
  assert.match(adapted.text, /কর্ম্মযোগে/);
  assert.equal(adapted.translations.length, 1);
  const english = adapted.translations[0];
  assert.match(english.title, /prose reworking/);
  assert.match(english.translator, /Tagore.*self-reworking.*1913/);
  assert.match(english.rights, /public domain in the United States.*not a literal line-by-line translation/);
  assert.match(english.text, /^Leave this chanting.*sweat of thy brow\.$/s);
  assert.ok(filterPoems([adapted], { readable: 'English', query: 'Leave this chanting' }).includes(adapted));
  assert.equal(filterPoems(selected.slice(0, -1), { readable: 'English' }).length, 0);
  const html = renderPoem(adapted, poems, '/ai-poems/');
  assert.ok(html.includes(`class="verse" lang="en" dir="ltr">${escapeHtml(english.text)}`));
  const synthetic = { ...first, translations: [{ language: 'Bengali', title: 'উদাহরণ', text: 'বাংলা পাঠ', translator: 'Example', rights: 'Example', source: 'https://example.org/' }] };
  assert.match(renderPoem(synthetic, poems, '/ai-poems/'), /class="verse" lang="bn" dir="ltr">বাংলা পাঠ/);
});

test('German classics retain distinct complete readings, attribution and edition boundaries', () => {
  const selected = poems.filter(poem => poem.language === 'German' && poem.id !== 'goethe-1900-erlkoenig' && !poem.id.startsWith('recognized-'));
  assert.equal(selected.length, 25);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\0')).digest('hex'), '07fed8a2e994629e691bd29522568c3e34914d3c460307310709e52a220cc221');
  assert.deepEqual(selected.map(lineCount), [21, 32, 98, 32, 8, 8, 12, 24, 20, 104, 40, 8, 8, 8, 20, 12, 12, 8, 8, 12, 12, 12, 24, 24, 8]);
  assert.deepEqual(new Set(selected.map(poem => poem.authorId)), new Set(['johann-wolfgang-von-goethe', 'joseph-von-eichendorff', 'friedrich-schiller', 'traditional-german-song', 'heinrich-heine']));
  for (const poem of selected) {
    assert.equal(poem.lang, 'de');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.country, 'Germany');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.source, /de\.wikisource\.org\/w\/index\.php\?title=.*&oldid=\d+$/);
    assert.match(poem.contextSource, /commons\.wikimedia\.org\/wiki\/File:/);
    assert.match(poem.rights, /public domain in the United States.*Wikisource contributors, CC BY-SA 4\.0.*check local law/);
    assert.ok(filterPoems([poem], { language: 'German', readable: 'German', query: poem.title }).includes(poem));
    assert.equal(filterPoems([poem], { readable: 'English' }).length, 0);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="de" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  const byId = id => selected.find(poem => poem.id === id);
  assert.ok(byId('goethe-der-zauberlehrling').text.endsWith('Erst hervor der alte Meister.“'));
  assert.equal(byId('schiller-an-die-freude').text.split('\n').filter(line => line === 'Chor').length, 8);
  assert.match(byId('traditional-die-gedanken-sind-frei').context, /Geadnken.*Gedanken/);
  assert.equal(byId('traditional-die-gedanken-sind-frei').anonymous, true);
  assert.match(byId('eichendorff-sehnsucht').context, /267–268.*268–269/);
  assert.match(byId('heine-die-lorelei').text, /Lore-Ley gethan\.$/);
  assert.ok(filterPoems(selected, { query: 'Lorelei' }).includes(byId('heine-die-lorelei')));
  assert.ok(filterPoems(selected, { query: 'Über allen Gipfeln' }).includes(byId('goethe-ein-gleiches')));
  const synthetic = { ...selected[0], translations: [{ language: 'German', title: 'Beispiel', text: 'Beispieltext', translator: 'Example', rights: 'Example', source: 'https://example.org/' }] };
  assert.match(renderPoem(synthetic, poems, '/ai-poems/'), /class="verse" lang="de" dir="ltr">Beispieltext/);
});

test('recognized international works retain complete readings, credits and distinct boundaries', () => {
  const ids = [
    'recognized-verlaine-mon-reve-familier', 'recognized-verlaine-chanson-dautomne',
    'recognized-rilke-der-panther', 'recognized-rilke-torso-apollos',
    'recognized-yeats-second-coming', 'recognized-yeats-easter-1916',
    'recognized-naidu-palanquin-bearers', 'recognized-naidu-indian-weavers',
    'recognized-naidu-coromandel-fishers', 'recognized-naidu-bangle-sellers',
    'tagore-gitanjali-bengali-021',
  ];
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.deepEqual(selected.map(lineCount), [14, 18, 12, 14, 22, 80, 12, 12, 12, 24, 14]);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\0')).digest('hex'), '58f54ac24df3728d8b5bc2a8b4e1a4d45c2ea361f7c4a91cfbc8f146d02370e9');
  assert.deepEqual(selected.map(poem => poem.lang), ['fr', 'fr', 'de', 'de', 'en', 'en', 'en', 'en', 'en', 'en', 'bn']);
  for (const poem of selected) {
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States.*Wikisource contributors under CC BY-SA 4\.0.*check local law/);
    assert.match(poem.source, /wikisource\.org\/w\/index\.php\?title=.*&oldid=\d+$/);
    assert.match(poem.contextSource, /commons\.wikimedia\.org\/wiki\/File:/);
    assert.ok(filterPoems([poem], { language: poem.language, query: poem.title }).includes(poem));
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(`class="verse" lang="${poem.lang}" dir="ltr">${escapeHtml(poem.text)}`));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.contextSource)));
  }
  assert.match(selected[0].yearLabel, /1866.*1867/);
  assert.match(selected[4].context, /1920 imprint.*1921/);
  assert.match(selected[4].context, /a waste of desert sand.*Wind shadows.*somewhere in sands of the desert.*Reel shadows/);
  assert.ok(selected[4].text.startsWith('Turning and turning'));
  assert.ok(selected[4].text.endsWith('Slouches towards Bethlehem to be born?'));
  assert.ok(!selected[4].text.includes('Once more the storm'));
  assert.ok(!selected[5].text.includes('September 25th'));
  assert.match(selected[7].context, /comma.*period/);
  assert.match(selected[7].text, /solemn and still,/);
  assert.match(selected[8].context, /morning light.*morning lights/);
  assert.match(selected[8].text, /morning light,/);
  assert.match(selected[10].context, /English Gitanjali no\. 23.*not a separate work/);
  assert.ok(!selected[10].text.includes('আষাঢ় ১৩১৬'));

  // Screen exact and contained readings in both originals and translations;
  // this cannot identify every cross-language reworking or textual variant.
  const fold = text => text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const added of selected) {
    const reading = fold(added.text);
    for (const other of poems) {
      const texts = [...(other.id === added.id ? [] : [other.text]), ...other.translations.map(item => item.text)];
      for (const text of texts) {
        const candidate = fold(text);
        if (candidate.length >= 35 && reading.length >= 35) {
          assert.ok(!reading.includes(candidate) && !candidate.includes(reading), `${added.id} overlaps ${other.id}`);
        }
      }
    }
  }
  assert.ok(!poems.some(poem => [poem.text, ...poem.translations.map(item => item.text)].some(text => /art thou abroad on this stormy night/i.test(text))));
});

test('popular multilingual poems retain complete historical readings and disclosed variants', () => {
  const ids = [
    'frost-1916-the-road-not-taken', 'rimbaud-1895-le-dormeur-du-val', 'rimbaud-1895-voyelles',
    'machado-1917-a-un-olmo-seco', 'pessoa-1926-o-menino-da-sua-mae', 'shiki-1902-kaki-kueba',
  ];
  const selected = ids.map(id => poems.find(poem => poem.id === id));
  assert.ok(selected.every(Boolean));
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\0')).digest('hex'), '28bd653784fccc68e6d3ff042a7a55d8b4c80de40f12b81e6a5b4c1e0335370b');
  assert.deepEqual(selected.map(lineCount), [20, 14, 14, 30, 30, 3]);
  assert.deepEqual(selected.map(poem => poem.lang), ['en', 'fr', 'fr', 'es', 'pt', 'ja']);
  assert.deepEqual(selected.map(poem => poem.year), [1916, 1895, 1895, 1917, 1926, 1902]);
  for (const poem of selected) {
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.rights, /public domain in the United States/);
    assert.match(poem.rights, /check local law/);
    assert.ok(filterPoems(poems, { query: poem.title }).some(result => result.id === poem.id));
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(escapeHtml(poem.text)));
    assert.ok(html.includes(escapeHtml(poem.source)));
    assert.ok(html.includes(escapeHtml(poem.rights)));
  }
  assert.match(selected[0].rights, /died in 1963.*protected elsewhere/);
  assert.match(selected[1].text, /un petit val qui mousse/);
  assert.match(selected[1].context, /prints ‘un petit aval’.*editorially uses ‘un petit val’/);
  assert.match(selected[2].text, /bombillent/);
  assert.match(selected[2].text, /plein de strideurs/);
  assert.match(selected[2].context, /bombinent.*plein des strideurs/);
  assert.match(selected[3].context, /Soria, 1912/);
  assert.match(selected[4].text, /Tam jovem!/);
  assert.match(selected[4].text, /Cahiu-lhe/);
  assert.equal(selected[5].text, '柹くへば\n鐘が鳴るなり\n法隆寺');
  assert.ok(filterPoems(poems, { query: '柿食えば鐘が鳴るなり法隆寺' }).includes(selected[5]));
  assert.match(selected[5].context, /three phrase lines are editorial/);
});

test('Montes del Valle poems retain complete 1883 readings and the printed errata', () => {
  const selected = poems.filter(poem => poem.id.startsWith('montes-del-valle-1883-'));
  const slugs = ['a-mi-hija-luz', 'a-zoila-rosa-del-valle', 'una-azucena', 'apologo', 'a-magdalena-giraldo-de-a', 'no-te-olvidare', 'pepita-grillo', 'en-el-piano', 'adios', 'la-esperanza', 'dos-artistas', 'un-canario', 'la-imprenta'];
  const pages = [64, 83, 113, 114, 124, 125, 131, 136, 137, 170, 198, 199, 201];
  const lineCounts = [17, 22, 16, 16, 16, 24, 16, 14, 16, 16, 16, 12, 14];
  assert.equal(selected.length, 13);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\0')).digest('hex'), '89941f058ea911e5d33cc21db41c2ce7c7f0d9d11b16805222cbd032bbbb4acb');
  assert.equal(createHash('sha256').update(JSON.stringify(selected.map(({ id, title, source }) => ({ id, title, source })))).digest('hex'), '9d1acb4c834681c5e1bd42adee9d7e9b510877ccf19b0fe4d79d3cce79ffd910');
  assert.equal(groupPoets(poems).find(group => group.id === 'agripina-montes-del-valle').poems.length, 13);
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.id, `montes-del-valle-1883-${slugs[index]}`);
    assert.equal(lineCount(poem), lineCounts[index]);
    assert.equal(poem.author, 'Agripina Montes del Valle');
    assert.equal(poem.authorYears, '1844–1915');
    assert.equal(poem.country, 'Colombia');
    assert.equal(poem.language, 'Spanish');
    assert.equal(poem.lang, 'es');
    assert.equal(poem.year, 1883);
    assert.equal(poem.yearLabel, 'Printed in 1883');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.ok(poem.source.endsWith(`#page=${pages[index]}`));
    assert.match(poem.context, /does not establish when or where the poem was composed/);
    assert.match(poem.context, /PDF may download/);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.ok(filterPoems([poem], { query: poem.text.split('\n').find(line => line.length > 15) }).includes(poem));
    assert.equal(filterPoems([poem], { readable: 'English' }).length, 0);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(escapeHtml(poem.text)));
    assert.ok(html.includes(escapeHtml(poem.source)));
  }
  const bySlug = slug => selected.find(poem => poem.id === `montes-del-valle-1883-${slug}`);
  const magdalena = bySlug('a-magdalena-giraldo-de-a');
  assert.match(magdalena.text, /Se evaporó su esencia bendecida/);
  assert.match(magdalena.context, /prints ‘Se evaporó su aroma bendecida’.*errata.*‘esencia’/);
  assert.ok(magdalena.contextSource.endsWith('#page=206'));
  assert.match(bySlug('una-azucena').context, /index gives ‘A una azucena’/);
  assert.match(bySlug('apologo').text, /La flor, la roca, el insecto,$/);
  assert.match(bySlug('adios').context, /‘1865’.*without specifying what the date denotes/);
  assert.equal(filterPoems(selected, { query: 'Agripina Montes del Valle', country: 'Colombia' }).length, 13);
});

test('Agustini poems retain complete 1913 readings, distinct Nocturnos and source caveats', () => {
  const selected = poems.filter(poem => poem.id.startsWith('agustini-1913-'));
  const slugs = ['ofrendando-el-libro', 'nocturno-invierno', 'tu-boca', 'dia-nuestro', 'tres-petalos-a-tu-perfil', 'la-ruptura', 'con-tu-retrato', 'en-silencio', 'otra-estirpe', 'fiera-de-amor', 'ceguera', 'inextinguibles', 'nocturno-lago'];
  const pages = [21, 22, 24, 29, 30, 31, 37, 38, 39, 45, 46, 47, 52];
  const lineCounts = [13, 30, 14, 12, 18, 8, 14, 14, 14, 19, 8, 8, 8];
  assert.equal(selected.length, 13);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\0')).digest('hex'), '7327e45a6becf43043697a4a9f796d068455c64cfe4eb6c40be2d73c62a02a53');
  assert.equal(createHash('sha256').update(JSON.stringify(selected.map(({ id, title, source }) => ({ id, title, source })))).digest('hex'), '2f68d093201bb1b2d47c22f0db7cab926502e1e21c31dbb54aa588ac15b481bd');
  assert.equal(groupPoets(poems).find(group => group.id === 'delmira-agustini').poems.length, 13);
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.id, `agustini-1913-${slugs[index]}`);
    assert.equal(lineCount(poem), lineCounts[index]);
    assert.equal(poem.author, 'Delmira Agustini');
    assert.equal(poem.authorYears, '1886–1914');
    assert.equal(poem.country, 'Uruguay');
    assert.equal(poem.language, 'Spanish');
    assert.equal(poem.lang, 'es');
    assert.equal(poem.year, 1913);
    assert.equal(poem.yearLabel, 'Printed in 1913');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.ok(poem.source.endsWith(`#page=${pages[index]}`));
    assert.match(poem.context, /birth year as 1886; some sources give 1887/);
    assert.match(poem.context, /does not establish when or where the poem was composed/);
    assert.match(poem.rights, /public domain in the United States.*check local law/);
    assert.ok(filterPoems([poem], { query: poem.text.split('\n').find(line => line.length > 15) }).includes(poem));
    assert.equal(filterPoems([poem], { readable: 'English' }).length, 0);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(escapeHtml(poem.text)));
    assert.ok(html.includes(escapeHtml(poem.source)));
  }
  const bySlug = slug => selected.find(poem => poem.id === `agustini-1913-${slug}`);
  const nocturnos = filterPoems(selected, { query: 'Nocturno', country: 'Uruguay' }).filter(poem => poem.title === 'Nocturno');
  assert.equal(nocturnos.length, 2);
  assert.deepEqual(nocturnos.map(poem => poem.disambiguation), ['Fuera, la noche en veste de tragedia solloza', 'Engarzado en la noche el lago de tu alma,']);
  assert.match(bySlug('nocturno-lago').text, /la sima de la Vida/);
  assert.match(bySlug('nocturno-lago').context, /Ciudad Seva comparison reads ‘la cima de la Vida’/);
  assert.match(bySlug('tu-boca').text, /Seguía mi divina labor sobre la roca/);
  assert.match(bySlug('tu-boca').context, /Seguía mi divina labor de roca/);
  assert.match(bySlug('en-silencio').text, /Mi cabello se desfloca/);
  assert.match(bySlug('en-silencio').context, /mi cabello se desfleca/);
  assert.match(bySlug('la-ruptura').text, /Esfinje tenebrosa suspensa de otras vidas,$/);
  assert.match(bySlug('inextinguibles').context, /index gives the singular ‘Inextinguible’/);
  assert.equal(filterPoems(selected, { query: 'Delmira Agustini', country: 'Uruguay' }).length, 13);
});

test('Haitian anthology poems retain complete readings, attribution and edition caveats', () => {
  const selected = poems.filter(poem => poem.id.startsWith('haiti-morpeau-1925-'));
  const slugs = ['puisque-le-ciel-tenvoie', 'labandonnee', 'au-temps', 'le-fils-du-noir', 'orfevrerie', 'absinthe', 'les-papillons'];
  const pages = [109, 109, 111, 122, 123, 124, 125];
  const lineCounts = [12, 30, 12, 30, 16, 14, 15];
  assert.equal(selected.length, 7);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\0')).digest('hex'), '21c92be6ea56d94ab57ac0df1222430f626aca4654078fb1ac885e370adead25');
  assert.equal(createHash('sha256').update(JSON.stringify(selected.map(({ id, title, source }) => ({ id, title, source })))).digest('hex'), '61c0c5e4275704ff13de8eff29a639a23a77572ea34cbecaefd8b343c312413f');
  assert.equal(groupPoets(poems).find(group => group.id === 'virginie-sampeur').poems.length, 3);
  assert.equal(groupPoets(poems).find(group => group.id === 'oswald-durand').poems.length, 4);
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.id, `haiti-morpeau-1925-${slugs[index]}`);
    assert.equal(lineCount(poem), lineCounts[index]);
    assert.equal(poem.author, index < 3 ? 'Virginie Sampeur' : 'Oswald Durand');
    assert.equal(poem.country, 'Haiti');
    assert.equal(poem.language, 'French');
    assert.equal(poem.lang, 'fr');
    assert.equal(poem.year, 1925);
    assert.equal(poem.yearLabel, 'Anthologized 1925');
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.ok(poem.source.endsWith(`#page=${pages[index]}`));
    assert.match(poem.context, /does not establish when or where the poem was composed/);
    assert.match(poem.rights, /public domain in the United States.*image-reuse terms are not established/);
    assert.ok(filterPoems([poem], { query: poem.text.split('\n').find(line => line.length > 15) }).includes(poem));
    assert.equal(filterPoems([poem], { readable: 'English' }).length, 0);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(escapeHtml(poem.text)));
    assert.ok(html.includes(escapeHtml(poem.source)));
  }
  const bySlug = slug => selected.find(poem => poem.id === `haiti-morpeau-1925-${slug}`);
  assert.match(bySlug('labandonnee').text, /n’a-t-il pu se défendre/);
  assert.match(bySlug('labandonnee').context, /n’a-t-il su se défendre/);
  assert.match(bySlug('le-fils-du-noir').text, /^I\n[\s\S]*\nII\n[\s\S]*nos bruns maïs/);
  assert.match(bySlug('le-fils-du-noir').context, /two numbered sonnets form one work.*nos blonds maïs/);
  assert.match(bySlug('les-papillons').context, /1896 poem with the same title begins ‘Te souvient-il’/);
  assert.ok(filterPoems(selected, { query: 'Virginie Sampeur', country: 'Haiti' }).length === 3);
  assert.ok(filterPoems(selected, { query: 'Oswald Durand', country: 'Haiti' }).length === 4);
});
test('Storni poems retain complete 1918 readings, Argentine identity and edition caveats', () => {
  const selected = poems.filter(poem => poem.id.startsWith('storni-1918-'));
  const slugs = ['asi', 'este-grave-dano', 'sabado', 'dime', 'capricho', 'dulce-tortura', 'el-dulce-dano', 'dos-palabras', 'tu-dulzura', 'el-llamado', 'bajo-tus-miradas', 'queja', 'ladrona', 'transfusion', 'siete-vidas', 'tu-me-quieres-blanca', 'el-oro-de-la-vida', 'tentacion', 'que-diria', 'sentirse', 'cuadrados-y-angulos', 'aspecto', 'bah', 'una-pared', 'parasitos', 'verdad', 'sabeis-algo', 'el-extrano-deseo'];
  const pages = [5, 7, 9, 14, 16, 26, 27, 36, 38, 45, 56, 65, 71, 78, 83, 98, 113, 114, 115, 117, 137, 138, 139, 140, 141, 142, 143, 144];
  const lineCounts = [18, 8, 25, 24, 28, 8, 14, 18, 14, 19, 14, 16, 12, 14, 16, 59, 10, 12, 12, 8, 9, 8, 8, 6, 7, 8, 6, 14];
  assert.equal(selected.length, 28);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\0')).digest('hex'), '4ad45110030d7940f8c6d96882b8165b1f059662dad32470f3f5d507a416d296');
  assert.equal(createHash('sha256').update(JSON.stringify(selected.map(({ id, title, source }) => ({ id, title, source })))).digest('hex'), '5947d6904144d5dcc89e9e494491c5750f3adfafb355ef1c9603c792fa2ce9b0');
  assert.equal(groupPoets(poems).find(group => group.id === 'alfonsina-storni').poems.length, 28);
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.id, `storni-1918-${slugs[index]}`);
    assert.equal(lineCount(poem), lineCounts[index]);
    assert.equal(poem.author, 'Alfonsina Storni');
    assert.equal(poem.country, 'Argentina');
    assert.equal(poem.language, 'Spanish');
    assert.equal(poem.lang, 'es');
    assert.equal(poem.year, 1918);
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.ok(poem.source.endsWith(`#page=${pages[index]}`));
    assert.match(poem.context, /Swiss-born Argentine poet.*stanza joins at page breaks may be editorial/);
    assert.match(poem.rights, /public domain in the United States.*Commons marks the linked scan public domain/);
    assert.ok(filterPoems([poem], { query: poem.text.split('\n')[1] }).some(item => item.id === poem.id));
    assert.equal(filterPoems([poem], { readable: 'English' }).length, 0);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(escapeHtml(poem.text)));
    assert.ok(html.includes(escapeHtml(poem.source)));
  }
  const bySlug = slug => selected.find(poem => poem.id === `storni-1918-${slug}`);
  assert.match(bySlug('asi').text, /Dí luces.*\nCuando fuí/);
  assert.match(bySlug('sabado').text, /^Levanté temprano[\s\S]*Comedor en sombras/);
  assert.match(bySlug('sabado').context, /‘Me levanté temprano’.*‘Comedor en sombra’/);
  assert.match(bySlug('tu-me-quieres-blanca').text, /^Tu me quieres alba,[\s\S]*y lévate al alba\.[\s\S]*Preténdeme casta\.$/);
  assert.match(bySlug('tu-me-quieres-blanca').context, /‘y lévate al alba’.*‘y límpiate al alba’/);
  assert.match(bySlug('que-diria').text, /por extra fantasía,[\s\S]*cubriendo las aceras/);
  assert.match(bySlug('que-diria').context, /‘ultra fantasía’.*‘cubriendo en las aceras’/);
  assert.ok(filterPoems(selected, { query: 'extra fantasía' }).includes(bySlug('que-diria')));
  assert.ok(filterPoems(selected, { query: 'Tú me quieres blanca', country: 'Argentina' }).includes(bySlug('tu-me-quieres-blanca')));
  assert.ok(filterPoems(selected, { query: 'Dos palabras', country: 'Argentina' }).includes(bySlug('dos-palabras')));
});
test('Darío poems retain complete 1896 readings, Nicaragua identity and edition caveats', () => {
  const selected = poems.filter(poem => poem.id.startsWith('dario-1896-'));
  const slugs = ['sonatina', 'blason', 'del-campo', 'ojos-negros-julia', 'para-una-cubana', 'para-la-misma', 'bouquet', 'margarita', 'mia', 'dice-mia', 'heraldos', 'ite-misa-est'];
  const pages = [45, 49, 53, 57, 67, 69, 71, 85, 87, 89, 91, 93];
  const lineCounts = [48, 36, 32, 24, 14, 14, 20, 14, 14, 11, 19, 14];
  assert.equal(selected.length, 12);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\0')).digest('hex'), '753ba6b336ed7d994bb4a65e9b9292ff52f716c3844250bf04285d8b56fd577c');
  assert.equal(createHash('sha256').update(JSON.stringify(selected.map(({ id, title, source }) => ({ id, title, source })))).digest('hex'), '32659750f886e5f3af3dd5c53feaacfabf6804cd5681d4a0593d9016fe5ad38f');
  const darioGroup = groupPoets(poems).find(group => group.id === 'ruben-dario').poems;
  assert.equal(darioGroup.length, poems.filter(poem => poem.authorId === 'ruben-dario').length);
  assert.ok(selected.every(poem => darioGroup.some(item => item.id === poem.id)));
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.id, `dario-1896-${slugs[index]}`);
    assert.equal(lineCount(poem), lineCounts[index]);
    assert.equal(poem.author, 'Rubén Darío');
    assert.equal(poem.country, 'Nicaragua');
    assert.equal(poem.language, 'Spanish');
    assert.equal(poem.lang, 'es');
    assert.equal(poem.year, 1896);
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.ok(poem.source.endsWith(`#page=${pages[index]}`));
    assert.match(poem.context, /preserving historical spelling and punctuation/);
    assert.match(poem.rights, /public domain in the United States.*image-reuse terms are not established/);
    assert.ok(filterPoems([poem], { query: poem.text.split('\n')[1] }).some(item => item.id === poem.id));
    assert.equal(filterPoems([poem], { readable: 'English' }).length, 0);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(escapeHtml(poem.text)));
    assert.ok(html.includes(escapeHtml(poem.source)));
  }
  const bySlug = slug => selected.find(poem => poem.id === `dario-1896-${slug}`);
  assert.match(bySlug('sonatina').text, /pavos-reales/);
  assert.match(bySlug('sonatina').context, /1917 edition.*comparison rather than the 1896 witness/);
  assert.match(bySlug('del-campo').text, /espectral ginete/);
  assert.match(bySlug('para-una-cubana').text, /púrpura finje/);
  assert.match(bySlug('ite-misa-est').text, /como convalesciente/);
  assert.match(bySlug('ite-misa-est').context, /‘Ite, missa est’.*‘convaleciente’/);
  assert.equal(bySlug('ite-misa-est').title, 'Ite misa est');
  assert.equal(bySlug('ite-misa-est').displayTitle, 'Ite, missa est');
  assert.equal(bySlug('ite-misa-est').displayTitleLang, 'la');
  for (const query of ['Ite misa est', 'Ite, missa est', 'missa est']) {
    assert.ok(filterPoems(selected, { query }).includes(bySlug('ite-misa-est')), query);
  }
  const reader = renderPoem(bySlug('ite-misa-est'), poems, '/ai-poems/');
  assert.match(reader, /<h1 lang="la" dir="auto">Ite, missa est<\/h1>/);
  assert.ok(reader.includes('Ite misa est'));
});
test('Martí first-edition poems preserve complete works, sources and documented variants', () => {
  const selected = poems.filter(poem => poem.id.startsWith('marti-versos-sencillos-'));
  const numbers = Array.from({ length: 46 }, (_, index) => index + 1).filter(number => number !== 39);
  const lineCounts = [72, 16, 48, 36, 16, 12, 32, 24, 36, 52, 20, 8, 16, 8, 16, 8, 28, 12, 12, 8, 20, 12, 8, 12, 8, 8, 24, 12, 8, 20, 16, 16, 20, 12, 8, 8, 8, 12, 8, 12, 16, 18, 16, 38, 44];
  assert.equal(selected.length, 45);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\0')).digest('hex'), 'c54eb74b9b2fb4f6ae11164292820bd6bebf1877dc7f0ed87e4e007e671b663c');
  assert.equal(createHash('sha256').update(JSON.stringify(selected.map(({ id, title, source, contextSource }) => ({ id, title, source, contextSource })))).digest('hex'), '1cdcaf719520c6b4403e0d94dbc6b82f55141ee621c381e4f8b4727f64c354c0');
  assert.equal(groupPoets(poems).find(group => group.id === 'jose-marti').poems.length, 46);
  assert.equal(poems.filter(poem => poem.id === 'rosa-blanca-marti').length, 1);
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.id, `marti-versos-sencillos-${String(numbers[index]).padStart(3, '0')}`);
    assert.equal(lineCount(poem), lineCounts[index]);
    assert.equal(poem.author, 'José Martí');
    assert.equal(poem.authorId, 'jose-marti');
    assert.equal(poem.country, 'Cuba');
    assert.equal(poem.language, 'Spanish');
    assert.equal(poem.lang, 'es');
    assert.equal(poem.year, 1891);
    assert.equal(poem.creationPlace, undefined);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.match(poem.source, /^https:\/\/www\.poesi\.as\/JoseMartiVersosSencillos-\d+foto\.htm$/);
    assert.match(poem.contextSource, /es\.wikisource\.org\/w\/index\.php\?title=.*&oldid=\d+/);
    assert.match(poem.context, /Accents and punctuation are modernized or normalized/);
    assert.match(poem.rights, /Wikisource contributors, CC BY-SA 4\.0.*altered against the 1891 printing/);
    assert.ok(filterPoems([poem], { query: poem.text.split('\n')[1] }).some(item => item.id === poem.id));
    assert.equal(filterPoems([poem], { readable: 'English' }).length, 0);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(escapeHtml(poem.text)));
    assert.ok(html.includes(escapeHtml(poem.source)));
  }
  const byNumber = number => selected.find(poem => poem.id === `marti-versos-sencillos-${String(number).padStart(3, '0')}`);
  for (const [number, reading] of [[1, 'Leyó el alcaide'], [5, 'carmín encendido'], [9, 'en mi vida'], [10, 'La boca abierta'], [27, 'La niña está sola'], [30, 'con su vida el crimen'], [35, 'Nace alado del dolor'], [44, 'De arce del Japón'], [45, 'del soclo'], [46, 'Donde no se llegue']]) {
    assert.ok(byNumber(number).text.includes(reading), `${number}: ${reading}`);
  }
  assert.match(byNumber(1).context, /“alcaide”.*“alcalde”/);
  assert.match(byNumber(5).context, /“carmín”.*“jazmín”/);
  assert.match(byNumber(30).context, /“con su vida”.*“con su sangre”/);
  assert.match(byNumber(46).context, /“charme” may be a printing error/);
});
test('final Ogura waka retain complete 1900 readings, poets and documented variants', () => {
  const selected = poems.filter(poem => poem.id.startsWith('ogura-1900-') && Number(poem.id.slice(-3)) >= 66 && Number(poem.id.slice(-3)) <= 100);
  const pages = [126, 127, 129, 131, 132, 133, 135, 136, 136, 138, 141, 142, 144, 145, 146, 147, 148, 149, 150, 151, 151, 152, 153, 154, 155, 156, 157, 159, 165, 166, 169, 170, 171, 173, 174];
  assert.equal(selected.length, 35);
  assert.equal(new Set(selected.map(poem => poem.authorId)).size, 35);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\0')).digest('hex'), '808d73335907a9d6babed6c57eb3792fee1c9852137737b23857f9d98a71fa56');
  assert.equal(createHash('sha256').update(JSON.stringify(selected.map(({ id, author, authorOriginal, authorId, source }) => ({ id, author, authorOriginal, authorId, source })))).digest('hex'), '003469140d0a9ef32e808c5b1dd40ccd593e430a80fd01bd64ae2ce8bf069d65');
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.id, `ogura-1900-${String(index + 66).padStart(3, '0')}`);
    assert.equal(poem.title, poem.text.split('\n')[0]);
    assert.equal(lineCount(poem), 5);
    assert.equal(poem.form, 'Waka');
    assert.equal(poem.language, 'Japanese');
    assert.equal(poem.lang, 'ja');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.country, 'Japan');
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.year, null);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.equal(poem.source, `https://archive.org/download/hyakuninkeichu/hyakuninkeichu_text.pdf#page=${pages[index]}`);
    assert.match(poem.contextSource, /oldid=240235#/);
    assert.match(poem.context, /not the modern card-text comparison.*five line breaks are editorial/);
    assert.match(poem.rights, /public domain in the United States.*Check local law/);
    assert.ok(filterPoems(selected, { query: poem.authorOriginal }).some(item => item.id === poem.id));
    assert.ok(filterPoems(selected, { query: poem.text.split('\n')[1] }).some(item => item.id === poem.id));
    assert.equal(filterPoems([poem], { readable: 'English' }).length, 0);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(escapeHtml(poem.text)));
    assert.ok(html.includes(escapeHtml(poem.source)));
  }
  assert.equal(selected[23].author, 'Princess Shikishi');
  assert.equal(selected[31].author, 'Fujiwara no Teika');
  assert.match(selected[8].context, /よ after 山おろし/);
  assert.match(selected[11].context, /あはんこそ思ふ.*逢はむとぞ思ふ/);
  assert.match(selected[19].context, /明やらぬ.*明けやらで/);
  assert.equal(selected[26].text.split('\n')[4], 'かはくまもなし');
});
test('further Ogura waka retain complete 1900 readings, poets and documented variants', () => {
  const selected = poems.filter(poem => poem.id.startsWith('ogura-1900-') && Number(poem.id.slice(-3)) >= 41 && Number(poem.id.slice(-3)) <= 65);
  const pages = [89, 90, 91, 92, 93, 94, 96, 97, 100, 102, 104, 106, 106, 107, 108, 110, 111, 112, 114, 117, 118, 119, 121, 124, 125];
  assert.equal(selected.length, 25);
  assert.equal(new Set(selected.map(poem => poem.authorId)).size, 25);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\0')).digest('hex'), 'f90a0b0b32778ac1b7b7a4bf3314b7744452d1e31b7af49e2325df33b6288299');
  assert.equal(createHash('sha256').update(JSON.stringify(selected.map(({ id, author, authorOriginal, authorId, source }) => ({ id, author, authorOriginal, authorId, source })))).digest('hex'), '8c6c118126d49c431f1c41df0fd15876208632088a96a7bce72ce75f331ddf02');
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.id, `ogura-1900-${String(index + 41).padStart(3, '0')}`);
    assert.equal(poem.title, poem.text.split('\n')[0]);
    assert.equal(lineCount(poem), 5);
    assert.equal(poem.form, 'Waka');
    assert.equal(poem.language, 'Japanese');
    assert.equal(poem.lang, 'ja');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.country, 'Japan');
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.year, null);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.equal(poem.source, `https://archive.org/download/hyakuninkeichu/hyakuninkeichu_text.pdf#page=${pages[index]}`);
    assert.match(poem.contextSource, /oldid=240235#/);
    assert.match(poem.context, /not the modern card-text comparison.*five line breaks are editorial/);
    assert.match(poem.rights, /public domain in the United States.*Check local law/);
    assert.ok(filterPoems(selected, { query: poem.authorOriginal }).some(item => item.id === poem.id));
    assert.ok(filterPoems(selected, { query: poem.text.split('\n')[1] }).some(item => item.id === poem.id));
    assert.equal(filterPoems([poem], { readable: 'English' }).length, 0);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(escapeHtml(poem.text)));
    assert.ok(html.includes(escapeHtml(poem.source)));
  }
  assert.equal(selected[15].author, 'Izumi Shikibu');
  assert.equal(selected[16].author, 'Murasaki Shikibu');
  assert.equal(selected[21].author, 'Sei Shōnagon');
  for (const [number, pattern] of [
    [43, /昔は物も.*昔はものを/], [47, /さびしさに.*さびしきに/],
    [49, /よるはもえて.*夜はもえ/], [56, /あふよしもがな.*逢ふこともがな/],
    [57, /よはの月影.*夜半の月かな/],
  ]) assert.match(selected[number - 41].context, pattern);
});
test('Ogura waka preserve forty complete print readings and qualified attributions', () => {
  const selected = poems.filter(poem => poem.id.startsWith('ogura-1900-') && Number(poem.id.slice(-3)) <= 40);
  const pages = [21, 23, 27, 31, 32, 35, 36, 39, 41, 43, 44, 47, 49, 50, 52, 53, 55, 58, 59, 60, 61, 62, 65, 68, 70, 71, 73, 74, 76, 77, 78, 79, 80, 81, 82, 85, 85, 86, 87, 88];
  assert.equal(selected.length, 40);
  assert.equal(new Set(selected.map(poem => poem.authorId)).size, 40);
  assert.equal(createHash('sha256').update(selected.map(poem => poem.text).join('\0')).digest('hex'), '8e4b655b84a89025fa86c959bbdc623d938320afbfa02da4fa77320f34bc444f');
  assert.equal(createHash('sha256').update(JSON.stringify(selected.map(({ id, author, authorOriginal, authorId, source }) => ({ id, author, authorOriginal, authorId, source })))).digest('hex'), '10625b24bec92d555c2456a565a5f8447faec303e14dc867abf63ea2f89ceb56');
  for (const [index, poem] of selected.entries()) {
    assert.equal(poem.id, `ogura-1900-${String(index + 1).padStart(3, '0')}`);
    assert.equal(poem.title, poem.text.split('\n')[0]);
    assert.equal(lineCount(poem), 5);
    assert.equal(poem.form, 'Waka');
    assert.equal(poem.language, 'Japanese');
    assert.equal(poem.lang, 'ja');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.country, 'Japan');
    assert.equal(poem.creationPlace, undefined);
    assert.equal(poem.year, null);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.equal(poem.source, `https://archive.org/download/hyakuninkeichu/hyakuninkeichu_text.pdf#page=${pages[index]}`);
    assert.match(poem.contextSource, /oldid=240235#/);
    assert.match(poem.context, /not the modern card-text comparison.*five line breaks are editorial/);
    assert.match(poem.rights, /public domain in the United States.*Check local law/);
    assert.ok(filterPoems(selected, { query: poem.authorOriginal }).some(item => item.id === poem.id));
    assert.ok(filterPoems(selected, { query: poem.text.split('\n')[1] }).some(item => item.id === poem.id));
    assert.equal(filterPoems([poem], { readable: 'English' }).length, 0);
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(escapeHtml(poem.text)));
    assert.ok(html.includes(escapeHtml(poem.source)));
  }
  for (const number of [1, 3, 5, 6, 27]) assert.match(selected[number - 1].author, /\(attributed\)/);
  assert.match(selected[4].context, /Kokin Wakashū.*anonymous/);
  assert.match(selected[26].context, /questions the attribution/);
  assert.match(selected[12].context, /なりける.*なりぬる/);
  assert.match(selected[19].context, /あはんこそ思ふ.*逢はむとぞ思ふ/);
  assert.match(selected[24].context, /しられて.*しられで/);
  assert.match(selected[26].context, /いづみ川.*いつみ川/);
  assert.match(selected[32].context, /花の散らん.*花の散るらむ/);
  assert.match(selected[35].context, /いづこ.*いつこ/);
});
test('seven Obata versions preserve complete readings, sources and jurisdiction caveats', () => {
  const cases = [
    ['tang-316', 57, 8, 'af036d1807bca04a4df952d345e485bee4654ab6e7bdf841c6647bfc7527da59'],
    ['tang-317', 58, 9, '4bf8475c0e5e0c6982c1b964dc3467e792e3720a47ffc946decbcbf2c28617c8'],
    ['tang-318', 59, 6, '64770744c5268f396b47e0a4f533cd9817401087d4920f4a879348d802d2e4a1'],
    ['tang-255', 72, 4, '23232aa5284bf36b405c8492a1f3ac439e272c116adebd853fcb3453be4d6129'],
    ['tang-269', 102, 8, 'dd3a015a9ec9280f7da5e647657173b9698de8b179c41a929243af0149c15288'],
    ['tang-101', 106, 8, '437dbe13e3cba46caddaa53b1549a9667d702bb93cfedc79b979f28bcad66393'],
    ['tang-100', 114, 15, '8a3c7792c65771d4af1985ba683cfa337d2ea7a493df039c38840989a6173ff3'],
  ];
  assert.deepEqual(Object.keys(obataLiBaiTranslations), cases.map(([id]) => id));
  for (const [id, page, count, hash] of cases) {
    const poem = poems.find(item => item.id === id);
    assert.ok(poem, id);
    assert.equal(poem.author, 'Li Bai');
    assert.equal(poem.language, 'Chinese');
    assert.deepEqual(poem.translations, obataLiBaiTranslations[id]);
    assert.equal(poem.translations.length, 1);
    const item = poem.translations[0];
    assert.equal(item.language, 'English');
    assert.equal(item.translator, 'Shigeyoshi Obata · London and Toronto 1923');
    assert.equal(item.text.split('\n').length, count);
    assert.equal(createHash('sha256').update(item.text).digest('hex'), hash);
    assert.equal(item.source, `https://archive.org/download/worksoflipochine00libauoft/worksoflipochine00libauoft.pdf#page=${page}`);
    assert.match(item.rights, /public domain in the United States.*died in 1971.*life-plus-70 jurisdictions.*Check local law/);
    assert.match(item.rights, /working edition is not established.*interpretation.*not a claim of an exact match/);
    for (const query of [poem.text.split('\n')[0], item.text.split('\n')[0]]) {
      assert.ok(filterPoems(poems, { language: 'Chinese', readable: 'English', query }).some(candidate => candidate.id === id), `${id}: ${query}`);
    }
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(escapeHtml(item.text)));
    assert.ok(html.includes(escapeHtml(item.source)));
    assert.ok(html.includes(escapeHtml(item.rights)));
    assert.match(html, /<option value="0">English<\/option>/);
  }
  for (const id of ['tang-316', 'tang-317', 'tang-318']) assert.match(obataLiBaiTranslations[id][0].rights, /title identifies Lady Yang.*occasion is not established/);
  assert.match(obataLiBaiTranslations['tang-255'][0].rights, /羅襪.*stockings or socks/);
  assert.match(obataLiBaiTranslations['tang-269'][0].rights, /啼不住.*1922 New York printing reads/);
  assert.match(obataLiBaiTranslations['tang-101'][0].rights, /does not identify a separate addressee/);
  assert.match(obataLiBaiTranslations['tang-100'][0].rights, /風流.*soul/);
});
test('catalogue has distinct, sourced records in all twenty-three original languages', () => {
  assert.ok(poems.length >= 1000);
  assert.equal(new Set(poems.map(p => p.id)).size, poems.length);
  assert.ok(new Set(poems.filter(p => !p.anonymous).map(p => p.authorId)).size >= 150);
  const normalizedText = poems.map(p => p.text.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''));
  assert.equal(new Set(normalizedText).size, poems.length, 'no identical works');
  for (const language of ['English', 'Spanish', 'Portuguese', 'Galician', 'French', 'Italian', 'Romanian', 'German', 'Dutch', 'Finnish', 'Swedish', 'Hungarian', 'Slovenian', 'Greek', 'Russian', 'Ukrainian', 'Polish', 'Bengali', 'Hindi', 'Persian', 'Chinese', 'Japanese', 'Arabic']) assert.ok(poems.some(p => p.language === language), language);
  for (const p of poems) {
    assert.ok(p.text && p.source && p.rights && p.context && p.author && p.lang, p.id);
    assert.equal(new URL(p.source).protocol, 'https:');
    for (const translation of p.translations) assert.ok(translation.translator && translation.source && translation.rights && translation.text, p.id);
  }
});
test('Quiet Night keeps its seven aids and appends two source-specific English versions', () => {
  const id = 'quiet-night-thought-li-bai';
  const poem = poems.find(item => item.id === id);
  const original = curated.find(item => item.id === id);
  assert.ok(poem && original);
  assert.deepEqual(Object.keys(quietNightTranslations), [id]);
  assert.deepEqual(poem.translations.slice(0, 7), original.translations);
  assert.deepEqual(poem.translations.slice(7), quietNightTranslations[id]);
  assert.deepEqual(poem.translations.map(item => item.language), ['English', 'Spanish', 'Portuguese', 'French', 'Italian', 'Japanese', 'Arabic', 'English', 'English']);
  const historical = poem.translations.slice(7);
  assert.deepEqual(historical.map(item => item.translator), ['L. Cranmer-Byng · London 1909', 'Shigeyoshi Obata · London and Toronto 1923']);
  assert.deepEqual(historical.map(item => createHash('sha256').update(item.text).digest('hex')), [
    '9fd589ea2a8098ef0c6b18d9381b2ed7a311fa46506d68d0c81928cd72e6e700',
    '0ba69e9b6b333e7985afd7cf683e28c9bd230f7a771758c8dba64c68dbfafcc2',
  ]);
  assert.match(historical[0].rights, /earlier translations.*working edition is not established/);
  assert.match(historical[1].rights, /明月.*山月.*working edition is not established/);
  for (const item of historical) assert.match(item.rights, /public domain in the United States; check local law.*interpretation/);
  assert.equal(filterPoems(poems, { translation: 'English', query: poem.title }).filter(item => item.id === id).length, 1);
  const html = renderPoem(poem, poems, '/ai-poems/');
  assert.match(html, /<option value="0">English · Verso reading aid/);
  assert.match(html, /<option value="6">Arabic<\/option>/);
  assert.match(html, /<option value="7">English · L\. Cranmer-Byng · London 1909 · Thoughts in a Tranquil Night<\/option>/);
  assert.match(html, /<option value="8">English · Shigeyoshi Obata · London and Toronto 1923 · On a Quiet Night<\/option>/);
  assert.match(html, /aria-describedby="translation-version-note"/);
  assert.match(html, /Only the language can be saved; choose a version each visit/);
  assert.match(html, /All available translations and reading aids \(9\)/);
  for (const item of poem.translations) {
    assert.ok(html.includes(escapeHtml(item.text)));
    assert.ok(html.includes(escapeHtml(item.source)));
  }
  const duplicate = { ...historical[0], title: '<same & title>', translator: 'Example <translator>' };
  const synthetic = { ...poem, translations: [duplicate, duplicate] };
  const syntheticHtml = renderPoem(synthetic, poems, '/ai-poems/');
  assert.match(syntheticHtml, /<option value="0">English · Example &lt;translator&gt; · &lt;same &amp; title&gt; · version 1<\/option>/);
  assert.match(syntheticHtml, /<option value="1">English · Example &lt;translator&gt; · &lt;same &amp; title&gt; · version 2<\/option>/);
  const singleHtml = renderPoem({ ...poem, translations: [historical[0]] }, poems, '/ai-poems/');
  assert.match(singleHtml, /<option value="0">English<\/option>/);
  assert.doesNotMatch(singleHtml, /translation-version-note/);
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
test('Yu Xuanji poems retain dated-facsimile readings and attribution uncertainty', () => {
  const cases = [
    ['willow', '賦得江邊柳', 'c21ba6ddf9bc1a04e5be7e3693a6f7d52b3d804dc89c68eac4171430f7b49483'],
    ['neighbour', '贈鄰女', '620e147610c893844abcfcf95bcdb3246f245f1187b1c277475c2c4983d76c29'],
  ];
  const selected = poems.filter(poem => poem.id.startsWith('yu-xuanji-1899-'));
  assert.equal(selected.length, cases.length);
  const get = slug => selected.find(poem => poem.id === `yu-xuanji-1899-${slug}`);
  for (const [slug, title, hash] of cases) {
    const poem = get(slug);
    assert.ok(poem, slug);
    assert.equal(poem.title, title);
    assert.equal(poem.author, 'Yu Xuanji');
    assert.equal(poem.authorId, 'yu-xuanji');
    assert.equal(poem.authorOriginal, '魚玄機');
    assert.equal(poem.language, 'Chinese');
    assert.equal(poem.lang, 'zh-Hant');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['China']);
    assert.equal(poem.year, null);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.equal(lineCount(poem), 8);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(new URL(poem.source).hash, '#page=3');
    assert.equal(new URL(poem.contextSource).searchParams.get('oldid'), '669708');
    assert.match(poem.context, /catalogue credits Wu Weiye.*printed heading names Yu Xuanji/);
    assert.match(poem.context, /reason for the conflict is not established/);
    assert.match(poem.context, /not a diplomatic transcription/);
    assert.match(poem.rights, /public domain in the United States/);
    assert.match(poem.rights, /CC BY-SA 4\.0/);
    assert.match(poem.rights, /is distributed under CC BY-SA 4\.0/);
    assert.match(poem.rights, /維基小霸王/);
    for (const query of ['Yu Xuanji', '魚玄機', poem.text.split('\n')[0]]) {
      assert.ok(filterPoems(poems, { language: 'Chinese', query }).includes(poem), query);
    }
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  assert.match(get('willow').context, /瀟瀟風雨夜.*蕭蕭風雨夜/);
  assert.match(get('neighbour').context, /懶起粧.*嬾起妝.*寄李憶員外/);
  const group = groupPoets(poems).find(item => item.id === 'yu-xuanji');
  assert.equal(group.poems.length, cases.length);
  for (const poem of selected) assert.ok(group.poems.includes(poem), poem.id);
});
test('three Tang poets retain complete volume 805 readings and source caveats', () => {
  const cases = [
    ['ly-lake', 'li-ye', 8, 5, 151, 'a9fa2e440682f2ea284bbc2d1983e60e9b49b9e913df5064975583692970d4f5'],
    ['ly-seven', 'li-ye', 8, 5, 151, 'b21e7716946de06b9d9520ddc06c17062dc40e0b6f185f5397c9b901e18a1e92'],
    ['ly-zhu', 'li-ye', 8, 5, 152, '82bd91687c3d436b0abcc662da0073d8acca0153eb6bdc26775e076dd2e5f77e'],
    ['ly-han', 'li-ye', 8, 5, 152, '59538aa94d250f692298a0743bc89b5365031686c921c749b334beab69ae01d0'],
    ['ly-cui', 'li-ye', 8, 5, 153, 'bb1becfc74091d56e4a822a75450b7fca9a69884a40429adb71f2ab20593ddbe'],
    ['ly-springs', 'li-ye', 16, 7, 153, 'b4010ab1a636a2812d889a71ac301cfaab48f0653df53ae480d7c76a038f32af'],
    ['ly-longing', 'li-ye', 8, 5, 154, '57f3c2851b4d847a6ae4816021d6f4a28ded664baea8fa19cf0a7d85d8395b0f'],
    ['ly-reflection', 'li-ye', 8, 7, 155, '54b14331bba0c7101a91eedd331c170e158c43135506e48d5efe1d8295d530ab'],
    ['ly-eight', 'li-ye', 4, 6, 156, '492c6c0fbc1508e429081778f7bffd76d0edd80cd1896be7df6a76c7f19be6ea'],
    ['ly-yan', 'li-ye', 8, 5, 156, '6ab7031f4b0b8ce72d620ec66885adf3d69259366cbdd8a9eb7a1a07266573bc'],
    ['ly-letter', 'li-ye', 4, 7, 157, '694ba1f8a6ecf8aa69a2bbd67fb61c00773223d33c9459cb5ce82fc053e9ae2e'],
    ['ly-fish', 'li-ye', 4, 5, 157, '6ea1da961ca6268e15577d2fb226d595eb0b9e6d81df8fa2f1f9e42081b00959'],
    ['ly-dwelling', 'li-ye', 4, 7, 157, '0387f2c10e6f080a73204632ffe34aab7d61c8990a431c0197ac79dcdb6ae625'],
    ['ly-moon', 'li-ye', 4, 7, 158, 'b9a1b39d7db0d1fcb3f945a2e9446bd609a6755f09f17a760c3cf6d2e830577e'],
    ['ly-spring', 'li-ye', 4, 5, 158, '17922125a428f2cb7dc2de0475803cdab765a73735747291aec6857b0b4b7981'],
    ['yc-sisters', 'yuan-chun', 8, 5, 159, '1a301934d44348687773d79d5b4d85de98afc1c5b345f56d02ad44c26c420fea'],
    ['yc-qin', 'yuan-chun', 8, 5, 159, 'd305df419e6aa9de636fc4f15b08aa6aef36b9e6bdbf4d7cfbc35a5c4944e696'],
    ['hy-boat', 'haiyin', 8, 5, 160, '342076091506c0701684e87395d707f399286d9dc8ef75cee72644f6a86c99b7'],
  ];
  const selected = poems.filter(poem => poem.id.startsWith('qt805-'));
  const get = slug => selected.find(poem => poem.id === `qt805-${slug}`);
  const titles = [
    '湖上臥病喜陸鴻漸至', '寄校書七兄', '寄朱放', '送韓揆之江西', '道意寄崔侍郎',
    '從蕭叔子聽彈琴賦得三峽流泉歌', '相思怨', '感興', '八至', '送閻二十六赴剡縣',
    '得閻伯鈞書', '結素魚貽友人', '偶居', '明月夜留別', '春閨怨', '寄洛中諸姊', '秦中春望', '舟夜一章',
  ];
  const authors = { 'li-ye': ['Li Ye', '李冶'], 'yuan-chun': ['Yuan Chun', '元淳'], haiyin: ['Haiyin', '海印'] };
  assert.equal(selected.length, cases.length);
  assert.ok(!selected.some(poem => poem.title.includes('恩命追入') || poem.title === '句'));
  for (const [index, [slug, authorId, count, width, page, hash]] of cases.entries()) {
    const poem = get(slug);
    assert.ok(poem, slug);
    assert.equal(poem.authorId, authorId);
    assert.equal(poem.title, titles[index]);
    assert.deepEqual([poem.author, poem.authorOriginal], authors[authorId]);
    assert.equal(poem.language, 'Chinese');
    assert.equal(poem.lang, 'zh-Hant');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['China']);
    assert.equal(poem.year, null);
    assert.deepEqual(poem.translations, []);
    assert.deepEqual(poem.themes, []);
    const lines = poem.text.split('\n');
    assert.equal(lines.length, count);
    assert.ok(lines.every(line => [...line.slice(0, -1)].length === width));
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(poem.source, `https://archive.org/download/06060124.cn/06060124.cn.pdf#page=${page}`);
    assert.match(poem.contextSource, /oldid=669710$/);
    assert.match(poem.context, /relationship to this scanned copy is not established/);
    assert.match(poem.context, /reproduction date is not identified/);
    assert.match(poem.context, /not a diplomatic transcription/);
    assert.match(poem.rights, /public domain in the United States/);
    assert.match(poem.rights, /維基小霸王.*CC BY-SA 4\.0/);
    for (const query of [poem.author, poem.authorOriginal, lines[0]]) {
      assert.ok(filterPoems(poems, { language: 'Chinese', query }).includes(poem), query);
    }
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  assert.match(get('ly-springs').text, /飛泉走浪絃中起/);
  assert.match(get('ly-longing').text, /絃腸一時斷。$/);
  assert.match(get('ly-longing').context, /SKchar placeholder.*‘弦’/);
  assert.match(get('ly-han').context, /‘相看指楊柳’.*‘相看折楊柳’/);
  assert.match(get('ly-fish').context, /‘數尺如殘雪’.*‘尺素如殘雪’/);
  assert.match(get('ly-spring').context, /‘數枝桃已紅’.*‘數株桃已紅’/);
  assert.match(get('ly-eight').text, /至高至明日月/);
  for (const [authorId, count] of [['li-ye', 15], ['yuan-chun', 2], ['haiyin', 1]]) {
    const group = groupPoets(poems).find(item => item.id === authorId);
    assert.equal(group.poems.length, count);
  }
});
test('Li He horse poems retain separate complete Siku readings and alternate-search caveats', () => {
  const cases = [
    ['two', '其二', 88, 'd123a09d637cd401c4eb63408c707ada9540d0f335969d6353980430ee01cdc5'],
    ['three', '其三', 89, '694678459358b1d30a2ddadbd60f47727a19df635cf89635275f31cf824e6f58'],
    ['four', '其四', 89, 'c02ea7483659051f0bde74019a98de4e67e607bd0e565f0429d2adc0db2dbe1d'],
    ['five', '其五', 90, '3b2aad8160299a05ba1be7c8f8e068e95118ee9a047d1803de1af321bee6bdc3'],
    ['six', '其六', 90, 'a016049dbdd1634c22f97c2597824a54b53f00f9de93fbd589af3a2df9280198'],
    ['seven', '其七', 91, '1e5316f8074f45b458c6d6dbf11e101299ef72b5c62127caa45edcde6e6ebd1d'],
    ['eight', '其八', 91, '6b49c23e18e4bd9e68f1385f4f3ee94b0d725a7d819e8463bb2d2f4d19dbed03'],
    ['nine', '其九', 92, 'e9881ddb6a2971c9f4bf130e77dc45f356c2a45f0acd29b4e5b1f86afcaa77ee'],
    ['ten', '其十', 92, '17e20e6d0d0e3868eeba05851e4bee31899e8c6886f724368c85d10d9bd9ff26'],
    ['eleven', '其十一', 93, 'b97b16f7a3a67eb489045af0b2c4133c00ee468b298e231545d077503b672e07'],
    ['twelve', '其十二', 94, '35dc1f9e9e5f4060bcdfd551cd23d0fe128609deebdec847a40fd5a36d340918'],
    ['thirteen', '其十三', 94, 'a9c826f272229bfdac41c721a98794d1046be14423dd48fecac3a9825124bc02'],
    ['fifteen', '其十五', 95, '88f8ec3f2926c52a7ae3c35cd833f52cd41cfd46cd54af0d81b7524db877b914'],
    ['sixteen', '其十六', 96, 'c23d10029920e21b5bb4f49b52ef36b80bbf5a3fd4a6ef801c15ac78945bdddc'],
    ['seventeen', '其十七', 97, '40e5f4e456168fd6e8d165617cf872e8df7325bfe8bb2939c99bbd5c4d11117b'],
    ['eighteen', '其十八', 97, '673abbf71844157a5e4e6cf04a418dacb9c8fb1673af5009aafdd9f7f2ad9964'],
    ['nineteen', '其十九', 98, 'def1196535b97b943cc58ed82e0ca3f90d7ab2be01b1bb863457158b00b32d15'],
    ['twenty', '其二十', 98, '75f94dee2cd1415c8607389006044ae2a778c25e9e2aebc6986620fbc661b7af'],
    ['twenty-one', '其二十一', 98, '5bba499f91ac7af75bbe1474b609c22b59ce2aa1af6f8eea48b26769968f803d'],
    ['twenty-two', '其二十二', 99, '62798e1b20fd0b5a7c186eec13e6017ff6efd3964c21e1bd94ddcebd685ba42d'],
    ['twenty-three', '其二十三', 99, 'fb899bdc350ecac29480268dadabbee496af3c02959cd7b6b6b749a51854b21d'],
  ];
  const selected = poems.filter(poem => poem.id.startsWith('li-he-horses-'));
  const get = slug => selected.find(poem => poem.id === `li-he-horses-${slug}`);
  assert.equal(selected.length, cases.length);
  assert.ok(!get('one') && !get('fourteen'));
  for (const [slug, number, page, hash] of cases) {
    const poem = get(slug);
    assert.ok(poem, slug);
    assert.equal(poem.author, 'Li He');
    assert.equal(poem.authorId, 'li-he');
    assert.equal(poem.authorOriginal, '李賀');
    assert.equal(poem.language, 'Chinese');
    assert.equal(poem.lang, 'zh-Hant');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['China']);
    assert.equal(poem.year, null);
    assert.deepEqual(poem.translations, []);
    assert.deepEqual(poem.themes, []);
    const lines = poem.text.split('\n');
    assert.equal(lines.length, 4);
    assert.ok(lines.every(line => [...line.slice(0, -1)].length === 5));
    assert.equal(poem.title, `馬詩二十三首（${number} · ${lines[0].slice(0, -1)}）`);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(poem.source, `https://archive.org/download/06049046.cn/06049046.cn.pdf#page=${page}`);
    assert.match(poem.contextSource, /oldid=790637$/);
    assert.match(poem.context, /relationship to this scanned copy is not established/);
    assert.match(poem.context, /reproduction date is not identified/);
    assert.match(poem.context, /not a diplomatic transcription/);
    assert.match(poem.rights, /public domain in the United States/);
    assert.match(poem.rights, /維基小霸王 and Wmr-bot.*CC BY-SA 4\.0/);
    for (const query of ['Li He', '李賀', lines[0]]) {
      assert.ok(filterPoems(poems, { language: 'Chinese', query }).includes(poem), query);
    }
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  const five = get('five');
  assert.equal(five.text.split('\n')[0], '大漠山如雪，');
  assert.match(five.context, /‘大漠山如雪’.*‘大漠沙如雪’/);
  assert.equal(five.displayTitle, '馬詩二十三首（其五 · 異文：大漠沙如雪）');
  for (const query of ['大漠山如雪', '大漠沙如雪']) {
    assert.ok(filterPoems(poems, { language: 'Chinese', query }).includes(five), query);
  }
  assert.match(get('two').context, /‘衘’.*‘銜’.*exact glyph is not certain/);
  assert.match(get('four').context, /‘精’.*‘星’/);
  assert.match(get('six').context, /‘朱色’.*‘珠色’.*provenance has not been established/);
  assert.match(get('nine').context, /‘飂叔’.*‘颼叔’/);
  assert.match(get('sixteen').context, /‘颴風’.*‘飈’.*‘飃風’/);
  assert.match(get('twenty-three').context, /next work after 其二十三/);
  const group = groupPoets(poems).find(item => item.id === 'li-he');
  assert.equal(group.poems.length, 32);
  for (const poem of selected) assert.ok(group.poems.includes(poem), poem.id);
});

test('Li He poems retain distinct complete Siku readings and source caveats', () => {
  const cases = [
    ['one', 72, '68c9dbf340b1bb085b33ad19452efb658912e96ba9f41d107b085a6b2f907480'],
    ['two', 72, '237c9c4bf25ba762cfcb305b0ce42e82c513835e6dadbf46c5c6afc47968c68a'],
    ['three', 73, '4ab68aa92a38382c82c05a3029307716cf26f085471211e17edb6758da868f64'],
    ['four', 74, 'e2c004ce98e74f28d6cd0b8d43081c14c3aa1b3ac20237b2ec0e96168eb24e99'],
    ['five', 74, '4776a329c57ba69809dda602673904125c0a788a303eb9a62f5a7a922bf9d67a'],
    ['six', 75, '69dc9458788f85c13459b99a8aa965272072a9d7ad711edd8c7d8dfc401f2c02'],
    ['seven', 75, '78770e74dbe369469328bf4689e085102626ce4f5c0af78ead808f1c3ea4fcbb'],
    ['eight', 76, 'ddd002b6d4aa84ad72095c64eb314d1a4ca87995e586fbe22eaca3bd16ba52b4'],
    ['ten', 77, '046a398b63622e446141d315f1e933a932973393e9ca4f936da5f6c871527012'],
    ['twelve', 78, '7087bab6a640275e225a37673d3184beed156d8267d0a402aeda89b837e3bc85'],
    ['thirteen', 79, '87de5dcdf515be7d18ad72ea2fcc19614edf1feff4db132a2ec08f5e7a2bc084'],
  ];
  const selected = poems.filter(poem => poem.id.startsWith('li-he-siku-'));
  const get = slug => selected.find(poem => poem.id === `li-he-siku-${slug}`);
  assert.equal(selected.length, cases.length);
  assert.ok(!get('nine') && !get('eleven'));
  for (const [slug, page, hash] of cases) {
    const poem = get(slug);
    assert.ok(poem, slug);
    assert.equal(poem.author, 'Li He');
    assert.equal(poem.authorId, 'li-he');
    assert.equal(poem.authorOriginal, '李賀');
    assert.equal(poem.language, 'Chinese');
    assert.equal(poem.lang, 'zh-Hant');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['China']);
    assert.equal(poem.year, null);
    assert.deepEqual(poem.translations, []);
    assert.deepEqual(poem.themes, []);
    const lines = poem.text.split('\n');
    const width = slug === 'thirteen' ? 5 : 7;
    assert.equal(lines.length, slug === 'thirteen' ? 8 : 4);
    assert.ok(lines.every(line => [...line.slice(0, -1)].length === width));
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(poem.source, `https://archive.org/download/06049046.cn/06049046.cn.pdf#page=${page}`);
    assert.match(poem.contextSource, /oldid=790635$/);
    assert.match(poem.context, /relationship to this scanned copy is not established/);
    assert.match(poem.context, /reproduction date is not identified/);
    assert.match(poem.context, /not a diplomatic transcription/);
    assert.match(poem.rights, /public domain in the United States/);
    assert.match(poem.rights, /維基小霸王 and Wmr-bot.*CC BY-SA 4\.0/);
    for (const query of ['Li He', '李賀', poem.text.split('\n')[0]]) {
      assert.ok(filterPoems(poems, { language: 'Chinese', query }).includes(poem), query);
    }
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  assert.match(get('three').context, /‘迊夏’.*‘迎夏’/);
  assert.match(get('three').text, /桃膠迎夏香琥珀/);
  assert.match(get('ten').context, /‘今朝’.*‘今日’/);
  assert.match(get('thirteen').context, /‘燒燭照漁船’.*‘燒竹照漁船’/);
  assert.match(get('thirteen').text, /燒燭照漁船。$/);
  const group = groupPoets(poems).find(item => item.id === 'li-he');
  assert.equal(group.poems.length, cases.length + poems.filter(poem => poem.id.startsWith('li-he-horses-')).length);
  for (const poem of selected) assert.ok(group.poems.includes(poem), poem.id);
});
test('Rossetti poems retain complete 1906 readings, boundaries and edition caveats', async () => {
  const manifestText = await readFile(new URL('../scripts/sources/rossetti-1906.json', import.meta.url), 'utf8');
  assert.equal(createHash('sha256').update(manifestText).digest('hex'), '0c98f4598629843bbccd24b7b7516346b8fa3a7487e8497b0450d3d696b40a2c');
  const manifest = JSON.parse(manifestText).poems;
  const slugs = [
    'dream-land', 'at-home', 'from-sunset', 'love-from-the-north', 'winter-rain', 'a-dirge', 'spring',
    'lambs-of-grasmere', 'a-birthday', 'remember', 'after-death', 'an-end', 'song-roses', 'a-summer-wish',
    'an-apple-gathering', 'song-doves', 'maude-clare', 'echo', 'winter-my-secret', 'another-spring',
    'fata-morgana', 'no-thank-you-john', 'may', 'song-when-i-am-dead', 'up-hill',
  ];
  const selected = poems.filter(poem => poem.id.startsWith('rossetti-1906-'));
  const get = slug => selected.find(poem => poem.id === `rossetti-1906-${slug}`);
  assert.deepEqual(manifest.map(row => row.slug), slugs);
  assert.equal(selected.length, slugs.length);
  for (const row of manifest) {
    const poem = get(row.slug);
    assert.ok(poem, row.slug);
    assert.equal(poem.title, row.title);
    assert.equal(poem.author, 'Christina Rossetti');
    assert.equal(poem.authorId, 'christina-rossetti');
    assert.equal(poem.language, 'English');
    assert.equal(poem.lang, 'en');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['England']);
    assert.equal(poem.year, null);
    assert.deepEqual(poem.translations, []);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.text.split('\n\n').map(stanza => stanza.split('\n').length), row.stanzas);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), row.textSha256);
    assert.equal(poem.source, 'https://www.gutenberg.org/ebooks/19188');
    assert.equal(poem.contextSource, `https://archive.org/details/poems00ross5/page/n${row.ocrStart[0] - 1}/mode/1up`);
    assert.match(poem.context, /not established as the same copy or impression/);
    assert.match(poem.context, /not exhaustive punctuation collation or a diplomatic transcription/);
    assert.match(poem.rights, /public domain in the United States/);
    assert.match(poem.rights, /Steven desJardins, Jeffrey Johnson/);
    for (const query of ['Christina Rossetti', poem.text.split('\n')[0]]) {
      assert.ok(filterPoems(poems, { language: 'English', query }).includes(poem), query);
    }
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  assert.match(get('dream-land').text, /She sleeps a charmèd sleep:/);
  assert.match(get('may').text, /Nor any bird foregone its mate\.\n\nI cannot tell you what it was;/);
  assert.equal(get('may').text.split('\n').filter(Boolean).length, 13);
  assert.match(get('up-hill').text, /Shall I meet other wayfarers at night\?/);
  assert.match(get('up-hill').context, /“other”.*“otner,” possibly damaged type or a printing error/);
  const songs = ['song-roses', 'song-doves', 'song-when-i-am-dead'].map(get);
  assert.ok(songs.every(poem => poem.title === 'Song' && poem.disambiguation === poem.text.split('\n')[0]));
  assert.equal(new Set(songs.map(poem => poem.disambiguation)).size, 3);
  const group = groupPoets(poems).find(item => item.id === 'christina-rossetti');
  assert.equal(group.poems.length, slugs.length);
  for (const poem of selected) assert.ok(group.poems.includes(poem), poem.id);
});
test('Teasdale poems retain complete Love Songs readings and edition caveats', async () => {
  const manifestText = await readFile(new URL('../scripts/sources/teasdale-love-songs.json', import.meta.url), 'utf8');
  assert.equal(createHash('sha256').update(manifestText).digest('hex'), '1cfefd190bf9f3a2363a6ebde45c1438d3a8f241f5df7b005472df1887393171');
  const manifest = JSON.parse(manifestText).poems;
  const slugs = [
    'barter', 'twilight', 'night-song-at-amalfi', 'the-look', 'a-winter-night', 'but-not-to-me',
    'song-at-capri', 'love-me', 'pierrot', 'wild-asters', 'the-song-for-colin', 'debt', 'faults',
    'the-fountain', 'i-shall-not-care', 'after-parting', 'a-prayer', 'spring-night', 'after-love',
    'new-love-and-old', 'the-kiss', 'swans', 'the-river', 'spring-rain', 'jewels',
  ];
  const selected = poems.filter(poem => poem.id.startsWith('teasdale-love-songs-'));
  assert.deepEqual(manifest.map(row => row.slug), slugs);
  assert.equal(selected.length, slugs.length);
  const get = slug => selected.find(poem => poem.id === `teasdale-love-songs-${slug}`);
  for (const row of manifest) {
    const poem = get(row.slug);
    assert.ok(poem, row.slug);
    assert.equal(poem.title, row.title);
    assert.equal(poem.author, 'Sara Teasdale');
    assert.equal(poem.authorId, 'sara-teasdale');
    assert.equal(poem.language, 'English');
    assert.equal(poem.lang, 'en');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['United States']);
    assert.equal(poem.year, null);
    assert.deepEqual(poem.translations, []);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.text.split('\n\n').map(stanza => stanza.split('\n').length), row.stanzas);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), row.textSha256);
    assert.equal(poem.source, 'https://www.gutenberg.org/ebooks/442');
    assert.equal(poem.contextSource, `https://archive.org/details/lovesongs01teasgoog/page/n${row.pages[0] + 18}/mode/1up`);
    assert.match(poem.context, /not established as the same copy/);
    assert.match(poem.context, /not exhaustive punctuation collation or a diplomatic transcription/);
    assert.match(poem.rights, /public domain in the United States/);
    assert.match(poem.rights, /A\. Light and L\. Bowser/);
    for (const query of ['Sara Teasdale', poem.text.split('\n')[0]]) {
      assert.ok(filterPoems(poems, { language: 'English', query }).includes(poem), query);
    }
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  assert.equal(createHash('sha256').update(get('barter').text).digest('hex'), '98a678a89e1c9328cf3c34dac6af02c34a3417a21c3e4de4e7c4ea1b1e0826de');
  assert.match(get('spring-rain').text, /Your eyes said more to me that night\nThan your lips would ever say\. \. \. \.\n\nI thought I had forgotten,/);
  assert.match(get('i-shall-not-care').text, /Though you should lean above me broken-hearted,\nI shall not care\./);
  assert.match(get('swans').text, /link it with chains of gold,\nThe lake bears/);
  assert.ok(!selected.some(poem => /Interlude|Summer Night, Riverside/i.test(poem.title)));
  const group = groupPoets(poems).find(item => item.id === 'sara-teasdale');
  assert.equal(group.poems.filter(poem => poem.id.startsWith('teasdale-love-songs-')).length, slugs.length);
  for (const poem of selected) assert.ok(group.poems.includes(poem), poem.id);
  assert.ok(group.poems.some(poem => poem.id === 'recognized-lyric-classics-teasdale-soft-rains'));
});
test('Further Xue Tao poems preserve print variants and separate work boundaries', () => {
  const cases = [
    ['li-editor', '19', '1495623f3df60675388d41869218fca477afe72915727fdfd12c343d1ead7108'],
    ['ninth-day-one', '19', '8fef70b6db6778c7b90edf742e73c7811ae3f644d2cab9b4ba4ccb4c78e9e49f'],
    ['ninth-day-two', '19–20', '3ac698b47334b3f4e4ed2f4dbc032a2f4abed6549d108b5eb4470cb566982f39'],
    ['painting', '20', '6a40b9e8e6982dd1511edf6f54e1e23ae90df7e8c4ab110e3f5d755d9123b732'],
    ['flower', '20', 'e8e172bc33297e3490f349f15e126d4da652550b0e0298bda0c44d1541a361e5'],
    ['reply-yang', '24', 'a816a172bfcbcffaded9e7f82d116cbd11e65e07dde04af0236247291d6cd204'],
    ['new-clothes-one', '24', '34ce5bf5bdb7d66d9918a33a4f61796e151da1e5bda4f87d5cce891b0910f328'],
    ['new-clothes-two', '24', 'c4421a99a1228b9221135935cf0715a4a3968dd878578ce52895cea4cbeda21d'],
    ['zhang', '24–25', 'a6b0c7a99d988d76ee5d3bb5e18cb3936cbf434ebb057dfe7b7762bee1d52e59'],
    ['jialing', '26', '5496eabc8b4397f2dba3e6325f79bfd84607bc7df4048dea8a278419addb8e86'],
    ['duan-minister', '26', '14d74df07eb27396a78aed4d6aba4a874263c3aa376de2659a44075f7f27fa40'],
    ['duan-scholar', '26', 'a4b95b9bc27a1546ad9e6af403ddccc4314a3927f75c9717008e45fcdbd1b416'],
  ];
  const selected = poems.filter(poem => poem.id.startsWith('xue-tao-further-1906-'));
  assert.equal(selected.length, cases.length);
  const get = slug => selected.find(poem => poem.id === `xue-tao-further-1906-${slug}`);
  for (const [slug, pages, hash] of cases) {
    const poem = get(slug);
    assert.ok(poem, slug);
    assert.equal(poem.author, 'Xue Tao');
    assert.equal(poem.authorId, 'xue-tao');
    assert.equal(poem.authorOriginal, '薛濤');
    assert.equal(poem.language, 'Chinese');
    assert.equal(poem.lang, 'zh-Hant');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['China']);
    assert.equal(poem.year, null);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.equal(lineCount(poem), 4);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(poem.source, 'https://taiwanebook.ncl.edu.tw/en/book/NCL-000474792/reader');
    assert.equal(new URL(poem.contextSource).searchParams.get('oldid'), '679301');
    assert.ok(poem.context.includes(`reader ${pages.includes('–') ? 'pp.' : 'p.'} ${pages}`));
    assert.match(poem.context, /not an autograph or proof of every attribution/);
    assert.match(poem.context, /not a diplomatic transcription/);
    assert.match(poem.rights, /is distributed under CC BY-SA 4\.0/);
    assert.match(poem.rights, /維基小霸王/);
    for (const query of ['Xue Tao', '薛濤', poem.text.split('\n')[0]]) {
      assert.ok(filterPoems(poems, { language: 'Chinese', query }).includes(poem), query);
    }
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  assert.match(get('painting').context, /遠荊吳.*峽口圖.*繞荆吳.*峽石圖/);
  assert.match(get('flower').context, /玉彩.*月輪.*霞.*日/);
  assert.match(get('reply-yang').context, /雲窗.*雪牕/);
  assert.match(get('new-clothes-one').context, /冰繭淨.*氷繭靜/);
  assert.match(get('new-clothes-two').context, /五靈仙馭.*五雲仙馭/);
  assert.match(get('zhang').context, /鷺識朱衣.*鷺識朱牕/);
  assert.match(get('jialing').context, /城.*alternate to.*江/);
  assert.match(get('duan-scholar').context, /next heading is not visible/);
  assert.ok(!get('new-clothes-three'));
  const group = groupPoets(poems).find(item => item.id === 'xue-tao');
  assert.equal(group.poems.length, 14 + cases.length);
  for (const poem of selected) assert.ok(group.poems.includes(poem), poem.id);
});
test('Xue Tao poems preserve 1906 readings, comparison variants and attribution caveats', () => {
  const cases = [
    ['friend', '14', 'e181165ccd2ecfee5ee32f273e55323045eee4a491a6ef80e658e58cf15fd1f8'],
    ['pipes', '14', 'e087102b87ed88aa058a54ae729e38de5bd7e56bb6538c291d923101bec89277'],
    ['citrus', '14–15', 'a599be3705b0706faf5a851be6c3b911147e1ccfe54c999d9d4aa489d124926f'],
    ['governor-one', '15', '758ce5d7457c0cef700132bfa5b3c8ede995a89ff9aafc4668e333866bf46290'],
    ['governor-two', '15', '6f6a1ba1448a4a88b18e092f0cb4e9d6d893267ae3bd4d6a855099b28c9f0a91'],
    ['lychee', '15', '130b9b7272860f7368e7bd5a060f02b76e7b9976674a3c119930d9b023df217a'],
    ['yao', '16', '4803b5283b468714bd10bd6464b50fa3134ea0f2fea295b20fa30e72f4e412ad'],
    ['scholar', '16', 'e1283a5babb7d55b0d5703b88c51c4cfeb881626b2e243f7a118d27fe513ad7f'],
    ['temple-one', '19', '910e68672902ea5454aba6ce8f78cbbc373bf3fc2943dfcc7799ef234dbe4301'],
    ['temple-two', '19', 'faccfba4169e60ceeb2fe5d27c31f336c16bfbc9913cb0b65f90a3a78fd6ad80'],
    ['wang', '20', '4d1e066c113ec54389587bd1cea01415a396f73f98996ca10ce0ae3639a8b15e'],
    ['flowers', '25', '8cabaf03c88b764a1954a15d8b3c20bd8ae51e6a8c150455407fb1f97fa93bfd'],
    ['distant-one', '25', 'cf83c60694edf508f02d8bca1b1b445fd4e1252bbd9f51d60967cd46f0a16f4c'],
    ['willow', '26', '7948edae94e728e04f8741e2b176f5272f25ba0428c09ffc9a4e9d5efccb772a'],
  ];
  const selected = poems.filter(poem => poem.id.startsWith('xue-tao-1906-'));
  assert.equal(selected.length, cases.length);
  const get = slug => selected.find(poem => poem.id === `xue-tao-1906-${slug}`);
  for (const [slug, pages, hash] of cases) {
    const poem = get(slug);
    assert.ok(poem, slug);
    assert.equal(poem.author, 'Xue Tao');
    assert.equal(poem.authorId, 'xue-tao');
    assert.equal(poem.authorOriginal, '薛濤');
    assert.equal(poem.language, 'Chinese');
    assert.equal(poem.lang, 'zh-Hant');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['China']);
    assert.equal(poem.year, null);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.equal(lineCount(poem), 4);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(poem.source, 'https://taiwanebook.ncl.edu.tw/en/book/NCL-000474792/reader');
    assert.equal(new URL(poem.contextSource).searchParams.get('oldid'), '679301');
    assert.ok(poem.context.includes(`reader pp. ${pages}`));
    assert.match(poem.context, /not an autograph or proof of every attribution/);
    assert.match(poem.context, /not a diplomatic transcription/);
    assert.match(poem.rights, /public domain in the United States/);
    assert.match(poem.rights, /CC BY-SA 4\.0/);
    assert.match(poem.rights, /維基小霸王/);
    for (const query of ['Xue Tao', '薛濤', poem.text.split('\n')[0]]) {
      assert.ok(filterPoems(poems, { language: 'Chinese', query }).includes(poem), query);
    }
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  assert.match(get('pipes').context, /聊一弄.*勞一弄/);
  assert.match(get('governor-one').context, /明月.*珠簾下.*朗月.*珠簾上/);
  assert.match(get('governor-two').context, /移尊.*移樽/);
  assert.match(get('scholar').context, /榜下看.*榜上看/);
  assert.match(get('willow').context, /一任南飛.*一晌南飛/);
  assert.match(get('distant-one').context, /second requires further review/);
  const group = groupPoets(poems).find(item => item.id === 'xue-tao');
  assert.equal(group.poems.length, cases.length + poems.filter(poem => poem.id.startsWith('xue-tao-further-1906-')).length);
  for (const poem of selected) assert.ok(group.poems.includes(poem), poem.id);
});
test('Whitman poems retain complete 1918 edition readings and source caveats', () => {
  const cases = [
    ['bunting', 8, 3, 'be9e8a72580da51385459f0c957e7864d2616ccb6ade546e0fa0b276229105d1'],
    ['drums', 21, 4, '80ebc814464e5aff668116cda932cd7fe0fffc3946fb1194de6502180c2f592a'],
    ['city', 17, 6, '8f78e1f4b8941913078056d47509a4ab43c344f6dbbc0b4ec6d4edec20a1000e'],
    ['march', 25, 7, 'd588711893a300a1ada901f3ab3a92749f355d58d4b50097d82a2840a87f41c7'],
    ['father', 37, 9, 'cea5dff5b8ba7b82aa73f558972895ae2436c70a88eb0041b11aac522fe0f2e4'],
    ['twilight', 15, 12, 'afbeb6a2a62fd93d45a273c147e1ffd8c64fcd90f8e33c0f14e00c1cbe65c055'],
    ['sight', 15, 14, '002bdc0929f886fd9a4bd5c5c81a5d7a21777537bef6a8eec7bbce9f3fb00476'],
    ['year', 6, 16, 'd2e226763c3dda63a6141e30c4e12a76a061bff17a73608b454335e36acea400'],
    ['dreams', 12, 41, '9c46fd50fcbf63f7868004234dc9020baf691874485db7b1866424b6e6dc73d3'],
    ['cluster', 8, 42, '84f1be574379e73ba586772f5cb667988c018e839a3e94167af42eff1975b2eb'],
    ['civilian', 10, 43, 'ede13b163837657fe101080bebce9f5d72dcad83e9fdd8968fdb7a4151f3b6f0'],
    ['adieu', 15, 44, '0934758726e63fd52f790bf3415341e744b78415b66bcc4a914ebde9955e2731'],
    ['long', 5, 45, '1b9ed8fac71b9a72c9ffc4cb0124dbdefa80719a2b8207173175b98a14687b01'],
    ['weave', 8, 49, '99f691bfa2e2192f1e1222ed242a70544e03b2d3ee37097fecd339f8af9438c3'],
    ['spirit', 18, 51, 'fee0f3c4d310591f9bd6296fb11c4e130074c24c912ced433d09f994342cb1c1'],
    ['captain', 24, 76, 'b6707bdd4c3b1ad44e00edf397d82f715c3b333bcc9451f605c000f4ec787282'],
    ['hush', 12, 78, '2fd56dd635e67f64b4bf218165753ee41c97347a5f96f31d0660457eda02d2d7'],
    ['america', 11, 87, 'bde0d502375a7fc804fb21115d2935db2852e8340d25d8abe5adc4970f3e493f'],
    ['foreign', 3, 141, 'a63f6a5f2915b66521d8c66d2fe037f480b472276a282f1715e28c92c43626de'],
    ['democracy', 11, 143, '70c0c71d294f7857f0e5417509a679f84a267e0028a36a7a4806f13f0abc9b43'],
  ];
  const selected = poems.filter(poem => poem.id.startsWith('whitman-1918-'));
  assert.equal(selected.length, cases.length);
  const get = slug => selected.find(poem => poem.id === `whitman-1918-${slug}`);
  for (const [slug, count, page, hash] of cases) {
    const poem = get(slug);
    assert.ok(poem, slug);
    assert.equal(poem.author, 'Walt Whitman');
    assert.equal(poem.authorId, 'walt-whitman');
    assert.equal(poem.language, 'English');
    assert.equal(poem.lang, 'en');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['United States']);
    assert.equal(poem.year, null);
    assert.deepEqual(poem.translations, []);
    assert.deepEqual(poem.themes, []);
    assert.equal(lineCount(poem), count);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(new URL(poem.source).pathname, '/ebooks/27494');
    assert.equal(new URL(poem.contextSource).hash, `#page=${page + 14}`);
    assert.match(poem.context, /not a diplomatic transcription/);
    assert.match(poem.context, /not necessarily the same copy/);
    assert.match(poem.context, /Punctuation was not independently collated/);
    assert.match(poem.rights, /public domain in the United States/);
    for (const query of ['Walt Whitman', poem.text.split('\n')[0]]) {
      assert.ok(filterPoems(poems, { language: 'English', query }).includes(poem), query);
    }
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  assert.match(get('drums').text, /would they continue\?/);
  assert.match(get('drums').context, /Not the peaceful farmer.*Nor/);
  assert.match(get('weave').text, /threads to weave,\nWe know not why/);
  assert.match(get('march').context, /odour of blood.*odor of blood/);
  assert.match(get('spirit').context, /Washington City, 1865/);
  assert.match(get('hush').context, /May 4, 1865/);
  assert.ok(!selected.some(poem => /^(Faces|How Solemn as One by One)$/i.test(poem.title)));
  const group = groupPoets(poems).find(item => item.id === 'walt-whitman');
  assert.equal(group.poems.length, 20);
  for (const poem of selected) assert.ok(group.poems.includes(poem), poem.id);
});
test('Keats poems retain complete 1909 edition readings and source caveats', () => {
  const cases = [
    ['nightingale', 80, 107, '3c0210c828cdf047203577c949532eca73b943e9fd056a19653ae9faa5821cdb'],
    ['urn', 50, 113, '73719c506c78e029eea95ebe0c09c67ed635bc7e03e4c3fe47d06080c76b938e'],
    ['psyche', 67, 117, '3393fe6e487ded96f6f728482ee1ce28f7b554ff57745876574adc1dc034f8b6'],
    ['fancy', 94, 122, 'c6eeb7b00daa1969d7963f23b841aafc0bd27e3ef1de633ee1ed43b19ea84b57'],
    ['bards', 40, 128, '25f8618f738383fc9b0b9ba556a576878476f138c0346f1b0973a1068dfb1e68'],
    ['mermaid', 26, 131, 'edec4934ee948ccd0389493990592ec253832cc8a0a9970ac30fb1e047824d47'],
    ['robin', 62, 133, '289102664df48d5170e13d940a3d87e5771a701b28e91a4328e90c72feed060f'],
    ['autumn', 33, 137, 'e2dfb340d7a4216109e6027468b4b71e0dabf912e2abb9dc26b39333f122eea2'],
    ['melancholy', 30, 140, 'c38b4a2a3fa1c4bc1d47d9e0071b35fa413bc35e851441ababc559772bc19a28'],
  ];
  const selected = poems.filter(poem => poem.id.startsWith('keats-1909-'));
  assert.equal(selected.length, cases.length);
  for (const [slug, count, page, hash] of cases) {
    const poem = selected.find(item => item.id === `keats-1909-${slug}`);
    assert.ok(poem, slug);
    assert.equal(poem.author, 'John Keats');
    assert.equal(poem.authorId, 'john-keats');
    assert.equal(poem.language, 'English');
    assert.equal(poem.lang, 'en');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['England']);
    assert.equal(poem.year, null);
    assert.deepEqual(poem.translations, []);
    assert.deepEqual(poem.themes, []);
    assert.equal(lineCount(poem), count);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(new URL(poem.source).pathname, '/ebooks/23684');
    assert.equal(new URL(poem.contextSource).pathname, `/files/23684/23684-h/images/${page}.png`);
    assert.match(poem.context, /not a diplomatic transcription/);
    assert.match(poem.context, /1820 copy was not independently checked/);
    assert.match(poem.context, /Punctuation has not been independently collated/);
    assert.match(poem.rights, /public domain in the United States/);
    for (const query of ['John Keats', poem.text.split('\n')[0]]) {
      assert.ok(filterPoems(poems, { language: 'English', query }).includes(poem), query);
    }
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  const get = slug => selected.find(poem => poem.id === `keats-1909-${slug}`);
  assert.match(get('nightingale').text, /Provençal song/);
  assert.match(get('psyche').text, /Phœbe's/);
  assert.match(get('robin').text, /grenè shawe/);
  assert.match(get('bards').context, /edition titles this work ‘Ode’/);
  assert.match(get('robin').context, /To a Friend/);
  const group = groupPoets(poems).find(item => item.id === 'john-keats');
  for (const poem of selected) assert.ok(group.poems.includes(poem), poem.id);
});
test('Blake copy Y selections retain separate complete readings and plate sources', () => {
  const cases = [
    ['lamb', 20, 347905, '14426c99504835ecffa5498b10952fa517507df24e05c0c174c1d9f5ed16a522'],
    ['infant-joy', 12, 347934, 'e7c5c750231dcab6c7a382f2dce989ce25f26006aaf676da491bafb76ec737a7'],
    ['sick-rose', 8, 347973, 'd5ab0a979eb3160a3f458e5d80c1b9d4488ecf611ebe106f2cbc6b069f1245d0'],
    ['fly', 20, 347974, '439d296452b045cde5cfd277ec84979d8ff38f6c495b9beef9d5ec7af638c2f7'],
    ['tyger', 24, 347983, '36872941517ffc2fac9c045517194bd0d72923b29a171219b36963586c3e758d'],
    ['pretty-rose-tree', 8, 347980, '4b70ff0e91ceb0f9bc004211611d7652ba1d85ce2b423744a3ce03720bf45dbd'],
    ['sun-flower', 8, 347980, 'c2342639ff884b688fbd5512105689bc0c37161496553961ceb9ef392aa1241f'],
    ['lilly', 4, 347980, '802aa1038b50fd3bca6d72f9efb91d65ca6e803ac3ef341df95d0253187ab2a8'],
    ['garden-of-love', 12, 347987, 'a687bf22fee9a3c722cd597457e91b011e355341d482e9e8aaaadfa5f6eb4cc0'],
    ['london', 16, 347997, 'b9d82818586cc6d8c63049503d0be8400cbef115721961f9e71eb3ed241695d4'],
    ['infant-sorrow', 8, 348004, '77828d27dfff43b5a371825848980dc55975bcf9fbd7c9fae2e9403081f4e738'],
    ['poison-tree', 16, 348006, '14d05fc4130b439b3e350db507d3e5d9b2642e82cc81b8f5f4c6e131bd754027'],
  ];
  const selected = poems.filter(poem => poem.authorId === 'william-blake');
  assert.equal(selected.length, cases.length);
  for (const [slug, count, object, hash] of cases) {
    const poem = selected.find(item => item.id === `blake-copy-y-${slug}`);
    assert.ok(poem, slug);
    assert.equal(poem.language, 'English');
    assert.equal(poem.lang, 'en');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.year, null);
    assert.deepEqual(poem.translations, []);
    assert.deepEqual(poem.themes, []);
    assert.equal(lineCount(poem), count);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(new URL(poem.source).pathname, `/art/collection/search/${object}`);
    assert.equal(new URL(poem.contextSource).pathname, '/ebooks/1934');
    assert.match(poem.context, /not a diplomatic edition/);
    assert.match(poem.context, /1901 edition is not copy Y/);
    assert.match(poem.rights, /public domain in the United States/);
    for (const query of ['William Blake', poem.text.split('\n')[0]]) {
      assert.ok(filterPoems(poems, { language: 'English', query }).includes(poem), query);
    }
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  const get = slug => selected.find(poem => poem.id.endsWith(`-${slug}`));
  assert.match(get('tyger').text, /dare sieze the fire/);
  assert.match(get('lamb').text, /Dost thou know/);
  assert.match(get('infant-sorrow').text, /swadling bands/);
  assert.match(get('lilly').text, /beauty bright\.$/);
  assert.ok(filterPoems(poems, { query: 'The Lily' }).includes(get('lilly')));
  assert.deepEqual(groupPoets(poems).find(group => group.id === 'william-blake').poems.map(poem => poem.id), cases.map(([slug]) => `blake-copy-y-${slug}`));
});
test('Tao Yuanming selections retain complete Ming readings and source attribution', () => {
  const cases = [
    ['01', 5, 59, '744cbce15be402a6ca5eebdd55f380ec35d3eddc8b3b8f8973025d89d727f55f'],
    ['02', 4, 60, '544f9078395efe20decc07b2026be0237094ce445e68d072b4442daebcdbd919'],
    ['03', 5, 60, '33e16f529388e0c0818893a1b3253dca5f0181cb807378b295c29ff4b7ef93ed'],
    ['05', 5, 60, '2607089db134ac239bbf03f0867202916597e46910559e228800ed5b3b09a179'],
    ['06', 4, 61, 'ad337cb4d16606ff06740cbb8ac07290ca12af9fe6e43d50e29721108ee3983e'],
    ['08', 5, 62, '75e754f8bf86c975003cc7388531f5a42654719cf2bbb09050ef0c89b7a923f7'],
    ['09', 8, 62, '3c5e585fef1729a823425762384119efc776edbc536580c8025d7492f360bab4'],
    ['14', 5, 64, '5bd574587f7ecd824aecfbe4bb7b6e30710f1e63b7d5424641ec44282275059f'],
    ['16', 6, 65, '94f1e321cad5db561c185017ee9da0728f95c3c844504b476773fe553fbcc61a'],
    ['17', 4, 65, '94ca4376738a2ac6098a8d1dce4b3d8bd2b6d218bc02fb41cc46a3627a5567e0'],
  ];
  const selected = poems.filter(poem => cases.some(([number]) => poem.id === `tao-yuanming-drinking-ming-${number}`));
  assert.equal(selected.length, cases.length);
  for (const [number, count, page, hash] of cases) {
    const poem = selected.find(item => item.id === `tao-yuanming-drinking-ming-${number}`);
    assert.ok(poem, number);
    assert.equal(poem.authorOriginal, '陶淵明');
    assert.equal(poem.language, 'Chinese');
    assert.equal(poem.lang, 'zh-Hant');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['China']);
    assert.equal(poem.year, null);
    assert.equal(poem.translations.length, ['05', '09'].includes(number) ? 1 : 0);
    assert.deepEqual(poem.themes, []);
    assert.equal(lineCount(poem), count);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(new URL(poem.source).hash, `#page=${page}`);
    assert.match(poem.context, /not a diplomatic edition/);
    assert.match(poem.context, /Wikisource transcription by its contributors/);
    assert.match(poem.rights, /CC BY-SA 4\.0/);
    assert.match(poem.rights, /https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\//);
    for (const query of ['Tao Yuanming', '陶淵明', poem.text.split('\n')[0]]) {
      assert.ok(filterPoems(poems, { language: 'Chinese', query }).includes(poem), query);
    }
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  const fifth = selected.find(poem => poem.id.endsWith('-05'));
  assert.match(fifth.text, /悠然見南山/);
  assert.match(fifth.context, /望 as a reading/);
  const group = groupPoets(poems).find(item => item.id === 'tao-yuanming');
  assert.deepEqual(group.poems.filter(poem => selected.includes(poem)).map(poem => poem.id), cases.map(([number]) => `tao-yuanming-drinking-ming-${number}`));
});
test('Waley translations preserve complete readings, source credits and editorial caveats', () => {
  const cases = [
    ['tao-yuanming-drinking-ming-05', 10, '5d710c65d4837ca0dbd0742dd8d5d4bb48d2bd8ab0824eaef1675bb521ea4829', '42290', '1918', '採菊東籬下'],
    ['tao-yuanming-drinking-ming-09', 16, '3a9ef63e0bf2998d7c7eef60262e8c45912563f26ded2b86b69075a896aca619', '42290', '1918', '清晨聞叩門'],
    ['tang-006', 14, '52a5d7d887987b92a00a9e3b7ae57f4207ab6b011d8a92f583cc0837c48c1eee', '16500', '1919', '花間一壺酒'],
  ];
  for (const [id, lines, hash, ebook, year, originalFragment] of cases) {
    const poem = poems.find(item => item.id === id);
    assert.ok(poem, id);
    assert.equal(poem.language, 'Chinese');
    assert.ok(poem.text.includes(originalFragment));
    assert.equal(poem.translations.length, 1);
    const translation = poem.translations[0];
    assert.equal(translation.language, 'English');
    assert.equal(translation.text.split('\n').length, lines);
    assert.equal(createHash('sha256').update(translation.text).digest('hex'), hash);
    assert.equal(translation.source, `https://www.gutenberg.org/ebooks/${ebook}`);
    assert.match(translation.translator, new RegExp(`Arthur Waley.*${year}`));
    assert.match(translation.rights, /public domain in the United States/);
    assert.match(translation.rights, /Chinese source edition is not established/);
    assert.match(translation.rights, /interpretive rendering/);
    assert.ok(filterPoems(poems, { language: 'Chinese', query: originalFragment }).includes(poem));
    assert.ok(filterPoems(poems, { language: 'Chinese', query: translation.text.split('\n')[0] }).includes(poem));
    assert.ok(filterPoems(poems, { language: 'Chinese', readable: 'English' }).includes(poem));
    assert.ok(filterPoems(poems, { language: 'Chinese', translation: 'English' }).includes(poem));
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(escapeHtml(translation.text)));
    assert.ok(html.includes(escapeHtml(translation.source)));
    assert.ok(html.includes(escapeHtml(translation.rights)));
  }
  const get = id => poems.find(poem => poem.id === id).translations[0];
  assert.match(get(cases[0][0]).rights, /‘summer hills’.*‘南山’/);
  assert.match(get(cases[1][0]).rights, /number \(2\), not a title/);
  assert.match(get(cases[2][0]).rights, /‘shadow as slave’.*not explicit/);
  assert.match(get(cases[2][0]).rights, /Milky Way/);
});

test('Chamberlain versions retain complete readings, sources and interpretation caveats', () => {
  const cases = [
    ['summer-grass-basho', '夏草や兵どもが夢の跡', 'e2844bbb6714c9005975152d2fbbb1ca72d159339aee033294e363ba38864c49', '332'],
    ['basho-nozarashi-28', '年暮れぬ笠着て草鞋穿きながら', '8567ef65cea3c8a2424d5ad2ca2c2489ecc12d9928d85060e739ce86633bce62', '346'],
    ['buson-1926-12', '春雨やものかたりゆく簑と傘', 'e5180fc6782e67462f1c0be74d993450ce4bc4eb3b2c01ab878771ecffe3c411', '378'],
    ['buson-1926-13', '遲き日のつもりて遠きむかしかな', 'c6b099fef7ab7aee116deae6d45638eb8fc188bb807fc14b35a94e58db5fd216', '377'],
    ['chiyo-ni-1927-46', '百生や蔓一すじの心より', 'f81825ee4c0a65df56000a1d1c15ecd43518ce5034d403479f0a86b9972f2259', '375'],
  ];
  assert.deepEqual(Object.keys(chamberlainTranslations).sort(), cases.map(([id]) => id).sort());
  for (const [id, original, hash, page] of cases) {
    const poem = poems.find(item => item.id === id);
    assert.equal(poem.language, 'Japanese');
    assert.equal(poem.text, original);
    const matching = poem.translations.filter(item => item.language === 'English');
    assert.equal(matching.length, 1);
    const translation = matching[0];
    assert.equal(translation.text.split('\n').length, 2);
    assert.equal(createHash('sha256').update(translation.text).digest('hex'), hash);
    assert.equal(translation.translator, 'Basil Hall Chamberlain · 1902');
    assert.equal(new URL(translation.source).hash, `#page=${page}`);
    assert.match(translation.rights, /public domain in the United States.*check local law/);
    assert.match(translation.rights, /Japanese working edition is not established/);
    for (const query of [original, translation.text.split('\n')[0]]) assert.ok(filterPoems(poems, { language: 'Japanese', query }).includes(poem));
    assert.ok(filterPoems(poems, { language: 'Japanese', readable: 'English' }).includes(poem));
    assert.ok(filterPoems(poems, { language: 'Japanese', translation: 'English' }).includes(poem));
    const html = renderPoem(poem, poems, '/ai-poems/');
    for (const text of [translation.text, translation.source, translation.rights]) assert.ok(html.includes(escapeHtml(text)));
  }
  const rights = id => poems.find(poem => poem.id === id).translations[0].rights;
  assert.match(rights('summer-grass-basho'), /‘no’.*が.*‘ga’/);
  assert.match(rights('buson-1926-12'), /monogatari.*ものかたり.*monokatari/);
  assert.match(rights('buson-1926-13'), /printed English heading/);
  assert.match(rights('chiyo-ni-1927-46'), /approximation.*gourd.*his own/);
  assert.equal(poems.find(item => item.id === 'basho-nozarashi-35').translations.length, 0);
});

test('Fir-Flower versions retain complete readings, joint credits and interpretation caveats', () => {
  const cases = [
    ['tang-015', '言入黃花川', [15], 'd281a74712c16c0bd1628047ef1fa1106bf74b0209fc6635361adac01477a2bc', 'THE_BLUE-GREEN_STREAM'],
    ['tang-016', '斜光照墟落', [10], '9a170d327732ab8db3a6fb42a4128ea977ec8d882a57e30aee6ec353e5b446a7', 'FARM_HOUSE'],
    ['tang-022', '絕頂一茅茨', [16], '3fa98c8efaa2ed5c593ad692f945b35b707254f6f12f6ae9b90b4fedb491689c', 'SEEKING_FOR_THE_HERMIT_OF_THE_WEST'],
    ['tang-023', '幽意無斷絕', [10], '93ac438833cab9b4ed9b09c44090707b4ebd351069adbd96017eb5a78920c530', 'FLOATING_ON_THE_POOL_OF_JO_YA_SPRING'],
    ['tang-102', '青山橫北郭', [9], '7d253c3f38424d897643c264a420ad6f8e78dd8397049b7c2a01f1476bf0af42', 'SAYING_GOOD-BYE_TO_A_FRIEND'],
    ['tang-175', '鳳凰臺上鳳凰遊', [4, 5], '0f0e50bf088bc8c73581def438373c4d26452ce70138b12ce567ddf4ee5dd0ed', 'FENG_HUANG_TAI'],
    ['tang-268', '故人西辭黃鶴樓', [4], 'e0e84c24a3d352bb576806d5afffd6365c7d940b78e5ef63e33f2a4f71e91a64', 'YELLOW_CRANE_TOWER'],
  ];
  for (const [id, original, lines, hash, anchor] of cases) {
    const poem = poems.find(item => item.id === id);
    assert.equal(poem.language, 'Chinese');
    assert.ok(poem.text.includes(original));
    const matching = poem.translations.filter(item => item.language === 'English');
    assert.equal(matching.length, 1);
    const translation = matching[0];
    assert.deepEqual(translation.text.split('\n\n').map(stanza => stanza.split('\n').length), lines);
    assert.equal(createHash('sha256').update(translation.text).digest('hex'), hash);
    assert.match(translation.translator, /Florence Ayscough · Chinese translation; Amy Lowell · English version/);
    assert.equal(new URL(translation.source).hash, `#${anchor}`);
    assert.match(translation.rights, /public domain in the United States/);
    assert.match(translation.rights, /Chinese source edition is not established/);
    assert.ok(filterPoems(poems, { language: 'Chinese', query: original }).includes(poem));
    assert.ok(filterPoems(poems, { language: 'Chinese', query: translation.text.split('\n')[0] }).includes(poem));
    assert.ok(filterPoems(poems, { language: 'Chinese', readable: 'English' }).includes(poem));
    assert.ok(filterPoems(poems, { language: 'Chinese', translation: 'English' }).includes(poem));
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(escapeHtml(translation.text)));
    assert.ok(html.includes(escapeHtml(translation.source)));
    assert.ok(html.includes(escapeHtml(translation.rights)));
  }
  const rights = id => poems.find(poem => poem.id === id).translations.find(item => item.language === 'English').rights;
  assert.match(rights('tang-015'), /white as silk/);
  assert.match(rights('tang-016'), /heights.*not explicit.*式微/);
  assert.match(rights('tang-022'), /Nothing-Beyond Peak.*red grass.*not explicit/);
  assert.match(rights('tang-023'), /serrated hills.*Southern Dipper/);
  assert.match(rights('tang-102'), /right angle.*water-plants.*孤蓬/);
  assert.match(rights('tang-175'), /mythical 鳳凰.*Green Heaven.*青山外/);
  assert.match(rights('tang-268'), /Flower-smelling mist.*jade-coloured distance/);
  const pheasants = poems.find(poem => poem.id === 'tang-175').translations.find(item => item.language === 'English');
  assert.match(pheasants.title, /Fêng Huang T’ai · Ascending the Terrace/);
  assert.match(pheasants.text, /\n\nThe three hills/);
  assert.match(pheasants.text, /\n  Therefore am I sorrowful\.$/);
});

test('early Tang translations retain complete readings, sources and interpretation caveats', () => {
  const cases = [
    ['tang-020', 'French', '夕陽度西嶺', [4, 4], '2b7160e0ccc191750ea5cc3b5dceb91ccd293e5ecf3925ecde8402a2da069c7b', 'Hervey de Saint-Denys', '325'],
    ['tang-020', 'English', '夕陽度西嶺', [4, 4, 4, 4], '558110adc7f5e86aa5f8c6121a8ad14765e412a1dba95d6ae91211514de31438', 'Cranmer-Byng', '48'],
    ['tang-128', 'French', '故人具雞黍', [4, 4], '21335adca8fb397531e2904d9cd284df3b8861270427717853464f17c2d1935e', 'Hervey de Saint-Denys', '323'],
    ['tang-041', 'English', '長安一片月', [6], '512a22b636a7b6486996aa37bf4430343abaca643841bb7d1330e989805727d9', 'Herbert A. Giles', '131'],
  ];
  for (const [id, language, original, stanzas, hash, credit, page] of cases) {
    const poem = poems.find(item => item.id === id);
    assert.ok(poem, id);
    assert.equal(poem.language, 'Chinese');
    assert.ok(poem.text.includes(original));
    const matching = poem.translations.filter(item => item.language === language);
    assert.equal(matching.length, 1);
    const translation = matching[0];
    assert.deepEqual(translation.text.split('\n\n').map(stanza => stanza.split('\n').length), stanzas);
    assert.equal(createHash('sha256').update(translation.text).digest('hex'), hash);
    assert.ok(translation.translator.includes(credit));
    assert.equal(new URL(translation.source).hash, `#page=${page}`);
    assert.match(translation.rights, /public domain in the United States/);
    assert.match(translation.rights, /not established/);
    assert.ok(filterPoems(poems, { language: 'Chinese', query: original }).includes(poem));
    assert.ok(filterPoems(poems, { language: 'Chinese', query: translation.text.split('\n')[0] }).includes(poem));
    assert.ok(filterPoems(poems, { language: 'Chinese', readable: language }).includes(poem));
    assert.ok(filterPoems(poems, { language: 'Chinese', translation: language }).includes(poem));
    const html = renderPoem(poem, poems, '/ai-poems/');
    assert.ok(html.includes(escapeHtml(translation.text)));
    assert.ok(html.includes(escapeHtml(translation.source)));
    assert.ok(html.includes(escapeHtml(translation.rights)));
  }
  const get = (id, language) => poems.find(poem => poem.id === id).translations.find(item => item.language === language);
  assert.match(get('tang-020', 'French').rights, /Ting-Kong.*not established/);
  assert.match(get('tang-020', 'English').rights, /earlier English and French translations/);
  assert.match(get('tang-020', 'English').rights, /does not name its individual source/);
  assert.match(get('tang-128', 'French').rights, /rice.*millet/);
  assert.match(get('tang-128', 'French').rights, /Wang Wei is not established/);
  assert.match(get('tang-041', 'English').rights, /‘crescent’.*‘Kansuh’.*‘Tartars’/);
  assert.match(get('tang-041', 'English').rights, /not endorsed/);
});

test('further Tao Yuanming poems retain Ming variants, complete boundaries and credits', () => {
  const cases = [
    ['04', 6, 60, '038b11564ec307accbcf341f62243da770812a8f7877419d22587dd97755521a'],
    ['07', 5, 61, 'ac89720651d73188e9112ed94100ec4c6e2895a3244dbd2fd66ccd179f452207'],
    ['11', 6, 63, 'a432b0932c32db1e1d2a1a0288cee6b4f659e14e65ba8be127ff8d30661ebe9f'],
    ['12', 6, 63, 'd8646dd26c6f71d46f873b312eb98aa822146084424ad343ba4cd60f94115e90'],
    ['13', 5, 64, 'd96dd030c335cbb85601413e943de05063e0e8c15e85f193c86dcc7822c2f5bd'],
    ['15', 5, 65, '017122f71a6c2b17f1badfef360af7cf0ad1a9f30c0f5bae98ce5ea86767d304'],
    ['18', 5, 66, '8cc85642d655ee1a01bcb6163324fb42a411e63c620a1c0cf1c88a192aa77bae'],
    ['19', 7, 66, '331473393b528a922a3ef6739e5471b764db0df775e32595402a37d71522deca'],
  ];
  const selected = poems.filter(poem => cases.some(([number]) => poem.id === `tao-yuanming-drinking-ming-${number}`));
  assert.equal(selected.length, cases.length);
  assert.ok(poems.filter(poem => poem.authorId === 'tao-yuanming').length >= 18);
  for (const [number, count, page, hash] of cases) {
    const poem = selected.find(item => item.id === `tao-yuanming-drinking-ming-${number}`);
    assert.ok(poem, number);
    assert.equal(poem.authorOriginal, '陶淵明');
    assert.equal(poem.language, 'Chinese');
    assert.equal(poem.lang, 'zh-Hant');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['China']);
    assert.equal(poem.year, null);
    assert.deepEqual(poem.translations, []);
    assert.deepEqual(poem.themes, []);
    assert.equal(lineCount(poem), count);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(new URL(poem.source).hash, `#page=${page}`);
    assert.match(poem.context, /not a diplomatic edition/);
    assert.match(poem.context, /Wikisource transcription by its contributors/);
    assert.match(poem.rights, /CC BY-SA 4\.0/);
    assert.match(poem.rights, /https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\//);
    for (const query of ['Tao Yuanming', '陶淵明', poem.text.split('\n')[0]]) {
      assert.ok(filterPoems(poems, { language: 'Chinese', query }).includes(poem), query);
    }
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  const get = number => selected.find(poem => poem.id.endsWith(`-${number}`));
  assert.match(get('04').text, /厲響思清晨，遠去何所依/);
  assert.match(get('04').context, /厲響思清遠/);
  assert.match(get('12').context, /continues across the turn/);
  assert.match(get('15').context, /歲月相催逼/);
  assert.match(get('18').context, /載醪袪所惑/);
  assert.match(get('19').context, /終死歸田里/);
});
test('Li Qingzhao lyrics retain the 1881 readings, boundaries and attribution caveats', () => {
  const cases = [
    ['southern-song', 8, 5, '8392dd6486cc789bfeeb1afb4fe1bfffb43bf8901300f83fbced6a1cdeef924d'],
    ['fisher-dream', 10, 6, '385e94c3b1225c0b3d12f73440b27c69b380045e3b4cd193381cbf8a437b96d0'],
    ['stream-pavilion', 6, 6, '1228edc032c058c36f3c6e90050b180133fe25b108a84515afd40340f0eb6c46'],
    ['last-night', 6, 6, 'e75f8b7796b6cddb0d2154ade0f1d831bb5fa019df6c2ccf8638e46cb17e0853'],
    ['gentle-wind', 8, 7, 'bb483e8416874d094c0366f4a479a92495dd25d9ffa98a5b112374af400e7ce5'],
    ['small-courtyard', 6, 7, 'b875bbde5df081d5df548a2aeadc5bb6a96c5a75ea7ab4f6a4690ef40a6b6393'],
    ['cold-food', 6, 7, '3cc8a066dc81e953f4628a3c94c86dde61bb5e63b41511fdb5140861e1002c40'],
    ['red-lotus', 8, 8, 'c5ae4b4481427c7474219af863aaf052425f8808c6f6d2ecf6fb2a32cdff76dd'],
    ['farewell', 8, 8, 'b8b917ff9bc87d92463e7f61eef3cbe355cf9f0ae1f004f189f2505978f2d6eb'],
    ['warm-rain', 8, 9, '4aba24775da97876d617eb10138834773056cd9b0c6799b105fbab4be496ab40'],
    ['long-gate', 8, 9, '7916b56e81711a58c9d47d7c3c180a3697fe2b64473486893ef5a6fbe485ea38'],
    ['chrysanthemum', 8, 10, '9f8c5d81184f21ba25bcf5f208b6e7dd93915914ce000c5a681d3216039ae802'],
  ];
  const selected = poems.filter(poem => poem.id.startsWith('li-qingzhao-1881-') && !poem.id.startsWith('li-qingzhao-1881-more-'));
  assert.equal(selected.length, cases.length);
  const bySlug = slug => selected.find(poem => poem.id === `li-qingzhao-1881-${slug}`);
  for (const [slug, count, page, hash] of cases) {
    const poem = bySlug(slug);
    assert.ok(poem, slug);
    assert.equal(poem.authorOriginal, '李清照');
    assert.equal(poem.language, 'Chinese');
    assert.equal(poem.lang, 'zh-Hant');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['China']);
    assert.equal(poem.year, null);
    assert.deepEqual(poem.translations, []);
    assert.deepEqual(poem.themes, []);
    assert.equal(lineCount(poem), count);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(new URL(poem.source).hash, `#page=${page}`);
    assert.match(poem.context, /not a diplomatic edition/);
    assert.match(poem.context, /attributions and readings vary/i);
    assert.ok(!/[□�]/u.test(poem.text));
    for (const query of ['Li Qingzhao', '李清照', poem.text.split('\n')[0].replace(/[，。？]/gu, '')]) {
      assert.ok(filterPoems(poems, { language: 'Chinese', query }).includes(poem), query);
    }
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  assert.match(bySlug('fisher-dream').context, /䢜.*歸/);
  assert.match(bySlug('stream-pavilion').context, /Su Shi.*Lü Dongbin/);
  assert.match(bySlug('small-courtyard').context, /Zhou Bangyan.*Ouyang Xiu/);
  assert.match(bySlug('small-courtyard').text, /遠岫出山/);
  assert.match(bySlug('cold-food').context, /Zhong Bing.*disputed/);
  assert.match(bySlug('cold-food').text, /江梅已過/);
  assert.match(bySlug('warm-rain').text, /^暖雨晴風/);
  assert.match(bySlug('chrysanthemum').text, /人比黃花瘦。$/);
  for (const slug of ['small-courtyard', 'cold-food', 'red-lotus']) {
    const poem = bySlug(slug);
    assert.equal(poem.displayTitleLang, 'zh-Hant');
    assert.ok(filterPoems(poems, { query: poem.displayTitle }).includes(poem));
  }
  const priorGroupIds = groupPoets(poems).find(group => group.id === 'li-qingzhao').poems.map(poem => poem.id).filter(id => id.startsWith('li-qingzhao-1881-') && !id.startsWith('li-qingzhao-1881-more-'));
  assert.deepEqual(priorGroupIds, cases.map(([slug]) => `li-qingzhao-1881-${slug}`));
});
test('further Li Qingzhao lyrics preserve complete 1881 readings and textual uncertainty', () => {
  const cases = [
    ['cold-window', 9, 9, 'ce4e3abc3e1fa2e594c3d700cb2a5741f10caaa12170938dad2f70a27ce554c1'],
    ['deep-courtyard', 10, 9, '56f9999ec6d1cd11c17158643bcc227040e860f8f73e54842f08c58e6a592d05'],
    ['fallen-blossoms', 8, 10, '8d023da9d5f3c287eb6df35fe2d1439ed70576df626e090065faca9d0c060d23'],
    ['late-undressing', 11, 10, 'ed6d02c768e50ab0ba5724c98df48c3437362bd20d28974193305b5650171e9d'],
    ['desolate-court', 20, 11, '346e9bee1e38318864fc5eab79be230c681aabaa0d4156114851558c03e26f0a'],
    ['seeking', 21, 11, '9cd83b105eb172fe93dddf9806abfc2328744f867e64b7ea38fecf0d841319a5'],
  ];
  const selected = poems.filter(poem => poem.id.startsWith('li-qingzhao-1881-more-'));
  assert.equal(selected.length, cases.length);
  const get = slug => selected.find(poem => poem.id === `li-qingzhao-1881-more-${slug}`);
  for (const [slug, count, page, hash] of cases) {
    const poem = get(slug);
    assert.ok(poem, slug);
    assert.equal(poem.authorId, 'li-qingzhao');
    assert.equal(poem.authorOriginal, '李清照');
    assert.equal(poem.language, 'Chinese');
    assert.equal(poem.lang, 'zh-Hant');
    assert.equal(poem.direction, 'ltr');
    assert.deepEqual(associatedPlaces(poem), ['China']);
    assert.equal(poem.year, null);
    assert.deepEqual(poem.translations, []);
    assert.deepEqual(poem.themes, []);
    assert.equal(lineCount(poem), count);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(new URL(poem.source).hash, `#page=${page}`);
    assert.match(poem.context, /not a diplomatic edition/);
    assert.match(poem.context, /not proof of sole authorship/);
    assert.match(poem.rights, /public domain in the United States/);
    assert.ok(!/[□�]/u.test(poem.text));
    for (const query of ['Li Qingzhao', '李清照', poem.text.split('\n')[0].replace(/[，。？]/gu, '')]) {
      assert.ok(filterPoems(poems, { language: 'Chinese', query }).includes(poem), query);
    }
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  assert.match(get('cold-window').text, /酒闌愛喜團茶苦/);
  assert.match(get('cold-window').context, /酒闌更喜團茶苦/);
  assert.match(get('deep-courtyard').text, /人老建康城/);
  assert.match(get('deep-courtyard').context, /人客遠安城.*人客建康城/);
  assert.match(get('fallen-blossoms').text, /正是傷春時節/);
  assert.match(get('fallen-blossoms').context, /superfluous/);
  assert.match(get('late-undressing').context, /copying addition/);
  assert.match(get('desolate-court').text, /清露晨梳/);
  assert.match(get('desolate-court').context, /清露晨流/);
  assert.equal(get('desolate-court').displayTitle, '念奴嬌（蕭條庭院）');
  assert.ok(filterPoems(poems, { query: get('desolate-court').displayTitle }).includes(get('desolate-court')));
  assert.match(get('seeking').context, /晚來風急.*晚來風力/);
  const group = groupPoets(poems).find(item => item.id === 'li-qingzhao');
  assert.equal(group.poems.length, 19);
  assert.ok(group.poems.some(poem => poem.id === 'recognized-world-classics-7-li-wujiang'));
  for (const poem of selected) assert.ok(group.poems.includes(poem), poem.id);
});
test('Poe selections preserve complete 1900 readings, sections and source caveats', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/poe-1900.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.fromEntries(Object.entries(manifest.witnesses).map(([name, item]) => [name, item.sha256])), {
    'pg76996.txt': 'c5a676010d4c071819f42c4a471cee5cfcf9baec9d41c0a4101e76d1b341eb2a',
    'poe-1900.pdf': 'fa8832989d630f0666e7fb693cf37c4386b091370e419528e16cdfa788c87865',
  });
  const cases = [
    ['raven', 'The Raven', 108, [3, 12], [43, 52], '520e89d4e7a22ef037289fd7b93bf14829c45261f62c29abca0305fc31011ce7'],
    ['bells', 'The Bells', 117, [15, 20], [55, 60], '5f7570fa0aefc7bd9a4cc01478f1f9ea23ec60a3dfb40927bf9a00d1bc4be81b'],
    ['annabel-lee', 'Annabel Lee', 41, [41, 42], [81, 82], '6cc68ef4fd1307b22bdc5ae3e9b4579a1d5c405fe11458302e255cc20f9e6703'],
    ['city-in-the-sea', 'The City in the Sea', 53, [48, 50], [88, 90], '1d5f55e990d983db1b68352ecbf3f9f215b320b2017ce1fe44b86eb1e1f58eb9'],
    ['conqueror-worm', 'The Conqueror Worm', 40, [50, 53], [90, 93], '33a56273278a9a1b64d962c43acd9aa1ce759300f13461489cd1627a786d7ef0'],
    ['sleeper', 'The Sleeper', 61, [54, 56], [94, 96], '3349a59acfcaeb207be1e2b9fe390cb5cad67f362deed90a90b46905e48f241b'],
    ['dreamland', 'Dreamland', 56, [58, 62], [98, 102], '8bafeabd3a815f4b8d4113419eff424acd710acb3bd47ad6882ec96f6054767e'],
    ['eldorado', 'Eldorado', 24, [64, 64], [104, 104], '6c3caeccb95cfb485dc610903113672fbe92857c3eec44196d5ea571ed03b1a3'],
    ['dream-within-a-dream', 'A Dream within a Dream', 24, [72, 72], [112, 112], 'f0a22b20f58c15e6c648931fbef214b7ec328e9fa1d164933bd17f7f9bd6bd1b'],
    ['haunted-palace', 'The Haunted Palace', 48, [76, 81], [116, 121], 'a5db5a913ec1f79c0367f81115557225c941339063c5100b0f08a5a04b5bd760'],
  ];
  const selected = poems.filter(poem => poem.authorId === 'edgar-allan-poe');
  assert.equal(selected.length, 10);
  assert.deepEqual(manifest.poems.map(item => item.slug), cases.map(([slug]) => slug));
  const normalized = value => value.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const earlier = poems.filter(poem => !poem.id.startsWith('poe-1900-'));
  for (const [index, [slug, title, count, printed, leaves, hash]] of cases.entries()) {
    const item = manifest.poems[index];
    const poem = selected.find(entry => entry.id === `poe-1900-${slug}`);
    assert.ok(poem, slug);
    assert.equal(poem.title, title);
    assert.equal(poem.author, 'Edgar Allan Poe');
    assert.equal(poem.authorYears, '1809–1849');
    assert.deepEqual(associatedPlaces(poem), ['United States']);
    assert.equal(poem.language, 'English');
    assert.equal(poem.lang, 'en');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.match(poem.yearLabel, /1900 edition.*composition date not established/);
    assert.equal(poem.source, 'https://www.gutenberg.org/ebooks/76996');
    assert.equal(new URL(poem.contextSource).hash, `#page=${leaves[0]}`);
    assert.deepEqual(item.printedPages, printed);
    assert.deepEqual(item.pdfLeaves, leaves);
    assert.equal(lineCount(poem), count);
    assert.deepEqual(poem.text.split('\n\n').map(part => part.split('\n').length), item.segments);
    assert.equal(item.textSha256, hash);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(poem.text.split('\n')[0], item.first);
    assert.equal(poem.text.split('\n').at(-1), item.last);
    assert.doesNotMatch(poem.text, /\[|\]|Illustration|_/);
    assert.match(poem.context, /OCR and visual checks.*source copy is not identified/);
    assert.match(poem.context, /not a diplomatic transcription.*final author-approved text/);
    assert.match(poem.rights, /public domain in the United States.*Chris Curnow.*Turgut Dincer.*Linda Cantoni/);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    const firstVerse = poem.text.split('\n').filter(Boolean)[slug === 'bells' ? 1 : 0];
    assert.ok(!earlier.some(old => normalized(old.text.split('\n').find(Boolean) || '') === normalized(firstVerse)), `${slug} duplicates an existing incipit`);
    for (const query of ['Edgar Allan Poe', title, firstVerse]) assert.ok(filterPoems(poems, { query, language: 'English' }).includes(poem), query);
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  const raven = selected.find(poem => poem.id === 'poe-1900-raven');
  assert.equal(raven.text.split('\n\n').length, 18);
  assert.match(raven.text, /darkness gave no token[\s\S]*not an instant[\s\S]*sign of parting/);
  assert.match(raven.context, /stillness gave no token.*not a minute.*sign in parting/);
  const bells = selected.find(poem => poem.id === 'poe-1900-bells');
  assert.deepEqual(bells.text.split('\n').filter(line => /^(I|II|III|IV)$/.test(line)), ['I', 'II', 'III', 'IV']);
  assert.equal(lineCount(bells) - 4, 113);
  assert.match(bells.text, /On the moon!\nOh, from out the sounding cells,/);
  assert.match(bells.context, /four numbered parts form one work.*line count includes the four part headings/);
  assert.deepEqual(groupPoets(poems).find(group => group.id === 'edgar-allan-poe').poems.map(poem => poem.id), cases.map(([slug]) => `poe-1900-${slug}`));
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
test('Bilac sonnets preserve complete 1919 readings, page mappings and comparison variants', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/bilac-tarde-1919.json', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../scripts/sources/bilac-tarde-1919.txt', import.meta.url), 'utf8');
  const parts = source.split(/^=== ([a-z]+) ===\n/gm);
  assert.equal(parts.shift(), '');
  const readings = new Map();
  while (parts.length) readings.set(parts.shift(), parts.shift().trim());
  assert.equal(manifest.titlePageLeaf, 9);
  assert.deepEqual(Object.fromEntries(Object.entries(manifest.witnesses).map(([name, witness]) => [name, witness.sha256])), {
    'tarde-1919.pdf': 'cbcfa738725c886436e1a082af32bb5d45bf5e7437fbb1680ff995964d69647e',
    'tarde-hathitrust-1919.djvu': 'c93d501d3d82159efa96f938bfd1df9caabaceed50408b135f14442cfb8e58c3',
  });
  const cases = [
    ['cyclo', 'Cyclo', 'Ciclo', [12, 13], [16, 17], [16, 17], 'ad1d48f90ddfa26ea8f150d3782f1bb48936d021975367d841ab646397fbc6bd'],
    ['patria', 'Patria', 'Pátria', [14, 15], [18, 19], [18, 19], 'bf704dbfae4d88c3c72a90e3c24c5fe6e9a08368ced45ca982fdc95628dd677e'],
    ['lingua', 'Lingua Portugueza', 'Língua Portuguesa', [16, 17], [20, 21], [20, 21], 'e78c7daff17b2c8599d23f1840a66e84e3936772e4875cfe6eda20de0dbde5f0'],
    ['poeta', 'A um poeta', undefined, [118, 119], [122, 123], [122, 123], '8912e6f3702e9884c216bf2db9fb14f09e40455396f9a3c0d6f1c072276de998'],
    ['sinos', 'Aos sinos', 'Os sinos', [204, 205], [204, 205], [208, 209], '83a4c66876a8794e8ac209bcd124fd8542b41163f783885904da751f9c620600'],
  ];
  assert.deepEqual(manifest.poems.map(item => item.slug), cases.map(([slug]) => slug));
  for (const [index, [slug, title, display, printed, usp, princeton, hash]] of cases.entries()) {
    const item = manifest.poems[index];
    const poem = poems.find(entry => entry.id === `bilac-tarde-1919-${slug}`);
    assert.ok(poem, slug);
    assert.equal(poem.title, title);
    assert.equal(poem.displayTitle, display);
    if (display) assert.equal(poem.displayTitleLang, 'pt');
    assert.equal(poem.author, 'Olavo Bilac');
    assert.equal(poem.authorId, 'olavo-bilac');
    assert.equal(poem.authorYears, '1865–1918');
    assert.deepEqual(associatedPlaces(poem), ['Brazil']);
    assert.equal(poem.language, 'Portuguese');
    assert.equal(poem.lang, 'pt');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.match(poem.yearLabel, /Published 1919.*composition date not established/);
    assert.equal(poem.form, 'Sonnet');
    assert.deepEqual(item.printedPages, printed);
    assert.deepEqual(item.uspLeaves, usp);
    assert.deepEqual(item.princetonLeaves, princeton);
    assert.equal(poem.text, readings.get(slug));
    assert.deepEqual(poem.text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4, 3, 3]);
    assert.equal(lineCount(poem), 14);
    assert.equal(item.textSha256, hash);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(new URL(poem.source).searchParams.get('page'), String(princeton[0]));
    if (['cyclo', 'patria'].includes(slug)) assert.equal(new URL(poem.contextSource).hash, `#page=${usp[0]}`);
    else assert.equal(poem.contextSource, 'https://www.academia.org.br/academicos/olavo-bilac/textos-escolhidos');
    assert.match(poem.context, /follows the Princeton\/HathiTrust copy.*checked line by line against the USP copy/);
    assert.match(poem.context, /Modern transcriptions were comparison aids/);
    assert.match(poem.context, /copies of the same printing, not independent editions/);
    assert.match(poem.context, /not a diplomatic edition.*final author-approved text/);
    assert.match(poem.rights, /public domain in the United States/);
    assert.match(poem.rights, /Commons marks the Princeton scan public domain.*USP requests noncommercial use.*not reproduced/);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    for (const query of ['olavo bilac', title, ...(display ? [display] : [])]) {
      assert.ok(filterPoems(poems, { language: 'Portuguese', country: 'Brazil', query }).includes(poem), query);
    }
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  const bySlug = slug => poems.find(poem => poem.id === `bilac-tarde-1919-${slug}`);
  assert.match(bySlug('cyclo').text, /^Manhã\. Sangue em delirio, verde gomo,[\s\S]*As folhas, como lagrimas\.\.\. Lembrar!$/);
  assert.match(bySlug('cyclo').context, /one complete sonnet.*not separate works/);
  assert.match(bySlug('patria').text, /^Patria, latejo em ti[\s\S]*soffrendo o golpe e o insulto!$/);
  assert.match(bySlug('lingua').text, /De virgens selvas e de oceano largo!/);
  assert.match(bySlug('lingua').context, /de oceano largo.*de oceanos largos/);
  assert.match(bySlug('poeta').text, /Do claustro, na paciencia e no socego,/);
  assert.match(bySlug('poeta').context, /na paciencia.*no silêncio/);
  assert.match(bySlug('poeta').context, /damaged mark.*omitted/);
  assert.match(bySlug('poeta').rights, /Wikisource contributors.*CC BY-SA 4\.0/);
  assert.match(bySlug('patria').rights, /Wikisource contributors.*CC BY-SA 4\.0/);
  assert.match(bySlug('sinos').text, /aspiração mais vasta/);
  assert.match(bySlug('sinos').context, /Aos sinos.*mais vasta.*Os sinos.*mais casta/);
  assert.ok(filterPoems(poems, { query: 'virgens selvas e de oceano largo' }).includes(bySlug('lingua')));
  assert.ok(filterPoems(poems, { query: 'andaimes do edificio' }).includes(bySlug('poeta')));
  assert.deepEqual(groupPoets(poems).find(group => group.id === 'olavo-bilac').poems.map(poem => poem.id), [...cases.map(([slug]) => `bilac-tarde-1919-${slug}`), 'bilac-tarde-1919-fogo', 'bilac-tarde-1919-remorso', 'bilac-tarde-1919-symphonia']);
});
test('further Bilac sonnets retain complete 1919 readings and disclosed variants', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/bilac-tarde-more-1919.json', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../scripts/sources/bilac-tarde-more-1919.txt', import.meta.url), 'utf8');
  const parts = source.split(/^=== ([a-z]+) ===\n/gm);
  assert.equal(parts.shift(), '');
  const readings = new Map();
  while (parts.length) readings.set(parts.shift(), parts.shift().trim());
  assert.deepEqual(Object.fromEntries(Object.entries(manifest.witnesses).map(([name, witness]) => [name, witness.sha256])), {
    'tarde-1919.pdf': 'cbcfa738725c886436e1a082af32bb5d45bf5e7437fbb1680ff995964d69647e',
    'tarde-hathitrust-1919.djvu': 'c93d501d3d82159efa96f938bfd1df9caabaceed50408b135f14442cfb8e58c3',
  });
  const cases = [
    ['fogo', 'Fogo fatuo', 'Fogo-fátuo', [126, 127], [128, 129], [130, 131], '073cca97ab1bf34890c154f7e71a37d024bb08701b7132283062b26fbc07ba79'],
    ['remorso', 'Remorso', undefined, [130, 131], [130, 131], [134, 135], '82ed6ee9fcd0a84390244af0656cffc014b1f1f86f798b1aa4d531a6c2177bae'],
    ['symphonia', 'Symphonia', 'Sinfonia', [206, 207], [206, 207], [210, 211], 'aa3f1836df15d15e36e70046c6e98d7829a1a136b55a5471a495727bb1ff465e'],
  ];
  assert.deepEqual(manifest.poems.map(item => item.slug), cases.map(([slug]) => slug));
  for (const [index, [slug, title, display, printed, usp, princeton, hash]] of cases.entries()) {
    const item = manifest.poems[index];
    const poem = poems.find(entry => entry.id === `bilac-tarde-1919-${slug}`);
    assert.ok(poem, slug);
    assert.equal(poem.title, title);
    assert.equal(poem.displayTitle, display);
    if (display) assert.equal(poem.displayTitleLang, 'pt');
    assert.equal(poem.author, 'Olavo Bilac');
    assert.equal(poem.authorId, 'olavo-bilac');
    assert.equal(poem.authorYears, '1865–1918');
    assert.deepEqual(associatedPlaces(poem), ['Brazil']);
    assert.equal(poem.language, 'Portuguese');
    assert.equal(poem.lang, 'pt');
    assert.equal(poem.direction, 'ltr');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.match(poem.yearLabel, /Published 1919.*composition date not established/);
    assert.equal(poem.form, 'Sonnet');
    assert.deepEqual(item.printedPages, printed);
    assert.deepEqual(item.uspLeaves, usp);
    assert.deepEqual(item.princetonLeaves, princeton);
    assert.equal(poem.text, readings.get(slug));
    assert.deepEqual(poem.text.split('\n\n').map(stanza => stanza.split('\n').length), [4, 4, 3, 3]);
    assert.equal(lineCount(poem), 14);
    assert.equal(item.textSha256, hash);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(new URL(poem.source).searchParams.get('page'), String(princeton[0]));
    if (slug !== 'remorso') assert.equal(new URL(poem.contextSource).hash, `#page=${usp[0]}`);
    else assert.equal(poem.contextSource, 'https://www.escritas.org/pt/t/4899/remorso');
    assert.match(poem.context, /follows the Princeton\/HathiTrust copy.*checked line by line against the USP copy/);
    assert.match(poem.context, /copies of the same printing, not independent editions/);
    assert.match(poem.context, /Modern transcriptions were comparison aids/);
    assert.match(poem.context, /not a diplomatic edition.*final author-approved text/);
    assert.match(poem.rights, /public domain in the United States.*Commons marks the Princeton scan public domain/);
    assert.match(poem.rights, /USP requests noncommercial use.*not reproduced/);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    for (const query of ['olavo bilac', title, ...(display ? [display] : [])]) {
      assert.ok(filterPoems(poems, { language: 'Portuguese', country: 'Brazil', query }).includes(poem), query);
    }
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  const bySlug = slug => poems.find(poem => poem.id === `bilac-tarde-1919-${slug}`);
  assert.match(bySlug('fogo').text, /^Cabellos brancos![\s\S]*Para querer o que não ha na vida!$/);
  assert.match(bySlug('remorso').text, /suffoquei calando,[\s\S]*Sinto o que esperdicei na juventude;/);
  assert.match(bySlug('remorso').context, /esperdicei.*calando.*desperdicei.*calado.*not independently checked/);
  assert.match(bySlug('remorso').rights, /recantodasletras\.com\.br.*CC BY-NC 2\.5 Brazil/);
  assert.match(bySlug('symphonia').text, /^Meu coração, na incerta adolescencia[\s\S]*Para glorificar tudo que amou na terra!$/);
  assert.ok(filterPoems(poems, { query: 'sinto o que esperdicei na juventude' }).includes(bySlug('remorso')));
  assert.ok(filterPoems(poems, { query: 'voluptuoso adagio em harpas e violinos' }).includes(bySlug('symphonia')));
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
  const inline = { ...sample, textLanguageOverrides: undefined, textLanguageSpans: [{ line: 2, text: '<línea>', lang: 'es' }] };
  assert.ok(renderPoem(inline, poems, '/ai-poems/').includes('Segunda &amp; <span lang="es" dir="auto">&lt;línea&gt;</span>'));
  assert.ok(poemCard(inline, '/').includes('Primeira &amp; &lt;linha&gt; / Segunda &amp; <span lang="es" dir="auto">&lt;línea&gt;</span>'));
  for (const spans of [null, {}, [{ line: 0, text: 'Segunda', lang: 'es' }], [{ line: 3, text: 'Segunda', lang: 'es' }], [{ line: 2, text: 'missing', lang: 'es' }], [{ line: 2, text: '', lang: 'es' }], [{ line: 2, text: 'Segunda', lang: 'es" onclick="x' }], [{ line: 2, text: 'Segunda', lang: 'es' }, { line: 2, text: 'unda', lang: 'es' }]]) {
    assert.throws(() => renderPoem({ ...inline, textLanguageSpans: spans }, poems, '/'), /verse language/i);
  }
  assert.throws(() => renderPoem({ ...inline, text: 'same same', textLanguageSpans: [{ line: 1, text: 'same', lang: 'es' }] }, poems, '/'), /verse language/i);
  assert.throws(() => renderPoem({ ...inline, textLanguageOverrides: [{ line: 2, lang: 'pt' }] }, poems, '/'), /verse language/i);
  const windows = { ...inline, text: 'Alpha\r\nBeta', textLanguageSpans: undefined, textLanguageOverrides: [{ line: 1, lang: 'es' }] };
  assert.ok(renderPoem(windows, poems, '/').includes('<span lang="es" dir="auto">Alpha</span>\r\nBeta'));
  assert.throws(() => renderPoem({ ...windows, textLanguageOverrides: undefined, textLanguageSpans: [{ line: 1, text: 'Alpha\r', lang: 'es' }] }, poems, '/'), /verse language/i);
  const emoji = { ...inline, text: '😀 okay', textLanguageSpans: [{ line: 1, text: '😀', lang: 'es' }] };
  assert.ok(renderPoem(emoji, poems, '/').includes('<span lang="es" dir="auto">😀</span> okay'));
  for (const half of ['\ud83d', '\ude00']) assert.throws(() => renderPoem({ ...emoji, textLanguageSpans: [{ line: 1, text: half, lang: 'es' }] }, poems, '/'), /verse language/i);
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
    assert.deepEqual(poem.translations, poem.id === 'basho-nozarashi-28' ? chamberlainTranslations[poem.id] : []);
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
    assert.deepEqual(poem.translations, ['buson-1926-12', 'buson-1926-13'].includes(poem.id) ? chamberlainTranslations[poem.id] : []);
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
    assert.deepEqual(poem.translations, poem.id === 'chiyo-ni-1927-46' ? chamberlainTranslations[poem.id] : []);
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
  assert.deepEqual(groupPoets(poems).find(group => group.id === 'hafiz-ibrahim').poems.map(poem => poem.id), [hafiz.id, 'hafiz-ibrahim-language-1922', 'hafiz-ibrahim-1922-virtues', 'hafiz-ibrahim-1922-privileges']);
});
test('Ḥāfiẓ Ibrāhīm language poem retains its complete 1922 reading and comparison evidence', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/hafiz-language-1922.json', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../scripts/sources/hafiz-language-1922.txt', import.meta.url), 'utf8');
  const poem = poems.find(entry => entry.id === 'hafiz-ibrahim-language-1922');
  const item = manifest.poem;
  assert.ok(poem);
  assert.equal(poem.title, 'لسان حال اللغة العربية');
  assert.equal(poem.displayTitle, 'اللغة العربية تنعى حظها بين أهلها');
  assert.equal(poem.displayTitleLang, 'ar');
  assert.equal(poem.author, 'Ḥāfiẓ Ibrāhīm');
  assert.equal(poem.authorOriginal, 'حافظ إبراهيم');
  assert.equal(poem.authorYears, 'Born 1871 or 1872; died 1932');
  assert.deepEqual(associatedPlaces(poem), ['Egypt']);
  assert.equal(poem.language, 'Arabic');
  assert.equal(poem.lang, 'ar');
  assert.equal(poem.direction, 'rtl');
  assert.equal(poem.year, null);
  assert.equal(poem.creationPlace, undefined);
  assert.match(poem.yearLabel, /Published by June 1907.*composition date not established/);
  assert.equal(item.titlePagePdfPage, 215);
  assert.deepEqual(item.printedPages, [16, 17, 18, 19]);
  assert.deepEqual(item.pdfPages, [238, 239, 240, 241]);
  assert.deepEqual(item.comparisonPrintedPages, [253, 254, 255]);
  assert.deepEqual(item.comparisonPdfPages, [305, 306, 307]);
  assert.deepEqual(item.magazinePrintedPages, [308, 309]);
  assert.deepEqual(item.magazinePdfPages, [232, 233]);
  assert.deepEqual(Object.fromEntries(Object.entries(manifest.witnesses).map(([name, witness]) => [name, witness.sha256])), {
    'aub_aco003437_lo.pdf': '702e3b145246ac4d085299c9ae42469def4fbcdf5f110e3c898775df2e76e264',
    'collected-125963.pdf': '78d00d3a59fd1314795a08b48334469c9a225de05411b53b423f8218dc757bc3',
    'almanar10.pdf': '0b52e1388d224f0d1b3b5013d7dae3acb17bb0e55709c40947583d170536db40',
  });
  assert.equal(item.couplets, 23);
  assert.equal(source.trim().split('\n').length, 23);
  assert.equal(poem.text, source.trim().replaceAll(' | ', '\n'));
  assert.equal(lineCount(poem), 46);
  assert.equal(createHash('sha256').update(poem.text).digest('hex'), '0b6736582baafc92911f1ff00b0d1c996096cf15aeadb5cedb0a44f2e87d61d2');
  assert.equal(item.textSha256, '0b6736582baafc92911f1ff00b0d1c996096cf15aeadb5cedb0a44f2e87d61d2');
  assert.match(poem.text, /^رجعت لنفسي فاتهمت حصاتي\nوناديت قومي فاحتسبت حياتي/);
  assert.match(poem.text, /عقمت فلم أجزع لقوم عداتي/);
  assert.match(poem.text, /فلا تكلوني للزمان فإني/);
  assert.match(poem.text, /ممات لعمري لم يقس بممات$/);
  assert.equal(poem.source, 'https://aco.dlib.nyu.edu/book/aub_aco003437/238');
  assert.equal(poem.contextSource, 'https://archive.org/download/almanaralmanar/almanar10.pdf#page=232');
  assert.match(poem.context, /لقوم عداتي.*لقول عداتي/);
  assert.match(poem.context, /فإني.*فإنني/);
  assert.match(poem.context, /not establish independent textual descent or completeness in every tradition/);
  assert.match(poem.context, /not a fully vocalized diplomatic edition/);
  assert.match(poem.rights, /public domain in the United States/);
  assert.deepEqual(poem.themes, []);
  assert.deepEqual(poem.translations, []);
  for (const query of ['حافظ إبراهيم', 'Hafiz Ibrahim', 'لسان حال اللغة العربية', 'اللغة العربية تنعى حظها بين أهلها', 'أنا البحر في أحشائه الدر كامن']) {
    assert.ok(filterPoems(poems, { language: 'Arabic', query }).includes(poem), query);
  }
  assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  assert.ok(groupPoets(poems).find(group => group.id === 'hafiz-ibrahim').poems.some(entry => entry.id === poem.id));
});
test('two Ḥāfiẓ Ibrāhīm poems retain complete 1922 readings, joined words and edition variants', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/hafiz-virtues-1922.json', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../scripts/sources/hafiz-virtues-1922.txt', import.meta.url), 'utf8');
  const parts = source.split(/^=== ([a-z]+) ===\n/gm);
  assert.equal(parts.shift(), '');
  const readings = new Map();
  while (parts.length) readings.set(parts.shift(), parts.shift().trim());
  assert.equal(manifest.titlePagePdfPage, 215);
  assert.deepEqual(Object.fromEntries(Object.entries(manifest.witnesses).map(([name, witness]) => [name, witness.sha256])), {
    'aub_aco003437_lo.pdf': '702e3b145246ac4d085299c9ae42469def4fbcdf5f110e3c898775df2e76e264',
    'collected-125963.pdf': '78d00d3a59fd1314795a08b48334469c9a225de05411b53b423f8218dc757bc3',
  });
  const cases = [
    ['virtues', 'الأخلاق الفاضلة', 'سجن الفضائل', 10, [24, 25], [246, 247], [124, 125], [496, 497], '9a6925d9d90d7390045e1cd43b8c27e914ac6356d79cd8fe319fe79371115c39'],
    ['privileges', 'الامتيازات', 'الامتيازات الأجنبية', 18, [27, 28, 29], [249, 250, 251], [110, 111], [482, 483], 'df34b305a1a928c657f8601f6353b9fbc761fe7e6048fc8f6abde338931e536e'],
  ];
  assert.deepEqual(manifest.poems.map(item => item.slug), cases.map(([slug]) => slug));
  for (const [index, [slug, title, display, couplets, printed, pdf, compPrinted, compPdf, hash]] of cases.entries()) {
    const item = manifest.poems[index];
    const poem = poems.find(entry => entry.id === `hafiz-ibrahim-1922-${slug}`);
    assert.ok(poem, slug);
    assert.equal(poem.title, title);
    assert.equal(poem.displayTitle, display);
    assert.equal(poem.displayTitleLang, 'ar');
    assert.equal(poem.author, 'Ḥāfiẓ Ibrāhīm');
    assert.equal(poem.authorOriginal, 'حافظ إبراهيم');
    assert.equal(poem.authorId, 'hafiz-ibrahim');
    assert.equal(poem.authorYears, 'Born 1871 or 1872; died 1932');
    assert.deepEqual(associatedPlaces(poem), ['Egypt']);
    assert.equal(poem.language, 'Arabic');
    assert.equal(poem.lang, 'ar');
    assert.equal(poem.direction, 'rtl');
    assert.equal(poem.year, null);
    assert.equal(poem.creationPlace, undefined);
    assert.match(poem.yearLabel, /Published 1922.*composition date not established/);
    assert.deepEqual(item.printedPages, printed);
    assert.deepEqual(item.pdfPages, pdf);
    assert.deepEqual(item.comparisonPrintedPages, compPrinted);
    assert.deepEqual(item.comparisonPdfPages, compPdf);
    assert.equal(item.couplets, couplets);
    assert.equal(poem.text, readings.get(slug));
    assert.equal(lineCount(poem), couplets);
    assert.equal(item.textSha256, hash);
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(poem.source, `https://aco.dlib.nyu.edu/book/aub_aco003437/${pdf[0]}`);
    assert.equal(new URL(poem.contextSource).hash, `#page=${compPdf[0]}`);
    assert.match(poem.context, /not necessarily in every tradition.*independent textual descent/);
    assert.match(poem.context, /words split across printed lines are rejoined/);
    assert.match(poem.context, /not a fully vocalized diplomatic edition/);
    assert.match(poem.rights, /public domain in the United States/);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    for (const query of ['حافظ إبراهيم', 'Hafiz Ibrahim', title, display]) {
      assert.ok(filterPoems(poems, { language: 'Arabic', query }).includes(poem), query);
    }
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
  }
  const virtues = poems.find(poem => poem.id === 'hafiz-ibrahim-1922-virtues');
  assert.match(virtues.text, /^نعمن بنفسي وأشقينني فيا ليتهن ويا ليتني/);
  assert.match(virtues.text, /بخصب النفوس فرويتهن وأظمأني/);
  assert.match(virtues.text, /فلا تسأليني متى تنقضي ليالي الأسار ولا تحزني$/);
  assert.match(virtues.context, /فرويتهن وأظمأني.*فروينهن وأظمأنني/);
  assert.ok(filterPoems(poems, { query: 'بخصب النفوس فرويتهن' }).includes(virtues));
  const privileges = poems.find(poem => poem.id === 'hafiz-ibrahim-1922-privileges');
  assert.match(privileges.text, /^سكت فأصغروا أدبي وقلت فأكبروا أربي/);
  assert.match(privileges.text, /لهذا الفخر من سباب/);
  assert.match(privileges.text, /فهامت بالعلا شغفا وهمنا بابنة العنب$/);
  assert.match(privileges.context, /من سباب.*من سبب/);
  assert.ok(filterPoems(poems, { query: 'أمة اليابان جازت دارة الشهب' }).includes(privileges));
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
  assert.equal(poems.filter(entry => entry.authorId === 'ahmad-shawqi').length, 5);
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
test('Shawqi historical poems preserve complete school readings, textual variants and date uncertainty', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/sources/shawqi-schools-historical-1927.json', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../scripts/sources/shawqi-schools-historical-1927.txt', import.meta.url), 'utf8');
  const parts = source.split(/^=== ([a-z]+) ===\n/gm);
  assert.equal(parts.shift(), '');
  const readings = new Map();
  while (parts.length) readings.set(parts.shift(), parts.shift().trim());
  const expected = [
    ['anas', [16, 19, 7], '2d6caf2705a237920cc32fdef37a3ba70bc1d83248665f49866c1abe77574726', 'AAlexandrina-137947'],
    ['women', [27, 16], 'c51867b335876a2b7d614c40741459574f7cd31acd98e333e9dc771dd1276e29', 'AAlexandrina-101217'],
  ];
  assert.deepEqual(manifest.poems.map(item => item.slug), expected.map(([slug]) => slug));
  assert.deepEqual(manifest.poems.map(({ printedPages, pdfPages, comparisonPrintedPages, comparisonPdfPages }) => ({
    printedPages, pdfPages, comparisonPrintedPages, comparisonPdfPages,
  })), [
    { printedPages: [33, 34, 35, 36], pdfPages: [18, 19, 20], comparisonPrintedPages: [53, 54, 55, 56, 57, 58], comparisonPdfPages: [55, 56, 57, 58, 59, 60] },
    { printedPages: [58, 59, 60, 61], pdfPages: [31, 32], comparisonPrintedPages: [102, 103, 104, 105], comparisonPdfPages: [126, 127, 128, 129] },
  ]);
  assert.deepEqual(Object.fromEntries(Object.entries(manifest.witnesses).map(([name, item]) => [name, item.sha256])), {
    'schools-1927.pdf': 'd380285b00cbf4512d51f55563bd41187c8ce343990d4b6be882eecc69c98280',
    'correct-137947.pdf': 'c921bb983458ad90eac5cc925132b6ebd31b63c86c64828f6aa4f3e1994e8196',
    'collected-101217.pdf': 'a6c288eb53de1422f6f081bf087d4834a578aab343dad524b5aa523aa64e3b70',
  });
  for (const [slug, sections, hash, comparison] of expected) {
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
    assert.deepEqual(poem.text.split('\n\n').map(section => section.split('\n').length), sections);
    assert.equal(poem.text, readings.get(slug));
    assert.equal(lineCount(poem), sections.reduce((total, n) => total + n, 0));
    assert.equal(createHash('sha256').update(poem.text).digest('hex'), hash);
    assert.equal(item.textSha256, hash);
    assert.match(poem.source, new RegExp(`/1525pdf_201912/.*#page=${item.pdfPages[0]}$`));
    assert.match(poem.contextSource, new RegExp(`/${comparison}/.*#page=${item.comparisonPdfPages[0]}$`));
    assert.match(poem.context, /completeness in these printings, not independent manuscript descent/);
    assert.match(poem.context, /words split across printed half-lines are rejoined/);
    assert.match(poem.context, /not a fully vocalized diplomatic edition/);
    assert.match(poem.rights, /public domain in the United States.*comparison is linked, not reproduced/);
    assert.deepEqual(poem.themes, []);
    assert.deepEqual(poem.translations, []);
    assert.ok(filterPoems(poems, { language: 'Arabic', country: 'Egypt', query: 'أحمد شوقي' }).includes(poem));
    assert.ok(renderPoem(poem, poems, '/ai-poems/').includes(escapeHtml(poem.source)));
    assert.ok(groupPoets(poems).find(group => group.id === 'ahmad-shawqi').poems.some(entry => entry.id === poem.id));
  }
  const anas = poems.find(poem => poem.id === 'shawqi-schools-anas');
  const women = poems.find(poem => poem.id === 'shawqi-schools-women');
  assert.match(anas.text, /^أيها المنتحي بأسوان دارا كالثريا تريد أن تنقضا/);
  assert.match(anas.text, /بالسعد والنحس إلى أن تعاطت النحس محضا/);
  assert.match(anas.text, /شيد والمال والعلوم قليل أنقذوه بالمال والعلم نقضا$/);
  assert.match(anas.context, /1912.*1910.*discrepancy.*unresolved/);
  assert.match(anas.context, /prose dedication absent from the school poem/);
  assert.match(anas.context, /بالسعد والنحس.*بالسعد والنخس/);
  assert.ok(filterPoems(poems, { query: 'نفض الصانع منه اليدين' }).includes(anas));
  assert.match(women.text, /^قم حي هذي النيرات حي الحسان الخيرات/);
  assert.match(women.text, /ولقد عامت بناته لجج العلوم الزاخرات/);
  assert.match(women.text, /ورأين عندهمو الصنائع والفنون مضيعات/);
  assert.match(women.text, /أقبلن يبنين المآثر للنجاح موفقات/);
  assert.match(women.text, /حتى زدن حض المحسنات/);
  assert.match(women.text, /ويرين حتى في الكرى قبل الرجال محرمات$/);
  assert.match(women.context, /1920.*1924.*not independently resolved/);
  assert.match(women.context, /عامت بناته.*علمت بناته.*علت ببناته/);
  assert.ok(filterPoems(poems, { query: 'عندهمو الصنائع والفنون' }).includes(women));
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
  for (const [index, range] of yearRangeCounts(poems).entries()) {
    const button = new RegExp(`data-year-range="${index}"`);
    if (range.count) assert.match(current, button);
    else assert.doesNotMatch(current, button);
  }
  assert.match(current, /data-year-range="3"/); // The 1918 Storni works are discoverable by year.
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
test('Japanese additions preserve sourced edition readings and uncertain dates', () => {
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
    assert.deepEqual(poem.translations, id === 'summer-grass-basho' ? chamberlainTranslations[id] : []);
    assert.ok(poem.source.includes(source));
    assert.ok(poem.contextSource && poem.contextSourceTitle);
    assert.match(poem.rights, /public domain in the United States/i);
    assert.equal(filterPoems([poem], { readable: 'English' }).length, id === 'summer-grass-basho' ? 1 : 0);
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
  const ogura = poems.filter(p => p.id.startsWith('ogura-1900-')).length;
  const yosano = poems.filter(p => p.id === 'recognized-next-yosano-kimi-shinitamau').length;
  assert.equal(filterPoems(poems, { language: 'Japanese', country: 'Japan' }).length, 6 + laterBasho + laterBuson + issa + chiyo + ogura + yosano);
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
