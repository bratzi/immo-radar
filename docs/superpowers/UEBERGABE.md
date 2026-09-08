# Übergabe — Stand 2026-09-08, 20:30 UTC

> **Zuerst lesen:** dieses Dokument, dann [`BACKLOG.md`](BACKLOG.md) (ausführbare
> Aufgaben) und [`TODO.md`](TODO.md) (Statuslandkarte).

Dieses Dokument soll verhindern, dass irgendetwas davon noch einmal
hergeleitet werden muss.

## Wo wir stehen

`main` = `d6c4cc1`, gepusht, Arbeitsverzeichnis sauber. **342 Tests grün**,
`npx tsc --noEmit` sauber. Cron ist auf drei Stunden gestellt, laeuft
aber gemessen nur **alle rund fuenf** — 10 von 23 Soll-Terminen sind ganz
ausgefallen, die uebrigen 8 bis 171 min zu spaet. Siehe `BACKLOG.md` A10.

Teilprojekt 1 (vollständige Erfassung & Bestandsführung) ist live. In dieser
Sitzung kam dazu: die Immowelt-Pagination repariert, der Fundort eingeführt,
die Wohnflächen-Ernte für ZVG, und Immowelt auf Listenbewertung umgestellt.

## Die drei Regeln, die diese Sitzung teuer gelernt hat

**1. Live-Abrufe laufen NIE über den Anschluss des Nutzers.** Das ist jetzt
Code, kein Vorsatz: [`lib/nurInCi.ts`](../../scraper/lib/nurInCi.ts) bricht
`npm run scrape` und jedes Prüfskript ab, wenn `CI` fehlt. Der Anschluss ist
an einem Abend **zweimal** ausgefallen — beim zweiten Mal durch sechs einzelne
Regionsläufe kurz hintereinander, jeder für sich regelkonform.

Prüfungen laufen über [`pruefung.yml`](../../.github/workflows/pruefung.yml):

```bash
gh workflow run pruefung.yml -f skript=pruefe-region -f region=hb -f max_seiten=12
gh workflow run pruefung.yml -f skript=diagnose-overlays
gh workflow run pruefung.yml -f skript=diagnose-detail
gh workflow run pruefung.yml -f skript=diagnose-liste
gh run watch && gh run view --log
```

Unter zwei Minuten je Lauf, ohne Secrets.

**2. Eine Fehlermeldung, die eine Ursache behauptet, ist gefährlich.** Dreimal
hat dieses Projekt in die falsche Richtung gesucht, weil eine Meldung riet
statt zu messen: „Pagination kaputt", „Immowelt gesperrt", „Seitenstruktur
geändert". Es war jedes Mal etwas anderes. `beurteileDetailAntwort` wertet
deshalb jetzt den HTTP-Status aus, den `page.goto` immer schon zurückgab.

**3. Wer eine Grenze entfernt, muss die dahinter suchen.** Der Umbau auf
Listenbewertung hat unbemerkt das Detailbudget als Meldebremse entfernt — statt
144 Objekten liefen plötzlich alle 3.665 durch die Bewertung. Der Lauf wurde
abgebrochen, bevor die erste Nachricht rausging.

## Werkzeuge und Zugänge

Alles vorhanden, nichts fehlt:

| Zugang | Umfang |
|---|---|
| GitHub (Windows-Credential-Manager) | `repo, workflow, gist` |
| Supabase Management-PAT | DDL, Logs, Secrets — in `scraper/.env` |
| Supabase Service-Key | volle Datenrechte, umgeht RLS |
| Telegram-Bot | `Immo2501bot` |

**`gh` ist installiert** (2.100.0), aber **nicht** eingeloggt: `gh auth login`
verlangt `read:org`, das dem Token fehlt. Stattdessen je Aufruf:

```bash
export PATH="$PATH:/c/Program Files/GitHub CLI"
export GH_TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill | sed -n 's/^password=//p')
```

Die abgelaufene Benutzer-Umgebungsvariable `GH_TOKEN` wurde entfernt — sie
lieferte 401 und hätte `gh` dauerhaft blockiert. **Offen:** Der Nutzer sollte
das alte Token auf GitHub widerrufen; sein Wert ist am 2026-09-08 versehentlich
in ein Sitzungsprotokoll geraten.

## Was in dieser Sitzung gelöst wurde

