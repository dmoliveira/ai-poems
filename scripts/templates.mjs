import { associatedPlaces, collectionLabel, escapeHtml as e, filterPoems, lineCount, normalize, placeCounts, poemCard, readingLanguages } from '../src/catalog.mjs';
import { groupPoets } from './poets.mjs';
import { relatedPoems } from './recommendations.mjs';

const SITE = 'https://dmoliveira.github.io/ai-poems/';
const description = 'Read classic poetry in its original language, discover poets and literary history, and explore translations, themes, places and time.';
const absolute = path => new URL(path, SITE).href;
const jsonForHtml = object => JSON.stringify(object).replaceAll('<', '\\u003c');
const themeOptions = '<option value="light">☼ Light</option><option value="sepia">◐ Sepia</option><option value="dark">☾ Dark</option>';
const languageOptions = `<option value="">No preference</option>${readingLanguages.map(language => `<option value="${e(language)}">${e(language)}</option>`).join('')}`;

function head({ title, description: desc = description, path = '', base, schema }) {
  const url = absolute(path);
  return `<!doctype html><html lang="en" data-base="${e(base)}"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${e(title)}</title><meta name="description" content="${e(desc)}"><meta name="robots" content="index,follow,max-image-preview:large">
    <link rel="canonical" href="${e(url)}"><meta property="og:type" content="${path ? 'article' : 'website'}">
    <meta property="og:site_name" content="Verso Poetry Library"><meta property="og:title" content="${e(title)}">
    <meta property="og:description" content="${e(desc)}"><meta property="og:url" content="${e(url)}">
    <meta property="og:image" content="${e(absolute('assets/verso-garden.png'))}"><meta name="twitter:card" content="summary_large_image">
    <meta name="theme-color" content="#f8f5ed"><link rel="icon" href="${e(base)}assets/favicon.svg" type="image/svg+xml">
    <link rel="alternate" type="application/rss+xml" title="Verso poetry updates" href="${e(base)}feed.xml">
    <link rel="stylesheet" href="${e(base)}style.css"><noscript><style>.js-required{display:none!important}.explore-layout{display:block}.reading-path-links,.shelf-section{grid-template-columns:1fr}</style></noscript><script type="application/ld+json">${jsonForHtml(schema)}</script>
    <script type="module" src="${e(base)}app.mjs"></script></head>`;
}

function header(base) {
  return `<a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header"><div class="nav-inner">
    <a class="brand" href="${e(base)}" aria-label="Verso home"><span class="brand-mark" aria-hidden="true">❦</span>verso<span class="brand-dot">.</span></a>
    <nav class="main-nav" aria-label="Main navigation"><a href="${e(base)}#explore">Explore</a><a href="${e(base)}#collections">Collections</a><a href="${e(base)}#countries">Countries</a><a href="${e(base)}#poets">Poets</a><a href="${e(base)}#shelf">My shelf <span class="shelf-count" data-shelf-count></span></a></nav>
    <div class="nav-actions"><a class="icon-link" href="${e(base)}#explore" aria-label="Search poems"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg></a>
      <label class="preferred-label js-required"><span aria-hidden="true">Read</span><select data-preferred-language aria-label="Preferred reading language" disabled>${languageOptions}</select></label>
      <label class="theme-label js-required"><span class="sr-only">Reading theme</span><select data-theme-select aria-label="Reading theme" disabled>${themeOptions}</select></label>
      <a class="support-link" href="https://buy.stripe.com/8x200i8bSgVe3Vl3g8bfO00" target="_blank" rel="noopener noreferrer">Support us <span aria-hidden="true">♡</span></a>
    </div>
  </div></header>`;
}

