# Übergabe — Stand 2026-09-09, 11:00 UTC

> **Zuerst lesen:** dieses Dokument, dann [`ABNAHME-BASIS.md`](ABNAHME-BASIS.md)
> (woran „die Basis steht" gemessen wird), dann [`BACKLOG.md`](BACKLOG.md)
> (ausführbare Aufgaben) und [`TODO.md`](TODO.md) (Statuslandkarte).

## Wo wir stehen

`main` = `ed46f36` plus dieser Dokumentationsstand, gepusht, Arbeitsverzeichnis
sauber. Letzter Lauf: **`34329204906`** (2026-09-09, 08:27–08:55 UTC,
`conclusion=success`). **376 Tests grün**
(Sitzungsbeginn: 374, davon 2 rot), `npx tsc --noEmit` sauber.

**Option 1 aus dem B-2-Entwurf ist umgesetzt** — Fortsetzungsrotation und
fail-closed bei fehlender Trefferzahl. Damit sind Option 0 und 1 der
empfohlenen Reihenfolge 0 → 1 → 3 erledigt; als Nächstes steht **Option 3**
an (markieren ohne löschen), davor aber der Messauftrag **A15**.

## Was diese Sitzung gebracht hat

### Zwei Tests waren rot, bevor irgendjemand etwas anfasste

Der erste Befund der Sitzung kam ungefragt: `npx vitest run` auf sauberem
`main` lieferte 2 rote Tests — genau die beiden Reihenfolgetests, die die
Vorsitzung als Beleg für D-1 gebaut und mit Sabotageproben abgesichert hatte.

**Es war kein Produktionsfehler.** Der Basiskandidat der Tests trägt den
Versteigerungstermin `2026-09-09T08:00:00Z`. Seit heute 08:00 UTC liegt der in
der Vergangenheit, und `bestimmeMeldeklasse` gibt bei gelaufenem Termin
`"keine"` zurück — es wurde schlicht nichts gesendet, also gab es weder Wurf
noch Protokollzeile. Die Tests waren gestern grün und sind heute rot, ohne dass
sich eine Zeile Code geändert hat.

Der meldewürdige Kandidat trägt seinen Termin jetzt relativ zur Uhr
(`Date.now() + 30 Tage`). Die Sabotageprobe wurde wiederholt: Entfernt man die
`res.ok`-Prüfung in `telegram.ts`, fällt der Test weiterhin um.

**Die Lehre, die es ins Repo geschafft hat:** Ein Test, der am Kalender hängt,
meldet einen Fehler, den es nicht gibt — und verdeckt den, den es gibt. Andere
Testdaten mit `auctionAt` sind geprüft: `meldung.test.ts` reicht ein festes
`jetzt` durch, `telegram.test.ts` formatiert nur. Nur `pipeline.test.ts` las
die echte Uhr.

### Option 1, erste Hälfte — die Rotation setzt fort

Der Startindex der Regionsrotation war die Wanduhr
(`Math.floor(Date.now() / 3_600_000)`). Weil das Zeitbudget eines Laufs für
genau **eine** große Region reicht — `nw` allein braucht 173 Seiten ≈ 33 min —
war jede große Region praktisch nur von **einem** der 16 Startindizes aus
erreichbar. Welcher das ist, entschied die Cron-Uhrzeit.

Er kommt jetzt aus `sweep_region_runs`: Startpunkt ist die Region, die am
längsten nicht gesweept wurde. Monte-Carlo über 3.000 Durchläufe: volle
Abdeckung in **5,7 statt 13,1 Tagen**, 90. Perzentil 7,6 statt 20,2 — **ohne
einen einzigen zusätzlichen Abruf**.

**Warum aus der Historie und nicht aus einem Zähler:** Es heilt sich selbst.
Fällt eine Region aus oder fällt ein Cron-Termin aus, zeigt der Startpunkt
weiterhin auf das, was am längsten nicht dran war. Ein Zähler könnte das nicht.

**Belegt im Lauf `34329204906`** (2026-09-09, 08:27–08:55 UTC,
`conclusion=success`). Der Lauf startete bei **`by`**, Ringindex 1. Die alte
Uhr-Rotation hätte zu dieser Minute Index **0** gewählt, also `nw` — und `nw`
war **39 Minuten vorher** im Lauf um 08:10 gerade erfasst worden. Der Lauf
hätte seine 21 Minuten damit verbracht, dieselbe Region ein zweites Mal zu
holen.

Und `by` war kein beliebiger Nachbar: In **33 Regionsläufen über 24 Stunden
hatte Bayern keinen einzigen Eintrag** in `sweep_region_runs`. Es ist die
zweitgrößte Region und war von 15 der 16 Uhr-Startindizes aus unerreichbar.
Beim ersten Lauf mit der neuen Rotation lieferte es **4.692 von gemeldet 5.083
Objekten** (92,3 %) über 119 Seiten, `vollstaendig=true`.

**Prüfbare Vorhersage für den nächsten Lauf:** Startpunkt ist `ni`, Ringindex 3
— die erste Region, die noch **nie** gesweept wurde. Danach `rp`. Trifft das
nicht zu, stimmt das Modell nicht, und dann ist zuerst das zu klären.

**Zwei Fallen, die dabei umgangen sind.** Erstens: Alle Regionszeilen eines
Laufs werden in **einem** Insert geschrieben und tragen deshalb denselben
`started_at`. Innerhalb eines Laufs ist die Reihenfolge gar nicht
unterscheidbar; verlässlich ist nur der Vergleich **zwischen** Läufen, und
genau darauf stützt sich `sweepStartVersatz`. Zweitens: `ladeLetzteRegionsSweeps`
unterscheidet `null` („Historie nicht lesbar", Rückfall auf die Uhr) von einer
leeren Map („noch nie gesweept", Start bei der ersten Region). Wer beides
verwechselt, friert die Abdeckung bei `nw` ein, sobald die Abfrage einmal
scheitert.

### Option 1, zweite Hälfte — die fehlende Trefferzahl ist nicht mehr „in Ordnung"

`istRegionVollstaendig` gab bei `gemeldet === null` **`true`** zurück. Das war
die zweite der drei Fail-open-Stellen aus dem B-2-Entwurf, und sie stand an der
teuersten Stelle: Der Titel parst ausgerechnet für **`nw`, `bw` und `mv`**
nicht, also für die beiden größten Regionen. Deren Vollständigkeit ruhte damit
auf „mehr als null Karten". Ein soft-geblockter Lauf mit einer einzigen Karte
hätte `nw` als vollständig ausgewiesen — bei regionsgenauer Löschhoheit wären
das **1.160** echte Objekte, am Sättigungspunkt **~6.900**.

Jetzt gilt: keine Trefferzahl → **unvollständig**.

**An den Daten kostet das heute nichts.** `vollstaendig` ist für Immowelt
ohnehin hart `false`, es wird nichts gelöscht. Es verhindert nur, dass
unbelegte Regionen als Referenzläufe zählen — und macht damit sichtbar, dass
die Trefferzahl für diese drei Regionen **erst gemessen werden muss**. Das ist
die neue Aufgabe **A15**, und sie ist Voraussetzung für B1: Solange der Titel
dort nicht parst, sammeln die drei größten Regionen keine vollständigen Läufe
an.

**Das Muster wurde ausdrücklich nicht angepasst.** Warum der Titel dort nicht
parst, ist bis heute **nicht gemessen** — Timing ist eine Hypothese (der Titel
wird unmittelbar nach `domcontentloaded` gelesen), ein Formatwechsel eine
zweite. Stattdessen schreibt `regionUnvollstaendigMeldung` den echten Titel
wörtlich ins Log, gekürzt auf 140 Zeichen. Ein einziger Lauf entscheidet die
Frage, ohne dass jemand ein neues Muster rät.

**Der Lauf `34329204906` hat A15 noch nicht beantwortet** — er sweepte nur
`by`, und dort parst der Titel. Es steht also keine einzige `Titel war:`-Zeile
im Log. Die Messung kommt, sobald die Rotation `nw`, `bw` oder `mv` erreicht.

**Ein Fund nebenbei, der Option 3 direkt betrifft:** In `sweep_region_runs`
stehen **8 Zeilen mit `vollstaendig=true`, obwohl ihre Trefferzahl `null`
ist** — Altbestand aus der Fail-open-Zeit, verteilt auf `nw` (3), `mv` (3),
`bw`, `sh`, `th`, `sl`. Die Abfrage aus B1
(`count(*) filter (where vollstaendig)`) zählt sie mit und behauptet damit
Referenzläufe, die nach heutigem Maßstab unbelegt sind. **Wer die
Referenzläufe für Option 3 zählt, muss diese Zeilen ausschließen** — entweder
über `gemeldete_treffer is not null` oder über `started_at >= 2026-09-09`.

## Was als Nächstes zu tun ist

1. **A15 — den echten Titel aus dem Log lesen** und danach
   `trefferzahlAusTitel` mit einem scheiternden Test erweitern. Kleinster
   Schritt, größte Hebelwirkung: Ohne ihn stehen `nw`, `bw` und `mv` still.
2. **Option 3 — markieren ohne löschen.** `disappeared_at` regionsgenau setzen,
   die harte Löschung für `source='immowelt'` unterbinden. Erfüllt B-2
   wörtlich („wird als verschwunden **erkannt**", nicht: gelöscht) und liefert
   dem Dashboard, was B2 ohnehin verlangt. Ein Fehlurteil kostet ein paar Tage
   graue Darstellung statt tausender Zeilen.
   **Zwei Fail-open-Stellen müssen vorher fallen:** `bestand.ts:78` (leerer
   Geltungsbereich = voller Geltungsbereich) und `loescheAbgelaufene`
   (`bestandDb.ts:155`, filtert **nicht** nach `source` — wer heute markiert,
   löscht zwei Tage später mit).
3. **Option 2 — regionsgenaues Löschen — ist ausdrücklich nicht das Ziel.**
   Selbst mit reparierter Trefferzahl erlaubt die 25-%-Toleranz einen Lauf mit
   75 % Ausbeute, also bis zu **1.724** echte Objekte in einem Zug.

## Entscheidungen, die dem Nutzer gehören

Nicht in jeder Antwort wiederholen — sie stehen hier, damit sie nicht
verlorengehen, und werden angesprochen, wenn sie eine Aufgabe blockieren.

- **A11 Schritt 4:** Darf eine bundeslandgenaue Mietschätzung überhaupt eine
  Telegram-Meldung auslösen? Diese Objekte stellen 339 der 409
  Meldekandidaten, und ihre Unschärfe umfasst in NRW und Bayern das gesamte
  ±30-%-Band. Daran hängt auch D-5: Das Budget ist in jedem Lauf
  ausgeschöpft (zuletzt 25 gesendet, 117 zurückgestellt).
- **A13 Schritt 2 und A6:** Soll ein Objekt ohne Preis bzw. ohne Verkehrswert
  gespeichert statt fallengelassen werden? Beides läuft auf dieselbe Frage
  hinaus — `price_cents` nullbar, also eine Migration auf Produktionsdaten.
  Am besten zusammen entscheiden.
- **A9 Rest:** Zwei bereits versandte Falschmeldungen tragen den falschen
  Preis weiterhin im Bestand.
- **A10 Schritt 1:** Cron dichter takten? **Entschärft** — mit der
  Fortsetzungsrotation deckt er bei 3 h fast so schnell ab wie ein
  Stunden-Cron unter der alten Uhr-Rotation.

## Werkzeuge und Zugänge

| Zugang | Umfang |
|---|---|
| GitHub (Windows-Credential-Manager) | OAuth-Token `gho_…`, Scopes `repo, workflow, gist`, Konto `bratzi` |
| Supabase Management-PAT | DDL, Logs, Secrets — in `scraper/.env` |
| Supabase Service-Key | volle Datenrechte, umgeht RLS |
| Telegram-Bot | `Immo2501bot` |

**`gh` ist installiert, aber nicht eingeloggt.** Je Aufruf:

```bash
export PATH="$PATH:/c/Program Files/GitHub CLI"
export GH_TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill | sed -n 's/^password=//p')
```

**Die Tokenfrage ist geschlossen** (A2, Entscheidung des Nutzers vom
2026-09-08). Nicht wieder aufbringen.

**Der Auto-Mode-Klassifizierer blockiert einiges** — Schreibzugriffe unter
`~/.claude`, Token-Operationen. Das ist keine Berechtigungsabfrage, die der
Nutzer bestätigen kann; es braucht eine Regel in den Einstellungen. Einmal
sagen, nicht mehrfach nachfassen.

## Fallen, die schon zugeschnappt sind

**Nie einen Live-Lauf lokal.** [`lib/nurInCi.ts`](../../scraper/lib/nurInCi.ts)
bricht `npm run scrape` und jedes Prüfskript ohne `CI` ab. Der Anschluss des
Nutzers ist zweimal ausgefallen. Prüfungen laufen über
[`pruefung.yml`](../../.github/workflows/pruefung.yml), volle Läufe über
`gh workflow run scrape.yml --ref main`.

**Ein Test, der am Kalender hängt, ist eine Zeitbombe.** Diese Sitzung ist mit
zwei roten Tests gestartet, die niemand kaputtgemacht hatte: Ein fest
verdrahteter Versteigerungstermin lief um 08:00 UTC ab. Wer Testdaten mit
Datum baut, macht sie relativ zur Uhr oder friert die Uhr ein.

**Eine Fehlermeldung, die eine Ursache behauptet, ist gefährlich.** Erst
messen. Deshalb steht in A15 ein Messauftrag und keine Reparatur.

**Wer eine Grenze entfernt, muss die dahinter suchen.**

**Ein grüner Test beweist nichts, wenn er nie rot war.** Bei jedem Test, der
sofort grün ist: Produktionscode kurz kaputtmachen und zusehen, ob der Test es
merkt. Diese Sitzung hat es dreimal getan — für die Rotation, für die
reparierten Reihenfolgetests und für das geschlossene Fail-open.

**Immowelt ist nicht gesperrt, headless wird erkannt.** `headless: true` →
HTTP 403 mit CAPTCHA; `headless: false` → 200. In CI unter `xvfb-run`.

**Ein CAPTCHA wird nicht gelöst.** Es misst eine zu hohe Abrufrate.

**Immowelt-Detailseiten (`/expose/`) sind von Rechenzentrums-Adressen
gesperrt.** Bewertung kommt aus der Titelzeile der Ergebnisliste. Deshalb
gibt es keine PLZ und die Miete ist bundeslandgenau.

**Leere Bundesländer sind bei ZVG normal.**

**Fail-open in den Löschwachen ist der teuerste Fehler.** In `bestand.ts`,
`plausibilitaet.ts` und `bestandDb.ts` gilt: ein unbekannter Zustand ist
`null`/`false`, nie „in Ordnung". Von den drei bekannten Stellen ist eine
geschlossen, zwei sind offen.

**Die `\n`-Falle beim Schreiben von Dateien.** Bei größeren Dateien das
Write-Werkzeug nehmen, nicht ein Heredoc.

**`tsx` und `page.evaluate`.** Verschachtelte Funktionen im `evaluate`-Rumpf
brechen mit `ReferenceError: __name is not defined`. Alles flach halten.
