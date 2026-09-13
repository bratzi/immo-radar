# Dashboard (Teilprojekt 3) — Entwurf

**Stand:** 2026-09-09, **Nachtrag 2026-09-12** (Abschnitt 13: Schritt 0
geschlossen, M1 bis M6 gemessen; 3.1, 3.3, 3.4, 3.6, 3.9, 4.3, 6.2 und 6.3
sind daraufhin korrigiert), **Korrekturrunde 2026-09-13** (Abschnitt 13.8:
der Nachtrag trug an sechs Stellen zwei Stände nebeneinander; 2.4, 3.1, 3.2,
3.3, 3.8, 4.3, 6.2, 6.3, 7, 10, 11, 12, 13.1, 13.4, 13.6 und 13.7 sind
daraufhin vereinheitlicht — **ohne neue Messung**, die Rohzahlen des
Nachtrags sind bestätigt)
**Status:** Entwurf. **Kein Code, keine Zeile Frontend.** Der Nutzer hat am
2026-09-08 festgelegt, dass die Basis steht, bevor Webseite und Dashboard
gebaut werden ([`ABNAHME-BASIS.md`](../ABNAHME-BASIS.md)). Dieses Dokument
beantwortet die Fragen, die vor der ersten Zeile fallen müssen.

**Grundlage:** [`2026-09-07-plan3-dashboard-anforderungen.md`](2026-09-07-plan3-dashboard-anforderungen.md)
(Anforderungen des Nutzers), [`2026-09-08-mietqualitaet-befund.md`](2026-09-08-mietqualitaet-befund.md),
[`2026-09-08-immowelt-abgaenge-optionen.md`](2026-09-08-immowelt-abgaenge-optionen.md),
[`BACKLOG.md`](../BACKLOG.md) A10/A11/A13/A15.

> **Zu den Zahlen.** Alles in diesem Entwurf ist entweder aus dem Repo
> gerechnet oder aus einer benannten früheren Messung übernommen. Wo eine
> Zahl fehlt, steht sie als **offene Messfrage** (Abschnitt 10) und nicht als
> Schätzung im Text. Für die **erste Fassung vom 2026-09-09** wurde kein
> Netzabruf, keine Datenbankabfrage und kein Scraper-Lauf ausgeführt.
>
> **Nachtrag 2026-09-12:** Die sechs Messfragen M1 bis M6 sind über **rein
> lesende** Datenbankabfragen beantwortet worden (kein Netzabruf, kein
> Scraper-Lauf, kein Schreibzugriff). Die Antworten stehen in Abschnitt 13;
> wo sie eine Entscheidung verschoben haben, ist der betroffene Abschnitt
> **an Ort und Stelle korrigiert** und die Korrektur als solche markiert.
>
> **Korrekturrunde 2026-09-13:** Dieser Anspruch war nicht eingelöst. Eine
> Nachprüfung hat die **Rohzahlen des Nachtrags durchweg reproduziert**, aber
> sechs Stellen gefunden, an denen zwei Stände nebeneinanderstanden oder eine
> Schlussfolgerung weiter trug als ihre Zahl. Sie sind vereinheitlicht; was
> geändert wurde und was offen bleibt, steht in **13.8**. Auch diese Runde hat
> **nichts gemessen** und keine Zeile Code geändert. Seither gilt: **Kein
> Abschnitt trägt zwei Stände, und keine Zahl steht ohne Verfahren, Datum und
> die Angabe, was sie nicht hergibt.**

---

## 1. Der Leitsatz

Die vier Anforderungen des Nutzers (Ranking, Veränderungen sichtbar,
Reihenfolge folgt der Veränderung, Abgänge ausgegraut) sind das *Was*. Das
*Wie* entscheidet eine einzige Regel, die in diesem Entwurf dreimal
angewendet wird:

> **Nichtwissen bekommt einen eigenen Zustand. Es wird nie in Wissen
> hineingerechnet und nie als schlechtes Wissen dargestellt.**

Dreimal angewendet:

| Wo | Das Nichtwissen | Der eigene Zustand |
|---|---|---|
| Rang (Frage 2) | geschätzte Miete, fehlende Fläche | Sicherheitsstufe **vor** Punktzahl; „nicht beurteilbar" steht außerhalb der Rangliste |
| Zeit (Frage 3) | unregelmäßiger Cron, 5,7 Tage Regionsabstand | Veränderung ist **historienrelativ**, nicht kalenderrelativ; kein Zeitfenster |
| Abgang (Frage 5) | `nw`, `bw`, `mv` melden nie einen Abgang | **drei** Zustände (verfügbar / unbestätigt / abgängig), nicht zwei |

Diese Regel ist im Projekt nicht neu. `bewerteFlaechenangabe` in
`lib/pipeline.ts` steht schon heute genau dafür — der Kommentar dort nennt
den Unterschied zwischen „geprüft und schlecht" und „nicht beurteilbar"
ausdrücklich als das, was das Dashboard braucht. Dieser Entwurf zieht die
Konsequenz daraus.

---

## 2. Frage 1 — Woraus besteht „lukrativ"?

### 2.1 Befund: Fünf Kennzahlen, aber nur **zwei** Ordnungen

`berechneKennzahlen` (`lib/metrics.ts`) liefert fünf Zahlen, die wie fünf
Meinungen aussehen. Drei davon sind rechnerisch dieselbe Meinung. Aus dem
Code abgelesen:

```
nettomietrenditeCapRate = (noi / (kaufpreis + kaufnebenkosten)) * 100
geschaetzterDscr        =  noi / ((kaufpreis + kaufnebenkosten) * 0,06)
```

Also **`geschaetzterDscr = nettomietrenditeCapRate / 6`**, exakt und ohne
Rest. Die beiden erzeugen dieselbe Reihenfolge; `DSCR >= 1,3` ist wörtlich
dasselbe wie `Cap Rate >= 7,8 %`.

Ebenso:

```
bruttomietrendite = (jahreskaltmiete / kaufpreis) * 100 = 100 / kaufpreisfaktor
```

**`Bruttomietrendite` ist eine monotone Umkehrung des Kaufpreisfaktors.**
`kaufpreisfaktor <= 15` ist dasselbe wie `Bruttomietrendite >= 6,67 %`.

Übrig bleiben **zwei** unabhängige Ordnungen:

| Ordnung | Was sie kennt | Was sie ignoriert |
|---|---|---|
| **Kaufpreisfaktor** (≡ Bruttomietrendite) | Preis, Miete | Bewirtschaftungskosten, Baujahr, Einheiten, Grunderwerbsteuer |
| **DSCR** (≡ Nettomietrendite) | Preis, Miete, Bewirtschaftungskosten (Baujahr, Fläche, Einheiten), Kaufnebenkosten inkl. Grunderwerbsteuer je Bundesland | — |

Der Keil zwischen beiden ist genau die Bewirtschaftung plus die
Kaufnebenkosten. Sie sind korreliert, aber nicht identisch.

### 2.2 Nebenbefund: Eine der vier Top-Treffer-Bedingungen ist tot

`topTreffer` verlangt vier Dinge: `kaufpreisfaktor >= 3`,
`kaufpreisfaktor <= 15`, `geschaetzterDscr >= 1,3`, `!finanzierungsrisiko`.

`finanzierungsrisiko` ist `kaufpreis > (noi / 0,06) * 1,1`, also
`noi / kaufpreis < 0,0545`. Setzt man das in den DSCR ein — mit
Kaufnebenkosten zwischen 8,57 % (Bayern, 3,5 % GrESt) und 11,57 %
(6,5 % GrESt) des Kaufpreises — ergibt sich:

> `finanzierungsrisiko` greift **nur unterhalb von DSCR ≈ 0,81 bis 0,84**.

Da `topTreffer` ohnehin `DSCR >= 1,3` verlangt, kann diese Bedingung dort
**nie** die bindende sein. Die Schwellenprüfung besteht praktisch aus drei
Bedingungen, nicht aus vier.

*Was daraus folgt:* Für den Rang ist `finanzierungsrisiko` wertlos — es
trägt keine Information, die der DSCR nicht schon trägt. Es bleibt trotzdem
als **Anzeige** sinnvoll für Objekte unterhalb der Schwelle, wo es sehr wohl
greift. Es wird nicht entfernt (das wäre eine Änderung an `scraper/` und
nicht Sache dieses Entwurfs), aber es geht **nicht** in die Rangzahl ein.

### 2.3 Entscheidung: Die Rangzahl ist der DSCR. Keine erfundene Punktzahl.

**Rangzahl = `geschaetzterDscr`.** Absteigend. Der Kaufpreisfaktor steht
daneben als zweite Zahl, ordnet aber nicht.

**Begründung:**

1. Von den zwei verfügbaren Ordnungen kennt der DSCR alles, was der
   Kaufpreisfaktor kennt, **und zusätzlich** Bewirtschaftungskosten, Baujahr,
   Einheiten und die Grunderwerbsteuer des Bundeslandes. Er dominiert
   informationell.
2. Er ist bereits die schärfere der beiden Meldeschwellen: am 2026-09-12
   erfüllen **5.384** Objekte `kaufpreisfaktor <= 15`, aber nur **2.460**
   `DSCR >= 1,3` (M5; am 2026-09-08 waren es 910 gegen 502, A11 — das
   Verhältnis ist über das Sechsfache des Bestands stabil geblieben). Die
   Rangzahl ist damit dieselbe Größe, an der schon heute die Meldung hängt.
3. **Die Reihenfolge ist unempfindlich gegen den unterstellten Zinssatz.**
   `KAPITALDIENST_SATZ = 0,06` ist ein gemeinsamer Divisor; ein anderer Satz
   verschiebt die Schwelle 1,3, aber **nicht eine einzige Position** im
   Ranking. Das ist wichtig, weil 6 % eine Annahme sind, kein gemessener
   Wert.

**Verworfen — gewichtete Punktzahl** (`w1 · norm(Faktor) + w2 · norm(DSCR)
+ …`): Die Gewichte hat niemand gemessen, sie wären reine Willkür in einem
Projekt, dessen ganze Kultur auf belegten Zahlen beruht. Schlimmer: Faktor,
Bruttomietrendite und Nettomietrendite sind nach 2.1 teilweise dieselbe
Zahl — eine Summe über sie **doppelt zählt** dieselbe Information und
gewichtet die *unwissendere* Kennzahl mit hoch.

**Verworfen — ein 0-bis-100-„Lukrativitäts-Score":** Er sähe nach mehr
Wissen aus, als vorhanden ist. Eine normierte Zahl verwischt, dass dahinter
eine Kennzahl unter einer Zinsannahme steht, die zu über 99 % auf einer
geschätzten Miete beruht. Der DSCR steht mit Namen da und lässt sich
nachrechnen.

**Verworfen — gar keine Rangzahl** (nur eine feste Sortierhierarchie):
Anforderung 1 des Nutzers verlangt ausdrücklich „das beste Objekt steht immer
oben". Ohne Zahl gibt es innerhalb einer Gruppe keine Reihenfolge.

### 2.4 Anforderung 3 braucht keinen eigenen Term

„Wird ein Objekt durch eine Preissenkung zu einem sehr guten Objekt, rutscht
es nach oben." Das erledigt der DSCR **von selbst**: Ein niedrigerer Preis
senkt Kaufpreis und Kaufnebenkosten, hebt den DSCR, hebt den Rang. Ebenso
hebt eine bessere Datenlage (Fläche gefunden, Miete belegt) die
Sicherheitsstufe und damit die Einordnung.

Ein zusätzlicher „Neuheits-" oder „Veränderungsbonus" auf die Rangzahl wird
deshalb **abgelehnt**: Er wäre ein erfundenes Gewicht (siehe 2.3) und er
würde ein Objekt nach oben schieben, das sich verändert hat, ohne dadurch
besser geworden zu sein. Veränderung bekommt eine eigene Darstellung
(Abschnitt 4), keinen Platz in der Zahl.

> **Am 2026-09-12 gemessen (M6, Abschnitt 13.6), am 2026-09-13 mit dem
> Vorbehalt versehen, den die Stichprobe verlangt.** Die Entscheidung steht,
> aber sie steht auf der **Formel** — ein niedrigerer Preis hebt den DSCR —,
> nicht auf der Messung. **Die Messung belegt sie nicht:** Sie umfasst **17
> echte Preissenkungen** aus sieben Tagen Historie, mehrere davon zum selben
> Objekt, und sie hat den Rang **global über alle 12.157 bewerteten Objekte
> einschließlich S0** bestimmt — über eine Liste also, die das Dashboard nach
> 3.2 und 3.7 so nie zeigt; **6 der 17** Senkungen betrafen S0-Objekte, die
> überhaupt keinen Rangplatz bekommen. Der Median „+539 Plätze" ist deshalb
> **keine Aussage über die Rangliste dieses Entwurfs**. Zu wiederholen nach
> vier Wochen, dann innerhalb der Stufe und ohne S0.

---

## 3. Frage 2 — Wie wird Nichtwissen einsortiert?

**Das ist die tragende Frage dieses Entwurfs.** Die Antwort auf die Unschärfe
ist, sie sichtbar zu machen, nicht sie wegzurechnen.

### 3.1 Die Ausgangslage in Zahlen

**Neu gemessen am 2026-09-12** (Nachtrag, Abschnitt 13). Die rechte Spalte
trägt den Stand vom 2026-09-08, die mittlere den heutigen. Der Bestand ist
von 2.108 auf 17.391 Versionen und von überwiegend ZVG auf 98,4 % Immowelt
gewachsen; die alten Zahlen sind damit nicht falsch gewesen, sondern
überholt.

| Befund | Gemessen 2026-09-12 | Stand 2026-09-08 (überholt) |
|---|---|---|
| Objekte mit **belegter** Miete im gesamten Bestand | **1** von 12.611 | 2 |
| Anteil, dessen Miete nur **bundeslandgenau** geschätzt ist | **98,0 %** roh, **89,7 %** nach Abzug von S0 | 83 % |
| `top_treffer` seit 2026-09-07 05:43 | **0** (unverändert: nur 1 Objekt trägt überhaupt eine belegte Miete, und es passiert die Schwellen nicht) | 0 |
| Meldeklasse wechselt im ±30-%-Mietband | **2.962 von 12.157 (24,4 %)** | 558 von 1.879 (29,7 %) |
| Objekte mit `wohnflaeche_fehlt` (jüngste Version) | **306 (2,4 %)**, plus 148 ohne Fläche und ohne Lücke | über die Hälfte (210 von 400) |
| Objekte mit `units_unconfirmed` (jüngste Version) | **12.521 von 12.611 (99,3 %)** | 567 von 1.000 |
| Bundesländer, die intern das ±30-%-Band verlassen | **7 von 16** (unverändert, Tabelleneigenschaft); der Anteil betroffener S1-Objekte ist **nicht reproduzierbar erhoben**, siehe Kasten unter der Tabelle | 7 von 16, dort 64 % |

> **Verfahren unbekannt, nicht reproduzierbar (nachgetragen am 2026-09-13).**
> Der Nachtrag vom 2026-09-12 gab hier „6.408 von 11.308 (56,7 %)" an, ohne
> ein Verfahren zu nennen. Eine zwischenzeitlich nachgetragene Herleitung —
> jedes S1-Objekt trage über `plzBundesland.generated.json` genau ein
> Bundesland — war **selbst nicht belegt und mit den Produktfunktionen nicht
> vereinbar**: S1 ist gerade die Stufe **ohne** PLZ-genaue Miete
> (`ermittleJahreskaltmiete`, `scraper/lib/rentEstimate.ts:207-219`, schätzt
> bundeslandgenau nur, wenn *keine* regionale PLZ-Miete greift und bekommt das
> Bundesland als Namen übergeben, nicht über eine PLZ-Zuordnung), und die 6
> `geschaetzt_bundesweit`-Objekte innerhalb von S1 tragen gar kein
> Bundesland. Diese Herleitung ist deshalb **gestrichen**.
> **Welches Verfahren die „6.408" tatsächlich erzeugt hat, ist nicht
> bekannt:** Der Zählschritt ist im Nachtrag vom 2026-09-12 nicht
> protokolliert, und das zugehörige Messskript ist nicht mehr vorhanden
> (13.8). **Die Zahl „6.408 von 11.308 = 56,7 %" ist deshalb aus der Tabelle
> entfernt** und steht nur noch hier, als **frühere Angabe des Nachtrags vom
> 2026-09-12** — nicht als aktueller Messwert dieses Entwurfs. Sie ist
> derzeit **nicht nachvollziehbar und nicht reproduzierbar** und bei der
> nächsten Messung mit einem protokollierten Verfahren neu zu erheben.

