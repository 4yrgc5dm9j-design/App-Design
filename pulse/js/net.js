// Netzwerk-Schicht: direkte Abfrage für CORS-freundliche APIs und die vom Daten-Job
// erzeugten JSON-Dateien; alles andere nur über den (optionalen) eigenen Proxy.
import { state } from './store.js';

const CORS_OK = [
  'tagesschau.de', 'openligadb.de', 'espn.com', 'open-meteo.com', 'wikipedia.org',
  'guardianapis.com', 'coingecko.com', 'raw.githubusercontent.com',
];

// Vom GitHub-Actions-Job alle 10 Minuten erzeugte Daten (Branch „data“)
export const DATA = 'https://raw.githubusercontent.com/4yrgc5dm9j-design/App-Design/data/';
export const hasProxy = () => !!(state.settings.proxy || '').trim();

function proxyList() {
  const list = [];
  const own = (state.settings.proxy || '').trim();
  if (own) list.push({ id: 'own', wrap: u => own.includes('{url}') ? own.replace('{url}', encodeURIComponent(u)) : own + encodeURIComponent(u) });
  return list;
}

let preferred = null;

async function timed(url, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchText(url, { timeout = 12000, validate } = {}) {
  const host = new URL(url).hostname;
  const ok = txt => txt && (!validate || validate(txt));
  if (CORS_OK.some(d => host === d || host.endsWith('.' + d))) {
    try {
      const txt = await timed(url, timeout);
      if (ok(txt)) return txt;
    } catch { /* weiter mit Proxy */ }
  }
  const list = proxyList();
  if (preferred) list.sort((a, b) => (b.id === preferred) - (a.id === preferred));
  let lastErr = new Error(list.length ? 'Keine Verbindung' : 'Quelle nur mit eigenem Proxy abrufbar');
  for (const p of list) {
    try {
      const txt = await timed(p.wrap(url), timeout);
      if (!ok(txt)) throw new Error('Ungültige Antwort');
      preferred = p.id;
      return txt;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

export async function fetchJSON(url, opts = {}) {
  let parsed;
  await fetchText(url, {
    ...opts,
    validate: t => {
      try { parsed = JSON.parse(t); } catch { return false; }
      return !opts.validate || opts.validate(parsed);
    },
  });
  return parsed;
}

export const isXml = t => /<(rss|feed|rdf:RDF|channel)[\s>]/i.test(t.slice(0, 3000));

// Einfache Parallelitäts-Begrenzung
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); } catch (e) { out[idx] = null; }
    }
  });
  await Promise.all(workers);
  return out;
}
