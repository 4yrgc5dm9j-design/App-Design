// Themen-Editor, Dashboard-Editor, Profil, Einstellungen, Gespeichert, „Mehr“-Tab, Onboarding
import { state, save, uid, resetAll, exportState, importState } from './store.js';
import { esc, icon, openSheet, toast, empty, initials, $$ } from './ui.js';
import { CATS, artRow, openSources } from './news.js';
import { LEAGUES, openTeamPicker } from './sports.js';
import { geocode, openLive, openResearch } from './extras.js';
import { openAssistant, openAiSettings } from './assistant.js';

export const TOPIC_PRESETS = [
  { name: 'Bundesregierung', keywords: ['Bundesregierung', 'Kanzler', 'Bundestag', 'Koalition'], category: 'politik', icon: '🏛️', color: '#7c5cff' },
  { name: 'Bundesliga', keywords: ['Bundesliga', 'FC Bayern', 'BVB', 'Borussia'], category: 'sport', icon: '⚽', color: '#22c55e' },
  { name: 'Wirtschaft & Konjunktur', keywords: ['Konjunktur', 'Inflation', 'EZB', 'Arbeitsmarkt'], category: 'wirtschaft', icon: '💼', color: '#f59e0b' },
  { name: 'Börse & DAX', keywords: ['DAX', 'Börse', 'Aktie', 'Aktien'], category: 'boerse', icon: '📈', color: '#10b981' },
  { name: 'Künstliche Intelligenz', keywords: ['KI', 'Künstliche Intelligenz', 'OpenAI', 'Anthropic', 'ChatGPT'], category: 'tech', icon: '🤖', color: '#06b6d4' },
  { name: 'USA', keywords: ['USA', 'Trump', 'Washington', 'Weißes Haus'], category: 'welt', icon: '🇺🇸', color: '#3b82f6' },
  { name: 'Ukraine & Russland', keywords: ['Ukraine', 'Russland', 'Selenskyj', 'Putin', 'Kiew'], category: 'welt', icon: '🌍', color: '#eab308' },
  { name: 'Nahost', keywords: ['Israel', 'Gaza', 'Iran', 'Nahost', 'Libanon'], category: 'welt', icon: '🕊️', color: '#64748b' },
  { name: 'Klima & Energie', keywords: ['Klima', 'Energie', 'Strompreis', 'Erneuerbare', 'Wärmepumpe'], category: 'wissen', icon: '🌱', color: '#16a34a' },
  { name: 'Formel 1', keywords: ['Formel 1', 'Verstappen', 'Grand Prix', 'F1'], category: 'sport', icon: '🏎️', color: '#ef4444' },
  { name: 'Gesundheit', keywords: ['Gesundheit', 'Krankenkasse', 'Medizin', 'Pflege'], category: 'wissen', icon: '🩺', color: '#ec4899' },
  { name: 'Auto & Mobilität', keywords: ['Autoindustrie', 'E-Auto', 'Volkswagen', 'Tesla', 'Deutsche Bahn'], category: 'wirtschaft', icon: '🚗', color: '#8b5cf6' },
  { name: 'Krypto', keywords: ['Bitcoin', 'Krypto', 'Ethereum'], category: 'boerse', icon: '🪙', color: '#f97316' },
  { name: 'Raumfahrt', keywords: ['NASA', 'SpaceX', 'Raumfahrt', 'ESA', 'Mond'], category: 'wissen', icon: '🚀', color: '#0ea5e9' },
  { name: 'Europa & EU', keywords: ['EU', 'Europäische Union', 'Brüssel', 'von der Leyen', 'EU-Kommission'], category: 'politik', icon: '🇪🇺', color: '#2563eb' },
  { name: 'Tech & Gadgets', keywords: ['Apple', 'iPhone', 'Google', 'Samsung', 'Microsoft'], category: 'tech', icon: '📱', color: '#a855f7' },
];
const EMOJIS = ['⭐', '🏛️', '⚽', '💼', '📈', '🤖', '🌍', '🇩🇪', '🇪🇺', '🇺🇸', '🌱', '🩺', '🚗', '🪙', '🚀', '🎬', '🎵', '🏀', '🎾', '🏎️', '📱', '🔬', '⚖️', '🏠', '✈️', '🍽️', '📚', '🔥'];
const COLORS = ['#7c5cff', '#3b82f6', '#06b6d4', '#10b981', '#22c55e', '#eab308', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#64748b'];

function addTopicWidgetIfMissing() {
  if (!state.widgets.some(w => w.type === 'topics')) state.widgets.push({ type: 'topics', on: true });
}

// ---------- Themen-Editor ----------
export function openTopicEditor(topic, onDone) {
  const isNew = !topic;
  const t = topic ? { ...topic, keywords: [...topic.keywords] } : { id: uid(), name: '', keywords: [], category: 'top', icon: '⭐', color: COLORS[0], alert: false };
  openSheet({
    title: isNew ? 'Neues Thema' : 'Thema bearbeiten',
    onClose: onDone,
    render: (body, sh) => {
      body.innerHTML = `
        ${isNew ? `<div class="field"><span>Schnellauswahl</span><div class="chips" style="padding-top:0">${TOPIC_PRESETS.filter(p => !state.topics.some(x => x.name === p.name)).map((p, i) => `<button class="chip" data-preset="${i}">${p.icon} ${esc(p.name)}</button>`).join('')}</div></div>` : ''}
        <label class="field"><span>Name</span><input class="input" name="name" value="${esc(t.name)}" placeholder="z. B. Bundesregierung" maxlength="40"></label>
        <label class="field"><span>Stichwörter (mit Komma trennen)</span><textarea class="input" name="kw" rows="2" placeholder="z. B. Kanzler, Bundestag, Koalition">${esc(t.keywords.join(', '))}</textarea></label>
        <label class="field"><span>Bereich</span><select class="input" name="cat">${CATS.map(c => `<option value="${c.id}" ${c.id === t.category ? 'selected' : ''}>${c.icon} ${esc(c.label)}</option>`).join('')}</select></label>
        <div class="field"><span>Symbol</span><div class="emoji-pick">${EMOJIS.map(e => `<button type="button" class="${e === t.icon ? 'on' : ''}" data-emoji="${e}">${e}</button>`).join('')}</div></div>
        <div class="field"><span>Farbe</span><div class="color-pick">${COLORS.map(c => `<button type="button" class="${c === t.color ? 'on' : ''}" data-color="${c}" style="background:${c}" aria-label="Farbe ${c}"></button>`).join('')}</div></div>
        <div class="card" style="margin:6px 0 18px"><div class="set-row"><div class="tx"><b>🚨 Eilmeldungen & Neues vorne anzeigen</b><span>Brandneue Artikel zu diesem Thema erscheinen oben auf dem Dashboard.</span></div>
          <label class="switch"><input type="checkbox" name="alert" ${t.alert ? 'checked' : ''}><i></i></label></div></div>
        <button class="btn primary block" data-save>${isNew ? 'Thema anlegen' : 'Speichern'}</button>
        ${!isNew ? `<button class="btn block danger" data-del style="margin-top:10px">${icon('trash', 'sm')} Thema löschen</button>` : ''}`;
      const f = n => body.querySelector(`[name="${n}"]`);
      body.addEventListener('click', e => {
        const p = e.target.closest('[data-preset]');
        if (p) {
          const pr = TOPIC_PRESETS.filter(x => !state.topics.some(y => y.name === x.name))[+p.dataset.preset];
          f('name').value = pr.name; f('kw').value = pr.keywords.join(', '); f('cat').value = pr.category;
          t.icon = pr.icon; t.color = pr.color;
          $$('[data-emoji]', body).forEach(b => b.classList.toggle('on', b.dataset.emoji === t.icon));
          $$('[data-color]', body).forEach(b => b.classList.toggle('on', b.dataset.color === t.color));
          return;
        }
        const em = e.target.closest('[data-emoji]');
        if (em) { t.icon = em.dataset.emoji; $$('[data-emoji]', body).forEach(b => b.classList.toggle('on', b === em)); return; }
        const co = e.target.closest('[data-color]');
        if (co) { t.color = co.dataset.color; $$('[data-color]', body).forEach(b => b.classList.toggle('on', b === co)); return; }
        if (e.target.closest('[data-save]')) {
          t.name = f('name').value.trim();
          t.keywords = f('kw').value.split(',').map(s => s.trim()).filter(Boolean);
          if (!t.name) { toast('Bitte einen Namen eingeben'); return; }
          if (!t.keywords.length) t.keywords = [t.name];
          t.category = f('cat').value;
          t.alert = f('alert').checked;
          if (isNew) state.topics.push(t);
          else state.topics = state.topics.map(x => x.id === t.id ? t : x);
          addTopicWidgetIfMissing();
          save(); toast(isNew ? 'Thema angelegt' : 'Gespeichert'); sh.close();
        }
        if (e.target.closest('[data-del]')) {
          if (!confirm(`„${t.name}“ wirklich löschen?`)) return;
          state.topics = state.topics.filter(x => x.id !== t.id);
          save(); toast('Thema gelöscht'); sh.close();
        }
      });
    },
  });
}

// ---------- Dashboard-Editor ----------
export async function openDashboardEditor(onDone) {
  const { WIDGETS } = await import('./dashboard.js');
  openSheet({
    title: 'Dashboard anpassen',
    onClose: onDone,
    render: body => {
      const paint = () => {
        body.innerHTML = `
          <p class="muted" style="margin-top:0">Schalte Bereiche ein oder aus und ändere die Reihenfolge.</p>
          <div class="card">${state.widgets.map((w, i) => `<div class="edit-row">
            <span style="font-size:20px">${WIDGETS[w.type]?.icon || ''}</span><span class="nm">${esc(WIDGETS[w.type]?.label || w.type)}</span>
            <button class="icon-btn" data-mv="${i}|-1" ${i === 0 ? 'disabled style="opacity:.3"' : ''} aria-label="Nach oben">${icon('up', 'sm')}</button>
            <button class="icon-btn" data-mv="${i}|1" ${i === state.widgets.length - 1 ? 'disabled style="opacity:.3"' : ''} aria-label="Nach unten">${icon('down', 'sm')}</button>
            <label class="switch"><input type="checkbox" data-tg="${i}" ${w.on ? 'checked' : ''}><i></i></label></div>`).join('')}</div>
          <div class="section-title"><h2>Meine Themen</h2><button class="link-btn" data-new>${icon('plus', 'sm')} Neu</button></div>
          <div class="card">${state.topics.length ? state.topics.map((t, i) => `<div class="edit-row">
            <span style="font-size:20px">${esc(t.icon)}</span><span class="nm">${esc(t.name)}${t.alert ? ' 🚨' : ''}<br><small class="muted" style="font-weight:500">${esc(t.keywords.join(', '))}</small></span>
            <button class="icon-btn" data-tmv="${i}|-1" ${i === 0 ? 'disabled style="opacity:.3"' : ''} aria-label="Nach oben">${icon('up', 'sm')}</button>
            <button class="icon-btn" data-tmv="${i}|1" ${i === state.topics.length - 1 ? 'disabled style="opacity:.3"' : ''} aria-label="Nach unten">${icon('down', 'sm')}</button>
            <button class="icon-btn" data-ted="${t.id}" aria-label="Bearbeiten">${icon('edit', 'sm')}</button></div>`).join('') : empty('Noch keine Themen.', '⭐')}</div>
          <div class="card" style="margin-top:14px"><div class="set-row"><div class="tx"><b>Alle Eilmeldungen zeigen</b><span>Aus: nur Eilmeldungen, die zu deinen Themen mit 🚨 passen.</span></div>
            <label class="switch"><input type="checkbox" data-allb ${state.settings.allBreaking ? 'checked' : ''}><i></i></label></div></div>`;
      };
      paint();
      body.addEventListener('change', e => {
        if (e.target.dataset.tg != null) { state.widgets[+e.target.dataset.tg].on = e.target.checked; save(); }
        if (e.target.hasAttribute('data-allb')) { state.settings.allBreaking = e.target.checked; save(); }
      });
      body.addEventListener('click', e => {
        const mv = e.target.closest('[data-mv]'), tmv = e.target.closest('[data-tmv]');
        const move = (arr, spec) => { const [i, d] = spec.split('|').map(Number); const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; save(); paint(); };
        if (mv) move(state.widgets, mv.dataset.mv);
        if (tmv) move(state.topics, tmv.dataset.tmv);
        const ted = e.target.closest('[data-ted]');
        if (ted) openTopicEditor(state.topics.find(t => t.id === ted.dataset.ted), paint);
        if (e.target.closest('[data-new]')) openTopicEditor(null, paint);
      });
    },
  });
}

// ---------- Ort-Auswahl ----------
function cityPicker(container, onPick) {
  container.innerHTML = `<div class="search">${icon('search')}<input type="search" placeholder="Stadt suchen …" value="${esc(state.profile.city)}"></div><div class="card hidden" data-cities style="margin-top:8px"></div>`;
  const input = container.querySelector('input'), list = container.querySelector('[data-cities]');
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 2) { list.classList.add('hidden'); return; }
      try {
        const res = await geocode(q);
        list.classList.toggle('hidden', !res.length);
        list.innerHTML = res.map((r, i) => `<div class="set-row" data-city="${i}" style="cursor:pointer"><div class="tx"><b>${esc(r.name)}</b><span>${esc(r.region)}</span></div></div>`).join('');
        list.onclick = e => {
          const c = e.target.closest('[data-city]');
          if (!c) return;
          const r = res[+c.dataset.city];
          input.value = r.name; list.classList.add('hidden');
          onPick(r);
        };
      } catch { /* offline */ }
    }, 350);
  });
}

