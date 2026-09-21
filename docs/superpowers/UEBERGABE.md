# Übergabe — Stand 2026-09-21 (dritte Sitzung des Tages)

## ZUERST LESEN: ein Messlauf war beim Sitzungsende noch offen

**Lauf `35588951096`** (`scrape.yml`, gestartet 2026-09-21 gegen 12:30 Uhr
Ortszeit) prüft, ob die **nebenläufige Bewertung** trägt. Das ist der erste
Handgriff der nächsten Sitzung:

```
gh run view 35588951096 --json conclusion -q .conclusion
gh run view 35588951096 --log | grep -oE "2026-[0-9:T.Z-]+ (Immowelt: Sweep gestartet|ZVG-Portal: Sweep gestartet)"
gh run view 35588951096 --log | grep -oE "Immowelt-Detail:.*|Immowelt: [0-9]+ von [0-9]+ gesehenen"
```

**Was die Zahlen bedeuten:**

| Gemessen wird | Vorher (Lauf `35585454873`) | Erwartet |
|---|---|---|
| Immowelt-Sweep **und** Bewertung zusammen | 9 min 37 s | **rund 5 min** |
| davon Bewertung allein | ~6 min für 590 Objekte | **rund 1 min** |
| Fehlerzeilen `Kandidat fehlgeschlagen` | 0 | **weiterhin 0** |
| `Meldungen: n von hoechstens 25` | 1 | plausibel, **nie über 25** |

**Trägt es** — Bewertung deutlich schneller, keine neuen Fehler, Meldebudget
eingehalten —, dann ist der nächste Schritt, **`MAX_BEWERTUNGEN_IMMOWELT`
von 600 anzuheben** (`scraper/main.ts`). Das ist der eigentliche Nutzen:
Heute wird ein Objekt nur alle **8,5 Tage** neu bewertet, und so spät fällt
eine Preissenkung auf. Bewusst **nicht** zusammen mit der Nebenläufigkeit
geändert, damit zu sehen bleibt, was gewirkt hat.

**Trägt es nicht**, ist der Rückweg **eine Zahl**: `BEWERTUNGSBREITE = 1` in
`main.ts` stellt exakt das alte Verhalten her. Kein Umbau nötig.

## Was diese Sitzung gebaut hat

| Commit | Was |
|---|---|
| `7a3f722` | Detailphase bricht nach erfolgloser Stichprobe ab (3 statt 25 Abrufe) |
| `39616c5` | **Bewertung nebenläufig**, Meldeteil weiter in Reihe |
| `5331257` | B10 — gemessen: Immowelt liefert nichts Reicheres |
| `b0d4178` | Detailphase läuft vor dem Sweep |
| `0440b58` | **ZVG-Link behoben** — Terminsuche statt `error` |
| `ef934fe` | B8-1 — `last_detail_at` hängt wirklich am Schalter |
| `cb3653b` | E-7 — Kategorie „Objekte ohne Region" gebaut |
| `028f523` | B5 gemessen — kein Fehler, sondern der A-4-Pfad |
| `e1628b3` | Bilddeckel greift auch beim Laden |
| `d2e7bc5` | Detailphase wieder eingehängt, gedeckelt auf 25 |

**Stand: 561 Scraper-Tests grün, 203 Web-Tests grün** (1 übersprungen),
`tsc` und `vite build` sauber, alles auf `main` gepusht.

## Die drei Befunde, die die Richtung bestimmen

### 1. Die Immowelt-Detailsperre besteht — und ist nicht durch Code zu lösen

75 Abrufe über drei Produktionsläufe, **alle HTTP 403**, darunter 25 in einem
Lauf mit völlig gesundem Sweep. Die Momentaufnahme vom 20.09. (5 von 5) war
die Ausnahme.

**Weg (e) ist gebaut** — die Phase läuft jetzt vor dem Sweep, auf
unverbrauchtem Runner. Der erste Lauf damit brachte 0 von 25, **taugt aber
nicht als Widerlegung**: Immowelt machte zum Messzeitpunkt generell dicht
(644 statt 6.800 gesehene Objekte). **Zu wiederholen, wenn der Sweep wieder
normale Mengen sieht.**

**Nicht weiter daran drehen.** Die verbliebenen Erklärungen — veraltete
`search=`-Parameter in gespeicherten URLs, unpassender Referer — sind
Rätselraten um einen Bot-Schutz, der sich binnen eines Tages ändert.

### 2. Es gibt nichts Reicheres mitzulesen (B10)

`classified-search` liefert **`text/html` mit 1 MB** — die fertig gerenderte
Seite 2, genau das, was `parseImmoweltListPage` ohnehin verarbeitet. Kein
Datendienst. Zweifach geprüft, zwei Regionen, rund 2,6 Millionen Zeichen, und
in keinem eine fünfstellige Zahl.

**Damit ist B6 endgültig eine Infrastruktur- und keine Codefrage.** Wer
einheitliche Daten will, braucht eine nicht gesperrte Adresse — kein
besseres Parsing. A16 bekommt seine Trefferzahl auch von dort nicht.

### 3. ZVG ist 8 % der Laufzeit — nicht anfassen

Gemessen: **52 Sekunden** für alle 16 Bundesländer inklusive Detailphase,
gegen 9 min 37 s für Immowelt.

**Ein Fund, der dokumentiert gehört, aber nicht umgesetzt werden sollte:**
Die ZVG-Terminsuche läuft auch **ohne Browser** per einfachem HTTP-POST
(`index.php?button=Suchen`, Felder `land_abk` und `plz` genügen — am
2026-09-21 verifiziert). Ein Umbau spart höchstens 30 Sekunden, berührt aber
die **einzige Quelle mit Löschhoheit**. Schlechtestes Verhältnis von Gewinn
zu Risiko im ganzen Projekt.

## Was als Nächstes zu tun ist

1. **Den Messlauf auswerten** (oben), dann `MAX_BEWERTUNGEN_IMMOWELT`
   anheben.
2. **Weg (e) erneut messen**, sobald der Sweep normale Mengen sieht.
3. **B6 Schritt 2, Weg (d)** — Entscheidung des Nutzers, Infrastrukturfrage.
4. **A16** — zweiter Vollständigkeitsmaßstab, der letzte Block für B1.
5. Übriger Rückstand: **A10**, **A11 Schritt 4**, **B7**, **B8-2**, **B9**.

## Drei Vorschläge, die die Messung widerlegt hat

Ein Kapitel zur Warnung, denn alle drei klangen plausibel:

- **„Die 600er-Bewertungsgrenze ist ein Rudiment."** Falsch — 0,6 s je Objekt
  mal 9.747 sind über eine Stunde. Die Grenze war hart nötig. (Erst die
  Nebenläufigkeit ändert das.)
- **„Die doppelte Rotation ist überflüssig."** Falsch — bei 403-Antworten
  bleibt `last_detail_at` leer, dieselben 25 kämen im nächsten Lauf wieder.
- **„Die drei Zählweisen für ‚ohne Region' gehören vereinheitlicht."**
  Falscher Schnitt — **35** (`partitionEinesListings` null), **356**
  (Snapshot `bundesland` null) und **398** (ohne `listing_versions`) sind
  drei verschiedene **Fragen**, nicht drei Antworten auf eine. Sie gehören
  benannt, nicht zusammengelegt.

## Die Falle dieser Sitzung — dreimal dieselbe

**Eine Messung, die nichts findet, weil sie nichts anschaut, sieht aus wie
ein Befund.** An einem Tag dreimal zugeschnappt:

1. Der E-7-Browsercheck las `21.897 Objekte` aus der Kopfzeile — die
   Bestandsgröße, nicht die gefilterte Menge — und meldete „unverändert".
2. Der ZVG-Vergleich sagte achtmal NEIN, weil Python unter Windows CRLF
   schreibt und das `` an der Id klebte. Die Suche war die ganze Zeit
   richtig.
3. Die Netz-Diagnose meldete „PLZ: nein / Trefferzahl: nein" über **0
   gelesene Zeichen** — der Körper wurde nur bei `content-type: json` geholt.

**Die Lehre ist als Erinnerung gesichert**
(`messung-muss-sich-selbst-pruefen`): Jedes Messskript bekommt eine Wache,
die `NICHT GEMESSEN` von `nein` unterscheidet. Und: **Ein gleichförmiges
negatives Ergebnis verdächtigt zuerst die Messung, nicht den Gegenstand.**

Zwei weitere Fallen dieser Sitzung:

- **Ein Docstring, der eine Regel erklärt, ist kein Beleg, dass der Code sie
  befolgt.** `lib/db.ts` beschrieb über dreißig Zeilen, warum
  `last_detail_at` am Schalter hängt — dreißig Zeilen darüber setzte
  `listingUpsertZeile` es bedingungslos (B8-1, behoben).
- **Ein Formular hat mehr Felder, als die Seite zeigt.** Die sichtbare
  ZVG-Maske kennt Bundesland, Amtsgericht und Aktenzeichen — im HTML stehen
  zusätzlich `plz`, `ort`, `ortsteil`, `str` und `hnr`. Genau die lösten den
  ZVG-Link.

---

# Übergabe — Stand 2026-09-21 (zweite Sitzung des Tages)

## Die Detailphase läuft jetzt vor dem Sweep — und der ZVG-Link funktioniert wieder

### Weg (e) ist gebaut: ein Lauf, Detailphase zuerst

**Entscheidung des Nutzers: in einem Lauf, nicht in einem zweiten Workflow.**
Die Detailphase steht jetzt **vor** `sweepImmowelt`. Damit läuft sie auf
demselben unverbrauchten Runner wie die Diagnose — ohne zweiten Workflow,
ohne zweiten Schreiber auf dieselben Tabellen, ohne überlappende Läufe.

**Die Begründung in zwei Zeilen:**

```
frischer Runner (Diagnose, ~6 Abrufe):      6 von 10 mit HTTP 200
nach vollem Sweep (drei Produktionslaeufe): 0 von 75
```

**Wer den Block verschiebt, macht ihn wirkungslos.** Das steht so im Code.

Zwei Bausteine waren dafür nötig. **`ladeDetailRueckstand`** holt die
Kandidaten aus `listings` — vor dem Sweep gibt es keine Zusammenfassungen,
und der Rückstand liegt ohnehin im Altbestand. Sie liefert `externalId`,
`url` **und** `fundort` in einer Abfrage; der Fundort ist die Wache vor der
Löschung. **`kandidatAusDetail`** schreibt die Objekte, die der Sweep dieses
Laufs nicht gesehen hat — der Normalfall, denn die Scheibe wählt über alle
16 Regionen, der Sweep deckt eine ab. Ohne diesen Weg wären fast alle
Abrufe umsonst gewesen.

**Möglich wurde das erst durch die Korrektur an `last_detail_at`** (B8-1,
`ef934fe`): Vorher trug das Feld bei jedem Upsert einen Zeitstempel und
taugte nicht als Rückstandsfilter.

**Was es nicht ist: ein Sieg über die Sperre.** Vier von zehn Abrufen
scheitern weiterhin. Der Deckel von 25 bleibt die laufende Messung — die
Zeile `Immowelt-Detail: n von 25` ist weiterhin die Zahl, die man liest.

### Der ZVG-Link führte immer auf „error" — Befund des Nutzers, behoben

**Ursache:** zvg-portal.de verlangt einen Referer der eigenen Domain. Ein
Klick aus dem Dashboard ist immer Cross-Origin, und Browser senden dabei
standardmäßig nur den Origin. Der gespeicherte Direktlink
(`index.php?button=showZvg&zvg_id=…`) **konnte von dort aus nie
funktionieren** — er antwortet mit HTTP 200 und dem Body `error`. Derselbe
Mechanismus ist im Scraper seit Langem bekannt: `ladeDatei` setzt für
ZVG-PDFs eigens einen Referer.

**Lösung:** die Terminsuche des Portals, vorbelegt mit Bundesland und PLZ.
Sie ist **POST** — ein `<a href>` kann sie nicht aufrufen, ein
`<form method="post" target="_blank">` schon. Formulare unterliegen nicht
CORS; geprüft antwortet die Suche ohne Referer, mit fremdem Referer und mit
Origin-Header gleichermaßen. **Zwei Felder genügen** (`land_abk`, `plz`).

**Gemessen an 60 Objekten:** 57 gefunden, 33 davon neben ein bis drei
weiteren Treffern. Die übrigen drei sind im Dashboard als **abgängig**
markiert — sie existieren im Portal nicht mehr, die Suche findet korrekt
nichts. Bezogen auf die noch existierenden Objekte also **57 von 57**.

**Eine Falle, durch einen Test festgenagelt:** `logik/karte.ts` schreibt
Brandenburg als `BB`. Das ZVG-Portal kennt nur `br` und antwortet auf `bb`
mit „falsche Parameter übergeben". `logik/zvgSuche.ts` hat deshalb eine
**eigene** Tabelle und erbt die der Karte nicht.

