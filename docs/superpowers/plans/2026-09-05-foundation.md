# immo-radar Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** End-to-end funktionierende Pipeline für EINE Plattform (Immowelt): Mehrfamilienhäuser (≥3 Einheiten) finden, professionelle Rendite-/Finanzierbarkeits-Kennzahlen berechnen, Preisverlauf versionieren, Top-Treffer und Preisänderungen per Telegram melden. Beweist das Gesamtkonzept, bevor in Folgeplänen weitere Plattformen (Plan 2) und das Web-Dashboard (Plan 3) dazukommen.

**Architektur:** Node/TypeScript, per `tsx` direkt ausgeführt (kein Build-Schritt), analog zum bestehenden Margn-Projekt. Reine Berechnungslogik (Kennzahlen, Grunderwerbsteuer-Lookup, Änderungserkennung, Nachrichten-Formatierung) ist mit Vitest komplett unit-getestet. Scraping (HTTP-Zugriff auf Immowelt) und I/O (Supabase, Telegram) werden manuell gegen die echten Dienste verifiziert, da automatisierte Tests hier keinen echten Mehrwert gegenüber Fixture-Tests bieten und die echten Dienste (neues Supabase-Projekt, Telegram-Bot) erst im Rahmen dieses Plans vom Nutzer angelegt werden.

**Tech Stack:** TypeScript (ESM, `strict: true`), `tsx` als Runtime, `vitest` als Testrunner, `cheerio` für HTML-Parsing, `@supabase/supabase-js`, `dotenv`, `adm-zip` (einmalige Datengenerierung). GitHub Actions als Cron. Supabase (Postgres) als Datenbank. Telegram Bot API per `fetch` (kein SDK nötig).

**Spec:** `docs/superpowers/specs/2026-09-05-immo-radar-design.md`

## Global Constraints

- Node.js 22+ (verifiziert lokal vorhanden: v22.22.2), ESM (`"type": "module"` in jeder package.json).
- Kein bezahlter Dienst (0€-Budget) — keine Proxy-/Anti-Bot-Dienste, keine kostenpflichtigen APIs.
- Nur öffentlich sichtbare Such- und Objektseiten werden abgerufen, kein Login bei Immowelt.
- `robots.txt` von Immowelt verbietet `/classified-search*`, `/classified-map*`, `/liste/getlistitems`, `/liste/karte`, `/classifiedList/` — diese Pfade werden NIE angefragt. `/suche/...`-Seiten sind nicht gesperrt und werden verwendet.
- Gedrosselte Anfragen: mindestens 1000ms Pause zwischen Detailseiten-Abrufen.
- Kaufnebenkosten-Formel, Bewirtschaftungskosten-Bausteine, Top-Treffer-Kriterium: exakt wie in der Spec unter "Bewertungslogik" definiert (Kapitaldienst-Satz 6%, Top-Treffer = Kaufpreisfaktor ≤15 UND DSCR ≥1,3 UND kein Finanzierungsrisiko-Flag).
- Mindestens 3 Einheiten für Aufnahme; kann nicht strukturiert bestätigt werden → Objekt wird NICHT aufgenommen (konservativ, siehe Task 5).
- Alle Geldbeträge werden intern als Cent (Integer) gespeichert, um Rundungsfehler zu vermeiden; Berechnungsfunktionen selbst rechnen in vollen Euro (Fließkomma) und werden erst beim Speichern in Cent umgerechnet.

---

## Task 1: Projekt-Grundgerüst + Grunderwerbsteuer-/PLZ-Lookup

**Files:**
- Create: `C:\immo-radar\.gitignore`
- Create: `C:\immo-radar\scraper\package.json`
- Create: `C:\immo-radar\scraper\tsconfig.json`
- Create: `C:\immo-radar\scraper\scripts\generate-plz-table.mts`
- Create: `C:\immo-radar\scraper\lib\plzBundesland.generated.json` (generiert, nicht von Hand geschrieben)
- Create: `C:\immo-radar\scraper\lib\grunderwerbsteuer.ts`
- Test: `C:\immo-radar\scraper\lib\grunderwerbsteuer.test.ts`

**Interfaces:**
- Produces: `grunderwerbsteuerSatz(plz: string): number` (Prozentsatz, z.B. `3.5`)

- [ ] **Step 1: `.gitignore` anlegen**

```
node_modules/
.env
.env.local
dist/
```

- [ ] **Step 2: `scraper/package.json` anlegen**

```json
{
  "name": "immo-radar-scraper",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "generate:plz": "tsx scripts/generate-plz-table.mts",
    "scrape:immowelt": "tsx main.ts"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2",
    "cheerio": "^1",
    "dotenv": "^17"
  },
  "devDependencies": {
    "@types/adm-zip": "^0.5",
    "@types/node": "^22",
    "adm-zip": "^0.5",
    "tsx": "^4",
    "typescript": "^5",
    "vitest": "^2"
  }
}
```

- [ ] **Step 3: `scraper/tsconfig.json` anlegen**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  }
}
```

- [ ] **Step 4: Dependencies installieren**

Run: `cd C:\immo-radar\scraper && npm install`
Expected: `node_modules/` wird erzeugt, kein Fehler.

- [ ] **Step 5: Generator-Skript für die PLZ→Bundesland-Tabelle schreiben**

Datenquelle: GeoNames DE-Postleitzahlen-Datensatz (frei, verifiziert erreichbar unter
`https://download.geonames.org/export/zip/DE.zip`, TSV-Format, Spalten:
`countryCode, postalCode, placeName, adminName1(Bundesland), adminCode1, adminName2, adminCode2, adminName3, adminCode3, lat, lon`).
Die `adminName1`-Werte kommen in Deutsch UND Englisch vor (z.B. "Bavaria"/"Bayern") und müssen normalisiert werden.

`scraper/scripts/generate-plz-table.mts`:

```ts
import AdmZip from "adm-zip";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BUNDESLAND_NORMALISIERUNG: Record<string, string> = {
  "Bavaria": "Bayern",
  "Bayern": "Bayern",
  "Berlin": "Berlin",
  "Land Berlin": "Berlin",
  "Lower Saxony": "Niedersachsen",
  "Niedersachsen": "Niedersachsen",
  "Mecklenburg-Vorpommern": "Mecklenburg-Vorpommern",
  "Mecklenburg-Western Pomerania": "Mecklenburg-Vorpommern",
  "Saxony": "Sachsen",
  "Sachsen": "Sachsen",
  "Saxony-Anhalt": "Sachsen-Anhalt",
  "Sachsen-Anhalt": "Sachsen-Anhalt",
  "Thuringia": "Thüringen",
  "Thüringen": "Thüringen",
  "Baden-Württemberg": "Baden-Württemberg",
  "Brandenburg": "Brandenburg",
  "Bremen": "Bremen",
  "Hamburg": "Hamburg",
  "Hessen": "Hessen",
  "Nordrhein-Westfalen": "Nordrhein-Westfalen",
  "Rheinland-Pfalz": "Rheinland-Pfalz",
  "Saarland": "Saarland",
  "Schleswig-Holstein": "Schleswig-Holstein",
};

async function main() {
  const res = await fetch("https://download.geonames.org/export/zip/DE.zip");
  if (!res.ok) {
    throw new Error(`GeoNames-Download fehlgeschlagen: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buf);
  const txt = zip.readAsText("DE.txt");

  const map: Record<string, string> = {};
  for (const line of txt.split("\n")) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    const plz = cols[1];
    const rawState = cols[3];
    const state = BUNDESLAND_NORMALISIERUNG[rawState];
    if (!plz || !state) continue;
    if (!map[plz]) map[plz] = state;
  }

  const anzahl = Object.keys(map).length;
  if (anzahl < 8000) {
    throw new Error(
      `Nur ${anzahl} PLZ-Einträge erzeugt, erwartet >8000 — GeoNames-Format hat sich vermutlich geändert.`
    );
  }

  const outPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "lib",
    "plzBundesland.generated.json"
  );
  writeFileSync(outPath, JSON.stringify(map));
  console.log(`Fertig: ${anzahl} PLZ-Einträge geschrieben nach ${outPath}`);
}

main();
```

- [ ] **Step 6: Generator ausführen und Ergebnis prüfen**

Run: `cd C:\immo-radar\scraper && npm run generate:plz`
Expected: Ausgabe „Fertig: <N> PLZ-Einträge geschrieben..." mit N > 8000; Datei `scraper/lib/plzBundesland.generated.json` existiert.

- [ ] **Step 7: Fehlschlagenden Test für `grunderwerbsteuerSatz` schreiben**

`scraper/lib/grunderwerbsteuer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { grunderwerbsteuerSatz } from "./grunderwerbsteuer.js";

