# Option 3 — markieren ohne löschen

> **Entstanden am 2026-09-09.** Setzt Option 3 aus
> [`2026-09-08-immowelt-abgaenge-optionen.md`](2026-09-08-immowelt-abgaenge-optionen.md)
> um und erfüllt damit Abnahmekriterium **B-2**: „Ein verschwundenes
> Immowelt-Objekt wird als verschwunden **erkannt**" — erkannt, ausdrücklich
> nicht gelöscht.
>
> Voraussetzung erfüllt: Option 0 (`.in()`-Stückelung), Option 1
> (Fortsetzungsrotation, fail-closed Trefferzahl) und der Fundort-Baustein
> (`listings.fundort`, `partitionEinesListings`) stehen.
>
> **Option 2 (regionsgenaues Löschen) ist ausdrücklich nicht das Ziel dieses
> Entwurfs.** `immowelt` wird nicht in `QUELLEN_MIT_LOESCHHOHEIT` eingetragen.

## Das Problem in einem Satz

Der Pfad zur Markierung ist heute hinter `sweep.vollstaendig` verriegelt, und
`vollstaendig` ist für Immowelt aus gutem Grund hart `false` — es beschreibt
die **quellenweite** Beweislast, die eine **Löschung** verlangt. Für eine
**reversible Markierung** ist diese Beweislast falsch bemessen: Sie kann für
eine rotierend erfasste Quelle nie erbracht werden, und sie muss es auch
nicht, denn der Schaden eines Fehlurteils ist graue Darstellung, nicht
Datenverlust.

## Leitentscheidung: zwei getrennte Befugnisse, ein bestehendes Register

Der Code unterscheidet ab jetzt

- **markieren erlaubt** — reversibel. Beweislast: **regionsgenau**. Das Objekt
  liegt in einer Region, die in *diesem* Lauf gesweept wurde und ihre
  Vollständigkeit gegen die vom Portal ausgewiesene Trefferzahl belegt hat.
- **löschen erlaubt** — unwiderruflich. Beweislast: **quellenweit**, unverändert
  (`vollstaendig` + Mengenplausibilität + Karenz + `last_seen` + Erlaubnisliste).

**Kein zweites Feld auf `SweepErgebnis`.** Ein `markierenErlaubt` neben
`vollstaendig` wären zwei Flaggen mit fast derselben Bedeutung — genau die
Bauart, aus der Sperre 1 entstanden ist. Die Unterscheidung liegt bereits
eindeutig in der Datenbankschicht: `QUELLEN_MIT_LOESCHHOHEIT` in
`lib/bestandDb.ts` ist die **einzige** Stelle, die über Löschhoheit
entscheidet. Sie wird als Prädikat `quelleHatLoeschhoheit(source)`
exportiert und damit vom stillen Filter zum benannten Begriff.

Daraus folgt die Regel, die den ganzen Umbau trägt:

> Bei einer Quelle **mit** Löschhoheit ist die Markierung der **erste Schritt
> der Löschung** und braucht deren volle Beweislast.
> Bei einer Quelle **ohne** Löschhoheit ist die Markierung ein Endzustand und
> braucht nur den Regionsbeweis.

Das ist keine Umgehung der Wachen, sondern ihre saubere Zuordnung: Wer nicht
löschen darf, kann durch Markieren nichts vernichten.

## Die Entwurfsfragen, beantwortet

### 1. Was geschieht bei `fundort is null`? — **Nie markieren.**

157 Objekte (8,2 %, gemessen 2026-09-08) tragen keinen Fundort: Altbestand aus
der Detailseiten-Ära. `partitionEinesListings` liefert für sie `null` (die
Immowelt-externalId ist eine nackte UUID und trägt kein Bundesland),
`imGeltungsbereich` gibt darauf `false` zurück. Diese Objekte sind unter keiner
regionsgenauen Regel je zuzuordnen und damit **nie** ein Abgang. Nicht
zuzuordnen heißt nicht verschwunden.

### 2. Was gilt, wenn eine Region im Lauf gar nicht vorkam? — **Nie markieren.**

