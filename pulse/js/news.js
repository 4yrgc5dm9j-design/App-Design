// Nachrichten: Quellen, Laden & Parsen, Themen-Matching, In-App-Leser, News-Tab
import { state, save, cached, invalidate } from './store.js';
import { fetchText, fetchJSON, isXml, pool } from './net.js';
import { esc, safeUrl, stripHtml, timeAgo, icon, openSheet, toast, skeletonList, empty, errorBox, $$ } from './ui.js';

export const CATS = [
  { id: 'top', label: 'Top', icon: '⚡' },
  { id: 'politik', label: 'Politik', icon: '🏛️' },
  { id: 'wirtschaft', label: 'Wirtschaft', icon: '💼' },
  { id: 'boerse', label: 'Börse', icon: '📈' },
  { id: 'sport', label: 'Sport', icon: '⚽' },
  { id: 'tech', label: 'Tech', icon: '💡' },
  { id: 'wissen', label: 'Wissen', icon: '🔬' },
  { id: 'welt', label: 'International', icon: '🌍' },
  { id: 'kultur', label: 'Kultur', icon: '🎭' },
];
export const catLabel = id => CATS.find(c => c.id === id)?.label || id;

const GN = (topic) => `https://news.google.com/rss/headlines/section/topic/${topic}?hl=de&gl=DE&ceid=DE:de`;

