// Sport: Live-Ergebnisse, Tabellen, Teams, Kader & Spielerdaten (ESPN), Torjäger (OpenLigaDB)
import { state, save, cached, invalidate } from './store.js';
import { fetchJSON, pool, DATA } from './net.js';
import { esc, safeUrl, icon, openSheet, toast, skeletonList, empty, errorBox, dayLabel, clock, $$ } from './ui.js';
import { artRow, searchNews } from './news.js';

import { LEAGUES } from './sources.js';
export { LEAGUES };
export const leagueBy = k => LEAGUES.find(l => l.key === k);
// site.web.api.espn.com erlaubt Browser-Abrufe (CORS); site.api.espn.com blockiert Browser
const API = 'https://site.web.api.espn.com/apis/site/v2/sports/';
const STAND = 'https://site.web.api.espn.com/apis/v2/sports/';
// Fallback: vom Daten-Job gespeicherte Kopien
const backup = (key, kind) => fetchJSON(`${DATA}sports/${key.replace('/', '_')}-${kind}.json`);
async function espn(url, key, kind) {
  try { return await fetchJSON(url); }
  catch (e) { if (kind) return backup(key, kind); throw e; }
}
const isSoccer = k => k.startsWith('soccer/');

// ---------- Daten ----------
const scoreVal = s => (s && typeof s === 'object') ? (s.displayValue ?? s.value) : s;
function team(x) {
  const t = x?.team || {};
  return {
    id: t.id, name: t.shortDisplayName || t.displayName || x?.athlete?.displayName || '?', full: t.displayName || '',
    logo: safeUrl(t.logo || t.logos?.[0]?.href || ''), score: scoreVal(x?.score), winner: x?.winner,
  };
}
function parseEvent(ev, key) {
  const c = ev.competitions?.[0] || {};
  const comps = c.competitors || [];
  const home = comps.find(x => x.homeAway === 'home') || comps[0];
  const away = comps.find(x => x.homeAway === 'away') || comps[1];
  const st = c.status || ev.status || {};
  const race = leagueBy(key)?.racing;
  return {
    id: ev.id, key, date: Date.parse(ev.date || c.date), name: ev.name, state: st.type?.state || 'pre',
    detail: st.type?.shortDetail || st.type?.detail || '', clock: st.displayClock, period: st.period,
    home: race ? null : team(home), away: race ? null : team(away), venue: c.venue?.fullName || '',
    podium: race ? (ev.competitions || []).slice(-1)[0]?.competitors?.slice().sort((a, b) => (a.order || 99) - (b.order || 99)).slice(0, 3).map(x => x.athlete?.displayName || x.athlete?.shortName) : null,
  };
}
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
export async function scoreboard(key, week = null) {
  let url = `${API}${key}/scoreboard`;
  if (week != null) {
    const s = new Date(); s.setDate(s.getDate() - 3 + week * 7);
    const e = new Date(s); e.setDate(e.getDate() + 7);
    url += `?dates=${ymd(s)}-${ymd(e)}&limit=200`;
  }
  return cached('sb:' + url, 30e3, async () => {
    const d = await espn(url, key, !week ? 'scoreboard' : null);
    return (d.events || []).map(e => parseEvent(e, key)).sort((a, b) => a.date - b.date);
  });
}
export async function standings(key) {
  return cached('st:' + key, 10 * 60e3, async () => {
    const d = await espn(`${STAND}${key}/standings`, key, 'standings');
    const groups = d.children?.length ? d.children : [d];
    return groups.map(g => ({
      name: g.name || '',
      entries: (g.standings?.entries || []).map(e => ({
        id: e.team?.id || e.athlete?.id,
        name: e.team?.shortDisplayName || e.team?.displayName || e.athlete?.displayName || '?',
        logo: safeUrl(e.team?.logos?.[0]?.href || e.athlete?.flag?.href || ''),
        note: e.note, stats: Object.fromEntries((e.stats || []).map(s => [s.name || s.type, s.displayValue ?? s.value])),
        raw: Object.fromEntries((e.stats || []).map(s => [s.name || s.type, s.value])),
      })),
    }));
  });
}
export async function teams(key) {
  return cached('tm:' + key, 24 * 3600e3, async () => {
    const d = await espn(`${API}${key}/teams`, key, 'teams');
    return (d.sports?.[0]?.leagues?.[0]?.teams || []).map(x => x.team).map(t => ({
      id: t.id, name: t.shortDisplayName || t.displayName, full: t.displayName, logo: safeUrl(t.logos?.[0]?.href || ''), color: t.color,
    })).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  });
}
async function roster(key, id) {
  return cached(`ro:${key}:${id}`, 6 * 3600e3, async () => {
    const d = await fetchJSON(`${API}${key}/teams/${id}/roster`);
    const flat = [];
    for (const a of d.athletes || []) {
      if (a.items) a.items.forEach(x => flat.push({ ...x, _grp: a.position }));
      else flat.push(a);
    }
    return flat.map(a => ({
      id: a.id, name: a.displayName || a.fullName, jersey: a.jersey || '', pos: a.position?.displayName || a._grp || '',
      age: a.age, nat: a.citizenship || a.birthPlace?.country || '', height: a.displayHeight || '', weight: a.displayWeight || '',
      photo: safeUrl(a.headshot?.href || ''),
    }));
  }, { persist: false });
}
async function schedule(key, id) {
  return cached(`sc:${key}:${id}`, 5 * 60e3, async () => {
    const d = await fetchJSON(`${API}${key}/teams/${id}/schedule`);
    return (d.events || []).map(e => parseEvent(e, key)).sort((a, b) => a.date - b.date);
  }, { persist: false });
}
async function goalGetters(oldb) {
  const now = new Date();
  const season = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return cached(`gg:${oldb}:${season}`, 30 * 60e3, async () => {
    const d = await fetchJSON(`https://api.openligadb.de/getgoalgetters/${oldb}/${season}`);
    return (d || []).sort((a, b) => b.goalCount - a.goalCount).slice(0, 25);
  });
}

