# Immowelt-Abgänge: warum nichts verschwindet, und welche Wege es gibt

> **Entstanden am 2026-09-08** als Entwurfsarbeit zu Abnahmekriterium B-2
> („Ein verschwundenes Immowelt-Objekt wird als verschwunden erkannt").
> Grundlage für [`BACKLOG.md`](../BACKLOG.md) B1 und A14. Alle Zahlen sind
> gemessen, nicht geschätzt; wo geschätzt wurde, steht es dabei.

## Stand der Daten

`listings` führt **1.915** Immowelt-Objekte (nicht mehr 754 — der Bestand
wächst seit dem Listen-Umbau schnell), davon **0 mit `disappeared_at`**. ZVG:
193 Objekte, 2 mit `disappeared_at`. In `notifications` steht **keine
einzige** Zeile `kind='verschwunden'`. B-2 ist nicht „selten", sondern
strukturell nie eingetreten.

## Fünf Sperren, nicht zwei

Der Pfad zu `disappeared_at` ist `main.ts:244 → ermittleAbgaenge →
markiereVerschwunden`. Davor liegen fünf Sperren, in Ausführungsreihenfolge:

**Sperre 0 — ein bisher unbekannter Fehler.** Siehe A14: `aktualisiereLastSeen`
schickt alle IDs in einem einzigen `.in("id", …)`; ab 642 IDs antwortet
PostgREST mit `Bad Request`. Im Lauf `34230052647` ist der gesamte
`gleicheBestandAb` für Immowelt daran abgebrochen — samt der zweiten
unabhängigen Wache vor der harten Löschung.

**Sperre 1 — `vollstaendig` ist für Immowelt hart verdrahtet `false`**
(`scrapers/immowelt/index.ts:507`). `pruefeMengenplausibilitaet` gibt darauf
sofort `loeschenErlaubt=false` zurück (`lib/plausibilitaet.ts:56–58`), und
`main.ts:224` verlässt die Funktion still, weil `strukturellTeilweise=true`
ist. **`ermittleAbgaenge` wird für Immowelt nie aufgerufen.** In jedem Lauf
wörtlich nachlesbar: `immowelt: Loeschung ausgesetzt (strukturell teilweise,
erwartet) — Sweep war unvollständig.`

**Sperre 2 — die Referenzhistorie ist leer.** `ladeSweepHistorie` filtert
`.eq("vollstaendig", true)` (`bestandDb.ts:241`). Alle 13 Immowelt-Zeilen in
`sweep_runs` tragen `vollstaendig=false` → `historie=[]` → `0 <
MIN_REFERENZLAEUFE=3`. Würde man Sperre 1 heute umlegen, blieben mindestens
drei weitere Läufe blockiert.

**Sperre 3 — der Mengenmaßstab existiert nicht.** `gemeldeteTreffer` ist in 4
von 5 aktuellen Läufen `null`, und die eingesammelte Menge schwankt je nach
Rotationsausschnitt zwischen 3.361 und 9.329 — Faktor 2,8. Eine Medianprüfung
mit 25 % Toleranz schlägt hier fast immer an.

**Sperre 4 — `partitionAusExternalId` liefert `null`** (`lib/bestand.ts:62`).
Selbst mit offenen Sperren 0–3 findet `imGeltungsbereich` für jede
Immowelt-UUID `null` und gibt `false` zurück → null Abgänge.

## Drei Fail-open-Stellen, die jeder Umbau zuerst schließen muss

Das System ist heute auf allen Pfaden fail-closed — aber nur, weil Sperre 1
alles vorher abfängt. Fällt sie, greifen drei Stellen, die einen unbekannten
Zustand als „in Ordnung" lesen:

1. **`bestand.ts:78`** — `if (sweep.geltungsbereich.length === 0) return true`.
   Für eine unpartitionierte Quelle heißt „kein Land vollständig" dort
   **„voller Geltungsbereich"**. Ein Lauf ohne eine einzige vollständige
   Region gäbe damit den ganzen Bestand zum Abgleich frei. Diese Zeile **muss**
   fallen, bevor Immowelt regionsgenau löschen darf.
2. **`istRegionVollstaendig` (`immowelt/index.ts:146`)** gibt bei
   `gemeldet === null` **`true`** zurück. Und die Trefferzahl aus dem
   Seitentitel (`:307`) ist ausgerechnet für **`nw`, `bw` und `mv`** `null` —
   5 von 21 Regionsläufen, darunter die beiden größten Regionen. Solange das
   so ist, ruht die Vollständigkeit der größten Region auf „mehr als null
   Karten".
3. **`loescheAbgelaufene` (`bestandDb.ts:155–172`) filtert nicht nach
   `source`.** Wer heute Immowelt-Objekte markiert, löscht sie zwei Tage
   später automatisch mit. Das muss vor der ersten Markierung quellenfest
   werden.

## Gibt es überhaupt Objekte, die verschwunden sein müssten?

**Nicht messbar — wegen Sperre 0.** Der einzige Vergleich, der es gezeigt
hätte, ist genau der abgestürzte `last_seen`-Abgleich. 560 `nw`-Objekte tragen
`last_seen = 2026-09-08T11:11:28`, obwohl `nw` 2,5 h später erneut vollständig
gesweept wurde. Ob sie fehlten oder ob nur der Abgleich abstürzte, lässt sich
aus den Daten nicht trennen.

Sicher ist: **157 Objekte (8,2 %) haben `fundort is null`** — Altbestand aus
der Detailseiten-Ära, sechs davon seit 2026-09-07 unberührt bei elf Sweeps.
Sie sind unter *keiner* regionsgenauen Regel je löschbar oder markierbar.

## Die Rotation: validiert, und der Grund für die Langsamkeit

`rotiereAuswahl(16 Codes, 16, versatz)` mit `versatz = floor(Date.now()/3.6e6)`
ergibt den Startindex `versatz % 16` in der festen Reihenfolge
`nw,by,bw,ni,rp,he,sn,sh,br,st,th,sl,mv,be,hh,hb`. Gegen fünf Läufe geprüft,
**fünf von fünf treffen** — das Modell stimmt.

**Der strukturelle Kern:** `SWEEP_BUDGET_MS` = 12 min, die Wache steht *vor*
dem Start einer Region, die erste Region läuft immer durch. `nw` braucht
allein 173 Seiten ≈ 33 min, `bw` 122 Seiten ≈ 20 min. **Ein Lauf, der auf
einer großen Region startet, schafft genau diese eine Region** (Beleg: der
Lauf 18:10 sweepte nur `bw`). Jede der acht großen Regionen ist damit
praktisch nur von **einem einzigen der 16 Startindizes** aus erreichbar — und
der Startindex ist die Uhrzeit, nicht ein Fortschrittszeiger.

Gemessene Lauffrequenz: 14 Läufe in 70,1 h = **5,4 h je Lauf** (bestätigt
A10).

**Monte-Carlo über 3.000 Durchläufe** mit echtem Cron, 57 % Ausführungsquote,
Verspätung 8–171 min, gemessenen Regionsgrößen (für die sechs nie gesweepten
Länder geschätzt, kalibriert auf ~885 Seiten bundesweit), 14 %
Regions-Ausfallquote und dem heutigen Ist-Stand als Start:

| Rotation | Cron | Median bis 3 Referenzläufe je Region | 90. Perzentil |
|---|---|---|---|
| heute (Uhr) | 3 h | **13,1 Tage** | 20,2 |
| Fortsetzung | 3 h | **5,7 Tage** | 7,6 |
| Uhr | 1 h | 4,2 Tage | 6,8 |
| Fortsetzung | 1 h | 1,9 Tage | 2,6 |

Empfindlichkeit gegen die Größenschätzung: Median 8 bis 16 Tage. Langsamste
Regionen `ni` und `rp`.

**Zwei Folgerungen.** Erstens: B1 ist in **Wochen** erreichbar, nicht in
Monaten — die Sorge aus der Übergabe ist entkräftet. Zweitens: Die
Fortsetzungsrotation (Startindex aus `sweep_region_runs` fortschreiben statt
aus der Uhr) **halbiert die Zeit ohne einen einzigen zusätzlichen Abruf** und
macht sie planbar. Das ist der billigste Hebel im ganzen Problem — und sie
macht bei 3 h fast so schnell abdeckend wie ein Stunden-Cron heute.

Was bleibt, ist die **Löschlatenz**: Im 30-Tage-Ausschnitt bekommt `ni` 9,
`bw` 10 vollständige Läufe — ein Löschfenster je 3 Tage, plus `KARENZ_TAGE=2`.
`nw` dagegen alle 15 h.

## Optionen

| # | Option | Aufwand | Schlimmster Fall | Abrufrate | Voraussetzung |
|---|---|---|---|---|---|
| **0** | `.in()`-Batching reparieren (A14) | ½ Tag | 0 (senkt Risiko) | ±0 | keine |
| **1** | Fortsetzungsrotation + Trefferzahl absichern | 1–2 Tage | 0 (löscht nicht) | ±0 | Opt. 0 |
| **2** | B1: regionsgenaues Löschen | 4–6 Tage + 6–13 Tage Wartezeit | **bis 6.900 Objekte** | ±0 | Opt. 0+1 |
| **3** | Markieren ohne Löschen | 2–3 Tage | **0** | ±0 | Opt. 0+1 |
| **4** | Alters-/Frischemerkmal statt Abgangsbegriff | 1 Tag | **0** | ±0 | Opt. 0 |
| **5** | Gezielte Nachprüfung je Objekt | — | — | +1 je Objekt | **scheitert an 403** |

**Option 2 ist das bezifferte Risiko.** Im Lauf 13:07 lieferte `be` **40 von
gemeldet 420** Objekten — abgefangen *nur*, weil `be`s Trefferzahl parste. Bei
`nw` parst sie nicht. Ein Lauf, der `nw` soft-geblockt mit einer Karte
einsammelt, gilt heute als vollständig; alle übrigen `nw`-Objekte wären
Abgänge: heute **1.160**, am Sättigungspunkt **~6.900**. Selbst mit
reparierter Trefferzahl erlaubt die 25-%-Toleranz einen Lauf mit 75 %
Ausbeute — **bis zu 1.724 echte Objekte** in einem Zug.

**Option 3 ist derselbe Code mit abgeschaltetem letztem Schritt.**
`disappeared_at` regionsgenau setzen, die harte Löschung für
`source='immowelt'` unterbinden, das Dashboard graut markierte Objekte aus —
was B2 ohnehin verlangt. Ein Rückkehrer hebt die Markierung auf;
`ermittleRueckkehrer` (`bestand.ts:119`) tut das schon heute und braucht dafür
ausdrücklich **keinen** vollständigen Sweep. Ein Fehlurteil kostet ein paar
Tage graue Darstellung statt tausender Zeilen.

**Option 5 scheidet aus**, nicht aus Kostengründen: `/expose/` antwortet von
Rechenzentrums-Adressen mit HTTP 403 und CAPTCHA, während `/suche/` in
derselben Sitzung 200 liefert. Und ein 403 lässt sich nicht von „Objekt weg"
unterscheiden — genau die Sorte Fehlschluss, die dieses Projekt dreimal teuer
bezahlt hat.

**Zur Abrufrate:** Die Optionen 0–4 ändern **keinen einzigen Abruf**. Weder
die 5-s-Drossel noch die Seitenzahl je Lauf werden angefasst.

## Empfehlung

**Option 0 → Option 1 → Option 3. Option 2 nicht als eigenes Ziel.**

Option 0 ist ein echter Fehler, der heute schon eine Sicherheitswache stumm
ausfallen lässt — er gehört repariert, gleich welchen Weg man danach wählt.
Option 1 kostet nichts, halbiert die Wartezeit und schließt die gefährlichste
Lücke. Danach erfüllt Option 3 das Kriterium B-2 wörtlich — „wird als
verschwunden **erkannt**", nicht: gelöscht — und liefert dem Dashboard genau
das, was B2 verlangt. Die harte Löschung lässt sich später ergänzen, wenn die
Markierungen zwei Wochen lang beobachtet wurden. Umgekehrt geht es nicht:
gelöschte Zeilen sind weg.

## Offene Entscheidungsfragen an den Nutzer

1. **Gilt B-2 als erfüllt, wenn ein verschwundenes Objekt zuverlässig
   markiert und ausgegraut wird, ohne je gelöscht zu werden?**
2. **Wie viele fälschlich markierte Objekte sind akzeptabel, solange sie nur
   ausgegraut werden — und ab wann soll eine harte Löschung nachgezogen
   werden?**
3. **Darf ein Abgang in `by`, `bw`, `ni`, `rp` bis zu 3 Tage unbemerkt
   bleiben**, während `nw` alle 15 h geprüft wird — oder soll die Rotation die
   großen Länder bevorzugt bedienen?
4. **Bleibt der Cron bei 3 Stunden?** Mit der Fortsetzungsrotation deckt er
   fast so schnell ab wie ein Stunden-Cron heute, ohne zusätzliche Abrufe. Ein
   dichterer Cron wäre dann nur noch ein Mittel gegen die 43 % ausgefallenen
   Termine (A10), nicht gegen die Abdeckung.
5. **Was geschieht mit den 157 Objekten ohne `fundort`?** Sichtbar als
   „Herkunft unbekannt" stehenlassen, oder einmalig verwerfen? Letzteres wäre
   ein Schreibzugriff auf Produktionsdaten und braucht eine ausdrückliche
   Freigabe.