function footer(base) {
  return `<footer class="site-footer"><div class="footer-inner">
    <div><a class="brand footer-brand" href="${e(base)}"><span class="brand-mark" aria-hidden="true">❦</span>verso<span class="brand-dot">.</span></a><p>A little room for words that stay with us.</p></div>
    <div><strong>Explore</strong><a href="${e(base)}#explore">The poetry library</a><a href="${e(base)}#collections">Collections</a><a href="${e(base)}#shelf">Your shelf</a><a href="${e(base)}feed.xml">RSS updates ↗</a></div>
    <div><strong>From the same maker</strong><a href="https://dmoliveira.github.io/master-philosophers/">Master Philosophers ↗</a><a href="https://dmoliveira.github.io/learn-spanish-immersion/">Learn Spanish Immersion ↗</a><a href="https://github.com/dmoliveira/ai-poems">Our open-source repository ↗</a></div>
    <div><strong>A note from us</strong><p>Free to read, made with care. Saved poems and preferences stay on this device.</p><a href="https://buy.stripe.com/8x200i8bSgVe3Vl3g8bfO00" target="_blank" rel="noopener noreferrer">Support the project via Stripe ↗</a></div>
  </div><div class="footer-bottom"><span>© Verso · An open poetry library</span><span>Read slowly. Stay a while. ✳</span></div></footer>`;
}

function searchLink(base, filters) {
  return `${base}?${new URLSearchParams(filters)}#explore`;
}

function disambiguation(poem) {
  return poem.disambiguation ? `<span lang="${e(poem.lang)}" dir="${e(poem.direction)}">${e(poem.disambiguation)}</span>` : '';
}

const flags = new Map([['China', 'cn'], ['Spain', 'es'], ['United States', 'us'], ['Portugal', 'pt'], ['France', 'fr'], ['Jamaica', 'jm'], ['Cuba', 'cu'], ['Japan', 'jp'], ['Italy', 'it'], ['Venezuela', 've'], ['England', 'gb-eng'], ['Canada', 'ca'], ['Chile', 'cl']]);
function flag(place, base) {
  const code = flags.get(place);
  return code ? `<img src="${e(base)}assets/flags/${code}.svg" alt="" width="32" height="32" loading="lazy">` : '⌁';
}

function poetDirectoryCard(poet, base) {
  const originals = new Map();
  for (const poem of poet.poems) {
    const name = typeof poem.authorOriginal === 'string' ? poem.authorOriginal.trim() : '';
    if (name && normalize(name) !== normalize(poet.name) && !originals.has(name)) originals.set(name, poem);
  }
  const originalNames = [...originals].map(([name, poem]) => ` <span class="poet-original" data-poet-original lang="${e(poem.lang)}" dir="${e(poem.direction)}">${e(name)}</span>`).join('');
  return `<a href="${e(base)}poets/${e(poet.id)}/" data-author="${e(poet.name)}"><span class="poet-avatar" aria-hidden="true">${e(poet.name.slice(0, 1))}</span><span><strong>${e(poet.name)}${originalNames}</strong><small>${poet.poems.length} ${poet.poems.length === 1 ? 'poem' : 'poems'}${poet.anonymous ? ' · anonymous group' : ''}${poet.uniqueName ? '' : ` · catalogue ID: ${e(poet.id)}`}</small></span><span aria-hidden="true">↗</span></a>`;
}

