# A16 — Ein zweiter Vollständigkeitsmaßstab für Regionen ohne ausgewiesene Menge

Entwurf vom 2026-09-21. Grundlage ist BACKLOG A16, mit einem Unterschied: Der
dort vorgeschlagene Maßstab ist gemessen und **widerlegt** worden. Was hier
steht, ist der Ersatz.

## Das Problem

`istRegionVollstaendig` misst die eingesammelte Menge gegen die vom Portal
gemeldete. Nennt das Portal keine, ist die Region fail-closed unvollständig.
Für vier Regionen — `nw`, `bw`, `mv`, `sh` — nennt Immowelt sie nie (gemessen
2026-09-16, `specs/2026-09-16-regionen-ohne-trefferzahl.md`). Diese vier
sammeln damit **nie** Referenzläufe an, und `nw` ist mit rund 6.900 Objekten
die größte Region überhaupt. B1 wartet darauf.

## Was gemessen wurde

Skript: `scraper/scripts/messung-a16-massstaebe.mts` (nur lesend). Aufruf:
`cd scraper && npx tsx scripts/messung-a16-massstaebe.mts`

Ein Maßstab, der aus der eigenen Historie urteilt, lässt sich an den vier
betroffenen Regionen gerade **nicht** prüfen — dort fehlt die Wahrheit. Die
zwölf übrigen Regionen nennen ihre Trefferzahl; für sie steht in
`sweep_region_runs.vollstaendig` bereits das Urteil des heutigen Maßstabs. Das
ist das Prüffeld: 323 Urteile über 492 Zeilen.

Ein Kandidat bekommt dort nur `gesehene_objekte` und die Historie zu sehen,
nie die Trefferzahl. Sein Urteil wird gegen `vollstaendig` gehalten.

| Kandidat | geprüft | Fail-open | Fehlalarm | sagt ja | Wahrheit ja |
| --- | --- | --- | --- | --- | --- |
| Median der letzten 10, Toleranz 25 % | 323 | **203** | 0 | 257 | 54 |
| Median der letzten 10, Toleranz 10 % | 323 | **203** | 0 | 257 | 54 |
| Hochwassermarke der letzten 10, Toleranz 25 % | 323 | **43** | 0 | 97 | 54 |
| Hochwassermarke der letzten 10, Toleranz 10 % | 323 | **43** | 0 | 97 | 54 |
| **Hochwassermarke ganze Historie, Toleranz 10 %** | 323 | **0** | **0** | **54** | **54** |

Fail-open heißt: Der Kandidat hält die Region für vollständig, die gemeldete
Trefferzahl sagt nein. Das ist der Fehler, der bei regionsgenauer Löschhoheit
echte Objekte zu Abgängen erklärt.

**Die Spalte „sagt ja" ist die Wache.** Ein Kandidat, der nie „vollständig"
sagt, hätte trivial null Fehler und wäre wertlos. Der gewählte Kandidat sagt
genau so oft ja wie die Wahrheit: 54 von 54. Die Übereinstimmung ist echt.

### Drei Befunde

**1. Der Ansatz aus dem Backlog ist fail-open in 63 % der Fälle.** A16
schlägt den gleitenden Median der eigenen Region vor. Er erzeugt 203 von 323
falschen Freigaben. Die Ursache ist dieselbe, die schon B9 widerlegt hat:
24 % der Läufe sind flach, jede Region bleibt bei rund 40 Karten stehen, und
der Median sinkt mit dem Ausfall mit. Ein Maßstab, der den Ausfall mitmacht,
misst ihn nicht.

**2. Nicht der Schätzer ist das Problem, sondern das Fenster.** Auch das
Maximum über die letzten zehn Läufe erzeugt noch 43 Fail-open — weil der
flache Zustand länger als zehn Läufe anhält. Am 2026-09-21 waren fünf Läufe
in Folge flach. Erst die Marke **ohne** Fenster hält.

**3. Das Ergebnis ist nicht auf die Daten gepasst.** Dieselbe Marke wurde über
acht Toleranzen geprüft:

