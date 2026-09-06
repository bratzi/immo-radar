# immo-radar Plan 2 — ZVG-Portal (Zwangsversteigerungen) — Design

Datum: 2026-09-06
Status: Vom Nutzer bestätigtes gemeinsames Verständnis, bereit für Implementierungsplan.

Volle Recherche-Historie (robots.txt-Fund, Formular-HTML, Bundesland-Array,
Objekttyp-Liste) steht in
`docs/superpowers/specs/2026-09-06-plan2-zvg-portal-notes.md` — dieses
Dokument fasst nur die daraus getroffenen Design-Entscheidungen zusammen.

## Ziel

Zweite Datenquelle für immo-radar (nach Plan 1/Immowelt): das
bundesweite **ZVG-Portal** (zvg-portal.de, Justizportal des Bundes und der
Länder) nach Zwangsversteigerungsterminen für Mehrfamilienhäuser durchsuchen,
mit derselben Rendite-/Finanzierbarkeits-Logik bewerten wie Plan 1 und über
denselben Telegram-Kanal melden.

## Bewusste Entscheidung für diese Quelle (nicht erneut hinterfragen)

Der Nutzer hat sich nach zwei expliziten Rückfragen bewusst für ZVG-Portal
statt der einfacheren Alternative Immonet entschieden:

1. **robots.txt wird für diese eine Quelle bewusst ignoriert.** Sie sperrt
   genau die Endpunkte für Termin-Details
   (`/templates/template.internet.showZvg.php` u.a.). Der Nutzer wurde auf
   den Unterschied zu Plan 1 hingewiesen (Behördenseite, Daten Dritter in
   finanzieller Notlage) und hat dennoch zugestimmt. Dafür gilt strikt:
   **nur lesend, keine Weiterverbreitung, keine Personendaten Dritter über
   das für die Kaufentscheidung Notwendige hinaus** (s. Personendaten-Policy
   unten).
2. **Playwright wird für diese Quelle vorausgesetzt** (sitzungsbasierte,
   JavaScript-gesteuerte Formular-Navigation statt einfacher GET-Requests).
3. **Umfang: bundesweit, alle 16 Bundesländer/Amtsgerichte**, konsistent mit
   Plan 1.

## Architektur

Neues Scraper-Modul, strukturell analog zu `scrapers/immowelt/`:

```
scraper/scrapers/zvg-portal/
  index.ts   Orchestrierung: Bundesländer durchlaufen, Ergebnisse einsammeln
  list.ts    Playwright: Suchformular ausfüllen + absenden, Ergebnisliste parsen
  detail.ts  Eine Bekanntmachung in strukturierte Felder + Volltext parsen
```

`main.ts` wird generalisiert: die bisher Immowelt-spezifische
Pipeline-Sequenz (Mietschätzung → Grunderwerbsteuer → Kennzahlen → Upsert →
Telegram) wandert in eine gemeinsame Hilfsfunktion, die für Kandidaten
beider Quellen läuft. Vermeidet, dass eine zweite Quelle die Logik
dupliziert und künftige main.ts-Fixes an zwei Stellen gepflegt werden
müssten.

## Scraping-Ansatz

1. **Sucheinstieg:** `https://www.zvg-portal.de/index.php?button=Termine%20suchen`
   (statisches HTML, per einfachem GET/curl ladbar — kein Playwright nötig
   für diesen Schritt).
2. **Objekttyp serverseitig filtern:** Das sichtbare `<select id=obj_liste>`
   enthält u.a. `value=4` (Mehrfamilienhaus) und `value=13`
   (Wohn-/Geschäftshaus, Randfall). `insertObj()` kopiert die Auswahl
   unverändert in das tatsächlich abgesendete Feld `obj_arr[]`. Playwright
   wählt direkt die passende(n) Option(en) in `obj_liste` und ruft
   `insertObj()` (oder simuliert den Doppelklick) — kein Bedarf, wie bei
   Immowelt alles zu holen und client-seitig zu filtern.
