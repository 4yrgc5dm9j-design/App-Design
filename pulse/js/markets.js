// Börse: Kurse (Yahoo Finance), Krypto (CoinGecko), Watchlist, Charts & technische Analyse
import { state, save, cached, invalidate } from './store.js';
import { fetchJSON, pool, DATA, hasProxy } from './net.js';
import { MARKET_UNIVERSE, symFile } from './sources.js';
import { esc, safeUrl, icon, num, pct, priceFmt, compact, openSheet, toast, sparkSvg, lineChart, skeletonList, empty, errorBox, hashColor, timeAgo } from './ui.js';
import { artRow, loadCategory, searchNews, merge } from './news.js';

export const INDICES = [
  { s: '^GDAXI', n: 'DAX' }, { s: '^MDAXI', n: 'MDAX' }, { s: '^TECDAX', n: 'TecDAX' }, { s: '^STOXX50E', n: 'Euro Stoxx 50' },
  { s: '^GSPC', n: 'S&P 500' }, { s: '^IXIC', n: 'Nasdaq' }, { s: '^DJI', n: 'Dow Jones' }, { s: '^N225', n: 'Nikkei 225' },
  { s: 'EURUSD=X', n: 'EUR/USD' }, { s: 'GC=F', n: 'Gold' }, { s: 'BZ=F', n: 'Öl (Brent)' }, { s: 'BTC-EUR', n: 'Bitcoin' },
];
const KNOWN = { ...Object.fromEntries(INDICES.map(i => [i.s, i.n])), '^FTSE': 'FTSE 100', '^SSMI': 'SMI', '^HSI': 'Hang Seng', 'EURGBP=X': 'EUR/GBP', 'EURCHF=X': 'EUR/CHF', 'SI=F': 'Silber', 'CL=F': 'Öl (WTI)', 'ETH-EUR': 'Ethereum', 'SOL-EUR': 'Solana', 'XRP-EUR': 'XRP' };
const Y1 = 'https://query1.finance.yahoo.com', Y2 = 'https://query2.finance.yahoo.com';

function quoteFromChart(symbol, r) {
  const m = r?.meta || {};
  const closes = r?.indicators?.quote?.[0]?.close || [];
  const price = m.regularMarketPrice ?? closes.filter(x => x != null).pop();
  const prev = m.previousClose ?? m.chartPreviousClose;
  return {
    symbol, name: KNOWN[symbol] || m.shortName || m.longName || symbol, longName: m.longName || m.shortName || KNOWN[symbol] || symbol,
    price, prev, change: price - prev, changePct: prev ? (price / prev - 1) * 100 : null,
    currency: m.currency || '', exchange: m.fullExchangeName || m.exchangeName || '',
    dayHigh: m.regularMarketDayHigh, dayLow: m.regularMarketDayLow, volume: m.regularMarketVolume,
    high52: m.fiftyTwoWeekHigh, low52: m.fiftyTwoWeekLow, type: m.instrumentType || '',
    time: (m.regularMarketTime || 0) * 1000,
    t: (r?.timestamp || []).map(x => x * 1000), closes,
  };
}

