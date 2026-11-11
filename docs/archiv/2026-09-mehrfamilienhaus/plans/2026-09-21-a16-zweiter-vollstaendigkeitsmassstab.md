# A16 — Zweiter Vollständigkeitsmaßstab: Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Immowelt-Regionen ohne ausgewiesene Trefferzahl (`nw`, `bw`, `mv`, `sh`) bekommen einen zweiten Vollständigkeitsmaßstab — die Hochwassermarke ihrer eigenen Mengenhistorie — damit sie überhaupt Referenzläufe sammeln können.

**Architecture:** Das Urteil zerfällt in zwei reine Funktionen in einem neuen Modul `scraper/lib/regionsMassstab.ts`: `waehleMassstab` entscheidet, **woran** gemessen wird, `urteileGegenMassstab` fällt das Urteil. Die Marke wird einmal je Lauf aus `sweep_region_runs` geladen und durchgereicht; keine der beiden Funktionen kennt die Datenbank. Die Art des Maßstabs und die Referenzmenge werden in zwei neuen Spalten mitgeschrieben, damit `vollstaendig = true` nie wieder ohne Beleg dasteht.

**Tech Stack:** TypeScript (ESM, `.js`-Importe), vitest, Supabase (`@supabase/supabase-js`), Playwright im Scraper.

**Spec:** `docs/superpowers/specs/2026-09-21-a16-zweiter-vollstaendigkeitsmassstab-design.md`

## Global Constraints

- **Toleranz gegen die Hochwassermarke: 0,1.** Der engste in der Messung fehlerfreie Wert.
- **Toleranz gegen die gemeldete Trefferzahl: 0,25** (`REGION_FEHLBETRAG_TOLERANZ`). Unverändert, wird nicht angefasst.
- **Untergrenze der Marke: `EINE_ERGEBNISSEITE` = 45.** Eine Marke von höchstens 45 ist kein Maßstab.
- **Die Marke kennt kein Fenster.** Sie ist das Maximum über alle Zeilen der Region. Ein gleitendes Fenster von zehn Läufen erzeugte in der Messung 43 Fail-open.
- **Fail-closed überall.** Kein Maßstab, keine lesbare Historie, Seitendeckel erreicht oder null Karten → `vollstaendig = false`.
- Alle Bezeichner, Kommentare und Testnamen auf Deutsch, wie im übrigen Projekt. Umlaute in Code und Kommentaren werden umschrieben (`ae`, `oe`, `ue`, `sz`), in Markdown nicht.
- Kein Schreibzugriff auf Produktionsdaten. Die acht Altzeilen vom 2026-09-08 bleiben unberührt.
- Nicht anfassen: `plausibilitaet.ts`, ZVG, `sweep.vollstaendig` (für Immowelt hart `false`), `partitionAusExternalId`.

---

### Task 1: Die Migration

Zuerst, nicht zuletzt. `speichereRegionsLaeufe` fängt Insert-Fehler nur mit `console.warn` ab — stünden die Spalten nicht, verlöre jeder Lauf still seine Regionszeilen.

**Files:**
- Modify: `schema.sql:90-99`

**Interfaces:**
- Consumes: nichts
- Produces: die Spalten `sweep_region_runs.massstab` (text, nullable) und `sweep_region_runs.referenz_menge` (integer, nullable)

- [ ] **Step 1: `schema.sql` ergänzen**

Die Tabellendefinition ab Zeile 90 wird zu:

```sql
create table sweep_region_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  -- Bundeslandkuerzel, z. B. "he".
  partition text not null,
  started_at timestamptz not null default now(),
  gesehene_objekte integer not null,
  gemeldete_treffer integer,
  vollstaendig boolean not null,
  -- WORAN die Vollstaendigkeit gemessen wurde: 'gemeldete_treffer',
  -- 'hochwassermarke' oder 'keiner'. Nullable NUR wegen der acht Altzeilen
  -- vom 2026-09-08, die aus der Zeit vor jedem Massstab stammen (belegt in
  -- specs/2026-09-16-vollstaendig-ohne-trefferzahl.md). Sie sind die
  -- einzigen Zeilen mit vollstaendig=true ohne Beleg, und genau daran
  -- sollen sie erkennbar bleiben.
  massstab text,
  -- Die Menge, gegen die geurteilt wurde. Bei massstab='keiner' null.
  referenz_menge integer
);
```

- [ ] **Step 2: Das SQL in Supabase ausführen**

Im Supabase-SQL-Editor des Projekts:

```sql
alter table sweep_region_runs add column massstab text;
alter table sweep_region_runs add column referenz_menge integer;
```

Rückweg, falls nötig:

```sql
alter table sweep_region_runs drop column massstab;
alter table sweep_region_runs drop column referenz_menge;
```

- [ ] **Step 3: Prüfen, dass die Spalten da sind und die Altzeilen unberührt**

Run: `cd scraper && npx tsx -e "import {sb} from './lib/supabase.js'; const {data,error}=await sb.from('sweep_region_runs').select('partition,massstab,referenz_menge').limit(3); console.log(error ?? data);"`

Expected: drei Zeilen, `massstab` und `referenz_menge` jeweils `null`. Kommt stattdessen ein Fehler mit `column ... does not exist`, ist Schritt 2 nicht angekommen.

- [ ] **Step 4: Commit**

```bash
git add schema.sql
git commit -m "feat(schema): sweep_region_runs haelt fest, woran Vollstaendigkeit gemessen wurde"
```

---

### Task 2: Das Maßstabsmodul

**Files:**
- Create: `scraper/lib/regionsMassstab.ts`
- Test: `scraper/lib/regionsMassstab.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `type MassstabArt = "gemeldete_treffer" | "hochwassermarke" | "keiner"`
  - `interface Massstab { art: MassstabArt; referenz: number | null; toleranz: number }`
  - `interface MassstabRegeln { untergrenze: number; toleranzGemeldet: number; toleranzMarke: number }`
  - `function hochwassermarkeAus(mengen: number[]): number | null`
  - `function waehleMassstab(gemeldet: number | null, hochwassermarke: number | null, regeln: MassstabRegeln): Massstab`
  - `function urteileGegenMassstab(gesammelt: number, massstab: Massstab, abgeschnitten: boolean): boolean`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Create `scraper/lib/regionsMassstab.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  hochwassermarkeAus,
  waehleMassstab,
  urteileGegenMassstab,
  type MassstabRegeln,
} from "./regionsMassstab.js";