3. **Bundesland/Amtsgericht:** Das echte Select-Feld heißt `land_abk`
   (16 Kürzel + Default), das dazugehörige Amtsgerichts-Feld `ger_id` wird
   per JS bei Auswahl von `land_abk` nachbestückt und bekommt dabei immer
   eine Sammel-Option „-- Alle Amtsgerichte --" (`value="0"`). **Per
   Playwright-Spike verifiziert (2026-09-06):** diese Sammel-Option liefert
   serverseitig tatsächlich die kombinierten Treffer aller Amtsgerichte des
   Landes (Test: Sachsen + Mehrfamilienhaus → 16 Treffer aus vier
   verschiedenen Amtsgerichten in einer Antwort) — ein Request/Bundesland
   genügt, keine Einzel-Amtsgericht-Iteration nötig.
4. **Formular absenden:** POST auf `index.php?button=Suchen`, von
   Playwright wie ein Mensch ausgefüllt (kein Reverse-Engineering des
   POST-Bodies nötig — genau der Vorteil von Playwright hier).
5. **Zugriffsschutz ist Referer-basiert, nicht sitzungsbasiert (Spike-Fund):**
   Es werden **keine Cookies gesetzt**. Die Detail- (`showZvg`) und
   Anhang-Endpunkte (`showAnhang`) liefern bei direktem Aufruf ohne
   `Referer`-Header nur den Text `error` (HTTP 200) — mit einem
   `Referer`-Header, der auf die vorherige Ergebnisseite zeigt, funktionieren
   sie normal. Playwright muss also durchgehend in derselben Seiten-Navigation
   bleiben (`page.goto(detailUrl, { referer: resultsPageUrl })` bzw. echte
   Link-Klicks) statt separate `fetch()`-Aufrufe zu nutzen.
6. **Ergebnisse + Detail:** Die Ergebnisliste (eine flache `<table>` ohne
   Datensatz-Wrapper, Datensätze durch `<tr><td colspan="3"><hr></td></tr>`
   getrennt) liefert je Termin: Aktenzeichen + Link
   (`a[aria-label="Zwangsversteigerung Detailansicht"]`, `href` enthält
   `zvg_id`+`land_abk`), Amtsgericht, Objekt/Lage (Typ+Adresse),
   Verkehrswert, Termin (oder bei abgesagten Terminen ein Rot-Text „wurde
   aufgehoben" ohne Objekt/Verkehrswert-Zeilen — diese Fälle werden
   übersprungen, keine valide Kaufgelegenheit). `detail.ts` folgt dem
   `showZvg`-Link und liest aus der Label/Wert-Tabelle `#anzeige` (`tr` mit
   je zwei `td`: Label, Wert) Aktenzeichen, Art der Versteigerung, Grundbuch,
   Objekt/Lage, Beschreibung (Freitext inkl. Baujahr/Wohnfläche/Grundstück,
   falls genannt), Verkehrswert, Termin, Ort der Versteigerung.
7. **Kein PDF-Parsing (Korrektur ggü. erstem Entwurf):** Die verlinkte
   „amtliche Bekanntmachung" ist ein PDF-Anhang (bestätigt: `showAnhang`
   liefert beim echten Download eine `.pdf`-Datei). Die `showZvg`-Detailseite
   enthält aber bereits alle relevanten Felder inkl. der vollen
   `Beschreibung` als durchsuchbaren HTML-Text — **das reicht als
   `raw_notice_text`** (Konkatenation der Label/Wert-Paare aus `#anzeige`).
   Das PDF wird nicht heruntergeladen/geparst, nur seine URL als optionaler
   Verweis mitgeführt (spart eine PDF-Text-Extraktions-Abhängigkeit, YAGNI).
8. **Crawl-Etikette wie Plan 1:** gedrosselte Anfragen, keine parallelen
   Massenzugriffe, kein Login/Account-Bezug.

## Datenmodell (Delta zu `schema.sql`)

`listing_versions` bekommt 5 neue Spalten (4 nullable, ZVG-spezifisch + 1
`NOT NULL` mit Default, quellenübergreifend, s. Retrofit-Abschnitt unten):

```sql
alter table listing_versions
  add column auction_at timestamptz,
  add column court text,
  add column case_number text,
  add column raw_notice_text text,
  add column data_gaps text[] not null default '{}';
```

