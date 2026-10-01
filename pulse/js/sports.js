// Sport: Live-Ergebnisse, Tabellen, Teams, Kader & Spielerdaten (ESPN), Torjäger (OpenLigaDB)
import { state, save, cached, invalidate } from './store.js';
import { fetchJSON, pool, DATA } from './net.js';
import { esc, safeUrl, icon, openSheet, toast, skeletonList, empty, errorBox, dayLabel, clock, $$ } from './ui.js';
import { artRow, searchNews, loadCategory, merge } from './news.js';

import { LEAGUES, NATIONAL_COMPS, NATION_DE } from './sources.js';
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
    id: t.id, name: NATION_DE[t.displayName] || t.shortDisplayName || t.displayName || x?.athlete?.displayName || '?', full: NATION_DE[t.displayName] || t.displayName || '',
    en: t.displayName || '',
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
// Länderspiele: gesammelte Ergebnisse/Termine (Daten-Job) + Live-Stand der laufenden Wettbewerbe
async function nationalEvents() {
  return cached('nat:all', 60e3, async () => {
    const [stored, ...live] = await Promise.all([
      fetchJSON(`${DATA}sports/national.json`).catch(() => ({ events: [] })),
      ...NATIONAL_COMPS.map(c => fetchJSON(`${API}${c.key}/scoreboard`).then(d => (d.events || []).map(e => ({ ...e, _comp: c.key }))).catch(() => [])),
    ]);
    const byId = new Map();
    for (const e of [...(stored.events || []), ...live.flat()]) byId.set(e.id, e);
    const compName = Object.fromEntries(NATIONAL_COMPS.map(c => [c.key, c.name]));
    return [...byId.values()].map(e => ({ ...parseEvent(e, e._comp), comp: compName[e._comp] || '' })).sort((a, b) => a.date - b.date);
  }, { persist: false });
}
export async function nationalGames(key) {
  const L = leagueBy(key);
  const all = await nationalEvents();
  return L.only ? all.filter(m => m.home?.en === L.only || m.away?.en === L.only) : all;
}
export async function scoreboard(key, week = null) {
  if (leagueBy(key)?.national) {
    const list = await nationalGames(key);
    if (week == null) return list;
    const s = new Date(); s.setHours(0, 0, 0, 0); s.setDate(s.getDate() - 3 + week * 7);
    const e = new Date(s); e.setDate(e.getDate() + 8);
    return list.filter(m => m.date >= s && m.date < e);
  }
  if (week != null) {
    // ESPN lehnt Datumsbereiche ab – daher die 8 Tage einzeln abfragen
    const start = new Date(); start.setDate(start.getDate() - 3 + week * 7);
    const days = Array.from({ length: 8 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return ymd(d); });
    const lists = await pool(days, 4, d => cached(`sb:${key}:${d}`, 30e3, async () => {
      const r = await fetchJSON(`${API}${key}/scoreboard?dates=${d}`);
      return (r.events || []).map(e => parseEvent(e, key));
    }));
    if (lists.every(l => l == null)) throw new Error('Spiele gerade nicht erreichbar');
    const seen = new Set();
    return lists.flat().filter(m => m && !seen.has(m.id) && seen.add(m.id)).sort((x, y) => x.date - y.date);
  }
  const url = `${API}${key}/scoreboard`;
  return cached('sb:' + url, 30e3, async () => {
    const d = await espn(url, key, 'scoreboard');
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
        name: NATION_DE[e.team?.displayName] || e.team?.shortDisplayName || e.team?.displayName || e.athlete?.displayName || '?',
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
export async function schedule(key, id) {
  return cached(`sc:${key}:${id}`, 5 * 60e3, async () => {
    // Vergangene Spiele + kommende Spiele (fixture=true) + alle Wettbewerbe mit diesem Team
    const cups = isSoccer(key) ? ['soccer/uefa.champions', 'soccer/uefa.europa', 'soccer/uefa.europa.conf', 'soccer/ger.dfb_pokal'].filter(k => k !== key) : [];
    const lists = await Promise.all([
      fetchJSON(`${API}${key}/teams/${id}/schedule`).then(d => (d.events || []).map(e => parseEvent(e, key))).catch(() => []),
      fetchJSON(`${API}${key}/teams/${id}/schedule?fixture=true`).then(d => (d.events || []).map(e => parseEvent(e, key))).catch(() => []),
      scoreboard(key).catch(() => []),
      ...cups.map(k => fetchJSON(`${API}${k}/scoreboard`).then(d => (d.events || []).map(e => parseEvent(e, k))).catch(() => [])),
    ]);
    const byId = new Map();
    for (const m of lists.flat()) {
      if (!m || !(String(m.home?.id) === String(id) || String(m.away?.id) === String(id))) continue;
      const prev = byId.get(m.id);
      // aktuellere Statusdaten (live) bevorzugen
      if (!prev || (m.state === 'in' && prev.state !== 'in') || (m.state === 'post' && prev.state === 'pre')) byId.set(m.id, m);
    }
    return [...byId.values()].sort((a, b) => a.date - b.date);
  }, { persist: false });
}

// ---------- Vereins-News: nur Artikel über den Verein, nicht über die Stadt ----------
// ESPN nutzt englische Namen; eindeutige deutsche Namen/Kürzel („strong“) zählen immer,
// mehrdeutige („weak“, z. B. Städtenamen) nur in Artikeln mit Fußball-Bezug.
const CLUB_NAMES = {
  'Bayern Munich': { strong: ['FC Bayern', 'Bayern München', 'FCB'], weak: ['Bayern'] },
  'Borussia Dortmund': { strong: ['Borussia Dortmund', 'BVB'], weak: ['Dortmund'] },
  'Bayer Leverkusen': { strong: ['Bayer Leverkusen', 'Bayer 04', 'Werkself'], weak: ['Leverkusen'] },
  'RB Leipzig': { strong: ['RB Leipzig', 'RasenBallsport'], weak: ['Leipzig'] },
  'Eintracht Frankfurt': { strong: ['Eintracht Frankfurt', 'SGE'], weak: ['Eintracht', 'Frankfurt'] },
  'VfB Stuttgart': { strong: ['VfB Stuttgart', 'VfB'], weak: ['Stuttgart'] },
  'SC Freiburg': { strong: ['SC Freiburg', 'SCF'], weak: ['Freiburg'] },
  'VfL Wolfsburg': { strong: ['VfL Wolfsburg', 'VfL'], weak: ['Wolfsburg'] },
  'Borussia Mönchengladbach': { strong: ['Borussia Mönchengladbach', 'Gladbach', 'Fohlen'], weak: ['Mönchengladbach'] },
  "Borussia M'gladbach": { strong: ['Borussia Mönchengladbach', 'Gladbach', 'Fohlen'], weak: ['Mönchengladbach'] },
  'Werder Bremen': { strong: ['Werder Bremen', 'SV Werder', 'Werder'], weak: ['Bremen'] },
  'TSG Hoffenheim': { strong: ['TSG Hoffenheim', '1899 Hoffenheim', 'TSG'], weak: ['Hoffenheim'] },
  'Union Berlin': { strong: ['Union Berlin', '1. FC Union', 'Eisern Union'], weak: ['Köpenick'] },
  'FC Augsburg': { strong: ['FC Augsburg', 'FCA'], weak: ['Augsburg'] },
  'Mainz': { strong: ['Mainz 05', 'FSV Mainz', '1. FSV Mainz'], weak: ['Mainz'] },
  'Mainz 05': { strong: ['Mainz 05', 'FSV Mainz', '1. FSV Mainz'], weak: ['Mainz'] },
  'FC Cologne': { strong: ['1. FC Köln', 'FC Köln', 'Effzeh'], weak: ['Köln'] },
  'Cologne': { strong: ['1. FC Köln', 'FC Köln', 'Effzeh'], weak: ['Köln'] },
  'Hamburg SV': { strong: ['Hamburger SV', 'HSV'], weak: ['Hamburg'] },
  'Hamburger SV': { strong: ['Hamburger SV', 'HSV'], weak: ['Hamburg'] },
  'St. Pauli': { strong: ['FC St. Pauli', 'St. Pauli'], weak: [] },
  'FC St. Pauli': { strong: ['FC St. Pauli', 'St. Pauli'], weak: [] },
  'Heidenheim': { strong: ['1. FC Heidenheim', 'FC Heidenheim'], weak: ['Heidenheim'] },
  '1. FC Heidenheim 1846': { strong: ['1. FC Heidenheim', 'FC Heidenheim'], weak: ['Heidenheim'] },
  'Schalke 04': { strong: ['FC Schalke', 'Schalke 04', 'Schalke', 'S04', 'Königsblau'], weak: ['Gelsenkirchen'] },
  'Hertha Berlin': { strong: ['Hertha BSC', 'Hertha'], weak: [] },
  'SV Elversberg': { strong: ['SV Elversberg', 'Elversberg'], weak: [] },
  'SC Paderborn 07': { strong: ['SC Paderborn', 'Paderborn 07'], weak: ['Paderborn'] },
  'Paderborn': { strong: ['SC Paderborn', 'Paderborn 07'], weak: ['Paderborn'] },
  'VfL Bochum': { strong: ['VfL Bochum'], weak: ['Bochum'] },
  'Holstein Kiel': { strong: ['Holstein Kiel', 'KSV Holstein'], weak: ['Kiel'] },
  'Fortuna Düsseldorf': { strong: ['Fortuna Düsseldorf', 'Fortuna'], weak: ['Düsseldorf'] },
  'Hannover 96': { strong: ['Hannover 96'], weak: ['Hannover'] },
  '1. FC Nürnberg': { strong: ['1. FC Nürnberg', 'FCN', 'Der Club'], weak: ['Nürnberg'] },
  'Karlsruher SC': { strong: ['Karlsruher SC', 'KSC'], weak: ['Karlsruhe'] },
  '1. FC Kaiserslautern': { strong: ['1. FC Kaiserslautern', 'FCK', 'Roten Teufel'], weak: ['Kaiserslautern'] },
  'Darmstadt 98': { strong: ['SV Darmstadt', 'Darmstadt 98', 'Lilien'], weak: ['Darmstadt'] },
  'Real Madrid': { strong: ['Real Madrid'], weak: [] },
  'Barcelona': { strong: ['FC Barcelona', 'Barça', 'Barca'], weak: ['Barcelona'] },
  'Manchester United': { strong: ['Manchester United', 'Man United', 'ManUnited'], weak: [] },
  'Manchester City': { strong: ['Manchester City', 'Man City', 'ManCity'], weak: [] },
  'Liverpool': { strong: ['FC Liverpool', 'Liverpool FC'], weak: ['Liverpool'] },
  'Juventus': { strong: ['Juventus', 'Juve'], weak: ['Turin'] },
  'Paris Saint-Germain': { strong: ['Paris Saint-Germain', 'PSG'], weak: ['Paris'] },
  'Germany': { strong: ['DFB-Team', 'DFB-Elf', 'DFB-Auswahl', 'DFB-Kicker', 'DFB-Star', 'DFB-Stars', 'DFB-Spieler', 'Bundestrainer', 'deutsche Nationalmannschaft', 'Deutsche Nationalmannschaft', 'deutschen Nationalmannschaft', 'Deutschen Nationalmannschaft', 'deutsche Nationalelf', 'deutschen Nationalelf'], weak: ['Deutschland'] },
};
const SPORT_CONTEXT = /Bundesliga|Champions League|Europa League|Conference League|Pokal|Trainer|Spieltag|Spiel\b|Tor\b|Tore\b|Torschütze|Liga|Transfer|Kader|Stadion|Fans\b|Sieg|Niederlage|Remis|Unentschieden|Elfmeter|Saison|Mannschaft|Fußball|Abstieg|Tabelle|Stürmer|Verteidiger|Torwart|Keeper|Kicker|Länderspiel|Nations League|WM-|EM-|Premier League|LaLiga|Serie A|Ligue 1/i;
const reEscape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = w => new RegExp(`(^|[^\\p{L}\\d])${reEscape(w)}($|[^\\p{L}\\d])`, 'u');
export function clubDisplayName(team) {
  const k = CLUB_NAMES[team.en || team.full] || CLUB_NAMES[team.name];
  return k ? k.strong[0] : (team.full || team.name);
}
export function clubTerms(team) {
  const en = team.en || team.full || team.name || '';
  const known = CLUB_NAMES[en] || CLUB_NAMES[team.name] || null;
  const strong = known ? known.strong : [en];
  const weak = known ? known.weak : [team.name].filter(n => n && n !== en);
  return { strong, weak, query: strong[0] };
}
export function clubMatcher(team) {
  const { strong, weak } = clubTerms(team);
  const S = strong.map(wordRe), W = weak.map(wordRe);
  return it => {
    const text = `${it.title} ${it.teaser || ''}`;
    if (S.some(r => r.test(text))) return true;
    return W.some(r => r.test(text)) && (it.cat === 'sport' || it.source === 'kicker' || SPORT_CONTEXT.test(text));
  };
}
export async function clubNews(team) {
  const m = clubMatcher(team);
  const { strong } = clubTerms(team);
  const lists = await Promise.all([
    loadCategory('sport').catch(() => []),
    loadCategory('top').catch(() => []),
    ...strong.slice(0, 2).map(q => searchNews(q, { days: 10 }).catch(() => [])),
  ]);
  return merge(lists).filter(m);
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
  return `<small>${esc(m.upcoming || Math.abs(m.date - Date.now()) > 20 * 3600e3 ? dayLabel(m.date).replace(/^(\w+), /, '') + ' · ' + clock(m.date) : clock(m.date))}</small>`;
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
    if (!L.noTable) modes.push(['table', L.racing ? 'WM-Stand' : L.national ? 'Nations League' : 'Tabelle']);
    if (!L.noTeams) modes.push(['teams', 'Teams']);
    if (L.oldb) modes.push(['scorers', 'Torjäger']);
    if (!modes.some(m => m[0] === mode)) mode = 'games';
    root.querySelector('[data-modes]').innerHTML = modes.map(([id, l]) => `<button class="${id === mode ? 'active' : ''}" data-mode="${id}">${l}</button>`).join('');
    root.querySelector('[data-fav]').classList.toggle('on', state.favLeagues.includes(key));
  }
  async function paintNational() {
    body.innerHTML = `<div class="card">${skeletonList(6, false)}</div>`;
    try {
      const list = await nationalGames(key);
      if (mode !== 'games') return;
      const now = Date.now();
      const live = list.filter(m => m.state === 'in');
      const next = list.filter(m => m.state === 'pre' && m.date > now - 3 * 3600e3).slice(0, 12);
      const past = list.filter(m => m.state === 'post').slice(-12).reverse();
      const row = m => `<div class="day-h" style="padding-bottom:0">${esc(dayLabel(m.date))}${m.comp ? ' · ' + esc(m.comp) : ''}</div>${matchRow(m)}`;
      const sec = (title, items, e) => `<div class="section-title" style="margin-top:14px"><h2>${title}</h2></div>
        <div class="card">${items.length ? items.map(row).join('') : empty(e, '📅')}</div>`;
      body.innerHTML = (live.length ? sec('<span class="live-badge">LIVE</span> Jetzt', live, '') : '') +
        sec('Nächste Spiele', next, 'Aktuell sind keine Spiele angesetzt.') +
        sec('Letzte Ergebnisse', past, 'Noch keine Ergebnisse vorhanden.');
      clearInterval(liveTimer);
      if (live.length) liveTimer = setInterval(() => { if (!document.hidden && root.classList.contains('active') && mode === 'games') { invalidate('nat:'); paintNational(); } }, 30e3);
    } catch (err) { body.innerHTML = `<div class="card">${errorBox(err)}</div>`; }
  }
  async function paintGames() {
    if (leagueBy(key).national) return paintNational();
    body.innerHTML = `<div class="card">${skeletonList(6, false)}</div>`;
    try {
      let list = await scoreboard(key, week).catch(e => { if (week === 0) return []; throw e; });
      let nextNote = '';
      if (!list.length && week === 0) {
        // Pause (z. B. Länderspiele): nächsten Spieltag automatisch anzeigen
        const next = await scoreboard(key).catch(() => []);
        if (next.length) { list = next; nextNote = `<div class="muted" style="font-size:13px;margin:0 4px 10px">Diese Woche keine Spiele – hier ist der nächste Spieltag:</div>`; }
      }
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
        ${nextNote}${groups.length ? groups.map(g => `<div class="card" style="margin-bottom:12px"><div class="day-h">${esc(g.lbl)}</div>${g.items.map(matchRow).join('')}</div>`).join('')
          : `<div class="card">${empty('In diesem Zeitraum finden keine Spiele statt.', '📅')}</div>`}`;
      clearInterval(liveTimer);
      if (list.some(m => m.state === 'in')) liveTimer = setInterval(() => { if (!document.hidden && root.classList.contains('active') && mode === 'games') { invalidate('sb:'); paintGames(); } }, 30e3);
    } catch (err) { body.innerHTML = `<div class="card">${errorBox(err)}</div>`; }
  }
  async function paintTable() {
    body.innerHTML = `<div class="card">${skeletonList(8, false)}</div>`;
    const L = leagueBy(key);
    try {
      const groups = await standings(L.tableKey || key);
      if (mode !== 'table') return;
      const soccer = isSoccer(L.tableKey || key);
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
          ${rows.map((e, i) => `<tr class="${favTeam(key, e.id) ? 'fav' : ''}" ${L.racing ? '' : `data-team="${esc(L.tableKey || key)}|${esc(e.id)}"`}>
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
      window.dispatchEvent(new Event('pulse:favs'));
      toast(state.favLeagues.includes(key) ? (key === 'national/dfb' ? 'DFB-Team erscheint jetzt oben auf der Startseite' : 'Liga erscheint jetzt auf deinem Dashboard') : 'Aus Favoriten entfernt');
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
      clubNews({ en: info?.full, full: info?.full, name: info?.name }).then(items => {
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
  const lists = await pool([...keys, ...extra], 3, k => scoreboard(k).then(l => l.map(m => ({ ...m, via: k }))));
  const now = Date.now();
  const all = lists.flat().filter(Boolean)
    .filter(m => m.state === 'in' || Math.abs(m.date - now) < 36 * 3600e3 || (m.state === 'post' && now - m.date < 60 * 3600e3))
    .filter(m => keys.includes(m.via) || favTeam(m.key, m.home?.id) || favTeam(m.key, m.away?.id));
  const rank = m => (m.state === 'in' ? 0 : (favTeam(m.key, m.home?.id) || favTeam(m.key, m.away?.id)) ? 1 : m.state === 'pre' ? 2 : 3);
  if (all.length) return all.sort((a, b) => rank(a) - rank(b) || Math.abs(a.date - now) - Math.abs(b.date - now));
  // Nichts in den nächsten Stunden: die nächsten angesetzten Spiele zeigen
  return lists.flat().filter(m => m && m.state === 'pre' && m.date > now).sort((a, b) => a.date - b.date).slice(0, 6).map(m => ({ ...m, upcoming: true }));
}

// ---------- Lieblingsverein ----------
export const myTeam = () => state.favTeams[0] || null;
export function setMyTeam(t) {
  state.favTeams = [t, ...state.favTeams.filter(x => !(x.key === t.key && String(x.id) === String(t.id)))];
  state.profile.team = t.full || t.name;
  save();
  window.dispatchEvent(new Event('pulse:favs'));
}
export function openTeamPicker(onDone) {
  const pickable = LEAGUES.filter(l => !l.national && !l.racing && !l.noTeams && l.key !== 'soccer/ger.dfb_pokal');
  let key = myTeam()?.key || 'soccer/ger.1';
  openSheet({
    title: 'Lieblingsverein wählen',
    onClose: onDone,
    render: (body, sh) => {
      const paint = async () => {
        body.innerHTML = `<p class="muted" style="margin-top:0">Spiele, Tabellenplatz und News deines Vereins erscheinen dann ganz oben auf der Startseite.</p>
          <div class="chips">${pickable.map(l => `<button class="chip ${l.key === key ? 'active' : ''}" data-pl="${l.key}">${l.flag} ${esc(l.name)}</button>`).join('')}</div>
          <div data-grid><div class="card">${skeletonList(4, false)}</div></div>`;
        try {
          const list = await teams(key);
          const cur = myTeam();
          body.querySelector('[data-grid]').innerHTML = `<div class="team-grid">${list.map(t => `<button class="team-card" data-pick="${esc(t.id)}" style="${cur && cur.key === key && String(cur.id) === String(t.id) ? 'outline:2px solid var(--accent)' : ''}">${t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy">` : ''}${esc(t.name)}</button>`).join('')}</div>`;
          body.querySelector('[data-grid]').onclick = e => {
            const b = e.target.closest('[data-pick]');
            if (!b) return;
            const t = list.find(x => String(x.id) === b.dataset.pick);
            setMyTeam({ key, id: String(t.id), name: t.name, full: t.full, logo: t.logo });
            toast(`${t.full || t.name} ist jetzt dein Lieblingsverein`);
            sh.close();
          };
        } catch (err) { body.querySelector('[data-grid]').innerHTML = `<div class="card">${errorBox(err)}</div>`; }
      };
      body.addEventListener('click', e => { const c = e.target.closest('[data-pl]'); if (c) { key = c.dataset.pl; paint(); } });
      paint();
    },
  });
}
// Tabellenplatz eines Teams
export async function teamPosition(key, id) {
  try {
    const groups = await standings(key);
    for (const g of groups) {
      const rows = g.entries.slice().sort((a, b) => (+a.raw.rank || 99) - (+b.raw.rank || 99));
      const i = rows.findIndex(e => String(e.id) === String(id));
      if (i >= 0) return { rank: +rows[i].raw.rank || i + 1, points: rows[i].stats.points, played: rows[i].stats.gamesPlayed, group: groups.length > 1 ? g.name : '' };
    }
  } catch { /* keine Tabelle */ }
  return null;
}
