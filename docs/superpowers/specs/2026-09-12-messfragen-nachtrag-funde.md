# Offene Funde am M1–M6-Nachtrag

> **Stand 2026-09-12.** Der Nachtrag zu den Messfragen steht in
> [`2026-09-09-dashboard-entwurf.md`](2026-09-09-dashboard-entwurf.md)
> (Commit `708a9cf`). Die Nachprüfung hat seine **Rohzahlen durchweg
> reproduziert** und ausdrücklich bestätigt, dass die Messskripte die
> Projektfunktionen aufrufen statt Formeln nachzubauen. Beanstandet ist
> nicht die Messung, sondern was der Nachtrag daraus im Entwurf gemacht hat.
>
> **Diese Datei existiert, weil die Korrekturrunde nicht mehr gelaufen ist:**
> Der Agent starb am Sitzungslimit, bevor er eine Zeile geändert hatte. Ohne
> diese Datei wären die Funde mit der Sitzung verloren gewesen.
>
> **Erledigt am 2026-09-13. Diese Datei ist damit vom Auftrag zum Protokoll
> geworden:** Unter jedem Fund steht, **was** geändert wurde und — wo der Fund
> zwei Wege offenließ — **welcher Weg gewählt wurde und warum**. Die
> Korrekturrunde hat **nichts gemessen und keine Zeile Code geändert**; die
> Rohzahlen des Nachtrags sind bestätigt. Der Entwurf führt sie in
> **Abschnitt 13.8** zusammen.
>
> **Der eine Satz, der über alle Funde hinweg zählt:** Zwei Funde ließen die
> Wahl zwischen *nachmessen* und *kennzeichnen*. Nachgemessen wurde keiner —
> nicht aus Bequemlichkeit, sondern weil die drei Messskripte des Prüfers
> (`messung-korrektur-regionsabstand.ts`, `messung-m6-preissenkung.ts`,
> `messung-m6-teil2.ts`) im **git-ignorierten** Verzeichnis
> `.superpowers/sdd/2026-09-12-blaetterung-meldedeckel-und-a4/` lagen. Dieses
> Verzeichnis existiert **weder im Arbeitszweig noch im Hauptcheckout**; es
> ist mit der Sitzung des Prüfers verloren gegangen. Die Skripte sind also
> nicht gescheitert, sie waren gar nicht vorhanden — und eine reine
> Dokumentationsrunde durfte keine neuen schreiben.

## Warum das zählt

Der Entwurf ist die Grundlage für `lib/ranking.ts` und damit für das ganze
Dashboard. Ein Entwurf, der **zwei Stände nebeneinander** trägt, ist
schlimmer als einer mit einem falschen: Wer ihn später liest, kann nicht
wissen, welcher gilt. Genau das war im Auftrag ausgeschlossen.

---

## Kritisch 1 — Abschnitt 3.3 und 13.1: korrigierte Regel, unkorrigierte Zahlen

Die Tabelle nennt in **derselben Zeile** die korrigierte Bedingung
(`living_area_m2 <= 0` zählt als S0) und die alten Zahlen.

Unter der korrigierten Regel nachgerechnet:

| Stufe | im Nachtrag | unter der korrigierten Regel |
|---|---|---|
| S3 | 1 | 1 |
| S2 | 196 | **52** (0,4 %) |
| S1 | 11.312 | 11.308 |
| S0 | 1.102 | **1.250** (9,9 %) |
| davon ZVG in S2 | 169 | **39** |

Damit steht die tragende M3-Antwort — „S2 trägt genug für einen eigenen
Block" — auf Zahlen aus genau der Regel, die derselbe Abschnitt für falsch
erklärt. **Mit 52 Objekten ist die Blockfrage offen, nicht beantwortet.**

Zu ändern: 3.3, 3.1, die M3-Zeile in Abschnitt 10, und 13.1.