| Toleranz | Fail-open | Fehlalarm |
| --- | --- | --- |
| 2 % | 0 | 8 |
| 5 % | 0 | 2 |
| **10 %** | **0** | **0** |
| 15 %, 20 %, 25 %, 35 %, 50 % | 0 | 0 |

Von 10 % aufwärts ist das Band fehlerfrei. 10 % ist der engste fehlerfreie
Wert und deshalb der gewählte.

## Der Maßstab

Das Urteil fällt in zwei Schritten. Erst wird der Maßstab **gewählt**, dann
wird gegen ihn geurteilt. Nur so bleibt trennbar, woran gemessen wurde.

**Schritt 1 — den Maßstab wählen** (`waehleMassstab`):

| Lage | Maßstab | Referenz |
| --- | --- | --- |
| Das Portal nennt eine Trefferzahl | `gemeldete_treffer` | die gemeldete Zahl |
| Keine Trefferzahl, Marke **über** `EINE_ERGEBNISSEITE` (45) | `hochwassermarke` | die Marke |
| Keine Trefferzahl, Marke ≤ 45 oder keine Marke lesbar | `keiner` | `null` |

Die gemeldete Trefferzahl hat **Vorrang**; der neue Maßstab greift nur, wo
keine gemeldet wurde. Die **Hochwassermarke** ist das Maximum von
`gesehene_objekte` über alle bisherigen Zeilen dieser Region und Quelle, ohne
Fenster.

**Schritt 2 — gegen den gewählten Maßstab urteilen**
(`urteileGegenMassstab`). Zwei Bedingungen gelten unabhängig vom Maßstab und
werden zuerst geprüft:

1. Die Blätterung endete **nicht** am Seitendeckel (`abgeschnitten === false`).
   Der Seitendeckel ist ein Beleg für das Gegenteil von Vollständigkeit.
2. Es wurde mehr als null Karten eingesammelt.

Dann entscheidet der Maßstab:

| Maßstab | Urteil |
| --- | --- |
| `keiner` | immer `false` — fail-closed, es gibt nichts zu messen |
| `gemeldete_treffer` | unverändert wie heute: `gemeldet === 0` → `true`, sonst `gesammelt >= gemeldet * (1 - REGION_FEHLBETRAG_TOLERANZ)` mit 0,25 |
| `hochwassermarke` | `gesammelt >= marke * 0,9` |

Die beiden Toleranzen sind bewusst verschieden. 0,25 gegen die gemeldete Zahl
ist die bestehende, an `TOLERANZ_ANTEIL` gekoppelte Größe und wird **nicht**
angefasst. 0,10 gegen die Marke ist enger, weil A16 für eine einzelne Region
ausdrücklich eine engere Grenze verlangt als die quellenweite — und weil 0,10
der engste Wert ist, der in der Messung fehlerfrei blieb.

### Warum die Marke alle Zeilen zählt, nicht nur die vollständigen

`ladeSweepHistorie` filtert auf `vollstaendig = true`. Hier geht das nicht:
Für `nw`, `bw`, `mv` und `sh` existiert keine einzige vollständige Zeile — das
ist genau das Henne-Ei-Problem, das A16 löst. Ein Maximum verträgt das, weil
es gegen Ausreißer **nach unten** immun ist; flache Läufe vergiften es nicht.
Gegen Ausreißer nach oben ist es das nicht, siehe Risiken.

### Warum die Untergrenze von 45 nötig ist, obwohl keine Zeile sie heute auslöst

Simuliert, nicht geschlossen:

```
Historie =  3 x 40 Karten, neuer Lauf 40 -> "JA -- FAIL-OPEN"
Historie =  5 x 40 Karten, neuer Lauf 40 -> "JA -- FAIL-OPEN"
Historie = 10 x 40 Karten, neuer Lauf 40 -> "JA -- FAIL-OPEN"
Historie = 40, 40, 6800,   neuer Lauf 40 -> "nein"
```

Eine Region, deren Historie mit flachen Läufen **beginnt**, bekäme eine Marke
von 40, und dann gälte jeder flache Lauf als vollständig. Ein einziger tiefer
Lauf in der Historie heilt es sofort.