export const SOURCES = [
  { id: 'tagesschau', name: 'tagesschau', color: '#1b4e9b', kind: 'tagesschau', desc: 'ARD · Volltext in der App',
    ressorts: { top: 'homepage', politik: 'inland', wirtschaft: 'wirtschaft', boerse: 'wirtschaft', sport: 'sport', wissen: 'wissen', welt: 'ausland', tech: 'wissen' } },
  { id: 'spiegel', name: 'DER SPIEGEL', color: '#e64415', desc: 'Nachrichtenmagazin', feeds: {
    top: 'https://www.spiegel.de/schlagzeilen/index.rss', politik: 'https://www.spiegel.de/politik/index.rss', wirtschaft: 'https://www.spiegel.de/wirtschaft/index.rss',
    sport: 'https://www.spiegel.de/sport/index.rss', tech: 'https://www.spiegel.de/netzwelt/index.rss', wissen: 'https://www.spiegel.de/wissenschaft/index.rss',
    welt: 'https://www.spiegel.de/ausland/index.rss', kultur: 'https://www.spiegel.de/kultur/index.rss' } },
  { id: 'zeit', name: 'ZEIT ONLINE', color: '#2d2d2d', desc: 'Wochenzeitung', feeds: {
    top: 'https://newsfeed.zeit.de/index', politik: 'https://newsfeed.zeit.de/politik/index', wirtschaft: 'https://newsfeed.zeit.de/wirtschaft/index',
    sport: 'https://newsfeed.zeit.de/sport/index', tech: 'https://newsfeed.zeit.de/digital/index', wissen: 'https://newsfeed.zeit.de/wissen/index',
    kultur: 'https://newsfeed.zeit.de/kultur/index' } },
  { id: 'faz', name: 'F.A.Z.', color: '#4a4a4a', desc: 'Frankfurter Allgemeine', feeds: {
    top: 'https://www.faz.net/rss/aktuell/', politik: 'https://www.faz.net/rss/aktuell/politik/', wirtschaft: 'https://www.faz.net/rss/aktuell/wirtschaft/',
    boerse: 'https://www.faz.net/rss/aktuell/finanzen/', sport: 'https://www.faz.net/rss/aktuell/sport/', tech: 'https://www.faz.net/rss/aktuell/technik-motor/',
    wissen: 'https://www.faz.net/rss/aktuell/wissen/', kultur: 'https://www.faz.net/rss/aktuell/feuilleton/' } },
  { id: 'sz', name: 'Süddeutsche', color: '#29293a', desc: 'Süddeutsche Zeitung', feeds: {
    top: 'https://rss.sueddeutsche.de/rss/Topthemen', politik: 'https://rss.sueddeutsche.de/rss/Politik', wirtschaft: 'https://rss.sueddeutsche.de/rss/Wirtschaft',
    sport: 'https://rss.sueddeutsche.de/rss/Sport', tech: 'https://rss.sueddeutsche.de/rss/Digital', wissen: 'https://rss.sueddeutsche.de/rss/Wissen',
    kultur: 'https://rss.sueddeutsche.de/rss/Kultur' } },
  { id: 'ntv', name: 'n-tv', color: '#dc0028', desc: 'Nachrichtensender', feeds: {
    top: 'https://www.n-tv.de/rss', politik: 'https://www.n-tv.de/politik/rss', wirtschaft: 'https://www.n-tv.de/wirtschaft/rss',
    boerse: 'https://www.n-tv.de/wirtschaft/rss', sport: 'https://www.n-tv.de/sport/rss', tech: 'https://www.n-tv.de/technik/rss', wissen: 'https://www.n-tv.de/wissen/rss' } },
  { id: 'welt', name: 'WELT', color: '#0071bc', desc: 'Tageszeitung', feeds: {
    top: 'https://www.welt.de/feeds/latest.rss', politik: 'https://www.welt.de/feeds/section/politik.rss', wirtschaft: 'https://www.welt.de/feeds/section/wirtschaft.rss',
    boerse: 'https://www.welt.de/feeds/section/finanzen.rss', sport: 'https://www.welt.de/feeds/section/sport.rss', kultur: 'https://www.welt.de/feeds/section/kultur.rss' } },
  { id: 'handelsblatt', name: 'Handelsblatt', color: '#ee7f00', desc: 'Wirtschaft & Finanzen', feeds: {
    top: 'https://www.handelsblatt.com/contentexport/feed/top-themen', politik: 'https://www.handelsblatt.com/contentexport/feed/politik',
    wirtschaft: 'https://www.handelsblatt.com/contentexport/feed/wirtschaft', boerse: 'https://www.handelsblatt.com/contentexport/feed/finanzen',
    tech: 'https://www.handelsblatt.com/contentexport/feed/technik' } },
  { id: 'dlf', name: 'Deutschlandfunk', color: '#004f9f', desc: 'Radio-Nachrichten', feeds: {
    top: 'https://www.deutschlandfunk.de/nachrichten-100.rss', politik: 'https://www.deutschlandfunk.de/politikportal-100.rss',
    kultur: 'https://www.deutschlandfunk.de/kulturportal-100.rss', wissen: 'https://www.deutschlandfunk.de/wissen-106.rss' } },
  { id: 'dw', name: 'Deutsche Welle', color: '#0a64a0', desc: 'Auslandssender', feeds: {
    top: 'https://rss.dw.com/rdf/rss-de-top', welt: 'https://rss.dw.com/rdf/rss-de-all', wirtschaft: 'https://rss.dw.com/rdf/rss-de-eco', wissen: 'https://rss.dw.com/rdf/rss-de-wissenschaft' } },
  { id: 'heise', name: 'heise online', color: '#c3002f', desc: 'IT & Technik', feeds: { tech: 'https://www.heise.de/rss/heise-atom.xml' } },
  { id: 't3n', name: 't3n', color: '#ff6633', desc: 'Digitales Business', feeds: { tech: 'https://t3n.de/rss.xml' } },
  { id: 'kicker', name: 'kicker', color: '#d6001c', desc: 'Sportmagazin', feeds: { sport: 'https://newsfeed.kicker.de/news/aktuell' } },
  { id: 'google', name: 'Google News', color: '#4285f4', desc: 'Hunderte Verlage aggregiert', agg: true, feeds: {
    top: 'https://news.google.com/rss?hl=de&gl=DE&ceid=DE:de', politik: GN('NATION'), wirtschaft: GN('BUSINESS'), boerse: GN('BUSINESS'),
    sport: GN('SPORTS'), tech: GN('TECHNOLOGY'), wissen: GN('SCIENCE'), welt: GN('WORLD'), kultur: GN('ENTERTAINMENT') } },
  { id: 'bbc', name: 'BBC News', color: '#bb1919', intl: true, desc: 'Großbritannien · englisch', feeds: {
    top: 'https://feeds.bbci.co.uk/news/rss.xml', welt: 'https://feeds.bbci.co.uk/news/world/rss.xml', wirtschaft: 'https://feeds.bbci.co.uk/news/business/rss.xml',
    tech: 'https://feeds.bbci.co.uk/news/technology/rss.xml', wissen: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', sport: 'https://feeds.bbci.co.uk/sport/rss.xml' } },
  { id: 'guardian', name: 'The Guardian', color: '#052962', intl: true, kind: 'guardian', desc: 'Großbritannien · Volltext in der App',
    sections: { top: '', politik: 'politics', welt: 'world', wirtschaft: 'business', boerse: 'business', sport: 'sport', tech: 'technology', wissen: 'science', kultur: 'culture' } },
  { id: 'nyt', name: 'New York Times', color: '#111111', intl: true, off: true, desc: 'USA · englisch', feeds: {
    top: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', welt: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
    wirtschaft: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml', tech: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
    sport: 'https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml', wissen: 'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml' } },
  { id: 'aljazeera', name: 'Al Jazeera', color: '#b38f00', intl: true, off: true, desc: 'Katar · englisch', feeds: { welt: 'https://www.aljazeera.com/xml/rss/all.xml' } },
];
export const srcById = id => SOURCES.find(s => s.id === id);
export const isEnabled = s => state.sources[s.id] ?? !s.off;

// ---------- Artikel-Registry (für Klicks) ----------
export const ITEMS = new Map();
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 'a' + (h >>> 0).toString(36); }
const titleKey = t => (t || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '').slice(0, 70);

// ---------- Parser ----------
function tagText(el, ...names) {
  for (const n of names) {
    const x = el.getElementsByTagName(n)[0];
    if (x && x.textContent.trim()) return x.textContent.trim();
  }
  return '';
}
function firstImg(html) {
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html || '');
  return m ? m[1] : '';
}
export function parseFeed(xml, sourceId, cat) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const nodes = [...doc.getElementsByTagName('item'), ...doc.getElementsByTagName('entry')];
  const src = srcById(sourceId);
  return nodes.slice(0, 40).map(n => {
    let link = tagText(n, 'link');
    if (!link) { const l = n.getElementsByTagName('link')[0]; link = l?.getAttribute('href') || ''; }
    if (!link) link = tagText(n, 'guid');
    const rawDesc = tagText(n, 'description', 'summary', 'content');
    const encoded = tagText(n, 'content:encoded');
    let img = '';
    for (const tn of ['media:content', 'media:thumbnail', 'enclosure']) {
      const x = [...n.getElementsByTagName(tn)].find(e => (e.getAttribute('url') || '') && !/(audio|video)\//.test(e.getAttribute('type') || ''));
      if (x) { img = x.getAttribute('url'); break; }
    }
    img ||= firstImg(rawDesc) || firstImg(encoded);
    let title = stripHtml(tagText(n, 'title'));
    let publisher = src?.name || sourceId;
    const srcEl = n.getElementsByTagName('source')[0];
    if (src?.agg && srcEl) {
      publisher = srcEl.textContent.trim() || publisher;
      if (title.endsWith(' - ' + publisher)) title = title.slice(0, -(publisher.length + 3));
    }
    const dateStr = tagText(n, 'pubDate', 'published', 'updated', 'dc:date');
    const date = Date.parse(dateStr) || 0;
    const teaser = src?.agg ? '' : stripHtml(rawDesc).slice(0, 400);
    return {
      id: hash(link || title), title, teaser, url: safeUrl(link), image: safeUrl(img), date,
      source: sourceId, publisher, cat,
      html: encoded && encoded.length > 800 ? encoded : '',
      breaking: /^(\+\+\+|eil(meldung)?[:+ ]|breaking)/i.test(title),
    };
  }).filter(i => i.title && i.url);
}