describe("grunderwerbsteuerSatz", () => {
  it("liefert 3.5 für München (Bayern)", () => {
    expect(grunderwerbsteuerSatz("80331")).toBe(3.5);
  });

  it("liefert 6.0 für Berlin", () => {
    expect(grunderwerbsteuerSatz("10115")).toBe(6.0);
  });

  it("liefert 5.5 für Leipzig (Sachsen)", () => {
    expect(grunderwerbsteuerSatz("04109")).toBe(5.5);
  });

  it("liefert 5.0 für Stuttgart (Baden-Württemberg)", () => {
    expect(grunderwerbsteuerSatz("70173")).toBe(5.0);
  });

  it("liefert den bundesweiten Durchschnitt für eine unbekannte PLZ", () => {
    expect(grunderwerbsteuerSatz("00000")).toBeCloseTo(5.6, 5);
  });
});
```

- [ ] **Step 8: Test ausführen, Fehlschlag prüfen**

Run: `cd C:\immo-radar\scraper && npm test -- grunderwerbsteuer`
Expected: FAIL — `Cannot find module './grunderwerbsteuer.js'` (Datei existiert noch nicht).

- [ ] **Step 9: `grunderwerbsteuer.ts` implementieren**

`scraper/lib/grunderwerbsteuer.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const plzBundesland: Record<string, string> = JSON.parse(
  readFileSync(path.join(__dirname, "plzBundesland.generated.json"), "utf-8")
);

const SATZ_JE_BUNDESLAND: Record<string, number> = {
  "Bayern": 3.5,
  "Baden-Württemberg": 5.0,
  "Niedersachsen": 5.0,
  "Rheinland-Pfalz": 5.0,
  "Sachsen-Anhalt": 5.0,
  "Thüringen": 5.0,
  "Bremen": 5.5,
  "Hamburg": 5.5,
  "Sachsen": 5.5,
  "Berlin": 6.0,
  "Hessen": 6.0,
  "Mecklenburg-Vorpommern": 6.0,
  "Brandenburg": 6.5,
  "Nordrhein-Westfalen": 6.5,
  "Saarland": 6.5,
  "Schleswig-Holstein": 6.5,
};

export const BUNDESWEITER_GRUNDERWERBSTEUER_DURCHSCHNITT = 5.6;

export function grunderwerbsteuerSatz(plz: string): number {
  const bundesland = plzBundesland[plz];
  if (!bundesland) return BUNDESWEITER_GRUNDERWERBSTEUER_DURCHSCHNITT;
  return SATZ_JE_BUNDESLAND[bundesland] ?? BUNDESWEITER_GRUNDERWERBSTEUER_DURCHSCHNITT;
}
```

- [ ] **Step 10: Test ausführen, Erfolg prüfen**

Run: `cd C:\immo-radar\scraper && npm test -- grunderwerbsteuer`
Expected: PASS, 5 von 5 Tests grün.

- [ ] **Step 11: Commit**

```bash
cd C:\immo-radar
git add .gitignore scraper/package.json scraper/package-lock.json scraper/tsconfig.json scraper/scripts/generate-plz-table.mts scraper/lib/plzBundesland.generated.json scraper/lib/grunderwerbsteuer.ts scraper/lib/grunderwerbsteuer.test.ts
git commit -m "feat(scraper): Projekt-Grundgeruest + Grunderwerbsteuer-/PLZ-Lookup"
```

---

## Task 2: Bewertungs-Engine (Kennzahlen)

**Files:**
- Create: `C:\immo-radar\scraper\lib\metrics.ts`
- Test: `C:\immo-radar\scraper\lib\metrics.test.ts`

**Interfaces:**
- Consumes: nichts (reine Funktionen, `grunderwerbsteuerSatz` wird vom Aufrufer übergeben, nicht importiert)
- Produces: `berechneKennzahlen(input: KennzahlenInput, grunderwerbsteuerSatzProzent: number): Kennzahlen`, Typen `KennzahlenInput`, `Kennzahlen`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`scraper/lib/metrics.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { berechneKennzahlen } from "./metrics.js";

