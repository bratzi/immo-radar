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

Der Scraper startet Chromium bewusst im Fenstermodus (`headless: false`, siehe
[Immowelt: Teil-Sweep pro Lauf](#immowelt-teil-sweep-pro-lauf)) und braucht daher
ein Display. Auf einem headless Linux-Rechner — und in CI — muss der Lauf
deshalb unter `xvfb-run` erfolgen:

```bash
sudo apt-get install -y xvfb
xvfb-run --auto-servernum npm run scrape
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

- **Abdeckungsprotokoll:** Stolpert der Sweep für auch nur ein Bundesland,
  löscht die ganze Quelle in diesem Lauf nicht (alles oder nichts, beide
  Quellen). Als „gestolpert" zählt auch ein Bundesland, das lautlos null
  Objekte liefert — technisch nicht von einem stillen Ausfall zu unterscheiden.
- **Selbstkonsistenz:** Weist das Portal eine Trefferzahl aus, muss sie zur
  eingesammelten Menge passen. (ZVG nennt keine — dort entfällt die Prüfung.)
- **Historienvergleich:** Die Menge muss innerhalb von 25 % des Medians der
  letzten zehn **erfolgreichen** Läufe liegen, und es müssen mindestens drei Referenzläufe
  vorliegen. Sonst: keine Löschung, stattdessen eine Warnung per Telegram.
- **Nullmengen sind nie ein Freibrief:** Ein Lauf mit 0 eingesammelten
  Objekten und ein Median von 0 gelten ausdrücklich als „nicht beurteilbar",
  nicht als bestandene Prüfung. Genau diese Werte sind das *Symptom* eines
  Ausfalls (ein Soft-Block antwortet mit HTTP 200 und leerer Hülle).
- **Zweite Bedingung vor der harten Löschung:** Gelöscht wird nur, wenn neben
  `disappeared_at` auch `last_seen` älter als die Karenz ist. Was dieser Lauf
  gesehen hat, kann damit nicht gelöscht werden.

Leitregel: **Wer nicht urteilen kann, löscht nicht.**
Hinzugefügt wird dagegen immer — gebremst wird nur das Löschen.

### Immowelt: Teil-Sweep pro Lauf

Immowelt sitzt hinter DataDome. Ein Live-Lauf hat gezeigt: Der Fenstermodus
(`headless: false`) kommt zwar an der CAPTCHA vorbei, aber nur bei mäßiger
Anfragerate — nach vielen Seitenabrufen kehrt die CAPTCHA zurück. Deshalb ist
die Drosselung auf 5 s je Seitenabruf hochgesetzt und jeder Lauf grast nur
drei Bundesländer ab (rotierend über die Stundenzahl seit Epoche, gleiche
Mechanik wie die Detail-Rotation). Ein vollständiger Durchlauf über alle 16
Länder sammelt sich so über den Tag an, nicht in einem Lauf.

Ein Teil-Sweep über wenige Länder ist per Definition nie vollständig: Immowelt
meldet daher **immer `vollstaendig=false`**. Es trägt weiter Kandidaten bei
(Hinzufügen ist nie an `vollstaendig` gebunden), **autorisiert aber keine
Löschung**. Die Löschhoheit zurückzuholen hieße, pro Fundort zu verengen —
dazu bräuchte es eine Spalte, die festhält, wo jedes Listing gefunden wurde;
ein eigenes Arbeitspaket. Bis dahin ist **das ZVG-Portal die einzige Quelle,
die löscht** (klein, partitioniert nach Bundesland, unauffällig).

Der Fenstermodus bleibt zwingend — kein Spoofing, kein Stealth-Plugin, siehe
die Begründung in `scraper/scrapers/immowelt/index.ts`. **Nicht auf headless
„optimieren".**

## Meldeklassen

| Klasse | Bedeutung |
|---|---|
| 🎯 `top_treffer` | Schwellen erfüllt **und** die Miete ist belegt |
| 🔍 `pruefkandidat` | Schwellen erfüllt, aber die Miete ist geschätzt — Faktor und DSCR sind entsprechend unsicher |
| 💶 `preisaenderung` | Der Preis ist gefallen |
| ❌ `verschwunden` | Ein zuvor gemeldetes Objekt ist aus dem Angebot verschwunden |
