# Snapshot-Export (Dashboard-Entwurf, Abschnitt 9, Schritt 3)

Zweig `sdd/snapshot-export`, abgezweigt von `main` = `0db7622`.
Grundlage: `docs/superpowers/specs/2026-09-15-dashboard-nachtrag-oberflaeche.md`
(N1, N1.1, N2, N4) und `2026-09-09-dashboard-entwurf.md` (3.3, 3.5, 3.7, 5.3,
6.3, 6.4, 8, 9).

**Harte Anforderung: Der Export liest, er schreibt nie** — kein `update`, kein
`insert`, kein `delete` gegen die Datenbank. Geschrieben wird genau eine
Datei im Dateisystem.

---

## Bauform

Dieselbe Trennung wie `bestand.ts` / `bestandDb.ts`:

| Datei | Inhalt |
|---|---|
| `lib/snapshot.ts` | **reine Funktionen.** `baueSnapshot(eingabe, jetzt)` und alles, was dort hineingeht. Kein Supabase, kein Netz, kein `new Date()`. |
| `lib/snapshotDb.ts` | Ladeschicht (Keyset-Blätterung) und das Schreiben der Datei. |
| `main.ts` | Aufruf am Ende des Laufs, hinter dem Lösch-Block. |

Der Testschwerpunkt liegt auf `snapshot.ts`, mit Fixtures und ohne Datenbank.

---

## Messung vom 2026-09-15 — `sweep_region_runs` (nur lesend)

Skript: `scraper/scripts/messung-regionskadenz.mts` (**committet**, nicht in
einem git-ignorierten Verzeichnis — Entwurf 13.8 hat eine halbe
Korrekturrunde verloren, weil genau so ein Messskript mit der Sitzung
verschwand und die Zahl danach nicht mehr nachvollziehbar war).

```
sweep_region_runs: 171 Zeilen, 2026-09-08 bis 2026-09-15 (sieben Tage)
nur `immowelt`; von `zvg-portal` steht dort KEINE einzige Zeile

quelle/region  laeufe  davon vollst.  mit gemeldete_treffer  medianAbstand(vollst.)
immowelt/be        10              4                     10        1.85
immowelt/br        11              6                     11        1.20
immowelt/bw        12              1                      0         NaN
immowelt/by        11              6                     11        1.13
immowelt/hb        11              6                     10        0.77
immowelt/he         9              4                      9        1.79
immowelt/hh        10              5                     10        1.63
immowelt/mv        10              3                      0        0.36
immowelt/ni         9              4                      9        1.77
immowelt/nw        15              3                      0        0.44
immowelt/rp         9              4                      9        1.56
immowelt/sh         9              1                      0         NaN
immowelt/sl        12              6                     11        1.27
immowelt/sn         9              4                      9        1.43
immowelt/st        12              7                     12        0.90
```

### Nebenbefund: `sh` weist seine Trefferzahl ebenfalls nicht aus

A15 und der Kommentar an `istRegionVollstaendig`
(`scrapers/immowelt/index.ts`) nennen **drei** Regionen ohne Trefferzahl:
`nw`, `bw`, `mv`. Gemessen am 2026-09-15 ist **`sh` die vierte**: 0 von 9
Zeilen tragen `gemeldete_treffer`. Einzelzeilen nachgesehen — durchgehend
`gemeldet=null`, kein einzelner Ausreißer.

**Folge für den Bau:** Eine fest verdrahtete Liste `["nw","bw","mv"]` wäre
schon beim Schreiben veraltet gewesen. Welche Region keine Vollständigkeit
belegen kann, wird deshalb **aus den Daten abgeleitet**, nicht aufgezählt.

### Die `vollstaendig=true`-Zeilen von `nw`, `bw`, `mv`, `sh` sind Altlast

Sie stammen alle vom 2026-09-08/09, also von **vor** der
Fail-closed-Umstellung von `istRegionVollstaendig` (`gemeldet === null`
→ `false`). Seit dem 2026-09-09 ist keine dieser vier Regionen mehr
`vollstaendig`. Ein Kadenzverfahren, das nur „zähle die vollständigen Läufe"
macht, bekäme für `nw` aus drei Altzeilen eine Kadenz von 0,44 Tagen — und
erklärte damit den ganzen NRW-Bestand zu „verfügbar". Genau die
Fail-open-Bauart, die dieses Projekt viermal geschlossen hat.

---

## Entscheidung 1 — Wie die Regionskadenz geschätzt wird

`bestimmeVerfuegbarkeitszustand` verlangt `kadenzTageDerRegion: number | null`.
Das Nachschlagen war bewusst aus `ranking.ts` herausgehalten.

