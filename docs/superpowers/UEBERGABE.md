# Übergabe — Stand 2026-09-12

> **Zuerst lesen:** dieses Dokument, dann [`ABNAHME-BASIS.md`](ABNAHME-BASIS.md)
> (woran „die Basis steht" gemessen wird), dann
> [`specs/2026-09-12-messfragen-nachtrag-funde.md`](specs/2026-09-12-messfragen-nachtrag-funde.md)
> (die einzige offene Arbeit mit Frist), dann [`BACKLOG.md`](BACKLOG.md) und
> [`TODO.md`](TODO.md).

## Wo wir stehen

`main` = `60e4da9` und **ein Commit vor `origin/main`**. Die eigentliche
Arbeit dieser Sitzung liegt **nicht auf `main`**, sondern auf dem Zweig
`blaetterung-meldedeckel-a4` (Worktree unter
`.worktrees/blaetterung-meldedeckel-a4`, sieben Commits, Arbeitsverzeichnis
sauber, **427 Tests grün**, `npx tsc --noEmit` sauber).

**Der wichtigste Satz dieser Sitzung:** Der Produktionslauf, der B-2 belegen
sollte, hat B-2 belegt **und dabei zwei Fehler sichtbar gemacht, die vorher
unerreichbar waren**. Genau das war der Grund, den Lauf zu fahren, statt
weiter zu programmieren.

| Was | Stand |
|---|---|
| **B-2** verschwundene Immowelt-Objekte | **erfüllt**, belegt am Lauf `34637349206` |
| **A-4** kein Objekt fällt still heraus | **Code steht** auf dem Zweig, Beleg durch einen Lauf fehlt |
| **D-5** Meldebudget | **weiter offen**, und die Messung sagt warum |
| Dashboard Schritt 0 (M1–M6) | **gemessen**, Nachtrag aber **nicht abgenommen** |

---

## Der Produktionslauf und was er gezeigt hat

Lauf `34637349206` auf `d4f744b`, 2026-09-11, 19:10 bis 19:58 UTC.

**B-2 ist erfüllt.** 32 Immowelt-Objekte tragen `disappeared_at` — vorher
waren es **null**. Verteilt auf `th` 13, `sl` 8, `hh` 5, `hb` 4, `be` 2. Kein
Lauf hat auf einen Schlag Hunderte markiert. `mv` und `nw` nannten ihre
Trefferzahl nicht und wurden fail-closed übergangen; die **bewusste Lücke**
besteht also weiter und trifft mit `nw` allein 21,2 % des Bestands.

### Befund 1: Die Blätterung war eine Stichprobe, keine Abfrage

Das Protokoll meldete **44** Markierungen, in der Datenbank standen **32**.
Die Differenz führte zu `ladeBekannteListings`: Es blätterte mit
`.range(von, bis)` **ohne Sortierung**. Postgres liefert dann in physischer
Reihenfolge, und jedes `UPDATE` desselben Laufs — `last_seen` für rund
10.000 gesehene Objekte — verschiebt Zeilen zwischen die Seiten.

Nachgemessen über `listings`:

| Blätterung über 12.158 Zeilen | Zeilen |
|---|---|
| doppelt geliefert | 1.762 |
| nie geliefert | 1.762 |

**Jeder Lauf sah rund 14,5 % des Bestands nicht**, jedes Mal einen anderen
Teil. Was `bekannte` nicht enthält, kann weder markiert noch entmarkiert
werden. Die Richtung war zwar fail-closed — Unsichtbares wird nicht
gelöscht —, aber jede Zahl, die auf dieser Liste beruhte, war falsch.

Behoben in `0aac237`: Keyset statt Bereich, die nächste Seite beginnt hinter
einer konkreten `id`. **Die Lehre gilt über diese Stelle hinaus: Eine
seitenweise Abfrage ohne stabile Sortierung ist keine Abfrage, sondern eine
Stichprobe.**

### Befund 2: Der Deckel lag vor dem Filter

Von 44 markierten Abgängen kamen 10 in den Deckel, und **genau eine** Meldung
ging raus. Der Grund: `budgetiereAbgangsmeldungen` deckelte **alle**
Markierungen, und erst danach filterte die Schleife auf Objekte, die je im
Chat waren. Bei 671 Meldungen auf 12.158 Objekte sind die ersten zehn
Markierungen fast nie gemeldete. Die 34 übrigen bleiben **für immer stumm**,
denn sie sind markiert und tauchen nie wieder als neuer Abgang auf.

Behoben in `3f8c7d8`: erst filtern, dann deckeln, und `verschwiegen` zählt
nur noch meldefähige Objekte.

**Nachgezogen in `749b273`, nach einem Prüffund:** Der Deckel gilt **je
Quelle**, nicht je Lauf — `gleicheBestandAb` läuft einmal für Immowelt und
einmal für ZVG. Der Docstring behauptete „je Lauf". **Entschieden: die Zahl
bleibt je Quelle, die Behauptung wurde korrigiert.** Begründung: Eine laute
Quelle darf die andere nicht verdrängen; ZVG markiert ein bis zwei Objekte je
Lauf und hätte sonst keinen Platz mehr, sobald Immowelt seinen Rückstand
abträgt. Die Konstante heißt jetzt `MAX_ABGANGSMELDUNGEN_JE_QUELLE_UND_LAUF`.
**Der Preis: ein Lauf kann bis zu 20 Abgangsmeldungen verschicken.**

---

## D-5 bleibt offen, und die Messung sagt warum

D-5 verlangt zweierlei: weniger Zurückgestellte **und** besser belegte
Objekte unter den Gesendeten. Die erste Hälfte steht — 71 auf 47. Die zweite
wurde gemessen und fiel aus:

| Lauf | gesendet | davon auf der gröbsten Mietstufe |
|---|---|---|
| `34630574787` (vorher) | 25 | **25** |
| `34637349206` (nachher) | 25 | **25** |

**Es gab schlicht keine besser belegten Kandidaten.** Beide Zeitfenster
bestanden zu 100 % aus Immowelt mit bundeslandgenauer Schätzung. Die 20
ungenutzten Plätze gingen bestimmungsgemäß über `holeNach` an die landesweite
Stufe zurück — der Mechanismus arbeitet also korrekt, er hatte nur nichts zu
tun. **Die Kontingentlogik ist an diesen Läufen weder belegt noch
widerlegt.** Ein echter Test braucht ein Fenster mit ZVG- oder PLZ-tragenden
Kandidaten.

---

## Die Messfragen sind gemessen, der Nachtrag ist nicht abgenommen

Schritt 0 des Dashboard-Entwurfs (M1 bis M6) wurde gemessen, mit den
Projektfunktionen statt mit nachgebauten Formeln — die Gegenprobe trifft bei
12.156 von 12.157 Objekten den gespeicherten Wert. Mehrere Annahmen des
Entwurfs sind damit überholt:

- **Nur ein einziges Objekt im ganzen Bestand trägt eine belegte Miete**,
  nicht zwei.
- Die angenommene Einheitenzahl bewegt **keine einzige** Schwelle. Die
  20/35-%-Deckelung begrenzt den Hebel strukturell; die Miete ist 70-mal so
  wirksam. `units_unconfirmed` bleibt Merkmal, endgültig.
- Eine Preissenkung bewegt den Rang deutlich: Median −15,9 % Preis ergab
  +539 Plätze. Anforderung 3 des Nutzers ist damit belegt.
- **148 Objekte ohne Wohnfläche tragen keine Datenlücke** und landen mit
  DSCR 0 in einer Stufe, in die sie nicht gehören. Für ein Ranking-Dashboard
  ist *geprüft und schlecht* der gefährlichste Zustand, den *nicht
  beurteilbar* annehmen kann. Die Regel ist im Entwurf ergänzt, **aber nicht
  implementiert**.

**Die Nachprüfung hat den Nachtrag jedoch nicht freigegeben:** zwei kritische
Widersprüche im Entwurf, drei wichtige Funde. Nicht die Messung ist
beanstandet, sondern was der Nachtrag daraus im Entwurf gemacht hat — unter
anderem eine Stufentabelle, die die korrigierte Regel neben den
unkorrigierten Zahlen führt, und eine 3-Tage-Schwelle, deren Begründung gegen
die eigenen Messwerte steht.

**Alle Funde stehen wörtlich in
[`specs/2026-09-12-messfragen-nachtrag-funde.md`](specs/2026-09-12-messfragen-nachtrag-funde.md).**
Die Korrekturrunde kam nicht mehr zustande: Der Agent starb am
Sitzungslimit, bevor er eine Zeile geändert hatte.

---

## Was als Nächstes zu tun ist

1. **Die Korrekturrunde am Nachtrag fahren.** Die Funddatei ist der Auftrag,
   Punkt für Punkt. **Danach erst** kann `lib/ranking.ts` geschnitten werden —
   der Entwurf ist dessen Grundlage, und ein Entwurf mit zwei Ständen
   erzeugt Code mit zwei Ständen.
2. **Die Gesamtprüfung des Zweigs fahren** (`superpowers:requesting-code-review`
   über `main..blaetterung-meldedeckel-a4`), dann mergen. Die drei
   Codeaufgaben sind einzeln geprüft und freigegeben; die Gesamtprüfung und
   der Merge fehlen. **Solange der Zweig nicht auf `main` ist, läuft die
   Produktion weiter mit der kaputten Blätterung.**
3. **Einen Produktionslauf nach dem Merge.** Er beantwortet zwei Fragen auf
   einmal: Wie viele Markierungen zeigt ein Lauf, der den **ganzen** Bestand
   sieht? Und schreibt A-4 jetzt Zeilen für Objekte ohne Preis?
4. **Danach das Dashboard** in der Reihenfolge des Entwurfs: `lib/ranking.ts`
   als reine Funktion mit TDD, dann der Snapshot-Export, und erst danach die
   erste Zeile Oberfläche.

## Entscheidungen des Nutzers, gefallen am 2026-09-11

Nicht wieder aufbringen.

| Frage | Entscheidung |
|---|---|
| Objekt ohne Preis (A-4) | **Eine `listings`-Zeile ohne `listing_versions`-Zeile.** Kein nullbares `price_cents`, keine Migration. Umgesetzt in `ea8b731` |
| Rangzahl im Dashboard (E-5) | **Der DSCR**, keine erfundene Punktzahl |
| Bundeslandgenaue Schätzungen melden (E-4) | **Ja**, mit dem Kontingent von 5 der 25 Plätze |
| Zugriffsweg des Dashboards (E-1) | **Snapshot-Export.** Keine Änderung an der Produktionsdatenbank |

## Entscheidungen des Nutzers, gefallen am 2026-09-13

| Frage | Entscheidung |
|---|---|
| Repo-Sichtbarkeit | **Öffentlich**, um die Cron-Zuverlässigkeit (A-3) zu verbessern — private Repos haben ein Actions-Minuten-Kontingent, öffentliche keins. Begründung, Sicherheitsprüfung und Ausführungsstand: [`specs/2026-09-13-repo-oeffentlich-und-dashboard-passwortschutz.md`](specs/2026-09-13-repo-oeffentlich-und-dashboard-passwortschutz.md). **Noch nicht umgesetzt** — diese Sitzung hat keinen `gh`-Zugang; braucht `gh auth login` oder `GH_TOKEN` |
| Wer darf das Dashboard sehen (E-2) | **Nur der Nutzer selbst**, nicht nur "irgendwer mit Passwort" — Einzelnutzerzugang. E-3 (Rechtsfrage, ob überhaupt öffentlich erreichbar) bleibt davon unberührt und offen |
| Wie lange bleiben Abgänge im Archiv (E-6) | **Nicht unbegrenzt.** Ein Objekt verschwindet aus dem Abgänge-Bereich, sobald **verlässlich** feststeht, dass es nicht mehr existiert — nicht schon dann, wenn ein Lauf es bloß nicht gesehen hat. "Verlässlich" heißt: ein vollständiger, nicht abgebrochener Lauf mit ausreichender Erfassungsmenge hat es nicht mehr gefunden. Das ist dieselbe Unterscheidung, die `istRegionVollstaendig`/`imGeltungsbereich` schon treffen — Schritt 6 des Entwurfs (Zustände und Frische) kann sie direkt nutzen, ohne neue Löschbefugnis in der Datenbank. **Keine Entscheidung zur echten Löschung (B1)** — nur zur Anzeige im Archiv |
| Objekte ohne Region, 54 Stück (E-7) | **Eigene, ausdrücklich beschriftete Kategorie** "Objekte ohne Region" — nicht in einen anderen Bereich einsortieren |
| Wo läuft das Dashboard, was darf es kosten (E-8) | **Muss kostenlos und stabil laufen.** Empfehlung nach kurzer Recherche (2026-09-13): **Cloudflare Pages** (Hosting des Snapshot-Exports, kostenlos, unbegrenzte Bandbreite) + **Cloudflare Access** (Zugriffsschutz, kostenlos bis 50 Nutzer, E-Mail-Einmalcode an genau die eine erlaubte Adresse — erfüllt "nur ich" strenger als ein geteiltes Passwort). Vercels eigener Passwortschutz kostet auf dem Hobby-Plan extra (Pro-Zusatzpaket 150 $/Monat); Cloudflare bietet das Äquivalent kostenlos. Noch nicht eingerichtet — es gibt noch keinen Snapshot-Export zum Hosten (Schritt 3) |

## Wie in diesem Projekt gearbeitet wird

**Festgelegt vom Nutzer am 2026-09-11, gilt für jede Iteration:**

1. Erst ein **Plan** mit `superpowers:writing-plans` für die nächsten oder
   noch offenen Tätigkeiten.
2. Dann **je Aufgabe ein eigener Agent** nach
   `superpowers:subagent-driven-development`.
3. **Jeder Agent wägt selbst ab, welche Superpower zu seiner Aufgabe passt,
   und wendet sie an.** Der Auftrag sagt ihm das ausdrücklich, gibt sie aber
   nicht vor.

Das hat in dieser Sitzung fünf Aufgaben getragen. Die Prüfung nach jeder
Aufgabe hat sich zweimal bezahlt gemacht: Sie fand den Deckel, der je Quelle
statt je Lauf gilt, und sie hat den Nachtrag zu den Messfragen gestoppt, den
ich sonst abgenommen hätte.

---

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

**Lesende Datenbankabfragen laufen lokal** und sind von der Live-Sperre nicht
betroffen. Ein fertiger Client liegt in `scraper/lib/supabase.ts`; ein
Messskript läuft mit `cd scraper && npx tsx <pfad>`. Der Worktree braucht
dafür eine Kopie von `scraper/.env`.

---

## Fallen, die schon zugeschnappt sind

**Eine seitenweise Abfrage ohne stabile Sortierung ist eine Stichprobe.**
Gemessen: 1.762 von 12.158 Zeilen doppelt, 1.762 nie. Wer `.range()` benutzt,
sortiert vorher — besser noch: blättert per Keyset.

**Nie einen Live-Lauf lokal.** [`lib/nurInCi.ts`](../../scraper/lib/nurInCi.ts)
bricht `npm run scrape` und jedes Prüfskript ohne `CI` ab. Der Anschluss des
Nutzers ist zweimal ausgefallen. Prüfungen laufen über
[`pruefung.yml`](../../.github/workflows/pruefung.yml), volle Läufe über
`gh workflow run scrape.yml --ref main`.

**Was nur im Chat steht, stirbt mit der Sitzung.** Diese Sitzung verlor einen
Agenten am Sitzungslimit, mitten in einer Korrekturrunde. Gerettet hat die
Arbeit nur, dass die Prüfungsfunde vorher als Datei ins Repo geschrieben
wurden. Befunde gehören ins Repo, sobald sie feststehen — nicht erst, wenn
sie abgearbeitet sind.

**Ein abgebrochener Agent ist nicht wertlos — erst in seinen Worktree sehen.**

**Subagenten in Worktrees brauchen `node_modules` — und `npm ci` ist dafür der
falsche Weg.** Der richtige steht in
[`scripts/worktree-node-modules.sh`](../../scripts/worktree-node-modules.sh):
Verzeichnis-Junction, Symlink, notfalls lokale Kopie, kein Netz.

**Eine Prämisse im Agentenauftrag kann selbst veraltet sein.** Wer aus einer
Doku einen Auftrag schneidet, prüft die Doku zuerst am Code.

**Ein Prüflauf gegen EINE Region kostet fast nichts und beantwortet mehr als
jede Vermutung.**

**`printf` und das Prozentzeichen.** Eine Commit-Nachricht mit `8,2 %` bricht
mitten im Satz ab. Längere Nachrichten über `git commit -F`.

**Ein Test, der am Kalender hängt, ist eine Zeitbombe.**

**Ein grüner Test beweist nichts, wenn er nie rot war.** Bei jedem Test, der
sofort grün ist: Produktionscode kurz kaputtmachen und zusehen, ob der Test
es merkt.

**Fail-open in den Löschwachen ist der teuerste Fehler.** In `bestand.ts`,
`plausibilitaet.ts`, `bestandDb.ts` und `scrapers/immowelt/index.ts` gilt: ein
unbekannter Zustand ist `null`/`false`, nie „in Ordnung". Vier Stellen sind
geschlossen. Wer eine fünfte findet, schließt sie sofort.

**Eine Messung kann einen Entwurf umwerfen — und dann muss der Entwurf
umgeschrieben werden, nicht ergänzt.** Zwei Stände nebeneinander sind
schlimmer als ein falscher: Wer später liest, kann nicht wissen, welcher gilt.

**Immowelt ist nicht gesperrt, headless wird erkannt.** `headless: true` →
HTTP 403 mit CAPTCHA; `headless: false` → 200. In CI unter `xvfb-run`.

**Ein CAPTCHA wird nicht gelöst.** Es misst eine zu hohe Abrufrate.

**Immowelt-Detailseiten (`/expose/`) sind von Rechenzentrums-Adressen gesperrt.**
Bewertung kommt aus der Titelzeile der Ergebnisliste. Deshalb gibt es keine
PLZ und die Miete ist bundeslandgenau.

**Leere Bundesländer sind bei ZVG normal.**

**Die `\n`-Falle beim Schreiben von Dateien.** Bei größeren Dateien das
Write-Werkzeug nehmen, nicht ein Heredoc.

**`tsx` und `page.evaluate`.** Verschachtelte Funktionen im `evaluate`-Rumpf
brechen mit `ReferenceError: __name is not defined`. Alles flach halten.