function tsImage(t) {
  const v = t?.teaserImage?.imageVariants || t?.teaserImage?.images || {};
  return v['16x9-960'] || v['16x9-640'] || v['16x9-512'] || v['16x9-1280'] || Object.values(v)[0] || '';
}
function normTs(t, cat) {
  const url = t.shareURL || t.detailsweb || '';
  return {
    id: hash(url || t.sophoraId || t.title), title: t.title || '', teaser: t.firstSentence || '', topline: t.topline || '',
    url: safeUrl(url), image: safeUrl(tsImage(t)), date: Date.parse(t.date) || 0,
    source: 'tagesschau', publisher: 'tagesschau', cat,
    details: safeUrl(t.details || ''), breaking: !!t.breakingNews,
    video: safeUrl(t.streams?.h264m || t.streams?.adaptivestreaming || t.streams?.h264s || ''),
    tags: (t.tags || []).map(x => x.tag),
  };
}
function normGuardian(r, cat) {
  return {
    id: hash(r.webUrl), title: r.webTitle, teaser: stripHtml(r.fields?.trailText || ''), url: safeUrl(r.webUrl),
    image: safeUrl(r.fields?.thumbnail || ''), date: Date.parse(r.webPublicationDate) || 0,
    source: 'guardian', publisher: 'The Guardian', cat, html: r.fields?.body || '',
  };
}

