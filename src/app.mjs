import { associatedPlaces, collectionLabel, contextualCounts, countedFilters, discoveryOrder, escapeHtml as e, filterPoems, normalize, poemCard, readingLanguages, recordedYearRanges, surprisePoem, yearRangeCounts } from './catalog.mjs';

const base = document.documentElement.dataset.base;
const key = 'verso-library-v1';
const journeyKey = 'verso-reading-journey-v1';
const defaults = { saved: [], recent: [], theme: 'light', font: 0, typeface: 'literary', language: 'English', preferredLanguage: '', focus: false };
function validJourney(journey) {
  return journey && typeof journey.search === 'string' && (!journey.search || journey.search.startsWith('?')) && !journey.search.includes('#') && journey.search.length <= 4096 && Array.isArray(journey.items) && journey.items.length <= 10000 && journey.items.every(item => item && typeof item.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) && typeof item.title === 'string' && item.title.length <= 500);
}
let state;
let storageFailure = '';
function readState() {
  const raw = localStorage.getItem(key);
  const stored = raw === null ? {} : JSON.parse(raw);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) throw new Error('Invalid saved state');
  const valid = (name, check) => !Object.hasOwn(stored, name) || check(stored[name]);
  const validList = value => Array.isArray(value) && value.every(item => typeof item === 'string');
  if (!valid('saved', validList) || !valid('recent', validList)
    || !valid('theme', value => ['light', 'sepia', 'dark'].includes(value))
    || !valid('font', value => typeof value === 'number' && Number.isFinite(value) && value >= -2 && value <= 4)
    || !valid('typeface', value => ['literary', 'clear'].includes(value))
    || !valid('language', value => typeof value === 'string')
    || !valid('preferredLanguage', value => value === '' || readingLanguages.includes(value))
    || !valid('focus', value => typeof value === 'boolean')
    || !valid('_versoRevision', value => Number.isSafeInteger(value) && value >= 0)) throw new Error('Invalid saved state');
  return { ...defaults, ...stored, saved: stored.saved ? [...stored.saved] : [], recent: stored.recent ? [...stored.recent] : [] };
}
try { state = readState(); }
catch { storageFailure = 'read'; state = { ...defaults }; }
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
function temporaryNotice() {
  if (storageFailure === 'lock') return 'This browser cannot safely coordinate saved data across tabs. Unsaved changes on this page are temporary and are lost when you leave or reload.';
  return storageFailure === 'read'
    ? 'Saved data could not be read. This page will not overwrite it. The shelf shown here is temporary; changes are lost when you leave or reload.'
    : 'Browser storage could not be updated. The shelf shown here may differ from stored data; unsaved changes are lost when you leave or reload.';
}
const storageWarning = document.createElement('p');
storageWarning.className = 'storage-warning';
storageWarning.hidden = true;
document.querySelector('main').prepend(storageWarning);
const shelfWarning = document.createElement('p');
shelfWarning.className = 'storage-warning shelf-storage-warning';
shelfWarning.hidden = true;
document.querySelector('#shelf-items')?.before(shelfWarning);
function showStorageWarning() {
  for (const warning of [storageWarning, shelfWarning]) {
    warning.textContent = temporaryNotice();
    warning.hidden = false;
  }
}
let pendingChanges = [];
// Replay local intents over the newest committed state until each write finishes.
function replayChanges(current) {
  for (const entry of pendingChanges) entry.change(current);
  return current;
}
function adoptState(current) {
  const previous = state;
  state = current;
  applyPreferences();
  if (JSON.stringify(previous.saved) !== JSON.stringify(state.saved) || JSON.stringify(previous.recent) !== JSON.stringify(state.recent)) updateSaveButtons();
  if (previous.preferredLanguage !== state.preferredLanguage) document.dispatchEvent(new CustomEvent('verso:preferred-language', { detail: { previousLanguage: previous.preferredLanguage } }));
}
function announceResult(result, message) {
  if (result === true && pendingChanges.some(entry => !entry.silent)) return;
  announce(message);
}
async function persist(change, { silent = false, expectedRevision } = {}) {
  change(state);
  if (storageFailure) return false;
  const entry = { change, silent };
  pendingChanges.push(entry);
  if (!silent) announce('Saving changes…');
  let working;
  let timeout;
  try {
    if (!navigator.locks?.request) throw new Error('Browser locks unavailable');
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 4000);
    return await navigator.locks.request(key, { signal: controller.signal }, () => {
      if (storageFailure) return false;
      try { working = readState(); }
      catch { storageFailure = 'read'; pendingChanges = []; showStorageWarning(); return false; }
      // A clear must be reconfirmed if anything changed after the reader saw it.
      if (expectedRevision !== undefined && (working._versoRevision ?? 0) !== expectedRevision) {
        pendingChanges = pendingChanges.filter(item => item !== entry);
        adoptState(replayChanges(working));
        return 'conflict';
      }
      change(working);
      if ((working._versoRevision ?? 0) === Number.MAX_SAFE_INTEGER) {
        storageFailure = 'lock'; pendingChanges = []; showStorageWarning(); return false;
      }
      working._versoRevision = (working._versoRevision ?? 0) + 1;
      try { localStorage.setItem(key, JSON.stringify(working)); }
      catch {
        storageFailure = 'write';
        pendingChanges = pendingChanges.filter(item => item !== entry);
        adoptState(replayChanges(working));
        pendingChanges = [];
        showStorageWarning();
        return false;
      }
      pendingChanges = pendingChanges.filter(item => item !== entry);
      adoptState(replayChanges(working));
      return true;
    });
  } catch {
    storageFailure = 'lock'; showStorageWarning();
    pendingChanges = [];
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
window.addEventListener('beforeunload', event => {
  if (pendingChanges.some(entry => !entry.silent)) { event.preventDefault(); event.returnValue = ''; }
});
function applyPreferences() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.verseTypeface = state.typeface;
  document.documentElement.style.setProperty('--verse-scale', String(1 + state.font * 0.1));
  document.querySelectorAll('[data-theme-select]').forEach(select => { select.value = state.theme; select.disabled = false; });
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
if (storageFailure) { showStorageWarning(); announce(temporaryNotice()); }
document.querySelector('#focus-toggle')?.addEventListener('click', async () => {
  const focus = !state.focus;
  const result = persist(current => { current.focus = focus; });
  applyPreferences();
  const durable = await result;
  const message = state.focus ? 'Focus mode on.' : 'Focus mode off.';
  announceResult(durable, durable ? message : `${message} ${temporaryNotice()}`);
});
document.querySelectorAll('[data-theme-select]').forEach(select => select.addEventListener('change', async () => {
  const theme = select.value;
  const result = persist(current => { current.theme = theme; });
  applyPreferences();
  const durable = await result;
  announceResult(durable, durable ? 'Theme saved.' : `Theme changed on this page. ${temporaryNotice()}`);
}));
document.querySelectorAll('[data-typeface-select]').forEach(select => select.addEventListener('change', async () => {
  const typeface = ['literary', 'clear'].includes(select.value) ? select.value : 'literary';
  const result = persist(current => { current.typeface = typeface; });
  applyPreferences();
  const durable = await result;
  announceResult(durable, durable ? 'Typeface saved.' : `Typeface changed on this page. ${temporaryNotice()}`);
}));
document.querySelectorAll('[data-preferred-language]').forEach(select => select.addEventListener('change', async () => {
  const previousLanguage = state.preferredLanguage;
  const language = readingLanguages.includes(select.value) ? select.value : '';
  const result = persist(current => { current.preferredLanguage = language; if (language) current.language = language; });
  applyPreferences();
  document.dispatchEvent(new CustomEvent('verso:preferred-language', { detail: { previousLanguage } }));
  const durable = await result;
  announceResult(durable, durable ? 'Language preference saved.' : `Language preference changed on this page. ${temporaryNotice()}`);
}));
document.querySelectorAll('[data-font]').forEach(button => button.addEventListener('click', async () => {
  const amount = button.dataset.font === 'up' ? 1 : -1;
  const result = persist(current => { current.font = Math.max(-2, Math.min(4, current.font + amount)); });
  applyPreferences();
  const durable = await result;
  announceResult(durable, durable ? 'Text size saved.' : `Text size changed on this page. ${temporaryNotice()}`);
}));
document.querySelectorAll('[data-font]').forEach(button => { button.disabled = false; });

let poems = [];
let catalogueFailed = false;
function unavailableShelfItems(ids, type) {
  const label = type === 'saved' ? 'Saved poems' : 'Reading history';
  const note = `<p class="shelf-unavailable-note">${label} could not be loaded because the library is unavailable. This does not remove stored data. Refresh the page to try again.</p>`;
  const index = type === 'saved' ? '<a href="#complete-index" data-open-index><span aria-hidden="true">☷</span><span><strong>Browse the complete index</strong><small>Available without the interactive library</small></span><span aria-hidden="true">↗</span></a>' : '';
  if (storageFailure === 'read') return note + index;
  const valid = ids.filter(id => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id));
  const explanation = valid.length ? '<p class="shelf-unavailable-note">Titles are unavailable; these links use poem IDs.</p>' : '';
  const links = valid.map(id => `<a href="${e(base)}poems/${e(id)}/"><span aria-hidden="true">↗</span><span><strong>${e(id)}</strong><small>Poem ID</small></span></a>`).join('');
  const omitted = valid.length < ids.length ? '<p class="shelf-unavailable-note">Some stored IDs cannot be displayed as links.</p>' : '';
  return note + index + explanation + links + omitted;
}
function updateSaveButtons() {
  document.querySelectorAll('[data-save]').forEach(button => {
    button.disabled = false;
    const saved = state.saved.includes(button.dataset.save);
    button.setAttribute('aria-pressed', String(saved));
    const isReader = button.classList.contains('reader-save');
    if (isReader) button.textContent = saved ? '♥  Saved to your shelf' : '♡  Save poem';
    else { button.textContent = saved ? '♥' : '♡'; button.setAttribute('aria-label', `${saved ? 'Remove from' : 'Save to'} shelf: ${poems.find(p => p.id === button.dataset.save)?.displayTitle || poems.find(p => p.id === button.dataset.save)?.title || 'poem'}`); }
  });
  document.querySelectorAll('[data-shelf-count]').forEach(count => { count.textContent = state.saved.length ? String(state.saved.length) : ''; });
  const shelf = document.querySelector('#shelf-items');
  if (shelf) {
    const saved = catalogueFailed ? [] : state.saved.map(id => poems.find(p => p.id === id)).filter(Boolean);
    const items = catalogueFailed ? unavailableShelfItems(state.saved, 'saved') : saved.length ? saved.map(p => `<a href="${e(base)}poems/${e(p.id)}/"><span>♡</span><span><strong>${e(p.displayTitle || p.title)}</strong><small>${e(p.author)}</small></span><span>↗</span></a>`).join('') : storageFailure === 'read' ? '' : '<p>Your saved poems will appear here. Tap ♡ on a poem to keep it close.</p>';
    if (shelf.innerHTML !== items) shelf.innerHTML = items;
  }
  const recent = document.querySelector('#recent-items');
  if (recent) {
    const read = catalogueFailed ? [] : state.recent.map(id => poems.find(p => p.id === id)).filter(Boolean);
    const items = catalogueFailed ? unavailableShelfItems(state.recent, 'recent') : read.length ? read.map(p => `<a href="${e(base)}poems/${e(p.id)}/"><span>◷</span><span><strong>${e(p.displayTitle || p.title)}</strong><small>${e(p.author)}</small></span><span>↗</span></a>`).join('') : storageFailure === 'read' ? '<p>Reading history could not be read from browser storage.</p>' : '<p>Your recently read poems will appear here.</p>';
    if (recent.innerHTML !== items) recent.innerHTML = items;
  }
}
if (storageFailure === 'read') updateSaveButtons();
document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !event.target.closest('[data-open-index]')) return;
  const index = document.querySelector('#complete-index');
  if (index) {
    event.preventDefault();
    index.open = true;
    if (location.hash !== '#complete-index') history.pushState(history.state, '', '#complete-index');
    index.querySelector('summary').focus();
  }
});
function clearConflict(control, message) {
  const warning = document.createElement('p');
  warning.className = 'clear-conflict';
  warning.textContent = message;
  control.querySelector('button').before(warning);
  control.open = true;
}
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-save]');
  if (!button) return;
  const id = button.dataset.save;
  const saved = state.saved.includes(id);
  const result = persist(current => { current.saved = saved ? current.saved.filter(item => item !== id) : current.saved.includes(id) ? current.saved : [...current.saved, id]; });
  updateSaveButtons();
  const durable = await result;
  announceResult(durable, durable ? (saved ? 'Removed from your shelf.' : 'Saved to your shelf.') : `${saved ? 'Removed from' : 'Added to'} the shelf on this page only. ${temporaryNotice()}`);
});
document.querySelector('#clear-shelf')?.addEventListener('click', async () => {
  const control = document.querySelector('#clear-shelf').closest('details');
  control.querySelector('.clear-conflict')?.remove();
  const confirmed = new Set(state.saved);
  const expectedRevision = state._versoRevision ?? 0;
  const result = persist(current => { current.saved = current.saved.filter(id => !confirmed.has(id)); }, { expectedRevision });
  updateSaveButtons();
  control.open = false; control.querySelector('summary').focus();
  const durable = await result;
  const message = durable === 'conflict' ? 'Saved data changed while you were confirming. Review your shelf and confirm again.' : durable ? 'Saved poems present at confirmation were cleared.' : `Shelf cleared on this page only. ${temporaryNotice()}`;
  if (durable === 'conflict') clearConflict(control, message);
  announceResult(durable, message);
});
document.querySelector('#clear-history')?.addEventListener('click', async () => {
  const control = document.querySelector('#clear-history').closest('details');
  control.querySelector('.clear-conflict')?.remove();
  const confirmed = new Set(state.recent);
  const expectedRevision = state._versoRevision ?? 0;
  const result = persist(current => { current.recent = current.recent.filter(id => !confirmed.has(id)); }, { expectedRevision });
  updateSaveButtons();
  control.open = false; control.querySelector('summary').focus();
  const durable = await result;
  const message = durable === 'conflict' ? 'Saved data changed while you were confirming. Review your history and confirm again.' : durable ? 'Reading history present at confirmation was cleared.' : `Reading history cleared on this page only. ${temporaryNotice()}`;
  if (durable === 'conflict') clearConflict(control, message);
  announceResult(durable, message);
});
document.querySelectorAll('#clear-shelf, #clear-history').forEach(button => { button.disabled = false; });