// ---------- Profil ----------
export function openProfile(onDone) {
  openSheet({
    title: 'Profil',
    onClose: onDone,
    render: body => {
      const p = state.profile;
      body.innerHTML = `
        <div style="text-align:center;margin:6px 0 20px"><div class="avatar" style="width:80px;height:80px;font-size:28px;margin:0 auto">${esc(initials(p.name))}</div></div>
        <label class="field"><span>Name</span><input class="input" name="name" value="${esc(p.name)}" placeholder="Dein Name" autocomplete="name"></label>
        <div class="field"><span>Wohnort (für Wetter & lokale Infos)</span><div data-city></div></div>
        <label class="field"><span>Geburtstag</span><input class="input" type="date" name="birthday" value="${esc(p.birthday)}"></label>
        <div class="field"><span>Lieblingsverein</span><button class="btn block" data-pick-team type="button" style="justify-content:flex-start">⚽ <span data-team-name>${esc(p.team || 'Verein wählen')}</span></button></div>
        <label class="field"><span>Über mich / Interessen</span><textarea class="input" name="about" rows="3" placeholder="z. B. Beruf, Hobbys – hilft dir, passende Themen anzulegen">${esc(p.about)}</textarea></label>
        <button class="btn primary block" data-save>Speichern</button>
        <p class="disclaimer" style="text-align:center">🔒 Deine Daten bleiben ausschließlich auf diesem Gerät gespeichert.</p>`;
      let city = null;
      cityPicker(body.querySelector('[data-city]'), r => { city = r; });
      body.querySelector('[data-pick-team]').onclick = () => openTeamPicker(() => { body.querySelector('[data-team-name]').textContent = state.profile.team || 'Verein wählen'; });
      body.querySelector('[data-save]').onclick = () => {
        const f = n => body.querySelector(`[name="${n}"]`).value.trim();
        Object.assign(p, { name: f('name'), birthday: f('birthday'), about: f('about') });
        if (city) Object.assign(p, { city: city.name, lat: city.lat, lon: city.lon });
        toast('Profil gespeichert');
        save();
        history.back();
      };
    },
  });
}

