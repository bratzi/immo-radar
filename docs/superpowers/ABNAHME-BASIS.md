# Abnahme: Wann steht die Basis?

> **Zweck.** Der Nutzer hat am 2026-09-08 entschieden: *„Die Basis muss vorher
> stehen, bevor die Webseite und Dashboard aufgebaut wird. Ich möchte einen
> sauberen Lauf sehen inklusive Telegram Nachrichten. […] Auch die
> Plausibilität bezüglich Miete und so weiter muss auch geprüft werden."*
>
> Dieses Dokument macht daraus prüfbare Kriterien. Ohne sie ist „die Basis
> steht" eine Meinung. **Jedes Kriterium wird an einem echten Produktionslauf
> belegt, nicht an Tests.**

## Warum das nicht dasselbe ist wie „der Lauf ist fehlerfrei"

Lauf `34261364448` (2026-09-08, 18:09–18:35 UTC) lief technisch sauber durch:
keine Ausnahme, alle Phasen, `Lauf abgeschlossen`. Trotzdem trägt die Basis
nicht — er erfasste **1 von 16** Bundesländern, für Immowelt wurde wie in
jedem Lauf **nicht gelöscht**, und alle Kennzahlen standen auf einer
geschätzten Miete. Fehlerfreiheit ist nicht Belastbarkeit.

---

## A — Der Lauf

| # | Kriterium | Stand |
|---|---|---|
| A-1 | Läuft ohne Ausnahme durch, endet mit `Lauf abgeschlossen` | **erfüllt** — zuletzt `34278399926` (2026-09-08, 21:03–21:29 UTC, 25 min, `conclusion=success`) |
| A-2 | Keine Meldung im Log behauptet eine Ursache, die nicht gemessen ist | **erfüllt** seit `ea68fbf` |
| A-3 | Der Cron liefert verlässlich Läufe | **offen** — 43 % der Termine fallen aus (A10) |
| A-4 | Kein Objekt fällt still aus dem Radar | **offen** — der stille `continue` bleibt; die Ursache ist aber vermessen: „Preis auf Anfrage" der Quelle, kein Parserfehler, und die Quote misst die Region (A13) |

## B — Abdeckung und Bestand

| # | Kriterium | Stand |
|---|---|---|
| B-1 | Jedes der 16 Bundesländer war mindestens einmal erfasst | **offen** — `34278399926` schaffte nur `he` und `sn` (2 von 16); gerechnet: mit der heutigen Uhr-Rotation 13 Tage bis zur vollen Abdeckung, mit einer Fortsetzungsrotation 5,7 — ohne zusätzliche Abrufe |
| B-2 | Ein verschwundenes Immowelt-Objekt wird als verschwunden erkannt | **offen** — 0 von inzwischen 1.915 haben `disappeared_at`; fünf Sperren stehen davor, die erste ist der Fehler A14. Entwurf mit Optionen liegt vor (`specs/2026-09-08-immowelt-abgaenge-optionen.md`) |
| B-3 | Die Löschwachen bleiben fail-closed | **erfüllt**, muss bei jeder Änderung erneut gelten |

## C — Die Zahlen

| # | Kriterium | Stand |
|---|---|---|
| C-1 | Die Mietschätzung ist gegen eine belegbare Quelle geprüft | **geprüft und belegt im Code** — gegen Zensus 2022/BBSR: n = 23, Median −11,4 %, 17/23 innerhalb ±15 %; Herkunft und Prüfstand stehen jetzt über der Tabelle. Offen bleibt nur der dauerhafte Test gegen INKAR (A11 Schritt 3) |
| C-2 | Bekannt ist, wie stark eine falsche Miete die Meldeschwelle verschiebt | **erfüllt** — ±30 % Miete verschieben 278 bzw. 280 von 1.879 Meldeklassen (14,8 / 14,9 %), 558 (29,7 %) irgendwo im Band (A11) |
| C-3 | Unplausible Zahlen erzeugen keine Meldung, bleiben aber sichtbar | **erfüllt** seit `64de963` / `d43637b` |
| C-4 | Kein gespeicherter Wert ist offensichtlich unmöglich | **erfüllt** — Stichprobe über alle 2.864 Versionen, kein absurder Wert aktuell |

## D — Die Meldungen

| # | Kriterium | Stand |
|---|---|---|
| D-1 | Belegt, dass Telegram die Nachrichten angenommen hat | **erfüllt** — Lauf `34278399926`: 25 Zeilen mit `runId`, **0 ohne `telegramMessageId`**, IDs 1796–1820 lückenlos, deckungsgleich mit `Meldungen: 25 von hoechstens 25`. Sechs Tests, zwei Sabotageproben (A12) |
| D-2 | Der Nachrichtentext nennt die Datenlücken im Klartext | **erfüllt** seit `d6c4cc1` |
| D-3 | Die Formatierung bricht nicht bei fehlenden Feldern | **erfüllt** seit `d6c4cc1` |
| D-4 | Jede Meldung nennt Bundesland und Ort; fehlende PLZ ist sichtbar | **erfüllt** seit `d6c4cc1` |
| D-5 | Das Meldebudget ist nicht dauerhaft ausgeschöpft | **offen** — auch `34278399926`: `25 von hoechstens 25`, 117 zurückgestellt. Der Rückstand hängt an A11 Schritt 4 (dürfen bundeslandgenaue Schätzungen überhaupt melden?) |

### So sieht eine Meldung seit `d6c4cc1` aus

Aus echten Daten des Laufs `34261364448` nachgebaut:

```
🔍 PRÜFKANDIDAT
🏠 Mehrfamilienhaus zum Kauf - Jungingen - 364.000 € - 7,5 Zimmer, 260,9 m², 763,3 m² Grundstück
📍 Jungingen · Baden-Württemberg

💰 Kaufpreis 364.000 €
📊 Faktor 9,3 · DSCR 1,30
🔑 Einheiten unbekannt · Miete geschätzt (Bundesland)

Faktor und DSCR beruhen auf einer geschätzten Miete — vor einer Entscheidung selbst prüfen.

⚠️ Fehlende Angaben: Einheiten nicht bestätigt, Miete nur bundeslandweit
   geschätzt, PLZ fehlt (Immowelt nennt sie in der Ergebnisliste nicht)

🗺 Karte  ·  🔗 Zum Inserat
```

Vorher stand dort `📍  Jungingen` mit doppeltem Leerzeichen, kein Bundesland,
und in der Lückenzeile roher Maschinencode (`miete_nur_bundeslandgenau`,
`geschaetzt_bundesland`).

---

## Erst danach: das Dashboard

`BACKLOG.md` B2. Die wichtigste Entwurfsfrage steht schon fest und ist durch
die Messungen dieser Sitzung schärfer geworden: **Seit dem 2026-09-07 um 05:43
ist kein einziger `top_treffer` versandt worden.** Alle 42 Treffer des letzten
Laufs beruhen auf geschätzter Miete, im ganzen Bestand tragen zwei Objekte
eine belegte. Ein Ranking, das Nichtwissen wie Wissen sortiert, wäre wertlos —
diese Frage gehört vor die erste Zeile Frontend-Code.