- `source = 'zvg-portal'` in `listings`.
- `price_cents` wird für den **Verkehrswert** wiederverwendet (bleibt "die
  Kopf-Geldzahl", nur je Quelle unterschiedlich belegt) — keine neue Spalte,
  keine Umbenennung.
- Kein neues RLS (Tabellen bereits ohne Policies, nur `service_role`
  zugreifbar), keine neuen Tabellen.

## Bewertungslogik (Delta zu Plan 1)

- **Kaufpreisfaktor/DSCR/Beleihungswert-Risiko bauen direkt auf dem
  Verkehrswert auf**, nicht auf einem geschätzten Gebot. Bewusst
  konservativ: der reale Zuschlag liegt bei Zwangsversteigerungen oft
  darunter, d.h. echte Chancen können auf dem Papier schlechter aussehen,
  als sie sind. Keine Gebots-Schätzformel (keine empirische Grundlage
  dafür vorhanden).
- **Miete weiterhin per PLZ-Schätzung** (`rentEstimate.ts`, gleiche
  Präzisions-Kaskade wie Plan 1) — Auktionsobjekte machen praktisch nie
  eigene Mietangaben.
- Grunderwerbsteuer/Kaufnebenkosten/NOI/Top-Treffer-Schwelle: unverändert
  aus Plan 1 übernommen, keine ZVG-Sonderformel.
- **Einheiten-Mindestgrenze (≥3):** ausschließen nur bei **bestätigter**
  Zahl unter 3 (s. Retrofit-Abschnitt — gilt genauso für Immowelt). Nennt
  eine Bekanntmachung keine exakte Einheitenzahl (der Regelfall bei
  ZVG-Texten), wird das Objekt **nicht ausgeschlossen**: `units = 3` als
  Rechen-Untergrenze für die Kennzahlen-Formeln (Kategorie "Mehrfamilienhaus"
  Wert 4 ist von "Zweifamilienhaus" Wert 19/"Einfamilienhaus" Wert 3
  abgegrenzt, also strukturell ≥3), plus `data_gaps: ["units_unconfirmed"]`.
  Wird im Text eine konkrete Zahl genannt, hat sie Vorrang vor der
  Untergrenze.

## Personendaten-Policy

Gespeicherte Felder: Aktenzeichen, Gericht, Objektbeschreibung, Verkehrswert,
Termin (Datum/Uhrzeit/Ort), PLZ/Adresse des Objekts, **plus** der rohe
Bekanntmachungs-Volltext (`raw_notice_text`, Nutzerwunsch für
Nachvollziehbarkeit der Extraktion). Falls darin Personendaten Dritter
(z.B. Schuldner-Name) enthalten sein sollten, werden sie **nicht aktiv
herausgefiltert**, aber:

- `raw_notice_text` wird nie über eine öffentliche View/API exponiert (wie
  Margns `body_text`) — hier ohnehin unkritisch, da kein Anon-Zugriff
  existiert (RLS ohne Policies, nur `service_role`).
- Keine Weiterverbreitung, keine Anzeige im Dashboard über die oben
  genannten strukturierten Felder hinaus.

## Retrofit für Plan 1: `data_gaps` als quellenübergreifender Mechanismus

Nutzer-Vorgabe (2026-09-06): Objekte dürfen **nie mehr stillschweigend
wegen fehlender Angaben verworfen werden** — fehlende Infos werden
stattdessen sichtbar markiert, portalübergreifend einheitlich. Das betrifft
nicht nur ZVG-Portal, sondern auch das bereits **live laufende** Plan 1
(Immowelt), das aktuell Objekte mit `units === null` in `main.ts` komplett
überspringt (nicht mal in der DB landen sie).

**Neue Regel (ersetzt die bisherige Skip-Logik in `main.ts`):**

- Ausschluss aus der Pipeline nur noch bei **bestätigter** Zahl unter dem
  Schwellwert (`units !== null && units < 3`).
- Ist die Einheitenzahl unbekannt (`units === null`), wird das Objekt
  **trotzdem gespeichert**: `units = 3` als konservative Rechen-Untergrenze
  für `berechneKennzahlen()`, plus Eintrag `"units_unconfirmed"` in
  `data_gaps`.
- `data_gaps: text[]` ist bewusst offen für weitere Codes (z.B. künftig
  `"year_built_missing"`, `"rent_unconfirmed"`) — löst das bisherige
  Einzelfeld `units_confident` ab, das nur für Einheiten existierte.
- Telegram-Nachrichten (beide Formatter) bekommen bei nicht-leerem
  `data_gaps` eine zusätzliche Zeile „⚠️ Fehlende Angaben: …" mit
  Klartext-Übersetzung der Codes (nicht die rohen Codes selbst).

**Umfang der Änderung:** `scraper/lib/db.ts` (neue Spalte durchreichen),
`scraper/main.ts` (Skip-Bedingung ändern, `data_gaps` befüllen),
`scraper/lib/telegram.ts` (Warnzeile ergänzen), `schema.sql`
(`data_gaps`-Spalte, s.o.) — sowie die zugehörigen bestehenden Tests in
`main.ts`/`telegram.test.ts`. Wird als eigener früher Task im
Implementierungsplan behandelt (Voraussetzung für beide Quellen), nicht
nur als Nebeneffekt der ZVG-Arbeit.

## Benachrichtigung

Neuer Telegram-Formatter für ZVG-Treffer (Gericht, Termin, Verkehrswert,
Aktenzeichen statt "online seit"/Kaufpreis-Änderung), inkl. der
`data_gaps`-Warnzeile aus dem Retrofit oben; gleicher
`notifications`-Log-Mechanismus wie Plan 1 zur Duplikat-Vermeidung.

## Cron

Läuft im bestehenden 3h-GitHub-Actions-Workflow mit (kein eigener
Zeitplan) — Nutzerentscheidung trotz seltenerer Änderungsfrequenz von
ZVG-Terminen, zugunsten weniger Infrastruktur.

## Testing

Wie Plan 1: `list.test.ts`/`detail.test.ts` gegen lokal gespeicherte
HTML-Fixtures. **Bereits per Playwright-Spike gesichert (2026-09-06, echte
Live-Antworten):**
- `scraper/test/fixtures/zvg-portal-suche-sachsen-mfh.html` — Ergebnisliste
  Sachsen + Mehrfamilienhaus (16 Treffer, inkl. einem abgesagten Termin ohne
  Objekt/Verkehrswert-Zeilen, guter Edge-Case).
- `scraper/test/fixtures/zvg-portal-detail-40908.html` — eine volle
  `showZvg`-Detailseite (Aktenzeichen 0467 K 0076/2022, Zwenkau).

## Offene technische Setup-/Validierungs-Schritte (Teil des Implementierungsplans)

- Klartext-Übersetzungen der `data_gaps`-Codes für die Telegram-Warnzeile
  festlegen (z.B. `units_unconfirmed` → „Einheiten nicht bestätigt").
- `playwright`-Paket ist bereits als Dependency installiert + Chromium
  lokal heruntergeladen (Spike); GitHub-Actions-Workflow braucht
  zusätzlich `npx playwright install --with-deps chromium` als CI-Schritt.

## Bewusst nicht enthalten (YAGNI)

- PDF-Text-Extraktion der „amtlichen Bekanntmachung" — die HTML-Detailseite
  liefert dieselben Kerninhalte bereits als durchsuchbaren Text (s.o.).
- Gebots-Schätzformel (Verkehrswert × Annahmefaktor) für die Kennzahlen.
- Eigener Cron-Zeitplan für ZVG-Portal.
- Aktive Schwärzung/Filterung von Personendaten im Volltext (nur
  Zugriffs-/Weiterverbreitungs-Beschränkung).
- Einzel-Amtsgericht-Iteration als Standardweg (nur Fallback, falls die
  Sammel-Option nicht funktioniert).
- Rückwirkendes Nacherfassen von Immowelt-Objekten, die vor dem
  `data_gaps`-Retrofit bereits (fälschlich) übersprungen wurden — der
  Retrofit wirkt nur auf künftige Scans.
