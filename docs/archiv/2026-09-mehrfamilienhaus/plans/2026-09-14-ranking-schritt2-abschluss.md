# Ranking Schritt 2 abschließen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `scraper/lib/ranking.ts` um die restlichen Teile von Schritt 2 des
Dashboard-Entwurfs ergänzen: Rangzahl, Bandkanten, Bandbreite je Bundesland,
Schwellenwechsler-Merkmal, und die drei Verfügbarkeitszustände — alles als
reine, getestete Funktionen ohne Ein-/Ausgabe.

**Architecture:** `bestimmeSicherheitsstufe` ist bereits fertig und gemergt.
Rangzahl/Bandkanten/Bandbreite/Schwellenwechsler hängen voneinander ab
(Bandbreite → Bandkanten → Schwellenwechsler) und werden in EINER neuen
Funktion `bewerteFuerRangliste` zusammengefasst, die auch die Stufe
mitliefert. Die Bandbreiten-Berechnung gehört inhaltlich zu
`scraper/lib/rentEstimate.ts` (dort steht bereits `mieteProM2FuerBundesland`
und die zugrundeliegende Tabelle) und wird dort ergänzt, nicht in
`ranking.ts` dupliziert. Die drei Verfügbarkeitszustände sind eine
unabhängige zweite Funktion (`bestimmeVerfuegbarkeitszustand`) mit anderen
Eingaben (Zeitstempel statt Miete/Preis).

**Beide Aufgaben ändern dieselbe Datei `ranking.ts`.** Deshalb laufen sie
**sequenziell im selben Worktree/Branch**, nicht als zwei parallele
Worktrees wie in der letzten Iteration (dort waren die drei Aufgaben auf
drei verschiedene Dateien verteilt — hier nicht). Aufgabe 2 startet erst,
nachdem Aufgabe 1 committet ist.

**Tech Stack:** TypeScript, Vitest, keine neuen Abhängigkeiten.

**Spec:** [`docs/superpowers/specs/2026-09-09-dashboard-entwurf.md`](../specs/2026-09-09-dashboard-entwurf.md),
Abschnitte 2.3, 3.3–3.9, 6.3, 9 (Schritt 2). Die Zahlen in den Tests unten
sind mit einem lokalen Skript gegen den heutigen Code von `metrics.ts` und
`rentEstimate.ts` nachgerechnet, nicht geschätzt.

## Global Constraints

- Reine Funktionen: kein Supabase, kein Netz, kein `console`, keine
  eigenmächtige `new Date()`/`Date.now()` — Zeit kommt als Parameter
  `jetzt: Date` herein, wie in `lib/bestand.ts` (`istHartLoeschbar`).
- TDD wie im ganzen Projekt: Test zuerst schreiben, rot sehen, dann
  implementieren. (`geschaetzterDscr = nettomietrenditeCapRate / 6` ist
  bereits als Charakterisierungstest vorhanden und bleibt unverändert.)
- Deutsche Bezeichner, wie im ganzen Projekt (`bewerteFuerRangliste`, nicht
  `evaluateForRanking`).
- Kein `npm ci` in Worktrees — `node_modules` kommt über
  `scripts/worktree-node-modules.sh` (Junction/Symlink, kein Netz).