Real ist der Fall nie eingetreten: **0 von 16 Regionen** starteten flach; jede
Historie beginnt mit mindestens einem tiefen Lauf. Die Gegenprobe deckt das
Loch deshalb **nicht** ab — sie urteilt erst ab der vierten Zeile. Eine neue
Region, eine neue Quelle oder eine geleerte Tabelle würde es auslösen.
Die Untergrenze schließt es, und `EINE_ERGEBNISSEITE = 45` ist die Konstante,
die dafür schon im Code steht: 40 Karten sind eine Ergebnisseite, kein Bestand.

## Der Schnitt

**Neu: `scraper/lib/regionsMassstab.ts`** — rein, ohne Datenbank, unter Test.

```ts
export type MassstabArt = "gemeldete_treffer" | "hochwassermarke" | "keiner";

export interface Massstab {
  art: MassstabArt;
  /** Die Menge, gegen die geurteilt wurde. null nur bei art "keiner". */
  referenz: number | null;
}

export function waehleMassstab(
  gemeldet: number | null,
  hochwassermarke: number | null
): Massstab;

export function urteileGegenMassstab(
  gesammelt: number,
  massstab: Massstab,
  abgeschnitten: boolean
): boolean;
```

`istRegionVollstaendig` in `scraper/scrapers/immowelt/index.ts` bekommt die
Hochwassermarke als **viertes Argument**, verpflichtend und ohne Vorgabewert —
aus demselben Grund, aus dem `abgeschnitten` keinen hat: Ein stilles `null`
wäre die Sorte Vorgabe, die einen unbekannten Zustand als „in Ordnung" liest.
Die Funktion holt nichts selbst; sie bleibt rein.

**Laden:** `sweepImmowelt` bekommt einen zweiten Parameter
`hochwassermarken: Map<string, number> | null`, analog zu
`letzteRegionsSweeps`. `null` heißt „Historie nicht lesbar" und führt
fail-closed zu `art: "keiner"` für jede Region ohne Trefferzahl.

**Die Abfrage darf nicht an `ladeLetzteRegionsSweeps` hängen.**
`REGIONS_HISTORIE_ZEILEN = 200` deckt bei heute 492 Zeilen nur die jüngsten
rund zwölf je Region — das wäre genau das Fenster, das oben mit 43 Fail-open
durchgefallen ist. Die neue Funktion `ladeHochwassermarken` sortiert deshalb
**nach `gesehene_objekte` absteigend**, nicht nach Zeit. Dann steht das
Maximum jeder Region unter den ersten Zeilen des Ergebnisses, und das Limit
kann die Marke nicht mehr abschneiden.

## Die Sperre an der Schreibstelle

`regionsLaufZeile` (`scraper/lib/bestandDb.ts`) schreibt seit dem 2026-09-16
`vollstaendig: false`, sobald `gemeldeteTreffer === null` ist. Die Sperre ist
Absicht und muss **ausdrücklich** aufgehoben werden, nicht nebenbei.

Sie wird ersetzt, nicht entfernt: Die neue Bedingung lautet
`massstab === "keiner" ? false : vollstaendig`. Damit bleibt die Regel, die
die Sperre schützen sollte, wörtlich erhalten — `vollstaendig = true` steht
nie ohne Maßstab da —, und sie wird jetzt an der Sache geprüft statt an einem
Stellvertreter. Der Warnkommentar wird durch die Begründung ersetzt, nicht
gelöscht.

## Die Migration

`sweep_region_runs` bekommt zwei Spalten, beide nullable, rein additiv:

```sql
alter table sweep_region_runs add column massstab text;
alter table sweep_region_runs add column referenz_menge integer;
```

`massstab` trägt `'gemeldete_treffer'`, `'hochwassermarke'` oder `'keiner'`.
`referenz_menge` trägt die Zahl, gegen die geurteilt wurde.

Rückweg: die beiden Spalten fallen lassen. Keine bestehende Abfrage liest sie,
kein bestehender Schreibpfad füllt sie zwingend.

**Die acht Altzeilen vom 2026-09-08 bleiben unberührt** und tragen `null` in
beiden Spalten. Daran bleiben sie erkennbar — sie sind die einzigen Zeilen mit
`vollstaendig = true` ohne Maßstab, und das soll sichtbar bleiben, nicht
kaschiert werden. Ein Schreibzugriff auf die Produktionsdatenbank findet hier
nicht statt.