// ---------- Laden ----------
const TTL = () => Math.max(2, state.settings.refresh || 5) * 60000;

async function loadRss(url, sourceId, cat) {
  return cached('rss:' + url, TTL(), async () => {
    const txt = await fetchText(url, { validate: isXml });
    return parseFeed(txt, sourceId, cat).map(slim);
  });
}
// kleine Objekte im Cache (Volltext-HTML nicht dauerhaft speichern)
function slim(i) { return i.html && i.html.length > 30000 ? { ...i, html: '' } : i; }

async function loadTagesschau(ressort, cat) {
  const url = ressort === 'homepage'
    ? 'https://www.tagesschau.de/api2u/homepage/'
    : `https://www.tagesschau.de/api2u/news/?ressort=${ressort}`;
  return cached('ts:' + ressort, TTL(), async () => {
    const d = await fetchJSON(url);
    return (d.news || []).filter(t => t.title && t.type !== 'webview').map(t => normTs(t, cat));
  });
}
async function loadGuardian(section, cat, q = '') {
  const u = new URL('https://content.guardianapis.com/search');
  u.searchParams.set('api-key', 'test');
  u.searchParams.set('show-fields', 'thumbnail,trailText,body');
  u.searchParams.set('page-size', '20');
  u.searchParams.set('order-by', 'newest');
  if (section) u.searchParams.set('section', section);
  if (q) u.searchParams.set('q', q);
  return cached('gu:' + section + ':' + q, TTL(), async () => {
    const d = await fetchJSON(u.href);
    return (d.response?.results || []).map(r => normGuardian(r, cat)).map(slim);
  }, { persist: false });
}

function sourceTasks(cat) {
  const tasks = [];
  for (const s of SOURCES) {
    if (!isEnabled(s)) continue;
    if (s.kind === 'tagesschau') {
      const r = s.ressorts[cat];
      if (r) tasks.push(() => loadTagesschau(r, cat));
      if (cat === 'politik') tasks.push(() => loadTagesschau('ausland', cat));
    } else if (s.kind === 'guardian') {
      if (cat in s.sections) tasks.push(() => loadGuardian(s.sections[cat], cat));
    } else if (s.feeds?.[cat]) {
      tasks.push(() => loadRss(s.feeds[cat], s.id, cat));
    }
  }
  return tasks;
}

export function merge(lists) {
  const seen = new Set(), out = [];
  for (const it of lists.flat().filter(Boolean).sort((a, b) => b.date - a.date)) {
    const k = titleKey(it.title);
    if (seen.has(k) || seen.has(it.id)) continue;
    seen.add(k); seen.add(it.id);
    out.push(it);
  }
  return out;
}

export async function loadCategory(cat) {
  const lists = await pool(sourceTasks(cat), 5, t => t());
  const items = merge(lists);
  if (!items.length && lists.every(l => l == null)) throw new Error('Keine Quelle erreichbar');
  return items;
}

// Suche über mehrere Anbieter
function gnSearchUrl(q) { return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=de&gl=DE&ceid=DE:de`; }
export async function searchNews(q, { days = 7 } = {}) {
  const tasks = [
    () => cached('tss:' + q, TTL(), async () => {
      const d = await fetchJSON(`https://www.tagesschau.de/api2u/search/?searchText=${encodeURIComponent(q)}&pageSize=30&resultPage=0`);
      return (d.searchResults || []).filter(t => t.title).map(t => normTs(t, 'top'));
    }),
    () => cached('gns:' + q + days, TTL(), async () => {
      const txt = await fetchText(gnSearchUrl(q + (days ? ` when:${days}d` : '')), { validate: isXml });
      return parseFeed(txt, 'google', 'top');
    }),
  ];
  const gu = srcById('guardian');
  if (isEnabled(gu)) tasks.push(() => loadGuardian('', 'top', q));
  const lists = await pool(tasks, 3, t => t());
  return merge(lists);
}

