# immo-radar — Überblick und To-do-Liste

**Stand:** 2026-09-08, 11:15 UTC. Belegt durch Abfrage der Produktionsdatenbank
und `git log`, nicht aus dem Gedächtnis.

> **Ausfuehrbare Aufgabenliste:** [BACKLOG.md](BACKLOG.md) - Teil A ist so
> geschnitten, dass Subagenten es ohne Vorwissen abarbeiten koennen.

Dieses Dokument ist die **Landkarte**: was es gibt, was fehlt, was als Nächstes
dran ist. Die Detailbegründungen und die Fallen stehen in
[`UEBERGABE.md`](UEBERGABE.md) — hier steht nur, wo wir sind.

---

## Das Ganze in vier Zeilen

| Baustein | Zustand |
|---|---|
| **Betrieb** (Scraper, Cron, Telegram) | **läuft**, alle 3 h, zuletzt 23:17 Uhr |
| **Teilprojekt 1** — Vollständige Erfassung & Bestandsführung | **gemergt und live**, in Produktion bestätigt (Lauf `34215003141`) |
| **Teilprojekt 2** — Mietqualität | **nicht begonnen**, Tabelle `rent_estimates` ist leer und wird von keinem Code gelesen |
| **Teilprojekt 3** — Dashboard / Webseite | **nicht begonnen**, kein einziges Frontend-File im Repo |

Die Webseite steht also nicht — und sie hat auch noch nie angefangen. Es gibt
bisher nur den Scraper und Telegram als Ausgabe.

---

## Belegter Ist-Zustand

Abfrage der Datenbank am 2026-09-08 um 11:15 UTC, nach Lauf `34215003141`:

```
listings immowelt:   754   (disappeared_at gesetzt: 0, davon 597 mit fundort)
listings zvg-portal: 191   (disappeared_at gesetzt: 1)
listing_versions:   2262
notifications:       181
rent_estimates:        0   <- leer, siehe Mietqualitaets-Befund
```

Der Sprung bei Immowelt (157 → 754) ist der erste Lauf, der aus der
**Ergebnisliste** bewertet statt aus den gesperrten Detailseiten.

Die letzten Sweeps:

```
23:17  zvg-portal  gesehen=188  vollst=true   bereich=11
23:04  immowelt    gesehen=562  gemeldet=0    vollst=false
19:42  zvg-portal  gesehen=188  vollst=false  bereich=11
19:28  immowelt    gesehen=680  gemeldet=0    vollst=false
18:45  zvg-portal  gesehen=188  vollst=true   bereich=16
17:55  immowelt    gesehen=726  gemeldet=0    vollst=false
14:56  zvg-portal  gesehen=188  vollst=true   bereich=16
14:43  immowelt    gesehen=640  gemeldet=-    vollst=false
```

Drei Dinge lassen sich daraus direkt ablesen:

- **Der Cron arbeitet zuverlässig.** Läufe im 3-Stunden-Takt, der letzte vor
  wenigen Minuten.
- **ZVG ist deterministisch.** Fünf Läufe hintereinander exakt 188 Objekte.
  Das ist der Nachweis, den offener Punkt 2 der Übergabe verlangt hat — für
  ZVG ist er damit erbracht.
- **Bei Immowelt steht seit 17:55 Uhr `gemeldet=0`,** davor stand dort `-`
  (null). Das ist neu und passt zu keinem gesunden Lauf: 562 eingesammelte
  Objekte und gleichzeitig „das Portal weist 0 Angebote aus" widersprechen
  sich. Siehe To-do 2.

---

## In der Sitzung vom 2026-09-08 behoben

- **Fail-open in der Trefferzahl.** `gemeldete_treffer` stand in `sweep_runs`
  auf `0` neben 562 eingesammelten Objekten. Ursache: Eine Region, die mit
  einer Ausnahme abbrach, trug 0 zur Summe bei, **ohne die Summe als
  unbrauchbar zu markieren** — die beiden Zähler im Sweep wurden im
  `catch`-Zweig schlicht nicht angefasst. Ersetzt durch `gemeldeteTrefferSumme`
  (fail-closed: ein Fehler oder eine fehlende Zahl ⇒ `null`, und null Regionen
  ergeben `null` statt `0`). Dieselbe Bauart hatte das Review schon einmal als
  teuersten Fehler des Plans gefunden.
