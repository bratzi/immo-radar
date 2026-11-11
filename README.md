# immo-radar

Sucht eine Mietwohnung in München und zeigt passende Angebote im
Artifact „Wohnungsradar München“ (liest live aus Supabase).

**Profil:** Warmmiete bis 1.300 €, mindestens 2 Zimmer, mindestens 45 m²,
Stadtgebiet München, unbefristet, keine WG-Zimmer. Balkon und 3 Zimmer sind
Pluspunkte in der Reihung.

Entwurf: `docs/superpowers/specs/2026-11-11-muenchen-mietwohnung-design.md`.
Stand und offene Punkte: `docs/superpowers/UEBERGABE.md`.
Der frühere Zweck (Mehrfamilienhäuser, Zwangsversteigerungen) liegt in
`docs/archiv/2026-09-mehrfamilienhaus/`.

## Aufbau

    scraper/main.ts         Lauf: Quellen sweepen, Profil prüfen, Details für
                            Unklare, Abgänge markieren
    scraper/lib/profil.ts   das Suchprofil als Code
    scraper/lib/balkon.ts   Balkonbeleg aus Ausstattung, Titel, Beschreibung
    scraper/lib/warmmiete.ts Warmmiete: angegeben / kalt+NK / geschätzt
    scraper/lib/reihung.ts  Punkte für Bonusmerkmale
    scraper/scrapers/       kleinanzeigen, immoscout24, wg-gesucht, immowelt (inaktiv)
    schema.sql              Tabellen angebote, laeufe

## Betrieb

Der Lauf startet über `.github/workflows/scrape.yml`, tagsüber und abends
alle 15 Minuten, sonst seltener. GitHub führt Zeitpläne nur nach bestem
Bemühen aus.

**Der Scraper läuft nicht lokal.** Live-Abrufe haben den privaten Anschluss
des Nutzers 2026-09-08 zweimal lahmgelegt. Prüfungen laufen auf GitHub:

    gh workflow run pruefung.yml -f skript=pruefe-quelle -f quelle=kleinanzeigen
    gh run watch

Lokal nur Tests und Typprüfung:

    cd scraper && npm ci && npm test && npx tsc --noEmit

Umgebungsvariablen (CI-Secrets): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.
Für den einmaligen Datenbank-Reset zusätzlich `SUPABASE_MANAGEMENT_PAT`.