- Commits: eigene, aussagekräftige Nachricht je Schritt; jede Commit-Message
  endet mit `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Nach Abschluss: `cd scraper && npx vitest run && npx tsc --noEmit` müssen
  beide sauber sein, bevor eine Aufgabe als fertig gilt.

---

## Task 1: Bandbreite, Bandkanten, Rangzahl, Schwellenwechsler

**Files:**
- Modify: `scraper/lib/rentEstimate.ts:158-183` (Refactor + neue Exporte)
- Modify: `scraper/lib/rentEstimate.test.ts` (neue `describe`-Blöcke am Ende)
- Modify: `scraper/lib/ranking.ts` (neue Funktionen am Ende der Datei)
- Modify: `scraper/lib/ranking.test.ts` (neuer `describe`-Block am Ende)

**Interfaces:**
- Produces (für Task 2 und für Schritt 3 des Entwurfs später):
  `export interface MietSpanne { minProzent: number; maxProzent: number }`,
  `export function mietSpanneFuerBundesland(bundesland: string): MietSpanne | null`,
  `export function mietSpanneBundesweit(): MietSpanne`,
  `export const REGIONALE_SPANNE_S2: MietSpanne`,
  `export interface Bandkanten { unten: number; oben: number }`,
  `export interface RangEinordnung { stufe: Sicherheitsstufe; rangzahl: number | null; band: Bandkanten | null; istSchwellenwechsler: boolean }`,
  `export function bewerteFuerRangliste(objekt: { rentSource: string | null; dataGaps: string[]; livingAreaM2: number | null }, kennzahlenInput: KennzahlenInput, grunderwerbsteuerSatzProzent: number, bundesland: string | null): RangEinordnung`.
- Consumes: `bestimmeSicherheitsstufe` (bereits in `ranking.ts`),
  `berechneKennzahlen`/`KennzahlenInput` (`lib/metrics.ts`, unverändert).

### Schritt 1.1 — rentEstimate.ts: fehlschlagende Tests

- [ ] **Write the failing tests**

Ans Ende von `scraper/lib/rentEstimate.test.ts` anfügen (Import-Zeile am
Dateianfang erweitern):

```typescript
import { ermittleJahreskaltmiete,
  mieteProM2FuerBundesland,
  bundeslandFuerRegionscode,
  mietSpanneFuerBundesland,
  mietSpanneBundesweit,
  REGIONALE_SPANNE_S2,
} from "./rentEstimate.js";
```

```typescript
describe("mietSpanneFuerBundesland", () => {
  it("berechnet die gemessene Spanne fuer Bayern -- deckungsgleich mit Entwurf 3.4 (-34,8 % / +67,1 %)", () => {
    const spanne = mietSpanneFuerBundesland("Bayern");
    expect(spanne).not.toBeNull();
    expect(spanne!.minProzent).toBeCloseTo(-0.348, 3);
    expect(spanne!.maxProzent).toBeCloseTo(0.671, 3);
  });

  it("liefert null fuer ein unbekanntes Bundesland -- keine erfundene Spanne", () => {
    expect(mietSpanneFuerBundesland("Nirgendwo")).toBeNull();
  });
});

describe("REGIONALE_SPANNE_S2", () => {
  it("ist die feste A11-Streuung der Tabelle gegen den Zensus, -23,7 % bis +23,9 %", () => {
    expect(REGIONALE_SPANNE_S2.minProzent).toBeCloseTo(-0.237, 3);
    expect(REGIONALE_SPANNE_S2.maxProzent).toBeCloseTo(0.239, 3);
  });
});

describe("mietSpanneBundesweit", () => {
  it("berechnet die Spanne ueber ALLE PLZ-Werte gegen den Bundesschnitt 11,11 €/m²", () => {
    const spanne = mietSpanneBundesweit();
    expect(spanne.minProzent).toBeCloseTo(-0.4599459945994599, 6);
    expect(spanne.maxProzent).toBeCloseTo(0.8451845184518453, 6);
  });
});
```

- [ ] **Run test to verify it fails**

Run: `cd scraper && npx vitest run lib/rentEstimate.test.ts`
Expected: FAIL — `mietSpanneFuerBundesland`/`mietSpanneBundesweit`/`REGIONALE_SPANNE_S2` sind kein Export von `./rentEstimate.js`.

### Schritt 1.2 — rentEstimate.ts: Implementierung

- [ ] **Refactor + neue Exporte**

In `scraper/lib/rentEstimate.ts` ersetzt der folgende Block die Zeilen
158–183 (den bisherigen `mittelwerte`/`mieteProM2FuerBundesland`-Abschnitt):

```typescript
/** Die REGIONALE_MIETE_PRO_M2-Werte aller PLZ-Zweisteller eines Bundeslandes. */
function werteFuerBundesland(bundesland: string): number[] {
  const zweisteller = new Set<string>();
  for (const [plz, land] of Object.entries(plzBundesland as Record<string, string>)) {
    if (land !== bundesland) continue;
    const treffer = plz.match(/^(\d{2})\d{3}$/);
    if (treffer !== null) zweisteller.add(treffer[1]);
  }

  const werte: number[] = [];
  for (const zs of zweisteller) {
    const wert = REGIONALE_MIETE_PRO_M2[zs];
    if (wert !== undefined) werte.push(wert);
  }
  return werte;
}