window.addEventListener('storage', event => {
  if (storageFailure || (event.key !== key && event.key !== null)) return;
  try {
    if (event.storageArea !== localStorage) return;
    const previous = state;
    adoptState(replayChanges(readState()));
    if (JSON.stringify(previous.saved) !== JSON.stringify(state.saved) && !pendingChanges.some(entry => !entry.silent)) announce('Your shelf was updated in another tab.');
  } catch {
    storageFailure = 'read'; pendingChanges = []; showStorageWarning(); announce(temporaryNotice());
  }
});

// The pre-rendered directory remains usable even if the catalogue cannot load.
function setupPoetDirectory() {
  const finder = document.querySelector('#poet-finder');
  if (!finder) return;
  const input = finder.querySelector('#poet-query');
  const clear = finder.querySelector('#clear-poet-query');
  const status = finder.querySelector('#poet-count');
  const list = document.querySelector('#poet-list');
  const entries = [...list.querySelectorAll('[data-author]')].map(link => ({
    link,
    names: normalize([link.dataset.author, ...[...link.querySelectorAll('[data-poet-original]')].map(name => name.textContent)].join(' ')),
  }));
  function render(resetScroll = false) {
    const query = normalize(input.value).trim();
    let count = 0;
    for (const entry of entries) {
      const matches = !query || entry.names.includes(query);
      entry.link.hidden = !matches;
      if (matches) count++;
    }
    clear.disabled = !input.value;
    status.textContent = query ? `${count} ${count === 1 ? 'match' : 'matches'}${count ? '.' : '. Try another name.'}` : 'Showing all names and voices.';
    if (resetScroll) list.scrollTop = 0;
  }
  input.addEventListener('input', () => render(true));
  clear.addEventListener('click', () => { input.value = ''; render(true); input.focus(); });
  window.addEventListener('pageshow', () => render());
  render();
  finder.hidden = false;
}
setupPoetDirectory();

