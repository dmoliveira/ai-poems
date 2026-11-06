export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
export const normalize = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();

// Catalogue records are immutable after loading. Index each record only when
// a text query first needs it, rather than normalizing every poem on each key.
const searchIndex = new WeakMap();
function searchableText(poem) {
  if (!searchIndex.has(poem)) {
    searchIndex.set(poem, normalize([poem.title, poem.displayTitle, poem.author, poem.authorOriginal, poem.country, poem.era, poem.form, poem.collection, poem.language, poem.text, ...poem.themes, ...poem.translations.flatMap(t => [t.language, t.title, t.text])].join(' ')));
  }
  return searchIndex.get(poem);
}

export function filterPoems(poems, filters = {}) {
  const query = normalize(filters.query).trim();
  return poems.filter(poem => {
    for (const key of ['author', 'language', 'country', 'form']) if (filters[key] && poem[key] !== filters[key]) return false;
    if (filters.theme && !poem.themes.includes(filters.theme)) return false;
    if (filters.translation && !poem.translations.some(item => item.language === filters.translation)) return false;
    if (filters.from && (poem.year == null || poem.year < Number(filters.from))) return false;
    if (filters.to && (poem.year == null || poem.year > Number(filters.to))) return false;
    if (query && !searchableText(poem).includes(query)) return false;
    return true;
  });
}

export function poemCard(poem, base) {
  const e = escapeHtml;
  const excerpt = poem.text.split('\n').filter(Boolean).slice(0, 2).join(' / ');
  return `<article class="poem-card tone-${e(poem.mood)}"><div class="poem-card-top"><span class="eyebrow">${e(poem.language)} · ${e(poem.form)}</span><button class="save-button" type="button" data-save="${e(poem.id)}" aria-label="Save ${e(poem.displayTitle || poem.title)}" aria-pressed="false">♡</button></div><a class="poem-card-link" href="${e(base)}poems/${e(poem.id)}/"><h3>${e(poem.displayTitle || poem.title)}</h3>${poem.displayTitle ? `<p class="original-title" lang="${e(poem.lang)}" dir="${e(poem.direction)}">${e(poem.title)}</p>` : ''}<p class="card-author">${e(poem.author)} <span>·</span> ${e(poem.yearLabel)}</p><p class="card-excerpt" lang="${e(poem.lang)}" dir="${e(poem.direction)}">${e(excerpt)}</p><span class="card-read">Read poem <span aria-hidden="true">↗</span></span></a></article>`;
}
