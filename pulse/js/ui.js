// UI-Hilfsfunktionen: Escaping, Formatierung, Icons, Sheets, Toast, Charts
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function safeUrl(u) {
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; }
}
export function stripHtml(html) {
  if (!html) return '';
  const d = new DOMParser().parseFromString(String(html), 'text/html');
  return (d.body.textContent || '').replace(/\s+/g, ' ').trim();
}

const nf = {};
export function num(n, d = 2) {
  if (n == null || isNaN(n)) return '–';
  const k = d;
  nf[k] ||= new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  return nf[k].format(n);
}
export function compact(n) {
  if (n == null || isNaN(n)) return '–';
  return new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
export function pct(n) {
  if (n == null || isNaN(n)) return '–';
  return (n > 0 ? '+' : '') + num(n, 2) + ' %';
}
export function priceFmt(n) {
  if (n == null || isNaN(n)) return '–';
  const a = Math.abs(n);
  return num(n, a >= 1000 ? 2 : a >= 1 ? 2 : 4);
}
export function timeAgo(ms) {
  if (!ms) return '';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
  if (s < 86400 * 7) return `vor ${Math.floor(s / 86400)} Tg.`;
  return new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
export function clock(ms) { return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }
export function dayLabel(d) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const diff = Math.round((x - t) / 86400000);
  if (diff === 0) return 'Heute';
  if (diff === -1) return 'Gestern';
  if (diff === 1) return 'Morgen';
  return new Date(d).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}
export function initials(name) {
  return (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '👋';
}

// ---------- Icons (Lucide-Stil) ----------
const P = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>',
  trend: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="14" rx="1.5"/><rect width="7" height="7" x="3" y="14" rx="1.5"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>',
  ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  up: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  tv: '<rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  text: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7l10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  radio: '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
};
export function icon(name, cls = '') {
  return `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;
}

// ---------- Toast ----------
let toastT;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 2400);
}

// ---------- Sheets (Vollbild-Overlays mit Zurück-Navigation) ----------
const stack = [];
export function openSheet({ title = '', actions = '', render, onClose }) {
  const el = document.createElement('div');
  el.className = 'sheet';
  el.innerHTML = `
    <div class="backdrop"></div>
    <div class="panel" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sh-head">
        <button class="icon-btn" data-close aria-label="Schließen">${icon(stack.length ? 'left' : 'x')}</button>
        <h2>${esc(title)}</h2>
        <div class="sh-actions">${actions}</div>
      </div>
      <div class="sh-body"></div>
    </div>`;
  document.getElementById('sheets').appendChild(el);
  const body = el.querySelector('.sh-body');
  const api = {
    el, body,
    setTitle: t => { el.querySelector('.sh-head h2').textContent = t; },
    setActions: html => { el.querySelector('.sh-actions').innerHTML = html; },
    close: () => closeSheet(),
    closed: false,
  };
  el.querySelector('[data-close]').onclick = () => closeSheet();
  el.querySelector('.backdrop').onclick = () => closeSheet();
  stack.push({ el, onClose, api });
  history.pushState({ sheet: stack.length }, '');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  document.body.style.overflow = 'hidden';
  try { render(body, api); } catch (e) { console.error(e); body.innerHTML = errorBox(e); }
  return api;
}
export function closeSheet() { if (stack.length) history.back(); }
export function closeAllSheets() { if (stack.length) history.go(-stack.length); }
function popSheet() {
  const s = stack.pop();
  if (!s) return;
  s.api.closed = true;
  s.el.classList.remove('open');
  setTimeout(() => s.el.remove(), 380);
  try { s.onClose?.(); } catch (e) { console.error(e); }
  if (!stack.length) document.body.style.overflow = '';
}
window.addEventListener('popstate', e => {
  const target = e.state?.sheet || 0;
  while (stack.length > target) popSheet();
});

// ---------- Platzhalter ----------
export function skeletonList(n = 4, img = true) {
  return Array.from({ length: n }, () => `
    <div class="sk-art"><div class="sk-t"><div class="sk sk-line" style="width:92%"></div><div class="sk sk-line" style="width:70%"></div><div class="sk sk-line" style="width:35%;height:10px"></div></div>${img ? '<div class="sk sk-i"></div>' : ''}</div>`).join('');
}
export function empty(text, emoji = '🗞️', btn = '') {
  return `<div class="empty"><div class="e">${emoji}</div>${esc(text)}${btn}</div>`;
}
export function errorBox(e, retry = '') {
  return `<div class="empty"><div class="e">📡</div>Inhalte konnten gerade nicht geladen werden.<br><small class="muted">${esc(e?.message || e || '')}</small>${retry}</div>`;
}

// ---------- Charts ----------
export function sparkSvg(values, up, cls = 'spark') {
  const v = (values || []).filter(x => x != null && !isNaN(x));
  if (v.length < 2) return `<svg class="${cls}" viewBox="0 0 100 30"></svg>`;
  const min = Math.min(...v), max = Math.max(...v), r = max - min || 1;
  const pts = v.map((y, i) => `${(i / (v.length - 1) * 100).toFixed(2)},${(28 - (y - min) / r * 26).toFixed(2)}`).join(' ');
  const col = up ? 'var(--up)' : 'var(--down)';
  return `<svg class="${cls}" viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

let chartSeq = 0;
export function lineChart(wrap, t, v, { ref = null, fmtX = x => new Date(x).toLocaleString('de-DE'), fmtY = priceFmt } = {}) {
  const pts = t.map((x, i) => [x, v[i]]).filter(p => p[1] != null && !isNaN(p[1]));
  if (pts.length < 2) { wrap.innerHTML = empty('Keine Kursdaten verfügbar', '📉'); return; }
  const W = Math.max(280, wrap.clientWidth || 600), H = wrap.clientHeight || 240, padT = 26, padB = 18;
  const ys = pts.map(p => p[1]).concat(ref != null ? [ref] : []);
  const min = Math.min(...ys), max = Math.max(...ys), r = max - min || 1;
  const X = i => i / (pts.length - 1) * W;
  const Y = y => padT + (1 - (y - min) / r) * (H - padT - padB);
  const up = pts[pts.length - 1][1] >= (ref ?? pts[0][1]);
  const col = up ? 'var(--up)' : 'var(--down)';
  const id = 'g' + (++chartSeq);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
  const area = `${line}L${W},${H}L0,${H}Z`;
  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
      ${ref != null ? `<line x1="0" x2="${W}" y1="${Y(ref)}" y2="${Y(ref)}" stroke="var(--text-3)" stroke-dasharray="3 4" stroke-width="1"/>` : ''}
      <path d="${area}" fill="url(#${id})"/>
      <path d="${line}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
      <line class="cx" x1="0" x2="0" y1="${padT - 6}" y2="${H}" stroke="var(--text-3)" stroke-width="1" opacity="0"/>
      <circle class="cd" r="5" fill="${col}" stroke="var(--surface)" stroke-width="2" opacity="0"/>
    </svg>
    <div class="chart-tip hidden"></div>`;
  const svg = wrap.querySelector('svg'), tip = wrap.querySelector('.chart-tip');
  const cx = svg.querySelector('.cx'), cd = svg.querySelector('.cd');
  const move = e => {
    const rect = svg.getBoundingClientRect();
    const px = ((e.touches ? e.touches[0].clientX : e.clientX) - rect.left) / rect.width;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round(px * (pts.length - 1))));
    const x = X(i), y = Y(pts[i][1]);
    cx.setAttribute('x1', x); cx.setAttribute('x2', x); cx.setAttribute('opacity', 1);
    cd.setAttribute('cx', x); cd.setAttribute('cy', y); cd.setAttribute('opacity', 1);
    tip.classList.remove('hidden');
    tip.style.left = Math.max(60, Math.min(rect.width - 60, (x / W) * rect.width)) + 'px';
    tip.textContent = `${fmtY(pts[i][1])} · ${fmtX(pts[i][0])}`;
  };
  const leave = () => { cx.setAttribute('opacity', 0); cd.setAttribute('opacity', 0); tip.classList.add('hidden'); };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('touchmove', move, { passive: true });
  svg.addEventListener('pointerleave', leave);
  svg.addEventListener('touchend', leave);
}

// Heuristische Textfarbe für Logos ohne Bild
export function hashColor(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 65% 50%)`;
}
