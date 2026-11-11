# immo-radar 2.0 — Mietwohnung in München (Entwurf)

**Stand:** 2026-11-11. **Status:** Entwurf, vom Nutzer in der Sitzung
beauftragt; die Entscheidungen unten sind seine Antworten.

## 1. Ziel

Der Nutzer sucht **privat** eine Mietwohnung in München für sich selbst. Das
Projekt soll neue Angebote schnell finden, hart filtern und sofort per
Telegram melden. Alles zu Kauf, Hausobjekten, Mehrfamilienhäusern, Rendite
und Zwangsversteigerungen entfällt vollständig, Code und Doku eingeschlossen.

**Suchprofil (Pflicht):**

| Merkmal | Regel |
|---|---|
| Ort | Stadt München (alle Stadtbezirke) |
| Art | Wohnung zur Miete, kein WG-Zimmer, keine Zwischenmiete unter 12 Monaten |
| Warmmiete | höchstens 1.300 € |
| Zimmer | mindestens 2 |
| Wohnfläche | mindestens 45 m² |
| Balkon | Pflicht (Balkon, Loggia, Terrasse oder Dachterrasse zählen) |

**Bonus (nur Reihung, kein Ausschluss):** 3 Zimmer, niedrige Warmmiete je m²,
Nähe zur Stadtmitte, Angebot jünger als 2 Stunden.

**Erfolg heißt:** ein passendes Angebot erscheint innerhalb eines Laufs nach
seiner Veröffentlichung als Telegram-Nachricht mit Link, Preis, Fläche,
Zimmern, Balkonbeleg und Stadtteil. Fehlmeldungen (kein Balkon, zu teuer)
sind der Hauptfehler, den der Entwurf vermeidet.