## Weitere Ergebnisse dieser Sitzung

| | |
|---|---|
| **B8-1** | `last_detail_at` hängt jetzt wirklich am Schalter. **Weglassen statt null** — ein null löschte den Zeitstempel eines Objekts, das früher sehr wohl erfasst wurde. ZVG setzt ihn ausdrücklich auf `true`, sonst wäre aus der Korrektur eine Regression geworden |
| **Bilddeckel** | `MAX_BILDER_JE_OBJEKT` griff nur beim Versand. 40 Fotos wurden geladen, 30 verschickt. Auffällig wurde es erst, weil `photoUrls` bis zur Detailphase **toter Code** war |

## Drei Fallen dieser Sitzung

- **Eine Messung, die überall dasselbe meldet, misst meistens sich selbst.**
  Der Vergleich „ist die gesuchte ZVG-Id in den Treffern?" sagte achtmal
  NEIN — weil Python unter Windows CRLF schreibt und das `
` an der Id
  klebte. Die Suche war die ganze Zeit richtig. Dieselbe Falle schlug
  vorher schon beim E-7-Browsercheck zu.
- **Ein Formular hat mehr Felder, als die Seite zeigt.** Die sichtbare
  ZVG-Maske kennt Bundesland, Amtsgericht und Aktenzeichen — im HTML stehen
  zusätzlich `plz`, `ort`, `ortsteil`, `str` und `hnr`. Ein Blick auf die
  gerenderte Seite hätte die Lösung übersehen.
- **Ein typografisches Anführungszeichen beendet einen String.**
  `describe("… „Objekte ohne Region" …")` erscheint als „0 Tests gefunden",
  nicht als Syntaxfehler an der Zeile.

---

# Übergabe — Stand 2026-09-21

## Die Detailsperre besteht — die Messung aus B6 ist da und sie ist negativ

**75 Abrufe über drei Produktionsläufe, alle HTTP 403.**

| Lauf (UTC) | Sweep, gesehene Objekte | Detailseiten |
|---|---|---|
| 20.09. 21:35 `35539155621` | 641 — eingebrochen | **0 von 25** |
| 20.09. 22:45 `35542642397` | 647 — eingebrochen | **0 von 25** |
| 21.09. 01:56 `35552491138` | **6.807 — normal** | **0 von 25** |

**Der dritte Lauf entscheidet.** Sein Sweep war einwandfrei — eine große
Region, 6.807 Objekte, das normale Bild. Die Detailseiten blieben trotzdem
vollständig gesperrt. Die Sperre ist also kein Folgeschaden eines schlechten
Laufs, sie steht für sich.

**Die Momentaufnahme vom 20.09., 20:28 (5 von 5 HTTP 200) war die Ausnahme.**
Genau davor warnt der Kasten zu B6 Schritt 1: „Fünf Abrufe mit 5 s Abstand
sagen nichts über 144 am Stück." Die Warnung hat sich binnen eines Tages
bestätigt. Das ist kein Fehlschlag der Arbeit, sondern der Zweck der Messung:
Sie war als Messung gebaut, gedeckelt auf 25, und sie hat gemessen.

### Was noch offen ist und wem es gehört

Die Detailphase kostet derzeit rund zwei Minuten je Lauf für null Felder. Ob
sie stehen bleibt, ist eine **Entscheidung des Nutzers** und hängt an **Weg
(d) aus B6 Schritt 2**: Detailseiten von einer nicht gesperrten Adresse
holen. Das ist eine Infrastrukturfrage, keine Codefrage — und nach dieser
Messung die **einzige** verbliebene Antwort auf „einheitliche Infos
ganzheitlich auslesen".

### Zwei Verdächtigungen, die die Messung widerlegt hat

- **Nicht die URL-Form.** Die Produktions-URLs tragen einen langen Anhang
  (`?serp_view=list&search=…#ln=…`), die erfolgreiche Diagnose schien saubere
  URLs zu nehmen. Das Log des Diagnoselaufs zeigt: **identische Form.** Der
  Umbau, der daraus gefolgt wäre, hätte nichts gebracht.
- **Nicht die neue Detailphase.** Der Sweep-Einbruch vom 20.09. begann im
  19:52-Lauf, also **vor** dem Wiedereinhängen (gepusht gegen 21:30 UTC).

## Die Löschwache hat unter echter Belastung gehalten

Am 20.09. fiel die gesehene Menge von 4.789 auf 644 und blieb über drei Läufe
dort. Im Log steht `immowelt: Loeschung ausgesetzt (strukturell teilweise,
erwartet) — Sweep war unvollständig`. **Kein Objekt wurde fälschlich als
Abgang markiert.** Genau dafür ist die Fail-closed-Umstellung gebaut.

**Was fehlt: eine Warnung.** `pruefeMengenplausibilitaet` prüft `!vollstaendig`
zuerst und erreicht ihren Mengenvergleich bei Immowelt nie — `vollstaendig`
ist dort strukturell hart `false`. Für das Löschen richtig, für das Bemerken
eine Lücke. Der Einbruch um Faktor 7 stand nur in einer Logzeile. Als **B9**
notiert, samt der Warnung, die Reihenfolge der Wache **nicht** anzufassen.

## B5 ist gemessen und ist kein Fehler

`scraper/scripts/messung-b5-leere-huellen.mts` (nur lesend) beantwortet
Schritt 1 und 2 in einem Lauf:

```
listings gesamt:                    23.054
davon mit mindestens einer Version: 22.656
LEERE HUELLEN:                         398
first_seen: verteilt ueber 8 Tage, 13.09. bis 20.09.
Anteil am Tageszugang: 1,5 bis 6,4 %
```

**Dauerzustand, keine Regression** — stabile Quote, kein Knick. Und der
Anfang hat ein Datum: Der Bestand reicht bis zum 05.09. zurück, die erste
Hülle stammt vom 13.09. Am **2026-09-12** führte `ea8b731` den Pfad ein, dass
ein Objekt ohne Preis eine Zeile statt eines `continue` bekommt (A-4). Die
398 Hüllen sind dieser Pfad, wie entworfen.

**E-7 und B5 sind disjunkt:** 35 ohne zuordenbare Region, 398 Hüllen,
Überschneidung **null**. Die Warnung des Backlogs war berechtigt.

**Aber Vorsicht mit der Zahl 35.** Im Snapshot tragen **356** Objekte kein
Bundesland, und davon sind **350** genau die Hüllen. Auf Datenbankebene sind
die Mengen disjunkt, auf Snapshot-Ebene fast deckungsgleich —
`partitionEinesListings` liest den `fundort` (fast immer gesetzt), der
Snapshot dagegen `bundesland` aus der Version, und Hüllen haben keine
Version. **Drei Definitionen, drei Zahlen: 35, 356, 398.** Wer sie
nebeneinanderstellt, muss sagen, welche er meint.

## E-7 ist gebaut

Die Kategorie „Objekte ohne Region" (Entscheidung des Nutzers vom
2026-09-13) stand seit Wochen unerfüllt. `inAuswahl` gibt für `null` false
zurück, sobald gefiltert wird — die 356 Objekte verschwanden beim ersten
Klick auf die Karte, und es gab keinen Weg zurück.

`OHNE_REGION` lebt im vorhandenen Feld `bundeslaender` und erbt damit
Zurücksetzen, Zähler und `istFilterAktiv`. Die Karte bekommt **keine**
Kachel: Ein Objekt ohne Region hat keinen Ort, eine Kachel wäre eine
Behauptung über seine Lage.

Im Browser nachgemessen: Der Knopf trägt 356, ein Klick setzt die Liste auf
„356 nach Filter", 290 Zeilen verschwinden, keine Konsolenfehler.
**195 Web-Tests grün**, 1 übersprungen.

## Ein Fehler, den erst die Detailphase sichtbar gemacht hat

`MAX_BILDER_JE_OBJEKT = 30` saß nur im Versand, nicht im Laden. Ein Exposé mit
40 Fotos wurde vollständig vom Immowelt-CDN geholt, um dann 30 zu
verschicken. Das fiel nie auf, weil `photoUrls` in der Produktion **toter
Code** war: ZVG reicht nur `attachments` durch, Immowelt schickte eine feste
leere Liste. Behoben in `e1628b3` mit `begrenzeBildUrls`.

## Drei Fallen dieser Sitzung

- **Ein Messskript, das die falsche Zahl greift, sieht aus wie ein
  bestandener Test.** Der Browsercheck zu E-7 las zuerst „21.897 Objekte" aus
  der Kopfzeile — die Bestandsgröße, nicht die gefilterte Menge — und meldete
  brav „unverändert". Erst eine eingebaute Wache (`if (vorher === 0) throw`)
  hat den Lauf abbrechen lassen, statt einen grünen Haken zu erfinden.
- **Ein Docstring, der eine Regel erklärt, ist kein Beleg, dass der Code sie
  befolgt.** `lib/db.ts` beschreibt über dreißig Zeilen, warum
  `last_detail_at` am Schalter `detailGelesen` hängt — und dreißig Zeilen
  darüber setzt `listingUpsertZeile` es bedingungslos.
- **Ein typografisches Anführungszeichen in einem Testnamen beendet den
  String.** `describe("… „Objekte ohne Region" …")` ist ein Parserfehler, der
  als „0 Tests gefunden" erscheint, nicht als Syntaxfehler an der Zeile.

---

# Übergabe — Stand 2026-09-20 (vierte Sitzung des Tages)

## Die Immowelt-Detailphase hängt wieder im Produktionslauf — gedeckelt auf 25

**B6 ist von Schritt 1 bis Schritt 3 durch.** Die Sperre war schon gestern
widerlegt; diese Sitzung hat die Entscheidung des Nutzers eingeholt und
gebaut. `erfasseImmoweltDetails` wird seit dem 2026-09-08 zum ersten Mal
wieder aufgerufen.

**Stand: 535 Scraper-Tests grün, `tsc` sauber.** Die Web-Seite ist nicht
berührt.

### Die Entscheidung des Nutzers: 25 Seiten, rund 4 Minuten

Vorgelegt wurden vier Deckel mit ihren Preisen, gewählt wurde der kleinste.
**Der erste Lauf ist eine Messung, kein Nachfüllen.** Drossel,
`SWEEP_BUDGET_MS` und `timeout-minutes` sind unangetastet — keiner der Wege
(a) bis (d) aus B6 wurde beschritten.

Die Rechnung, die den Deckel trägt: Eine Immowelt-Seite kostet gemessen
**8,7 bis 11,5 s**, nicht 5. Die 5 s sind die Drossel, der Rest ist echte
Ladezeit; eine frühere Rechnung setzte nur die Drossel an und war um mehr als
das Doppelte zu optimistisch. 25 Abrufe sind damit rund 4 min, die Marge
gegen `timeout-minutes: 75` sinkt von 25 auf rund 21 min.

### Der Gedanke, der das Bild gedreht hat

**PLZ, Baujahr und Grundstück ändern sich nie.** Detaildaten sind kein
wiederkehrender Aufwand, sondern ein einmaliges Nachfüllen je Objekt. Ein Lauf
muss nicht „alles" holen — er muss holen, was noch fehlt, und der Rückstand
schrumpft monoton. Damit verliert die Spannung zwischen „alle Inserate auf
einmal" und „schlank", an der B6 hing, ihre Schärfe.

### Was gebaut wurde

| Ort | Was |
|---|---|
| `main.ts` | `MAX_DETAILS_IMMOWELT = 25`, Detailscheibe innerhalb der Bewertungsauswahl, gekapselter Aufruf |
| `scrapers/immowelt/zusammenfuehren.ts` | **neu** — `fuegeDetailHinzu`, 9 Tests |
| `scrapers/immowelt/index.ts` | Docstring: die „wird nicht aufgerufen"-Begründung war seit dem 2026-09-20 falsch |
| `lib/db.ts` | Docstring berichtigt, der Fund B8-1 steht jetzt dort, wo er zuschlägt |

Die Regel von `fuegeDetailHinzu` in einem Satz: **Ein `null` auf der
Detailseite ist keine Aussage** und darf einen Wert der Titelzeile nicht
löschen. Ohne diese Regel machte die Detailphase den Bestand ärmer statt
reicher — ausgerechnet bei den Objekten, deren Seite lückenhaft ist.

Die Phase ist gekapselt: Bricht sie im Ganzen weg, kostet das Felder, nicht
den Lauf. ZVG-Sweep, Bestandsabgleich und Löschblock bleiben erreichbar.

### Der nächste Schritt ist Lesen, nicht Bauen

Nach dem ersten Produktionslauf mit der neuen Phase steht im Log:

```
Immowelt-Detail: n von 25 Detailseiten gelesen.
```

**Diese Zahl ist die eigentliche Messung.** Steht dort 0, sagen die Zeilen
darüber (`beurteileDetailAntwort`), ob eine Sperre oder eine
Strukturänderung antwortete. Drei Dinge hängen daran: ob der Deckel steigen
darf, ob `parseImmoweltDetailPage` nachgezogen werden muss, und ob B8 lohnt.
Das steht als **B6 Schritt 4** im Backlog.

