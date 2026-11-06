import { readFile, readdir } from 'node:fs/promises';
import { curated } from '../content/curated.mjs';

export async function loadCatalog(recordsDirectory = new URL('../content/poems/', import.meta.url)) {
  const sonnets = JSON.parse(await readFile(new URL('../content/shakespeare-sonnets.json', import.meta.url), 'utf8'));
  const additional = [];
  for (const name of (await readdir(recordsDirectory)).filter(name => name.endsWith('.json')).sort()) {
    const records = JSON.parse(await readFile(new URL(name, recordsDirectory), 'utf8'));
    additional.push(...(Array.isArray(records) ? records : [records]));
  }
  return [...curated, ...additional, ...sonnets.map(({ number, text }) => ({
    id: `shakespeare-sonnet-${number}`, title: `Sonnet ${number}`, author: 'William Shakespeare', authorId: 'william-shakespeare', authorYears: '1564–1616', country: 'England', language: 'English', lang: 'en', direction: 'ltr', year: 1609, yearLabel: 'Published 1609', era: 'Renaissance', form: 'Sonnet', collection: "Shakespeare’s Sonnets", themes: number === 18 ? ['Love', 'Nature', 'Time'] : ['Sonnets'], mood: number === 18 ? 'rose' : 'paper',
    context: number === 18 ? 'First published in 1609, this sonnet compares its beloved to a summer’s day and imagines poetry preserving beauty against time.' : 'First published in the 1609 collection, this is one of Shakespeare’s 154 numbered sonnets. The text follows the Project Gutenberg edition; the date of composition is not known precisely.',
    sourceTitle: 'Project Gutenberg · Shakespeare’s Sonnets, eBook 1041', source: 'https://www.gutenberg.org/ebooks/1041', rights: 'Historical original; public domain in the United States. Check local law before reuse.', text, translations: [],
    connections: number === 18 ? [{ type: 'followed_by', targetId: 'shakespeare-sonnet-19', source: 'https://www.gutenberg.org/ebooks/1041', note: 'The next poem in the numbered sonnet sequence. This is a sequence link, not a claim of influence.' }] : [],
  }))];
}
