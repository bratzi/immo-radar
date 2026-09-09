# Dashboard (Teilprojekt 3) — Entwurf

**Stand:** 2026-09-09
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
> Schätzung im Text. Es wurde für diesen Entwurf **kein** Netzabruf, keine
> Datenbankabfrage und kein Scraper-Lauf ausgeführt.

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
2. Er ist bereits die schärfere der beiden Meldeschwellen: heute erfüllen
   910 Objekte `kaufpreisfaktor <= 15`, aber nur 502 `DSCR >= 1,3` (A11). Die
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

---

## 3. Frage 2 — Wie wird Nichtwissen einsortiert?

**Das ist die tragende Frage dieses Entwurfs.** Die Antwort auf die Unschärfe
ist, sie sichtbar zu machen, nicht sie wegzurechnen.

### 3.1 Die Ausgangslage in Zahlen

| Befund | Zahl | Quelle |
|---|---|---|
| Objekte mit **belegter** Miete im gesamten Bestand | **2** | Mietqualitäts-Befund 2026-09-08 |
| Anteil, dessen Miete nur **bundeslandgenau** geschätzt ist | **83 %** | A11 |
| `top_treffer` seit 2026-09-07 05:43 | **0** | Auftragsvorgabe, deckt sich mit A11 („bleibt in allen drei Szenarien 0") |
| Meldeklasse wechselt im ±30-%-Mietband | **558 von 1.879 (29,7 %)** | A11 |
| Versionen mit `wohnflaeche_fehlt` | **über die Hälfte** (210 von 400 gemessen) | Mietqualitäts-Befund |
| Versionen mit `units_unconfirmed` | **567 von 1.000** | Auftragsvorgabe |
| Bundesländer, die intern das ±30-%-Band verlassen | **7 von 16**, dort 64 % der bewerteten Objekte | A11, hier nachgerechnet (3.4) |

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
beschrifteter Block mit eigener Rangliste.

> **Auf die Frage des Nutzers — „rangiert ein Prüfkandidat mit geschätzter
> Miete gleichberechtigt mit einem Top-Treffer mit belegter?" — lautet die
> Antwort: weder noch. Sie stehen nicht in derselben Liste.**

Begründung: Eine gemeinsame Liste müsste behaupten, wie viele Rangplätze eine
belegte Miete wert ist. Diese Zahl hat niemand gemessen, und sie ist auch
nicht messbar, solange der Bestand **zwei** belegte Objekte enthält. Die
gemessene Unschärfe der Bundeslandstufe (bis −37 %/+67 %, siehe 3.4)
übersteigt in NRW und Bayern den Abstand zwischen beliebig vielen Rangplätzen
— ein gemeinsamer Rang wäre eine Zahl ohne Bedeutung.

Getrennte Blöcke behaupten diesen Wechselkurs nicht. Sie sagen: *innerhalb
dessen, was gleich gut belegt ist, ist dies die Reihenfolge.* Das ist die
stärkste Aussage, die die Datenlage trägt.

### 3.3 Die vier Stufen

Alles daraus ist heute schon gespeichert: `listing_versions.rent_source` und
`listing_versions.data_gaps`. **Keine Schemaänderung.**

| Stufe | Name | Bedingung | Heutiger Anteil |
|---|---|---|---|
| **S3** | belegt | `rent_source = 'angegeben'` **und** keine Lücke aus der S0-Liste | 2 Objekte |
| **S2** | regional geschätzt | `rent_source = 'geschaetzt_regional'` (PLZ-Zweisteller) | offene Messfrage M3 |
| **S1** | bundeslandgenau geschätzt | `rent_source ∈ {'geschaetzt_bundesland', 'geschaetzt_bundesweit'}` | 83 % |
| **S0** | **nicht beurteilbar** | mindestens eine Lücke aus: `wohnflaeche_fehlt`, `preis_miete_unvereinbar`, `rent_estimate_unreliable` | über 50 % (Fläche allein) |

**Warum `geschaetzt_bundesweit` mit `geschaetzt_bundesland` in eine Stufe
fällt:** Es betrifft 5 von 2.108 Versionen (A11) und ist noch gröber. Eine
eigene Stufe für fünf Objekte wäre Ordnung ohne Nutzen.

**Warum S0 die drei genannten Lücken bündelt:** Alle drei heißen dasselbe —
*die Kennzahl hat keine Grundlage*, nicht *die Kennzahl ist schlecht*.
`wohnflaeche_fehlt` erzeugt Miete 0 und damit Rendite 0
(`bewerteFlaechenangabe`), `preis_miete_unvereinbar` heißt, dass eine der
beiden Eingangszahlen falsch ist (`bewertePreisplausibilitaet`),
`rent_estimate_unreliable` heißt, dass die Annahme „lässt sich normal
vermieten" nicht trägt (`bewerteMietschaetzung`).

**Warum `units_unconfirmed` (567 von 1.000) *keine* Stufe senkt:** Es wirkt
ausschließlich über `VERWALTUNG_PRO_EINHEIT_JAHR = 300 €` auf die
Bewirtschaftungskosten — nicht auf die Miete, nicht auf den Preis, nicht auf
den Kaufpreisfaktor. Sein Hebel ist um Größenordnungen kleiner als der der
Miete und zusätzlich durch die Deckelung der Bewirtschaftungskosten auf 20
bis 35 % der Jahreskaltmiete begrenzt. Es wird als **Merkmal am Objekt**
angezeigt („Einheiten angenommen: 3"), nicht als Stufe. *Die genaue
Hebelwirkung ist bislang nicht gemessen — offene Messfrage M1.* Fällt sie
größer aus als erwartet, wird `units_unconfirmed` zu einer eigenen Stufe
zwischen S1 und S0; die Struktur trägt das ohne Umbau.

**Warum `preis_auf_anfrage` und `preis_unlesbar` hier nicht vorkommen:** Diese
Objekte erreichen die Datenbank nie — sie werden schon in
`scrapers/immowelt/titelzeile.ts` übersprungen und nur in der Schlusszeile
des Laufs gezählt (A13). Sie sind kein Dashboard-Zustand, sondern eine
Laufkennzahl. Sie gehören auf eine **Betriebsseite** (Abschnitt 8), nicht in
die Rangliste — dort würden sie als Objekt erscheinen, das es nicht gibt.

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
senkt den NOI um **mehr** als 30 %. Die Bandkanten müssen deshalb durch einen
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

Das ist die Objekt-Sicht auf A11s Befund „558 von 1.879 wechseln irgendwo im
Band die Meldeklasse". Aus einer Bestandszahl, die niemand am Einzelobjekt
sehen kann, wird ein Merkmal an genau den Objekten, für die sie gilt.

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
(Mietqualitäts-Befund, „Was bewusst nicht gemacht wurde"). Über die Hälfte
des Bestands verschwände, darunter der gesamte ZVG-Anteil.

**Verworfen — S0-Objekte mit DSCR 0 unten anhängen:** Das ist der heutige
Zustand innerhalb der Kennzahlen und exakt der Zustand, den der
Mietqualitäts-Befund „den gefährlichsten" nennt.

### 3.8 Die Schwellenlinie innerhalb jeder Stufe

Innerhalb jeder Stufe trennt eine sichtbare Linie die Objekte **über** der
Meldeschwelle (`kaufpreisfaktor` 3…15 **und** `DSCR >= 1,3`) von denen
darunter. Über der Linie steht die Rangliste; unter der Linie steht eine
zusammengeklappte Zeile mit der Anzahl.

**Warum das nötig ist:** Heute enthält S3 zwei Objekte, und *keines* passiert
die Schwellen (A11). Ohne diese Linie stünde das bestbelegte, aber schlechte
Objekt des Bestands ganz oben auf der Seite — die Sicherheitsstufe würde
gegen Anforderung 1 arbeiten. Mit der Linie klappt S3 zu einer einzigen
ehrlichen Zeile zusammen („Belegte Miete: 2 Objekte, keines über der
Schwelle") und das erste **gerankte** Objekt der Seite ist das beste, das es
gibt.

Damit gilt Anforderung 1 („das beste Objekt steht immer oben") in der einzig
haltbaren Lesart: das beste Objekt, über das genug bekannt ist, um es so zu
nennen.

### 3.9 Was der Kopf der Seite sagt

Eine Zeile, aus den Daten gerechnet, in Worten statt in Balken:

> *„2 Objekte mit belegter Miete. 0 Top-Treffer seit dem 2026-09-07.
> 83 % aller Bewertungen beruhen auf einer bundeslandweiten Mietschätzung."*

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
7,6 Tage sind das 90. Perzentil des Regionsabstands. **Ein 24-Stunden-Fenster
wird bewusst nicht angeboten**, und die Oberfläche sagt in einem Satz, warum.

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
als abgängig markiert.** Dazu kommen **157 Objekte (8,2 %) ohne `fundort`**,
die unter keiner regionsgenauen Regel je markierbar sind.

> **Folge: Das Fehlen einer Abgangsmarkierung ist kein Beleg für
> Verfügbarkeit.** Wer graue und nicht-graue Objekte als „weg" und „da" liest,
> liegt für die größte Region des Bestands systematisch falsch.

### 6.3 Entscheidung: Drei Zustände, nicht zwei

| Zustand | Bedingung | Darstellung |
|---|---|---|
| **verfügbar** | `disappeared_at is null` **und** `last_seen` jünger als die Kadenz seiner Region | normal |
| **unbestätigt** | `disappeared_at is null`, aber `last_seen` älter als das Doppelte der Regionskadenz — oder die Region kann Abgänge grundsätzlich nicht erkennen (`nw`, `bw`, `mv`) oder `fundort is null` | eigenes Merkmal, **nicht grau**: „seit X Tagen nicht bestätigt" |
| **abgängig** | `disappeared_at is not null` | ausgegraut, mit Datum |

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
unbestätigt zeigen. Der konkrete Faktor (Vorschlag: 2 × Median des
Regionsabstands aus `sweep_region_runs`) braucht die Verteilung der
`last_seen`-Alter je Region — **offene Messfrage M4**.

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
- **Er erzeugt keine Top-Treffer.** Solange nur zwei Objekte eine belegte
  Miete tragen, bleibt S3 fast leer. Das ist kein Fehler der Darstellung.
- **Er repariert keine Abdeckung.** Ein Bundesland, das seit über einer Woche
  nicht gesweept wurde — bei einem 90. Perzentil von 7,6 Tagen der Regelfall
  am Rand —, steht auch im Dashboard so da: sichtbar, aber nicht behoben.
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

**Schritt 1 — Entscheidungen einholen (kein Code).**
E-1 bis E-8 aus Abschnitt 11. Besonders E-1 (Zugriffsweg) und E-4
(bundeslandgenaue Meldungen) legen fest, was überhaupt gebaut wird.

**Schritt 2 — `scraper/lib/ranking.ts`: reine Funktionen, keine Ein-/Ausgabe.**
Sicherheitsstufe aus `rent_source` + `data_gaps`; Rangzahl; Bandkanten durch
erneuten Aufruf von `berechneKennzahlen` mit skalierter Miete; Bandbreite je
Bundesland aus `REGIONALE_MIETE_PRO_M2` und `plzBundesland.generated.json`;
Schwellenwechsler-Merkmal; die drei Verfügbarkeitszustände. TDD wie im
ganzen Projekt. **Zwei Tests, die zuerst rot sein müssen:** dass
`geschaetzterDscr = nettomietrenditeCapRate / 6` gilt (2.1 — bricht sofort,
wenn jemand eine der Formeln ändert), und dass ein Objekt mit
`wohnflaeche_fehlt` **keine** Kennzahl ausliefert statt einer 0.
*Rein und testbar, ohne Datenbank, ohne Netz, ohne Frontend.*

**Schritt 3 — Snapshot-Export.**
Ein zusätzlicher, ausschließlich **lesender** Schritt am Ende des Laufs, der
den neuesten Stand je Objekt durch `ranking.ts` schickt und als Datei
ablegt. Kein Schreibzugriff, keine Schemaänderung. Damit ist der Inhalt des
Dashboards vollständig da, bevor eine einzige Zeile Oberfläche existiert —
und prüfbar, indem man die Datei liest.

**Schritt 4 — Die Rangliste.**
Vier Blöcke (3.3), Schwellenlinie je Block (3.8), Band statt Punkt (3.4),
Kopfzeile (3.9). Erste sichtbare Ausbaustufe.

**Schritt 5 — Die Veränderungsansicht.**
Letzte N Änderungen (4.3), drei Arten unterschieden (4.2), Datum je Zeile.

**Schritt 6 — Zustände und Frische.**
Drei Verfügbarkeitszustände (6.3), Regionsstand am Filter (4.4), Abgänge-
Bereich (6.4). **Setzt Option 3 im Scraper voraus** — bis dahin ist
`disappeared_at` für Immowelt immer `null` und der Zustand „abgängig" tritt
nie ein. Bis dahin trägt „unbestätigt" die ganze Aussage.

**Schritt 7 — Betriebsseite** (Abschnitt 8). Zuletzt, weil sie niemandem
fehlt, der sie nicht kennt.

---

## 10. Offene Messfragen

Alle verlangen einen Datenbank- oder Netzzugriff und wurden für diesen
Entwurf **nicht** ausgeführt.

| # | Frage | Warum sie zählt |
|---|---|---|
| **M1** | Wie stark verschiebt `units_unconfirmed` (Annahme `MIN_EINHEITEN = 3`) den DSCR? Nachrechnung über alle bewertbaren Objekte mit angenommener und alternativer Einheitenzahl, im Verfahren von A11. | Entscheidet, ob es Merkmal bleibt (3.3) oder eine eigene Stufe wird. Betrifft 567 von 1.000 Versionen. |
| **M2** | Wie breit ist das DSCR-Band je Objekt tatsächlich, wenn die Miete um die Landesspanne aus 3.4 skaliert wird? | Die Bandbreite ist nach 3.4 **nicht** proportional zur Miete. Ohne diese Messung ist die Sortierung nach unterer Kante (3.5) unkalibriert. |
| **M3** | Wie verteilen sich die Objekte auf S3/S2/S1/S0? | 83 % S1 und „über die Hälfte `wohnflaeche_fehlt`" überschneiden sich unbekannt stark. Entscheidet, ob S2 überhaupt genug Objekte für einen eigenen Block hat. |
| **M4** | Verteilung des `last_seen`-Alters je Region. | Kalibriert die Schwelle für „unbestätigt" (6.3). |
| **M5** | Wie viele Objekte sind Schwellenwechsler nach 3.6 — und deckt sich die Zahl mit A11s 558? | Prüft, ob die Objekt-Sicht dieselbe Größe misst wie die Bestands-Sicht. Weicht sie ab, ist eine der beiden Rechnungen falsch. |
| **M6** | Wie oft ändert eine Preissenkung tatsächlich die Rangposition — und um wie viel? | Anforderung 3 des Nutzers steht und fällt damit. Wenn Preissenkungen den Rang kaum bewegen, braucht die Veränderungsansicht mehr Gewicht als die Rangliste. |

---

## 11. Entscheidungen des Nutzers

Alles hier Aufgeführte ist **nicht** von diesem Entwurf entschieden. Es
betrifft Geld, Risiko, Schreibzugriffe auf Produktionsdaten oder Recht.

| # | Entscheidung | Was daran hängt |
|---|---|---|
| **E-1** | **Zugriffsweg: Snapshot-Export (C1, empfohlen), Anmeldung (B) oder anon-Key (A)?** | B und A verlangen **`create policy` auf der Produktionsdatenbank**; B zusätzlich ein angelegtes Benutzerkonto. C1 verlangt **keine** Änderung. |
| **E-2** | **Wer darf das Dashboard sehen?** Nicht verlinkte URL, Basic Auth, oder Anmeldung? | Bestimmt, ob der gesamte Bestand samt Kennzahlen faktisch öffentlich ist. |
| **E-3** | **Darf die Seite öffentlich erreichbar sein**, obwohl sie von Immowelt übernommene Titel und Preise zeigt und Bilder aus dem Immowelt-CDN einbindet? | Rechtsfrage. Dieser Entwurf hat dazu keine Kompetenz und trifft keine Aussage. |
| **E-4** | **Dürfen bundeslandgenaue Schätzungen melden — oder nur im Dashboard erscheinen?** (identisch mit A11 Schritt 4) | 339 von 409 Meldekandidaten. Bei „nur Dashboard" wird das Dashboard der Hauptweg und nicht die Ergänzung. |
| **E-5** | **Gilt der Rangvorschlag aus 2.3 (DSCR, keine erfundene Punktzahl)?** | Alles Weitere baut darauf. Eine gewichtete Punktzahl wäre möglich, aber die Gewichte müssten vom Nutzer kommen, nicht vom Entwurf. |
| **E-6** | **Wie lange bleiben Abgänge im Archiv?** Unbegrenzt, oder nach N Tagen ausblenden (nicht löschen)? | Unter Option 3 wird nie gelöscht; das Archiv wächst sonst unbegrenzt. |
| **E-7** | **Was geschieht mit den 157 Objekten ohne `fundort`?** (identisch mit Frage 5 der Abgänge-Spec) | Sie sind dauerhaft „unbestätigt". Sie zu verwerfen wäre ein Schreibzugriff auf Produktionsdaten. |
| **E-8** | **Wo läuft das Dashboard, und was darf es kosten?** | Ein Snapshot ist eine statische Datei und praktisch kostenlos; Weg B verlangt einen laufenden Dienst. |

---

## 12. Zusammenfassung in fünf Sätzen

1. **Rang** ist der DSCR — die einzige der fünf Kennzahlen, die alles kennt,
   was die anderen kennen; drei der fünf sind rechnerisch dieselbe Zahl, und
   eine der vier Top-Treffer-Bedingungen kann nie greifen.
2. **Unsicherheit** ordnet vor der Punktzahl: vier Sicherheitsstufen als
   getrennte Blöcke, die Zahl als Band mit der gemessenen Spanne des
   jeweiligen Bundeslandes, sortiert nach der ungünstigen Kante.
3. **Nicht beurteilbare Objekte bekommen keinen Rangplatz und keine
   Kennzahl** — nur den Grund im Klartext, damit sie nie wie geprüft und
   schlecht aussehen.
4. **Veränderung** wird an der Versionshistorie gemessen, nicht am Kalender,
   und die Liste wird nach Anzahl geschnitten — bei 43 % Cron-Ausfall und
   5,7 Tagen Regionsabstand wäre jedes kurze Zeitfenster nur scheinbar leer.
5. **Zugriff** über einen Snapshot ohne jeden Schlüssel im Frontend, weil das
   die einzige Variante ist, die **keine** Änderung an der
   Produktionsdatenbank verlangt — und **Abgänge, Unbestätigtes und
   Verfügbares sind drei Zustände**, weil `nw`, `bw` und `mv` nie einen
   Abgang melden werden.
