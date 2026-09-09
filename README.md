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
    rentEstimate.ts    Jahreskaltmiete: angegeben / regional (PLZ) /
                       bundeslandgenau (Immowelt) / bundesweit
    grunderwerbsteuer.ts  Steuersatz + Bundesland je PLZ
    meldung.ts         Meldeklassen top_treffer / pruefkandidat + Rangfolge
    bestand.ts         Abgleichlogik: Abgänge, Rückkehrer, Karenz
    plausibilitaet.ts  Tor vor der Löschung (Mengenprüfung)
    pipeline.ts        Ein Kandidat: bewerten, speichern, ggf. melden
    db.ts              listings / listing_versions / notifications
    bestandDb.ts       Bestandsführung + sweep_runs / sweep_region_runs
    meldebudget.ts     Obergrenze für Telegram-Meldungen je Lauf
    nurInCi.ts         Sperre gegen Live-Läufe am privaten Anschluss
    telegram.ts        Nachrichtenformate und Versand
    karte.ts           Lagekarte als PNG
  scrapers/
    immowelt/          list / index / titelzeile (Playwright);
                       detail.ts liegt still, siehe unten
    zvg-portal/        list / detail / index (Playwright)
schema.sql             Datenbankschema (Supabase/Postgres)
docs/superpowers/      Specs und Implementierungspläne
```

## Betrieb

Der Zeitplan **läuft**: `cron "0 */3 * * *"` in
[`scrape.yml`](.github/workflows/scrape.yml), letzter Produktionslauf
`34355619597` am 2026-09-09 um 13:12 UTC mit `conclusion=success`.

**Der Takt steht auf drei Stunden — gemessen sind rund fünf.** Über 23
Soll-Termine (2026-09-05 bis 2026-09-08) sind 13 gelaufen und 10 ausgefallen:
**43 % Ausfall**. Die gelaufenen kamen 8 bis 171 Minuten zu spät, im Median
rund 100. Das ist kein Fehler dieses Projekts — GitHub führt geplante Läufe
ausdrücklich nur nach bestem Bemühen aus. Wer aus dem Takt etwas ableitet
(Abdeckung je Tag, Abtragen von Rückständen, „bis zum nächsten Lauf ist das
folgenlos"), rechnet mit **einem Lauf je rund fünf Stunden**, nicht mit acht
am Tag. Dieselbe Größenordnung steht unabhängig gemessen in
[`specs/2026-09-08-immowelt-abgaenge-optionen.md`](docs/superpowers/specs/2026-09-08-immowelt-abgaenge-optionen.md):
14 Läufe in 70,1 h = 5,4 h je Lauf.

Der Crontakt selbst ist unverändert. Ob dichter getaktet wird, ist eine
offene Entscheidung des Nutzers.

### Live-Läufe gehören auf GitHubs Rechner, nicht auf deinen

**Der Scraper läuft nicht lokal.** `npm run scrape` und die Prüfskripte brechen
mit einer Erklärung ab, wenn `CI` nicht gesetzt ist.

Das ist keine Vorsicht, sondern Erfahrung: Live-Läufe über einen privaten
Anschluss haben ihn am 2026-09-08 **zweimal** lahmgelegt. Nicht die Datenmenge
war schuld, sondern tausende Verbindungen und DNS-Abfragen aus einem Browser
mit Fenster — danach löste minutenlang gar nichts mehr auf, auch `example.com`
nicht. Beim ersten Mal war es ein bundesweiter Lauf, beim zweiten Mal sechs
einzelne Regionsläufe kurz hintereinander: jeder für sich regelkonform, in der
Summe derselbe Schaden.

Der volle Lauf läuft über
[`scrape.yml`](.github/workflows/scrape.yml) — Soll alle drei Stunden,
gemessen rund alle fünf (siehe oben). Einzelne Prüfungen startest du
über [`pruefung.yml`](.github/workflows/pruefung.yml):

```bash
# Eine Region erfassen, auf 12 Ergebnisseiten gedeckelt
gh workflow run pruefung.yml -f skript=pruefe-region -f region=hb -f max_seiten=12

# Welche Overlays fangen die Blätter-Klicks ab?
gh workflow run pruefung.yml -f skript=diagnose-overlays

# Warum liefert eine Detailseite kein Datenmodell?
gh workflow run pruefung.yml -f skript=diagnose-detail