**Verfahren** (`schaetzeRegionsKadenzen` in `lib/snapshot.ts`), je Paar
`(source, partition)`:

1. Nur **vollständige** Läufe (`vollstaendig === true`) zählen. Ein Teillauf
   sagt nichts darüber, wie oft eine Region ganz gesehen wird.
2. Weniger als **drei** vollständige Läufe → `null`. Zwei Läufe ergeben genau
   einen Abstand; daraus einen „typischen" Abstand zu bilden ist keine
   Schätzung, sondern eine Behauptung. (`bw`, `sh` fallen hier heraus.)
3. Kadenz = **Median** der Abstände zwischen aufeinanderfolgenden
   vollständigen Läufen, in Tagen. „Typischerweise" aus dem Auftrag — der
   Median ist gegen den einen ausgefallenen Cron-Termin unempfindlich, das
   arithmetische Mittel nicht (43 % Ausfall, A10).
4. **Aktualitätsprobe, und das ist der fail-closed-Teil:** Liegt der letzte
   vollständige Lauf länger als das **Doppelte** der geschätzten Kadenz
   zurück, ist die Schätzung durch die Gegenwart widerlegt → `null`. Der
   Faktor 2 ist derselbe, den `bestimmeVerfuegbarkeitszustand` für Objekte
   benutzt; er wird hier nicht neu erfunden, sondern aus `ranking.ts`
   importiert wäre schöner — er ist dort privat, deshalb steht er in
   `snapshot.ts` mit Begründung als eigener benannter Wert und wird im
   Bericht gemeldet.
5. Jedes nicht-endliche Ergebnis (`NaN`, `Infinity`) → `null`. Ein `NaN`, das
   als Zahl durchrutscht, wäre schlimmer als `null`: In
   `bestimmeVerfuegbarkeitszustand` ist `alterMs > NaN` immer `false`, das
   Objekt gälte still als „verfügbar".

Gegenprobe an den Messdaten: `nw` (Median 0,44 d, letzter vollständiger Lauf
5,7 d her) → `null`. `mv` (0,36 d / 6,0 d) → `null`. `bw`, `sh` (ein Lauf) →
`null`. `by` (1,13 d / Stunden her) → 1,13 d. Das Verfahren erkennt die vier
Regionen ohne Trefferzahl also **ohne sie zu kennen**.

**Was das Verfahren nicht hergibt:** sieben Tage Historie, 171 Zeilen, eine
einzige Quelle. Das steht als Kasten an der Funktion, damit die Zahl nicht
als gemessen durchgeht.

**`zvg-portal` hat in `sweep_region_runs` keine einzige Zeile** → Kadenz für
jedes ZVG-Objekt `null` → Zustand „unbestätigt". Das ist streng, aber es ist
die Regel: kein Beleg, keine Behauptung.

---

## Entscheidung 2 — Klartext-Grund für Objekte ohne Version

Offener Punkt aus Entwurf 3.3 / Abschnitt 9, Schritt 3.

Neuer Lückencode **`preis_fehlt`**, Klartext
**„Preis fehlt — die Quelle nennt keinen verwertbaren Kaufpreis"**, eingetragen
in `DATA_GAP_LABELS` (`lib/telegram.ts`), damit es **eine** Tabelle für
Klartext-Gründe gibt und nicht zwei.

- **Name** parallel zu den zwei vorhandenen `*_fehlt`-Codes
  (`wohnflaeche_fehlt`, `plz_fehlt`).
- **Warum nicht `preis_auf_anfrage` / `preis_unlesbar` getrennt:** Welcher der
  beiden Fälle vorliegt, steht **nicht in der Datenbank**. Die Unterscheidung
  trifft `ermittleLueckencodeOhnePreis` aus der Titelzeile und lebt nur in der
  Log-Zeile des Laufs (A13). Eine `listings`-Zeile ohne Version trägt sie
  nicht. Der Export dürfte also raten oder schweigen — und rät nicht. Der
  Klartext nennt deshalb die gemeinsame Aussage beider Fälle und behauptet
  keine Ursache.

---

## Entscheidung 3 — Die Schwellen werden importiert, nicht abgeschrieben

N1.1 verlangt für `top`: Meldeschwelle an der **unteren Bandkante**
(`band.unten >= 1,3`, bei S3 ohne Band der Punktwert) **und** Kaufpreisfaktor
zwischen 3 und 15.