- **Consent-Budget.** Siehe To-do 1.
- **Suchauftrag-Dialog.** Siehe To-do 1.

Tests: 229 → 242, alle grün. `tsc --noEmit` sauber. Neu sind echte
Browser-Tests gegen selbst gebaute Fixtures (`scrapers/consent.test.ts`,
`scrapers/overlays.test.ts`) — sie laufen nie gegen Immowelt.

Neu ist außerdem `scripts/pruefe-region.mts`: prüft **eine** Region gegen die
echte Seite, ohne Datenbank und ohne Meldungen. Es existiert, damit nie wieder
versehentlich ein bundesweiter Lauf lokal startet.

## Produktionsbestätigung der Pagination — bestanden

Lauf #14 (2026-09-08, 08:15 UTC, sha `8fbb877`):

```
08:15  immowelt  gesehen=3665  gemeldet=3818  vollst=false  bereich=4
07:43  immowelt  gesehen= 717  gemeldet=   -  vollst=false  bereich=0   <- alter Code
```

**3.665 statt 717 Objekte, Faktor 5,1.** 3.665 von 3.818 ausgewiesenen
Treffern sind 96 % — die vier abgearbeiteten Bundesländer wurden praktisch
vollständig erfasst. `geltungsbereich` ist erstmals gefüllt, und
`gemeldete_treffer` ist nach dem Fail-closed-Umbau ein echter Wert statt `0`.

`sweep_region_runs` trägt die ersten vier Zeilen (`br` 1099/1134, `st`
927/983, `th` 881/917, `sl` 766/784), alle als `vollstaendig: true`.

## Bewertung aus der Ergebnisliste — bestanden

Lauf `34215003141` (2026-09-08, 10:21–11:11 UTC, sha `782d0da`) ist der erste
mit dem Listen-Umbau. Damit ist A1 geschlossen:

```
Immowelt-Sweep: 9329 Mehrfamilienhaus-Kandidaten (7 von 16 Regionen).
Immowelt: 597 von 9329 aus der Ergebnisliste bewertet, 3 ohne Preis.
Meldungen: 25 von hoechstens 25 gesendet, 293 zurueckgestellt.
```

`listings` für Immowelt 157 → **754**, `fundort` 0 → **597**. Die Meldebremse
aus `782d0da` greift: 25 statt 318 Nachrichten.

## Was die Prüfung von A1 ausgelöst hat

Vier weitere Punkte, drei davon inzwischen behoben. Einzelheiten in
[`BACKLOG.md`](BACKLOG.md):

| Punkt | Befund | Stand |
|---|---|---|
| A6 | Der ZVG-Parser liest richtig — die **Quelle** nennt in 3 von 194 Fällen (1,5 %) keine Zahl, immer dieselben drei | widerlegt; Umgang mit dem Fehlen offen |
| A7a | `SWEEP_BUDGET_MS` rechnet mit 5 s je Seite, gemessen sind 8,7–11,5 | offen |
| A7b | Bewertungsfenster 600 breit, wanderte 3 je Lauf → `nw` bräuchte **287 Tage** | behoben |
| A8 | `,--` fiel aus `BETRAG_PATTERN`: 160.000 statt 282.000 € gespeichert | behoben |
| A9 | `topTreffer` prüfte nur nach oben — zwei Falschmeldungen mit 571 % Rendite | behoben |

**A9 ist der Punkt, der den Nutzer erreicht hat.** 19 der 186 gemeldeten
Objekte tragen einen Wert unter 25.000 €; zwei gingen mit falschen Preisen als
`top_treffer` raus. Je kaputter die Zahl, desto besser sah das Objekt aus.

## Warnung: der Anschluss ist am 2026-09-08 erneut ausgefallen

