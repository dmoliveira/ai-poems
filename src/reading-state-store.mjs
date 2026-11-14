// localStorage is a compatibility mirror: another renderer can observe a stale
// value even after a Web Lock changes hands. The IndexedDB record is the
// transactional source of truth for cooperating versions of Verso.
const databaseName = 'verso-reading-state-v1';
const storeName = 'reading-state';
const recordKey = 'library';
const fingerprintLimit = 16;

export class ReadingStateError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

function unavailable(message) { return new ReadingStateError('lock', message); }
function unreadable(message) { return new ReadingStateError('read', message); }

function openDatabase() {
  return new Promise((resolve, reject) => {
    let request;
    let settled = false;
    const timeout = setTimeout(() => finish(unavailable('Reading state database timed out')), 4000);
    const finish = (error, database) => {
      if (settled) { database?.close(); return; }
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(database);
    };
    try { request = indexedDB.open(databaseName, 1); }
    catch { finish(unavailable('Reading state database unavailable')); return; }
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onblocked = () => finish(unavailable('Reading state database blocked'));
    request.onerror = () => finish(unavailable('Reading state database unavailable'));
    request.onsuccess = () => finish(null, request.result);
  });
}

function transaction(database, mode, action) {
  return new Promise((resolve, reject) => {
    let tx;
    let result;
    let failure;
    try {
      tx = database.transaction(storeName, mode);
      action(tx.objectStore(storeName), value => { result = value; });
    } catch {
      try { tx?.abort(); } catch { /* Already finished. */ }
      reject(unavailable('Reading state transaction unavailable'));
      return;
    }
    const timeout = setTimeout(() => {
      failure = unavailable('Reading state transaction timed out');
      try { tx.abort(); } catch { /* Completion will settle the promise. */ }
    }, 4000);
    tx.oncomplete = () => { clearTimeout(timeout); resolve(result); };
    tx.onabort = () => { clearTimeout(timeout); reject(failure || unavailable('Reading state transaction failed')); };
    tx.onerror = () => { failure = unavailable('Reading state transaction failed'); };
  });
}

function readRecord(database) {
  return transaction(database, 'readonly', (store, result) => {
    const request = store.get(recordKey);
    request.onsuccess = () => result(request.result);
  });
}

function compareAndPut(database, expected, next, canWrite = () => true) {
  return transaction(database, 'readwrite', (store, result) => {
    const request = store.get(recordKey);
    request.onsuccess = () => {
      if (!canWrite() || JSON.stringify(request.result) !== JSON.stringify(expected)) { result(false); return; }
      if (next === undefined) store.delete(recordKey);
      else store.put(next, recordKey);
      result(true);
    };
  });
}

async function fingerprint(raw) {
  try {
    const bytes = new TextEncoder().encode(raw === null ? 'null' : `string:${raw}`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  } catch { throw unavailable('Reading state fingerprints unavailable'); }
}

function parseRaw(raw, parse) {
  try { return parse(raw); }
  catch { throw unreadable('Invalid saved state'); }
}

function withoutRecent(state) {
  const { recent, _versoRevision, ...other } = state;
  return JSON.stringify(other);
}

function isRecentUpdate(before, after) {
  const [id] = after;
  return typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)
    && JSON.stringify(after) === JSON.stringify([id, ...before.filter(item => item !== id)].slice(0, 20));
}

async function chooseState(record, raw, parse) {
  // Even when a cached mirror is stale, never overwrite malformed local data.
  parseRaw(raw, parse);
  if (record === undefined) return { state: parseRaw(raw, parse), digest: await fingerprint(raw) };
  if (!record || typeof record !== 'object' || typeof record.raw !== 'string'
    || !/^[a-f0-9]{64}$/.test(record.digest) || !Array.isArray(record.ancestors)
    || record.ancestors.length > fingerprintLimit
    || !record.ancestors.every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
    || (record.initialMirrorMissing !== undefined && record.initialMirrorMissing !== true)
    || await fingerprint(record.raw) !== record.digest) throw unreadable('Invalid reading state record');
  const state = parseRaw(record.raw, parse);
  if (record.initialMirrorMissing && (!record.ancestors.includes(await fingerprint(null)) || withoutRecent(state) !== withoutRecent(parseRaw(null, parse)))) throw unreadable('Invalid initial reading state');
  // A missing mirror may be an intentional deletion, not merely a stale cache.
  if (raw === null && !record.initialMirrorMissing) throw unavailable('Reading state mirror is missing');
  const mirrorDigest = await fingerprint(raw);
  if (mirrorDigest !== record.digest && !record.ancestors.includes(mirrorDigest)) throw unavailable('Reading state mirror has an unknown update');
  return { state, digest: record.digest };
}

