# München-Miete, Plan 1: Reset, Kern, Immowelt — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Projekt vom Mehrfamilienhaus-Kauf auf die Suche nach einer Münchner Mietwohnung umstellen und mit Immowelt als erster Quelle produktiv melden.

**Architecture:** Alte Fachlogik und ZVG fliegen raus, Infrastruktur (Playwright headfull in CI, Supabase, Telegram, Workflows) bleibt. Neuer Kern aus reinen Funktionen (`profil`, `warmmiete`, `balkon`, `reihung`) über einem gemeinsamen Modell `Angebot`; `main.ts` orchestriert Quellen, Abgleich und Meldung. Dashboard bekommt in diesem Plan nur eine Minimalseite, der volle Umbau ist Plan 2; Kleinanzeigen, WG-Gesucht, ImmoScout24 sind Plan 3.

**Tech Stack:** TypeScript (ESM, Node 22), Playwright + cheerio, vitest, Supabase (PostgREST + Management-API), Telegram Bot API, GitHub Actions, Vite + React.

**Spec:** `docs/superpowers/specs/2026-11-11-muenchen-mietwohnung-design.md`

## Global Constraints

- Kein Live-Abruf lokal. Jedes Skript, das ein Portal anspricht, ruft `nurInCiAusfuehren` auf. Live-Prüfungen laufen über `gh workflow run pruefung.yml`.
- Chromium `headless: false` unter `xvfb-run`. Ein CAPTCHA wird nicht umgangen.
- TDD: Test zuerst, rot sehen, dann Umsetzung. Vor jeder Erfolgsmeldung `cd scraper && npx vitest run && npx tsc --noEmit`.
- Schreibzugriffe auf die Live-Datenbank nur aus GitHub Actions. Lokal nie.
- Warmmiete-Grenze `130_000` Cents, Zimmer ≥ 2, Fläche ≥ 45, Balkon Pflicht, PLZ 80331 bis 81929.
- Kein Feld wird geraten, außer Warmmiete (dann `warmmieteQuelle: "geschaetzt"`).
- Persistierte Texte (Code-Kommentare, Commits, Doku) in normalem Deutsch; Umlaute in Dateinamen und Bezeichnern vermeiden (`flaeche`, nicht `fläche`).
- Commits enden mit `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **Kaltmiete-Karte ohne Warmmiete** auf der Immowelt-Liste: darf nicht als „passt" gemeldet werden, muss „unklar" werden und die Detailseite laden (Test in Task 5 und Task 12).
2. **„Französischer Balkon"** in der Beschreibung: zählt nicht als Balkon, auch wenn das Wort „Balkon" vorkommt (Test in Task 7).
3. **Zimmerangabe „2,5"** mit Komma und „2 Zi." in Titelzeile: muss als 2,5 bzw. 2 gelesen werden, nie als 25 (Test in Task 11).
4. **PLZ 85xxx (Umland, z. B. Unterhaching)** in einer Münchner Suche: raus, nicht unklar (Test in Task 5).
5. **Zweiter Lauf sieht dasselbe Angebot**: keine zweite Telegram-Meldung; nur bei gesunkener Warmmiete eine Preiszeile (Test in Task 9 und 13).

---

## Dateistruktur nach Plan 1

```
scraper/
  main.ts                       neu geschrieben
  lib/
    typen.ts                    Angebot, Quelle, Profilurteil
    profil.ts (+test)           pruefeProfil
    warmmiete.ts (+test)        bestimmeWarmmiete
    balkon.ts (+test)           erkenneBalkon
    muenchenPlz.ts (+test)      istMuenchen, ringFuerPlz, stadtteilFuerPlz
    reihung.ts (+test)          berechnePunkte, sortiereTreffer
    angebote.ts (+test)         DB-Zugriff Tabelle angebote
    lauf.ts (+test)             DB-Zugriff Tabelle laeufe
    meldung.ts (+test)          formatTrefferMessage, formatPreissenkungMessage
    snapshot.ts (+test)         baueSnapshot (minimal)
    nurInCi.ts, nebenlaeufig.ts, supabase.ts, telegram.ts   bleiben
  scrapers/
    quelle.ts                   Interface Quelle { name, sweep(page, budget) }
    immowelt/list.ts (+test)    parseImmoweltMietliste
    immowelt/detail.ts (+test)  parseImmoweltMietdetail
    immowelt/index.ts           sweepImmoweltMiete, ladeImmoweltDetails
    consent.ts, overlays.ts     bleiben
  scripts/
    pruefe-quelle.mts           Liste + Urteil ohne DB/Telegram, speichert HTML
    reset-datenbank.mts         schema.sql per Management-API einspielen
  test/fixtures/immowelt/
    mietliste-muenchen.html, mietdetail-mit-balkon.html, mietdetail-ohne-balkon.html
schema.sql                      neu
.github/workflows/
  scrape.yml                    cron 17,47 * * * *
  pruefung.yml                  pruefe-quelle, lädt Fixtures als Artefakt hoch
  reset-datenbank.yml           einmalig, workflow_dispatch
docs/archiv/2026-09-mehrfamilienhaus/   alte Specs, Pläne, BACKLOG, TODO, UEBERGABE
docs/superpowers/{UEBERGABE,BACKLOG,TODO}.md   neu
README.md                        neu
web/src/App.tsx                  Minimalliste (Plan 2 baut das Dashboard)
```

---

### Task 1: Altes archivieren, Doku-Grundgerüst

**Files:**
- Move: `docs/superpowers/specs/2026-09-*.md`, `docs/superpowers/plans/2026-09-*.md`, `docs/superpowers/{BACKLOG,TODO,UEBERGABE,ABNAHME-BASIS}.md` nach `docs/archiv/2026-09-mehrfamilienhaus/`
- Create: `docs/superpowers/UEBERGABE.md`, `docs/superpowers/BACKLOG.md`, `docs/superpowers/TODO.md`, `README.md` (überschreiben)

- [ ] **Step 1: Archiv anlegen und verschieben**

```bash
mkdir -p docs/archiv/2026-09-mehrfamilienhaus/{specs,plans}
git mv docs/superpowers/specs/2026-09-*.md docs/archiv/2026-09-mehrfamilienhaus/specs/
git mv docs/superpowers/plans/2026-09-*.md docs/archiv/2026-09-mehrfamilienhaus/plans/
git mv docs/superpowers/BACKLOG.md docs/superpowers/TODO.md docs/superpowers/UEBERGABE.md docs/superpowers/ABNAHME-BASIS.md docs/archiv/2026-09-mehrfamilienhaus/
```

- [ ] **Step 2: README.md neu schreiben**

Inhalt (vollständig ersetzen):

```markdown
# immo-radar

Sucht eine Mietwohnung in München und meldet passende Angebote per Telegram.

**Profil:** Warmmiete bis 1.300 €, mindestens 2 Zimmer, mindestens 45 m²,
Balkon Pflicht, Stadtgebiet München. 3 Zimmer sind ein Bonus in der Reihung.

Entwurf: `docs/superpowers/specs/2026-11-11-muenchen-mietwohnung-design.md`.
Der frühere Zweck (Mehrfamilienhäuser, Zwangsversteigerungen) liegt in
`docs/archiv/2026-09-mehrfamilienhaus/`.

## Aufbau

    scraper/main.ts         Lauf: Quellen sweepen, Profil prüfen, Details für
                            Unklare, neue Treffer melden, Abgänge markieren
    scraper/lib/profil.ts   das Suchprofil als Code
    scraper/lib/balkon.ts   Balkonbeleg aus Ausstattung, Titel, Beschreibung
    scraper/lib/warmmiete.ts Warmmiete: angegeben / kalt+NK / geschätzt
    scraper/lib/reihung.ts  Punkte für Bonusmerkmale
    scraper/scrapers/       immowelt (weitere Quellen folgen)
    web/                    Dashboard (Cloudflare Pages)
    schema.sql              Tabellen angebote, laeufe

## Betrieb

Der Lauf startet alle 30 Minuten über `.github/workflows/scrape.yml`
(Minuten 17 und 47). GitHub führt Zeitpläne nur nach bestem Bemühen aus;
real ist mit 45 bis 60 Minuten zu rechnen.

**Der Scraper läuft nicht lokal.** Live-Abrufe haben den privaten Anschluss
des Nutzers 2026-09-08 zweimal lahmgelegt. Prüfungen laufen auf GitHub:

    gh workflow run pruefung.yml -f skript=pruefe-quelle -f quelle=immowelt
    gh run watch

Lokal nur Tests und Typprüfung:

    cd scraper && npm ci && npm test && npx tsc --noEmit

Umgebungsvariablen (CI-Secrets): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Für den einmaligen Datenbank-Reset
zusätzlich `SUPABASE_MANAGEMENT_PAT`.
```

- [ ] **Step 3: UEBERGABE.md, BACKLOG.md, TODO.md anlegen**

`docs/superpowers/UEBERGABE.md`:

```markdown
# Übergabe — Stand 2026-11-11 (Neuausrichtung)

Das Projekt wird auf die Suche nach einer Mietwohnung in München umgebaut.
Spec: `specs/2026-11-11-muenchen-mietwohnung-design.md`. Plan 1 (Reset,
Kern, Immowelt): `plans/2026-11-11-muenchen-miete-plan1-reset-kern-immowelt.md`.

Fortschritt steht in `TODO.md`. Alles Alte liegt in `docs/archiv/`.
```

`docs/superpowers/BACKLOG.md`:

```markdown
# Rückstand

- Plan 2: Dashboard für Mietwohnungen (Liste, Filter, Karte München).
- Plan 3: Quellen Kleinanzeigen, WG-Gesucht, ImmoScout24.
- Monatsjob: Verschwundenes älter als 60 Tage löschen.
- Warnung nach drei gesperrten Läufen einer Quelle in Folge.
```

`docs/superpowers/TODO.md`:

```markdown
# To-do

| Plan | Stand |
|---|---|
| Plan 1 Reset, Kern, Immowelt | in Arbeit |
| Plan 2 Dashboard | offen |
| Plan 3 weitere Quellen | offen |
```

- [ ] **Step 4: Commit**

```bash
git add -A docs README.md
git commit -m "docs: Altes archivieren, Doku auf Muenchen-Miete ausrichten" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Neues Schema und Reset-Workflow

**Files:**
- Modify: `schema.sql` (vollständig ersetzen)
- Create: `scraper/scripts/reset-datenbank.mts`, `.github/workflows/reset-datenbank.yml`

**Interfaces:**
- Produces: Tabellen `angebote`, `laeufe` wie in Spec 4.7.

- [ ] **Step 1: schema.sql ersetzen**