gh run watch          # zusehen
gh run view --log     # Ausgabe lesen
```

Diese Prüfungen berühren weder Datenbank noch Telegram und brauchen deshalb
keine Secrets. Ein Lauf dauert wenige Minuten.

**Ausnahme, nur auf ausdrückliche Ansage des Nutzers und dann genau einmal:**

```bash
cd scraper
ICH_HABE_DEN_ANSCHLUSS_FREIGEGEBEN=ja npx tsx scripts/pruefe-region.mts hb 12
```

Danach auswerten, bevor irgendetwas Weiteres startet. Mehrere Läufe kurz
hintereinander sind genau der Fehler, der schon zweimal passiert ist.

### Entwickeln ohne Netz

Tests und Typprüfung brauchen keinen Live-Zugriff:

```bash
cd scraper
npm ci
npx playwright install chromium   # für die Browser-Tests gegen eigene Fixtures
npm test
npx tsc --noEmit
```

Benötigte Umgebungsvariablen (lokal in `scraper/.env`, in CI als Repo-Secrets):
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

Tests: `cd scraper && npm test`

## Wie ein Lauf arbeitet

1. **Sweep** je Quelle — nur Ergebnislisten, liefert die vollständige Ist-Menge
   aller `externalId`s. Wird in `sweep_runs` protokolliert.
2. **Detailerfassung — nur ZVG.** Dort für neue Objekte und solche, deren
   letzte Erfassung über 7 Tage her ist. **Immowelt hat seit dem 2026-09-08
   keine Detailphase mehr:** seine `/expose/`-Seiten antworten von
   Rechenzentrums-Adressen mit HTTP 403 und DataDome-CAPTCHA, während
   `/suche/` im selben Lauf HTTP 200 liefert. Bewertet wird dort aus der
   Titelzeile der Ergebniskarte (`scrapers/immowelt/titelzeile.ts`) — das
   kostet keinen zusätzlichen Abruf, dafür fehlt die Postleitzahl und die
   Mietschätzung wird bundeslandgenau statt PLZ-genau. `main.ts` ruft
   deshalb nur noch `erfasseZvgDetails` auf; `erfasseImmoweltDetails` in
   `scrapers/immowelt/index.ts` hat keine Aufrufstelle mehr.
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
die Drosselung auf 5 s je Seitenabruf hochgesetzt, und jeder Lauf grast nur
so viele Bundesländer ab, wie in ein Wanduhr-Budget (`SWEEP_BUDGET_MS`, 12 min)
passen — rotierend über die Stundenzahl seit Epoche, gleiche Mechanik wie die
Detail-Rotation. Wie viele Länder das sind, schwankt mit den Ländern, die in
der Rotation gerade an der Reihe sind (Nordrhein-Westfalen allein füllt das
Budget schon fast). Ein vollständiger Durchlauf über alle 16 Länder sammelt
sich über viele Läufe an, nicht in einem — und **nicht über einen Tag.**
Gemessen fängt ein Lauf, der auf einer großen Region startet, genau diese
eine ab (`nw` allein ~173 Seiten ≈ 33 min gegen 12 min Budget), der
Startindex ist die Uhrzeit und nicht ein Fortschrittszeiger, und der Cron
läuft real nur alle ~5 h. Die Monte-Carlo-Rechnung in
[`specs/2026-09-08-immowelt-abgaenge-optionen.md`](docs/superpowers/specs/2026-09-08-immowelt-abgaenge-optionen.md)
kommt damit auf einen **Median von 13,1 Tagen**, bis jede Region drei
Referenzläufe hat.

Ein Teil-Sweep über wenige Länder ist per Definition nie vollständig: Immowelt
meldet daher **immer `vollstaendig=false`**. Es trägt weiter Kandidaten bei
(Hinzufügen ist nie an `vollstaendig` gebunden), **autorisiert aber keine
Löschung**. Die Löschhoheit zurückzuholen hieße, pro Fundort zu verengen.
Die dafür nötige Spalte gibt es inzwischen — `listings.fundort` in
[`schema.sql`](schema.sql), gefüllt aus dem Sweep —, und `sweep_region_runs`
sammelt die Mengenhistorie je Region. **Am Löschverhalten ändert beides
heute nichts** (so steht es auch im Schema-Kommentar): **das ZVG-Portal ist
weiterhin die einzige Quelle, die löscht** (klein, partitioniert nach
Bundesland, unauffällig).

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
