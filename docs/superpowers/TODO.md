# immo-radar — Überblick und To-do-Liste

**Stand:** 2026-09-07, 23:30 Uhr. Belegt durch Abfrage der Produktionsdatenbank
und `git log`, nicht aus dem Gedächtnis.

Dieses Dokument ist die **Landkarte**: was es gibt, was fehlt, was als Nächstes
dran ist. Die Detailbegründungen und die Fallen stehen in
[`UEBERGABE.md`](UEBERGABE.md) — hier steht nur, wo wir sind.

---

## Das Ganze in vier Zeilen

| Baustein | Zustand |
|---|---|
| **Betrieb** (Scraper, Cron, Telegram) | **läuft**, alle 3 h, zuletzt 23:17 Uhr |
| **Teilprojekt 1** — Vollständige Erfassung & Bestandsführung | **gemergt und live**, ein Punkt noch nicht live geprüft |
| **Teilprojekt 2** — Mietqualität | **nicht begonnen**, Tabelle `rent_estimates` ist leer und wird von keinem Code gelesen |
| **Teilprojekt 3** — Dashboard / Webseite | **nicht begonnen**, kein einziges Frontend-File im Repo |

Die Webseite steht also nicht — und sie hat auch noch nie angefangen. Es gibt
bisher nur den Scraper und Telegram als Ausgabe.

---

## Belegter Ist-Zustand

Abfrage der Datenbank am 2026-09-07 um 23:26 Uhr:

```
listings immowelt:   157   (disappeared_at gesetzt: 0)
listings zvg-portal: 187   (disappeared_at gesetzt: 1)
listing_versions:   1661
notifications:       156
rent_estimates:        0   <- leer
```

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

## Warnung: der Anschluss ist am 2026-09-08 erneut ausgefallen

Sechs Einzelläufe kurz hintereinander haben denselben Schaden angerichtet wie
der bundesweite Lauf davor: `ERR_NAME_NOT_RESOLVED`, und `nslookup example.com`
lief ebenfalls in Timeouts — der Router-Resolver war überlastet, nicht
Immowelt gesperrt. Eine Immowelt-Ergebnisseite ist **kein** einzelner Abruf;
die SPA feuert pro Seite Dutzende XHRs.

**Regel:** ein Live-Lauf, dann auswerten. Mehrere Hypothesen gehören in
**einen** Lauf, nicht in mehrere.

## Die To-do-Liste, in dieser Reihenfolge

### 1. Immowelt-Pagination — der Blockierer ist identifiziert, aber nicht besiegt

**Stand 2026-09-08.** Der Sweep bricht seit jeher nach **zwei** Ergebnisseiten
je Region ab. Das wurde nacheinander als kaputte Pagination, als
DataDome-Block und als Cookie-Overlay gedeutet. Gemessen an der echten Seite
ist es keins davon:

```
ELEMENT <div class="css-1lcifqp">   fixed, 1265x720, pointer-events: auto
  TEXT:  "Beschleunige deine Suche mit einem Suchauftrag ... E-Mail ..."
  KNOPF: aria-label="Schließen"
  KNOPF: "Suchauftrag speichern"
         data-testid="av-ssab-Modal-secondPageModal-submit"
```

Immowelts eigener Suchauftrag-/Newsletter-Dialog. Sein Testid sagt, wann er
kommt: `secondPageModal` — beim Wechsel auf Seite 2. Seine Klassennamen werden
bei jedem Rendern neu erzeugt (`css-8g8ihq`, `css-5h5f1k`, `css-1lcifqp` für
dasselbe Ding), ein Klassen-Selektor ist deshalb wertlos. Stabil sind die
Rolle `dialog` und `aria-label="Schließen"`.

**Was daraufhin behoben wurde (mit Tests, live bestätigt):**

- `scrapers/overlays.ts` schließt den Dialog. Live belegt: *„Stoerende
  Ueberlagerung geschlossen ueber `[role="dialog"] button[aria-label="Schließen"]`"*.
  Er wird **geschlossen, nicht bedient** — sein Absenden-Knopf würde einen
  Suchauftrag im Namen des Nutzers anlegen.