export function renderHome(poems, base) {
  const schema = { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Verso Poetry Library', url: SITE, description, inLanguage: 'en' };
  const total = `${poems.length.toLocaleString('en-US')} ${poems.length === 1 ? 'poem' : 'poems'}`;
  const collections = [
    { label: 'Chinese poetry', eyebrow: 'ORIGINAL LANGUAGE', icon: '月', className: 'quiet', filters: { language: 'Chinese' }, count: poems.filter(p => p.language === 'Chinese').length },
    { label: 'Spanish poetry', eyebrow: 'ORIGINAL LANGUAGE', icon: '✿', className: 'love', filters: { language: 'Spanish' }, count: poems.filter(p => p.language === 'Spanish').length },
    { label: 'American poetry', eyebrow: 'ASSOCIATED PLACE', icon: '✦', className: 'nature', filters: { country: 'United States' }, count: filterPoems(poems, { country: 'United States' }).length },
    { label: 'The sonnet', eyebrow: 'POETIC FORM', icon: '❧', className: 'hope', filters: { form: 'Sonnet' }, count: poems.filter(p => p.form === 'Sonnet').length },
  ];
  const authors = groupPoets(poems);
  const index = poems.toSorted((a, b) => (a.displayTitle || a.title).localeCompare(b.displayTitle || b.title));
  const places = placeCounts(poems);
  const regions = new Set(['Not established', 'Arabian Peninsula']);
  const orderedPlaces = [...places.filter(p => !regions.has(p.place)), ...places.filter(p => regions.has(p.place))];
  const countryCard = ({ place, count }) => `<a class="country-card" href="${e(searchLink(base, { country: place }))}"><span class="country-flag" aria-hidden="true">${flag(place, base)}</span><span class="country-label"><strong>${e(place)}</strong><small>${count} ${count === 1 ? 'poem' : 'poems'}</small></span><span class="country-arrow" aria-hidden="true">↗</span></a>`;
  const shortCount = filterPoems(poems, { length: '1-4' }).length;
  const sequence = ['linfinito-leopardi', 'leopardi-sera-giorno-festivo', 'leopardi-ricordanza'].map(id => poems.find(poem => poem.id === id));
  const editionPath = sequence.every(Boolean) && sequence.slice(0, -1).every((poem, index) => (poem.connections || []).some(connection => connection.type === 'followed_by' && connection.targetId === sequence[index + 1].id && connection.source && /1826/.test(connection.note)));
  const paths = [
    shortCount ? `<a class="js-required" data-explore-only hidden href="${e(searchLink(base, { length: '1-4' }))}"><span>HAVE A MOMENT?</span><strong>Poems in 1–4 lines</strong><small>${shortCount.toLocaleString('en-US')} ${shortCount === 1 ? 'poem' : 'poems'} · lines in the original</small><span class="path-arrow" aria-hidden="true">↗</span></a>` : '',
    editionPath ? `<a href="${e(base)}poems/${e(sequence[0].id)}/"><span>FOLLOW A SEQUENCE</span><strong>Three Leopardi idylls</strong><small>Read in their 1826 edition order.</small><span class="path-arrow" aria-hidden="true">↗</span></a>` : '',
  ].join('');
  return `${head({ title: 'Verso Poetry Library | Poems Across Languages, Places & Time', base, schema })}<body>${header(base)}
  <main id="main">
    <section class="hero"><div class="hero-image" role="img" aria-label="An open book and tea in a sunlit garden reading nook"></div>
      <div class="hero-content"><p class="eyebrow hero-eyebrow"><span aria-hidden="true">✳</span> A LITTLE SPACE FOR POETRY</p>
        <h1>Words to<br><em>come home to.</em></h1><p class="hero-copy">Discover <strong>${total}</strong> across languages, places, and time.</p>
        <div class="hero-actions"><a class="button primary js-required" href="#explore">Find a poem <span aria-hidden="true">↗</span></a><noscript><a class="button primary" href="#complete-index">Browse poem index <span aria-hidden="true">↗</span></a></noscript><a class="hero-text-link" href="#collections">Explore collections <span aria-hidden="true">→</span></a></div>
      </div>
    </section>
    <div class="trust-strip"><span><b aria-hidden="true">♡</b> Free to read</span><span><b aria-hidden="true">✧</b> No account needed</span></div>
    <div class="page-wrap">
      <section class="intro-section" id="collections"><div class="section-heading"><div><p class="eyebrow"><span>01 /</span> FIND YOUR WAY IN</p><h2>Where will you <em>begin?</em></h2><p>Explore a language, a collection, or a form.</p></div><a class="text-link" href="#explore">Explore all poems <span aria-hidden="true">↗</span></a></div>
        <noscript><p>Collection filters need JavaScript; browse the <a href="#complete-index">complete index</a> instead.</p></noscript><div class="collection-grid js-required" data-explore-only hidden>${collections.map(c => `<a class="collection-card collection-${c.className}" href="${e(searchLink(base, c.filters))}"><span class="collection-icon" aria-hidden="true">${c.icon}</span><span><small>${e(c.eyebrow)}</small><strong>${e(c.label)}</strong><em>${c.count} poems</em></span><b aria-hidden="true">↗</b></a>`).join('')}</div>
        ${paths ? `<aside class="reading-paths" aria-labelledby="reading-paths-title"><div><p class="eyebrow">A GENTLE START</p><h3 id="reading-paths-title">A path into poetry.</h3></div><div><noscript><p>Short-poem filtering needs JavaScript; browse the <a href="#complete-index">complete index</a> to read without it.</p></noscript><nav class="reading-path-links" aria-label="Suggested reading paths">${paths}</nav></div></aside>` : ''}
      </section>
      <section id="explore" class="explore-section"><div class="section-heading"><div><p class="eyebrow"><span>02 /</span> WANDER A LITTLE</p><h2>Explore the <em>library.</em></h2><p>Search by poet, poem, language, place, or a line you remember.</p></div><span class="catalogue-count">${total} to discover <span aria-hidden="true">✳</span></span></div>
        <form class="search-bar js-required" id="search-form" role="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><label class="sr-only" for="search">Search the poetry library</label><input id="search" type="search" placeholder="Search poems, poets, a line..." autocomplete="off" disabled><button class="button primary" type="submit" disabled>Search <span aria-hidden="true">↗</span></button></form>
        <div class="explore-layout"><details id="filter-drawer" class="filter-drawer js-required" open><summary id="filter-summary">Filters</summary><aside class="filters" aria-label="Filter poems">
          <div class="filter-head"><h3>Narrow by</h3><button type="button" id="clear-filters" disabled>Clear all</button></div><p id="filter-count-note" class="filter-note">Numbers show poems matching your search and other filters.</p>
          <input id="filter-readable" type="hidden">
          <label>Poet<select id="filter-author" aria-describedby="filter-count-note" disabled><option value="">All poets</option></select></label>
          <label>Original language<select id="filter-language" aria-describedby="filter-count-note" disabled><option value="">All languages</option></select></label>
          <label>Country or region<select id="filter-country" aria-describedby="filter-count-note" disabled><option value="">All places</option></select></label>
          <details id="advanced-filters" class="advanced-filters"><summary>More filters</summary><div class="advanced-filter-fields">
            <label>Collection<select id="filter-collection" aria-describedby="filter-count-note" disabled><option value="">All collections</option></select></label>
            <label>Form &amp; style<select id="filter-form" aria-describedby="filter-count-note" disabled><option value="">All forms</option></select></label>
            <label>Poem length<select id="filter-length" aria-describedby="filter-count-note" disabled><option value="">Any length</option><option value="1-4">1–4 lines</option><option value="5-14">5–14 lines</option><option value="15-plus">15 or more lines</option></select></label>
            <label>Theme<select id="filter-theme" aria-describedby="filter-count-note" disabled><option value="">All themes</option></select></label>
            <label>Translation language<select id="filter-translation" aria-describedby="filter-count-note" disabled><option value="">All poems</option></select></label>
            <div class="year-inputs"><label>From year<input id="filter-from" type="number" placeholder="e.g. 1600" disabled></label><label>To year<input id="filter-to" type="number" placeholder="e.g. 1900" disabled></label></div>
            <p class="filter-note">Line counts follow the original's transcribed line breaks. Year filters use the shown publication or composition date and exclude undated works. Theme tags cover a small part of the catalogue.</p>
          </div></details>
        </aside></details>
        <div class="results-area"><div class="results-heading js-required"><p id="result-count" aria-live="polite">Search is unavailable until the library loads. The complete index is below.</p><div class="results-actions"><button type="button" class="surprise-button preferred-filter" id="preferred-filter" hidden></button><button type="button" class="surprise-button" id="surprise-poem" disabled>✳ Surprise me</button><button type="button" class="copy-search-button" id="copy-search-link" disabled>Copy search link</button><label>Sort <select id="sort" disabled><option value="featured">A varied selection</option><option value="title">Title A–Z</option><option value="author">Poet A–Z</option><option value="year">Year</option></select></label></div></div>
          <p id="readable-note" class="filter-note" hidden>Includes originals and translations; some translations are labelled unreviewed reading aids.</p><div id="active-filters" class="active-filters" aria-label="Active filters" hidden></div><div id="results" class="poem-grid results-grid"></div><div class="pagination"><button type="button" id="show-more" class="button secondary" hidden>Show more poems <span aria-hidden="true">↓</span></button></div>
          <noscript><p>Search needs JavaScript, but every poem can be read in the <a href="#complete-index">complete index</a> below.</p></noscript>
        </div></div>
      </section>
      <section id="countries" class="countries-section"><div class="section-heading"><div><p class="eyebrow"><span>03 /</span> ACROSS THE MAP</p><h2>Poems by <em>country.</em></h2><p>Explore the places associated with our poets and traditions.</p></div><a class="text-link" href="#explore">Browse the library <span aria-hidden="true">↗</span></a></div>
        <noscript><p>Country filters need JavaScript; browse the <a href="#complete-index">complete index</a> instead.</p></noscript><div class="country-grid js-required" data-explore-only hidden>${orderedPlaces.slice(0, 8).map(countryCard).join('')}</div>
        ${orderedPlaces.length > 8 ? `<details class="more-countries js-required" data-explore-only hidden><summary>More countries &amp; regions (${orderedPlaces.length - 8})</summary><div class="country-grid">${orderedPlaces.slice(8).map(countryCard).join('')}</div></details>` : ''}
        <p class="country-note">Places are associations, not necessarily where a poem was written. Some works appear under more than one place; regions and unknown places have no national flag.</p>
      </section>
      <section id="poets" class="poets-section"><div><p class="eyebrow"><span>04 /</span> MEET THE VOICES</p><h2>Every poem begins <em>somewhere.</em></h2><p>Explore poets and traditional voices across time. Each page brings their works together.</p></div>
        <details class="poet-directory"><summary>Browse ${authors.length} poets and traditional voices</summary><div id="poet-finder" class="poet-finder" hidden><label for="poet-query">Find a poet or voice</label><div class="poet-finder-row"><input id="poet-query" type="search" placeholder="Name or original script" autocomplete="off" aria-controls="poet-list" aria-describedby="poet-count"><button type="button" id="clear-poet-query" disabled>Clear</button></div><p id="poet-count" class="poet-count" role="status" aria-live="polite" aria-atomic="true"></p></div><div id="poet-list" class="poet-list">${authors.map(p => poetDirectoryCard(p, base)).join('')}</div></details>
      </section>
      <section id="shelf" class="shelf-section"><div><p class="eyebrow"><span>05 /</span> JUST FOR YOU</p><h2>A shelf of <em>your own.</em></h2><p class="js-required">Keep the poems you love close by. Your saved poems and reading preferences are stored only on this device—no account needed.</p><noscript><p>Saved poems and reading history need JavaScript. Your existing saved data is not changed.</p></noscript><details class="clear-control js-required"><summary>Clear saved poems</summary><p>Remove all saved poems from this device?</p><button type="button" id="clear-shelf" class="text-button" disabled>Yes, clear saved poems</button></details></div>
        <div class="js-required"><h3 class="shelf-heading">Saved poems</h3><div id="shelf-items" class="shelf-items"><p>Your saved poems will appear here. Tap ♡ on a poem to keep it close.</p></div><div class="recent-heading"><h3 class="shelf-heading">Recently read</h3><details class="clear-control"><summary>Clear history</summary><p>Remove your recently read list?</p><button type="button" id="clear-history" class="text-button" disabled>Yes, clear history</button></details></div><div id="recent-items" class="shelf-items"><p>Your recently read poems will appear here.</p></div></div>
      </section>
      <details id="complete-index" class="complete-index"><summary>Browse the complete poetry index (${poems.length})</summary><ul>${index.map(p => `<li><a href="${e(base)}poems/${e(p.id)}/">${e(p.displayTitle || p.title)}${p.disambiguation ? ` (${disambiguation(p)})` : ''} — ${e(p.author)}</a></li>`).join('')}</ul></details>
    </div>
  </main>${footer(base)}</body></html>`;
}

export function renderPoet(poet, base) {
  const path = `poets/${poet.id}/`;
  const count = `${poet.poems.length.toLocaleString('en-US')} ${poet.poems.length === 1 ? 'poem' : 'poems'}`;
  const desc = poet.anonymous ? `Explore ${count} grouped under ${poet.name} in the Verso catalogue.` : `Explore ${count} credited to ${poet.name} in the Verso catalogue.`;
  const schema = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${poet.name} | Verso Poetry Library`, url: absolute(path), description: desc };
  const values = fn => [...new Set(poet.poems.flatMap(fn).filter(Boolean))].toSorted((a, b) => a.localeCompare(b));
  const years = values(p => [p.authorYears]);
  const places = values(associatedPlaces);
  const languages = values(p => [p.language]);
  const works = poet.poems.toSorted((a, b) => (a.displayTitle || a.title).localeCompare(b.displayTitle || b.title, undefined, { numeric: true }) || a.id.localeCompare(b.id));
  const workLink = p => `<li><a href="${e(base)}poems/${e(p.id)}/"><span><strong${p.displayTitle ? '' : ` lang="${e(p.lang)}" dir="${e(p.direction)}"`}>${e(p.displayTitle || p.title)}</strong>${p.displayTitle ? `<small lang="${e(p.lang)}" dir="${e(p.direction)}">${e(p.title)}</small>` : ''}${p.disambiguation ? `<small>Opening line: ${disambiguation(p)}</small>` : ''}<small>${e(p.language)} · ${e(p.yearLabel)}</small></span><span aria-hidden="true">↗</span></a></li>`;
  const first = works.slice(0, 8).map(workLink).join('');
  const remaining = works.slice(8);
  const more = remaining.length ? `<details class="poet-more"><summary>Show ${remaining.length.toLocaleString('en-US')} more ${remaining.length === 1 ? 'poem' : 'poems'}</summary><ul class="poet-works-list">${remaining.map(workLink).join('')}</ul></details>` : '';
  const filterLink = poet.uniqueName ? `<a class="text-link js-required" href="${e(searchLink(base, { author: poet.name }))}">Filter these poems in the library ↗</a>` : '';
  return `${head({ title: `${poet.name} | Verso Poetry Library`, description: desc, path, base, schema })}<body class="poet-page" data-poet-id="${e(poet.id)}">${header(base)}
  <main id="main" class="reader-wrap poet-wrap"><a class="back-link" href="${e(base)}#poets">← Back to poets</a>
    <header class="poet-intro"><p class="eyebrow">${poet.anonymous ? 'TRADITIONAL &amp; ANONYMOUS VOICES' : 'MEET THE POET'}</p><h1>${e(poet.name)}</h1><p class="poet-intro-count">${count} in the library</p>${poet.uniqueName ? '' : `<p>Catalogue ID: ${e(poet.id)}</p>`}<p>${poet.anonymous ? 'These works are grouped for discovery; they are not necessarily by the same person.' : 'Explore the works credited to this poet in the Verso catalogue.'}</p></header>
    <div class="poet-layout"><section class="poet-works" aria-labelledby="poet-works-title"><div class="section-heading"><div><p class="eyebrow">READ A LITTLE FURTHER</p><h2 id="poet-works-title">Poems to <em>discover.</em></h2><p>Listed by title. Each poem includes its own source and rights notes.</p></div>${filterLink}</div><ul class="poet-works-list">${first}</ul>${more}</section>
    <aside class="context-card poet-facts"><p class="eyebrow">FROM THE CATALOGUE</p><h2>At a glance</h2><dl><dt>Date descriptions</dt><dd>${e(years.join(' · ') || 'Not established')}</dd><dt>Associated places</dt><dd>${e(places.join(' · ') || 'Not established')}</dd><dt>Original languages</dt><dd>${e(languages.join(' · ') || 'Not established')}</dd></dl><p>These are catalogue descriptions, not a biography. Associated places do not necessarily identify where a poem was written.</p></aside></div>
  </main>${footer(base)}</body></html>`;
}

export function renderPoem(poem, poems, base) {
  const title = poem.displayTitle || poem.title;
  const path = `poems/${poem.id}/`;
  const seoTitle = poem.disambiguation ? `${title} — ${poem.disambiguation}` : title;
  const desc = `${title} by ${poem.author}. Read the ${poem.language} original, explore its ${poem.form.toLowerCase()} form, context, sources and related poetry on Verso.`;
  const schema = { '@context': 'https://schema.org', '@type': 'CreativeWork', '@id': absolute(path), name: title, alternateName: poem.displayTitle ? poem.title : undefined, ...(poem.anonymous ? {} : { author: { '@type': 'Person', name: poem.author } }), inLanguage: poem.lang, description: poem.context, isBasedOn: poem.source, ...(poem.year && poem.yearLabel.startsWith('Published') ? { datePublished: String(poem.year) } : {}) };
  const suggestions = relatedPoems(poem, poems);
  const translations = poem.translations.map((t, i) => `<option value="${i}">${e(t.language)}</option>`).join('');
  const viewSwitch = translations ? `<div class="view-switch" role="group" aria-label="Poem view"><button type="button" data-view="original" aria-pressed="true" disabled>Original</button><button type="button" data-view="translation" aria-pressed="false" disabled>Translation</button><button type="button" data-view="both" aria-pressed="false" disabled>Side by side</button></div>` : '<span class="muted">Original only · translation not yet available</span>';
  const languageTags = { English: 'en', Spanish: 'es', Portuguese: 'pt', French: 'fr', Italian: 'it', Chinese: 'zh', Japanese: 'ja', Arabic: 'ar' };
  const translationIndex = poem.translations.length ? `<details id="translations" class="translation-index" open><summary>All available translations and reading aids (${poem.translations.length})</summary>${poem.translations.map(t => `<section><h3>${e(t.title)} · ${e(t.language)}</h3><p>${e(t.translator)}</p><p class="verse" lang="${e(languageTags[t.language] || 'und')}" dir="${t.language === 'Arabic' ? 'rtl' : 'ltr'}">${e(t.text)}</p><p>${e(t.rights)} <a href="${e(t.source)}" target="_blank" rel="noopener noreferrer">Source ↗</a></p></section>`).join('')}</details>` : '';
  const connectionNames = { followed_by: 'Followed by', preceded_by: 'Preceded by', influenced_by: 'Influenced by', inspired: 'Inspired', response_to: 'A response to' };
  const contextSource = poem.contextSource ? `<a href="${e(poem.contextSource)}" target="_blank" rel="noopener noreferrer">${e(poem.contextSourceTitle)} ↗</a>` : '';
  const connections = (poem.connections || []).map(connection => {
    const target = poems.find(item => item.id === connection.targetId);
    if (!target) return '';
    return `<div class="connection-entry"><span class="language-pill">${e(connectionNames[connection.type])}</span><a href="${e(base)}poems/${e(target.id)}/"><strong>${e(target.displayTitle || target.title)}</strong> · ${e(target.author)} ↗</a><p>${e(connection.note)}</p><a href="${e(connection.source)}" target="_blank" rel="noopener noreferrer">View evidence ↗</a></div>`;
  }).join('');
  const connectionsSection = connections ? `<section class="connections-section"><p class="eyebrow">TRACING CONNECTIONS</p><h2>Connections we can trace.</h2>${connections}</section>` : '';
  const relatedSection = suggestions.length ? `<section class="related-section"><div class="section-heading"><div><p class="eyebrow">KEEP WANDERING</p><h2>One poem leads <em>to another.</em></h2><p>Suggestions share catalogue details, not claims of historical influence.</p></div><a class="text-link" href="${e(base)}#explore">Explore all poems ↗</a></div><div class="poem-grid">${suggestions.map(item => poemCard(item.poem, base, item.reason)).join('')}</div></section>` : '';
  const readerData = [poem, ...suggestions.map(({ poem: p }) => ({ id: p.id, title: p.title, displayTitle: p.displayTitle }))];
  return `${head({ title: `${seoTitle} by ${poem.author} | Verso Poetry Library`, description: desc, path, base, schema })}<body class="reader-page tone-${e(poem.mood)}" data-poem-id="${e(poem.id)}">${header(base)}
  <main id="main" class="reader-wrap"><a class="back-link" data-back-to-library href="${e(base)}#explore">← Back to the library</a>
    <div class="reader-intro"><div><p class="eyebrow"><span>THE READING ROOM</span> &nbsp; / &nbsp; ${e(poem.language.toUpperCase())} POETRY</p>
      <h1${poem.displayTitle ? '' : ` lang="${e(poem.lang)}" dir="${e(poem.direction)}"`}>${e(title)}</h1>
      ${poem.displayTitle ? `<p class="reader-original-title" lang="${e(poem.lang)}" dir="${e(poem.direction)}">${e(poem.title)}</p>` : ''}
      ${poem.disambiguation ? `<p class="reader-disambiguation">Opening line: ${disambiguation(poem)}</p>` : ''}
      <p class="reader-byline">${poem.anonymous ? 'Attribution:' : 'by'} <strong><a href="${e(base)}poets/${e(poem.authorId)}/">${e(poem.author)}</a></strong> <span>·</span> ${e(poem.yearLabel)}</p></div>
      <div class="reader-actions"><button type="button" class="button secondary reader-save js-required" data-save="${e(poem.id)}" aria-pressed="false" disabled>♡ &nbsp; Save poem</button><button type="button" id="focus-toggle" class="button secondary focus-toggle" hidden><span aria-hidden="true">◐</span> <span class="focus-label">Focus mode</span></button></div></div>
    <p id="static-reading-note" class="static-reading-note">Saving and display controls need JavaScript. ${translations ? '<a href="#translations">Read the available translations and reading aids ↓</a>' : 'This poem is available in the original only.'}</p>
    <p id="preferred-note" class="preferred-note" aria-live="polite" hidden></p><div class="reading-toolbar js-required" aria-label="Reading controls">${viewSwitch}
      <div class="reading-options">${translations ? `<label class="translation-picker">Translation <select id="translation-select" aria-label="Translation language" disabled>${translations}</select></label>` : ''}<label class="focus-preferred">Preferred <select data-preferred-language aria-label="Preferred reading language in focus mode" disabled>${languageOptions}</select></label><label class="focus-theme">Theme <select data-theme-select aria-label="Focus theme" disabled>${themeOptions}</select></label><details class="typeface-control" hidden><summary>Typeface</summary><label><span class="sr-only">Poem typeface</span><select data-typeface-select disabled><option value="literary">Literary serif</option><option value="clear">Clear sans</option></select></label></details><div class="font-controls" role="group" aria-label="Poem text size"><button type="button" data-font="down" aria-label="A− Decrease poem text size" disabled>A−</button><button type="button" data-font="up" aria-label="A+ Increase poem text size" disabled>A+</button></div></div></div>
    <div class="reader-layout"><article class="reading-paper"><div class="poem-columns" id="poem-columns"><section id="original-panel"><span class="language-pill">ORIGINAL · ${e(poem.language.toUpperCase())}</span><h2 class="sr-only">Original text</h2><p class="verse" lang="${e(poem.lang)}" dir="${e(poem.direction)}">${e(poem.text)}</p></section><section id="translation-panel" hidden aria-live="polite"></section></div>
      <div class="story"><p class="eyebrow">THE STORY BEHIND THE POEM</p><h2>A little context <span aria-hidden="true">✳</span></h2><p>${e(poem.context)}</p><a href="${e(poem.source)}" target="_blank" rel="noopener noreferrer">Explore the text source <span aria-hidden="true">↗</span></a> ${contextSource}</div>${translationIndex}</article>
      <aside class="context-card"><p class="eyebrow">GET TO KNOW THE POEM</p><h2>At a glance</h2><dl><dt>Poet</dt><dd>${e(poem.author)}<br><small>${e(poem.authorYears)}</small></dd><dt>Year</dt><dd>${e(poem.yearLabel)}</dd><dt>Associated place</dt><dd>${e(poem.country)}</dd><dt>Created in</dt><dd>${e(poem.creationPlace || 'Not established')}</dd><dt>Era</dt><dd>${e(poem.era)}</dd><dt>Form</dt><dd>${e(poem.form)}</dd><dt>Lines</dt><dd>${lineCount(poem)}</dd><dt>Collection</dt><dd>${e(collectionLabel(poem.collection))}</dd><dt>Themes</dt><dd>${e(poem.themes.join(', ') || 'Not yet classified')}</dd><dt>Original</dt><dd>${e(poem.language)}</dd></dl>
        <div class="source-note"><strong>↗ Source &amp; rights</strong><p><a href="${e(poem.source)}" target="_blank" rel="noopener noreferrer">${e(poem.sourceTitle)}</a></p><p>${e(poem.rights)}</p></div></aside></div>
    <nav id="reading-journey" class="reading-journey" aria-label="Continue through search results" hidden><div><p class="eyebrow">CONTINUE YOUR SEARCH</p><p id="journey-position"></p><a data-journey-back href="${e(base)}#explore">Back to results ↗</a></div><div class="journey-links"><a data-journey-previous hidden><small>← Previous poem</small><strong></strong></a><a data-journey-next hidden><small>Next poem →</small><strong></strong></a></div></nav>
    ${connectionsSection}${relatedSection}
  </main>${footer(base)}<script type="application/json" id="reader-data">${jsonForHtml(readerData)}</script></body></html>`;
}

export { SITE };
