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
| A-1 | Läuft ohne Ausnahme durch, endet mit `Lauf abgeschlossen` | **erfüllt** (34261364448) |
| A-2 | Keine Meldung im Log behauptet eine Ursache, die nicht gemessen ist | **erfüllt** seit `ea68fbf` |
| A-3 | Der Cron liefert verlässlich Läufe | **offen** — 43 % der Termine fallen aus (A10) |
| A-4 | Kein Objekt fällt still aus dem Radar | **offen** — 39 von 600 ohne Preis, stiller `continue` |

## B — Abdeckung und Bestand

| # | Kriterium | Stand |
|---|---|---|
| B-1 | Jedes der 16 Bundesländer war mindestens einmal erfasst | **offen** — zuletzt fehlten 6 |
| B-2 | Ein verschwundenes Immowelt-Objekt wird als verschwunden erkannt | **offen** — 0 von 754 haben `disappeared_at` |
| B-3 | Die Löschwachen bleiben fail-closed | **erfüllt**, muss bei jeder Änderung erneut gelten |

## C — Die Zahlen

| # | Kriterium | Stand |
|---|---|---|
| C-1 | Die Mietschätzung ist gegen eine belegbare Quelle geprüft | **in Prüfung** |
| C-2 | Bekannt ist, wie stark eine falsche Miete die Meldeschwelle verschiebt | **in Prüfung** |
| C-3 | Unplausible Zahlen erzeugen keine Meldung, bleiben aber sichtbar | **erfüllt** seit `64de963` / `d43637b` |
| C-4 | Kein gespeicherter Wert ist offensichtlich unmöglich | **erfüllt** — Stichprobe über alle 2.864 Versionen, kein absurder Wert aktuell |

## D — Die Meldungen

| # | Kriterium | Stand |
|---|---|---|
| D-1 | Belegt, dass Telegram die Nachrichten angenommen hat | **in Prüfung** |
| D-2 | Der Nachrichtentext nennt die Datenlücken, auf denen er beruht | **in Prüfung** |
| D-3 | Die Formatierung bricht nicht bei fehlenden Feldern | **in Prüfung** |
| D-4 | Das Meldebudget ist nicht dauerhaft ausgeschöpft | **offen** — `25 von hoechstens 25` in beiden Läufen |

---

## Erst danach: das Dashboard

`BACKLOG.md` B2. Die wichtigste Entwurfsfrage steht schon fest und ist durch
die Messungen dieser Sitzung schärfer geworden: **Seit dem 2026-09-07 um 05:43
ist kein einziger `top_treffer` versandt worden.** Alle 42 Treffer des letzten
Laufs beruhen auf geschätzter Miete, im ganzen Bestand tragen zwei Objekte
eine belegte. Ein Ranking, das Nichtwissen wie Wissen sortiert, wäre wertlos —
diese Frage gehört vor die erste Zeile Frontend-Code.