// Kursdaten des Daten-Jobs (alle 10 Min.) für eine feste Auswahl an Werten
const qFile = () => cached('mq', 2 * 60e3, () => fetchJSON(`${DATA}markets/quotes.json`, { validate: j => !!j?.quotes }));
const symData = sym => cached('ms:' + sym, 2 * 60e3, () => fetchJSON(`${DATA}markets/s/${symFile(sym)}.json`, { validate: j => !!j?.meta }), { persist: false });
function fromMeta(symbol, m) {
  const change = m.price != null && m.prev != null ? m.price - m.prev : null;
  return {
    symbol, name: KNOWN[symbol] || m.name || symbol, longName: m.longName || m.name || symbol,
    price: m.price, prev: m.prev, change, changePct: m.prev ? (m.price / m.prev - 1) * 100 : null,
    currency: m.currency || '', exchange: m.exchange || '', dayHigh: m.dayHigh, dayLow: m.dayLow, volume: m.volume,
    high52: m.high52, low52: m.low52, type: m.type || '', time: m.time || 0,
  };
}
function sliceRange(rec, range) {
  const pick = s => ({ t: (s?.t || []).map(x => x * 1000), c: s?.c || [] });
  if (range === '1d') return pick(rec.d1);
  if (range === '5d') return pick(rec.d5 || rec.d1);
  if (range === '5y') return pick(rec.y5 || rec.y1);
  const y = pick(rec.y1);
  let from = 0;
  if (range === '1mo') from = Date.now() - 31 * 864e5;
  else if (range === '6mo') from = Date.now() - 183 * 864e5;
  else if (range === 'ytd') from = new Date(new Date().getFullYear(), 0, 1).getTime();
  const i = Math.max(0, y.t.findIndex(t => t >= from));
  return { t: y.t.slice(i), c: y.c.slice(i) };
}
async function liveChart(symbol, range, interval) {
  const d = await fetchJSON(`${Y1}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`,
    { validate: j => !!j?.chart?.result?.[0] });
  return quoteFromChart(symbol, d.chart.result[0]);
}
export async function chart(symbol, range = '1d', interval = '5m') {
  return cached(`yc:${symbol}:${range}:${interval}`, range === '1d' ? 60e3 : 10 * 60e3, async () => {
    if (hasProxy()) { try { return await liveChart(symbol, range, interval); } catch { /* Fallback: Daten-Job */ } }
    const rec = await symData(symbol).catch(() => { throw new Error(`Für ${symbol} gibt es ohne eigenen Proxy keine Kursdaten`); });
    const s = sliceRange(rec, range);
    return { ...fromMeta(symbol, rec.meta), t: s.t, closes: s.c };
  }, { persist: range === '1d' });
}

export async function quotes(symbols) {
  let map = {};
  try { map = (await qFile()).quotes; } catch { /* offline */ }
  const out = await pool(symbols, 4, async s => {
    if (map[s]) return { ...fromMeta(s, map[s]), closes: map[s].spark || [] };
    if (hasProxy()) return chart(s, '1d', '15m');
    return null;
  });
  const res = out.filter(Boolean);
  if (!res.length && symbols.length) throw new Error('Kurse gerade nicht erreichbar');
  return res;
}

export async function searchSymbols(q) {
  if (hasProxy()) {
    try {
      const d = await fetchJSON(`${Y2}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=8&lang=de-DE&region=DE&enableFuzzyQuery=true`);
      return {
        quotes: (d.quotes || []).filter(x => x.symbol && x.quoteType !== 'OPTION'),
        news: (d.news || []).map(n => ({
          id: 'y' + n.uuid, title: n.title, teaser: '', url: safeUrl(n.link), date: (n.providerPublishTime || 0) * 1000,
          image: safeUrl(n.thumbnail?.resolutions?.[0]?.url || ''), source: 'yahoo', publisher: n.publisher || 'Yahoo Finance', cat: 'boerse',
        })).filter(n => n.url),
      };
    } catch { /* Fallback: lokale Liste */ }
  }
  const map = (await qFile()).quotes;
  const n = q.toLowerCase();
  const quotes = MARKET_UNIVERSE.filter(sym => map[sym]).map(sym => ({ sym, m: map[sym] }))
    .filter(({ sym, m }) => sym.toLowerCase().includes(n) || (m.name || '').toLowerCase().includes(n) || (m.longName || '').toLowerCase().includes(n) || (KNOWN[sym] || '').toLowerCase().includes(n))
    .slice(0, 15)
    .map(({ sym, m }) => ({ symbol: sym, shortname: KNOWN[sym] || m.name, longname: m.longName, exchDisp: m.exchange, quoteType: /^\^/.test(sym) ? 'INDEX' : /-EUR$/.test(sym) ? 'CRYPTOCURRENCY' : (m.type || 'EQUITY'), typeDisp: m.type }));
  return { quotes, news: [] };
}

export async function crypto() {
  return cached('cg:markets', 90e3, async () => {
    try { return await fetchJSON('https://api.coingecko.com/api/v3/coins/markets?vs_currency=eur&order=market_cap_desc&per_page=12&page=1&sparkline=true&price_change_percentage=24h,7d', { validate: Array.isArray }); }
    catch { return fetchJSON(`${DATA}markets/crypto.json`, { validate: Array.isArray }); }
  });
}

