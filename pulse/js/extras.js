// Wetter (Open-Meteo), Wissen (Wikipedia), Recherche, Live-TV
import { state, cached } from './store.js';
import { fetchJSON } from './net.js';
import { esc, safeUrl, icon, openSheet, skeletonList, empty, errorBox, toast } from './ui.js';
import { searchNews, artRow, sanitize } from './news.js';
import { searchSymbols } from './markets.js';

// ---------- Wetter ----------
const WMO = {
  0: ['☀️', 'Klar'], 1: ['🌤️', 'Überwiegend klar'], 2: ['⛅️', 'Teils bewölkt'], 3: ['☁️', 'Bedeckt'], 45: ['🌫️', 'Nebel'], 48: ['🌫️', 'Reifnebel'],
  51: ['🌦️', 'Leichter Niesel'], 53: ['🌦️', 'Niesel'], 55: ['🌧️', 'Starker Niesel'], 61: ['🌦️', 'Leichter Regen'], 63: ['🌧️', 'Regen'], 65: ['🌧️', 'Starker Regen'],
  66: ['🌧️', 'Gefrierender Regen'], 67: ['🌧️', 'Gefrierender Regen'], 71: ['🌨️', 'Leichter Schnee'], 73: ['🌨️', 'Schnee'], 75: ['❄️', 'Starker Schnee'], 77: ['🌨️', 'Schneegriesel'],
  80: ['🌦️', 'Schauer'], 81: ['🌧️', 'Kräftige Schauer'], 82: ['⛈️', 'Heftige Schauer'], 85: ['🌨️', 'Schneeschauer'], 86: ['🌨️', 'Schneeschauer'], 95: ['⛈️', 'Gewitter'], 96: ['⛈️', 'Gewitter mit Hagel'], 99: ['⛈️', 'Gewitter mit Hagel'],
};
export const wmo = c => WMO[c] || ['🌡️', ''];
export async function weather() {
  const { lat, lon } = state.profile;
  return cached(`wx:${lat},${lon}`, 15 * 60e3, () => fetchJSON(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=auto&forecast_days=6`));
}
export async function geocode(q) {
  const d = await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=de&format=json`);
  return (d.results || []).map(r => ({ name: r.name, region: [r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude }));
}

// ---------- Wikipedia ----------
const WIKI = 'https://de.wikipedia.org';
export async function wikiSearch(q) {
  const d = await fetchJSON(`${WIKI}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&origin=*&srlimit=6&utf8=1`);
  return (d.query?.search || []).map(s => ({ title: s.title, snippet: s.snippet.replace(/<[^>]+>/g, '') }));
}
export async function wikiSummary(title) {
  return fetchJSON(`${WIKI}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
}
export function openWiki(title) {
  openSheet({
    title: 'Wikipedia',
    render: async (body, sh) => {
      body.innerHTML = `<div class="reader">${skeletonList(6, false)}</div>`;
      try {
        const [sum, html] = await Promise.all([
          wikiSummary(title).catch(() => null),
          cached('wk:' + title, 3600e3, async () => {
            const d = await fetchJSON(`${WIKI}/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&format=json&origin=*&disableeditsection=1&redirects=1`);
            return d.parse?.text?.['*'] || '';
          }, { persist: false }),
        ]);
        if (sh.closed) return;
        // Wikipedia-HTML aufräumen: Infoboxen, Tabellen, Referenzen raus
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('table, .infobox, .navbox, .reference, .mw-references-wrap, .references, sup, .thumb, figure, .hatnote, style, .noprint, .mw-editsection, .sieheauch, .toc').forEach(e => e.remove());
        doc.querySelectorAll('a').forEach(a => {
          const h = a.getAttribute('href') || '';
          if (h.startsWith('/wiki/')) a.setAttribute('href', WIKI + h);
          else if (!/^https?:/.test(h)) a.replaceWith(...a.childNodes);
        });
        const clean = sanitize(doc.body.innerHTML);
        const img = safeUrl(sum?.originalimage?.source || sum?.thumbnail?.source || '');
        body.innerHTML = `<article class="reader">
          ${img ? `<img class="r-img" src="${esc(img)}" alt="" style="object-fit:contain;background:var(--surface)">` : ''}
          <div class="r-top">Wikipedia · Wissen</div>
          <h1>${esc(sum?.title || title)}</h1>
          ${sum?.description ? `<div class="r-meta">${esc(sum.description)}</div>` : ''}
          <div class="content">${clean || `<p>${esc(sum?.extract || '')}</p>`}</div>
          <div class="reader-actions"><a class="btn sm" target="_blank" rel="noopener noreferrer" href="${esc(safeUrl(sum?.content_urls?.mobile?.page || `${WIKI}/wiki/${encodeURIComponent(title)}`))}">${icon('ext', 'sm')} Auf Wikipedia</a></div>
          <p class="disclaimer">Inhalt: Wikipedia, CC BY-SA 4.0</p></article>`;
      } catch (e) { body.innerHTML = errorBox(e); }
    },
  });
}

// ---------- Recherche ----------
export function openResearch(initial = '') {
  openSheet({
    title: 'Recherche',
    render: body => {
      body.innerHTML = `
        <form class="search" role="search">${icon('search')}<input type="search" placeholder="Was möchtest du wissen?" enterkeyhint="search" value="${esc(initial)}"></form>
        <p class="muted" style="font-size:13px;margin:10px 2px 0">Durchsucht gleichzeitig Wikipedia, Nachrichten aus allen Quellen und die Börse.</p>
        <div data-res style="margin-top:8px"></div>`;
      const input = body.querySelector('input'), res = body.querySelector('[data-res]');
      const run = async () => {
        const q = input.value.trim();
        if (!q) return;
        input.blur();
        res.innerHTML = `<div class="section-title"><h2>Wissen</h2></div><div class="card" data-wiki>${skeletonList(2)}</div>
          <div class="section-title"><h2>Nachrichten</h2></div><div class="card list-card" data-news>${skeletonList(5)}</div>
          <div data-stocks></div>`;
        wikiSearch(q).then(async hits => {
          const el = res.querySelector('[data-wiki]');
          if (!hits.length) { el.innerHTML = empty('Kein Wikipedia-Artikel gefunden.', '📚'); return; }
          const top = await wikiSummary(hits[0].title).catch(() => null);
          el.innerHTML = `${top ? `<div class="wiki-card" data-wiki-open="${esc(hits[0].title)}">
              ${top.thumbnail?.source ? `<img src="${esc(safeUrl(top.thumbnail.source))}" alt="">` : ''}
              <div><h3>${esc(top.title)}</h3><p>${esc(top.extract || '')}</p></div></div>` : ''}
            ${hits.slice(top ? 1 : 0, 5).map(h => `<div class="art compact" data-wiki-open="${esc(h.title)}"><div class="body"><div class="title">📖 ${esc(h.title)}</div><div class="teaser">${esc(h.snippet)}</div></div></div>`).join('')}`;
        }).catch(e => { res.querySelector('[data-wiki]').innerHTML = errorBox(e); });
        searchNews(q, { days: 30 }).then(items => {
          res.querySelector('[data-news]').innerHTML = items.slice(0, 25).map(i => artRow(i)).join('') || empty('Keine Nachrichten gefunden.');
        }).catch(e => { res.querySelector('[data-news]').innerHTML = errorBox(e); });
        searchSymbols(q).then(r => {
          const qs = r.quotes.filter(x => ['EQUITY', 'ETF', 'INDEX', 'CRYPTOCURRENCY'].includes(x.quoteType)).slice(0, 4);
          if (!qs.length) return;
          res.querySelector('[data-stocks]').innerHTML = `<div class="section-title"><h2>Börse</h2></div><div class="card">${qs.map(x => `
            <div class="q-row" data-stock="${esc(x.symbol)}"><div class="logo">📈</div><div class="nm"><b>${esc(x.shortname || x.longname || x.symbol)}</b><span>${esc(x.symbol)} · ${esc(x.exchDisp || '')}</span></div>${icon('right', 'sm')}</div>`).join('')}</div>`;
        }).catch(() => {});
      };
      body.querySelector('form').addEventListener('submit', e => { e.preventDefault(); run(); });
      res.addEventListener('click', e => {
        const w = e.target.closest('[data-wiki-open]');
        if (w) openWiki(w.dataset.wikiOpen);
      });
      if (initial) run(); else setTimeout(() => input.focus(), 350);
    },
  });
}

// ---------- Live-TV ----------
export const CHANNELS = [
  { id: 'ts24', name: 'tagesschau24', desc: 'Nachrichten rund um die Uhr', hls: 'https://tagesschau.akamaized.net/hls/live/2020115/tagesschau/tagesschau_1/master.m3u8', page: 'https://www.tagesschau.de/multimedia/livestreams', bg: 'linear-gradient(135deg,#0b3d91,#1b6fd8)' },
  { id: 'phoenix', name: 'phoenix', desc: 'Politik & Ereignisse live', hls: 'https://zdf-hls-19.akamaized.net/hls/live/2016502/de/high/master.m3u8', page: 'https://www.phoenix.de/livestream', bg: 'linear-gradient(135deg,#00334d,#0089c7)' },
  { id: 'zdf', name: 'ZDF', desc: 'Live-TV & heute', page: 'https://www.zdf.de/live-tv', bg: 'linear-gradient(135deg,#f25a00,#ff9a3d)' },
  { id: 'ntv', name: 'n-tv', desc: 'Nachrichtensender', page: 'https://www.n-tv.de/mediathek/livestream/', bg: 'linear-gradient(135deg,#a10020,#e3002b)' },
  { id: 'welt', name: 'WELT TV', desc: 'Nachrichtensender', page: 'https://www.welt.de/tv-programm-live-stream/', bg: 'linear-gradient(135deg,#00315f,#0071bc)' },
  { id: 'dw', name: 'DW Deutsch', desc: 'Deutsche Welle', page: 'https://www.dw.com/de/live-tv/channel-deutsch', bg: 'linear-gradient(135deg,#05386b,#1a8fd0)' },
  { id: 'sportschau', name: 'Sportschau', desc: 'Live-Sport der ARD', page: 'https://www.sportschau.de/live-und-ergebnisse', bg: 'linear-gradient(135deg,#003a5c,#00a6d6)' },
  { id: 'euronews', name: 'Euronews', desc: 'Europa live', page: 'https://de.euronews.com/live', bg: 'linear-gradient(135deg,#1c2a55,#3659c2)' },
  { id: 'bbc', name: 'BBC News', desc: 'International · englisch', page: 'https://www.bbc.co.uk/news/live', bg: 'linear-gradient(135deg,#7a0e0e,#bb1919)' },
];
export function channelCard(c) {
  return `<div class="channel" data-channel="${c.id}" style="background:${c.bg}"><div><b>${esc(c.name)}</b><br><span>${esc(c.desc)}</span></div>
    <span style="font-size:11.5px;font-weight:700;opacity:.9">${c.hls ? '● IN DER APP' : 'EXTERN ↗'}</span><div class="play">${icon(c.hls ? 'play' : 'ext', 'sm')}</div></div>`;
}
let hlsLoader;
function loadHls() {
  hlsLoader ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.15/hls.min.js';
    s.onload = () => res(window.Hls); s.onerror = rej;
    document.head.appendChild(s);
  });
  return hlsLoader;
}
export function playChannel(id) {
  const c = CHANNELS.find(x => x.id === id);
  if (!c) return;
  if (!c.hls) { window.open(c.page, '_blank', 'noopener'); return; }
  let hls;
  openSheet({
    title: c.name,
    onClose: () => { hls?.destroy(); },
    render: async body => {
      body.innerHTML = `<video class="player-v" controls playsinline autoplay></video>
        <p class="muted" style="font-size:13px">Livestream von ${esc(c.name)}. Manche Sender sind aus Lizenzgründen nur in Deutschland verfügbar.</p>
        <a class="btn sm" href="${esc(c.page)}" target="_blank" rel="noopener noreferrer">${icon('ext', 'sm')} Offizielle Seite</a>
        <div class="section-title"><h2>Weitere Sender</h2></div><div class="grid g3">${CHANNELS.filter(x => x.id !== id).map(channelCard).join('')}</div>`;
      const v = body.querySelector('video');
      const fail = () => { toast('Stream nicht verfügbar – öffne die offizielle Seite'); };
      v.addEventListener('error', fail);
      if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = c.hls; return; }
      try {
        const Hls = await loadHls();
        if (Hls?.isSupported()) { hls = new Hls(); hls.loadSource(c.hls); hls.attachMedia(v); hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) fail(); }); }
        else v.src = c.hls;
      } catch { fail(); }
    },
  });
}
export function openLive() {
  openSheet({
    title: 'Live-TV & Streams',
    render: async body => {
      body.innerHTML = `<p class="muted" style="margin-top:0">Nachrichtensender live – tagesschau24 und phoenix laufen direkt in der App.</p>
        <div class="grid g3">${CHANNELS.map(channelCard).join('')}</div>
        <div class="section-title"><h2>Video-News</h2></div><div class="card list-card" data-vid>${skeletonList(4)}</div>`;
      try {
        const d = await cached('ts:video', 10 * 60e3, () => fetchJSON('https://www.tagesschau.de/api2u/news/?ressort=video'));
        const items = (d.news || []).filter(n => n.streams).slice(0, 12).map(n => ({
          id: 'v' + (n.sophoraId || n.externalId || n.title), title: n.title, teaser: n.firstSentence || '', url: safeUrl(n.shareURL || ''),
          image: safeUrl(n.teaserImage?.imageVariants?.['16x9-640'] || n.teaserImage?.imageVariants?.['16x9-512'] || ''),
          date: Date.parse(n.date) || 0, source: 'tagesschau', publisher: 'tagesschau', cat: 'top',
          video: safeUrl(n.streams.h264m || n.streams.adaptivestreaming || n.streams.h264s || ''),
        }));
        body.querySelector('[data-vid]').innerHTML = items.map(i => artRow(i)).join('') || empty('Keine Videos.', '🎬');
      } catch (e) { body.querySelector('[data-vid]').innerHTML = errorBox(e); }
    },
  });
}