Sechs Einzelläufe kurz hintereinander haben denselben Schaden angerichtet wie
der bundesweite Lauf davor: `ERR_NAME_NOT_RESOLVED`, und `nslookup example.com`
lief ebenfalls in Timeouts — der Router-Resolver war überlastet, nicht
Immowelt gesperrt. Eine Immowelt-Ergebnisseite ist **kein** einzelner Abruf;
die SPA feuert pro Seite Dutzende XHRs.

**Regel:** ein Live-Lauf, dann auswerten. Mehrere Hypothesen gehören in
**einen** Lauf, nicht in mehrere.

## Die To-do-Liste, in dieser Reihenfolge

### 1. Immowelt-Pagination — GELÖST und live bestätigt

**Bremen liefert 201 von 209 Objekten** (Lauf vom 2026-09-08, 75 s, fünf
Seiten). Vorher waren es 80, davor 42. `istRegionVollstaendig(201, 209)` ist
damit erfüllt.

Der Sweep brach seit jeher nach zwei Ergebnisseiten je Region ab. Das wurde
nacheinander als kaputte Pagination, als DataDome-Block und als Cookie-Overlay
gedeutet. Es war **keins davon**, sondern drei zusammenwirkende Fehler:

**a) Immowelts eigene Werbe-Überlagerungen** fangen die Blätter-Klicks ab —
mindestens zwei verschiedene, gestapelt:

```
<div class="css-1lcifqp">  fixed, 1265x720, pointer-events: auto
  role=-  aria-modal=-  data-testid=-        <- KEINE Dialog-Rolle
  "Beschleunige deine Suche mit einem Suchauftrag ..."
  KNOPF aria-label="Schließen"
  KNOPF data-testid="av-ssab-Modal-secondPageModal-submit"
```

`secondPageModal` sagt es wörtlich: der Dialog kommt beim Wechsel auf Seite 2.
Die zweite Bauart schließt nur über ein **„x" oben links**, ohne `aria-label`.
Klassennamen werden bei jedem Rendern neu erzeugt (`css-8g8ihq`, `css-5h5f1k`,
`css-1lcifqp` für dasselbe Element) — kein Selektor darf daran hängen.

`scrapers/overlays.ts` sucht deshalb über die **Geometrie**: Ein „x" zählt nur,
wenn sein Vorfahr fest positioniert ist *und* mindestens ein Viertel des
Sichtfensters überdeckt. Ein Test hält fest, dass ein „x" im normalen
Seiteninhalt dadurch nicht geklickt wird. Die Dialoge werden **geschlossen,
nicht bedient** — ihre Absenden-Knöpfe legen einen Suchauftrag an bzw. melden
an; auch dafür gibt es einen Test.

**b) Das Consent-Budget** wurde auf sieben Kandidaten aufgeteilt. Der einzig
passende Knopf (`[data-testid="uc-accept-all-button"]`, Beschriftung **„OK"**)
erscheint erst nach ~8 s, bekam davon aber ein Siebtel — ~1,4 s. Jetzt wird
einmal auf alle Kandidaten gleichzeitig gewartet (`Locator.or`), mit dem
ganzen Budget.

**c) Das Erfolgskriterium war falsch.** `blaettereWeiter` wertete „der Klick
hat keine Ausnahme geworfen" als Erfolg. Live widerlegt: fünf Klicks gingen
durch, während die Liste stehenblieb — dieselbe Seite wurde wieder und wieder
gelesen und über die `externalId` wegdedupliziert. Erfolg ist jetzt, dass die
erste Ergebniskarte danach eine **andere** ist.

### 2. Der Sitemap-Umbau ist nicht nötig

Derselbe Lauf hat mitprotokolliert:

```
200  https://www.immowelt.de/serp-bff/search
200  https://www.immowelt.de/classified-search?distributionTypes=Buy,Buy_Auction,...
```

**HTTP 200, kein 403.** Die Annahme in
[`specs/2026-09-07-immowelt-sitemap-befund.md`](specs/2026-09-07-immowelt-sitemap-befund.md),
Blättern sei ohne Umgehung eines Anti-Bot-Systems unmöglich, beschreibt nicht
die heutige Lage. Der Befund war eine Fehldiagnose der Overlay-Blockade. Der
Umbau auf 8.901 Sitemap-Orte entfällt damit als Notwendigkeit.