> **Erledigt am 2026-09-13.** Alle vier Stellen zählen jetzt nach der
> korrigierten Regel: **S3 1 · S2 52 · S1 11.308 · S0 1.250**. 13.1 stellt
> beide Zählungen nebeneinander und sagt, dass die korrigierte maßgeblich ist;
> 3.3 nennt zusätzlich Verfahren und das, was die Zahlen nicht hergeben.
>
> **Der eigentliche Punkt ist umgesetzt:** Die M3-Antwort „S2 trägt genug für
> einen eigenen Block" ist **zurückgezogen**. Die Blockfrage steht in 3.3, in
> 13.1 (Punkt 2) und in der M3-Zeile als **offen** — mit der Begründung, dass
> 52 von 12.611 Objekten (0,4 %) keinen eigenen beschrifteten Block tragen —
> und ist Abschnitt 9, **Schritt 4** zugeordnet, nicht Schritt 2. Dort steht
> ausdrücklich, dass `ranking.ts` davon nicht berührt ist: Die Stufe wird in
> jedem Fall berechnet, offen ist nur ihre Darstellung.
>
> **Beim Gegenlesen gefundene Folgestellen**, die derselbe Fund erzeugt hat:
> 3.2 („jede Stufe ein eigener Block"), 3.7 (begründete eine Ablehnung mit
> „über die Hälfte des Bestands", gemessen sind 9,9 %), Abschnitt 9
> (Schritte 0 und 4) und 13.3 (seine 52 auswertbaren S2-Objekte **sind** das
> korrigierte S2). Auch E-4 und 13.7 hängen daran — siehe unter „Gering".

## Kritisch 2 — Abschnitt 6.3: zwei Stände, und eine Begründung gegen die eigenen Zahlen

Die Zustandstabelle definiert weiter über „Kadenz seiner Region" und „das
Doppelte der Regionskadenz", der Fließtext sagt fett **„Die Schwelle ist
regionsindividuell, nicht global"** — direkt vor dem Block, der eine globale
Schwelle von 3 Tagen beschließt.

Dazu stimmen zwei Begründungssätze nicht. Der Nachtrag schreibt, 3 Tage
lägen „über jedem Regions-P90" und seien „eine gerade Zahl über dem
gemessenen Maximum aller Regionen". Gemessen:

| Größe | Wert |
|---|---|
| `nw` P90 | 3,32 d |
| `ni` P90 | 3,10 d |
| Maximum aller Regionen | 4,78 d |
| bei 3 Tagen dauerhaft unbestätigt: `ni` | 217 von 853 (25,4 %) |
| bei 3 Tagen dauerhaft unbestätigt: `nw` | 337 von 3.163 (10,7 %) |

Die eigene Aussage „trifft keine Region dauerhaft" ist damit widerlegt.

**Die Grundgesamtheit trägt die Schwelle ohnehin nicht.** Das älteste
`first_seen` liegt 6,92 Tage zurück, und nur **187 von 12.611** Objekten
(1,5 %) sind länger als 5 Tage im Bestand. Ein Objekt von gestern *kann*
kein Alter von 3 Tagen zeigen. Auf Objekte eingeschränkt, die überhaupt
einen Rückstand zeigen können, liegen **13,0 %** über 3 Tagen statt der
genannten 5,6 %.

**Zulässige Antwort:** „Auf sieben Tagen Historie nicht entscheidbar, in
vier Wochen nachmessen." Das ist hier vermutlich die ehrlichere.

> **Erledigt am 2026-09-13.** 6.3 trägt jetzt nur noch einen Stand: Die
> Zustandstabelle definiert „unbestätigt" weiter regionsindividuell (Kadenz
> der Region bzw. deren Doppeltes), und der Fließtext beschließt **keine**
> globale 3-Tage-Schwelle mehr — sie ist ausdrücklich **zurückgezogen**, nicht
> nur relativiert. Dieselbe Änderung trägt die M4-Zeile in Abschnitt 10 und
> 13.4.
>
> **Die drei widerlegten Begründungssätze sind gestrichen, nicht ergänzt:**
> „3 Tage liegen über jedem Regions-P90", „eine gerade Zahl über dem
> gemessenen Maximum" und „trifft keine Region dauerhaft" stehen im Text nur
> noch als zitierte, ausdrücklich falsifizierte Aussagen (`nw`-P90 3,32 d,
> Maximum 4,78 d, `ni` 25,4 % / `nw` 10,7 % dauerhaft unbestätigt bei 3
> Tagen) — nicht mehr als geltende Begründung.
>
> **Geschrieben ist die im Fund verlangte Antwort, fast wörtlich:** „Entschieden:
> nicht entscheidbar. Die Schwelle wird in vier Wochen nachgemessen; bis dahin
> gilt die regionsindividuelle Definition aus der Zustandstabelle oben." Dazu
> ergänzt 6.3 den Befund, dass auch die Grundgesamtheit die Schwelle nicht
> trägt (nur 187 von 12.611 Objekten älter als 5 Tage, 13,0 % statt 5,6 % über
> 3 Tagen auf der einschränkbaren Teilmenge) — kein Weg wurde gewählt, weil
> keiner zur Wahl stand: Der Fund verlangte hier keine Entscheidung zwischen
> zwei Optionen, sondern das Zurückziehen einer unbelegten Schwelle.

