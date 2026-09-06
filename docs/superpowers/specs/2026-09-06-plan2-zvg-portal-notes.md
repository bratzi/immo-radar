# Plan 2 (ZVG-Portal) — Zwischenstand / Übergabe-Notiz

Datum: 2026-09-06
Status: **Brainstorming läuft noch, NICHT abgeschlossen.** Diese Datei ist kein
fertiges Design-Dokument, sondern eine Übergabe-Notiz mit allen bisher
recherchierten Fakten und getroffenen Entscheidungen, damit eine neue Session
hier nahtlos weitermachen kann, ohne die Recherche zu wiederholen.

## Kontext

Plan 1 (Foundation, Immowelt) ist fertig, reviewt, gemerged und läuft live
(siehe `docs/superpowers/plans/2026-09-05-foundation.md` und
`docs/superpowers/specs/2026-09-05-immo-radar-design.md`). Plan 2 sollte
ursprünglich "die nächste Plattform" abdecken. Der Nutzer entschied sich
bewusst für **ZVG-Portal (Zwangsversteigerungen)** statt der ursprünglich
empfohlenen, einfacheren Option Immonet — trotz zweier expliziter
Rückfragen zu Mehraufwand/Risiko, die der Nutzer beide bewusst bestätigt hat
(siehe "Bereits getroffene Entscheidungen" unten).

## Bereits getroffene Entscheidungen (nicht erneut abfragen)

1. **Plattform:** ZVG-Portal (zvg-portal.de, Justizportal des Bundes und der
   Länder), nicht Immonet/ImmoScout24/etc.