## Was sich am Verhalten ändert

`geltungsbereich` listet die Regionen, die in einem Lauf vollständig
durchliefen. Er ist seit Option 3 die Freigabe für eine Markierung. Künftig
können `nw`, `bw`, `mv` und `sh` dort erscheinen — bisher konnten sie es nie.

Zwei unabhängige Sperren bleiben bestehen und werden **nicht** angefasst:
`sweep.vollstaendig` ist für Immowelt hart `false`, und
`partitionAusExternalId` liefert für diese Quelle `null`. Es wird durch diese
Arbeit nichts gelöscht und nichts markiert. A16 stellt her, dass die vier
Regionen Referenzläufe **sammeln** können; die Löschhoheit ist ein eigenes
Arbeitspaket.

## Abnahme

1. `scraper/scripts/messung-a16-massstaebe.mts` liegt im Repo, läuft und zeigt
   für den gewählten Kandidaten 0 Fail-open und 0 Fehlalarm bei 54 von 54
   Ja-Urteilen.
2. Neue Tests decken ab: die drei Ausgänge von `waehleMassstab` einzeln, die
   Marke ≤ 45, die Marke `null`, beide Toleranzen, `abgeschnitten === true`,
   null eingesammelte Karten, die Vorrangregel gemeldete Trefferzahl vor
   Marke, und `regionsLaufZeile` mit `massstab: "keiner"`.
3. Ein Test prüft den **Aufrufort**, nicht nur die Funktion: `sweepImmowelt`
   reicht die geladenen Marken bis in `regionLaeufe` durch. (Die Falle vom
   2026-09-21: Unit-Tests prüfen die Funktion, nicht den Aufrufort.)
4. `tsc` sauber, alle Scraper-Tests grün.
5. Ein Produktionslauf schreibt Zeilen mit gefülltem `massstab` und
   `referenz_menge`.

**Die Erwartung an diesen Produktionslauf, ausdrücklich festgehalten:**
Solange Immowelt flach liefert, urteilt der neue Maßstab für alle vier
Regionen **unvollständig** — die Marke liegt bei 6.995 (`nw`), 4.920 (`bw`),
1.316 (`sh`) und 662 (`mv`), und 40 Karten reißen jede davon. Dass keine neue
vollständige Region erscheint, ist der Beweis, dass der Maßstab wirkt, nicht
dass er fehlt. Was der Lauf belegen muss, ist `massstab = 'hochwassermarke'`
mit der richtigen `referenz_menge` in der Zeile.

## Nicht-Ziele

- **Die Marke altert nicht.** Sie steigt nur. Schrumpft Immowelts Bestand
  echt, blockiert eine zu hohe Marke die Region dauerhaft — fail-closed, also
  sicher, aber nutzlos. Ob das eintritt, ist **nicht gemessen** und wird hier
  nicht geraten. Es geht als Messauftrag in den Backlog: Beobachten, ob eine
  Region über mehrere tiefe Läufe unter ihrer Marke bleibt.
- **Keine regionsgenaue Löschhoheit.** Eigenes Arbeitspaket.
- **Kein Anfassen der quellenweiten Wache** in `plausibilitaet.ts`.
  `MIN_REFERENZLAEUFE` und `TOLERANZ_ANTEIL` bleiben, wie sie sind.
- **Keine Änderung an ZVG.** Die einzige Quelle mit Löschhoheit bleibt außen
  vor.

## Risiken

| Risiko | Wirkung | Was dagegen steht |
| --- | --- | --- |
| Ein einzelner falsch hoher Lauf hebt die Marke dauerhaft | Region gilt dauerhaft als unvollständig | Fail-closed, also in die ungefährliche Richtung. Sichtbar in `referenz_menge`. |
| Bestand schrumpft echt | dieselbe Wirkung | Als Messauftrag benannt, nicht geraten |
| Historie nicht lesbar | keine Marke, `art: "keiner"` | Fail-closed, wie `letzteRegionsSweeps` es heute schon handhabt |
| Neue Region startet flach | Marke 40 | Die Untergrenze `> EINE_ERGEBNISSEITE` |
