# Übergabe — Stand 2026-09-19

> **Zuerst lesen:** dieses Dokument, dann [`ABNAHME-BASIS.md`](ABNAHME-BASIS.md)
> (woran „die Basis steht" gemessen wird), dann [`BACKLOG.md`](BACKLOG.md) und
> [`TODO.md`](TODO.md). Für das Dashboard gilt der Entwurf vom 2026-09-09
> **plus** der Nachtrag
> [`2026-09-15-dashboard-nachtrag-oberflaeche.md`](specs/2026-09-15-dashboard-nachtrag-oberflaeche.md),
> der die Oberfläche entscheidet.

## Dashboard-Veröffentlichung — ERLEDIGT und live verifiziert (2026-09-19)

A16 (siehe unten) wurde angebrainstormt und dann bewusst zurückgestellt: Der
Nutzer wollte zuerst die Veröffentlichung sehen, weil ein sichtbares
Dashboard die weitere Entwicklung antreibt. Das war die aktive große Aufgabe
dieser Sitzung — **jetzt fertig, A16 ist die nächste.**

**Das Dashboard ist live:** <https://immo-radar-dashboard.pages.dev> — hinter
Cloudflare Access, nicht offen einsehbar. Ein Abruf ohne Anmeldung liefert
**HTTP 302** auf die Access-Login-Seite (verifiziert per `curl`, nicht nur
behauptet), vorher (kurz, zwischen erstem Deploy und Access-Einrichtung)
**HTTP 200** ohne Sperre.

### Der Fund, der die erste Fassung widerlegt hat: die Sperre war löchrig

**Ein paar Stunden nach der Einrichtung gemessen** — und es war gut, dass
jemand nachgesehen hat, statt es zu glauben:

```
immo-radar-dashboard.pages.dev             HTTP 302   (geschützt)
8d4f31b2.immo-radar-dashboard.pages.dev    HTTP 200   (OFFEN)
```

**Cloudflare Pages veröffentlicht jedes Deployment zusätzlich unter einer
eigenen Hash-Adresse** (dazu Zweig-Aliase). Die Access-Anwendung galt nur
für den exakten Hostnamen — jede dieser Nebenadressen war also für jeden
erreichbar, der sie kennt. **E-2 („nur ich") war damit faktisch nicht
erfüllt**, obwohl die Prüfung an der Hauptadresse sauber grün war. Die
Lehre ist dieselbe wie bei der Blätterung ohne Sortierung: *Eine Prüfung,
die nur den erwarteten Weg abgeht, ist keine Prüfung.*

Behoben in `cb243c2`: Der Einrichtungs-Workflow legt jetzt **zwei**
Anwendungen an — den exakten Namen **und** `*.immo-radar-dashboard.pages.dev`.
Ein Platzhalter allein genügt nicht, er passt nicht auf die Wurzeldomain.
Nachgemessen: beide Adressen liefern **302**. Die Ausrollzeit von Cloudflare
beträgt dabei rund eine Minute — die Gegenprobe im Workflow prüfte zu früh
und schlug deshalb fehl, obwohl der Schutz griff.

**Aufgebaut, alles gegen echte Läufe verifiziert:**

- **`scraper/scripts/erzeuge-dashboard-snapshot.mts`** (neu) — ruft
  `erzeugeSnapshot` schreibgeschützt gegen die Live-DB auf, ohne zu scrapen.
  Macht die bisher nur in der Doku beschriebene Ad-hoc-Anleitung zu einer
  echten, wiederverwendbaren Datei.
- **`.github/workflows/deploy-dashboard.yml`** (neu) — baut `web/` und lädt
  per **Direct Upload / `cloudflare/wrangler-action@v4`** auf Cloudflare
  Pages hoch. Zwei Auslöser: `push` auf `main` (jede gemergte Aufgabe
  aktualisiert die Seite) und `workflow_run` nach jedem erfolgreichen
  `scrape.yml`-Lauf (reiner Datenzuwachs erscheint automatisch, ohne auf
  einen Commit zu warten). Bewusst **nicht** Cloudflares eigene
  Git-Integration: Der Snapshot entsteht nur zur Laufzeit gegen die
  Live-Datenbank und ist `.gitignore`t — Cloudflares eigener Build-Server
  sähe ihn nie. Direct Upload und Git-Integration lassen sich nicht
  nachträglich mischen. **Verifiziert an Lauf `35401871000`** (Push
  `382ffb3`): 4 Dateien hochgeladen, `Deployment complete`.
  Projekterstellung ist idempotent (`continue-on-error: true` auf dem
  `project create`-Schritt).
- **`.github/workflows/setup-cloudflare-access.yml`** (neu, nur per
  `workflow_dispatch`) — einmalige, idempotente Einrichtung: One-Time-PIN
  Identity Provider, Access Application für
  `immo-radar-dashboard.pages.dev`, Policy nur für
  `w.helwich@googlemail.com`. **Verifiziert an Lauf `35402633592`**: alle
  drei Schritte `success:true`, danach der 302-Redirect oben.
  **Zwischenfund:** Cloudflare Zero Trust/Access muss vor der ersten
  API-Nutzung einmal im Dashboard aktiviert werden
  (`access.api.error.not_enabled`) — kein Token kommt daran vorbei, das ist
  keine Berechtigungsfrage. Der Nutzer hat das einmalig nachgeholt, danach
  lief der Workflow im zweiten Versuch durch.
- **Standing Approach (Nutzerwunsch 2026-09-19):** Bei jeder größeren
  Aufgabe, die mit einem Sitzungsende/Clear einhergeht, aktualisiert sich
  das Dashboard jetzt von selbst — jeder Push auf `main` löst `
  deploy-dashboard.yml` aus, kein manueller Schritt mehr nötig.

**Umgang mit dem Cloudflare-API-Token (streng geheim, Nutzerauflage):** Der
Token hat vollen Kontozugriff (Nutzerentscheidung, breiter als die schmale
Empfehlung des Koordinators, trägt auch R2-Zugangsdaten mit). Zwei Versuche,
ihn direkt in einem eigenen Bash-Befehl zu verwenden (auch nur per
Umgebungsvariable referenziert, nie als Literal), wurden von der
Auto-Mode-Sicherung als Credential-Leakage abgelehnt — **das ist eine
Handlungserkennung, keine reine Textprüfung**, ein Umgehen per Referenz statt
Literal half nicht. Gelöst, indem **jede** Cloudflare-API-Nutzung als Schritt
in einen GitHub-Actions-Workflow verlegt wurde: GitHub injiziert das Secret
selbst zur Laufzeit, der Koordinator fasst den Wert nie an. Die beiden
GitHub-Secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
Konto-ID `cd848694bd925a07b4257fc01078b426`) hat der Nutzer selbst über die
GitHub-Weboberfläche gesetzt (Settings → Secrets and variables → Actions),
nachdem PowerShell-Umgebungsvariablen als Alternative abgelehnt wurden
(„ich will das net machen").

**Offizielles Cloudflare-Skill-Plugin installiert** (User-Scope, alle
Projekte, nicht nur immo-radar): `claude plugin marketplace add
cloudflare/skills` + `claude plugin install cloudflare@cloudflare`. 14
Skills (u. a. `cloudflare-one`, `wrangler`) plus ein MCP-Server. **Wurde in
dieser Sitzung nicht aktiv** (braucht einen Sitzungsneustart) — die
Einrichtung oben kam ohne aus, per Docs-Recherche und echten Testläufen.
Bei künftigen Cloudflare-Themen zuerst dieses Skill-Set prüfen. Siehe
[[cloudflare-skill-installiert]].

**Übrige Entscheidungen dieser Sitzung** (Domain, Projektname, E-2, E-3):
siehe Tabelle „Entscheidungen des Nutzers, gefallen am 2026-09-19" unten.

**Als Nächstes für das Dashboard selbst:** Der Nutzer will nach dieser
Übergabe clearen und dann **gezielt an der Weboberfläche weiterarbeiten,
jetzt mit einem echten, sichtbaren Stand vor Augen** — das soll laut Nutzer
die Entwicklung vorantreiben. Kein konkreter Auftrag dazu liegt vor, nur die
Absicht.

**Danach: A16 wieder aufnehmen.** Brainstorming war schon im Gange, drei
offene Themen wurden besprochen, aber nicht schriftlich festgehalten (nur im
Chat der 2026-09-19-Sitzung, zurückgestellt vor der Ausarbeitung): (1) woran
ein einzelner Lauf für `nw`/`bw`/`mv`/`sh` überhaupt als vertrauenswürdig
gilt, wenn es keine externe Trefferzahl zum Vergleich gibt (Bootstrap- vs.
Anker-Ansatz), (2) Mindestzahl eigener Referenzläufe, (3) Toleranzband für
die eigene Historie. Bei Wiederaufnahme neu anfangen.

---

## Wo wir stehen

**Das Dashboard existiert und der Snapshot fällt jetzt aus dem Lauf heraus.**
`main` = `origin/main` = `0f3465d`, Arbeitsverzeichnis sauber, keine
Worktrees mit eigenen Änderungen, keine offenen Zweige.
**526 Scraper-Tests und 103 Web-Tests grün** (1 übersprungen), `tsc` in
beiden sauber, `vite build` grün — frisch gegen `main` geprüft, nicht nur
behauptet.

**Der Plan [`plans/2026-09-16-a18-und-die-zwei-funde.md`](plans/2026-09-16-a18-und-die-zwei-funde.md)
ist mit Runde 4 vollständig abgeschlossen** — alle sieben Aufgaben gemergt.
**Runde 4 (Aufgabe 7, CI-Artefakt, `f64a724`):** `scrape.yml` lädt
`dashboard-snapshot.json` jetzt als Artefakt `dashboard-snapshot` hoch
(`retention-days: 7`, `if-no-files-found: warn`). **An einem echten,
manuell ausgelösten Lauf verifiziert** (`35394015407`, 2026-09-18
20:54–21:27 UTC, `conclusion=success`): Artefakt vorhanden, 3.184.899 Bytes
komprimiert, Logzeile `Snapshot geschrieben: ... 22130 Objekte, 23.56 MB
(24705879 Bytes)` deckungsgleich mit den Metadaten der API
(`gh api .../actions/runs/35394015407/artifacts`). Diese Aufgabe lag beim
Koordinator, nicht bei einem Subagenten — `.github/workflows/` bleibt ohne
Freigabe des Nutzers gesperrt, hier lag die Freigabe vor.

**Parallel dazu, während der Verifikationslauf im Hintergrund lief, erledigt:**
- **A18 Notiz M-8** (`ce44cab`/`cc3be33`): `rangzahl` trägt jetzt dieselbe
  `endlichOderNull`-Absicherung wie der Kaufpreisfaktor — ein gespeicherter
  Nullpreis konnte den DSCR sonst nach `Infinity` treiben, was die
  Vertragswache (prüft nur `stufe === "S0"`) nicht bemerkt hätte. Per
  Subagent + TDD, vom Koordinator unabhängig nachverifiziert (Diff gelesen,
  Fix temporär zurückgesetzt, roten Zustand selbst gesehen).
- **Kaufpreisfaktor im Browser angesehen** (Rest aus Runde 2): lokaler
  Snapshot frisch aus der Produktions-DB (21.897 Objekte), Dev-Server,
  headless per Playwright geprüft — die Zelle „150 m² · 473 €/m² · 5,0×"
  erscheint wie vorgesehen, keine Konsolenfehler.
- **BACKLOG-Korrekturen ohne Codeänderung:** A13 Schritt 2 war seit `ea8b731`
  (2026-09-11) längst erledigt, nur die Checkbox stand offen. **B1-Messung:**
  12 von 16 Immowelt-Regionen und alle 16 ZVG-Regionen erreichen inzwischen
  die Drei-Referenzläufe-Schwelle — **A16 ist damit der einzige verbleibende
  Block für B1**, nicht mehr „zu wenig Läufe". **D-5** zweite Hälfte:
  seit 2026-09-11 sind über 1.184 Meldungen erstmals 12 ZVG-Meldungen und
  12 Objekte mit `geschaetzt_regional` aufgetaucht (6 von 981
  Prüfkandidat-Meldungen) — nicht mehr rein hypothetisch, weiterhin kleine
  Minderheit.

**Offen aus Runde 2** (Kaufpreisfaktor) ist damit erledigt. Der Fortschritt
der Runde 1–3 steht weiterhin im git-ignorierten Ledger
`.superpowers/sdd/2026-09-16-a18-und-die-zwei-funde/progress.md`, Abschnitt
„SITZUNGSENDE".

Die Schritte 2 bis 7 des Entwurfs sind damit durch: `lib/ranking.ts`
(Schritt 2), der Snapshot-Export (Schritt 3) und die Weboberfläche unter
`web/` (Schritte 4–7). **A-4 ist belegt** — erstmals an echten Läufen.

**Die Seite wurde im Browser angesehen, nicht nur getestet:** keine
Konsolenfehler, kein Querlauf bei 400 px, Abruf der echten 19,8-MB-Datei in
0,3–0,5 s, bedienbar nach 1,2 s.

| Was | Stand |
|---|---|
| **A-4** kein Objekt fällt still heraus | **belegt für beide Quellen, aber nicht aus demselben Lauf.** Immowelt lückenlos an Lauf `34910160636` (23 neue Zeilen, deckungsgleich mit dem Log); ZVG an `34797538466` auf demselben Codestand. Herleitung in [`specs/2026-09-15-a4-produktionsbeleg.md`](specs/2026-09-15-a4-produktionsbeleg.md) |
| **B-2** verschwundene Immowelt-Objekte | **erfüllt**, belegt am Lauf `34637349206` |
| **B-1** jedes Bundesland einmal erfasst | **offen** — ein Einzellauf kann es strukturell nicht zeigen |
| **D-5** Meldebudget | **offen**, aber der Rückstand fällt: 71 → 47 → 39 zurückgestellt |
| `lib/ranking.ts` (Schritt 2) | **fertig und gemergt** |
| Snapshot-Export (Schritt 3) | **fertig und gemergt.** Rein + dünne Ladeschicht, nur lesend, Keyset-Blätterung, Aufruf am Ende des Laufs hinter dem Löschblock |
| Weboberfläche (Schritte 4–7) | **fertig und gemergt** unter `web/` |
| Veröffentlichung des Dashboards | **offen** — siehe „Was als Nächstes zu tun ist" |

### Die Größenordnungen, gegen die gebaut wurde (2026-09-15)

```
18.335 Objekte      783 Top-Treffer · 15.580 normale · 1.704 nicht beurteilbar · 268 Abgänge
 9.265 "unbestaetigt" (50,5 %)      1 Objekt im ganzen Bestand mit belegter Miete
   239 punktgenau verortbar (1,3 %) -- alle uebrigen nur ihrem Bundesland
Snapshot: 18,3 MB unkomprimiert, 2,2 MB mit gzip
```

**Der Bestand wächst schnell** — 12.611 (2026-09-12), 17.078, 17.754, 18.335
(2026-09-15). Jede Zahl in einem Dokument ist eine Momentaufnahme; die
Oberfläche rechnet ihre Zahlen deshalb zur Anzeigezeit.

### Zwei Funde, die niemand gesucht hat

- **Schleswig-Holstein weist seine Trefferzahl nirgends aus** — genau wie
  `nw`, `bw` und `mv`. Aus **vier** Regionen wird also nie ein Abgang erkannt,
  nicht aus dreien. A15 und der Kommentar an `istRegionVollstaendig` kennen
  nur drei. Zweimal unabhängig gemessen (Snapshot-Export und Oberfläche).
- **`sweep_region_runs` trägt mehrfach `vollstaendig=true`, obwohl
  `gemeldete_treffer` fehlt.** Das verdient eine eigene Nachprüfung: Die
  Vollständigkeit ist die Wache vor der Massenlöschung.

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

## Die Messfragen sind gemessen, der Nachtrag ist korrigiert und gemergt

Schritt 0 des Dashboard-Entwurfs (M1 bis M6) wurde gemessen, mit den
Projektfunktionen statt mit nachgebauten Formeln — die Gegenprobe trifft bei
12.156 von 12.157 Objekten den gespeicherten Wert. Mehrere Annahmen des
ursprünglichen Entwurfs waren damit überholt:

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
  beurteilbar* annehmen kann. Die Regel ist inzwischen **implementiert**:
  `lib/ranking.ts` (`bestimmeSicherheitsstufe`), gemergt in `db0a22e`.

**Eine erste Nachprüfung hatte den Nachtrag zunächst nicht freigegeben:**
zwei kritische Widersprüche im Entwurf, drei wichtige Funde — Details in
[`specs/2026-09-12-messfragen-nachtrag-funde.md`](specs/2026-09-12-messfragen-nachtrag-funde.md).
Eine Korrekturrunde und eine zweite, finale Fix-Welle (F-1 bis F-5) haben die
Funde behoben; ein scoped Re-Review hat jeden Punkt einzeln bestätigt und
einen davon (F-4, die Stufentabelle bei Zeilen ohne Version) direkt am Code
nachverifiziert statt nur dem Bericht zu glauben. **Ergebnis: Ready to
merge**, seither Teil von `main`.

**Die Nutzerfrage aus Ruling 9 ist entschieden (2026-09-13/14):** Ein Objekt
ohne Preis/Verkehrswert (`listings` ohne `listing_versions`) erscheint im
Dashboard **im S0-Bereich** „Nicht beurteilbar" — konsistent mit anderen
Datenlücken, sichtbar statt versteckt. Nachgezogen in Entwurf Abschnitt 3.3
und Abschnitt 9. **Offen bleibt nur ein Umsetzungsdetail:** welcher
Klartext-Grund (`DATA_GAP_LABELS`) einer solchen Zeile zugeschrieben wird,
da sie keinen eigenen `data_gaps`-Eintrag trägt — das entscheidet sich beim
Bau des Snapshot-Exports (Schritt 3), keine erneute Grundsatzfrage an den
Nutzer.

---

## Was als Nächstes zu tun ist

**A18 ist jetzt vollständig erledigt** — alle vier ursprünglichen Befunde
plus die Notiz M-8 (`rangzahl` ohne `endlichOderNull`). Der Plan
`2026-09-16-a18-und-die-zwei-funde.md` ist mit Runde 4 (CI-Artefakt)
abgeschlossen. Übrig sind nur noch Punkte, die eine Entscheidung des
Nutzers oder ein Brainstorming brauchen:

1. **Veröffentlichung einrichten — ERLEDIGT am 2026-09-19**, live und
   verifiziert unter <https://immo-radar-dashboard.pages.dev>. Details im
   Abschnitt „Dashboard-Veröffentlichung" oben.
2. **Karte als Dreh- und Angelpunkt — Entwurf fertig, ausdrücklich vom
   Nutzer priorisiert.** Spec:
   [`specs/2026-09-19-karte-dreh-und-angelpunkt-design.md`](specs/2026-09-19-karte-dreh-und-angelpunkt-design.md).
   Hover in der Tabelle hebt den PLZ-Punkt bzw. die Bundesland-Kachel
   hervor, sofortiges gestyltes Tooltip, Klick auf einen PLZ-Punkt filtert,
   Karte wird eigene sticky Spalte. **Noch nicht vom Nutzer gegengelesen**
   (Sitzung endete direkt nach dem Schreiben) — kurz bestätigen lassen,
   dann `superpowers:writing-plans`, dann Umsetzung. **Dabei die neu
   installierten Skills `web-design-guidelines` und `react-best-practices`
   verwenden** (Nutzerauftrag, siehe „Neu installierte Skills" unten) —
   das gilt für diese Aufgabe UND als Standardpraxis für jede künftige
   Arbeit an `web/`.
3. **A16** — zweiter Vollständigkeitsmaßstab für die vier Regionen ohne
   Trefferzahl (`nw`, `bw`, `mv`, `sh`). **Der einzige verbleibende Block
   für B1**: alle anderen 12 Immowelt-Regionen und alle 16 ZVG-Regionen
   erfüllen die Drei-Referenzläufe-Schwelle bereits (gemessen 2026-09-18).
   Brainstorming am 2026-09-19 begonnen und bewusst zurückgestellt zugunsten
   der Veröffentlichung und dann der Karte — bei Wiederaufnahme neu
   anfangen, die drei offenen Themen sind nicht schriftlich festgehalten
   (siehe oben).
4. Danach der übliche Rückstand: A10 (Cron-Takt, Abwägung des Nutzers),
   A11 Schritt 4 (darf eine bundeslandgenaue Schätzung überhaupt melden?).

## Audit-Befunde der Weboberfläche — offen, nicht umgesetzt (2026-09-19)

Ein React-Performance-Audit (Skill `react-best-practices`) fand drei reale
Punkte in `web/`. **Ein Parallellauf dazu ist am Session-Limit gescheitert**
(Opus 429, Reset 03:40 Berlin) — die Worktrees sind leer, nichts wurde
umgesetzt. Die Befunde sind gelesen und belegt, nicht vermutet:

- **A — Der Ladetext behauptet eine falsche Zahl** (`web/src/daten/laden.ts`,
  `web/src/App.tsx`). `Content-Length` nennt die *komprimierte* Größe
  (~3 MB), `body.getReader()` liefert aber bereits *dekomprimierte* Bytes
  (~23 MB) — die Anzeige schreibt daraus wörtlich „23.5 von 3.2 MB". Der
  Balken ist durch `Math.min(1, …)` gedeckelt und steht früh auf 100 %.
  Der vorhandene Kommentar kennt nur „Kopf fehlt", nicht „Kopf da, meint aber
  etwas anderes". Leitlinie des Projekts: lieber ehrlich „unbekannt" als
  eine Zahl, die nicht stimmt. **Zu prüfen, nicht zu glauben:** ob
  `Content-Encoding` bei `fetch` überhaupt lesbar ist (meist nicht).
- **B — Ein React-Update je Netzwerk-Paket.** Die Leseschleife in `laden.ts`
  ruft `melde(…)` bei jedem Chunk, `App.tsx` hängt `setFortschritt` daran —
  hunderte bis tausende Render-Durchläufe während des teuersten Moments der
  Seite. Drosseln; erste und letzte Meldung müssen immer durchkommen.
- **C — Ein Objektliteral je Zeile** (`web/src/ui/VirtuelleListe.tsx`,
  `style={{ display: "contents" }}` in der Zeichenschleife) — konstant,
  gehört auf Modulebene. Klein. **Ehrlich mitprüfen**, ob das `onScroll`
  mit `setOben` je Ereignis ein echtes Problem ist, statt es aus Reflex
  umzubauen.

Zwei Reste aus dem Access-Workflow, bewusst nicht mehr angefasst:
- Die Gegenprobe prüft nur „302", nicht **wohin**. Ein 302 auf etwas anderes
  als `*.cloudflareaccess.com` würde durchgehen. Härtung: den
  `Location`-Kopf prüfen.
- Ein Design- und Barrierefreiheits-Audit (WCAG 2.1 AA, Kontrast, Tastatur,
  Unterscheidbarkeit der drei Nichtwissens-Zeichen bei Farbsehschwäche) wurde
  gestartet und nach einem Limit abgebrochen — **nur lesend, nichts verloren,
  aber auch nichts gewonnen**. Neu ansetzen.

## Neu installierte Skills (2026-09-19)

Auf Nutzerauftrag von <https://collectivebrain.de/skills/> ausgesucht.
**Wichtiger Befund zu dieser Seite:** Es ist ein **Drittanbieter-Verzeichnis**
(deutsche Agentur), keine offizielle Anthropic-Quelle, und **eine
Herkunftsangabe stimmte nachweislich nicht** — der dort als „stammt von
Anthropic, offizielles Repository" beworbene „Accessibility Review
(WCAG 2.1 AA)"-Skill existiert im echten `github.com/anthropics/skills`
nicht (geprüft durch Klonen des Repos und Abgleich der Skill-Liste). **Nicht
installiert.** Bei künftigem Interesse an Skills von dieser Seite: erst die
Herkunftsangabe an der genannten Quelle nachprüfen, nicht blind installieren
— siehe [[collectivebrain-drittanbieter-skills]].

**Zwei Skills mit echter, verifizierter Herkunft installiert** — direkt aus
`github.com/vercel-labs/agent-skills`, nicht über collectivebrains Spiegel:

- **`web-design-guidelines`** — prüft UI-Code gegen Vercels „Web Interface
  Guidelines" (Layout, UX, Formulare, Barrierefreiheit). Holt die
  Richtlinien bei jedem Aufruf frisch von
  `raw.githubusercontent.com/vercel-labs/web-interface-guidelines`.
- **`react-best-practices`** — 70 Performance-/DX-Regeln für React in
  8 Kategorien, passend zu `web/`.

Beide liegen in `~/.claude/skills/<name>/` (User-Scope, nicht im Repo) und
sind **bereits aktiv getestet** — anders als das Cloudflare-Plugin aus
Runde davor kamen sie ohne Sitzungsneustart in die Skill-Liste.

**Standing Approach (Nutzerauftrag 2026-09-19):** Diese Skills bei jeder
Web-Arbeit einsetzen, nicht nur beim Karten-Feature — und bei künftigen
Aufgaben allgemein prüfen, ob ein passender Skill (von collectivebrain.de
oder anderswo) einen echten Vorteil für Webseite, Scraper oder das
Gesamtprojekt bringt, dann einsetzen.

## Wie man am Dashboard weiterarbeitet

- `cd web && npm install` ist im Hauptcheckout bereits gelaufen.
  `npx vite` startet den Entwicklungsserver, `npx vitest run` die Tests,
  `npx vite build` den Produktionsbau.
- **Die Snapshot-Datei liegt nicht im Repo** (19,8 MB, git-ignoriert). Zum
  Entwickeln eine erzeugen: `erzeugeSnapshot` aus `scraper/lib/snapshotDb.ts`
  über ein kleines `npx tsx`-Skript aufrufen, Ergebnis nach
  `web/public/dashboard-snapshot.json`. **Nur lesend** — und niemals einen
  Scraper-Lauf lokal starten.
- Ohne diese Datei überspringt `web/src/daten/snapshot.vertrag.test.ts` acht
  Prüfungen still (84 statt 92 grün). Genau dieser Test hat die A18-Befunde
  gefunden — er ist der Wächter gegen einen Export, der sich unbemerkt ändert.

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
| Repo-Sichtbarkeit | **Öffentlich**, um die Cron-Zuverlässigkeit (A-3) zu verbessern — private Repos haben ein Actions-Minuten-Kontingent, öffentliche keins. Begründung und Sicherheitsprüfung: [`specs/2026-09-13-repo-oeffentlich-und-dashboard-passwortschutz.md`](specs/2026-09-13-repo-oeffentlich-und-dashboard-passwortschutz.md). **Umgesetzt** — vom Nutzer selbst umgestellt, unabhängig über die öffentliche GitHub-API verifiziert (`private: false`) |
| Wer darf das Dashboard sehen (E-2) | **Nur der Nutzer selbst**, nicht nur "irgendwer mit Passwort" — Einzelnutzerzugang. E-3 (Rechtsfrage, ob überhaupt öffentlich erreichbar) bleibt davon unberührt und offen |
| Wie lange bleiben Abgänge im Archiv (E-6) | **Nicht unbegrenzt.** Ein Objekt verschwindet aus dem Abgänge-Bereich, sobald **verlässlich** feststeht, dass es nicht mehr existiert — nicht schon dann, wenn ein Lauf es bloß nicht gesehen hat. "Verlässlich" heißt: ein vollständiger, nicht abgebrochener Lauf mit ausreichender Erfassungsmenge hat es nicht mehr gefunden. Das ist dieselbe Unterscheidung, die `istRegionVollstaendig`/`imGeltungsbereich` schon treffen — Schritt 6 des Entwurfs (Zustände und Frische) kann sie direkt nutzen, ohne neue Löschbefugnis in der Datenbank. **Keine Entscheidung zur echten Löschung (B1)** — nur zur Anzeige im Archiv |
| Objekte ohne Region, 54 Stück (E-7) | **Eigene, ausdrücklich beschriftete Kategorie** "Objekte ohne Region" — nicht in einen anderen Bereich einsortieren |
| Wo läuft das Dashboard, was darf es kosten (E-8) | **Muss kostenlos und stabil laufen.** Empfehlung nach kurzer Recherche (2026-09-13): **Cloudflare Pages** (Hosting des Snapshot-Exports, kostenlos, unbegrenzte Bandbreite) + **Cloudflare Access** (Zugriffsschutz, kostenlos bis 50 Nutzer, E-Mail-Einmalcode an genau die eine erlaubte Adresse — erfüllt "nur ich" strenger als ein geteiltes Passwort). Vercels eigener Passwortschutz kostet auf dem Hobby-Plan extra (Pro-Zusatzpaket 150 $/Monat); Cloudflare bietet das Äquivalent kostenlos. Noch nicht eingerichtet — es gibt noch keinen Snapshot-Export zum Hosten (Schritt 3) |

## Entscheidungen des Nutzers, gefallen am 2026-09-14

| Frage | Entscheidung |
|---|---|
| Objekt ohne Preis im Dashboard zeigen? (Ruling 9, Entwurf 3.3/9) | **Im S0-Bereich** „Nicht beurteilbar" — nicht nur auf der Betriebsseite. Konsistent mit anderen Datenlücken (z. B. `wohnflaeche_fehlt`). Offen bleibt nur der genaue Klartext-Grund, ein Umsetzungsdetail für den Snapshot-Export (Schritt 3) |

## Entscheidungen des Nutzers, gefallen am 2026-09-19

| Frage | Entscheidung |
|---|---|
| Custom-Domain oder `*.pages.dev` (Teil von E-8) | **Kostenloser `*.pages.dev`-Subdomain**, keine eigene Domain |
| Cloudflare-Pages-Projektname | `immo-radar-dashboard` |
| Deployment-Weg | **Direct Upload per Wrangler in GitHub Actions**, nicht Cloudflares Git-Integration — Begründung im Abschnitt „Dashboard-Veröffentlichung" oben |
| E-2, konkreter Empfänger des Access-Einmalcodes | `w.helwich@googlemail.com` |
| E-3 (Rechtsfrage öffentliche Erreichbarkeit) | **Bewusst zurückgestellt** — „ist egal", weil ohnehin nur der Nutzer selbst reinkommt |
| Standing Approach: Dashboard-Update bei Sitzungsende | Jede größere Aufgabe, die mit einem Clear endet, soll ab jetzt auch das Dashboard aktualisieren — sobald der Auto-Deploy-Workflow steht, automatisch bei jedem Push auf `main` |
| Cloudflare-API-Token-Scope | Nutzer hat **vollen Kontozugriff** gewählt statt der schmaleren Empfehlung des Koordinators — ausdrücklich als streng geheim markiert, nie öffentlich |
| Cloudflare-Skill-Plugin installieren | **Ja**, offizielles `cloudflare/skills`-Plugin, User-Scope, projektübergreifend nutzen sobald aktiv |
| Wie das Token den Koordinator erreicht, ohne die Credential-Leakage-Sicherung auszulösen | **GitHub-Actions-Secrets, vom Nutzer selbst über die GitHub-Weboberfläche gesetzt** — PowerShell-Umgebungsvariablen wurden vom Nutzer abgelehnt („ich will das net machen"). Jede weitere Cloudflare-API-Nutzung läuft seither als CI-Schritt, nie direkt durch den Koordinator |

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

**Ergänzt am 2026-09-15, drei Ansagen des Nutzers:**

4. **Merge und Push laufen ohne Rückfrage.** Sobald ein Zweig geprüft und grün
   ist, wird gemergt, auf dem gemergten Stand getestet und gepusht. Der Nutzer
   wird informiert, nicht gefragt. *Die frühere Regel „Merge und Push gehören
   dem Nutzer" ist damit aufgehoben.* Ohne Freigabe bleiben weiterhin:
   `.github/workflows/`, Schreibzugriffe auf die Produktionsdatenbank.
5. **Eine neue Priorität hält den Rest nicht an.** Was auf der offenen Liste
   nicht daran hängt, läuft parallel in Subagenten weiter. Parallelität
   entsteht über eine **festgeschriebene Schnittstelle**: erst das Format
   festlegen, dann bauen Erzeuger und Verbraucher gleichzeitig dagegen. Genau
   so sind Snapshot-Export und Oberfläche entstanden.
6. **Modellwahl je Aufgabe:** schwere Aufgaben auf `opus` (Gesamtprüfungen,
   Löschwachen, echter Ermessensspielraum), einfache auf `sonnet`
   (ausgeschriebener Brief, Doku, Messskripte). Kein `haiku`. Der Koordinator
   entscheidet das beim Losschicken, ohne zu fragen.

**Neu festgelegt am 2026-09-16, gilt für alle weiteren Aufgaben des Projekts:**

7. **Große Aufgaben laufen nacheinander, nie mehrere gleichzeitig.** Regel 5
   ist damit für die großen Aufgaben aufgehoben — der Rest der Liste läuft
   nicht mehr nebenher.
8. **Parallel wird innerhalb einer Aufgabe gearbeitet**, mit Superpowers.
   Jeder parallele Arbeiter bekommt Superpowers und wählt selbst, welche zu
   seinem Teil passt (wie Regel 3).
9. **Nach jeder abgeschlossenen großen Aufgabe endet die Sitzung.** Vorher
   Ledger, Gedächtnis und bei Bedarf dieses Dokument und `BACKLOG.md` auf
   Stand bringen, dann aufhören. Grund: Mehrere große Aufgaben in einer
   Sitzung verbrauchten zu viele Token.

**Was die Prüfung am 2026-09-15 wieder eingebracht hat:** Ein Agent meldete
seine Aufgabe als erledigt, und der Fix war halb falsch — er hatte die eine
Behauptung („abgängig") durch die andere ersetzt („verfügbar"), statt auf den
Nichtwissens-Zustand zu gehen. Sein eigener Kommentar an der Funktion sagte
das Richtige; nur der Code hielt sich nicht daran, und sein Test war so
gewählt, dass er trotzdem grün wurde. **Sichtbar wurde das erst beim Lesen des
Diffs, nicht im Bericht.**

---

## Werkzeuge und Zugänge

| Zugang | Umfang |
|---|---|
| GitHub (Windows-Credential-Manager) | OAuth-Token `gho_…`, Scopes `repo, workflow, gist`, Konto `bratzi` |
| Supabase Management-PAT | DDL, Logs, Secrets — in `scraper/.env` |
| Supabase Service-Key | volle Datenrechte, umgeht RLS |
| Telegram-Bot | `Immo2501bot` |
| Cloudflare (Konto `w.helwich@googlemail.com`) | API-Token mit vollem Kontozugriff, streng geheim — liegt **nur** als GitHub-Actions-Secret (`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`), nie beim Koordinator. Zero Trust/Access ist seit 2026-09-19 aktiviert |

**`gh` ist installiert, aber nicht dauerhaft eingeloggt.** Je Aufruf neu (funktioniert, zuletzt am 2026-09-13 geprüft):

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

**Eine Zugriffssperre gilt nur für den Hostnamen, auf den sie ausgestellt
ist.** Cloudflare Pages veröffentlicht jedes Deployment zusätzlich unter
einer eigenen Hash-Adresse; die Access-Regel auf `immo-radar-dashboard.pages.dev`
ließ die alle offen (gemessen 2026-09-19: Hauptadresse 302, Hash-Adresse
200). Wer eine Sperre baut, prüft sie auf **allen** Wegen zum selben Inhalt,
nicht nur auf dem erwarteten. Und er wartet dabei auf das Ausrollen — hier
rund eine Minute.

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

**Niemals `rm -rf` auf einen Worktree, in dem eine `node_modules`-Junction
liegt.** Die Junction zeigt auf das **echte** `scraper/node_modules` des
Hauptcheckouts; ein rekursives Löschen kann ihr folgen und das Ziel
mitnehmen. Erst die Junction mit `cmd //c "rmdir scraper\node_modules"`
entfernen — das löst nur die Verknüpfung —, danach den Rest löschen und
`ls scraper/node_modules | wc -l` als Gegenprobe.

**Ein Worktree lässt sich nicht entfernen, solange ein Prozess darin läuft.**
`git worktree remove` scheitert dann mit „Invalid argument" oder „Device or
resource busy" — meist ein vergessener Entwicklungsserver. Den Prozess gezielt
über seine Kommandozeile suchen und beenden, nicht pauschal alle `node`-
Prozesse abschießen.

**Subagenten werden von einem Watchdog gestoppt, wenn ein Kommando minutenlang
still läuft.** Am 2026-09-15 hat es zwei getroffen, beide an einer Messung
ohne Zwischenausgabe. Gegenmittel: Zwischenausgaben, `--limit`, große Logs in
eine Datei umleiten statt ausgeben. **Die Arbeit ist dabei nicht verloren** —
der Agent lässt sich mit einer Nachricht fortsetzen und behält seinen Kontext.