// ---------- Themen ----------
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function topicMatcher(topic) {
  const res = (topic.keywords || []).map(k => k.trim()).filter(Boolean).map(k =>
    k.length <= 3 && k === k.toUpperCase()
      ? new RegExp(`(^|[^\\p{L}])${reEsc(k)}($|[^\\p{L}])`, 'u')
      : new RegExp(reEsc(k), 'iu'));
  return it => res.some(r => r.test(it.title) || r.test(it.teaser || '') || (it.tags || []).some(t => r.test(t)));
}
export async function loadTopic(topic) {
  const m = topicMatcher(topic);
  const kws = (topic.keywords || []).filter(Boolean);
  const q = kws.slice(0, 5).map(k => k.includes(' ') ? `"${k}"` : k).join(' OR ');
  const tasks = [() => loadCategory('top')];
  if (topic.category && topic.category !== 'top') tasks.push(() => loadCategory(topic.category));
  if (q) tasks.push(() => searchNews(q, { days: 3 }).catch(() => []));
  const lists = await Promise.all(tasks.map(t => t().catch(() => [])));
  // Suchtreffer sind schon relevant; Kategorie-Artikel werden per Stichwort gefiltert
  const searchHits = q ? (lists.pop() || []).filter(i => m(i) || i.source === 'google') : [];
  const feedHits = lists.flat().filter(m);
  return merge([feedHits, searchHits]);
}

// Eilmeldungen: markierte Meldungen + ganz neue Treffer in Themen mit Alarm
export function isBreakingTitle(it) { return it.breaking; }

// ---------- Rendering ----------
export function register(it) { ITEMS.set(it.id, it); return it.id; }
function srcMeta(it) {
  const s = srcById(it.source);
  const col = s?.color || '#888';
  return `<span class="src-dot" style="background:${col}"></span><span class="src">${esc(it.publisher || s?.name || '')}</span><span>·</span><span>${esc(timeAgo(it.date))}</span>`;
}
export function artRow(it, { compact = false, thumb = true } = {}) {
  register(it);
  const img = thumb && it.image ? `<img class="thumb" src="${esc(it.image)}" alt="" loading="lazy" onerror="this.remove()">` : '';
  return `<div class="art ${compact ? 'compact' : ''}" data-article="${it.id}">
    <div class="body">
      <div class="title">${it.breaking ? '<span class="tag-breaking">EIL</span> ' : ''}${esc(it.title)}</div>
      ${!compact && it.teaser ? `<div class="teaser">${esc(it.teaser)}</div>` : ''}
      <div class="meta">${srcMeta(it)}${it.video ? ' · ▶ Video' : ''}</div>
    </div>${compact ? '' : img}</div>`;
}
export function artHero(it) {
  register(it);
  return `<div class="hero ${it.image ? '' : 'noimg'}" data-article="${it.id}">
    ${it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
    <div class="inner">
      ${it.topline ? `<div class="meta" style="margin:0 0 4px;font-weight:700;text-transform:uppercase;letter-spacing:.05em">${esc(it.topline)}</div>` : ''}
      <div class="title">${it.breaking ? '<span class="tag-breaking">EIL</span> ' : ''}${esc(it.title)}</div>
      ${it.teaser ? `<div class="teaser">${esc(it.teaser)}</div>` : ''}
      <div class="meta">${srcMeta(it)}</div>
    </div></div>`;
}

// ---------- Sanitizer für Volltext-HTML ----------
const ALLOWED = new Set(['P', 'H2', 'H3', 'H4', 'STRONG', 'B', 'EM', 'I', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A', 'BR', 'FIGURE', 'FIGCAPTION', 'IMG']);
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'NOSCRIPT', 'FORM', 'BUTTON', 'SVG', 'OBJECT', 'EMBED', 'VIDEO', 'AUDIO', 'INPUT', 'SELECT', 'TEXTAREA', 'ASIDE', 'NAV']);
export function sanitize(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const out = document.createElement('div');
  const walk = (src, dst) => {
    for (const n of src.childNodes) {
      if (n.nodeType === 3) { dst.appendChild(document.createTextNode(n.textContent)); continue; }
      if (n.nodeType !== 1 || DROP.has(n.tagName)) continue;
      if (!ALLOWED.has(n.tagName)) { walk(n, dst); continue; }
      const el = document.createElement(n.tagName);
      if (n.tagName === 'A') {
        const h = safeUrl(n.getAttribute('href') || '');
        if (h) { el.href = h; el.target = '_blank'; el.rel = 'noopener noreferrer'; }
      }
      if (n.tagName === 'IMG') {
        const s = n.getAttribute('src') || n.getAttribute('data-src') || '';
        if (!/^https:/i.test(s)) continue;
        el.src = s; el.alt = n.getAttribute('alt') || ''; el.loading = 'lazy';
      }
      walk(n, el);
      dst.appendChild(el);
    }
  };
  walk(doc.body.firstChild || doc.body, out);
  return out.innerHTML;
}