**Die Pagination — der Blockierer war nie DataDome.** Der Sweep brach seit
jeher nach zwei Ergebnisseiten je Region ab. Ursache: Immowelts eigener
Suchauftrag-Dialog (`data-testid="av-ssab-Modal-secondPageModal-submit"` —
der Name sagt es: er kommt auf Seite 2) plus eine zweite Überlagerung, die
sich nur über ein „x" oben links schließt. Beide tragen **keine** Dialog-Rolle
und ihre Klassennamen werden bei jedem Rendern neu erzeugt. Deshalb sucht
[`overlays.ts`](../../scraper/scrapers/overlays.ts) das Schließkreuz über die
**Geometrie**: nur innerhalb eines Vorfahren, der fest positioniert ist und ein
Viertel des Sichtfensters überdeckt.

Dazu zwei weitere Fehler: `bestaetigeConsentBanner` teilte sein Zeitbudget auf
sieben Kandidaten auf, sodass der einzig passende (`uc-accept-all-button`,
Beschriftung **„OK"**) 1,4 von 10 Sekunden bekam — er erscheint aber erst nach
rund 8. Und `blaettereWeiter` hielt „der Klick warf nicht" für Erfolg; erst die
tatsächlich geänderte erste Ergebniskarte ist ein Beleg.

**Belegt:** Bremen 42 → **201 von 209**. Hessen 483 aus 12 Seiten. In
Produktion 717 → **3.665** Objekte, 96 % der ausgewiesenen Treffer.

**Immowelt-Detailseiten sind von Rechenzentrums-Adressen gesperrt.** Auf einem
GitHub-Runner, dieselbe Sitzung, direkt nacheinander: `/suche/` **HTTP 200**
mit 1,13 MB, `/expose/` **HTTP 403** mit DataDome-CAPTCHA. Lokal liefern
dieselben URLs 200. Die Detailphase verbrannte 144 Abrufe und 12 Minuten je
Lauf für nichts.

**Deshalb kommt Immowelts Bewertung jetzt aus der Ergebnisliste** — aus der
Titelzeile, die der Sweep ohnehin einsammelt:

```
"Mehrfamilienhaus zum Kauf - West - 75.000 € - 8 Zimmer, 158,7 m², 184 m² Grundstück"
```

Null zusätzliche Abrufe. Der teuerste denkbare Fehler wäre, bei
`80 m², 679 m² Grundstück` das Grundstück als Wohnfläche zu lesen — der
Kaufpreisfaktor fiele um mehr als das Achtfache zu gut aus. Deshalb wird das
Grundstück **zuerst** herausgeschnitten; ein Test hält genau das fest.

**Preis dafür:** Die Suchseite nennt keine PLZ (weder im HTML noch im
Datenmodell — beides geprüft). Die Miete wird über den Fundort
bundeslandgenau geschätzt und trägt die Lücke `miete_nur_bundeslandgenau`.

**Der Fundort wird mitgeschrieben** (`listings.fundort`, `sweep_region_runs`).
Am Löschverhalten ändert das nichts — zwei Sperren stehen weiter.

**ZVG-Wohnflächen geerntet.** 92 Gutachtentexte enthielten „Wohnfl" und der
Parser las daraus **null**; die Lücke waren Füllwörter (`insgesamt`, `rd.`,
`beträgt`, `ges.`). Jetzt eine Whitelist statt `.*?` — sonst würden
Grundstücksgrößen („Größe 284 qm") oder Einzelwohnungen („Wohnflächen: Wohnung
EG rd. 57 m²") als Hausfläche gelesen.

**Teilprojekt 2 wurde widerlegt, bevor Code entstand.** Es gibt **zwei**
Objekte mit angegebener Miete im ganzen Bestand, und in 442 ZVG-Texten steht
**null** Mal eine Jahresmiete. Ein Mietkorpus hat keine Grundlage. Belegt in
[`specs/2026-09-08-mietqualitaet-befund.md`](specs/2026-09-08-mietqualitaet-befund.md).

## Was als Erstes zu tun ist

**Der Nutzer hat die Reihenfolge festgelegt** (2026-09-08): *„Die Basis muss
vorher stehen, bevor die Webseite und Dashboard aufgebaut wird. Ich möchte
einen sauberen Lauf sehen inklusive Telegram Nachrichten. […] Auch die
Plausibilität bezüglich Miete und so weiter muss auch geprüft werden. Wenn das
alles steht das dashboard."* Kein Frontend-Code, bevor
[`ABNAHME-BASIS.md`](ABNAHME-BASIS.md) durch ist.

Zweite Anweisung: **mit Superpowers-Skills und parallelen Subagenten
arbeiten**, je Aufgabe die passende Skill.

### Vier Untersuchungen sind NICHT gelaufen — neu beauftragen

Am 2026-09-08 gegen 20:40 UTC wurden vier Subagenten parallel losgeschickt.
**Alle vier starben am Sitzungslimit, keiner hat berichtet.** Ihre Aufträge
stehen noch aus und sind unabhängig voneinander — sie gehören wieder parallel
losgeschickt:

| # | Auftrag | Skill | Kernfrage |
|---|---|---|---|
| 1 | **Mietschätzung prüfen** | — | Woher kommen die Werte in `lib/rentEstimate.ts`, sind sie gegen eine öffentliche Quelle belegbar, und wie viele Treffer wechseln bei ±30 % die Schwelle `kaufpreisfaktor <= 15`? Ergebnis als **A11** ins Backlog. |
| 2 | **Telegram-Zustellung** | `verification-before-completion` | Beweist eine Zeile in `notifications` überhaupt, dass Telegram die Nachricht angenommen hat? Wird der HTTP-Status geprüft? Wird die Zeile vor oder nach dem Versand geschrieben? (Kriterium D-1.) |
| 3 | **Abdeckung & Löschhoheit** | `brainstorming` | Warum hat **kein einziges** der 754 Immowelt-Objekte je `disappeared_at`? Trägt B1 bei der gemessenen Lauffrequenz überhaupt? Optionen mit Kosten und Risiken. |
| 4 | **39 von 600 ohne Preis** | `systematic-debugging` | Parserfehler in der Titelzeile oder echt „Preis auf Anfrage"? Quote schwankte zwischen 0,5 % und 6,5 % je Lauf. |

Auftrag 2 ist teilweise erledigt: Die Formatierung wurde geprüft und repariert
(siehe unten), **die Zustellung selbst aber nicht**. Der Rest von Auftrag 2 ist
genau noch Frage 1 der Tabelle.

**Wichtig für die Beauftragung:** Jeder Agent bekommt die Anweisung, NICHT
`docs/superpowers/BACKLOG.md` zu bearbeiten — sonst kollidieren sie. Die Doku
führt der Koordinator zusammen.

### Danach: ein Lauf, an dem die Abnahme durchgeht

`ABNAHME-BASIS.md` hat 15 Kriterien. Stand: 8 erfüllt, 7 offen. Die harten
sind B-1 (alle 16 Bundesländer je erfasst), B-2 (Immowelt-Abgänge werden
erkannt) und C-1/C-2 (Miete belegt).

## Was in dieser Sitzung geschlossen wurde

**Telegram-Meldungen** (`d6c4cc1`) — vier Fehler, die in JEDER der 25 Meldungen
standen: `MIET_QUELLE_LABELS` kannte den haeufigsten Wert
(`geschaetzt_bundesland`) nicht, drei Lueckencodes fehlten ebenfalls, die
Ortszeile klebte eine leere PLZ davor (`📍  Jungingen`), und der Kartenlink
wurde auch ohne Adresse gebaut. Dazu die Anforderung des Nutzers, in JEDER
Meldung Bundesland und PLZ zu nennen. Gemessen: Bundesland ist ueberall da
(1.862/1.862 bei Immowelt), die PLZ fast nie (157/1.862, alle aus dem alten
Detailpfad). Eine fehlende PLZ wird deshalb als Luecke sichtbar gemacht statt
verschwiegen. **Bewusst nicht gebaut:** die PLZ aus dem Ortsnamen herleiten --
Ortsnamen sind mehrdeutig, eine falsche PLZ ergaebe eine falsche
Mietschaetzung. Das ist eine Entscheidung des Nutzers und haette als Nebeneffekt
den groessten offenen Punkt entschaerft (PLZ-genaue statt bundeslandgenaue
Miete).


**A1** — Lauf `34215003141` hat den Listen-Umbau bestaetigt: `listings` fuer
Immowelt 157 → 754, `fundort` 0 → 597, `Meldungen: 25 von hoechstens 25`.

**A6** — der Verdacht ist **widerlegt**. Der Parser liest richtig; die Quelle
nennt in 3 von 194 Faellen selbst keine Zahl. Beleg: Bei `Blatt 7803` hat das
Amtsgericht den Betrag ausgelassen, waehrend die Schwesterbekanntmachungen
desselben Gerichts dieselbe Schablone korrekt fuellen. Ueber acht Laeufe
scheitern immer exakt dieselben drei IDs.

**A7b** — das Bewertungsfenster war 600 breit und wanderte 1 Eintrag je
Stunde. Nordrhein-Westfalen haette **287 Tage** gebraucht. `streueAuswahl`
verteilt jetzt anteilig ueber alle Regionen.

**A8** — `BETRAG_PATTERN` kannte `,-`, aber nicht `,--`: 160.000 statt
282.000 EUR gespeichert, 43 % zu niedrig.

**A9** — `topTreffer` prueft den Kaufpreisfaktor nur nach OBEN. Zwei Objekte
mit falschen Preisen (2.840 € auf 198,8 m²) wurden an den Nutzer gemeldet, mit
einer Bruttorendite von 571 %. **Je kaputter die Zahl, desto besser sah das
Objekt aus.** Richtigstellung nach dem Nachmessen: Sie gingen als
`pruefkandidat` raus, nicht als `top_treffer` — `bestimmeMeldeklasse` stuft
geschaetzte Mieten ohnehin herunter. Das Feld `topTreffer` ist die
Schwellenpruefung, nicht die Meldeklasse.

**Nebenbefund, der fuer B2 zaehlt:** Seit dem 2026-09-07 um 05:43 ist kein
einziger `top_treffer` mehr versandt worden. Alle 42 Treffer des Laufs vom
2026-09-08 18:29 beruhen auf geschaetzter Miete; im ganzen Bestand tragen nur
zwei Objekte eine belegte. Die hoechste Meldeklasse ist damit praktisch
unerreichbar.

**A7a** — die Rechnung an `SWEEP_BUDGET_MS` setzte nur die Drossel von 5 s je
Seite an; gemessen sind 8,7 bis 11,5. Der Wert bleibt bei 12 min: Der
beherrschende Term ist die eine grosse Region, die nach der Wache noch startet,
nicht das Budget. Laengster echter Lauf 50,1 min gegen `timeout-minutes: 75`.
**`by` und `bw` sind nie gesweept worden** -- sind sie groesser als `nw`,
schrumpft die Marge, und der Kill traefe VOR dem Loeschblock.

**A6 Schritt 3, Teil 2** — ein fehlender Verkehrswert erscheint nicht mehr als
`Fehler, uebersprungen` mit Stapelabzug. Drei solche Zeilen in jedem Lauf
verdeckten echte Stoerungen.

## Was offen ist

- **A6 Schritt 3, Rest.** Zwei Entscheidungen des Nutzers, keine
  Aufraeumarbeit: (1) Soll ein Objekt ohne Verkehrswert gespeichert werden --
  konsequent wie `wohnflaeche_fehlt` -- statt fallen gelassen? Das verlangt
  `price_cents` nullbar, also eine Schemaaenderung. (2) Der Phantomwert
  78.031 EUR zu `zvg_id=13233` steht weiter im Bestand und wird nie
  ueberschrieben; ihn zu loeschen ist ein Schreibzugriff auf Produktionsdaten.
- **A9 Rest** — die beiden falsch gemeldeten Objekte tragen den falschen Preis
  weiterhin. Ob eine versandte Falschmeldung richtiggestellt gehoert, ist eine
  Entscheidung des Nutzers.
- **Teil B** — B1 (regionsgenaues Loeschen) braucht drei vollstaendige Laeufe
  je Region; sieben Bundeslaender (`by`, `bw`, `ni`, `rp`, `he`, `sn`, `sh`)
  haben seit Einfuehrung von `sweep_region_runs` noch keinen einzigen. B2 ist
  das Dashboard, das der Nutzer erwartet.

## Fallen, die schon zugeschnappt sind

**Nie einen Live-Lauf lokal.** Siehe oben — jetzt durch Code gesperrt.

**Immowelt ist nicht gesperrt, headless wird erkannt.** `headless: true` →
HTTP 403 mit CAPTCHA; `headless: false` → HTTP 200. In CI unter `xvfb-run`.
Nicht „zurückoptimieren".

**Ein CAPTCHA wird nicht gelöst.** Es misst eine zu hohe Abrufrate. Antwort
ist Drosselung, nicht Umgehung.

**Leere Bundesländer sind bei ZVG normal.** Nur ein flächendeckender
Nullausfall zählt als Störung.

**Fail-open in den Löschwachen ist der teuerste Fehler.** Ein früherer Entwurf
hätte rund 7.500 echte Objekte gelöscht, weil ein still geblocktes
Nordrhein-Westfalen innerhalb der 25-%-Toleranz lag. In `bestand.ts`,
`plausibilitaet.ts` und `bestandDb.ts` gilt: ein unbekannter Zustand ist
`null`/`false`, nie „in Ordnung".

**Die `\n`-Falle beim Schreiben von Dateien.** Mehrfach hat ein `\n` in einem
Python-Heredoc einen echten Zeilenumbruch mitten in eine JS-Zeichenkette
geschrieben. Bei größeren Dateien das Write-Werkzeug nehmen.

**`tsx` und `page.evaluate`.** Verschachtelte Funktionen im `evaluate`-Rumpf
brechen mit `ReferenceError: __name is not defined`. Alles flach halten.