Von den drei Zahlen war bisher nur die 3 als Name exportiert
(`MIN_PLAUSIBLER_KAUFPREISFAKTOR`). 15 und 1,3 standen als **Literale** in
`topTreffer` (`metrics.ts`). Statt sie in `snapshot.ts` abzuschreiben —
„zwei Kopien derselben Zahl waren in diesem Projekt schon einmal der Fehler" —
bekommen sie in `metrics.ts` einen Namen
(`MAX_PLAUSIBLER_KAUFPREISFAKTOR`, `DSCR_MELDESCHWELLE`), werden dort in
`topTreffer` benutzt und von `snapshot.ts` importiert. Reiner Umbau, kein
Verhalten geändert.

`ranking.ts` trägt eine **private zweite** `DSCR_MELDESCHWELLE`. Die bleibt
unangetastet: Sie steht bereits als Befund in BACKLOG A17, und an `ranking.ts`
arbeitet parallel ein zweiter Agent. Gemeldet, nicht heimlich mitgeändert.

**Warum `finanzierungsrisiko` in der Trefferklasse fehlt:** Entwurf 2.2 rechnet
vor, dass es nur unterhalb von DSCR ≈ 0,81…0,84 greift und bei geforderten
DSCR ≥ 1,3 nie die bindende Bedingung sein kann.

---

## Entscheidung 4 — Woher die Jahreskaltmiete kommt

`bewerteFuerRangliste` braucht einen `KennzahlenInput`, also eine
Jahreskaltmiete. Sie steht nicht als Spalte in `listing_versions`.

Sie wird mit **`ermittleJahreskaltmiete`** neu gerechnet — derselben
Funktion, die die Pipeline benutzt, aus denselben gespeicherten Feldern
(`rent_cold_monthly_cents`, `living_area_m2`, `zip_code`, `bundesland`).
Verworfen: die Miete aus dem gespeicherten `metrics`-JSON zurückrechnen
(`kaufpreis / kaufpreisfaktor`) — das hängt an einem Gleitkomma-Rückweg und
bricht bei Miete 0.

**Fail-closed-Zusatz:** Für die Sicherheitsstufe zählt die **ungenauere** von
gespeicherter `rent_source` und neu ermittelter Mietquelle. Grund: Die Stufe
wählt die Bandbreite. Stünde gespeichert `geschaetzt_regional` (S2, ±23,7 %),
während die Miete heute bundeslandgenau entsteht (S1, in Bayern −34,8 %…
+67,1 %), bekäme das Objekt ein zu schmales Band — und ein zu schmales Band
kann einen `top`-Treffer erzeugen, den die Datenlage nicht trägt.

---

## Entscheidung 5 — Betriebsdaten (Abschnitt 8)

| Größe | Quelle | im Export |
|---|---|---|
| `regionsstand` | `sweep_region_runs`, jüngste Zeile je Region | **ja**, vollständig aus der Datenbank |
| `uebersprungeneJeLauf` | nur im **Lauf-Log** (`ermittleLueckencodeOhnePreis` über die Titelzeile) | nur wenn `main.ts` sie hereinreicht, sonst **`null`** |
| `meldebudget` | nur im `Meldebudget`-Objekt des Laufs | nur wenn `main.ts` es hereinreicht, sonst **`null`** |

Die beiden letzten sind **Laufkennwerte, keine gespeicherten Daten**. Ein
Export außerhalb eines Laufs kann sie nicht kennen; er schreibt dann `null`
und nicht `0`. `0` hieße „nichts übersprungen / nichts gemeldet" — eine
Behauptung aus Nichtwissen.

---

## Entscheidung 6 — Auslegung der Kopfzeile (N4 / Entwurf 3.9)

- `mitBelegterMiete` = Objekte mit `rent_source = 'angegeben'` (jüngste
  Version), unabhängig von S0.