2. **robots.txt bewusst ignoriert für diese Quelle:** Der Nutzer wurde
   explizit auf den Unterschied zu Immowelt hingewiesen (Behördenseite,
   Daten Dritter in finanzieller Notlage, robots.txt sperrt genau die
   Endpunkte für Termin-Details) und hat sich nach diesem Kontext bewusst
   für die Nutzung entschieden ("Ja, trotzdem ZVG-Portal - bewusste
   Entscheidung"). Trotzdem gilt: **nur lesend, keine Weiterverbreitung,
   keine Speicherung von Personendaten Dritter über das für die
   Kaufentscheidung Notwendige hinaus** (kein Schuldner-Name etc., falls
   in einer Terminbekanntmachung überhaupt vorhanden).
3. **Playwright akzeptiert:** Der Nutzer wurde auf den wahrscheinlich
   nötigen Mehraufwand (sitzungsbasierte, JavaScript-gesteuerte
   Formular-Navigation statt einfacher GET-Requests wie bei Immowelt)
   hingewiesen und hat sich bewusst dafür entschieden ("Trotzdem
   ZVG-Portal, mit Playwright").
4. **Umfang: bundesweit, alle 16 Bundesländer/Amtsgerichte**, keine
   Teilmenge zum Start (konsistent mit der bundesweiten Entscheidung aus
   Plan 1).

## Technische Recherche-Ergebnisse (verifiziert 2026-09-06)

### robots.txt (https://www.zvg-portal.de/robots.txt)

```
User-agent: *
Disallow: /gerichte/
Disallow: /templates/template.internet.showZvg.php
Disallow: /templates/template.internet.showAnhang.php
Disallow: /templates/template.internet.showAll.php
Disallow: /index.php?button=showAnhang*
Disallow: /index.php?button=showZvg*
```

- `/gerichte/` (bare Verzeichnis-Listing) liefert serverseitig **HTTP 403**
  (kein robots.txt-Zusammenhang, vermutlich einfach kein Directory-Index
  aktiviert — sagt nichts über einzelne Dateipfade darunter aus, die nicht
  getestet wurden).
- `index.php?button=showZvg` und `index.php?button=showAll` liefern
  serverseitig **HTTP 200** (nur robots.txt-Konvention, keine technische
  Zugriffssperre) — ABER ohne vorherige Sitzungs-/Formular-Interaktion
  zeigen sie nur den generischen Startseiten-Text, keine echten
  Ergebnisse. Die Suche ist **sitzungsbasiert**.

### Echter Sucheinstieg: "Termine suchen"

- URL: `https://www.zvg-portal.de/index.php?button=Termine%20suchen`
  (Leerzeichen im button-Parameter URL-kodieren).
- Formular: `<FORM name=globe method=post action="index.php?button=Suchen"
  onsubmit="return checkFormular();">` — **POST**, nicht GET.
- Objekt-Feld: `<input name=obj>` (freie Objektbeschreibung) PLUS
  `<select name="obj_arr[]" multiple>` (das per POST gesendete Feld) —
  im rohen HTML **leer**, wird per JavaScript über `insertObj()`/
  `deleteObj()` befüllt.
- **Objekttyp-Quelle GEFUNDEN (verifiziert 2026-09-06 per curl):** eine
  zweite, sichtbare `<select id=obj_liste name=obj_liste multiple>`
  enthält die auswählbaren Kategorien als statische `<option
  value=N>Text</option>`-Liste, u.a. `value=4` **Mehrfamilienhaus** und
  `value=13` Wohn-/Geschäftshaus (Randfall, gemischt genutzt — evtl.
  mit einschließen). `insertObj()` kopiert das markierte `<option>`
  1:1 (gleicher `value`, gleicher Text) in `obj_arr[]`. **Serverseitige
  Filterung ist damit möglich**: POST einfach direkt mit
  `obj_arr[]=4` (ggf. zusätzlich `obj_arr[]=13`) senden, ohne
  `insertObj()` nachzubauen oder alles zu holen und client-seitig zu
  filtern (anders als bei Immowelt). Volle Objekttyp-Liste (15
  Kategorien, Werte 1–15 und 19) steht ab Zeile 352 in der geholten
  HTML — bei Bedarf erneut per curl ziehen.
- Datumsbereich-Felder vermutlich ebenfalls im Formular vorhanden (noch
  nicht im Detail durchgesehen).

### Bundesland/Amtsgericht-Zuordnung — GROSSER FUND, kein Playwright nötig dafür

Auf der "Termine suchen"-Seite ist ein **vollständiges, statisches
JavaScript-Array** eingebettet, das alle 16 Bundesländer auf ihre
Amtsgerichte UND eine eindeutige Gerichts-ID mapped:

```js
var BundeslandArray=new Array(16);
var BundeslandArrayId=new Array(16);
BundeslandArray['0']=new Array('-- Alle Amtsgerichte --');
BundeslandArray['bw']=new Array('Biberach','Calw', ... );
BundeslandArrayId['bw']=new Array('B2402','B2701', ... );
BundeslandArray['by']=new Array('Amberg','Ansbach', ...);
BundeslandArrayId['by']=new Array('D3101','D3201', ...);
// ... usw. für alle 16 Bundesland-Kürzel: bw, by, be, br, hb, hh, he, mv,
// ni, nw, rp, sl, sn, st, sh, th
```

Das lässt sich **direkt per Text-Parsing aus dem statischen HTML
extrahieren** (kein Playwright, kein AJAX) — analog zum PLZ→Bundesland-
Ansatz aus Plan 1 (GeoNames-Datei). Jedes Bundesland hat auch eine
"-- Alle Amtsgerichte --"-Sammel-Option (id `'0'`), was die bundesweite
Abdeckung erheblich vereinfachen könnte (ggf. reicht ein Request pro
Bundesland mit der Alle-Option statt pro einzelnem Amtsgericht — noch zu
verifizieren, ob das serverseitig tatsächlich funktioniert).

Interessant: Hamburg (`hh`) und Mecklenburg-Vorpommern (`mv`) haben laut
diesem Array **keine** teilnehmenden Amtsgerichte gelistet (leere Arrays)
— eventuell nehmen diese Länder nicht am Portal teil oder veröffentlichen
anderswo.

### Warum Playwright trotzdem wahrscheinlich nötig ist

- Die Suche ist POST-basiert mit clientseitig durch JavaScript
  zusammengebautem Formular-State (`obj_arr[]` als Multi-Select-Liste,
  befüllt durch `insertObj()`). Das exakte POST-Body-Format wurde noch
  nicht reverse-engineered.
- Playwright kann das Formular einfach wie ein Mensch ausfüllen und
  absenden, ohne das exakte Backend-Protokoll zu kennen — pragmatischer
  Ansatz, den der Nutzer bereits akzeptiert hat.
- Browser-Zugriff (mcp**browser**\*) wurde in dieser Session zweimal vom
  Nutzer abgelehnt (Permission denied) — die interaktive Live-Erkundung
  des Formular-Ablaufs (Bundesland auswählen → Ergebnis ansehen) steht
  noch aus und muss in einer neuen Session nachgeholt werden (entweder
  per Playwright/Browser mit Erlaubnis, oder weiter per curl/manuellem
  POST-Body-Reverse-Engineering).

## Offene Punkte für die nächste Session (Brainstorming fortsetzen)

Diese Fragen wurden noch NICHT gestellt/beantwortet:

1. ~~Objekttyp-Filterung~~ — **erledigt, s.o.:** `obj_arr[]=4`
   (Mehrfamilienhaus) serverseitig, kein Playwright/Reverse-Engineering
   dafür nötig.
2. **Datenmodell-Unterschiede zu Immowelt:** ZVG-Termine haben andere
   Kernfelder als Verkaufsinserate — kein Angebotspreis, sondern
   **Verkehrswert** (gerichtlich festgestellter Wert) und ein
   **Versteigerungstermin** (Datum/Uhrzeit/Ort statt "online seit").
   Braucht eigene Kennzahlen-Überlegung: ist der Verkehrswert die Basis
   für Kaufpreisfaktor/DSCR, oder das erwartete Gebot (oft niedriger)?
   Muss mit dem Nutzer geklärt werden.
3. **Personendaten-Policy konkret:** Welche Felder aus einer
   Terminbekanntmachung dürfen gespeichert werden (Aktenzeichen,
   Objektbeschreibung, Verkehrswert, Termin, Gericht) und welche explizit
   NICHT (Schuldner-Name/Adresse, falls vorhanden)? Noch nicht mit dem
   Nutzer final abgestimmt, nur die generelle Richtung ("minimal, nur
   Kaufentscheidungs-relevant") ist klar.
4. **Cron-Verhältnis zu Immowelt:** Eigener Workflow/eigener Zeitplan, oder
   in denselben 3h-Lauf integriert? ZVG-Termine ändern sich vermutlich
   seltener als Verkaufsinserate (neue Termine werden typischerweise
   Wochen im Voraus veröffentlicht) — evtl. reicht ein selteneres Intervall
   (z.B. täglich), was auch das GitHub-Actions-Minutenbudget schont.
5. **Datenbank-Schema-Erweiterung:** Neue Tabelle(n) oder Wiederverwendung
   von `listings`/`listing_versions` mit `source='zvg-portal'` und
   zusätzlichen nullable Feldern für Termin-Datum/Verkehrswert? Passt das
   bestehende Schema, oder braucht es eine Migration?

## Wie eine neue Session hier weitermacht

1. Diese Datei lesen (bereits geschehen, wenn du das liest).
2. Mit den "Offenen Punkten" oben weiterfragen (Brainstorming-Skill,
   architektonischer Pfad, wir sind mitten in "Ask clarifying questions").
3. Für die Bundesland/Gericht-Reconnaissance: die Seite
   `https://www.zvg-portal.de/index.php?button=Termine%20suchen` erneut
   per curl holen (funktioniert mit normalem Browser-User-Agent, kein
   Playwright nötig für diesen Teil) und das `BundeslandArray`/
   `BundeslandArrayId`-JavaScript wie oben beschrieben parsen.
4. Für den echten POST-Suchablauf: entweder Nutzer nochmal um
   Browser-Erlaubnis bitten (mcp**browser**\*-Tools), oder den POST-Body
   durch Ausprobieren verschiedener Feldkombinationen per curl
   reverse-engineeren.
