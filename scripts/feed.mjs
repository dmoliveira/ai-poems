import { escapeHtml } from '../src/catalog.mjs';
import { SITE } from './templates.mjs';

const xmlCharacters = /^[\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]*$/u;
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function renderFeed(updates, poems) {
  if (!Array.isArray(updates)) throw new Error('Feed updates must be an array');
  const poemIds = new Set(poems.map(poem => poem.id));
  const ids = new Set();
  for (const update of updates) {
    if (!update || typeof update.id !== 'string' || !slug.test(update.id) || ids.has(update.id)) throw new Error('Invalid or duplicate feed update ID');
    if (typeof update.poemId !== 'string' || !poemIds.has(update.poemId)) throw new Error(`Unknown feed poem: ${update.id}`);
    for (const field of ['title', 'description']) {
      if (typeof update[field] !== 'string' || !update[field].trim() || !xmlCharacters.test(update[field])) throw new Error(`Invalid feed ${field}: ${update.id}`);
    }
    if (typeof update.evidence !== 'string' || !URL.canParse(update.evidence) || new URL(update.evidence).protocol !== 'https:') throw new Error(`Invalid feed publication evidence: ${update.id}`);
    const date = new Date(update.publishedAt);
    if (typeof update.publishedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(update.publishedAt) || Number.isNaN(date.getTime()) || date.toISOString() !== update.publishedAt.replace('Z', '.000Z')) throw new Error(`Invalid feed publication date: ${update.id}`);
    ids.add(update.id);
  }
  const ordered = updates.toSorted((a, b) => b.publishedAt.localeCompare(a.publishedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const items = ordered.map(update => `    <item>
      <title>${escapeHtml(update.title)}</title>
      <link>${SITE}poems/${update.poemId}/</link>
      <guid isPermaLink="false">verso:${update.id}</guid>
      <pubDate>${new Date(update.publishedAt).toUTCString()}</pubDate>
      <description>${escapeHtml(update.description)}</description>
    </item>`).join('\n');
  const lastUpdate = ordered.length ? `    <lastBuildDate>${new Date(ordered[0].publishedAt).toUTCString()}</lastBuildDate>\n` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Verso Poetry Library updates</title>
    <link>${SITE}</link>
    <description>New and updated poetry in the Verso library.</description>
    <language>en</language>
    <atom:link href="${SITE}feed.xml" rel="self" type="application/rss+xml" />
${lastUpdate}${items}
  </channel>
</rss>
`;
}