// ---------- Technische Analyse ----------
const sma = (a, n) => a.length >= n ? a.slice(-n).reduce((x, y) => x + y, 0) / n : null;
function ema(a, n) { const k = 2 / (n + 1); let e = a[0]; const out = [e]; for (let i = 1; i < a.length; i++) { e = a[i] * k + e * (1 - k); out.push(e); } return out; }
function rsi(a, n = 14) {
  if (a.length <= n) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = a[i] - a[i - 1]; d > 0 ? g += d : l -= d; }
  g /= n; l /= n;
  for (let i = n + 1; i < a.length; i++) { const d = a[i] - a[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
export function analyze(q1y) {
  const c = q1y.closes.filter(x => x != null);
  if (c.length < 30) return null;
  const last = c[c.length - 1];
  const s20 = sma(c, 20), s50 = sma(c, 50), s200 = sma(c, 200);
  const r = rsi(c);
  const e12 = ema(c, 12), e26 = ema(c, 26);
  const macdLine = e12.map((v, i) => v - e26[i]);
  const signal = ema(macdLine, 9);
  const macd = macdLine[macdLine.length - 1], macdSig = signal[signal.length - 1];
  const rets = c.slice(-31).map((v, i, a) => i ? Math.log(v / a[i - 1]) : null).filter(x => x != null);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const vol = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1)) * Math.sqrt(252) * 100;
  const perf = n => c.length > n ? (last / c[c.length - 1 - n] - 1) * 100 : null;
  const hi = Math.max(...c), lo = Math.min(...c);
  const pts = [];
  let score = 0;
  const add = (cond, w, pos, neg) => { if (cond == null) return; score += cond ? w : -w; pts.push({ ok: cond, text: cond ? pos : neg }); };
  add(s50 != null ? last > s50 : null, 1, 'Kurs über 50-Tage-Linie (mittelfristiger Aufwärtstrend)', 'Kurs unter 50-Tage-Linie (mittelfristig schwach)');
  add(s200 != null ? last > s200 : null, 1.2, 'Kurs über 200-Tage-Linie (langfristig intakt)', 'Kurs unter 200-Tage-Linie (langfristig angeschlagen)');
  add(s50 != null && s200 != null ? s50 > s200 : null, 0.8, '50-Tage-Linie über 200-Tage-Linie („Golden Cross“-Konstellation)', '50-Tage-Linie unter 200-Tage-Linie („Death Cross“-Konstellation)');
  add(macd > macdSig, 0.6, 'MACD über Signallinie (positives Momentum)', 'MACD unter Signallinie (nachlassendes Momentum)');
  if (r != null) {
    if (r > 70) { score -= 0.5; pts.push({ ok: false, text: `RSI ${num(r, 0)} – überkauft, Rücksetzer möglich` }); }
    else if (r < 30) { score += 0.5; pts.push({ ok: true, text: `RSI ${num(r, 0)} – überverkauft, Erholung möglich` }); }
    else pts.push({ ok: null, text: `RSI ${num(r, 0)} – neutraler Bereich` });
  }
  const norm = Math.max(-1, Math.min(1, score / 4));
  const verdict = norm > 0.35 ? 'Positiv' : norm < -0.35 ? 'Negativ' : 'Neutral';
  return { last, s20, s50, s200, rsi: r, macd, macdSig, vol, perf1w: perf(5), perf1m: perf(21), perf3m: perf(63), perf1y: perf(c.length - 1), hi, lo, fromHi: (last / hi - 1) * 100, norm, verdict, pts };
}

// ---------- Watchlist ----------
export const inWatch = s => state.watchlist.includes(s);
export function toggleWatch(s) {
  if (inWatch(s)) state.watchlist = state.watchlist.filter(x => x !== s);
  else state.watchlist.push(s);
  save();
  return inWatch(s);
}