// ---------- Einstellungen ----------
export function openSettings(onDone) {
  openSheet({
    title: 'Einstellungen',
    onClose: onDone,
    render: body => {
      const s = state.settings;
      body.innerHTML = `
        <div class="card">
          <div class="set-row"><div class="tx"><b>Erscheinungsbild</b></div>
            <div class="seg" style="width:220px" data-theme>${[['auto', 'Auto'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([v, l]) => `<button class="${s.theme === v ? 'active' : ''}" data-v="${v}">${l}</button>`).join('')}</div></div>
          <div class="set-row"><div class="tx"><b>Automatisch aktualisieren</b><span>Dashboard & News</span></div>
            <select class="input" style="width:130px" data-refresh>${[2, 5, 10, 15, 30].map(m => `<option value="${m}" ${s.refresh === m ? 'selected' : ''}>alle ${m} Min.</option>`).join('')}</select></div>
          <div class="set-row"><div class="tx"><b>Benachrichtigungen</b><span>Eilmeldungen, solange newszentrale geöffnet ist</span></div>
            <label class="switch"><input type="checkbox" data-notify ${s.notify ? 'checked' : ''}><i></i></label></div>
          <div class="set-row" style="cursor:pointer" data-sources><div class="tx"><b>Nachrichtenquellen</b><span>Redaktionen & Agenturen auswählen</span></div>${icon('right')}</div>
          <div class="set-row" style="cursor:pointer" data-ai><div class="tx"><b>KI-Assistent</b><span>Kostenlos über Claude oder mit eigenem API-Schlüssel</span></div>${icon('right')}</div>
          <div class="set-row" style="cursor:pointer" data-myteam><div class="tx"><b>Lieblingsverein</b><span>${esc(state.profile.team || 'Noch nicht gewählt')}</span></div>${icon('right')}</div>
        </div>
        <div class="section-title"><h2>Verbindung</h2></div>
        <div class="card card-pad">
          <label class="field" style="margin:0"><span>Eigener CORS-Proxy (optional)</span>
          <input class="input" data-proxy value="${esc(s.proxy)}" placeholder="https://mein-proxy.workers.dev/?url=" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
          <p class="disclaimer">Nicht nötig: News, Volltexte und Kurse sammelt newszentrale automatisch alle 10 Minuten ein. Mit einem eigenen, kostenlosen Proxy (Cloudflare Worker, siehe README) werden zusätzlich RSS-Feeds sekundengenau live geladen, beliebige Wertpapiere durchsuchbar und Google-News-Suche aktiv.</p>
        </div>
        <div class="section-title"><h2>Daten</h2></div>
        <div class="card">
          <div class="set-row" style="cursor:pointer" data-export><div class="tx"><b>Einstellungen exportieren</b><span>Als Datei sichern – z. B. für ein neues Gerät</span></div>${icon('share')}</div>
          <div class="set-row" style="cursor:pointer" data-import><div class="tx"><b>Einstellungen importieren</b><span>Gesicherte Datei laden</span></div>${icon('down')}</div>
          <div class="set-row" style="cursor:pointer" data-reset><div class="tx"><b style="color:var(--down)">Alles zurücksetzen</b><span>Profil, Themen, Watchlist & Cache löschen</span></div>${icon('trash')}</div>
        </div>
        <input type="file" accept="application/json" class="hidden" data-file>
        <p class="disclaimer" style="text-align:center;margin-top:20px">newszentrale · kostenlos & werbefrei · Daten nur lokal gespeichert</p>`;
      body.querySelector('[data-theme]').addEventListener('click', e => {
        const b = e.target.closest('[data-v]'); if (!b) return;
        s.theme = b.dataset.v; save(); applyTheme();
        $$('[data-v]', body).forEach(x => x.classList.toggle('active', x === b));
      });
      body.querySelector('[data-refresh]').onchange = e => { s.refresh = +e.target.value; save(); };
      body.querySelector('[data-proxy]').onchange = e => { s.proxy = e.target.value.trim(); save(); toast('Proxy gespeichert'); };
      body.querySelector('[data-notify]').onchange = async e => {
        if (e.target.checked && 'Notification' in window) {
          const perm = await Notification.requestPermission();
          if (perm !== 'granted') { e.target.checked = false; toast('Benachrichtigungen wurden nicht erlaubt'); return; }
        } else if (e.target.checked) { e.target.checked = false; toast('Dein Browser unterstützt keine Benachrichtigungen'); return; }
        s.notify = e.target.checked; save();
      };
      body.querySelector('[data-sources]').onclick = () => openSources();
      body.querySelector('[data-ai]').onclick = () => openAiSettings();
      body.querySelector('[data-myteam]').onclick = () => openTeamPicker(() => { body.querySelector('[data-myteam] .tx span').textContent = state.profile.team || 'Noch nicht gewählt'; });
      body.querySelector('[data-export]').onclick = () => {
        const blob = new Blob([exportState()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'newszentrale-einstellungen.json'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      };
      const file = body.querySelector('[data-file]');
      body.querySelector('[data-import]').onclick = () => file.click();
      file.onchange = async () => {
        try { importState(await file.files[0].text()); toast('Importiert'); setTimeout(() => location.reload(), 600); }
        catch { toast('Datei konnte nicht gelesen werden'); }
      };
      body.querySelector('[data-reset]').onclick = () => { if (confirm('Wirklich alle Daten löschen?')) resetAll(); };
    },
  });
}
export function applyTheme() {
  const t = state.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

// ---------- Gespeichert ----------
export function openSaved() {
  openSheet({
    title: 'Gespeichert',
    render: body => {
      body.innerHTML = state.saved.length
        ? `<div class="card list-card">${state.saved.map(i => artRow(i)).join('')}</div>`
        : empty('Tippe im Artikel auf das Lesezeichen, um ihn hier zu speichern.', '🔖');
    },
  });
}

// ---------- Mehr-Tab ----------
export function renderMore(root, app) {
  const paint = () => {
    const p = state.profile;
    const tiles = [
      ['ai', 'KI-Assistent', 'Frag mich alles', 'zap', 'linear-gradient(135deg,#7c5cff,#00c2ff)'],
      ['live', 'Live-TV', 'Nachrichtensender', 'tv', 'linear-gradient(135deg,#ff2d55,#ff6a3d)'],
      ['research', 'Recherche', 'Wikipedia + News', 'book', 'linear-gradient(135deg,#7c5cff,#4f7bff)'],
      ['saved', 'Gespeichert', `${state.saved.length} Artikel`, 'bookmark', 'linear-gradient(135deg,#f59e0b,#f97316)'],
      ['topics', 'Meine Themen', `${state.topics.length} Themen`, 'star', 'linear-gradient(135deg,#10b981,#06b6d4)'],
      ['sources', 'Quellen', 'Redaktionen wählen', 'layers', 'linear-gradient(135deg,#0ea5e9,#2563eb)'],
      ['settings', 'Einstellungen', 'Design, Updates, Daten', 'settings', 'linear-gradient(135deg,#64748b,#334155)'],
      ['install', 'Zum Home-Bildschirm', 'Als App installieren', 'plus', 'linear-gradient(135deg,#a855f7,#ec4899)'],
      ['about', 'Über newszentrale', 'Datenquellen & Datenschutz', 'shield', 'linear-gradient(135deg,#22c55e,#16a34a)'],
    ];
    root.innerHTML = `
      <header class="vhead"><div class="wrap"><div class="vhead-row"><h1>Mehr</h1></div></div></header>
      <div class="wrap">
        <div class="card profile-card" data-m="profile"><div class="avatar">${esc(initials(p.name))}</div>
          <div style="flex:1;min-width:0"><b style="font-size:18px">${esc(p.name || 'Profil anlegen')}</b><div class="muted" style="font-size:13px">📍 ${esc(p.city || '–')}${p.team ? ' · ⚽ ' + esc(p.team) : ''}</div></div>${icon('right')}</div>
        <div class="section-title"><h2>Entdecken</h2></div>
        <div class="menu-grid">${tiles.map(([id, t, s, ic, bg]) => `<button class="menu-tile" data-m="${id}"><div class="ic" style="background:${bg}">${icon(ic)}</div><b>${esc(t)}</b><span>${esc(s)}</span></button>`).join('')}</div>
      </div>`;
  };
  paint();
  root.addEventListener('click', e => {
    const m = e.target.closest('[data-m]')?.dataset.m;
    if (!m) return;
    ({
      profile: () => openProfile(() => { paint(); app.dashboard()?.rebuild(); }),
      ai: () => openAssistant(),
      live: openLive,
      research: () => openResearch(),
      saved: openSaved,
      topics: () => openDashboardEditor(() => { paint(); app.dashboard()?.rebuild(); }),
      sources: () => openSources(),
      settings: () => openSettings(paint),
      install: openInstallHelp,
      about: openAbout,
    })[m]?.();
  });
  return { refresh: paint };
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; });
function openInstallHelp() {
  if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; return; }
  openSheet({
    title: 'App installieren',
    render: body => {
      body.innerHTML = `
        <div class="card card-pad"><h3 style="margin-top:0"> iPhone & iPad (Safari)</h3>
          <ol style="padding-left:20px;line-height:1.8"><li>Unten auf <b>Teilen</b> ${icon('share', 'sm')} tippen</li><li><b>„Zum Home-Bildschirm“</b> wählen</li><li><b>Hinzufügen</b> – fertig! newszentrale startet wie eine echte App im Vollbild.</li></ol></div>
        <div class="card card-pad" style="margin-top:14px"><h3 style="margin-top:0">🤖 Android (Chrome)</h3>
          <ol style="padding-left:20px;line-height:1.8"><li>Menü <b>⋮</b> oben rechts öffnen</li><li><b>„App installieren“</b> bzw. „Zum Startbildschirm hinzufügen“</li></ol></div>
        <div class="card card-pad" style="margin-top:14px"><h3 style="margin-top:0">💻 Desktop (Chrome / Edge)</h3>
          <p style="margin:0">In der Adressleiste auf das Installations-Symbol klicken.</p></div>`;
    },
  });
}
function openAbout() {
  openSheet({
    title: 'Über newszentrale',
    render: body => {
      body.innerHTML = `<div class="reader"><div class="content">
        <h2>Deine All-in-One-News-App</h2>
        <p>newszentrale bündelt Nachrichten, Börse, Sport, Live-TV und Wissen an einem Ort – kostenlos, ohne Konto und ohne Werbung.</p>
        <h3>Datenquellen</h3>
        <ul><li><b>Nachrichten:</b> tagesschau (API), SPIEGEL, ZEIT, F.A.Z., SZ, n-tv, WELT, Handelsblatt, Deutschlandfunk, DW, heise, t3n, kicker, BBC, NYT, Al Jazeera sowie Google News (Meldungen hunderter Verlage und Agenturen) – über öffentliche RSS-Feeds.</li>
        <li><b>Börse:</b> Yahoo Finance (Kurse, teils verzögert), CoinGecko (Krypto).</li>
        <li><b>Sport:</b> ESPN (Ergebnisse, Tabellen, Kader, Spielerdaten), OpenLigaDB (Torjäger).</li>
        <li><b>Wetter:</b> Open-Meteo · <b>Wissen:</b> Wikipedia (CC BY-SA).</li></ul>
        <h3>Datenschutz</h3>
        <p>Profil, Themen, Watchlist und Einstellungen werden nur lokal in deinem Browser gespeichert. Es gibt keinen eigenen Server und kein Tracking. Beim Laden von Inhalten werden die jeweiligen Anbieter bzw. CORS-Proxys kontaktiert.</p>
        <h3>Hinweis</h3>
        <p>Die Rechte an Artikeln liegen bei den jeweiligen Verlagen. Kurs-Analysen sind automatisch berechnete technische Indikatoren und keine Anlageberatung.</p>
      </div></div>`;
    },
  });
}

// ---------- Onboarding ----------
export function runOnboarding(done) {
  const el = document.createElement('div');
  el.className = 'onb';
  document.body.appendChild(el);
  let step = 0;
  const picked = new Set(state.topics.map(t => t.name));
  const leagues = new Set(state.favLeagues);
  let city = null;
  const steps = [
    () => `
      <div class="logo-big"><svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l3-8 4 16 3-8h6"/></svg></div>
      <h1>Willkommen bei <span style="background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent">newszentrale</span></h1>
      <p class="lead">Alle Nachrichten, Börsenkurse, Live-Sport und Wissen – in einer App, kostenlos.</p>
      <div class="feature-list">
        <div><span class="fi">📰</span>Über 16 Redaktionen & hunderte Verlage</div>
        <div><span class="fi">⭐</span>Dein Dashboard mit eigenen Themen</div>
        <div><span class="fi">🚨</span>Eilmeldungen immer ganz vorne</div>
        <div><span class="fi">📈</span>Watchlist, Charts & Kursanalysen</div>
        <div><span class="fi">⚽</span>Live-Ergebnisse, Tabellen & Spielerdaten</div>
        <div><span class="fi">📺</span>Live-TV & Recherche mit Wikipedia</div>
      </div>`,
    () => `
      <h1>Wer bist du?</h1><p class="lead">Nur für deine persönliche Begrüßung und das Wetter. Alles bleibt auf deinem Gerät.</p>
      <label class="field"><span>Vorname</span><input class="input" data-name value="${esc(state.profile.name)}" placeholder="Dein Name" autocomplete="given-name"></label>
      <div class="field"><span>Wohnort</span><div data-city></div></div>`,
    () => `
      <h1>Deine Themen</h1><p class="lead">Wähle, was dich interessiert. Jedes Thema wird ein eigenes Widget auf deinem Dashboard.</p>
      <div class="pick-grid">${TOPIC_PRESETS.map((p, i) => `<button class="pick ${picked.has(p.name) ? 'on' : ''}" data-pick="${i}"><span class="em">${p.icon}</span>${esc(p.name)}</button>`).join('')}</div>`,
    () => `
      <h1>Dein Sport</h1><p class="lead">Welche Ligen sollen live auf deinem Dashboard erscheinen?</p>
      <div class="pick-grid">${LEAGUES.map(l => `<button class="pick ${leagues.has(l.key) ? 'on' : ''}" data-league="${l.key}"><span class="em">${l.flag}</span>${esc(l.name)}</button>`).join('')}</div>`,
  ];
  const paint = () => {
    el.innerHTML = `<div class="onb-inner">
      <div class="steps">${steps.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
      ${steps[step]()}
      <div class="foot">${step ? '<button class="btn" data-back>Zurück</button>' : ''}<button class="btn primary" style="flex:1" data-next>${step === steps.length - 1 ? 'Los geht’s 🚀' : 'Weiter'}</button></div></div>`;
    const c = el.querySelector('[data-city]');
    if (c) cityPicker(c, r => { city = r; });
    el.scrollTop = 0;
  };
  const collect = () => {
    const n = el.querySelector('[data-name]');
    if (n) state.profile.name = n.value.trim();
    if (city) Object.assign(state.profile, { city: city.name, lat: city.lat, lon: city.lon });
  };
  el.addEventListener('click', e => {
    const p = e.target.closest('[data-pick]');
    if (p) { const name = TOPIC_PRESETS[+p.dataset.pick].name; picked.has(name) ? picked.delete(name) : picked.add(name); p.classList.toggle('on'); return; }
    const l = e.target.closest('[data-league]');
    if (l) { const k = l.dataset.league; leagues.has(k) ? leagues.delete(k) : leagues.add(k); l.classList.toggle('on'); return; }
    if (e.target.closest('[data-back]')) { collect(); step--; paint(); return; }
    if (e.target.closest('[data-next]')) {
      collect();
      if (step < steps.length - 1) { step++; paint(); return; }
      const existing = state.topics.filter(t => picked.has(t.name));
      const added = TOPIC_PRESETS.filter(p => picked.has(p.name) && !existing.some(t => t.name === p.name))
        .map(p => ({ ...p, id: uid(), alert: ['politik', 'welt'].includes(p.category) || p.name === 'Bundesliga' }));
      state.topics = [...existing, ...added];
      state.favLeagues = [...leagues];
      state.onboarded = true;
      save();
      el.style.transition = 'opacity .35s'; el.style.opacity = '0';
      setTimeout(() => { el.remove(); done(); }, 350);
    }
  });
  paint();
}
