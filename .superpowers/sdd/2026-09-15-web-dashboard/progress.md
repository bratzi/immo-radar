# Weboberfläche (Dashboard-Entwurf, Abschnitt 9, Schritte 4 bis 7)

Zweig `sdd/web-dashboard`, abgezweigt von `main` = `6f17725`.
Grundlage: `docs/superpowers/specs/2026-09-15-dashboard-nachtrag-oberflaeche.md`
(N1, N1.1, N2, N3, N5) und `2026-09-09-dashboard-entwurf.md` (1, 3.2–3.9,
4.2–4.4, 6.3, 6.4, 8).

**Harte Anforderungen:** Die Oberfläche liest ausschließlich die
Snapshot-Datei — keine Datenbank, kein Schlüssel, kein Backend (Entwurf 5.3,
N4). `scraper/` wird nur gelesen. Kein Scraper-Lauf.

---

## Die Entwicklungsdatei

Der Snapshot ist git-ignoriert (18,9 MB) und liegt unter
`web/public/dashboard-snapshot.json`. Erzeugt am 2026-09-15 durch einen rein
lesenden Aufruf von `erzeugeSnapshot` (`scraper/lib/snapshotDb.ts`) über ein
Wegwerf-Skript, das danach gelöscht wurde:

```
cd scraper && npx tsx <skript>   # ruft erzeugeSnapshot(sb, {id:null,...}, {...null}, new Date(), ziel)
→ 18.335 Objekte, 19.814.514 Bytes (18,90 MB), 10,3 s
```

Kein Schreibzugriff, kein Netzabruf außer der Supabase-Leseabfrage.

### Die Zahlen, gegen die gebaut wird (gemessen am 2026-09-15, n = 18.335)

Der Auftrag nennt den Stand von 17.754 Objekten; der Bestand ist seither
gewachsen. Gemessen wurde neu:

```
18.335 Objekte        davon 211 ohne Kaufpreis
   242 mit PLZ (1,3 %)   217 ohne Bundesland
   811 Trefferklasse "top"     15.764 "normal"     1.760 "nicht beurteilbar"
 9.265 Zustand "unbestaetigt"  8.583 verfügbar   487 abgängig
     1 Objekt mit belegter Miete (S3)   68 S2   16.506 S1   1.760 S0
 4.089 Schwellenwechsler       30 Preissenkungen      199 ZVG-Termine
```

**Deckungsgrade, die den Entwurf der Filter bestimmt haben:**

| Feld | belegt | Anteil |
|---|---:|---:|
| Wohnfläche | 17.573 | 95,8 % |
| Grundstück | 17.146 | 93,5 % |
| Kaufpreis | 18.124 | 98,8 % |
| **Baujahr** | **58** | **0,3 %** |
| **Einheiten** | **99** | **0,5 %** |

Baujahr und Einheiten stehen in N3 als Filter und sind gegen eine vorhandene
Spalte geprüft — die Spalte ist aber fast leer. Siehe Entscheidung 3.

**Verteilung der Rangzahl (für die Skala des Bandstreifens):**
`rangzahl` min 0,00 · Median 0,70 · P90 1,43 · max 2,40;
`band.oben` P99 3,14 · max 4,00. Relative Bandbreite Median 68 % des
Punktwerts — deckt sich mit M2 (67,9 %).

---

## Entscheidung 1 — Die Typen sind eine Zweitschrift mit Vertragstest

`web/src/daten/snapshot.ts` schreibt die Typen aus `scraper/lib/snapshot.ts`
ab, statt sie zu importieren. Begründung: `web/` geht als eigenes Bündel auf
Cloudflare Pages und darf nicht davon abhängen, dass der Scraper übersetzt;
ein Typ-Import zöge `metrics.ts`, `ranking.ts`, `pipeline.ts` und eine
250-kB-JSON-Datei in die Typauflösung der Oberfläche.

