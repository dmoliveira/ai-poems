import { escapeHtml as e, filterPoems, poemCard } from './catalog.mjs';

const base = document.documentElement.dataset.base;
const key = 'verso-library-v1';
const defaults = { saved: [], recent: [], theme: 'light', font: 0, language: 'English' };
let state;
try {
  const stored = JSON.parse(localStorage.getItem(key) || '{}');
  state = { ...defaults, ...stored, saved: Array.isArray(stored.saved) ? stored.saved.filter(x => typeof x === 'string') : [], recent: Array.isArray(stored.recent) ? stored.recent.filter(x => typeof x === 'string') : [] };
} catch { state = { ...defaults }; }
if (!['light', 'sepia', 'dark'].includes(state.theme)) state.theme = 'light';
state.font = Math.max(-2, Math.min(4, Number(state.font) || 0));
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
  document.documentElement.style.setProperty('--verse-scale', String(1 + state.font * 0.1));
  document.querySelectorAll('[data-theme-select]').forEach(select => { select.value = state.theme; });
}
applyPreferences();
document.querySelectorAll('[data-theme-select]').forEach(select => select.addEventListener('change', () => {
  state.theme = select.value; applyPreferences();
  if (!persist()) announce('Your preference is available for this visit only; browser storage is unavailable.');
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
  announce(durable ? 'Your saved poems were cleared on this device.' : 'Shelf cleared for this visit; browser storage is unavailable.');
});
document.querySelector('#clear-history')?.addEventListener('click', () => {
  state.recent = []; const durable = persist(); updateSaveButtons();
  announce(durable ? 'Your reading history was cleared on this device.' : 'History cleared for this visit; browser storage is unavailable.');
});

try {
  const response = await fetch(`${base}data/catalog.json`);
  if (!response.ok) throw new Error(`Catalogue request returned ${response.status}`);
  poems = await response.json();
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
  const fields = Object.fromEntries(['author', 'theme', 'form', 'language', 'translation', 'country', 'from', 'to'].map(name => [name, document.querySelector(`#filter-${name}`)]));
  const search = document.querySelector('#search');
  const sort = document.querySelector('#sort');
  let limit = 12;
  for (const name of ['author', 'theme', 'form', 'language', 'translation', 'country']) {
    const values = [...new Set(poems.flatMap(p => name === 'theme' ? p.themes : name === 'translation' ? p.translations.map(t => t.language) : [p[name]]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    fields[name].insertAdjacentHTML('beforeend', values.map(value => `<option value="${e(value)}">${e(value)}</option>`).join(''));
  }
  function render() {
    const filters = Object.fromEntries(Object.entries(fields).map(([name, input]) => [name, input.value]));
    filters.query = search.value;
    let filtered = filterPoems(poems, filters);
    if (sort.value === 'title') filtered = filtered.toSorted((a, b) => (a.displayTitle || a.title).localeCompare(b.displayTitle || b.title));
    if (sort.value === 'author') filtered = filtered.toSorted((a, b) => a.author.localeCompare(b.author) || a.title.localeCompare(b.title));
    if (sort.value === 'year') filtered = filtered.toSorted((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity));
    count.textContent = `${filtered.length} ${filtered.length === 1 ? 'poem' : 'poems'} found`;
    results.innerHTML = filtered.length ? filtered.slice(0, limit).map(p => poemCard(p, base)).join('') : '<div class="empty-state"><span>❧</span><h3>No poems found just yet.</h3><p>Try a different word or clear a filter. There’s plenty more to discover.</p></div>';
    more.hidden = filtered.length <= limit;
    updateSaveButtons();
  }
  [...Object.values(fields), search, sort].forEach(input => input.addEventListener('input', () => { limit = 12; render(); }));
  document.querySelector('#search-form').addEventListener('submit', event => { event.preventDefault(); limit = 12; render(); });
  document.querySelector('#clear-filters').addEventListener('click', () => { Object.values(fields).forEach(input => { input.value = ''; }); search.value = ''; sort.value = 'featured'; limit = 12; render(); });
  more.addEventListener('click', () => { limit += 12; render(); });
  document.querySelectorAll('button.collection-card[data-theme]').forEach(button => button.addEventListener('click', () => {
    Object.values(fields).forEach(input => { input.value = ''; }); search.value = ''; fields.theme.value = button.dataset.theme; limit = 12; render();
    document.querySelector('#explore').scrollIntoView({ behavior: 'smooth' });
  }));
  document.querySelectorAll('[data-author]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault(); Object.values(fields).forEach(input => { input.value = ''; }); search.value = ''; fields.author.value = link.dataset.author; limit = 12; render();
    document.querySelector('#explore').scrollIntoView({ behavior: 'smooth' });
  }));
  render();
}

function setupReader() {
  const poem = poems.find(p => p.id === document.body.dataset.poemId);
  if (!poem) return;
  state.recent = [poem.id, ...state.recent.filter(id => id !== poem.id)].slice(0, 20); persist();
  const selector = document.querySelector('#translation-select');
  const original = document.querySelector('#original-panel');
  const translation = document.querySelector('#translation-panel');
  const columns = document.querySelector('#poem-columns');
  const buttons = [...document.querySelectorAll('[data-view]')];
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
  selector?.addEventListener('change', () => {
    state.language = poem.translations[Number(selector.value)]?.language || 'English';
    if (!persist()) announce('Language preference is available for this visit only; browser storage is unavailable.');
    if (view === 'original') view = 'translation';
    renderView();
  });
  buttons.forEach(button => button.addEventListener('click', () => { view = button.dataset.view; renderView(); }));
}
