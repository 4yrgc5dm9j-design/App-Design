// Kategorien & Nachrichtenquellen (von App und Daten-Job gemeinsam genutzt)
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
  { id: 'nyt', name: 'New York Times', color: '#111111', intl: true, off: true, desc: 'USA · englisch', feeds: {
    top: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', welt: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
    wirtschaft: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml', tech: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
    sport: 'https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml', wissen: 'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml' } },
  { id: 'aljazeera', name: 'Al Jazeera', color: '#b38f00', intl: true, off: true, desc: 'Katar · englisch', feeds: { welt: 'https://www.aljazeera.com/xml/rss/all.xml' } },
];

// Sportligen (ESPN-Schlüssel)
export const LEAGUES = [
  { key: 'soccer/ger.1', name: 'Bundesliga', flag: '🇩🇪', oldb: 'bl1' },
  { key: 'soccer/ger.2', name: '2. Bundesliga', flag: '🇩🇪', oldb: 'bl2' },
  { key: 'soccer/ger.dfb_pokal', name: 'DFB-Pokal', flag: '🏆', noTable: true },
  { key: 'soccer/uefa.champions', name: 'Champions League', flag: '⭐' },
  { key: 'soccer/uefa.europa', name: 'Europa League', flag: '🟠' },
  { key: 'soccer/eng.1', name: 'Premier League', flag: '🏴' },
  { key: 'soccer/esp.1', name: 'LaLiga', flag: '🇪🇸' },
  { key: 'soccer/ita.1', name: 'Serie A', flag: '🇮🇹' },
  { key: 'soccer/fra.1', name: 'Ligue 1', flag: '🇫🇷' },
  { key: 'basketball/nba', name: 'NBA', flag: '🏀' },
  { key: 'football/nfl', name: 'NFL', flag: '🏈' },
  { key: 'hockey/nhl', name: 'NHL', flag: '🏒' },
  { key: 'racing/f1', name: 'Formel 1', flag: '🏎️', racing: true, noTeams: true },
];

// Wertpapiere, die der Daten-Job automatisch aktualisiert (ohne eigenen Proxy durchsuchbar)
export const MARKET_UNIVERSE = [
  // Indizes, Währungen, Rohstoffe, Krypto
  '^GDAXI', '^MDAXI', '^TECDAX', '^STOXX50E', '^GSPC', '^IXIC', '^DJI', '^N225', '^FTSE', '^SSMI', '^HSI',
  'EURUSD=X', 'EURGBP=X', 'EURCHF=X', 'GC=F', 'SI=F', 'BZ=F', 'CL=F', 'BTC-EUR', 'ETH-EUR', 'SOL-EUR', 'XRP-EUR',
  // DAX 40
  'ADS.DE', 'AIR.DE', 'ALV.DE', 'BAS.DE', 'BAYN.DE', 'BEI.DE', 'BMW.DE', 'BNR.DE', 'CBK.DE', 'CON.DE', 'DTG.DE', 'DBK.DE',
  'DB1.DE', 'DHL.DE', 'DTE.DE', 'EOAN.DE', 'FRE.DE', 'HNR1.DE', 'HEI.DE', 'HEN3.DE', 'IFX.DE', 'MBG.DE', 'MRK.DE',
  'MTX.DE', 'MUV2.DE', 'P911.DE', 'PAH3.DE', 'QIA.DE', 'RHM.DE', 'RWE.DE', 'SAP.DE', 'SRT3.DE', 'SIE.DE', 'ENR.DE',
  'SHL.DE', 'SY1.DE', 'VOW3.DE', 'VNA.DE', 'ZAL.DE', 'LHA.DE', 'TUI1.DE', 'HFG.DE',
  // Europa
  'ASML.AS', 'MC.PA', 'NOVO-B.CO', 'NESN.SW', 'ROG.SW', 'OR.PA', 'TTE.PA', 'SHEL.L', 'AZN.L', 'NOKIA.HE',
  // USA
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'BRK-B', 'JPM', 'V', 'MA', 'NFLX', 'AMD', 'INTC', 'AVGO',
  'ORCL', 'CRM', 'ADBE', 'PLTR', 'KO', 'PEP', 'MCD', 'DIS', 'NKE', 'WMT', 'XOM', 'BA', 'UBER', 'COIN', 'LLY', 'COST',
  // ETFs
  'EUNL.DE', 'SXR8.DE', 'EXS1.DE', 'VWRL.AS', 'IS3N.DE', 'EQQQ.DE',
];
export const symFile = s => s.replace(/[^A-Za-z0-9.-]/g, '_');