Damit die Zweitschrift nicht ausei­nanderläuft, steht daneben ein
**Vertragstest** (`snapshot.vertrag.test.ts`), der die **echte** Datei liest
und jedes Feld jedes der 18.335 Objekte gegen die Typen prüft. Das kann ein
Typ-Import nicht: Er prüft den Quelltext des Exporters, nicht seine Ausgabe.
Fehlt die Datei, wird übersprungen statt rot gemeldet.

**Der Vertragstest hat sofort zwei Befunde gefunden — siehe unten.**

## Entscheidung 2 — Zwei Befunde am Export, aufgefangen statt repariert

Beide liegen in `scraper/` und werden in diesem Schritt **nicht angefasst**.

1. **Ein Objekt ohne jeden Grund.** Das ZVG-Objekt
   `9327fbb0-70cb-4dac-842e-b03b64df9c2c` (Leverkusen) ist S0, weil ihm die
   Wohnfläche fehlt, trägt aber einen **leeren** `data_gaps`-Eintrag. Die
   Stufe hängt am Feld `living_area_m2`, der Klartext an der Ableitung
   `wohnflaeche_fehlt` — genau die Lücke, die Entwurf 3.3 für 148 Objekte
   beschreibt. Entwurf 3.7 verlangt für jedes S0-Objekt einen Grund im
   Klartext; hier gäbe es keinen, und eine leere Zelle sähe aus wie „geprüft
   und nichts gefunden".

2. **Ein roher Lückencode.** `kaufpreis_unplausibel` steht bei 2 Objekten in
   `data_gaps`, hat aber keinen Eintrag in `DATA_GAP_LABELS`
   (`scraper/lib/telegram.ts`), und `datenlueckeKlartext` reicht ihn roh
   durch. 3.7 verlangt Klartext.

**Behandlung in der Oberfläche** (`web/src/logik/gruende.ts`):

- Fall 1 bekommt einen Ersatztext, der **keine Ursache rät**: *„Nicht
  beurteilbar — der Export nennt zu diesem Objekt keinen Grund"*. Aus
  `wohnflaecheM2 === null` im Frontend ein „Wohnfläche fehlt" abzuleiten wäre
  eine im Frontend nachgebaute Ableitung — Entwurf 5.3, Punkt 4 verbietet das.
