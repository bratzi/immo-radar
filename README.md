# immo-radar

Sucht eine Mietwohnung in München und meldet passende Angebote per Telegram.

**Profil:** Warmmiete bis 1.300 €, mindestens 2 Zimmer, mindestens 45 m²,
Balkon Pflicht, Stadtgebiet München. 3 Zimmer sind ein Bonus in der Reihung.

Entwurf: `docs/superpowers/specs/2026-11-11-muenchen-mietwohnung-design.md`.
Der frühere Zweck (Mehrfamilienhäuser, Zwangsversteigerungen) liegt in
`docs/archiv/2026-09-mehrfamilienhaus/`.

## Aufbau

    scraper/main.ts         Lauf: Quellen sweepen, Profil prüfen, Details für
                            Unklare, neue Treffer melden, Abgänge markieren
    scraper/lib/profil.ts   das Suchprofil als Code
    scraper/lib/balkon.ts   Balkonbeleg aus Ausstattung, Titel, Beschreibung
    scraper/lib/warmmiete.ts Warmmiete: angegeben / kalt+NK / geschätzt
    scraper/lib/reihung.ts  Punkte für Bonusmerkmale
    scraper/scrapers/       immowelt (weitere Quellen folgen)
    web/                    Dashboard (Cloudflare Pages)
    schema.sql              Tabellen angebote, laeufe

## Betrieb

Der Lauf startet alle 30 Minuten über `.github/workflows/scrape.yml`
(Minuten 17 und 47). GitHub führt Zeitpläne nur nach bestem Bemühen aus;
real ist mit 45 bis 60 Minuten zu rechnen.

**Der Scraper läuft nicht lokal.** Live-Abrufe haben den privaten Anschluss
des Nutzers 2026-09-08 zweimal lahmgelegt. Prüfungen laufen auf GitHub:

    gh workflow run pruefung.yml -f skript=pruefe-quelle -f quelle=immowelt
    gh run watch

Lokal nur Tests und Typprüfung:

    cd scraper && npm ci && npm test && npx tsc --noEmit

Umgebungsvariablen (CI-Secrets): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Für den einmaligen Datenbank-Reset
zusätzlich `SUPABASE_MANAGEMENT_PAT`.