**Die entscheidende Asymmetrie:** Eine falsche Mietschätzung kann **nie einen
`top_treffer` erzeugen**, nur einen `pruefkandidat` (A11, `bestimmeMeldeklasse`
stuft geschätzte Mieten grundsätzlich herunter). Der Fehler ist also
einseitig — er erzeugt Prüfarbeit, keine Fehlkäufe. Das ist der Grund, warum
Prüfkandidaten überhaupt gezeigt werden dürfen. Es ist **nicht** der Grund,
sie wie belegte Objekte zu sortieren.

### 3.2 Entscheidung: Sicherheitsstufe **vor** Punktzahl — und als sichtbares Band, nicht als eine Liste

Sortiert wird **lexikografisch**: zuerst die Sicherheitsstufe, dann innerhalb
der Stufe die Rangzahl. Aber — und das ist der Kern — **die Stufen werden
nicht zu einer Liste zusammengeschoben.** Jede Stufe ist ein eigener,
beschrifteter Block mit eigener Rangliste. (**Offen seit dem 2026-09-13:** ob
das auch für S2 gilt, das nach der korrigierten Stufenregel nur noch 52
Objekte trägt — siehe 3.3. Das Prinzip „getrennte Blöcke statt einer Liste"
hängt nicht daran.)

> **Auf die Frage des Nutzers — „rangiert ein Prüfkandidat mit geschätzter
> Miete gleichberechtigt mit einem Top-Treffer mit belegter?" — lautet die
> Antwort: weder noch. Sie stehen nicht in derselben Liste.**

Begründung: Eine gemeinsame Liste müsste behaupten, wie viele Rangplätze eine
belegte Miete wert ist. Diese Zahl hat niemand gemessen, und sie ist auch
nicht messbar, solange der Bestand **ein einziges** belegtes Objekt enthält
(gemessen 2026-09-12, M3; am 2026-09-08 waren es zwei). Die
gemessene Unschärfe der Bundeslandstufe (bis −37 %/+67 %, siehe 3.4)
übersteigt in NRW und Bayern den Abstand zwischen beliebig vielen Rangplätzen
— ein gemeinsamer Rang wäre eine Zahl ohne Bedeutung.

Getrennte Blöcke behaupten diesen Wechselkurs nicht. Sie sagen: *innerhalb
dessen, was gleich gut belegt ist, ist dies die Reihenfolge.* Das ist die
stärkste Aussage, die die Datenlage trägt.

### 3.3 Die vier Stufen

Alles daraus ist heute schon gespeichert: `listing_versions.rent_source`,
`listing_versions.data_gaps` und `listing_versions.living_area_m2`. **Keine
Schemaänderung.**

