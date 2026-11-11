# Messung: Welche Immowelt-Regionen weisen nie eine Trefferzahl aus

**Datum der Messung:** 2026-09-16, 23:10 Uhr (Momentaufnahme, kein
eingeschwungener Zustand — `sweep_region_runs` ist zu diesem Zeitpunkt acht
Tage alt).

**Zweck:** A15/A16 im Backlog und der Kommentar an `istRegionVollstaendig`
(`scraper/scrapers/immowelt/index.ts`) nannten bislang drei Regionen (`nw`,
`bw`, `mv`) als die, für die `trefferzahlAusTitel` nie eine Zahl liefert.
Diese Messung prüft die Behauptung nach statt sie zu übernehmen (Plan
`2026-09-16-a18-und-die-zwei-funde.md`, Aufgabe 5).

## Abfrage

Committetes, rein lesendes Skript, das bereits vor dieser Aufgabe im Repo lag:

```
cd scraper && npx tsx scripts/messung-regionskadenz.mts
```

Es fragt `sweep_region_runs` ab:

```ts
const { data } = await sb
  .from("sweep_region_runs")
  .select("source, partition, started_at, vollstaendig, gesehene_objekte, gemeldete_treffer")
  .order("started_at", { ascending: true })
  .limit(20000);
```

und zählt je `source/partition`: Zeilen gesamt, Zeilen mit
`vollstaendig === true`, Zeilen mit `gemeldete_treffer !== null`.

## Grundgesamtheit

`sweep_region_runs`, `source = 'immowelt'`, gesamt **210 Zeilen** über 16
Regionen, Zeitraum **2026-09-08T08:15 bis 2026-09-16T18:51 UTC** (rund acht
Tage, ausschließlich Immowelt — für `zvg-portal` liegt dort keine Zeile).

## Ergebnis je Region

| Region | Läufe gesamt | davon `vollstaendig=true` | davon mit `gemeldete_treffer` |
|---|---|---|---|
| be | 12 | 4 | 12 |
| br | 13 | 6 | 13 |
| **bw** | 15 | 1 | **0** |
| by | 15 | 8 | 15 |
| hb | 13 | 6 | 12 |
| he | 11 | 4 | 11 |
| hh | 12 | 5 | 12 |
| **mv** | 12 | 3 | **0** |
| ni | 12 | 5 | 12 |
| **nw** | 19 | 3 | **0** |
| rp | 12 | 5 | 12 |
| **sh** | 11 | 1 | **0** |
| sl | 14 | 6 | 13 |
| sn | 11 | 4 | 11 |
| st | 14 | 7 | 14 |
| th | 14 | 6 | 13 |

## Befund

Genau **vier** Regionen tragen in allen ihren Zeilen `gemeldete_treffer =
null`: **`nw`, `bw`, `mv` und `sh`** — nicht drei. Für diese vier kann
`istRegionVollstaendig` seit der Fail-closed-Umstellung vom 2026-09-09 nie
`true` liefern (außer über die alten `vollstaendig=true`-Zeilen von
2026-09-08/09, die vor der Umstellung entstanden sind — `bw` hat davon noch
eine, `nw` drei, `mv` drei, `sh` eine; danach keine mehr).

Das deckt sich mit der unabhängigen Messung, die bereits im Kommentar zu
`schaetzeRegionsKadenzen` (`scraper/lib/snapshot.ts:265-280`) vom selben Tag
dokumentiert ist (dort mit einem Stand von 171 Zeilen, sieben statt acht
Tagen — die vorliegende Messung ist ein Tag jünger).

**Momentaufnahme, keine Konstante:** Diese Menge ist aus den Daten
abgeleitet, nicht im Code aufgezählt (`schaetzeRegionsKadenzen`,
`scraper/lib/snapshot.ts:265-275`). Eine erneute Messung an einem späteren
Tag kann ein anderes Ergebnis liefern, falls das Portal sein Verhalten für
eine Region ändert. Diese Datei hält den Stand vom 2026-09-16 fest, nicht
eine Garantie für alle Zukunft.

## Frühere Messung (zum Vergleich, Stand 2026-09-09)

`docs/superpowers/BACKLOG.md`, A15/A16, hielt am 2026-09-09 fest: Von den
damals konfigurierten Regionsläufen parste der Titel für `nw`, `bw` und `mv`
nicht — "5 von 21 Regionsläufen" in einem einzelnen Produktionslauf (zwei
Prüfläufe `34387028565`/`34388541806` gegen `nw`, `34388892360` gegen `bw`).
`sh` war zu dem Zeitpunkt nicht Teil der Stichprobe und tauchte deshalb nicht
im Befund auf. Diese Zahl bezieht sich auf einen einzelnen Lauf und bleibt
als Stand vom 2026-09-09 stehen — sie wird durch die vorliegende Messung
nicht ersetzt, sondern durch eine spätere, breitere Messung (16 Regionen über
acht Tage) ergänzt.
