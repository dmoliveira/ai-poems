import { cp, mkdir, writeFile } from 'node:fs/promises';
import { loadCatalog } from './catalog-data.mjs';
import { renderHome, renderPoem, SITE } from './templates.mjs';

const out = new URL('../_site/', import.meta.url);
const base = '/ai-poems/';
const poems = await loadCatalog();
const ids = new Set();
for (const poem of poems) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(poem.id) || ids.has(poem.id)) throw new Error(`Invalid or duplicate poem ID: ${poem.id}`);
  if (['title', 'author', 'authorId', 'authorYears', 'country', 'language', 'lang', 'direction', 'yearLabel', 'era', 'form', 'collection', 'mood', 'context', 'sourceTitle', 'source', 'rights', 'text'].some(key => typeof poem[key] !== 'string' || !poem[key].trim()) || !Array.isArray(poem.themes) || !poem.themes.every(theme => typeof theme === 'string' && theme.trim()) || !Array.isArray(poem.translations) || !['ltr', 'rtl'].includes(poem.direction) || !(poem.year === null || Number.isInteger(poem.year))) throw new Error(`Incomplete or invalid record: ${poem.id}`);
  if (!URL.canParse(poem.source) || new URL(poem.source).protocol !== 'https:') throw new Error(`Invalid source: ${poem.id}`);
  if (poem.contextSource && (!poem.contextSourceTitle || !URL.canParse(poem.contextSource) || new URL(poem.contextSource).protocol !== 'https:')) throw new Error(`Invalid context source: ${poem.id}`);
  for (const t of poem.translations) if (!t.title || !t.language || !t.text || !t.translator || !t.source || !t.rights || !URL.canParse(t.source) || new URL(t.source).protocol !== 'https:') throw new Error(`Incomplete translation: ${poem.id}`);
  ids.add(poem.id);
}
for (const poem of poems) for (const connection of poem.connections || []) {
  if (!['followed_by', 'preceded_by', 'influenced_by', 'inspired', 'response_to'].includes(connection.type) || !ids.has(connection.targetId) || connection.targetId === poem.id || !connection.note || !URL.canParse(connection.source) || new URL(connection.source).protocol !== 'https:') throw new Error(`Invalid or unsourced connection: ${poem.id}`);
}
await mkdir(out, { recursive: true });
await mkdir(new URL('data/', out), { recursive: true });
await cp(new URL('../assets/', import.meta.url), new URL('assets/', out), { recursive: true });
for (const name of ['app.mjs', 'catalog.mjs', 'style.css']) await cp(new URL(`../src/${name}`, import.meta.url), new URL(name, out));
await writeFile(new URL('index.html', out), renderHome(poems, base));
await writeFile(new URL('data/catalog.json', out), JSON.stringify(poems));
for (const poem of poems) {
  const dir = new URL(`poems/${poem.id}/`, out);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL('index.html', dir), renderPoem(poem, poems, base));
}
const urls = ['', ...poems.map(p => `poems/${p.id}/`)];
await writeFile(new URL('sitemap.xml', out), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(path => `  <url><loc>${SITE}${path}</loc></url>`).join('\n')}\n</urlset>\n`);
await writeFile(new URL('robots.txt', out), `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`);
await writeFile(new URL('.nojekyll', out), '');
console.log(`Built ${poems.length} poems and ${urls.length} indexed pages in _site/.`);