// Artikeltext aus beliebiger Webseite extrahieren (Reader-Modus)
export function extractArticle(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const og = p => doc.querySelector(`meta[property="${p}"],meta[name="${p}"]`)?.getAttribute('content') || '';
  const res = { image: og('og:image'), title: og('og:title'), blocks: [] };
  // 1) JSON-LD articleBody
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const find = o => {
        if (!o || typeof o !== 'object') return '';
        if (typeof o.articleBody === 'string' && o.articleBody.length > 400) return o.articleBody;
        for (const v of Object.values(o)) { const r = find(v); if (r) return r; }
        return '';
      };
      const body = find(JSON.parse(s.textContent));
      if (body) {
        res.blocks = body.split(/\n+/).map(t => t.trim()).filter(Boolean).map(t => ({ t: 'p', text: t }));
        if (res.blocks.length === 1 && body.length > 1200) {
          res.blocks = body.match(/[^.!?]+[.!?]+(\s|$)/g).reduce((acc, s2, i) => {
            if (i % 4 === 0) acc.push({ t: 'p', text: '' });
            acc[acc.length - 1].text += s2; return acc;
          }, []);
        }
        return res;
      }
    } catch { /* ignore */ }
  }
  // 2) DOM-Heuristik
  doc.querySelectorAll('script,style,noscript,nav,footer,header,aside,form,iframe,figure,[aria-hidden="true"],[class*="teaser"],[class*="related"],[class*="newsletter"],[class*="comment"],[class*="paywall"],[class*="ad-"],[id*="comment"]').forEach(e => e.remove());
  const cands = [doc.querySelector('[itemprop="articleBody"]'), doc.querySelector('article'), doc.querySelector('main'), doc.body].filter(Boolean);
  let root = cands.find(c => [...c.querySelectorAll('p')].filter(p => p.textContent.trim().length > 60).length >= 3) || doc.body;
  const seen = new Set();
  for (const el of root.querySelectorAll('p, h2, h3, blockquote, li')) {
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    if (!text || seen.has(text)) continue;
    const tag = el.tagName;
    if (tag === 'P' && text.length < 40) continue;
    if (tag === 'LI' && (text.length < 30 || el.closest('nav,ul[class*="menu"]'))) continue;
    if ((tag === 'H2' || tag === 'H3') && text.length > 160) continue;
    seen.add(text);
    res.blocks.push({ t: tag === 'P' || tag === 'LI' ? 'p' : tag === 'BLOCKQUOTE' ? 'q' : 'h', text });
  }
  return res;
}
function blocksHtml(blocks) {
  return blocks.map(b => b.t === 'h' ? `<h2>${esc(b.text)}</h2>` : b.t === 'q' ? `<blockquote>${esc(b.text)}</blockquote>` : `<p>${esc(b.text)}</p>`).join('');
}

async function loadFullText(it) {
  if (it.details) {
    const d = await cached('tsd:' + it.details, 3600e3, () => fetchJSON(it.details), { persist: false });
    const parts = (d.content || []).map(c => {
      if (c.type === 'text' || c.type === 'headline') return sanitize(c.value || '');
      if (c.type === 'quotation' && c.quotation?.text) return `<blockquote>${esc(c.quotation.text)}</blockquote>`;
      if (c.type === 'box' && c.box) return `<div class="box"><strong>${esc(stripHtml(c.box.title || ''))}</strong>${sanitize(c.box.text || '')}</div>`;
      return '';
    }).join('');
    if (parts) return { html: parts };
  }
  if (it.html) return { html: sanitize(it.html) };
  if (!it.url || /news\.google\.com/.test(it.url)) return null;
  const page = await cached('page:' + it.url, 3600e3, () => fetchText(it.url, { timeout: 15000, validate: t => /<html|<body|<article/i.test(t) }), { persist: false });
  const ex = extractArticle(page);
  if (ex.blocks.length < 2) return { image: ex.image };
  return { html: blocksHtml(ex.blocks), image: ex.image };
}

// ---------- Leser ----------
export function isSaved(id) { return state.saved.some(s => s.id === id); }
export function toggleSave(it) {
  if (isSaved(it.id)) state.saved = state.saved.filter(s => s.id !== it.id);
  else state.saved.unshift({ ...it, html: '' });
  save();
  return isSaved(it.id);
}

