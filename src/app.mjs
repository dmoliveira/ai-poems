import { associatedPlaces, discoveryOrder, escapeHtml as e, filterPoems, poemCard, readingLanguages, surprisePoem } from './catalog.mjs';

const base = document.documentElement.dataset.base;
const key = 'verso-library-v1';
const journeyKey = 'verso-reading-journey-v1';
const defaults = { saved: [], recent: [], theme: 'light', font: 0, typeface: 'literary', language: 'English', preferredLanguage: '', focus: false };
let state;
try {
  const stored = JSON.parse(localStorage.getItem(key) || '{}');
  state = { ...defaults, ...stored, saved: Array.isArray(stored.saved) ? stored.saved.filter(x => typeof x === 'string') : [], recent: Array.isArray(stored.recent) ? stored.recent.filter(x => typeof x === 'string') : [] };
} catch { state = { ...defaults }; }
if (!['light', 'sepia', 'dark'].includes(state.theme)) state.theme = 'light';
state.font = Math.max(-2, Math.min(4, Number(state.font) || 0));
if (!['literary', 'clear'].includes(state.typeface)) state.typeface = 'literary';
state.focus = state.focus === true;
if (!readingLanguages.includes(state.preferredLanguage)) state.preferredLanguage = '';
const notice = document.createElement('div');
notice.className = 'toast';
notice.setAttribute('role', 'status');
document.body.append(notice);
let noticeTimer;
function announce(message) {
  notice.textContent = message;
  notice.classList.add('visible');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.classList.remove('visible'), 4000);
}
function persist() {
  try { localStorage.setItem(key, JSON.stringify(state)); return true; }
  catch { return false; }
}
function applyPreferences() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.verseTypeface = state.typeface;
  document.documentElement.style.setProperty('--verse-scale', String(1 + state.font * 0.1));
  document.querySelectorAll('[data-theme-select]').forEach(select => { select.value = state.theme; });
  document.querySelectorAll('[data-typeface-select]').forEach(select => { select.value = state.typeface; select.disabled = false; select.closest('.typeface-control').hidden = false; });
  document.querySelectorAll('[data-preferred-language]').forEach(select => { select.value = state.preferredLanguage; select.disabled = false; });
  const focus = document.querySelector('#focus-toggle');
  if (focus) {
    document.body.classList.toggle('is-focus', state.focus);
    focus.hidden = false;
    focus.querySelector('.focus-label').textContent = state.focus ? 'Exit focus mode' : 'Focus mode';
  }
}
applyPreferences();
document.querySelector('#focus-toggle')?.addEventListener('click', () => {
  state.focus = !state.focus; applyPreferences();
  const durable = persist();
  announce(durable ? (state.focus ? 'Focus mode on.' : 'Focus mode off.') : 'Focus preference is available for this visit only; browser storage is unavailable.');
});
document.querySelectorAll('[data-theme-select]').forEach(select => select.addEventListener('change', () => {
  state.theme = select.value; applyPreferences();
  if (!persist()) announce('Your preference is available for this visit only; browser storage is unavailable.');
}));
document.querySelectorAll('[data-typeface-select]').forEach(select => select.addEventListener('change', () => {
  state.typeface = ['literary', 'clear'].includes(select.value) ? select.value : 'literary';
  applyPreferences();
  if (!persist()) announce('Typeface is available for this visit only; browser storage is unavailable.');
}));
document.querySelectorAll('[data-preferred-language]').forEach(select => select.addEventListener('change', () => {
  const previousLanguage = state.preferredLanguage;
  state.preferredLanguage = readingLanguages.includes(select.value) ? select.value : '';
  if (state.preferredLanguage) state.language = state.preferredLanguage;
  applyPreferences();
  if (!persist()) announce('Language preference is available for this visit only; browser storage is unavailable.');
  document.dispatchEvent(new CustomEvent('verso:preferred-language', { detail: { previousLanguage } }));
}));
document.querySelectorAll('[data-font]').forEach(button => button.addEventListener('click', () => {
  state.font = Math.max(-2, Math.min(4, state.font + (button.dataset.font === 'up' ? 1 : -1)));
  applyPreferences();
  if (!persist()) announce('Text size is available for this visit only; browser storage is unavailable.');
}));