const mittelwerte = new Map<string, number | null>();

export function mieteProM2FuerBundesland(bundesland: string): number | null {
  const gemerkt = mittelwerte.get(bundesland);
  if (gemerkt !== undefined) return gemerkt;

  const werte = werteFuerBundesland(bundesland);
  const ergebnis =
    werte.length === 0
      ? null
      : Math.round((werte.reduce((a, b) => a + b, 0) / werte.length) * 100) / 100;
  mittelwerte.set(bundesland, ergebnis);
  return ergebnis;
}

/**
 * Bandbreite der Mietschaetzung, als prozentuale Abweichung vom Mittelwert
 * nach unten und oben.
 */
export interface MietSpanne {
  minProzent: number;
  maxProzent: number;
}

/**
 * Bandbreite fuer ein Bundesland: die GEMESSENE interne Spanne seiner
 * PLZ-Werte gegen den eigenen Mittelwert (Dashboard-Entwurf 3.4) -- nicht
 * eine pauschale Annahme. Fuer Bayern z. B. -34,8 % / +67,1 %, deckungsgleich
 * mit der von Hand nachgerechneten Tabelle in 3.4. `null`, wenn das
 * Bundesland keine PLZ-Werte hat (wie `mieteProM2FuerBundesland`).
 */
export function mietSpanneFuerBundesland(bundesland: string): MietSpanne | null {
  const werte = werteFuerBundesland(bundesland);
  if (werte.length === 0) return null;
  const mittel = mieteProM2FuerBundesland(bundesland);
  if (mittel === null) return null;
  const min = Math.min(...werte);
  const max = Math.max(...werte);
  return {
    minProzent: (min - mittel) / mittel,
    maxProzent: (max - mittel) / mittel,
  };
}

/**
 * Feste Bandbreite fuer S2 (PLZ-genaue Schaetzung): die gemessene Streuung
 * der Tabelle `REGIONALE_MIETE_PRO_M2` gegen den Zensus 2022 (Backlog A11,
 * n = 23). Anders als bei S1 ist das keine je-Bundesland-Spanne -- sie
 * beschreibt, wie gut die Tabelle selbst trifft, nicht die Streuung
 * INNERHALB eines Landes.
 */
export const REGIONALE_SPANNE_S2: MietSpanne = {
  minProzent: -0.237,
  maxProzent: 0.239,
};

/**
 * Bandbreite der bundesweiten Schaetzung (`geschaetzt_bundesweit`), analog
 * zu `mietSpanneFuerBundesland`: die gemessene Spanne ALLER PLZ-Werte gegen
 * den Bundesschnitt. Betrifft nur sehr wenige Objekte (6 von 12.611,
 * gemessen 2026-09-12, Entwurf 3.3) -- Faelle ohne PLZ UND ohne Bundesland.
 */
export function mietSpanneBundesweit(): MietSpanne {
  const werte = Object.values(REGIONALE_MIETE_PRO_M2);
  const min = Math.min(...werte);
  const max = Math.max(...werte);
  return {
    minProzent: (min - BUNDESWEITER_MIETPREIS_PRO_M2_MONAT) / BUNDESWEITER_MIETPREIS_PRO_M2_MONAT,
    maxProzent: (max - BUNDESWEITER_MIETPREIS_PRO_M2_MONAT) / BUNDESWEITER_MIETPREIS_PRO_M2_MONAT,
  };
}
```

- [ ] **Run test to verify it passes**

Run: `cd scraper && npx vitest run lib/rentEstimate.test.ts`
Expected: PASS, alle Tests inklusive der bereits vorhandenen.

- [ ] **Commit**

```bash
git add scraper/lib/rentEstimate.ts scraper/lib/rentEstimate.test.ts
git commit -m "$(cat <<'EOF'
feat(ranking): Bandbreite je Bundesland/bundesweit + feste S2-Spanne

Dashboard-Entwurf 3.4: die Bandbreite wird gerechnet, nicht pauschal
angenommen. mietSpanneFuerBundesland extrahiert die bereits vorhandene
PLZ-Wertesammlung aus mieteProM2FuerBundesland; mietSpanneBundesweit
und REGIONALE_SPANNE_S2 ergaenzen die beiden anderen Faelle aus 3.3/3.4.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