export function openArticle(it) {
  const actions = () => `
    <button class="icon-btn" data-act="size" aria-label="Textgröße">${icon('text')}</button>
    <button class="icon-btn ${isSaved(it.id) ? 'on' : ''}" data-act="save" aria-label="Merken">${icon('bookmark')}</button>`;
  openSheet({
    title: it.publisher || '',
    actions: actions(),
    render: async (body, sh) => {
      document.documentElement.style.setProperty('--reader-size', state.settings.textSize || 1);
      sh.el.querySelector('.sh-actions').addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'save') { const on = toggleSave(it); b.classList.toggle('on', on); toast(on ? 'Gespeichert' : 'Entfernt'); }
        if (b.dataset.act === 'size') {
          const sizes = [0.9, 1, 1.12, 1.25];
          const i = (sizes.indexOf(state.settings.textSize || 1) + 1) % sizes.length;
          state.settings.textSize = sizes[i]; save();
          document.documentElement.style.setProperty('--reader-size', sizes[i]);
        }
      });
      const s = srcById(it.source);
      body.innerHTML = `<article class="reader">
        ${it.video ? `<video class="player-v" src="${esc(it.video)}" controls playsinline poster="${esc(it.image)}" style="margin-bottom:18px"></video>`
          : it.image ? `<img class="r-img" src="${esc(it.image)}" alt="" onerror="this.remove()">` : '<div class="r-img-slot"></div>'}
        ${it.topline ? `<div class="r-top">${esc(it.topline)}</div>` : `<div class="r-top">${esc(catLabel(it.cat || 'top'))}</div>`}
        <h1>${esc(it.title)}</h1>
        <div class="r-meta"><span class="src-dot" style="background:${s?.color || '#888'}"></span><b>${esc(it.publisher || s?.name || '')}</b>
          <span>·</span><span>${it.date ? new Date(it.date).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span></div>
        ${it.teaser ? `<p class="lead">${esc(it.teaser)}</p>` : ''}
        <div class="content">${skeletonList(3, false)}</div>
        <div class="reader-actions">
          ${navigator.share ? `<button class="btn sm" data-share>${icon('share', 'sm')} Teilen</button>` : ''}
          ${it.url ? `<a class="btn sm" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${icon('ext', 'sm')} Original</a>` : ''}
        </div>
      </article>`;
      body.querySelector('[data-share]')?.addEventListener('click', () => navigator.share({ title: it.title, url: it.url }).catch(() => {}));
      const content = body.querySelector('.content');
      try {
        const full = await loadFullText(it);
        if (sh.closed) return;
        if (full?.image && !it.image && !it.video) {
          const slot = body.querySelector('.r-img-slot');
          if (slot && safeUrl(full.image)) slot.outerHTML = `<img class="r-img" src="${esc(safeUrl(full.image))}" alt="" onerror="this.remove()">`;
        }
        if (full?.html) content.innerHTML = full.html;
        else content.innerHTML = `<div class="note">Der vollständige Text ist bei diesem Anbieter nicht frei abrufbar (z. B. Paywall). Oben siehst du die Zusammenfassung – über „Original“ geht’s zum ganzen Artikel.</div>`;
      } catch (e) {
        if (sh.closed) return;
        content.innerHTML = `<div class="note">Volltext konnte nicht geladen werden. Über „Original“ kannst du den Artikel direkt beim Anbieter lesen.</div>`;
      }
    },
  });
}

// Liste in einem Sheet (z. B. Thema „Alle anzeigen“)
export function openArticleList(title, loader) {
  openSheet({
    title,
    render: async (body, sh) => {
      body.innerHTML = `<div class="card list-card">${skeletonList(6)}</div>`;
      try {
        const items = await loader();
        if (sh.closed) return;
        body.innerHTML = items.length
          ? `<div class="card list-card">${items.slice(0, 80).map(i => artRow(i)).join('')}</div>`
          : empty('Noch keine passenden Artikel gefunden.');
      } catch (e) { body.innerHTML = errorBox(e); }
    },
  });
}