// ---------- Bausteine ----------
const logo = q => `<div class="logo" style="color:${hashColor(q.symbol)}">${esc((q.name || q.symbol).replace(/[^A-Za-z0-9ÄÖÜ&]/g, '').slice(0, 3).toUpperCase())}</div>`;
export function quoteRow(q) {
  const up = (q.changePct ?? 0) >= 0;
  return `<div class="q-row" data-stock="${esc(q.symbol)}">${logo(q)}
    <div class="nm"><b>${esc(q.name)}</b><span>${esc(q.symbol)}${q.exchange ? ' · ' + esc(q.exchange) : ''}</span></div>
    ${sparkSvg(q.closes, up)}
    <div class="pr tabnum"><b>${priceFmt(q.price)}</b><span class="pill ${up ? 'up' : 'down'}">${pct(q.changePct)}</span></div></div>`;
}
export function quoteTile(q) {
  const up = (q.changePct ?? 0) >= 0;
  return `<div class="tile" data-stock="${esc(q.symbol)}"><div class="n">${esc(q.name)}</div>
    <div class="p tabnum">${priceFmt(q.price)}</div><div class="c ${up ? 'up' : 'down'} tabnum">${pct(q.changePct)}</div>${sparkSvg(q.closes, up)}</div>`;
}
const skTiles = n => Array.from({ length: n }, () => '<div class="tile"><div class="sk sk-line" style="width:60%"></div><div class="sk sk-line" style="width:80%;height:18px"></div><div class="sk" style="height:30px;margin-top:8px"></div></div>').join('');

