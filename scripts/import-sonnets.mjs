import { readFile, writeFile } from 'node:fs/promises';

// Import the text, not the surrounding ebook header or license boilerplate.
// Usage: node scripts/import-sonnets.mjs /path/to/pg1041.txt
const path = process.argv[2];
if (!path) throw new Error('Pass the downloaded Project Gutenberg #1041 text as an argument.');
const text = (await readFile(path, 'utf8')).replaceAll('\r\n', '\n');
const body = text.split('*** START OF THE PROJECT GUTENBERG EBOOK SHAKESPEARE\'S SONNETS ***')[1]
  ?.split('*** END OF THE PROJECT GUTENBERG EBOOK')[0];
if (!body) throw new Error('Could not find the expected Gutenberg text boundaries.');
const matches = [...body.matchAll(/^([IVXLCDM]+)\n\n([\s\S]*?)(?=\n\n+[IVXLCDM]+\n\n|(?![\s\S]))/gm)];
const roman = number => {
  let result = '';
  for (const [value, glyph] of [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) {
    while (number >= value) { result += glyph; number -= value; }
  }
  return result;
};
if (matches.length !== 154) throw new Error(`Expected 154 sonnets; found ${matches.length}.`);
const sonnets = matches.map((match, i) => {
  if (match[1] !== roman(i + 1)) throw new Error(`Unexpected sonnet order at ${i + 1}.`);
  const lines = match[2].trim().split('\n').filter(Boolean);
  // Sonnets 99 and 126 are the two exceptions in this edition.
  const expectedLines = ({ 99: 15, 126: 12 })[i + 1] ?? 14;
  if (lines.length !== expectedLines) throw new Error(`Sonnet ${i + 1} has ${lines.length} lines, expected ${expectedLines}.`);
  return { number: i + 1, text: lines.join('\n') };
});
await writeFile(new URL('../content/shakespeare-sonnets.json', import.meta.url), `${JSON.stringify(sonnets, null, 2)}\n`);
console.log(`Imported ${sonnets.length} sonnets.`);