- `anteilBundeslandgenau` = Anteil der Objekte mit `rent_source ∈
  {geschaetzt_bundesland, geschaetzt_bundesweit}` an **allen** Objekten (die
  „98,0 % roh" aus 3.1). Das ist die dritte Aussage aus 3.9 und **nicht** der
  Ortsanteil aus N2 — der Name ist missverständlich, die Herkunft nicht.
- `topTrefferSeit` = ältestes `listings.first_seen` im Bestand, also der
  Beginn des Beobachtungsfensters, auf das sich die Aussage „*n* Top-Treffer
  seit …" bezieht. `null`, wenn kein Objekt ein `first_seen` trägt.

---

## Verlauf

### TDD-Zyklen (jeder zuerst rot gesehen)

| # | Test zuerst | rote Ausgabe |
|---|---|---|
| 1 | `schaetzeRegionsKadenzen` / `kadenzFuerRegion` | `Error: Failed to load url ./snapshot.js … Does the file exist?` |
| 2 | `waehleJuengsteVersionen`, `zuListingZeile`, `zuVersionZeile` | `TypeError: zuVersionZeile is not a function` — 6 failed \| 7 passed |
| 3 | `bestimmeTrefferklasse` | `TypeError: bestimmeTrefferklasse is not a function` — 5 failed \| 13 passed |
| 4 | `baueSnapshot` | `TypeError: baueSnapshot is not a function` — 10 failed \| 18 passed |
| 5 | `schreibeSnapshot` | `Error: Failed to load url ./snapshotDb.js … Does the file exist?` |

### Echter Export vom 2026-09-15, 09:18 UTC (Gegenprobe, nur lesend)

Skript `scraper/scripts/messung-snapshot-groesse.mts` (committet).
Geladen in **7,4 s**: 17.754 `listings`, 27.438 `listing_versions`, 187
`sweep_region_runs`.

**Dateigröße gemessen — N4s 6–10 MB waren zu niedrig:**

| | Bytes | |
|---|---:|---|
| unkomprimiert | 19.184.778 | **18,30 MB**, 1.081 B je Objekt |
| gzip -9 | 2.279.122 | 2,17 MB |
| brotli | 1.681.834 | 1,60 MB |

**Nicht geteilt** (N4: „erst messen, dann teilen"). Über die Leitung sind es
2,2 MB; Cloudflare Pages komprimiert selbst. Der größte Einzelposten ist
messbar und benannt: `url` trägt **32,2 % der Datei (5,89 MB)**, davon
**4,73 MB allein der Query-String** der Immowelt-Trefferlisten-URL
(`?serp_view=list&search=distributionTypes%3D…&page%3D123…`). Ihn zu kürzen
wäre der erste Hebel, noch vor jeder Teilung — aber es ist eine
Produktentscheidung (bleibt der Link ohne ihn gültig?), keine Messfrage, und
deshalb hier **nicht** eigenmächtig gemacht.

**Die Zahlen des Exports:**

```
kopfzeile   objekteGesamt 17754, mitBelegterMiete 1,
            anteilBundeslandgenau 0,9759, topTrefferSeit 2026-09-05T17:52Z
stufe       S1 15.975 | S0 1.710 | S2 68 | S3 1
trefferkl.  normal 15.240 | top 804 | nichtBeurteilbar 1.710
zustand     verfuegbar 9.017 | unbestaetigt 8.318 | abgaengig 419
quelle      immowelt 17.552 | zvg-portal 202
ohne Version 190   mit PLZ 242   ohne Bundesland 196
Schwellenwechsler 3.907 von 16.044 bewertbaren = 24,4 %
```

**Drei Gegenproben, die stimmen:**

1. `mitBelegterMiete = 1` — genau die Zahl aus M3 (Entwurf 3.1/3.3).
2. Schwellenwechsler **24,4 %** — M5 hat 25,0 % gemessen, unabhängig
   nachgerechnet über eine andere Codebasis.
3. Der Zustand `unbestaetigt` trifft **8.318** Objekte. Zusammengezählt:
   `nw` 4.173 + `bw` 2.821 + `sh` 728 + `mv` 236 + ZVG 202 + ohne Bundesland
   196 ≈ 8.356. Das Kadenzverfahren hat also **genau die vier Regionen ohne
   Trefferzahl herausgegriffen, ohne sie zu kennen**, und dazu die Quelle ohne
   Regionshistorie.

### Offene Punkte, die NICHT zu diesem Schritt gehören

- **„804 Top-Treffer" gegen „0 Top-Treffer".** Entwurf 3.9 formuliert die
  Kopfzeile als *„0 Top-Treffer seit dem 2026-09-07"*. Das ist die
  **Meldeklasse** aus `bestimmeMeldeklasse` (die geschätzte Mieten
  grundsätzlich herunterstuft), nicht die **Trefferklasse** aus N1.1. Der
  Snapshot liefert 804 `top`. Beide Zahlen sind richtig und messen
  Verschiedenes; welche in der Kopfzeile steht, entscheidet Schritt 4.
- **Die Karenzgrenze aus 6.4** (innerhalb der Karenz an der Rangposition,
  danach in den Bereich „Abgänge") ist in N4 kein Feld. Der Snapshot liefert
  `abgaengigSeit`; die Grenze zieht die Oberfläche mit `KARENZ_TAGE`.
  Bewusst kein erfundenes Feld.
- **`ranking.ts` trägt eine zweite, private `DSCR_MELDESCHWELLE`** (BACKLOG
  A17). Nicht angefasst, weil dort parallel gearbeitet wird.
- **ZVG-Zeilen ohne Verkehrswert** zählen nicht in
  `betrieb.uebersprungeneJeLauf` mit: Welchem der beiden Codes
  (`preis_auf_anfrage` / `preis_unlesbar`) sie entsprächen, ist nicht
  entschieden, und die Zuordnung wäre geraten.
