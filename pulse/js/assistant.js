// KI-Assistent: Claude direkt im Browser (eigener API-Schlüssel) oder kostenlos über claude.ai
import { state, save } from './store.js';
import { esc, icon, openSheet, toast, timeAgo, priceFmt, pct } from './ui.js';
import { loadCategory } from './news.js';
import { quotes } from './markets.js';
import { myTeam, schedule } from './sports.js';

const MODEL = 'claude-opus-5-5';
// Offizielles Anthropic-SDK als ES-Modul (erst beim ersten Gebrauch geladen)
const SDK_URLS = ['https://esm.sh/@anthropic-ai/sdk', 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk/+esm'];
let sdkPromise;
function loadSdk() {
  sdkPromise ||= (async () => {
    let err;
    for (const u of SDK_URLS) {
      try { const m = await import(u); return m.default || m.Anthropic; } catch (e) { err = e; }
    }
    sdkPromise = null;
    throw err;
  })();
  return sdkPromise;
}

const SUGGESTIONS = [
  'Was sind heute die wichtigsten Nachrichten?',
  'Fasse die Lage an der Börse kurz zusammen.',
  'Wie läuft es für meinen Verein?',
  'Erklär mir das wichtigste Thema des Tages einfach.',
];

// ---------- Kontext aus der App ----------
async function buildContext({ short = false } = {}) {
  const p = state.profile;
  const lines = [`Heute ist ${new Date().toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' })}.`];
  if (p.name || p.city) lines.push(`Nutzer: ${p.name || 'unbekannt'}${p.city ? `, wohnt in ${p.city}` : ''}.`);
  if (state.topics.length) lines.push(`Interessen (Themen im Dashboard): ${state.topics.map(t => t.name).join(', ')}.`);
  const [news, qs, games] = await Promise.all([
    loadCategory('top').catch(() => []),
    quotes(state.watchlist).catch(() => []),
    (async () => { const t = myTeam(); return t ? { t, list: await schedule(t.key, t.id).catch(() => []) } : null; })(),
  ]);
  if (news.length) {
    lines.push('', 'Aktuelle Schlagzeilen aus der App:');
    news.slice(0, short ? 10 : 25).forEach(n => lines.push(`- [${n.publisher}, ${timeAgo(n.date)}] ${n.title}${!short && n.teaser ? ' – ' + n.teaser.slice(0, 160) : ''}`));
  }
  if (qs.length) {
    lines.push('', 'Watchlist (Kurse, teils verzögert):');
    qs.forEach(q => lines.push(`- ${q.name} (${q.symbol}): ${priceFmt(q.price)} ${q.currency} (${pct(q.changePct)})`));
  }
  if (games?.list?.length) {
    const now = Date.now();
    const last = games.list.filter(m => m.state === 'post').pop();
    const next = games.list.find(m => m.state !== 'post' && m.date > now - 3 * 3600e3);
    lines.push('', `Lieblingsverein: ${games.t.full || games.t.name}`);
    if (last) lines.push(`- Letztes Spiel: ${last.home.full || last.home.name} ${last.home.score}:${last.away.score} ${last.away.full || last.away.name} (${new Date(last.date).toLocaleDateString('de-DE')})`);
    if (next) lines.push(`- Nächstes Spiel: ${next.home.full || next.home.name} – ${next.away.full || next.away.name} am ${new Date(next.date).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}`);
  }
  return lines.join('\n');
}

function systemPrompt(context) {
  return `Du bist der KI-Assistent der News-App „newszentrale“. Du hilfst bei Fragen zu Nachrichten, Politik, Wirtschaft, Börse, Sport und Allgemeinwissen.

Antworte auf Deutsch, klar und gut lesbar fürs Handy: kurze Absätze, bei Bedarf Aufzählungen mit „- “ und **fett** für das Wichtigste. Nutze zuerst die aktuellen Daten aus der App unten. Wenn die Frage aktuellere oder weitergehende Informationen braucht, nutze die Websuche und nenne die Quellen. Sag offen, wenn du etwas nicht sicher weißt. Zu Aktien gibst du Einordnungen, aber keine Kauf- oder Verkaufsempfehlungen.

Aktuelle Daten aus der App (Stand jetzt):
${context}`;
}

// ---------- Darstellung ----------
function md(text) {
  const lines = esc(text).split('\n');
  let html = '', list = false;
  for (const raw of lines) {
    const l = raw.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const m = /^\s*(?:[-•*]|\d+\.)\s+(.*)$/.exec(l);
    if (m) { if (!list) { html += '<ul>'; list = true; } html += `<li>${m[1]}</li>`; continue; }
    if (list) { html += '</ul>'; list = false; }
    if (/^#{1,4}\s/.test(l)) html += `<p><strong>${l.replace(/^#+\s/, '')}</strong></p>`;
    else if (l.trim()) html += `<p>${l}</p>`;
  }
  if (list) html += '</ul>';
  return html;
}

// ---------- Ohne Schlüssel: kostenlos über claude.ai ----------
async function openInClaude(question) {
  const ctx = await buildContext({ short: true }).catch(() => '');
  const prompt = `${question}\n\n(Kontext aus meiner News-App newszentrale:\n${ctx})`.slice(0, 6000);
  window.open(`https://claude.ai/new?q=${encodeURIComponent(prompt)}`, '_blank', 'noopener');
}

// ---------- Mit Schlüssel: Chat in der App ----------
export function openAssistant(initial = '') {
  const history = [];
  openSheet({
    title: 'KI-Assistent',
    actions: `<button class="icon-btn" data-ai-settings aria-label="KI-Einstellungen">${icon('settings')}</button>`,
    render: (body, sh) => {
      const panel = sh.el.querySelector('.panel');
      body.innerHTML = `<div class="chat" data-chat></div>`;
      const bar = document.createElement('form');
      bar.className = 'chat-bar';
      bar.innerHTML = `<textarea class="input" rows="1" placeholder="Frag mich etwas …" aria-label="Frage an den KI-Assistenten"></textarea>
        <button class="icon-btn on" type="submit" aria-label="Senden">${icon('up')}</button>`;
      panel.appendChild(bar);
      const chat = body.querySelector('[data-chat]');
      const input = bar.querySelector('textarea');
      input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(140, input.scrollHeight) + 'px'; });
      input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); bar.requestSubmit(); } });

      const hasKey = () => !!(state.settings.aiKey || '').trim();
      const intro = () => {
        chat.innerHTML = `<div class="ai-intro">
          <div class="ai-logo">✨</div>
          <h3>Was möchtest du wissen?</h3>
          <p class="muted">Ich kenne die aktuellen Schlagzeilen, deine Watchlist und deinen Verein – und kann im Web nachschlagen.</p>
          <div class="ai-sugg">${SUGGESTIONS.map(q => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
          ${hasKey() ? '' : `<div class="note" style="text-align:left">Ohne API-Schlüssel öffnet sich deine Frage <b>kostenlos in Claude</b> (claude.ai, mit deinem Account) – inklusive der aktuellen Schlagzeilen. Für Antworten direkt hier in der App kannst du unter ⚙️ einen eigenen Anthropic-API-Schlüssel hinterlegen.</div>`}
        </div>`;
      };
      intro();

      const addMsg = (role, html) => {
        chat.querySelector('.ai-intro')?.remove();
        const d = document.createElement('div');
        d.className = `msg ${role}`;
        d.innerHTML = html;
        chat.appendChild(d);
        body.scrollTop = body.scrollHeight;
        return d;
      };

      let busy = false;
      async function ask(q) {
        q = q.trim();
        if (!q || busy) return;
        if (!hasKey()) { addMsg('user', esc(q)); addMsg('bot', '<p>Ich öffne deine Frage in Claude … ✨</p>'); openInClaude(q); return; }
        busy = true;
        addMsg('user', esc(q));
        const out = addMsg('bot', '<p class="muted typing">Denke nach …</p>');
        try {
          const Anthropic = await loadSdk();
          const client = new Anthropic({ apiKey: state.settings.aiKey.trim(), dangerouslyAllowBrowser: true });
          if (!history.length) history.system = systemPrompt(await buildContext());
          history.push({ role: 'user', content: q });
          let text = '', sources = new Map(), final;
          for (let round = 0; round < 4; round++) {
            const stream = client.beta.messages.stream({
              model: MODEL,
              max_tokens: 16000,
              thinking: { type: 'adaptive' },
              output_config: { effort: 'low' },
              system: history.system,
              messages: history.slice(),
              tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
              betas: ['server-side-fallback-2026-07-01'],
              fallbacks: 'default',
            });
            for await (const ev of stream) {
              if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
                text += ev.delta.text;
                out.innerHTML = md(text);
                body.scrollTop = body.scrollHeight;
              }
              if (ev.type === 'content_block_start' && ev.content_block.type === 'server_tool_use' && !text) out.innerHTML = '<p class="muted typing">Suche im Web …</p>';
            }
            final = await stream.finalMessage();
            history.push({ role: 'assistant', content: final.content });
            for (const b of final.content) for (const c of b.citations || []) if (c.url) sources.set(c.url, c.title || c.url);
            if (final.stop_reason !== 'pause_turn') break;
          }
          if (final?.stop_reason === 'refusal') text += '\n\nDazu kann ich leider keine Antwort geben.';
          if (!text.trim()) text = 'Ich habe dazu gerade keine Antwort gefunden.';
          out.innerHTML = md(text) + (sources.size ? `<div class="ai-src"><b>Quellen</b>${[...sources].slice(0, 6).map(([u, t]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>`).join('')}</div>` : '');
        } catch (e) {
          if (history[history.length - 1]?.role === 'user') history.pop();
          const status = e?.status;
          const msg = status === 401 ? 'Der API-Schlüssel ist ungültig. Prüfe ihn unter ⚙️.'
            : status === 429 ? 'Gerade zu viele Anfragen – versuch es gleich noch einmal.'
            : status === 400 && /credit|balance/i.test(e?.message || '') ? 'Dein Anthropic-Guthaben ist aufgebraucht.'
            : 'Die Antwort konnte nicht geladen werden. Prüfe deine Verbindung.';
          out.innerHTML = `<p>${esc(msg)}</p><button class="btn sm" data-claude="${esc(q)}">In Claude fragen</button>`;
        } finally { busy = false; }
      }

      bar.addEventListener('submit', e => { e.preventDefault(); const q = input.value; input.value = ''; input.style.height = 'auto'; ask(q); });
      body.addEventListener('click', e => {
        const s = e.target.closest('[data-q]');
        if (s) ask(s.dataset.q);
        const c = e.target.closest('[data-claude]');
        if (c) openInClaude(c.dataset.claude);
      });
      sh.el.querySelector('[data-ai-settings]').onclick = () => openAiSettings(() => { if (!history.length) intro(); });
      if (initial) ask(initial); else setTimeout(() => input.focus(), 400);
    },
  });
}

export function openAiSettings(onDone) {
  openSheet({
    title: 'KI-Einstellungen',
    onClose: onDone,
    render: body => {
      body.innerHTML = `
        <div class="card card-pad">
          <h3 style="margin-top:0">Kostenlos über Claude</h3>
          <p style="margin:0">Ohne Schlüssel öffnet der Assistent deine Frage in <b>claude.ai</b> – mit deinem Claude-Account und den aktuellen Schlagzeilen aus der App.</p>
        </div>
        <div class="card card-pad" style="margin-top:14px">
          <h3 style="margin-top:0">Antworten direkt in der App</h3>
          <p class="muted" style="margin-top:0">Dafür brauchst du einen eigenen API-Schlüssel von Anthropic (console.anthropic.com → API Keys). Die Nutzung wird über dein Anthropic-Konto abgerechnet. Der Schlüssel bleibt nur auf diesem Gerät gespeichert.</p>
          <label class="field" style="margin:0"><span>Anthropic-API-Schlüssel</span>
            <input class="input" type="password" data-key value="${esc(state.settings.aiKey || '')}" placeholder="sk-ant-…" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
          <div class="row" style="margin-top:12px"><button class="btn primary sm" data-save>Speichern</button><button class="btn sm danger" data-del>Entfernen</button></div>
        </div>`;
      const k = body.querySelector('[data-key]');
      body.querySelector('[data-save]').onclick = () => { state.settings.aiKey = k.value.trim(); save(); toast(state.settings.aiKey ? 'Schlüssel gespeichert' : 'Kein Schlüssel hinterlegt'); };
      body.querySelector('[data-del]').onclick = () => { state.settings.aiKey = ''; k.value = ''; save(); toast('Schlüssel entfernt'); };
    },
  });
}