let poems = [];
function updateSaveButtons() {
  document.querySelectorAll('[data-save]').forEach(button => {
    const saved = state.saved.includes(button.dataset.save);
    button.setAttribute('aria-pressed', String(saved));
    const isReader = button.classList.contains('reader-save');
    if (isReader) button.textContent = saved ? '♥  Saved to your shelf' : '♡  Save poem';
    else { button.textContent = saved ? '♥' : '♡'; button.setAttribute('aria-label', `${saved ? 'Remove from' : 'Save to'} shelf: ${poems.find(p => p.id === button.dataset.save)?.displayTitle || poems.find(p => p.id === button.dataset.save)?.title || 'poem'}`); }
  });
  document.querySelectorAll('[data-shelf-count]').forEach(count => { count.textContent = state.saved.length ? String(state.saved.length) : ''; });
  const shelf = document.querySelector('#shelf-items');
  if (shelf) {
    const saved = state.saved.map(id => poems.find(p => p.id === id)).filter(Boolean);
    shelf.innerHTML = saved.length ? saved.map(p => `<a href="${e(base)}poems/${e(p.id)}/"><span>♡</span><span><strong>${e(p.displayTitle || p.title)}</strong><small>${e(p.author)}</small></span><span>↗</span></a>`).join('') : '<p>Your saved poems will appear here. Tap ♡ on a poem to keep it close.</p>';
  }
  const recent = document.querySelector('#recent-items');
  if (recent) {
    const read = state.recent.map(id => poems.find(p => p.id === id)).filter(Boolean);
    recent.innerHTML = read.length ? read.map(p => `<a href="${e(base)}poems/${e(p.id)}/"><span>◷</span><span><strong>${e(p.displayTitle || p.title)}</strong><small>${e(p.author)}</small></span><span>↗</span></a>`).join('') : '<p>Your recently read poems will appear here.</p>';
  }
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-save]');
  if (!button) return;
  const id = button.dataset.save;
  const saved = state.saved.includes(id);
  state.saved = saved ? state.saved.filter(item => item !== id) : [...state.saved, id];
  const durable = persist(); updateSaveButtons();
  announce(durable ? (saved ? 'Removed from your shelf.' : 'Saved to your shelf.') : 'Browser storage is unavailable; this change lasts only for this visit.');
});
document.querySelector('#clear-shelf')?.addEventListener('click', () => {
  state.saved = []; const durable = persist(); updateSaveButtons();
  const control = document.querySelector('#clear-shelf').closest('details'); control.open = false; control.querySelector('summary').focus();
  announce(durable ? 'Your saved poems were cleared on this device.' : 'Shelf cleared for this visit; browser storage is unavailable.');
});
document.querySelector('#clear-history')?.addEventListener('click', () => {
  state.recent = []; const durable = persist(); updateSaveButtons();
  const control = document.querySelector('#clear-history').closest('details'); control.open = false; control.querySelector('summary').focus();
  announce(durable ? 'Your reading history was cleared on this device.' : 'History cleared for this visit; browser storage is unavailable.');
});

try {
  if (document.body.dataset.poemId) {
    poems = JSON.parse(document.querySelector('#reader-data').textContent);
  } else {
    const response = await fetch(`${base}data/catalog.json`);
    if (!response.ok) throw new Error(`Catalogue request returned ${response.status}`);
    poems = await response.json();
  }
  updateSaveButtons();
  if (document.querySelector('#results')) setupExplore();
  if (document.body.dataset.poemId) setupReader();
} catch (error) {
  const count = document.querySelector('#result-count');
  if (count) count.textContent = 'The library could not load. Please try refreshing, or use the complete index below.';
  console.error('Could not load Verso catalogue:', error);
}

