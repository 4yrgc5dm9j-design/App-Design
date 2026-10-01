// Pulse-Daten-Job: sammelt News (inkl. Volltext), Börsenkurse und Sportdaten ein und
// schreibt statische JSON-Dateien, die die App ohne CORS-Proxy laden kann.
// Aufruf: node scripts/build-data.mjs <ausgabe-ordner>
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { CATS, SOURCES, LEAGUES, MARKET_UNIVERSE, NATIONAL_COMPS, symFile } from '../pulse/js/sources.js';

const OUT = path.resolve(process.argv[2] || 'out');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const NOW = Date.now();
const stats = { feeds: 0, feedErr: [], articles: 0, quotes: 0, quoteErr: 0, sports: 0 };

// ---------- Helfer ----------
async function get(url, { timeout = 12000, json = false, headers = {} } = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { signal: c.signal, redirect: 'follow', headers: { 'User-Agent': UA, 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.7', ...headers } });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 120).replace(/\s+/g, ' '));
    return json ? await r.json() : await r.text();
  } finally { clearTimeout(t); }
}
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch { out[k] = null; } }
  }));
  return out;
}
async function write(rel, data) {
  const f = path.join(OUT, rel);
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, JSON.stringify(data));
}
async function readOld(rel) {
  try { return JSON.parse(await fs.readFile(path.join(OUT, rel), 'utf8')); } catch { return null; }
}
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 'a' + (h >>> 0).toString(36); }
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', ndash: '–', mdash: '—', hellip: '…', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è', euro: '€' };
function decode(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isNaN(n) ? m : String.fromCodePoint(n); }
    return ENT[e] ?? m;
  });
}
const cdata = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
const strip = s => decode(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const httpUrl = u => /^https?:\/\//i.test(u || '') ? u : '';

// ---------- RSS / Atom ----------
function tag(xml, name) {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  return m ? cdata(m[1]).trim() : '';
}
function parseFeed(xml, src, cat) {
  const blocks = [...xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)].map(m => m[0]).slice(0, 40);
  return blocks.map(b => {
    let link = decode(tag(b, 'link'));
    if (!httpUrl(link)) link = decode((/<link[^>]*href="([^"]+)"/i.exec(b) || [])[1] || '') || decode(tag(b, 'guid'));
    const desc = decode(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content'));
    const encoded = decode(tag(b, 'content:encoded'));
    let img = '';
    for (const m of b.matchAll(/<(media:content|media:thumbnail|enclosure)\b([^>]*)>/gi)) {
      const url = (/url="([^"]+)"/i.exec(m[2]) || [])[1];
      const type = (/type="([^"]+)"/i.exec(m[2]) || [])[1] || '';
      if (url && !/(audio|video)\//.test(type)) { img = decode(url); break; }
    }
    if (!img) img = decode((/<img[^>]+src=["']([^"']+)["']/i.exec(desc + encoded) || [])[1] || '');
    let title = strip(tag(b, 'title'));
    let publisher = src.name;
    if (src.agg) {
      const s = strip(tag(b, 'source'));
      if (s) { publisher = s; if (title.endsWith(' - ' + s)) title = title.slice(0, -(s.length + 3)); }
    }
    const date = Date.parse(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')) || 0;
    const url = httpUrl(link);
    return {
      id: hash(url || title), title, teaser: src.agg ? '' : strip(desc).slice(0, 400), url, image: httpUrl(img), date,
      source: src.id, publisher, cat, breaking: /^(\+\+\+|eil(meldung)?[:+ ]|breaking)/i.test(title),
      _html: encoded.length > 800 ? encoded : '',
    };
  }).filter(i => i.title && i.url && (!i.date || NOW - i.date < 7 * 864e5));
}

// ---------- tagesschau & Guardian ----------
function tsImage(t) {
  const v = t?.teaserImage?.imageVariants || {};
  return v['16x9-960'] || v['16x9-640'] || v['16x9-512'] || Object.values(v)[0] || '';
}
function normTs(t, cat) {
  const url = t.shareURL || t.detailsweb || '';
  return {
    id: hash(url || t.sophoraId || t.title), title: t.title || '', teaser: t.firstSentence || '', topline: t.topline || '',
    url: httpUrl(url), image: httpUrl(tsImage(t)), date: Date.parse(t.date) || 0, source: 'tagesschau', publisher: 'tagesschau', cat,
    breaking: !!t.breakingNews, tags: (t.tags || []).map(x => x.tag).slice(0, 8),
    video: httpUrl(t.streams?.h264m || t.streams?.adaptivestreaming || t.streams?.h264s || ''),
    _details: httpUrl(t.details || ''),
  };
}
const tsCache = new Map();
async function tagesschau(ressort, cat) {
  const url = ressort === 'homepage' ? 'https://www.tagesschau.de/api2u/homepage/' : `https://www.tagesschau.de/api2u/news/?ressort=${ressort}`;
  if (!tsCache.has(url)) tsCache.set(url, get(url, { json: true }));
  const d = await tsCache.get(url);
  return (d.news || []).filter(t => t.title && t.type !== 'webview').map(t => normTs(t, cat));
}
async function guardian(section, cat) {
  const u = new URL('https://content.guardianapis.com/search');
  u.searchParams.set('api-key', process.env.GUARDIAN_KEY || 'test');
  u.searchParams.set('show-fields', 'thumbnail,trailText,body');
  u.searchParams.set('page-size', '20');
  u.searchParams.set('order-by', 'newest');
  if (section) u.searchParams.set('section', section);
  const d = await get(u.href, { json: true });
  return (d.response?.results || []).map(r => ({
    id: hash(r.webUrl), title: r.webTitle, teaser: strip(r.fields?.trailText || ''), url: r.webUrl,
    image: httpUrl(r.fields?.thumbnail || ''), date: Date.parse(r.webPublicationDate) || 0,
    source: 'guardian', publisher: 'The Guardian', cat, _html: r.fields?.body || '',
  }));
}

// ---------- Volltext ----------
function htmlToBlocks(html) {
  let h = String(html || '')
    .replace(/<(script|style|noscript|nav|aside|footer|header|form|figure|iframe|svg|button)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const blocks = [], seen = new Set();
  for (const m of h.matchAll(/<(p|h2|h3|blockquote|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = m[1].toLowerCase(), text = strip(m[2]);
    if (!text || seen.has(text)) continue;
    if ((t === 'p' && text.length < 40) || (t === 'li' && text.length < 40) || ((t === 'h2' || t === 'h3') && (text.length > 160 || text.length < 3))) continue;
    if (/^(Lesen Sie auch|Mehr zum Thema|Anzeige|Werbung|Abonnieren|Jetzt abonnieren|Newsletter)/i.test(text)) continue;
    seen.add(text);
    blocks.push({ t: t === 'blockquote' ? 'q' : t.startsWith('h') ? 'h' : 'p', text });
  }
  return blocks;
}
function findArticleBody(o) {
  if (!o || typeof o !== 'object') return '';
  if (typeof o.articleBody === 'string' && o.articleBody.length > 400) return o.articleBody;
  for (const v of Object.values(o)) { const r = findArticleBody(v); if (r) return r; }
  return '';
}
function extractPage(html) {
  const og = (/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html) || /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html) || [])[1] || '';
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const body = findArticleBody(JSON.parse(m[1].trim()));
      if (body) {
        let paras = decode(body).split(/\n+/).map(s => s.trim()).filter(Boolean);
        if (paras.length === 1 && body.length > 1200) {
          const sents = paras[0].match(/[^.!?]+[.!?]+(\s|$)/g) || [paras[0]];
          paras = [];
          for (let i = 0; i < sents.length; i += 4) paras.push(sents.slice(i, i + 4).join('').trim());
        }
        return { image: decode(og), blocks: paras.map(text => ({ t: 'p', text })) };
      }
    } catch { /* weiter */ }
  }
  const arts = [...html.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map(m => m[0]).sort((a, b) => b.length - a.length);
  let blocks = htmlToBlocks(arts[0] || '');
  if (blocks.filter(b => b.t === 'p').length < 3) blocks = htmlToBlocks((/<main\b[\s\S]*?<\/main>/i.exec(html) || [html])[0]);
  return { image: decode(og), blocks };
}
async function tsDetails(url) {
  const d = await get(url, { json: true });
  const blocks = [];
  for (const c of d.content || []) {
    if (c.type === 'text' || c.type === 'headline') {
      const v = c.value || '';
      const bs = htmlToBlocks(/<(p|h\d)\b/i.test(v) ? v : `<p>${v}</p>`);
      blocks.push(...(c.type === 'headline' ? bs.map(b => ({ ...b, t: 'h' })) : bs));
    }
    else if (c.type === 'quotation' && c.quotation?.text) blocks.push({ t: 'q', text: strip(c.quotation.text) });
    else if (c.type === 'box' && c.box) { if (c.box.title) blocks.push({ t: 'h', text: strip(c.box.title) }); if (c.box.text) blocks.push(...htmlToBlocks(c.box.text)); }
  }
  return { blocks };
}
async function fullText(it) {
  if (it._details) return tsDetails(it._details);
  if (it._html) return { blocks: htmlToBlocks(it._html) };
  if (/news\.google\.com/.test(it.url)) return null;
  return extractPage(await get(it.url, { timeout: 10000 }));
}

// ---------- News bauen ----------
function merge(lists) {
  const seen = new Set(), out = [];
  for (const it of lists.flat().filter(Boolean).sort((a, b) => b.date - a.date)) {
    const k = it.title.toLowerCase().replace(/[^a-z0-9äöüß]/g, '').slice(0, 70);
    if (seen.has(k) || seen.has(it.id)) continue;
    seen.add(k); seen.add(it.id);
    out.push(it);
  }
  return out;
}
async function buildNews() {
  const rssCache = new Map();
  const perCat = {};
  for (const cat of CATS.map(c => c.id)) {
    const tasks = [];
    for (const s of SOURCES) {
      if (s.kind === 'tagesschau') {
        if (s.ressorts[cat]) tasks.push(() => tagesschau(s.ressorts[cat], cat));
        if (cat === 'politik') tasks.push(() => tagesschau('ausland', cat));
      } else if (s.kind === 'guardian') {
        if (cat in s.sections) tasks.push(() => guardian(s.sections[cat], cat));
      } else if (s.feeds?.[cat]) {
        const url = s.feeds[cat];
        tasks.push(async () => {
          if (!rssCache.has(url)) rssCache.set(url, get(url));
          try { const x = parseFeed(await rssCache.get(url), s, cat); stats.feeds++; return x; }
          catch (e) { stats.feedErr.push(`${s.id}/${cat}: ${e.message}`); return []; }
        });
      }
    }
    const lists = await pool(tasks, 8, t => t());
    // pro Quelle höchstens 25 Artikel, damit keine Quelle dominiert
    const capped = lists.filter(Boolean).map(l => l.slice(0, 25));
    perCat[cat] = merge(capped).slice(0, 180);
    console.log(`news/${cat}: ${perCat[cat].length} Artikel aus ${new Set(perCat[cat].map(i => i.publisher)).size} Quellen`);
  }

  // Volltexte: die neuesten Artikel jeder Kategorie (je Quelle begrenzt)
  const wanted = new Map();
  for (const cat of Object.keys(perCat)) {
    const perSrc = {};
    for (const it of perCat[cat]) {
      if (it.source === 'google') continue;
      perSrc[it.source] = (perSrc[it.source] || 0) + 1;
      if (perSrc[it.source] <= 8 && !wanted.has(it.id)) wanted.set(it.id, it);
    }
  }
  const old = new Set((await readOld('articles/index.json')) || []);
  const have = new Set();
  const todo = [...wanted.values()].filter(it => { if (old.has(it.id)) { have.add(it.id); return false; } return true; });
  console.log(`Volltexte: ${have.size} vorhanden, ${todo.length} neu`);
  await pool(todo, 10, async it => {
    try {
      const r = await fullText(it);
      const blocks = (r?.blocks || []).slice(0, 80);
      const len = blocks.reduce((a, b) => a + b.text.length, 0);
      if (blocks.filter(b => b.t === 'p').length >= 2 && len > 500) {
        await write(`articles/${it.id}.json`, { blocks, image: httpUrl(r.image || '') });
        have.add(it.id); stats.articles++;
      }
    } catch { /* Paywall/Timeout: kein Volltext */ }
  });
  // alte Volltexte entfernen
  try {
    for (const f of await fs.readdir(path.join(OUT, 'articles'))) {
      const id = f.replace('.json', '');
      if (f !== 'index.json' && !wanted.has(id) && !have.has(id)) await fs.rm(path.join(OUT, 'articles', f));
    }
  } catch { /* leer */ }
  const keep = [...have].filter(id => wanted.has(id));
  await write('articles/index.json', keep);
  const bodySet = new Set(keep);
  for (const [cat, items] of Object.entries(perCat)) {
    await write(`news/${cat}.json`, {
      updated: NOW,
      items: items.map(({ _html, _details, ...i }) => (bodySet.has(i.id) ? { ...i, body: 1 } : i)),
    });
  }
  // Video-News
  try {
    const d = await get('https://www.tagesschau.de/api2u/news/?ressort=video', { json: true });
    await write('news/video.json', { updated: NOW, items: (d.news || []).filter(n => n.streams).slice(0, 20).map(n => { const x = normTs(n, 'top'); delete x._details; return x; }) });
  } catch (e) { console.log('video:', e.message); }
}

// ---------- Börse ----------
const YH = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
// Yahoo blockt Node-fetch (429), antwortet aber curl mit Mobil-Kennung
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
function curlJson(url) {
  return new Promise((res, rej) => {
    execFile('curl', ['-s', '--max-time', '15', '-A', MOBILE_UA, '-H', 'Origin: https://finance.yahoo.com', '-w', '\n%{http_code}', url], { maxBuffer: 20e6 }, (err, out) => {
      if (err) return rej(err);
      const i = out.lastIndexOf('\n');
      const code = out.slice(i + 1).trim();
      if (code !== '200') return rej(new Error('HTTP ' + code));
      try { res(JSON.parse(out.slice(0, i))); } catch (e) { rej(e); }
    });
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function yChart(sym, range, interval) {
  let err;
  for (let attempt = 0; attempt < 4; attempt++) {
    const h = YH[attempt % 2];
    try {
      const d = await curlJson(`${h}/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`);
      const r = d?.chart?.result?.[0];
      if (!r) throw new Error('leer');
      await sleep(250);
      return r;
    } catch (e) { err = e; await sleep(/429/.test(e.message) ? 3000 * (attempt + 1) : 500); }
  }
  throw err;
}
const round = v => v == null ? null : +v.toPrecision(7);
function series(r) {
  const t = r.timestamp || [], c = r.indicators?.quote?.[0]?.close || [];
  const out = { t: [], c: [] };
  t.forEach((x, i) => { if (c[i] != null) { out.t.push(x); out.c.push(round(c[i])); } });
  return out;
}
// CNBC-Kurse (Sammelabfrage, kein Schlüssel nötig) – aktuelle Kurse für alle Werte in wenigen Anfragen
const CNBC_MAP = {
  '^GDAXI': '.GDAXI', '^MDAXI': '.MDAXI', '^TECDAX': '.TECDAX', '^STOXX50E': '.STOXX50E', '^GSPC': '.SPX', '^IXIC': '.IXIC',
  '^DJI': '.DJI', '^N225': '.N225', '^FTSE': '.FTSE', '^SSMI': '.SSMI', '^HSI': '.HSI',
  'EURUSD=X': 'EUR=', 'EURGBP=X': 'EURGBP=', 'EURCHF=X': 'EURCHF=', 'GC=F': '@GC.1', 'SI=F': '@SI.1', 'BZ=F': '@LCO.1', 'CL=F': '@CL.1',
  'BRK-B': 'BRK.B',
};
const SUFFIX = { DE: 'DE', AS: 'NL', PA: 'FR', SW: 'CH', L: 'GB', CO: 'DK', HE: 'FI' };
function cnbcSym(sym) {
  if (CNBC_MAP[sym]) return CNBC_MAP[sym];
  if (/-EUR$/.test(sym)) return null; // Krypto kommt von Yahoo/CoinGecko
  const m = /^(.+)\.([A-Z]+)$/.exec(sym);
  if (m) return SUFFIX[m[2]] ? `${m[1]}-${m[2] === 'DE' ? 'DE' : SUFFIX[m[2]]}` : null;
  return sym;
}
const numv = v => { if (v == null || v === '' || v === 'UNCH') return v === 'UNCH' ? 0 : null; const n = parseFloat(String(v).replace(/[,%+]/g, '')); return isNaN(n) ? null : n; };
async function cnbcQuotes(symbols) {
  const pairs = symbols.map(s => [s, cnbcSym(s)]).filter(p => p[1]);
  const out = {};
  for (let i = 0; i < pairs.length; i += 40) {
    const chunk = pairs.slice(i, i + 40);
    const url = `https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${encodeURIComponent(chunk.map(p => p[1]).join('|'))}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1`;
    try {
      const d = await curlJson(url);
      let list = d?.FormattedQuoteResult?.FormattedQuote || [];
      if (!Array.isArray(list)) list = [list];
      if (i === 0) console.log('CNBC Beispiel:', JSON.stringify(list[0] || d).slice(0, 400));
      for (const q of list) {
        const pair = chunk.find(p => p[1].toUpperCase() === String(q.symbol || '').toUpperCase());
        if (!pair) continue;
        const price = numv(q.last), prev = numv(q.previous_day_closing) ?? (price != null && numv(q.change) != null ? price - numv(q.change) : null);
        if (price == null) continue;
        out[pair[0]] = {
          name: q.shortName || q.name, longName: q.name || q.shortName, currency: q.currencyCode || '', exchange: q.exchange || '',
          price, prev, dayHigh: numv(q.high), dayLow: numv(q.low), volume: numv(q.volume), high52: numv(q.yrhiprice), low52: numv(q.yrloprice),
          time: Date.parse(q.last_time) || NOW,
        };
      }
    } catch (e) { console.log('CNBC:', e.message); }
    await sleep(300);
  }
  return out;
}

async function buildMarkets() {
  const quotes = {};
  const cnbc = await cnbcQuotes(MARKET_UNIVERSE);
  console.log(`CNBC-Kurse: ${Object.keys(cnbc).length}/${MARKET_UNIVERSE.length}`);
  // Charts von Yahoo: sparsam, nacheinander, mit Budget pro Lauf
  let budget = 160, blocked = false;
  const yahoo = async (sym, range, interval) => {
    if (blocked || budget <= 0) throw new Error('übersprungen');
    budget--;
    try { return await yChart(sym, range, interval); }
    catch (e) { if (/429/.test(e.message)) { stats.yahoo429 = (stats.yahoo429 || 0) + 1; if (stats.yahoo429 >= 5) blocked = true; } throw e; }
  };
  // Werte ohne Chart-Historie zuerst, damit sich die Lücken schnell füllen
  const ages = Object.fromEntries(await Promise.all(MARKET_UNIVERSE.map(async s => [s, (await readOld(`markets/s/${symFile(s)}.json`))?.y1t || 0])));
  const order = [...MARKET_UNIVERSE].sort((a, b) => ages[a] - ages[b]);
  await pool(order, 1, async sym => {
    const file = `markets/s/${symFile(sym)}.json`;
    const old = await readOld(file);
    const rec = { ...(old || {}), sym };
    let meta = cnbc[sym] ? { ...(old?.meta || {}), ...cnbc[sym], type: old?.meta?.type || '' } : null;
    try {
      if (!old?.d1t || NOW - old.d1t > 20 * 60e3 || !meta) {
        const d1 = await yahoo(sym, '1d', '5m');
        const m = d1.meta || {};
        rec.d1 = series(d1); rec.d1t = NOW;
        const ymeta = {
          name: m.shortName || m.longName || sym, longName: m.longName || m.shortName || sym, currency: m.currency || '',
          exchange: m.fullExchangeName || m.exchangeName || '', type: m.instrumentType || '',
          price: m.regularMarketPrice, prev: m.previousClose ?? m.chartPreviousClose, dayHigh: m.regularMarketDayHigh,
          dayLow: m.regularMarketDayLow, volume: m.regularMarketVolume, high52: m.fiftyTwoWeekHigh, low52: m.fiftyTwoWeekLow,
          time: (m.regularMarketTime || 0) * 1000,
        };
        // Yahoo-Namen (z. B. „SAP SE“) bevorzugen, CNBC-Kurs ist meist aktueller
        meta = meta ? { ...ymeta, ...meta, name: ymeta.name, longName: ymeta.longName, type: ymeta.type } : ymeta;
      }
      if (!old?.d5t || NOW - old.d5t > 60 * 60e3) { rec.d5 = series(await yahoo(sym, '5d', '30m')); rec.d5t = NOW; }
      if (!old?.y1t || NOW - old.y1t > 6 * 3600e3) { rec.y1 = series(await yahoo(sym, '1y', '1d')); rec.y1t = NOW; }
      if (!old?.y5t || NOW - old.y5t > 24 * 3600e3) { rec.y5 = series(await yahoo(sym, '5y', '1wk')); rec.y5t = NOW; }
    } catch (e) {
      if (!/übersprungen/.test(e.message)) { stats.quoteErr++; if (stats.quoteErr <= 3) console.log(`Chart ${sym}: ${e.message}`); }
    }
    meta ||= old?.meta;
    if (!meta) return;
    rec.meta = meta; rec.t = NOW;
    await write(file, rec);
    quotes[sym] = { ...meta, spark: (rec.d1?.c || []).filter((_, i) => i % 3 === 0) };
    stats.quotes++;
  });
  await write('markets/quotes.json', { updated: NOW, quotes });
  try {
    const cg = await get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=eur&order=market_cap_desc&per_page=12&page=1&sparkline=true&price_change_percentage=24h,7d', { json: true });
    await write('markets/crypto.json', cg);
  } catch (e) { console.log('coingecko:', e.message); }
}

// ---------- Sport (Fallback, falls ESPN direkt nicht erreichbar ist) ----------
// Länderspiele: Ergebnisse der letzten 6 und Termine der nächsten 9 Monate
const slimEvent = e => ({ id: e.id, date: e.date, name: e.name, competitions: (e.competitions || []).slice(0, 1).map(c => ({
  date: c.date, status: c.status, venue: c.venue ? { fullName: c.venue.fullName } : undefined,
  competitors: (c.competitors || []).map(x => ({ homeAway: x.homeAway, score: x.score, winner: x.winner, team: x.team && { id: x.team.id, displayName: x.team.displayName, shortDisplayName: x.team.shortDisplayName, logo: x.team.logo } })),
})), status: e.status });
const ESPN_WEB = 'https://site.web.api.espn.com/apis/site/v2/sports/';
async function buildNational() {
  const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
  const old = await readOld('sports/national.json');
  // Historie nur alle 6 Stunden komplett neu laden; dazwischen nur die Spiele rund um heute
  const full = !old?.full || NOW - old.full > 6 * 3600e3;
  const from = NOW - (full ? 183 : 3) * 864e5, to = NOW + (full ? 274 : 10) * 864e5;
  const all = full ? [] : (old.events || []);
  await pool(NATIONAL_COMPS, 2, async c => {
    let cal;
    try { cal = await get(`${ESPN_WEB}${c.key}/scoreboard`, { json: true }); }
    catch (e) { console.log(`national ${c.key}: ${e.message}`); return; }
    for (const e of cal.events || []) all.push({ ...slimEvent(e), _comp: c.key });
    // Spieltage aus dem Kalender der Wettbewerbe
    const days = new Set();
    for (const entry of cal.leagues?.[0]?.calendar || []) {
      if (typeof entry === 'string') { const t = Date.parse(entry); if (t >= from && t <= to) days.add(ymd(new Date(t))); continue; }
      for (const x of entry.entries || []) {
        for (let t = Date.parse(x.startDate); t <= Date.parse(x.endDate) && t <= to; t += 864e5) if (t >= from) days.add(ymd(new Date(t)));
      }
    }
    for (const d of [...days].slice(0, 120)) {
      try {
        const r = await get(`${ESPN_WEB}${c.key}/scoreboard?dates=${d}`, { json: true });
        for (const e of r.events || []) all.push({ ...slimEvent(e), _comp: c.key });
      } catch { /* einzelner Tag fehlgeschlagen */ }
      await sleep(120);
    }
  });
  const byId = new Map();
  for (const e of all) byId.set(e.id, e);
  const events = [...byId.values()].filter(e => Date.parse(e.date) >= NOW - 183 * 864e5).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const ger = events.filter(e => e.competitions[0]?.competitors?.some(x => x.team?.displayName === 'Germany'));
  console.log(`Länderspiele: ${events.length} (${full ? 'komplett' : 'aktuell'}), davon Deutschland: ${ger.length}`, ger.slice(-4).map(e => `${e.date.slice(0, 10)} ${e.name}`).join(' | '));
  await write('sports/national.json', { updated: NOW, full: full ? NOW : old.full, events });
}
async function buildSports() {
  await buildNational().catch(e => console.log('national:', e.message));
  await pool(LEAGUES.filter(l => !l.national), 4, async l => {
    const f = l.key.replace('/', '_');
    for (const [kind, url] of [
      ['scoreboard', `${ESPN_WEB}${l.key}/scoreboard`],
      ['standings', `https://site.web.api.espn.com/apis/v2/sports/${l.key}/standings`],
      ...(l.noTeams ? [] : [['teams', `${ESPN_WEB}${l.key}/teams`]]),
    ]) {
      try { await write(`sports/${f}-${kind}.json`, await get(url, { json: true })); stats.sports++; }
      catch (e) { console.log(`sport ${l.key} ${kind}: ${e.message}`); }
    }
  });
}

await fs.mkdir(OUT, { recursive: true });
const t0 = Date.now();
await Promise.all([buildNews(), buildSports()]);
await buildMarkets();
await write('status.json', { updated: NOW, seconds: Math.round((Date.now() - t0) / 1000), ...stats, feedErr: stats.feedErr.slice(0, 60) });
console.log(JSON.stringify({ ...stats, feedErr: stats.feedErr.length }, null, 1));
if (stats.feedErr.length) console.log('Feed-Fehler:\n' + stats.feedErr.join('\n'));