### Schritt 1.3 — ranking.ts: fehlschlagender Test (Kernpunkt aus Schritt 2 des Entwurfs)

- [ ] **Write the failing tests**

Import-Zeile in `scraper/lib/ranking.test.ts` erweitern:

```typescript
import { describe, it, expect } from "vitest";
import { bestimmeSicherheitsstufe, bewerteFuerRangliste } from "./ranking.js";
import { berechneKennzahlen, type KennzahlenInput } from "./metrics.js";
```

Ans Ende der Datei anfügen:

```typescript
describe("bewerteFuerRangliste", () => {
  const leipzig: KennzahlenInput = {
    kaufpreis: 480_000,
    jahreskaltmiete: 32_000,
    einheiten: 3,
    baujahr: 1998,
    wohnflaecheM2: 240,
  };
  const kaputt: KennzahlenInput = {
    kaufpreis: 2_840,
    jahreskaltmiete: 16_224,
    einheiten: 3,
    baujahr: 1998,
    wohnflaecheM2: 198.8,
  };
  const GRUNDERWERBSTEUER = 5.5;

  it("liefert bei wohnflaeche_fehlt KEINE Kennzahl -- keine 0, kein Rang, kein Band (3.7)", () => {
    const ergebnis = bewerteFuerRangliste(
      { rentSource: "geschaetzt_regional", dataGaps: [], livingAreaM2: null },
      leipzig,
      GRUNDERWERBSTEUER,
      "Bayern"
    );
    expect(ergebnis.stufe).toBe("S0");
    expect(ergebnis.rangzahl).toBeNull();
    expect(ergebnis.band).toBeNull();
    expect(ergebnis.istSchwellenwechsler).toBe(false);
  });

  it("S3 traegt einen Punktwert, aber kein Band (3.4: 'Fuer S3 entfaellt das Band')", () => {
    const ergebnis = bewerteFuerRangliste(
      { rentSource: "angegeben", dataGaps: [], livingAreaM2: 240 },
      leipzig,
      GRUNDERWERBSTEUER,
      null
    );
    expect(ergebnis.stufe).toBe("S3");
    expect(ergebnis.rangzahl).toBeCloseTo(0.8039150663732376, 10);
    expect(ergebnis.band).toBeNull();
    expect(ergebnis.istSchwellenwechsler).toBe(false);
  });

  it("S1 mit bekanntem Bundesland bekommt das gemessene Landesband -- und ueberquert hier die Meldeschwelle 1,3", () => {
    const ergebnis = bewerteFuerRangliste(
      { rentSource: "geschaetzt_bundesland", dataGaps: [], livingAreaM2: 240 },
      leipzig,
      GRUNDERWERBSTEUER,
      "Bayern"
    );
    expect(ergebnis.stufe).toBe("S1");
    expect(ergebnis.rangzahl).toBeCloseTo(0.8039150663732376, 10);
    expect(ergebnis.band).not.toBeNull();
    expect(ergebnis.band!.unten).toBeCloseTo(0.5241500025253383, 8);
    expect(ergebnis.band!.oben).toBeCloseTo(1.3431343814711796, 8);
    expect(ergebnis.istSchwellenwechsler).toBe(true);
  });

  it("S1 ohne bekanntes Bundesland bekommt fail-closed KEIN Band -- keine erfundene Spanne", () => {
    const ergebnis = bewerteFuerRangliste(
      { rentSource: "geschaetzt_bundesland", dataGaps: [], livingAreaM2: 240 },
      leipzig,
      GRUNDERWERBSTEUER,
      null
    );
    expect(ergebnis.stufe).toBe("S1");
    expect(ergebnis.band).toBeNull();
    expect(ergebnis.istSchwellenwechsler).toBe(false);
  });

  it("S1 mit rent_source geschaetzt_bundesweit nutzt die bundesweite Spanne, nicht die Landesspanne", () => {
    const ergebnis = bewerteFuerRangliste(
      { rentSource: "geschaetzt_bundesweit", dataGaps: [], livingAreaM2: 240 },
      leipzig,
      GRUNDERWERBSTEUER,
      null
    );
    expect(ergebnis.stufe).toBe("S1");
    expect(ergebnis.band).not.toBeNull();
    expect(ergebnis.band!.unten).toBeCloseTo(0.434157551596708, 8);
    expect(ergebnis.band!.oben).toBeCloseTo(1.4833716346220858, 8);
  });

  it("S2 nutzt die feste A11-Spanne, unabhaengig vom Bundesland", () => {
    const ergebnis = bewerteFuerRangliste(
      { rentSource: "geschaetzt_regional", dataGaps: [], livingAreaM2: 240 },
      leipzig,
      GRUNDERWERBSTEUER,
      null
    );
    expect(ergebnis.stufe).toBe("S2");
    expect(ergebnis.band).not.toBeNull();
    expect(ergebnis.band!.unten).toBeCloseTo(0.6133871956427803, 8);
    expect(ergebnis.band!.oben).toBeCloseTo(0.9960507672364413, 8);
    expect(ergebnis.istSchwellenwechsler).toBe(false);
  });

  it("kein Schwellenwechsler, wenn das ganze Band ueber der Meldeschwelle liegt", () => {
    const ergebnis = bewerteFuerRangliste(
      { rentSource: "geschaetzt_bundesland", dataGaps: [], livingAreaM2: 198.8 },
      kaputt,
      6.5,
      "Bayern"
    );
    expect(ergebnis.stufe).toBe("S1");
    expect(ergebnis.band!.unten).toBeGreaterThan(1.3);
    expect(ergebnis.istSchwellenwechsler).toBe(false);
  });
});
```