## Wichtig 3 — Abschnitt 4.3: zwei Stände, und die Messung ersetzt eine andere Größe

Die Filterliste „(7 / 14 / 30 Tage)" und die Begründung für das
7-Tage-Fenster stehen unverändert über dem Block, der 3 Tage beschließt.

Schwerer wiegt: Die alte Begründung war das 90. Perzentil des
**Regionsabstands** (7,6 d). Gemessen wurde das **`last_seen`-Alter**. Das
ist nicht dieselbe Größe. Abschnitt 13.4 sagt, die 5,7 und 7,6 Tage seien
„nicht widerlegt", während 4.3 zwei Absätze davor sagt, ihre Begründung
trage nicht mehr. Beides zugleich geht nicht.

Entweder den Regionsabstand aus `sweep_region_runs` wirklich nachmessen,
oder die Änderung an 4.3 zurücknehmen.

> **Erledigt am 2026-09-13. Weg 2 gewählt: die Änderung an 4.3 ist
> zurückgenommen.** Weg 1 (Regionsabstand aus `sweep_region_runs`
> nachmessen mit `messung-korrektur-regionsabstand.ts`) war nicht gangbar:
> Das Skript liegt im git-ignorierten Verzeichnis
> `.superpowers/sdd/2026-09-12-blaetterung-meldedeckel-und-a4/`, das weder im
> Arbeitszweig noch im Hauptcheckout existiert — es ist mit der Sitzung des
> Prüfers verloren gegangen, nicht gescheitert. Ein neues Skript zu schreiben
> war in dieser reinen Dokumentationsrunde nicht zulässig, und Datenbankzugriff
> war für diese Aufgabe ohnehin ausgeschlossen. Der Fehlschlag ist in 4.3
> ausdrücklich vermerkt („Was zu tun wäre, und warum es nicht getan ist"),
> nicht stillschweigend übergangen — genau das verlangt der Fund.
>
> 4.3 zeigt wieder die **7 / 14 / 30-Tage-Fassung** und stellt Regionsabstand
> (Abgänge-Spec, P90 7,6 Tage) und `last_seen`-Alter (M4) als zwei benannte,
> verschiedene Größen nebeneinander; die Frage nach dem kürzesten Fenster
> bleibt **offen, nicht zugunsten von 7 Tagen entschieden**. 13.4 trägt
> dieselbe Aussage und löst damit den vom Fund benannten Widerspruch auf:
> „die 5,7 und 7,6 Tage sind nicht widerlegt" (durch eine andere Größe) und
> „die Frage ist offen" (weil der Regionsabstand selbst nicht nachgemessen
> wurde) schließen sich nicht aus — nicht widerlegt ist nicht dasselbe wie
> bestätigt.

## Wichtig 4 — M6 misst einen Rang, den der Entwurf nicht vergibt

**6 der 17** echten Senkungen liegen in **S0** — Objekten, die nach 3.7
überhaupt keinen Rangplatz bekommen. Gerankt wurde global über alle 12.157,
obwohl 3.2 nach Stufenblöcken trennt. Der Median „+539 Plätze", mit dem 2.4
belegt wird, stammt teils aus einer Liste, die es so nicht geben wird.

