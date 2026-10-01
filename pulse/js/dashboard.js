// Dashboard „Heute“: Eilmeldungen, Wetter, Briefing, Themen-Widgets, Watchlist, Sport, Live
import { state, save, invalidate } from './store.js';
import { esc, icon, timeAgo, skeletonList, empty, errorBox, initials, dayLabel } from './ui.js';
import { loadCategory, loadTopic, topicMatcher, artRow, artHero, register, CATS, searchNews } from './news.js';
import { quotes, quoteTile } from './markets.js';
import { dashboardGames, matchRow, leagueBy, myTeam, schedule, teamPosition, openTeamPicker, clubNews, nationalGames } from './sports.js';
import { weather, wmo, CHANNELS, channelCard } from './extras.js';
import { openTopicEditor, openDashboardEditor } from './settings.js';

export const WIDGETS = {
  breaking: { label: 'Eilmeldungen', icon: '🚨' },
  myteam: { label: 'Mein Verein', icon: '❤️' },
  weather: { label: 'Wetter', icon: '🌤️' },
  briefing: { label: 'Das Wichtigste', icon: '⚡' },
  topics: { label: 'Meine Themen', icon: '⭐' },
  markets: { label: 'Watchlist', icon: '📈' },
  sports: { label: 'Live-Sport', icon: '⚽' },
  live: { label: 'Live-TV', icon: '📺' },
};

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Hallo' : h < 11 ? 'Guten Morgen' : h < 17 ? 'Hallo' : h < 23 ? 'Guten Abend' : 'Gute Nacht';
}
function isBirthday() {
  const b = state.profile.birthday;
  if (!b) return false;
  const d = new Date(b), n = new Date();
  return d.getDate() === n.getDate() && d.getMonth() === n.getMonth();
}
const hexA = (hex, a) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(124,92,255,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

export function renderDashboard(root, app) {
  let lastUpdate = 0, running = false;
  const collected = new Map(); // topicId -> items

  function shell() {
    const p = state.profile;
    const today = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    root.innerHTML = `
      <header class="vhead"><div class="wrap"><div class="vhead-row">
        <div style="flex:1"></div>
        <button class="icon-btn" data-research aria-label="Recherche">${icon('search')}</button>
        <button class="icon-btn" data-edit aria-label="Dashboard anpassen">${icon('sliders')}</button>
        <button class="icon-btn" data-reload aria-label="Aktualisieren">${icon('refresh')}</button>
        <button class="avatar" data-profile aria-label="Profil">${esc(initials(p.name))}</button>
      </div></div></header>
      <div class="wrap">
        <div class="greet"><div class="date">${esc(today)}</div>
          <h1>${isBirthday() ? '🎉 Alles Gute' : greeting()}${p.name ? `, <span class="g">${esc(p.name.split(' ')[0])}</span>` : ''}</h1>
          <div class="updated"><span class="dot"></span><span data-upd>Wird geladen …</span></div></div>
        <div class="dash-grid" data-grid></div>
      </div>`;
    const grid = root.querySelector('[data-grid]');
    for (const w of state.widgets.filter(w => w.on)) {
      if (w.type === 'topics') {
        state.topics.forEach(t => grid.insertAdjacentHTML('beforeend', `<div class="card" data-w="topic" data-topic="${t.id}">${topicHead(t)}${skeletonList(3, false)}</div>`));
        grid.insertAdjacentHTML('beforeend', `<button class="card card-pad" data-add-topic style="display:grid;place-items:center;min-height:120px;border-style:dashed;color:var(--text-3);font-weight:650">${icon('plus', 'lg')}<span style="margin-top:6px">Thema hinzufügen</span></button>`);
      } else if (w.type === 'myteam') {
        grid.insertAdjacentHTML('beforeend', `<div class="card" data-w="myteam">${skeleton('myteam')}</div>`);
        if (state.favLeagues.includes('national/dfb')) grid.insertAdjacentHTML('beforeend', `<div class="card" data-w="dfb">${skeleton('myteam')}</div>`);
      } else if (w.type === 'breaking') {
        grid.insertAdjacentHTML('beforeend', `<div class="span-all hidden" data-w="breaking"></div>`);
      } else {
        const span = ['briefing', 'markets'].includes(w.type) ? 'span-all' : '';
        grid.insertAdjacentHTML('beforeend', `<div class="card ${span}" data-w="${w.type}">${skeleton(w.type)}</div>`);
      }
    }
  }
  function skeleton(type) {
    if (type === 'markets') return `<div class="card-head"><h3>📈 Watchlist</h3></div><div class="tiles">${'<div class="tile"><div class="sk sk-line"></div><div class="sk sk-line" style="height:18px"></div><div class="sk" style="height:30px;margin-top:8px"></div></div>'.repeat(4)}</div>`;
    if (type === 'weather') return `<div class="weather"><div class="sk" style="width:56px;height:56px;border-radius:50%"></div><div style="flex:1"><div class="sk sk-line" style="width:40%"></div><div class="sk sk-line" style="width:70%"></div></div></div>`;
    return `<div class="card-head"><h3>${WIDGETS[type]?.icon || ''} ${esc(WIDGETS[type]?.label || '')}</h3></div>${skeletonList(3, type === 'briefing')}`;
  }
  const topicHead = (t, items) => {
    const fresh = items ? items.filter(i => Date.now() - i.date < 3 * 3600e3).length : 0;
    return `<div class="card-head"><div class="badge-ico" style="background:${hexA(t.color, .16)}">${esc(t.icon || '⭐')}</div>
      <h3>${esc(t.name)}</h3>${fresh ? `<span class="pill up" style="background:${hexA(t.color, .14)};color:${esc(t.color)}">${fresh} neu</span>` : ''}
      <button class="icon-btn" data-edit-topic="${t.id}" style="width:32px;height:32px;box-shadow:none" aria-label="Thema bearbeiten">${icon('edit', 'sm')}</button></div>`;
  };
  const W = type => root.querySelector(`[data-w="${type}"]`);

  async function wMyTeam() {
    const el = W('myteam');
    if (!el) return;
    const t = myTeam();
    if (!t) {
      el.innerHTML = `<div class="card-head"><h3>❤️ Mein Verein</h3></div>
        <div class="empty"><div class="e">⚽</div>Wähle deinen Lieblingsverein – dann siehst du hier seine Spiele, den Tabellenplatz und alle News.<br>
        <button class="btn primary sm" data-pick-team style="margin-top:12px">Verein wählen</button></div>`;
      return;
    }
    const L = leagueBy(t.key);
    el.innerHTML = `<div class="card-head" data-team="${esc(t.key)}|${esc(t.id)}" style="cursor:pointer">
        ${t.logo ? `<img src="${esc(t.logo)}" alt="" style="width:36px;height:36px;object-fit:contain">` : '<span style="font-size:24px">⚽</span>'}
        <h3>${esc(t.full || t.name)}<br><small class="muted" style="font-weight:500;font-size:12.5px" data-pos>${esc(L?.name || '')}</small></h3>
        <button class="icon-btn" data-pick-team style="width:32px;height:32px;box-shadow:none" aria-label="Verein ändern">${icon('edit', 'sm')}</button></div>
      <div data-games>${skeletonList(2, false)}</div>
      <div class="day-h">News</div><div class="list-card" data-tnews>${skeletonList(3, false)}</div>`;
    const [sched, pos] = await Promise.all([schedule(t.key, t.id).catch(() => []), teamPosition(t.key, t.id)]);
    if (pos) el.querySelector('[data-pos]').textContent = `${L?.name || ''} · Platz ${pos.rank}${pos.points != null ? ` · ${pos.points} Punkte` : ''}${pos.group ? ` · ${pos.group}` : ''}`;
    const now = Date.now();
    const live = sched.find(m => m.state === 'in');
    const next = sched.find(m => m.state === 'pre' && m.date > now - 3 * 3600e3);
    const last = sched.filter(m => m.state === 'post').pop();
    const part = (lbl, m) => m ? `<div class="day-h" style="padding-bottom:0">${lbl} · ${esc(dayLabel(m.date))}</div>${matchRow(m)}` : '';
    el.querySelector('[data-games]').innerHTML = part('Live', live) +
      (next ? part('Nächstes Spiel', next) : '<div class="day-h">Nächstes Spiel</div><div class="muted" style="padding:4px 16px 10px;font-size:13.5px">Noch kein Termin angesetzt.</div>') +
      part('Letztes Ergebnis', last);
    try {
      const items = await clubNews({ en: t.full, full: t.full, name: t.name });
      el.querySelector('[data-tnews]').innerHTML = items.slice(0, 4).map(i => artRow(i, { compact: true })).join('') || empty('Gerade keine News zu deinem Verein.', '📰');
    } catch { el.querySelector('[data-tnews]').innerHTML = empty('News gerade nicht erreichbar.', '📰'); }
  }
  async function wDfb() {
    const el = W('dfb');
    if (!el) return;
    el.innerHTML = `<div class="card-head" data-go="sport" style="cursor:pointer"><span style="font-size:26px">🇩🇪</span>
        <h3>DFB-Team<br><small class="muted" style="font-weight:500;font-size:12.5px">Nationalmannschaft</small></h3></div>
      <div data-games>${skeletonList(2, false)}</div><div class="day-h">News</div><div class="list-card" data-tnews>${skeletonList(3, false)}</div>`;
    const list = await nationalGames('national/dfb').catch(() => []);
    const now = Date.now();
    const live = list.find(m => m.state === 'in');
    const next = list.find(m => m.state === 'pre' && m.date > now - 3 * 3600e3);
    const last = list.filter(m => m.state === 'post').pop();
    const part = (lbl, m) => m ? `<div class="day-h" style="padding-bottom:0">${lbl} · ${esc(dayLabel(m.date))}${m.comp ? ' · ' + esc(m.comp) : ''}</div>${matchRow(m)}` : '';
    el.querySelector('[data-games]').innerHTML = part('Live', live) +
      (next ? part('Nächstes Spiel', next) : '<div class="day-h">Nächstes Spiel</div><div class="muted" style="padding:4px 16px 10px;font-size:13.5px">Noch kein Termin angesetzt.</div>') +
      part('Letztes Ergebnis', last);
    try {
      const items = await clubNews({ en: 'Germany', full: 'Germany', name: 'Deutschland' });
      el.querySelector('[data-tnews]').innerHTML = items.slice(0, 4).map(i => artRow(i, { compact: true })).join('') || empty('Gerade keine News zum DFB-Team.', '📰');
    } catch { el.querySelector('[data-tnews]').innerHTML = empty('News gerade nicht erreichbar.', '📰'); }
  }
  async function wWeather() {
    const el = W('weather');
    if (!el) return;
    try {
      const d = await weather();
      const c = d.current, dd = d.daily;
      const [e, txt] = wmo(c.weather_code);
      el.innerHTML = `<div class="weather"><div class="big">${e}</div>
        <div style="flex:1;min-width:0"><div class="temp">${Math.round(c.temperature_2m)}°</div>
        <div class="desc">${esc(txt)} · gefühlt ${Math.round(c.apparent_temperature)}°</div></div>
        <div style="text-align:right;font-size:13px"><b>${esc(state.profile.city || '')}</b><div class="muted">↑ ${Math.round(dd.temperature_2m_max[0])}° ↓ ${Math.round(dd.temperature_2m_min[0])}°</div><div class="muted">💨 ${Math.round(c.wind_speed_10m)} km/h</div></div></div>
        <div class="forecast">${dd.time.slice(1, 6).map((t, i) => `<div>${new Date(t).toLocaleDateString('de-DE', { weekday: 'short' })}<div class="e">${wmo(dd.weather_code[i + 1])[0]}</div><b>${Math.round(dd.temperature_2m_max[i + 1])}°</b>${Math.round(dd.temperature_2m_min[i + 1])}°</div>`).join('')}</div>`;
    } catch (e) { el.innerHTML = `<div class="card-head"><h3>🌤️ Wetter</h3></div>${errorBox(e)}`; }
  }
  async function wBriefing() {
    const el = W('briefing');
    if (!el) return [];
    try {
      const items = await loadCategory('top');
      collected.set('_top', items);
      const [first, ...rest] = items;
      el.innerHTML = `<div class="card-head"><h3>⚡ Das Wichtigste</h3><button class="link-btn" data-go="news">Alle News ${icon('right', 'sm')}</button></div>
        <div class="grid g2" style="padding:6px 16px 16px;gap:16px"><div>${first ? artHero(first) : ''}</div>
        <div class="list-card" style="margin:-12px -16px 0">${rest.slice(0, 5).map(i => artRow(i, { compact: true })).join('')}</div></div>`;
      return items;
    } catch (e) { el.innerHTML = `<div class="card-head"><h3>⚡ Das Wichtigste</h3></div>${errorBox(e)}`; return []; }
  }
  async function wTopic(t) {
    const el = root.querySelector(`[data-topic="${t.id}"]`);
    if (!el) return;
    try {
      const items = await loadTopic(t);
      collected.set(t.id, items);
      el.innerHTML = `${topicHead(t, items)}
        ${items.length ? `<div class="list-card">${items.slice(0, 4).map(i => artRow(i, { compact: true })).join('')}</div>` : empty('Aktuell nichts Neues zu diesem Thema.', t.icon || '⭐')}
        ${items.length > 4 ? `<div style="padding:4px 16px 14px"><button class="link-btn" data-topic-all="${t.id}">Alle ${items.length} Artikel ${icon('right', 'sm')}</button></div>` : ''}`;
    } catch (e) { el.innerHTML = topicHead(t) + errorBox(e); }
  }
  async function wMarkets() {
    const el = W('markets');
    if (!el) return;
    const head = `<div class="card-head"><h3>📈 Watchlist</h3><button class="link-btn" data-go="boerse">Börse ${icon('right', 'sm')}</button></div>`;
    if (!state.watchlist.length) { el.innerHTML = head + empty('Füge im Börsen-Tab Aktien zu deiner Watchlist hinzu.', '⭐'); return; }
    try {
      const qs = await quotes(state.watchlist);
      el.innerHTML = head + `<div class="tiles">${qs.map(quoteTile).join('')}</div>`;
    } catch (e) { el.innerHTML = head + errorBox(e); }
  }
  async function wSports() {
    const el = W('sports');
    if (!el) return;
    const names = state.favLeagues.map(k => leagueBy(k)?.name).filter(Boolean).slice(0, 3).join(' · ');
    const head = `<div class="card-head"><h3>⚽ Live-Sport</h3><button class="link-btn" data-go="sport">Sport ${icon('right', 'sm')}</button></div>`;
    if (!state.favLeagues.length && !state.favTeams.length) { el.innerHTML = head + empty('Markiere im Sport-Tab Ligen mit ★, um sie hier zu sehen.', '🏆'); return; }
    try {
      const games = await dashboardGames();
      el.innerHTML = head + `<div class="muted" style="font-size:12px;padding:0 16px">${esc(names)}</div>` +
        (games.length ? (games[0].upcoming ? '<div class="day-h">Als Nächstes</div>' : '') + games.slice(0, 6).map(matchRow).join('') : empty('Aktuell keine Spiele in deinen Ligen.', '📅'));
    } catch (e) { el.innerHTML = head + errorBox(e); }
  }
  function wLive() {
    const el = W('live');
    if (!el) return;
    el.innerHTML = `<div class="card-head"><h3>📺 Live-TV</h3><button class="link-btn" data-open-live>Alle Sender ${icon('right', 'sm')}</button></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:6px 16px 16px">${CHANNELS.slice(0, 2).map(channelCard).join('')}</div>`;
  }
  function wBreaking() {
    const el = W('breaking');
    if (!el) return;
    const now = Date.now();
    const all = [...collected.values()].flat();
    const alertTopics = state.topics.filter(t => t.alert);
    const matchers = alertTopics.map(t => ({ t, m: topicMatcher(t) }));
    const seen = new Set();
    let flagged = all.filter(i => i.breaking && now - i.date < 8 * 3600e3 && !seen.has(i.id) && seen.add(i.id));
    if (!state.settings.allBreaking) flagged = flagged.filter(i => matchers.some(x => x.m(i)));
    const fresh = [];
    for (const { t } of matchers) {
      for (const i of (collected.get(t.id) || []).filter(i => now - i.date < 45 * 60e3).slice(0, 2)) {
        if (!seen.has(i.id)) { seen.add(i.id); fresh.push({ i, t }); }
      }
    }
    const cards = [
      ...flagged.slice(0, 4).map(i => (register(i), `<div class="breaking" data-article="${i.id}"><div class="lbl"><span class="pulse-dot"></span>Eilmeldung</div><div class="t">${esc(i.title.replace(/^(\+\+\+\s*|eil(meldung)?[:+ ]\s*)/i, ''))}</div><div class="m">${esc(i.publisher)} · ${esc(timeAgo(i.date))}</div></div>`)),
      ...fresh.slice(0, 4).map(({ i, t }) => (register(i), `<div class="breaking soft" data-article="${i.id}"><div class="lbl"><span class="pulse-dot"></span>Neu · ${esc(t.icon)} ${esc(t.name)}</div><div class="t">${esc(i.title)}</div><div class="m">${esc(i.publisher)} · ${esc(timeAgo(i.date))}</div></div>`)),
    ];
    el.classList.toggle('hidden', !cards.length);
    el.innerHTML = `<div class="breaking-scroller">${cards.join('')}</div>`;
    // Benachrichtigung für neue Eilmeldungen (während die App geöffnet ist)
    const newOnes = flagged.filter(i => !state.seenBreaking.includes(i.id));
    if (newOnes.length) {
      if (state.settings.notify && 'Notification' in window && Notification.permission === 'granted' && lastUpdate) {
        navigator.serviceWorker?.ready.then(r => r.showNotification('Eilmeldung', { body: newOnes[0].title, icon: 'icons/icon-192.png', tag: newOnes[0].id })).catch(() => {});
      }
      state.seenBreaking = [...newOnes.map(i => i.id), ...state.seenBreaking].slice(0, 200);
      save();
    }
  }

  async function refresh(force = false) {
    if (running) return;
    running = true;
    root.querySelector('[data-reload]')?.classList.add('spin');
    if (force) invalidate('');
    const jobs = [wMyTeam(), wDfb(), wWeather(), wMarkets(), wSports()];
    wLive();
    // Top-Nachrichten immer laden (für Eilmeldungen), auch wenn Briefing ausgeblendet ist
    jobs.push(W('briefing') ? wBriefing() : loadCategory('top').then(i => collected.set('_top', i)).catch(() => {}));
    if (state.widgets.find(w => w.type === 'topics')?.on) state.topics.forEach(t => jobs.push(wTopic(t)));
    await Promise.allSettled(jobs);
    wBreaking();
    lastUpdate = Date.now();
    const u = root.querySelector('[data-upd]');
    if (u) u.textContent = `Aktualisiert ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · automatisch alle ${state.settings.refresh} Min.`;
    root.querySelector('[data-reload]')?.classList.remove('spin');
    running = false;
  }

  root.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-reload]')) return refresh(true);
    if (t.closest('[data-pick-team]')) { e.stopPropagation(); return openTeamPicker(() => wMyTeam()); }
    if (t.closest('[data-edit]')) return openDashboardEditor(() => rebuild());
    if (t.closest('[data-add-topic]')) return openTopicEditor(null, () => rebuild());
    const et = t.closest('[data-edit-topic]');
    if (et) return openTopicEditor(state.topics.find(x => x.id === et.dataset.editTopic), () => rebuild());
    const all = t.closest('[data-topic-all]');
    if (all) {
      const tp = state.topics.find(x => x.id === all.dataset.topicAll);
      return app.openList(`${tp.icon} ${tp.name}`, async () => collected.get(tp.id) || loadTopic(tp));
    }
    const go = t.closest('[data-go]');
    if (go) return app.go(go.dataset.go);
    if (t.closest('[data-profile]')) return app.openProfile();
    if (t.closest('[data-research]')) return app.openResearch();
    if (t.closest('[data-open-live]')) return app.openLive();
  });

  function rebuild() { shell(); refresh(); }
  window.addEventListener('pulse:favs', () => rebuild());
  shell();
  refresh();
  return {
    refresh: (force) => refresh(force),
    rebuild,
    get lastUpdate() { return lastUpdate; },
  };
}
export { CATS };