> **Korrigiert am 2026-09-12 durch M3 (Nachtrag, Abschnitt 13).** Die Spalte
> „Heutiger Anteil" trug den Stand vom 2026-09-08 (2.108 Versionen, überwiegend
> ZVG). Der Bestand ist seither auf **12.611 Objekte** gewachsen und besteht zu
> 98,4 % aus Immowelt. Die Zahlen unten sind die gemessenen; die alten Werte
> („2 Objekte", „83 %", „über 50 %") sind ersetzt, nicht ergänzt.

> **Nachkorrigiert am 2026-09-13.** Der Nachtrag vom 2026-09-12 hat die
> S0-Bedingung um `living_area_m2 <= 0` erweitert, seine Stufenzahlen aber
> weiter **nach der alten Regel** gezählt — dieselbe Zeile trug damit die neue
> Bedingung und die alten Zahlen. Die Tabelle unten zählt nach der
> **korrigierten** Regel; die Werte des Nachtrags (S2 196, S1 11.312, S0
> 1.102) sind ersetzt, nicht ergänzt. Die Verschiebung sind genau die 148
> Objekte ohne Wohnfläche und ohne Lücke, die weiter unten beschrieben sind
> (144 aus S2, 4 aus S1).
>
> **Verfahren:** jüngste Version je Objekt, Stufe nach der Regel in dieser
> Tabelle, S0 hat Vorrang vor der Mietquelle; gemessen am 2026-09-12 gegen den
> vollständigen Bestand (n = 12.611), Herleitung in 13.1.

| Stufe | Name | Bedingung | Anteil, gemessen 2026-09-12, gezählt nach der korrigierten Regel (n = 12.611) |
|---|---|---|---|
| **S3** | belegt | `rent_source = 'angegeben'` **und** keine Lücke aus der S0-Liste | **1 Objekt** (0,01 %) |
| **S2** | regional geschätzt | `rent_source = 'geschaetzt_regional'` (PLZ-Zweisteller) | **52** (0,4 %), davon 39 ZVG |
| **S1** | bundeslandgenau geschätzt | `rent_source ∈ {'geschaetzt_bundesland', 'geschaetzt_bundesweit'}` | **11.308** (89,7 %) |
| **S0** | **nicht beurteilbar** | mindestens eine Lücke aus: `wohnflaeche_fehlt`, `preis_miete_unvereinbar`, `rent_estimate_unreliable` — **oder** `living_area_m2` fehlt oder ist 0 — **oder** `rent_source` fehlt oder liegt außerhalb der drei benannten Werte (`angegeben`, `geschaetzt_regional`, `geschaetzt_bundesland`/`geschaetzt_bundesweit`) | **1.250** (9,9 %; die `rent_source`-Regel ist darin **nicht mitgezählt**, siehe Kasten unten) |

> **Ergänzt in der finalen Fix-Welle (2026-09-13): die `rent_source`-Regel
> aus dem Code.** `scraper/lib/ranking.ts`
> (`bestimmeSicherheitsstufe`, Test `ranking.test.ts:47-67`) prüft
> `rent_source` gegen eine **Aufzählung**, nicht gegen eine Restmenge: Ein
> Wert außerhalb der drei genannten — insbesondere `null` — fällt auf S0,
> nicht auf S1. Diese Regel stand bisher nirgends in der Stufentabelle, ist
> aber kein theoretischer Fall mehr: Seit `ea8b731` (Immowelt) und mit
> `sdd/zvg-a4` (ZVG) legen beide Quellen für Objekte ohne Preis eine
> `listings`-Zeile **ohne** zugehörige `listing_versions`-Zeile an — solche
> Zeilen tragen kein `rent_source` und fallen nach dieser Regel auf S0.
> **Was hier nicht geschieht:** Die gemessenen 1.250 (9,9 %) sind die Zählung
> vom 2026-09-12, vor dieser Ergänzung — wie viele zusätzliche Objekte die
> `rent_source`-Regel seither in S0 zieht, ist **nicht gemessen und wird hier
> nicht geschätzt**. Das wäre eine neue Datenbankabfrage, die diese
> Dokumentationsrunde nicht ausführen darf.
>
> **Offen, nicht entschieden — Frage an den Nutzer:** Eine `listings`-Zeile
> ohne Version hat auch **keinen `data_gaps`-Eintrag** und damit keinen
> Klartext-Grund aus `DATA_GAP_LABELS`, den 3.7 für jedes S0-Objekt verlangt.
> Ob solche Zeilen im S0-Bereich der Rangliste erscheinen oder ausschließlich
> auf der Betriebsseite (Abschnitt 8) geführt werden, und welcher
> Klartext-Grund dort für sie steht, entscheidet dieser Entwurf **nicht** —
> das ist Abschnitt 9, **Schritt 3** (Snapshot-Export) zugeordnet und dort
> als offene Entscheidung des Nutzers zu behandeln.

> **Was diese Zahlen nicht hergeben:** Sie sind eine Momentaufnahme vom
> 2026-09-12 an einem Bestand, der in sieben Tagen von 2.108 auf 17.391
> Versionen gewachsen ist. Die Stufenanteile sind eine Eigenschaft der
> **Quellenmischung**, nicht des Marktes (13.1).

> **Offen, und durch die Korrektur neu geöffnet: Trägt S2 einen eigenen
> Block?** Der Nachtrag hat das mit 196 Objekten bejaht. Unter der
> korrigierten Regel sind es **52 von 12.611 (0,4 %)** — ein eigener,
> beschrifteter Block für vier von tausend Objekten ist nicht mehr belegt, und
> die Frage ist damit **offen, nicht beantwortet**. Sie ist vor **Schritt 4**
> des Abschnitts 9 (die Rangliste) zu entscheiden, nicht vor Schritt 2
> (`ranking.ts`): Die Stufe S2 bleibt als Stufe bestehen und wird berechnet;
> zu entscheiden ist allein, ob die Oberfläche sie als eigenen Block zeigt
> oder mit S1 zusammenlegt und die PLZ-Genauigkeit als Merkmal am Objekt
> führt.

**Die S0-Bedingung ist gegenüber der ersten Fassung erweitert**, und das ist
keine Kosmetik: 148 Objekte haben in ihrer jüngsten Version **keine
Wohnfläche und trotzdem nicht die Lücke `wohnflaeche_fehlt`**, weil diese
Lücke erst am 2026-09-08 eingeführt wurde und ihre Version vom 2026-09-07
stammt. Alle 148 tragen einen gespeicherten DSCR von **0** und fielen nach
der alten Regel in S2 (144) und S1 (4) — also mit einer grauen 0,0 ans Ende
eines gerankten Blocks, genau der Zustand, den 3.7 „den gefährlichsten"
nennt. Die Datenlücke ist eine *Ableitung* des Feldes; die Stufe muss am
**Feld** hängen, nicht an der Ableitung, sonst datiert die Rangliste auf den
Tag, an dem ein Objekt zuletzt gescannt wurde.

**Warum `geschaetzt_bundesweit` mit `geschaetzt_bundesland` in eine Stufe
fällt:** Es betrifft **6 von 12.611 Objekten** (gemessen 2026-09-12; 5 von
2.108 Versionen am 2026-09-08, A11) und ist noch gröber. Eine eigene Stufe
für sechs Objekte wäre Ordnung ohne Nutzen.

**Warum S0 die drei genannten Lücken bündelt:** Alle drei heißen dasselbe —
*die Kennzahl hat keine Grundlage*, nicht *die Kennzahl ist schlecht*.
`wohnflaeche_fehlt` erzeugt Miete 0 und damit Rendite 0
(`bewerteFlaechenangabe`), `preis_miete_unvereinbar` heißt, dass eine der
beiden Eingangszahlen falsch ist (`bewertePreisplausibilitaet`),
`rent_estimate_unreliable` heißt, dass die Annahme „lässt sich normal
vermieten" nicht trägt (`bewerteMietschaetzung`).

**Warum `units_unconfirmed` (12.521 von 12.611, gemessen 2026-09-12; 567 von
1.000 am 2026-09-08) *keine* Stufe senkt:** Es wirkt
ausschließlich über `VERWALTUNG_PRO_EINHEIT_JAHR = 300 €` auf die
Bewirtschaftungskosten — nicht auf die Miete, nicht auf den Preis, nicht auf
den Kaufpreisfaktor. Sein Hebel ist um Größenordnungen kleiner als der der
Miete und zusätzlich durch die Deckelung der Bewirtschaftungskosten auf 20
bis 35 % der Jahreskaltmiete begrenzt. Es wird als **Merkmal am Objekt**
angezeigt („Einheiten angenommen: 3"), nicht als Stufe.

**Am 2026-09-12 gemessen (M1) — es bleibt ein Merkmal, endgültig.** Der
Deckel auf 20 bis 35 % der Jahreskaltmiete begrenzt den Hebel der
Einheitenannahme **strukturell** auf **−18,75 % bis +23,08 %** des DSCR: mehr
als von 0,80 · Miete auf 0,65 · Miete kann der NOI durch die Einheitenzahl
nicht wandern, gleich welche Zahl man einsetzt. Bei der aus dem eigenen
Bestand gemessenen Alternative (bestätigte Einheitenzahlen: Median 4, P75 6)
wechselt bei 4 Einheiten **kein einziges** Objekt die Meldeschwelle, bei 6
Einheiten 21 von 12.126 (0,17 %). Zum Vergleich auf derselben Menge: ±30 %
Miete bewegen 11,6 bzw. 12,8 %. Der Mietfehler ist also rund **70-mal** so
wirksam. Die Zahl betrifft heute 12.521 von 12.611 Objekten (99,3 %) — eine
eigene Stufe dafür wäre eine Stufe für fast den ganzen Bestand und würde
nichts trennen.

**`preis_auf_anfrage` und `preis_unlesbar` — richtiggestellt in der finalen
Fix-Welle (2026-09-13).** Hier stand, diese Objekte „erreichen die Datenbank
nie". **Das ist falsch** und war nur bis vor kurzem richtig: Sie wurden in
`scrapers/immowelt/titelzeile.ts` übersprungen und nur in der Schlusszeile
des Laufs gezählt (A13) — **das galt bis `ea8b731`.** Seit `ea8b731`
(Immowelt) und mit `sdd/zvg-a4` (ZVG) erreichen genau diese Objekte die
Datenbank sehr wohl: als `listings`-Zeile **ohne** zugehörige
`listing_versions`-Zeile. Nach der `rent_source`-Regel oben fällt eine
solche Zeile auf **S0**. Sie sind damit kein reiner Laufkennwert mehr,
sondern ein Fall, den die Stufentabelle jetzt kennt (siehe Kasten oben) —
ob sie zusätzlich in der Rangliste erscheinen oder ausschließlich auf der
**Betriebsseite** (Abschnitt 8) geführt werden, ist die offene Frage aus dem
Kasten oben (Abschnitt 9, Schritt 3).

### 3.4 Entscheidung: Die Rangzahl wird als **Band** gezeigt, nicht als Punkt

Ein Objekt der Stufen S1/S2 bekommt keine Zahl, sondern eine Spanne. Die
Bandbreite ist **nicht** pauschal ±30 %, sondern die **gemessene interne
Spanne des jeweiligen Bundeslandes**.

Diese Spanne ist vollständig aus dem Repo berechenbar —
`REGIONALE_MIETE_PRO_M2` und `plzBundesland.generated.json`, genau die
Rechnung, die `mieteProM2FuerBundesland` für den Mittelwert macht. Für
diesen Entwurf ausgeführt (95 PLZ-Werte, lokal, ohne Netz):

| Bundesland | PLZ-Werte | min | max | Mittel (= Schätzwert) | Band |
|---|---:|---:|---:|---:|---|
| Bayern | 28 | 8,00 | 20,50 | 12,27 | **−34,8 % … +67,1 %** |
| Nordrhein-Westfalen | 29 | 6,50 | 16,50 | 10,33 | **−37,1 % … +59,7 %** |
| Brandenburg | 11 | 6,50 | 14,50 | 10,18 | **−36,1 % … +42,4 %** |
| Berlin | 8 | 8,00 | 16,50 | 11,94 | **−33,0 % … +38,2 %** |
| Hessen | 18 | 8,50 | 16,50 | 11,78 | **−27,8 % … +40,1 %** |
| Schleswig-Holstein | 7 | 8,50 | 15,00 | 10,71 | **−20,6 % … +40,1 %** |
| Hamburg | 6 | 8,50 | 15,50 | 12,17 | **−30,2 % … +27,4 %** |
| Sachsen | 6 | 6,00 | 9,50 | 7,37 | −18,6 % … +28,9 % |
| Rheinland-Pfalz | 10 | 8,50 | 13,00 | 10,70 | −20,6 % … +21,5 % |
| Niedersachsen | 12 | 8,00 | 12,00 | 9,54 | −16,1 % … +25,8 % |
| Saarland | 2 | 8,50 | 13,00 | 10,75 | −20,9 % … +20,9 % |
| Baden-Württemberg | 22 | 10,50 | 15,00 | 12,48 | −15,9 % … +20,2 % |
| Thüringen | 8 | 6,80 | 9,50 | 8,38 | −18,9 % … +13,4 % |
| Sachsen-Anhalt | 4 | 6,80 | 9,00 | 7,83 | −13,2 % … +14,9 % |
| Mecklenburg-Vorpommern | 4 | 8,00 | 10,50 | 9,13 | −12,4 % … +15,0 % |
| Bremen | 2 | 8,50 | 10,50 | 9,50 | −10,5 % … +10,5 % |

Die fett markierten **sieben** Länder verlassen das ±30-%-Band — dieselbe
Zahl, die A11 nennt, unabhängig nachgerechnet. Bayern und NRW stimmen auf die
Nachkommastelle mit dem Kommentar in `lib/rentEstimate.ts` überein. **Die
Bandbreite ist damit keine Annahme dieses Entwurfs, sondern eine
Eigenschaft der vorhandenen Tabelle.**

Für **S2** (PLZ-genau) ist die Bandbreite die gemessene Streuung der Tabelle
gegen den Zensus: **−23,7 % bis +23,9 %**, Median −11,4 % (A11, n = 23).
Für **S3** entfällt das Band; dort steht eine Zahl.

**Das Band wird gerechnet, nicht skaliert.** Der DSCR ist *nicht*
proportional zur Miete: `berechneBewirtschaftungskosten` enthält
mietunabhängige Beträge (Verwaltung je Einheit, Instandhaltung je m²), die
erst bei der 20-/35-%-Deckelung mitwandern. Eine um 30 % niedrigere Miete
senkt den NOI um **mehr** als 30 %.

> **Am 2026-09-12 gemessen (M2) — die Begründung stimmt, ihre Reichweite
> nicht.** Die Verstärkung nach unten (DSCR-Abfall geteilt durch Mietabfall)
> hat den Median **1,000** und übersteigt 1 nur bei **887 von 11.308**
> S1-Objekten (7,8 %), dort bis zum Faktor 1,371. Für 92 % des Bestands ist
> das Band **doch** proportional zur Miete, weil die 20-/35-%-Deckelung an
> beiden Bandkanten bindet und den NOI damit auf einen festen Bruchteil der
> Miete festnagelt. Der Satz „senkt den NOI um mehr als 30 %" gilt also für
> jedes dreizehnte Objekt, nicht für alle. **Die Entscheidung ändert sich
> dadurch nicht** — für die 7,8 % wäre eine Skalierung falsch, und der zweite
> Aufruf kostet nichts.

Die Bandkanten müssen deshalb durch einen
zweiten und dritten Aufruf von `berechneKennzahlen` mit der skalierten Miete
entstehen — genau so, wie A11 seine Simulation gebaut hat und deren
Kaufpreisfaktor bei 1.879 von 1.879 Objekten mit dem gespeicherten Wert
übereinstimmte. Das Verfahren ist also bereits validiert.

### 3.5 Entscheidung: Sortiert wird nach der **unteren** Bandkante

Innerhalb einer Stufe entscheidet nicht der Punktwert, sondern der DSCR bei
der **ungünstigen** Mietannahme.

**Begründung:** Nach dem Punktwert zu sortieren belohnt genau die Objekte,
deren Schätzung am weitesten oben liegt. Nach der unteren Kante zu sortieren
heißt: *ein Objekt steigt nur, wenn es auch dann noch gut ist, wenn die
Schätzung gegen es läuft.* Und weil die Bandbreite je Bundesland verschieden
ist (3.4), ist das **keine gleichförmige Streckung** — ein Objekt in NRW mit
weitem Band fällt hinter ein gleich bewertetes in Baden-Württemberg mit engem
Band zurück. Genau das ist beabsichtigt: **Breite Unschärfe ist eine
Zurückstufung, keine neutrale Eigenschaft.**

### 3.6 Entscheidung: Schwellenwechsler werden markiert

Ein Objekt heißt **Schwellenwechsler**, wenn sein eigenes Band die Schwelle
`DSCR = 1,3` oder `Kaufpreisfaktor = 15` überquert — wenn also die Frage
„lohnt sich das" allein von der Schätzung beantwortet wird.

Aus einer Bestandszahl, die niemand am Einzelobjekt sehen kann, wird ein
Merkmal an genau den Objekten, für die sie gilt.

> **Korrigiert am 2026-09-12 durch M5.** Hier stand, dies sei „die
> Objekt-Sicht auf A11s Befund *558 von 1.879 wechseln irgendwo im Band die
> Meldeklasse*". **Das ist falsch, und zwar um den Faktor 2,4.** Gemessen:
> nach der Definition oben sind **6.658 von 11.360** bewertbaren S1/S2-Objekten
> Schwellenwechsler (58,6 %); A11s Größe, auf demselben Bestand mit denselben
> Funktionen nachgerechnet, ergibt **2.962 von 12.157** (24,4 %).
>
> Der Unterschied liegt **nicht** an der Bandbreite: mit demselben pauschalen
> ±30-%-Band statt der Landesspanne bleiben es 6.558 (57,7 %). Er liegt an der
> Definition. „Meldeklasse wechselt" verlangt, dass **alle vier**
> `topTreffer`-Bedingungen gemeinsam umspringen; „Band überquert eine
> Schwelle" zählt schon, wenn **eine** von zweien überquert wird — und die
> Faktor-Schwelle allein trifft 4.985 Objekte, die DSCR-Schwelle 2.845.
> Beide Rechnungen sind richtig, sie messen Verschiedenes. **Folge für die
> Oberfläche:** Ein Merkmal, das 59 % einer Liste trägt, markiert nichts. Das
> Merkmal wird deshalb auf die **DSCR-Schwelle** eingeengt (2.845 von 11.360 =
> 25,0 %) — sie ist die Schwelle, an der die Rangzahl hängt, und nur dort
> heißt „Wechsler" auch „der Rang selbst steht zur Disposition".

### 3.7 Wie ein **nicht beurteilbares** Objekt aussieht

> Es darf auf keinen Fall aussehen wie *geprüft und schlecht*.

**Entscheidung: S0-Objekte bekommen überhaupt keinen Rangplatz.** Sie stehen
nicht am Ende der Liste — sie stehen nicht *in* der Liste. Sie liegen in
einem eigenen, gezählten Bereich („Nicht beurteilbar — *n* Objekte", die Zahl
aus den Daten gerechnet, siehe Messfrage M3), sortiert nach `last_seen`,
nicht nach Punktzahl.

**Sie tragen keine Kennzahl.** Kein DSCR, kein Faktor, keine Rendite — an der
Stelle steht der Grund im Klartext, mit den Texten, die
`DATA_GAP_LABELS` in `lib/telegram.ts` bereits führt („Wohnfläche fehlt",
„Preis und Miete unvereinbar — eine der beiden Zahlen stimmt nicht"). Eine
graue 0,0 wäre der Fehler, den dieser ganze Abschnitt verhindern soll: Der
Nutzer läse sie als Urteil.

Das ist auch fachlich richtig, nicht nur optisch: Der Mietqualitäts-Befund
hält fest, dass Zwangsversteigerungen ohne Flächenangabe „oft trotzdem
lohnend" sind. Sie sind nicht schlecht. Über sie ist nichts bekannt.

**Verworfen — S0-Objekte ausblenden:** Vom Nutzer bereits abgelehnt
(Mietqualitäts-Befund, „Was bewusst nicht gemacht wurde").

> **Korrigiert am 2026-09-13:** Hier stand als zweite Begründung „über die
> Hälfte des Bestands verschwände, darunter der gesamte ZVG-Anteil". Das war
> der Stand vom 2026-09-08. Gemessen am 2026-09-12 und nach der korrigierten
> Stufenregel gezählt sind es **1.250 von 12.611 (9,9 %)** (3.3) — nicht die
> Hälfte, und auch nicht der gesamte ZVG-Anteil, denn 39 ZVG-Objekte liegen
> weiter in S2. **Die Ablehnung steht davon unberührt**, weil sie eine
> Entscheidung des Nutzers ist und nicht an der Größe hängt. Der Größenbefund
> ist als Begründung gestrichen.

**Verworfen — S0-Objekte mit DSCR 0 unten anhängen:** Das ist der heutige
Zustand innerhalb der Kennzahlen und exakt der Zustand, den der
Mietqualitäts-Befund „den gefährlichsten" nennt.

### 3.8 Die Schwellenlinie innerhalb jeder Stufe

Innerhalb jeder Stufe trennt eine sichtbare Linie die Objekte **über** der
Meldeschwelle (`kaufpreisfaktor` 3…15 **und** `DSCR >= 1,3`) von denen
darunter. Über der Linie steht die Rangliste; unter der Linie steht eine
zusammengeklappte Zeile mit der Anzahl.

**Warum das nötig ist:** S3 enthält am 2026-09-12 genau **ein** Objekt, und es
passiert die Schwellen *nicht* (Faktor 13,0, DSCR 0,76; M3, siehe 13.1). Ohne
diese Linie stünde das bestbelegte, aber schlechte Objekt des Bestands ganz
oben auf der Seite — die Sicherheitsstufe würde gegen Anforderung 1 arbeiten.
Mit der Linie klappt S3 zu einer einzigen ehrlichen Zeile zusammen („Belegte
Miete: 1 Objekt, nicht über der Schwelle") und das erste **gerankte** Objekt
der Seite ist das beste, das es gibt.

> **Korrigiert am 2026-09-13:** Hier standen weiter „zwei Objekte" — der Stand
> vom 2026-09-08. Gemessen sind **1 von 12.611**. Der Text der Zeile wird
> ohnehin zur Anzeigezeit aus den Daten gerechnet (3.9), nicht aus diesem
> Dokument. **Was die Zahl nicht hergibt:** Sie ist eine Momentaufnahme und
> eher fallend als steigend — von drei Objekten mit belegter Miete haben zwei
> sie wieder verloren, weil ihre neuere Version aus der Immowelt-Ergebnisliste
> stammt, die keine Miete nennt (13.1, Punkt 3).

Damit gilt Anforderung 1 („das beste Objekt steht immer oben") in der einzig
haltbaren Lesart: das beste Objekt, über das genug bekannt ist, um es so zu
nennen.

### 3.9 Was der Kopf der Seite sagt

Eine Zeile, aus den Daten gerechnet, in Worten statt in Balken. Mit den am
2026-09-12 gemessenen Zahlen (M3) lautet sie:

> *„1 Objekt mit belegter Miete, von 12.611. 0 Top-Treffer seit dem
> 2026-09-07. 98 % aller Bewertungen beruhen auf einer bundeslandweiten
> Mietschätzung."*

Die Zahlen werden **immer** zur Anzeigezeit gerechnet und nie im Text
festgeschrieben: Zwischen dem 2026-09-08 und dem 2026-09-12 sind aus „2
Objekten mit belegter Miete" 1 geworden und aus 83 % 98 %.

Ein Dashboard, das mit einer vollen Rangliste öffnet, ohne diesen Satz,
behauptet eine Datenlage, die es nicht gibt.

---

## 4. Frage 3 — Welcher Zeitraum gilt als „verändert"?

### 4.1 Befund: Ein Kalenderfenster kann hier nicht funktionieren

| Größe | Gemessen | Quelle |
|---|---|---|
| Cron nominell | alle 3 h | Workflow |
| Ausgefallene Termine | **43 %** | A10 |
| Reale Lauffrequenz | 14 Läufe in 70,1 h = **5,4 h je Lauf** | Abgänge-Spec |
| Regionen je Lauf | 1 bis 2 | Abgänge-Spec (`SWEEP_BUDGET_MS` = 12 min, `nw` allein ≈ 33 min) |
| Abstand, bis eine Region wieder dran ist (Fortsetzungsrotation) | Median **5,7 Tage**, 90. Perzentil **7,6 Tage** | Abgänge-Spec, Monte-Carlo über 3.000 Durchläufe |

Ein „letzte 24 Stunden"-Filter zeigt damit für **die meisten Bundesländer
nichts** — nicht, weil sich nichts verändert hat, sondern weil niemand
hingesehen hat. Ein leerer Bildschirm, der wie „keine Veränderungen" aussieht
und „keine Beobachtung" bedeutet: derselbe Fehler wie eine graue 0,0 bei
fehlender Wohnfläche.

### 4.2 Entscheidung: Veränderung ist historienrelativ, nicht kalenderrelativ

**Ein Objekt gilt als verändert, wenn seine neueste `listing_versions`-Zeile
`changed = true` oder `price_dropped = true` trägt — unabhängig davon, wann
sie entstanden ist.**

`diffVersion` (`lib/db.ts`) vergleicht die neue Version mit der **vorherigen
Version desselben Objekts**, nicht mit einem Zeitpunkt. Die Kadenz des Crons
geht in diese Aussage überhaupt nicht ein. Sie ist damit strukturell
immun gegen 43 % Ausfall und gegen 5,7 Tage Regionsabstand.

Nebenbefund, der dranstehen muss: `diffVersion` gibt für die **erste**
Version `changed = true` zurück. „Verändert" umfasst also „neu". Das ist
richtig — beides ist „hier ist etwas passiert, das du noch nicht gesehen
hast" —, muss aber in der Darstellung unterschieden werden: **neu** (keine
Vorversion), **Preis gesenkt** (`price_dropped`), **geändert** (`changed`
ohne Preissenkung, also Miete oder Einheitenzahl).

### 4.3 Entscheidung: Die Veränderungsliste wird nach **Anzahl** geschnitten, nicht nach Zeit

Die Ansicht „Was hat sich verändert" zeigt die **letzten N** veränderten
Objekte (Vorschlag N = 100), sortiert nach `scanned_at` der auslösenden
Version, absteigend.

**Begründung:** Eine Anzahl ist nie leer, solange es Daten gibt. Ein Fenster
ist bei dieser Kadenz oft leer. Die *Reihenfolge* der Beobachtungen ist
verlässlich, ihre *Dichte in der Zeit* nicht — also darf nur die Reihenfolge
die Ansicht bestimmen. Jede Zeile trägt ihr Datum, so dass die zeitliche
Streuung sichtbar bleibt, ohne sie zum Filter zu machen.

**Zusätzliche Filter** mit *benannten* Fenstern (7 / 14 / 30 Tage) sind
zulässig, aber **nicht Voreinstellung**. Neben ihnen steht die gemessene
Regionskadenz, damit erkennbar ist, warum das kürzeste Fenster 7 Tage ist:
7,6 Tage sind das 90. Perzentil des Regionsabstands (Abgänge-Spec,
Monte-Carlo — **nicht** dieselbe Größe wie das `last_seen`-Alter aus M4, siehe
den Kasten unten). **Ein 24-Stunden-Fenster wird bewusst nicht angeboten**,
und die Oberfläche sagt in einem Satz, warum.

> **Am 2026-09-12 gemessen (M4), am 2026-09-13 zurückgenommen: Es bleibt bei
> 7 / 14 / 30 Tagen.** Der Nachtrag hatte das kürzeste benannte Fenster auf 3
> Tage gesenkt. Die Senkung wird zurückgenommen, weil die Messung **eine
> andere Größe misst als die Begründung, die sie ersetzen sollte**:
>
> | Größe | was sie beschreibt | Wert |
> |---|---|---|
> | **Regionsabstand** (alte Begründung, Abgänge-Spec) | Abstand, bis dieselbe Region wieder an der Reihe ist — die Kadenz des Laufs | Median 5,7 d, **P90 7,6 d** (Monte-Carlo über 3.000 Durchläufe) |
> | **`last_seen`-Alter** (M4, 2026-09-12) | wie alt die jüngste Beobachtung je **Objekt** ist | Median 0,83 d, P90 2,34 d, max 4,78 d |
>
> Das eine ist ein Abstand zwischen zwei Läufen derselben Region, das andere
> das Alter einer Objektbeobachtung. Eine niedrige Zahl bei der zweiten Größe
> **widerlegt die erste nicht** — sie sagt nichts über sie. Der 7-Tage-Boden
> steht deshalb weiter auf der Begründung, die er immer hatte.
>
> **Was zu tun wäre, und warum es nicht getan ist:** Die Frage wird erst
> entschieden, wenn der **Regionsabstand selbst** aus `sweep_region_runs`
> nachgemessen ist. Am 2026-09-13 war das nicht möglich: Das dafür
> vorgesehene Skript
> `.superpowers/sdd/2026-09-12-blaetterung-meldedeckel-und-a4/messung-korrektur-regionsabstand.ts`
> **existiert nicht mehr** — weder im Arbeitszweig noch im Hauptcheckout; das
> Verzeichnis ist git-ignoriert und mit der Sitzung des Prüfers verloren
> gegangen. Es ist also nicht gescheitert, sondern gar nicht erst vorhanden.
> Ein neues Skript zu schreiben war in dieser Runde nicht zulässig (reine
> Dokumentationsaufgabe, keine Zeile Code). **Damit ist der 3-Tage-Boden
> unbelegt und die Frage offen**, nicht zugunsten von 7 Tagen entschieden:
> Auch die 7,6 Tage stammen aus einer Simulation an einem älteren, kleineren
> Bestand. Zusammen mit der Schwelle aus 6.3 ist das in vier Wochen zu messen.
>
> **Was die Messung sehr wohl hergibt:** Der 24-Stunden-Filter bleibt
> ausgeschlossen, und jetzt mit einer gemessenen Begründung — **34,4 % aller
> Objekte sind älter als einen Tag**, ein Tagesfenster versteckt also ein
> Drittel des Bestands.
>
> Die *Entscheidung*, nach Anzahl statt nach Zeit zu schneiden, berührt das
> alles nicht — sie hängt nicht an der Kadenz, sondern daran, dass eine Anzahl
> nie leer ist.

**Verworfen — „seit meinem letzten Besuch":** Verlangt Nutzerzustand und
damit eine Schreibmöglichkeit aus dem Frontend heraus. Das ist genau die
Zugriffsart, die Abschnitt 5 aus guten Gründen ausschließt, und es wäre eine
Schemaänderung. Kann später nachgezogen werden, wenn ein Anmeldeweg
existiert.

**Verworfen — „seit dem letzten Lauf":** Ein Lauf erfasst 1 bis 2 Regionen.
„Seit dem letzten Lauf" hieße „aus einem Bundesland", was wie eine
Marktaussage aussieht und eine Rotationsaussage ist.

### 4.4 Die Kehrseite: Frische muss am Objekt stehen

Wenn kein Zeitfenster filtert, muss das Alter am Objekt sichtbar sein — sonst
liest der Nutzer einen 6 Tage alten Preis als aktuell.

**Jedes Objekt trägt „zuletzt bestätigt vor X Tagen"** aus `listings.last_seen`.
**Jede Region trägt ihren eigenen Stand** aus `sweep_region_runs`
(`partition`, `started_at`) — die Tabelle existiert und wird bereits
geschrieben. Ein Filter nach Bundesland zeigt in derselben Zeile, wann dieses
Bundesland zuletzt gesehen wurde.

Das ist zugleich die Hälfte der Antwort auf Frage 5.

---

## 5. Frage 4 — Zugriff

### 5.1 Befund

Alle sechs Tabellen haben RLS aktiviert und **keine einzige Policy**
(`schema.sql`, Kommentarblock am Ende, ausdrücklich so gewollt). Damit sieht
`anon` und `authenticated` **nichts**. Nur der `service_role`-Key umgeht RLS
— und der darf niemals ins Frontend, weil er nicht nur alles liest, sondern
auch alles **schreibt und löscht**.

### 5.2 Die drei Wege

| Weg | Was das Frontend hält | Was es an der **Produktionsdatenbank** verlangt | Schlimmster Fall bei Fehlkonfiguration |
|---|---|---|---|
| **A — anon-Key + Read-Policies** | anon-Key (öffentlich) | **`create policy … for select to anon` auf mindestens `listings` und `listing_versions`** | Der gesamte Bestand samt Kennzahlen ist für jeden lesbar, der den Key hat — der Key steht im ausgelieferten JavaScript. Faktisch eine öffentliche API. |
| **B — Supabase Auth + Policies `to authenticated`** | anon-Key + Anmeldung | **Policies `to authenticated`, plus mindestens ein angelegtes Benutzerkonto** | Lesezugriff nur nach Anmeldung. Fehlerfall ist eine zu weite Policy, nicht ein Schlüsselverlust. |
| **C1 — Snapshot-Export (Empfehlung)** | **nichts** — nur eine fertige Datei | **keine** | Der veröffentlichte Stand ist lesbar. Es existiert kein Schlüssel und kein Weg zur Datenbank. |
| **C2 — Serverseitiger Leseweg mit Service-Key** | nichts | keine | **Ein einziger falsch abgesicherter Endpunkt gibt Schreib- und Löschrechte auf die gesamte Produktionsdatenbank.** |

### 5.3 Entscheidung: **C1 — Snapshot-Export.** B als Ausbaustufe.

Der Lauf, der ohnehin schon den Service-Key hält (GitHub Actions), schreibt
am Ende eine fertige, gerankte Datei — Objekte, Stufen, Bänder, Änderungen,
Zustände. Diese Datei wird veröffentlicht. Das Frontend liest ausschließlich
sie.

**Begründung:**

1. **Es verlangt null Änderungen an der Produktionsdatenbank.** Keine Policy,
   keine Rolle, kein Schema. Das ist die einzige Option, die dem Nutzer keine
   Entscheidung über Produktionsdaten abverlangt, bevor überhaupt etwas
   sichtbar ist.
2. **Es kann strukturell keinen Schreibzugriff verlieren**, weil das
   veröffentlichte Artefakt keinen Schlüssel enthält.
3. **Die Aktualität kostet nichts.** Die Daten sind ohnehin nur so frisch wie
   der letzte Lauf — real alle 5,4 h (A10), je Region alle 5,7 Tage. Ein
   Live-Lesepfad würde diese Zahlen nicht verbessern, sondern nur genauer
   veralten.
4. Der Rang lässt sich damit aus **einer** getesteten Funktion erzeugen
   (`ranking.ts`, Schritt 2 in Abschnitt 9) statt aus in SQL nachgebauten
   Schwellen. Zwei Kopien derselben Zahl waren in diesem Projekt schon
   einmal der Fehler (Kommentar in `bewertePreisplausibilitaet`).

**Verworfen — C2 (Service-Key auf einem Server):** Der Gewinn gegenüber C1
ist Live-Aktualität, die nach Punkt 3 nicht existiert. Der Preis ist der
allmächtige Schlüssel an einem zweiten Ort. Kein vertretbares Verhältnis.

**Verworfen als *erster* Schritt — A:** Der anon-Key ist öffentlich, also
wäre der komplette Bestand öffentlich. Ob das gewollt ist, ist eine
Entscheidung des Nutzers (E-2) — aber sie sollte nicht nebenbei durch die
Wahl der Technik getroffen werden.

**Ausbaupfad B:** Sobald das Dashboard mehr können muss, als ein Snapshot
trägt (freie Filter über den Gesamtbestand, Verlaufsansichten je Objekt,
gespeicherter „letzter Besuch"), ist B der richtige nächste Schritt — mit
Policies, die ausschließlich `select` erlauben und ausschließlich für
`authenticated`. C1 ist keine Sackgasse: dieselbe `ranking.ts` speist beide.

### 5.4 Wer darf das Dashboard sehen

Das ist **keine technische, sondern eine Entscheidung des Nutzers** (E-2,
E-3). Die technischen Stufen, in aufsteigender Härte: nicht verlinkte URL
(Verschleierung, keine Sicherheit) — Basic Auth beim Hoster — Anmeldung nach
Weg B. Weg C1 verträgt alle drei.

Unabhängig davon steht eine inhaltliche Frage im Raum, die dieser Entwurf
nicht entscheiden kann: Das Artefakt enthält von Immowelt übernommene Titel
und Preise und verlinkt Bilder aus dem Immowelt-CDN. Bei einer öffentlich
erreichbaren Seite ist das eine andere Frage als bei einer privaten (E-3).

---

## 6. Frage 5 — Abgänge, und die Lücke, die nie zuschlägt

### 6.1 Die feststehende Kopplung

Option 3 („markieren ohne löschen", Abgänge-Spec) setzt `disappeared_at` und
löscht nie. Das Dashboard **graut solche Objekte aus, statt sie zu
verbergen** — das ist die halbe Begründung für Option 3 und wird hier
zugesagt.

### 6.2 Die Lücke, die benannt werden muss

`nw`, `bw` und `mv` weisen ihre Trefferzahl **nirgends** aus — unabhängig in
zwei Regionen reproduziert, kein Parserfehler (A15, Übergabe 2026-09-09).
`istRegionVollstaendig` kann für sie nie `true` liefern, und seit der
Fail-closed-Umstellung heißt das: **aus diesen Regionen wird nie ein Objekt
als abgängig markiert.** Dazu kommen Objekte ohne zuordenbare Region, die
unter keiner regionsgenauen Regel je markierbar sind.

> **Zwei verschiedene Größen, am 2026-09-13 auseinandergezogen.** Der Nachtrag
> hat „54 statt 157" geschrieben und damit zwei Zählungen verglichen, die
> nicht dasselbe messen. Beide am 2026-09-12 über den vollständigen Bestand
> (n = 12.611) ausgezählt:
>
> | Größe | Verfahren | Wert 2026-09-12 |
> |---|---|---|
> | **ohne `fundort`** — die Größe, aus der die alten 157 stammen | Feld `listings.fundort` ist leer | **250 (2,0 %)**, davon 54 Immowelt und 196 ZVG |
> | **ohne zuordenbare Region** — die Größe, die E-7 wirklich betrifft | `partitionEinesListings` liefert keine Region (gespeicherter `fundort`, sonst ZVG-Präfix der `external_id`) | **54 (0,4 %)** |
>
> Der Unterschied sind die **196 ZVG-Objekte**: Sie tragen keinen `fundort`,
> bekommen ihre Region aber aus dem Präfix ihrer `external_id`. Sie sind
> zuordenbar und gehören deshalb nicht zu E-7.
>
> **Der Rückgang von 8,2 % auf 0,4 % ist damit teils definitorisch**, nicht
> allein ein Fortschritt: Die alte Zahl zählte über die erste Größe, die neue
> über die zweite. Was an dem Rückgang Messung ist und was Definition, ist mit
> diesen beiden Zahlen **nicht auseinanderzuhalten**, weil die alte Zählung
> vom 2026-09-09 nicht nach der zweiten Größe wiederholt wurde.
>
> **Vermutung, nicht gemessen:** dass der Fundort seit dem Umbau auf die
> Ergebnisliste zu jedem neuen Objekt mitgeschrieben wird und der Altbestand
> gegenüber dem Zuwachs klein geworden ist. Das ist plausibel, aber für diesen
> Entwurf **nicht nachgemessen**; es wird hier als Vermutung geführt und nicht
> als Ursache behauptet (`ABNAHME-BASIS.md` A-2 verlangt genau das).
>
> **Was die Zahlen nicht hergeben:** Sie sind eine Momentaufnahme eines
> siebentägigen Bestands. Sie sagen, wie viele Objekte **heute** keiner Region
> zuzuordnen sind — nicht, wie viele es bleiben werden.

**E-7 betrifft damit 54 Objekte** — die ohne zuordenbare Region, nicht die 250
ohne `fundort`.

> **Folge: Das Fehlen einer Abgangsmarkierung ist kein Beleg für
> Verfügbarkeit.** Wer graue und nicht-graue Objekte als „weg" und „da" liest,
> liegt für die größte Region des Bestands systematisch falsch.

### 6.3 Entscheidung: Drei Zustände, nicht zwei

| Zustand | Bedingung | Darstellung |
|---|---|---|
| **verfügbar** | `disappeared_at is null` **und** `last_seen` jünger als die Kadenz seiner Region | normal |
| **unbestätigt** | `disappeared_at is null`, aber `last_seen` älter als das Doppelte der Regionskadenz — oder die Region kann Abgänge grundsätzlich nicht erkennen (`nw`, `bw`, `mv`) oder `partitionEinesListings` liefert **keine Region** | eigenes Merkmal, **nicht grau**: „seit X Tagen nicht bestätigt" |
| **abgängig** | `disappeared_at is not null` | ausgegraut, mit Datum |

> **Präzisiert am 2026-09-13:** In der mittleren Zeile stand „oder `fundort is
> null`". Das wäre zu weit gefasst — die **196 ZVG-Objekte** tragen keinen
> `fundort`, sind über das Präfix ihrer `external_id` aber sehr wohl einer
> Region zuzuordnen (6.2). Maßgeblich ist, ob `partitionEinesListings` eine
> Region liefert; das betrifft **54 Objekte**, nicht 250.

**„Unbestätigt" ist optisch von „abgängig" getrennt**, und zwar deutlich:
Grau heißt „beobachtet, dass es weg ist". Unbestätigt heißt „nicht
hingesehen". Beides in dieselbe Farbe zu legen wäre dieselbe Verwechslung wie
DSCR 0,0 bei fehlender Wohnfläche — die dritte Anwendung des Leitsatzes aus
Abschnitt 1.

Für Regionen ohne Abgangserkennung steht der Grund einmal im Klartext am
Regionsfilter: *„Nordrhein-Westfalen weist seine Trefferzahl nicht aus —
Abgänge können hier nicht erkannt werden."*

**Die Schwelle für „unbestätigt" ist regionsindividuell**, nicht global: `nw`
wird alle 15 h geprüft, `ni` und `bw` alle rund 3 Tage (Abgänge-Spec). Eine
gemeinsame Schwelle würde entweder `nw` zu spät oder `ni` dauerhaft als
unbestätigt zeigen.

> **Am 2026-09-12 gemessen (M4), am 2026-09-13 nachkorrigiert: Die Schwelle
> ist auf sieben Tagen Historie nicht entscheidbar.**
>
> **Verfahren.** `last_seen`-Alter aller 12.611 Objekte gegen eine feste Uhr
> (2026-09-12 16:00 UTC), Region über `partitionEinesListings`; Herleitung in
> 13.4.
>
> | Größe | Wert |
> |---|---|
> | `last_seen`-Alter über den ganzen Bestand | Median **0,83 d**, P90 **2,34 d**, Maximum **4,78 d** |
> | Regionsmediane | **0,13 bis 1,33 d** |
> | höchstes Regions-P90 | `nw` **3,32 d**, `ni` **3,10 d** |
> | ältestes `first_seen` | **6,92 d** |
> | länger als 5 Tage im Bestand | **187 von 12.611 (1,5 %)** |
>
> **Der Nachtrag hatte hier eine globale Schwelle von 3 Tagen beschlossen. Sie
> wird zurückgezogen**, weil ihre drei Begründungen an den eigenen Messwerten
> scheitern:
>
> - „3 Tage liegen über jedem Regions-P90" — falsch: `nw` liegt bei 3,32 d.
> - „eine gerade Zahl über dem gemessenen Maximum aller Regionen" — falsch:
>   das Maximum ist 4,78 d.
> - „trifft keine Region dauerhaft" — widerlegt: bei 3 Tagen stünden `ni`
>   **217 von 853 (25,4 %)** und `nw` **337 von 3.163 (10,7 %)** dauerhaft als
>   unbestätigt.
>
> **Und die Grundgesamtheit trägt eine 3-Tage-Aussage ohnehin nicht.** Der
> Bestand ist am 2026-09-05 entstanden; nur 187 von 12.611 Objekten (1,5 %)
> sind überhaupt länger als fünf Tage darin. Ein Objekt von gestern *kann*
> kein Alter von 3 Tagen zeigen. Auf die Objekte eingeschränkt, die einen
> solchen Rückstand überhaupt zeigen könnten, liegen **13,0 %** über 3 Tagen —
> nicht die 5,6 %, die der Nachtrag über den ganzen Bestand gerechnet hat.
>
> **Entschieden: nicht entscheidbar.** Die Schwelle wird **in vier Wochen
> nachgemessen**; bis dahin gilt die **regionsindividuelle** Definition aus
> der Zustandstabelle oben. Das ist kein Aufschub aus Bequemlichkeit: Eine
> globale Zahl aus diesen sieben Tagen wäre eine Schwelle mit schwacher
> Begründung, und die ist in diesem Projekt schlechter als ein offener Punkt.
>
> **Was die Messung trotzdem hergibt:** Die Spreizung zwischen den Regionen,
> die die regionsindividuelle Schwelle begründet hat, ist im Median auf 0,13
> bis 1,33 Tage geschrumpft. Die Begründung der regionsindividuellen Schwelle
> ist damit **schwächer geworden, aber nicht widerlegt** — sie steht bis zur
> Nachmessung.
>
> **Was die Zahlen nicht hergeben:** Die 4,78 Tage sind zugleich die
> Obergrenze dessen, was überhaupt messbar war — ein längerer Rückstand *kann*
> in diesen Daten nicht vorkommen. Sie belegen „die Kadenz hält über die
> letzten sieben Tage", nicht „sie hält dauerhaft". Die 43 % Cron-Ausfall aus
> A10 und die 5,7 Tage Regionsabstand aus der Abgänge-Spec sind dadurch
> **nicht** widerlegt; sie stammen von einem älteren, kleineren Bestand.

### 6.4 Die Karenz endet, das Grau nicht — was danach geschieht

Der Nutzer hat „während der zweitägigen Karenz ausgegraut" gefordert. Unter
Option 3 wird aber **nie gelöscht**, also endet das Grau nie von selbst, und
die Rangliste füllt sich unbegrenzt mit toten Objekten.

**Entscheidung:**

- **Innerhalb der Karenz** (`KARENZ_TAGE = 2`, `lib/bestand.ts`) bleibt das
  Objekt **an seiner Rangposition** und wird ausgegraut. Genau die
  Anforderung des Nutzers — und sinnvoll, weil ein Rückkehrer die Markierung
  aufhebt (`ermittleRueckkehrer`, ohne vollständigen Sweep).
- **Nach der Karenz** verlässt es die Rangliste und wandert in einen eigenen
  Bereich **„Abgänge"**, sortiert nach `disappeared_at` absteigend. Gelöscht
  wird nichts — die Zeile bleibt, nur ihr Platz ändert sich.

Damit bleibt die Rangliste eine Liste kaufbarer Objekte, ohne dass eine
Beobachtung verloren geht. Wie lange der Abgänge-Bereich zurückreicht, ist
eine Entscheidung des Nutzers (E-6).

---

## 7. Was dieser Entwurf **nicht** löst

Ehrliche Fehlanzeige, damit niemand sie im Bild sucht:

- **Er macht die Mietschätzung nicht besser.** Der wirksamste Hebel bleibt
  eine PLZ für Immowelt-Objekte (`lib/rentEstimate.ts`), und die ist von
  Rechenzentrums-Adressen gesperrt. Das Dashboard macht die Unschärfe
  sichtbar; es beseitigt sie nicht.
- **Er erzeugt keine Top-Treffer.** Solange nur **ein** Objekt eine belegte
  Miete trägt (gemessen am 2026-09-12, M3), bleibt S3 fast leer. Das ist kein
  Fehler der Darstellung.
- **Er repariert keine Abdeckung.** Ein Bundesland, das seit über einer Woche
  nicht gesweept wurde, steht auch im Dashboard so da: sichtbar, aber nicht
  behoben. Wie oft das vorkommt, ist **offen**: Die Abgänge-Spec nennt für den
  **Regionsabstand** ein 90. Perzentil von 7,6 Tagen (Monte-Carlo, älterer
  Bestand); die Messung vom 2026-09-12 hat eine **andere** Größe erhoben, das
  `last_seen`-Alter je Objekt, und kann die 7,6 Tage weder bestätigen noch
  widerlegen (4.3, 13.4).
- **Er ersetzt Telegram nicht.** Die Meldung ist der Weckruf, das Dashboard
  der Überblick. Ob bundeslandgenaue Schätzungen überhaupt melden dürfen, ist
  eine offene Nutzerentscheidung (A11 Schritt 4 = E-4 hier).

---

## 8. Nebenprodukt: eine Betriebsseite

Drei Größen gehören sichtbar, aber nicht in die Rangliste, weil sie den Lauf
beschreiben und nicht ein Objekt: übersprungene Objekte je Lauf
(`preis_auf_anfrage` / `preis_unlesbar`, getrennt nach Fundort — A13 hat sie
genau deshalb getrennt), Stand je Region aus `sweep_region_runs`, und
Meldebudget samt Rückstand (`Meldungen: X von hoechstens 25`, zuletzt 117
zurückgestellt — D-5).

> **Ergänzt in der finalen Fix-Welle (2026-09-13):** Seit `ea8b731` und mit
> `sdd/zvg-a4` legen `preis_auf_anfrage` und `preis_unlesbar` inzwischen doch
> eine `listings`-Zeile an (ohne Version, S0 nach 3.3) — sie beschreiben also
> nicht mehr nur den Lauf. **Ob sie deshalb zusätzlich im S0-Bereich der
> Rangliste erscheinen oder wie hier ausschließlich auf dieser Betriebsseite
> geführt werden, ist offen** und in 3.3 als Frage an den Nutzer notiert
> (Abschnitt 9, Schritt 3). Die Zählung nach Fundort bleibt in jedem Fall
> auf der Betriebsseite sinnvoll.

Kosten: null zusätzliche Datenhaltung, alles ist bereits gespeichert oder
steht im Lauf-Log. Nutzen: A13 nennt die getrennte Quote ausdrücklich als
Regressionsanzeige — eine steigende `preis_unlesbar`-Quote ist ein Fehler,
eine steigende `preis_auf_anfrage`-Quote ist Markt. Das sieht heute niemand.

---

## 9. Schnitt in umsetzbare Schritte

In dieser Reihenfolge. Kein Schritt beginnt, bevor der vorige abgenommen ist.
**Die Schritte 3 bis 7 sind Frontend-Arbeit und stehen unter dem Vorbehalt
der Basis-Abnahme** ([`ABNAHME-BASIS.md`](../ABNAHME-BASIS.md)).

**Schritt 0 — Die Messfragen schließen (kein Code).**
M1 bis M6 aus Abschnitt 10 beantworten. Zwei davon (M1, M3) verschieben
möglicherweise die Stufengrenzen aus 3.3; sie gehören vor die erste Zeile.
*Ergebnis: ein Nachtrag zu diesem Dokument, keine Codeänderung.*

> **Stand 2026-09-13: gemessen ja, geschlossen nein.** Alle sechs Fragen sind
> am 2026-09-12 gemessen (Abschnitt 13). Die Korrekturrunde vom 2026-09-13 hat
> drei Punkte daraus wieder **geöffnet** (13.8): die Schwelle für
> „unbestätigt" (6.3), das kürzeste Zeitfenster (4.3) und die Frage, ob S2
> einen eigenen Block trägt (3.3). Die ersten beiden brauchen **vier Wochen
> mehr Historie** und blockieren Schritt 2 nicht; die dritte ist eine
> Darstellungsfrage und gehört vor Schritt 4.

**Schritt 1 — Entscheidungen einholen (kein Code).**
E-1 bis E-8 aus Abschnitt 11. Besonders E-1 (Zugriffsweg) und E-4
(bundeslandgenaue Meldungen) legen fest, was überhaupt gebaut wird.

**Schritt 2 — `scraper/lib/ranking.ts`: reine Funktionen, keine Ein-/Ausgabe.**
Sicherheitsstufe aus `rent_source` + `data_gaps` + `living_area_m2` (3.3,
inklusive der Aufzählungsregel für `rent_source`); Rangzahl; Bandkanten durch
erneuten Aufruf von `berechneKennzahlen` mit skalierter Miete; Bandbreite je
Bundesland aus `REGIONALE_MIETE_PRO_M2` und `plzBundesland.generated.json`;
Schwellenwechsler-Merkmal; die drei Verfügbarkeitszustände.
**Berichtigt in der finalen Fix-Welle (2026-09-13):** TDD gilt wie im ganzen
Projekt, aber nicht beide Tests sind „zuerst rot". Der Identitätstest
`geschaetzterDscr = nettomietrenditeCapRate / 6` (2.1) ist als
**Charakterisierungstest** angelegt — er hält bereits auf dem heutigen Code
und wird vorab ausgeführt, nicht zuerst rot gesehen; er bricht sofort, wenn
jemand eine der Formeln ändert. **Ein Test muss zuerst rot sein:** dass ein
Objekt mit `wohnflaeche_fehlt` **keine** Kennzahl ausliefert statt einer 0.
*Rein und testbar, ohne Datenbank, ohne Netz, ohne Frontend.*

**Schritt 3 — Snapshot-Export.**
Ein zusätzlicher, ausschließlich **lesender** Schritt am Ende des Laufs, der
den neuesten Stand je Objekt durch `ranking.ts` schickt und als Datei
ablegt. Kein Schreibzugriff, keine Schemaänderung. Damit ist der Inhalt des
Dashboards vollständig da, bevor eine einzige Zeile Oberfläche existiert —
und prüfbar, indem man die Datei liest.
**Hier fällt eine offene Frage an den Nutzer (ergänzt in der finalen
Fix-Welle, 2026-09-13, siehe 3.3):** `listings`-Zeilen ohne
`listing_versions`-Zeile (`preis_auf_anfrage` / `preis_unlesbar`, seit
`ea8b731` und `sdd/zvg-a4`) fallen nach der `rent_source`-Regel auf S0, haben
aber keinen `data_gaps`-Eintrag und damit keinen Klartext-Grund nach 3.7. Ob
der Export sie in den S0-Bereich aufnimmt oder ausschließlich auf die
Betriebsseite (Abschnitt 8) legt, und welcher Klartext-Grund ihnen dort
zugeschrieben wird, ist **nicht entschieden** — keine Zahl dazu ist gemessen
oder erfunden.

**Schritt 4 — Die Rangliste.**
Blöcke nach Stufen (3.3), Schwellenlinie je Block (3.8), Band statt Punkt
(3.4), Kopfzeile (3.9). Erste sichtbare Ausbaustufe.
**Hier fällt die offene Blockfrage:** ob S2 mit seinen **52 Objekten (0,4 %)**
einen eigenen beschrifteten Block bekommt oder mit S1 zusammengelegt wird und
die PLZ-Genauigkeit als Merkmal am Objekt trägt (3.3). Die Frage berührt
`ranking.ts` nicht — die Stufe wird dort in jedem Fall berechnet.

**Schritt 5 — Die Veränderungsansicht.**
Letzte N Änderungen (4.3), drei Arten unterschieden (4.2), Datum je Zeile.

**Schritt 6 — Zustände und Frische.**
Drei Verfügbarkeitszustände (6.3), Regionsstand am Filter (4.4), Abgänge-
Bereich (6.4). **Setzt Option 3 im Scraper voraus** — bis dahin ist
`disappeared_at` für Immowelt immer `null` und der Zustand „abgängig" tritt
nie ein. Bis dahin trägt „unbestätigt" die ganze Aussage.
**Und die Schwelle für „unbestätigt" ist offen** (6.3): Bis zur Nachmessung
gilt die regionsindividuelle Definition; eine feste globale Tageszahl darf
hier nicht hart verdrahtet werden.

**Schritt 7 — Betriebsseite** (Abschnitt 8). Zuletzt, weil sie niemandem
fehlt, der sie nicht kennt.

---

## 10. Offene Messfragen

Alle verlangen einen Datenbank- oder Netzzugriff und wurden für diesen
Entwurf **nicht** ausgeführt.

> **Alle sechs sind am 2026-09-12 gemessen worden.** Die Fragen bleiben
> stehen, weil sie begründen, *warum* gemessen wurde; die Antwort steht je
> Zeile in der rechten Spalte, die Herleitung im **Nachtrag (Abschnitt 13)**.

| # | Frage | Warum sie zählt | Antwort 2026-09-12 |
|---|---|---|---|
| **M1** | Wie stark verschiebt `units_unconfirmed` (Annahme `MIN_EINHEITEN = 3`) den DSCR? Nachrechnung über alle bewertbaren Objekte mit angenommener und alternativer Einheitenzahl, im Verfahren von A11. | Entscheidet, ob es Merkmal bleibt (3.3) oder eine eigene Stufe wird. Betrifft 567 von 1.000 Versionen. | **Merkmal, endgültig.** Der Hebel ist durch die 20-/35-%-Deckelung strukturell auf **−18,75 % … +23,08 %** begrenzt; bei der gemessenen Alternative (4 Einheiten) wechselt **0** von 12.126 Objekten die Schwelle, bei 6 Einheiten 21 (0,17 %). ±30 % Miete bewegen 11,6 %. |
| **M2** | Wie breit ist das DSCR-Band je Objekt tatsächlich, wenn die Miete um die Landesspanne aus 3.4 skaliert wird? | Die Bandbreite ist nach 3.4 **nicht** proportional zur Miete. Ohne diese Messung ist die Sortierung nach unterer Kante (3.5) unkalibriert. | Band **67,9 % des Punktwerts im Median** (P95 101,9 %, max 126,5 %), S2 47,6 %. Die Nichtproportionalität gilt nur für **7,8 %** der Objekte (Median-Verstärkung 1,000). Sortierung nach unterer Kante verschiebt den Rang im Median um **713 Plätze**. |
| **M3** | Wie verteilen sich die Objekte auf S3/S2/S1/S0? | 83 % S1 und „über die Hälfte `wohnflaeche_fehlt`" überschneiden sich unbekannt stark. Entscheidet, ob S2 überhaupt genug Objekte für einen eigenen Block hat. | **S3 1 · S2 52 · S1 11.308 · S0 1.250** von 12.611, gezählt nach der **korrigierten** S0-Regel (Nachkorrektur 2026-09-13; der Nachtrag zählte mit 196/11.312/1.102 noch nach der alten). 3.3 ist **korrigiert**, samt der Lücke in der S0-Bedingung (148 Objekte). **Die Blockfrage für S2 bleibt damit offen, nicht beantwortet:** Ein eigener, beschrifteter Block für 52 von 12.611 (0,4 %) ist nicht mehr belegt (wie in 3.3); zu entscheiden vor Schritt 4 aus Abschnitt 9. *Was die Zahl nicht hergibt:* Momentaufnahme eines siebentägigen Bestands, Eigenschaft der Quellenmischung, nicht des Marktes. |
| **M4** | Verteilung des `last_seen`-Alters je Region. | Kalibriert die Schwelle für „unbestätigt" (6.3). | Median **0,83 d**, P90 **2,34 d**, Maximum **4,78 d**; Regionsmediane 0,13 bis 1,33 d. **Die Schwelle bleibt offen** (Nachkorrektur 2026-09-13): Die im Nachtrag beschlossene globale 3-Tage-Schwelle ist zurückgezogen — `nw` hat ein P90 von 3,32 d, das Maximum ist 4,78 d, und bei 3 Tagen stünden `ni` 25,4 % und `nw` 10,7 % dauerhaft unbestätigt. Bis zur Nachmessung in vier Wochen gilt die regionsindividuelle Definition (6.3). Das kürzeste Zeitfenster in 4.3 bleibt bei **7 Tagen**, weil M4 das `last_seen`-Alter misst und nicht den Regionsabstand. *Was die Zahl nicht hergibt:* Der Bestand ist erst 6,92 Tage alt; ein längerer Rückstand konnte gar nicht auftreten. |
| **M5** | Wie viele Objekte sind Schwellenwechsler nach 3.6 — und deckt sich die Zahl mit A11s 558? | Prüft, ob die Objekt-Sicht dieselbe Größe misst wie die Bestands-Sicht. Weicht sie ab, ist eine der beiden Rechnungen falsch. | **Sie deckt sich nicht, und keine der beiden ist falsch — sie messen Verschiedenes.** 3.6: **6.658 von 11.360 (58,6 %)**; A11s Größe nachgerechnet: **2.962 von 12.157 (24,4 %)** gegen 29,7 %. Der Unterschied ist die Definition, nicht die Bandbreite. 3.6 ist korrigiert. |
| **M6** | Wie oft ändert eine Preissenkung tatsächlich die Rangposition — und um wie viel? | Anforderung 3 des Nutzers steht und fällt damit. Wenn Preissenkungen den Rang kaum bewegen, braucht die Veränderungsansicht mehr Gewicht als die Rangliste. | **Sie bewegt den Rang — belegt ist das aber nicht.** 17 echte Senkungen (von 49 `price_dropped`-Zeilen; 10 sind Parserkorrekturen, 22 nicht nachrechenbar): Median −15,9 % Preis → **+539 Rangplätze** (4,4 % des Feldes); selbst −3,0 % bewegten 105 Plätze. **2.4 bleibt, gestützt auf die Formel, nicht auf diese Zahlen** (Vorbehalt ergänzt am 2026-09-13). *Was die Zahl nicht hergibt:* n = 17 aus sieben Tagen, mehrere Fälle zum selben Objekt — und gerankt wurde **global über alle 12.157 bewerteten Objekte einschließlich S0**, also über eine Liste, die das Dashboard nach 3.2/3.7 nicht zeigt; **6 der 17** Senkungen lagen in S0, das gar keinen Rangplatz bekommt. Nach vier Wochen innerhalb der Stufe und ohne S0 zu wiederholen. |

---

## 11. Entscheidungen des Nutzers

Alles hier Aufgeführte ist **nicht** von diesem Entwurf entschieden. Es
betrifft Geld, Risiko, Schreibzugriffe auf Produktionsdaten oder Recht.

| # | Entscheidung | Was daran hängt |
|---|---|---|
| **E-1** | **Zugriffsweg: Snapshot-Export (C1, empfohlen), Anmeldung (B) oder anon-Key (A)?** | B und A verlangen **`create policy` auf der Produktionsdatenbank**; B zusätzlich ein angelegtes Benutzerkonto. C1 verlangt **keine** Änderung. |
| **E-2** | **Wer darf das Dashboard sehen?** Nicht verlinkte URL, Basic Auth, oder Anmeldung? | Bestimmt, ob der gesamte Bestand samt Kennzahlen faktisch öffentlich ist. |
| **E-3** | **Darf die Seite öffentlich erreichbar sein**, obwohl sie von Immowelt übernommene Titel und Preise zeigt und Bilder aus dem Immowelt-CDN einbindet? | Rechtsfrage. Dieser Entwurf hat dazu keine Kompetenz und trifft keine Aussage. |
| **E-4** | **Dürfen bundeslandgenaue Schätzungen melden — oder nur im Dashboard erscheinen?** (identisch mit A11 Schritt 4) | **Zwei Zahlen, zwei Grundgesamtheiten** (vereinheitlicht 2026-09-13): **339 von 409 Meldekandidaten** stammen aus A11 vom 2026-09-08 und zählen nur die Objekte, die die Meldeschwellen passieren. Aus M3 (2026-09-12) folgt die andere Seite: Dürfen bundeslandgenaue Schätzungen nicht melden, bleiben nach der **korrigierten** Stufenregel **S3 1 + S2 52 = 53 von 12.611** Objekten für den Meldeweg (13.7; nach der alten Stufenregel waren es 197). **Die 53 sind keine eigene Messung**, sondern eine Ableitung aus den Stufenzahlen (13.1); die 339 von 409 sind dagegen A11s eigene Zählung vom 2026-09-08 und keine Ableitung. Bei „nur Dashboard" wird das Dashboard der Hauptweg und nicht die Ergänzung — und zwar deutlicher, als die 339 vermuten lassen. |
| **E-5** | **Gilt der Rangvorschlag aus 2.3 (DSCR, keine erfundene Punktzahl)?** | Alles Weitere baut darauf. Eine gewichtete Punktzahl wäre möglich, aber die Gewichte müssten vom Nutzer kommen, nicht vom Entwurf. |
| **E-6** | **Wie lange bleiben Abgänge im Archiv?** Unbegrenzt, oder nach N Tagen ausblenden (nicht löschen)? | Unter Option 3 wird nie gelöscht; das Archiv wächst sonst unbegrenzt. |
| **E-7** | **Was geschieht mit den Objekten ohne zuordenbare Region?** (identisch mit Frage 5 der Abgänge-Spec) — am 2026-09-12 über `partitionEinesListings` ausgezählt: **54 von 12.611 (0,4 %)** | Sie sind dauerhaft „unbestätigt". Sie zu verwerfen wäre ein Schreibzugriff auf Produktionsdaten. **Zum Vergleich der Größen** (präzisiert 2026-09-13): Objekte **ohne `fundort`** sind es 250 (2,0 %), davon 196 ZVG, die über ihr `external_id`-Präfix trotzdem zuordenbar sind. Die alten **157 (8,2 %)** vom 2026-09-09 stammen aus der Zählung **ohne `fundort`** und sind mit den 54 **nicht vergleichbar**; der Rückgang ist teils definitorisch. *Was die Zahl nicht hergibt:* wie viel davon Fortschritt ist — die alte Zählung wurde nie nach der neuen Definition wiederholt. |
| **E-8** | **Wo läuft das Dashboard, und was darf es kosten?** | Ein Snapshot ist eine statische Datei und praktisch kostenlos; Weg B verlangt einen laufenden Dienst. |

---

## 12. Zusammenfassung in fünf Sätzen

1. **Rang** ist der DSCR — die einzige der fünf Kennzahlen, die alles kennt,
   was die anderen kennen; drei der fünf sind rechnerisch dieselbe Zahl, und
   eine der vier Top-Treffer-Bedingungen kann nie greifen.
2. **Unsicherheit** ordnet vor der Punktzahl: Sicherheitsstufen als getrennte
   Blöcke (ob S2 mit seinen 52 Objekten einen eigenen Block bekommt, ist
   offen, siehe 3.3), die Zahl als Band mit der gemessenen Spanne des
   jeweiligen Bundeslandes, sortiert nach der ungünstigen Kante.
3. **Nicht beurteilbare Objekte bekommen keinen Rangplatz und keine
   Kennzahl** — nur den Grund im Klartext, damit sie nie wie geprüft und
   schlecht aussehen.
4. **Veränderung** wird an der Versionshistorie gemessen, nicht am Kalender,
   und die Liste wird nach Anzahl geschnitten — weil eine Anzahl nie leer
   ist, eine Zeitspanne aber nur so verlässlich wie die Kadenz (das am
   2026-09-12 gemessene `last_seen`-Alter lag mit einem P90 von 2,34 Tagen
   niedrig, misst aber **nicht** den Regionsabstand der Abgänge-Spec; das
   kürzeste benannte Fenster bleibt deshalb bei 7 Tagen, und die Frage ist
   offen — siehe 4.3 und 13.4).
5. **Zugriff** über einen Snapshot ohne jeden Schlüssel im Frontend, weil das
   die einzige Variante ist, die **keine** Änderung an der
   Produktionsdatenbank verlangt — und **Abgänge, Unbestätigtes und
   Verfügbares sind drei Zustände**, weil `nw`, `bw` und `mv` nie einen
   Abgang melden werden.

---

## 13. Nachtrag 2026-09-12 — Schritt 0 geschlossen: M1 bis M6 gemessen

**Gemessen am 2026-09-12** über rein lesende Abfragen gegen die
Produktionsdatenbank. Kein Netzabruf, kein Scraper-Lauf, kein Schreibzugriff,
keine Codeänderung.

### 13.0 Verfahren und Gegenprobe

**Datengrundlage.** Vollständiger Bestand, seitenweise über den
Primärschlüssel geladen (dasselbe Wandernder-Heap-Muster wie
`ladeSeitenweise` in `lib/bestandDb.ts`, weil PostgREST höchstens 1.000
Zeilen je Anfrage liefert): **12.611 `listings`** und **17.391
`listing_versions`**; beide Zahlen decken sich mit einer getrennten
`count: exact`-Abfrage, die Blätterung hat also nichts übersehen.
Ausgewertet wird durchweg die **jüngste Version je Objekt**, sofern nicht
anders vermerkt. 93 Objekte sind als abgängig markiert; ihr Ausschluss
verschiebt keine der Quoten um mehr als 0,1 Prozentpunkte.

**Alle Kennzahlen stammen aus den Produktfunktionen** — `berechneKennzahlen`,
`ermittleJahreskaltmiete`, `bewerteEinheiten`, `bestimmeMeldeklasse`,
`mieteProM2FuerBundesland`, `regionaleMieteProM2`, `grunderwerbsteuerSatz*`,
`partitionEinesListings`. Nachgebaut wurde nur die **Reihenfolge** der
Aufrufe, und die ist aus `processCandidate` (`lib/pipeline.ts`) abgeschrieben.

**Die Gegenprobe im Verfahren von A11** ist die Bedingung dafür, dass diese
Messung das Produkt misst und nicht ihren eigenen Nachbau:

> Nachgerechneter Kaufpreisfaktor und DSCR stimmen bei **12.156 von 12.157**
> bewertbaren Objekten exakt mit dem gespeicherten `metrics`-Feld überein.

Die eine Abweichung ist erklärt und kein Fehler der Nachrechnung: Objekt
`aef9b6b7`, Version vom 2026-09-07, Mietquelle `geschaetzt_bundesweit`. Das
Verhältnis der beiden Faktoren ist 1,2037 — exakt `11,11 / 9,23`, also die
Anhebung von `BUNDESWEITER_MIETPREIS_PRO_M2_MONAT` durch A11 Schritt 2. Der
gespeicherte Wert stammt von **vor** der Anhebung, die Nachrechnung rechnet
mit der heutigen Konstanten. Das ist das richtige Verhalten.

**Feste Uhr.** Wo ein Alter berechnet wird, ist der Bezugszeitpunkt fest
eingetragen (2026-09-12 16:00 UTC), nicht `new Date()`.

---

### 13.1 M3 — Die Verteilung auf die Sicherheitsstufen

**Verfahren.** Jüngste Version je Objekt, Stufe nach der Regel aus 3.3, S0
hat Vorrang vor der Mietquelle.

> **Nachkorrigiert am 2026-09-13.** Die Tabelle des Nachtrags zählte nach der
> **alten** S0-Regel (nur `data_gaps`), obwohl derselbe Abschnitt die Regel um
> `living_area_m2 <= 0` erweitert hat. Beide Zählungen stehen unten
> nebeneinander, weil sie verschiedene Regeln messen; **maßgeblich ist die
> rechte Spalte**, und nur sie steht in 3.3.

| Stufe | n nach der **alten** Regel (Nachtrag) | n nach der **korrigierten** Regel — maßgeblich | Anteil |
|---|---:|---:|---:|
| **S3** belegt | 1 | **1** | 0,01 % |
| **S2** PLZ-genau | 196 | **52** | 0,4 % |
| **S1** bundeslandgenau | 11.312 | **11.308** | 89,7 % |
| **S0** nicht beurteilbar | 1.102 | **1.250** | 9,9 % |

Die Differenz sind genau die **148** Objekte ohne Wohnfläche und ohne Lücke
aus Punkt 4 weiter unten: 144 wandern aus S2 nach S0, 4 aus S1.

**Aufteilung nach Quelle.** Gemessen ist sie nur für die alte Regel (S3 1
Immowelt; S2 27 Immowelt / 169 ZVG; S1 11.308 Immowelt / 4 ZVG; S0 1.079
Immowelt / 23 ZVG) und für S2 unter der korrigierten Regel: dort bleiben
**39 ZVG** von 52. Für S1 und S0 ist die Quellenaufteilung unter der
korrigierten Regel **nicht gemessen** und wird hier bewusst **nicht
hochgerechnet**.

Rohe Mietquelle ohne S0-Vorrang: `geschaetzt_bundesland` 12.361 (98,0 %),
`geschaetzt_regional` 243 (1,9 %), `geschaetzt_bundesweit` 6, `angegeben` 1.
S0-Gründe (mehrfach möglich): `rent_estimate_unreliable` 796,
`preis_miete_unvereinbar` 342, `wohnflaeche_fehlt` 306.

**Was das am Entwurf ändert.**

1. **Abschnitt 3.3 ist korrigiert**, nicht ergänzt. Die alten Werte („2
   Objekte", „83 %", „über 50 %") waren am Stand vom 2026-09-08 richtig und
   sind es heute nicht mehr: Der Bestand ist auf das Sechsfache gewachsen und
   besteht zu 98,4 % aus Immowelt, dessen Ergebnisliste eine Wohnfläche nennt
   und keine PLZ. Beides zusammen leert S0 und füllt S1.
2. **Ob S2 einen eigenen Block trägt, ist offen** — und das ist die Aussage,
   die sich am 2026-09-13 umgedreht hat. Der Nachtrag hat sie mit 196 Objekten
   bejaht; unter der korrigierten Regel sind es **52 von 12.611 (0,4 %)**. Ein
   eigener, beschrifteter Block für vier von tausend Objekten ist damit
   **nicht belegt**. Was bleibt: Es ist der ZVG-Block — **39 der 52**
   S2-Objekte sind Zwangsversteigerungen (vorher 169 von 196). Wer S2 baut,
   baut die ZVG-Ansicht. Die Entscheidung gehört vor Schritt 4 aus
   Abschnitt 9, nicht vor Schritt 2: Die Stufe wird in `ranking.ts` in jedem
   Fall berechnet; offen ist nur ihre Darstellung (3.3).
3. **S3 ist kein Block, sondern eine Zeile**, und eine schrumpfende:
   Insgesamt trugen **3** Objekte je eine belegte Miete; bei zweien ist sie
   inzwischen wieder verschwunden, weil ihre neuere Version aus der
   Immowelt-Ergebnisliste stammt, die keine Miete nennt. Das einzige
   verbliebene passiert die Schwellen nicht (Faktor 13,0, DSCR 0,76). Die
   Regel aus 3.8 — S3 klappt zu einer ehrlichen Zeile zusammen — greift also
   am ersten Tag.
4. **Die S0-Bedingung hatte ein Loch, und es ist gestopft** (3.3). 148
   Objekte haben in ihrer jüngsten Version keine Wohnfläche, tragen aber
   nicht `wohnflaeche_fehlt`, weil diese Lücke erst am 2026-09-08 eingeführt
   wurde und ihre Version vom 2026-09-07 stammt (144 davon fielen in S2, 4 in
   S1, **alle 148 mit gespeichertem DSCR 0**). Eine Stufenregel, die nur auf
   `data_gaps` schaut, datiert damit auf den Tag des letzten Scans. Sie muss
   zusätzlich auf `living_area_m2` selbst schauen.
5. **Nebenbefund, ohne Folgen:** Zwei Versionen tragen noch den alten
   Lückennamen `kaufpreis_unplausibel` (vor der Umbenennung in
   `preis_miete_unvereinbar`). Beide tragen zusätzlich
   `rent_estimate_unreliable` und landen deshalb ohnehin in S0 — der alte
   Name führt hier zu keinem falschen Ergebnis.

**Was die Zahl nicht hergibt.** Sie ist eine Momentaufnahme eines Bestands,
der in sieben Tagen von 2.108 auf 17.391 Versionen gewachsen ist. Die
Stufenanteile sind eine Eigenschaft der **Quellenmischung**, nicht des
Marktes: Solange Immowelt keine PLZ liefert, bleibt S1 bei rund 90 %,
unabhängig davon, wie gut die Mietschätzung ist.

---

### 13.2 M1 — Der Einfluss der angenommenen Einheitenzahl

**Verfahren.** Alle 12.126 bewertbaren Objekte mit `units = null` (dort und
nur dort greift `MIN_EINHEITEN = 3`), DSCR zweimal gerechnet: einmal mit der
Annahme des Produkts, einmal mit einer alternativen Zahl. Die Alternative ist
**nicht geraten**, sondern aus der Verteilung der 90 **bestätigten**
Einheitenzahlen desselben Bestands genommen: Median **4**, P75 **6**, P90
**10**, Maximum 173.

| angenommene Einheiten | DSCR-Änderung Median | P5 | größte | Objekte, die die Schwelle wechseln |
|---|---:|---:|---:|---:|
| 1 | 0,00 % | 0,00 % | +23,08 % | **2** (0,02 %) |
| 2 | 0,00 % | 0,00 % | −12,71 % | 1 |
| **4** (Median der bestätigten) | **0,00 %** | 0,00 % | −9,02 % | **0** |
| 5 | 0,00 % | 0,00 % | −13,34 % | 8 |
| **6** (P75) | 0,00 % | −1,70 % | −16,51 % | **21** (0,17 %) |
| **10** (P90) | 0,00 % | −10,59 % | −18,75 % | **92** (0,76 %) |
| 20 | −10,68 % | −18,75 % | −18,75 % | 437 (3,60 %) |
| 30 | −18,75 % | −18,75 % | −18,75 % | 658 (5,43 %) |

Dieselbe Menge, stattdessen die **Miete** verschoben:

| Miete | Objekte, die die Schwelle wechseln |
|---|---:|
| ×0,7 | **1.405 (11,59 %)** |
| ×0,9 | 508 (4,19 %) |
| ×1,1 | 469 (3,87 %) |
| ×1,3 | **1.549 (12,77 %)** |

**Der Hebel hat eine harte Obergrenze, und sie ist keine Beobachtung, sondern
eine Struktureigenschaft.** `berechneBewirtschaftungskosten` deckelt auf 20
bis 35 % der Jahreskaltmiete. Wandert die Einheitenzahl von „Deckel unten"
nach „Deckel oben", wandert der NOI von 0,80 · Miete auf 0,65 · Miete — das
sind **−18,75 %**, und in der Gegenrichtung **+23,08 %**. Genau diese beiden
Werte tauchen in der Tabelle als Extremwerte auf. **Keine Einheitenannahme
kann den DSCR je weiter verschieben.** Bei 687 der 12.126 Objekte bindet der
Deckel so fest, dass zwischen 3 und 30 Einheiten **überhaupt kein**
Unterschied entsteht.

**Was das am Entwurf ändert: nichts — und das ist jetzt belegt statt
vermutet.** `units_unconfirmed` bleibt ein **Merkmal am Objekt**, keine
eigene Stufe. Drei unabhängige Gründe:

1. Bei der gemessenen Alternative (4 Einheiten) wechselt **kein einziges**
   Objekt die Meldeschwelle, bei 6 sind es 21.
2. Der Mietfehler ist auf derselben Menge rund **70-mal** so wirksam
   (11,6 % gegen 0,17 %).
3. Die Lücke trägt heute **12.521 von 12.611 Objekten (99,3 %)**. Eine Stufe,
   die fast den ganzen Bestand umfasst, trennt nichts — sie würde nur S1
   umbenennen.

Abschnitt 3.3 ist entsprechend korrigiert: Der Satz „Fällt sie größer aus als
erwartet, wird `units_unconfirmed` zu einer eigenen Stufe" ist durch die
Messung erledigt und durch sie ersetzt.

**Was die Zahl nicht hergibt.** Die Alternative stützt sich auf **90**
bestätigte Einheitenzahlen — 0,7 % des Bestands, und vermutlich keine
Zufallsstichprobe, weil eine bestätigte Einheitenzahl voraussetzt, dass das
Inserat sie nennt. Die Messung sagt „selbst bei einer um den Faktor 10
falschen Annahme bleibt der Hebel klein", nicht „die Annahme 3 ist richtig".

---

### 13.3 M2 — Die Breite des DSCR-Bands je Objekt

**Verfahren.** Für jedes bewertbare S1-Objekt die Miete mit `min / Mittel`
und `max / Mittel` der PLZ-Werte **seines** Bundeslandes skaliert und
`berechneKennzahlen` erneut aufgerufen (3.4). Mittelwert aus
`mieteProM2FuerBundesland`, min und max aus `regionaleMieteProM2` über genau
die PLZ-Zweisteller, über die diese Funktion mittelt — die 16 Landesspannen
kommen auf die Nachkommastelle wieder heraus wie in 3.4. Für S2 die gemessene
Zensus-Streuung der Tabelle (−23,7 % / +23,9 %, A11, n = 23).

| Stufe | n | untere Kante (Median) | obere Kante (Median) | Bandbreite / Punktwert |
|---|---:|---:|---:|---|
| **S1** | 11.308 | **−27,8 %** (P5 −37,2 %) | **+40,1 %** (P95 +67,1 %) | Median **67,9 %**, P95 101,9 %, max **126,5 %** |
| **S2** | 52 | −23,7 % | +23,9 % | Median **47,6 %**, max 62,8 % |

Je Bundesland (nur S1, Median der Bandbreite): Bayern 101,9 % (n = 1.469),
Nordrhein-Westfalen 96,8 % (n = 2.930), Brandenburg 78,6 %, Berlin 71,2 %,
Hessen 67,9 %, Schleswig-Holstein 60,7 %, Hamburg 57,5 % — die sieben Länder
aus 3.4 — gegen Bremen 21,1 %, Mecklenburg-Vorpommern 27,4 %,
Sachsen-Anhalt 28,1 %, Thüringen 32,2 %, Baden-Württemberg 36,1 %.

**Zwei Befunde, einer davon gegen den Entwurf.**

1. **Die Sortierung nach der unteren Kante (3.5) ist kein Feinschliff, sie
   ist die halbe Rangliste.** Gegen die Sortierung nach dem Punktwert
   verschiebt sie den Rang im Median um **713 Plätze** (P90 1.284, max 2.214)
   bei 11.308 Objekten; nur **15** Objekte behalten ihre Position. Von den
   Top 50 nach Punktwert stehen **24** auch in den Top 50 nach unterer Kante.
   Die Entscheidung ist damit kalibriert: Sie wirkt, und sie wirkt in die
   beabsichtigte Richtung — ein Objekt in Bayern oder NRW muss deutlich
   besser sein als eines in Bremen, um denselben Platz zu halten.
2. **Die Begründung in 3.4 war zu weit gefasst.** Dort steht, eine um 30 %
   niedrigere Miete senke den NOI um *mehr* als 30 %. Gemessen hat die
   Verstärkung (DSCR-Abfall / Mietabfall) den Median **1,000** und übersteigt
   1 nur bei **887 von 11.308** S1-Objekten (7,8 %), dort bis 1,371; bei S2
   bei 20 von 52. Für 92 % des Bestands ist das Band **doch** proportional,
   weil die 20-/35-%-Deckelung an beiden Kanten bindet. **Die Entscheidung
   bleibt** — für jedes dreizehnte Objekt wäre eine Skalierung falsch, und der
   zweite Aufruf von `berechneKennzahlen` kostet nichts —, aber 3.4 ist
   entsprechend korrigiert.

**Was die Zahl nicht hergibt.** Die Bandkanten sind die **Streuung der
Schätztabelle**, nicht ein Konfidenzintervall der wirklichen Miete. Ein Band
von 67,9 % heißt „innerhalb dieses Bundeslandes liegen die hinterlegten
Mietwerte so weit auseinander", nicht „der wahre DSCR liegt mit 95 %
Wahrscheinlichkeit darin". Für S2 sind es nur **52** auswertbare Objekte,
weil 144 der 196 S2-Objekte der **alten** Stufenregel keine Wohnfläche haben
(siehe 13.1, Punkt 4). Nach der korrigierten Regel sind diese 144 nach S0
gewandert; die 52 auswertbaren Objekte hier **sind** deshalb genau das
korrigierte S2 aus 3.3.

---

### 13.4 M4 — Das `last_seen`-Alter je Region

**Verfahren.** Alle 12.611 Objekte, Region über `partitionEinesListings`
(gespeicherter `fundort`, sonst ZVG-Präfix der `external_id`), Alter gegen
eine feste Uhr (2026-09-12 16:00 UTC).

| Quelle | n | Median | P75 | P90 | P95 | max |
|---|---:|---:|---:|---:|---:|---:|
| immowelt | 12.415 | 0,83 d | 1,11 d | 2,34 d | 3,10 d | **4,78 d** |
| zvg-portal | 196 | 0,13 d | 0,13 d | 0,13 d | 0,13 d | 2,10 d |

Regionsmediane (Immowelt): `ni` und `rp` 1,33 d, `sn` und `he` 1,11 d, `br`,
`st`, `sh` 0,90 d, sieben weitere 0,83 d, `nw` 0,57 d, `by` 0,34 d, `bw`
0,13 d. Höchstes Regions-P90: `nw` mit 3,32 d. Ohne zuordenbare Region: 54
Objekte, Median 3,69 d.

Schwellenwirkung über den gesamten Bestand: älter als 1 d **4.342 (34,4 %)**,
älter als 2 d 1.424 (11,3 %), älter als 3 d **712 (5,6 %)**, älter als 5 d
**0**.

> **Diese Prozentwerte haben einen falschen Nenner, und das ist am 2026-09-13
> nachgetragen.** Der Bestand ist am 2026-09-05 entstanden; das älteste
> `first_seen` liegt **6,92 Tage** zurück, und nur **187 von 12.611 Objekten
> (1,5 %)** sind länger als fünf Tage darin. Ein Objekt, das seit gestern
> bekannt ist, *kann* kein `last_seen`-Alter von 3 Tagen zeigen — es steht im
> Nenner der 5,6 %, obwohl es zum Zähler gar nicht beitragen könnte. Auf die
> Objekte eingeschränkt, die einen solchen Rückstand überhaupt zeigen könnten,
> liegen **13,0 %** über 3 Tagen. Die 5,6 % sind deshalb keine Grundlage für
> eine Schwelle.

**Was das am Entwurf ändert.**

1. **6.3: die Schwelle ist auf diesen Daten nicht entscheidbar.** Der Nachtrag
   hatte hier eine globale Schwelle von 3 Tagen beschlossen; sie ist am
   2026-09-13 **zurückgezogen**, weil ihre Begründungen an den Zahlen dieser
   Tabelle scheitern: `nw` hat ein P90 von **3,32 d** (die Schwelle liegt also
   *nicht* über jedem Regions-P90), das Maximum aller Regionen ist **4,78 d**
   (die Schwelle liegt also *nicht* darüber), und bei 3 Tagen stünden `ni`
   **217 von 853 (25,4 %)** und `nw` **337 von 3.163 (10,7 %)** dauerhaft als
   unbestätigt — „trifft keine Region dauerhaft" ist damit widerlegt. Es
   bleibt: Die Spreizung, die die regionsindividuelle Schwelle begründet hat
   (`nw` alle 15 h, `ni`/`bw` alle 3 Tage), ist im Median auf 0,13 bis 1,33
   Tage geschrumpft, und `sweep_region_runs` trägt 115 Zeilen aus sieben Tagen
   — zu wenig für 16 belastbare Regionsmediane. **Beide Schwellenformen sind
   auf diesem Bestand also unbelegt.** Bis zur Nachmessung in vier Wochen gilt
   die regionsindividuelle Definition aus der Zustandstabelle in 6.3, weil sie
   der Stand vor der Messung war und nicht widerlegt wurde.
2. **4.3: das kürzeste benannte Zeitfenster bleibt bei 7 Tagen.** Der Nachtrag
   hatte es auf 3 Tage gesenkt; die Senkung ist am 2026-09-13 zurückgenommen.
   Grund: Die alte Begründung ist das 90. Perzentil des **Regionsabstands**
   (7,6 d, Abgänge-Spec), gemessen wurde hier das **`last_seen`-Alter** je
   Objekt. Das sind zwei verschiedene Größen — die zweite kann die erste nicht
   widerlegen. **Der Satz „die 5,7 und 7,6 Tage sind nicht widerlegt" weiter
   unten und die Senkung in 4.3 konnten nie beide gelten;** jetzt gilt der
   Satz. Der Regionsabstand selbst ist aus `sweep_region_runs` nachzumessen;
   am 2026-09-13 war das nicht möglich, weil das Skript des Prüfers nicht mehr
   vorhanden ist (13.8). **Die Frage ist damit offen, nicht zugunsten von 7
   Tagen entschieden.** Unbestritten bleibt der Ausschluss des
   24-Stunden-Filters — 34,4 % aller Objekte sind älter als einen Tag.
3. **E-7 betrifft 54 Objekte** — die ohne zuordenbare Region (6.2). Der
   Vergleich mit den 157 vom 2026-09-09 ist am 2026-09-13 gestrichen worden:
   Jene Zahl zählte die Objekte **ohne `fundort`**, und das sind heute 250,
   davon 196 ZVG, die über ihr `external_id`-Präfix trotzdem zuordenbar sind.
   Zwei verschiedene Größen, kein Vergleich.

**Was die Zahl nicht hergibt, und das ist hier der wichtigste Satz.** Der
Bestand ist am **2026-09-05** entstanden. Die 4,78 Tage sind deshalb zugleich
die Obergrenze dessen, was überhaupt messbar war — ein längerer Rückstand
*kann* in diesen Daten nicht vorkommen. Die Messung belegt „die Kadenz hält
über die letzten sieben Tage", nicht „sie hält dauerhaft". Die 43 %
Cron-Ausfall aus A10 und die 5,7 Tage Regionsabstand aus der Abgänge-Spec
sind dadurch **nicht widerlegt**; sie stammen von einem älteren, kleineren
Bestand. Die Schwelle für „unbestätigt" ist nach vier Wochen Laufzeit zu
messen — bis dahin ist sie offen, nicht auf 3 Tage festgelegt.

---

### 13.5 M5 — Schwellenwechsler gegen A11s 558

**Verfahren.** Zwei getrennte Rechnungen, weil sich herausstellte, dass die
beiden Begriffe **nicht dasselbe** messen.

**(a) Objekt-Sicht nach 3.6** — das eigene Band (Landesspanne, für S2 die
Zensus-Streuung) überquert `DSCR = 1,3` **oder** `Kaufpreisfaktor = 15`:

> **6.658 von 11.360 bewertbaren S1/S2-Objekten = 58,6 %.**
> Davon über die DSCR-Schwelle 2.845, über die Faktor-Schwelle 4.985.
> S1: 6.635 von 11.308 (58,7 %) · S2: 23 von 52 (44,2 %).

**(b) A11s Größe, auf demselben Bestand mit denselben Funktionen
nachgerechnet** — `bestimmeMeldeklasse` wechselt irgendwo im pauschalen
±30-%-Mietband:

| Schwelle | −30 % | heute | +30 % |
|---|---:|---:|---:|
| `kaufpreisfaktor <= 15` | 3.031 | 5.384 | 7.770 |
| `geschaetzterDscr >= 1,3` | 1.211 | 2.460 | 3.836 |
| `topTreffer` (alle vier) | 986 | **2.073** | 3.274 |

> **Meldeklasse wechselt: 1.411 bei −30 % (11,6 %), 1.551 bei +30 % (12,8 %),
> 2.962 irgendwo im Band (24,4 %)** — gegen A11s 29,7 %.

**Die Antwort auf die gestellte Frage lautet: die Zahlen decken sich nicht,
und trotzdem ist keine der beiden Rechnungen falsch.** Abschnitt 10 stellt
die Alternative zu eng.

Der Unterschied liegt **nicht** an der Bandbreite. Rechnet man die
Objekt-Sicht mit demselben pauschalen ±30-%-Band statt mit der Landesspanne,
bleiben es **6.558 (57,7 %)** statt 6.658 (58,6 %) — ein Prozentpunkt. Er
liegt an der **Definition**: „Meldeklasse wechselt" verlangt, dass **alle
vier** `topTreffer`-Bedingungen gemeinsam umspringen; „Band überquert eine
Schwelle" zählt schon, wenn **eine** von zweien überquert wird — und die
Faktor-Schwelle allein trifft 4.985 Objekte.

Die Abweichung von A11s 29,7 % zu den heutigen 24,4 % derselben Größe ist
dagegen unauffällig: derselbe Bestand ist es nicht, er ist sechsmal so groß
und von ZVG auf Immowelt gekippt.

**Was das am Entwurf ändert: 3.6 ist korrigiert.** Der Satz „Das ist die
Objekt-Sicht auf A11s Befund" ist gestrichen — er behauptet eine Gleichheit,
die um den Faktor 2,4 nicht besteht. Und: **ein Merkmal, das 59 % einer Liste
trägt, markiert nichts.** Das Schwellenwechsler-Merkmal wird deshalb auf die
**DSCR-Schwelle** eingeengt — **2.845 von 11.360 = 25,0 %**. Sie ist die
Schwelle, an der die Rangzahl hängt; nur dort heißt „Wechsler" auch „der Rang
selbst steht zur Disposition".

**Was die Zahl nicht hergibt.** Beide Rechnungen setzen die Landesspanne
bzw. ±30 % als Unsicherheit an. Beides sind Streuungsmaße der Schätztabelle,
keine Fehlerwahrscheinlichkeiten (siehe 13.3). „58,6 % sind Wechsler" heißt
nicht „bei 58,6 % ist die Einordnung falsch", sondern „bei 58,6 % entscheidet
die Mietschätzung über die Einordnung und nicht die Objektdaten".

---

### 13.6 M6 — Was eine Preissenkung am Rang bewegt

**Verfahren.** Jede Version mit `price_dropped = true` gegen ihre Vorversion,
beide mit den echten Funktionen nachgerechnet; der Rang ist die Position im
absteigend nach DSCR sortierten Feld aller 12.157 bewertbaren Objekte.

> **Welche Liste hier gerankt wurde — nachgetragen am 2026-09-13.** Gerankt
> wurde **global über alle 12.157 bewerteten Objekte, einschließlich S0**,
> also über **eine Liste, die das Dashboard so nie zeigen wird**. Der Entwurf
> vergibt Rangplätze anders: 3.2 trennt nach Stufenblöcken, und 3.7 gibt
> S0-Objekten **überhaupt keinen Rangplatz**. Konkret liegen **6 der 17**
> echten Senkungen in S0. Die Rangsprünge unten sind deshalb Positionen in
> einem Feld, das der Nutzer nicht zu sehen bekommt, und die Zahl „+539
> Plätze" ist **keine Aussage über die Rangliste des Dashboards**.
>
> **Warum nicht neu gerechnet wurde.** Der Auftrag ließ die Wahl, innerhalb
> der Stufe und ohne S0 neu zu rechnen. Die dafür vorgesehenen Skripte
> `messung-m6-preissenkung.ts` und `messung-m6-teil2.ts` liegen im
> git-ignorierten Verzeichnis
> `.superpowers/sdd/2026-09-12-blaetterung-meldedeckel-und-a4/` und sind dort
> **nicht mehr vorhanden** (13.8); diese Runde ändert zudem keine Zeile Code.
> Die Neurechnung bleibt offen und ist mit der Wiederholung nach vier Wochen
> zusammenzulegen.
>
> **Was sich dadurch nicht ändert:** Die *Richtung* — eine Preissenkung hebt
> den DSCR und damit den Rang — folgt aus der Formel und gilt in jeder
> gerankten Stufe, bei sonst gleicher Datenlage (S0 hat ohnehin keine
> Rangliste, in die hinein sich etwas bewegen könnte). Die *Höhe* des
> Sprungs gilt nur für das global sortierte Feld.

**Die Rohzahl ist klein, und der erste Durchgang war unbrauchbar.** Von
17.391 Versionen tragen **49** `price_dropped`. 22 davon sind nicht
nachrechenbar (fehlende Fläche in einer der beiden Versionen). Von den
verbleibenden 27 sind **10 keine Preissenkungen, sondern Parserkorrekturen**:
gespeicherte Vorpreise wie 25.375.912.190.000 € → 2.190.000 € oder
4.852.352.219.700 € → 9.700 €. Sie erzeugten einen DSCR-Anstieg von bis zu
50 Milliarden Prozent und hätten jeden Median zerstört. Trennkriterium,
bewusst grob: Vorpreis über 50 Mio. € — darüber gibt es in diesem Bestand
kein Mehrfamilienhaus.

**Es bleiben 17 echte Preissenkungen.**

| Größe | Median | Spanne |
|---|---:|---|
| Preisänderung | **−15,9 %** | −96,6 % … −3,0 % |
| DSCR-Änderung | **+20,6 %** | −7,8 % … +1.845 % |
| Rangsprung | **+539 Plätze** | −21 … +10.970 |
| Rangsprung, Anteil am Feld | **4,43 %** | bis 90,2 % |

Zwei Objekte wurden über die Meldeschwelle gehoben, zwei fielen darunter —
letztere, weil ihr Kaufpreisfaktor unter `MIN_PLAUSIBLER_KAUFPREISFAKTOR = 3`
rutschte und sie damit nach S0 wanderten. Die A9-Untergrenze wirkt also genau
wie beabsichtigt. **Kein Fall blieb ohne Rangwechsel**; selbst die kleinste
Senkung (−3,0 %, 235.000 → 228.000 €) bewegte den Rang um **105 Plätze**.

**Was das am Entwurf ändert: 2.4 bleibt — begründet, aber nicht belegt.**
Anforderung 3 („durch eine Preissenkung rutscht ein Objekt nach oben")
erledigt der DSCR von selbst; ein zusätzlicher Veränderungsbonus auf die
Rangzahl bleibt abgelehnt. Diese Ablehnung steht auf der **Formel**, nicht auf
den 17 Fällen: Ein niedrigerer Preis hebt den DSCR, das gilt unabhängig von
der Stichprobe. **Was die 17 Fälle nicht tragen**, ist der Satz „Anforderung 3
ist belegt" — n = 17, aus sieben Tagen, mehrere Fälle zum selben Objekt, und
gerankt über eine Liste, die das Dashboard nicht zeigt (siehe den Kasten
oben). Die Aussage „die Rangliste ist empfindlich genug" ist damit **eine
begründete Erwartung, keine Messung**, und nach vier Wochen zu prüfen.

**Der Gegenbefund, der dranstehen muss.** Ein Fall lief gegen die Erwartung:
`e9a8c11d`, 47.490 → 39.950 € (−15,9 %), und der DSCR **fiel** von 6,658 auf
6,140. Der Grund steht nicht im Preis: Zwischen den beiden Versionen verlor
das Objekt seine PLZ (`geschaetzt_regional` → `geschaetzt_bundesland`, und
Sachsens Landesmittel liegt unter dem PLZ-Wert) und sein Baujahr. Beides sind
Folgen des Umbaus auf die Immowelt-Ergebnisliste. **Eine neue Version kann die
Datenlage eines bereits bekannten Objekts verschlechtern**, und dann bewegt
sich der Rang aus einem Grund, den die Veränderungsansicht als „Preis
gesenkt" beschriftet. Für Schritt 5 heißt das: Die Zeile muss sagen, *was*
sich geändert hat, nicht nur *dass*.

**Was die Zahl nicht hergibt — und hier ist die Einschränkung größer als das
Ergebnis.** **n = 17**, aus sieben Tagen Historie, und nur **2.756 von 12.611
Objekten** haben überhaupt mehr als eine Version. Der Median von −15,9 % ist
kein Marktwert, sondern das mittlere Element von siebzehn Fällen, von denen
mehrere zum selben Objekt gehören (`73856ba5` erscheint dreimal). Die Aussage
„eine Preissenkung bewegt den Rang, wenn sonst nichts sich ändert" ist
strukturell sicher — sie folgt aus der **Formel**, nicht aus dieser
Stichprobe: Ein niedrigerer Preis senkt Kaufpreis und Kaufnebenkosten und
hebt damit den DSCR, in jeder gerankten Stufe. Die Stichprobe selbst trägt
das nicht als Beleg: **Sechs der 17 Fälle liegen in S0** ohne Rangplatz, und
der Gegenbefund oben (`e9a8c11d`) zeigt, dass eine gleichzeitige
Verschlechterung der Datenlage die Formel-Wirkung überdecken kann. „17 von
17 Fällen bestätigt" ist deshalb **kein belastbarer Beleg** und wird hier
nicht mehr als einer angeführt. Die Aussage „im Median um 539 Plätze" ist
ohnehin keine Messung dieses Entwurfs, sondern eine Eigenschaft der
ungerankten Gesamtliste — sie ist nach vier Wochen, innerhalb der Stufe und
ohne S0, zu wiederholen.

---

### 13.7 Was Schritt 0 offen lässt

- **M4 und M6 haben zu wenig Historie.** Beide Zahlen sind an sieben Tagen
  Bestand gemessen und nach vier Wochen zu wiederholen. Sie tragen deshalb
  **keine Schwelle**: Die vom Nachtrag beschlossene 3-Tage-Schwelle (6.3) und
  das 3-Tage-Fenster (4.3) sind am 2026-09-13 **zurückgenommen**. Bis zur
  Nachmessung gilt die regionsindividuelle Definition (6.3) und das
  7-Tage-Fenster (4.3), beides als offener Punkt, nicht als Entscheidung.
- **Die 148 Objekte ohne Fläche und ohne Lücke** verschwinden von selbst,
  sobald sie erneut gescannt werden. Die erweiterte S0-Bedingung aus 3.3
  bleibt trotzdem nötig: Sie ist die Regel, die verhindert, dass die
  Rangliste vom Scandatum abhängt.
- **Die Stufenanteile hängen an der Quellenmischung, nicht am Markt.**
  Solange Immowelt keine PLZ liefert, bleibt S1 bei rund 90 %. Der wirksamste
  Hebel für das Dashboard ist derselbe wie für die Meldung (A11): eine PLZ
  für Immowelt-Objekte, nicht eine bessere Mietschätzung.
- **E-4 ist durch M3 dringender geworden, nicht entspannter.** Wenn
  bundeslandgenaue Schätzungen nicht melden dürfen, bleiben nach der
  **korrigierten** Stufenregel **53 von 12.611** Objekten für den Meldeweg
  (S3 1 + S2 52) — das Dashboard wäre dann nicht die Ergänzung, sondern der
  einzige Weg zu über 99 % des Bestands. *Verfahren:* Das ist eine
  **Ableitung** aus den Stufenzahlen in 13.1, keine eigene Messung; nach der
  alten Stufenregel lautete sie 197 (S3 1 + S2 196), und diese Fassung stand
  bis zum 2026-09-13 hier. *Was die Zahl nicht hergibt:* Sie sagt nicht, wie
  viele dieser 53 Objekte die Meldeschwellen überhaupt passieren — die Größe,
  die A11 mit „339 von 409 Meldekandidaten" (2026-09-08) zählt, ist eine
  andere (E-4).

---

### 13.8 Korrekturrunde 2026-09-13 — was an diesem Nachtrag korrigiert wurde

**Keine Codeänderung, keine neue Messung.** Diese Runde hat den Nachtrag vom
2026-09-12 gegen die Funde in
[`2026-09-12-messfragen-nachtrag-funde.md`](2026-09-12-messfragen-nachtrag-funde.md)
gelesen. Die **Rohzahlen der Messung sind reproduziert und bestätigt**;
beanstandet war, was der Nachtrag daraus im Entwurf gemacht hat. Geändert
wurde deshalb kein Messwert, sondern wo zwei Stände nebeneinanderstanden, wo
eine Zahl ohne Verfahren dastand und wo eine Schlussfolgerung weiter trug, als
ihre Zahl reicht.

| Fund | Stellen | Ergebnis |
|---|---|---|
| Korrigierte S0-Regel, alte Zahlen | 3.1, 3.3, 10 (M3), 12 (Punkt 2), 13.1 | Gezählt wird nach der korrigierten Regel: **S3 1 · S2 52 · S1 11.308 · S0 1.250**. Die Blockfrage für S2 ist wieder **offen** — auch in der Zusammenfassung (12), die zuvor weiter „vier Sicherheitsstufen als getrennte Blöcke" ohne diesen Vorbehalt nannte. |
| 6.3 trug zwei Schwellen | 6.3, 10 (M4), 13.4, 13.7 | Die globale 3-Tage-Schwelle ist **zurückgezogen**; sie ist auf sieben Tagen Historie nicht entscheidbar. |
| 4.3 gegen 13.4 | 4.3, 7, 10 (M4), 12, 13.4, 13.7 | Das kürzeste Fenster bleibt bei **7 Tagen**, weil M4 das `last_seen`-Alter misst und nicht den Regionsabstand. Frage offen. |
| M6 rankte eine andere Liste | 2.4, 10 (M6), 13.6 | Die gerankte Liste ist benannt: global über alle 12.157 **einschließlich S0**. 2.4 trägt den Vorbehalt aus n = 17. |
| „54 statt 157" | 6.2, 6.3, 11 (E-7), 13.4 | Beide Größen stehen mit Namen nebeneinander (ohne `fundort` **250**, ohne zuordenbare Region **54**); die Ursache ist als **Vermutung** gekennzeichnet. |
| Vier kleine Funde | 3.1, 3.2, 3.8, 7, 11 (E-4), 13.7 | „2 Objekte" → **1**; die 7,6 Tage sind als andere Größe gekennzeichnet; E-4 und 13.7 tragen dieselbe Ableitung; „6.408 von 11.308" ist aus der Tabelle in 3.1 **entfernt** und steht nur noch im Kasten darunter als frühere Angabe des Nachtrags mit **Verfahren unbekannt, nicht reproduzierbar** (finale Fix-Welle, 2026-09-13 — die zunächst hier nachgetragene PLZ-Herleitung war nicht haltbar und ist gestrichen). |
| Folgestellen beim Gegenlesen | Kopf des Dokuments, 3.2, 3.7, 9, 13.3 | Der Kopf nennt die Korrekturrunde; 3.2 und 9 (Schritt 4) tragen die offene Blockfrage; 3.7 verlor die Begründung „über die Hälfte des Bestands" (gemessen 9,9 %); 13.3 sagt jetzt, dass seine 52 auswertbaren S2-Objekte genau das korrigierte S2 sind. |

**Was diese Runde nicht konnte, und das ist der wichtigste Satz hier.** Zwei
Funde ließen die Wahl zwischen *nachmessen* und *kennzeichnen*. Nachgemessen
wurde **nichts**, und zwar nicht aus Bequemlichkeit: Die Messskripte des
Prüfers —
`messung-korrektur-regionsabstand.ts`, `messung-m6-preissenkung.ts`,
`messung-m6-teil2.ts` — liegen im Verzeichnis
`.superpowers/sdd/2026-09-12-blaetterung-meldedeckel-und-a4/`, das
**git-ignoriert** ist. Das Verzeichnis existiert weder im Arbeitszweig noch im
Hauptcheckout; es ist mit der Sitzung des Prüfers verloren gegangen. Die
Skripte sind also nicht *gescheitert*, sie waren **gar nicht vorhanden**. Neue
zu schreiben war in einer reinen Dokumentationsrunde nicht zulässig.

**Daraus folgt für die Nachmessung in vier Wochen**, dass drei Dinge
zusammengehören und in einem Zug zu erledigen sind:

1. Der **Regionsabstand** aus `sweep_region_runs` — er entscheidet über das
   kürzeste Zeitfenster in 4.3 **und** über die Schwelle in 6.3.
2. **M6 innerhalb der Stufe und ohne S0** — erst das ergibt eine Zahl über die
   Rangliste, die der Entwurf wirklich vergibt.
3. Die **Zählung hinter „6.408 von 11.308"** (3.1), deren Rechenschritt nicht
   protokolliert ist.

**Und eine Lehre für die Ablage:** Ein Messskript, dessen Ergebnis in eine
Spezifikation eingeht, gehört nicht in ein git-ignoriertes Verzeichnis. Sonst
ist die Zahl da und ihr Verfahren weg — genau der Zustand, den die Grundregel
dieses Nachtrags verbietet.