// ---------- News-Tab ----------
export function renderNews(root) {
  let cat = 'top', query = '', items = [], shown = 30;
  root.innerHTML = `
    <header class="vhead"><div class="wrap">
      <div class="vhead-row"><h1>News</h1>
        <button class="icon-btn" data-sources aria-label="Quellen">${icon('layers')}</button>
        <button class="icon-btn" data-reload aria-label="Aktualisieren">${icon('refresh')}</button></div>
      <form class="search" style="margin-top:12px" role="search">${icon('search')}<input type="search" placeholder="Suche in allen Quellen …" enterkeyhint="search" aria-label="Nachrichten durchsuchen"></form>
      <div class="chips" style="margin-top:12px">${CATS.map(c => `<button class="chip ${c.id === cat ? 'active' : ''}" data-cat="${c.id}">${c.icon} ${esc(c.label)}</button>`).join('')}</div>
    </div></header>
    <div class="wrap"><div class="list"></div></div>`;
  const list = root.querySelector('.list');
  const input = root.querySelector('input');

  function paint() {
    if (!items.length) { list.innerHTML = empty(query ? `Keine Treffer für „${query}“.` : 'Keine Artikel gefunden.'); return; }
    const [first, ...rest] = items.slice(0, shown);
    const srcCount = new Set(items.map(i => i.publisher)).size;
    list.innerHTML = `
      <div class="muted" style="font-size:12.5px;margin:0 2px 10px">${items.length} Artikel aus ${srcCount} Quellen${query ? ` für „${esc(query)}“` : ''}</div>
      ${artHero(first)}
      <div class="card list-card" style="margin-top:14px">${rest.map(i => artRow(i)).join('')}</div>
      ${items.length > shown ? `<button class="btn block" data-more style="margin-top:14px">Mehr laden</button>` : ''}`;
  }
  async function load(force) {
    list.innerHTML = `<div class="sk" style="height:240px;border-radius:22px"></div><div class="card" style="margin-top:14px">${skeletonList(6)}</div>`;
    root.querySelector('[data-reload]').classList.add('spin');
    try {
      if (force) invalidate('');
      items = query ? await searchNews(query) : await loadCategory(cat);
      shown = 30;
      paint();
    } catch (e) {
      list.innerHTML = errorBox(e, '<br><button class="btn sm" data-retry>Erneut versuchen</button>');
    } finally { root.querySelector('[data-reload]').classList.remove('spin'); }
  }
  root.addEventListener('click', e => {
    const c = e.target.closest('[data-cat]');
    if (c) {
      cat = c.dataset.cat; query = ''; input.value = '';
      $$('.chip', root).forEach(x => x.classList.toggle('active', x === c));
      load();
    }
    if (e.target.closest('[data-more]')) { shown += 30; paint(); }
    if (e.target.closest('[data-retry]')) load(true);
    if (e.target.closest('[data-reload]')) load(true);
    if (e.target.closest('[data-sources]')) openSources(() => load(true));
  });
  root.querySelector('form').addEventListener('submit', e => {
    e.preventDefault();
    query = input.value.trim();
    input.blur();
    load();
  });
  input.addEventListener('search', () => { if (!input.value) { query = ''; load(); } });
  load();
  return {
    refresh: () => load(),
    setCategory: c => { root.querySelector(`[data-cat="${c}"]`)?.click(); },
    search: q => { input.value = q; query = q; load(); },
  };
}

export function openSources(onDone) {
  openSheet({
    title: 'Quellen',
    onClose: onDone,
    render: body => {
      const rows = s => `<div class="src-row">
        <div class="src-badge" style="background:${s.color}">${esc(s.name.replace(/[^A-Za-zÄÖÜ]/g, '').slice(0, 2).toUpperCase())}</div>
        <div class="tx"><b>${esc(s.name)}</b><span>${esc(s.desc || '')}</span></div>
        <label class="switch"><input type="checkbox" data-src="${s.id}" ${isEnabled(s) ? 'checked' : ''}><i></i></label></div>`;
      body.innerHTML = `
        <p class="muted" style="margin-top:0">Wähle, aus welchen Redaktionen und Agenturen deine Nachrichten kommen. Über Google News fließen zusätzlich Meldungen hunderter weiterer Verlage (inkl. dpa-, AFP- und Reuters-Meldungen bei den Partnern) ein.</p>
        <h3 style="margin:18px 4px 8px">Deutschsprachig</h3>
        <div class="card">${SOURCES.filter(s => !s.intl).map(rows).join('')}</div>
        <h3 style="margin:22px 4px 8px">International</h3>
        <div class="card">${SOURCES.filter(s => s.intl).map(rows).join('')}</div>`;
      body.addEventListener('change', e => {
        const id = e.target.dataset.src;
        if (!id) return;
        state.sources[id] = e.target.checked;
        save();
      });
    },
  });
}
