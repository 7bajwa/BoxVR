// BOXFLOW — on-device storage. Everything is local to this browser on this device:
// preferences + top-10 scores in localStorage, custom-level audio in IndexedDB.

const P = 'boxflow.';

export const store = {
  get(k, d) { try { const v = localStorage.getItem(P + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch { /* private mode / quota */ } },
};

export const DEFAULT_PREFS = {
  mode: 'endless',        // 'endless' | 'songs'
  scene: 'neon-city',
  level: 'neon-drive',
  difficulty: 'normal',
  speed: 1,
  ramp: false,            // endless: +1× every minute
  gameOver: true,         // 3 misses in a row ends the run
  strictDir: true,        // wrong punch direction counts as a mistake
  targetHeight: 160,      // cm — straight punches hit at this height
  haptics: 80,            // % of max controller rumble
  music: true,
  haze: 1,
  reflections: true,
};

export function loadPrefs() { return { ...DEFAULT_PREFS, ...store.get('prefs', {}) }; }
export function savePrefs(p) { store.set('prefs', p); }

// ---- top-10 local leaderboards, one per board key ----
export function boardKey({ mode, level, difficulty, ramp }) {
  return mode === 'songs' ? `song:${level}:${difficulty}` : ramp ? 'endless:ramp' : 'endless';
}
export function topScores(key) { return store.get('scores.' + key, []); }
// Returns the 1-based rank of the new entry, or 0 if it didn't make the top 10.
export function addScore(key, entry) {
  const list = topScores(key);
  const e = { ...entry, date: Date.now() };
  list.push(e);
  list.sort((a, b) => b.score - a.score);
  const rank = list.indexOf(e) + 1;
  store.set('scores.' + key, list.slice(0, 10));
  return rank <= 10 ? rank : 0;
}

// ---- tiny IndexedDB key/value (custom level audio blobs) ----
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('boxflow', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function idbSet(key, val) {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(val, key); t.oncomplete = res; t.onerror = () => rej(t.error); });
}
export async function idbGet(key) {
  try {
    const d = await db();
    return await new Promise((res, rej) => { const r = d.transaction('kv').objectStore('kv').get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  } catch { return null; }
}
