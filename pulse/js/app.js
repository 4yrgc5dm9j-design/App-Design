// Pulse – App-Start, Tab-Navigation, globale Klick-Ziele, Auto-Refresh
import { state, save } from './store.js';
import { icon, closeAllSheets } from './ui.js';
import { renderNews, openArticle, openArticleList, ITEMS } from './news.js';
import { renderMarkets, openStock } from './markets.js';
import { renderSports, openMatch, openTeam, openPlayer } from './sports.js';
import { renderDashboard } from './dashboard.js';
import { renderMore, runOnboarding, applyTheme, openProfile } from './settings.js';
import { openLive, openResearch, playChannel } from './extras.js';
import { openAssistant } from './assistant.js';

const TABS = [
  { id: 'heute', label: 'Heute', icon: 'home', render: renderDashboard },
  { id: 'news', label: 'News', icon: 'news', render: renderNews },
  { id: 'boerse', label: 'Börse', icon: 'trend', render: renderMarkets },
  { id: 'sport', label: 'Sport', icon: 'trophy', render: renderSports },
  { id: 'mehr', label: 'Mehr', icon: 'grid', render: renderMore },
];
const views = {};
let current = null;

const app = {
  go,
  dashboard: () => views.heute?.api,
  openList: openArticleList,
  openProfile: () => openProfile(() => views.heute?.api.rebuild()),
  openResearch: () => openResearch(),
  openLive,
};

function go(id) {
  if (!TABS.some(t => t.id === id)) id = 'heute';
  closeAllSheets();
  current = id;
  state.settings.lastTab = id;
  save();
  const main = document.getElementById('views');
  for (const t of TABS) {
    let v = views[t.id];
    if (t.id === id && !v) {
      const el = document.createElement('section');
      el.className = 'view';
      el.dataset.view = t.id;
      main.appendChild(el);
      v = views[t.id] = { el, api: null, shown: 0 };
      v.api = t.render(el, app) || {};
      v.shown = Date.now();
    }
    if (v) v.el.classList.toggle('active', t.id === id);
  }
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  // veraltete Ansicht beim Zurückkehren auffrischen
  const v = views[id];
  if (v && Date.now() - v.shown > state.settings.refresh * 60e3) { v.shown = Date.now(); v.api.refresh?.(); }
  window.scrollTo({ top: 0 });
}

function tabbar() {
  const nav = document.getElementById('tabbar');
  nav.innerHTML = TABS.map(t => `<button data-tab="${t.id}" aria-label="${t.label}">${icon(t.icon)}<span>${t.label}</span></button>`).join('');
  nav.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    if (b.dataset.tab === current) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    go(b.dataset.tab);
  });
}

// Globale Klick-Ziele (Artikel, Aktien, Spiele, Teams, Spieler, Sender)
document.addEventListener('click', e => {
  const t = e.target;
  const a = t.closest('[data-article]');
  if (a) { const it = ITEMS.get(a.dataset.article); if (it) openArticle(it); return; }
  const s = t.closest('[data-stock]');
  if (s) { openStock(s.dataset.stock, () => { views.boerse?.api.onWatchChange?.(); }); return; }
  const m = t.closest('[data-match]');
  if (m) { const [k, id] = m.dataset.match.split('|'); openMatch(k, id); return; }
  const tm = t.closest('[data-team]');
  if (tm) { const [k, id] = tm.dataset.team.split('|'); openTeam(k, id); return; }
  const p = t.closest('[data-player]');
  if (p) { const [k, id] = p.dataset.player.split('|'); openPlayer(k, id); return; }
  const ch = t.closest('[data-channel]');
  if (ch) { playChannel(ch.dataset.channel); return; }
});

// Nicht ladbare Bilder (Logos, Thumbnails) unauffällig ausblenden
document.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.style.visibility = 'hidden'; }, true);

// Auto-Refresh
function tick() {
  if (document.hidden) return;
  const d = views.heute;
  if (d && current === 'heute' && Date.now() - (d.api.lastUpdate || 0) > state.settings.refresh * 60e3) d.api.refresh();
}
setInterval(tick, 30e3);
document.addEventListener('visibilitychange', tick);

function start() {
  applyTheme();
  tabbar();
  // KI-Assistent immer erreichbar
  const fab = document.createElement('button');
  fab.className = 'fab'; fab.setAttribute('aria-label', 'KI-Assistent fragen'); fab.textContent = '✨';
  fab.onclick = () => openAssistant();
  document.body.appendChild(fab);
  const hashTab = location.hash.replace('#', '');
  go(hashTab || 'heute');
}

applyTheme();
if (state.onboarded) start();
else runOnboarding(start);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
