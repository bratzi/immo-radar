# `vollstaendig=true` ohne `gemeldete_treffer` -- Messung und Befund

Gemessen am 2026-09-16 (Auswertung fortgesetzt am 2026-09-17) im Rahmen von
A18, Aufgabe 6. Skript: `scraper/scripts/messung-vollstaendig-ohne-trefferzahl.mts`
(nur lesend). Aufruf: `cd scraper && npx tsx scripts/messung-vollstaendig-ohne-trefferzahl.mts`

## Warum gemessen wurde

`sweep_region_runs` traegt Zeilen mit `vollstaendig = true`, obwohl
`gemeldete_treffer` fehlt. Die Kombination ist in sich widerspruechlich: ohne
Trefferzahl gibt es keinen Massstab, an dem Vollstaendigkeit zu messen waere.
`vollstaendig` ist die Wache vor der Massenloeschung -- `schaetzeRegionsKadenzen`
zaehlt genau diese Zeilen. Aus drei Altzeilen bekaeme `nw` eine Kadenz von
0,44 Tagen, und der ganze NRW-Bestand hiesse "verfuegbar" -- aus einer Region,
aus der nie ein Abgang erkannt wird.

`scraper/lib/snapshot.ts` behauptete, diese Zeilen stammten alle vom
2026-09-08/09. Behauptet war es, belegt nicht. Wenn es nicht stimmt, schreibt
heute ein Lauf eine Vollstaendigkeitsaussage ohne Massstab.

## Die Abfrage

```ts
await sb
  .from("sweep_region_runs")
  .select("partition, gemeldete_treffer, vollstaendig, started_at")
  .eq("source", "immowelt")
  .is("gemeldete_treffer", null)
  .eq("vollstaendig", true)
  .order("started_at", { ascending: false })
  .limit(1000);
```

## Das Ergebnis

**8 Zeilen.** Alle `source = 'immowelt'`.

- juengstes `started_at`: **2026-09-09T08:10:35.980891+00:00**
- aeltestes `started_at`: 2026-09-08T08:56:57.267455+00:00

Verteilung je Region:

| Region | Zeilen | juengstes `started_at` | aeltestes `started_at` |
| --- | --- | --- | --- |
| `nw` | 3 | 2026-09-09T08:10:35Z | 2026-09-08T11:05:42Z |
| `mv` | 3 | 2026-09-09T01:59:39Z | 2026-09-08T08:56:57Z |
| `bw` | 1 | 2026-09-08T18:29:05Z | 2026-09-08T18:29:05Z |
| `sh` | 1 | 2026-09-08T23:14:23Z | 2026-09-08T23:14:23Z |

Alle acht Zeitstempel (absteigend): 2026-09-09T08:10:35Z `nw`,
2026-09-09T01:59:39Z `mv`, 2026-09-08T23:14:23Z `sh`, 2026-09-08T18:29:05Z `bw`,
2026-09-08T13:43:03Z `nw`, 2026-09-08T11:05:42Z `nw`, 2026-09-08T11:05:42Z `mv`,
2026-09-08T08:56:57Z `mv`.

## Der Abgleich mit der Fail-closed-Umstellung

`istRegionVollstaendig` gibt bei `gemeldet === null` seit Commit **`ed46f36`**
(*"feat(immowelt): Rotation setzt fort, fehlende Trefferzahl zaehlt
fail-closed"*) `false` zurueck. Commit-Zeitpunkt: **2026-09-09T10:27:10+02:00 =
08:27:10 UTC**.

Die juengste widerspruechliche Zeile liegt **16 Minuten und 35 Sekunden davor**
(08:10:35 UTC). Der Commit-Zeitpunkt ist der frueheste moegliche
Auslieferungszeitpunkt; die Produktion lief also zu jedem der acht Zeitpunkte
noch mit dem alten Verhalten. **Keine einzige Zeile stammt aus der Zeit danach.**

Der Abstand ist knapp. Er ist trotzdem eindeutig, und die Gegenprobe stuetzt
ihn.

## Gegenprobe: laeuft ueberhaupt noch etwas?

"Keine Zeile nach dem 09." koennte auch heissen, dass seitdem nichts lief. Tut
es nicht:

- `sweep_region_runs` gesamt: **210 Zeilen**, juengste 2026-09-16T18:51:07Z,
  aelteste 2026-09-08T08:15:52Z.
- Zeilen ab 2026-09-09: **184**, davon `vollstaendig = true`: **51**.
- `vollstaendig = true` **mit** Trefferzahl: **66**, juengste 2026-09-16T18:51:07Z.

Seit der Umstellung sind also 184 Zeilen geschrieben worden, 51 davon mit
`vollstaendig = true` -- und jede einzelne davon traegt eine Trefferzahl. Die
Schreibstelle erzeugt den Widerspruch nicht mehr.

## Schlussfolgerung

Die acht Zeilen sind **Altlast aus der Zeit vor der Fail-closed-Umstellung vom
2026-09-09 08:27 UTC**; der laufende Code erzeugt sie nicht mehr, und die
Behauptung in `snapshot.ts` ist damit belegt (dort seit dieser Messung mit
Commit und Uhrzeit hinterlegt).

## Was daraus folgt

1. Kein offener Fehler, also keine Ursachensuche an der Schreibstelle.
2. Aber eine zweite Sperre: `regionsLaufZeile` schreibt `vollstaendig` jetzt
   selbst fail-closed (`gemeldeteTreffer === null` -> `false`). Heute ist das
   unerreichbar, weil `istRegionVollstaendig` die Kombination nicht mehr
   bildet. Die Sperre sitzt an der SCHREIBSTELLE, damit ein kuenftiger zweiter
   Vollstaendigkeitsmassstab (**A16**, Regionen ohne ausgewiesene Menge) sie
   nicht versehentlich wieder oeffnet, sondern sie **ausdruecklich** aufheben
   muss. Das ist der Sinn der Sperre, nicht ein Nebeneffekt.
3. Die acht Altzeilen bleiben in der Datenbank stehen. Sie werden nicht
   geloescht: ein Schreibzugriff auf die Produktionsdatenbank ist hier nicht
   erlaubt, und die Aktualitaetsprobe in `schaetzeRegionsKadenzen` (Schritt 4)
   faengt sie ab -- sie liegen mehr als das Doppelte jeder plausiblen Kadenz
   zurueck. Wer sie spaeter bereinigt, hat hier den Beleg, welche acht es sind.
