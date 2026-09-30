# Pulse – News, Börse & Sport

Moderne, kostenlose All-in-One-Nachrichten-App als Web-App (PWA) – installierbar auf dem Home-Bildschirm.

## Funktionen

- **Dashboard „Heute“** – persönliche Begrüßung, Wetter, „Das Wichtigste“, eigene Themen-Widgets
  (z. B. Bundesregierung, Sport, KI), Watchlist, Live-Sport und Live-TV. Aktualisiert sich automatisch.
  Reihenfolge und Sichtbarkeit sind frei anpassbar.
- **Eilmeldungen** – erscheinen ganz oben; pro Thema einstellbar („Neu“-Hinweise für brandneue Artikel).
- **News** – 17 Redaktionen (tagesschau, SPIEGEL, ZEIT, FAZ, SZ, n-tv, WELT, Handelsblatt, DLF, DW, heise,
  t3n, kicker, BBC, Guardian, NYT, Al Jazeera) plus Google News (hunderte Verlage/Agenturen).
  Kategorien, Quellenauswahl und Suche über alle Anbieter. Artikel werden **in der App** gelesen
  (Volltext bei tagesschau & Guardian, sonst Reader-Modus; bei Paywall Zusammenfassung + Link).
- **Börse** – Indizes, Watchlist, Wertpapiersuche, interaktive Charts (1T–5J), technische Analyse
  (GD 20/50/200, RSI, MACD, Volatilität, Performance) und passende News. Krypto via CoinGecko.
- **Sport** – Live-Ergebnisse (Auto-Refresh), Tabellen, Teams, Kader, Spielerprofile & Statistiken,
  Spielverlauf, Aufstellungen, Torjäger (Bundesliga). Ligen & Lieblingsteams favorisieren.
- **Mehr** – Live-TV (tagesschau24 & phoenix direkt in der App), Recherche (Wikipedia + News + Börse),
  gespeicherte Artikel, Profil (Name, Wohnort, Geburtstag, Verein), Einstellungen, Export/Import.

Alle persönlichen Daten bleiben lokal im Browser (localStorage). Kein Konto, kein Server, kein Tracking.

## Starten / Veröffentlichen

Es ist reines HTML/CSS/JavaScript ohne Build-Schritt.

- **Lokal:** `npx http-server pulse -p 8080` und `http://localhost:8080` öffnen.
- **GitHub Pages:** Repository → Settings → Pages → Branch wählen → Ordner `/ (root)`.
  Die App ist dann unter `https://<user>.github.io/<repo>/pulse/` erreichbar.
- **Auf dem iPhone installieren:** Seite in Safari öffnen → Teilen → „Zum Home-Bildschirm“.

## Datenquellen

- **Daten-Job (GitHub Actions, alle 10 Minuten):** `.github/workflows/pulse-data.yml` führt
  `scripts/build-data.mjs` aus. Er sammelt alle RSS-Feeds (16 Redaktionen + Google News), lädt die
  Volltexte der neuesten Artikel, holt Kurse und Charts für über 110 Wertpapiere (Yahoo Finance) und
  Sicherungskopien der Sportdaten. Das Ergebnis liegt als JSON im Branch `data` und wird von der App
  über `raw.githubusercontent.com` geladen – ganz ohne CORS-Proxy.
- **Direkt im Browser:** tagesschau (Suche & Top-Meldungen), ESPN über `site.web.api.espn.com`
  (Live-Ergebnisse alle 30 Sekunden, Tabellen, Kader, Spieler), OpenLigaDB (Torjäger), Open-Meteo
  (Wetter), Wikipedia (Recherche), CoinGecko (Krypto).
- **Optional eigener Proxy:** `worker/cors-proxy.js` als Cloudflare Worker deployen und in
  **Mehr → Einstellungen → Eigener CORS-Proxy** eintragen (`https://<worker>.workers.dev/?url=`).
  Dann laden RSS-Feeds sekundenaktuell, beliebige Wertpapiere sind suchbar und die Google-News-Suche ist aktiv.

Kursdaten können verzögert sein. Analysen sind automatisch berechnete Indikatoren – keine Anlageberatung.