**Was dadurch neu zu bedenken ist:**

- Der Sweep sieht jetzt ein Vielfaches an Objekten (Bremen allein 201 statt
  42). `SWEEP_BUDGET_MS` (12 min) begrenzt weiterhin, wie viele Bundesländer
  ein Lauf schafft — es werden deutlich weniger je Lauf sein, der volle Kreis
  dauert länger. Das ist gewollt.
- Die Zahlen in `sweep_runs.gesehene_objekte` springen dadurch stark. Für
  Löschungen ist das ungefährlich: Immowelt meldet weiterhin
  `vollstaendig: false` und autorisiert keine.
- Keine Meldungsflut: Detailabrufe sind auf `DETAIL_BUDGET_MS /
  IMMOWELT_VERZOEGERUNG_MS = 144` je Lauf gedeckelt, und ohne Details keine
  Meldung.
- Die **Fundort-Spalte** bleibt die Voraussetzung dafür, dass Immowelt
  überhaupt löschen darf (siehe To-do 4).

### 3. Determinismus-Nachweis — für ZVG erledigt

Fünf Läufe mit identisch 188 Objekten (siehe oben). Für Immowelt ist ein
solcher Nachweis **bauartbedingt nicht zu erwarten**: jeder Lauf grast eine
andere rotierende Zeitscheibe ab, die Schwankung 562–726 ist genau das
gewollte Verhalten, kein Fehler.

Offen bleibt nur: Ein ZVG-Lauf (19:42) meldete `vollstaendig: false`. Einmalig
oder wiederkehrend? Beobachten, nicht sofort reparieren.

### 4. Immowelt-Löschhoheit — Phase 1 erledigt, Phase 2 wartet auf Historie

**Warum es zwei Phasen sind:** Die Mengenprüfung verlangt
`MIN_REFERENZLAEUFE = 3`. Eine Region darf erst löschen, wenn sie drei eigene
erfolgreiche Läufe als Maßstab hat. Der Umbau kann also gar nicht wirken,
bevor die Daten aufgelaufen sind.

**Phase 1 (erledigt, 2026-09-08).** Der Fundort wird mitgeschrieben:

- `listings.fundort` hält fest, auf welcher Regionsliste ein Objekt gefunden
  wurde. `null` heißt „nicht zuzuordnen" (Altbestand, ZVG) — und
  Unzuordenbares ist nie ein Abgang.
- `sweep_region_runs` sammelt die Mengenhistorie je Region. Bewusst eine
  eigene Tabelle: `ladeSweepHistorie` bildet den Median über alle Zeilen einer
  Quelle in `sweep_runs` und filtert nur auf `vollstaendig`. Regionszeilen
  dort würden in genau diesen Median einfließen und die Wache verfälschen, die
  vor Massenlöschung schützt.
- `geltungsbereich` wird für Immowelt jetzt gefüllt (bisher bewusst leer).

Die Migration ist gegen die Live-Datenbank gelaufen und nachgeprüft.

**Am Löschverhalten hat sich nichts geändert.** Immowelt meldet weiter
`vollstaendig: false`, und `partitionAusExternalId` liefert für diese Quelle
weiter `null` — zwei unabhängige Sperren stehen.

**Phase 2, wenn die Historie da ist:** Plausibilität je Region statt je
Quelle, `ermittleAbgaenge` über den Fundort verengt. Das berührt genau die
Wachen, die schon einmal beinahe 7.500 Objekte gelöscht hätten — eigener
Entwurf, eigene Freigabe. Frühestens sinnvoll, wenn `sweep_region_runs` für
die betroffenen Regionen drei vollständige Läufe zeigt:

```sql
select partition, count(*) filter (where vollstaendig) as referenzlaeufe
from sweep_region_runs where source = 'immowelt'
group by partition order by referenzlaeufe desc;
```

### 5. Teilprojekt 2 — Mietqualität: neu zugeschnitten, Kern erledigt