// ---------- Bausteine ----------
const favTeam = (key, id) => state.favTeams.some(t => t.key === key && String(t.id) === String(id));
function statusLabel(m) {
  if (m.state === 'in') {
    const d = m.detail.replace(/^HT$/, 'Halbzeit');
    return `<span class="live-badge">LIVE</span><small>${esc(isSoccer(m.key) ? (m.clock || d) : d)}</small>`;
  }
  if (m.state === 'post') {
    const d = m.detail.replace(/^FT$/, 'Ende').replace('AET', 'n. V.').replace(/FT-Pens|Pens/, 'i. E.').replace('Final', 'Ende').replace(/^Postponed$/, 'Verlegt');
    return `<small>${esc(d || 'Ende')}</small>`;
  }
  return `<small>${esc(clock(m.date))}</small>`;
}
export function matchRow(m) {
  if (!m.home) {
    return `<div class="match" data-match="${esc(m.key)}|${esc(m.id)}" style="grid-template-columns:1fr auto">
      <div><b>${esc(m.name)}</b><div class="muted" style="font-size:12.5px">${esc(m.venue)}${m.podium?.length && m.state === 'post' ? ' · 🥇 ' + m.podium.map(esc).join(' · ') : ''}</div></div>
      <div class="score ${m.state === 'in' ? 'live' : ''}">${m.state === 'in' ? '<span class="live-badge">LIVE</span>' : ''}<small>${esc(m.state === 'pre' ? dayLabel(m.date) + ', ' + clock(m.date) : m.detail)}</small></div></div>`;
  }
  const showScore = m.state !== 'pre';
  const t = (x, cls) => `<div class="team ${cls} ${favTeam(m.key, x.id) ? 'fav' : ''}">${x.logo ? `<img src="${esc(x.logo)}" alt="" loading="lazy">` : ''}<span>${esc(x.name)}</span></div>`;
  return `<div class="match" data-match="${esc(m.key)}|${esc(m.id)}">
    ${t(m.home, 'home')}
    <div class="score ${m.state === 'in' ? 'live' : ''}"><b>${showScore ? `${esc(m.home.score ?? '-')} : ${esc(m.away.score ?? '-')}` : '– : –'}</b>${statusLabel(m)}</div>
    ${t(m.away, 'away')}</div>`;
}
function groupByDay(list) {
  const out = [];
  for (const m of list) {
    const lbl = dayLabel(m.date);
    if (!out.length || out[out.length - 1].lbl !== lbl) out.push({ lbl, items: [] });
    out[out.length - 1].items.push(m);
  }
  return out;
}

