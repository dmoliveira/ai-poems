export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
export const normalize = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();
// Finnish and Swedish distinguish letters that accent folding would conflate.
export const normalizeNordic = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase();
export const normalizeFinnish = normalizeNordic;
export const readingLanguages = ['English', 'Spanish', 'Portuguese', 'French', 'Italian', 'German', 'Finnish', 'Swedish', 'Greek', 'Russian', 'Ukrainian', 'Polish', 'Bengali', 'Hindi', 'Persian', 'Chinese', 'Japanese', 'Arabic'];
// Discovery labels can be welcoming without rewriting historical source titles.
export const collectionLabel = value => value === 'The Book of American Negro Poetry' ? 'American poetry · 1922 anthology' : value;

// Display titles are normally English, but some are modern spellings in the
// original language. Explicit metadata keeps both kinds accessible.
export function titleAttributes(poem) {
  if (poem.displayTitle) return poem.displayTitleLang ? ` lang="${escapeHtml(poem.displayTitleLang)}" dir="auto"` : '';
  return ` lang="${escapeHtml(poem.titleLang || poem.lang)}" dir="${escapeHtml(poem.direction)}"`;
}

// Catalogue records are immutable after loading. Index each record only when
// a text query first needs it, rather than normalizing every poem on each key.
const searchIndex = new WeakMap();
function searchableText(poem) {
  if (!searchIndex.has(poem)) {
    const original = [poem.title, poem.displayTitle, poem.author, poem.authorOriginal, poem.country, poem.era, poem.form, poem.collection, poem.language, poem.text, ...poem.themes, ...(poem.searchAliases || []), ...(poem.authorAliases || [])];
    if (['Finnish', 'Swedish'].includes(poem.language)) {
      searchIndex.set(poem, {
        original: normalizeNordic(original.join(' ')),
        translations: poem.translations.map(t => ({
          sameLanguage: t.language === poem.language,
          text: (t.language === poem.language ? normalizeNordic : normalize)([t.language, t.title, t.text].join(' ')),
        })),
      });
    } else {
      // Keep the existing single index and matching behavior for older records.
      searchIndex.set(poem, normalize([...original, ...poem.translations.flatMap(t => [t.language, t.title, t.text])].join(' ')));
    }
  }
  return searchIndex.get(poem);
}

// A source can name multiple associated places. Do not infer nationalities or
// creation locations beyond the places already recorded on the poem.
export function associatedPlaces(poem) {
  return [...new Set(String(poem.country || '').split(/\s+\/\s+/).map(place => place.trim()).filter(Boolean))];
}

export function placeCounts(poems) {
  const counts = new Map();
  for (const poem of poems) for (const place of associatedPlaces(poem)) counts.set(place, (counts.get(place) || 0) + 1);
  return [...counts].map(([place, count]) => ({ place, count })).toSorted((a, b) => b.count - a.count || a.place.localeCompare(b.place));
}

// Count nonblank lines as transcribed, not visual wrapping or reading time.
export function lineCount(poem) {
  return poem.text.split(/\r?\n/).filter(line => line.trim()).length;
}

export function filterPoems(poems, filters = {}) {
  const query = normalize(filters.query).trim();
  const nordicQuery = normalizeNordic(filters.query).trim();
  return poems.filter(poem => {
    for (const key of ['author', 'language', 'form', 'collection']) if (filters[key] && poem[key] !== filters[key]) return false;
    if (filters.country && poem.country !== filters.country && !associatedPlaces(poem).includes(filters.country)) return false;
    if (filters.theme && !poem.themes.includes(filters.theme)) return false;
    if (filters.translation && !poem.translations.some(item => item.language === filters.translation)) return false;
    if (filters.readable && poem.language !== filters.readable && !poem.translations.some(item => item.language === filters.readable)) return false;
    if (filters.length) {
      const lines = lineCount(poem);
      if (filters.length === '1-4' && lines > 4) return false;
      if (filters.length === '5-14' && (lines < 5 || lines > 14)) return false;
      if (filters.length === '15-plus' && lines < 15) return false;
    }
    if (filters.from && (poem.year == null || poem.year < Number(filters.from))) return false;
    if (filters.to && (poem.year == null || poem.year > Number(filters.to))) return false;
    if (query) {
      const index = searchableText(poem);
      if (['Finnish', 'Swedish'].includes(poem.language)) {
        if (!index.original.includes(nordicQuery) && !index.translations.some(t => t.text.includes(t.sameLanguage ? nordicQuery : query))) return false;
      } else if (!index.includes(query)) return false;
    }
    return true;
  });
}