// ---------- Tab ----------
export function renderMarkets(root) {
  root.innerHTML = `
    <header class="vhead"><div class="wrap"><div class="vhead-row"><h1>Börse</h1>
      <button class="icon-btn" data-find aria-label="Wertpapier suchen">${icon('search')}</button>
      <button class="icon-btn" data-reload aria-label="Aktualisieren">${icon('refresh')}</button></div></div></header>
    <div class="wrap">
      <div class="section-title" style="margin-top:6px"><h2>Märkte</h2><span class="muted" data-time style="font-size:12px"></span></div>
      <div class="idx-grid" data-idx>${skTiles(8)}</div>
      <div class="section-title"><h2>Meine Watchlist</h2><button class="link-btn" data-find>${icon('plus', 'sm')} Hinzufügen</button></div>
      <div class="card" data-watch>${skeletonList(4, false)}</div>
      <div class="section-title"><h2>Krypto</h2><span class="muted" style="font-size:12px">CoinGecko · EUR</span></div>
      <div class="card" data-crypto>${skeletonList(4, false)}</div>
      <div class="section-title"><h2>Börsen-News</h2><button class="link-btn" data-go-news>Alle ${icon('right', 'sm')}</button></div>
      <div class="card list-card" data-bnews>${skeletonList(4)}</div>
      <p class="disclaimer">Kursdaten von Yahoo Finance und CoinGecko, teils verzögert. Alle Analysen sind automatisch berechnete technische Indikatoren und keine Anlageberatung.</p>
    </div>`;
  const $ = s => root.querySelector(s);

  async function loadIdx() {
    try {
      const qs = await quotes(INDICES.map(i => i.s));
      $('[data-idx]').innerHTML = qs.length ? qs.map(quoteTile).join('') : empty('Kurse nicht erreichbar', '📉');
      $('[data-time]').textContent = 'Stand ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { $('[data-idx]').innerHTML = errorBox(e); }
  }
  async function loadWatch() {
    const el = $('[data-watch]');
    if (!state.watchlist.length) { el.innerHTML = empty('Noch keine Favoriten. Tippe auf „Hinzufügen“.', '⭐'); return; }
    try {
      const qs = await quotes(state.watchlist);
      el.innerHTML = qs.map(quoteRow).join('') || empty('Kurse nicht erreichbar', '📉');
    } catch (e) { el.innerHTML = errorBox(e); }
  }
  async function loadCrypto() {
    const el = $('[data-crypto]');
    try {
      const list = await crypto();
      el.innerHTML = list.map(c => {
        const up = (c.price_change_percentage_24h ?? 0) >= 0;
        return `<div class="q-row" data-coin="${esc(c.id)}"><div class="logo"><img src="${esc(safeUrl(c.image))}" alt="" loading="lazy"></div>
          <div class="nm"><b>${esc(c.name)}</b><span>${esc(c.symbol.toUpperCase())} · MK ${compact(c.market_cap)} €</span></div>
          ${sparkSvg((c.sparkline_in_7d?.price || []).filter((_, i) => i % 4 === 0), (c.price_change_percentage_7d_in_currency ?? 0) >= 0)}
          <div class="pr tabnum"><b>${priceFmt(c.current_price)} €</b><span class="pill ${up ? 'up' : 'down'}">${pct(c.price_change_percentage_24h)}</span></div></div>`;
      }).join('');
    } catch (e) { el.innerHTML = errorBox(e); }
  }
  async function loadNews() {
    try {
      const items = await loadCategory('boerse');
      $('[data-bnews]').innerHTML = items.slice(0, 8).map(i => artRow(i)).join('') || empty('Keine Börsen-News');
    } catch (e) { $('[data-bnews]').innerHTML = errorBox(e); }
  }
  const all = () => { loadIdx(); loadWatch(); loadCrypto(); loadNews(); };
  root.addEventListener('click', e => {
    if (e.target.closest('[data-find]')) openFinder(loadWatch);
    if (e.target.closest('[data-reload]')) { invalidate('yc:'); invalidate('cg:'); invalidate('rss:'); invalidate('ts:'); all(); }
    const coin = e.target.closest('[data-coin]');
    if (coin) {
      const map = { bitcoin: 'BTC-EUR', ethereum: 'ETH-EUR', solana: 'SOL-EUR', ripple: 'XRP-EUR', cardano: 'ADA-EUR', dogecoin: 'DOGE-EUR', binancecoin: 'BNB-EUR', tron: 'TRX-EUR' };
      if (map[coin.dataset.coin]) openStock(map[coin.dataset.coin], loadWatch);
      else toast('Detailansicht für diese Kryptowährung nicht verfügbar');
    }
  });
  all();
  let timer = setInterval(() => { if (!document.hidden && root.classList.contains('active')) { loadIdx(); loadWatch(); } }, 60e3);
  return { refresh: all, onWatchChange: loadWatch, destroy: () => clearInterval(timer) };
}

// ---------- Suche ----------
export function openFinder(onChange) {
  openSheet({
    title: 'Wertpapier suchen',
    onClose: onChange,
    render: body => {
      body.innerHTML = `
        <form class="search" role="search">${icon('search')}<input type="search" placeholder="Name oder Symbol (z. B. Siemens, Apple, DAX)" enterkeyhint="search" autofocus></form>
        <p class="muted" style="font-size:13px">Über 110 Werte: alle DAX-40-Aktien, große US- und Europa-Werte, Indizes, ETFs, Rohstoffe, Währungen und Kryptos.</p>
        <div data-res></div>`;
      const input = body.querySelector('input'), res = body.querySelector('[data-res]');
      let t;
      const run = async () => {
        const q = input.value.trim();
        if (q.length < 2) { res.innerHTML = ''; return; }
        res.innerHTML = `<div class="card">${skeletonList(4, false)}</div>`;
        try {
          const r = await searchSymbols(q);
          res.innerHTML = r.quotes.length ? `<div class="card">${r.quotes.map(x => `
            <div class="q-row" data-pick="${esc(x.symbol)}">
              <div class="logo" style="color:${hashColor(x.symbol)}">${esc((x.shortname || x.symbol).replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase())}</div>
              <div class="nm"><b>${esc(x.shortname || x.longname || x.symbol)}</b><span>${esc(x.symbol)} · ${esc(x.exchDisp || '')} · ${esc(x.typeDisp || x.quoteType || '')}</span></div>
              <button class="icon-btn ${inWatch(x.symbol) ? 'on' : ''}" data-star="${esc(x.symbol)}" aria-label="Zur Watchlist">${icon('star', 'sm')}</button>
            </div>`).join('')}</div>` : empty('Nichts gefunden', '🔎');
        } catch (e) { res.innerHTML = errorBox(e); }
      };
      input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 350); });
      body.querySelector('form').addEventListener('submit', e => { e.preventDefault(); run(); });
      res.addEventListener('click', e => {
        const s = e.target.closest('[data-star]');
        if (s) { e.stopPropagation(); const on = toggleWatch(s.dataset.star); s.classList.toggle('on', on); toast(on ? 'Zur Watchlist hinzugefügt' : 'Aus Watchlist entfernt'); return; }
        const p = e.target.closest('[data-pick]');
        if (p) openStock(p.dataset.pick, onChange);
      });
      setTimeout(() => input.focus(), 350);
    },
  });
}