`geltungsbereich` enthält ausschließlich Regionen, die in *diesem* Lauf
tatsächlich erfasst wurden **und** `istRegionVollstaendig` bestanden haben. Eine
wegen des Zeitbudgets zurückgestellte Region steht dort nicht; ihre Objekte
fallen aus dem Filter. **Nicht gesehen heißt nicht verschwunden** — das ist
derselbe Fehlschluss, an dem Option 5 scheitert (ein HTTP 403 ist kein „Objekt
weg").

Der Grenzfall zählt mit: Ein Lauf, in dem **keine** Region ihre
Vollständigkeit belegt, hat einen **leeren** Geltungsbereich, und ein leerer
Geltungsbereich markiert nichts. Das ist genau die Fail-open-Stelle, die am
2026-09-09 geschlossen wurde; sie trägt jetzt auch den Markierpfad.

### 3. Wie verengt `ermittleAbgaenge` über `listings.fundort`?

Gar nicht neu — die Verengung steht schon. `imGeltungsbereich` fragt
`partitionEinesListings(source, listing)` (gespeicherter Fundort vorrangig,
ersatzweise `partitionAusExternalId` für ZVG) und prüft die Partition gegen
`sweep.geltungsbereich`. Was fehlt, ist allein die Freigabe: die Wache
`if (!sweep.vollstaendig) return []` steht **vor** dieser Verengung und beendet
den Pfad, bevor er beginnt.

Der Umbau fügt deshalb **keine** neue Filterlogik hinzu, sondern eine zweite,
schwächer verriegelte Tür zu derselben Logik:

```
ermittleMarkierungen(sweep, bekannte, befugnis)
  ├─ befugnis.hatLoeschhoheit && !befugnis.quellenPruefungBestanden → []
  ├─ befugnis.hatLoeschhoheit                                       → ermittleAbgaenge(...)   (unverändert)
  └─ sonst                                                          → regionsgenau, ohne vollstaendig-Wache
```

`ermittleAbgaenge` bleibt **wörtlich unverändert** und behält seinen Test:
*ein unvollständiger Sweep liefert null Abgänge.* Fällt dieser Test, ist die
Löschhoheit für Immowelt eingeschaltet worden.

### 4. Muss die Mengenplausibilität für das Markieren greifen? — **Quellenweit nein, regionsgenau ja — und die gibt es bereits.**

Begründung, nicht Übernahme:

**Der quellenweite Median ist für Immowelt strukturell unbrauchbar.**
`pruefeMengenplausibilitaet` vergleicht die Gesamtmenge dieses Laufs gegen den
Median vergangener Läufe aus `sweep_runs`. Immowelt erfasst je Lauf eine
rotierende Scheibe: gemessen schwankt die eingesammelte Menge zwischen 3.361
und 9.329 Objekten — Faktor 2,8 —, je nachdem, ob der Lauf auf `nw` oder auf
`hb` startet. Eine 25-%-Toleranz schlägt darauf fast immer an. Die Prüfung
würde nicht *streng* wirken, sondern *blind*: sie misst die Rotation, nicht die
Datenqualität. Dazu kommt, dass `ladeSweepHistorie` auf `vollstaendig = true`
filtert und für Immowelt deshalb dauerhaft `[]` liefert — die Prüfung wäre
nicht nur unbrauchbar, sie wäre ein permanentes Nein.

**Die regionsgenaue Prüfung ist die schärfere und ist schon eingebaut.**
`istRegionVollstaendig(gesammelt, gemeldet)` misst die eingesammelte Menge
einer Region gegen die **vom Portal in diesem Augenblick ausgewiesene**
Trefferzahl, mit derselben 25-%-Toleranz. Das ist ein Vergleich gegen eine
Live-Wahrheit statt gegen einen historischen Durchschnitt — strenger, nicht
schwächer. Sie fällt fail-closed bei `gesammelt === 0` (Soft-Block-Signatur:
HTTP 200 mit leerer Hülle) und bei `gemeldet === null`.

**Ein regionsgenauer Median aus `sweep_region_runs` wird nicht eingeführt.**
Er prüfte dieselbe Größe ein zweites Mal, die `istRegionVollstaendig` bereits
gegen die Portalzahl geprüft hat, und verlangte `MIN_REFERENZLAEUFE = 3` eigene
Läufe je Region — B-2 verschöbe sich um Wochen für einen Zugewinn, der in
keinem Verhältnis zum Schaden steht: ein paar Tage graue Darstellung,
zurückgenommen beim nächsten Auftauchen. Die Tabelle bleibt bestehen; sie ist
die Vorbereitung für **Option 2**, wo derselbe Zugewinn tausende Zeilen wert
wäre.

**Für Quellen mit Löschhoheit ändert sich nichts.** ZVG durchläuft weiter die
quellenweite Prüfung, bevor überhaupt markiert wird.

### 5. Wie unterscheidet der Code „markieren erlaubt" von „löschen erlaubt"?

Über `quelleHatLoeschhoheit(source)` (neu exportiert aus `lib/bestandDb.ts`,
gestützt auf die bestehende Erlaubnisliste). `vollstaendig` behält dadurch
**eine** Bedeutung — quellenweiter Vollständigkeitsbeweis, Voraussetzung der
Löschung — statt wie bisher zwei zu tragen.

## Der Zuschnitt: 13 von 16 Regionen

Option 3 gilt für die Regionen, die ihre Trefferzahl nennen. Gemessen am
2026-09-09 nennen **`nw`, `bw` und `mv`** sie nirgends — nicht im Seitentitel,
nicht im Seitentext. `trefferzahlAusTitel` liefert dort `null`,
`istRegionVollstaendig` gibt fail-closed `false` zurück, die Region erreicht
`geltungsbereich` nie, und **kein Objekt aus `nw`, `bw` oder `mv` wird je
markiert** — auch nicht fälschlich.

Das ist eine **bewusste Lücke**, kein Fehler, der in diesem Arbeitspaket
behoben wird: Der zweite Vollständigkeitsmaßstab für Regionen ohne
ausgewiesene Trefferzahl ist zurückgestellt (A16). `nw` allein ist 21,2 % des
Bestands; genau dort wäre ein still geblockter Lauf am teuersten. Solange der
Maßstab fehlt, ist Nichtstun die richtige Antwort.

Praktisch heißt das: B-2 wird über `by`, `ni`, `he`, `hb`, `th`, `sl`, `br`,
`st`, `rp`, `sn`, `sh`, `be`, `hh` erfüllt. Die Lücke steht als Kommentar an
`istRegionVollstaendig` und hier.

## Vierte Fail-open-Stelle, gefunden und geschlossen

`regionErfassen` meldet `abgeschnitten = true`, wenn die Blätterung am
Seitendeckel des Portals endet — die Region ist dann **nachweislich**
unvollständig erfasst. Dieser Befund wurde bisher **nur geloggt** und floss
nicht in `istRegionVollstaendig` ein.

Solange nichts markiert wurde, kostete das nichts. Mit Option 3 wäre es ein
Loch: Eine abgeschnittene Region, deren eingesammelte Menge zufällig innerhalb
der 25-%-Toleranz landet (Deckel ~10.000 Objekte, gemeldet 10.000–13.333),
käme in den Geltungsbereich, und die abgeschnittenen Objekte wären Abgänge.
Ein **bekannter** Unvollständigkeitsbefund darf nie in eine
Vollständigkeitsaussage münden.

Die Regionszeile trägt deshalb `vollstaendig = false`, sobald `abgeschnitten`
gilt — ohne Ausnahme, vor jeder Mengenrechnung.

## Was geändert wird

| Datei | Änderung |
|---|---|
| `lib/bestand.ts` | `ermittleMarkierungen(sweep, bekannte, befugnis)` neu. `ermittleAbgaenge` unverändert. Gemeinsamer privater Filter. |
| `lib/bestandDb.ts` | `quelleHatLoeschhoheit(source)` exportiert. |
| `scrapers/immowelt/index.ts` | `abgeschnitten` schlägt auf die Regionsvollständigkeit durch. |
| `main.ts` | `gleicheBestandAb` markiert über `ermittleMarkierungen`; die quellenweite Prüfung verriegelt nur noch Quellen mit Löschhoheit. |

**Nicht geändert:** `QUELLEN_MIT_LOESCHHOHEIT` (bleibt `["zvg-portal"]`),
`loescheAbgelaufene`, `istHartLoeschbar`, `KARENZ_TAGE`,
`pruefeMengenplausibilitaet`, das Schema.

## Verhalten nach dem Umbau

- **ZVG:** unverändert. Quellenweite Prüfung → `ermittleAbgaenge` → markieren →
  nach Karenz löschen.
- **Immowelt:** Die quellenweite Prüfung schlägt weiter fehl und schreibt
  weiter ihre leise Logzeile (`strukturellTeilweise`), **beendet den Abgleich
  aber nicht mehr**. Markiert werden Objekte, deren Fundort eine Region ist,
  die in diesem Lauf vollständig durchlief und in der sie nicht mehr auftauchten.
  Gelöscht wird nichts: `loescheAbgelaufene` fragt nur Quellen der
  Erlaubnisliste ab.
- **Rückkehrer:** unverändert; `ermittleRueckkehrer` nimmt die Markierung schon
  heute ohne vollständigen Sweep zurück.
- **Abgangsmeldung über Telegram:** unverändert auf Objekte beschränkt, die es
  früher in den Chat geschafft haben.

## Prüfungen

Neu unter Test:

1. Ohne Löschhoheit wird ein Objekt einer vollständig durchlaufenen Region
   markiert, obwohl `vollstaendig = false`.
2. Ohne Löschhoheit wird ein Objekt **ohne Fundort** nie markiert.
3. Ohne Löschhoheit wird ein Objekt einer Region, die im Lauf nicht vorkam,
   nie markiert.
4. Leerer Geltungsbereich markiert nichts — auch ohne Löschhoheit.
5. Mit Löschhoheit und nicht bestandener quellenweiter Prüfung wird nichts
   markiert.
6. Mit Löschhoheit und bestandener Prüfung verhält es sich wie
   `ermittleAbgaenge` (insbesondere: `vollstaendig = false` → nichts).
7. `quelleHatLoeschhoheit`: `zvg-portal` ja, `immowelt` nein, unbekannte
   Quelle nein.
8. Eine abgeschnittene Region gilt nie als vollständig.

Bestehen bleibt unverändert: *ein unvollständiger Sweep liefert null Abgänge*
(`ermittleAbgaenge`), und `loescheAbgelaufene` rührt `immowelt` nicht an.
