# ZVG-Portal (Plan 2) + data_gaps-Retrofit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zweite Datenquelle (ZVG-Portal, Zwangsversteigerungen von Mehrfamilienhäusern) an immo-radar anschließen, inklusive eines quellenübergreifenden `data_gaps`-Mechanismus, der Objekte mit fehlenden Angaben sichtbar markiert statt sie stillschweigend zu verwerfen (Retrofit für das bereits live laufende Plan 1/Immowelt).

**Architecture:** Neues Scraper-Modul `scraper/scrapers/zvg-portal/` (Playwright-getrieben, analog zu `scrapers/immowelt/`) liefert Kandidaten in einer quellen-neutralen Form an eine neue gemeinsame Pipeline-Funktion (`scraper/lib/pipeline.ts`), die Kennzahlenberechnung, Upsert und Telegram-Benachrichtigung für BEIDE Quellen übernimmt. `main.ts` wird zur reinen Orchestrierung (zwei Quellen abrufen, in die gemeinsame Form mappen, Pipeline aufrufen).

**Tech Stack:** TypeScript (ESM, `strict: true`), `tsx`, `vitest`, `cheerio` (HTML-Parsing), `playwright` (neu, für ZVG-Portal-Formular-Navigation), `@supabase/supabase-js`. GitHub Actions Cron (bestehender 3h-Workflow, kein neuer).

**Spec:** `docs/superpowers/specs/2026-09-06-plan2-zvg-portal-design.md` (siehe auch `2026-09-06-plan2-zvg-portal-notes.md` für die volle Recherche-Historie)

---

## Status: ABGESCHLOSSEN (verifiziert 2026-09-07)

Alle 8 Tasks umgesetzt und via `52c1f15 Merge branch 'zvg-portal-plan2'` nach
`main` gemerged. Nachträglich abgeglichen am 2026-09-07:

- **Code-verifiziert:** `schema.sql` trägt die 5 neuen Spalten; `pipeline.ts`,
  `zvg-portal/{list,detail,index}.ts` + `data_gaps`-Warnzeile in `telegram.ts`
  vorhanden; `npm test` grün (144 Tests); `npx tsc --noEmit` fehlerfrei;
  `package.json`-Script heißt `scrape`; Workflow installiert Playwright-Chromium.
  Betrifft Tasks 1–7.
- **Aus dem laufenden System belegt:** Live-Migration + End-to-End-Läufe
  (Task 8). Die Folge-Commits `e43fcaf` (Timeout/Laufzeitbudget), `487218a`
  (Fehlerisolation je Kandidat, 429-Retry), `4b712ac` (Detailparser-Härtung)
  sind genau die „Korrekturen aus End-to-End-Verifikation".
- **Seither weiterentwickelt** (nicht Teil dieses Plans): voller ZVG-Inseratstext
  statt Portal-Direktlink, Objektfotos/PDF-Exposés/Lagekarte je Meldung,
  Verkehrswert-Parsing gehärtet, regionale Miete + Plausibilitätsgrenze
  (`rent_estimate_unreliable`). Siehe `git log`.

---

## Global Constraints

- TypeScript strict mode, ESM-Imports mit `.js`-Endung (Node-ESM-Konvention, wie im bestehenden Code).
- Keine neuen Abhängigkeiten außer `playwright` (bereits installiert, s. Recherche-Notizen) — insbesondere KEINE PDF-Parsing-Bibliothek (Design-Entscheidung: `raw_notice_text` kommt aus der HTML-Detailseite, nicht aus dem PDF-Anhang).
- Deutsche Bezeichner für Domänenlogik-Funktionen (Konvention aus `metrics.ts`/`rentEstimate.ts`/`grunderwerbsteuer.ts`), englische/technische Namen für generische Interfaces (Konvention aus `ImmoweltDetailData` etc.).
- `MIN_EINHEITEN = 3` bleibt die einzige Mindestgrenze, quellenübergreifend.
- Objekte werden NIE MEHR wegen fehlender Angaben stillschweigend übersprungen — Ausschluss nur bei **bestätigter** Zahl unter der Mindestgrenze (s. Spec, Abschnitt "Retrofit für Plan 1").
- `data_gaps: text[]` ist der einzige Mechanismus für fehlende Angaben — kein Sonderfall pro Feld.
- ZVG-Portal nutzt ausschließlich `obj_arr[]=4` (Mehrfamilienhaus) für den Objekttyp-Filter in dieser Ausbaustufe (Wert 13/Wohn-Geschäftshaus bewusst nicht inkludiert, YAGNI laut Spec).
- Alle 16 Bundesland-Kürzel: `bw, by, be, br, hb, hh, he, mv, ni, nw, rp, sl, sn, st, sh, th`.

---

### Task 1: Schema-Migration — `data_gaps` + ZVG-Spalten

**Files:**
- Modify: `schema.sql`

**Interfaces:**
- Produces: 5 neue Spalten auf `listing_versions` (`auction_at`, `court`, `case_number`, `raw_notice_text`, `data_gaps`), die Task 2+ als DB-Ziel voraussetzen.

- [x] **Step 1: `schema.sql` aktualisieren**

In `schema.sql` die bestehende `create table listing_versions (...)`-Definition erweitern (fügt die 5 neuen Spalten direkt in die Tabellendefinition ein, damit ein frischer Projekt-Aufbau weiterhin mit einem einzigen Lauf funktioniert):

```sql
create table listing_versions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  price_cents bigint not null,
  rent_cold_monthly_cents bigint,
  rent_source text not null,
  living_area_m2 numeric,
  plot_area_m2 numeric,
  units integer,
  units_confident boolean not null default false,
  year_built integer,
  zip_code text,
  city text,
  bundesland text,
  title text,
  changed boolean not null default false,
  price_dropped boolean not null default false,
  metrics jsonb not null,
  auction_at timestamptz,
  court text,
  case_number text,
  raw_notice_text text,
  data_gaps text[] not null default '{}'
);
```

- [x] **Step 2: Migration gegen die LIVE-Datenbank ausführen**

Im Supabase-Dashboard des immo-radar-Projekts: SQL Editor → folgendes ausführen (die Live-Tabelle existiert schon, `create table` würde fehlschlagen):

```sql
alter table listing_versions
  add column auction_at timestamptz,
  add column court text,
  add column case_number text,
  add column raw_notice_text text,
  add column data_gaps text[] not null default '{}';
```

Erwartet: keine Fehler. Im Table Editor bei `listing_versions` die 5 neuen Spalten sichtbar.

- [x] **Step 3: Commit**

```bash
cd C:\immo-radar
git add schema.sql
git commit -m "feat(db): Spalten fuer data_gaps-Mechanismus + ZVG-Portal-Felder"
```

---

### Task 2: `data_gaps`-Bausteine in `db.ts` und `telegram.ts`

**Files:**
- Modify: `scraper/lib/db.ts`
- Modify: `scraper/lib/telegram.ts`
- Modify: `scraper/lib/telegram.test.ts`