/** Die Regeln, mit denen Immowelt misst. Hier fest, damit die Tests nicht an
 *  einer Konstante des Scrapers haengen. */
const REGELN: MassstabRegeln = {
  untergrenze: 45,
  toleranzGemeldet: 0.25,
  toleranzMarke: 0.1,
};

describe("hochwassermarkeAus", () => {
  it("liefert das Maximum", () => {
    expect(hochwassermarkeAus([40, 6795, 41, 6807])).toBe(6807);
  });

  it("liefert null fuer eine leere Liste -- NICHT null als Menge missverstehen", () => {
    expect(hochwassermarkeAus([])).toBeNull();
  });

  it("laesst sich von Nullmengen nicht senken", () => {
    // Eine abgebrochene Region protokolliert `gesehene: 0`. Ein Maximum
    // ignoriert das; genau deshalb ist es hier der richtige Schaetzer.
    expect(hochwassermarkeAus([0, 0, 1316])).toBe(1316);
  });

  it("laesst sich von flachen Laeufen nicht senken", () => {
    // Der ganze Sinn der Marke. Eine Region, die in 24 % der Laeufe nur eine
    // Ergebnisseite bekommt, behaelt ihren Massstab. Ein Median laege hier
    // bei 40 -- und genau daran ist der Vorschlag aus dem Backlog gescheitert.
    expect(hochwassermarkeAus([6807, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40])).toBe(6807);
  });
});

describe("waehleMassstab", () => {
  it("gibt der gemeldeten Trefferzahl den Vorrang vor der Marke", () => {
    const m = waehleMassstab(2719, 6807, REGELN);
    expect(m.art).toBe("gemeldete_treffer");
    expect(m.referenz).toBe(2719);
    expect(m.toleranz).toBe(0.25);
  });

  it("nimmt die Marke, wenn keine Trefferzahl gemeldet ist", () => {
    const m = waehleMassstab(null, 6807, REGELN);
    expect(m.art).toBe("hochwassermarke");
    expect(m.referenz).toBe(6807);
    expect(m.toleranz).toBe(0.1);
  });

  it("verwirft eine Marke von hoechstens einer Ergebnisseite", () => {
    // Der Startfall: Eine Region, deren Historie NUR aus flachen Laeufen
    // besteht, bekaeme eine Marke von 40 -- und dann gaelte jeder flache
    // Lauf als vollstaendig. 40 Karten sind eine Ergebnisseite, kein
    // Bestand. Simuliert im Messskript, real nie eingetreten: keine der 16
    // Regionen startete flach.
    expect(waehleMassstab(null, 45, REGELN).art).toBe("keiner");
    expect(waehleMassstab(null, 40, REGELN).art).toBe("keiner");
    expect(waehleMassstab(null, 46, REGELN).art).toBe("hochwassermarke");
  });

  it("hat keinen Massstab, wenn weder Trefferzahl noch Marke vorliegen", () => {
    const m = waehleMassstab(null, null, REGELN);
    expect(m.art).toBe("keiner");
    expect(m.referenz).toBeNull();
  });

  it("nimmt auch eine gemeldete Null als Massstab", () => {
    // Eine echte Null ist eine Aussage des Portals, kein fehlender Wert.
    const m = waehleMassstab(0, null, REGELN);
    expect(m.art).toBe("gemeldete_treffer");
    expect(m.referenz).toBe(0);
  });
});

describe("urteileGegenMassstab", () => {
  const gegenMarke = { art: "hochwassermarke" as const, referenz: 6807, toleranz: 0.1 };
  const gegenGemeldet = { art: "gemeldete_treffer" as const, referenz: 2719, toleranz: 0.25 };

  it("urteilt gegen die Marke mit 10 Prozent Toleranz", () => {
    expect(urteileGegenMassstab(6807, gegenMarke, false)).toBe(true);
    expect(urteileGegenMassstab(6127, gegenMarke, false)).toBe(true); // genau 90 %
    expect(urteileGegenMassstab(6126, gegenMarke, false)).toBe(false);
  });

  it("laesst einen flachen Lauf nie durch", () => {
    // Der Fall, um den es in A16 ueberhaupt geht.
    expect(urteileGegenMassstab(40, gegenMarke, false)).toBe(false);
  });

  it("urteilt gegen die gemeldete Trefferzahl mit 25 Prozent Toleranz", () => {
    expect(urteileGegenMassstab(2040, gegenGemeldet, false)).toBe(true);
    expect(urteileGegenMassstab(2039, gegenGemeldet, false)).toBe(false);
  });

  it("gilt bei gemeldeter Null als vollstaendig, sobald ueberhaupt etwas ankam", () => {
    const null_gemeldet = { art: "gemeldete_treffer" as const, referenz: 0, toleranz: 0.25 };
    expect(urteileGegenMassstab(1, null_gemeldet, false)).toBe(true);
  });

  it("urteilt ohne Massstab immer unvollstaendig", () => {
    const keiner = { art: "keiner" as const, referenz: null, toleranz: 0 };
    expect(urteileGegenMassstab(6807, keiner, false)).toBe(false);
  });

  it("urteilt am Seitendeckel immer unvollstaendig", () => {
    // Der Seitendeckel ist ein Beleg fuer das Gegenteil von Vollstaendigkeit.
    expect(urteileGegenMassstab(6807, gegenMarke, true)).toBe(false);
  });

  it("urteilt ohne eine einzige Karte immer unvollstaendig", () => {
    // Signatur eines Soft-Blocks: HTTP 200, leere Huelle.
    const null_gemeldet = { art: "gemeldete_treffer" as const, referenz: 0, toleranz: 0.25 };
    expect(urteileGegenMassstab(0, null_gemeldet, false)).toBe(false);
  });
});
```

- [ ] **Step 2: Den Test laufen lassen und rot sehen**

Run: `cd scraper && npx vitest run lib/regionsMassstab.test.ts`
Expected: FAIL — `Failed to resolve import "./regionsMassstab.js"`.

Ein Test, der nicht erst rot war, prüft womöglich gar nicht das, was er behauptet.

- [ ] **Step 3: Das Modul schreiben**

Create `scraper/lib/regionsMassstab.ts`:

```ts
/**
 * WORAN eine Region gemessen wird, und wie das Urteil daraus faellt.
 *
 * Getrennt in zwei Schritte, weil `vollstaendig` die Wache vor der
 * Massenloeschung ist: Erst steht fest, WORAN gemessen wird, dann faellt das
 * Urteil. Nur so kann die Datenbankzeile den Massstab mitschreiben, und nur
 * so steht `vollstaendig = true` nie ohne Beleg da.
 *
 * WARUM EINE HOCHWASSERMARKE UND KEIN MEDIAN: gemessen am 2026-09-21 gegen
 * die zwoelf Regionen, deren Trefferzahl bekannt ist (323 Urteile, Skript
 * `scripts/messung-a16-massstaebe.mts`). Der gleitende Median -- der Vorschlag
 * aus BACKLOG A16 -- erzeugte 203 falsche Freigaben. Ursache: 24 % der Laeufe
 * sind flach, und der Median sinkt mit dem Ausfall mit. Auch das Maximum ueber
 * ein Fenster von zehn Laeufen fiel durch (43). Nicht der Schaetzer ist das
 * Problem, sondern das Fenster: Der flache Zustand haelt laenger an als zehn
 * Laeufe. Die Marke OHNE Fenster urteilte fehlerfrei -- 0 Fail-open, 0
 * Fehlalarm, und sie sagte genau so oft "vollstaendig" wie die Wahrheit
 * (54 von 54), war also keine triviale Nullmessung.
 *
 * Details: docs/superpowers/specs/2026-09-21-a16-zweiter-vollstaendigkeitsmassstab-design.md
 */