- `bestaetigeConsentBanner` teilte sein Zeitbudget auf **sieben** Kandidaten
  auf. Live gemessen erscheint der einzig passende Knopf
  (`[data-testid="uc-accept-all-button"]`, Beschriftung **„OK"**) erst nach
  ~8 s; nach 3 s ist der Shadow Root leer. Von 10 s bekam er ein Siebtel —
  ~1,4 s — und wurde nie lange genug abgewartet. Jetzt wird **einmal** auf
  alle Kandidaten gleichzeitig gewartet (`Locator.or`), mit dem ganzen Budget.
  Seither gelingt die Zustimmung im ersten Anlauf.

**Was trotzdem nicht funktioniert:** Bremen liefert weiterhin **80 von 209**
Objekten. Die Schleife zählt „5 Seiten", sammelt aber nur zwei verschiedene
ein — ab Seite 2 wird dieselbe Seite wieder und wieder gelesen, und die
Duplikate fallen über die `externalId` zusammen.

### 2. Die offene Architekturfrage — erst beantworten, dann weiterbauen

Drei Fixversuche haben die Pagination nicht über Seite 2 hinaus gebracht. Das
ist der Punkt, an dem nicht ein vierter Versuch drangehört, sondern eine
Entscheidung.

**Verdacht, noch unbelegt:** Der Klick auf „nächste Seite" ist ab Seite 2
keine echte Navigation mehr, sondern ein XHR der SPA — und genau den weist
DataDome ab. Der Knopf wird also erfolgreich geklickt, die Anfrage läuft ins
Leere, die Liste bleibt stehen. Dazu passt der alte Befund in
[`specs/2026-09-07-immowelt-sitemap-befund.md`](specs/2026-09-07-immowelt-sitemap-befund.md):
`GET 403 /classified-search?…&page=2` und `POST 403 /serp-bff/search`.

Trifft das zu, dann war der Sitemap-Weg die ganze Zeit richtig — nur aus
einem anderen Grund als dort beschrieben, und die Grenze liegt nicht bei
Seite 1, sondern bei Seite 2.

**Wie es zu belegen wäre:** ein Lauf, der beim steckengebliebenen Klick den
Netzwerkverkehr mitschneidet. Das Skript dafür steht
(`scripts/diagnose-overlays.mts` schneidet bereits mit); der Lauf kam nicht
mehr zustande, weil der Anschluss ausfiel (siehe unten).

**Zwei Wege stehen dann zur Wahl:**

1. **Sitemap-Umbau** — 8.901 Ortsseiten, je eine Seite, kein Blättern nötig.
   Braucht Caching, Rotation über den Tag und eine Fundort-Spalte.
2. **Bei zwei Seiten je Region bleiben** und akzeptieren, dass Immowelt nur
   Kandidaten liefert und niemals löscht (heutiger Zustand, sicher, aber
   unvollständig).

**Zwingend zuerst zu klären, unabhängig vom Weg:** Ein weiterer Defekt ist
belegt, aber noch nicht behoben — `blaettereWeiter` wertet „der Klick hat
keine Ausnahme geworfen" als Erfolg. Das ist nachweislich falsch: fünf
„erfolgreiche" Klicks, zwei tatsächliche Seiten. Das Erfolgskriterium muss
die **tatsächliche Änderung der Ergebnisliste** sein. Solange das so bleibt,
meldet der Sweep Seitenzahlen, die es nicht gab.

### 3. Determinismus-Nachweis — für ZVG erledigt

Fünf Läufe mit identisch 188 Objekten (siehe oben). Für Immowelt ist ein
solcher Nachweis **bauartbedingt nicht zu erwarten**: jeder Lauf grast eine
andere rotierende Zeitscheibe ab, die Schwankung 562–726 ist genau das
gewollte Verhalten, kein Fehler.

Offen bleibt nur: Ein ZVG-Lauf (19:42) meldete `vollstaendig: false`. Einmalig
oder wiederkehrend? Beobachten, nicht sofort reparieren.

### 4. Immowelt-Löschhoheit — Entscheidung nötig, nicht sofort Code

Heute löscht nur ZVG. Damit Immowelt es auch darf, braucht `listings` eine
**Fundort-Spalte**: ZVG trägt sein Bundesland in der `externalId`
(`sn-40908`), Immowelts UUID verrät nichts.

Vorher ist aber eine Frage zu klären, die noch offen ist: In
[`specs/2026-09-07-immowelt-sitemap-befund.md`](specs/2026-09-07-immowelt-sitemap-befund.md)
steht, Blättern sei durch DataDome unmöglich und man müsse auf 8.901
Sitemap-Orte umbauen. Diese Diagnose stammt aus der Zeit **vor** dem
Consent-Fund — und der Consent-Fund hat gezeigt, dass die Pagination am
Cookie-Overlay hing, nicht am Anti-Bot-System. Nach dem Zustimmen blätterte
Bremen (42 → 84 Objekte).

**Der Sitemap-Umbau ist also womöglich gar nicht nötig.** To-do 1 entscheidet
das. Erst danach lohnt sich hier ein Plan.

### 5. Teilprojekt 2 — Mietqualität

Der Kern des Ertragsmodells steht auf der schwächsten Stelle: Fehlt eine
angegebene Miete, schätzt [`lib/rentEstimate.ts`](../../scraper/lib/rentEstimate.ts)
aus einer **handrecherchierten Tabelle** von 95 Zweistellern. Die Tabelle
`rent_estimates` ist im Schema angelegt, **leer**, und wird von keiner Zeile
Code gelesen oder geschrieben.

Aufgabe: aus echten Beobachtungen einen Mietkorpus aufbauen (`rent_estimates`
als Korpus, dazu die ZVG-Mieternte aus den Gutachtentexten) und die
Schätzung darauf umstellen. Braucht ein eigenes Brainstorming.

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