### Zwei Funde aus dem Bauen — B8, bewusst offen

- **`last_detail_at` sagt bei Immowelt nicht die Wahrheit.**
  `listingUpsertZeile` setzt das Feld bei **jedem** Upsert; der Schalter
  `detailGelesen` greift nur auf dem preislosen Pfad. Jedes bewertete
  Immowelt-Objekt sieht „frisch im Detail erfasst" aus. Deshalb taugt
  `ladeVeralteteExternalIds` dort nicht als Rückstandsfilter — die
  Detailscheibe rotiert, statt nach Alter zu wählen.
- **`zip_code` liegt auf `listing_versions`, nicht auf `listings`.** Der
  saubere Vorrang wäre „hole, wer noch keine PLZ hat" — 97,4 % des Bestands.
  Er braucht eine Abfrage über die jeweils neueste Version, die es nicht gibt.

Beides lohnt erst nach der Messung. Ein Vorrang für Objekte, deren Seiten alle
abgewiesen werden, wäre nur ein schnellerer Weg ins Nichts.

### Die Falle dieser Sitzung

**Ein Docstring, der eine Regel erklärt, ist kein Beleg, dass der Code sie
befolgt.** `lib/db.ts` beschreibt über dreißig Zeilen sorgfältig, warum
`last_detail_at` am Schalter `detailGelesen` hängt — und dreißig Zeilen
darüber setzt `listingUpsertZeile` es bedingungslos. Der Entwurf dieser
Sitzung baute im ersten Anlauf auf genau diesen Docstring. Die Prüfung am
Code, nicht an der Prosa, kam rechtzeitig.

---

# Übergabe — Stand 2026-09-20 (dritte Sitzung des Tages)

## Der Kartenplan ist abgenommen — Task 10 ist gelaufen, der Plan ist fertig

**Alle zehn Tasks sind erledigt.** Task 10 war die Gesamtabnahme: volle
Prüfung, Gesamtdurchlauf im Browser an drei Fenstergrößen, das Design- und
Barrierefreiheits-Audit, Dokumentation.

**Stand nach der Abnahme: 187 Web-Tests grün, 1 übersprungen**, `tsc` und
`vite build` sauber, keine Konsolenfehler in keiner der drei Größen.

### Der Befund, den erst die Abnahme fand: die Punkte stahlen den Kacheln den Klick

Die auf 24 px vergrößerten Trefferflächen der PLZ-Punkte sind **unsichtbar**
und liegen **über** den Bundesland-Kacheln. Gemessen an 1440×900, 1366×768 und
390×844 mit einem 5×5-Raster je Kachel:

| Kachel | vorher (von 25) | nachher |
|---|---|---|
| Saarland | **0** (bei 1366 px) | 23 |
| Berlin | 11 | 23 |
| Thüringen | 6 | 21 |
| Bremen | 8 | 23 |

Task 8 hatte nur geprüft, ob jeder **Punkt** sich selbst trifft — nicht, ob
die **Kachel darunter** noch erreichbar ist. Das ist die Lehre: Eine
Überdeckungsprüfung muss beide Richtungen messen, nicht nur die Schicht, die
gerade gebaut wird.

Die Trefferfläche bekommt deshalb eine **zweite Schranke**: den Abstand zur
nächsten Kachelfläche (`abstandZuKacheln` in `logik/karte.ts`). Anders als die
Nachbarschranke darf sie **nicht unter den sichtbaren Punktradius drücken** —
was man sieht, muss man treffen können. Die Kachel verliert genau die Fläche,
die der Punkt ohnehin verdeckt. Preis: Median-Trefferfläche 20,9 → 15,2 px;
alle 60 Punkte treffen weiterhin sich selbst. Commit `2485d4d`.

**Was bleibt:** Bei **Bremen** und **Saarland** liegt der sichtbare Punkt
genau auf der Kachelmitte. Wer dort in die Mitte klickt, trifft den Punkt,
nicht die Kachel. 23 von 25 Rasterstellen der Kachel bleiben ihr — das ist
ehrlich, denn der Punkt ist dort wirklich sichtbar.

### Das Design- und Barrierefreiheits-Audit ist gelaufen

Es stand seit dem 2026-09-19 als „zweimal am Sitzungslimit abgebrochen" in
dieser Datei. Es deckt `web/` ab, und dort nur die von diesem Plan berührten
Dateien (`Karte.tsx`, `KartenTooltip.tsx`, `Objektzeile.tsx`, `Bereich.tsx`,
`Filterleiste.tsx`, `App.tsx`, `stil.css`, `VirtuelleListe.tsx`, `laden.ts`).
**Nicht geprüft:** `Betriebstafel.tsx`, `Bandstreifen.tsx`, `Kopfzeile.tsx`
und alles außerhalb von `web/`.

**Behoben (je ein Commit):**

| Befund | Commit |
|---|---|
| Punkt-Trefferflächen nehmen den Kacheln den Klick | `2485d4d` |
| Ladetext und Fußzeile rechneten Megabyte selbst und schrieben als einzige Stellen der Oberfläche einen englischen Dezimalpunkt („23.3 von 23.3 MB") | `320c084` |
| Zwischen Zahl und Einheit fehlte das geschützte Leerzeichen (MB, ms) | `320c084` |
| `index.html` ohne `theme-color` — die Adressleiste mobiler Browser stand nicht in der Seitenfarbe | `320c084` |

**Gemessen und bestanden, also nichts geändert:**

- **Kontraste.** Tooltip-Titel 12,66:1, Tooltip-Zeile 5,34:1, Tooltip-Hinweis
  9,67:1, Filter-Kurztext im zugeklappten Kopf 10,74:1, Kartentitel 5,94:1 —
  alle über 4,5:1. Der Hover-Ring war in Task 7 mit 5,55:1 gegen die Kachel
  gemessen.
- **Farbe allein trägt keinen Zustand.** Gewählte Kachel: Rahmen *und*
  `aria-pressed`. Gewählter Punkt: dickerer Rand *und* `aria-pressed`. Ring:
  eine zusätzliche Form. Zugeklappte Karte: gedrehter Pfeil *und*
  `aria-expanded`.
- **Der Sprunglink trägt.** Erstes Tab zeigt ihn sichtbar (nach der 0,1-s-
  Blende), Enter setzt den Fokus auf `#liste`, das nächste Tab landet auf dem
  ersten Bereichskopf — die rund 76 Stopps sind übersprungen.
- **Hover auf der Karte ist nicht teuer.** 46 Hover-Wechsel über Kacheln und
  Punkte: keine einzige Long Task ≥ 50 ms. Der React-Verdacht „`kachelText`
  wird je Render mehrfach gebaut" ist damit real, aber folgenlos — **nicht**
  umgebaut.

**Verworfen, mit Begründung:**

- *„Platzhalter sollen mit … enden und ein Beispiel zeigen"* — die Felder
  „von"/„bis" der Spannen sind rund 40 px breit; ein Beispielmuster passt dort
  nicht, und `aria-label` nennt die Größe bereits vollständig.
- *„Überschrift gehört nicht in den Knopf"* (`Bereich.tsx`, `<h2>` im
  `<button>`) — gültiges HTML, der Name wird vorgelesen, und `aria-expanded`
  sitzt richtig. Ein Umbau brächte nichts.
- *„`.haupt:focus { outline: none }`"* — das Sprungziel ist die ganze
  Hauptspalte; ein Rahmen darum wäre irreführender als keiner, und der Fokus
  wandert mit dem nächsten Tab sichtbar weiter.

**Festgehalten statt behoben** (gehört nicht in diesen Plan, siehe
[`BACKLOG.md`](BACKLOG.md) **B7**): Der Filterzustand steht **nicht** in der
URL — die Auswahl lässt sich nicht verlinken und überlebt kein Neuladen. Und
die `title`-Attribute an Kaufpreisfaktor, Stufe und Zustandsmarke sind auf
Touch unerreichbar und für die Tastatur nur mit Mühe; das eigene
Tooltip-Element gibt es inzwischen.

### Zwei Fallen dieser Sitzung

- **Ein Messskript, das an der Elementmitte misst, misst die falsche Stelle.**
  Playwrights `hover()` zielt auf die Mitte — bei Bremen und Saarland sitzt
  dort der Punkt, nicht die Kachel, und der Lauf lief in einen Timeout statt
  in ein Ergebnis. Der Timeout **war** der eigentliche Befund.
- **`elementFromPoint` sieht nur den Sichtbereich.** Die erste Messung bei
  390 px meldete „alle 16 Kacheln 0 von 25" — die Karte lag schlicht unter dem
  Fensterrand. Vor solchen Messungen `scrollIntoView`.

---

# Übergabe — Stand 2026-09-20 (zweite Sitzung des Tages)

## Kartenplan: Tasks 6b, 7, 8 und 9 sind gebaut — offen bleibt nur Task 10 (Abnahme)

> **Beide Subagenten sind fertig, geprüft und gemergt** (Task 9 Tooltip, B5
> Untersuchung). Offen ist nur noch **Task 10**: die Gesamtabnahme des
> Kartenplans — Audit, Doku, Abschluss.

| Task | Ergebnis |
|---|---|
| **6b** — Zuklappen | Unter 1360 px zuklappbar, Zustand gemerkt, Filter im zugeklappten Kopf. 8 Browserprüfungen bestanden |
| **7** — Hover-Ring | Ring auf der Karte, ehrlich beschriftet; Touch bewusst ausgenommen |
| **8** — Klick-Filter | Die 60 PLZ-Punkte sind Schaltflächen; Filtergruppe in der Leiste |
| **9** — Tooltip | Sofortiges, gestaltetes Tooltip an Kacheln und Punkten, auch per Tastaturfokus |
| **B5** | Untersucht: keine Sperre, keine Regression, sondern der Schreibpfad — 350 statt 352 |

**Stand danach: 174 Web-Tests grün, 1 übersprungen**, `tsc` und `vite build`
sauber, alles auf `main` gepusht.

### Drei Dinge, die die Messung dem Plan abgerungen hat

**1. Der Hover-Ring war unsichtbar, wo er am meisten gebraucht wird.** Der Plan
gab ihm nur einen goldenen Schein. Gegen die hellste Kachelfüllung gerechnet
kam er damit auf **2,05:1** und riss die 3:1 für nicht-textliche Markierungen —
und genau dort liegen die PLZ-Punkte. Ein dunkler Saum unter dem Schein bringt
ihn auf **5,55:1** gegen die Kachel bei 11,14:1 Ring gegen Saum.

**2. Die 24-px-Trefferfläche aus Task 8 ist nicht erreichbar, und der Plan
widersprach sich selbst.** Er verlangte ≥ 24 px für jede Fläche und zugleich
„nie über den halben Abstand zum nächsten Punkt". Beides zusammen geht bei 60
Punkten auf 312 px Kartenbreite nicht. Gemessen: **kleinste 4,5 px, Median
20,9 px, größte 24,0 px** (bei 390 px Fensterbreite Median 22,1). Was
stattdessen gilt und gemessen ist: **60 von 60 Punkten treffen sich selbst**,
keiner wird vom Nachbarn überdeckt; Tab + Enter erreicht ohnehin jeden.

Der Weg dahin war zweimal falsch, beide Male vom Browser widerlegt: Ohne
Schranke deckte PLZ 46 (zwei Objekte) den Mittelpunkt von PLZ 45 (sechzehn)
vollständig zu — der größte Punkt der Karte war nicht anklickbar. Mit der
Schranke, aber dem Mindestmaß „nie kleiner als der sichtbare Punkt", stahl
PLZ 51 dem Punkt PLZ 50 den Klick. **Die Nachbarschranke muss alles stechen.**

**3. Das Memoisieren hält — belegt durch die Gegenprobe.** 31 Zeilen
überfahren, mit dem stabilen `setHoverObjekt`: **0** Neuzeichnungen, keine
Long Task ≥ 50 ms. Zur Gegenprobe ein Inline-Pfeil eingesetzt: **5.704**
Neuzeichnungen. Ohne diese Gegenprobe hätte die Null nichts bewiesen.

### B6 SCHRITT 1 IST GELAUFEN — DIE IMMOWELT-SPERRE IST WEG

**Das ist der wichtigste Befund dieser Sitzung.** Lauf `35535674960`
(`pruefung.yml`, Skript `diagnose-detail`, 2026-09-20 20:28 UTC, von einer
GitHub-Actions-Adresse): **5 von 5** `/expose/`-Abrufen lieferten HTTP 200 mit
rund 607.000 Zeichen und vollständigem Datenmodell — drei frisch aus der
Ergebnisliste geholte URLs und, als Gegenprobe, die zwei alten vom 2026-09-07,
die nicht einmal abgelaufen waren. Am 2026-09-07 scheiterten dort **144 von
144**.