export type MassstabArt = "gemeldete_treffer" | "hochwassermarke" | "keiner";

export interface Massstab {
  art: MassstabArt;
  /** Die Menge, gegen die geurteilt wird. null nur bei art "keiner". */
  referenz: number | null;
  /** Zulaessiger Fehlbetrag als Anteil. Gehoert zum Massstab, nicht zum
   *  Aufrufer -- sonst koennte dieselbe Referenz je nach Aufrufort anders
   *  streng gelesen werden. */
  toleranz: number;
}

export interface MassstabRegeln {
  /** Bis zu dieser Marke gilt die Historie NICHT als Massstab. */
  untergrenze: number;
  /** Zulaessiger Fehlbetrag gegen die gemeldete Trefferzahl. */
  toleranzGemeldet: number;
  /** Zulaessiger Fehlbetrag gegen die Hochwassermarke. Enger, weil eine
   *  einzelne Region viel stabiler ist als eine ganze Quelle. */
  toleranzMarke: number;
}

/**
 * Das Maximum der bisher gesehenen Mengen. `null` fuer eine leere Liste --
 * und das ist NICHT dasselbe wie die Menge null: Ohne Historie gibt es
 * keinen Massstab, mit einer Historie aus lauter Nullen ebenfalls nicht.
 */
export function hochwassermarkeAus(mengen: number[]): number | null {
  if (mengen.length === 0) return null;
  return Math.max(...mengen);
}

export function waehleMassstab(
  gemeldet: number | null,
  hochwassermarke: number | null,
  regeln: MassstabRegeln
): Massstab {
  // Die gemeldete Trefferzahl ist die Aussage des Portals ueber sich selbst
  // und schlaegt jede Schaetzung aus der eigenen Historie.
  if (gemeldet !== null) {
    return { art: "gemeldete_treffer", referenz: gemeldet, toleranz: regeln.toleranzGemeldet };
  }
  // Eine Marke, die nicht ueber eine Ergebnisseite hinauskommt, ist keine
  // Marke, sondern der Abdruck des Ausfalls, gegen den hier geschuetzt wird.
  if (hochwassermarke !== null && hochwassermarke > regeln.untergrenze) {
    return { art: "hochwassermarke", referenz: hochwassermarke, toleranz: regeln.toleranzMarke };
  }
  return { art: "keiner", referenz: null, toleranz: 0 };
}

