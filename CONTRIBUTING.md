# Contributing to Verso 🌿

Thank you for helping make poetry easier to discover. A small, accurate addition is more valuable than a large collection with unclear rights or invented context.

## Before adding a work

1. Choose an identifiable edition and confirm the **specific original text** may be published, recording the rights basis and jurisdiction. A poet's death date alone does not clear every edition.
2. Independently clear **each translation**: translator, publication date, source, license or permission. Modern work and modern translations often remain protected. If in doubt, don't publish the text.
3. Verify spelling and line breaks against the linked source; record variants or uncertainty. Cite a stable edition or revision, not just a general author page.
4. Distinguish the date of composition from publication. Use `year: null` when a usable date is unknown and explain it in `yearLabel`. The year filter uses that dated year, not a guessed year.
5. Cite a reliable source for a claim that one work influenced, responds to, or inspired another. Shared themes and common authorship are suggestions, **not** proof of influence.

## Record shape

Add a UTF-8 `.json` file to `content/poems/` containing a record object or array of records, each with a stable URL-safe `id`. Follow an example in `content/curated.mjs`. Required fields include `title`, `author`, `authorId`, `authorYears`, associated `country` or region, `language`, BCP 47 `lang`, `direction`, `year`, `yearLabel`, `era`, `form`, `collection`, `themes`, `mood`, `context`, `sourceTitle`, HTTPS `source`, `rights`, `text`, and `translations`. An associated country is not necessarily where a poem was written; add optional `creationPlace` only when it can be substantiated. Preserve original line breaks with `\n`; Arabic should use `direction: 'rtl'`.

Every translation needs `language`, `title`, `text`, `translator`, HTTPS `source` and `rights`. Label AI-assisted or unreviewed reading aids plainly, and do not misattribute them to a historical translator. Expand `readingLanguages` in `src/catalog.mjs` and the language mappings in `src/app.mjs` and `scripts/templates.mjs` if adding another language.

Optional `connections` are directional records with `type` (`followed_by`, `preceded_by`, `influenced_by`, `inspired`, or `response_to`), `targetId`, HTTPS evidence `source`, and an explanatory `note`. The target must exist. Link sequence separately from influence. See the Sonnet 18 example in `scripts/catalog-data.mjs`.

Run `npm test`, `npm run build`, and `npm run test:browser` after installing the browser. Check the generated poem page, original language, source and rights, metadata, and mobile presentation. Do not commit `_site/` or `node_modules/`.

## RSS updates

The feed is an editorial record, not an automatic list of poem dates. After an addition or substantial update is actually published, add an entry to `content/updates.json` with a unique permanent `id`, existing `poemId`, descriptive title and summary, and the verified publication time in UTC (`YYYY-MM-DDTHH:mm:ssZ`). Record an HTTPS evidence link, such as the successful Pages deployment. Do not use the historical poem date, a planned release time, or the current build time as the publication date. Keep existing IDs and dates stable; create a new ID for a later update. The feed is selective, so do not imply it reconstructs every past addition.

## Scope and design

The build generates static HTML and a searchable JSON catalogue for GitHub Pages. Keep content independent of components, preserve accessible controls and the no-JavaScript reading path, and prefer locally hosted assets. See [the roadmap](docs/roadmap.md) and [rights and sources](docs/rights-and-sources.md).