```sql
create extension if not exists "pgcrypto";

-- Reset 2026-11-11: die Tabellen des frueheren Zwecks (Mehrfamilienhaeuser)
-- fallen. Entscheidung des Nutzers, siehe Spec 2026-11-11, Abschnitt 2.
drop table if exists notifications cascade;
drop table if exists listing_versions cascade;
drop table if exists listings cascade;
drop table if exists sweep_runs cascade;
drop table if exists sweep_region_runs cascade;
drop table if exists rent_estimates cascade;
drop table if exists angebote cascade;
drop table if exists laeufe cascade;

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
  passt text not null,
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

create index angebote_passt_idx on angebote (passt, punkte desc);
create index angebote_verschwunden_idx on angebote (verschwunden_am) where verschwunden_am is not null;

create table laeufe (
  id uuid primary key default gen_random_uuid(),
  gestartet_am timestamptz not null default now(),
  quelle text not null,
  gesehen integer not null,
  passend integer not null,
  unklar integer not null,
  gemeldet integer not null,
  vollstaendig boolean not null,
  status text not null,
  dauer_ms integer,
  hinweis text
);

create index laeufe_quelle_idx on laeufe (quelle, gestartet_am desc);

alter table angebote enable row level security;
alter table laeufe enable row level security;
```

- [ ] **Step 2: Reset-Skript schreiben**

`scraper/scripts/reset-datenbank.mts`:

```ts
/**
 * Spielt schema.sql ueber die Supabase-Management-API ein. Laeuft NUR in CI
 * (.github/workflows/reset-datenbank.yml): Schreibzugriffe auf die
 * Live-Datenbank sind lokal gesperrt.
 */
import { readFileSync } from "node:fs";
import { nurInCiAusfuehren } from "../lib/nurInCi.js";

nurInCiAusfuehren("reset-datenbank");

const pat = process.env.SUPABASE_MANAGEMENT_PAT;
const url = process.env.SUPABASE_URL;
if (!pat || !url) throw new Error("SUPABASE_MANAGEMENT_PAT und SUPABASE_URL noetig");
const ref = new URL(url).hostname.split(".")[0];
const sql = readFileSync(new URL("../../schema.sql", import.meta.url), "utf-8");

const antwort = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
if (!antwort.ok) throw new Error(`Management-API ${antwort.status}: ${await antwort.text()}`);
console.log("Schema eingespielt.");
```

- [ ] **Step 3: Workflow schreiben**

`.github/workflows/reset-datenbank.yml`:

```yaml
name: reset-datenbank
# EINMALIG. Loescht alle Tabellen und legt das Schema fuer Muenchen-Miete an.
on:
  workflow_dispatch:
    inputs:
      bestaetigung:
        description: "Tippe LOESCHEN, um alle Tabellen zu verwerfen"
        required: true
jobs:
  reset:
    if: inputs.bestaetigung == 'LOESCHEN'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    env:
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_MANAGEMENT_PAT: ${{ secrets.SUPABASE_MANAGEMENT_PAT }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22", cache: "npm", cache-dependency-path: scraper/package-lock.json }
      - run: npm ci
        working-directory: scraper
      - run: npx tsx scripts/reset-datenbank.mts
        working-directory: scraper
```

- [ ] **Step 4: Secret anlegen**

Das Secret `SUPABASE_MANAGEMENT_PAT` fehlt im Repo (Stand `gh secret list`
2026-11-11). Lokal steht der Wert in `scraper/.env`. Anlegen:

```bash
gh secret set SUPABASE_MANAGEMENT_PAT --body "$(grep '^SUPABASE_MANAGEMENT_PAT=' scraper/.env | cut -d= -f2-)"
```

Wird dieser Befehl vom Auto-Modus geblockt, den Nutzer bitten, ihn selbst
auszuführen. Alternativ `schema.sql` im Supabase-SQL-Editor einfügen.

- [ ] **Step 5: Commit**