export const recordedYearRanges = [
  { label: 'Before 1700', from: '', to: '1699' },
  { label: '1700–1799', from: '1700', to: '1799' },
  { label: '1800–1899', from: '1800', to: '1899' },
  { label: '1900–1999', from: '1900', to: '1999' },
  { label: '2000 onward', from: '2000', to: '' },
];

// Compare ranges against the other filters, not against the current year bounds.
export function yearRangeCounts(poems, filters = {}) {
  const matches = filterPoems(poems, { ...filters, from: '', to: '' });
  return recordedYearRanges.map(range => ({ ...range, count: filterPoems(matches, { from: range.from, to: range.to }).length }));
}

export const countedFilters = ['author', 'language', 'readable', 'country', 'collection', 'form', 'length', 'theme', 'translation'];

// Each option is counted against all other active filters, not its own.
export function contextualCounts(poems, filters = {}) {
  return Object.fromEntries(countedFilters.map(name => {
    const matches = filterPoems(poems, { ...filters, [name]: '' });
    const counts = new Map([['', matches.length]]);
    for (const poem of matches) {
      let values;
      if (name === 'country') values = associatedPlaces(poem);
      else if (name === 'theme') values = poem.themes;
      else if (name === 'translation') values = poem.translations.map(translation => translation.language);
      else if (name === 'readable') values = [poem.language, ...poem.translations.map(translation => translation.language)];
      else if (name === 'length') {
        const lines = lineCount(poem);
        values = [lines <= 4 ? '1-4' : lines <= 14 ? '5-14' : '15-plus'];
      } else values = [poem[name]];
      for (const value of new Set(values.filter(Boolean))) counts.set(value, (counts.get(value) || 0) + 1);
    }
    return [name, counts];
  }));
}

// Rotate through languages and then through poets, so a large single-author
// collection does not crowd the first page. Preserve order within each poet.
export function discoveryOrder(poems) {
  const languages = new Map();
  for (const poem of poems) {
    if (!languages.has(poem.language)) languages.set(poem.language, new Map());
    const authors = languages.get(poem.language);
    if (!authors.has(poem.authorId)) authors.set(poem.authorId, []);
    authors.get(poem.authorId).push(poem);
  }
  const queues = [...languages.values()].map(authors => [...authors.values()]);
  const ordered = [];
  while (queues.some(queue => queue.length)) {
    for (const queue of queues) {
      if (!queue.length) continue;
      const author = queue.shift();
      ordered.push(author.shift());
      if (author.length) queue.push(author);
    }
  }
  return ordered;
}

// Choose a poet first so one prolific writer does not dominate the surprise.
export function surprisePoem(poems, random = Math.random) {
  if (!poems.length) return null;
  const authors = new Map();
  for (const poem of poems) {
    if (!authors.has(poem.authorId)) authors.set(poem.authorId, []);
    authors.get(poem.authorId).push(poem);
  }
  const groups = [...authors.values()];
  const group = groups[Math.floor(random() * groups.length)];
  return group[Math.floor(random() * group.length)];
}