export function urteileGegenMassstab(
  gesammelt: number,
  massstab: Massstab,
  /**
   * Endete die Blaetterung am Seitendeckel des Portals? Verpflichtend und
   * ohne Vorgabewert: Ein Argument mit stillem `false` waere genau die Sorte
   * Vorgabe, die einen unbekannten Zustand als "in Ordnung" liest.
   */
  abgeschnitten: boolean
): boolean {
  if (abgeschnitten) return false;
  if (gesammelt === 0) return false;
  if (massstab.art === "keiner" || massstab.referenz === null) return false;
  // Eine gemeldete Null ist eine Aussage, kein fehlender Wert: Das Portal
  // sagt, es gebe hier nichts. Dann genuegt, dass ueberhaupt etwas ankam --
  // die Division waere sonst undefiniert.
  if (massstab.referenz === 0) return true;
  return gesammelt >= massstab.referenz * (1 - massstab.toleranz);
}
```

- [ ] **Step 4: Den Test laufen lassen und grün sehen**

Run: `cd scraper && npx vitest run lib/regionsMassstab.test.ts`
Expected: PASS, alle Tests.

- [ ] **Step 5: Commit**

```bash
git add scraper/lib/regionsMassstab.ts scraper/lib/regionsMassstab.test.ts
git commit -m "feat(scraper): Massstab und Urteil sind getrennt und unter Test"
```

---

### Task 3: Die Marke aus der Datenbank laden

**Files:**
- Modify: `scraper/lib/bestandDb.ts` (neue Funktion neben `ladeLetzteRegionsSweeps:410-432`)
- Test: `scraper/lib/bestandDb.test.ts`

**Interfaces:**
- Consumes: `hochwassermarkeAus` aus Task 2
- Produces: `function ladeHochwassermarken(supabase: SupabaseClient, source: string): Promise<Map<string, number> | null>`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

An `scraper/lib/bestandDb.test.ts` anhängen. Der vorhandene Helfer `fakeRegionsHistorie` (Zeile 254) wird wiederverwendet:

```ts
describe("ladeHochwassermarken", () => {
  it("liefert je Region die groesste je gesehene Menge", async () => {
    const { client, abfragen } = fakeRegionsHistorie({
      zeilen: [
        { partition: "nw", gesehene_objekte: 6807 },
        { partition: "bw", gesehene_objekte: 4920 },
        { partition: "nw", gesehene_objekte: 40 },
        { partition: "bw", gesehene_objekte: 41 },
      ],
    });

    const marken = await ladeHochwassermarken(client, "immowelt");

    expect(marken).not.toBeNull();
    expect(marken!.get("nw")).toBe(6807);
    expect(marken!.get("bw")).toBe(4920);
    expect(abfragen).toEqual([{ tabelle: "sweep_region_runs", source: "immowelt" }]);
  });

  it("liefert null, wenn die Historie nicht lesbar ist", async () => {
    // Fail-closed: keine Marke heisst kein Massstab heisst unvollstaendig.
    // Genauso handhabt es `ladeLetzteRegionsSweeps` schon heute.
    const { client } = fakeRegionsHistorie({ fehler: true });
    expect(await ladeHochwassermarken(client, "immowelt")).toBeNull();
  });

  it("liefert eine leere Map, wenn es noch keine Zeile gibt", async () => {
    // Leer ist NICHT dasselbe wie nicht lesbar: hier hat noch nie ein Lauf
    // stattgefunden, und jede Region bekommt korrekt keinen Massstab.
    const { client } = fakeRegionsHistorie({ zeilen: [] });
    const marken = await ladeHochwassermarken(client, "immowelt");
    expect(marken).not.toBeNull();
    expect(marken!.size).toBe(0);
  });
});
```

Die Importe oben in der Datei ergänzen: `ladeHochwassermarken` zur Liste aus `"./bestandDb.js"`.

- [ ] **Step 2: Den Test laufen lassen und rot sehen**

Run: `cd scraper && npx vitest run lib/bestandDb.test.ts`
Expected: FAIL — `ladeHochwassermarken is not a function` bzw. ein Importfehler.

- [ ] **Step 3: Die Funktion schreiben**

In `scraper/lib/bestandDb.ts`, direkt hinter `ladeLetzteRegionsSweeps`:

```ts
/**
 * So viele Zeilen holt die Markenabfrage. Weil ABSTEIGEND NACH MENGE
 * sortiert wird, steht das Maximum jeder Region zwangslaeufig unter den
 * ersten Zeilen -- 16 Regionen brauchen 16 Zeilen, alles darueber ist
 * Reserve. Das Limit kann die Marke damit nicht abschneiden.
 */
const HOCHWASSER_ZEILEN = 200;

/**
 * Die groesste je gesehene Menge je Region -- der zweite
 * Vollstaendigkeitsmassstab aus BACKLOG A16, fuer Regionen, deren
 * Trefferzahl das Portal nie nennt.
 *
 * SORTIERT NACH MENGE, NICHT NACH ZEIT, und das ist der Kern: Eine Abfrage
 * der juengsten N Zeilen waere ein gleitendes Fenster, und ein Fenster faellt
 * durch. Gemessen am 2026-09-21: Das Maximum ueber die letzten zehn Laeufe
 * erzeugte 43 falsche Freigaben, weil der flache Zustand laenger anhaelt als
 * zehn Laeufe. `ladeLetzteRegionsSweeps` mit REGIONS_HISTORIE_ZEILEN = 200
 * deckt bei heute 492 Zeilen nur rund zwoelf je Region -- an dieser Abfrage
 * darf die Marke deshalb NICHT haengen.
 *
 * `null` heisst "Historie nicht lesbar" und fuehrt fail-closed dazu, dass
 * jede Region ohne Trefferzahl als unvollstaendig gilt. Eine leere Map heisst
 * "noch nie gelaufen" und fuehrt zum selben Urteil, aber aus einem anderen
 * Grund -- die beiden bleiben unterscheidbar.
 */
export async function ladeHochwassermarken(
  supabase: SupabaseClient,
  source: string
): Promise<Map<string, number> | null> {
  const { data, error } = await supabase
    .from("sweep_region_runs")
    .select("partition, gesehene_objekte")
    .eq("source", source)
    .order("gesehene_objekte", { ascending: false })
    .limit(HOCHWASSER_ZEILEN);
  if (error !== null || data === null) {
    console.warn("sweep_region_runs: Marken nicht lesbar, jede Region ohne Trefferzahl bleibt unvollstaendig", error);
    return null;
  }
  const marken = new Map<string, number>();
  for (const zeile of data as { partition: string; gesehene_objekte: number }[]) {
    if (!Number.isFinite(zeile.gesehene_objekte)) continue;
    const bisher = marken.get(zeile.partition);
    if (bisher === undefined || zeile.gesehene_objekte > bisher) {
      marken.set(zeile.partition, zeile.gesehene_objekte);
    }
  }
  return marken;
}
```

- [ ] **Step 4: Den Test laufen lassen und grün sehen**

Run: `cd scraper && npx vitest run lib/bestandDb.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scraper/lib/bestandDb.ts scraper/lib/bestandDb.test.ts
git commit -m "feat(scraper): die Hochwassermarke wird nach Menge sortiert geladen, nicht nach Zeit"
```

---

### Task 4: Die Sperre an der Schreibstelle ersetzen

**Files:**
- Modify: `scraper/lib/bestand.ts:41-47` (`RegionLauf`)
- Modify: `scraper/lib/bestandDb.ts:334-355` (`regionsLaufZeile`)
- Test: `scraper/lib/bestandDb.test.ts:21-60`

**Interfaces:**
- Consumes: `MassstabArt` aus Task 2
- Produces: `RegionLauf` um `massstab: MassstabArt` und `referenzMenge: number | null` erweitert; `regionsLaufZeile` schreibt beide Felder als `massstab` und `referenz_menge`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

In `scraper/lib/bestandDb.test.ts`, im vorhandenen `describe("regionsLaufZeile")`. Der bestehende Test `"schreibt nie vollstaendig=true ohne gemeldete Trefferzahl"` (Zeile 52) wird **ersetzt** — die Regel gilt weiter, aber sie hängt jetzt am Maßstab statt an der Trefferzahl:

```ts
  it("schreibt nie vollstaendig=true ohne Massstab", () => {
    // Die Sperre von 2026-09-16 hing an `gemeldeteTreffer === null`. Das war
    // ein Stellvertreter: Gemeint war immer "ohne Massstab". Seit A16 gibt es
    // einen zweiten Massstab, und die Regel wird jetzt an der Sache geprueft.
    // Sie ist damit NICHT aufgeweicht -- der Beleg steht in derselben Zeile.
    const zeile = regionsLaufZeile("immowelt", {
      partition: "nw",
      gesehene: 6807,
      gemeldeteTreffer: null,
      vollstaendig: true,
      massstab: "keiner",
      referenzMenge: null,
    });
    expect(zeile.vollstaendig).toBe(false);
  });

  it("laesst vollstaendig=true durch, wenn die Marke der Massstab war", () => {
    // Genau der Fall, den A16 herstellt: `nw` nennt nie eine Trefferzahl,
    // hat aber eine Marke von 6807 aus der eigenen Historie.
    const zeile = regionsLaufZeile("immowelt", {
      partition: "nw",
      gesehene: 6795,
      gemeldeteTreffer: null,
      vollstaendig: true,
      massstab: "hochwassermarke",
      referenzMenge: 6807,
    });
    expect(zeile).toMatchObject({
      vollstaendig: true,
      massstab: "hochwassermarke",
      referenz_menge: 6807,
      gemeldete_treffer: null,
    });
  });

  it("schreibt den Massstab auch dann mit, wenn die Trefferzahl gilt", () => {
    const zeile = regionsLaufZeile("immowelt", {
      partition: "he",
      gesehene: 2719,
      gemeldeteTreffer: 2719,
      vollstaendig: true,
      massstab: "gemeldete_treffer",
      referenzMenge: 2719,
    });
    expect(zeile).toMatchObject({ massstab: "gemeldete_treffer", referenz_menge: 2719 });
  });