- [ ] **Run test to verify it fails**

Run: `cd scraper && npx vitest run lib/ranking.test.ts`
Expected: FAIL — `bewerteFuerRangliste` ist kein Export von `./ranking.js`.

### Schritt 1.4 — ranking.ts: Implementierung

- [ ] **Write minimal implementation**

An den Kopf von `scraper/lib/ranking.ts` (nach den bestehenden Kommentaren,
vor `export type Sicherheitsstufe`) diese Imports ergänzen:

```typescript
import { berechneKennzahlen, type KennzahlenInput } from "./metrics.js";
import {
  mietSpanneFuerBundesland,
  mietSpanneBundesweit,
  REGIONALE_SPANNE_S2,
  type MietSpanne,
} from "./rentEstimate.js";
```

Ans Ende der Datei (nach der bestehenden `bestimmeSicherheitsstufe`-Funktion)
anfügen:

```typescript
/** DSCR bei der unguenstigsten (`unten`) und der guenstigsten (`oben`) Mietannahme im Band. */
export interface Bandkanten {
  unten: number;
  oben: number;
}

/**
 * Schwelle, an der die Meldung haengt (`topTreffer` in `metrics.ts`,
 * `geschaetzterDscr >= 1,3`). Hier dupliziert statt importiert, weil
 * `metrics.ts` sie nirgends als eigenen Namen exportiert -- sie steckt dort
 * als Literal in `topTreffer`.
 */
const DSCR_MELDESCHWELLE = 1.3;

/**
 * Bandkanten durch einen zweiten und dritten Aufruf von `berechneKennzahlen`
 * mit skalierter Miete (Entwurf 3.4) -- das Band wird gerechnet, nicht
 * geschaetzt. `noi` waechst monoton mit der Miete (Bewirtschaftungskosten
 * sind zwischen 20 % und 35 % der Miete gedeckelt, nie mehr), darum liefert
 * die niedrigere Miete auch zuverlaessig die niedrigere Bandkante.
 */
function berechneBandkanten(
  input: KennzahlenInput,
  grunderwerbsteuerSatzProzent: number,
  spanne: MietSpanne
): Bandkanten {
  const untenInput = { ...input, jahreskaltmiete: input.jahreskaltmiete * (1 + spanne.minProzent) };
  const obenInput = { ...input, jahreskaltmiete: input.jahreskaltmiete * (1 + spanne.maxProzent) };
  return {
    unten: berechneKennzahlen(untenInput, grunderwerbsteuerSatzProzent).geschaetzterDscr,
    oben: berechneKennzahlen(obenInput, grunderwerbsteuerSatzProzent).geschaetzterDscr,
  };
}

export interface RangEinordnung {
  stufe: Sicherheitsstufe;
  /** DSCR, `null` fuer S0 -- ein nicht beurteilbares Objekt bekommt KEINE Kennzahl (3.7), keine 0. */
  rangzahl: number | null;
  /** `null` fuer S0 (keine Kennzahl) und S3 (dort steht ein Punktwert, kein Band, 3.4). */
  band: Bandkanten | null;
  istSchwellenwechsler: boolean;
}

/**
 * Fasst Sicherheitsstufe, Rangzahl, Bandkanten und Schwellenwechsler-Merkmal
 * zu einer Einordnung zusammen (Entwurf 9, Schritt 2).
 *
 * S0 bekommt ueberhaupt keine Kennzahl (3.7) -- die Pruefung passiert VOR
 * jedem Aufruf von `berechneKennzahlen`, nicht danach: Ein Objekt ohne
 * Wohnflaeche soll nie eine 0 durchrechnen, die spaeter verworfen wird.
 */
export function bewerteFuerRangliste(
  objekt: {
    rentSource: string | null;
    dataGaps: string[];
    livingAreaM2: number | null;
  },
  kennzahlenInput: KennzahlenInput,
  grunderwerbsteuerSatzProzent: number,
  bundesland: string | null
): RangEinordnung {
  const stufe = bestimmeSicherheitsstufe(objekt);

  if (stufe === "S0") {
    return { stufe, rangzahl: null, band: null, istSchwellenwechsler: false };
  }

  const rangzahl = berechneKennzahlen(kennzahlenInput, grunderwerbsteuerSatzProzent).geschaetzterDscr;

  if (stufe === "S3") {
    return { stufe, rangzahl, band: null, istSchwellenwechsler: false };
  }

  const spanne: MietSpanne | null =
    stufe === "S2"
      ? REGIONALE_SPANNE_S2
      : objekt.rentSource === "geschaetzt_bundesweit"
        ? mietSpanneBundesweit()
        : bundesland === null
          ? null
          : mietSpanneFuerBundesland(bundesland);

  if (spanne === null) {
    return { stufe, rangzahl, band: null, istSchwellenwechsler: false };
  }

  const band = berechneBandkanten(kennzahlenInput, grunderwerbsteuerSatzProzent, spanne);
  return {
    stufe,
    rangzahl,
    band,
    istSchwellenwechsler: band.unten < DSCR_MELDESCHWELLE && band.oben >= DSCR_MELDESCHWELLE,
  };
}
```

