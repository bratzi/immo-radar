# A-4-Produktionsbeleg: Lauf 34910160636

> **Auftrag.** `ABNAHME-BASIS.md` A-4 stand seit dem Merge von `sdd/zvg-a4`
> (`db0a22e`) auf „Code für beide Quellen steht, Produktionsbeleg offen".
> Lauf `34910160636` (Workflow `scrape.yml`, Commit `bf0ddf1`, 2026-09-14
> 23:43:52 UTC bis 2026-09-15 00:08:12 UTC, `conclusion: success`) war dafür
> ausgelöst. Diese Datei ist die Auswertung.
>
> **Ergebnis in einem Satz:** Für **Immowelt** belegt genau dieser Lauf den
> Fall exakt und lückenlos (23 neue `listings`-Zeilen ohne
> `listing_versions`-Zeile, 1:1 mit der Logzeile). Für **ZVG** belegt
> **dieser** Lauf den Fall NICHT — er hatte schlicht null Detailkandidaten —,
> aber ein Nachbarlauf desselben Codestands (`34797538466`,
> 2026-09-14 01:56–02:21 UTC) hat den ZVG-Fall bereits erzeugt. Siehe
> „Antwort auf die Prüffrage" unten für die genaue Einordnung.

## Verfahren

**Log.** `gh run view 34910160636 --log`, umgeleitet in eine Datei (540
Zeilen — der Job lief effektiv nur ~24 Minuten Scraper-Arbeit, das Log ist
klein), darin gezielt gesucht nach `Immowelt ohne Preis`, `ZVG`,
`Meldungen:`, `Sweep`, `Bewertung`.

**Datenbank, nur lesend.** Ein Messskript (`scraper/scripts/`, `cd scraper
&& npx tsx ...`, nach Gebrauch wieder gelöscht — reine Wegwerf-Diagnose,
keine Bauaufgabe) hat über `scraper/lib/supabase.ts` zwei Tabellen
vollständig per Keyset-Blätterung geladen (`.gt("id", letzteId).order("id",
{ ascending: true }).limit(1000)`, nie `.range()`):

- `listing_versions` (nur `id, listing_id`) → Menge aller `listing_id`, die
  mindestens eine Version haben.
- `listings` (`id, source, external_id, fundort, first_seen, last_seen,
  disappeared_at, url`) → Differenzmenge = Zeilen ohne Version.

**Zuordnung zum Lauf.** `listingUpsertZeile` (`scraper/lib/db.ts`) setzt bei
jedem Upsert `last_seen`, aber **nicht** `first_seen` — die Spalte hat in
`schema.sql` `default now()` und wird nur beim allerersten INSERT gesetzt,
ein späteres `onConflict`-Update lässt sie unangetastet. Damit ist
`first_seen` im Fensterschnitt `[2026-09-14T23:43:00Z,
2026-09-15T00:09:00Z]` ein präziser Beweis für „diese Zeile ist in GENAU
diesem Lauf zum ersten Mal entstanden" — unabhängig davon, wie viele Läufe
seither noch gelaufen sind. Deshalb trägt die Messung auf `first_seen`,
nicht auf den nackten Bestandszuwachs seit der Vergleichsmessung von
~01:50 Uhr Ortszeit (zwischen der und jetzt liegen mehrere weitere Läufe:
`34919787084`, `34944934182` — ein reiner Vorher-Nachher-Vergleich der
Gesamtzahlen hätte deren Beiträge nicht von denen des Ziellaufs trennen
können).

## Ergebnis

### Referenzzahlen (Bestand zum Zeitpunkt der Messung, nach mehreren
### Läufen seit dem Vergleichswert — nicht laufscharf, nur zur Einordnung)

```
                          vorher (~01:50)   jetzt gemessen
listings gesamt                17.078            17.754   (immowelt 17.552, zvg-portal 202)
mit disappeared_at                 351               419
OHNE listing_version               128               190   (immowelt 187, zvg-portal 3)
listing_versions                25.709            27.438
```

Der Zuwachs allein beweist nichts (siehe Auftrag) — die laufscharfe Zahl
steht unten.

### Immowelt — BELEGT, 1:1 mit dem Log

Logzeile aus `34910160636`:

```
Immowelt: 577 von 4761 gesehenen Objekten aus der Ergebnisliste bewertet,
23 ohne Preisangabe erfasst, aber nicht bewertet: preis_auf_anfrage 23
(by 23), preis_unlesbar 0.
```

(577 + 23 = 600 — deckt sich mit „600 von 4761 Kandidaten … bearbeitet".)

Datenbankbefund: **23** `listings`-Zeilen `source=immowelt` ohne
`listing_versions`-Zeile mit `first_seen` im Laufzeitfenster —
**alle 23 mit `fundort=by`**. Beispiel:

```
external_id=4b8653a7-f9d1-42dc-a5b7-56e5fbc3201b fundort=by
  first_seen=2026-09-15T00:06:48.460+00:00 last_seen=2026-09-15T00:08:01.638+00:00
```

Zahl, Quelle, Region und Zeitpunkt stimmen exakt mit der Logzeile überein.
Das ist die Art Beleg, die der Auftrag verlangt: nicht „die Zahl ist
gewachsen", sondern „genau diese Zeilen sind genau in diesem Lauf aus genau
diesem Grund entstanden".

**Nebenbefund, der die Messung schärfer macht statt sie zu verwässern:**
Von den `listings ohne Version` bei Immowelt hatten **44** ihr `last_seen`
im Laufzeitfenster, nicht nur 23. Die Differenz (21) sind **ältere**
`by`-Objekte ohne Preis (z. B. `first_seen=2026-09-14T02:19:57`, aus einem
früheren Lauf), deren `last_seen` in `34910160636` erneut auf „jetzt"
gesetzt wurde. Ursache, im Code nachvollzogen: `gleicheBestandAb`
(`scraper/main.ts:193–210`) ruft **zuerst**, für jede Quelle, unabhängig
von der Detailauswahl, `aktualisiereLastSeen` für **alle** im Sweep
gesehenen `external_id`s auf (`scraper/lib/bestandDb.ts:160–171`) —
genau die Reihenfolge, die der Kommentar dort mit der Löschwache begründet.
Diese 21 Zeilen sind also keine neuen A-4-Fälle, sondern die Bestätigung,
dass bereits erfasste preislose Objekte beim Wiedersehen nicht aus dem
Bestand fallen — ein zweiter, kleinerer Beleg für dasselbe Kriterium (kein
stilles Verschwinden), aber nicht der hier gefragte „neu entstanden"-Fall.

### ZVG — dieser Lauf zeigt NICHTS, ein Nachbarlauf zeigt es

Logzeilen aus `34910160636`:

```
ZVG-Portal: 0 von 0 Kandidaten in diesem Lauf bearbeitet, ueber die Liste
gestreut. Keiner bleibt uebrig.
ZVG: 0 von 0 Detailseiten ohne verwertbaren Verkehrswert (Zeile ohne
Bewertung), 0 erfasst, 0 Stoerungen (nichts geschrieben, der naechste Lauf
holt sie erneut).
```

Der ZVG-Sweep selbst fand in diesem Lauf 197 Termine über 11 Bundesländer
(`by` 10, `br` 5, `hb` 2, `he` 19, `ni` 22, `nw` 90, `rp` 8, `sl` 1, `sn` 21,
`st` 13, `th` 6). **Keiner davon** war ein Detailkandidat: `
waehleDetailKandidaten` (`scraper/lib/bestand.ts:302–308`) wählt nur
`external_id`s, die entweder unbekannt sind oder als veraltet gelten
(`ladeVeralteteExternalIds`). Bei einer Quelle mit insgesamt nur 202
`listings` im gesamten Bestand — nahe an den 197 aktuell gelisteten Terminen
— sind praktisch alle aktuellen Termine bereits „bekannt" und (weil ZVG
sich selten ändert) nicht „veraltet". Damit ist die Kandidatenliste **strukturbedingt leer**, nicht kaputt.

Der aktuelle Bestand trägt genau **3** `zvg-portal`-Zeilen ohne
`listing_versions`:

```
by-49119   first_seen=2026-09-14T02:21:10.04  last_seen=2026-09-15T08:16:08.75
nw-167869  first_seen=2026-09-14T02:21:10.53  last_seen=2026-09-15T08:16:08.75
hb-4820    first_seen=2026-09-14T02:21:10.22  last_seen=2026-09-15T08:16:08.75
```