```

Die zwei vorhandenen Tests in demselben `describe` (Zeile 22 und 38) bekommen in ihrem Objektliteral die zwei neuen Felder, sonst schlägt `tsc` fehl:
- `"haelt fest, was eine Region geliefert hat"`: `massstab: "gemeldete_treffer", referenzMenge: 2719`
- `"protokolliert eine abgebrochene Region als unvollstaendig"`: `massstab: "keiner", referenzMenge: null`

- [ ] **Step 2: Den Test laufen lassen und rot sehen**

Run: `cd scraper && npx vitest run lib/bestandDb.test.ts`
Expected: FAIL — `expected undefined to be "hochwassermarke"` beim neuen Durchlassfall, weil `regionsLaufZeile` die Felder noch nicht schreibt.

- [ ] **Step 3: `RegionLauf` erweitern**

In `scraper/lib/bestand.ts` den Import ergänzen und das Interface erweitern:

```ts
import type { MassstabArt } from "./regionsMassstab.js";

export interface RegionLauf {
  /** Bundeslandkuerzel, z. B. "he". */
  partition: string;
  gesehene: number;
  gemeldeteTreffer: number | null;
  vollstaendig: boolean;
  /** WORAN `vollstaendig` gemessen wurde. "keiner" heisst: gar nicht. */
  massstab: MassstabArt;
  /** Die Menge, gegen die geurteilt wurde; null bei massstab "keiner". */
  referenzMenge: number | null;
}
```

- [ ] **Step 4: Die Sperre ersetzen**

In `scraper/lib/bestandDb.ts`, `regionsLaufZeile`. Der Kommentarblock ab „FAIL-CLOSED AN DER SCHREIBSTELLE" wird ersetzt — nicht gelöscht:

```ts
export function regionsLaufZeile(source: string, lauf: RegionLauf): Record<string, unknown> {
  return {
    source,
    partition: lauf.partition,
    gesehene_objekte: lauf.gesehene,
    gemeldete_treffer: lauf.gemeldeteTreffer,
    // FAIL-CLOSED AN DER SCHREIBSTELLE, nicht nur beim Rechnen: `vollstaendig`
    // ist die Wache vor der Massenloeschung und darf nie ohne Massstab
    // dastehen.
    //
    // Bis zum 2026-09-21 stand hier `gemeldeteTreffer === null -> false`. Das
    // war ein STELLVERTRETER fuer "ohne Massstab" und blieb richtig, solange
    // es nur einen Massstab gab. Seit A16 gibt es einen zweiten -- die
    // Hochwassermarke der eigenen Historie --, und genau die vier Regionen,
    // fuer die er gebaut wurde (`nw`, `bw`, `mv`, `sh`), nennen ihre
    // Trefferzahl nie. Der Stellvertreter wuerde sie weiterhin sperren.
    //
    // Die Regel selbst ist unveraendert und wird jetzt an der Sache geprueft.
    // Der Beleg steht in derselben Zeile: `massstab` und `referenz_menge`.
    // Die acht Altzeilen vom 2026-09-08 tragen dort `null` und bleiben
    // dadurch als das erkennbar, was sie sind -- Zeilen ohne Massstab.
    vollstaendig: lauf.massstab === "keiner" ? false : lauf.vollstaendig,
    massstab: lauf.massstab,
    referenz_menge: lauf.referenzMenge,
  };
}
```

- [ ] **Step 5: Den Test laufen lassen und grün sehen**

Run: `cd scraper && npx vitest run lib/bestandDb.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scraper/lib/bestand.ts scraper/lib/bestandDb.ts scraper/lib/bestandDb.test.ts
git commit -m "feat(scraper): die Schreibsperre haengt am Massstab statt an der Trefferzahl"
```

---

### Task 5: Das Urteil im Scraper

**Files:**
- Modify: `scraper/scrapers/immowelt/index.ts:186-201` (`istRegionVollstaendig`), neue Funktion `baueRegionLauf` daneben
- Test: `scraper/scrapers/immowelt/index.test.ts:29-95`

**Interfaces:**
- Consumes: `waehleMassstab`, `urteileGegenMassstab`, `MassstabRegeln` aus Task 2; `RegionLauf` aus Task 4
- Produces:
  - `const IMMOWELT_MASSSTAB_REGELN: MassstabRegeln`
  - `function istRegionVollstaendig(gesammelt: number, gemeldet: number | null, abgeschnitten: boolean, hochwassermarke: number | null): boolean`
  - `function baueRegionLauf(code: string, gesammelt: number, gemeldet: number | null, abgeschnitten: boolean, hochwassermarke: number | null): RegionLauf`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

In `scraper/scrapers/immowelt/index.test.ts`. Alle vorhandenen Aufrufe von `istRegionVollstaendig` bekommen `null` als viertes Argument — das ist der Zustand „keine Marke" und erhält exakt das bisherige Verhalten. Dazu neu:

```ts
describe("baueRegionLauf", () => {
  it("misst gegen die Marke, wenn das Portal keine Trefferzahl nennt", () => {
    // `nw`: 42 Zeilen Historie, nie eine Trefferzahl, Marke 6995.
    const lauf = baueRegionLauf("nw", 6795, null, false, 6995);
    expect(lauf).toEqual({
      partition: "nw",
      gesehene: 6795,
      gemeldeteTreffer: null,
      vollstaendig: true,
      massstab: "hochwassermarke",
      referenzMenge: 6995,
    });
  });

  it("erklaert einen flachen Lauf fuer unvollstaendig -- mit Beleg", () => {
    // Der Fall, den A16 abfangen muss. Wichtig ist nicht nur das `false`,
    // sondern dass der Massstab mitgeschrieben wird: Ohne ihn saehe die
    // Zeile aus wie eine ungemessene.
    const lauf = baueRegionLauf("nw", 40, null, false, 6995);
    expect(lauf.vollstaendig).toBe(false);
    expect(lauf.massstab).toBe("hochwassermarke");
    expect(lauf.referenzMenge).toBe(6995);
  });

  it("hat ohne Trefferzahl und ohne Marke keinen Massstab", () => {
    const lauf = baueRegionLauf("nw", 6795, null, false, null);
    expect(lauf.vollstaendig).toBe(false);
    expect(lauf.massstab).toBe("keiner");
    expect(lauf.referenzMenge).toBeNull();
  });

  it("nimmt die gemeldete Trefferzahl, wo es sie gibt", () => {
    const lauf = baueRegionLauf("he", 2719, 2719, false, 2800);
    expect(lauf.massstab).toBe("gemeldete_treffer");
    expect(lauf.referenzMenge).toBe(2719);
    expect(lauf.vollstaendig).toBe(true);
  });

  it("gilt am Seitendeckel nie als vollstaendig, behaelt aber den Massstab", () => {
    const lauf = baueRegionLauf("nw", 6995, null, true, 6995);
    expect(lauf.vollstaendig).toBe(false);
    expect(lauf.massstab).toBe("hochwassermarke");
  });
});