## 2. Entscheidungen des Nutzers vom 2026-11-11

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Budget kalt oder warm | **Warm, 1.300 €.** Fehlt die Warmmiete, wird sie als Kaltmiete + Nebenkosten gerechnet; fehlt auch das, gilt Kaltmiete × 1,25 als Schätzung und der Treffer wird als „Warmmiete geschätzt" markiert. |
| 2 | Quellen | **Immowelt, Kleinanzeigen, WG-Gesucht, ImmoScout24.** Reihenfolge: Immowelt (vorhanden), Kleinanzeigen, WG-Gesucht, ImmoScout24 (stärkster Schutz, zuletzt; zusätzlich per Suchauftrag-Mail abgesichert). Immonet und Aggregatoren (Wohnungsbörse.net, Immobilo, SZ, meinestadt, immo.de) entfallen: Dubletten. Münchner Wohnen inseriert frei finanziert über IS24/Immowelt, kein eigener Scraper. Begründung: `docs/analyse/2026-11-11-portale-muenchen.md`. |
| 3 | Datenbank | **Alle alten Tabellen löschen**, neues Schema. Telegram-Bot, Supabase-Projekt und Cloudflare-Pages-Projekt bleiben. |
| 4 | Ausführungsort | **Online, automatisiert** (Nachtrag 2026-11-11, ersetzt „lokal"). Crawl in **GitHub Actions** mit sichtbarem Chromium unter `xvfb-run`: bewährt gegen Immowelt, Secrets vorhanden, kostenlos im Rahmen. Geprüft und verworfen: Cloudflare Browser Rendering (nur headless, scheitert an DataDome), Apify/Firecrawl (Kosten, fremde Proxy-Infrastruktur). Agentische Aufgaben laufen als **Claude-Routinen** in der Cloud (Abschnitt 8). Lokal nur Tests. |
| 5 | Takt | **Nach Tageszeit** (Messung und Studien, siehe Analyse): Mo–Fr 8–14 Uhr alle 15 min; täglich 18–23 Uhr alle 15 min (Privatvermieter); sonst 7–23 Uhr alle 30 min; 23–7 Uhr alle 2 h. Nach vier Wochen aus eigenen Daten neu einstellen. |

## 3. Was bleibt, was geht

**Bleibt (Infrastruktur, bewährt):**

- Playwright mit sichtbarem Chromium unter `xvfb-run` in GitHub Actions; Browserprofil je Quelle per `actions/cache` zwischen Läufen erhalten (Cookies, Consent). Immowelt sperrt headless (HTTP 403, DataDome). Ein CAPTCHA wird nicht gelöst, sondern als Sperrsignal gewertet.
- `lib/nurInCi.ts` bleibt (keine Live-Läufe am privaten Anschluss). `concurrency` im Workflow verhindert überlappende Läufe; Drossel nach 4.11. Takt aus Entscheidung 5 als mehrere `cron`-Zeilen.
- Supabase als Datenbank, Zugriff nur mit `service_role`, RLS ohne Policies.
- Telegram-Versand (`lib/telegram.ts`: `sendTelegramMessage`, `sendTelegramPhotos`, Mediengruppen).
- Consent- und Overlay-Behandlung (`scrapers/consent.ts`, `scrapers/overlays.ts`).
- Blätterlogik und Detail-Urteil des Immowelt-Scrapers (`blaettereWeiter`, `beurteileDetailAntwort`).
- Dashboard: Vite + React, Snapshot-JSON aus der Datenbank, Cloudflare Pages hinter Access (nur die E-Mail des Nutzers). Virtuelle Liste und Filterleiste werden umgebaut, nicht neu geschrieben.
- Workflows `scrape.yml`, `deploy-dashboard.yml`, `pruefung.yml`; Secrets unverändert.

**Geht (Fachlogik der alten Aufgabe):**

- `lib/metrics.ts`, `rentEstimate.ts`, `grunderwerbsteuer.ts`, `meldung.ts`, `meldebudget.ts`, `ranking.ts`, `regionsMassstab.ts`, `plausibilitaet.ts`, `bestand.ts`, `bestandDb.ts`, `snapshot*.ts` in jetziger Form.
- `scrapers/zvg-portal/` komplett.
- Regionsrotation, Vollständigkeitsmaßstäbe, Hochwassermarken, Sweep-Historie, Löschhoheit, Karenz, Mengenplausibilität. Begründung: diese Wachen schützten einen Bestand von 23.000 Zeilen vor Massenlöschung. Der neue Bestand ist ein paar hundert Angebote groß und wird je Lauf vollständig neu gesehen. Ein Angebot, das zwei Läufe fehlt, gilt als weg. Mehr braucht es nicht.
- Deutschlandkarte, PLZ-Bundesland-Tabellen, Mietprüfdaten.
- Alle alten Specs und Pläne wandern nach `docs/archiv/2026-09-mehrfamilienhaus/`. `BACKLOG.md`, `TODO.md`, `UEBERGABE.md`, `ABNAHME-BASIS.md` werden neu geschrieben.

## 4. Architektur

```
scraper/
  main.ts                 Lauf: alle Quellen sweepen -> Kandidaten filtern
                          -> Details nur für Unklare -> neue Treffer melden
                          -> Abgänge markieren -> Snapshot schreiben
  lib/
    profil.ts             DAS Suchprofil als Konstante + reine Filterfunktion
                          pruefeProfil(angebot) -> { passt, gruende[] }
    warmmiete.ts          Warmmiete bestimmen: angegeben / kalt+NK / geschätzt
    balkon.ts             Balkonbeleg aus Merkmalsliste, Titel, Beschreibung
    reihung.ts            Punkte für Bonusmerkmale, stabile Sortierung
    angebote.ts           Tabelle angebote: upsert, zuletzt gesehen,
                          verschwunden, bereits gemeldet
    meldung.ts            Telegram-Text für Treffer / Preissenkung
    lauf.ts               Tabelle laeufe: je Quelle gesehen, gefiltert,
                          gemeldet, Dauer, Fehler
    snapshot.ts           Dashboard-JSON
    nurInCi.ts, nebenlaeufig.ts, supabase.ts, telegram.ts (bleiben)
  scrapers/
    typen.ts              Angebot (gemeinsames Modell aller Quellen)
    immowelt/             Mietsuche München, Liste + Detail
    kleinanzeigen/        Liste + Detail
    wg-gesucht/           Kategorie 2- bis 3-Zimmer-Wohnung, Liste + Detail
    immoscout24/          Liste + Detail, mit Abbruch bei Sperre
    consent.ts, overlays.ts (bleiben)
web/                      Dashboard: Trefferliste, Filter, Stadtkarte München
```

### 4.1 Gemeinsames Angebotsmodell

```ts
interface Angebot {
  quelle: "immowelt" | "kleinanzeigen" | "wg-gesucht" | "immoscout24";
  externalId: string;
  url: string;
  titel: string;
  kaltmieteCents: number | null;
  nebenkostenCents: number | null;
  warmmieteCents: number | null;
  warmmieteQuelle: "angegeben" | "kalt_plus_nk" | "geschaetzt" | "unbekannt";
  zimmer: number | null;
  flaecheM2: number | null;
  balkon: "ja" | "nein" | "unbekannt";
  balkonBeleg: string | null;      // der Textschnipsel, der "ja" begründet
  plz: string | null;
  stadtteil: string | null;
  verfuegbarAb: string | null;
  befristet: boolean | null;
  bildUrls: string[];
  veroeffentlichtAm: string | null;
  detailGeladen: boolean;
}
```

### 4.2 Datenfluss je Lauf

1. **Sweep je Quelle**, nacheinander, Drossel nach 4.11. Gelesen wird zuerst eingebettetes JSON (JSON-LD, Next.js-Daten, Kleinanzeigen-Detail-JSON mit `sortingDate`, `commercial`), Selektoren nur als Rückfall. Die Suchfilter der Portale übernehmen Ort, Miete, Zimmer, Fläche vorab; der Code prüft trotzdem jedes Feld selbst. Portalfilter sind Vorauswahl, nicht Beleg.
2. **Profilprüfung auf Listendaten.** Eindeutig raus (zu teuer, zu klein, 1 Zimmer): verwerfen, nicht speichern. Eindeutig rein: weiter. Unklar (Balkon unbekannt, Warmmiete fehlt): Detailseite laden.
3. **Detailseiten** nur für Unklare und für neue Treffer (Bilder, Beschreibung). Budget 10 Minuten je Lauf.
4. **Abgleich mit `angebote`:** „neu" heißt ausschließlich: `(quelle, external_id)` noch nicht in der Tabelle. Zeitstempel der Portale entscheiden das nie, weil Kleinanzeigen gewerbliche Inserate stündlich hochschiebt (Messung: alte Inserate mit Zeit :05–:07). Sonst: bekannt, Preis gesunken, nicht mehr gesehen. Ein Angebot, das in zwei aufeinanderfolgenden vollständigen Sweeps seiner Quelle fehlt, bekommt `verschwunden_am`. Keine harte Löschung im Lauf; ein Monatsjob räumt Verschwundenes älter als 60 Tage.
5. **Meldung:** jeder neue Treffer sofort, höchstens 15 je Lauf (Rest im nächsten Lauf, Reihung entscheidet). Preissenkung bei bekanntem Treffer: eine Zeile. Kein Abgangsalarm per Telegram, Abgang nur im Dashboard.
6. **Lauf protokollieren**, Snapshot schreiben.

### 4.3 Profilprüfung (`lib/profil.ts`)

Reine Funktion, vollständig testbar. Gibt `passt: "ja" | "nein" | "unklar"`
und Gründe zurück. Regeln:

- Warmmiete über 130.000 Cents: raus. Null: unklar.
- Zimmer unter 2: raus. Null: unklar.
- Fläche unter 45: raus. Null: unklar.
- Balkon „nein": raus. „unbekannt": unklar.
- Befristet unter 12 Monaten oder WG-Zimmer: raus.
- PLZ außerhalb 80331 bis 81929: raus (Münchner Stadtgebiet). Null: unklar.

„Unklar" nach geladener Detailseite wird zu „raus" bei Balkon und Warmmiete
(ohne Beleg keine Meldung) und zu „rein mit Hinweis" bei PLZ, wenn der
Stadtteil erkennbar ist.

### 4.4 Balkonbeleg (`lib/balkon.ts`)

Quellen in dieser Reihenfolge: strukturierte Ausstattungsliste des Portals,
Titel, Beschreibung. Positiv: `balkon`, `loggia`, `terrasse`,
`dachterrasse`, `südbalkon`, `westbalkon` und ähnliche. Negativ-Muster
gewinnen: `kein balkon`, `ohne balkon`, `balkon nicht vorhanden`,
`französischer balkon` (zählt nicht). Der Treffer-Schnipsel wird gespeichert
und in der Telegram-Nachricht gezeigt, damit der Nutzer den Beleg selbst sieht.

### 4.5 Reihung (`lib/reihung.ts`)

Punkte, höher ist besser: 3 und mehr Zimmer +30; Warmmiete je m² unter 22 €
+20, unter 25 € +10; Stadtteil in Ring 1 (Altstadt, Maxvorstadt, Schwabing,
Haidhausen, Au, Isarvorstadt, Ludwigsvorstadt, Neuhausen, Glockenbach) +15,
Ring 2 +5; jünger als 2 Stunden +10; Warmmiete angegeben +5. Reihung
bestimmt nur die Reihenfolge der Meldungen, nie den Ausschluss.

### 4.6 Quellen

| Quelle | Einstieg | Besonderheit |
|---|---|---|
| Immowelt | `immowelt.de/suche/muenchen/wohnungen/mieten` mit Parametern Zimmer ab 2, Fläche ab 45, Miete bis 1.300 | sichtbarer Browser, 5 s Drossel, DataDome |
| Kleinanzeigen | Kategorie Mietwohnungen, Ort München, Preis bis 1.300, Zimmer ab 2 | Warmmiete fehlt oft, Nebenkosten im Detail |
| WG-Gesucht | Kategorie 2- und 3-Zimmer-Wohnungen, Stadt München | viele Zwischenmieten, Befristung aus Detail lesen |
| ImmoScout24 | Suche Wohnung mieten München | harter Bot-Schutz; bei 403 oder CAPTCHA bricht die Quelle ab, der Lauf läuft weiter, `laeufe` vermerkt „gesperrt" |

Jede Quelle liefert `Angebot[]` und `{ vollstaendig: boolean }`. Nur
vollständige Sweeps zählen für Abgänge.

### 4.7 Schema (neu, `schema.sql`)

```sql
drop table if exists notifications, listing_versions, listings, sweep_runs,
  sweep_region_runs, rent_estimates cascade;

create table angebote (
  id uuid primary key default gen_random_uuid(),
  quelle text not null,
  external_id text not null,
  url text not null,
  titel text,
  kaltmiete_cents integer,
  nebenkosten_cents integer,
  warmmiete_cents integer,
  warmmiete_quelle text not null default 'unbekannt',
  zimmer numeric,
  flaeche_m2 numeric,
  balkon text not null default 'unbekannt',
  balkon_beleg text,
  plz text,
  stadtteil text,
  verfuegbar_ab text,
  befristet boolean,
  bild_urls text[] not null default '{}',
  veroeffentlicht_am timestamptz,
  passt text not null,                 -- 'ja' | 'nein' | 'unklar'
  gruende text[] not null default '{}',
  punkte integer not null default 0,
  erstmals_gesehen timestamptz not null default now(),
  zuletzt_gesehen timestamptz not null default now(),
  verschwunden_am timestamptz,
  detail_geladen_am timestamptz,
  gemeldet_am timestamptz,
  letzte_warmmiete_gemeldet_cents integer,
  unique (quelle, external_id)
);

create table laeufe (
  id uuid primary key default gen_random_uuid(),
  gestartet_am timestamptz not null default now(),
  quelle text not null,
  gesehen integer not null,
  passend integer not null,
  unklar integer not null,
  gemeldet integer not null,
  vollstaendig boolean not null,
  status text not null,                -- 'ok' | 'gesperrt' | 'fehler'
  dauer_ms integer,
  hinweis text
);
```

Die Migration läuft über einen einmaligen Workflow `reset-datenbank.yml`
(SQL per Supabase-Management-API, Secret vorhanden), nicht lokal: der
Auto-Modus sperrt Schreibzugriffe auf die Live-Datenbank.

### 4.8 Telegram-Nachricht

```
Treffer · Schwabing-West · 1.240 € warm
2,5 Zi · 52 m² · 23,8 €/m² warm · Balkon ja („sonniger Südbalkon")
frei ab 01.01.2027 · Immowelt · vor 40 min
https://…
```

Danach bis zu 10 Bilder als Mediengruppe. „Warmmiete geschätzt" steht als
eigene Zeile, wenn zutreffend.

### 4.9 Dashboard

Eine Seite: Trefferliste (passend, sortiert nach Punkten), Reiter
„Unklar" und „Verschwunden", Filter nach Quelle, Zimmer, Stadtteil, Preis.
Karte: Münchner Stadtgebiet mit Punkten je Treffer (PLZ-Mittelpunkte der
Münchner Postleitzahlen als Tabelle im Repo). Betriebstafel: letzter Lauf je
Quelle, Status, gesehen und gemeldet.

### 4.10 Betrieb

- `scrape.yml`: `cron "17,47 * * * *"`, Timeout 25 Minuten, Budgets: Sweep
  3 Minuten je Quelle, Details 10 Minuten gesamt.
- `deploy-dashboard.yml`: unverändert, läuft nach jedem Scrape.
- `pruefung.yml`: `pruefe-quelle -f quelle=immowelt` zeigt Liste und
  Profilurteil ohne Datenbank und Telegram.
- Lokal: `npm test`, `tsc --noEmit`, Fixtures aus echten Seiten im Repo.

## 5. Fehlerbehandlung

- Eine gesperrte oder kaputte Quelle stoppt nie den Lauf. Sie wird in
  `laeufe` mit Status vermerkt; drei gesperrte Läufe in Folge ergeben eine
  Telegram-Warnung, danach Ruhe bis zum nächsten Erfolg.
- Kein Feld wird geraten, außer Warmmiete (markiert). Unbelegter Balkon
  meldet nicht.
- Doppelte Angebote über Quellen (gleiches Objekt bei Immowelt und
  ImmoScout24) werden nicht zusammengeführt. Bewusst: Erkennung ist unsicher,
  eine Doppelmeldung kostet weniger als eine verschluckte.

## 6. Tests

- `profil`, `warmmiete`, `balkon`, `reihung`: Tabellen-Tests, reine Funktionen.
- Je Scraper: Parser-Tests gegen HTML-Fixtures aus `scraper/test/fixtures/<quelle>/`, aufgenommen in CI über `pruefung.yml`.
- `main`: Pipeline-Test mit gefälschten Quellen und gefälschter Datenbank (bestehendes Muster aus `pipeline.test.ts`).
- Dashboard: Snapshot-Vertragstest bleibt, Inhalt angepasst.

## 7. Reihenfolge der Umsetzung

1. Reset: Archiv, altes Schema fällt, neues Schema per Workflow, Doku neu.
2. Kern: `typen.ts`, `profil.ts`, `warmmiete.ts`, `balkon.ts`, `reihung.ts`, `angebote.ts`, `meldung.ts`, `main.ts` mit einer Fake-Quelle grün.
3. Immowelt umbauen, erster Produktionslauf, erste Telegram-Treffer.
4. Dashboard umbauen.
5. Kleinanzeigen, WG-Gesucht, ImmoScout24 nacheinander, jede mit eigenem Prüflauf.

Ab Schritt 3 liefert das Projekt Nutzen; Schritt 5 ist Ausbau.

### 4.11 Schutzmaßnahmen der Portale und unser Umgang damit

Erkannt per Messung 2026-11-11 (Details in der Analyse):

| Quelle | Schutz | Umgang |
|---|---|---|
| ImmoScout24 | AWS CloudFront + WAF, 401 ohne Browser | sichtbarer Browser; bei Sperre Abbruch; Suchauftrag-Mail als Rückfall |
| Immowelt | CloudFront + DataDome | sichtbarer Browser, eigenes Profil |
| Kleinanzeigen | Akamai Bot Manager | sichtbarer Browser, eigenes Profil |
| WG-Gesucht | eigenes CAPTCHA bei schnellem Takt | sichtbarer Browser, langsamer Takt |

Regeln für alle Quellen, fest im Code (`lib/laufsperre.ts`, `scrapers/sperre.ts`):

- Ein Tab, keine Parallelität je Quelle; Quellen nacheinander.
- 4–8 s zufälliger Abstand je Seite; höchstens 5 Listenseiten und 15 Detailseiten je Quelle und Lauf.
- Sperrerkennung je Antwort: HTTP 401/403/429, DataDome-, Akamai- oder WAF-Challenge, CAPTCHA-Seite. Dann: Quelle sofort stoppen, `laeufe.status = 'gesperrt'`, Pause 2 h, beim zweiten Mal 6 h, beim dritten Mal Telegram-Hinweis und Pause bis zum nächsten Tag.
- Nicht eingesetzt: Proxys, Fingerprint-Veränderung, CAPTCHA-Löser, Umgehung von Challenges.

## 8. Neu gedacht mit den aktuellen Claude-Funktionen

Das Projekt nutzt nicht nur Claude Code als Programmierwerkzeug, sondern die
agentischen Funktionen als Teil des Betriebs. Feste Arbeit (Crawlen, Filtern,
Melden) bleibt deterministischer Code ohne Sprachmodell; Claude übernimmt,
was Urteil braucht.

| Funktion | Einsatz im Projekt |
|---|---|
| **Claude-Routinen** (geplante Cloud-Agenten, Skill `schedule`) | Wöchentlich: Takt aus `erstmals_gesehen` je Stunde/Wochentag neu ausrechnen und als PR vorschlagen. Täglich: `laeufe` prüfen; fällt eine Quelle 3× aus oder liefert 0, Parser gegen frische Seite reparieren und PR öffnen. |
| **Subagenten und parallele Agenten** | Je Quelle ein Agent für Parser, Fixtures und Tests; Recherche-Agenten für neue Portale. Modellwahl: Opus für Architektur und Parser-Reparatur, Sonnet für Routine. |
| **Skills (Superpowers u. a.)** | `brainstorming` → `writing-plans` → `subagent-driven-development` → `test-driven-development` → `requesting-code-review` → `verification-before-completion` als feste Kette; `investigate-first` bei Parserbrüchen. |
| **Artifact mit Datenbank** (`db`-Fähigkeit) | Ergänzt das Pages-Dashboard: privates Artifact „Wohnungsradar" mit Trefferliste und Merkliste. Der Nutzer markiert „angefragt / Besichtigung / abgesagt"; der Status liegt in der Artifact-Datenbank und fließt in die Reihung zurück (Abgesagtes nicht erneut melden). |
| **Artifact fragt Claude** | Knopf „Anschreiben entwerfen" je Treffer: Claude schreibt eine Anfrage an den Vermieter aus Inserat und Nutzerprofil. Versendet wird nie automatisch, nur vom Nutzer. |
| **Claude Docs** | Lebende Projektdoku (Übergabe, Stand, Entscheidungen) statt verstreuter Markdown-Dateien; Kommentare des Nutzers dort steuern die nächste Sitzung. |
| **Eingebauter Browser** | Recherche, Fixtures aufnehmen, Dashboard prüfen, Messungen wie die Kleinanzeigen-Zeitstempel. |
| **Claude in Chrome** | Nur wo die echte Anmeldung des Nutzers nötig ist (Suchaufträge, Konto bei ImmoScout24). |
| **PR-Auto-fix und Code-Review** | Jede Änderung als PR; CI-Fehler und Review-Kommentare behebt Claude automatisch. |
| **Telegram** | Bleibt der schnelle Meldeweg (Push in Sekunden). |

Grenze: Claude-Funktionen kommen nie in den 15-Minuten-Lauf selbst. Der Lauf
bleibt schnell, billig und testbar; Claude wirkt um ihn herum.

## 9. Gemini-Vorlage, übersetzt und eingeordnet

Der Nutzer hatte vorab mit Gemini eine Agenten-Instruktion entworfen. Hier jeder
Punkt in Klartext und was davon im Projekt gilt.

| Gemini sagt | Gemeint ist | Im Projekt |
|---|---|---|
| Autonomer Lead-Entwickler, Plan-Act-Observe | Claude plant, baut, prüft selbst in Schleifen | **übernommen**: Spec → Plan → Subagenten → Tests → Review, je Task ein Commit |
| `planning.md` vor dem Code bestätigen | erst Plan, dann bauen | **übernommen** als Spec + Plan in `docs/superpowers/` |
| `progress.md` für Folgesitzungen | Übergabe zwischen Sitzungen | **übernommen** als `UEBERGABE.md`, später Claude Docs |
| Sonnet für Scraping/Extraktion, Opus für Architektur | Modell nach Schwere wählen | **übernommen**, siehe 9.1 |
| MCP-Server und Skills einbinden, auch von GitHub | Werkzeuge erweitern | **teilweise**: nur geprüfte Skills; crawl4ai-MCP und Firecrawl verworfen (Kosten, Python, Stealth-Kern) |
| Lokale Chrome-Instanz steuern | echter Browser statt Bot | **angepasst**: sichtbarer Chromium in Actions; eingebauter Browser für Analyse; Claude in Chrome nur mit Anmeldung |
| MCP 2.0, lange Läufe im Hintergrund | nicht blockieren | **übernommen** als Hintergrund-Agenten, Routinen, Actions |
| HTML → Markdown, token-sparend | Seiten fürs Modell kürzen | **besser gelöst**: im Lauf gar kein Modell; JSON/Selektoren lesen, null Token |
| JSON-First statt CSS-Selektoren | eingebettete Daten lesen | **übernommen** (4.2, Plan-Nachtrag 3) |
| Pydantic-Schemata | festes Datenmodell | **übernommen** als TypeScript `Angebot` (4.1) |
| SQLite/DuckDB lokal | Datenbank | **ersetzt** durch Supabase, weil der Lauf online ist |
| Hash-Matching über Portale | Dubletten erkennen | **teilweise**: Dubletten werden nur markiert („auch bei …"), nicht zusammengeführt (Abschnitt 5) |
| Suchprofile als JSON, Match-Score | Profil und Reihung | **übernommen**: `profil.ts` + `reihung.ts`; Profil als JSON in Plan 2 |
| Artifacts / Claude Data / Sheets als Dashboard | Ansicht in der Claude-App | **übernommen** als Artifact „Wohnungsradar" mit Datenbank (Abschnitt 8) |
| WAF-Bypass, Residential-Proxys, Tarnung | Bot-Schutz umgehen | **nicht übernommen**. Stattdessen Drossel, Sperrerkennung, Pause (4.11) |

### 9.1 Modellwahl je Aufgabe

| Aufgabe | Modell | Warum |
|---|---|---|
| Spec, Architektur, Schema, Parser-Reparatur bei unbekanntem Bruch | **Opus 5.5** | braucht Urteil über viele Dateien |
| Routine-Tasks aus fertigem Plan, Tests, Doku, Fixture-Updates | **Sonnet 5.5** | Plan ist eindeutig, schnell und günstig |
| Recherche-Agenten (Portale, Markt) | **Sonnet 5.5**, bei Widersprüchen Opus | viel Lesen, wenig Urteil |
| Wöchentliche Takt-Routine | **Sonnet 5.5** | Rechnen + PR |
| Anschreiben an Vermieter (Artifact) | **Sonnet 5.5** | kurzer Text |
| 15-Minuten-Lauf | **kein Modell** | deterministischer Code |

Haiku wird nicht eingesetzt (Nutzervorgabe).

### 9.2 Token sparen

- **Kein Modell im Lauf.** Größter Hebel: tausende Seiten pro Tag kosten null Token.
- **Subagenten** lesen große Dateien und Seiten in eigenem Kontext und liefern nur
  den Bericht zurück; der Hauptkontext bleibt klein.
- **Skills laden erst bei Bedarf** statt Anleitungen in jeden Prompt.
- **Prompt-Caching** für Routinen und das Artifact: fester Systemteil (Profil,
  Regeln) wird gecacht, nur das Inserat ist neu.
- **Batch-Verarbeitung** für nicht eilige Routinen (wöchentliche Analyse): halbe
  Kosten, Ergebnis in Stunden reicht.
- **Strukturierte Ausgaben** (JSON-Schema) statt Freitext, wo Code weiterliest.
- **Kurze Berichte**: Agentenaufträge mit Wortlimit; Kommunikationsstil knapp.
- **Fixtures statt Live-Seiten** für Tests und Reparatur: einmal holen, oft lesen.