// ---------- Tab ----------
export function renderSports(root) {
  const sortedLeagues = () => [...LEAGUES].sort((a, b) => state.favLeagues.includes(b.key) - state.favLeagues.includes(a.key));
  let key = state.favLeagues[0] || 'soccer/ger.1', mode = 'games', week = 0, liveTimer = null;
  root.innerHTML = `
    <header class="vhead"><div class="wrap">
      <div class="vhead-row"><h1>Sport</h1>
        <button class="icon-btn" data-fav aria-label="Liga favorisieren">${icon('star')}</button>
        <button class="icon-btn" data-reload aria-label="Aktualisieren">${icon('refresh')}</button></div>
      <div class="chips" style="margin-top:12px" data-leagues></div>
      <div class="seg" data-modes></div>
    </div></header>
    <div class="wrap" style="margin-top:8px"><div data-body></div></div>`;
  const body = root.querySelector('[data-body]');

  function paintHead() {
    const L = leagueBy(key);
    root.querySelector('[data-leagues]').innerHTML = sortedLeagues().map(l => `<button class="chip ${l.key === key ? 'active' : ''}" data-league="${l.key}">${l.flag} ${esc(l.name)}${state.favLeagues.includes(l.key) ? ' <span class="star">★</span>' : ''}</button>`).join('');
    const modes = [['games', 'Spiele']];
    if (!L.noTable) modes.push(['table', L.racing ? 'WM-Stand' : 'Tabelle']);
    if (!L.noTeams) modes.push(['teams', 'Teams']);
    if (L.oldb) modes.push(['scorers', 'Torjäger']);
    if (!modes.some(m => m[0] === mode)) mode = 'games';
    root.querySelector('[data-modes]').innerHTML = modes.map(([id, l]) => `<button class="${id === mode ? 'active' : ''}" data-mode="${id}">${l}</button>`).join('');
    root.querySelector('[data-fav]').classList.toggle('on', state.favLeagues.includes(key));
  }
  async function paintGames() {
    body.innerHTML = `<div class="card">${skeletonList(6, false)}</div>`;
    try {
      const list = await scoreboard(key, week);
      if (mode !== 'games') return;
      const groups = groupByDay(list);
      const s = new Date(); s.setDate(s.getDate() - 3 + week * 7);
      const e = new Date(s); e.setDate(e.getDate() + 7);
      const f = d => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
      body.innerHTML = `
        <div class="row" style="justify-content:space-between;margin:4px 0 12px">
          <button class="icon-btn" data-week="-1" aria-label="Vorherige Woche">${icon('left')}</button>
          <button class="btn sm" data-week="0">${week === 0 ? 'Diese Woche' : `${f(s)} – ${f(e)}`}</button>
          <button class="icon-btn" data-week="1" aria-label="Nächste Woche">${icon('right')}</button></div>
        ${groups.length ? groups.map(g => `<div class="card" style="margin-bottom:12px"><div class="day-h">${esc(g.lbl)}</div>${g.items.map(matchRow).join('')}</div>`).join('')
          : `<div class="card">${empty('In diesem Zeitraum finden keine Spiele statt.', '📅')}</div>`}`;
      clearInterval(liveTimer);
      if (list.some(m => m.state === 'in')) liveTimer = setInterval(() => { if (!document.hidden && root.classList.contains('active') && mode === 'games') { invalidate('sb:'); paintGames(); } }, 30e3);
    } catch (err) { body.innerHTML = `<div class="card">${errorBox(err)}</div>`; }
  }
  async function paintTable() {
    body.innerHTML = `<div class="card">${skeletonList(8, false)}</div>`;
    const L = leagueBy(key);
    try {
      const groups = await standings(key);
      if (mode !== 'table') return;
      const soccer = isSoccer(key);
      const cols = soccer ? [['gamesPlayed', 'Sp'], ['wins', 'S'], ['ties', 'U'], ['losses', 'N'], ['pointDifferential', 'Diff'], ['points', 'Pkt']]
        : L.racing ? [['championshipPts', 'Pkt']]
        : key === 'hockey/nhl' ? [['gamesPlayed', 'Sp'], ['wins', 'S'], ['losses', 'N'], ['otLosses', 'OTN'], ['points', 'Pkt']]
        : [['wins', 'S'], ['losses', 'N'], ['winPercent', '%'], ['gamesBehind', 'GB']];
      body.innerHTML = groups.map(g => {
        let rows = g.entries.slice();
        const rk = e => +(e.raw.rank || e.raw.playoffSeed || 0);
        if (rows.every(e => rk(e))) rows.sort((a, b) => rk(a) - rk(b));
        else if (soccer) rows.sort((a, b) => (b.raw.points || 0) - (a.raw.points || 0));
        else if (L.racing) rows.sort((a, b) => (b.raw.championshipPts || b.raw.points || 0) - (a.raw.championshipPts || a.raw.points || 0));
        else rows.sort((a, b) => (b.raw.winPercent || 0) - (a.raw.winPercent || 0));
        return `<div class="card" style="margin-bottom:12px;overflow-x:auto">${g.name && groups.length > 1 ? `<div class="day-h">${esc(g.name)}</div>` : ''}
          <table class="tbl"><thead><tr><th>#</th><th class="tn">${L.racing ? 'Fahrer' : 'Team'}</th>${cols.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead><tbody>
          ${rows.map((e, i) => `<tr class="${favTeam(key, e.id) ? 'fav' : ''}" ${L.racing ? '' : `data-team="${esc(key)}|${esc(e.id)}"`}>
            <td>${e.note?.color ? `<span class="zone" style="background:${esc(e.note.color)}" title="${esc(e.note.description || '')}"></span> ` : ''}${i + 1}</td>
            <td class="tn"><div>${e.logo ? `<img src="${esc(e.logo)}" alt="" loading="lazy">` : ''}<span>${esc(e.name)}</span></div></td>
            ${cols.map(c => `<td>${esc(e.stats[c[0]] ?? (c[0] === 'championshipPts' ? e.stats.points : '') ?? '')}</td>`).join('')}</tr>`).join('')}
          </tbody></table></div>`;
      }).join('') || `<div class="card">${empty('Keine Tabelle verfügbar.', '📊')}</div>`;
    } catch (err) { body.innerHTML = `<div class="card">${errorBox(err)}</div>`; }
  }
  async function paintTeams() {
    body.innerHTML = `<div class="team-grid">${Array.from({ length: 12 }, () => '<div class="team-card"><div class="sk" style="width:44px;height:44px;margin:0 auto 8px;border-radius:50%"></div><div class="sk sk-line"></div></div>').join('')}</div>`;
    try {
      const list = await teams(key);
      if (mode !== 'teams') return;
      body.innerHTML = `<div class="team-grid">${list.map(t => `<div class="team-card" data-team="${esc(key)}|${esc(t.id)}">${t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy">` : ''}${favTeam(key, t.id) ? '★ ' : ''}${esc(t.name)}</div>`).join('')}</div>`;
    } catch (err) { body.innerHTML = `<div class="card">${errorBox(err)}</div>`; }
  }
  async function paintScorers() {
    body.innerHTML = `<div class="card">${skeletonList(8, false)}</div>`;
    try {
      const list = await goalGetters(leagueBy(key).oldb);
      if (mode !== 'scorers') return;
      body.innerHTML = `<div class="card">${list.length ? list.map((g, i) => `
        <div class="player"><div class="no">${i + 1}</div><div class="nm"><b>${esc(g.goalGetterName)}</b></div><b style="font-size:18px">${esc(g.goalCount)}</b><span class="muted" style="font-size:12px">Tore</span></div>`).join('')
        : empty('Noch keine Torjäger in dieser Saison.', '⚽')}</div><p class="disclaimer">Quelle: OpenLigaDB (Community-Daten)</p>`;
    } catch (err) { body.innerHTML = `<div class="card">${errorBox(err)}</div>`; }
  }
  function paint() {
    paintHead();
    clearInterval(liveTimer);
    ({ games: paintGames, table: paintTable, teams: paintTeams, scorers: paintScorers })[mode]();
  }
  root.addEventListener('click', e => {
    const l = e.target.closest('[data-league]');
    if (l) { key = l.dataset.league; week = 0; paint(); return; }
    const m = e.target.closest('[data-mode]');
    if (m) { mode = m.dataset.mode; paint(); return; }
    const w = e.target.closest('[data-week]');
    if (w) { const v = +w.dataset.week; week = v === 0 ? 0 : week + v; paintGames(); return; }
    if (e.target.closest('[data-fav]')) {
      if (state.favLeagues.includes(key)) state.favLeagues = state.favLeagues.filter(x => x !== key);
      else state.favLeagues.push(key);
      save(); paintHead();
      toast(state.favLeagues.includes(key) ? 'Liga erscheint jetzt auf deinem Dashboard' : 'Liga aus Favoriten entfernt');
    }
    if (e.target.closest('[data-reload]')) { invalidate('sb:'); invalidate('st:'); paint(); }
  });
  paint();
  return { refresh: paint, setLeague: k => { key = k; paint(); } };
}

// ---------- Globale Klick-Ziele ----------
export function openMatch(key, id) {
  openSheet({
    title: 'Spiel',
    render: async (body, sh) => {
      body.innerHTML = `<div class="card">${skeletonList(5, false)}</div>`;
      const load = async () => {
        const d = await fetchJSON(`${API}${key}/summary?event=${id}`);
        const c = d.header?.competitions?.[0] || {};
        const comps = c.competitors || [];
        const h = comps.find(x => x.homeAway === 'home') || comps[0];
        const a = comps.find(x => x.homeAway === 'away') || comps[1];
        const st = c.status || {};
        return { d, c, h: team(h), a: team(a), st: { state: st.type?.state, detail: st.type?.shortDetail || st.type?.detail || '', clock: st.displayClock }, date: Date.parse(c.date) };
      };
      const paint = async () => {
        let r;
        try { r = await load(); } catch (e) { body.innerHTML = errorBox(e); return; }
        if (sh.closed) return;
        const { d, h, a, st } = r;
        const L = leagueBy(key);
        sh.setTitle(L?.name || 'Spiel');
        if (!h || !a || h.name === '?') { body.innerHTML = empty(d.header?.competitions?.[0]?.name || 'Keine Details verfügbar', '🏁'); return; }
        const m = { key, id, state: st.state, detail: st.detail, clock: st.clock, date: r.date, home: h, away: a };
        const evs = (d.keyEvents || d.scoringPlays || []).filter(x => x.text || x.type?.text);
        const stats = d.boxscore?.teams || [];
        const statNames = stats[0]?.statistics?.slice(0, 12) || [];
        const rosters = d.rosters || [];
        const big = t => `<div style="text-align:center;flex:1;min-width:0"><img src="${esc(t.logo)}" alt="" style="width:64px;height:64px;object-fit:contain;margin:0 auto 8px"><b style="font-size:15px">${esc(t.full || t.name)}</b></div>`;
        body.innerHTML = `
          <div class="card card-pad"><div class="row" style="align-items:flex-start">${big(h)}
            <div style="text-align:center;padding-top:14px"><div style="font-size:38px;font-weight:800;letter-spacing:-.03em" class="tabnum">${st.state === 'pre' ? '– : –' : `${esc(h.score ?? 0)} : ${esc(a.score ?? 0)}`}</div>
            <div class="score ${st.state === 'in' ? 'live' : ''}">${statusLabel(m)}</div><div class="muted" style="font-size:12px;margin-top:4px">${esc(dayLabel(r.date))}, ${esc(clock(r.date))}</div></div>
            ${big(a)}</div>
            ${d.gameInfo?.venue?.fullName ? `<div class="muted" style="text-align:center;font-size:12.5px;margin-top:10px">📍 ${esc(d.gameInfo.venue.fullName)}${d.gameInfo.attendance ? ` · ${esc(d.gameInfo.attendance.toLocaleString('de-DE'))} Zuschauer` : ''}</div>` : ''}
          </div>
          ${evs.length ? `<div class="section-title"><h2>Spielverlauf</h2></div><div class="card" style="padding:8px 0">${evs.slice(-40).map(x => `
            <div class="ev"><span class="min">${esc(x.clock?.displayValue || x.period?.displayValue || '')}</span>
            <span>${/goal|tor|score|touchdown/i.test(x.type?.type || x.type?.text || '') || x.scoringPlay ? '⚽️ ' : /yellow/i.test(x.type?.type || '') ? '🟨 ' : /red/i.test(x.type?.type || '') ? '🟥 ' : /substitution/i.test(x.type?.type || '') ? '🔁 ' : ''}${esc(x.text || x.type?.text || '')}</span></div>`).join('')}</div>` : ''}
          ${statNames.length && stats.length === 2 ? `<div class="section-title"><h2>Statistik</h2></div><div class="card" style="padding:8px 0">${statNames.map((s, i) => {
            const hv = stats[0].statistics[i]?.displayValue ?? '', av = stats[1].statistics.find(x => x.name === s.name)?.displayValue ?? '';
            const hn = parseFloat(hv) || 0, an = parseFloat(av) || 0, tot = hn + an || 1;
            return `<div class="statbar"><div class="l"><span>${esc(hv)}</span><span>${esc(s.label || s.name)}</span><span>${esc(av)}</span></div><div class="b"><i style="width:${hn / tot * 100}%"></i><i style="width:${an / tot * 100}%"></i></div></div>`;
          }).join('')}</div>` : ''}
          ${rosters.length === 2 && rosters[0].roster?.length ? `<div class="section-title"><h2>Aufstellungen</h2></div><div class="grid g2">${rosters.map(ro => `
            <div class="card"><div class="card-head"><h3>${esc(ro.team?.displayName || '')}</h3><span class="muted">${esc(ro.formation || '')}</span></div>
            ${ro.roster.filter(p => p.starter).map(p => `<div class="player" ${p.athlete?.id ? `data-player="${esc(key)}|${esc(p.athlete.id)}"` : ''}><div class="no">${esc(p.jersey || '')}</div><div class="nm"><b>${esc(p.athlete?.displayName || '')}</b><span>${esc(p.position?.displayName || p.position?.abbreviation || '')}</span></div></div>`).join('')}</div>`).join('')}</div>` : ''}
          <div class="section-title"><h2>Berichte</h2></div><div class="card list-card" data-news>${skeletonList(3)}</div>`;
        searchNews(`${h.full || h.name} ${a.full || a.name}`, { days: 4 }).then(items => {
          const el = body.querySelector('[data-news]');
          if (el) el.innerHTML = items.slice(0, 8).map(i => artRow(i)).join('') || empty('Noch keine Berichte.');
        }).catch(() => { const el = body.querySelector('[data-news]'); if (el) el.innerHTML = empty('Noch keine Berichte.'); });
        if (st.state === 'in') setTimeout(() => { if (!sh.closed) paint(); }, 30e3);
      };
      paint();
    },
  });
}

export function openTeam(key, id) {
  openSheet({
    title: 'Team',
    render: async (body, sh) => {
      body.innerHTML = `<div class="card">${skeletonList(6, false)}</div>`;
      let info;
      try { info = (await teams(key)).find(t => String(t.id) === String(id)); } catch { /* ignore */ }
      const starBtn = () => `<button class="icon-btn ${favTeam(key, id) ? 'on' : ''}" data-star aria-label="Lieblingsteam">${icon('star')}</button>`;
      sh.setTitle(info?.full || 'Team');
      sh.setActions(starBtn());
      sh.el.querySelector('.sh-actions').addEventListener('click', e => {
        if (!e.target.closest('[data-star]')) return;
        if (favTeam(key, id)) state.favTeams = state.favTeams.filter(t => !(t.key === key && String(t.id) === String(id)));
        else state.favTeams.push({ key, id: String(id), name: info?.name || '', logo: info?.logo || '' });
        save(); sh.setActions(starBtn());
        toast(favTeam(key, id) ? 'Lieblingsteam gespeichert' : 'Lieblingsteam entfernt');
      });
      const [sched, ros] = await Promise.all([schedule(key, id).catch(() => []), roster(key, id).catch(() => [])]);
      if (sh.closed) return;
      const now = Date.now();
      const past = sched.filter(m => m.state === 'post' || m.date < now - 3 * 3600e3).slice(-5).reverse();
      const next = sched.filter(m => m.state !== 'post' && m.date >= now - 3 * 3600e3).slice(0, 5);
      const groups = {};
      ros.forEach(p => (groups[p.pos || 'Kader'] ||= []).push(p));
      body.innerHTML = `
        <div class="card card-pad row" style="gap:16px">${info?.logo ? `<img src="${esc(info.logo)}" alt="" style="width:64px;height:64px;object-fit:contain">` : ''}
          <div><div style="font-size:22px;font-weight:800;letter-spacing:-.02em">${esc(info?.full || '')}</div><div class="muted">${esc(leagueBy(key)?.name || '')}</div></div></div>
        ${next.length ? `<div class="section-title"><h2>Nächste Spiele</h2></div><div class="card">${next.map(matchRow).join('')}</div>` : ''}
        ${past.length ? `<div class="section-title"><h2>Letzte Ergebnisse</h2></div><div class="card">${past.map(matchRow).join('')}</div>` : ''}
        <div class="section-title"><h2>Kader</h2><span class="muted" style="font-size:13px">${ros.length} Spieler</span></div>
        ${ros.length ? Object.entries(groups).map(([g, ps]) => `<div class="card" style="margin-bottom:12px"><div class="day-h">${esc(g)}</div>${ps.map(p => `
          <div class="player" data-player="${esc(key)}|${esc(p.id)}"><div class="no">${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy">` : esc(p.jersey)}</div>
          <div class="nm"><b>${esc(p.name)}</b><span>${[p.jersey && '#' + p.jersey, p.age && p.age + ' J.', p.nat].filter(Boolean).map(esc).join(' · ')}</span></div>${icon('right', 'sm')}</div>`).join('')}</div>`).join('')
        : `<div class="card">${empty('Kader nicht verfügbar.', '👥')}</div>`}
        <div class="section-title"><h2>News</h2></div><div class="card list-card" data-news>${skeletonList(3)}</div>`;
      searchNews(info?.full || info?.name || '', { days: 7 }).then(items => {
        const el = body.querySelector('[data-news]');
        if (el) el.innerHTML = items.slice(0, 8).map(i => artRow(i)).join('') || empty('Keine News.');
      }).catch(() => {});
    },
  });
}

export function openPlayer(key, id) {
  openSheet({
    title: 'Spieler',
    render: async (body, sh) => {
      body.innerHTML = `<div class="card">${skeletonList(4, false)}</div>`;
      try {
        const d = await cached(`pl:${key}:${id}`, 3600e3, () => fetchJSON(`https://site.web.api.espn.com/apis/common/v3/sports/${key}/athletes/${id}`), { persist: false });
        if (sh.closed) return;
        const a = d.athlete || d;
        sh.setTitle(a.displayName || 'Spieler');
        const kv = [
          ['Position', a.position?.displayName], ['Trikot', a.displayJersey || a.jersey], ['Alter', a.age && a.age + ' Jahre'],
          ['Geburtstag', a.displayDOB || (a.dateOfBirth && new Date(a.dateOfBirth).toLocaleDateString('de-DE'))],
          ['Nationalität', a.citizenship || a.displayBirthPlace], ['Größe', a.displayHeight], ['Gewicht', a.displayWeight], ['Team', a.team?.displayName],
        ].filter(x => x[1]);
        const stats = a.statsSummary?.statistics || [];
        body.innerHTML = `
          <div class="card card-pad row" style="gap:16px">
            ${a.headshot?.href ? `<img src="${esc(safeUrl(a.headshot.href))}" alt="" style="width:84px;height:84px;border-radius:50%;object-fit:cover;background:var(--surface-2)">` : `<div class="avatar" style="width:84px;height:84px;font-size:28px">${esc((a.displayName || '?')[0])}</div>`}
            <div><div style="font-size:24px;font-weight:800;letter-spacing:-.02em">${esc(a.displayName || '')}</div>
            <div class="muted">${esc(a.position?.displayName || '')}${a.team?.displayName ? ' · ' + esc(a.team.displayName) : ''}</div></div></div>
          ${stats.length ? `<div class="section-title"><h2>Saison-Statistik</h2></div><div class="kv">${stats.map(s => `<div><span>${esc(s.displayName || s.shortDisplayName || s.name)}</span><b>${esc(s.displayValue)}</b></div>`).join('')}</div>` : ''}
          <div class="section-title"><h2>Steckbrief</h2></div>
          <div class="kv">${kv.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
          <div class="section-title"><h2>News</h2></div><div class="card list-card" data-news>${skeletonList(3)}</div>`;
        searchNews(a.displayName, { days: 14 }).then(items => {
          const el = body.querySelector('[data-news]');
          if (el) el.innerHTML = items.slice(0, 8).map(i => artRow(i)).join('') || empty('Keine News.');
        }).catch(() => {});
      } catch (e) { body.innerHTML = errorBox(e); }
    },
  });
}

// ---------- Dashboard ----------
export async function dashboardGames() {
  const keys = state.favLeagues.slice(0, 4);
  const extra = [...new Set(state.favTeams.map(t => t.key))].filter(k => !keys.includes(k)).slice(0, 2);
  const lists = await pool([...keys, ...extra], 3, k => scoreboard(k));
  const now = Date.now();
  const all = lists.flat().filter(Boolean)
    .filter(m => m.state === 'in' || Math.abs(m.date - now) < 36 * 3600e3 || (m.state === 'post' && now - m.date < 60 * 3600e3))
    .filter(m => keys.includes(m.key) || favTeam(m.key, m.home?.id) || favTeam(m.key, m.away?.id));
  const rank = m => (m.state === 'in' ? 0 : (favTeam(m.key, m.home?.id) || favTeam(m.key, m.away?.id)) ? 1 : m.state === 'pre' ? 2 : 3);
  return all.sort((a, b) => rank(a) - rank(b) || Math.abs(a.date - now) - Math.abs(b.date - now));
}