- [ ] **Run test to verify it passes**

Run: `cd scraper && npx vitest run lib/ranking.test.ts`
Expected: PASS, alle Tests inklusive der bereits vorhandenen
(`bestimmeSicherheitsstufe`, die DSCR-Identitaet).

- [ ] **Run full suite + typecheck**

Run: `cd scraper && npx vitest run && npx tsc --noEmit`
Expected: alle Tests gruen (bestehende 453 + neue), keine TS-Fehler.

- [ ] **Commit**

```bash
git add scraper/lib/ranking.ts scraper/lib/ranking.test.ts
git commit -m "$(cat <<'EOF'
feat(ranking): Rangzahl, Bandkanten und Schwellenwechsler-Merkmal

bewerteFuerRangliste fasst Sicherheitsstufe (bereits vorhanden), Rangzahl
(= geschaetzterDscr), Bandkanten (Entwurf 3.4, zweiter/dritter Aufruf von
berechneKennzahlen mit skalierter Miete) und Schwellenwechsler-Merkmal
(Entwurf 3.6: nur die DSCR-Schwelle 1,3, nicht der Kaufpreisfaktor)
zusammen. S0 bekommt keine Kennzahl -- die Pruefung passiert vor dem
ersten Aufruf von berechneKennzahlen, nicht danach.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Die drei Verfügbarkeitszustände

**Files:**
- Modify: `scraper/lib/ranking.ts` (neue Funktion am Ende der Datei)
- Modify: `scraper/lib/ranking.test.ts` (neuer `describe`-Block am Ende)

**Interfaces:**
- Produces: `export type Verfuegbarkeitszustand = "verfuegbar" | "unbestaetigt" | "abgaengig"`,
  `export function bestimmeVerfuegbarkeitszustand(objekt: { disappearedAt: string | null; lastSeen: string | null; kadenzTageDerRegion: number | null }, jetzt: Date): Verfuegbarkeitszustand`.
- Consumes: nichts aus Task 1 — unabhängige Funktion, andere Eingaben.
- **Designentscheidung, hier getroffen (kein offener Punkt im Entwurf):**
  Die Funktion nimmt `kadenzTageDerRegion: number | null` statt einer
  Regions-ID entgegen. `null` deckt bewusst ALLE drei Fälle aus 6.3 ab, die
  im Ergebnis identisch sind — "die Region kann Abgänge grundsätzlich nicht
  erkennen" (`nw`, `bw`, `mv`), "`partitionEinesListings` liefert keine
  Region" und "Kadenz nicht ermittelbar". Die eigentliche Kadenz (Tage
  zwischen zwei vollständigen Sweeps einer Region) ist keine statische
  Tabelle in diesem Projekt, sondern eine historische Messung aus
  `sweep_region_runs` (6.3: "gemessen ... auf sieben Tagen Historie nicht
  entscheidbar"). Diese Funktion bleibt deshalb bewusst eine reine
  Entscheidungsfunktion; das Nachschlagen der Kadenz und der Region-Liste
  ohne Abgangserkennung ist Aufgabe des Aufrufers (Schritt 3,
  Snapshot-Export — außerhalb dieses Plans).

### Schritt 2.1 — fehlschlagender Test

- [ ] **Write the failing tests**

Import-Zeile in `scraper/lib/ranking.test.ts` erweitern:

```typescript
import { bestimmeSicherheitsstufe, bewerteFuerRangliste, bestimmeVerfuegbarkeitszustand } from "./ranking.js";
```

Ans Ende der Datei anfügen:

```typescript
describe("bestimmeVerfuegbarkeitszustand", () => {
  const jetzt = new Date("2026-09-14T12:00:00Z");

  it("ist abgaengig, sobald disappearedAt gesetzt ist -- unabhaengig von allem anderen", () => {
    expect(
      bestimmeVerfuegbarkeitszustand(
        { disappearedAt: "2026-09-01T00:00:00Z", lastSeen: "2026-09-14T11:00:00Z", kadenzTageDerRegion: 1 },
        jetzt
      )
    ).toBe("abgaengig");
  });

  it("ist unbestaetigt, wenn die Region keine Kadenz hat (nicht zuzuordnen ODER erkennt keine Abgaenge)", () => {
    expect(
      bestimmeVerfuegbarkeitszustand(
        { disappearedAt: null, lastSeen: "2026-09-14T11:59:00Z", kadenzTageDerRegion: null },
        jetzt
      )
    ).toBe("unbestaetigt");
  });

  it("ist verfuegbar, wenn last_seen juenger ist als die doppelte Regionskadenz", () => {
    // Kadenz 1 Tag, last_seen vor 1,5 Tagen -- unter dem Doppelten (2 Tage).
    expect(
      bestimmeVerfuegbarkeitszustand(
        { disappearedAt: null, lastSeen: "2026-09-13T00:00:00Z", kadenzTageDerRegion: 1 },
        jetzt
      )
    ).toBe("verfuegbar");
  });

  it("ist unbestaetigt, wenn last_seen aelter ist als die doppelte Regionskadenz", () => {
    // Kadenz 1 Tag, last_seen vor 2 Tagen 13 Stunden -- ueber dem Doppelten.
    expect(
      bestimmeVerfuegbarkeitszustand(
        { disappearedAt: null, lastSeen: "2026-09-11T23:00:00Z", kadenzTageDerRegion: 1 },
        jetzt
      )
    ).toBe("unbestaetigt");
  });

  it("ist unbestaetigt, wenn last_seen fehlt -- keine Angabe ist kein Freibrief", () => {
    expect(
      bestimmeVerfuegbarkeitszustand(
        { disappearedAt: null, lastSeen: null, kadenzTageDerRegion: 1 },
        jetzt
      )
    ).toBe("unbestaetigt");
  });
});
```

- [ ] **Run test to verify it fails**

Run: `cd scraper && npx vitest run lib/ranking.test.ts`
Expected: FAIL — `bestimmeVerfuegbarkeitszustand` ist kein Export von
`./ranking.js`.

### Schritt 2.2 — Implementierung

- [ ] **Write minimal implementation**

Ans Ende von `scraper/lib/ranking.ts` anfügen:

```typescript
export type Verfuegbarkeitszustand = "verfuegbar" | "unbestaetigt" | "abgaengig";