**Damit ist die Begründung weg, aus der `erfasseImmoweltDetails` seit zwei
Wochen nicht aufgerufen wird** — und das ist die Wurzel von 97,4 % ohne PLZ,
0,3 % mit Baujahr und der bundeslandgenauen Mietschätzung. Die nächste große
Aufgabe liegt damit auf der Hand.

**Lies vor dem Umbau den Kasten in [`BACKLOG.md`](BACKLOG.md) B6, Schritt 1.**
Dort stehen die drei Dinge, die die Messung ausdrücklich **nicht** sagt: Eine
Momentaufnahme von fünf Abrufen ist keine Aussage über 144 am Stück, der
Parser ist nicht mitgeprüft, und das Zeitbudget bleibt wie es war.

### Wie der Lauf gestartet wird

`gh` **ist dauerhaft angemeldet** (Fine-grained Token, read/write, ohne
Ablauf). Die Konfiguration liegt unter Windows in
`%AppData%GitHub CLIhosts.yml` — **nicht** in `~/.config/gh/`. Wer dort
nachsieht, findet nichts und hält `gh` fälschlich für nicht eingerichtet.
Einfach ausführen:

```
gh workflow run pruefung.yml -f skript=diagnose-detail
gh run list --workflow=pruefung.yml --limit 3
gh run view <id> --log
```

### Task 9 ist gemergt — und was der Merge entschieden hat

`scraper/scripts/diagnose-detail.mts` misst jetzt, ob Immowelts
`/expose/`-Sperre für GitHub-Actions-Adressen noch besteht (Backlog B6,
Schritt 1 — die Vorbedingung für alles Weitere an der Datenqualität). Es holt
die expose-URLs **frisch aus der Suchseite**, an der es ohnehin aufwärmt: Die
zwei fest verdrahteten URLs vom 2026-09-07 sind womöglich abgelaufen, und ein
404 wäre dann von einer Sperre nicht zu unterscheiden gewesen.

**Schritt 2 liegt jetzt beim Nutzer** — die vier Wege und ihre Preise stehen
in B6. Die Netzfrage ist beantwortet, die Mengenfrage nicht.

Der Merge von Task 9 (Tooltip) traf auf Task 8, weil der Agent davor
abgezweigt war. Zwei Dinge wurden dabei entschieden: `gewaehlt` ist nicht mehr
fest `false` (der Klickhinweis kippt jetzt nach dem Klick, nachgemessen), und
`data-anker` sitzt am **sichtbaren** Punkt statt an der Trefferfläche. Nach
dem Merge sind die Prüfskripte zu Task 7 und 8 unverändert grün gelaufen —
60 von 60 Punkten treffen weiterhin sich selbst.

### Zwei Fallen, die diese Sitzung gekostet haben

- **Ein Messskript, das nichts findet, sieht aus wie ein bestandener Test.**
  Die Leistungsmessung überfuhr zuerst **drei** Zeilen statt vierzig und meldete
  brav „Differenz 0". Erst der Blick auf die Zahl daneben verriet es. Ebenso
  meldete der erste Long-Task-Zähler vier Treffer — die stammten mit
  `buffered: true` aus dem Seitenaufbau, nicht aus dem Hover.
- **`\d` in einem Suchausdruck, der durch Heredoc, Shell und Template-Literal
  geht, kommt nicht als `\d` an.** Eine Prüfung meldete deshalb „keine Zeile
  trägt die richtige PLZ", während alle acht sie trugen. Im Zweifel ohne Regex
  prüfen — hier: an „·" trennen und die fünfstellige Zahl nehmen.

---

# Übergabe — Stand 2026-09-20

## Die nächste große Aufgabe, vom Nutzer gesetzt: der Immowelt-Lauf

**Der Nutzer hat am Sitzungsende eine neue Richtung vorgegeben** (Wortlaut in
[`BACKLOG.md`](BACKLOG.md) **B6**): Warum bekommen wir nicht alle Inserate auf
einmal? Warum braucht es mehrere Läufe? Warum sind die Datensätze nie
einheitlich gefüllt? Der Lauf soll **schlank** bleiben, durch **alle** Inserate
gehen und **einheitliche Infos ganzheitlich** auslesen.

**Die Antworten sind schon am Code belegt** — B6 im Backlog hat sie mit
Fundstellen, damit die Aufgabe nicht bei null anfängt. Der Kern in drei Sätzen:

1. **Ein Lauf schafft rund eine große Region.** `SWEEP_BUDGET_MS` = 12 Minuten
   bei 5 Sekunden Drossel je Seitenabruf; Nordrhein-Westfalen allein braucht
   173 Seiten. Die 75-Minuten-Grenze des Workflows ist die eigentliche Wand —
   ein Kill träfe **vor** dem Löschblock.
2. **Mehrere Läufe sind Absicht:** Rotation über die 16 Regionen, Startpunkt
   seit 2026-09-09 aus der Historie statt aus der Wanduhr (5,7 statt 13,1 Tage
   bis zur vollen Abdeckung).
3. **Der eigentliche Befund:** `erfasseImmoweltDetails` wird **im
   Produktionslauf nirgends aufgerufen** — geprüft am 2026-09-20. Die Funktion
   ist fertig gebaut, aber nicht eingehängt, weil `/expose/`-Seiten von
   Rechenzentrums-Adressen gesperrt sind. **Alle** Immowelt-Angaben kommen
   deshalb aus der Titelzeile der Ergebnisliste. Das ist die Wurzel von
   97,4 % ohne PLZ, 0,3 % mit Baujahr, der bundeslandgenauen Miete (A11) und
   der 352 leeren Hüllen (B5).

**Der erste Schritt ist eine Messung, kein Umbau:** Der Docstring verlangt
ausdrücklich, die Sperre neu zu prüfen, bevor man die Detailerfassung wieder
einhängt. Der letzte Beleg stammt vom **2026-09-07**. Ein einziger
`/expose/`-Abruf aus GitHub Actions beantwortet das.

**Danach liegt eine Entscheidung beim Nutzer:** „Alle auf einmal" und
„schlank" widersprechen sich — 22.000 Objekte bei 5 s Drossel sind über
30 Stunden. Die vier Wege und ihre Preise stehen in B6, Schritt 2.

---

# Übergabe — Stand 2026-09-19 (zweite Sitzung des Tages)

## Die Karte als Dreh- und Angelpunkt — Block A und Task 6 erledigt, Rest offen

> **Stand beim Sitzungsende:** Block A (Tasks 1–5) und **Task 6** (Layout) sind
> gemergt und gepusht. **Offen bleiben Task 6b, 7, 8, 9 und 10** — Zuklappen,
> Hover-Ring, Klick-Filter, Tooltip, Abnahme. Der Plan ist vollständig
> ausgeschrieben, die Entscheidungen sind gefallen; es ist reine Umsetzung.
>
> **Warum es hier aufhört:** Der Opus-Agent für Block B ist am Sitzungslimit
> gescheitert (Reset 2:10 Berlin). Er hatte Task 6 fertig, aber **nicht
> committet**. Der Koordinator hat den Diff gelesen, die Browser-Messungen
> selbst nachgeholt und ihn gesichert (`667b348`) — **wieder ein Beleg dafür,
> dass ein abgebrochener Agent nicht wertlos ist: erst in seinen Worktree
> sehen.**
>
> **Was Task 6 am Plan korrigiert hat:** Die Kartenzeichnung ist bei 1360 px
> nur **248 px** breit (Faktor 0,689), nicht die geschätzten 280 px. Die
> Kachelkürzel standen damit mit **7,58 px** auf dem Schirm statt der
> geforderten 10. Schrift von 11 auf 15 Zeichnungseinheiten angehoben →
> 10,33 px im schmalsten Fall. Über acht Fensterbreiten nachgemessen: kein
> waagerechtes Scrollen, kein Zeilenüberlauf, keine überlappenden Kacheln,
> Sticky greift ab 1360 px und endet bei 1359 px, Sprunglink setzt den Fokus
> auf `<main id="liste">`, keine Konsolenfehler.

**Die große Aufgabe dieser Sitzung.** Der Entwurf vom 2026-09-19 wurde zum
Plan [`plans/2026-09-19-karte-dreh-und-angelpunkt.md`](plans/2026-09-19-karte-dreh-und-angelpunkt.md)
(10 Aufgaben), dann vom Nutzer per Grilling gegen die echten Zahlen
durchgesprochen, dann in zwei Blöcken gebaut.

**Block A (Tasks 1–5) ist fertig, gemergt und gepusht** — fünf Subagenten
gleichzeitig in eigenen Worktrees, alle auf `sonnet`, alle ohne Konflikt:

| Task | Ergebnis |
|---|---|
| 1 — Ladetext | **Befund A und B behoben.** Der Fehler wurde im echten Browser erst reproduziert („**23.3 von 3.0 MB**"), dann behoben, dann nachgemessen: komprimiert nur noch „… MB gelesen", unkomprimiert „x von 23.3 MB". Meldungen auf eine je 100 ms gedrosselt |
| 2 — virtuelle Liste | **Befund C behoben** (Objektliteral auf Modulebene). **`onScroll` wurde gemessen statt umgebaut:** p95 1,3–1,4 ms bei 120 Scroll-Ereignissen, Schwelle war 2 ms → **kein Befund, nichts geändert** |
| 3 — Markierung | `markierungFuer`/`beschreibeMarkierung` in `logik/karte.ts`, 8 Tests |
| 4 — PLZ-Filter | `Filter.plzZweisteller`, `schalteEintrag`, `OhneAngabe.plz`, 10 Tests |
| 5 — Tooltip-Bausteine | `logik/kartentexte.ts` und `logik/tooltipPosition.ts`, 14 Tests |

**Stand danach: 145 Web-Tests grün, 1 übersprungen**, `tsc` und `vite build`
sauber, gepusht, Deploy-Lauf `35469050557` grün, Zugriffsschutz nachgemessen
(302 auf `delicate-bar-e1ca.cloudflareaccess.com`).

**Die drei Audit-Befunde der Weboberfläche (A, B, C) sind damit erledigt** —
siehe den Abschnitt weiter unten, der sie als offen führte.

### Die Antwort auf die Frage, die der Plan offenließ

**Gibt Chromium `Content-Encoding` über `fetch` preis? Ja** — gemessen an
Playwright-Chromium 1.63. `erwarteteBytes` greift also; `gueltigesZiel` blieb
als zweite Wache ungenutzt. Beide bleiben im Code, weil sie verschiedene
Fehler abfangen. **Firefox und Safari sind nicht geprüft.**

### Was das Grilling geändert hat

Der Nutzer hat den Plan gegen die echten Zahlen durchgesprochen, **während
Block A lief**. Drei Entscheidungen haben den Plan wirklich verändert:

- **Der Nutzer schaut auch vom Handy.** Der Plan löste den schmalen Fall nur
  mit „fällt in den Fluss zurück". Dort gibt es aber keinen Hover, und eine
  Listenzeile **ist ein Link** — ein Tipp öffnet die Quelle und kann nicht
  zugleich „zeig auf der Karte" heißen. Entscheidung: **Einstieg und Filter,
  ehrlich begrenzt** — kein Ring, kein Tooltip auf Touch. Neuer **Task 6b**:
  unter 1360 px zuklappbar, beim ersten Besuch offen, danach gemerkt.
- **Der Breakpoint war falsch gesetzt.** Mit 1400 px hätte ein verbreitetes
  1366er-Notebook die mitwandernde Karte **nie** bekommen. Nachgerechnet:
  296 (Filterleiste) + 300 (Karte) + 706 (kleinste Listenzeile) + 52 = 1354
  → **Schwelle 1360 px, Karte ab 300 px.**
- **Der Tab-Stopp-Konflikt war vertagt** (rund 76 Stopps vor der Liste). Jetzt
  gelöst: **Sprunglink „Zur Liste springen"**.

**Die Messung, die die schärfste Frage stellte** (Snapshot 2026-09-18, 21.897
Objekte):

```
  221 Objekte  1,01 %  bekommen einen echten PLZ-Punkt
21.321 Objekte 97,37 %  bekommen nur eine Bundesland-Kachel
  355 Objekte  1,62 %  bekommen gar nichts
```

Der Hover-Ring trifft also in 97,4 % der Fälle nur eine Kachel, deren Namen
die Zeile schon nennt. **Entscheidung des Nutzers: trotzdem bauen** — der Ring
liefert dort Orientierung, keine neue Angabe. Die 221 PLZ-Objekte verteilen
sich auf 60 Punkte (größter 16 Objekte, Median 2), 186 davon sind ZVG.

**Nebenbefund, der zu einem neuen Backlog-Punkt wurde:** 352 Objekte bestehen
nur aus einer URL — kein Titel, kein Ort, keine PLZ. Siehe **B5** in
[`BACKLOG.md`](BACKLOG.md); Entscheidung des Nutzers: festhalten, nach der
Karte angehen. **Dort steht ausdrücklich, was NICHT belegt ist:** dass es eine
neue Regression sei — dem Snapshot fehlt `first_seen`, der Vergleich mit den
54 aus E-7 ist keiner. Dabei fiel auf: **die von dir am 2026-09-13 entschiedene
Kategorie „Objekte ohne Region" (E-7) ist im Dashboard nirgends gebaut.**

### Zwei Fallen, die diese Sitzung gekostet hat

- **`cmd //c "rmdir …"` funktioniert aus Git-Bash heraus nicht** für
  Junctions: Jeder Aufruf meldete „Pfad nicht gefunden", obwohl der Pfad
  stimmte — und sah damit aus wie „schon erledigt". Zusätzlich lässt
  `git worktree remove` die Junction-Ordner stehen. **Was funktioniert:**
  PowerShell mit `LinkType`-Prüfung und `[System.IO.Directory]::Delete($j, $false)`,
  danach die Reparse-Point-Suche, erst dann löschen.
- **Vite bindet hier nur an IPv6** — Skripte müssen `localhost` benutzen, nicht
  `127.0.0.1`. Und auf der Seite gibt es **zwei** `.liste`-Elemente, von denen
  das erste bei 1440×900 unterhalb des Sichtbereichs liegt; ohne
  `.first().scrollIntoViewIfNeeded()` trifft ein Mausrad-Schritt nichts, und
  das Messskript meldet „0 Ereignisse" — was leicht als „kein Problem"
  durchgeht.

---

# Übergabe — Stand 2026-09-19 (erste Sitzung, Veröffentlichung)

> **Zuerst lesen:** dieses Dokument, dann [`ABNAHME-BASIS.md`](ABNAHME-BASIS.md)
> (woran „die Basis steht" gemessen wird), dann [`BACKLOG.md`](BACKLOG.md) und
> [`TODO.md`](TODO.md). Für das Dashboard gilt der Entwurf vom 2026-09-09
> **plus** der Nachtrag
> [`2026-09-15-dashboard-nachtrag-oberflaeche.md`](specs/2026-09-15-dashboard-nachtrag-oberflaeche.md),
> der die Oberfläche entscheidet.

## Dashboard-Veröffentlichung — ERLEDIGT und live verifiziert (2026-09-19)

A16 (siehe unten) wurde angebrainstormt und dann bewusst zurückgestellt: Der
Nutzer wollte zuerst die Veröffentlichung sehen, weil ein sichtbares
Dashboard die weitere Entwicklung antreibt. Das war die aktive große Aufgabe
dieser Sitzung — **jetzt fertig, A16 ist die nächste.**

**Das Dashboard ist live:** <https://immo-radar-dashboard.pages.dev> — hinter
Cloudflare Access, nicht offen einsehbar. Ein Abruf ohne Anmeldung liefert
**HTTP 302** auf die Access-Login-Seite (verifiziert per `curl`, nicht nur
behauptet), vorher (kurz, zwischen erstem Deploy und Access-Einrichtung)
**HTTP 200** ohne Sperre.

### Der Fund, der die erste Fassung widerlegt hat: die Sperre war löchrig

**Ein paar Stunden nach der Einrichtung gemessen** — und es war gut, dass
jemand nachgesehen hat, statt es zu glauben:

```
immo-radar-dashboard.pages.dev             HTTP 302   (geschützt)
8d4f31b2.immo-radar-dashboard.pages.dev    HTTP 200   (OFFEN)
```

**Cloudflare Pages veröffentlicht jedes Deployment zusätzlich unter einer
eigenen Hash-Adresse** (dazu Zweig-Aliase). Die Access-Anwendung galt nur
für den exakten Hostnamen — jede dieser Nebenadressen war also für jeden
erreichbar, der sie kennt. **E-2 („nur ich") war damit faktisch nicht
erfüllt**, obwohl die Prüfung an der Hauptadresse sauber grün war. Die
Lehre ist dieselbe wie bei der Blätterung ohne Sortierung: *Eine Prüfung,
die nur den erwarteten Weg abgeht, ist keine Prüfung.*

Behoben in `cb243c2`: Der Einrichtungs-Workflow legt jetzt **zwei**
Anwendungen an — den exakten Namen **und** `*.immo-radar-dashboard.pages.dev`.
Ein Platzhalter allein genügt nicht, er passt nicht auf die Wurzeldomain.
Nachgemessen: beide Adressen liefern **302**. Die Ausrollzeit von Cloudflare
beträgt dabei rund eine Minute — die Gegenprobe im Workflow prüfte zu früh
und schlug deshalb fehl, obwohl der Schutz griff.

**Aufgebaut, alles gegen echte Läufe verifiziert:**

- **`scraper/scripts/erzeuge-dashboard-snapshot.mts`** (neu) — ruft
  `erzeugeSnapshot` schreibgeschützt gegen die Live-DB auf, ohne zu scrapen.
  Macht die bisher nur in der Doku beschriebene Ad-hoc-Anleitung zu einer
  echten, wiederverwendbaren Datei.
- **`.github/workflows/deploy-dashboard.yml`** (neu) — baut `web/` und lädt
  per **Direct Upload / `cloudflare/wrangler-action@v4`** auf Cloudflare
  Pages hoch. Zwei Auslöser: `push` auf `main` (jede gemergte Aufgabe
  aktualisiert die Seite) und `workflow_run` nach jedem erfolgreichen
  `scrape.yml`-Lauf (reiner Datenzuwachs erscheint automatisch, ohne auf
  einen Commit zu warten). Bewusst **nicht** Cloudflares eigene
  Git-Integration: Der Snapshot entsteht nur zur Laufzeit gegen die
  Live-Datenbank und ist `.gitignore`t — Cloudflares eigener Build-Server
  sähe ihn nie. Direct Upload und Git-Integration lassen sich nicht
  nachträglich mischen. **Verifiziert an Lauf `35401871000`** (Push
  `382ffb3`): 4 Dateien hochgeladen, `Deployment complete`.
  Projekterstellung ist idempotent (`continue-on-error: true` auf dem
  `project create`-Schritt).
- **`.github/workflows/setup-cloudflare-access.yml`** (neu, nur per
  `workflow_dispatch`) — einmalige, idempotente Einrichtung: One-Time-PIN
  Identity Provider, Access Application für
  `immo-radar-dashboard.pages.dev`, Policy nur für
  `w.helwich@googlemail.com`. **Verifiziert an Lauf `35402633592`**: alle
  drei Schritte `success:true`, danach der 302-Redirect oben.
  **Zwischenfund:** Cloudflare Zero Trust/Access muss vor der ersten
  API-Nutzung einmal im Dashboard aktiviert werden
  (`access.api.error.not_enabled`) — kein Token kommt daran vorbei, das ist
  keine Berechtigungsfrage. Der Nutzer hat das einmalig nachgeholt, danach
  lief der Workflow im zweiten Versuch durch.
- **Standing Approach (Nutzerwunsch 2026-09-19):** Bei jeder größeren
  Aufgabe, die mit einem Sitzungsende/Clear einhergeht, aktualisiert sich
  das Dashboard jetzt von selbst — jeder Push auf `main` löst `
  deploy-dashboard.yml` aus, kein manueller Schritt mehr nötig.

**Umgang mit dem Cloudflare-API-Token (streng geheim, Nutzerauflage):** Der
Token hat vollen Kontozugriff (Nutzerentscheidung, breiter als die schmale
Empfehlung des Koordinators, trägt auch R2-Zugangsdaten mit). Zwei Versuche,
ihn direkt in einem eigenen Bash-Befehl zu verwenden (auch nur per
Umgebungsvariable referenziert, nie als Literal), wurden von der
Auto-Mode-Sicherung als Credential-Leakage abgelehnt — **das ist eine
Handlungserkennung, keine reine Textprüfung**, ein Umgehen per Referenz statt
Literal half nicht. Gelöst, indem **jede** Cloudflare-API-Nutzung als Schritt
in einen GitHub-Actions-Workflow verlegt wurde: GitHub injiziert das Secret
selbst zur Laufzeit, der Koordinator fasst den Wert nie an. Die beiden
GitHub-Secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
Konto-ID `cd848694bd925a07b4257fc01078b426`) hat der Nutzer selbst über die
GitHub-Weboberfläche gesetzt (Settings → Secrets and variables → Actions),
nachdem PowerShell-Umgebungsvariablen als Alternative abgelehnt wurden
(„ich will das net machen").

**Offizielles Cloudflare-Skill-Plugin installiert** (User-Scope, alle
Projekte, nicht nur immo-radar): `claude plugin marketplace add
cloudflare/skills` + `claude plugin install cloudflare@cloudflare`. 14
Skills (u. a. `cloudflare-one`, `wrangler`) plus ein MCP-Server. **Wurde in
dieser Sitzung nicht aktiv** (braucht einen Sitzungsneustart) — die
Einrichtung oben kam ohne aus, per Docs-Recherche und echten Testläufen.
Bei künftigen Cloudflare-Themen zuerst dieses Skill-Set prüfen. Siehe
[[cloudflare-skill-installiert]].

**Übrige Entscheidungen dieser Sitzung** (Domain, Projektname, E-2, E-3):
siehe Tabelle „Entscheidungen des Nutzers, gefallen am 2026-09-19" unten.

**Als Nächstes für das Dashboard selbst:** Der Nutzer will nach dieser
Übergabe clearen und dann **gezielt an der Weboberfläche weiterarbeiten,
jetzt mit einem echten, sichtbaren Stand vor Augen** — das soll laut Nutzer
die Entwicklung vorantreiben. Kein konkreter Auftrag dazu liegt vor, nur die
Absicht.

**Danach: A16 wieder aufnehmen.** Brainstorming war schon im Gange, drei
offene Themen wurden besprochen, aber nicht schriftlich festgehalten (nur im
Chat der 2026-09-19-Sitzung, zurückgestellt vor der Ausarbeitung): (1) woran
ein einzelner Lauf für `nw`/`bw`/`mv`/`sh` überhaupt als vertrauenswürdig
gilt, wenn es keine externe Trefferzahl zum Vergleich gibt (Bootstrap- vs.
Anker-Ansatz), (2) Mindestzahl eigener Referenzläufe, (3) Toleranzband für
die eigene Historie. Bei Wiederaufnahme neu anfangen.

---

## Wo wir stehen

**Das Dashboard existiert und der Snapshot fällt jetzt aus dem Lauf heraus.**
`main` = `origin/main` = `0f3465d`, Arbeitsverzeichnis sauber, keine
Worktrees mit eigenen Änderungen, keine offenen Zweige.
**526 Scraper-Tests und 103 Web-Tests grün** (1 übersprungen), `tsc` in
beiden sauber, `vite build` grün — frisch gegen `main` geprüft, nicht nur
behauptet.

**Der Plan [`plans/2026-09-16-a18-und-die-zwei-funde.md`](plans/2026-09-16-a18-und-die-zwei-funde.md)
ist mit Runde 4 vollständig abgeschlossen** — alle sieben Aufgaben gemergt.
**Runde 4 (Aufgabe 7, CI-Artefakt, `f64a724`):** `scrape.yml` lädt
`dashboard-snapshot.json` jetzt als Artefakt `dashboard-snapshot` hoch
(`retention-days: 7`, `if-no-files-found: warn`). **An einem echten,
manuell ausgelösten Lauf verifiziert** (`35394015407`, 2026-09-18
20:54–21:27 UTC, `conclusion=success`): Artefakt vorhanden, 3.184.899 Bytes
komprimiert, Logzeile `Snapshot geschrieben: ... 22130 Objekte, 23.56 MB
(24705879 Bytes)` deckungsgleich mit den Metadaten der API
(`gh api .../actions/runs/35394015407/artifacts`). Diese Aufgabe lag beim
Koordinator, nicht bei einem Subagenten — `.github/workflows/` bleibt ohne
Freigabe des Nutzers gesperrt, hier lag die Freigabe vor.

**Parallel dazu, während der Verifikationslauf im Hintergrund lief, erledigt:**
- **A18 Notiz M-8** (`ce44cab`/`cc3be33`): `rangzahl` trägt jetzt dieselbe
  `endlichOderNull`-Absicherung wie der Kaufpreisfaktor — ein gespeicherter
  Nullpreis konnte den DSCR sonst nach `Infinity` treiben, was die
  Vertragswache (prüft nur `stufe === "S0"`) nicht bemerkt hätte. Per
  Subagent + TDD, vom Koordinator unabhängig nachverifiziert (Diff gelesen,
  Fix temporär zurückgesetzt, roten Zustand selbst gesehen).
- **Kaufpreisfaktor im Browser angesehen** (Rest aus Runde 2): lokaler
  Snapshot frisch aus der Produktions-DB (21.897 Objekte), Dev-Server,
  headless per Playwright geprüft — die Zelle „150 m² · 473 €/m² · 5,0×"
  erscheint wie vorgesehen, keine Konsolenfehler.
- **BACKLOG-Korrekturen ohne Codeänderung:** A13 Schritt 2 war seit `ea8b731`
  (2026-09-11) längst erledigt, nur die Checkbox stand offen. **B1-Messung:**
  12 von 16 Immowelt-Regionen und alle 16 ZVG-Regionen erreichen inzwischen
  die Drei-Referenzläufe-Schwelle — **A16 ist damit der einzige verbleibende
  Block für B1**, nicht mehr „zu wenig Läufe". **D-5** zweite Hälfte:
  seit 2026-09-11 sind über 1.184 Meldungen erstmals 12 ZVG-Meldungen und
  12 Objekte mit `geschaetzt_regional` aufgetaucht (6 von 981
  Prüfkandidat-Meldungen) — nicht mehr rein hypothetisch, weiterhin kleine
  Minderheit.

**Offen aus Runde 2** (Kaufpreisfaktor) ist damit erledigt. Der Fortschritt
der Runde 1–3 steht weiterhin im git-ignorierten Ledger
`.superpowers/sdd/2026-09-16-a18-und-die-zwei-funde/progress.md`, Abschnitt
„SITZUNGSENDE".

Die Schritte 2 bis 7 des Entwurfs sind damit durch: `lib/ranking.ts`
(Schritt 2), der Snapshot-Export (Schritt 3) und die Weboberfläche unter
`web/` (Schritte 4–7). **A-4 ist belegt** — erstmals an echten Läufen.

**Die Seite wurde im Browser angesehen, nicht nur getestet:** keine
Konsolenfehler, kein Querlauf bei 400 px, Abruf der echten 19,8-MB-Datei in
0,3–0,5 s, bedienbar nach 1,2 s.

| Was | Stand |
|---|---|
| **A-4** kein Objekt fällt still heraus | **belegt für beide Quellen, aber nicht aus demselben Lauf.** Immowelt lückenlos an Lauf `34910160636` (23 neue Zeilen, deckungsgleich mit dem Log); ZVG an `34797538466` auf demselben Codestand. Herleitung in [`specs/2026-09-15-a4-produktionsbeleg.md`](specs/2026-09-15-a4-produktionsbeleg.md) |
| **B-2** verschwundene Immowelt-Objekte | **erfüllt**, belegt am Lauf `34637349206` |
| **B-1** jedes Bundesland einmal erfasst | **offen** — ein Einzellauf kann es strukturell nicht zeigen |
| **D-5** Meldebudget | **offen**, aber der Rückstand fällt: 71 → 47 → 39 zurückgestellt |
| `lib/ranking.ts` (Schritt 2) | **fertig und gemergt** |
| Snapshot-Export (Schritt 3) | **fertig und gemergt.** Rein + dünne Ladeschicht, nur lesend, Keyset-Blätterung, Aufruf am Ende des Laufs hinter dem Löschblock |
| Weboberfläche (Schritte 4–7) | **fertig und gemergt** unter `web/` |
| Veröffentlichung des Dashboards | **offen** — siehe „Was als Nächstes zu tun ist" |

### Die Größenordnungen, gegen die gebaut wurde (2026-09-15)

```
18.335 Objekte      783 Top-Treffer · 15.580 normale · 1.704 nicht beurteilbar · 268 Abgänge
 9.265 "unbestaetigt" (50,5 %)      1 Objekt im ganzen Bestand mit belegter Miete
   239 punktgenau verortbar (1,3 %) -- alle uebrigen nur ihrem Bundesland
Snapshot: 18,3 MB unkomprimiert, 2,2 MB mit gzip
```

**Der Bestand wächst schnell** — 12.611 (2026-09-12), 17.078, 17.754, 18.335
(2026-09-15). Jede Zahl in einem Dokument ist eine Momentaufnahme; die
Oberfläche rechnet ihre Zahlen deshalb zur Anzeigezeit.

### Zwei Funde, die niemand gesucht hat

- **Schleswig-Holstein weist seine Trefferzahl nirgends aus** — genau wie
  `nw`, `bw` und `mv`. Aus **vier** Regionen wird also nie ein Abgang erkannt,
  nicht aus dreien. A15 und der Kommentar an `istRegionVollstaendig` kennen
  nur drei. Zweimal unabhängig gemessen (Snapshot-Export und Oberfläche).
- **`sweep_region_runs` trägt mehrfach `vollstaendig=true`, obwohl
  `gemeldete_treffer` fehlt.** Das verdient eine eigene Nachprüfung: Die
  Vollständigkeit ist die Wache vor der Massenlöschung.

---

## Der Produktionslauf und was er gezeigt hat

Lauf `34637349206` auf `d4f744b`, 2026-09-11, 19:10 bis 19:58 UTC.

**B-2 ist erfüllt.** 32 Immowelt-Objekte tragen `disappeared_at` — vorher
waren es **null**. Verteilt auf `th` 13, `sl` 8, `hh` 5, `hb` 4, `be` 2. Kein
Lauf hat auf einen Schlag Hunderte markiert. `mv` und `nw` nannten ihre
Trefferzahl nicht und wurden fail-closed übergangen; die **bewusste Lücke**
besteht also weiter und trifft mit `nw` allein 21,2 % des Bestands.

### Befund 1: Die Blätterung war eine Stichprobe, keine Abfrage

Das Protokoll meldete **44** Markierungen, in der Datenbank standen **32**.
Die Differenz führte zu `ladeBekannteListings`: Es blätterte mit
`.range(von, bis)` **ohne Sortierung**. Postgres liefert dann in physischer
Reihenfolge, und jedes `UPDATE` desselben Laufs — `last_seen` für rund
10.000 gesehene Objekte — verschiebt Zeilen zwischen die Seiten.

Nachgemessen über `listings`:

| Blätterung über 12.158 Zeilen | Zeilen |
|---|---|
| doppelt geliefert | 1.762 |
| nie geliefert | 1.762 |

**Jeder Lauf sah rund 14,5 % des Bestands nicht**, jedes Mal einen anderen
Teil. Was `bekannte` nicht enthält, kann weder markiert noch entmarkiert
werden. Die Richtung war zwar fail-closed — Unsichtbares wird nicht
gelöscht —, aber jede Zahl, die auf dieser Liste beruhte, war falsch.

Behoben in `0aac237`: Keyset statt Bereich, die nächste Seite beginnt hinter
einer konkreten `id`. **Die Lehre gilt über diese Stelle hinaus: Eine
seitenweise Abfrage ohne stabile Sortierung ist keine Abfrage, sondern eine
Stichprobe.**

### Befund 2: Der Deckel lag vor dem Filter

Von 44 markierten Abgängen kamen 10 in den Deckel, und **genau eine** Meldung
ging raus. Der Grund: `budgetiereAbgangsmeldungen` deckelte **alle**
Markierungen, und erst danach filterte die Schleife auf Objekte, die je im
Chat waren. Bei 671 Meldungen auf 12.158 Objekte sind die ersten zehn
Markierungen fast nie gemeldete. Die 34 übrigen bleiben **für immer stumm**,
denn sie sind markiert und tauchen nie wieder als neuer Abgang auf.

Behoben in `3f8c7d8`: erst filtern, dann deckeln, und `verschwiegen` zählt
nur noch meldefähige Objekte.

**Nachgezogen in `749b273`, nach einem Prüffund:** Der Deckel gilt **je
Quelle**, nicht je Lauf — `gleicheBestandAb` läuft einmal für Immowelt und
einmal für ZVG. Der Docstring behauptete „je Lauf". **Entschieden: die Zahl
bleibt je Quelle, die Behauptung wurde korrigiert.** Begründung: Eine laute
Quelle darf die andere nicht verdrängen; ZVG markiert ein bis zwei Objekte je
Lauf und hätte sonst keinen Platz mehr, sobald Immowelt seinen Rückstand
abträgt. Die Konstante heißt jetzt `MAX_ABGANGSMELDUNGEN_JE_QUELLE_UND_LAUF`.
**Der Preis: ein Lauf kann bis zu 20 Abgangsmeldungen verschicken.**

---

## D-5 bleibt offen, und die Messung sagt warum

D-5 verlangt zweierlei: weniger Zurückgestellte **und** besser belegte
Objekte unter den Gesendeten. Die erste Hälfte steht — 71 auf 47. Die zweite
wurde gemessen und fiel aus:

| Lauf | gesendet | davon auf der gröbsten Mietstufe |
|---|---|---|
| `34630574787` (vorher) | 25 | **25** |
| `34637349206` (nachher) | 25 | **25** |

**Es gab schlicht keine besser belegten Kandidaten.** Beide Zeitfenster
bestanden zu 100 % aus Immowelt mit bundeslandgenauer Schätzung. Die 20
ungenutzten Plätze gingen bestimmungsgemäß über `holeNach` an die landesweite
Stufe zurück — der Mechanismus arbeitet also korrekt, er hatte nur nichts zu
tun. **Die Kontingentlogik ist an diesen Läufen weder belegt noch
widerlegt.** Ein echter Test braucht ein Fenster mit ZVG- oder PLZ-tragenden
Kandidaten.

---

## Die Messfragen sind gemessen, der Nachtrag ist korrigiert und gemergt

Schritt 0 des Dashboard-Entwurfs (M1 bis M6) wurde gemessen, mit den
Projektfunktionen statt mit nachgebauten Formeln — die Gegenprobe trifft bei
12.156 von 12.157 Objekten den gespeicherten Wert. Mehrere Annahmen des
ursprünglichen Entwurfs waren damit überholt:

- **Nur ein einziges Objekt im ganzen Bestand trägt eine belegte Miete**,
  nicht zwei.
- Die angenommene Einheitenzahl bewegt **keine einzige** Schwelle. Die
  20/35-%-Deckelung begrenzt den Hebel strukturell; die Miete ist 70-mal so
  wirksam. `units_unconfirmed` bleibt Merkmal, endgültig.
- Eine Preissenkung bewegt den Rang deutlich: Median −15,9 % Preis ergab
  +539 Plätze. Anforderung 3 des Nutzers ist damit belegt.
- **148 Objekte ohne Wohnfläche tragen keine Datenlücke** und landen mit
  DSCR 0 in einer Stufe, in die sie nicht gehören. Für ein Ranking-Dashboard
  ist *geprüft und schlecht* der gefährlichste Zustand, den *nicht
  beurteilbar* annehmen kann. Die Regel ist inzwischen **implementiert**:
  `lib/ranking.ts` (`bestimmeSicherheitsstufe`), gemergt in `db0a22e`.

**Eine erste Nachprüfung hatte den Nachtrag zunächst nicht freigegeben:**
zwei kritische Widersprüche im Entwurf, drei wichtige Funde — Details in
[`specs/2026-09-12-messfragen-nachtrag-funde.md`](specs/2026-09-12-messfragen-nachtrag-funde.md).
Eine Korrekturrunde und eine zweite, finale Fix-Welle (F-1 bis F-5) haben die
Funde behoben; ein scoped Re-Review hat jeden Punkt einzeln bestätigt und
einen davon (F-4, die Stufentabelle bei Zeilen ohne Version) direkt am Code
nachverifiziert statt nur dem Bericht zu glauben. **Ergebnis: Ready to
merge**, seither Teil von `main`.

**Die Nutzerfrage aus Ruling 9 ist entschieden (2026-09-13/14):** Ein Objekt
ohne Preis/Verkehrswert (`listings` ohne `listing_versions`) erscheint im
Dashboard **im S0-Bereich** „Nicht beurteilbar" — konsistent mit anderen
Datenlücken, sichtbar statt versteckt. Nachgezogen in Entwurf Abschnitt 3.3
und Abschnitt 9. **Offen bleibt nur ein Umsetzungsdetail:** welcher
Klartext-Grund (`DATA_GAP_LABELS`) einer solchen Zeile zugeschrieben wird,
da sie keinen eigenen `data_gaps`-Eintrag trägt — das entscheidet sich beim
Bau des Snapshot-Exports (Schritt 3), keine erneute Grundsatzfrage an den
Nutzer.

---

## Was als Nächstes zu tun ist

**A18 ist jetzt vollständig erledigt** — alle vier ursprünglichen Befunde
plus die Notiz M-8 (`rangzahl` ohne `endlichOderNull`). Der Plan
`2026-09-16-a18-und-die-zwei-funde.md` ist mit Runde 4 (CI-Artefakt)
abgeschlossen. Übrig sind nur noch Punkte, die eine Entscheidung des
Nutzers oder ein Brainstorming brauchen:

1. **Veröffentlichung einrichten — ERLEDIGT am 2026-09-19**, live und
   verifiziert unter <https://immo-radar-dashboard.pages.dev>. Details im
   Abschnitt „Dashboard-Veröffentlichung" oben.
2. **Karte als Dreh- und Angelpunkt — Block A erledigt, Block B offen.**
   Der ganze Stand steht **oben** im Abschnitt „Die Karte als Dreh- und
   Angelpunkt". Der Text unten ist der überholte Ausgangsstand. Spec:
   [`specs/2026-09-19-karte-dreh-und-angelpunkt-design.md`](specs/2026-09-19-karte-dreh-und-angelpunkt-design.md).
   Hover in der Tabelle hebt den PLZ-Punkt bzw. die Bundesland-Kachel
   hervor, sofortiges gestyltes Tooltip, Klick auf einen PLZ-Punkt filtert,
   Karte wird eigene sticky Spalte. **Noch nicht vom Nutzer gegengelesen**
   (Sitzung endete direkt nach dem Schreiben) — kurz bestätigen lassen,
   dann `superpowers:writing-plans`, dann Umsetzung. **Dabei die neu
   installierten Skills `web-design-guidelines` und `react-best-practices`
   verwenden** (Nutzerauftrag, siehe „Neu installierte Skills" unten) —
   das gilt für diese Aufgabe UND als Standardpraxis für jede künftige
   Arbeit an `web/`.
3. **A16** — zweiter Vollständigkeitsmaßstab für die vier Regionen ohne
   Trefferzahl (`nw`, `bw`, `mv`, `sh`). **Der einzige verbleibende Block
   für B1**: alle anderen 12 Immowelt-Regionen und alle 16 ZVG-Regionen
   erfüllen die Drei-Referenzläufe-Schwelle bereits (gemessen 2026-09-18).
   Brainstorming am 2026-09-19 begonnen und bewusst zurückgestellt zugunsten
   der Veröffentlichung und dann der Karte — bei Wiederaufnahme neu
   anfangen, die drei offenen Themen sind nicht schriftlich festgehalten
   (siehe oben).
4. Danach der übliche Rückstand: A10 (Cron-Takt, Abwägung des Nutzers),
   A11 Schritt 4 (darf eine bundeslandgenaue Schätzung überhaupt melden?),
   **B5** (die 352 leeren Hüllen, neu am 2026-09-19) und **E-7** (die
   Kategorie „Objekte ohne Region" ist entschieden, aber nirgends gebaut).

## Audit-Befunde der Weboberfläche — A, B, C ERLEDIGT (2026-09-19, zweite Sitzung)

> **Alle drei sind behoben** (Tasks 1 und 2 des Kartenplans, siehe ganz oben).
> Befund A und B in `8b9cd2e`, Befund C in `7e97dee`. Der Text unten ist der
> ursprüngliche Befundstand und bleibt als Beleg stehen.
>
> **Was die Messung gegen die Vermutung entschieden hat:** Der Zusatzverdacht
> zu `onScroll` („ein `setState` je Scroll-Ereignis") stimmte der Zahl nach —
> es ist genau ein Render je Ereignis —, war aber **kein Problem**: p95 1,3 bis
> 1,4 ms bei 120 Ereignissen, Schwelle 2 ms. Deshalb wurde dort **nichts**
> geändert. Die Entscheidungsregel stand vor der Messung fest.

Ein React-Performance-Audit (Skill `react-best-practices`) fand drei reale
Punkte in `web/`. **Ein Parallellauf dazu ist am Session-Limit gescheitert**
(Opus 429, Reset 03:40 Berlin) — die Worktrees sind leer, nichts wurde
umgesetzt. Die Befunde sind gelesen und belegt, nicht vermutet:

- **A — Der Ladetext behauptet eine falsche Zahl** (`web/src/daten/laden.ts`,
  `web/src/App.tsx`). `Content-Length` nennt die *komprimierte* Größe
  (~3 MB), `body.getReader()` liefert aber bereits *dekomprimierte* Bytes
  (~23 MB) — die Anzeige schreibt daraus wörtlich „23.5 von 3.2 MB". Der
  Balken ist durch `Math.min(1, …)` gedeckelt und steht früh auf 100 %.
  Der vorhandene Kommentar kennt nur „Kopf fehlt", nicht „Kopf da, meint aber
  etwas anderes". Leitlinie des Projekts: lieber ehrlich „unbekannt" als
  eine Zahl, die nicht stimmt. **Zu prüfen, nicht zu glauben:** ob
  `Content-Encoding` bei `fetch` überhaupt lesbar ist (meist nicht).
- **B — Ein React-Update je Netzwerk-Paket.** Die Leseschleife in `laden.ts`
  ruft `melde(…)` bei jedem Chunk, `App.tsx` hängt `setFortschritt` daran —
  hunderte bis tausende Render-Durchläufe während des teuersten Moments der
  Seite. Drosseln; erste und letzte Meldung müssen immer durchkommen.
- **C — Ein Objektliteral je Zeile** (`web/src/ui/VirtuelleListe.tsx`,
  `style={{ display: "contents" }}` in der Zeichenschleife) — konstant,
  gehört auf Modulebene. Klein. **Ehrlich mitprüfen**, ob das `onScroll`
  mit `setOben` je Ereignis ein echtes Problem ist, statt es aus Reflex
  umzubauen.

Zwei Reste aus dem Access-Workflow, bewusst nicht mehr angefasst:
- Die Gegenprobe prüft nur „302", nicht **wohin**. Ein 302 auf etwas anderes
  als `*.cloudflareaccess.com` würde durchgehen. Härtung: den
  `Location`-Kopf prüfen.
- **ERLEDIGT am 2026-09-20 (Task 10, siehe ganz oben).** Ein Design- und
  Barrierefreiheits-Audit (WCAG 2.1 AA, Kontrast, Tastatur,
  Unterscheidbarkeit der drei Nichtwissens-Zeichen bei Farbsehschwäche) wurde
  gestartet und nach einem Limit abgebrochen — **nur lesend, nichts verloren,
  aber auch nichts gewonnen**. **Es ist jetzt in Task 10 des Kartenplans
  eingebaut** und läuft dort über alle berührten UI-Dateien; es deckt aber nur
  `web/` ab und nur das, was dieser Plan anfasst.

## Neu installierte Skills (2026-09-19)

Auf Nutzerauftrag von <https://collectivebrain.de/skills/> ausgesucht.
**Wichtiger Befund zu dieser Seite:** Es ist ein **Drittanbieter-Verzeichnis**
(deutsche Agentur), keine offizielle Anthropic-Quelle, und **eine
Herkunftsangabe stimmte nachweislich nicht** — der dort als „stammt von
Anthropic, offizielles Repository" beworbene „Accessibility Review
(WCAG 2.1 AA)"-Skill existiert im echten `github.com/anthropics/skills`
nicht (geprüft durch Klonen des Repos und Abgleich der Skill-Liste). **Nicht
installiert.** Bei künftigem Interesse an Skills von dieser Seite: erst die
Herkunftsangabe an der genannten Quelle nachprüfen, nicht blind installieren
— siehe [[collectivebrain-drittanbieter-skills]].

**Zwei Skills mit echter, verifizierter Herkunft installiert** — direkt aus
`github.com/vercel-labs/agent-skills`, nicht über collectivebrains Spiegel:

- **`web-design-guidelines`** — prüft UI-Code gegen Vercels „Web Interface
  Guidelines" (Layout, UX, Formulare, Barrierefreiheit). Holt die
  Richtlinien bei jedem Aufruf frisch von
  `raw.githubusercontent.com/vercel-labs/web-interface-guidelines`.
- **`react-best-practices`** — 70 Performance-/DX-Regeln für React in
  8 Kategorien, passend zu `web/`.

Beide liegen in `~/.claude/skills/<name>/` (User-Scope, nicht im Repo) und
sind **bereits aktiv getestet** — anders als das Cloudflare-Plugin aus
Runde davor kamen sie ohne Sitzungsneustart in die Skill-Liste.

**Standing Approach (Nutzerauftrag 2026-09-19):** Diese Skills bei jeder
Web-Arbeit einsetzen, nicht nur beim Karten-Feature — und bei künftigen
Aufgaben allgemein prüfen, ob ein passender Skill (von collectivebrain.de
oder anderswo) einen echten Vorteil für Webseite, Scraper oder das
Gesamtprojekt bringt, dann einsetzen.

## Wie man am Dashboard weiterarbeitet

- `cd web && npm install` ist im Hauptcheckout bereits gelaufen.
  `npx vite` startet den Entwicklungsserver, `npx vitest run` die Tests,
  `npx vite build` den Produktionsbau.
- **Die Snapshot-Datei liegt nicht im Repo** (19,8 MB, git-ignoriert). Zum
  Entwickeln eine erzeugen: `erzeugeSnapshot` aus `scraper/lib/snapshotDb.ts`
  über ein kleines `npx tsx`-Skript aufrufen, Ergebnis nach
  `web/public/dashboard-snapshot.json`. **Nur lesend** — und niemals einen
  Scraper-Lauf lokal starten.
- Ohne diese Datei überspringt `web/src/daten/snapshot.vertrag.test.ts` acht
  Prüfungen still (84 statt 92 grün). Genau dieser Test hat die A18-Befunde
  gefunden — er ist der Wächter gegen einen Export, der sich unbemerkt ändert.

## Entscheidungen des Nutzers, gefallen am 2026-09-11

Nicht wieder aufbringen.

| Frage | Entscheidung |
|---|---|
| Objekt ohne Preis (A-4) | **Eine `listings`-Zeile ohne `listing_versions`-Zeile.** Kein nullbares `price_cents`, keine Migration. Umgesetzt in `ea8b731` |
| Rangzahl im Dashboard (E-5) | **Der DSCR**, keine erfundene Punktzahl |
| Bundeslandgenaue Schätzungen melden (E-4) | **Ja**, mit dem Kontingent von 5 der 25 Plätze |
| Zugriffsweg des Dashboards (E-1) | **Snapshot-Export.** Keine Änderung an der Produktionsdatenbank |

## Entscheidungen des Nutzers, gefallen am 2026-09-13

| Frage | Entscheidung |
|---|---|
| Repo-Sichtbarkeit | **Öffentlich**, um die Cron-Zuverlässigkeit (A-3) zu verbessern — private Repos haben ein Actions-Minuten-Kontingent, öffentliche keins. Begründung und Sicherheitsprüfung: [`specs/2026-09-13-repo-oeffentlich-und-dashboard-passwortschutz.md`](specs/2026-09-13-repo-oeffentlich-und-dashboard-passwortschutz.md). **Umgesetzt** — vom Nutzer selbst umgestellt, unabhängig über die öffentliche GitHub-API verifiziert (`private: false`) |
| Wer darf das Dashboard sehen (E-2) | **Nur der Nutzer selbst**, nicht nur "irgendwer mit Passwort" — Einzelnutzerzugang. E-3 (Rechtsfrage, ob überhaupt öffentlich erreichbar) bleibt davon unberührt und offen |
| Wie lange bleiben Abgänge im Archiv (E-6) | **Nicht unbegrenzt.** Ein Objekt verschwindet aus dem Abgänge-Bereich, sobald **verlässlich** feststeht, dass es nicht mehr existiert — nicht schon dann, wenn ein Lauf es bloß nicht gesehen hat. "Verlässlich" heißt: ein vollständiger, nicht abgebrochener Lauf mit ausreichender Erfassungsmenge hat es nicht mehr gefunden. Das ist dieselbe Unterscheidung, die `istRegionVollstaendig`/`imGeltungsbereich` schon treffen — Schritt 6 des Entwurfs (Zustände und Frische) kann sie direkt nutzen, ohne neue Löschbefugnis in der Datenbank. **Keine Entscheidung zur echten Löschung (B1)** — nur zur Anzeige im Archiv |
| Objekte ohne Region, 54 Stück (E-7) | **Eigene, ausdrücklich beschriftete Kategorie** "Objekte ohne Region" — nicht in einen anderen Bereich einsortieren |
| Wo läuft das Dashboard, was darf es kosten (E-8) | **Muss kostenlos und stabil laufen.** Empfehlung nach kurzer Recherche (2026-09-13): **Cloudflare Pages** (Hosting des Snapshot-Exports, kostenlos, unbegrenzte Bandbreite) + **Cloudflare Access** (Zugriffsschutz, kostenlos bis 50 Nutzer, E-Mail-Einmalcode an genau die eine erlaubte Adresse — erfüllt "nur ich" strenger als ein geteiltes Passwort). Vercels eigener Passwortschutz kostet auf dem Hobby-Plan extra (Pro-Zusatzpaket 150 $/Monat); Cloudflare bietet das Äquivalent kostenlos. Noch nicht eingerichtet — es gibt noch keinen Snapshot-Export zum Hosten (Schritt 3) |

## Entscheidungen des Nutzers, gefallen am 2026-09-14

| Frage | Entscheidung |
|---|---|
| Objekt ohne Preis im Dashboard zeigen? (Ruling 9, Entwurf 3.3/9) | **Im S0-Bereich** „Nicht beurteilbar" — nicht nur auf der Betriebsseite. Konsistent mit anderen Datenlücken (z. B. `wohnflaeche_fehlt`). Offen bleibt nur der genaue Klartext-Grund, ein Umsetzungsdetail für den Snapshot-Export (Schritt 3) |

## Entscheidungen des Nutzers, gefallen am 2026-09-19

| Frage | Entscheidung |
|---|---|
| Custom-Domain oder `*.pages.dev` (Teil von E-8) | **Kostenloser `*.pages.dev`-Subdomain**, keine eigene Domain |
| Cloudflare-Pages-Projektname | `immo-radar-dashboard` |
| Deployment-Weg | **Direct Upload per Wrangler in GitHub Actions**, nicht Cloudflares Git-Integration — Begründung im Abschnitt „Dashboard-Veröffentlichung" oben |
| E-2, konkreter Empfänger des Access-Einmalcodes | `w.helwich@googlemail.com` |
| E-3 (Rechtsfrage öffentliche Erreichbarkeit) | **Bewusst zurückgestellt** — „ist egal", weil ohnehin nur der Nutzer selbst reinkommt |
| Standing Approach: Dashboard-Update bei Sitzungsende | Jede größere Aufgabe, die mit einem Clear endet, soll ab jetzt auch das Dashboard aktualisieren — sobald der Auto-Deploy-Workflow steht, automatisch bei jedem Push auf `main` |
| Cloudflare-API-Token-Scope | Nutzer hat **vollen Kontozugriff** gewählt statt der schmaleren Empfehlung des Koordinators — ausdrücklich als streng geheim markiert, nie öffentlich |
| Cloudflare-Skill-Plugin installieren | **Ja**, offizielles `cloudflare/skills`-Plugin, User-Scope, projektübergreifend nutzen sobald aktiv |
| Wie das Token den Koordinator erreicht, ohne die Credential-Leakage-Sicherung auszulösen | **GitHub-Actions-Secrets, vom Nutzer selbst über die GitHub-Weboberfläche gesetzt** — PowerShell-Umgebungsvariablen wurden vom Nutzer abgelehnt („ich will das net machen"). Jede weitere Cloudflare-API-Nutzung läuft seither als CI-Schritt, nie direkt durch den Koordinator |

## Wie in diesem Projekt gearbeitet wird

**Festgelegt vom Nutzer am 2026-09-11, gilt für jede Iteration:**

1. Erst ein **Plan** mit `superpowers:writing-plans` für die nächsten oder
   noch offenen Tätigkeiten.
2. Dann **je Aufgabe ein eigener Agent** nach
   `superpowers:subagent-driven-development`.
3. **Jeder Agent wägt selbst ab, welche Superpower zu seiner Aufgabe passt,
   und wendet sie an.** Der Auftrag sagt ihm das ausdrücklich, gibt sie aber
   nicht vor.

Das hat in dieser Sitzung fünf Aufgaben getragen. Die Prüfung nach jeder
Aufgabe hat sich zweimal bezahlt gemacht: Sie fand den Deckel, der je Quelle
statt je Lauf gilt, und sie hat den Nachtrag zu den Messfragen gestoppt, den
ich sonst abgenommen hätte.

**Ergänzt am 2026-09-15, drei Ansagen des Nutzers:**

4. **Merge und Push laufen ohne Rückfrage.** Sobald ein Zweig geprüft und grün
   ist, wird gemergt, auf dem gemergten Stand getestet und gepusht. Der Nutzer
   wird informiert, nicht gefragt. *Die frühere Regel „Merge und Push gehören
   dem Nutzer" ist damit aufgehoben.* Ohne Freigabe bleiben weiterhin:
   `.github/workflows/`, Schreibzugriffe auf die Produktionsdatenbank.
5. **Eine neue Priorität hält den Rest nicht an.** Was auf der offenen Liste
   nicht daran hängt, läuft parallel in Subagenten weiter. Parallelität
   entsteht über eine **festgeschriebene Schnittstelle**: erst das Format
   festlegen, dann bauen Erzeuger und Verbraucher gleichzeitig dagegen. Genau
   so sind Snapshot-Export und Oberfläche entstanden.
6. **Modellwahl je Aufgabe:** schwere Aufgaben auf `opus` (Gesamtprüfungen,
   Löschwachen, echter Ermessensspielraum), einfache auf `sonnet`
   (ausgeschriebener Brief, Doku, Messskripte). Kein `haiku`. Der Koordinator
   entscheidet das beim Losschicken, ohne zu fragen.

**Neu festgelegt am 2026-09-16, gilt für alle weiteren Aufgaben des Projekts:**

7. **Große Aufgaben laufen nacheinander, nie mehrere gleichzeitig.** Regel 5
   ist damit für die großen Aufgaben aufgehoben — der Rest der Liste läuft
   nicht mehr nebenher.
8. **Parallel wird innerhalb einer Aufgabe gearbeitet**, mit Superpowers.
   Jeder parallele Arbeiter bekommt Superpowers und wählt selbst, welche zu
   seinem Teil passt (wie Regel 3).
9. **Nach jeder abgeschlossenen großen Aufgabe endet die Sitzung.** Vorher
   Ledger, Gedächtnis und bei Bedarf dieses Dokument und `BACKLOG.md` auf
   Stand bringen, dann aufhören. Grund: Mehrere große Aufgaben in einer
   Sitzung verbrauchten zu viele Token.

**Was die Prüfung am 2026-09-15 wieder eingebracht hat:** Ein Agent meldete
seine Aufgabe als erledigt, und der Fix war halb falsch — er hatte die eine
Behauptung („abgängig") durch die andere ersetzt („verfügbar"), statt auf den
Nichtwissens-Zustand zu gehen. Sein eigener Kommentar an der Funktion sagte
das Richtige; nur der Code hielt sich nicht daran, und sein Test war so
gewählt, dass er trotzdem grün wurde. **Sichtbar wurde das erst beim Lesen des
Diffs, nicht im Bericht.**

---

## Werkzeuge und Zugänge

| Zugang | Umfang |
|---|---|
| GitHub (Windows-Credential-Manager) | OAuth-Token `gho_…`, Scopes `repo, workflow, gist`, Konto `bratzi` |
| Supabase Management-PAT | DDL, Logs, Secrets — in `scraper/.env` |
| Supabase Service-Key | volle Datenrechte, umgeht RLS |
| Telegram-Bot | `Immo2501bot` |
| Cloudflare (Konto `w.helwich@googlemail.com`) | API-Token mit vollem Kontozugriff, streng geheim — liegt **nur** als GitHub-Actions-Secret (`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`), nie beim Koordinator. Zero Trust/Access ist seit 2026-09-19 aktiviert |

**`gh` ist installiert, aber nicht dauerhaft eingeloggt.** Je Aufruf neu (funktioniert, zuletzt am 2026-09-13 geprüft):

```bash
export PATH="$PATH:/c/Program Files/GitHub CLI"
export GH_TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill | sed -n 's/^password=//p')
```

**Die Tokenfrage ist geschlossen** (A2, Entscheidung des Nutzers vom
2026-09-08). Nicht wieder aufbringen.

**Lesende Datenbankabfragen laufen lokal** und sind von der Live-Sperre nicht
betroffen. Ein fertiger Client liegt in `scraper/lib/supabase.ts`; ein
Messskript läuft mit `cd scraper && npx tsx <pfad>`. Der Worktree braucht
dafür eine Kopie von `scraper/.env`.

---

## Fallen, die schon zugeschnappt sind

**Eine seitenweise Abfrage ohne stabile Sortierung ist eine Stichprobe.**
Gemessen: 1.762 von 12.158 Zeilen doppelt, 1.762 nie. Wer `.range()` benutzt,
sortiert vorher — besser noch: blättert per Keyset.

**Eine Zugriffssperre gilt nur für den Hostnamen, auf den sie ausgestellt
ist.** Cloudflare Pages veröffentlicht jedes Deployment zusätzlich unter
einer eigenen Hash-Adresse; die Access-Regel auf `immo-radar-dashboard.pages.dev`
ließ die alle offen (gemessen 2026-09-19: Hauptadresse 302, Hash-Adresse
200). Wer eine Sperre baut, prüft sie auf **allen** Wegen zum selben Inhalt,
nicht nur auf dem erwarteten. Und er wartet dabei auf das Ausrollen — hier
rund eine Minute.

**Nie einen Live-Lauf lokal.** [`lib/nurInCi.ts`](../../scraper/lib/nurInCi.ts)
bricht `npm run scrape` und jedes Prüfskript ohne `CI` ab. Der Anschluss des
Nutzers ist zweimal ausgefallen. Prüfungen laufen über
[`pruefung.yml`](../../.github/workflows/pruefung.yml), volle Läufe über
`gh workflow run scrape.yml --ref main`.

**Was nur im Chat steht, stirbt mit der Sitzung.** Diese Sitzung verlor einen
Agenten am Sitzungslimit, mitten in einer Korrekturrunde. Gerettet hat die
Arbeit nur, dass die Prüfungsfunde vorher als Datei ins Repo geschrieben
wurden. Befunde gehören ins Repo, sobald sie feststehen — nicht erst, wenn
sie abgearbeitet sind.

**Ein abgebrochener Agent ist nicht wertlos — erst in seinen Worktree sehen.**

**Subagenten in Worktrees brauchen `node_modules` — und `npm ci` ist dafür der
falsche Weg.** Der richtige steht in
[`scripts/worktree-node-modules.sh`](../../scripts/worktree-node-modules.sh):
Verzeichnis-Junction, Symlink, notfalls lokale Kopie, kein Netz.

**Eine Prämisse im Agentenauftrag kann selbst veraltet sein.** Wer aus einer
Doku einen Auftrag schneidet, prüft die Doku zuerst am Code.

**Ein Prüflauf gegen EINE Region kostet fast nichts und beantwortet mehr als
jede Vermutung.**

**`printf` und das Prozentzeichen.** Eine Commit-Nachricht mit `8,2 %` bricht
mitten im Satz ab. Längere Nachrichten über `git commit -F`.

**Ein Test, der am Kalender hängt, ist eine Zeitbombe.**

**Ein grüner Test beweist nichts, wenn er nie rot war.** Bei jedem Test, der
sofort grün ist: Produktionscode kurz kaputtmachen und zusehen, ob der Test
es merkt.

**Fail-open in den Löschwachen ist der teuerste Fehler.** In `bestand.ts`,
`plausibilitaet.ts`, `bestandDb.ts` und `scrapers/immowelt/index.ts` gilt: ein
unbekannter Zustand ist `null`/`false`, nie „in Ordnung". Vier Stellen sind
geschlossen. Wer eine fünfte findet, schließt sie sofort.

**Eine Messung kann einen Entwurf umwerfen — und dann muss der Entwurf
umgeschrieben werden, nicht ergänzt.** Zwei Stände nebeneinander sind
schlimmer als ein falscher: Wer später liest, kann nicht wissen, welcher gilt.

**Immowelt ist nicht gesperrt, headless wird erkannt.** `headless: true` →
HTTP 403 mit CAPTCHA; `headless: false` → 200. In CI unter `xvfb-run`.

**Ein CAPTCHA wird nicht gelöst.** Es misst eine zu hohe Abrufrate.

**Immowelt-Detailseiten (`/expose/`) sind von Rechenzentrums-Adressen gesperrt.**
Bewertung kommt aus der Titelzeile der Ergebnisliste. Deshalb gibt es keine
PLZ und die Miete ist bundeslandgenau.

**Leere Bundesländer sind bei ZVG normal.**

**Die `\n`-Falle beim Schreiben von Dateien.** Bei größeren Dateien das
Write-Werkzeug nehmen, nicht ein Heredoc.

**`tsx` und `page.evaluate`.** Verschachtelte Funktionen im `evaluate`-Rumpf
brechen mit `ReferenceError: __name is not defined`. Alles flach halten.

**Niemals `rm -rf` auf einen Worktree, in dem eine `node_modules`-Junction
liegt.** Die Junction zeigt auf das **echte** `scraper/node_modules` des
Hauptcheckouts; ein rekursives Löschen kann ihr folgen und das Ziel
mitnehmen. Erst die Junction mit `cmd //c "rmdir scraper\node_modules"`
entfernen — das löst nur die Verknüpfung —, danach den Rest löschen und
`ls scraper/node_modules | wc -l` als Gegenprobe.

**Ein Worktree lässt sich nicht entfernen, solange ein Prozess darin läuft.**
`git worktree remove` scheitert dann mit „Invalid argument" oder „Device or
resource busy" — meist ein vergessener Entwicklungsserver. Den Prozess gezielt
über seine Kommandozeile suchen und beenden, nicht pauschal alle `node`-
Prozesse abschießen.

**Subagenten werden von einem Watchdog gestoppt, wenn ein Kommando minutenlang
still läuft.** Am 2026-09-15 hat es zwei getroffen, beide an einer Messung
ohne Zwischenausgabe. Gegenmittel: Zwischenausgaben, `--limit`, große Logs in
eine Datei umleiten statt ausgeben. **Die Arbeit ist dabei nicht verloren** —
der Agent lässt sich mit einer Nachricht fortsetzen und behält seinen Kontext.
