// Optionaler eigener CORS-Proxy für Pulse (Cloudflare Workers, kostenloser Tarif reicht).
// Einrichtung: dash.cloudflare.com → Workers & Pages → Worker erstellen → diesen Code einfügen → Deploy.
// Danach in Pulse unter Mehr → Einstellungen → „Eigener CORS-Proxy“ eintragen:
//   https://<dein-worker>.workers.dev/?url=
const ALLOWED_HOSTS = [
  'spiegel.de', 'zeit.de', 'faz.net', 'sueddeutsche.de', 'n-tv.de', 'welt.de', 'handelsblatt.com',
  'deutschlandfunk.de', 'dw.com', 'heise.de', 't3n.de', 'kicker.de', 'news.google.com', 'bbci.co.uk',
  'bbc.co.uk', 'bbc.com', 'nytimes.com', 'aljazeera.com', 'finance.yahoo.com', 'tagesschau.de',
];

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors() });
    const target = new URL(request.url).searchParams.get('url');
    let url;
    try { url = new URL(target); } catch { return new Response('Parameter "url" fehlt', { status: 400, headers: cors() }); }
    // Artikel-Seiten der erlaubten Verlage dürfen ebenfalls geladen werden (Reader-Modus)
    if (!/^https?:$/.test(url.protocol) || !ALLOWED_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
      return new Response('Host nicht erlaubt', { status: 403, headers: cors() });
    }
    const res = await fetch(url.href, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PulseReader/1.0)', 'Accept': '*/*', 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8' },
      cf: { cacheTtl: 120, cacheEverything: true },
    });
    const h = new Headers(res.headers);
    Object.entries(cors()).forEach(([k, v]) => h.set(k, v));
    h.delete('set-cookie');
    return new Response(res.body, { status: res.status, headers: h });
  },
};
function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': '*' };
}