```bash
git add schema.sql scraper/scripts/reset-datenbank.mts .github/workflows/reset-datenbank.yml
git commit -m "feat(db): Schema fuer Muenchen-Miete, Reset per Workflow" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Der Workflow wird erst in Task 14 ausgelöst, wenn der neue Code auf `main` liegt.

---

### Task 3: Alten Code entfernen, Grundgerüst grün

**Files:**
- Delete: `scraper/lib/{bestand,bestandDb,db,grunderwerbsteuer,karte,meldebudget,meldung,metrics,pipeline,plausibilitaet,ranking,regionsMassstab,rentEstimate,snapshot,snapshotDb}.ts` samt `.test.ts`, `scraper/lib/mietPruefdaten.generated.json`, `scraper/lib/plzBundesland.generated.json`, `scraper/lib/rentEstimate.pruefdaten.test.ts`
- Delete: `scraper/scrapers/zvg-portal/`, `scraper/scrapers/immowelt/{titelzeile,zusammenfuehren,probe}.ts` samt Tests
- Delete: alle `scraper/scripts/*.mts` außer `diagnose-overlays.mts`, `diagnose-netz.mts`
- Delete: `scraper/test/fixtures/zvg-portal-*.html`
- Delete: `web/src/logik/{regionen,zvgSuche,karte,karteOffen,kartentexte,gruende}.ts` samt Tests, `web/src/logik/karte.generated.ts`, `web/scripts/`, `web/src/ui/{Karte,KartenTooltip,Bandstreifen}.tsx`
- Modify: `scraper/main.ts` (leeren), `scraper/package.json` (`generate:plz` entfernen)
- Modify: `scraper/lib/telegram.ts`: nur `TelegramConfig`, `TelegramFoto`, `MAX_BILDER_JE_OBJEKT`, `begrenzeBildUrls`, `teileInMediengruppen`, `sendTelegramPhotos`, `sendTelegramDocument`, `sendTelegramMessage` behalten; alle `format*`-Funktionen, `ListingSummary`, `ZvgListingSummary`, `KennzahlenSummary`, `LUECKE_*`, `datenlueckeKlartext` löschen; `telegram.test.ts` auf die behaltenen Funktionen kürzen.
- Modify: `scraper/scrapers/immowelt/index.ts` und `list.ts`, `detail.ts`: auf leere Hüllen reduzieren (werden in Task 11 bis 13 neu geschrieben), Tests löschen.

- [ ] **Step 1: Löschen**

```bash
cd scraper
git rm -q lib/bestand.ts lib/bestand.test.ts lib/bestandDb.ts lib/bestandDb.test.ts lib/db.ts lib/db.test.ts \
  lib/grunderwerbsteuer.ts lib/grunderwerbsteuer.test.ts lib/karte.ts lib/karte.test.ts \
  lib/meldebudget.ts lib/meldebudget.test.ts lib/meldung.ts lib/meldung.test.ts lib/metrics.ts lib/metrics.test.ts \
  lib/pipeline.ts lib/pipeline.test.ts lib/plausibilitaet.ts lib/plausibilitaet.test.ts lib/ranking.ts lib/ranking.test.ts \
  lib/regionsMassstab.ts lib/regionsMassstab.test.ts lib/rentEstimate.ts lib/rentEstimate.test.ts lib/rentEstimate.pruefdaten.test.ts \
  lib/snapshot.ts lib/snapshot.test.ts lib/snapshotDb.ts lib/snapshotDb.test.ts lib/mietPruefdaten.generated.json lib/plzBundesland.generated.json
git rm -rq scrapers/zvg-portal
git rm -q scrapers/immowelt/titelzeile.ts scrapers/immowelt/titelzeile.test.ts scrapers/immowelt/zusammenfuehren.ts scrapers/immowelt/zusammenfuehren.test.ts scrapers/immowelt/probe.ts scrapers/immowelt/probe.test.ts scrapers/immowelt/index.test.ts scrapers/immowelt/list.test.ts scrapers/immowelt/detail.test.ts
git rm -q scripts/diagnose-detail.mts scripts/diagnose-liste.mts scripts/erzeuge-dashboard-snapshot.mts scripts/erzeuge-mietpruefdaten.mts scripts/generate-plz-table.mts scripts/messung-*.mts scripts/pruefe-massstaebe.mts scripts/pruefe-region.mts
git rm -q test/fixtures/zvg-portal-*.html test/fixtures/immowelt-expose-mehrfamilienhaus.html test/fixtures/immowelt-suche-haus.html
cd ../web
git rm -q src/logik/regionen.ts src/logik/regionen.test.ts src/logik/zvgSuche.ts src/logik/zvgSuche.test.ts src/logik/karte.ts src/logik/karte.test.ts src/logik/karte.generated.ts src/logik/karteOffen.ts src/logik/karteOffen.test.ts src/logik/kartentexte.ts src/logik/kartentexte.test.ts src/logik/gruende.ts src/logik/gruende.test.ts src/ui/Karte.tsx src/ui/KartenTooltip.tsx src/ui/Bandstreifen.tsx
git rm -rq scripts
```

- [ ] **Step 2: main.ts leeren**

```ts
// Wird in Task 13 neu geschrieben.
export {};
```

- [ ] **Step 3: Immowelt-Hüllen**

`scraper/scrapers/immowelt/list.ts`, `detail.ts`, `index.ts` jeweils auf `export {};` reduzieren. `package.json`: Zeile `"generate:plz"` entfernen.

- [ ] **Step 4: telegram.ts kürzen**

Alles vor `export const MAX_BILDER_JE_OBJEKT` löschen außer `TelegramConfig`. Danach `telegram.test.ts` öffnen, jeden `describe`-Block entfernen, dessen Funktion nicht mehr existiert.

- [ ] **Step 5: Web-App auf Minimalseite setzen**

`web/src/App.tsx` vollständig ersetzen:

```tsx
export function App() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>immo-radar — Mietwohnung München</h1>
      <p>Das Dashboard wird umgebaut (Plan 2). Treffer kommen per Telegram.</p>
    </main>
  );
}
```

`web/src/daten/*.ts`, `web/src/logik/*.ts`, `web/src/ui/*.tsx` samt Tests löschen, bis nur `App.tsx`, `main.tsx`, `stil.css` bleiben. `vitest.config.ts` bleibt; ohne Tests meldet vitest „No test files found" und einen Exit-Code 1: `web/package.json` Script `test` auf `vitest run --passWithNoTests` setzen.

- [ ] **Step 6: Grün prüfen**

```bash
cd scraper && npx tsc --noEmit && npx vitest run
cd ../web && npx tsc --noEmit && npx vitest run
```

Erwartung: beides ohne Fehler. Verbleibende Tests im Scraper: `consent`, `overlays`, `nebenlaeufig`, `nurInCi`, `telegram` (gekürzt).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: Fachlogik des Mehrfamilienhaus-Zwecks und ZVG entfernen" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Modell `Angebot`

**Files:**
- Create: `scraper/lib/typen.ts`

**Interfaces:**
- Produces: `Quelle`, `Angebot`, `Balkonbefund`, `WarmmieteQuelle`, `Profilurteil`.

- [ ] **Step 1: Datei schreiben**

```ts
export type Quelle = "immowelt" | "kleinanzeigen" | "wg-gesucht" | "immoscout24";
export type Balkonbefund = "ja" | "nein" | "unbekannt";
export type WarmmieteQuelle = "angegeben" | "kalt_plus_nk" | "geschaetzt" | "unbekannt";
export type Passt = "ja" | "nein" | "unklar";

export interface Angebot {
  quelle: Quelle;
  externalId: string;
  url: string;
  titel: string;
  kaltmieteCents: number | null;
  nebenkostenCents: number | null;
  warmmieteCents: number | null;
  warmmieteQuelle: WarmmieteQuelle;
  zimmer: number | null;
  flaecheM2: number | null;
  balkon: Balkonbefund;
  balkonBeleg: string | null;
  plz: string | null;
  stadtteil: string | null;
  verfuegbarAb: string | null;
  befristet: boolean | null;
  bildUrls: string[];
  veroeffentlichtAm: string | null;
  detailGeladen: boolean;
}

export interface Profilurteil {
  passt: Passt;
  gruende: string[];
}

/** Leeres Angebot fuer Tests und Parser: alles unbekannt. */
export function leeresAngebot(teil: Pick<Angebot, "quelle" | "externalId" | "url" | "titel"> & Partial<Angebot>): Angebot {
  return {
    kaltmieteCents: null,
    nebenkostenCents: null,
    warmmieteCents: null,
    warmmieteQuelle: "unbekannt",
    zimmer: null,
    flaecheM2: null,
    balkon: "unbekannt",
    balkonBeleg: null,
    plz: null,
    stadtteil: null,
    verfuegbarAb: null,
    befristet: null,
    bildUrls: [],
    veroeffentlichtAm: null,
    detailGeladen: false,
    ...teil,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add scraper/lib/typen.ts
git commit -m "feat(kern): gemeinsames Modell Angebot" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Profilprüfung

**Files:**
- Create: `scraper/lib/muenchenPlz.ts`, `scraper/lib/muenchenPlz.test.ts`, `scraper/lib/profil.ts`, `scraper/lib/profil.test.ts`

**Interfaces:**
- Consumes: `Angebot`, `Profilurteil` aus Task 4.
- Produces: `PROFIL`, `pruefeProfil(a: Angebot): Profilurteil`, `istMuenchen(plz: string): boolean`, `ringFuerPlz(plz: string): 1 | 2 | 3`.

- [ ] **Step 1: Test muenchenPlz**

```ts
import { describe, it, expect } from "vitest";
import { istMuenchen, ringFuerPlz } from "./muenchenPlz.js";

describe("istMuenchen", () => {
  it("nimmt Stadtgebiet an", () => {
    expect(istMuenchen("80331")).toBe(true);
    expect(istMuenchen("81929")).toBe(true);
  });
  it("weist Umland ab", () => {
    expect(istMuenchen("82031")).toBe(false); // Gruenwald
    expect(istMuenchen("85521")).toBe(false); // Ottobrunn
    expect(istMuenchen("80330")).toBe(false);
  });
});

describe("ringFuerPlz", () => {
  it("Altstadt, Maxvorstadt, Schwabing, Haidhausen sind Ring 1", () => {
    expect(ringFuerPlz("80331")).toBe(1);
    expect(ringFuerPlz("80799")).toBe(1);
    expect(ringFuerPlz("80802")).toBe(1);
    expect(ringFuerPlz("81667")).toBe(1);
  });
  it("Laim, Sendling, Bogenhausen sind Ring 2", () => {
    expect(ringFuerPlz("80687")).toBe(2);
    expect(ringFuerPlz("81369")).toBe(2);
    expect(ringFuerPlz("81675")).toBe(2);
  });
  it("Rest ist Ring 3", () => {
    expect(ringFuerPlz("81929")).toBe(3);
    expect(ringFuerPlz("80995")).toBe(3);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `cd scraper && npx vitest run lib/muenchenPlz.test.ts`
Expected: FAIL, Modul fehlt.

- [ ] **Step 3: muenchenPlz.ts**

```ts
/** Muenchner Stadtgebiet: PLZ 80331 bis 81929. Umland (82xxx, 85xxx) nicht. */
export function istMuenchen(plz: string): boolean {
  const n = Number(plz);
  return Number.isInteger(n) && n >= 80331 && n <= 81929;
}

const RING_1 = new Set([
  "80331", "80333", "80335", "80336", "80337", "80339", // Altstadt, Maxvorstadt, Isar-/Ludwigsvorstadt
  "80469", // Glockenbach, Isarvorstadt
  "80538", "80539", // Lehel
  "80634", "80636", "80637", "80638", "80639", // Neuhausen
  "80796", "80797", "80798", "80799", // Maxvorstadt, Schwabing-West
  "80801", "80802", "80803", "80804", "80805", // Schwabing
  "81541", "81543", // Au, Untergiesing
  "81667", "81669", "81671", // Haidhausen
]);

const RING_2 = new Set([
  "80686", "80687", "80689", // Laim
  "80807", "80809", // Milbertshofen
  "80933", "80935", "80937", "80939", // Freimann, Schwabing-Nord
  "81369", "81371", "81373", "81377", "81379", // Sendling, Westpark
  "81475", "81476", "81477", "81479", // Thalkirchen, Solln
  "81673", "81675", "81677", "81679", // Bogenhausen, Berg am Laim
  "81735", "81737", "81739", // Ramersdorf, Perlach
  "81925", "81927", // Bogenhausen
  "80992", "80993", "80997", "80999", // Moosach, Allach
]);

export function ringFuerPlz(plz: string): 1 | 2 | 3 {
  if (RING_1.has(plz)) return 1;
  if (RING_2.has(plz)) return 2;
  return 3;
}
```

- [ ] **Step 4: Grün sehen**

Run: `npx vitest run lib/muenchenPlz.test.ts` — PASS.

- [ ] **Step 5: Test profil**

```ts
import { describe, it, expect } from "vitest";
import { leeresAngebot } from "./typen.js";
import { pruefeProfil, PROFIL } from "./profil.js";

const BASIS = () => leeresAngebot({
  quelle: "immowelt", externalId: "x", url: "https://example.org/x", titel: "Wohnung",
  warmmieteCents: 120_000, warmmieteQuelle: "angegeben", zimmer: 2, flaecheM2: 50,
  balkon: "ja", balkonBeleg: "Balkon", plz: "80802", befristet: false,
});

describe("pruefeProfil", () => {
  it("passt bei allen Pflichtmerkmalen", () => {
    expect(pruefeProfil(BASIS())).toEqual({ passt: "ja", gruende: [] });
  });
  it("Grenzwerte sind einschliessend", () => {
    const a = BASIS(); a.warmmieteCents = PROFIL.warmmieteMaxCents; a.zimmer = 2; a.flaecheM2 = 45;
    expect(pruefeProfil(a).passt).toBe("ja");
  });
  it("zu teuer ist raus", () => {
    const a = BASIS(); a.warmmieteCents = 130_001;
    expect(pruefeProfil(a)).toEqual({ passt: "nein", gruende: ["warmmiete_zu_hoch"] });
  });
  it("Warmmiete unbekannt ist unklar, nicht raus", () => {
    const a = BASIS(); a.warmmieteCents = null; a.warmmieteQuelle = "unbekannt";
    expect(pruefeProfil(a)).toEqual({ passt: "unklar", gruende: ["warmmiete_unbekannt"] });
  });
  it("ein Zimmer ist raus, 1,5 Zimmer auch", () => {
    const a = BASIS(); a.zimmer = 1.5;
    expect(pruefeProfil(a).passt).toBe("nein");
  });
  it("44,5 m2 ist raus", () => {
    const a = BASIS(); a.flaecheM2 = 44.5;
    expect(pruefeProfil(a).gruende).toEqual(["flaeche_zu_klein"]);
  });
  it("Balkon nein ist raus, unbekannt ist unklar", () => {
    const a = BASIS(); a.balkon = "nein";
    expect(pruefeProfil(a).gruende).toEqual(["kein_balkon"]);
    a.balkon = "unbekannt";
    expect(pruefeProfil(a)).toEqual({ passt: "unklar", gruende: ["balkon_unbekannt"] });
  });
  it("Umland-PLZ ist raus, nicht unklar", () => {
    const a = BASIS(); a.plz = "85521";
    expect(pruefeProfil(a)).toEqual({ passt: "nein", gruende: ["ausserhalb_muenchen"] });
  });
  it("PLZ unbekannt ist unklar", () => {
    const a = BASIS(); a.plz = null;
    expect(pruefeProfil(a)).toEqual({ passt: "unklar", gruende: ["plz_unbekannt"] });
  });
  it("befristet ist raus", () => {
    const a = BASIS(); a.befristet = true;
    expect(pruefeProfil(a).gruende).toEqual(["befristet"]);
  });
  it("nein schlaegt unklar: zu teuer UND Balkon unbekannt ist nein mit beiden Gruenden", () => {
    const a = BASIS(); a.warmmieteCents = 200_000; a.balkon = "unbekannt";
    expect(pruefeProfil(a)).toEqual({ passt: "nein", gruende: ["warmmiete_zu_hoch", "balkon_unbekannt"] });
  });
});
```

- [ ] **Step 6: Rot sehen**

Run: `npx vitest run lib/profil.test.ts` — FAIL, Modul fehlt.

- [ ] **Step 7: profil.ts**

```ts
import type { Angebot, Profilurteil } from "./typen.js";
import { istMuenchen } from "./muenchenPlz.js";

/** DAS Suchprofil. Aenderungen hier sind Aenderungen am Zweck des Projekts. */
export const PROFIL = {
  warmmieteMaxCents: 130_000,
  zimmerMin: 2,
  flaecheMinM2: 45,
} as const;

export function pruefeProfil(a: Angebot): Profilurteil {
  const nein: string[] = [];
  const unklar: string[] = [];

  if (a.warmmieteCents === null) unklar.push("warmmiete_unbekannt");
  else if (a.warmmieteCents > PROFIL.warmmieteMaxCents) nein.push("warmmiete_zu_hoch");

  if (a.zimmer === null) unklar.push("zimmer_unbekannt");
  else if (a.zimmer < PROFIL.zimmerMin) nein.push("zu_wenig_zimmer");

  if (a.flaecheM2 === null) unklar.push("flaeche_unbekannt");
  else if (a.flaecheM2 < PROFIL.flaecheMinM2) nein.push("flaeche_zu_klein");

  if (a.balkon === "nein") nein.push("kein_balkon");
  else if (a.balkon === "unbekannt") unklar.push("balkon_unbekannt");

  if (a.plz === null) unklar.push("plz_unbekannt");
  else if (!istMuenchen(a.plz)) nein.push("ausserhalb_muenchen");

  if (a.befristet === true) nein.push("befristet");

  if (nein.length > 0) return { passt: "nein", gruende: [...nein, ...unklar] };
  if (unklar.length > 0) return { passt: "unklar", gruende: unklar };
  return { passt: "ja", gruende: [] };
}
```

- [ ] **Step 8: Grün sehen, Commit**

Run: `npx vitest run lib/profil.test.ts lib/muenchenPlz.test.ts` — PASS.

```bash
git add scraper/lib/profil.ts scraper/lib/profil.test.ts scraper/lib/muenchenPlz.ts scraper/lib/muenchenPlz.test.ts
git commit -m "feat(kern): Suchprofil und Muenchner PLZ-Ringe" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Warmmiete bestimmen

**Files:**
- Create: `scraper/lib/warmmiete.ts`, `scraper/lib/warmmiete.test.ts`

**Interfaces:**
- Produces: `bestimmeWarmmiete(a: Pick<Angebot,"kaltmieteCents"|"nebenkostenCents"|"warmmieteCents">): { warmmieteCents: number | null; warmmieteQuelle: WarmmieteQuelle }`, `NEBENKOSTEN_FAKTOR = 1.25`.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from "vitest";
import { bestimmeWarmmiete } from "./warmmiete.js";

describe("bestimmeWarmmiete", () => {
  it("angegebene Warmmiete gewinnt", () => {
    expect(bestimmeWarmmiete({ kaltmieteCents: 90_000, nebenkostenCents: 20_000, warmmieteCents: 115_000 }))
      .toEqual({ warmmieteCents: 115_000, warmmieteQuelle: "angegeben" });
  });
  it("sonst Kalt plus Nebenkosten", () => {
    expect(bestimmeWarmmiete({ kaltmieteCents: 90_000, nebenkostenCents: 20_000, warmmieteCents: null }))
      .toEqual({ warmmieteCents: 110_000, warmmieteQuelle: "kalt_plus_nk" });
  });
  it("sonst Kalt mal 1,25, gerundet, als Schaetzung", () => {
    expect(bestimmeWarmmiete({ kaltmieteCents: 99_999, nebenkostenCents: null, warmmieteCents: null }))
      .toEqual({ warmmieteCents: 124_999, warmmieteQuelle: "geschaetzt" });
  });
  it("ohne Kaltmiete unbekannt", () => {
    expect(bestimmeWarmmiete({ kaltmieteCents: null, nebenkostenCents: 20_000, warmmieteCents: null }))
      .toEqual({ warmmieteCents: null, warmmieteQuelle: "unbekannt" });
  });
  it("Warmmiete 0 gilt als nicht angegeben", () => {
    expect(bestimmeWarmmiete({ kaltmieteCents: 80_000, nebenkostenCents: null, warmmieteCents: 0 }).warmmieteQuelle)
      .toBe("geschaetzt");
  });
});
```

- [ ] **Step 2: Rot sehen** — `npx vitest run lib/warmmiete.test.ts` FAIL.

- [ ] **Step 3: warmmiete.ts**

```ts
import type { Angebot, WarmmieteQuelle } from "./typen.js";

/** Schaetzfaktor, wenn nur die Kaltmiete bekannt ist (Spec 2, Entscheidung 1). */
export const NEBENKOSTEN_FAKTOR = 1.25;

export function bestimmeWarmmiete(
  a: Pick<Angebot, "kaltmieteCents" | "nebenkostenCents" | "warmmieteCents">
): { warmmieteCents: number | null; warmmieteQuelle: WarmmieteQuelle } {
  if (a.warmmieteCents !== null && a.warmmieteCents > 0)
    return { warmmieteCents: a.warmmieteCents, warmmieteQuelle: "angegeben" };
  if (a.kaltmieteCents === null || a.kaltmieteCents <= 0)
    return { warmmieteCents: null, warmmieteQuelle: "unbekannt" };
  if (a.nebenkostenCents !== null && a.nebenkostenCents > 0)
    return { warmmieteCents: a.kaltmieteCents + a.nebenkostenCents, warmmieteQuelle: "kalt_plus_nk" };
  return { warmmieteCents: Math.round(a.kaltmieteCents * NEBENKOSTEN_FAKTOR), warmmieteQuelle: "geschaetzt" };
}
```

- [ ] **Step 4: Grün, Commit**

```bash
git add scraper/lib/warmmiete.ts scraper/lib/warmmiete.test.ts
git commit -m "feat(kern): Warmmiete angegeben, kalt plus NK oder geschaetzt" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Balkonbeleg

**Files:**
- Create: `scraper/lib/balkon.ts`, `scraper/lib/balkon.test.ts`

**Interfaces:**
- Produces: `erkenneBalkon(eingabe: { ausstattung: string[]; titel: string; beschreibung: string }): { balkon: Balkonbefund; beleg: string | null }`.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from "vitest";
import { erkenneBalkon } from "./balkon.js";

const leer = { ausstattung: [], titel: "", beschreibung: "" };

describe("erkenneBalkon", () => {
  it("strukturierte Ausstattung zaehlt zuerst", () => {
    expect(erkenneBalkon({ ...leer, ausstattung: ["Einbaukueche", "Balkon"] })).toEqual({ balkon: "ja", beleg: "Balkon" });
  });
  it("Loggia, Terrasse, Dachterrasse zaehlen", () => {
    expect(erkenneBalkon({ ...leer, titel: "2 Zimmer mit Loggia" }).balkon).toBe("ja");
    expect(erkenneBalkon({ ...leer, beschreibung: "grosse Dachterrasse" }).balkon).toBe("ja");
  });
  it("Suedbalkon im Fliesstext liefert den Satz als Beleg", () => {
    const r = erkenneBalkon({ ...leer, beschreibung: "Helle Wohnung. Sonniger Südbalkon nach Westen. Ruhige Lage." });
    expect(r).toEqual({ balkon: "ja", beleg: "Sonniger Südbalkon nach Westen." });
  });
  it("Negation gewinnt", () => {
    expect(erkenneBalkon({ ...leer, beschreibung: "Leider ohne Balkon, dafuer Garten." })).toEqual({ balkon: "nein", beleg: "Leider ohne Balkon, dafuer Garten." });
    expect(erkenneBalkon({ ...leer, beschreibung: "kein Balkon" }).balkon).toBe("nein");
    expect(erkenneBalkon({ ...leer, beschreibung: "Balkon nicht vorhanden" }).balkon).toBe("nein");
  });
  it("franzoesischer Balkon zaehlt nicht", () => {
    expect(erkenneBalkon({ ...leer, beschreibung: "mit französischem Balkon" })).toEqual({ balkon: "unbekannt", beleg: null });
    expect(erkenneBalkon({ ...leer, ausstattung: ["Französischer Balkon"] }).balkon).toBe("unbekannt");
  });
  it("Negation UND echter Balkon: Negation gewinnt (lieber verschlucken als falsch melden)", () => {
    expect(erkenneBalkon({ ...leer, beschreibung: "Kein Balkon im Wohnzimmer, aber Balkon an der Kueche." }).balkon).toBe("nein");
  });
  it("nichts gefunden ist unbekannt", () => {
    expect(erkenneBalkon(leer)).toEqual({ balkon: "unbekannt", beleg: null });
  });
});
```

- [ ] **Step 2: Rot sehen** — FAIL.

- [ ] **Step 3: balkon.ts**

```ts
import type { Balkonbefund } from "./typen.js";

const NEGATIV = /(kein|ohne)\s+balkon|balkon\s+(nicht\s+vorhanden|fehlt)/i;
const FRANZOESISCH = /franz(ö|oe)sische[rnms]?\s+balkon/i;
const POSITIV = /balkon|loggia|terrasse/i;

function saetze(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

function ohneFranzoesisch(text: string): string {
  return text.replace(new RegExp(FRANZOESISCH.source, "gi"), "");
}

/**
 * Balkon ja/nein/unbekannt mit Beleg. Reihenfolge: Ausstattungsliste, Titel,
 * Beschreibung. Negation schlaegt Positiv, "franzoesischer Balkon" zaehlt nicht.
 */
export function erkenneBalkon(eingabe: {
  ausstattung: string[];
  titel: string;
  beschreibung: string;
}): { balkon: Balkonbefund; beleg: string | null } {
  const kandidaten = [...eingabe.ausstattung, ...saetze(eingabe.titel), ...saetze(eingabe.beschreibung)];
  for (const k of kandidaten) if (NEGATIV.test(k)) return { balkon: "nein", beleg: k };
  for (const k of kandidaten) if (POSITIV.test(ohneFranzoesisch(k))) return { balkon: "ja", beleg: k };
  return { balkon: "unbekannt", beleg: null };
}
```

- [ ] **Step 4: Grün, Commit**

```bash
git add scraper/lib/balkon.ts scraper/lib/balkon.test.ts
git commit -m "feat(kern): Balkonbeleg mit Negation und franzoesischem Balkon" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Reihung

**Files:**
- Create: `scraper/lib/reihung.ts`, `scraper/lib/reihung.test.ts`

**Interfaces:**
- Consumes: `ringFuerPlz` (Task 5).
- Produces: `berechnePunkte(a: Angebot, jetzt: Date): number`, `sortiereTreffer<T extends { punkte: number; externalId: string }>(t: T[]): T[]`.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from "vitest";
import { leeresAngebot } from "./typen.js";
import { berechnePunkte, sortiereTreffer } from "./reihung.js";

const JETZT = new Date("2026-11-11T12:00:00Z");
const basis = () => leeresAngebot({
  quelle: "immowelt", externalId: "a", url: "u", titel: "t",
  warmmieteCents: 125_000, warmmieteQuelle: "geschaetzt", zimmer: 2, flaecheM2: 45, plz: "81929",
});

describe("berechnePunkte", () => {
  it("Basis ohne Bonus: 0 (27,8 Euro je m2, Ring 3, alt, geschaetzt)", () => {
    expect(berechnePunkte(basis(), JETZT)).toBe(0);
  });
  it("3 Zimmer +30", () => { const a = basis(); a.zimmer = 3; expect(berechnePunkte(a, JETZT)).toBe(30); });
  it("unter 22 Euro je m2 +20, unter 25 +10", () => {
    const a = basis(); a.flaecheM2 = 60; // 20,83
    expect(berechnePunkte(a, JETZT)).toBe(20);
    a.flaecheM2 = 52; // 24,04
    expect(berechnePunkte(a, JETZT)).toBe(10);
  });
  it("Ring 1 +15, Ring 2 +5", () => {
    const a = basis(); a.plz = "80802"; expect(berechnePunkte(a, JETZT)).toBe(15);
    a.plz = "80687"; expect(berechnePunkte(a, JETZT)).toBe(5);
  });
  it("juenger als 2 h +10", () => {
    const a = basis(); a.veroeffentlichtAm = "2026-11-11T10:30:00Z";
    expect(berechnePunkte(a, JETZT)).toBe(10);
    a.veroeffentlichtAm = "2026-11-11T09:30:00Z";
    expect(berechnePunkte(a, JETZT)).toBe(0);
  });
  it("Warmmiete angegeben +5", () => { const a = basis(); a.warmmieteQuelle = "angegeben"; expect(berechnePunkte(a, JETZT)).toBe(5); });
});

describe("sortiereTreffer", () => {
  it("hoechste Punkte zuerst, bei Gleichstand nach externalId", () => {
    const s = sortiereTreffer([{ punkte: 5, externalId: "b" }, { punkte: 30, externalId: "z" }, { punkte: 5, externalId: "a" }]);
    expect(s.map((x) => x.externalId)).toEqual(["z", "a", "b"]);
  });
});
```

- [ ] **Step 2: Rot sehen** — FAIL.

- [ ] **Step 3: reihung.ts**

```ts
import type { Angebot } from "./typen.js";
import { ringFuerPlz } from "./muenchenPlz.js";

const ZWEI_STUNDEN_MS = 2 * 60 * 60 * 1000;

/** Punkte bestimmen nur die Reihenfolge der Meldungen, nie den Ausschluss (Spec 4.5). */
export function berechnePunkte(a: Angebot, jetzt: Date): number {
  let p = 0;
  if (a.zimmer !== null && a.zimmer >= 3) p += 30;
  if (a.warmmieteCents !== null && a.flaecheM2 !== null && a.flaecheM2 > 0) {
    const jeM2 = a.warmmieteCents / 100 / a.flaecheM2;
    if (jeM2 < 22) p += 20;
    else if (jeM2 < 25) p += 10;
  }
  if (a.plz !== null) {
    const ring = ringFuerPlz(a.plz);
    if (ring === 1) p += 15;
    else if (ring === 2) p += 5;
  }
  if (a.veroeffentlichtAm !== null) {
    const alter = jetzt.getTime() - new Date(a.veroeffentlichtAm).getTime();
    if (alter >= 0 && alter < ZWEI_STUNDEN_MS) p += 10;
  }
  if (a.warmmieteQuelle === "angegeben") p += 5;
  return p;
}

export function sortiereTreffer<T extends { punkte: number; externalId: string }>(t: T[]): T[] {
  return [...t].sort((x, y) => y.punkte - x.punkte || x.externalId.localeCompare(y.externalId));
}
```

- [ ] **Step 4: Grün, Commit**

```bash
git add scraper/lib/reihung.ts scraper/lib/reihung.test.ts
git commit -m "feat(kern): Reihung nach Bonusmerkmalen" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Datenbankzugriff `angebote` und `laeufe`

**Files:**
- Create: `scraper/lib/angebote.ts`, `scraper/lib/angebote.test.ts`, `scraper/lib/lauf.ts`

**Interfaces:**
- Consumes: `Angebot`, `Profilurteil`.
- Produces:
  - `zuZeile(a: Angebot, urteil: Profilurteil, punkte: number, jetzt: Date): AngebotZeile` (reine Funktion, Spaltennamen snake_case)
  - `ladeBekannte(sb, quelle): Promise<Map<string, Bekannt>>` mit `Bekannt = { id: string; gemeldetAm: string | null; letzteWarmmieteGemeldetCents: number | null; verschwundenAm: string | null; passt: Passt }`
  - `speichereAngebote(sb, zeilen: AngebotZeile[]): Promise<void>` (upsert auf `quelle,external_id`, setzt `zuletzt_gesehen`, löscht `verschwunden_am`)
  - `markiereVerschwunden(sb, quelle, gesehen: Set<string>, jetzt: Date): Promise<number>` (nur wenn Aufrufer `vollstaendig` sagt; setzt `verschwunden_am` bei fehlenden, nicht bereits markierten)
  - `markiereGemeldet(sb, id: string, warmmieteCents: number | null, jetzt: Date): Promise<void>`
  - `entscheideMeldung(bekannt: Bekannt | undefined, warmmieteCents: number | null): "neu" | "preissenkung" | "keine"`
  - `speichereLauf(sb, lauf: LaufZeile): Promise<void>` mit `LaufZeile = { quelle; gesehen; passend; unklar; gemeldet; vollstaendig; status: "ok"|"gesperrt"|"fehler"; dauer_ms; hinweis: string | null }`.

- [ ] **Step 1: Test für reine Teile**

```ts
import { describe, it, expect } from "vitest";
import { leeresAngebot } from "./typen.js";
import { zuZeile, entscheideMeldung } from "./angebote.js";

describe("zuZeile", () => {
  it("bildet Spaltennamen und setzt zuletzt_gesehen", () => {
    const a = leeresAngebot({ quelle: "immowelt", externalId: "e1", url: "u", titel: "t", warmmieteCents: 100_000, warmmieteQuelle: "angegeben", flaecheM2: 50.5 });
    const z = zuZeile(a, { passt: "ja", gruende: [] }, 15, new Date("2026-11-11T12:00:00Z"));
    expect(z).toMatchObject({ quelle: "immowelt", external_id: "e1", warmmiete_cents: 100_000, warmmiete_quelle: "angegeben", flaeche_m2: 50.5, passt: "ja", gruende: [], punkte: 15, zuletzt_gesehen: "2026-11-11T12:00:00.000Z", verschwunden_am: null });
  });
});

describe("entscheideMeldung", () => {
  it("unbekannt ist neu", () => expect(entscheideMeldung(undefined, 100_000)).toBe("neu"));
  it("bekannt, nie gemeldet ist neu", () => expect(entscheideMeldung({ id: "1", gemeldetAm: null, letzteWarmmieteGemeldetCents: null, verschwundenAm: null, passt: "unklar" }, 100_000)).toBe("neu"));
  it("gemeldet, gleicher Preis: keine", () => expect(entscheideMeldung({ id: "1", gemeldetAm: "x", letzteWarmmieteGemeldetCents: 100_000, verschwundenAm: null, passt: "ja" }, 100_000)).toBe("keine"));
  it("gemeldet, Preis gesunken: preissenkung", () => expect(entscheideMeldung({ id: "1", gemeldetAm: "x", letzteWarmmieteGemeldetCents: 100_000, verschwundenAm: null, passt: "ja" }, 95_000)).toBe("preissenkung"));
  it("gemeldet, Preis gestiegen oder unbekannt: keine", () => {
    const b = { id: "1", gemeldetAm: "x", letzteWarmmieteGemeldetCents: 100_000, verschwundenAm: null, passt: "ja" as const };
    expect(entscheideMeldung(b, 105_000)).toBe("keine");
    expect(entscheideMeldung(b, null)).toBe("keine");
  });
});
```

- [ ] **Step 2: Rot sehen** — FAIL.

- [ ] **Step 3: angebote.ts**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Angebot, Passt, Profilurteil, Quelle } from "./typen.js";

export interface AngebotZeile {
  quelle: Quelle; external_id: string; url: string; titel: string;
  kaltmiete_cents: number | null; nebenkosten_cents: number | null; warmmiete_cents: number | null;
  warmmiete_quelle: string; zimmer: number | null; flaeche_m2: number | null;
  balkon: string; balkon_beleg: string | null; plz: string | null; stadtteil: string | null;
  verfuegbar_ab: string | null; befristet: boolean | null; bild_urls: string[];
  veroeffentlicht_am: string | null; passt: Passt; gruende: string[]; punkte: number;
  zuletzt_gesehen: string; verschwunden_am: null; detail_geladen_am: string | null;
}

export interface Bekannt {
  id: string; gemeldetAm: string | null; letzteWarmmieteGemeldetCents: number | null;
  verschwundenAm: string | null; passt: Passt;
}

export function zuZeile(a: Angebot, urteil: Profilurteil, punkte: number, jetzt: Date): AngebotZeile {
  const iso = jetzt.toISOString();
  return {
    quelle: a.quelle, external_id: a.externalId, url: a.url, titel: a.titel,
    kaltmiete_cents: a.kaltmieteCents, nebenkosten_cents: a.nebenkostenCents, warmmiete_cents: a.warmmieteCents,
    warmmiete_quelle: a.warmmieteQuelle, zimmer: a.zimmer, flaeche_m2: a.flaecheM2,
    balkon: a.balkon, balkon_beleg: a.balkonBeleg, plz: a.plz, stadtteil: a.stadtteil,
    verfuegbar_ab: a.verfuegbarAb, befristet: a.befristet, bild_urls: a.bildUrls,
    veroeffentlicht_am: a.veroeffentlichtAm, passt: urteil.passt, gruende: urteil.gruende, punkte,
    zuletzt_gesehen: iso, verschwunden_am: null, detail_geladen_am: a.detailGeladen ? iso : null,
  };
}

export function entscheideMeldung(bekannt: Bekannt | undefined, warmmieteCents: number | null): "neu" | "preissenkung" | "keine" {
  if (!bekannt || bekannt.gemeldetAm === null) return "neu";
  if (warmmieteCents !== null && bekannt.letzteWarmmieteGemeldetCents !== null && warmmieteCents < bekannt.letzteWarmmieteGemeldetCents) return "preissenkung";
  return "keine";
}

export async function ladeBekannte(sb: SupabaseClient, quelle: Quelle): Promise<Map<string, Bekannt>> {
  const { data, error } = await sb.from("angebote")
    .select("id, external_id, gemeldet_am, letzte_warmmiete_gemeldet_cents, verschwunden_am, passt")
    .eq("quelle", quelle);
  if (error) throw new Error(`ladeBekannte ${quelle}: ${error.message}`);
  const map = new Map<string, Bekannt>();
  for (const z of data ?? []) map.set(z.external_id, {
    id: z.id, gemeldetAm: z.gemeldet_am, letzteWarmmieteGemeldetCents: z.letzte_warmmiete_gemeldet_cents,
    verschwundenAm: z.verschwunden_am, passt: z.passt,
  });
  return map;
}

export async function speichereAngebote(sb: SupabaseClient, zeilen: AngebotZeile[]): Promise<void> {
  if (zeilen.length === 0) return;
  const { error } = await sb.from("angebote").upsert(zeilen, { onConflict: "quelle,external_id" });
  if (error) throw new Error(`speichereAngebote: ${error.message}`);
}

export async function markiereVerschwunden(sb: SupabaseClient, quelle: Quelle, gesehen: Set<string>, jetzt: Date): Promise<number> {
  const { data, error } = await sb.from("angebote").select("id, external_id").eq("quelle", quelle).is("verschwunden_am", null);
  if (error) throw new Error(`markiereVerschwunden lesen: ${error.message}`);
  const ids = (data ?? []).filter((z) => !gesehen.has(z.external_id)).map((z) => z.id);
  if (ids.length === 0) return 0;
  const { error: e2 } = await sb.from("angebote").update({ verschwunden_am: jetzt.toISOString() }).in("id", ids);
  if (e2) throw new Error(`markiereVerschwunden schreiben: ${e2.message}`);
  return ids.length;
}

export async function markiereGemeldet(sb: SupabaseClient, id: string, warmmieteCents: number | null, jetzt: Date): Promise<void> {
  const { error } = await sb.from("angebote")
    .update({ gemeldet_am: jetzt.toISOString(), letzte_warmmiete_gemeldet_cents: warmmieteCents }).eq("id", id);
  if (error) throw new Error(`markiereGemeldet: ${error.message}`);
}

export async function ladeIdFuer(sb: SupabaseClient, quelle: Quelle, externalId: string): Promise<string> {
  const { data, error } = await sb.from("angebote").select("id").eq("quelle", quelle).eq("external_id", externalId).single();
  if (error || !data) throw new Error(`ladeIdFuer ${quelle}/${externalId}: ${error?.message ?? "leer"}`);
  return data.id;
}
```

`scraper/lib/lauf.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Quelle } from "./typen.js";

export interface LaufZeile {
  quelle: Quelle; gesehen: number; passend: number; unklar: number; gemeldet: number;
  vollstaendig: boolean; status: "ok" | "gesperrt" | "fehler"; dauer_ms: number; hinweis: string | null;
}

export async function speichereLauf(sb: SupabaseClient, lauf: LaufZeile): Promise<void> {
  const { error } = await sb.from("laeufe").insert(lauf);
  if (error) throw new Error(`speichereLauf: ${error.message}`);
}
```

- [ ] **Step 4: Grün, Commit**

```bash
git add scraper/lib/angebote.ts scraper/lib/angebote.test.ts scraper/lib/lauf.ts
git commit -m "feat(db): Zugriff auf angebote und laeufe" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Telegram-Texte

**Files:**
- Create: `scraper/lib/meldung.ts`, `scraper/lib/meldung.test.ts`

**Interfaces:**
- Produces: `formatTrefferMessage(a: Angebot, jetzt: Date): string`, `formatPreissenkungMessage(a: Angebot, vorherCents: number): string`, `quellenName(q: Quelle): string`.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from "vitest";
import { leeresAngebot } from "./typen.js";
import { formatTrefferMessage, formatPreissenkungMessage } from "./meldung.js";

const JETZT = new Date("2026-11-11T12:00:00Z");
const a = leeresAngebot({
  quelle: "immowelt", externalId: "e", url: "https://www.immowelt.de/expose/e", titel: "Helle 2,5-Zimmer-Wohnung",
  warmmieteCents: 124_000, warmmieteQuelle: "angegeben", zimmer: 2.5, flaecheM2: 52, balkon: "ja",
  balkonBeleg: "sonniger Südbalkon", plz: "80797", stadtteil: "Schwabing-West", verfuegbarAb: "01.01.2027",
  veroeffentlichtAm: "2026-11-11T11:20:00Z",
});

describe("formatTrefferMessage", () => {
  it("enthaelt Stadtteil, Warmmiete, Zimmer, Flaeche, Preis je m2, Balkonbeleg, Quelle, Alter, Link", () => {
    const t = formatTrefferMessage(a, JETZT);
    expect(t).toContain("Schwabing-West");
    expect(t).toContain("1.240 € warm");
    expect(t).toContain("2,5 Zi");
    expect(t).toContain("52 m²");
    expect(t).toContain("23,8 €/m²");
    expect(t).toContain("Balkon: sonniger Südbalkon");
    expect(t).toContain("Immowelt");
    expect(t).toContain("vor 40 min");
    expect(t).toContain("https://www.immowelt.de/expose/e");
    expect(t).not.toContain("geschätzt");
  });
  it("markiert geschaetzte Warmmiete", () => {
    expect(formatTrefferMessage({ ...a, warmmieteQuelle: "geschaetzt" }, JETZT)).toContain("Warmmiete geschätzt");
  });
  it("faellt ohne Stadtteil auf PLZ zurueck", () => {
    expect(formatTrefferMessage({ ...a, stadtteil: null }, JETZT)).toContain("80797");
  });
  it("escaped HTML im Titel", () => {
    expect(formatTrefferMessage({ ...a, balkonBeleg: "<b>Balkon</b>" }, JETZT)).toContain("&lt;b&gt;");
  });
});

describe("formatPreissenkungMessage", () => {
  it("zeigt alt und neu", () => {
    const t = formatPreissenkungMessage(a, 130_000);
    expect(t).toContain("1.300 €");
    expect(t).toContain("1.240 €");
    expect(t).toContain("https://www.immowelt.de/expose/e");
  });
});
```

- [ ] **Step 2: Rot sehen** — FAIL.

- [ ] **Step 3: meldung.ts**

```ts
import type { Angebot, Quelle } from "./typen.js";

export function quellenName(q: Quelle): string {
  return { immowelt: "Immowelt", kleinanzeigen: "Kleinanzeigen", "wg-gesucht": "WG-Gesucht", immoscout24: "ImmoScout24" }[q];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function euro(cents: number): string {
  return `${Math.round(cents / 100).toLocaleString("de-DE")} €`;
}
function zahl(n: number, nachkomma = 1): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: nachkomma });
}
function alterText(iso: string | null, jetzt: Date): string | null {
  if (!iso) return null;
  const min = Math.round((jetzt.getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 0) return null;
  if (min < 60) return `vor ${min} min`;
  if (min < 48 * 60) return `vor ${Math.round(min / 60)} h`;
  return `vor ${Math.round(min / 1440)} Tagen`;
}

export function formatTrefferMessage(a: Angebot, jetzt: Date): string {
  const ort = a.stadtteil ?? a.plz ?? "München";
  const warm = a.warmmieteCents !== null ? `${euro(a.warmmieteCents)} warm` : "Miete unbekannt";
  const zeile1 = `<b>Treffer · ${esc(ort)} · ${warm}</b>`;
  const teile2: string[] = [];
  if (a.zimmer !== null) teile2.push(`${zahl(a.zimmer)} Zi`);
  if (a.flaecheM2 !== null) teile2.push(`${zahl(a.flaecheM2, 0)} m²`);
  if (a.warmmieteCents !== null && a.flaecheM2) teile2.push(`${zahl(a.warmmieteCents / 100 / a.flaecheM2)} €/m² warm`);
  if (a.balkonBeleg) teile2.push(`Balkon: ${esc(a.balkonBeleg)}`);
  const teile3: string[] = [];
  if (a.verfuegbarAb) teile3.push(`frei ab ${esc(a.verfuegbarAb)}`);
  teile3.push(quellenName(a.quelle));
  const alter = alterText(a.veroeffentlichtAm, jetzt);
  if (alter) teile3.push(alter);
  const zeilen = [zeile1, teile2.join(" · "), teile3.join(" · ")];
  if (a.warmmieteQuelle === "geschaetzt") zeilen.push("Warmmiete geschätzt (Kaltmiete × 1,25)");
  if (a.warmmieteQuelle === "kalt_plus_nk") zeilen.push("Warmmiete = Kaltmiete + Nebenkosten");
  zeilen.push(esc(a.titel), a.url);
  return zeilen.join("\n");
}

export function formatPreissenkungMessage(a: Angebot, vorherCents: number): string {
  const neu = a.warmmieteCents !== null ? euro(a.warmmieteCents) : "?";
  return `Preis gesunken · ${esc(a.stadtteil ?? a.plz ?? "München")}: ${euro(vorherCents)} → ${neu} warm\n${a.url}`;
}
```

- [ ] **Step 4: Grün, Commit**

```bash
git add scraper/lib/meldung.ts scraper/lib/meldung.test.ts
git commit -m "feat(meldung): Telegram-Texte fuer Treffer und Preissenkung" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Fixtures aus Immowelt holen (CI)

Immowelts Mietsuche hat eine andere Kartenstruktur als die alte Kaufsuche. Ohne echte Seiten lässt sich kein Parser schreiben. Die Seiten werden in CI geholt und als Artefakt heruntergeladen.

**Files:**
- Create: `scraper/scripts/hole-fixtures.mts`
- Modify: `.github/workflows/pruefung.yml`

- [ ] **Step 1: Skript**

```ts
/**
 * Holt Ergebnisliste und zwei Detailseiten der Immowelt-Mietsuche Muenchen und
 * schreibt sie als HTML nach scraper/fixtures-out/. NUR in CI (pruefung.yml).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { nurInCiAusfuehren } from "../lib/nurInCi.js";
import { bestaetigeConsentBanner } from "../scrapers/consent.js";
import { IMMOWELT_SUCHE_URL } from "../scrapers/immowelt/index.js";

nurInCiAusfuehren("hole-fixtures");
mkdirSync("fixtures-out", { recursive: true });

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
await page.goto(IMMOWELT_SUCHE_URL, { waitUntil: "domcontentloaded" });
await bestaetigeConsentBanner(page);
await page.waitForTimeout(3000);
console.log("Liste:", page.url(), "Titel:", await page.title());
writeFileSync("fixtures-out/mietliste-muenchen.html", await page.content());
await page.screenshot({ path: "fixtures-out/mietliste-muenchen.png", fullPage: true });

const links = await page.locator('a[href*="/expose/"]').evaluateAll((as) =>
  [...new Set(as.map((a) => (a as HTMLAnchorElement).href))].slice(0, 3)
);
for (const [i, link] of links.entries()) {
  await page.waitForTimeout(5000);
  await page.goto(link, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  console.log(`Detail ${i}:`, link, "Status-Titel:", await page.title());
  writeFileSync(`fixtures-out/mietdetail-${i}.html`, await page.content());
}
await browser.close();
```

- [ ] **Step 2: `IMMOWELT_SUCHE_URL` in index.ts anlegen**

```ts
/**
 * Mietsuche Muenchen, vorgefiltert: Wohnung, ab 2 Zimmer, ab 45 m2, bis
 * 1.300 Euro. Die Portalfilter sind Vorauswahl, kein Beleg; jedes Feld wird
 * im Code erneut geprueft. Ob der Preisfilter kalt oder warm meint, steht in
 * der Spec nicht fest: deshalb ist er bewusst auf 1.300 gesetzt, der Code
 * sortiert spaeter nach Warmmiete aus.
 */
export const IMMOWELT_SUCHE_URL =
  "https://www.immowelt.de/classified-search?distributionTypes=Rent&estateTypes=Apartment&locations=AD08DE8634&numberOfRoomsMin=2&livingSpaceMin=45&priceMax=1300&order=DateDesc";
```

Falls die Seite diese URL nicht annimmt (Screenshot zeigt Startseite oder Fehlerseite), die Suche einmal im eigenen Browser (`mcp__browser__navigate` auf immowelt.de, Filter setzen) nachstellen, die entstehende URL aus der Adresszeile übernehmen und die Konstante anpassen. Kein zweiter CI-Versuch ohne diese Prüfung.

- [ ] **Step 3: pruefung.yml**

Inputs: `skript` mit Optionen `hole-fixtures`, `pruefe-quelle`, `diagnose-overlays`, `diagnose-netz`; `quelle` (default `immowelt`). Die alten Inputs `region`, `max_seiten` entfallen. Run-Block:

```yaml
      - name: Pruefung ausfuehren
        working-directory: scraper
        env:
          SKRIPT: ${{ inputs.skript }}
          QUELLE: ${{ inputs.quelle }}
        run: |
          set -euo pipefail
          case "$SKRIPT" in
            hole-fixtures)   xvfb-run --auto-servernum npx tsx scripts/hole-fixtures.mts ;;
            pruefe-quelle)   xvfb-run --auto-servernum npx tsx scripts/pruefe-quelle.mts "$QUELLE" ;;
            diagnose-overlays) xvfb-run --auto-servernum npx tsx scripts/diagnose-overlays.mts ;;
            diagnose-netz)   npx tsx scripts/diagnose-netz.mts ;;
            *) echo "Unbekanntes Skript: $SKRIPT" >&2; exit 1 ;;
          esac
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: fixtures
          path: scraper/fixtures-out/
          if-no-files-found: ignore
```

`scraper/.gitignore`: Zeile `fixtures-out/` ergänzen. `pruefe-quelle.mts` entsteht in Task 13; bis dahin die Zeile im Workflow lassen, sie wird nicht aufgerufen.

- [ ] **Step 4: Commit, Push, Workflow auslösen, Artefakt holen**

```bash
git add -A && git commit -m "chore(ci): Fixtures der Immowelt-Mietsuche per Workflow holen" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
gh workflow run pruefung.yml -f skript=hole-fixtures
sleep 20; gh run list --workflow=pruefung.yml --limit 1
gh run watch --exit-status
gh run download --name fixtures --dir /tmp/fixtures   # Pfad: Scratchpad-Verzeichnis der Sitzung
```

- [ ] **Step 5: Fixtures sichten und ablegen**

Screenshot und Log anschauen: zeigt die Seite Mietwohnungen in München mit Preisen bis 1.300? Dann:

```bash
mkdir -p scraper/test/fixtures/immowelt
cp <download>/mietliste-muenchen.html scraper/test/fixtures/immowelt/
```

Die drei Detailseiten lesen (`grep -o 'balkon[^<]\{0,60\}' -i`): eine mit Balkon als `mietdetail-mit-balkon.html`, eine ohne als `mietdetail-ohne-balkon.html` ablegen. Gibt es unter den dreien keine ohne Balkon, reicht eine mit und der Negativtest nutzt ein künstlich geändertes Fragment (siehe Task 12).

Zeigt der Screenshot ein CAPTCHA oder HTTP 403: Workflow nicht wiederholen, sondern den Nutzer informieren und nach Alternativen suchen (siehe Step 2).

```bash
git add scraper/test/fixtures/immowelt
git commit -m "test(immowelt): Fixtures der Mietsuche Muenchen" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Immowelt-Parser für Liste und Detail

**Files:**
- Create: `scraper/scrapers/immowelt/list.ts`, `list.test.ts`, `detail.ts`, `detail.test.ts`

**Interfaces:**
- Produces: `parseImmoweltMietliste(html: string): Angebot[]` (Felder aus der Karte: externalId, url, titel, kaltmieteCents oder warmmieteCents je nachdem was die Karte nennt, zimmer, flaecheM2, plz/stadtteil falls im Ortstext, `detailGeladen: false`), `parseImmoweltMietdetail(html: string, kontext: { externalId: string; url: string }): Angebot`.

Die Selektoren hängen von den Fixtures aus Task 11 ab. Vorgehen, nicht Code, ist deshalb vorgegeben; die Erwartungswerte im Test sind aus dem Fixture abzulesen, nicht zu erfinden.

- [ ] **Step 1: Listen-Test schreiben**

Fixture öffnen, die erste Karte finden (`a[href*="/expose/"]`, Attribut `title` oder innerer Text). Erwartete Werte der ersten Karte und die Kartenzahl ablesen. Test:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseImmoweltMietliste } from "./list.js";

const html = readFileSync(new URL("../../test/fixtures/immowelt/mietliste-muenchen.html", import.meta.url), "utf-8");

describe("parseImmoweltMietliste", () => {
  const karten = parseImmoweltMietliste(html);
  it("findet alle Karten der Seite", () => { expect(karten.length).toBe(/* aus Fixture */ 0); });
  it("liest die erste Karte", () => {
    expect(karten[0]).toMatchObject({ quelle: "immowelt", externalId: /* */ "", zimmer: /* */ 0, flaecheM2: /* */ 0, detailGeladen: false });
    expect(karten[0].kaltmieteCents ?? karten[0].warmmieteCents).toBe(/* */ 0);
  });
  it("liest Komma-Zimmer als Dezimalzahl, nie als 25", () => {
    const alle = karten.map((k) => k.zimmer).filter((z): z is number => z !== null);
    expect(alle.every((z) => z >= 1 && z <= 10)).toBe(true);
  });
  it("Balkon aus dem Kartentext ist hoechstens ja, nie nein", () => {
    expect(karten.every((k) => k.balkon !== "nein")).toBe(true);
  });
});
```

Die Platzhalterwerte `/* aus Fixture */` sind VOR dem ersten Testlauf durch abgelesene Zahlen zu ersetzen; der Test muss anschließend rot sein, weil `list.ts` noch `export {}` ist.

- [ ] **Step 2: Rot sehen**

- [ ] **Step 3: list.ts**

Mit cheerio die Karten lesen. Zahlen deutsch parsen (Hilfsfunktion `deutscheZahl("2,5") = 2.5`, `deutscheZahl("1.240") = 1240`). Preisfeld: steht „Warmmiete" oder „warm" daneben, `warmmieteCents`, sonst `kaltmieteCents`. Balkon: `erkenneBalkon({ ausstattung: [], titel, beschreibung: kartentext })`, aber ein `nein` auf der Liste wird auf `unbekannt` gesetzt (Kartentext ist zu kurz für Negation). Alles Fehlende `null`, `leeresAngebot` nutzen.

- [ ] **Step 4: Grün sehen, dann Detail-Test**

Detailseite nutzt `__UFRN_LIFECYCLE_SERVERREQUEST__` wie bisher (`extractClassified` aus dem alten `detail.ts` übernehmen, Git-Historie: `git show HEAD~N:scraper/scrapers/immowelt/detail.ts`). Felder aus `classified.sections.hardFacts.facts` (`type`: `numberOfRooms`, `livingSpace`), Preis `hardFacts.price`, Nebenkosten und Warmmiete aus `classified.sections.price` oder `priceInformation` (im Fixture nachsehen: `grep -o '"[a-zA-Z]*[Rr]ent[a-zA-Z]*"' | sort -u` und `grep -o '"[a-zA-Z]*[Cc]ost[a-zA-Z]*"'`), Ausstattung aus `classified.sections.features` oder `equipment` (im Fixture `grep -o '"features":\[[^]]*' | head`), Beschreibung aus `mainDescription`, Adresse aus `location.address` (`zipCode`, `district`), Bilder wie bisher (`extractPhotoUrls`). Test gegen beide Fixtures:

```ts
describe("parseImmoweltMietdetail", () => {
  it("mit Balkon: Warmmiete, Zimmer, Flaeche, PLZ, Balkon ja mit Beleg", () => {
    const a = parseImmoweltMietdetail(mit, KONTEXT);
    expect(a.warmmieteCents).toBe(/* Fixture */ 0);
    expect(a.balkon).toBe("ja");
    expect(a.balkonBeleg).toBeTruthy();
    expect(a.plz).toMatch(/^8[01]\d{3}$/);
    expect(a.detailGeladen).toBe(true);
    expect(a.bildUrls.length).toBeGreaterThan(0);
  });
  it("ohne Balkon: nein oder unbekannt, nie ja", () => {
    expect(parseImmoweltMietdetail(ohne, KONTEXT).balkon).not.toBe("ja");
  });
  it("Kaltmiete ohne Warmmiete bleibt unbekannt, wird nicht erfunden", () => {
    const html = mit.replace(/"warmRent"[^,}]*/g, '"warmRent":null'); // Feldname aus Fixture
    const a = parseImmoweltMietdetail(html, KONTEXT);
    expect(a.warmmieteCents).toBeNull();
    expect(a.kaltmieteCents).not.toBeNull();
  });
});
```

- [ ] **Step 5: detail.ts schreiben, grün sehen, Commit**

```bash
git add scraper/scrapers/immowelt
git commit -m "feat(immowelt): Parser fuer Mietliste und Mietdetail Muenchen" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Quelle Immowelt, Pipeline, main.ts, Prüfskript

**Files:**
- Create: `scraper/scrapers/quelle.ts`, `scraper/scrapers/immowelt/index.ts` (ersetzen), `scraper/lib/pipeline.ts`, `scraper/lib/pipeline.test.ts`, `scraper/scripts/pruefe-quelle.mts`
- Modify: `scraper/main.ts`

**Interfaces:**
- `quelle.ts`:

```ts
import type { Page } from "playwright";
import type { Angebot, Quelle as QuellenName } from "../lib/typen.js";
export interface SweepErgebnis { angebote: Angebot[]; vollstaendig: boolean; status: "ok" | "gesperrt" | "fehler"; hinweis: string | null }
export interface Quelle {
  name: QuellenName;
  sweep(page: Page, budgetMs: number): Promise<SweepErgebnis>;
  ladeDetail(page: Page, a: Angebot): Promise<Angebot>;
  verzoegerungMs: number;
}
```

- `pipeline.ts`: `verarbeiteQuelle(deps, quelle, page, jetzt): Promise<LaufZeile>` mit

```ts
export interface PipelineDeps {
  sb: SupabaseClient;
  telegram: TelegramConfig | null;           // null = nicht senden (Pruefskript)
  sende: (text: string) => Promise<unknown>;
  sendeFotos: (urls: string[], caption: string) => Promise<unknown>;
  sweepBudgetMs: number; detailBudgetMs: number; maxMeldungen: number;
}
```

Ablauf in `verarbeiteQuelle`:
1. `sweep` aufrufen; bei `status !== "ok"` Lauf speichern und zurück.
2. Für jedes Angebot: `bestimmeWarmmiete` anwenden, `pruefeProfil`. `nein`: nicht speichern (außer es ist bekannt, dann speichern, damit das Urteil in der DB steht).
3. `unklar` und bekannte `bekannt.passt !== "ja"`-Angebote sowie neue `ja`-Angebote ohne Bilder: Detail laden (Drossel `verzoegerungMs`, bis `detailBudgetMs` erschöpft), danach erneut `bestimmeWarmmiete` + `pruefeProfil`.
4. `berechnePunkte`, `zuZeile`, `speichereAngebote` für alle außer unbekannte `nein`.
5. Treffer `ja`: `entscheideMeldung`; `neu` sortiert nach Punkten, höchstens `maxMeldungen`: `formatTrefferMessage` senden, danach Fotos (`begrenzeBildUrls` auf 10), `markiereGemeldet`. `preissenkung`: Text senden, `markiereGemeldet`.
6. Bei `vollstaendig`: `markiereVerschwunden`.
7. `speichereLauf`, Zeile zurück.

- [ ] **Step 1: Pipeline-Test mit Fake-Quelle und Fake-DB**

Fake-DB: ein Objekt mit `from(tabelle)` das eine Mini-Query-Kette (`select/eq/is/in/upsert/update/insert/single`) über In-Memory-Arrays auswertet. Genug für `ladeBekannte`, `speichereAngebote`, `markiereVerschwunden`, `markiereGemeldet`, `ladeIdFuer`, `speichereLauf`. Tests:

```ts
it("neuer passender Treffer wird genau einmal gemeldet, im zweiten Lauf nicht mehr", async () => { /* zwei Laeufe, gesendet.length === 1 */ });
it("unklares Angebot (Balkon unbekannt) laedt Detail und meldet dann", async () => { /* ladeDetail gibt balkon ja zurueck */ });
it("Kaltmiete-Angebot ohne Warmmiete wird nicht ohne Detail gemeldet", async () => { /* Review Focus 1 */ });
it("zu teuer wird nicht gespeichert und nicht gemeldet", async () => {});
it("Preissenkung bei gemeldetem Treffer: eine Preiszeile, keine zweite Treffermeldung", async () => { /* Review Focus 5 */ });
it("gesperrte Quelle: Lauf mit status gesperrt, nichts gesendet, nichts markiert", async () => {});
it("unvollstaendiger Sweep markiert nichts als verschwunden", async () => {});
it("hoechstens maxMeldungen je Lauf, Reihenfolge nach Punkten", async () => {});
```

Jeder Testkörper ist vollständig auszuschreiben; die Fake-Quelle liefert `Angebot`-Objekte über `leeresAngebot`.

- [ ] **Step 2: Rot sehen, pipeline.ts schreiben, grün sehen**

- [ ] **Step 3: Immowelt-Quelle**

`scrapers/immowelt/index.ts`: `IMMOWELT_SUCHE_URL` (aus Task 11), `IMMOWELT_VERZOEGERUNG_MS = 5000`, `immoweltQuelle: Quelle`. `sweep`: `page.goto(URL)`, `bestaetigeConsentBanner`, dann Seiten mit `parseImmoweltMietliste` sammeln; Blättern über `button[aria-label="nächste seite"]` mit `blaettereWeiter`-Logik aus dem alten Code (`git show <commit vor Task 3>:scraper/scrapers/immowelt/index.ts`, Funktionen `blaettereWeiter`, `ersteKartenKennung`, `wartetAufNeueListe` samt Tests übernehmen). Deckel 10 Seiten. HTTP 403 oder Titel mit „Zugriff" oder „captcha": `status: "gesperrt"`. `vollstaendig = true`, wenn der Weiter-Knopf regulär fehlte. `ladeDetail`: `page.goto(a.url)`, bei Status 200 `parseImmoweltMietdetail`, sonst Angebot unverändert zurück.

- [ ] **Step 4: main.ts**

```ts
import "dotenv/config";
import { chromium } from "playwright";
import { sb } from "./lib/supabase.js";
import { nurInCiAusfuehren } from "./lib/nurInCi.js";
import { sendTelegramMessage, sendTelegramPhotos, type TelegramConfig } from "./lib/telegram.js";
import { verarbeiteQuelle } from "./lib/pipeline.js";
import { immoweltQuelle } from "./scrapers/immowelt/index.js";
import { schreibeSnapshot } from "./lib/snapshot.js";

nurInCiAusfuehren("scrape");
const telegram: TelegramConfig = { botToken: process.env.TELEGRAM_BOT_TOKEN!, chatId: process.env.TELEGRAM_CHAT_ID! };
const QUELLEN = [immoweltQuelle];

const browser = await chromium.launch({ headless: false });
try {
  for (const quelle of QUELLEN) {
    const page = await browser.newPage();
    try {
      const lauf = await verarbeiteQuelle({
        sb, telegram,
        sende: (t) => sendTelegramMessage(telegram, t),
        sendeFotos: (urls, caption) => sendTelegramPhotos(telegram, urls.map((url) => ({ url })), caption),
        sweepBudgetMs: 3 * 60_000, detailBudgetMs: 10 * 60_000, maxMeldungen: 15,
      }, quelle, page, new Date());
      console.log(`${quelle.name}: ${JSON.stringify(lauf)}`);
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
await schreibeSnapshot(sb, "snapshot/dashboard-snapshot.json", new Date());
```

`lib/snapshot.ts` (minimal, Plan 2 erweitert): liest `angebote` mit `passt in ('ja','unklar')` und die letzten 20 `laeufe`, schreibt `{ erzeugtAm, angebote: [...], laeufe: [...] }` als JSON. Ein Test prüft `baueSnapshot(zeilen, laeufe, jetzt)` auf Form und Sortierung nach Punkten.

`TelegramFoto`-Form im bestehenden `telegram.ts` prüfen (`{ url }` oder anderes Feld) und den Aufruf oben daran anpassen.

- [ ] **Step 5: pruefe-quelle.mts**

Wie `main.ts`, aber: `nurInCiAusfuehren("pruefe-quelle")`, Quelle aus `process.argv[2]`, Fake-`sb` (die In-Memory-DB aus dem Pipeline-Test in `lib/fakeDb.ts` auslagern), `sende` und `sendeFotos` loggen nur, `maxMeldungen: 5`. Am Ende Tabelle ausgeben: externalId, passt, gruende, warm, zimmer, m², balkon. Schreibt die Liste als `fixtures-out/pruefe-<quelle>.json`.

- [ ] **Step 6: Gate, Commit**

```bash
cd scraper && npx vitest run && npx tsc --noEmit
git add -A
git commit -m "feat: Pipeline, Immowelt-Quelle und Lauf fuer Muenchen-Miete" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Workflows, Reset, erster Produktionslauf

**Files:**
- Modify: `.github/workflows/scrape.yml`, `.github/workflows/deploy-dashboard.yml`

- [ ] **Step 1: scrape.yml**

Kommentarblock zur alten Messung durch drei Zeilen ersetzen (Takt 30 min, GitHub Bemühen, Minuten 17 und 47 krumm gewählt wie 2026-09-22 begründet). `cron: "17,47 * * * *"`, `timeout-minutes: 25`. Schritte unverändert (npm ci, playwright, xvfb, `xvfb-run --auto-servernum npm run scrape`, Artefakt-Upload des Snapshots).

- [ ] **Step 2: deploy-dashboard.yml**

Den Schritt `npx tsx scripts/erzeuge-dashboard-snapshot.mts` ersetzen durch das Herunterladen des Snapshot-Artefakts aus dem auslösenden Scrape-Lauf (`actions/download-artifact@v4` mit `run-id: ${{ github.event.workflow_run.id }}` und `github-token`), bei `push`-Auslöser stattdessen `scraper/scripts/erzeuge-snapshot.mts` (neues 10-Zeilen-Skript: `schreibeSnapshot(sb, "../web/public/dashboard-snapshot.json", new Date())`). Einfacher und gleichwertig: immer `erzeuge-snapshot.mts` laufen lassen, da die Datenbank nur noch ein paar hundert Zeilen hat. Diesen einfachen Weg nehmen.

- [ ] **Step 3: Push, Reset auslösen, Lauf starten**

```bash
git push
gh workflow run reset-datenbank.yml -f bestaetigung=LOESCHEN
gh run watch --exit-status
gh workflow run scrape.yml
gh run watch --exit-status
gh run view --log | grep -E "immowelt:|Treffer|gesperrt|Error" | head -40
```

Erwartung: Lauf grün, Log zeigt `immowelt: {"quelle":"immowelt","gesehen":N,...,"status":"ok"}`, Telegram-Nachrichten beim Nutzer. Bei `gesperrt`: nicht erneut starten, Befund in UEBERGABE.md eintragen.

- [ ] **Step 4: Doku-Stand, Commit**

`TODO.md`: Plan 1 auf „fertig, erster Lauf <run-id>". `UEBERGABE.md`: Ergebnis des ersten Laufs (gesehen, passend, gemeldet) und was Plan 2 als Nächstes braucht.

```bash
git add docs .github
git commit -m "feat(ci): Takt 30 Minuten, Reset ausgefuehrt, erster Lauf Muenchen-Miete" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

## Selbstprüfung gegen die Spec

- Spec 1, 2 (Profil, Entscheidungen): Task 5, 6, 7, 14. ✔
- Spec 3 (bleibt/geht): Task 1, 3. ✔
- Spec 4.1 bis 4.5: Task 4 bis 8. ✔
- Spec 4.6 Immowelt: Task 11 bis 13. Übrige Quellen: Plan 3.
- Spec 4.7 Schema: Task 2. ✔
- Spec 4.8 Telegram: Task 10. ✔
- Spec 4.9 Dashboard: Minimalseite in Task 3, Snapshot-Form in Task 13. Voller Umbau: Plan 2.
- Spec 4.10 Betrieb: Task 11, 14. ✔
- Spec 5 Fehlerbehandlung: gesperrte Quelle Task 13; Warnung nach drei gesperrten Läufen und Monatsjob stehen im BACKLOG (Task 1), bewusst nicht in Plan 1.
- Spec 6 Tests: je Task.