- Fall 2 wird als **unbeschrifteter Code** gekennzeichnet und sichtbar anders
  gesetzt. Es entsteht **keine zweite Klartext-Tabelle**; das war die
  ausdrückliche Entscheidung 2 des Snapshot-Schritts („damit es EINE Tabelle
  gibt und nicht zwei").

Der Vertragstest misst beide Befunde, statt sie festzuschreiben: Er prüft,
dass die Oberfläche jeden Fall auffängt, und bleibt grün, wenn der Export
repariert wird.

## Entscheidung 3 — Spannenfilter blenden Objekte ohne Angabe aus und sagen es

`baujahr` trägt 58 von 18.335 Objekten (0,3 %), `einheiten` 99 (0,5 %). Ein
Baujahrfilter blendet also praktisch den ganzen Bestand aus.

Drei Möglichkeiten, zwei davon falsch:

- Objekte ohne Angabe **einschließen** → der Filter filtert nichts.
- Sie als **0 behandeln** → eine erfundene Angabe, und „Baujahr ab 1900"
  würde sie herauswerfen, ohne das zu sagen.
- **Gewählt: ausschließen — und die Zahl neben das Feld schreiben.**
  `zaehleOhneAngabe` rechnet je Feld, wie viele Objekte gar keinen Wert
  tragen; die Oberfläche nennt sie dauerhaft am Feld. Die Regel ist hart,
  aber sie ist angeschrieben.

Das ist der Leitsatz aus Abschnitt 1 auf die Filter angewendet: Nichtwissen
wird nicht in Wissen hineingerechnet und nicht als schlechter Wert gezeigt.

## Entscheidung 4 — Die Karte: echter Umriss, schematische Kacheln, echte Punkte

N2 verlangt die 16 Bundesländer als Fläche. Bundeslandgrenzen sind Geodaten,
und der Bau hatte keinen Netzzugang. Drei Wege standen offen:

- **Grenzen aus den PLZ-Zweistellern nähern** (Voronoi über 95 Punkte).
  *Verworfen.* Das Ergebnis sähe aus wie eine Landkarte und wäre an jeder
  Grenze um Dutzende Kilometer falsch — Berlin und Brandenburg teilen sich
  Zweisteller. Eine Karte, die Genauigkeit behauptet, die sie nicht hat, ist
  genau der Fehler, den der Entwurf an drei anderen Stellen ablehnt.
- **Reine 4×4-Kachelmatrix** ohne Geografie. Ehrlich, wirft aber die echte
  Lage weg, die im Repo vorliegt.
- **Gewählt:** ein **echter** Deutschlandumriss als Grund (aus
  `scraper/lib/karte.ts`), darauf **16 schematische Kacheln** an abgeleiteten
  Ankerpunkten, und in derselben Zeichenfläche die **echten Punkte** der
  Objekte mit PLZ.

Damit trägt jede Schicht genau die Genauigkeit, die ihre Daten decken: die
Kachel eine Landeszugehörigkeit (100 % gedeckt), der Punkt eine Ortsangabe
(1,3 % gedeckt). Die Kachel ist sichtbar eine Marke und keine Fläche —
niemand kann sie für eine Grenze halten.

**Alle Kartendaten sind abgeleitet, nicht abgetippt.**
`web/scripts/leite-kartendaten-ab.mjs` (`npm run ableiten:karte`) zieht
Umriss und PLZ-Zweisteller aus `scraper/lib/karte.ts` und rechnet die 16
Ankerpunkte als PLZ-gewichtetes Mittel über
`scraper/lib/plzBundesland.generated.json` (10.812 PLZ, 24 ohne
Zweisteller-Koordinate). Ergebnis: `src/logik/karte.generated.ts`.

*Was das Verfahren nicht hergibt:* kein Flächenschwerpunkt, keine Grenze.
Brandenburg umschließt Berlin, sein PLZ-gewichteter Punkt liegt deshalb
östlich des wahren Schwerpunkts.

**Zwei Kacheln sind von Hand versetzt**, beide begründet und beide mit einer
Linie an ihren Ankerpunkt gebunden: Berlin (der Punkt Brandenburgs liegt nur
13 px entfernt) und Hamburg (liegt fast unter Schleswig-Holstein). Ein Test
prüft, dass sich **keine** zwei Kacheln überlappen und keine aus der Fläche
ragt.

**Die Punkte sind gebündelt**, einer je PLZ-Zweisteller mit der Zahl daneben.
Die Koordinate ist der Mittelpunkt eines Zweistellerbereichs, also für alle
Objekte darin dieselbe — 40 Punkte übereinander zu zeichnen behauptete 40
Orte, wo es einen gibt.

## Entscheidung 5 — Kein Volltextfilter

N3 zählt die Filter einzeln auf, und der Auftrag sagt: „Baue nur, was dort
steht." Ein Such-/Titelfeld steht dort nicht und ist deshalb **nicht gebaut**
— ebenso wenig wie die ausdrücklich ausgeschlossene Zimmerzahl.

---

## Verlauf

### TDD-Zyklen (jeder zuerst rot gesehen)

| # | Test zuerst | rote Ausgabe |
|---|---|---|
| 1 | `bestimmeBereich`, `sortierschluessel`, `gliedere` | `Failed to load url ./gliederung.ts … Does the file exist?` |
| 2 | `wendeFilterAn`, `zaehleOhneAngabe`, `istFilterAktiv` | `Failed to load url ./filter.ts … Does the file exist?` |
| 3 | `projiziere`, `kachelLagen`, `buendlePlzPunkte`, `berechneAbdeckung`, `spanneDerGroesse` | `Failed to load url ./karte.ts … Does the file exist?` |
| 4 | `formatiereEuro`/`-Dscr`/`-Tagesalter` … | `Failed to load url ./formate.ts … Does the file exist?` |
| 5 | `gruendeFuerAnzeige` | `Failed to load url ./gruende.ts … Does the file exist?` |
| 6 | Vertragstest gegen die echte Datei | `expected length 0, received 1` — **echter Befund**, siehe Entscheidung 2 |

Stand nach der Logikschicht: **84 Tests grün**, `tsc --noEmit` sauber.

---

## Die Oberfläche

### Entscheidung 6 — Drei Zeichen für dreierlei Nichtwissen

Die gestalterische Leitidee ist der Leitsatz aus Abschnitt 1. Weil der
Entwurf **drei** verschiedene Arten von Nichtwissen kennt, bekommt jede ein
**eigenes Zeichen** — und keine davon ist Grau:

| Zustand | Zeichen | heißt |
|---|---|---|
| abgängig | ausgegraut, entsättigt | „beobachtet, dass es weg ist" |
| unbestätigt | gestrichelte Kante (6.3: *nicht grau*) | „hier hat niemand hingesehen" |
| nicht beurteilbar (S0) | diagonale Schraffur | „darüber ist nichts bekannt" |

Damit heißt Grau genau **eine** Sache, und die Verwechslung, vor der 6.3
warnt, ist gestalterisch unmöglich gemacht. Dieselbe gestrichelte Kante
markiert im Filter die Bundesländer ohne Abgangserkennung — gleiches Zeichen,
gleiche Bedeutung.

### Entscheidung 7 — Eine gemeinsame Skala, ein Lot durch die Liste

Der Bandstreifen (3.4) benutzt für **alle** Zeilen **eine** Skala mit festem
Wertebereich 0,00–2,50. Dadurch steht die Meldeschwelle 1,30 in jeder Zeile
an derselben Stelle und bildet über die ganze Liste eine durchgehende
Senkrechte — ein Lot, an dem sich jedes Band von selbst misst. Man sieht
ohne Legende, welches Band hält, welches darunter bleibt und welches die
Linie überquert (Schwellenwechsler, 3.6 — zusätzlich mit einem gestrichelten
Ring markiert).

**Der Wertebereich ist gemessen, nicht gegriffen:** `rangzahl` hat ein
Maximum von 2,40 und `band.unten` liegt konstruktionsbedingt nie darüber —
**die untere Kante, nach der sortiert wird (3.5), wird also nie
abgeschnitten**. Nur die obere, optimistische Kante kann über 2,50 hinaus
(`band.oben` P99 3,14, max 4,00); solche Bänder blenden am rechten Rand aus,
statt an einer harten Kante zu enden, die eine Grenze behauptet.

Drei Fälle, drei Formen: Band mit Punktstrich (S1/S2) · Raute ohne Band (S3,
belegte Miete — dort gibt es keine Schätzung, die gegen das Objekt laufen
könnte) · **gar kein Streifen** (S0 — dort stehen die Klartext-Gründe an
genau derselben Stelle). Es gibt keinen Zweig, in dem dort eine 0 steht.

### Entscheidung 8 — Die Karte zeigt immer den ganzen Bestand

Der erste Entwurf ließ die Punktschicht dem Filter folgen und die
Flächenfärbung nicht — die Flächenwerte kommen aus `snapshot.bundeslaender`
und sind Bestandszahlen. **Im Browser gesehen:** eine Kachel „4.471 Objekte"
über einer leeren Liste, unter *einer* Legende, die Bestandszahlen nannte.
Zwei Stände nebeneinander.

Aufgelöst zugunsten des Bestands: Die Karte ist der **Einstieg** in die
Liste, nicht ihr Ergebnis. Beide Schichten zeigen den ganzen Bestand, die
Auswahl zeigt der goldene Rahmen, und die Tafel sagt das in einem Satz.

### Entscheidung 9 — Die Kopfzeile und das Wort „Top-Treffer"

Das Ruling ist umgesetzt: „Top-Treffer" heißt auf der Seite **ausschließlich**
die Trefferklasse nach N1.1, und eine eigene Fußnote sagt das ausdrücklich —
samt dem Hinweis, dass die Meldeklasse des Telegram-Wegs eine andere Größe ist
und auf dieser Seite nicht vorkommt.

**Abweichung von der vorgeschlagenen Formulierung, hier entschieden:** Der
Satz „seit dem … wurde keine Meldung der höchsten Stufe verschickt" steht
**nicht** in der Kopfzeile, weil der Snapshot diese Zahl nicht trägt.
`topTrefferSeit` ist ausweislich des Exports das älteste `first_seen`, also
der **Beginn des Beobachtungsfensters** — keine Aussage über verschickte
Meldungen. Die Kopfzeile sagt deshalb „Beobachtet wird seit dem …", und über
Meldungen sagt sie nur etwas, wenn `betrieb.meldebudget` belegt ist (ein
Export innerhalb eines Laufs). Eine Aussage ohne Zahl wäre hier schlimmer als
keine.

**Die Zahl in der Kopfzeile ist ungefiltert.** Die übrigen Zahlen dort kommen
aus `snapshot.kopfzeile` und gelten für den Bestand; eine gefilterte Zahl
zwischen ungefilterten wäre wieder „zwei Stände nebeneinander".

### Entscheidung 10 — Länder ohne Abgangserkennung werden gemessen, nicht aufgezählt

Entwurf 6.3 verlangt den Grund im Klartext am Regionsfilter. Zwei Wege wurden
verworfen, beide ausprobiert:

- **Feste Liste `["nw","bw","mv"]`** — schon beim Schreiben veraltet (`sh` ist
  seit dem 2026-09-15 die vierte und steht in keiner Spezifikation).
- **`regionsstand.vollstaendig` des jüngsten Laufs** — markiert **15 von 16**
  Regionen, weil fast jeder Lauf am Zeitbudget endet. Ein Merkmal, das 94 %
  einer Liste trägt, markiert nichts (die Lehre aus 3.6). *Im Browser gesehen
  und daraufhin verworfen.*

**Gewählt: die Wirkung messen.** Ein Land, aus dem nie ein Abgang erkannt
wird, hat keinen einzigen abgängigen Eintrag — das ist die Definition, nicht
ihre Näherung, und sie braucht keine Schwelle. Die eine Feinheit: gezählt
wird nur die **Hauptquelle** (Immowelt), weil ZVG von einem anderen Sweep
bedient wird.

**Gegenprobe am Bestand vom 2026-09-15:** Das Verfahren liefert genau
**Baden-Württemberg, Mecklenburg-Vorpommern, Nordrhein-Westfalen und
Schleswig-Holstein** — die drei aus A15 plus die vierte aus der Messung vom
2026-09-15, ohne eine davon zu kennen. Über alle Quellen gezählt fiele NRW
heraus (4.384 Immowelt-Objekte ohne einen einzigen Abgang, aber 2
ZVG-Abgänge), also ausgerechnet die Region, die A15 als erste nennt.

*Was das Verfahren nicht hergibt:* Es misst die Wirkung, nicht die Ursache.
Ein Land, in dem zufällig nur nichts verschwunden ist, sähe genauso aus. Der
Text am Filter behauptet deshalb keine Ursache.

### Entscheidung 11 — Virtualisierung selbst geschrieben

Alle Zeilen sind gleich hoch; für feste Zeilenhöhen ist die ganze Rechnung
ein Dutzend Zeilen. Eine Bibliothek könnte zusätzlich variable Höhen messen —
die gibt es hier nicht. Die Zeilenhöhe gehört dem JavaScript (sie geht in die
Rechnung ein) und wird als CSS-Variable an den Behälter gesetzt, damit
dieselbe Zahl nicht an zwei Stellen steht.

---

## Abhängigkeiten, jede einzeln begründet

| Paket | warum |
|---|---|
| `react`, `react-dom` | von N5 vorgeschrieben |
| `vite`, `@vitejs/plugin-react` | von N5 vorgeschrieben |
| `typescript`, `@types/react`, `@types/react-dom`, `@types/node` | von N5 vorgeschrieben bzw. deren Typen |
| `vitest` | dasselbe Werkzeug wie in `scraper/`, kein zweites gelernt |

**Sonst nichts.** Keine Kartenbibliothek (Inline-SVG), keine
Virtualisierungsbibliothek (selbst geschrieben), keine UI-Bibliothek, keine
Zustandsbibliothek, keine Datumsbibliothek (`Intl`), keine Schriftart von
einem fremden Server (Systemschriften mit voller Ersatzkette).

## Im Browser tatsächlich geprüft (Chromium, lokal, kein fremder Server)

| Fall | Ergebnis |
|---|---|
| Laden der echten 18,90-MB-Datei | **Abruf 304–507 ms, Parsen 23–24 ms**, Seite nach **1,15–1,23 s** bedienbar. Keine Konsolenausgabe. |
| Golden Path 1600 px | 4 Bereiche, Zahlen summieren sich auf 18.335 |
| S0-Objekt | Schraffur, **keine Kennzahl, keine 0**, Grund im Klartext an ihrer Stelle |
| sehr breites Band | `1,29–3,30` — über die Skala hinaus, blendet am Rand aus; unter der Schwelle, also korrekt **nicht** „top" |
| Schwellenwechsler | gestrichelter Ring auf der Lotlinie, im Bild bestätigt |
| Kartenklick (Bremen) | filtert auf 108, Kachel bekommt goldenen Rahmen, Chip wird gewählt |
| Kartengröße umschalten | Median-DSCR-Skala 0,47–1,13 |
| leere Filtermenge (Baujahr 1500–1600) | **0 nach Filter**, alle vier Bereiche mit eigenem, erklärendem Leertext; das Spannenfeld sagt „18.277 von 18.335 Objekten tragen keine Angabe … sie sind gerade ausgeblendet" |
| Abgänge | ausgegraut und entsättigt, Datum je Zeile, gemischt S0/S1 |
| 400 px | kein Querlauf (`scrollWidth` 400), Zeile 370 px breit, 104 px hoch, zweizeilig |
| 760 px | kein Querlauf |
| Produktionsbau | `vite build` grün: 186 kB JS (60,5 kB gzip), 20,6 kB CSS (4,95 kB gzip) |

**Im Browser gefunden und behoben** (nicht vermutet, gemessen): Preis und
Fläche standen auf einer Zeile (`span` ist inline); der Zahlenwert des Bandes
überdeckte genau die besten Bänder (jetzt eigene Spalte statt Verlauf); die
Achsenbeschriftung „Meldeschwelle 1,30" stieß mit dem Strich bei 2,00
zusammen (jetzt zweizeilige Achse); ein langer Grund schob die Stufenspalte
aus dem Bild (`min-width: 0` am Rasterfeld); die DSCR-Achse stand auch über
dem Bereich „Nicht beurteilbar", in dem kein Objekt eine Rangzahl trägt
(jetzt „Warum keine Kennzahl").

**Nicht geprüft:** andere Browser als Chromium (Firefox, Safari), echte
Touch-Bedienung, Tastaturnavigation über die ganze Seite, Vorlesehilfen,
Cloudflare Pages und Cloudflare Access (nicht Teil dieses Schritts),
Verhalten bei sehr langsamer Leitung (lokal ist der Abruf Plattenzugriff).