**Interfaces:**
- Consumes: nichts Neues (reine Erweiterung bestehender Interfaces).
- Produces: `ListingVersionData` mit 5 neuen **optionalen** Feldern (`dataGaps?`, `auctionAt?`, `court?`, `caseNumber?`, `rawNoticeText?`) — optional, damit der bestehende Immowelt-Call-Ort in `main.ts` unverändert weiter kompiliert, bis Task 6 ihn umbaut. `ListingSummary` mit neuem optionalen Feld `dataGaps?: string[]`. Neue Funktion `formatZvgTopTrefferMessage(listing: ZvgListingSummary, k: KennzahlenSummary): string` und Typ `ZvgListingSummary`.

- [x] **Step 1: `db.ts` um die neuen Felder erweitern**

In `scraper/lib/db.ts` das Interface `ListingVersionData` erweitern:

```ts
export interface ListingVersionData {
  source: string;
  externalId: string;
  url: string;
  priceCents: number;
  rentColdMonthlyCents: number | null;
  rentSource: MietQuelle;
  livingAreaM2: number | null;
  plotAreaM2: number | null;
  units: number | null;
  unitsConfident: boolean;
  yearBuilt: number | null;
  zipCode: string;
  city: string;
  bundesland: string | null;
  title: string;
  kennzahlen: Kennzahlen;
  auctionAt?: string | null;
  court?: string | null;
  caseNumber?: string | null;
  rawNoticeText?: string | null;
  dataGaps?: string[];
}
```

Im `insert`-Aufruf in `upsertListingAndVersion` die neuen Spalten ergänzen (mit Defaults für die optionalen Felder):

```ts
  const { error: versionError } = await supabase.from("listing_versions").insert({
    listing_id: listing.id,
    price_cents: data.priceCents,
    rent_cold_monthly_cents: data.rentColdMonthlyCents,
    rent_source: data.rentSource,
    living_area_m2: data.livingAreaM2,
    plot_area_m2: data.plotAreaM2,
    units: data.units,
    units_confident: data.unitsConfident,
    year_built: data.yearBuilt,
    zip_code: data.zipCode,
    city: data.city,
    bundesland: data.bundesland,
    title: data.title,
    changed: diff.changed,
    price_dropped: diff.priceDropped,
    metrics: data.kennzahlen,
    auction_at: data.auctionAt ?? null,
    court: data.court ?? null,
    case_number: data.caseNumber ?? null,
    raw_notice_text: data.rawNoticeText ?? null,
    data_gaps: data.dataGaps ?? [],
  });
```

- [x] **Step 2: `db.test.ts` laufen lassen (Regressionscheck)**

Run: `cd C:\immo-radar\scraper && npx vitest run lib/db.test.ts`
Expected: PASS (die bestehenden `diffVersion`-Tests sind von dieser Änderung nicht betroffen).

- [x] **Step 3: Fehlschlagenden Telegram-Test für die Warnzeile schreiben**

In `scraper/lib/telegram.test.ts`, NACH dem bestehenden `describe("formatTopTrefferMessage", ...)`-Block, zwei neue `describe`-Blöcke ergänzen (bestehenden Code nicht verändern):

```ts
describe("formatTopTrefferMessage mit data_gaps", () => {
  it("hängt eine Warnzeile mit Klartext-Übersetzung an, wenn Angaben fehlen", () => {
    const text = formatTopTrefferMessage(
      { ...listing, dataGaps: ["units_unconfirmed"] },
      { kaufpreisfaktor: 12.5, geschaetzterDscr: 1.45, mietQuelle: "angegeben" }
    );
    expect(text).toContain("⚠️ Fehlende Angaben: Einheiten nicht bestätigt");
  });

  it("hängt KEINE Warnzeile an, wenn keine Angaben fehlen", () => {
    const text = formatTopTrefferMessage(
      { ...listing, dataGaps: [] },
      { kaufpreisfaktor: 12.5, geschaetzterDscr: 1.45, mietQuelle: "angegeben" }
    );
    expect(text).not.toContain("Fehlende Angaben");
  });

  it("hängt KEINE Warnzeile an, wenn dataGaps ganz fehlt (Rückwärtskompatibilität)", () => {
    const text = formatTopTrefferMessage(listing, {
      kaufpreisfaktor: 12.5,
      geschaetzterDscr: 1.45,
      mietQuelle: "angegeben",
    });
    expect(text).not.toContain("Fehlende Angaben");
  });
});

describe("formatZvgTopTrefferMessage", () => {
  const zvgListing = {
    title: "Mehrfamilienhaus: Hugo-Haase-Straße 29, 04442 Zwenkau",
    url: "https://www.zvg-portal.de/index.php?button=showZvg&zvg_id=40908&land_abk=sn",
    city: "Zwenkau",
    zipCode: "04442",
    priceCents: 271_000_00,
    units: 3,
    dataGaps: [],
    court: "Leipzig in Sachsen",
    auctionAt: "2026-09-09T08:00:00.000Z",
    caseNumber: "0467 K 0076/2022",
  };

  it("enthält Gericht, Termin (Berlin-Zeit), Aktenzeichen, Verkehrswert und Link", () => {
    const text = formatZvgTopTrefferMessage(zvgListing, {
      kaufpreisfaktor: 8.5,
      geschaetzterDscr: 1.6,
      mietQuelle: "geschaetzt_bundesweit",
    });
    expect(text).toContain("Leipzig in Sachsen");
    expect(text).toContain("0467 K 0076/2022");
    expect(text).toContain("271.000");
    expect(text).toContain("09.09.2026");
    expect(text).toContain("10:00");
    expect(text).toContain(zvgListing.url);
  });

  it("hängt bei fehlenden Angaben ebenfalls die Warnzeile an", () => {
    const text = formatZvgTopTrefferMessage(
      { ...zvgListing, dataGaps: ["units_unconfirmed"] },
      { kaufpreisfaktor: 8.5, geschaetzterDscr: 1.6, mietQuelle: "geschaetzt_bundesweit" }
    );
    expect(text).toContain("⚠️ Fehlende Angaben: Einheiten nicht bestätigt");
  });
});
```

- [x] **Step 4: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd C:\immo-radar\scraper && npx vitest run lib/telegram.test.ts`
Expected: FAIL — `formatZvgTopTrefferMessage is not a function` bzw. die `data_gaps`-Assertions schlagen fehl, weil die Warnzeile noch nicht existiert.

- [x] **Step 5: `telegram.ts` implementieren**

`scraper/lib/telegram.ts` komplett wie folgt ersetzen:

```ts
export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface ListingSummary {
  title: string;
  url: string;
  city: string;
  zipCode: string;
  priceCents: number;
  units: number | null;
  dataGaps?: string[];
}

export interface ZvgListingSummary extends ListingSummary {
  court: string;
  auctionAt: string;
  caseNumber: string;
}

export interface KennzahlenSummary {
  kaufpreisfaktor: number;
  geschaetzterDscr: number;
  mietQuelle: string;
}

const DATA_GAP_LABELS: Record<string, string> = {
  units_unconfirmed: "Einheiten nicht bestätigt",
};