// The original text stays unmodified; each inline passage must match exactly
// once on its line and cannot overlap another language override.
export function verseLine(line, language, spans = []) {
  const e = escapeHtml;
  if (language && spans.length) throw new Error('Overlapping verse language overrides');
  if (language) {
    const content = line.endsWith('\r') ? line.slice(0, -1) : line;
    return `<span lang="${e(language)}" dir="auto">${e(content)}</span>${line.endsWith('\r') ? '\r' : ''}`;
  }
  const splitsSurrogatePair = index => index > 0 && index < line.length
    && line.charCodeAt(index - 1) >= 0xD800 && line.charCodeAt(index - 1) <= 0xDBFF
    && line.charCodeAt(index) >= 0xDC00 && line.charCodeAt(index) <= 0xDFFF;
  const matches = spans.map(span => {
    if (typeof span.text !== 'string' || !span.text || /[\r\n]/.test(span.text) || !span.lang) throw new Error('Invalid verse language span');
    const start = line.indexOf(span.text);
    if (start < 0 || line.indexOf(span.text, start + 1) !== -1) throw new Error('Ambiguous verse language span');
    const end = start + span.text.length;
    if (splitsSurrogatePair(start) || splitsSurrogatePair(end)) throw new Error('Invalid verse language span boundary');
    return { ...span, start, end };
  }).toSorted((a, b) => a.start - b.start);
  let cursor = 0;
  let html = '';
  for (const span of matches) {
    if (span.start < cursor) throw new Error('Overlapping verse language spans');
    html += `${e(line.slice(cursor, span.start))}<span lang="${e(span.lang)}" dir="auto">${e(span.text)}</span>`;
    cursor = span.end;
  }
  return html + e(line.slice(cursor));
}

export function poemCard(poem, base, reason = '') {
  const e = escapeHtml;
  const wholeLines = Array.isArray(poem.textLanguageOverrides) ? poem.textLanguageOverrides : [];
  const spans = Array.isArray(poem.textLanguageSpans) ? poem.textLanguageSpans : [];
  const linesWithLanguages = [...wholeLines, ...spans].some(item => item?.line === 1 || item?.line === 2);
  const excerpt = linesWithLanguages
    ? poem.text.split('\n').filter(line => line.trim()).slice(0, 2).map((line, index) => verseLine(line, wholeLines.find(item => item?.line === index + 1)?.lang, spans.filter(item => item?.line === index + 1))).join(' / ')
    : e(poem.text.split('\n').filter(Boolean).slice(0, 2).join(' / '));
  const lines = lineCount(poem);
  const multilingualTitle = !poem.displayTitle && poem.titleLang;
  const saveContents = multilingualTitle ? `<span data-save-icon aria-hidden="true">♡</span><span class="sr-only"><span data-save-action>Save to shelf: </span><span${titleAttributes(poem)}>${e(poem.title)}</span></span>` : '♡';
  const saveLabel = multilingualTitle ? '' : ` aria-label="Save ${e(poem.displayTitle || poem.title)}"`;
  return `<article class="poem-card tone-${e(poem.mood)}"><div class="poem-card-top"><span class="eyebrow">${e(poem.language)} · ${e(poem.form)} · ${lines} ${lines === 1 ? 'line' : 'lines'}</span><button class="save-button js-required" type="button" data-save="${e(poem.id)}"${saveLabel} aria-pressed="false" disabled>${saveContents}</button></div><a class="poem-card-link" href="${e(base)}poems/${e(poem.id)}/">${reason ? `<p class="card-reason">${e(reason)}</p>` : ''}<h3${titleAttributes(poem)}>${e(poem.displayTitle || poem.title)}</h3>${poem.displayTitle ? `<p class="original-title" lang="${e(poem.titleLang || poem.lang)}" dir="${e(poem.direction)}">${e(poem.title)}</p>` : ''}<p class="card-author">${e(poem.author)} <span>·</span> ${e(poem.yearLabel)}</p><p class="card-excerpt" lang="${e(poem.lang)}" dir="${e(poem.direction)}">${excerpt}</p><span class="card-read">Read poem <span aria-hidden="true">↗</span></span></a></article>`;
}