function setupExplore() {
  const results = document.querySelector('#results');
  const count = document.querySelector('#result-count');
  const more = document.querySelector('#show-more');
  const surprise = document.querySelector('#surprise-poem');
  const copySearchLink = document.querySelector('#copy-search-link');
  const preferredFilter = document.querySelector('#preferred-filter');
  const readableNote = document.querySelector('#readable-note');
  const drawer = document.querySelector('#filter-drawer');
  const summary = document.querySelector('#filter-summary');
  const chips = document.querySelector('#active-filters');
  const fields = Object.fromEntries(['author', 'theme', 'form', 'length', 'language', 'translation', 'readable', 'country', 'collection', 'from', 'to'].map(name => [name, document.querySelector(`#filter-${name}`)]));
  const search = document.querySelector('#search');
  const sort = document.querySelector('#sort');
  let limit = 12;
  let filtered = [];
  const filterLabels = { author: 'Poet', theme: 'Theme', form: 'Form', length: 'Length', language: 'Language', translation: 'Translation', readable: 'Available in', country: 'Country or region', collection: 'Collection', from: 'From', to: 'To' };
  for (const name of ['author', 'theme', 'form', 'language', 'translation', 'country', 'collection']) {
    const values = [...new Set(poems.flatMap(p => name === 'theme' ? p.themes : name === 'translation' ? p.translations.map(t => t.language) : name === 'country' ? associatedPlaces(p) : [p[name]]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    fields[name].insertAdjacentHTML('beforeend', values.map(value => `<option value="${e(value)}">${e(value)}</option>`).join(''));
  }
  function restoreURL() {
    const params = new URL(location.href).searchParams;
    search.value = params.get('q') || '';
    for (const [name, input] of Object.entries(fields)) input.value = params.get(name) || '';
    sort.value = params.get('sort') || 'featured';
    if (!sort.value) sort.value = 'featured';
    limit = 12;
  }
  function updateURL() {
    const url = new URL(location.href);
    const values = { q: search.value.trim(), ...Object.fromEntries(Object.entries(fields).map(([name, input]) => [name, input.value])), sort: sort.value === 'featured' ? '' : sort.value };
    for (const [name, value] of Object.entries(values)) {
      if (value) url.searchParams.set(name, value);
      else url.searchParams.delete(name);
    }
    history.replaceState(history.state, '', url);
  }
  function render() {
    const filters = Object.fromEntries(Object.entries(fields).map(([name, input]) => [name, input.value]));
    filters.query = search.value;
    filtered = filterPoems(poems, filters);
    if (sort.value === 'title') filtered = filtered.toSorted((a, b) => (a.displayTitle || a.title).localeCompare(b.displayTitle || b.title));
    if (sort.value === 'author') filtered = filtered.toSorted((a, b) => a.author.localeCompare(b.author) || a.title.localeCompare(b.title));
    if (sort.value === 'year') filtered = filtered.toSorted((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity));
    if (sort.value === 'featured') filtered = discoveryOrder(filtered);
    count.textContent = `${filtered.length} ${filtered.length === 1 ? 'poem' : 'poems'} found`;
    const active = Object.values(fields).filter(input => input.value).length;
    summary.textContent = active ? `Filters (${active} active)` : 'Filters';
    chips.hidden = active === 0;
    chips.innerHTML = Object.entries(fields).filter(([, input]) => input.value).map(([name, input]) => {
      const label = input.tagName === 'SELECT' ? input.selectedOptions[0].textContent : input.value;
      return `<button type="button" data-clear-filter="${e(name)}" aria-label="Remove ${e(filterLabels[name])}: ${e(label)} filter">${e(filterLabels[name])}: ${e(label)} <span aria-hidden="true">×</span></button>`;
    }).join('');
    surprise.disabled = !filtered.length;
    preferredFilter.hidden = !state.preferredLanguage;
    preferredFilter.textContent = `Show poems available in ${state.preferredLanguage}`;
    preferredFilter.setAttribute('aria-pressed', String(Boolean(state.preferredLanguage && fields.readable.value === state.preferredLanguage)));
    readableNote.hidden = !fields.readable.value;
    results.innerHTML = filtered.length ? filtered.slice(0, limit).map(p => poemCard(p, base)).join('') : '<div class="empty-state"><span>❧</span><h3>No poems found just yet.</h3><p>Try a different word or clear a filter. There’s plenty more to discover.</p></div>';
    more.hidden = filtered.length <= limit;
    updateSaveButtons();
  }
  function rememberJourney() {
    try {
      sessionStorage.setItem(journeyKey, JSON.stringify({ search: location.search, items: filtered.map(p => ({ id: p.id, title: p.displayTitle || p.title })) }));
    } catch { /* Reading still works when browser storage is unavailable. */ }
  }
  [...Object.values(fields), search, sort].forEach(input => input.addEventListener('input', () => { limit = 12; updateURL(); render(); }));
  document.querySelector('#search-form').addEventListener('submit', event => { event.preventDefault(); limit = 12; updateURL(); render(); });
  document.querySelector('#clear-filters').addEventListener('click', () => { Object.values(fields).forEach(input => { input.value = ''; }); search.value = ''; sort.value = 'featured'; limit = 12; updateURL(); render(); });
  more.addEventListener('click', () => { limit += 12; render(); });
  results.addEventListener('click', event => {
    if (event.target.closest('a.poem-card-link')) rememberJourney();
  });
  preferredFilter.addEventListener('click', () => {
    fields.readable.value = fields.readable.value === state.preferredLanguage ? '' : state.preferredLanguage;
    limit = 12; updateURL(); render();
  });
  document.addEventListener('verso:preferred-language', event => {
    if (event.detail.previousLanguage && fields.readable.value === event.detail.previousLanguage) {
      fields.readable.value = state.preferredLanguage; limit = 12; updateURL();
    }
    render();
  });
  chips.addEventListener('click', event => {
    const button = event.target.closest('[data-clear-filter]');
    if (!button || !fields[button.dataset.clearFilter]) return;
    fields[button.dataset.clearFilter].value = '';
    limit = 12; updateURL(); render(); summary.focus();
  });
  surprise.addEventListener('click', () => {
    const poem = surprisePoem(filtered);
    if (poem) { rememberJourney(); location.assign(`${base}poems/${encodeURIComponent(poem.id)}/`); }
  });
  copySearchLink.disabled = false;
  copySearchLink.addEventListener('click', async () => {
    const url = new URL(location.href);
    url.hash = 'explore';
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url.href);
      announce('Search link copied.');
    } catch {
      announce('Could not copy the link. You can copy the address from your browser.');
    }
  });
  window.addEventListener('popstate', () => { restoreURL(); updateURL(); render(); });
  if (window.matchMedia('(max-width: 700px)').matches) drawer.open = false;
  restoreURL();
  updateURL();
  render();
}

function setupReader() {
  const poem = poems.find(p => p.id === document.body.dataset.poemId);
  if (!poem) return;
  try {
    const previous = new URL(document.referrer);
    const home = new URL(base, location.href);
    if (previous.origin === home.origin && previous.pathname === home.pathname) {
      document.querySelector('[data-back-to-library]').href = `${base}${previous.search}#explore`;
    }
    const journey = JSON.parse(sessionStorage.getItem(journeyKey) || 'null');
    const valid = journey && typeof journey.search === 'string' && (!journey.search || journey.search.startsWith('?')) && !journey.search.includes('#') && journey.search.length <= 4096 && Array.isArray(journey.items) && journey.items.length <= 10000 && journey.items.every(item => item && typeof item.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) && typeof item.title === 'string' && item.title.length <= 500);
    if (valid && previous.origin === home.origin) {
      const fromHome = previous.pathname === home.pathname && previous.search === journey.search;
      const fromJourney = journey.items.some(item => previous.pathname === `${home.pathname}poems/${item.id}/`);
      const index = journey.items.findIndex(item => item.id === poem.id);
      if (index >= 0 && (fromHome || fromJourney)) {
        const back = `${base}${journey.search}#explore`;
        document.querySelector('[data-back-to-library]').href = back;
        document.querySelector('[data-journey-back]').href = back;
        document.querySelector('#journey-position').textContent = `Poem ${index + 1} of ${journey.items.length} in your search`;
        for (const [selector, item] of [['[data-journey-previous]', journey.items[index - 1]], ['[data-journey-next]', journey.items[index + 1]]]) {
          if (!item) continue;
          const link = document.querySelector(selector);
          link.href = `${base}poems/${encodeURIComponent(item.id)}/`;
          link.querySelector('strong').textContent = item.title;
          link.hidden = false;
        }
        document.querySelector('#reading-journey').hidden = false;
      }
    }
  } catch { /* Direct visits fall back to the unfiltered library. */ }
  state.recent = [poem.id, ...state.recent.filter(id => id !== poem.id)].slice(0, 20); persist();
  const selector = document.querySelector('#translation-select');
  const original = document.querySelector('#original-panel');
  const translation = document.querySelector('#translation-panel');
  const columns = document.querySelector('#poem-columns');
  const buttons = [...document.querySelectorAll('[data-view]')];
  const preferredNote = document.querySelector('#preferred-note');
  let view = 'original';
  if (selector) {
    const preferred = poem.translations.findIndex(t => t.language === state.language);
    if (preferred >= 0) selector.value = String(preferred);
  }
  const languages = { English: 'en', Spanish: 'es', Portuguese: 'pt', French: 'fr', Italian: 'it', Chinese: 'zh', Japanese: 'ja', Arabic: 'ar' };
  function renderTranslation() {
    const item = selector && poem.translations[Number(selector.value)];
    if (!item) return;
    const lang = languages[item.language] || 'und';
    translation.innerHTML = `<span class="language-pill">TRANSLATION · ${e(item.language.toUpperCase())}</span><h2 lang="${e(lang)}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">${e(item.title)}</h2><p class="translation-credit">${e(item.translator)}</p><p class="verse" lang="${e(lang)}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">${e(item.text)}</p><p class="translation-rights">${e(item.rights)} <a href="${e(item.source)}" target="_blank" rel="noopener noreferrer">Source ↗</a></p>`;
  }
  function renderView() {
    original.hidden = view === 'translation';
    translation.hidden = view === 'original';
    columns.classList.toggle('side-by-side', view === 'both');
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
    if (view !== 'original') renderTranslation();
  }
  function applyPreferredLanguage() {
    preferredNote.hidden = true;
    const language = state.preferredLanguage;
    if (!language) return;
    const index = poem.translations.findIndex(t => t.language === language);
    if (poem.language === language) view = 'original';
    else if (index >= 0 && selector) { selector.value = String(index); view = 'both'; }
    else {
      view = 'original';
      preferredNote.textContent = `No ${language} translation is available. ${poem.translations.length ? 'Choose the original or another available translation.' : 'The original remains available.'}`;
      preferredNote.hidden = false;
    }
    renderView();
  }
  selector?.addEventListener('change', () => {
    state.language = poem.translations[Number(selector.value)]?.language || 'English';
    if (!persist()) announce('Translation choice is available for this visit only; browser storage is unavailable.');
    if (view === 'original') view = 'translation';
    renderView();
  });
  buttons.forEach(button => button.addEventListener('click', () => { view = button.dataset.view; renderView(); }));
  document.addEventListener('verso:preferred-language', applyPreferredLanguage);
  applyPreferredLanguage();
}