// ---------- Detail ----------
const RANGES = [
  { id: '1d', l: '1T', i: '5m' }, { id: '5d', l: '1W', i: '30m' }, { id: '1mo', l: '1M', i: '1d' },
  { id: '6mo', l: '6M', i: '1d' }, { id: 'ytd', l: 'YTD', i: '1d' }, { id: '1y', l: '1J', i: '1d' }, { id: '5y', l: '5J', i: '1wk' },
];
export function openStock(symbol, onChange) {
  const starBtn = () => `<button class="icon-btn ${inWatch(symbol) ? 'on' : ''}" data-star aria-label="Watchlist">${icon('star')}</button>`;
  openSheet({
    title: symbol,
    actions: starBtn(),
    onClose: onChange,
    render: async (body, sh) => {
      sh.el.querySelector('.sh-actions').addEventListener('click', e => {
        if (!e.target.closest('[data-star]')) return;
        const on = toggleWatch(symbol);
        sh.setActions(starBtn());
        toast(on ? 'Zur Watchlist hinzugefügt' : 'Aus Watchlist entfernt');
      });
      body.innerHTML = `<div data-head><div class="sk sk-line" style="width:50%;height:22px"></div><div class="sk sk-line" style="width:40%;height:36px"></div></div>
        <div class="seg" style="margin-top:14px" data-ranges>${RANGES.map((r, i) => `<button class="${i === 0 ? 'active' : ''}" data-r="${r.id}">${r.l}</button>`).join('')}</div>
        <div class="chart-wrap" data-chart><div class="sk" style="height:100%;border-radius:16px"></div></div>
        <div class="card" style="margin-top:16px" data-stats></div>
        <div class="section-title"><h2>Analyse</h2></div><div class="card card-pad" data-ana>${skeletonList(3, false)}</div>
        <div class="section-title"><h2>News</h2></div><div class="card list-card" data-news>${skeletonList(4)}</div>`;
      const $ = s => body.querySelector(s);
      let base;
      try {
        base = await chart(symbol, '1d', '5m');
        if (sh.closed) return;
        sh.setTitle(base.name);
        const up = (base.changePct ?? 0) >= 0;
        $('[data-head]').innerHTML = `<div class="muted" style="font-size:13px;font-weight:600">${esc(base.longName)} · ${esc(base.exchange)} · ${esc(base.currency)}</div>
          <div class="price-big tabnum">${priceFmt(base.price)} <span style="font-size:18px;color:var(--text-3)">${esc(base.currency)}</span></div>
          <div class="${up ? 'up' : 'down'} tabnum" style="font-weight:700;margin-top:4px">${base.change > 0 ? '+' : ''}${priceFmt(base.change)} (${pct(base.changePct)}) <span class="muted" style="font-weight:500">heute</span></div>`;
        $('[data-stats]').innerHTML = `<div class="stats">
          <div><span>Vortag</span><b class="tabnum">${priceFmt(base.prev)}</b></div>
          <div><span>Tageshoch</span><b class="tabnum">${priceFmt(base.dayHigh)}</b></div>
          <div><span>Tagestief</span><b class="tabnum">${priceFmt(base.dayLow)}</b></div>
          <div><span>Volumen</span><b class="tabnum">${compact(base.volume)}</b></div>
          <div><span>52W-Hoch</span><b class="tabnum">${priceFmt(base.high52)}</b></div>
          <div><span>52W-Tief</span><b class="tabnum">${priceFmt(base.low52)}</b></div>
          <div><span>Typ</span><b>${esc(base.type || '–')}</b></div>
          <div><span>Stand</span><b>${base.time ? esc(timeAgo(base.time)) : '–'}</b></div></div>`;
        lineChart($('[data-chart]'), base.t, base.closes, { ref: base.prev, fmtX: x => new Date(x).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) });
      } catch (e) {
        $('[data-head]').innerHTML = errorBox(e);
        $('[data-chart]').innerHTML = '';
      }
      $('[data-ranges]').addEventListener('click', async e => {
        const b = e.target.closest('[data-r]');
        if (!b) return;
        body.querySelectorAll('[data-r]').forEach(x => x.classList.toggle('active', x === b));
        const r = RANGES.find(x => x.id === b.dataset.r);
        $('[data-chart]').innerHTML = '<div class="sk" style="height:100%;border-radius:16px"></div>';
        try {
          const q = await chart(symbol, r.id, r.i);
          const short = r.id === '1d' || r.id === '5d';
          lineChart($('[data-chart]'), q.t, q.closes, {
            ref: r.id === '1d' ? q.prev : null,
            fmtX: x => new Date(x).toLocaleString('de-DE', short ? { weekday: 'short', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short', year: '2-digit' }),
          });
        } catch (err) { $('[data-chart]').innerHTML = errorBox(err); }
      });
      // Analyse
      try {
        const y = await chart(symbol, '1y', '1d');
        const a = analyze(y);
        if (sh.closed) return;
        if (!a) throw new Error('Zu wenig Historie');
        const row = (l, v) => `<div class="ind"><span>${l}</span><b class="tabnum">${v}</b></div>`;
        const pc = v => `<span class="${v >= 0 ? 'up' : 'down'}">${pct(v)}</span>`;
        $('[data-ana]').innerHTML = `
          <div class="row"><div style="flex:1"><div class="muted" style="font-size:12.5px;font-weight:600">Technisches Gesamtbild</div>
          <div style="font-size:24px;font-weight:800;letter-spacing:-.02em" class="${a.verdict === 'Positiv' ? 'up' : a.verdict === 'Negativ' ? 'down' : ''}">${a.verdict}</div></div>
          <div style="text-align:right"><div class="muted" style="font-size:12.5px">Volatilität (30T)</div><b>${num(a.vol, 1)} %</b></div></div>
          <div class="gauge"><i style="left:${(a.norm + 1) * 50}%"></i></div>
          <div class="gauge-l"><span>Negativ</span><span>Neutral</span><span>Positiv</span></div>
          <div style="margin:14px 0 6px">${a.pts.map(p => `<div style="display:flex;gap:8px;font-size:14px;margin:6px 0"><span>${p.ok === true ? '🟢' : p.ok === false ? '🔴' : '⚪️'}</span><span>${esc(p.text)}</span></div>`).join('')}</div>
          ${row('Performance 1 Woche', pc(a.perf1w))}${row('Performance 1 Monat', pc(a.perf1m))}${row('Performance 3 Monate', pc(a.perf3m))}${row('Performance 1 Jahr', pc(a.perf1y))}
          ${row('Abstand zum 52W-Hoch', pc(a.fromHi))}
          ${row('GD 20 / 50 / 200', `${priceFmt(a.s20)} / ${priceFmt(a.s50)} / ${a.s200 ? priceFmt(a.s200) : '–'}`)}
          ${row('RSI (14)', a.rsi != null ? num(a.rsi, 1) : '–')}${row('MACD / Signal', `${num(a.macd, 2)} / ${num(a.macdSig, 2)}`)}
          <p class="disclaimer">Automatisch aus Kursdaten berechnet. Keine Anlageberatung, keine Kauf- oder Verkaufsempfehlung.</p>`;
      } catch (e) { $('[data-ana]').innerHTML = empty('Analyse für diesen Wert nicht verfügbar.', '🧮'); }
      // News
      try {
        const name = (base?.longName || base?.name || symbol).replace(/\b(AG|SE|Inc\.?|Corp\.?|N\.V\.|plc|Ltd\.?|& Co\.? KGaA|KGaA|Holding)\b/gi, '').trim();
        const [y, g] = await Promise.all([
          searchSymbols(symbol).then(r => r.news).catch(() => []),
          searchNews(name, { days: 14 }).catch(() => []),
        ]);
        if (sh.closed) return;
        const items = merge([g, y]).slice(0, 15);
        $('[data-news]').innerHTML = items.length ? items.map(i => artRow(i)).join('') : empty('Keine aktuellen Nachrichten gefunden.');
      } catch (e) { $('[data-news]').innerHTML = errorBox(e); }
    },
  });
}