async function resolvedRecord(database, key, parse, canRecover) {
  for (let attempt = 0; attempt < 16; attempt++) {
    const record = await readRecord(database);
    const mirror = readMirror(key);
    if (!record?.pending) {
      try {
        const current = await chooseState(record, mirror, parse);
        if (record?.initialMirrorMissing && mirror !== null && canRecover()) {
          const { initialMirrorMissing, ...published } = record;
          await compareAndPut(database, record, published, canRecover);
          continue;
        }
        return { record, mirror, current };
      }
      catch (error) {
        // The mirror can advance after the database snapshot was read. Retry
        // only if the authoritative record actually changed in the meantime.
        if (error.kind === 'lock' && JSON.stringify(await readRecord(database)) !== JSON.stringify(record)) continue;
        throw error;
      }
    }
    const { pending: candidate, pendingKind, ...base } = record;
    // Validate both versions before considering recovery, and never guess which
    // version won when the mirror has not observed the prepared write.
    if (base.raw !== null) await chooseState(base, base.raw, parse);
    else if (base.initialMirrorMissing || base.digest !== await fingerprint(null) || !Array.isArray(base.ancestors) || base.ancestors.length) throw unreadable('Invalid initial reading state record');
    await chooseState(candidate, candidate.raw, parse);
    const previous = parseRaw(base.raw, parse);
    const proposed = parseRaw(candidate.raw, parse);
    if (!candidate.ancestors.includes(base.digest) || proposed._versoRevision !== (previous._versoRevision ?? 0) + 1) throw unreadable('Invalid prepared reading state');
    if (pendingKind !== undefined && !['recent', 'user'].includes(pendingKind)) throw unreadable('Invalid prepared reading state kind');
    const recentOnly = pendingKind === 'recent';
    if (recentOnly && (withoutRecent(previous) !== withoutRecent(proposed) || !isRecentUpdate(previous.recent, proposed.recent))) throw unreadable('Invalid prepared reading history');
    parseRaw(mirror, parse);
    if (mirror !== candidate.raw) {
      // A verified history-only write can recover without publishing its mirror;
      // saved poems, preferences and unknown fields are identical in both states.
      if (!recentOnly) throw new ReadingStateError('pending', 'Reading state update was interrupted');
      if (base.raw === null) {
        if (mirror !== null) throw unavailable('Reading state mirror has an unknown update');
      } else await chooseState(base, mirror, parse);
    }
    if (!canRecover()) throw unavailable('Reading state recovery was canceled');
    // Only a first history write can legitimately have no mirror yet. Remove
    // this marker as soon as a mirror is observed, so later deletion stays safe.
    const recovered = recentOnly && mirror === null ? { ...candidate, initialMirrorMissing: true } : candidate;
    if (await compareAndPut(database, record, recovered, canRecover)) continue;
  }
  throw unavailable('Reading state changed too often to read safely');
}

function readMirror(key) {
  try { return localStorage.getItem(key); }
  catch { throw unreadable('Reading state mirror unavailable'); }
}

export async function readCommittedState(key, parse, canRecover = () => true) {
  const database = await openDatabase();
  try {
    return (await resolvedRecord(database, key, parse, canRecover)).current.state;
  } finally { database.close(); }
}

export async function writeCommittedState(key, parse, change, expectedRevision, canWrite, silent = false) {
  const database = await openDatabase();
  try {
    for (let attempt = 0; attempt < 16; attempt++) {
      if (!canWrite()) return { result: false };
      const { record, mirror: mirrorBefore, current } = await resolvedRecord(database, key, parse, canWrite);
      if (expectedRevision !== undefined && (current.state._versoRevision ?? 0) !== expectedRevision) return { result: 'conflict', state: current.state };
      if ((current.state._versoRevision ?? 0) === Number.MAX_SAFE_INTEGER) throw unavailable('Reading state revision exhausted');
      const before = silent ? withoutRecent(current.state) : '';
      const recentBefore = silent ? [...current.state.recent] : [];
      change(current.state);
      if (silent && (withoutRecent(current.state) !== before || !isRecentUpdate(recentBefore, current.state.recent))) throw unavailable('A silent update changed saved data');
      current.state._versoRevision = (current.state._versoRevision ?? 0) + 1;
      const raw = JSON.stringify(current.state);
      const digest = await fingerprint(raw);
      const allAncestors = [...new Set([current.digest, ...(record?.ancestors || [])])];
      const missingDigest = record?.initialMirrorMissing ? await fingerprint(null) : '';
      const ancestors = missingDigest
        ? [...allAncestors.filter(value => value !== missingDigest).slice(0, fingerprintLimit - 1), missingDigest]
        : allAncestors.slice(0, fingerprintLimit);
      const candidate = { raw, digest, ancestors };
      const base = record || { raw: mirrorBefore, digest: current.digest, ancestors: [] };
      const prepared = { ...base, pending: candidate, pendingKind: silent ? 'recent' : 'user' };
      if (!canWrite()) return { result: false };
      if (!await compareAndPut(database, record, prepared)) continue;
      // Keep the previous and proposed state until the mirror is confirmed.
      // An interrupted or ambiguous write must not destroy either version.
      try {
        if (!canWrite()) {
          if (await compareAndPut(database, prepared, record)) return { result: false };
          return { result: false, state: current.state, uncertain: true };
        }
        const mirror = readMirror(key);
        parseRaw(mirror, parse);
        if ((mirror === null && !(mirrorBefore === null && (record === undefined || record.initialMirrorMissing))) || ![digest, ...ancestors].includes(await fingerprint(mirror)) || !canWrite()) {
          if (await compareAndPut(database, prepared, record)) return { result: false, failure: 'lock' };
          return { result: false, state: current.state, uncertain: true };
        }
        localStorage.setItem(key, raw);
      } catch {
        try {
          if (await compareAndPut(database, prepared, record)) return { result: false, state: current.state, failure: 'write' };
        } catch { /* Preserve the prepared state for recovery. */ }
        return { result: false, state: current.state, uncertain: true };
      }
      try {
        if (!canWrite() || readMirror(key) !== raw) return { result: false, state: current.state, uncertain: true };
        if (!await compareAndPut(database, prepared, candidate, canWrite)) {
          const latest = await readRecord(database);
          if (JSON.stringify(latest) !== JSON.stringify(candidate)) {
            const { initialMirrorMissing, ...published } = latest || {};
            if (!initialMirrorMissing || JSON.stringify(published) !== JSON.stringify(candidate)
              || !await compareAndPut(database, latest, candidate, canWrite)) return { result: false, state: current.state, uncertain: true };
          }
        }
      } catch { return { result: false, state: current.state, uncertain: true }; }
      return { result: true, state: current.state };
    }
    throw unavailable('Reading state changed too often to update safely');
  } finally { database.close(); }
}
