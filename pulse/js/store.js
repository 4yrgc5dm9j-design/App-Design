// Persistenter App-Zustand (nur lokal im Browser gespeichert)
const KEY = 'pulse.state.v1';

export const DEFAULT_TOPICS = [
  { id: 't1', name: 'Bundesregierung', keywords: ['Bundesregierung', 'Kanzler', 'Bundestag', 'Koalition'], category: 'politik', icon: '🏛️', color: '#7c5cff', alert: true },
  { id: 't2', name: 'Fußball', keywords: ['Bundesliga', 'Champions League', 'DFB', 'FC Bayern'], category: 'sport', icon: '⚽', color: '#22c55e', alert: true },
  { id: 't3', name: 'Wirtschaft', keywords: ['Konjunktur', 'Inflation', 'EZB', 'Wirtschaft'], category: 'wirtschaft', icon: '💼', color: '#f59e0b', alert: false },
  { id: 't4', name: 'Künstliche Intelligenz', keywords: ['KI', 'Künstliche Intelligenz', 'OpenAI', 'Anthropic'], category: 'tech', icon: '🤖', color: '#06b6d4', alert: false },
];

const DEFAULT = {
  onboarded: false,
  profile: { name: '', city: 'Berlin', lat: 52.52, lon: 13.405, birthday: '', team: '', about: '' },
  topics: DEFAULT_TOPICS,
  watchlist: ['^GDAXI', '^GSPC', 'SAP.DE', 'AAPL', 'NVDA', 'BTC-EUR'],
  favLeagues: ['soccer/ger.1', 'soccer/uefa.champions', 'national/dfb'],
  favTeams: [],
  sources: {},
  widgets: [
    { type: 'breaking', on: true },
    { type: 'weather', on: true },
    { type: 'briefing', on: true },
    { type: 'topics', on: true },
    { type: 'markets', on: true },
    { type: 'sports', on: true },
    { type: 'live', on: true },
  ],
  settings: { theme: 'auto', refresh: 5, proxy: '', allBreaking: true, notify: false, textSize: 1, lastTab: 'heute' },
  saved: [],
  seenBreaking: [],
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return clone(DEFAULT);
    const s = JSON.parse(raw);
    const base = clone(DEFAULT);
    return {
      ...base, ...s,
      profile: { ...base.profile, ...(s.profile || {}) },
      settings: { ...base.settings, ...(s.settings || {}) },
    };
  } catch {
    return clone(DEFAULT);
  }
}

export const state = load();
const listeners = new Set();

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Speicher voll oder gesperrt */ }
  listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } });
}
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function resetAll() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith('pulse.')).forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
  location.reload();
}
export function exportState() { return JSON.stringify(state, null, 2); }
export function importState(json) {
  const s = JSON.parse(json);
  Object.keys(state).forEach(k => delete state[k]);
  Object.assign(state, clone(DEFAULT), s);
  save();
}
export function uid() { return Math.random().toString(36).slice(2, 10); }

// ---------- Daten-Cache (localStorage, mit Ablaufzeit) ----------
const CP = 'pulse.c.';
const mem = new Map();

export function cacheGet(key, maxAge = Infinity) {
  let e = mem.get(key);
  if (!e) {
    try {
      const raw = localStorage.getItem(CP + key);
      if (raw) { e = JSON.parse(raw); mem.set(key, e); }
    } catch { /* ignore */ }
  }
  if (!e) return null;
  if (Date.now() - e.t > maxAge) return null;
  return e.d;
}
export function cacheSet(key, data, persist = true) {
  const e = { t: Date.now(), d: data };
  mem.set(key, e);
  if (!persist) return;
  const str = JSON.stringify(e);
  try {
    localStorage.setItem(CP + key, str);
  } catch {
    pruneCache();
    try { localStorage.setItem(CP + key, str); } catch { /* aufgeben */ }
  }
}
function pruneCache() {
  try {
    const entries = Object.keys(localStorage).filter(k => k.startsWith(CP)).map(k => {
      let t = 0;
      try { t = JSON.parse(localStorage.getItem(k)).t; } catch { /* ignore */ }
      return { k, t };
    }).sort((a, b) => a.t - b.t);
    entries.slice(0, Math.ceil(entries.length / 2) + 1).forEach(e => localStorage.removeItem(e.k));
  } catch { /* ignore */ }
}

// Stale-while-revalidate-Lader: liefert frische Daten, sonst veraltete aus dem Cache
const inflight = new Map();
export async function cached(key, ttl, loader, { persist = true } = {}) {
  const fresh = cacheGet(key, ttl);
  if (fresh) return fresh;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const d = await loader();
      cacheSet(key, d, persist);
      return d;
    } catch (err) {
      const stale = cacheGet(key);
      if (stale) return stale;
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}
export function invalidate(prefix = '') {
  for (const k of [...mem.keys()]) if (k.startsWith(prefix)) mem.set(k, { ...mem.get(k), t: 0 });
}