Entweder innerhalb der Stufe und ohne S0 neu rechnen, oder ausdrücklich
dranschreiben, welche Liste gerankt wurde.

> **Erledigt am 2026-09-13. Weg 2 gewählt: die gerankte Liste ist benannt,
> nicht neu gerechnet.** Weg 1 (innerhalb der Stufe und ohne S0 neu rechnen
> mit `messung-m6-preissenkung.ts` / `messung-m6-teil2.ts`) war nicht gangbar:
> Beide Skripte lagen im selben git-ignorierten, verlorenen Verzeichnis wie
> das Regionsabstand-Skript (siehe Wichtig 3 und den Kopf dieser Datei); eine
> reine Dokumentationsrunde durfte weder neue Skripte schreiben noch die
> Datenbank anfassen.
>
> 2.4 und 13.6 benennen jetzt ausdrücklich, welche Liste M6 gerankt hat:
> „global über alle 12.157 bewerteten Objekte einschließlich S0" — eine
> Liste, die das Dashboard nach 3.2/3.7 so nie zeigen wird —, und dass **6
> der 17** echten Senkungen in S0 lagen, das gar keinen Rangplatz bekommt.
>
> **Der verlangte Vorbehalt zur Stichprobengröße von 17 steht in 2.4:** „Die
> Messung belegt sie nicht: Sie umfasst 17 echte Preissenkungen aus sieben
> Tagen Historie, mehrere davon zum selben Objekt". 13.6 spricht es noch
> deutlicher aus: „2.4 bleibt — begründet, aber nicht belegt." Die Aussage
> „Anforderung 3 ist belegt" steht damit an keiner Stelle mehr unbedingt da;
> was bleibt, ist die Formel-Begründung, ausdrücklich getrennt von der
> unbelegten Messung.

## Wichtig 5 — E-7 und 6.2: „54 statt 157" ist kein Vergleich gleicher Art

