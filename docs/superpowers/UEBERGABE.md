# Übergabe — Stand 2026-09-08, 15:35 UTC

> **Zuerst lesen:** dieses Dokument, dann [`BACKLOG.md`](BACKLOG.md) (ausführbare
> Aufgaben) und [`TODO.md`](TODO.md) (Statuslandkarte).

Dieses Dokument soll verhindern, dass irgendetwas davon noch einmal
hergeleitet werden muss.

## Wo wir stehen

`main` = `64de963`, **nicht gepusht**, Arbeitsverzeichnis sauber. **327 Tests grün**,
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

**Den naechsten Cron-Lauf pruefen.** Vier Aenderungen dieser Sitzung sind noch
nicht in Produktion bestaetigt. Erwartet wird:

1. Die Bewertung streut ueber **alle** gesweepten Regionen statt fast nur
   `nw` und `hb` zu treffen (A7b).
2. Die Log-Zeile sagt `N von M Kandidaten in diesem Lauf bearbeitet, ueber die
   Liste gestreut` — das Wort `RUECKSTAND` kommt nicht mehr vor.
3. Kein Objekt mit einem Kaufpreisfaktor unter 3 wird als `top_treffer`
   gemeldet; solche Objekte tragen die Luecke `kaufpreis_unplausibel` (A9).
4. `zvg_id=4198` traegt binnen 7 Tagen 282.000 statt 160.000 EUR (A8).

```sql
select source, gesehene_objekte, vollstaendig, started_at
from sweep_runs order by started_at desc limit 4;

select l.fundort, count(*) from listings l
where l.source = 'immowelt' and l.updated_at > now() - interval '4 hours'
group by 1 order by 2 desc;
```

## Was in dieser Sitzung geschlossen wurde

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

**A9, der teuerste Befund** — `topTreffer` prueft den Kaufpreisfaktor nur nach
OBEN. Zwei Objekte mit falschen Preisen (2.840 € auf 198,8 m²) gingen als
`top_treffer` an den Nutzer, mit einer Bruttorendite von 571 %. **Je kaputter
die Zahl, desto besser sah das Objekt aus.**

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
