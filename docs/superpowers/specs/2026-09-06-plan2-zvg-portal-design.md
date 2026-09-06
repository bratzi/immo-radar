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
3. **Bundesland/Amtsgericht:** Das eingebettete statische
   `BundeslandArray`/`BundeslandArrayId`-JavaScript liefert alle 16
   Bundesland-Kürzel mit ihren Amtsgerichten + Gerichts-IDs sowie je
   Bundesland eine Sammel-Option „-- Alle Amtsgerichte --". Playwright
   wählt je Bundesland diese Sammel-Option statt einzelner Amtsgerichte
   (ein Request/Bundesland place gegenüber ~180 Amtsgerichts-Requests).
   **Zu verifizieren als erster Implementierungs-Task:** ob die
   Sammel-Option serverseitig tatsächlich alle Amtsgerichte des Landes
   kombiniert zurückgibt. Falls nicht, Fallback auf Einzel-Amtsgericht-
   Iteration (Daten dafür liegen schon vor). Hamburg (`hh`) und
   Mecklenburg-Vorpommern (`mv`) haben laut Array keine teilnehmenden
   Amtsgerichte — vermutlich strukturell 0 Treffer, kein Bug.
4. **Formular absenden:** POST auf `index.php?button=Suchen`, von
   Playwright wie ein Mensch ausgefüllt (kein Reverse-Engineering des
   POST-Bodies nötig — genau der Vorteil von Playwright hier).
5. **Ergebnisse + Detail:** Ergebnisliste liefert Basisdaten je Termin;
   `detail.ts` liest je Fundstelle die volle Bekanntmachung (Aktenzeichen,
   Gericht, Verkehrswert, Termin-Datum/-Ort, Objektbeschreibung, Volltext).
6. **Crawl-Etikette wie Plan 1:** gedrosselte Anfragen, keine parallelen
   Massenzugriffe, kein Login/Account-Bezug.

## Datenmodell (Delta zu `schema.sql`)

`listing_versions` bekommt 4 neue nullable Spalten:

```sql
alter table listing_versions
  add column auction_at timestamptz,
  add column court text,
  add column case_number text,
  add column raw_notice_text text;
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
- **Einheiten-Mindestgrenze (≥3) — Annahme, im Implementierungsplan zu
  verifizieren:** Die Objekttyp-Kategorie "Mehrfamilienhaus" (Wert 4) ist
  laut ZVG-Portal-Kategorisierung von "Zweifamilienhaus" (Wert 19) und
  "Einfamilienhaus" (Wert 3) abgegrenzt, was nahelegt, dass sie selbst
  schon ≥3 Einheiten bedeutet. Bekanntmachungstexte nennen aber selten
  eine exakte Einheitenzahl. Vorgeschlagener Default: bei fehlender
  expliziter Zahl im Text `units = 3, unitsConfident = false` (Kategorie-
  Minimum, nicht raten) ansetzen, damit Objekte nicht pauschal
  rausfallen; wird im Text eine höhere Zahl genannt, hat die geparste Zahl
  Vorrang. **Nutzer bitte beim Spec-Review bestätigen oder korrigieren.**

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

## Benachrichtigung

Neuer Telegram-Formatter für ZVG-Treffer (Gericht, Termin, Verkehrswert,
Aktenzeichen statt "online seit"/Kaufpreis-Änderung); gleicher
`notifications`-Log-Mechanismus wie Plan 1 zur Duplikat-Vermeidung.

## Cron

Läuft im bestehenden 3h-GitHub-Actions-Workflow mit (kein eigener
Zeitplan) — Nutzerentscheidung trotz seltenerer Änderungsfrequenz von
ZVG-Terminen, zugunsten weniger Infrastruktur.

## Testing

Wie Plan 1: `list.test.ts`/`detail.test.ts` gegen lokal gespeicherte
HTML-Fixtures (Suchseite bereits vorhanden, Ergebnis-/Detailseiten-Fixture
folgt aus dem ersten Playwright-Spike).

## Offene technische Setup-/Validierungs-Schritte (Teil des Implementierungsplans)

- Verifizieren, ob "-- Alle Amtsgerichte --" serverseitig kombinierte
  Ergebnisse liefert (s.o.), sonst Fallback auf Einzel-Amtsgericht-Loop.
- Playwright-Spike: Suchformular einmal live ausfüllen, echte Ergebnis-
  und Detailseiten-HTML als Test-Fixtures sichern.
- Einheiten-Default-Annahme (s.o.) mit Nutzer beim Spec-Review final
  bestätigen.

## Bewusst nicht enthalten (YAGNI)

- Gebots-Schätzformel (Verkehrswert × Annahmefaktor) für die Kennzahlen.
- Eigener Cron-Zeitplan für ZVG-Portal.
- Aktive Schwärzung/Filterung von Personendaten im Volltext (nur
  Zugriffs-/Weiterverbreitungs-Beschränkung).
- Einzel-Amtsgericht-Iteration als Standardweg (nur Fallback, falls die
  Sammel-Option nicht funktioniert).