Alt war „ohne `fundort`", neu ist „ohne zuordenbare Region" über
`partitionEinesListings`. Heute gemessen: **ohne Fundort 250** (54 Immowelt,
196 ZVG), **ohne zuordenbare Region 54**. Der Rückgang von 8,2 % auf 0,4 %
ist damit teils definitorisch. Die angegebene Ursache („Fundort wird seit
dem Umbau mitgeschrieben") ist behauptet, nicht gemessen.

> **Erledigt am 2026-09-13.** E-7 und 6.2 stellen beide Größen jetzt mit
> Namen nebeneinander: **ohne `fundort` 250** (54 Immowelt, 196 ZVG) und
> **ohne zuordenbare Region 54**. Beide Stellen sagen ausdrücklich, dass der
> Rückgang von 8,2 % auf 0,4 % teils definitorisch ist, weil die alte
> Zählung vom 2026-09-09 nie nach der neuen Definition wiederholt wurde und
> die beiden Zahlen deshalb **nicht vergleichbar** sind.
>
> Die Ursachenbehauptung ist **als Vermutung gekennzeichnet, nicht
> gestrichen** — 6.2 nennt sie wörtlich „plausibel, aber für diesen Entwurf
> nicht nachgemessen; es wird hier als Vermutung geführt und nicht als
> Ursache behauptet" und verweist ausdrücklich auf `ABNAHME-BASIS.md` A-2.
> Auch 6.3 ist an der betroffenen Stelle präzisiert: Die Zustandsbedingung
> „oder `fundort is null`" ist durch „`partitionEinesListings` liefert keine
> Region" ersetzt, weil die 196 ZVG-Objekte über ihr `external_id`-Präfix
> sehr wohl zuordenbar sind.

## Gering

- 3.8 nennt weiter „Belegte Miete: 2 Objekte", Abschnitt 9 „solange nur
  **zwei** Objekte eine belegte Miete tragen" — gemessen ist **1**.
- Abschnitt 9 nennt weiter „bei einem 90. Perzentil von 7,6 Tagen der
  Regelfall".
- E-4 trägt weiter „339 von 409 Meldekandidaten", während 13.7 aus derselben
  Messung „197 von 12.611" ableitet.
- Die Zahl „6.408 von 11.308 = 56,7 %" in 3.1 steht ohne Verfahren.

> **Erledigt am 2026-09-13, alle vier Punkte.**
>
> - **3.8 und Abschnitt 7** (nicht 9 — die Zeile „solange nur … Objekte eine
>   belegte Miete tragen" steht und stand bereits vor der Korrekturrunde in
>   Abschnitt 7, „Was dieser Entwurf nicht löst") nennen jetzt **1** statt
>   zwei Objekte mit belegter Miete: 3.8 „Belegte Miete: 1 Objekt, nicht über
>   der Schwelle", Abschnitt 7 „Solange nur **ein** Objekt eine belegte Miete
>   trägt … bleibt S3 fast leer."
> - Die **7,6-Tage-Aussage** ist in 4.3 und Abschnitt 7 als eigene Größe
>   (90. Perzentil des Regionsabstands, Abgänge-Spec) neben dem
>   `last_seen`-Alter aus M4 gekennzeichnet und nicht mehr „der Regelfall"
>   genannt; das Wort „Regelfall" kommt im Entwurf nicht mehr vor. Das
>   Ergebnis ist mit Wichtig 3 vereinheitlicht: beide Größen bleiben offen,
>   bis der Regionsabstand selbst nachgemessen ist.
> - **E-4** (339 von 409) und **13.7** stehen jetzt nebeneinander mit dem
>   Vermerk, dass es zwei verschiedene Grundgesamtheiten sind (A11s
>   Meldekandidaten vs. die Stufenzahlen aus M3) und beides **keine eigene
>   Messung**, sondern eine Ableitung ist. 13.7 zählt nach der korrigierten
>   Stufenregel jetzt **53 von 12.611** (S3 1 + S2 52) statt der alten 197 —
>   der alte Wert steht als Fußnote „nach der alten Stufenregel waren es
>   197", nicht mehr als aktueller Stand.
> - Die Zahl „6.408 von 11.308 = 56,7 %" in 3.1 trägt jetzt ein **Verfahren**
>   (eigene Box direkt unter der Tabelle: Grundgesamtheit, Zuordnung über
>   `plzBundesland.generated.json`, was die Zahl nicht hergibt) samt der
>   Einschränkung, dass der Zählschritt selbst im Nachtrag nicht protokolliert
>   und das zugehörige Messskript nicht mehr vorhanden ist — die Zahl gilt
>   deshalb als **nicht reproduzierbar** und ist bei der nächsten Messung
>   mitzuführen, statt gestrichen zu werden.

---

## Der Fund, der über den Auftrag hinausgeht

Der Messende hat ihn selbst gemeldet, die Nachprüfung hat ihn bestätigt und
reproduziert: **148 Objekte ohne Wohnfläche tragen keine Datenlücke** und
landen deshalb mit DSCR 0 in S2 oder S1 statt in S0. Ursache ist, dass die
S0-Regel nur an `data_gaps` hängt, und das Merkmal auf den Scantag datiert
(`lib/pipeline.ts:98`, `bewerteFlaechenangabe`).

Für ein Ranking-Dashboard ist *geprüft und schlecht* der gefährlichste
Zustand, den *nicht beurteilbar* annehmen kann — genau das passiert hier.
Die Regel ist im Entwurf um `living_area_m2 <= 0` ergänzt, **aber nicht
implementiert**. Sie gehört in `lib/ranking.ts` mit einem Test, der zuerst
rot ist.

## Grundregel für die Korrekturrunde

Der Entwurf darf danach an keiner Stelle zwei Stände tragen, und keine Zahl
darf ohne Verfahren, Datum und die Angabe dastehen, **was sie nicht
hergibt**. Wo die sieben Tage Historie eine Frage nicht beantworten, ist
„nicht entscheidbar, in vier Wochen nachmessen" die richtige Antwort und
nicht eine Schwelle mit schwacher Begründung.