const MS_PRO_TAG = 24 * 60 * 60 * 1000;

/**
 * Die drei Verfuegbarkeitszustaende aus Entwurf 6.3.
 *
 * `kadenzTageDerRegion === null` deckt drei Faelle aus der Entwurfstabelle
 * gleichzeitig ab, die dasselbe Ergebnis haben: keine Region zuzuordnen,
 * eine Region ohne Abgangserkennung (`nw`, `bw`, `mv`), oder eine Kadenz,
 * die (noch) nicht ermittelbar ist. In allen drei Faellen gilt "nicht
 * hingesehen", nie "verfuegbar" -- Nichtwissen wird nicht zu Vertrauen
 * aufgewertet, dieselbe Regel wie bei der Sicherheitsstufe.
 *
 * Fehlt `lastSeen`, gilt dasselbe: keine Angabe ist kein Freibrief (wie
 * `istHartLoeschbar` in `bestand.ts`).
 */
export function bestimmeVerfuegbarkeitszustand(
  objekt: {
    disappearedAt: string | null;
    lastSeen: string | null;
    kadenzTageDerRegion: number | null;
  },
  jetzt: Date
): Verfuegbarkeitszustand {
  if (objekt.disappearedAt !== null) return "abgaengig";
  if (objekt.kadenzTageDerRegion === null) return "unbestaetigt";
  if (objekt.lastSeen === null) return "unbestaetigt";

  const lastSeenMs = new Date(objekt.lastSeen).getTime();
  if (!Number.isFinite(lastSeenMs)) return "unbestaetigt";

  const alterMs = jetzt.getTime() - lastSeenMs;
  const schwelleMs = 2 * objekt.kadenzTageDerRegion * MS_PRO_TAG;
  return alterMs > schwelleMs ? "unbestaetigt" : "verfuegbar";
}
```

- [ ] **Run test to verify it passes**

Run: `cd scraper && npx vitest run lib/ranking.test.ts`
Expected: PASS, alle Tests.

- [ ] **Run full suite + typecheck**

Run: `cd scraper && npx vitest run && npx tsc --noEmit`
Expected: alle Tests gruen, keine TS-Fehler. Damit ist Schritt 2 des
Dashboard-Entwurfs vollständig umgesetzt.

- [ ] **Commit**

```bash
git add scraper/lib/ranking.ts scraper/lib/ranking.test.ts
git commit -m "$(cat <<'EOF'
feat(ranking): die drei Verfuegbarkeitszustaende (Entwurf 6.3)