function formatEuro(cents: number): string {
  return (cents / 100).toLocaleString("de-DE");
}

function formatDataGapsLine(dataGaps: string[] | undefined): string | null {
  if (!dataGaps || dataGaps.length === 0) return null;
  const texte = dataGaps.map((code) => DATA_GAP_LABELS[code] ?? code);
  return `⚠️ Fehlende Angaben: ${texte.join(", ")}`;
}

function formatBerlinDatumzeit(isoDatum: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDatum));
}

export function formatTopTrefferMessage(listing: ListingSummary, k: KennzahlenSummary): string {
  return [
    `🎯 Top-Treffer: ${listing.title}`,
    `${listing.zipCode} ${listing.city} · ${listing.units ?? "?"} Einheiten · ${formatEuro(listing.priceCents)} €`,
    `Kaufpreisfaktor ${k.kaufpreisfaktor.toFixed(1)} · geschätzter DSCR ${k.geschaetzterDscr.toFixed(2)} · Miete: ${k.mietQuelle}`,
    formatDataGapsLine(listing.dataGaps),
    listing.url,
  ]
    .filter((zeile): zeile is string => zeile !== null)
    .join("\n");
}

export function formatZvgTopTrefferMessage(listing: ZvgListingSummary, k: KennzahlenSummary): string {
  return [
    `🎯 Top-Treffer (Zwangsversteigerung): ${listing.title}`,
    `${listing.zipCode} ${listing.city} · ${listing.units ?? "?"} Einheiten · Verkehrswert ${formatEuro(listing.priceCents)} €`,
    `Amtsgericht ${listing.court} · Az. ${listing.caseNumber}`,
    `Termin: ${formatBerlinDatumzeit(listing.auctionAt)} Uhr`,
    `Kaufpreisfaktor ${k.kaufpreisfaktor.toFixed(1)} · geschätzter DSCR ${k.geschaetzterDscr.toFixed(2)} · Miete: ${k.mietQuelle}`,
    formatDataGapsLine(listing.dataGaps),
    listing.url,
  ]
    .filter((zeile): zeile is string => zeile !== null)
    .join("\n");
}

export function formatPreisaenderungMessage(
  listing: ListingSummary,
  altPreisCents: number,
  neuPreisCents: number
): string {
  return [
    `💶 Preisänderung: ${listing.title}`,
    `${listing.zipCode} ${listing.city}`,
    `${formatEuro(altPreisCents)} € → ${formatEuro(neuPreisCents)} €`,
    formatDataGapsLine(listing.dataGaps),
    listing.url,
  ]
    .filter((zeile): zeile is string => zeile !== null)
    .join("\n");
}

export async function sendTelegramMessage(config: TelegramConfig, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: config.chatId, text }),
  });
  if (!res.ok) {
    throw new Error(`Telegram-Versand fehlgeschlagen: HTTP ${res.status} ${await res.text()}`);
  }
}
```

- [x] **Step 6: Test laufen lassen, Erfolg bestätigen**

Run: `cd C:\immo-radar\scraper && npx vitest run lib/telegram.test.ts`
Expected: PASS (alle bestehenden UND neuen Tests).

- [x] **Step 7: Commit**

```bash
cd C:\immo-radar
git add scraper/lib/db.ts scraper/lib/telegram.ts scraper/lib/telegram.test.ts
git commit -m "feat(scraper): data_gaps-Warnzeile + ZVG-Telegram-Format"
```

---

### Task 3: ZVG-Portal — Ergebnisliste parsen (`list.ts`)

**Files:**
- Create: `scraper/scrapers/zvg-portal/list.ts`
- Test: `scraper/scrapers/zvg-portal/list.test.ts`
- Fixture (bereits vorhanden): `scraper/test/fixtures/zvg-portal-suche-sachsen-mfh.html`

**Interfaces:**
- Produces: `ZvgListSummary { externalId: string; url: string; caseNumber: string; court: string }`, `parseZvgResultsPage(html: string): ZvgListSummary[]`. Wird von Task 5 (`index.ts`) konsumiert.

- [x] **Step 1: Test schreiben**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseZvgResultsPage } from "./list.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(
  path.join(__dirname, "..", "..", "test", "fixtures", "zvg-portal-suche-sachsen-mfh.html"),
  "utf-8"
);

describe("parseZvgResultsPage", () => {
  const results = parseZvgResultsPage(fixtureHtml);

  it("extrahiert genau die 9 gültigen Termine (10 Aktenzeichen minus 1 abgesagter Termin)", () => {
    expect(results.length).toBe(9);
  });

  it("überspringt einen abgesagten Termin ohne Detailansicht-Link", () => {
    expect(results.find((r) => r.caseNumber === "0485 K 0213/2024")).toBeUndefined();
  });

  it("extrahiert den ersten Termin korrekt", () => {
    const treffer = results.find((r) => r.caseNumber === "0467 K 0076/2022");
    expect(treffer).toBeDefined();
    expect(treffer!.externalId).toBe("sn-40908");
    expect(treffer!.url).toBe(
      "https://www.zvg-portal.de/index.php?button=showZvg&zvg_id=40908&land_abk=sn"
    );
    expect(treffer!.court).toBe("Leipzig in Sachsen");
  });

  it("extrahiert einen weiteren Termin aus einem anderen Amtsgericht korrekt (Beleg für Alle-Amtsgerichte-Aggregation)", () => {
    const treffer = results.find((r) => r.caseNumber === "0015 K 0188/2023");
    expect(treffer).toBeDefined();
    expect(treffer!.court).toBe("Chemnitz in Sachsen");
  });
});
```

- [x] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd C:\immo-radar\scraper && npx vitest run scrapers/zvg-portal/list.test.ts`
Expected: FAIL — `Cannot find module './list.js'`.

- [x] **Step 3: `list.ts` implementieren**

```ts
import * as cheerio from "cheerio";

export interface ZvgListSummary {
  externalId: string;
  url: string;
  caseNumber: string;
  court: string;
}

