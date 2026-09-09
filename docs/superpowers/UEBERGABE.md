# Übergabe — Stand 2026-09-08, 22:00 UTC

> **Zuerst lesen:** dieses Dokument, dann [`ABNAHME-BASIS.md`](ABNAHME-BASIS.md)
> (woran „die Basis steht" gemessen wird), dann [`BACKLOG.md`](BACKLOG.md)
> (ausführbare Aufgaben) und [`TODO.md`](TODO.md) (Statuslandkarte).

## Wo wir stehen

`main` = `b0a23e2`, gepusht, Arbeitsverzeichnis sauber. **363 Tests grün**
(Sitzungsbeginn: 342), `npx tsc --noEmit` sauber.

**Abnahme: 10 von 16 Kriterien erfüllt, 1 teilweise, 5 offen.** Offen sind
A-3 (Cron), A-4 (stiller `continue`), B-1 (Abdeckung), B-2 (Abgänge) und D-5
(Meldebudget). Teilweise ist C-1 — die Mietschätzung ist geprüft und der
Befund steht im Code, aber kein Test hält sie dauerhaft.

Letzter Lauf: **`34278399926`** (2026-09-08, 21:03–21:29 UTC,
`conclusion=success`). Er ist der Beleg für zwei Kriterien, siehe unten.

## Was diese Sitzung gebracht hat

**Vier Untersuchungen liefen parallel als Subagenten** — die vier, die in der
Vorsitzung am Sitzungslimit gestorben waren. Alle vier haben berichtet, und
**drei von vier haben den jeweiligen Verdacht widerlegt.** Das ist das Muster
dieser Sitzung: Der vermutete Fehler war fast nie der echte.

| Untersuchung | Verdacht | Befund |
|---|---|---|
| Telegram (D-1) | `notifications` zählt Versuche | **widerlegt** → A12 |
| 39 ohne Preis (A-4) | Parserfehler | **widerlegt** → A13 |
| Mietschätzung (C-1/C-2) | Tabelle ist geraten | **widerlegt** → A11 |
| Abgänge (B-2) | zwei Sperren | **fünf**, erste ist ein echter Fehler → A14 |

### Repariert und belegt

**A14 — `.in()` riss ab 642 IDs.** Der teuerste Fund der Sitzung. Gemessen:
641 IDs → HTTP 200, 642 → HTTP 400 `Bad Request`, 1.500 → HTTP 414; die
Grenze ist die URL-Länge. Im Lauf `34230052647` ist daran der **ganze**
Bestandsabgleich für Immowelt abgebrochen — samt `aktualisiereLastSeen`, also
genau der Wache, die verhindert, dass gesehene Objekte gelöscht werden. Bei
1.915 Objekten hätte das ab sofort in **jedem** Lauf gerissen. `jeBlock`
fährt jetzt Blöcke zu 500 und wirft beim ersten gescheiterten Block.
**Belegt:** null Vorkommen von `Bestandsabgleich fehlgeschlagen` in 487
Logzeilen des Laufs `34278399926`.

**D-1 ist erfüllt.** `sendTelegramMessage` gibt die bestätigte `message_id`
zurück, `pipeline` und `main` legen sie mit der `runId` ins vorhandene
`detail`-jsonb (keine Schemaänderung). **Belegt:** 25 Zeilen mit
`runId=34278399926`, **0 ohne `telegramMessageId`**, IDs 1796–1820 lückenlos,
deckungsgleich mit `Meldungen: 25 von hoechstens 25 gesendet`.

**Die Reihenfolgegarantie steht zum ersten Mal unter Test.** Vorher enthielt
keine Testzeile im Projekt das Wort `fetch`. Jetzt: vier Transportfälle plus
zwei Reihenfolgetests, die ausschließlich `fetch` stubben. **Zwei
Sabotageproben belegen, dass sie greifen** — `logNotification` vor den
Versand gezogen macht zwei Tests rot, die entfernte `res.ok`-Prüfung vier.

**A11 — der Bundesschnitt war 17 % zu niedrig** (9,23 statt 11,11 €/m², BBSR
2025). Richtung beachten: zu niedrige Miete heißt zu schlechter
Kaufpreisfaktor, ein lohnendes Objekt fiele **unter** die Meldeschwelle. Der
Fehler ging gegen den Nutzer. Dazu steht jetzt über der Tabelle, woher die 95
Werte stammen und wie sie sich schlagen — vorher trug die wichtigste Zahl im
Projekt keine Quellenangabe.

**A13 — der stille `continue` ist nicht mehr still.** Jede Titelzeile ohne
Preis geht ins Protokoll, die Schlusszeile schlüsselt nach Fundort auf
(`fasseOhnePreisZusammen`). A-4 ist damit noch **nicht** erfüllt — das Objekt
bleibt unauffindbar —, aber der nächste Lauf beweist die Klassifikation,
statt sie zu begründen.

## Was als Nächstes zu tun ist

**Die Empfehlung aus dem B-2-Entwurf lautet: Option 0 → 1 → 3.**
[`specs/2026-09-08-immowelt-abgaenge-optionen.md`](specs/2026-09-08-immowelt-abgaenge-optionen.md).
**Option 0 ist erledigt** (das war A14). Als Nächstes also **Option 1** —
sie löscht nichts und ist damit risikofrei:

1. **Fortsetzungsrotation.** Startindex aus `sweep_region_runs` fortschreiben
   statt aus der Uhr (`Math.floor(Date.now() / 3_600_000)`). Monte-Carlo über
   3.000 Durchläufe: volle Abdeckung in **5,7 statt 13,1 Tagen**, 90.
   Perzentil 7,6 statt 20,2 — **ohne einen einzigen zusätzlichen Abruf**.
   Billigster Hebel im ganzen Problem.
2. **Trefferzahl absichern — und hier steht ein Fail-open.**
   `istRegionVollstaendig` (`scrapers/immowelt/index.ts:145`) gibt bei
   `gemeldet === null` **`true`** zurück, und `trefferzahlAusTitel`
   (`:104`, Muster `/([\d.]+)\s+Angebote/`) liefert ausgerechnet für **`nw`,
   `bw` und `mv`** `null` — 5 von 21 Regionsläufen, darunter die beiden
   größten Regionen. Solange das so ist, ruht die Vollständigkeit der größten
   Region auf „mehr als null Karten".

   **Wichtig, bevor jemand das Muster ändert:** Warum der Titel dort nicht
   parst, ist **nicht gemessen**. Der Titel wird unmittelbar nach
   `domcontentloaded` gelesen (`:307`) — Timing ist eine Hypothese, ein
   Formatwechsel eine zweite. Erst messen (den echten Titel loggen, ein Lauf
   genügt), dann reparieren. Das Fail-open selbst darf schon vorher fallen:
   Es kostet heute nichts, weil für Immowelt ohnehin nicht gelöscht wird
   (`vollstaendig` ist in `scrapers/immowelt/index.ts:507` hart `false`).

Danach Option 3 (markieren statt löschen). **Option 2 — regionsgenaues
Löschen — ist ausdrücklich nicht das Ziel:** Ein Lauf, der `nw` soft-geblockt
mit einer Karte einsammelt, gilt heute als vollständig; das wären **1.160**
fälschlich gelöschte Objekte, am Sättigungspunkt **~6.900**.

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
  Stunden-Cron heute.

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

**Eine Fehlermeldung, die eine Ursache behauptet, ist gefährlich.** Diese
Sitzung hat das Muster ein viertes, fünftes und sechstes Mal bestätigt: drei
von vier Verdachtsmomenten waren falsch. Erst messen.

**Wer eine Grenze entfernt, muss die dahinter suchen.**

**Ein grüner Test beweist nichts, wenn er nie rot war.** Diese Sitzung hat
einen eigenen Testentwurf entlarvt: Die Attrappe lieferte einen höheren
Vorgängerpreis, damit lief der Versand über die Preisänderungs-Meldung, und
der Test prüfte den falschen Aufrufort. Er war grün und wertlos. Aufgefallen
ist es erst durch die Sabotageprobe. **Bei jedem Test, der sofort grün ist:
Produktionscode kurz kaputtmachen und zusehen, ob der Test es merkt.**

**Immowelt ist nicht gesperrt, headless wird erkannt.** `headless: true` →
HTTP 403 mit CAPTCHA; `headless: false` → 200. In CI unter `xvfb-run`.

**Ein CAPTCHA wird nicht gelöst.** Es misst eine zu hohe Abrufrate.

**Immowelt-Detailseiten (`/expose/`) sind von Rechenzentrums-Adressen
gesperrt.** Bewertung kommt aus der Titelzeile der Ergebnisliste. Deshalb
gibt es keine PLZ und die Miete ist bundeslandgenau.

**Leere Bundesländer sind bei ZVG normal.**

**Fail-open in den Löschwachen ist der teuerste Fehler.** In `bestand.ts`,
`plausibilitaet.ts` und `bestandDb.ts` gilt: ein unbekannter Zustand ist
`null`/`false`, nie „in Ordnung". Drei bekannte Fail-open-Stellen stehen im
B-2-Entwurf, zwei davon sind noch offen.

**Die `\n`-Falle beim Schreiben von Dateien.** Bei größeren Dateien das
Write-Werkzeug nehmen, nicht ein Heredoc.

**`tsx` und `page.evaluate`.** Verschachtelte Funktionen im `evaluate`-Rumpf
brechen mit `ReferenceError: __name is not defined`. Alles flach halten.