describe("istRegionVollstaendig mit Marke", () => {
  it("laesst eine Region ohne Trefferzahl gelten, wenn sie ihre Marke erreicht", () => {
    expect(istRegionVollstaendig(6795, null, false, 6995)).toBe(true);
  });

  it("bleibt ohne Marke beim alten Verhalten", () => {
    // Fail-closed seit 2026-09-09. Das viertes Argument `null` ist genau der
    // Zustand, in dem der Code bis zum 2026-09-21 immer war.
    expect(istRegionVollstaendig(6795, null, false, null)).toBe(false);
  });

  it("verwirft eine Marke von hoechstens einer Ergebnisseite", () => {
    expect(istRegionVollstaendig(40, null, false, 41)).toBe(false);
  });
});
```

- [ ] **Step 2: Den Test laufen lassen und rot sehen**

Run: `cd scraper && npx vitest run scrapers/immowelt/index.test.ts`
Expected: FAIL — `baueRegionLauf is not exported` und beim vierten Argument ein Typfehler.

- [ ] **Step 3: Den Scraper umstellen**

In `scraper/scrapers/immowelt/index.ts`. Importe ergänzen:

```ts
import {
  waehleMassstab,
  urteileGegenMassstab,
  type MassstabRegeln,
} from "../../lib/regionsMassstab.js";
```

Neben `REGION_FEHLBETRAG_TOLERANZ` und `EINE_ERGEBNISSEITE`:

```ts
/**
 * Woran Immowelt-Regionen gemessen werden. An EINER Stelle, damit die
 * Urteilsfunktion und die Zeilenbildung nie auseinanderlaufen koennen.
 */
export const IMMOWELT_MASSSTAB_REGELN: MassstabRegeln = {
  // Eine Marke von hoechstens einer Ergebnisseite ist der Abdruck des
  // Ausfalls, nicht sein Massstab.
  untergrenze: EINE_ERGEBNISSEITE,
  toleranzGemeldet: REGION_FEHLBETRAG_TOLERANZ,
  // Enger als die 0,25 der Quelle, weil eine einzelne Region viel stabiler
  // ist: `nw` steht bei 6823, 6895, 6965. 0,1 ist der engste Wert, der in der
  // Messung vom 2026-09-21 fehlerfrei blieb (0,05 erzeugte zwei Fehlalarme).
  toleranzMarke: 0.1,
};
```

`istRegionVollstaendig` wird zur Fassade über die beiden reinen Funktionen. Der vorhandene lange Kommentarblock darüber bleibt stehen; nur der Absatz zu `gemeldet === null` bekommt einen Nachtrag:

```ts
export function istRegionVollstaendig(
  gesammelt: number,
  gemeldet: number | null,
  abgeschnitten: boolean,
  /**
   * Die groesste Menge, die diese Region je geliefert hat. Verpflichtend und
   * ohne Vorgabewert, aus demselben Grund wie `abgeschnitten`: Ein stilles
   * `null` waere die Sorte Vorgabe, die einen unbekannten Zustand als "in
   * Ordnung" liest. `null` heisst hier ausdruecklich "keine Marke bekannt"
   * und fuehrt fail-closed zum alten Verhalten.
   */
  hochwassermarke: number | null
): boolean {
  return urteileGegenMassstab(
    gesammelt,
    waehleMassstab(gemeldet, hochwassermarke, IMMOWELT_MASSSTAB_REGELN),
    abgeschnitten
  );
}