const ZVG_BASE_URL = "https://www.zvg-portal.de/";
const DETAIL_HREF_PATTERN = /zvg_id=(\d+)&land_abk=([a-z]+)/;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function parseZvgResultsPage(html: string): ZvgListSummary[] {
  const $ = cheerio.load(html);
  const zeilen = $('table[border="0"]').first().find("> tbody > tr").toArray();

  const gruppen: (typeof zeilen)[] = [];
  let aktuelleGruppe: typeof zeilen = [];
  for (const zeile of zeilen) {
    const istTrennzeile = $(zeile).find("hr").length > 0;
    if (istTrennzeile) {
      if (aktuelleGruppe.length > 0) gruppen.push(aktuelleGruppe);
      aktuelleGruppe = [];
      continue;
    }
    aktuelleGruppe.push(zeile);
  }
  if (aktuelleGruppe.length > 0) gruppen.push(aktuelleGruppe);

  const ergebnisse: ZvgListSummary[] = [];
  for (const gruppenZeilen of gruppen) {
    const link = $(gruppenZeilen[0]).find('a[aria-label="Zwangsversteigerung Detailansicht"]');
    if (link.length === 0) continue; // abgesagter Termin, keine Detailseite vorhanden

    const href = link.attr("href");
    if (!href) continue;
    const idMatch = href.match(DETAIL_HREF_PATTERN);
    if (!idMatch) continue;
    const [, zvgId, landAbk] = idMatch;

    const caseNumber = normalizeWhitespace(link.text()).replace(/\(Detailansicht\)\s*$/, "").trim();

    let court = "";
    for (const zeile of gruppenZeilen) {
      const tds = $(zeile).find("td");
      if (tds.length < 2) continue;
      if (normalizeWhitespace($(tds[0]).text()) === "Amtsgericht") {
        court = normalizeWhitespace($(tds[1]).text());
        break;
      }
    }

    ergebnisse.push({
      externalId: `${landAbk}-${zvgId}`,
      url: new URL(`index.php?button=showZvg&zvg_id=${zvgId}&land_abk=${landAbk}`, ZVG_BASE_URL).toString(),
      caseNumber,
      court,
    });
  }

  return ergebnisse;
}
```

- [x] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `cd C:\immo-radar\scraper && npx vitest run scrapers/zvg-portal/list.test.ts`
Expected: PASS (alle 4 Tests).

- [x] **Step 5: Commit**

```bash
cd C:\immo-radar
git add scraper/scrapers/zvg-portal/list.ts scraper/scrapers/zvg-portal/list.test.ts
git commit -m "feat(scraper): ZVG-Portal Ergebnisliste parsen"
```

---

### Task 4: ZVG-Portal — Detailseite parsen (`detail.ts`)

**Files:**
- Create: `scraper/scrapers/zvg-portal/detail.ts`
- Test: `scraper/scrapers/zvg-portal/detail.test.ts`
- Fixture (bereits vorhanden): `scraper/test/fixtures/zvg-portal-detail-40908.html`

**Interfaces:**
- Consumes: nichts aus anderen Tasks (unabhängig von `list.ts` implementierbar/testbar).
- Produces: `ZvgDetailData` (siehe unten), `parseZvgDetailPage(html: string, kontext: { externalId: string; url: string; court: string; caseNumber: string }): ZvgDetailData`. Wird von Task 5 (`index.ts`) konsumiert; Feldnamen müssen zu `PipelineCandidate` (Task 6) passen.

- [x] **Step 1: Test schreiben**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseZvgDetailPage } from "./detail.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(
  path.join(__dirname, "..", "..", "test", "fixtures", "zvg-portal-detail-40908.html"),
  "utf-8"
);

const KONTEXT = {
  externalId: "sn-40908",
  url: "https://www.zvg-portal.de/index.php?button=showZvg&zvg_id=40908&land_abk=sn",
  court: "Leipzig in Sachsen",
  caseNumber: "0467 K 0076/2022",
};

describe("parseZvgDetailPage", () => {
  const daten = parseZvgDetailPage(fixtureHtml, KONTEXT);

  it("übernimmt Kontext-Felder unverändert", () => {
    expect(daten.externalId).toBe(KONTEXT.externalId);
    expect(daten.url).toBe(KONTEXT.url);
    expect(daten.court).toBe(KONTEXT.court);
    expect(daten.caseNumber).toBe(KONTEXT.caseNumber);
  });

  it("liest den Verkehrswert korrekt in Cent", () => {
    expect(daten.priceCents).toBe(271_000_00);
  });

  it("liest PLZ und Ort aus Objekt/Lage", () => {
    expect(daten.zipCode).toBe("04442");
    expect(daten.city).toBe("Zwenkau");
  });

  it("erkennt die Einheitenzahl aus dem Wort 'Dreifamilienwohnhaus'", () => {
    expect(daten.units).toBe(3);
    expect(daten.unitsConfident).toBe(true);
  });

  it("liest Wohnfläche und Baujahr aus der Beschreibung", () => {
    expect(daten.livingAreaM2).toBe(203);
    expect(daten.yearBuilt).toBe(1937);
  });

  it("wandelt den Termin in ein korrektes UTC-ISO-Datum um (Sommerzeit)", () => {
    expect(daten.auctionAt).toBe("2026-09-09T08:00:00.000Z");
  });

  it("baut raw_notice_text aus allen Feldern inkl. PDF-Link auf", () => {
    expect(daten.rawNoticeText).toContain("Zwangsversteigerung zum Zwecke der Aufhebung der Gemeinschaft");
    expect(daten.rawNoticeText).toContain("Grundbuch des Amtsgerichts Borna von Zwenkau, Blatt 756");
    expect(daten.rawNoticeText).toContain("Dreifamilienwohnhaus");
    expect(daten.rawNoticeText).toContain("271.000,00");
    expect(daten.rawNoticeText).toContain(
      "https://www.zvg-portal.de/index.php?button=showAnhang&land_abk=sn&file_id=109158&zvg_id=40908"
    );
  });
});

describe("parseZvgDetailPage — Winterzeit-Regression", () => {
  it("wandelt einen Dezember-Termin korrekt mit UTC+1 um", () => {
    const html = fixtureHtml.replace(
      "Mittwoch, 09. September 2026, 10:00 Uhr",
      "Dienstag, 15. Dezember 2026, 09:00 Uhr"
    );
    const daten = parseZvgDetailPage(html, KONTEXT);
    expect(daten.auctionAt).toBe("2026-12-15T08:00:00.000Z");
  });
});

describe("parseZvgDetailPage — kein Einheiten-Hinweis im Text", () => {
  it("liefert units=null statt zu raten, wenn der Text keinen Hinweis enthält", () => {
    const html = fixtureHtml.replace(
      "Dreifamilienwohnhaus, zweigeschossig, unterkellert, ausgebautes Dachgeschoss, ca. 203 qm Wohnfläche, freistehend.",
      "Wohnhaus, zweigeschossig, unterkellert, ausgebautes Dachgeschoss, ca. 203 qm Wohnfläche, freistehend."
    );
    const daten = parseZvgDetailPage(html, KONTEXT);
    expect(daten.units).toBeNull();
    expect(daten.unitsConfident).toBe(false);
  });
});
```

- [x] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd C:\immo-radar\scraper && npx vitest run scrapers/zvg-portal/detail.test.ts`
Expected: FAIL — `Cannot find module './detail.js'`.

- [x] **Step 3: `detail.ts` implementieren**

```ts
import * as cheerio from "cheerio";

export interface ZvgDetailData {
  externalId: string;
  url: string;
  title: string;
  caseNumber: string;
  court: string;
  priceCents: number;
  auctionAt: string | null;
  zipCode: string;
  city: string;
  units: number | null;
  unitsConfident: boolean;
  livingAreaM2: number | null;
  yearBuilt: number | null;
  rawNoticeText: string;
}

interface ZvgDetailKontext {
  externalId: string;
  url: string;
  court: string;
  caseNumber: string;
}