try {
  if (document.body.dataset.poemId) {
    poems = JSON.parse(document.querySelector('#reader-data').textContent);
  } else if (!document.body.dataset.poetId) {
    const response = await fetch(`${base}data/catalog.json`);
    if (!response.ok) throw new Error(`Catalogue request returned ${response.status}`);
    poems = await response.json();
  }
  updateSaveButtons();
  if (document.querySelector('#results')) setupExplore();
  if (document.body.dataset.poemId) setupReader();
} catch (error) {
  const count = document.querySelector('#result-count');
  if (count) {
    count.textContent = 'The library could not load. Please try refreshing, or use the complete index below.';
    catalogueFailed = true; poems = []; updateSaveButtons();
  }
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
  const advanced = document.querySelector('#advanced-filters');
  const summary = document.querySelector('#filter-summary');
  const chips = document.querySelector('#active-filters');
  const fields = Object.fromEntries(['author', 'theme', 'form', 'length', 'language', 'translation', 'readable', 'country', 'collection', 'from', 'to'].map(name => [name, document.querySelector(`#filter-${name}`)]));
  const yearRanges = document.querySelector('#year-ranges');
  const yearButtons = [...document.querySelectorAll('[data-year-range]')];
  const search = document.querySelector('#search');
  const sort = document.querySelector('#sort');
  const pageSize = 8;
  let limit = pageSize;
  let filtered = [];
  const filterLabels = { author: 'Poet', theme: 'Theme', form: 'Form', length: 'Length', language: 'Language', translation: 'Translation', readable: 'Available in', country: 'Country or region', collection: 'Collection', from: 'From', to: 'To' };
  for (const name of ['author', 'theme', 'form', 'language', 'translation', 'country', 'collection']) {
    const values = [...new Set(poems.flatMap(p => name === 'theme' ? p.themes : name === 'translation' ? p.translations.map(t => t.language) : name === 'country' ? associatedPlaces(p) : [p[name]]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    fields[name].insertAdjacentHTML('beforeend', values.map(value => `<option value="${e(value)}">${e(name === 'collection' ? collectionLabel(value) : value)}</option>`).join(''));
  }
  const availableLanguages = [...new Set([...readingLanguages, ...poems.flatMap(poem => [poem.language, ...poem.translations.map(translation => translation.language)])].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  fields.readable.insertAdjacentHTML('beforeend', availableLanguages.map(value => `<option value="${e(value)}">${e(value)}</option>`).join(''));
  for (const name of countedFilters) for (const option of fields[name].options) option.dataset.label = option.textContent;
  let countedSignature;
  function restoreURL() {
    const params = new URL(location.href).searchParams;
    search.value = params.get('q') || '';
    const readable = params.get('readable') || '';
    if (readable && ![...fields.readable.options].some(option => option.value === readable)) {
      const option = new Option(readable, readable);
      option.dataset.label = readable;
      fields.readable.add(option);
    }
    for (const [name, input] of Object.entries(fields)) input.value = params.get(name) || '';
    if (['collection', 'form', 'length', 'theme', 'translation', 'from', 'to'].some(name => fields[name].value)) advanced.open = true;
    sort.value = params.get('sort') || 'featured';
    if (!sort.value) sort.value = 'featured';
    limit = pageSize;
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
    const signature = JSON.stringify(filters);
    if (signature !== countedSignature) {
      const counts = contextualCounts(poems, filters);
      for (const name of countedFilters) for (const option of fields[name].options) {
        option.textContent = `${option.dataset.label} (${(counts[name].get(option.value) || 0).toLocaleString('en-US')})`;
      }
      if (yearButtons.length) {
        const ranges = yearRangeCounts(poems, filters);
        for (const button of yearButtons) {
          const count = ranges[Number(button.dataset.yearRange)].count;
          button.disabled = !count;
          button.querySelector('small').textContent = `${count.toLocaleString('en-US')} ${count === 1 ? 'poem' : 'poems'}`;
        }
      }
      countedSignature = signature;
    }
    if (sort.value === 'title') filtered = filtered.toSorted((a, b) => (a.displayTitle || a.title).localeCompare(b.displayTitle || b.title));
    if (sort.value === 'author') filtered = filtered.toSorted((a, b) => a.author.localeCompare(b.author) || a.title.localeCompare(b.title));
    if (sort.value === 'year') filtered = filtered.toSorted((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity));
    if (sort.value === 'featured') filtered = discoveryOrder(filtered);
    count.textContent = `${filtered.length} ${filtered.length === 1 ? 'poem' : 'poems'} found`;
    const active = Object.values(fields).filter(input => input.value).length;
    summary.textContent = active ? `Filters (${active} active)` : 'Filters';
    chips.hidden = active === 0;
    chips.innerHTML = Object.entries(fields).filter(([, input]) => input.value).map(([name, input]) => {
      const label = input.tagName === 'SELECT' ? input.selectedOptions[0].dataset.label : input.value;
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
  function rememberJourney(id, source = 'results') {
    try {
      const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2) || '0'}`;
      sessionStorage.setItem(journeyKey, JSON.stringify({ search: location.search, items: filtered.map(p => ({ id: p.id, title: p.displayTitle || p.title })), limit, entryId: id, entryPending: true, source, token }));
      if (history.state === null || (typeof history.state === 'object' && !Array.isArray(history.state))) history.replaceState({ ...history.state, versoJourney: token }, '', location.href);
    } catch { /* Reading still works when browser storage is unavailable. */ }
  }
  function restoreJourney(fromHistory = false) {
    try {
      const journey = JSON.parse(sessionStorage.getItem(journeyKey) || 'null');
      if (!validJourney(journey) || journey.search !== location.search || !Number.isSafeInteger(journey.limit) || journey.limit < pageSize || journey.limit > 10000 || typeof journey.token !== 'string' || journey.token.length > 80 || !/^[a-z0-9]+-[a-z0-9]+$/.test(journey.token) || typeof journey.resumeId !== 'string') return;
      const home = new URL(base, location.href);
      const readerPath = `${home.pathname}poems/${journey.resumeId}/`;
      const previous = document.referrer ? new URL(document.referrer) : null;
      const fromReader = location.hash === '#explore' && previous?.origin === home.origin && previous.pathname === readerPath;
      const historyMatch = fromHistory && history.state?.versoJourney === journey.token;
      if (!fromReader && !historyMatch) return;
      const position = filtered.findIndex(poem => poem.id === journey.resumeId);
      if (position < 0 || !journey.items.some(item => item.id === journey.resumeId)) return;
      if (journey.source === 'surprise' && position >= journey.limit) {
        limit = Math.min(filtered.length, journey.limit);
        render();
        surprise.focus({ preventScroll: true });
        surprise.scrollIntoView({ behavior: 'instant', block: 'center' });
        announce('Your results are restored; the surprise poem is beyond the loaded results.');
        return;
      }
      limit = Math.min(filtered.length, Math.max(journey.limit, Math.ceil((position + 1) / pageSize) * pageSize));
      render();
      const link = [...results.querySelectorAll('a.poem-card-link')].find(item => new URL(item.href).pathname === readerPath);
      if (link) { link.focus({ preventScroll: true }); link.scrollIntoView({ behavior: 'instant', block: 'center' }); }
    } catch { /* A missing or invalid journey leaves the normal results intact. */ }
  }
  [...Object.values(fields), search, sort].forEach(input => input.addEventListener('input', () => { limit = pageSize; updateURL(); render(); }));
  function revealYearRanges({ focus = false, scroll = false } = {}) {
    if (!yearRanges) return;
    drawer.open = true;
    advanced.open = true;
    if (focus) yearRanges.focus({ preventScroll: true });
    if (scroll) yearRanges.scrollIntoView({ behavior: 'instant', block: 'start' });
  }
  function restoreYearFragment() {
    if (location.hash === '#year-ranges') revealYearRanges({ scroll: true });
  }
  function restoreIndexFragment() {
    if (!location.hash.startsWith('#index-original-')) return;
    try {
      const group = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      const index = document.querySelector('#complete-index');
      if (!group?.classList.contains('index-group') || !index?.contains(group)) return;
      index.open = true;
      group.scrollIntoView({ behavior: 'instant', block: 'start' });
    } catch { /* An invalid fragment leaves normal browsing intact. */ }
  }
  document.querySelector('.year-range-entry')?.addEventListener('click', () => revealYearRanges({ focus: true }));
  yearButtons.forEach(button => button.addEventListener('click', () => {
    const range = recordedYearRanges[Number(button.dataset.yearRange)];
    if (!range) return;
    fields.from.value = range.from;
    fields.to.value = range.to;
    limit = pageSize; updateURL(); render();
  }));
  document.querySelector('#search-form').addEventListener('submit', event => { event.preventDefault(); limit = pageSize; updateURL(); render(); });
  document.querySelector('#clear-filters').addEventListener('click', () => { Object.values(fields).forEach(input => { input.value = ''; }); search.value = ''; sort.value = 'featured'; limit = pageSize; updateURL(); render(); });
  more.addEventListener('click', () => { limit += pageSize; render(); });
  results.addEventListener('click', event => {
    const link = event.target.closest('a.poem-card-link');
    const path = link && new URL(link.href).pathname;
    const prefix = `${new URL(base, location.href).pathname}poems/`;
    const poem = link && filtered.find(item => path === `${prefix}${item.id}/`);
    if (poem) rememberJourney(poem.id);
  });
  preferredFilter.addEventListener('click', () => {
    fields.readable.value = fields.readable.value === state.preferredLanguage ? '' : state.preferredLanguage;
    limit = pageSize; updateURL(); render();
  });
  document.addEventListener('verso:preferred-language', event => {
    if (event.detail.previousLanguage && fields.readable.value === event.detail.previousLanguage) {
      fields.readable.value = state.preferredLanguage; limit = pageSize; updateURL();
    }
    render();
  });
  chips.addEventListener('click', event => {
    const button = event.target.closest('[data-clear-filter]');
    if (!button || !fields[button.dataset.clearFilter]) return;
    fields[button.dataset.clearFilter].value = '';
    limit = pageSize; updateURL(); render(); summary.focus();
  });
  surprise.addEventListener('click', () => {
    const poem = surprisePoem(filtered);
    if (poem) { rememberJourney(poem.id, 'surprise'); location.assign(`${base}poems/${encodeURIComponent(poem.id)}/`); }
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
  window.addEventListener('popstate', () => { restoreURL(); updateURL(); render(); restoreYearFragment(); });
  window.addEventListener('hashchange', restoreYearFragment);
  if (window.matchMedia('(max-width: 700px)').matches) drawer.open = false;
  [...Object.values(fields), search, sort, document.querySelector('#clear-filters'), document.querySelector('#search-form button[type="submit"]')].forEach(input => { input.disabled = false; });
  document.querySelectorAll('[data-explore-only]').forEach(element => { element.hidden = false; });
  restoreURL();
  updateURL();
  render();
  restoreYearFragment();
  restoreIndexFragment();
  restoreJourney(performance.getEntriesByType('navigation')[0]?.type === 'back_forward');
  window.addEventListener('pageshow', event => { if (event.persisted) restoreJourney(true); });
}

function setupReader() {
  const poem = poems.find(p => p.id === document.body.dataset.poemId);
  if (!poem) return;
  try {
    const previous = document.referrer ? new URL(document.referrer) : null;
    const home = new URL(base, location.href);
    if (previous?.origin === home.origin && previous.pathname === home.pathname) {
      document.querySelector('[data-back-to-library]').href = `${base}${previous.search}#explore`;
    }
    const journey = JSON.parse(sessionStorage.getItem(journeyKey) || 'null');
    let matched = false;
    if (validJourney(journey) && previous?.origin === home.origin) {
      const tracked = typeof journey.token === 'string' && journey.token;
      const resumedReader = tracked && history.state?.versoReaderToken === journey.token && history.state?.versoReaderId === poem.id;
      const fromHome = previous.pathname === home.pathname && previous.search === journey.search && (!tracked || (journey.entryPending === true && journey.entryId === poem.id) || resumedReader);
      const fromJourney = tracked ? typeof journey.resumeId === 'string' && journey.items.some(item => item.id === journey.resumeId) && previous.pathname === `${home.pathname}poems/${journey.resumeId}/` : journey.items.some(item => previous.pathname === `${home.pathname}poems/${item.id}/`);
      const index = journey.items.findIndex(item => item.id === poem.id);
      if (index >= 0 && (fromHome || fromJourney)) {
        matched = true;
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
    if (validJourney(journey)) {
      if (matched) {
        journey.resumeId = poem.id;
        journey.entryPending = false;
        if (journey.token && (history.state === null || (typeof history.state === 'object' && !Array.isArray(history.state)))) history.replaceState({ ...history.state, versoReaderToken: journey.token, versoReaderId: poem.id }, '', location.href);
      }
      else delete journey.resumeId;
      sessionStorage.setItem(journeyKey, JSON.stringify(journey));
      if (matched) window.addEventListener('pageshow', event => {
        if (!event.persisted) return;
        try {
          const current = JSON.parse(sessionStorage.getItem(journeyKey) || 'null');
          if (validJourney(current) && current.token === journey.token && current.items.some(item => item.id === poem.id)) {
            current.resumeId = poem.id;
            sessionStorage.setItem(journeyKey, JSON.stringify(current));
          }
        } catch { /* A restored reader remains usable without a journey. */ }
      });
    }
  } catch { /* Direct visits fall back to the unfiltered library. */ }
  persist(current => { current.recent = [poem.id, ...current.recent.filter(id => id !== poem.id)].slice(0, 20); }, { silent: true }).then(durable => { if (!durable) announce(temporaryNotice()); });
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
  selector?.addEventListener('change', async () => {
    const language = poem.translations[Number(selector.value)]?.language || 'English';
    const result = persist(current => { current.language = language; });
    if (view === 'original') view = 'translation';
    renderView();
    const durable = await result;
    announceResult(durable, durable ? 'Translation choice saved.' : `Translation choice changed on this page. ${temporaryNotice()}`);
  });
  buttons.forEach(button => button.addEventListener('click', () => { view = button.dataset.view; renderView(); }));
  document.addEventListener('verso:preferred-language', applyPreferredLanguage);
  applyPreferredLanguage();
  buttons.forEach(button => { button.disabled = false; });
  if (selector) selector.disabled = false;
  const translationIndex = document.querySelector('#translations');
  if (translationIndex) translationIndex.open = false;
  document.querySelector('#static-reading-note').hidden = true;
}