/**
 * Die fertige Protokollzeile einer Region.
 *
 * EIGENE FUNKTION, UND ZWAR WEGEN DES AUFRUFORTS: Die Falle vom 2026-09-21
 * war, dass Unit-Tests die Funktion pruefen und nicht die Stelle, an der sie
 * aufgerufen wird. Die Zusammensetzung aus Urteil, Massstab und Referenzmenge
 * lag bis dahin mitten in der Blaetterschleife von `sweepImmowelt` und war
 * nur mit einem Browser zu erreichen. Hier ist sie rein und unter Test.
 *
 * Der Massstab wird GENAU EINMAL gewaehlt und sowohl fuer das Urteil als auch
 * fuer die Zeile benutzt. Zweimal waehlen hiesse, dass Urteil und Beleg
 * auseinanderlaufen koennen.
 */
export function baueRegionLauf(
  code: string,
  gesammelt: number,
  gemeldet: number | null,
  abgeschnitten: boolean,
  hochwassermarke: number | null
): RegionLauf {
  const massstab = waehleMassstab(gemeldet, hochwassermarke, IMMOWELT_MASSSTAB_REGELN);
  return {
    partition: code,
    gesehene: gesammelt,
    gemeldeteTreffer: gemeldet,
    vollstaendig: urteileGegenMassstab(gesammelt, massstab, abgeschnitten),
    massstab: massstab.art,
    referenzMenge: massstab.referenz,
  };
}
```

- [ ] **Step 4: Den Test laufen lassen und grün sehen**

Run: `cd scraper && npx vitest run scrapers/immowelt/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scraper/scrapers/immowelt/index.ts scraper/scrapers/immowelt/index.test.ts
git commit -m "feat(immowelt): das Urteil kennt die Hochwassermarke, die Zeile den Beleg"
```

---

### Task 6: Die Verdrahtung

Ohne diesen Schritt ist alles Vorherige totes Gewicht: `sweepImmowelt` baut seine Zeilen noch von Hand.

**Files:**
- Modify: `scraper/scrapers/immowelt/index.ts:539-546` (Signatur), `:625-651` (Blätterschleife)
- Modify: `scraper/main.ts:570-572`
- Test: `scraper/scrapers/immowelt/index.test.ts`

**Interfaces:**
- Consumes: `baueRegionLauf` aus Task 5, `ladeHochwassermarken` aus Task 3
- Produces: `sweepImmowelt(letzteRegionsSweeps, hochwassermarken)` — zweiter Parameter `Map<string, number> | null`, Vorgabe `null`

- [ ] **Step 1: Die Signatur und die Schleife umstellen**

In `scraper/scrapers/immowelt/index.ts`, Signatur von `sweepImmowelt`:

```ts
export async function sweepImmowelt(
  /**
   * Wann jede Region zuletzt gesweept wurde, aus `sweep_region_runs`. Bestimmt
   * den Startpunkt der Rotation (`sweepStartVersatz`). `null` heisst "Historie
   * nicht lesbar" und faellt auf die Uhr zurueck; eine leere Map heisst "noch
   * nie gesweept" und startet an der ersten Region.
   */
  letzteRegionsSweeps: Map<string, number> | null = null,
  /**
   * Die groesste je gesehene Menge je Region -- der zweite
   * Vollstaendigkeitsmassstab fuer `nw`, `bw`, `mv` und `sh`, die ihre
   * Trefferzahl nie nennen. `null` heisst "nicht lesbar" und fuehrt
   * fail-closed dazu, dass diese Regionen unvollstaendig bleiben.
   */
  hochwassermarken: Map<string, number> | null = null
): Promise<{
```

Im `try`-Zweig der Blätterschleife ersetzt der Aufruf von `baueRegionLauf` die beiden bisherigen Anweisungen:

```ts
        const lauf = baueRegionLauf(
          region.code,
          gesammelt,
          gemeldet,
          abgeschnitten,
          hochwassermarken?.get(region.code) ?? null
        );
        if (!lauf.vollstaendig) {
          console.warn(regionUnvollstaendigMeldung(region.code, gesammelt, gemeldet, titel));
        }
        ausgaenge.push({ art: "erfasst", gemeldet });
        regionLaeufe.push(lauf);
```

Im `catch`-Zweig bekommt die Zeile die zwei neuen Felder:

```ts
        regionLaeufe.push({
          partition: region.code,
          gesehene: 0,
          gemeldeteTreffer: null,
          vollstaendig: false,
          // Eine abgebrochene Region ist nicht beurteilbar. "keiner" ist hier
          // die Wahrheit und nicht nur ein Platzhalter: Es wurde an nichts
          // gemessen.
          massstab: "keiner",
          referenzMenge: null,
        });
```

- [ ] **Step 2: Den Test auf den Aufrufort schreiben**

Der Test darf keinen Browser brauchen. Er prüft, dass die Marke wirklich bis in die Zeile durchschlägt — mit genau den Werten, die `sweepImmowelt` durchreicht. In `scraper/scrapers/immowelt/index.test.ts`:

```ts
describe("die Marke erreicht den Aufrufort", () => {
  it("reicht die Marke der richtigen Region durch", () => {
    // Die Falle vom 2026-09-21: Unit-Tests pruefen die Funktion, nicht den
    // Aufrufort. `sweepImmowelt` selbst braucht einen Browser; nachgebildet
    // wird deshalb GENAU der Ausdruck aus der Blaetterschleife --
    // `hochwassermarken?.get(region.code) ?? null`. Waere dort der falsche
    // Schluessel eingesetzt, faellt es hier auf.
    const marken = new Map([
      ["nw", 6995],
      ["bw", 4920],
    ]);
    const lauf = baueRegionLauf("nw", 6795, null, false, marken.get("nw") ?? null);
    expect(lauf.referenzMenge).toBe(6995);
    expect(lauf.vollstaendig).toBe(true);

    // Eine Region, fuer die keine Marke vorliegt, faellt fail-closed durch.
    const ohne = baueRegionLauf("mv", 619, null, false, marken.get("mv") ?? null);
    expect(ohne.massstab).toBe("keiner");
    expect(ohne.vollstaendig).toBe(false);
  });

  it("nimmt eine fehlende Markenkarte als 'keine Marke', nicht als Fehler", () => {
    const lauf = baueRegionLauf("nw", 6795, null, false, null);
    expect(lauf.massstab).toBe("keiner");
  });
});
```

- [ ] **Step 3: `main.ts` verdrahten**

In `scraper/main.ts` bei Zeile 570 den Import und die zwei Zeilen ergänzen:

```ts
  const letzteRegionsSweeps = await ladeLetzteRegionsSweeps(sb, "immowelt");
  // Der zweite Vollstaendigkeitsmassstab (A16). Eigene Abfrage, sortiert nach
  // Menge statt nach Zeit -- ein Zeitfenster waere als Massstab durchgefallen.
  const hochwassermarken = await ladeHochwassermarken(sb, "immowelt");

  const immowelt = await sweepImmowelt(letzteRegionsSweeps, hochwassermarken);
```

`ladeHochwassermarken` zur Importliste aus `./lib/bestandDb.js` hinzufügen.

- [ ] **Step 4: Alles laufen lassen**

Run: `cd scraper && npx tsc --noEmit && npx vitest run`
Expected: `tsc` ohne Ausgabe, alle Tests grün (567 plus die neuen).

Schlägt `tsc` an anderen Stellen fehl, sind es Aufrufer von `istRegionVollstaendig` oder Objektliterale vom Typ `RegionLauf`, die die neuen Felder noch nicht tragen. Beide sind Pflichtfelder — das ist Absicht.

- [ ] **Step 5: Commit**

```bash
git add scraper/scrapers/immowelt/index.ts scraper/scrapers/immowelt/index.test.ts scraper/main.ts
git commit -m "feat(immowelt): die Marke wird geladen und erreicht die Regionszeile"
```

---

### Task 7: Backlog, Doku und der Produktionsbeleg

**Files:**
- Modify: `docs/superpowers/BACKLOG.md` (A16, A15 Schritt 3)
- Modify: `docs/superpowers/UEBERGABE.md` (neuer Abschnitt oben)

**Interfaces:**
- Consumes: alles Vorherige
- Produces: nichts im Code

- [ ] **Step 1: A16 im Backlog abschließen**

Unter `## A16.` einen Abschnitt einfügen, der den widerlegten Vorschlag **stehen lässt** und die Messung danebenstellt:

```markdown
**ERLEDIGT am 2026-09-21 — aber NICHT so, wie oben entworfen.** Der hier
vorgeschlagene gleitende Median der eigenen Region ist gemessen und
widerlegt: Er erzeugt 203 von 323 falschen Freigaben, weil 24 % der Laeufe
flach sind und der Median mit dem Ausfall mitsinkt. Gebaut wurde stattdessen
die Hochwassermarke ueber die ganze Historie mit 10 % Toleranz — auf
demselben Prueffeld fehlerfrei. Entwurf, Messung und Zahlen:
`specs/2026-09-21-a16-zweiter-vollstaendigkeitsmassstab-design.md`,
Skript `scraper/scripts/messung-a16-massstaebe.mts`.

Die vier oben gestellten Entwurfsfragen sind damit beantwortet: Die Historie
braucht keine Mindestzahl an Laeufen, sondern eine Marke ueber einer
Ergebnisseite (45). Die Toleranz ist 10 % und nicht 25 %. Der allererste Lauf
hat keine Marke und gilt fail-closed als unvollstaendig. Eine mit
`abgeschnitten=true` beendete Region gilt nie als vollstaendig.

**Offen geblieben, als Messauftrag und nicht als Vermutung:** Die Marke
altert nicht. Schrumpft Immowelts Bestand echt, blockiert sie die Region
dauerhaft — fail-closed, also sicher, aber nutzlos. Zu beobachten, ob eine
Region ueber mehrere TIEFE Laeufe unter ihrer Marke bleibt.
```

Bei A15 Schritt 3 den Haken setzen: `- [x] **Schritt 3 — erledigt ueber A16.**`

- [ ] **Step 2: Übergabe schreiben**

Oben in `docs/superpowers/UEBERGABE.md` ein neuer Abschnitt mit: was gebaut wurde, die Zahlen der Messung, und — wichtig — die **Erwartung an den ersten Produktionslauf**:

```markdown
## ZUERST LESEN: der erste Lauf mit dem zweiten Massstab

Erwartet wird **nicht**, dass `nw`, `bw`, `mv` oder `sh` jetzt vollstaendig
sind. Solange Immowelt flach liefert, reissen 40 Karten jede Marke (`nw`
6995, `bw` 4920, `sh` 1316, `mv` 662). Dass keine neue vollstaendige Region
erscheint, ist der Beweis, dass der Massstab wirkt — nicht, dass er fehlt.

Was der Lauf belegen muss, ist der BELEG in der Zeile:

    cd scraper && npx tsx -e "import {sb} from './lib/supabase.js'; \
      const {data}=await sb.from('sweep_region_runs') \
      .select('partition,gesehene_objekte,massstab,referenz_menge,vollstaendig') \
      .eq('source','immowelt').order('started_at',{ascending:false}).limit(16); \
      console.table(data);"

Erwartet: `massstab = 'hochwassermarke'` mit gefuellter `referenz_menge` fuer
`nw`, `bw`, `mv`, `sh`; `massstab = 'gemeldete_treffer'` fuer die uebrigen
zwoelf. Steht irgendwo `keiner`, ist die Marke nicht geladen worden.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/BACKLOG.md docs/superpowers/UEBERGABE.md
git commit -m "docs: A16 ist erledigt -- mit dem Massstab, den die Messung uebrig gelassen hat"
```

- [ ] **Step 4: Mergen und pushen**

```bash
git checkout main
git merge --no-ff a16-zweiter-vollstaendigkeitsmassstab -m "merge: A16 -- zweiter Vollstaendigkeitsmassstab fuer Regionen ohne Trefferzahl"
git push
```

- [ ] **Step 5: Den Produktionslauf anstoßen und den Beleg prüfen**

```bash
gh workflow run scrape.yml
```

Danach die Abfrage aus Step 2 laufen lassen. Erwartet ist die Tabelle von
oben. **Kein grünes Häkchen, bevor sie da ist** — der Lauf ist der einzige
Beweis, dass die Spalten wirklich ankommen; `speichereRegionsLaeufe` fängt
Insert-Fehler nur mit `console.warn` ab, ein Fehler dort ist im Actions-Log
leicht zu übersehen. Darum auch:

```bash
gh run view <ID> --log | grep -i "sweep_region_runs"
```

Erwartet: **keine Zeile**. Steht dort „nicht geschrieben", hat die Migration
aus Task 1 nicht gegriffen.