const OBJEKT_LAGE_PATTERN = /^(.+?):\s*(.+),\s*(\d{5})\s+(.+)$/;
const UNIT_COUNT_PATTERN = /(\d+)\s*(?:Wohneinheiten|WE\b|Parteien|Wohnungen)/i;
const UNIT_WORD_PATTERN = /(ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn)familien(?:wohn)?haus/i;
const UNIT_WORDS: Record<string, number> = {
  ein: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
};
const WOHNFLAECHE_PATTERN = /(\d+(?:[.,]\d+)?)\s*qm\s*Wohnfl(?:ä|ae)che/i;
const BAUJAHR_PATTERN = /Bj\.?\s*(\d{4})/i;
const TERMIN_PATTERN = /(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\s+(\d{4}),\s*(\d{1,2}):(\d{2})\s*Uhr/;
const GERMAN_MONTHS: Record<string, number> = {
  Januar: 1,
  Februar: 2,
  März: 3,
  April: 4,
  Mai: 5,
  Juni: 6,
  Juli: 7,
  August: 8,
  September: 9,
  Oktober: 10,
  November: 11,
  Dezember: 12,
};

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function zellenText($: cheerio.CheerioAPI, zelle: cheerio.Cheerio<any>): string {
  const absaetze = zelle.find("p");
  if (absaetze.length > 0) {
    return absaetze
      .toArray()
      .map((p) => normalizeWhitespace($(p).text()))
      .filter((text) => text.length > 0)
      .join("\n");
  }
  return normalizeWhitespace(zelle.text());
}

function parseGermanNumber(text: string): number {
  const cleaned = text.replace(/[^\d,]/g, "").replace(",", ".");
  return parseFloat(cleaned);
}

function parseUnits(text: string): { units: number | null; unitsConfident: boolean } {
  const zahlMatch = text.match(UNIT_COUNT_PATTERN);
  if (zahlMatch) {
    return { units: parseInt(zahlMatch[1], 10), unitsConfident: true };
  }
  const wortMatch = text.match(UNIT_WORD_PATTERN);
  if (wortMatch) {
    const zahl = UNIT_WORDS[wortMatch[1].toLowerCase()];
    if (zahl !== undefined) {
      return { units: zahl, unitsConfident: true };
    }
  }
  return { units: null, unitsConfident: false };
}

function parseTerminZuUtcIso(text: string): string | null {
  const match = text.match(TERMIN_PATTERN);
  if (!match) return null;
  const [, tagText, monatName, jahrText, stundeText, minuteText] = match;
  const monat = GERMAN_MONTHS[monatName as keyof typeof GERMAN_MONTHS];
  if (!monat) return null;
  const tag = parseInt(tagText, 10);
  const jahr = parseInt(jahrText, 10);
  const stunde = parseInt(stundeText, 10);
  const minute = parseInt(minuteText, 10);

  for (const offsetStunden of [2, 1]) {
    const kandidat = new Date(Date.UTC(jahr, monat - 1, tag, stunde - offsetStunden, minute));
    const formatiert = new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(kandidat);
    const erwartet = `${String(tag).padStart(2, "0")}.${String(monat).padStart(2, "0")}.${jahr}, ${String(
      stunde
    ).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    if (formatiert === erwartet) return kandidat.toISOString();
  }
  return new Date(Date.UTC(jahr, monat - 1, tag, stunde - 2, minute)).toISOString();
}

export function parseZvgDetailPage(html: string, kontext: ZvgDetailKontext): ZvgDetailData {
  const $ = cheerio.load(html);
  const zeilen = $("#anzeige > tbody > tr").toArray();

  const felder: { label: string; wert: string }[] = [];
  let verkehrswertText = "";
  let terminText = "";
  let objektLageText = "";
  let beschreibungText = "";

  for (const zeile of zeilen.slice(1)) {
    const tds = $(zeile).find("td");
    if (tds.length < 2) continue;
    const rawLabel = normalizeWhitespace($(tds[0]).text());
    if (!rawLabel || /^amtliche bekanntmachung/i.test(rawLabel)) continue;
    const label = rawLabel.replace(/:$/, "");
    const wert = zellenText($, $(tds[1]));
    felder.push({ label, wert });
    if (label === "Verkehrswert in €") verkehrswertText = wert;
    if (label === "Termin") terminText = wert;
    if (label === "Objekt/Lage") objektLageText = wert;
    if (label === "Beschreibung") beschreibungText = wert;
  }

  const objektMatch = objektLageText.match(OBJEKT_LAGE_PATTERN);
  const zipCode = objektMatch ? objektMatch[3] : "";
  const city = objektMatch ? objektMatch[4] : "";

  const { units, unitsConfident } = parseUnits(beschreibungText);
  const wohnflaecheMatch = beschreibungText.match(WOHNFLAECHE_PATTERN);
  const baujahrMatch = beschreibungText.match(BAUJAHR_PATTERN);

  const priceCents = Math.round(parseGermanNumber(verkehrswertText) * 100);
  if (!Number.isFinite(priceCents)) {
    throw new Error(`Ungültiger Verkehrswert (nicht numerisch): "${verkehrswertText}"`);
  }

  const anhangHref = $('a[aria-label="Anhang"]').attr("href");
  const rawNoticeTextZeilen = felder.map((f) => `${f.label}: ${f.wert}`);
  if (anhangHref) {
    rawNoticeTextZeilen.push(
      `Amtliche Bekanntmachung (PDF): ${new URL(anhangHref.trim(), kontext.url).toString()}`
    );
  }

  return {
    externalId: kontext.externalId,
    url: kontext.url,
    title: objektLageText,
    caseNumber: kontext.caseNumber,
    court: kontext.court,
    priceCents,
    auctionAt: parseTerminZuUtcIso(terminText),
    zipCode,
    city,
    units,
    unitsConfident,
    livingAreaM2: wohnflaecheMatch ? parseGermanNumber(wohnflaecheMatch[1]) : null,
    yearBuilt: baujahrMatch ? parseInt(baujahrMatch[1], 10) : null,
    rawNoticeText: rawNoticeTextZeilen.join("\n"),
  };
}
```

- [x] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `cd C:\immo-radar\scraper && npx vitest run scrapers/zvg-portal/detail.test.ts`
Expected: PASS (alle 9 Tests).

- [x] **Step 5: Commit**

```bash
cd C:\immo-radar
git add scraper/scrapers/zvg-portal/detail.ts scraper/scrapers/zvg-portal/detail.test.ts
git commit -m "feat(scraper): ZVG-Portal Detailseite parsen"
```

---

### Task 5: ZVG-Portal — Playwright-Orchestrierung (`index.ts`)

**Files:**
- Create: `scraper/scrapers/zvg-portal/index.ts`

**Interfaces:**
- Consumes: `parseZvgResultsPage`, `ZvgListSummary` (aus `./list.js`), `parseZvgDetailPage`, `ZvgDetailData` (aus `./detail.js`)
- Produces: `scrapeZvgPortal(): Promise<ZvgDetailData[]>`

Kein isolierter Unit-Test möglich (führt echte Netzwerk-Requests via Playwright aus) — Verifikation erfolgt manuell in Task 8, analog zu `scrapers/immowelt/index.ts`. Direkt implementieren:

- [x] **Step 1: `index.ts` implementieren**

```ts
import { chromium, type Page } from "playwright";
import { parseZvgResultsPage, type ZvgListSummary } from "./list.js";
import { parseZvgDetailPage, type ZvgDetailData } from "./detail.js";

const SEARCH_URL = "https://www.zvg-portal.de/index.php?button=Termine%20suchen";
const MEHRFAMILIENHAUS_OBJ_TYP = "4";
const ALLE_AMTSGERICHTE = "0";
const VERZOEGERUNG_MS = 1000;
const MAX_SEITEN_PRO_BUNDESLAND = 30;

const BUNDESLAND_CODES = [
  "bw", "by", "be", "br", "hb", "hh", "he", "mv",
  "ni", "nw", "rp", "sl", "sn", "st", "sh", "th",
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sucheFuerBundesland(page: Page, landAbk: string): Promise<void> {
  await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded" });
  await page.selectOption("#obj_liste", MEHRFAMILIENHAUS_OBJ_TYP);
  await page.evaluate(() => (window as unknown as { insertObj: () => void }).insertObj());
  await page.selectOption("select[name='land_abk']", landAbk);
  await page.selectOption("select[name='ger_id']", ALLE_AMTSGERICHTE);
  await page.click("form[name='globe'] button[type='submit']");
  await page.waitForLoadState("domcontentloaded");
}

async function alleSeitenErfassen(page: Page): Promise<ZvgListSummary[]> {
  const ergebnisse: ZvgListSummary[] = [];
  let seite = 1;
  while (seite <= MAX_SEITEN_PRO_BUNDESLAND) {
    ergebnisse.push(...parseZvgResultsPage(await page.content()));
    const naechstesSeitenLabel = `blättern zur Sitennummer ${seite + 1}`;
    const gibtNaechsteSeite = (await page.locator(`button[aria-label="${naechstesSeitenLabel}"]`).count()) > 0;
    if (!gibtNaechsteSeite) break;
    await page.click(`button[aria-label="${naechstesSeitenLabel}"]`);
    await page.waitForLoadState("domcontentloaded");
    seite += 1;
  }
  return ergebnisse;
}

async function detailsErfassen(page: Page, zusammenfassungen: ZvgListSummary[]): Promise<ZvgDetailData[]> {
  const ergebnisse: ZvgDetailData[] = [];
  const referer = page.url();
  for (const zusammenfassung of zusammenfassungen) {
    await sleep(VERZOEGERUNG_MS);
    try {
      await page.goto(zusammenfassung.url, { waitUntil: "domcontentloaded", referer });
      const html = await page.content();
      ergebnisse.push(
        parseZvgDetailPage(html, {
          externalId: zusammenfassung.externalId,
          url: zusammenfassung.url,
          court: zusammenfassung.court,
          caseNumber: zusammenfassung.caseNumber,
        })
      );
    } catch (err) {
      console.warn(`ZVG-Detailseite ${zusammenfassung.url}: Fehler, übersprungen`, err);
    }
  }
  return ergebnisse;
}

export async function scrapeZvgPortal(): Promise<ZvgDetailData[]> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const alleTermine: ZvgDetailData[] = [];
    for (const landAbk of BUNDESLAND_CODES) {
      await sleep(VERZOEGERUNG_MS);
      try {
        await sucheFuerBundesland(page, landAbk);
        const zusammenfassungen = await alleSeitenErfassen(page);
        console.log(`ZVG-Portal ${landAbk}: ${zusammenfassungen.length} Mehrfamilienhaus-Termine gefunden.`);
        const details = await detailsErfassen(page, zusammenfassungen);
        alleTermine.push(...details);
      } catch (err) {
        console.warn(`ZVG-Portal Bundesland ${landAbk}: Fehler, uebersprungen`, err);
      }
    }
    return alleTermine;
  } finally {
    await browser.close();
  }
}
```

- [x] **Step 2: TypeScript-Check**

Run: `cd C:\immo-radar\scraper && npx tsc --noEmit`
Expected: keine Fehler.

- [x] **Step 3: Commit**

```bash
cd C:\immo-radar
git add scraper/scrapers/zvg-portal/index.ts
git commit -m "feat(scraper): ZVG-Portal Playwright-Orchestrierung ueber alle Bundeslaender"
```

---

### Task 6: Gemeinsame Pipeline-Funktion + Immowelt-Retrofit + `main.ts` generalisieren

Dieser Task setzt die eigentliche `data_gaps`-Verhaltensänderung in Kraft (Objekte mit unbestätigter Einheitenzahl werden nicht mehr übersprungen) UND verdrahtet ZVG-Portal als zweite Quelle.

**Files:**
- Create: `scraper/lib/pipeline.ts`
- Test: `scraper/lib/pipeline.test.ts`
- Modify: `scraper/main.ts`

**Interfaces:**
- Consumes: `upsertListingAndVersion`, `logNotification` (aus `./db.js`), `berechneKennzahlen` (aus `./metrics.js`), `ermittleJahreskaltmiete` (aus `./rentEstimate.js`), `grunderwerbsteuerSatz`, `bundeslandFuerPlz` (aus `./grunderwerbsteuer.js`), `sendTelegramMessage`, `formatTopTrefferMessage`, `formatZvgTopTrefferMessage`, `formatPreisaenderungMessage`, `TelegramConfig` (aus `./telegram.js`).
- Produces: `bewerteEinheiten(units: number | null): { ausschliessen: boolean; einheitenFuerBerechnung: number; dataGaps: string[] }` (pure, unit-getestet), `PipelineCandidate` (Interface), `processCandidate(supabase: SupabaseClient, telegramConfig: TelegramConfig, candidate: PipelineCandidate): Promise<void>`.

- [x] **Step 1: Test für `bewerteEinheiten` schreiben**

```ts
import { describe, it, expect } from "vitest";
import { bewerteEinheiten } from "./pipeline.js";

describe("bewerteEinheiten", () => {
  it("schließt eine BESTÄTIGTE Zahl unter der Mindestgrenze aus", () => {
    const ergebnis = bewerteEinheiten(2);
    expect(ergebnis.ausschliessen).toBe(true);
  });

  it("schließt eine bestätigte Zahl AB der Mindestgrenze NICHT aus, ohne data_gaps", () => {
    const ergebnis = bewerteEinheiten(5);
    expect(ergebnis.ausschliessen).toBe(false);
    expect(ergebnis.einheitenFuerBerechnung).toBe(5);
    expect(ergebnis.dataGaps).toEqual([]);
  });

  it("schließt eine UNBEKANNTE Zahl NICHT aus, setzt die Mindestgrenze als Rechen-Untergrenze und markiert die Lücke", () => {
    const ergebnis = bewerteEinheiten(null);
    expect(ergebnis.ausschliessen).toBe(false);
    expect(ergebnis.einheitenFuerBerechnung).toBe(3);
    expect(ergebnis.dataGaps).toEqual(["units_unconfirmed"]);
  });
});
```

- [x] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd C:\immo-radar\scraper && npx vitest run lib/pipeline.test.ts`
Expected: FAIL — `Cannot find module './pipeline.js'`.

- [x] **Step 3: `pipeline.ts` implementieren**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { grunderwerbsteuerSatz, bundeslandFuerPlz } from "./grunderwerbsteuer.js";
import { berechneKennzahlen } from "./metrics.js";
import { ermittleJahreskaltmiete } from "./rentEstimate.js";
import { upsertListingAndVersion, logNotification } from "./db.js";
import {
  sendTelegramMessage,
  formatTopTrefferMessage,
  formatZvgTopTrefferMessage,
  formatPreisaenderungMessage,
  type TelegramConfig,
  type ListingSummary,
} from "./telegram.js";

const MIN_EINHEITEN = 3;

export interface EinheitenAuswertung {
  ausschliessen: boolean;
  einheitenFuerBerechnung: number;
  dataGaps: string[];
}

export function bewerteEinheiten(units: number | null): EinheitenAuswertung {
  if (units !== null && units < MIN_EINHEITEN) {
    return { ausschliessen: true, einheitenFuerBerechnung: units, dataGaps: [] };
  }
  if (units === null) {
    return { ausschliessen: false, einheitenFuerBerechnung: MIN_EINHEITEN, dataGaps: ["units_unconfirmed"] };
  }
  return { ausschliessen: false, einheitenFuerBerechnung: units, dataGaps: [] };
}

export interface PipelineCandidate {
  source: string;
  externalId: string;
  url: string;
  title: string;
  priceCents: number;
  livingAreaM2: number | null;
  plotAreaM2: number | null;
  units: number | null;
  unitsConfident: boolean;
  yearBuilt: number | null;
  zipCode: string;
  city: string;
  rentColdMonthly: number | null;
  auctionAt: string | null;
  court: string | null;
  caseNumber: string | null;
  rawNoticeText: string | null;
}

export async function processCandidate(
  supabase: SupabaseClient,
  telegramConfig: TelegramConfig,
  candidate: PipelineCandidate
): Promise<void> {
  const einheiten = bewerteEinheiten(candidate.units);
  if (einheiten.ausschliessen) {
    console.log(
      `Übersprungen (Einheiten bestätigt: ${candidate.units}, benötigt >=${MIN_EINHEITEN}): ${candidate.title}`
    );
    return;
  }

  const miete = ermittleJahreskaltmiete(candidate.rentColdMonthly, candidate.livingAreaM2 ?? 0);
  const satz = grunderwerbsteuerSatz(candidate.zipCode);
  const bundesland = bundeslandFuerPlz(candidate.zipCode);
  const kennzahlen = berechneKennzahlen(
    {
      kaufpreis: candidate.priceCents / 100,
      jahreskaltmiete: miete.jahreskaltmiete,
      einheiten: einheiten.einheitenFuerBerechnung,
      baujahr: candidate.yearBuilt,
      wohnflaecheM2: candidate.livingAreaM2 ?? 0,
    },
    satz
  );

  const diff = await upsertListingAndVersion(supabase, {
    source: candidate.source,
    externalId: candidate.externalId,
    url: candidate.url,
    priceCents: candidate.priceCents,
    rentColdMonthlyCents: candidate.rentColdMonthly === null ? null : Math.round(candidate.rentColdMonthly * 100),
    rentSource: miete.quelle,
    livingAreaM2: candidate.livingAreaM2,
    plotAreaM2: candidate.plotAreaM2,
    units: candidate.units,
    unitsConfident: candidate.unitsConfident,
    yearBuilt: candidate.yearBuilt,
    zipCode: candidate.zipCode,
    city: candidate.city,
    bundesland,
    title: candidate.title,
    kennzahlen,
    auctionAt: candidate.auctionAt,
    court: candidate.court,
    caseNumber: candidate.caseNumber,
    rawNoticeText: candidate.rawNoticeText,
    dataGaps: einheiten.dataGaps,
  });

  const listingSummary: ListingSummary = {
    title: candidate.title,
    url: candidate.url,
    city: candidate.city,
    zipCode: candidate.zipCode,
    priceCents: candidate.priceCents,
    units: candidate.units,
    dataGaps: einheiten.dataGaps,
  };

  try {
    if (diff.changed && kennzahlen.topTreffer) {
      const kennzahlenSummary = {
        kaufpreisfaktor: kennzahlen.kaufpreisfaktor,
        geschaetzterDscr: kennzahlen.geschaetzterDscr,
        mietQuelle: miete.quelle,
      };
      const text =
        candidate.source === "zvg-portal" && candidate.court && candidate.auctionAt && candidate.caseNumber
          ? formatZvgTopTrefferMessage(
              {
                ...listingSummary,
                court: candidate.court,
                auctionAt: candidate.auctionAt,
                caseNumber: candidate.caseNumber,
              },
              kennzahlenSummary
            )
          : formatTopTrefferMessage(listingSummary, kennzahlenSummary);
      await sendTelegramMessage(telegramConfig, text);
      await logNotification(supabase, diff.listingId, "top_treffer", {
        ...kennzahlenSummary,
        priceCents: candidate.priceCents,
      });
    }

    if (diff.priceDropped && diff.previousPriceCents !== null) {
      await sendTelegramMessage(
        telegramConfig,
        formatPreisaenderungMessage(listingSummary, diff.previousPriceCents, candidate.priceCents)
      );
      await logNotification(supabase, diff.listingId, "preisaenderung", {
        altPreisCents: diff.previousPriceCents,
        neuPreisCents: candidate.priceCents,
      });
    }
  } catch (err) {
    console.error(`Benachrichtigung fehlgeschlagen fuer "${candidate.title}" (${candidate.url}):`, err);
  }
}
```

- [x] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `cd C:\immo-radar\scraper && npx vitest run lib/pipeline.test.ts`
Expected: PASS (alle 3 Tests).

- [x] **Step 5: `main.ts` generalisieren**

`scraper/main.ts` komplett wie folgt ersetzen:

```ts
import { scrapeImmowelt } from "./scrapers/immowelt/index.js";
import { scrapeZvgPortal } from "./scrapers/zvg-portal/index.js";
import { processCandidate, type PipelineCandidate } from "./lib/pipeline.js";
import { sb } from "./lib/supabase.js";

async function main() {
  const REQUIRED_ENV_VARS = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"];
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      throw new Error(`Fehlende Umgebungsvariable: ${key}`);
    }
  }

  const telegramConfig = {
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
  };

  console.log("Immowelt: Scraping gestartet...");
  const immoweltTreffer = await scrapeImmowelt();
  console.log(`Immowelt: ${immoweltTreffer.length} Mehrfamilienhaus-Kandidaten von Seite 1.`);
  for (const objekt of immoweltTreffer) {
    const candidate: PipelineCandidate = {
      source: "immowelt",
      externalId: objekt.externalId,
      url: objekt.url,
      title: objekt.title,
      priceCents: objekt.priceCents,
      livingAreaM2: objekt.livingAreaM2,
      plotAreaM2: objekt.plotAreaM2,
      units: objekt.units,
      unitsConfident: objekt.unitsConfident,
      yearBuilt: objekt.yearBuilt,
      zipCode: objekt.zipCode,
      city: objekt.city,
      rentColdMonthly: objekt.rentColdMonthly,
      auctionAt: null,
      court: null,
      caseNumber: null,
      rawNoticeText: null,
    };
    await processCandidate(sb, telegramConfig, candidate);
  }

  console.log("ZVG-Portal: Scraping gestartet...");
  const zvgTermine = await scrapeZvgPortal();
  console.log(`ZVG-Portal: ${zvgTermine.length} Mehrfamilienhaus-Termine gefunden.`);
  for (const termin of zvgTermine) {
    const candidate: PipelineCandidate = {
      source: "zvg-portal",
      externalId: termin.externalId,
      url: termin.url,
      title: termin.title,
      priceCents: termin.priceCents,
      livingAreaM2: termin.livingAreaM2,
      plotAreaM2: null,
      units: termin.units,
      unitsConfident: termin.unitsConfident,
      yearBuilt: termin.yearBuilt,
      zipCode: termin.zipCode,
      city: termin.city,
      rentColdMonthly: null,
      auctionAt: termin.auctionAt,
      court: termin.court,
      caseNumber: termin.caseNumber,
      rawNoticeText: termin.rawNoticeText,
    };
    await processCandidate(sb, telegramConfig, candidate);
  }

  console.log("Lauf abgeschlossen.");
}

main().catch((err) => {
  console.error("Pipeline-Fehler:", err);
  process.exitCode = 1;
});
```

- [x] **Step 6: TypeScript-Check über das ganze Projekt**

Run: `cd C:\immo-radar\scraper && npx tsc --noEmit`
Expected: keine Fehler.

- [x] **Step 7: Gesamte Testsuite laufen lassen**

Run: `cd C:\immo-radar\scraper && npm test`
Expected: alle Tests PASS (Immowelt-Tests weiterhin grün, neue ZVG- und Pipeline-Tests grün).

- [x] **Step 8: Commit**

```bash
cd C:\immo-radar
git add scraper/lib/pipeline.ts scraper/lib/pipeline.test.ts scraper/main.ts
git commit -m "feat(scraper): gemeinsame Pipeline + ZVG-Portal verdrahtet + Immowelt-Skip-Bug behoben

Objekte mit unbestaetigter Einheitenzahl werden nicht mehr stillschweigend
uebersprungen, sondern mit data_gaps=[\"units_unconfirmed\"] gespeichert."
```

---

### Task 7: CI-Workflow + Script-Umbenennung

**Files:**
- Modify: `scraper/package.json`
- Modify: `.github/workflows/scrape.yml`

**Interfaces:** keine (reine Infrastruktur-Änderung).

- [x] **Step 1: `package.json`-Script umbenennen**

In `scraper/package.json` das Script `"scrape:immowelt": "tsx main.ts"` umbenennen zu `"scrape": "tsx main.ts"` (main.ts deckt jetzt beide Quellen ab, der alte Name ist irreführend geworden).

- [x] **Step 2: CI-Workflow aktualisieren**

In `.github/workflows/scrape.yml` einen Playwright-Browser-Install-Schritt ergänzen und den Script-Namen anpassen:

```yaml
name: scrape

on:
  schedule:
    - cron: "0 */3 * * *"
  workflow_dispatch: {}

jobs:
  scrape:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
      TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
      TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
          cache-dependency-path: scraper/package-lock.json
      - run: npm ci
        working-directory: scraper
      - run: npx playwright install --with-deps chromium
        working-directory: scraper
      - run: npm run scrape
        working-directory: scraper
```

- [x] **Step 3: Commit**

```bash
cd C:\immo-radar
git add scraper/package.json .github/workflows/scrape.yml
git commit -m "chore(ci): Playwright-Browser-Install + Script-Umbenennung fuer zwei Quellen"
```

---

### Task 8: End-to-End-Verifikation

**Manueller Verifikationslauf gegen die echten Dienste** (analog zu Task 13 im Foundation-Plan).

**Files:** keine neuen — reine Verifikation, ggf. Korrekturen an bestehenden Dateien.

- [x] **Step 1: 15-Minuten-Timeout im Workflow prüfen**

Ein voller Lauf umfasst jetzt 16 Playwright-Bundesland-Suchen (ZVG) zusätzlich zum bisherigen Immowelt-Scrape. Lokal die Laufzeit messen (nächster Schritt) und `timeout-minutes: 15` im Workflow bei Bedarf erhöhen.

- [x] **Step 2: Lokalen Testlauf mit echten Zugangsdaten ausführen**

`scraper/.env` lokal anlegen (nicht committen) mit `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Dann:

Run: `cd C:\immo-radar\scraper && npm run scrape`

Erwartet: Konsolen-Log zeigt sowohl `Immowelt: ...` als auch `ZVG-Portal: ...`-Zeilen inkl. Treffer-Zahl je Bundesland; Lauf endet mit `Lauf abgeschlossen.` ohne unbehandelten Fehler. Laufzeit notieren, `timeout-minutes` in `scrape.yml` bei Bedarf anpassen (Schritt 1).

- [x] **Step 3: Datenbank stichprobenartig prüfen**

Im Supabase Table Editor `listing_versions` nach `source = 'zvg-portal'` filtern: mindestens einige Zeilen vorhanden, `case_number`/`court`/`auction_at`/`raw_notice_text` befüllt, `price_cents` plausibel (Verkehrswert-Größenordnung).

- [x] **Step 4: `data_gaps` stichprobenartig prüfen**

Nach Zeilen mit `data_gaps @> '{"units_unconfirmed"}'` filtern (sowohl `source='immowelt'` als auch `source='zvg-portal'` sollten vorkommen können). Bestätigt, dass Objekte mit unbekannter Einheitenzahl jetzt gespeichert werden statt zu verschwinden.

- [x] **Step 5: Telegram-Nachrichten sichten (falls ein Top-Treffer/eine Preisänderung ausgelöst wurde)**

Im Telegram-Chat prüfen: ZVG-Nachrichten enthalten Gericht/Termin/Aktenzeichen im erwarteten Format; bei `data_gaps` erscheint die Warnzeile; Links sind gültige, aufrufbare `zvg-portal.de`-URLs.

- [x] **Step 6: Korrekturen committen (falls nötig)**

Falls beim Live-Lauf Anpassungen nötig wurden (z.B. abweichende Feldformate bei anderen Bundesländern/Amtsgerichten):

```bash
cd C:\immo-radar
git add -A
git commit -m "fix(scraper): Korrekturen aus End-to-End-Verifikation ZVG-Portal"
git push
```

Falls keine Anpassungen nötig waren, direkt pushen:

```bash
git push
```

Plan 2 ist damit abgeschlossen — Cron übernimmt ab dem nächsten planmäßigen Lauf automatisch beide Quellen.
