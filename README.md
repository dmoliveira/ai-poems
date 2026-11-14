# Verso Poetry Library 📖🌿

[![Explore Verso: poetry across languages, places, and time](assets/verso-banner.svg)](https://dmoliveira.github.io/ai-poems/)

[![Build and deploy](https://github.com/dmoliveira/ai-poems/actions/workflows/pages.yml/badge.svg)](https://github.com/dmoliveira/ai-poems/actions/workflows/pages.yml)
[![Read Verso](https://img.shields.io/badge/read-Verso%20Poetry%20Library-697b50)](https://dmoliveira.github.io/ai-poems/)
[![Poems](https://img.shields.io/badge/poems-1026-d4a084)](https://dmoliveira.github.io/ai-poems/#explore)
[![Original languages](https://img.shields.io/badge/original%20languages-8-b99d78)](https://dmoliveira.github.io/ai-poems/#explore)
[![License: MIT](https://img.shields.io/badge/code%20license-MIT-blue.svg)](LICENSE)
[![Support via Stripe](https://img.shields.io/badge/support%20via-Stripe-635bff?logo=stripe&logoColor=white)](https://buy.stripe.com/8x200i8bSgVe3Vl3g8bfO00)

**[Visit Verso →](https://dmoliveira.github.io/ai-poems/)** · [Explore poems](https://dmoliveira.github.io/ai-poems/#explore) · [Contribute](CONTRIBUTING.md) · [Support the project 💛](https://buy.stripe.com/8x200i8bSgVe3Vl3g8bfO00)

Verso is a free, cozy, multilingual poetry library for discovering classic poetry in its original language, learning about authors and literary history, and following a thread from one poem to another. The `ai-poems` repository builds a static website for GitHub Pages: no account or server is required.

## A little room for discovery ✨

- **Read:** more than 2,200 poems in English, Spanish, Portuguese, French, Italian, Chinese, Japanese, and Arabic, from more than 200 named or traditional author groups.
- **Explore:** browse associated countries and regions with flags and poem counts, or search poem text, titles and poets. Choose a preferred reading language or filter independently for works available in a language, including originals and available translations; some are unreviewed AI-assisted reading aids. Filter by poet, original language, collection, form, transcribed line count, available translation, place and recorded year; quick year ranges count matches against the other filters. A year may describe composition, publication, an edition or a traditional date; records without a year are excluded from ranges. Filter-option counts reflect the search and other active filters; each poem is counted once per option. A work associated with multiple places is counted under each; an associated place is not necessarily where it was written. Results rotate through languages and poets, and “Surprise me” picks from the current results. Share or return to a search using its link, or continue through its results from the reader. When tab storage is available, returning to a matching search restores expanded results and the last poem read; a surprise outside the loaded results returns to the search controls instead. Theme tags cover only part of the catalogue.
- **Understand:** shareable poet and traditional-voice pages bring catalogue works together without inventing biographies. Search the directory by display name or available original-script name; the full directory remains browsable without JavaScript. Each poem has source and rights notes, author, era, place, collection, and context. Linked, sourced relationships are distinct from varied suggestions labelled by shared poet, theme, original language or associated place; these suggestions do not claim influence.
- **Find a way in:** browse catalogue-backed paths by original language, associated place or form; begin with a sourced featured poem; try a short poem by its original line count; or follow documented sequences in Leopardi's 1826 edition and Shakespeare's numbered sonnets.
- **Make it yours:** save poems, revisit reading history, choose a light, sepia or dark theme, switch between literary serif and clear sans verse, adjust text size, or use distraction-free focus mode. Fonts are hosted locally, with system fallbacks for scripts they do not cover. These preferences stay in your browser on this device; clearing a shelf or history asks for confirmation.
- **Read across languages:** original and translation views, side-by-side reading, preserved line breaks, language tags and right-to-left Arabic support. If your preferred language has a translation, it appears alongside the original; otherwise the original remains available with a clear note. Reader pages load only the data they need rather than downloading the full catalogue. Poem cards and reading rooms take on a subtle palette suited to each work's mood.
- **Discoverable:** every poem has a static, readable URL, a descriptive title and metadata, canonical and social tags, structured data, and an entry in the sitemap. The complete index groups every work by original language and remains navigable without JavaScript.
- **Follow updates:** subscribe to the [RSS feed](https://dmoliveira.github.io/ai-poems/feed.xml) for selected, dated additions and updates. The feed is editorially maintained and does not claim to list every past addition.

### An honest note about coverage

Coverage remains uneven across languages and poets, and translations are much rarer than originals. The collection includes the 154 Shakespeare sonnets and 281 Dickinson poems in early edited editions. More poets, countries, modern work, historical context and independently reviewed translations are planned. **Not every poem is available in every language.** The interface is currently in English.

The seven non-original language versions of Li Bai's *Quiet Night Thought* are explicitly labelled **AI-assisted, unreviewed reading aids**, not attributed to historical translators. Three other Chinese poems have separately credited Arthur Waley English translations, with differences and source uncertainty disclosed. Bashō's English version is attributed to Lafcadio Hearn; seven Teresa of Ávila poems and four Baudelaire poems include separately sourced historical English translations. Two Leopardi poems include Frederick Townsend's 1887 translations of later textual versions, marked where they differ from the 1826 originals. Other translations are shown only when included and identified. See [rights and sources](docs/rights-and-sources.md) and the [roadmap](docs/roadmap.md).

## Run locally 🛠️

Requires Node.js 20 or newer. No backend or API keys are needed.

```sh
npm ci
npm test
npm run build
npm run serve
```

Open **http://127.0.0.1:4173/ai-poems/**. The path matches the GitHub Pages project path. For browser tests, install Chromium once with `npx playwright install chromium`, then run `npm run test:browser`. To use an existing Chrome installation, set `CHROME_PATH` to its executable.

The GitHub Actions workflow tests and builds pull requests, then publishes `_site/` to GitHub Pages when `main` changes. Static poem and poet pages, available translations and the complete index remain readable with JavaScript disabled; interactive search, display controls and the shelf require JavaScript.

The sitemap is published at [`/ai-poems/sitemap.xml`](https://dmoliveira.github.io/ai-poems/sitemap.xml) and can be submitted to search-engine webmaster tools. Search engines decide whether and when to index pages. Because this is a project site under a path, crawlers normally consult `robots.txt` at the **domain root**; the generated project-level `robots.txt` does not control that root.

## Adding poems and translations 🌍

Curated records live in [`content/curated.mjs`](content/curated.mjs); the independently sourced Shakespeare sequence is in [`content/shakespeare-sonnets.json`](content/shakespeare-sonnets.json). Add more individual records or batches as JSON files in [`content/poems/`](content/poems/). The site is generated by [`scripts/build.mjs`](scripts/build.mjs). See [CONTRIBUTING.md](CONTRIBUTING.md) before adding a record, especially for text, translation, copyright, dates and evidence of influence. Content is not automatically translated or imported at runtime.

The launch sonnets can be reproduced from [Project Gutenberg eBook 1041](https://www.gutenberg.org/ebooks/1041): download its UTF-8 plain text and run `node scripts/import-sonnets.mjs /path/to/pg1041.txt`. The importer verifies the sequence and the two historically unusual line counts. Source files, checksums, import commands and edition caveats for the expanded collections are in [rights and sources](docs/rights-and-sources.md). Review diffs against the source before committing.

## More from the same maker 🌱

[![Master Philosophers: explore big ideas](assets/master-philosophers-banner.svg)](https://dmoliveira.github.io/master-philosophers/)
[![Learn Spanish Immersion: discover a language through life](assets/spanish-immersion-banner.svg)](https://dmoliveira.github.io/learn-spanish-immersion/)

- [Master Philosophers 🧠](https://dmoliveira.github.io/master-philosophers/) · [repository](https://github.com/dmoliveira/master-philosophers)
- [Learn Spanish Immersion 🇪🇸](https://dmoliveira.github.io/learn-spanish-immersion/) · [repository](https://github.com/dmoliveira/learn-spanish-immersion)

## Privacy, credits and licensing

Verso stores bookmarks, recent reading and display preferences on this device, using transactional IndexedDB and a local-storage compatibility copy; existing shelves are imported without removing their data. Session storage continues a search within the same browser tab. No account or cookies are required. Open tabs coordinate changes using browser locks; refresh **all** older Verso tabs after an update so they use the same protection. If storage cannot be read or safely coordinated, Verso does not overwrite the existing data and warns that changes may be temporary. An interrupted update can temporarily retain both the previous and proposed versions; if its warning persists after closing other Verso tabs and reloading, do not clear browser data. Once an update completes, the application retains only the current state and bounded hashes of recent states for synchronization, not full earlier shelf snapshots. The site includes no analytics code or remote font requests. GitHub Pages and any external site you choose to visit have their own policies. Clearing this site's browser data removes both stored copies and their synchronization information.

The application code is [MIT licensed](LICENSE). Poem texts, transcriptions, translations and artwork are **not automatically covered by the code license**; see the individual source and rights notes and [rights and sources](docs/rights-and-sources.md). Copyright and public-domain rules vary by country. The garden hero is an AI-generated illustration created for Verso. Cormorant Garamond and DM Sans are distributed under their included SIL Open Font Licenses.
