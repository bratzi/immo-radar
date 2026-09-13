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

## Wichtig 4 — M6 misst einen Rang, den der Entwurf nicht vergibt

**6 der 17** echten Senkungen liegen in **S0** — Objekten, die nach 3.7
überhaupt keinen Rangplatz bekommen. Gerankt wurde global über alle 12.157,
obwohl 3.2 nach Stufenblöcken trennt. Der Median „+539 Plätze", mit dem 2.4
belegt wird, stammt teils aus einer Liste, die es so nicht geben wird.

Entweder innerhalb der Stufe und ohne S0 neu rechnen, oder ausdrücklich
dranschreiben, welche Liste gerankt wurde.

## Wichtig 5 — E-7 und 6.2: „54 statt 157" ist kein Vergleich gleicher Art

Alt war „ohne `fundort`", neu ist „ohne zuordenbare Region" über
`partitionEinesListings`. Heute gemessen: **ohne Fundort 250** (54 Immowelt,
196 ZVG), **ohne zuordenbare Region 54**. Der Rückgang von 8,2 % auf 0,4 %
ist damit teils definitorisch. Die angegebene Ursache („Fundort wird seit
dem Umbau mitgeschrieben") ist behauptet, nicht gemessen.

## Gering

- 3.8 nennt weiter „Belegte Miete: 2 Objekte", Abschnitt 9 „solange nur
  **zwei** Objekte eine belegte Miete tragen" — gemessen ist **1**.
- Abschnitt 9 nennt weiter „bei einem 90. Perzentil von 7,6 Tagen der
  Regelfall".
- E-4 trägt weiter „339 von 409 Meldekandidaten", während 13.7 aus derselben
  Messung „197 von 12.611" ableitet.
- Die Zahl „6.408 von 11.308 = 56,7 %" in 3.1 steht ohne Verfahren.

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