**Der ursprüngliche Zuschnitt trägt nicht.** Messung am Bestand (2026-09-08):
Es gibt **zwei** Objekte mit angegebener Miete im gesamten Bestand, und in
442 ZVG-Gutachtentexten steht **null** Mal eine Jahresmiete. Ein Korpus aus
zwei Beobachtungen ist kein Korpus, und die „ZVG-Mieternte" hat keine
Grundlage. Vollständig belegt in
[`specs/2026-09-08-mietqualitaet-befund.md`](specs/2026-09-08-mietqualitaet-befund.md).

**Das eigentliche Problem lag daneben:** 210 der 400 neuesten Versionen haben
keine Wohnfläche. Ohne Fläche rechnet die Schätzung mit 0 m² → Miete 0 →
Rendite 0, und das Objekt sieht aus wie *geprüft und schlecht* statt *nicht
beurteilbar*. Für ein Ranking-Dashboard ist das der gefährlichste Zustand.

**Erledigt:**

- **Wohnflächen geerntet.** 92 Gutachtentexte enthielten „Wohnfl", der Parser
  las daraus null — die Lücke waren Füllwörter (`insgesamt`, `rd.`, `beträgt`,
  `ges.`, `:`). Jetzt eine Whitelist statt `.*?`, damit nie eine
  Grundstücksgröße oder die Fläche einer Einzelwohnung durchrutscht. Alle
  Testfälle sind wörtliche Fundstellen aus echten Gutachten.
- **`wohnflaeche_fehlt`** als ausdrückliche Datenlücke.

**Offen bleibt:** Rund 80 % der Objekte ohne Fläche behalten sie — die Zahl
steht nicht im Text. Und die Regionaltabelle in `lib/rentEstimate.ts` bleibt
95 handrecherchierte, unvalidierte Werte. **Das ist die größte verbleibende
Unsicherheit im Ertragsmodell** und gehört in den Dashboard-Entwurf: Ein
Prüfkandidat mit geschätzter Miete ist etwas anderes als ein Top-Treffer mit
angegebener.

### 6. Teilprojekt 3 — Dashboard / Webseite

**Nichts davon existiert.** Kein Frontend, kein Framework, keine Route. Was es
gibt, ist eine Anforderungssammlung:
[`specs/2026-09-07-plan3-dashboard-anforderungen.md`](specs/2026-09-07-plan3-dashboard-anforderungen.md)
— Ranking statt Liste, Veränderungen sichtbar, Abgänge ausgegraut.

Die Datengrundlage steht bereits vollständig (Kennzahlen je Version,
Historie, `disappeared_at`, Meldehistorie). Was fehlt, sind vier
Entscheidungen, die **vor** jeder Zeile Code fallen müssen:

1. Woraus besteht „lukrativ"? Es gibt heute mehrere Kennzahlen, aber keine
   Rangzahl.
2. Wie stark zählt Unsicherheit — rangiert ein Prüfkandidat mit geschätzter
   Miete gleichberechtigt mit einem Top-Treffer?
3. Welcher Zeitraum gilt als „verändert"?
4. Wer darf das Dashboard sehen? Heute ist alles hinter RLS **ohne Policies**,
   nur der Service-Key kommt an die Daten. Ein Frontend braucht dafür eine
   bewusste Entscheidung.

Frage 1 hängt an Teilprojekt 2: Solange die Miete aus einer Handtabelle
geschätzt wird, rankt das Dashboard nach einer Zahl mit unbekanntem Fehler.
**Deshalb steht 2 vor 3** — nicht aus Ordnungsliebe.

### 7. Kleinkram

- `README.md`, Abschnitt „Betrieb", behauptet der Cron sei „derzeit
  **pausiert**" und müsse nach dem Merge wieder aktiviert werden. Er läuft
  seit heute wieder. Der Absatz ist veraltet und irreführend.

---

## Was bewusst nicht ansteht

- Ein CAPTCHA lösen. Ein CAPTCHA ist ein Messwert für eine zu hohe Abrufrate,
  kein Hindernis. Antwort ist Drosselung.
- Auf headless zurückbauen. Immowelt weist headless Chromium ab; der
  Fenstermodus ist Absicht.
- Bundesweite Läufe über den Hausanschluss. Die gehören in CI.