Beide Zeitstempel liegen **außerhalb** des Fensters von `34910160636`
(23:43–00:09 UTC). Über die Run-Liste (`gh run list --workflow=scrape.yml`)
lassen sich beide Zeitpunkte konkreten Läufen zuordnen:

```
first_seen ~02:21 UTC  ->  Lauf 34797538466  (2026-09-14 01:56:38–02:21:44 UTC, Commit 297c226, success)
last_seen  ~08:16 UTC  ->  Lauf 34944934182  (2026-09-15 08:03:59–08:16:13 UTC, Commit 611a715, success)
```

`db0a22e` (der ZVG-Fix) ist Vorfahre von **beiden** Commits (`297c226` und
`bf0ddf1`, geprüft mit `git merge-base --is-ancestor`), der Codepfad war in
allen drei Läufen identisch aktiv. **Lauf `34797538466` hat diese drei
Zeilen zuerst geschrieben** — das ist ein echter Produktionsbeleg für den
ZVG-Zweig von A-4, nur eben nicht aus dem dafür ausgelösten Lauf.
`zvg_id=13233&land_abk=ni`, der dritte Fall aus A6, taucht hier nicht mehr
auf; an seiner Stelle steht jetzt `hb-4820` — der stehende Rückstand ist
also nicht dieselben drei IDs für immer, sondern ein driftender Bestand
ähnlicher Fälle (siehe „Auffälligkeiten" unten).

## Antwort auf die Prüffrage

**„Sind während dieses Laufs `listings`-Zeilen ohne `listing_versions`-Zeile
entstanden — und zwar bei BEIDEN Quellen?"**

- **Immowelt: JA**, direkt und lückenlos belegt (23 Zeilen, exakt
  deckungsgleich mit der Logzeile).
- **ZVG: NEIN**, nicht in diesem Lauf. Ursache ist gemessen, nicht vermutet:
  0 von 0 Detailkandidaten, weil der aktuelle ZVG-Bestand die Quelle
  praktisch vollständig abdeckt und keiner der aktuell gelisteten Termine
  neu oder veraltet war. Das ist **kein Fehler** — es ist der erwartbare
  Ruhezustand einer kleinen, langsam wechselnden Quelle in genau dem
  Moment, in dem kein neuer Problemfall auftaucht.

**Für A-4 insgesamt heißt das:** Der beauftragte Lauf allein belegt nur die
Immowelt-Hälfte. Die ZVG-Hälfte ist trotzdem **belegt** — durch einen
anderen echten Produktionslauf (`34797538466`) auf demselben Codestand
(`db0a22e` ist Vorfahre von dessen Commit `297c226` ebenso wie von
`bf0ddf1`). Beide Belege zusammengenommen zeigen: der Mechanismus schreibt
in Produktion für beide Quellen genau das, was der Code seit `ea8b731`
(Immowelt) bzw. `db0a22e` (ZVG) vorsieht. Was NICHT gezeigt ist: dass
**derselbe** Lauf beide Fälle gleichzeitig auslöst — das ist angesichts der
Größenordnungen (Immowelt: tausende Kandidaten je Lauf, typischerweise
einige Dutzend ohne Preis; ZVG: ein niedriger zweistelliger Bestand,
Kandidaten nur bei echten Neuzugängen) eher der Normalfall als eine Lücke.

## Nebenbefunde

### B-1 / A7b — streut die Detailbewertung über mehrere Regionen?

**Nicht geklärt durch diesen Lauf — strukturell nicht klärbar mit einem
einzigen Lauf dieser Art.** Der Immowelt-Sweep deckte in `34910160636` nur
**eine** Region vollständig ab: „Immowelt-Sweep: Regionen dieses Laufs --
by (1 von 16 abgearbeitet, 15 wegen Zeitbudget auf Folgelaeufe
zurueckgestellt)." Die Detailbewertung wählt ihre 600 Kandidaten aus dem,
was der Sweep **in diesem Lauf** gesehen hat (`scraper/main.ts`,
`budgetiereDetailKandidaten`) — und das waren ausschließlich die 4761
`by`-Karten. Die Kandidatenliste ist damit **per Konstruktion** einregional,
unabhängig davon, ob `streueAuswahl` (der A7b-Fix) funktioniert. Anders als
früher ist es aber nicht **immer dieselbe** Region (`nw`/`hb`): Die
Fortsetzungsrotation (B-1, seit 2026-09-09) wählt die am längsten nicht
gesweepte Region als Start, hier `by`. Ob sich das über mehrere Läufe
hinweg als „Streuung" liest, kann nur eine Serie von Läufen zeigen, nicht
dieser eine.

Ergänzend geprüft (auf Hinweis, unabhängig nachgerechnet über
`sweep_region_runs`, 2026-09-08 bis 2026-09-15, 187 Zeilen, source=immowelt):
**vier** Regionen tragen in **keiner** Zeile eine `gemeldete_treffer`-Zahl —
`nw` (16 Läufe), `bw` (13), `mv` (11), `sh` (10). Vorher war in
`ABNAHME-BASIS.md` (B-2) nur `mv` und `nw` dokumentiert; `bw` und `sh`
gehören jetzt nachweislich dazu. Das ist für A7b relevant, weil eine
Region ohne verifizierbare Vollständigkeit ohnehin nie als „vollständig
erfasst" in eine Streuungsaussage einfließen sollte — der Rahmen für eine
künftige A7b-Serienmessung müsste das berücksichtigen.

### D-5 — Meldebudget in diesem Lauf

```
Meldungen: 25 von hoechstens 25 gesendet, 39 wegen des Budgets auf
Folgelaeufe zurueckgestellt (sie gelten weiter als nie gemeldet und werden
nachgeholt).
```

25 = 23 `pruefkandidat` + 2 `preisaenderung` (beide zählen gegen dasselbe
Kontingent; die 5 `verschwunden`-Meldungen laufen daneben, ungedeckelt).
Zum Vergleich mit den beiden in `ABNAHME-BASIS.md` dokumentierten Läufen:

```
34630574787 (2026-09-11)   71 zurueckgestellt, 25/25 gesendet
34637349206 (2026-09-11)   47 zurueckgestellt, 25/25 gesendet
34910160636 (2026-09-14)   39 zurueckgestellt, 25/25 gesendet
```

Der fallende Trend setzt sich fort. Die zweite D-5-Frage (Mietquelle der
gesendeten Meldungen) wurde hier nicht erneut nachgemessen — das war nicht
Teil dieses Auftrags und stünde für sich.

## Auffälligkeiten (nur gemeldet, nicht behoben)

- **Der „stehende ZVG-Rückstand" ist kein fester Dreier.** A6 (2026-09-08)
  nannte `by-49119`, `ni-13233`, `nw-167869`. Aktuell (2026-09-15) steht
  `ni-13233` nicht mehr in der Liste, dafür `hb-4820`. Die Fälle driften —
  vermutlich weil einzelne Termine ablaufen und neue mit demselben
  Formatierungsproblem nachrücken. Wer A6 fortschreibt, sollte das nicht
  mehr als „immer dieselben drei IDs" beschreiben.
- **ZVG-Problemfälle werden nach dem ersten Schreiben nicht mehr erneut
  versucht**, bis sie „veraltet" sind (`ladeVeralteteExternalIds`). Das ist
  laut Docstring in `scraper/lib/db.ts` beabsichtigt (kein Budget für
  aussichtslose Wiederholungen), heißt aber auch: Ein Gericht, das den
  Verkehrswert doch noch nachträgt, wird nicht automatisch zeitnah erneut
  geprüft. Nicht gemessen, wie lang „veraltet" bei ZVG dauert.
- **`vollstaendig=true` trotz `gemeldete_treffer=null`** kam in
  `sweep_region_runs` mehrfach vor (`bw` 1×, `mv` 3×, `nw` 3×, `sh` 1×,
  `hb` 1× im Zeitraum 2026-09-08 bis 2026-09-15). Das berührt B-3
  (Löschwachen) nicht direkt, ist aber eine Kombination, die beim
  Dokumentieren von B-1/A7b auffiel und für sich eine eigene Nachprüfung
  verdient, falls die Vollständigkeitsaussage einmal für Löschentscheidungen
  bei diesen Regionen herangezogen werden soll.
