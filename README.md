# immo-radar

Findet Mehrfamilienhäuser (ab 3 Einheiten) mit belastbarer Rendite und meldet
sie per Telegram. Zwei Quellen: **Immowelt** (regulärer Verkauf) und das
**ZVG-Portal** (Zwangsversteigerungen).

## Aufbau

```
scraper/
  main.ts              Orchestrierung: Sweep -> Details -> Abgleich -> Löschung
  lib/
    metrics.ts         Kennzahlen (NOI, Faktor, DSCR, Beleihungswert)
    rentEstimate.ts    Jahreskaltmiete: angegeben / regional / bundesweit
    grunderwerbsteuer.ts  Steuersatz + Bundesland je PLZ
    meldung.ts         Meldeklassen top_treffer / pruefkandidat + Rangfolge
    bestand.ts         Abgleichlogik: Abgänge, Rückkehrer, Karenz
    plausibilitaet.ts  Tor vor der Löschung (Mengenprüfung)
    pipeline.ts        Ein Kandidat: bewerten, speichern, ggf. melden
    db.ts              listings / listing_versions / notifications
    bestandDb.ts       Bestandsführung + sweep_runs
    telegram.ts        Nachrichtenformate und Versand
    karte.ts           Lagekarte als PNG
  scrapers/
    immowelt/          list / detail / index (Playwright)
    zvg-portal/        list / detail / index (Playwright)
schema.sql             Datenbankschema (Supabase/Postgres)
docs/superpowers/      Specs und Implementierungspläne
```

## Betrieb

Ein Lauf alle 3 Stunden über GitHub Actions (`.github/workflows/scrape.yml`) — derzeit
**pausiert** für den Umbau „vollständige Erfassung & Bestandsführung". Die `schedule`-Direktive
in `.github/workflows/scrape.yml` ist deaktiviert; nur `workflow_dispatch` ist aktiv. Das `schedule`-
Feld **muss nach dem Merge wieder aktiviert werden**.

Lokal:

```bash
cd scraper
npm ci
npx playwright install chromium
npm run scrape
```

Benötigte Umgebungsvariablen (lokal in `scraper/.env`, in CI als Repo-Secrets):
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

Tests: `cd scraper && npm test`

## Wie ein Lauf arbeitet

1. **Sweep** je Quelle — nur Ergebnislisten, liefert die vollständige Ist-Menge
   aller `externalId`s. Wird in `sweep_runs` protokolliert.
2. **Detailerfassung** — nur für neue Objekte und solche, deren letzte
   Erfassung über 7 Tage her ist.
3. **Bewertung und Meldung** — gesendet wird, wenn die Meldeklasse eines
   Objekts steigt. Die `notifications`-Zeile entsteht erst nach bestätigtem
   Versand, damit ein fehlgeschlagener Versand im nächsten Lauf nachgeholt wird.
4. **Abgleich** — was im vollständigen Sweep fehlt, bekommt `disappeared_at`.
   Vorher muss die Menge plausibel sein (siehe unten).
5. **Löschung** — nach 2 Tagen Karenz wird hart gelöscht.

## Warum nicht sofort gelöscht wird

Ein Lauf darf nur dann auf Abwesenheit hin löschen, wenn er das ganze Angebot
gesehen hat. Drei Sicherungen:

- **Abdeckungsprotokoll:** Bricht der Sweep für ein Bundesland ab, bleiben
  dessen Objekte unangetastet.
- **Selbstkonsistenz:** Weist das Portal eine Trefferzahl aus, muss sie zur
  eingesammelten Menge passen. (ZVG nennt keine — dort entfällt die Prüfung.)
- **Historienvergleich:** Die Menge muss innerhalb von 25 % des Medians der
  letzten zehn **erfolgreichen** Läufe liegen, und es müssen mindestens drei Referenzläufe
  vorliegen. Sonst: keine Löschung, stattdessen eine Warnung per Telegram.

Hinzugefügt wird dagegen immer — gebremst wird nur das Löschen.

### Immowelt-Sonderfall: unvollständige Erfassung

Immowelt nutzt Server-seitiges Rendering für die Ergebnislisten. Beim Klick auf
„nächste Seite" wird diese Seite verlassen und eine leere SPA-Hülle geladen —
Pagination funktioniert derzeit nicht. Dadurch werden pro Bundesland nur die
ersten ~40 Objekte der Ergebnisliste erfasst, statt mehrerer hundert. Die
Selbstkonsistenz-Prüfung erkennt diese Untererfassung und setzt `vollstaendig=false`.
Immowelt trägt daher zu Neufunden bei, autorisiert aber keine Löschung.

## Meldeklassen

| Klasse | Bedeutung |
|---|---|
| 🎯 `top_treffer` | Schwellen erfüllt **und** die Miete ist belegt |
| 🔍 `pruefkandidat` | Schwellen erfüllt, aber die Miete ist geschätzt — Faktor und DSCR sind entsprechend unsicher |
| 💶 `preisaenderung` | Der Preis ist gefallen |
| ❌ `verschwunden` | Ein zuvor gemeldetes Objekt ist aus dem Angebot verschwunden |
