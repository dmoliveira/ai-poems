import { associatedPlaces } from '../src/catalog.mjs';

const hashes = new Map();
function hashId(id) {
  if (!hashes.has(id)) {
    let hash = 2166136261;
    for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    hashes.set(id, hash >>> 0);
  }
  return hashes.get(id);
}

function rank(source, candidate) {
  let value = hashId(source) ^ hashId(candidate);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

// These are catalogue-based suggestions, not claims of historical influence.
export function relatedPoems(poem, poems) {
  const excluded = new Set([poem.id, ...(poem.connections || []).map(connection => connection.targetId)]);
  const candidates = [];
  for (const candidate of poems) {
    if (excluded.has(candidate.id)) continue;
    excluded.add(candidate.id);
    candidates.push({ poem: candidate, rank: rank(poem.id, candidate.id) });
  }
  const chosen = [];
  const chosenIds = new Set();
  const chosenAuthors = new Set();
  const samePoet = candidate => Boolean(poem.authorId && candidate.authorId && !poem.anonymous && !candidate.anonymous && poem.authorId === candidate.authorId);
  const otherVoice = candidate => Boolean(poem.authorId && candidate.authorId && poem.authorId !== candidate.authorId);
  const theme = candidate => (poem.themes || []).find(value => (candidate.themes || []).includes(value));
  const places = associatedPlaces(poem).filter(place => place !== 'Not established');
  const place = candidate => places.find(value => associatedPlaces(candidate).includes(value));
  const sameLanguage = candidate => Boolean(poem.language && poem.language === candidate.language);
  function take(predicate, reason) {
    if (chosen.length >= 3) return false;
    let best;
    for (const candidate of candidates) {
      if (chosenIds.has(candidate.poem.id) || !predicate(candidate.poem)) continue;
      if (!best || candidate.rank < best.rank || (candidate.rank === best.rank && candidate.poem.id < best.poem.id)) best = candidate;
    }
    if (!best) return false;
    chosen.push({ poem: best.poem, reason: reason(best.poem) });
    chosenIds.add(best.poem.id);
    chosenAuthors.add(best.poem.authorId);
    return true;
  }
  function fill(predicate, reason) { while (take(predicate, reason)) {} }
  const newVoice = candidate => otherVoice(candidate) && !chosenAuthors.has(candidate.authorId);
  take(samePoet, () => 'Same poet');
  take(candidate => newVoice(candidate) && theme(candidate), candidate => `Shared theme: ${theme(candidate)}`);
  take(candidate => newVoice(candidate) && sameLanguage(candidate), () => `Same original language: ${poem.language}`);
  fill(candidate => newVoice(candidate) && place(candidate), candidate => `Shared associated place: ${place(candidate)}`);
  fill(candidate => newVoice(candidate) && sameLanguage(candidate), () => `Same original language: ${poem.language}`);
  fill(samePoet, () => 'Same poet');
  fill(sameLanguage, () => `Same original language: ${poem.language}`);
  fill(candidate => Boolean(theme(candidate)), candidate => `Shared theme: ${theme(candidate)}`);
  fill(candidate => Boolean(place(candidate)), candidate => `Shared associated place: ${place(candidate)}`);
  return chosen;
}