bestimmeVerfuegbarkeitszustand entscheidet verfuegbar/unbestaetigt/
abgaengig aus disappeared_at, last_seen und der Regionskadenz. Kadenz
und Region-Zuordnung bleiben Sache des Aufrufers (Schritt 3) -- diese
Funktion bleibt eine reine Entscheidungsfunktion ohne Datenbankzugriff.
Damit ist scraper/lib/ranking.ts vollstaendig (Entwurf 9, Schritt 2).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Nach Abschluss beider Aufgaben

- Gesamtpruefung (opus oder sonnet, wie in vorigen Iterationen): Diff gegen
  den Ausgangspunkt `main` (`64cca06`), Schwerpunkt: greift die
  Fail-closed-Logik wirklich (kein Band bei fehlendem Bundesland, kein Rang
  bei S0, `unbestaetigt` bei fehlender Kadenz)? Stimmen die Bandkanten mit
  der Monotonie-Annahme (`noi` waechst mit der Miete) tatsaechlich fuer
  Extremfaelle wie die `kaputt`-Fixture?
- Merge in `main`, Push — wie in der letzten Iteration liegt das beim
  Nutzer, nicht beim Agenten.
- Koordinator-Nacharbeit: `docs/superpowers/UEBERGABE.md` und den
  SDD-Ledger auf den neuen Stand bringen, Abschnitt 9 des Entwurfs
  ("Schritt 2" → erledigt) nachziehen.
- Danach Schritt 3 (Snapshot-Export) — eigener Plan, nicht Teil hiervon.