describe("berechneKennzahlen", () => {
  // Realistisches Beispiel: MFH Leipzig, 3 Einheiten, Baujahr 1998, 240 m²,
  // Kaufpreis 480.000 €, Jahreskaltmiete 32.000 € (2.667 €/Monat)
  const basis = {
    kaufpreis: 480_000,
    jahreskaltmiete: 32_000,
    einheiten: 3,
    baujahr: 1998,
    wohnflaecheM2: 240,
  };

  it("berechnet Bewirtschaftungskosten innerhalb der 20-35%-Spanne", () => {
    const k = berechneKennzahlen(basis, 5.5);
    expect(k.bewirtschaftungskosten).toBeGreaterThanOrEqual(basis.jahreskaltmiete * 0.2);
    expect(k.bewirtschaftungskosten).toBeLessThanOrEqual(basis.jahreskaltmiete * 0.35);
  });

  it("NOI = Jahreskaltmiete - Bewirtschaftungskosten", () => {
    const k = berechneKennzahlen(basis, 5.5);
    expect(k.noi).toBeCloseTo(basis.jahreskaltmiete - k.bewirtschaftungskosten, 5);
  });

  it("Kaufnebenkosten enthalten Grunderwerbsteuer + 1.5% Notar + 3.57% Makler", () => {
    const k = berechneKennzahlen(basis, 5.5);
    expect(k.kaufnebenkosten).toBeCloseTo(basis.kaufpreis * (0.055 + 0.015 + 0.0357), 2);
  });

  it("Kaufpreisfaktor = Kaufpreis / Jahreskaltmiete", () => {
    const k = berechneKennzahlen(basis, 5.5);
    expect(k.kaufpreisfaktor).toBeCloseTo(480_000 / 32_000, 5);
  });

  it("Bruttomietrendite = Jahreskaltmiete / Kaufpreis * 100", () => {
    const k = berechneKennzahlen(basis, 5.5);
    expect(k.bruttomietrendite).toBeCloseTo((32_000 / 480_000) * 100, 5);
  });

  it("geschaetzterDscr = NOI / ((Kaufpreis + Kaufnebenkosten) * 6%)", () => {
    const k = berechneKennzahlen(basis, 5.5);
    const erwarteterKapitaldienst = (basis.kaufpreis + k.kaufnebenkosten) * 0.06;
    expect(k.geschaetzterDscr).toBeCloseTo(k.noi / erwarteterKapitaldienst, 5);
  });

  it("geschaetzterBeleihungswert = NOI / 6%", () => {
    const k = berechneKennzahlen(basis, 5.5);
    expect(k.geschaetzterBeleihungswert).toBeCloseTo(k.noi / 0.06, 2);
  });

  it("setzt finanzierungsrisiko wenn Kaufpreis > 110% des Beleihungswerts", () => {
    // Sehr niedrige Miete -> niedriger Beleihungswert -> Kaufpreis liegt weit darüber
    const k = berechneKennzahlen({ ...basis, jahreskaltmiete: 5_000 }, 5.5);
    expect(k.finanzierungsrisiko).toBe(true);
  });

  it("kein finanzierungsrisiko wenn Kaufpreis nahe am Beleihungswert liegt", () => {
    // Sehr hohe Miete -> hoher Beleihungswert
    const k = berechneKennzahlen({ ...basis, jahreskaltmiete: 90_000 }, 5.5);
    expect(k.finanzierungsrisiko).toBe(false);
  });

  it("istTopTreffer nur wenn Faktor <=15 UND DSCR >=1.3 UND kein Finanzierungsrisiko", () => {
    // Gutes Objekt: günstiger Kaufpreis relativ zur Miete
    // (numerisch verifiziert: Faktor 7.8125, DSCR ≈1.544, kein Finanzierungsrisiko)
    const gut = berechneKennzahlen({ ...basis, kaufpreis: 250_000 }, 5.5);
    expect(gut.kaufpreisfaktor).toBeLessThanOrEqual(15);
    expect(gut.geschaetzterDscr).toBeGreaterThanOrEqual(1.3);
    expect(gut.finanzierungsrisiko).toBe(false);
    expect(gut.topTreffer).toBe(true);

    // Schlechtes Objekt: Faktor deutlich über 15
    const schlecht = berechneKennzahlen({ ...basis, kaufpreis: 900_000 }, 5.5);
    expect(schlecht.topTreffer).toBe(false);
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag prüfen**

Run: `cd C:\immo-radar\scraper && npm test -- metrics`
Expected: FAIL — `Cannot find module './metrics.js'`.

- [ ] **Step 3: `metrics.ts` implementieren**

`scraper/lib/metrics.ts`:

```ts
export interface KennzahlenInput {
  kaufpreis: number;
  jahreskaltmiete: number;
  einheiten: number;
  baujahr: number | null;
  wohnflaecheM2: number;
}

export interface Kennzahlen {
  bewirtschaftungskosten: number;
  noi: number;
  kaufnebenkosten: number;
  bruttomietrendite: number;
  nettomietrenditeCapRate: number;
  kaufpreisfaktor: number;
  geschaetzterDscr: number;
  geschaetzterBeleihungswert: number;
  finanzierungsrisiko: boolean;
  topTreffer: boolean;
}

const KAPITALDIENST_SATZ = 0.06;
const NOTAR_GRUNDBUCH_SATZ = 0.015;
const MAKLER_SATZ = 0.0357;
const VERWALTUNG_PRO_EINHEIT_JAHR = 300;
const MIETAUSFALLWAGNIS_SATZ = 0.02;

function instandhaltungssatzProM2(baujahr: number | null): number {
  if (baujahr === null) return 9.0;
  const alter = new Date().getFullYear() - baujahr;
  if (alter <= 22) return 7.1;
  if (alter <= 32) return 9.0;
  return 11.5;
}

function berechneBewirtschaftungskosten(input: KennzahlenInput): number {
  const verwaltung = input.einheiten * VERWALTUNG_PRO_EINHEIT_JAHR;
  const instandhaltung = instandhaltungssatzProM2(input.baujahr) * input.wohnflaecheM2;
  const mietausfallwagnis = input.jahreskaltmiete * MIETAUSFALLWAGNIS_SATZ;
  const summe = verwaltung + instandhaltung + mietausfallwagnis;
  const min = input.jahreskaltmiete * 0.2;
  const max = input.jahreskaltmiete * 0.35;
  return Math.min(Math.max(summe, min), max);
}

export function berechneKennzahlen(
  input: KennzahlenInput,
  grunderwerbsteuerSatzProzent: number
): Kennzahlen {
  const bewirtschaftungskosten = berechneBewirtschaftungskosten(input);
  const noi = input.jahreskaltmiete - bewirtschaftungskosten;
  const kaufnebenkosten =
    input.kaufpreis * (grunderwerbsteuerSatzProzent / 100 + NOTAR_GRUNDBUCH_SATZ + MAKLER_SATZ);
  const bruttomietrendite = (input.jahreskaltmiete / input.kaufpreis) * 100;
  const nettomietrenditeCapRate = (noi / (input.kaufpreis + kaufnebenkosten)) * 100;
  const kaufpreisfaktor = input.kaufpreis / input.jahreskaltmiete;
  const geschaetzterDscr = noi / ((input.kaufpreis + kaufnebenkosten) * KAPITALDIENST_SATZ);
  const geschaetzterBeleihungswert = noi / KAPITALDIENST_SATZ;
  const finanzierungsrisiko = input.kaufpreis > geschaetzterBeleihungswert * 1.1;
  const topTreffer = kaufpreisfaktor <= 15 && geschaetzterDscr >= 1.3 && !finanzierungsrisiko;

  return {
    bewirtschaftungskosten,
    noi,
    kaufnebenkosten,
    bruttomietrendite,
    nettomietrenditeCapRate,
    kaufpreisfaktor,
    geschaetzterDscr,
    geschaetzterBeleihungswert,
    finanzierungsrisiko,
    topTreffer,
  };
}
```

- [ ] **Step 4: Test ausführen, Erfolg prüfen**

Run: `cd C:\immo-radar\scraper && npm test -- metrics`
Expected: PASS, alle Tests grün.

- [ ] **Step 5: Commit**

```bash
cd C:\immo-radar
git add scraper/lib/metrics.ts scraper/lib/metrics.test.ts
git commit -m "feat(scraper): Bewertungs-Engine (NOI, Kaufpreisfaktor, DSCR, Beleihungswert-Risiko)"
```

---

## Task 3: Mietschätzung v1

**Scope-Hinweis:** Diese erste Version deckt nur Präzisionsstufe 1 (tatsächliche Angabe) und Stufe 5 (bundesweiter Durchschnitt) der in der Spec beschriebenen 5-stufigen Kennzeichnung ab. Die Stufen 2-4 (eigener Korpus-Durchschnitt je PLZ, Miet-Check.de, ImmoScout-Atlas) brauchen entweder angesammelte eigene Daten oder zusätzliche Scraper und sind Gegenstand von Plan 2 — das ist bewusste Phasierung, kein vergessenes Feature.

**Files:**
- Create: `C:\immo-radar\scraper\lib\rentEstimate.ts`
- Test: `C:\immo-radar\scraper\lib\rentEstimate.test.ts`

**Interfaces:**
- Produces: `ermittleJahreskaltmiete(angegebeneMonatsmiete: number | null, wohnflaecheM2: number): MietSchaetzung`, Typen `MietQuelle`, `MietSchaetzung`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`scraper/lib/rentEstimate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ermittleJahreskaltmiete } from "./rentEstimate.js";

describe("ermittleJahreskaltmiete", () => {
  it("nutzt die angegebene Miete, wenn vorhanden", () => {
    const r = ermittleJahreskaltmiete(1200, 100);
    expect(r.jahreskaltmiete).toBe(1200 * 12);
    expect(r.quelle).toBe("angegeben");
  });

  it("schätzt bundesweit, wenn keine Miete angegeben ist", () => {
    const r = ermittleJahreskaltmiete(null, 100);
    expect(r.quelle).toBe("geschaetzt_bundesweit");
    expect(r.jahreskaltmiete).toBeGreaterThan(0);
  });

  it("schätzt bundesweit auch bei 0 oder negativer Angabe", () => {
    const r = ermittleJahreskaltmiete(0, 100);
    expect(r.quelle).toBe("geschaetzt_bundesweit");
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag prüfen**

Run: `cd C:\immo-radar\scraper && npm test -- rentEstimate`
Expected: FAIL — `Cannot find module './rentEstimate.js'`.

- [ ] **Step 3: `rentEstimate.ts` implementieren**

`scraper/lib/rentEstimate.ts`:

```ts
export type MietQuelle = "angegeben" | "geschaetzt_bundesweit";

export interface MietSchaetzung {
  jahreskaltmiete: number;
  quelle: MietQuelle;
}

// Bundesweiter Durchschnitt Kaltmiete, Stand Recherche 09/2026 (ImmoScout24-Wohnpreisatlas: 9,23 €/m²).
export const BUNDESWEITER_MIETPREIS_PRO_M2_MONAT = 9.23;

export function ermittleJahreskaltmiete(
  angegebeneMonatsmiete: number | null,
  wohnflaecheM2: number
): MietSchaetzung {
  if (angegebeneMonatsmiete !== null && angegebeneMonatsmiete > 0) {
    return { jahreskaltmiete: angegebeneMonatsmiete * 12, quelle: "angegeben" };
  }
  return {
    jahreskaltmiete: BUNDESWEITER_MIETPREIS_PRO_M2_MONAT * wohnflaecheM2 * 12,
    quelle: "geschaetzt_bundesweit",
  };
}
```

- [ ] **Step 4: Test ausführen, Erfolg prüfen**

Run: `cd C:\immo-radar\scraper && npm test -- rentEstimate`
Expected: PASS, alle 3 Tests grün.

- [ ] **Step 5: Commit**

```bash
cd C:\immo-radar
git add scraper/lib/rentEstimate.ts scraper/lib/rentEstimate.test.ts
git commit -m "feat(scraper): Mietschaetzung v1 (angegeben / bundesweiter Durchschnitt)"
```

---

## Task 4: Immowelt — Ergebnislisten-Parser

**Kontext (verifiziert 2026-09-05):** `https://www.immowelt.de/suche/kaufen/haus/deutschland/ad02de1` liefert bei einfachem HTTPS-Fetch mit Browser-typischen Headern (`User-Agent`, `Accept-Language`) volles Server-gerendertes HTML (HTTP 200) — ohne diese Header liefert Immowelt HTTP 403. Jede Anzeige-Karte liegt in `<div id="classified-card-XXXX">`, der Link zur Detailseite trägt `data-testid="card-mfe-covering-link-testid"` mit `href` (absolute Exposé-URL) und einem `title`-Attribut, das bereits Typ, Ort, Preis und Eckdaten als Klartext enthält (z.B. `"Mehrfamilienhaus zum Kauf - Bad Wildungen - 269.000 € - 6 Zimmer, 265 m², 578 m² Grundstück"`). Ein echtes Fixture dieser Seite liegt unter `scraper/test/fixtures/immowelt-suche-haus.html`.

**Files:**
- Create: `C:\immo-radar\scraper\scrapers\immowelt\list.ts`
- Test: `C:\immo-radar\scraper\scrapers\immowelt\list.test.ts`
- Nutzt Fixture: `C:\immo-radar\scraper\test\fixtures\immowelt-suche-haus.html` (bereits vorhanden)

**Interfaces:**
- Produces: `parseImmoweltListPage(html: string): ImmoweltListSummary[]`, `istMehrfamilienhausKandidat(titleLine: string): boolean`, Typ `ImmoweltListSummary`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`scraper/scrapers/immowelt/list.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseImmoweltListPage, istMehrfamilienhausKandidat } from "./list.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(
  path.join(__dirname, "..", "..", "test", "fixtures", "immowelt-suche-haus.html"),
  "utf-8"
);

describe("parseImmoweltListPage", () => {
  it("extrahiert mindestens 30 Karten aus der echten Fixture-Seite", () => {
    const results = parseImmoweltListPage(fixtureHtml);
    expect(results.length).toBeGreaterThanOrEqual(30);
  });

  it("extrahiert die bekannte Mehrfamilienhaus-Karte korrekt", () => {
    const results = parseImmoweltListPage(fixtureHtml);
    const treffer = results.find((r) => r.externalId === "e71353e6-4ef9-4162-8a4f-e680c3951de4");
    expect(treffer).toBeDefined();
    expect(treffer!.url).toBe("https://www.immowelt.de/expose/e71353e6-4ef9-4162-8a4f-e680c3951de4");
    expect(treffer!.titleLine).toContain("Mehrfamilienhaus zum Kauf - Bad Wildungen");
  });
});

describe("istMehrfamilienhausKandidat", () => {
  it("erkennt 'Mehrfamilienhaus zum Kauf - ...' als Kandidat", () => {
    expect(
      istMehrfamilienhausKandidat("Mehrfamilienhaus zum Kauf - Bad Wildungen - 269.000 € - 6 Zimmer")
    ).toBe(true);
  });

  it("erkennt 'Einfamilienhaus zum Kauf - ...' NICHT als Kandidat", () => {
    expect(
      istMehrfamilienhausKandidat("Einfamilienhaus zum Kauf - Wolfhagen - 150.000 € - 6 Zimmer")
    ).toBe(false);
  });

  it("erkennt 'Doppelhaushälfte zum Kauf - ...' NICHT als Kandidat", () => {
    expect(istMehrfamilienhausKandidat("Doppelhaushälfte zum Kauf - Würzburg - 429.000 €")).toBe(false);
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag prüfen**

Run: `cd C:\immo-radar\scraper && npm test -- list.test`
Expected: FAIL — `Cannot find module './list.js'`.

- [ ] **Step 3: `list.ts` implementieren**

`scraper/scrapers/immowelt/list.ts`:

```ts
import * as cheerio from "cheerio";

export interface ImmoweltListSummary {
  externalId: string;
  url: string;
  titleLine: string;
}

const MFH_TYPE_PATTERN = /^(Mehrfamilienhaus|Zinshaus|Wohn- und Geschäftshaus)/i;

export function parseImmoweltListPage(html: string): ImmoweltListSummary[] {
  const $ = cheerio.load(html);
  const results: ImmoweltListSummary[] = [];

  $('a[data-testid="card-mfe-covering-link-testid"]').each((_, el) => {
    const href = $(el).attr("href");
    const title = $(el).attr("title");
    if (!href || !title) return;
    const idMatch = href.match(/\/expose\/([a-f0-9-]+)/i);
    if (!idMatch) return;
    results.push({ externalId: idMatch[1], url: href, titleLine: title });
  });

  return results;
}

export function istMehrfamilienhausKandidat(titleLine: string): boolean {
  return MFH_TYPE_PATTERN.test(titleLine);
}
```

- [ ] **Step 4: Test ausführen, Erfolg prüfen**

Run: `cd C:\immo-radar\scraper && npm test -- list.test`
Expected: PASS, alle 5 Tests grün.

- [ ] **Step 5: Commit**

```bash
cd C:\immo-radar
git add scraper/scrapers/immowelt/list.ts scraper/scrapers/immowelt/list.test.ts scraper/test/fixtures/immowelt-suche-haus.html
git commit -m "feat(scraper): Immowelt Ergebnislisten-Parser (Fixture-getestet)"
```

---

## Task 5: Immowelt — Detailseiten-Parser (Einheiten- und Miet-Extraktion)

**Kontext (verifiziert 2026-09-05):** Exposé-Seiten (`/expose/<uuid>`) liefern bei reinem `curl` HTTP 403, WENN kein `Referer`-Header auf die Ergebnisliste gesetzt wird — mit Referer HTTP 200. Jede Exposé-Seite enthält ein `<script id="__UFRN_LIFECYCLE_SERVERREQUEST__">window["__UFRN_LIFECYCLE_SERVERREQUEST__"]=JSON.parse("...")</script>` mit dem kompletten strukturierten Datenmodell unter `app_cldp.data.classified.sections` (u.a. `hardFacts.title`, `hardFacts.price.value`, `hardFacts.facts[]` mit `type`/`splitValue`, `location.address.{city,zipCode}`, `energy.features[]` mit `yearOfConstruction`, `mainDescription.description` als Freitext). Die Anzahl der Wohneinheiten ist dort NICHT als eigenes strukturiertes Feld vorhanden — sie muss per Regex aus dem Freitext gewonnen werden und bleibt bei sehr vielen Objekten unbekannt. Ein reales Gegenbeispiel liegt bereits in der Fixture: ein von Immowelt als "Mehrfamilienhaus" kategorisiertes Objekt, das laut Freitext tatsächlich nur ein Einfamilienhaus mit EINER vermieteten Einliegerwohnung ist (Beweis, warum das Tool die Immowelt-eigene Kategorisierung NICHT blind übernehmen darf, sondern Einheiten selbst verifizieren muss). Fixture: `scraper/test/fixtures/immowelt-expose-mehrfamilienhaus.html`.

**Files:**
- Create: `C:\immo-radar\scraper\scrapers\immowelt\detail.ts`
- Test: `C:\immo-radar\scraper\scrapers\immowelt\detail.test.ts`
- Nutzt Fixture: `C:\immo-radar\scraper\test\fixtures\immowelt-expose-mehrfamilienhaus.html` (bereits vorhanden)

**Interfaces:**
- Produces: `parseImmoweltDetailPage(html: string, kontext: { externalId: string; url: string }): ImmoweltDetailData`, Typ `ImmoweltDetailData`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`scraper/scrapers/immowelt/detail.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseImmoweltDetailPage } from "./detail.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(
  path.join(__dirname, "..", "..", "test", "fixtures", "immowelt-expose-mehrfamilienhaus.html"),
  "utf-8"
);

const KONTEXT = {
  externalId: "e71353e6-4ef9-4162-8a4f-e680c3951de4",
  url: "https://www.immowelt.de/expose/e71353e6-4ef9-4162-8a4f-e680c3951de4",
};

describe("parseImmoweltDetailPage", () => {
  const daten = parseImmoweltDetailPage(fixtureHtml, KONTEXT);

  it("übernimmt externalId und url unverändert", () => {
    expect(daten.externalId).toBe(KONTEXT.externalId);
    expect(daten.url).toBe(KONTEXT.url);
  });

  it("liest Titel, Preis und Adresse korrekt", () => {
    expect(daten.title).toBe("Mehrfamilienhaus zum Kauf");
    expect(daten.priceCents).toBe(269_000_00);
    expect(daten.zipCode).toBe("34537");
    expect(daten.city).toBe("Bad Wildungen");
  });

  it("liest Wohnfläche, Grundstücksfläche, Zimmer und Baujahr korrekt", () => {
    expect(daten.livingAreaM2).toBe(265);
    expect(daten.plotAreaM2).toBe(578);
    expect(daten.rooms).toBe(6);
    expect(daten.yearBuilt).toBe(1964);
  });

  it("erkennt korrekt, dass die Einheitenzahl NICHT sicher bestimmbar ist (echtes Grenzbeispiel)", () => {
    // Dieses konkrete Objekt ist laut Freitext ein Einfamilienhaus mit einer
    // vermieteten Einliegerwohnung, obwohl Immowelt es als "Mehrfamilienhaus"
    // kategorisiert. Der Text enthält keine explizite "X Wohneinheiten"-Angabe,
    // daher muss units unbekannt bleiben statt geraten zu werden.
    expect(daten.units).toBeNull();
    expect(daten.unitsConfident).toBe(false);
  });

  it("liest keine Jahreskaltmiete aus (Text nennt nur eine Warmmiete für eine Teilfläche)", () => {
    // Die Fixture enthält "pauschale Warmmiete von 480,00 €" fuer die
    // Einliegerwohnung — das ist weder eine Kaltmiete noch die Miete des
    // Gesamtobjekts und darf NICHT als Jahreskaltmiete missverstanden werden.
    expect(daten.rentColdMonthly).toBeNull();
  });
});

describe("parseImmoweltDetailPage — Einheiten-Erkennung mit synthetischem Text", () => {
  // WICHTIG: replaceAll (nicht replace) verwenden. Der Anker-Satz kommt in der
  // Fixture zweimal vor: einmal im sichtbar gerenderten HTML (data-testid
  // "cdp-main-description-expandable-text"), einmal im eingebetteten
  // __UFRN_LIFECYCLE_SERVERREQUEST__-JSON-Blob, den parseImmoweltDetailPage
  // tatsächlich ausliest. Die JSON-Kopie steht im Dokument SPÄTER als die
  // HTML-Kopie — ein einfaches replace() träfe nur die falsche (erste,
  // sichtbare) Stelle und der Parser würde die Injektion nie sehen.
  it("erkennt eine explizite Angabe wie '6 Wohneinheiten'", () => {
    const html = fixtureHtml.replaceAll(
      "Bei der hier angebotenen Immobilie",
      "Das Haus verfügt über 6 Wohneinheiten. Bei der hier angebotenen Immobilie"
    );
    const daten = parseImmoweltDetailPage(html, KONTEXT);
    expect(daten.units).toBe(6);
    expect(daten.unitsConfident).toBe(true);
  });

  it("erkennt eine explizite Kaltmieten-Angabe", () => {
    const html = fixtureHtml.replaceAll(
      "Bei der hier angebotenen Immobilie",
      "Die Kaltmiete beträgt insgesamt 2.400,00 € im Monat. Bei der hier angebotenen Immobilie"
    );
    const daten = parseImmoweltDetailPage(html, KONTEXT);
    expect(daten.rentColdMonthly).toBe(2400);
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag prüfen**

Run: `cd C:\immo-radar\scraper && npm test -- detail.test`
Expected: FAIL — `Cannot find module './detail.js'`.

- [ ] **Step 3: `detail.ts` implementieren**

`scraper/scrapers/immowelt/detail.ts`:

```ts
export interface ImmoweltDetailData {
  externalId: string;
  url: string;
  title: string;
  priceCents: number;
  livingAreaM2: number | null;
  plotAreaM2: number | null;
  rooms: number | null;
  yearBuilt: number | null;
  zipCode: string;
  city: string;
  units: number | null;
  unitsConfident: boolean;
  rentColdMonthly: number | null;
  descriptionText: string;
}

interface ImmoweltFact {
  type: string;
  splitValue: string;
}

interface ImmoweltEnergyFeature {
  type: string;
  value: string;
}

const SERVERREQUEST_PATTERN =
  /<script id="__UFRN_LIFECYCLE_SERVERREQUEST__">window\["__UFRN_LIFECYCLE_SERVERREQUEST__"\]=JSON\.parse\("([\s\S]*?)"\);?<\/script>/;

const UNIT_COUNT_PATTERN = /(\d+)\s*(?:Wohneinheiten|WE\b|Parteien|Wohnungen)/i;
const RENT_PATTERN =
  /(?:Kaltmiete|Ist-Miete|monatliche(?:n)? Miete)[^\d]{0,25}(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*€/i;

function parseGermanNumber(text: string): number {
  const cleaned = text.replace(/[^\d,]/g, "").replace(",", ".");
  return parseFloat(cleaned);
}

function extractClassified(html: string): any {
  const match = html.match(SERVERREQUEST_PATTERN);
  if (!match) {
    throw new Error(
      "__UFRN_LIFECYCLE_SERVERREQUEST__ nicht gefunden — Immowelt-Seitenstruktur hat sich vermutlich geändert."
    );
  }
  const jsonText = JSON.parse(`"${match[1]}"`);
  const parsed = JSON.parse(jsonText);
  return parsed.app_cldp.data.classified;
}

export function parseImmoweltDetailPage(
  html: string,
  kontext: { externalId: string; url: string }
): ImmoweltDetailData {
  const classified = extractClassified(html);
  const hardFacts = classified.sections.hardFacts;
  const address = classified.sections.location.address;
  const energyFeatures: ImmoweltEnergyFeature[] = classified.sections.energy?.features ?? [];
  const yearFeature = energyFeatures.find((f) => f.type === "yearOfConstruction");
  const facts: ImmoweltFact[] = hardFacts.facts ?? [];
  const factByType = (type: string) => facts.find((f) => f.type === type);

  const description: string = [
    classified.sections.mainDescription?.headline ?? "",
    classified.sections.mainDescription?.description ?? "",
  ].join("\n");

  const unitMatch = description.match(UNIT_COUNT_PATTERN);
  const rentMatch = description.match(RENT_PATTERN);

  const livingSpace = factByType("livingSpace");
  const plotSpace = factByType("plotSpace");
  const rooms = factByType("numberOfRooms");

  return {
    externalId: kontext.externalId,
    url: kontext.url,
    title: hardFacts.title,
    priceCents: Math.round(parseGermanNumber(hardFacts.price.value) * 100),
    livingAreaM2: livingSpace ? parseGermanNumber(livingSpace.splitValue) : null,
    plotAreaM2: plotSpace ? parseGermanNumber(plotSpace.splitValue) : null,
    rooms: rooms ? parseGermanNumber(rooms.splitValue) : null,
    yearBuilt: yearFeature ? parseInt(yearFeature.value, 10) : null,
    zipCode: address.zipCode,
    city: address.city,
    units: unitMatch ? parseInt(unitMatch[1], 10) : null,
    unitsConfident: unitMatch !== null,
    rentColdMonthly: rentMatch ? parseGermanNumber(rentMatch[1]) : null,
    descriptionText: description,
  };
}
```

- [ ] **Step 4: Test ausführen, Erfolg prüfen**

Run: `cd C:\immo-radar\scraper && npm test -- detail.test`
Expected: PASS, alle 7 Tests grün.

- [ ] **Step 5: Commit**

```bash
cd C:\immo-radar
git add scraper/scrapers/immowelt/detail.ts scraper/scrapers/immowelt/detail.test.ts scraper/test/fixtures/immowelt-expose-mehrfamilienhaus.html
git commit -m "feat(scraper): Immowelt Detailseiten-Parser (Fixture-getestet, konservative Einheiten-Erkennung)"
```

---

## Task 6: Immowelt — Live-Scraper-Orchestrierung

**Bekannte Grenze (verifiziert 2026-09-05, bewusst dokumentiert statt stillschweigend übergangen):** Weder Query-Parameter (`sp=`, `page=`, `estateTypes=`) noch Pfad-Pagination (`/seite-2`, `/2`) verändern das Ergebnis der `/suche/...`-Seite bei reinem HTTP-Fetch — Immowelt lädt weitere Seiten/Filter offenbar ausschließlich clientseitig über die (laut robots.txt gesperrte) `/classified-search`-API nach. Diese erste Version deckt daher nur **Seite 1 der Standard-Sortierung** ab (ca. 40 bundesweite "Haus"-Angebote pro Lauf, gefiltert auf Mehrfamilienhaus-Kandidaten). Sollte sich das im Betrieb als unzureichend erweisen (z.B. weil neue Mehrfamilienhaus-Angebote regelmäßig durchrutschen), ist eine Umstellung auf Playwright (echter Browser führt die Nachlade-Logik der Seite selbst aus) der nächste Schritt — bewusst nicht Teil dieses Plans (YAGNI, erst mit echten Betriebsdaten entscheiden).

**Files:**
- Create: `C:\immo-radar\scraper\scrapers\immowelt\index.ts`

**Interfaces:**
- Consumes: `parseImmoweltListPage`, `istMehrfamilienhausKandidat` (aus `./list.js`), `parseImmoweltDetailPage`, `ImmoweltDetailData` (aus `./detail.js`)
- Produces: `scrapeImmowelt(): Promise<ImmoweltDetailData[]>`

- [ ] **Step 1: `index.ts` implementieren**

Kein isolierter Unit-Test möglich (führt echte Netzwerk-Requests aus) — Verifikation erfolgt manuell in Task 13. Direkt implementieren:

`scraper/scrapers/immowelt/index.ts`:

```ts
import { parseImmoweltListPage, istMehrfamilienhausKandidat } from "./list.js";
import { parseImmoweltDetailPage, type ImmoweltDetailData } from "./detail.js";

const SEARCH_URL = "https://www.immowelt.de/suche/kaufen/haus/deutschland/ad02de1";
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  "Accept-Language": "de-DE,de;q=0.9",
};
const VERZOEGERUNG_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeImmowelt(): Promise<ImmoweltDetailData[]> {
  const listRes = await fetch(SEARCH_URL, { headers: BROWSER_HEADERS });
  if (!listRes.ok) {
    throw new Error(`Immowelt-Ergebnisliste: HTTP ${listRes.status}`);
  }
  const listHtml = await listRes.text();
  const kandidaten = parseImmoweltListPage(listHtml).filter((c) =>
    istMehrfamilienhausKandidat(c.titleLine)
  );

  const ergebnisse: ImmoweltDetailData[] = [];
  for (const kandidat of kandidaten) {
    await sleep(VERZOEGERUNG_MS);
    let detailRes: Response;
    try {
      detailRes = await fetch(kandidat.url, {
        headers: { ...BROWSER_HEADERS, Referer: SEARCH_URL },
      });
    } catch (err) {
      console.warn(`Immowelt-Detailseite ${kandidat.url}: Netzwerkfehler, übersprungen`, err);
      continue;
    }
    if (!detailRes.ok) {
      console.warn(`Immowelt-Detailseite ${kandidat.url}: HTTP ${detailRes.status}, übersprungen`);
      continue;
    }
    try {
      const detailHtml = await detailRes.text();
      ergebnisse.push(
        parseImmoweltDetailPage(detailHtml, { externalId: kandidat.externalId, url: kandidat.url })
      );
    } catch (err) {
      console.warn(`Immowelt-Detailseite ${kandidat.url}: Parse-Fehler, übersprungen`, err);
    }
  }
  return ergebnisse;
}
```

- [ ] **Step 2: `tsc --noEmit` zur Typprüfung ausführen**

Run: `cd C:\immo-radar\.worktrees\foundation-plan\scraper && npx tsc --noEmit`
Expected: Keine Fehler.

- [ ] **Step 3: Commit**

```bash
cd C:\immo-radar\.worktrees\foundation-plan
git add scraper/scrapers/immowelt/index.ts
git commit -m "feat(scraper): Immowelt Live-Scraper-Orchestrierung (Seite 1, gedrosselt)"
```

---

## Task 7: Datenbank-Schema + Supabase-Projekt

**Manueller Schritt (externer Dienst des Nutzers — nicht automatisiert):**

- [ ] **Step 1: Supabase-Projekt anlegen**

Der Nutzer legt unter [supabase.com](https://supabase.com) ein NEUES, eigenständiges Projekt an (Name-Vorschlag: `immo-radar`, getrennt vom bestehenden Margn-Projekt). Nach Anlage: `Project URL` und `service_role`-Key aus den Projekteinstellungen (Settings → API) notieren — werden in Task 9 gebraucht.

**Files:**
- Create: `C:\immo-radar\schema.sql`

- [ ] **Step 2: `schema.sql` schreiben**

```sql
create extension if not exists "pgcrypto";

create table listings (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  url text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  is_active boolean not null default true,
  unique (source, external_id)
);

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
  metrics jsonb not null
);

create index listing_versions_listing_id_idx on listing_versions (listing_id, scanned_at desc);

create table rent_estimates (
  zip_code text primary key,
  avg_rent_per_m2_cents integer not null,
  sample_size integer not null,
  updated_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  detail jsonb
);

-- RLS auf allen Tabellen aktivieren, bewusst OHNE Policies: dieser Plan hat
-- kein Dashboard/Anon-Zugriff, daher soll fuer anon/authenticated grundsaetzlich
-- nichts sichtbar/schreibbar sein. Nur der service_role-Key (ausschliesslich
-- im Scraper verwendet) umgeht RLS und behaelt vollen Zugriff. Macht das
-- Projekt-Erstellungs-Haekchen "Automatically expose new tables" wirkungslos,
-- unabhaengig davon wie es beim Anlegen gesetzt war.
alter table listings enable row level security;
alter table listing_versions enable row level security;
alter table rent_estimates enable row level security;
alter table notifications enable row level security;
```

- [ ] **Step 3: Schema in Supabase ausführen**

Im Supabase-Dashboard des neuen Projekts: SQL Editor → Inhalt von `schema.sql` einfügen → Run. Erwartet: keine Fehler, 4 neue Tabellen sichtbar unter Table Editor, und im Table Editor bei jeder der 4 Tabellen ein Schloss-Symbol/"RLS enabled"-Hinweis (kein "Unrestricted"-Badge mehr).

- [ ] **Step 4: Commit**

```bash
cd C:\immo-radar\.worktrees\foundation-plan
git add schema.sql
git commit -m "feat(db): Schema fuer listings/listing_versions/rent_estimates/notifications"
```

---

## Task 8: DB-Zugriffsschicht (Speichern + Änderungserkennung)

**Files:**
- Create: `C:\immo-radar\scraper\lib\supabase.ts`
- Create: `C:\immo-radar\scraper\lib\db.ts`
- Test: `C:\immo-radar\scraper\lib\db.test.ts`
- Create: `C:\immo-radar\.env.example`

**Interfaces:**
- Produces: `diffVersion(input: VersionDiffInput): VersionDiffResult` (rein, testbar), `upsertListingAndVersion(supabase: SupabaseClient, data: ListingVersionData): Promise<UpsertResult>` (I/O, manuell verifiziert), `logNotification(supabase: SupabaseClient, listingId: string, kind: "top_treffer" | "preisaenderung", detail: Record<string, unknown>): Promise<void>` (I/O, manuell verifiziert), Typen `VersionDiffInput`, `VersionDiffResult`, `ListingVersionData`, `UpsertResult`

- [ ] **Step 1: `.env.example` anlegen**

```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

- [ ] **Step 2: `scraper/lib/supabase.ts` anlegen**

```ts
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// Service-Key NUR im Scraper verwenden, niemals im spaeteren Frontend (Plan 3).
export const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
```

- [ ] **Step 3: Fehlschlagenden Test für `diffVersion` schreiben**

`scraper/lib/db.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { diffVersion } from "./db.js";

describe("diffVersion", () => {
  it("meldet changed=true und priceDropped=false für die allererste Version", () => {
    const result = diffVersion({
      previous: null,
      current: { priceCents: 100_000_00, rentColdMonthlyCents: 100_000, units: 3 },
    });
    expect(result.changed).toBe(true);
    expect(result.priceDropped).toBe(false);
  });

  it("meldet changed=false wenn sich nichts geändert hat", () => {
    const werte = { priceCents: 100_000_00, rentColdMonthlyCents: 100_000, units: 3 };
    const result = diffVersion({ previous: werte, current: { ...werte } });
    expect(result.changed).toBe(false);
    expect(result.priceDropped).toBe(false);
  });

  it("erkennt eine Preissenkung", () => {
    const result = diffVersion({
      previous: { priceCents: 200_000_00, rentColdMonthlyCents: 100_000, units: 3 },
      current: { priceCents: 190_000_00, rentColdMonthlyCents: 100_000, units: 3 },
    });
    expect(result.changed).toBe(true);
    expect(result.priceDropped).toBe(true);
  });

  it("erkennt eine Preiserhöhung NICHT als priceDropped", () => {
    const result = diffVersion({
      previous: { priceCents: 190_000_00, rentColdMonthlyCents: 100_000, units: 3 },
      current: { priceCents: 200_000_00, rentColdMonthlyCents: 100_000, units: 3 },
    });
    expect(result.changed).toBe(true);
    expect(result.priceDropped).toBe(false);
  });
});
```

- [ ] **Step 4: Test ausführen, Fehlschlag prüfen**

Run: `cd C:\immo-radar\.worktrees\foundation-plan\scraper && npm test -- db.test`
Expected: FAIL — `Cannot find module './db.js'`.

- [ ] **Step 5: `db.ts` implementieren**

`scraper/lib/db.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Kennzahlen } from "./metrics.js";
import type { MietQuelle } from "./rentEstimate.js";

export interface VersionFields {
  priceCents: number;
  rentColdMonthlyCents: number | null;
  units: number | null;
}

export interface VersionDiffInput {
  previous: VersionFields | null;
  current: VersionFields;
}

export interface VersionDiffResult {
  changed: boolean;
  priceDropped: boolean;
}

export function diffVersion(input: VersionDiffInput): VersionDiffResult {
  if (input.previous === null) {
    return { changed: true, priceDropped: false };
  }
  const changed =
    input.previous.priceCents !== input.current.priceCents ||
    input.previous.rentColdMonthlyCents !== input.current.rentColdMonthlyCents ||
    input.previous.units !== input.current.units;
  const priceDropped = input.current.priceCents < input.previous.priceCents;
  return { changed, priceDropped };
}

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
}

export interface UpsertResult extends VersionDiffResult {
  listingId: string;
  previousPriceCents: number | null;
}

export async function upsertListingAndVersion(
  supabase: SupabaseClient,
  data: ListingVersionData
): Promise<UpsertResult> {
  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .upsert(
      { source: data.source, external_id: data.externalId, url: data.url, last_seen: new Date().toISOString() },
      { onConflict: "source,external_id" }
    )
    .select()
    .single();
  if (listingError) throw listingError;

  const { data: previousVersion } = await supabase
    .from("listing_versions")
    .select("price_cents, rent_cold_monthly_cents, units")
    .eq("listing_id", listing.id)
    .order("scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const diff = diffVersion({
    previous: previousVersion
      ? {
          priceCents: Number(previousVersion.price_cents),
          rentColdMonthlyCents:
            previousVersion.rent_cold_monthly_cents === null
              ? null
              : Number(previousVersion.rent_cold_monthly_cents),
          units: previousVersion.units,
        }
      : null,
    current: {
      priceCents: data.priceCents,
      rentColdMonthlyCents: data.rentColdMonthlyCents,
      units: data.units,
    },
  });

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
  });
  if (versionError) throw versionError;

  return {
    listingId: listing.id,
    previousPriceCents: previousVersion ? Number(previousVersion.price_cents) : null,
    ...diff,
  };
}

export async function logNotification(
  supabase: SupabaseClient,
  listingId: string,
  kind: "top_treffer" | "preisaenderung",
  detail: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from("notifications").insert({
    listing_id: listingId,
    kind,
    detail,
  });
  if (error) throw error;
}
```

- [ ] **Step 6: Test ausführen, Erfolg prüfen**

Run: `cd C:\immo-radar\.worktrees\foundation-plan\scraper && npm test -- db.test`
Expected: PASS, alle 4 Tests grün (nur `diffVersion` wird hier getestet — `upsertListingAndVersion` braucht eine echte DB und wird in Task 13 manuell verifiziert).

- [ ] **Step 7: Commit**

```bash
cd C:\immo-radar\.worktrees\foundation-plan
git add .env.example scraper/lib/supabase.ts scraper/lib/db.ts scraper/lib/db.test.ts
git commit -m "feat(scraper): DB-Zugriffsschicht mit Aenderungs-/Preissenkungs-Erkennung"
```

---

## Task 9: Telegram-Benachrichtigung

**Manueller Schritt (externer Dienst des Nutzers):**

- [ ] **Step 1: Telegram-Bot anlegen**

Der Nutzer öffnet in Telegram den Chat mit **@BotFather**, sendet `/newbot`, vergibt einen Namen (z.B. "immo-radar") und erhält ein Bot-Token. Danach eine Nachricht an den neuen Bot schicken (z.B. "Start") und die eigene `chat_id` ermitteln, z.B. über `https://api.telegram.org/bot<TOKEN>/getUpdates` im Browser aufrufen und `"chat":{"id": ...}` im JSON ablesen. Beide Werte (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) in `scraper/.env` eintragen (lokal, nicht committen — durch `.gitignore` bereits ausgeschlossen).

**Files:**
- Create: `C:\immo-radar\scraper\lib\telegram.ts`
- Test: `C:\immo-radar\scraper\lib\telegram.test.ts`

**Interfaces:**
- Produces: `formatTopTrefferMessage(listing: ListingSummary, k: KennzahlenSummary): string`, `formatPreisaenderungMessage(listing: ListingSummary, altPreisCents: number, neuPreisCents: number): string`, `sendTelegramMessage(config: TelegramConfig, text: string): Promise<void>`, Typen `ListingSummary`, `KennzahlenSummary`, `TelegramConfig`

- [ ] **Step 2: Fehlschlagenden Test für die Formatierungsfunktionen schreiben**

`scraper/lib/telegram.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatTopTrefferMessage, formatPreisaenderungMessage } from "./telegram.js";

const listing = {
  title: "Mehrfamilienhaus zum Kauf",
  url: "https://www.immowelt.de/expose/abc-123",
  city: "Leipzig",
  zipCode: "04109",
  priceCents: 480_000_00,
  units: 3,
};

describe("formatTopTrefferMessage", () => {
  it("enthält Ort, PLZ, Einheiten, Preis, Kennzahlen und Link", () => {
    const text = formatTopTrefferMessage(listing, {
      kaufpreisfaktor: 12.5,
      geschaetzterDscr: 1.45,
      mietQuelle: "angegeben",
    });
    expect(text).toContain("Leipzig");
    expect(text).toContain("04109");
    expect(text).toContain("3 Einheiten");
    expect(text).toContain("480.000");
    expect(text).toContain("12.5");
    expect(text).toContain("1.45");
    expect(text).toContain("https://www.immowelt.de/expose/abc-123");
  });
});

describe("formatPreisaenderungMessage", () => {
  it("enthält alten und neuen Preis sowie den Link", () => {
    const text = formatPreisaenderungMessage(listing, 500_000_00, 480_000_00);
    expect(text).toContain("500.000");
    expect(text).toContain("480.000");
    expect(text).toContain("https://www.immowelt.de/expose/abc-123");
  });
});
```

- [ ] **Step 3: Test ausführen, Fehlschlag prüfen**

Run: `cd C:\immo-radar\.worktrees\foundation-plan\scraper && npm test -- telegram.test`
Expected: FAIL — `Cannot find module './telegram.js'`.

- [ ] **Step 4: `telegram.ts` implementieren**

`scraper/lib/telegram.ts`:

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
}

export interface KennzahlenSummary {
  kaufpreisfaktor: number;
  geschaetzterDscr: number;
  mietQuelle: string;
}

function formatEuro(cents: number): string {
  return (cents / 100).toLocaleString("de-DE");
}

export function formatTopTrefferMessage(listing: ListingSummary, k: KennzahlenSummary): string {
  return [
    `🎯 Top-Treffer: ${listing.title}`,
    `${listing.zipCode} ${listing.city} · ${listing.units ?? "?"} Einheiten · ${formatEuro(listing.priceCents)} €`,
    `Kaufpreisfaktor ${k.kaufpreisfaktor.toFixed(1)} · geschätzter DSCR ${k.geschaetzterDscr.toFixed(2)} · Miete: ${k.mietQuelle}`,
    listing.url,
  ].join("\n");
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
    listing.url,
  ].join("\n");
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

- [ ] **Step 5: Test ausführen, Erfolg prüfen**

Run: `cd C:\immo-radar\.worktrees\foundation-plan\scraper && npm test -- telegram.test`
Expected: PASS, beide Tests grün (`sendTelegramMessage` selbst wird in Task 13 manuell gegen den echten Bot verifiziert).

- [ ] **Step 6: Commit**

```bash
cd C:\immo-radar\.worktrees\foundation-plan
git add scraper/lib/telegram.ts scraper/lib/telegram.test.ts
git commit -m "feat(scraper): Telegram-Benachrichtigung (Top-Treffer + Preisaenderung)"
```

---

## Task 10: main.ts — Pipeline zusammenführen

**Files:**
- Create: `C:\immo-radar\scraper\main.ts`

**Interfaces:**
- Consumes: `scrapeImmowelt` (aus `./scrapers/immowelt/index.js`), `grunderwerbsteuerSatz` (aus `./lib/grunderwerbsteuer.js`), `berechneKennzahlen` (aus `./lib/metrics.js`), `ermittleJahreskaltmiete` (aus `./lib/rentEstimate.js`), `upsertListingAndVersion`, `logNotification` (aus `./lib/db.js`), `sb` (aus `./lib/supabase.js`), `sendTelegramMessage`, `formatTopTrefferMessage`, `formatPreisaenderungMessage` (aus `./lib/telegram.js`)
- Produces: ausführbares Skript, kein exportiertes Interface

- [ ] **Step 1: `main.ts` implementieren**

Kein isolierter Unit-Test (orchestriert ausschließlich bereits getestete Bausteine + echte I/O) — Verifikation in Task 13.

`scraper/main.ts`:

```ts
import { scrapeImmowelt } from "./scrapers/immowelt/index.js";
import { grunderwerbsteuerSatz } from "./lib/grunderwerbsteuer.js";
import { berechneKennzahlen } from "./lib/metrics.js";
import { ermittleJahreskaltmiete } from "./lib/rentEstimate.js";
import { upsertListingAndVersion, logNotification } from "./lib/db.js";
import { sb } from "./lib/supabase.js";
import {
  sendTelegramMessage,
  formatTopTrefferMessage,
  formatPreisaenderungMessage,
} from "./lib/telegram.js";

const MIN_EINHEITEN = 3;

async function main() {
  const telegramConfig = {
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
  };

  console.log("Immowelt: Scraping gestartet...");
  const gefunden = await scrapeImmowelt();
  console.log(`Immowelt: ${gefunden.length} Mehrfamilienhaus-Kandidaten von Seite 1.`);

  for (const objekt of gefunden) {
    if (objekt.units === null || objekt.units < MIN_EINHEITEN) {
      console.log(
        `Übersprungen (Einheiten: ${objekt.units ?? "unbestätigt"}, benötigt >=${MIN_EINHEITEN}): ${objekt.title}`
      );
      continue;
    }

    const miete = ermittleJahreskaltmiete(objekt.rentColdMonthly, objekt.livingAreaM2 ?? 0);
    const satz = grunderwerbsteuerSatz(objekt.zipCode);
    const kennzahlen = berechneKennzahlen(
      {
        kaufpreis: objekt.priceCents / 100,
        jahreskaltmiete: miete.jahreskaltmiete,
        einheiten: objekt.units,
        baujahr: objekt.yearBuilt,
        wohnflaecheM2: objekt.livingAreaM2 ?? 0,
      },
      satz
    );

    const diff = await upsertListingAndVersion(sb, {
      source: "immowelt",
      externalId: objekt.externalId,
      url: objekt.url,
      priceCents: objekt.priceCents,
      rentColdMonthlyCents: objekt.rentColdMonthly === null ? null : Math.round(objekt.rentColdMonthly * 100),
      rentSource: miete.quelle,
      livingAreaM2: objekt.livingAreaM2,
      plotAreaM2: objekt.plotAreaM2,
      units: objekt.units,
      unitsConfident: objekt.unitsConfident,
      yearBuilt: objekt.yearBuilt,
      zipCode: objekt.zipCode,
      city: objekt.city,
      bundesland: null,
      title: objekt.title,
      kennzahlen,
    });

    const listingSummary = {
      title: objekt.title,
      url: objekt.url,
      city: objekt.city,
      zipCode: objekt.zipCode,
      priceCents: objekt.priceCents,
      units: objekt.units,
    };

    if (diff.changed && kennzahlen.topTreffer) {
      const kennzahlenSummary = {
        kaufpreisfaktor: kennzahlen.kaufpreisfaktor,
        geschaetzterDscr: kennzahlen.geschaetzterDscr,
        mietQuelle: miete.quelle,
      };
      await sendTelegramMessage(telegramConfig, formatTopTrefferMessage(listingSummary, kennzahlenSummary));
      await logNotification(sb, diff.listingId, "top_treffer", { ...kennzahlenSummary, priceCents: objekt.priceCents });
    }

    if (diff.priceDropped && diff.previousPriceCents !== null) {
      await sendTelegramMessage(
        telegramConfig,
        formatPreisaenderungMessage(listingSummary, diff.previousPriceCents, objekt.priceCents)
      );
      await logNotification(sb, diff.listingId, "preisaenderung", {
        altPreisCents: diff.previousPriceCents,
        neuPreisCents: objekt.priceCents,
      });
    }
  }

  console.log("Lauf abgeschlossen.");
}

main().catch((err) => {
  console.error("Pipeline-Fehler:", err);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Typprüfung ausführen**

Run: `cd C:\immo-radar\.worktrees\foundation-plan\scraper && npx tsc --noEmit`
Expected: Keine Fehler.

- [ ] **Step 3: Alle bisherigen Tests erneut ausführen**

Run: `cd C:\immo-radar\.worktrees\foundation-plan\scraper && npm test`
Expected: PASS, alle Tests aus allen bisherigen Tasks weiterhin grün (main.ts selbst hat keine eigenen Tests — reine Orchestrierung bereits getesteter Bausteine, siehe Task-Kopf).

- [ ] **Step 4: Commit**

```bash
cd C:\immo-radar\.worktrees\foundation-plan
git add scraper/main.ts
git commit -m "feat(scraper): main.ts Pipeline (Scrape -> Kennzahlen -> Speichern -> Telegram-Alarm + Preisaenderung)"
```

---

## Task 11: GitHub Actions Workflow (Cron alle 3h)

**Files:**
- Create: `C:\immo-radar\.github\workflows\scrape.yml`

- [ ] **Step 1: Workflow-Datei schreiben**

`.github/workflows/scrape.yml`:

```yaml
name: scrape

on:
  schedule:
    - cron: "0 */3 * * *"
  workflow_dispatch: {}

jobs:
  scrape-immowelt:
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
      - run: npm run scrape:immowelt
        working-directory: scraper
```

- [ ] **Step 2: Commit**

```bash
cd C:\immo-radar\.worktrees\foundation-plan
git add .github/workflows/scrape.yml
git commit -m "feat(ci): GitHub Actions Cron alle 3h fuer Immowelt-Scraper"
```

---

## Task 12: GitHub-Repo anlegen (privat) + Secrets + Push

**Manueller Schritt (externer Dienst des Nutzers):**

- [ ] **Step 1: Privates Repo auf GitHub anlegen**

Der Nutzer legt unter github.com ein neues, **privates** Repo namens `immo-radar` an (leer, ohne README/„.gitignore"-Vorlage, da das lokale Repo bereits existiert).

- [ ] **Step 2: Remote verbinden und pushen**

```bash
cd C:\immo-radar
git remote add origin https://github.com/<username>/immo-radar.git
git push -u origin main
```

(`<username>` durch den tatsächlichen GitHub-Benutzernamen des Nutzers ersetzen.)

- [ ] **Step 3: Secrets im Repo hinterlegen**

Im GitHub-Repo unter Settings → Secrets and variables → Actions → "New repository secret" vier Secrets anlegen: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (aus Task 7), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (aus Task 9).

---

## Task 13: End-to-End-Verifikation

**Manueller Verifikationslauf gegen die echten Dienste:**

- [ ] **Step 1: Lokalen Testlauf mit echten Zugangsdaten ausführen**

`scraper/.env` lokal anlegen (nicht committen) mit den vier Werten aus den Tasks 7 und 9. Dann:

Run: `cd C:\immo-radar\scraper && npm run scrape:immowelt`
Expected: Konsolen-Ausgabe zeigt "Immowelt: Scraping gestartet...", eine Anzahl gefundener Kandidaten, für jeden entweder eine Übersprungen-Zeile oder eine erfolgreiche Verarbeitung, zum Schluss "Lauf abgeschlossen." — kein unbehandelter Fehler.

- [ ] **Step 2: Supabase-Daten prüfen**

Im Supabase-Dashboard, Table Editor: Tabelle `listings` enthält mindestens einen Eintrag mit `source = 'immowelt'`; Tabelle `listing_versions` enthält für jeden Eintrag mindestens eine Zeile mit einem befüllten `metrics`-JSON-Feld. Falls ein Top-Treffer oder eine Preisänderung aufgetreten ist, enthält Tabelle `notifications` einen entsprechenden Eintrag mit passendem `kind`.

- [ ] **Step 3: Telegram-Zustellung prüfen (falls ein Top-Treffer vorhanden war)**

Falls mindestens ein gefundenes Objekt `topTreffer: true` ergeben hat: im Telegram-Chat mit dem Bot ist die entsprechende Nachricht angekommen. Falls kein Top-Treffer vorhanden war (auf Seite 1 nicht garantiert), diesen Teilschritt durch einen manuellen Test ersetzen: `sendTelegramMessage` einmalig testweise mit einer festen Test-Nachricht aus einem Node-REPL oder kleinen Ad-hoc-Skript aufrufen, um die Zustellung unabhängig vom Vorhandensein eines echten Top-Treffers zu bestätigen.

- [ ] **Step 4: Workflow manuell in GitHub Actions auslösen**

Nach dem Push aus Task 12: im GitHub-Repo unter "Actions" den Workflow "scrape" über "Run workflow" (workflow_dispatch) manuell einmal starten. Erwartet: grüner Lauf, Log zeigt dieselbe Ausgabe wie beim lokalen Testlauf.

- [ ] **Step 5: Abschluss-Commit, falls beim Verifizieren Anpassungen nötig waren**

Falls in den vorherigen Schritten Korrekturen nötig wurden (z.B. Feldnamen-Tippfehler, die erst live auffallen):

```bash
cd C:\immo-radar
git add -A
git commit -m "fix(scraper): Korrekturen aus End-to-End-Verifikation"
git push
```

Falls keine Anpassungen nötig waren, diesen Schritt überspringen — Plan 1 ist damit abgeschlossen.
