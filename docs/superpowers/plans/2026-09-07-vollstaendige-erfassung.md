# Vollständige Erfassung & Bestandsführung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Bestand in der Datenbank entspricht dem echten Marktangebot — was verkauft, versteigert oder zurückgezogen wurde, verschwindet auch aus der Datenbank — und eine einmal fällige Telegram-Meldung geht nicht mehr verloren.

**Architecture:** Jeder Quellen-Lauf zerfällt in einen billigen, vollständigen **Sweep** (nur Ergebnislisten, liefert die Ist-Menge aller `externalId`s) und eine selektive **Detailerfassung** (nur neue und veraltete Objekte). Ein Abdeckungsprotokoll plus eine Mengenplausibilitäts-Prüfung entscheiden, ob auf Abwesenheit hin gelöscht werden darf. Die Meldeentscheidung wandert vom Versions-Diff auf die `notifications`-Tabelle: gesendet wird, wenn die Meldeklasse eines Objekts steigt, und die Protokollzeile entsteht erst nach bestätigtem Versand.

**Tech Stack:** TypeScript (ESM, `strict: true`), `tsx`, `vitest`, `cheerio` (HTML-Parsing), `playwright` (jetzt für **beide** Quellen), `@supabase/supabase-js`. GitHub Actions Cron (bestehender Workflow).

**Spec:** `docs/superpowers/specs/2026-09-07-vollstaendige-erfassung-design.md`

## Global Constraints

- TypeScript strict mode, ESM-Imports mit `.js`-Endung (Node-ESM-Konvention, wie im bestehenden Code).
- Keine neuen Abhängigkeiten. `playwright` ist bereits installiert.
- Deutsche Bezeichner für Domänenlogik-Funktionen (Konvention aus `metrics.ts`/`rentEstimate.ts`/`pipeline.ts`), englische/technische Namen für generische Interfaces (Konvention aus `ImmoweltDetailData`, `ZvgListSummary`).
- **Hinzufügen läuft immer.** Neue Inserate werden unabhängig von jeder Plausibilitätsprüfung aufgenommen. Gebremst wird ausschließlich das Löschen, weil nur dort ein Fehler Daten vernichtet.
- Karenz vor der harten Löschung: **2 Tage**.
- Toleranz im Historienvergleich: **25 %** gegen den **Median der letzten zehn** erfolgreichen Läufe.
- Die Historienprüfung greift erst ab **drei** Referenzläufen. Vorher findet überhaupt keine Löschung statt.
- Detailseiten werden neu geholt für unbekannte `externalId`s und für bekannte, deren letzte Detailerfassung älter als **7 Tage** ist.
- Gedrosselte Anfragen: mindestens 1000 ms zwischen Seitenabrufen, wie bisher.
- Die robots.txt-Vorgabe für Immowelt (`/classified-search*`, `/liste/getlistitems`, `/classifiedList/`) ist mit dieser Spec **bewusst gestrichen** — siehe Spec, Abschnitt „Abgewogene Risiken".
- `MIN_EINHEITEN = 3` bleibt unverändert die einzige Mindestgrenze.

---

### Task 1: Spike — Immowelt-Objekttypfilter und Mengengerüst

**Wegwerf-Untersuchung.** Ihr Ergebnis entscheidet über Task 10. Der hier geschriebene Code wird **nicht** behalten.

Hintergrund: Die bundesweite Haus-Suche weist im Seitentitel „220.480 Angebote" aus (im Fixture `scraper/test/fixtures/immowelt-suche-haus.html` nachlesbar). Ein vollständiger Sweep darüber ist ausgeschlossen. Nur wenn sich in der Oberfläche auf Mehrfamilienhäuser filtern lässt und die Restmenge handhabbar ist, kann Immowelt an der Abgangserkennung teilnehmen.

**Files:**
- Create (temporär): `scraper/scripts/spike-immowelt.mts`

**Interfaces:**
- Produces: keinen Code für spätere Tasks — nur eine Entscheidung, die in Task 10 einfließt.

- [ ] **Step 1: Spike-Skript schreiben**

`scraper/scripts/spike-immowelt.mts`:

```ts
import { chromium } from "playwright";

const SEARCH_URL = "https://www.immowelt.de/suche/kaufen/haus/deutschland/ad02de1";

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded" });

  console.log("Titel:", await page.title());

  // 1. Gibt es einen Objekttyp-/Haustyp-Filter in der Oberflaeche?
  const filterKandidaten = await page.evaluate(() => {
    const treffer: string[] = [];
    document.querySelectorAll("button, [role='button'], select, label").forEach((el) => {
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (/haustyp|objekttyp|immobilientyp|mehrfamilien|filter/i.test(text) && text.length < 120) {
        treffer.push(`${el.tagName}: ${text}`);
      }
    });
    return [...new Set(treffer)].slice(0, 40);
  });
  console.log("Filter-Kandidaten:\n" + filterKandidaten.join("\n"));

  // 2. Wie viele Ergebnisseiten gibt es, und wie sieht die Blaetter-Steuerung aus?
  const pagination = await page.evaluate(() => {
    const treffer: string[] = [];
    document.querySelectorAll("a, button").forEach((el) => {
      const label = el.getAttribute("aria-label") ?? "";
      const text = (el.textContent ?? "").trim();
      if (/seite|weiter|n(ä|ae)chste|page/i.test(label + " " + text) && text.length < 40) {
        treffer.push(`${el.tagName} aria-label="${label}" text="${text}"`);
      }
    });
    return [...new Set(treffer)].slice(0, 30);
  });
  console.log("Pagination:\n" + pagination.join("\n"));

  console.log(
    "\nJETZT MANUELL im geoeffneten Browser: Filter auf Mehrfamilienhaus setzen,\n" +
      "dann Titel und Trefferzahl unten ablesen. 60 s Zeit."
  );
  await page.waitForTimeout(60_000);
  console.log("Titel nach Filter:", await page.title());
  console.log("URL nach Filter:", page.url());

  await browser.close();
}

main();
```

- [ ] **Step 2: Spike ausführen**

Run: `cd C:\immo-radar\scraper && npx tsx scripts/spike-immowelt.mts`

Im geöffneten Browser den Filter auf „Mehrfamilienhaus" setzen. Danach aus der Konsolenausgabe notieren:

1. Lässt sich der Objekttyp filtern? (ja/nein)
2. Welche URL entsteht dabei? (lässt sich der Filter direkt als URL ansteuern?)
3. Wie viele Angebote weist die gefilterte Seite aus?
4. Wie funktioniert das Blättern (Button-Selektor, URL-Parameter)?

- [ ] **Step 3: Entscheidung festhalten**

**Entscheidungsregel:**

- Gefilterte Menge **≤ 5000 Angebote** (≈125 Seiten à 40, bei 1 s Drosselung ~2–3 min) → Immowelt bekommt einen vollständigen Sweep und nimmt an der Abgangserkennung teil. Task 10 wird in **Variante A** umgesetzt.
- Gefilterte Menge **> 5000** oder **kein Objekttyp-Filter vorhanden** → Immowelt kann keine vollständige Menge liefern. Task 10 wird in **Variante B** umgesetzt: Immowelt liefert weiterhin Kandidaten, meldet aber dauerhaft `vollstaendig: false` und ist damit von jeder Löschung ausgeschlossen. Nur ZVG löscht.

Das Ergebnis samt Zahlen in die Spec eintragen, ans Ende des Abschnitts „Abgewogene Risiken" unter der Überschrift `### Spike-Ergebnis 2026-09-07`.

- [ ] **Step 4: Spike-Skript löschen und Ergebnis committen**

```bash
cd C:\immo-radar
rm scraper/scripts/spike-immowelt.mts
git add docs/superpowers/specs/2026-09-07-vollstaendige-erfassung-design.md
git commit -m "docs: Spike-Ergebnis Immowelt-Objekttypfilter"
```

---

### Task 2: Schema-Migration

**Files:**
- Modify: `schema.sql`

**Interfaces:**
- Produces: Spalte `listings.disappeared_at`, Spalte `listings.last_detail_at`, Tabelle `sweep_runs`, zwei neue Indizes. Tasks 6, 7 und 12 setzen sie voraus.

**Hinweis zu `last_detail_at`:** Die Spec formuliert die Auffrischungsregel als „jüngste `listing_version` älter als 7 Tage". Umgesetzt wird sie über eine Spalte auf `listings`, die bei jeder Detailerfassung gesetzt wird — inhaltlich dasselbe, aber ohne Gruppierungs-Abfrage über `listing_versions`, die der Supabase-JS-Client nicht ausdrücken kann.

- [ ] **Step 1: `schema.sql` aktualisieren**

In `schema.sql` die `create table listings (...)`-Definition ersetzen (Zeile 3–12) — `is_active` entfällt, zwei Spalten kommen dazu:

```sql
create table listings (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  url text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  -- Zeitpunkt, ab dem das Objekt im vollstaendigen Sweep fehlte. Nach Ablauf
  -- der Karenz wird die Zeile hart geloescht. null = regulaer im Angebot.
  disappeared_at timestamptz,
  -- Letzte Detailerfassung. Steuert, wann die Detailseite neu geholt wird.
  last_detail_at timestamptz,
  unique (source, external_id)
);
```

Direkt nach dem `create index listing_versions_listing_id_idx ...` (bisher Zeile 40) ergänzen:

```sql
create index listings_disappeared_at_idx on listings (disappeared_at)
  where disappeared_at is not null;

-- Postgres legt fuer Fremdschluessel keinen Index an; hoechsteGemeldeteKlasse
-- fragt notifications einmal je Kandidat ab.
create index notifications_listing_id_idx on notifications (listing_id);

-- Referenz fuer die Mengenplausibilitaet. Ohne Historie keine Loeschung.
create table sweep_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  started_at timestamptz not null default now(),
  -- Was das Portal als Trefferzahl ausweist; null, wenn es keine nennt
  -- (zvg-portal.de nennt keine).
  gemeldete_treffer integer,
  -- Was der Sweep tatsaechlich eingesammelt hat.
  gesehene_objekte integer not null,
  vollstaendig boolean not null,
  geltungsbereich text[] not null default '{}'
);

create index sweep_runs_source_idx on sweep_runs (source, started_at desc);
```

Ganz am Ende, zu den bestehenden `enable row level security`-Zeilen:

```sql
alter table sweep_runs enable row level security;
```

- [ ] **Step 2: Migration gegen die LIVE-Datenbank ausführen**

Im Supabase-Dashboard des immo-radar-Projekts: SQL Editor → ausführen (die Live-Tabellen existieren schon, `create table listings` würde fehlschlagen):

```sql
alter table listings drop column is_active;
alter table listings add column disappeared_at timestamptz;
alter table listings add column last_detail_at timestamptz;

create index listings_disappeared_at_idx on listings (disappeared_at)
  where disappeared_at is not null;
create index notifications_listing_id_idx on notifications (listing_id);

create table sweep_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  started_at timestamptz not null default now(),
  gemeldete_treffer integer,
  gesehene_objekte integer not null,
  vollstaendig boolean not null,
  geltungsbereich text[] not null default '{}'
);

create index sweep_runs_source_idx on sweep_runs (source, started_at desc);
alter table sweep_runs enable row level security;
```

Erwartet: keine Fehler. Im Table Editor ist `sweep_runs` sichtbar, `listings` hat `disappeared_at` und `last_detail_at`, `is_active` ist weg.

- [ ] **Step 3: Commit**

```bash
cd C:\immo-radar
git add schema.sql
git commit -m "feat(db): disappeared_at, last_detail_at und sweep_runs fuer die Bestandsfuehrung"
```

---

### Task 3: `lib/meldung.ts` — Meldeklassen und Rangfolge

**Files:**
- Create: `scraper/lib/meldung.ts`
- Test: `scraper/lib/meldung.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `type Meldeklasse = "keine" | "pruefkandidat" | "top_treffer"`, `bestimmeMeldeklasse(eingabe: MeldeklassenEingabe): Meldeklasse`, `istHoeher(a: Meldeklasse, b: Meldeklasse): boolean`, `hoechsteKlasse(klassen: string[]): Meldeklasse`. Wird von Task 7 (`db.ts`), Task 8 (`telegram.ts`) und Task 11 (`pipeline.ts`) konsumiert.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`scraper/lib/meldung.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { bestimmeMeldeklasse, istHoeher, hoechsteKlasse } from "./meldung.js";

const JETZT = new Date("2026-09-07T12:00:00.000Z");

describe("bestimmeMeldeklasse", () => {
  it("liefert top_treffer bei erfuellten Schwellen und belegter Miete", () => {
    expect(
      bestimmeMeldeklasse({
        erfuelltSchwellen: true,
        mietQuelle: "angegeben",
        auctionAt: null,
        jetzt: JETZT,
      })
    ).toBe("top_treffer");
  });

  it("liefert pruefkandidat bei erfuellten Schwellen und regional geschaetzter Miete", () => {
    expect(
      bestimmeMeldeklasse({
        erfuelltSchwellen: true,
        mietQuelle: "geschaetzt_regional",
        auctionAt: null,
        jetzt: JETZT,
      })
    ).toBe("pruefkandidat");
  });

  it("liefert pruefkandidat bei bundesweit geschaetzter Miete", () => {
    expect(
      bestimmeMeldeklasse({
        erfuelltSchwellen: true,
        mietQuelle: "geschaetzt_bundesweit",
        auctionAt: null,
        jetzt: JETZT,
      })
    ).toBe("pruefkandidat");
  });

  it("liefert keine, wenn die Schwellen nicht erfuellt sind", () => {
    expect(
      bestimmeMeldeklasse({
        erfuelltSchwellen: false,
        mietQuelle: "angegeben",
        auctionAt: null,
        jetzt: JETZT,
      })
    ).toBe("keine");
  });

  it("liefert keine, wenn der Versteigerungstermin vorbei ist -- auch bei belegter Miete", () => {
    // Ein noch gelistetes ZVG-Objekt mit gestern gelaufenem Termin darf nicht
    // gemeldet werden. Ohne diese Pruefung wuerde die Verarbeitung melden,
    // bevor der Abgleich am Laufende das Objekt markiert.
    expect(
      bestimmeMeldeklasse({
        erfuelltSchwellen: true,
        mietQuelle: "angegeben",
        auctionAt: "2026-09-06T08:00:00.000Z",
        jetzt: JETZT,
      })
    ).toBe("keine");
  });

  it("meldet einen Termin in der Zukunft normal", () => {
    expect(
      bestimmeMeldeklasse({
        erfuelltSchwellen: true,
        mietQuelle: "angegeben",
        auctionAt: "2026-09-09T08:00:00.000Z",
        jetzt: JETZT,
      })
    ).toBe("top_treffer");
  });
});

describe("istHoeher", () => {
  it("erkennt einen Aufstieg von keine auf pruefkandidat", () => {
    expect(istHoeher("pruefkandidat", "keine")).toBe(true);
  });

  it("erkennt einen Aufstieg von pruefkandidat auf top_treffer", () => {
    expect(istHoeher("top_treffer", "pruefkandidat")).toBe(true);
  });

  it("erkennt Gleichstand NICHT als Aufstieg", () => {
    expect(istHoeher("top_treffer", "top_treffer")).toBe(false);
  });

  it("erkennt einen Abstieg NICHT als Aufstieg", () => {
    expect(istHoeher("pruefkandidat", "top_treffer")).toBe(false);
  });
});

describe("hoechsteKlasse", () => {
  it("liefert keine fuer eine leere Liste", () => {
    expect(hoechsteKlasse([])).toBe("keine");
  });

  it("liefert die hoechste vorkommende Klasse", () => {
    expect(hoechsteKlasse(["pruefkandidat", "top_treffer", "pruefkandidat"])).toBe("top_treffer");
  });

  it("ignoriert fremde kind-Werte wie preisaenderung", () => {
    expect(hoechsteKlasse(["preisaenderung", "verschwunden", "pruefkandidat"])).toBe("pruefkandidat");
  });

  it("liefert keine, wenn ausschliesslich fremde kind-Werte vorliegen", () => {
    expect(hoechsteKlasse(["preisaenderung"])).toBe("keine");
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd C:\immo-radar\scraper && npx vitest run lib/meldung.test.ts`
Expected: FAIL — `Cannot find module './meldung.js'`.

- [ ] **Step 3: `meldung.ts` implementieren**

`scraper/lib/meldung.ts`:

```ts
/**
 * Meldeklasse eines Objekts. Die Rangfolge entscheidet, ob eine erneute
 * Nachricht faellig ist: gesendet wird nur, wenn die Klasse STEIGT.
 */
export type Meldeklasse = "keine" | "pruefkandidat" | "top_treffer";

const RANG: Record<Meldeklasse, number> = {
  keine: 0,
  pruefkandidat: 1,
  top_treffer: 2,
};

/** Alle kind-Werte in notifications, die an der Rangfolge teilnehmen. */
const KLASSEN_KINDS: Meldeklasse[] = ["pruefkandidat", "top_treffer"];

export interface MeldeklassenEingabe {
  /** Ergebnis der reinen Schwellenpruefung aus metrics.ts (Feld topTreffer). */
  erfuelltSchwellen: boolean;
  /** MietQuelle aus rentEstimate.ts. Nur "angegeben" gilt als belegt. */
  mietQuelle: string;
  /** ISO-Zeitpunkt des Versteigerungstermins, null bei Nicht-ZVG-Quellen. */
  auctionAt: string | null;
  jetzt: Date;
}

/**
 * Bildet die Meldeklasse. Kennzahlen auf Basis einer GESCHAETZTEN Miete sind
 * rechnerisch eher ein verkappter Quadratmeterpreis-Vergleich als eine
 * Rendite -- deshalb landen sie in einer eigenen Klasse, statt still
 * unterdrueckt oder wie belegte Zahlen behandelt zu werden.
 */
export function bestimmeMeldeklasse(eingabe: MeldeklassenEingabe): Meldeklasse {
  if (!eingabe.erfuelltSchwellen) return "keine";

  // Ein bereits gelaufener Termin macht jede Meldung wertlos, unabhaengig
  // davon wie gut die Kennzahlen sind.
  if (eingabe.auctionAt !== null) {
    const termin = new Date(eingabe.auctionAt);
    if (Number.isFinite(termin.getTime()) && termin.getTime() < eingabe.jetzt.getTime()) {
      return "keine";
    }
  }

  return eingabe.mietQuelle === "angegeben" ? "top_treffer" : "pruefkandidat";
}

/** true, wenn `a` einen echten Aufstieg gegenueber `b` darstellt. */
export function istHoeher(a: Meldeklasse, b: Meldeklasse): boolean {
  return RANG[a] > RANG[b];
}

/**
 * Hoechste Klasse aus einer Liste roher `kind`-Werte aus notifications.
 * Fremde Werte (preisaenderung, verschwunden) nehmen an der Rangfolge nicht
 * teil und werden ignoriert.
 */
export function hoechsteKlasse(kinds: string[]): Meldeklasse {
  let hoechste: Meldeklasse = "keine";
  for (const kind of kinds) {
    const klasse = KLASSEN_KINDS.find((k) => k === kind);
    if (klasse !== undefined && istHoeher(klasse, hoechste)) hoechste = klasse;
  }
  return hoechste;
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `cd C:\immo-radar\scraper && npx vitest run lib/meldung.test.ts`
Expected: PASS, alle 14 Tests grün.

- [ ] **Step 5: Commit**

```bash
cd C:\immo-radar
git add scraper/lib/meldung.ts scraper/lib/meldung.test.ts
git commit -m "feat(scraper): Meldeklassen top_treffer/pruefkandidat mit Rangfolge"
```

---

### Task 4: `lib/bestand.ts` — Abgleichlogik ohne Datenbank

**Files:**
- Create: `scraper/lib/bestand.ts`
- Test: `scraper/lib/bestand.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `interface SweepErgebnis`, `interface BekanntesListing`, `partitionAusExternalId(source, externalId): string | null`, `ermittleAbgaenge(sweep, bekannte): BekanntesListing[]`, `ermittleRueckkehrer(sweep, bekannte): BekanntesListing[]`, `istKarenzAbgelaufen(disappearedAt, jetzt): boolean`, `waehleDetailKandidaten(gesehene, bekannte, veraltete): string[]`, `KARENZ_TAGE`. Wird von Task 6, 9, 10 und 12 konsumiert.

`waehleDetailKandidaten` liegt bewusst hier und nicht in einem Scraper-Modul: die Regel „neu oder veraltet" gilt für **beide** Quellen gleichermaßen.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`scraper/lib/bestand.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  partitionAusExternalId,
  ermittleAbgaenge,
  ermittleRueckkehrer,
  istKarenzAbgelaufen,
  waehleDetailKandidaten,
  type SweepErgebnis,
  type BekanntesListing,
} from "./bestand.js";

function sweep(overrides: Partial<SweepErgebnis> = {}): SweepErgebnis {
  return {
    source: "zvg-portal",
    vollstaendig: true,
    geltungsbereich: ["sn", "by"],
    gesehene: new Set<string>(),
    gemeldeteTreffer: null,
    ...overrides,
  };
}

function listing(externalId: string, disappearedAt: string | null = null): BekanntesListing {
  return { id: `id-${externalId}`, externalId, disappearedAt };
}

describe("partitionAusExternalId", () => {
  it("liest das Bundesland-Kuerzel aus einer ZVG-Id", () => {
    expect(partitionAusExternalId("zvg-portal", "sn-40908")).toBe("sn");
  });

  it("liefert null fuer eine Quelle ohne Partitionierung", () => {
    expect(partitionAusExternalId("immowelt", "e71353e6-4ef9-4162-8a4f-e680c3951de4")).toBeNull();
  });

  it("liefert null, wenn die ZVG-Id nicht dem Muster entspricht", () => {
    expect(partitionAusExternalId("zvg-portal", "40908")).toBeNull();
  });
});

describe("ermittleAbgaenge", () => {
  it("meldet ein Objekt als Abgang, das im vollstaendigen Sweep fehlt", () => {
    const abgaenge = ermittleAbgaenge(sweep({ gesehene: new Set(["sn-1"]) }), [
      listing("sn-1"),
      listing("sn-2"),
    ]);
    expect(abgaenge.map((l) => l.externalId)).toEqual(["sn-2"]);
  });

  it("meldet NICHTS, wenn der Sweep unvollstaendig war", () => {
    const abgaenge = ermittleAbgaenge(
      sweep({ vollstaendig: false, gesehene: new Set(["sn-1"]) }),
      [listing("sn-1"), listing("sn-2")]
    );
    expect(abgaenge).toEqual([]);
  });

  it("laesst Objekte ausserhalb des Geltungsbereichs unangetastet", () => {
    // th lief nicht durch, deshalb darf th-9 nicht als Abgang gelten.
    const abgaenge = ermittleAbgaenge(sweep({ gesehene: new Set(["sn-1"]) }), [
      listing("sn-1"),
      listing("sn-2"),
      listing("th-9"),
    ]);
    expect(abgaenge.map((l) => l.externalId)).toEqual(["sn-2"]);
  });

  it("meldet ein bereits markiertes Objekt nicht erneut", () => {
    const abgaenge = ermittleAbgaenge(sweep({ gesehene: new Set() }), [
      listing("sn-2", "2026-09-06T10:00:00.000Z"),
    ]);
    expect(abgaenge).toEqual([]);
  });

  it("prueft bei leerem Geltungsbereich alle Objekte (Quelle ohne Partitionierung)", () => {
    const abgaenge = ermittleAbgaenge(
      sweep({ source: "immowelt", geltungsbereich: [], gesehene: new Set(["a"]) }),
      [listing("a"), listing("b")]
    );
    expect(abgaenge.map((l) => l.externalId)).toEqual(["b"]);
  });
});

describe("ermittleRueckkehrer", () => {
  it("meldet ein markiertes Objekt, das wieder im Sweep auftaucht", () => {
    const zurueck = ermittleRueckkehrer(sweep({ gesehene: new Set(["sn-2"]) }), [
      listing("sn-2", "2026-09-06T10:00:00.000Z"),
    ]);
    expect(zurueck.map((l) => l.externalId)).toEqual(["sn-2"]);
  });

  it("meldet ein nicht markiertes Objekt nicht", () => {
    const zurueck = ermittleRueckkehrer(sweep({ gesehene: new Set(["sn-1"]) }), [listing("sn-1")]);
    expect(zurueck).toEqual([]);
  });

  it("meldet Rueckkehrer auch bei unvollstaendigem Sweep -- gesehen ist gesehen", () => {
    // Anders als beim Loeschen ist Zurueckholen ungefaehrlich: es vernichtet
    // keine Daten und darf deshalb auch aus einem Teillauf folgen.
    const zurueck = ermittleRueckkehrer(
      sweep({ vollstaendig: false, gesehene: new Set(["sn-2"]) }),
      [listing("sn-2", "2026-09-06T10:00:00.000Z")]
    );
    expect(zurueck.map((l) => l.externalId)).toEqual(["sn-2"]);
  });
});

describe("istKarenzAbgelaufen", () => {
  const jetzt = new Date("2026-09-07T12:00:00.000Z");

  it("ist nach mehr als 2 Tagen abgelaufen", () => {
    expect(istKarenzAbgelaufen("2026-09-05T11:00:00.000Z", jetzt)).toBe(true);
  });

  it("ist nach weniger als 2 Tagen nicht abgelaufen", () => {
    expect(istKarenzAbgelaufen("2026-09-06T12:00:00.000Z", jetzt)).toBe(false);
  });

  it("ist exakt auf der Grenze noch nicht abgelaufen", () => {
    expect(istKarenzAbgelaufen("2026-09-05T12:00:00.000Z", jetzt)).toBe(false);
  });
});

describe("waehleDetailKandidaten", () => {
  const gesehen = ["sn-1", "sn-2", "sn-3"];

  it("waehlt alle unbekannten Objekte aus", () => {
    expect(waehleDetailKandidaten(gesehen, new Set(), new Set())).toEqual(["sn-1", "sn-2", "sn-3"]);
  });

  it("ueberspringt bekannte Objekte mit frischer Detailerfassung", () => {
    expect(waehleDetailKandidaten(gesehen, new Set(["sn-1", "sn-2"]), new Set())).toEqual(["sn-3"]);
  });

  it("waehlt bekannte Objekte mit veralteter Detailerfassung wieder aus", () => {
    expect(
      waehleDetailKandidaten(gesehen, new Set(["sn-1", "sn-2", "sn-3"]), new Set(["sn-2"]))
    ).toEqual(["sn-2"]);
  });

  it("liefert nichts, wenn alles bekannt und frisch ist", () => {
    expect(waehleDetailKandidaten(gesehen, new Set(gesehen), new Set())).toEqual([]);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd C:\immo-radar\scraper && npx vitest run lib/bestand.test.ts`
Expected: FAIL — `Cannot find module './bestand.js'`.

- [ ] **Step 3: `bestand.ts` implementieren**

`scraper/lib/bestand.ts`:

```ts
/** Karenz zwischen Verschwinden und harter Loeschung. */
export const KARENZ_TAGE = 2;

const KARENZ_MS = KARENZ_TAGE * 24 * 60 * 60 * 1000;

/** ZVG-externalIds haben die Form "<bundesland>-<zvg_id>", z. B. "sn-40908". */
const ZVG_PARTITION_PATTERN = /^([a-z]{2})-\d+$/;

/**
 * Ergebnis eines Sweeps: die Ist-Menge einer Quelle in diesem Lauf, samt der
 * Information, WIE WEIT man ihr trauen darf.
 */
export interface SweepErgebnis {
  source: string;
  /** Lief der Sweep sauber durch? Nur dann darf ueberhaupt geloescht werden. */
  vollstaendig: boolean;
  /**
   * Partitionen, die sauber durchliefen (ZVG: Bundesland-Kuerzel).
   * Leer = die Quelle kennt keine Partitionierung, es gilt der ganze Bestand.
   */
  geltungsbereich: string[];
  /** Alle im Sweep gesehenen externalIds. */
  gesehene: Set<string>;
  /** Vom Portal ausgewiesene Trefferzahl; null, wenn es keine nennt. */
  gemeldeteTreffer: number | null;
}

export interface BekanntesListing {
  id: string;
  externalId: string;
  /** ISO-Zeitpunkt oder null, wenn das Objekt regulaer im Angebot ist. */
  disappearedAt: string | null;
}

/**
 * Partition eines Objekts, oder null wenn die Quelle nicht partitioniert ist.
 * Das Bundesland steckt bereits in der ZVG-externalId -- ein zusaetzlicher
 * Datenbank-Zugriff ist dafuer nicht noetig.
 */
export function partitionAusExternalId(source: string, externalId: string): string | null {
  if (source !== "zvg-portal") return null;
  const treffer = externalId.match(ZVG_PARTITION_PATTERN);
  return treffer === null ? null : treffer[1];
}

/** Liegt das Objekt in dem, was dieser Lauf tatsaechlich gesehen hat? */
function imGeltungsbereich(sweep: SweepErgebnis, listing: BekanntesListing): boolean {
  if (sweep.geltungsbereich.length === 0) return true;
  const partition = partitionAusExternalId(sweep.source, listing.externalId);
  if (partition === null) return true;
  return sweep.geltungsbereich.includes(partition);
}

/**
 * Objekte, die neu als verschwunden zu markieren sind: im Geltungsbereich
 * eines VOLLSTAENDIGEN Sweeps nicht mehr gesehen und noch nicht markiert.
 */
export function ermittleAbgaenge(
  sweep: SweepErgebnis,
  bekannte: BekanntesListing[]
): BekanntesListing[] {
  if (!sweep.vollstaendig) return [];
  return bekannte.filter(
    (listing) =>
      listing.disappearedAt === null &&
      imGeltungsbereich(sweep, listing) &&
      !sweep.gesehene.has(listing.externalId)
  );
}

/**
 * Bereits markierte Objekte, die wieder aufgetaucht sind. Anders als beim
 * Loeschen wird hier auch aus einem unvollstaendigen Sweep gefolgert: das
 * Zuruecknehmen einer Markierung vernichtet keine Daten.
 */
export function ermittleRueckkehrer(
  sweep: SweepErgebnis,
  bekannte: BekanntesListing[]
): BekanntesListing[] {
  return bekannte.filter(
    (listing) => listing.disappearedAt !== null && sweep.gesehene.has(listing.externalId)
  );
}

/** true, wenn die Karenz abgelaufen ist und hart geloescht werden darf. */
export function istKarenzAbgelaufen(disappearedAt: string, jetzt: Date): boolean {
  return jetzt.getTime() - new Date(disappearedAt).getTime() > KARENZ_MS;
}

/**
 * Welche Objekte brauchen eine Detailseite? Neue immer; bekannte nur, wenn
 * ihre letzte Detailerfassung zu lange her ist. Nach dem ersten vollen Lauf
 * ist diese Menge fast leer -- genau das macht den vollstaendigen Sweep
 * ueberhaupt bezahlbar. Gilt quellenunabhaengig fuer Immowelt wie ZVG.
 */
export function waehleDetailKandidaten(
  gesehene: string[],
  bekannte: Set<string>,
  veraltete: Set<string>
): string[] {
  return gesehene.filter((id) => !bekannte.has(id) || veraltete.has(id));
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `cd C:\immo-radar\scraper && npx vitest run lib/bestand.test.ts`
Expected: PASS, alle 18 Tests grün.

- [ ] **Step 5: Commit**

```bash
cd C:\immo-radar
git add scraper/lib/bestand.ts scraper/lib/bestand.test.ts
git commit -m "feat(scraper): Abgleichlogik fuer Abgaenge, Rueckkehrer und Karenz"
```

---

### Task 5: `lib/plausibilitaet.ts` — das Tor vor der Löschung

**Files:**
- Create: `scraper/lib/plausibilitaet.ts`
- Test: `scraper/lib/plausibilitaet.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `median(werte: number[]): number | null`, `pruefeMengenplausibilitaet(eingabe: PlausibilitaetsEingabe): PlausibilitaetsErgebnis`, `MIN_REFERENZLAEUFE`, `TOLERANZ_ANTEIL`, `HISTORIE_LAENGE`. Wird von Task 12 konsumiert.

**Namensabweichung zur Spec:** Die Spec nennt die Funktion `istMengePlausibel`. Hier heißt sie `pruefeMengenplausibilitaet`, weil sie nicht nur einen Wahrheitswert, sondern auch Grund und Erwartungswert für die Warnmeldung zurückgibt — ein `ist…`-Name wäre irreführend.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`scraper/lib/plausibilitaet.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { median, pruefeMengenplausibilitaet } from "./plausibilitaet.js";

describe("median", () => {
  it("liefert null fuer eine leere Liste", () => {
    expect(median([])).toBeNull();
  });

  it("liefert bei ungerader Anzahl den mittleren Wert", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("liefert bei gerader Anzahl das Mittel der beiden mittleren Werte", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("laesst die Eingabeliste unveraendert", () => {
    const werte = [5, 1, 3];
    median(werte);
    expect(werte).toEqual([5, 1, 3]);
  });
});

describe("pruefeMengenplausibilitaet", () => {
  const historieOk = [500, 510, 490, 505, 495];

  it("verbietet das Loeschen, wenn der Sweep unvollstaendig war", () => {
    const e = pruefeMengenplausibilitaet({
      gesehene: 500,
      gemeldeteTreffer: null,
      historie: historieOk,
      vollstaendig: false,
    });
    expect(e.loeschenErlaubt).toBe(false);
    expect(e.grund).toContain("unvollständig");
  });

  it("verbietet das Loeschen bei weniger als drei Referenzlaeufen", () => {
    const e = pruefeMengenplausibilitaet({
      gesehene: 500,
      gemeldeteTreffer: null,
      historie: [500, 510],
      vollstaendig: true,
    });
    expect(e.loeschenErlaubt).toBe(false);
    expect(e.grund).toContain("Referenzläufe");
  });

  it("erlaubt das Loeschen ab drei Referenzlaeufen bei stabiler Menge", () => {
    const e = pruefeMengenplausibilitaet({
      gesehene: 500,
      gemeldeteTreffer: null,
      historie: [500, 510, 490],
      vollstaendig: true,
    });
    expect(e.loeschenErlaubt).toBe(true);
    expect(e.grund).toBeNull();
  });

  it("erlaubt eine Abweichung knapp innerhalb der Toleranz", () => {
    // Median 500, -24 % = 380
    const e = pruefeMengenplausibilitaet({
      gesehene: 380,
      gemeldeteTreffer: null,
      historie: historieOk,
      vollstaendig: true,
    });
    expect(e.loeschenErlaubt).toBe(true);
  });

  it("verbietet eine Abweichung knapp ausserhalb der Toleranz nach unten", () => {
    // Median 500, -26 % = 370
    const e = pruefeMengenplausibilitaet({
      gesehene: 370,
      gemeldeteTreffer: null,
      historie: historieOk,
      vollstaendig: true,
    });
    expect(e.loeschenErlaubt).toBe(false);
    expect(e.erwartet).toBe(500);
    expect(e.grund).toContain("weicht");
  });

  it("verbietet eine Abweichung nach oben genauso", () => {
    const e = pruefeMengenplausibilitaet({
      gesehene: 700,
      gemeldeteTreffer: null,
      historie: historieOk,
      vollstaendig: true,
    });
    expect(e.loeschenErlaubt).toBe(false);
  });

  it("verbietet das Loeschen, wenn die ausgewiesene Trefferzahl stark abweicht", () => {
    const e = pruefeMengenplausibilitaet({
      gesehene: 300,
      gemeldeteTreffer: 500,
      historie: [300, 305, 295],
      vollstaendig: true,
    });
    expect(e.loeschenErlaubt).toBe(false);
    expect(e.grund).toContain("Trefferzahl");
  });

  it("ignoriert die Selbstkonsistenz, wenn das Portal keine Trefferzahl nennt", () => {
    // zvg-portal.de weist keine Gesamtzahl aus -- dort greift nur die Historie.
    const e = pruefeMengenplausibilitaet({
      gesehene: 500,
      gemeldeteTreffer: null,
      historie: historieOk,
      vollstaendig: true,
    });
    expect(e.loeschenErlaubt).toBe(true);
  });

  it("erlaubt das Loeschen, wenn gesehene und ausgewiesene Zahl zusammenpassen", () => {
    const e = pruefeMengenplausibilitaet({
      gesehene: 495,
      gemeldeteTreffer: 500,
      historie: historieOk,
      vollstaendig: true,
    });
    expect(e.loeschenErlaubt).toBe(true);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd C:\immo-radar\scraper && npx vitest run lib/plausibilitaet.test.ts`
Expected: FAIL — `Cannot find module './plausibilitaet.js'`.

- [ ] **Step 3: `plausibilitaet.ts` implementieren**

`scraper/lib/plausibilitaet.ts`:

```ts
/** Erst ab so vielen erfolgreichen Referenzlaeufen wird ueberhaupt geloescht. */
export const MIN_REFERENZLAEUFE = 3;
/** Zulaessige Abweichung vom Median der Referenzlaeufe. */
export const TOLERANZ_ANTEIL = 0.25;
/** Wie viele vergangene Laeufe die Referenz bilden. */
export const HISTORIE_LAENGE = 10;

export interface PlausibilitaetsEingabe {
  /** Objekte, die dieser Sweep tatsaechlich eingesammelt hat. */
  gesehene: number;
  /** Vom Portal ausgewiesene Trefferzahl; null, wenn es keine nennt. */
  gemeldeteTreffer: number | null;
  /** gesehene_objekte der letzten erfolgreichen Laeufe derselben Quelle. */
  historie: number[];
  vollstaendig: boolean;
}

export interface PlausibilitaetsErgebnis {
  loeschenErlaubt: boolean;
  /** Klartext fuer die Warnmeldung; null, wenn das Loeschen erlaubt ist. */
  grund: string | null;
  /** Median der Referenzlaeufe, fuer die Warnmeldung. Null ohne Historie. */
  erwartet: number | null;
}

/** Median ohne Seiteneffekt auf die Eingabeliste. */
export function median(werte: number[]): number | null {
  if (werte.length === 0) return null;
  const sortiert = [...werte].sort((a, b) => a - b);
  const mitte = Math.floor(sortiert.length / 2);
  return sortiert.length % 2 === 1
    ? sortiert[mitte]
    : (sortiert[mitte - 1] + sortiert[mitte]) / 2;
}

/**
 * Entscheidet, ob auf Abwesenheit hin geloescht werden darf.
 *
 * Das Abdeckungsprotokoll erkennt nur Sweeps, die MIT Fehler abbrechen. Der
 * gefaehrlichere Fall ist der technisch saubere Lauf, der trotzdem zu wenig
 * liefert -- geaenderter Selektor, anders greifender Filter, stillschweigend
 * gekuerzte Ausgabe. Genau den faengt diese Funktion ab.
 */
export function pruefeMengenplausibilitaet(
  eingabe: PlausibilitaetsEingabe
): PlausibilitaetsErgebnis {
  const erwartet = median(eingabe.historie);

  if (!eingabe.vollstaendig) {
    return { loeschenErlaubt: false, grund: "Sweep war unvollständig.", erwartet };
  }

  if (eingabe.gemeldeteTreffer !== null && eingabe.gemeldeteTreffer > 0) {
    const abweichung =
      Math.abs(eingabe.gesehene - eingabe.gemeldeteTreffer) / eingabe.gemeldeteTreffer;
    if (abweichung > TOLERANZ_ANTEIL) {
      return {
        loeschenErlaubt: false,
        grund:
          `Eingesammelt ${eingabe.gesehene}, das Portal weist aber ` +
          `${eingabe.gemeldeteTreffer} Trefferzahl aus.`,
        erwartet,
      };
    }
  }

  if (eingabe.historie.length < MIN_REFERENZLAEUFE) {
    return {
      loeschenErlaubt: false,
      grund:
        `Erst ${eingabe.historie.length} von ${MIN_REFERENZLAEUFE} nötigen ` +
        `Referenzläufen vorhanden.`,
      erwartet,
    };
  }

  // erwartet ist hier nie null: historie.length >= MIN_REFERENZLAEUFE > 0.
  const referenz = erwartet as number;
  if (referenz > 0) {
    const abweichung = Math.abs(eingabe.gesehene - referenz) / referenz;
    if (abweichung > TOLERANZ_ANTEIL) {
      return {
        loeschenErlaubt: false,
        grund:
          `Menge weicht um ${Math.round(abweichung * 100)} % vom Median ` +
          `${referenz} der letzten Läufe ab.`,
        erwartet,
      };
    }
  }

  return { loeschenErlaubt: true, grund: null, erwartet };
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `cd C:\immo-radar\scraper && npx vitest run lib/plausibilitaet.test.ts`
Expected: PASS, alle 14 Tests grün.

- [ ] **Step 5: Commit**

```bash
cd C:\immo-radar
git add scraper/lib/plausibilitaet.ts scraper/lib/plausibilitaet.test.ts
git commit -m "feat(scraper): Mengenplausibilitaet als Vorbedingung des Loeschens"
```

---

### Task 6: `lib/bestandDb.ts` — Datenbankzugriff der Bestandsführung

**Files:**
- Create: `scraper/lib/bestandDb.ts`

**Interfaces:**
- Consumes: `SweepErgebnis`, `BekanntesListing`, `istKarenzAbgelaufen` (aus `./bestand.js`), `HISTORIE_LAENGE` (aus `./plausibilitaet.js`).
- Produces: `ladeBekannteListings(sb, source): Promise<BekanntesListing[]>`, `ladeVeralteteExternalIds(sb, source, grenze): Promise<string[]>`, `markiereVerschwunden(sb, listingIds, zeitpunkt): Promise<void>`, `hebeVerschwundenAuf(sb, listingIds): Promise<void>`, `aktualisiereLastSeen(sb, listingIds, zeitpunkt): Promise<void>`, `loescheAbgelaufene(sb, jetzt): Promise<number>`, `speichereSweepLauf(sb, sweep): Promise<void>`, `ladeSweepHistorie(sb, source): Promise<number[]>`. Wird von Task 12 konsumiert.

Reiner I/O — kein Unit-Test, Verifikation in Task 14 (analog zu `upsertListingAndVersion`).

- [ ] **Step 1: `bestandDb.ts` implementieren**

`scraper/lib/bestandDb.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { istKarenzAbgelaufen, type BekanntesListing, type SweepErgebnis } from "./bestand.js";
import { HISTORIE_LAENGE } from "./plausibilitaet.js";

/** Supabase deckelt Ergebnismengen; explizit hochsetzen statt still zu kuerzen. */
const MAX_ZEILEN = 10_000;

export async function ladeBekannteListings(
  supabase: SupabaseClient,
  source: string
): Promise<BekanntesListing[]> {
  const { data, error } = await supabase
    .from("listings")
    .select("id, external_id, disappeared_at")
    .eq("source", source)
    .limit(MAX_ZEILEN);
  if (error) throw error;
  return (data ?? []).map((zeile) => ({
    id: zeile.id as string,
    externalId: zeile.external_id as string,
    disappearedAt: (zeile.disappeared_at as string | null) ?? null,
  }));
}

/**
 * externalIds, deren Detailerfassung zu lange her ist. Faengt geaenderte
 * Verkehrswerte und verlegte Termine ein, ohne jeden Lauf alle Detailseiten
 * zu holen. `last_detail_at is null` faellt bewusst mit hinein: solche
 * Objekte wurden noch nie im Detail erfasst.
 */
export async function ladeVeralteteExternalIds(
  supabase: SupabaseClient,
  source: string,
  grenze: Date
): Promise<string[]> {
  const { data, error } = await supabase
    .from("listings")
    .select("external_id")
    .eq("source", source)
    .or(`last_detail_at.is.null,last_detail_at.lt.${grenze.toISOString()}`)
    .limit(MAX_ZEILEN);
  if (error) throw error;
  return (data ?? []).map((zeile) => zeile.external_id as string);
}

export async function markiereVerschwunden(
  supabase: SupabaseClient,
  listingIds: string[],
  zeitpunkt: Date
): Promise<void> {
  if (listingIds.length === 0) return;
  const { error } = await supabase
    .from("listings")
    .update({ disappeared_at: zeitpunkt.toISOString() })
    .in("id", listingIds);
  if (error) throw error;
}

export async function hebeVerschwundenAuf(
  supabase: SupabaseClient,
  listingIds: string[]
): Promise<void> {
  if (listingIds.length === 0) return;
  const { error } = await supabase
    .from("listings")
    .update({ disappeared_at: null })
    .in("id", listingIds);
  if (error) throw error;
}

export async function aktualisiereLastSeen(
  supabase: SupabaseClient,
  listingIds: string[],
  zeitpunkt: Date
): Promise<void> {
  if (listingIds.length === 0) return;
  const { error } = await supabase
    .from("listings")
    .update({ last_seen: zeitpunkt.toISOString() })
    .in("id", listingIds);
  if (error) throw error;
}

/**
 * Loescht Objekte, deren Karenz abgelaufen ist. listing_versions und
 * notifications folgen per `on delete cascade`. Kommt ein Objekt spaeter
 * zurueck, legt der naechste Lauf es schlicht neu an.
 */
export async function loescheAbgelaufene(
  supabase: SupabaseClient,
  jetzt: Date
): Promise<number> {
  const { data, error } = await supabase
    .from("listings")
    .select("id, disappeared_at")
    .not("disappeared_at", "is", null)
    .limit(MAX_ZEILEN);
  if (error) throw error;

  const faellig = (data ?? [])
    .filter((zeile) => istKarenzAbgelaufen(zeile.disappeared_at as string, jetzt))
    .map((zeile) => zeile.id as string);
  if (faellig.length === 0) return 0;

  const { error: loeschFehler } = await supabase.from("listings").delete().in("id", faellig);
  if (loeschFehler) throw loeschFehler;
  return faellig.length;
}

export async function speichereSweepLauf(
  supabase: SupabaseClient,
  sweep: SweepErgebnis
): Promise<void> {
  const { error } = await supabase.from("sweep_runs").insert({
    source: sweep.source,
    gemeldete_treffer: sweep.gemeldeteTreffer,
    gesehene_objekte: sweep.gesehene.size,
    vollstaendig: sweep.vollstaendig,
    geltungsbereich: sweep.geltungsbereich,
  });
  if (error) throw error;
}

/**
 * Mengen der letzten erfolgreichen Laeufe als Referenz. Nur vollstaendige
 * Laeufe zaehlen -- ein Teillauf ist als Vergleichsmassstab wertlos.
 */
export async function ladeSweepHistorie(
  supabase: SupabaseClient,
  source: string
): Promise<number[]> {
  const { data, error } = await supabase
    .from("sweep_runs")
    .select("gesehene_objekte")
    .eq("source", source)
    .eq("vollstaendig", true)
    .order("started_at", { ascending: false })
    .limit(HISTORIE_LAENGE);
  if (error) throw error;
  return (data ?? []).map((zeile) => Number(zeile.gesehene_objekte));
}
```

- [ ] **Step 2: TypeScript-Check**

Run: `cd C:\immo-radar\scraper && npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
cd C:\immo-radar
git add scraper/lib/bestandDb.ts
git commit -m "feat(scraper): DB-Zugriff fuer Bestandsfuehrung und Sweep-Historie"
```

---

### Task 7: `db.ts` — Meldezustand lesen, `disappeared_at` beim Upsert zurücksetzen

**Files:**
- Modify: `scraper/lib/db.ts`
- Test: `scraper/lib/db.test.ts`

**Interfaces:**
- Consumes: `hoechsteKlasse`, `type Meldeklasse` (aus `./meldung.js`).
- Produces: `hoechsteGemeldeteKlasse(supabase, listingId): Promise<Meldeklasse>`; `logNotification` akzeptiert zusätzlich die Werte `"pruefkandidat"` und `"verschwunden"`; `upsertListingAndVersion` setzt `disappeared_at = null` und `last_detail_at = now()`. Wird von Task 11 und 12 konsumiert.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

An `scraper/lib/db.test.ts` anhängen (bestehende `diffVersion`-Tests unverändert lassen):

```ts
import { versionInsertZeile } from "./db.js";

describe("versionInsertZeile", () => {
  const basis = {
    source: "zvg-portal",
    externalId: "sn-40908",
    url: "https://example.test/x",
    priceCents: 271_000_00,
    rentColdMonthlyCents: null,
    rentSource: "geschaetzt_regional" as const,
    livingAreaM2: 203,
    plotAreaM2: null,
    units: 3,
    unitsConfident: true,
    yearBuilt: 1937,
    zipCode: "04442",
    city: "Zwenkau",
    bundesland: "Sachsen",
    title: "Dreifamilienwohnhaus",
    kennzahlen: { topTreffer: true } as never,
  };

  it("setzt die optionalen ZVG-Felder auf null, wenn sie fehlen", () => {
    const zeile = versionInsertZeile("listing-1", basis, { changed: true, priceDropped: false });
    expect(zeile.auction_at).toBeNull();
    expect(zeile.court).toBeNull();
    expect(zeile.case_number).toBeNull();
    expect(zeile.raw_notice_text).toBeNull();
    expect(zeile.data_gaps).toEqual([]);
  });

  it("uebernimmt gesetzte ZVG-Felder und data_gaps unveraendert", () => {
    const zeile = versionInsertZeile(
      "listing-1",
      {
        ...basis,
        auctionAt: "2026-09-09T08:00:00.000Z",
        court: "Leipzig in Sachsen",
        caseNumber: "0467 K 0076/2022",
        rawNoticeText: "Beschreibung: ...",
        dataGaps: ["units_unconfirmed"],
      },
      { changed: true, priceDropped: true }
    );
    expect(zeile.auction_at).toBe("2026-09-09T08:00:00.000Z");
    expect(zeile.court).toBe("Leipzig in Sachsen");
    expect(zeile.data_gaps).toEqual(["units_unconfirmed"]);
    expect(zeile.price_dropped).toBe(true);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd C:\immo-radar\scraper && npx vitest run lib/db.test.ts`
Expected: FAIL — `versionInsertZeile is not a function`.

- [ ] **Step 3: `db.ts` anpassen**

In `scraper/lib/db.ts` zuoberst den Import ergänzen:

```ts
import { hoechsteKlasse, type Meldeklasse } from "./meldung.js";
```

Den `kind`-Typ von `logNotification` erweitern — die bisherige Signatur

```ts
kind: "top_treffer" | "preisaenderung",
```

wird zu

```ts
kind: "top_treffer" | "pruefkandidat" | "preisaenderung" | "verschwunden",
```

Den bisherigen `insert`-Aufruf in `upsertListingAndVersion` (der Block ab `const { error: versionError } = await supabase.from("listing_versions").insert({`) durch einen Aufruf der neuen, testbaren Funktion ersetzen. Zuerst die Funktion, direkt vor `upsertListingAndVersion` einfügen:

```ts
/**
 * Baut die Zeile fuer listing_versions. Ausgelagert, damit die Abbildung der
 * optionalen Felder ohne Datenbank testbar ist.
 */
export function versionInsertZeile(
  listingId: string,
  data: ListingVersionData,
  diff: VersionDiffResult
): Record<string, unknown> {
  return {
    listing_id: listingId,
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
  };
}
```

Dann in `upsertListingAndVersion` den `listings`-Upsert erweitern — er setzt jetzt zusätzlich `disappeared_at` zurück und merkt sich die Detailerfassung:

```ts
  const jetzt = new Date().toISOString();
  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .upsert(
      {
        source: data.source,
        external_id: data.externalId,
        url: data.url,
        last_seen: jetzt,
        // Das Objekt wurde gerade im Detail erfasst, ist also wieder da.
        disappeared_at: null,
        last_detail_at: jetzt,
      },
      { onConflict: "source,external_id" }
    )
    .select()
    .single();
  if (listingError) throw listingError;
```

und den Versions-Insert ersetzen durch:

```ts
  const { error: versionError } = await supabase
    .from("listing_versions")
    .insert(versionInsertZeile(listing.id, data, diff));
  if (versionError) throw versionError;
```

Am Dateiende die neue Abfrage ergänzen:

```ts
/**
 * Hoechste Meldeklasse, die fuer dieses Listing je BESTAETIGT verschickt
 * wurde. Grundlage der Entscheidung, ob eine erneute Nachricht faellig ist.
 * Weil die Zeile erst nach erfolgreichem Versand entsteht, wirkt ein
 * fehlgeschlagener Versand automatisch als "noch nie gemeldet" -- der
 * naechste Lauf holt ihn nach.
 */
export async function hoechsteGemeldeteKlasse(
  supabase: SupabaseClient,
  listingId: string
): Promise<Meldeklasse> {
  const { data, error } = await supabase
    .from("notifications")
    .select("kind")
    .eq("listing_id", listingId);
  if (error) throw error;
  return hoechsteKlasse((data ?? []).map((zeile) => zeile.kind as string));
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `cd C:\immo-radar\scraper && npx vitest run lib/db.test.ts`
Expected: PASS, 6 Tests grün (4 bestehende `diffVersion` + 2 neue).

- [ ] **Step 5: Commit**

```bash
cd C:\immo-radar
git add scraper/lib/db.ts scraper/lib/db.test.ts
git commit -m "feat(scraper): Meldezustand aus notifications lesen, disappeared_at beim Upsert zuruecksetzen"
```

---

### Task 8: `telegram.ts` — Prüfkandidat, Abgangsmeldung, Sweep-Warnung

**Files:**
- Modify: `scraper/lib/telegram.ts`
- Test: `scraper/lib/telegram.test.ts`

**Interfaces:**
- Consumes: `type Meldeklasse` (aus `./meldung.js`).
- Produces: `formatTopTrefferMessage(listing, k, klasse)` und `formatZvgTopTrefferMessage(listing, k, klasse)` mit neuem dritten Parameter; `formatAbgangMessage(listing: ListingSummary): string`; `formatSweepWarnungMessage(source, gesehene, erwartet, grund): string`. Wird von Task 11 und 12 konsumiert.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

An `scraper/lib/telegram.test.ts` anhängen (bestehende Blöcke unverändert lassen). Der bestehende Test nutzt bereits eine `listing`-Konstante; hier wird bewusst eine eigene definiert, damit dieser Block unabhängig lesbar ist:

```ts
import { formatAbgangMessage, formatSweepWarnungMessage } from "./telegram.js";

const abgangListing = {
  title: "Mehrfamilienhaus zum Kauf",
  url: "https://www.immowelt.de/expose/abc-123",
  city: "Leipzig",
  zipCode: "04109",
  priceCents: 480_000_00,
  units: 3,
};

describe("Meldeklasse in der Ueberschrift", () => {
  it("beschriftet einen top_treffer als TOP-TREFFER", () => {
    const text = formatTopTrefferMessage(
      abgangListing,
      { kaufpreisfaktor: 12.5, geschaetzterDscr: 1.45, mietQuelle: "angegeben" },
      "top_treffer"
    );
    expect(text).toContain("TOP-TREFFER");
    expect(text).not.toContain("PRÜFKANDIDAT");
  });

  it("beschriftet einen pruefkandidat als PRUEFKANDIDAT und nennt den Grund", () => {
    const text = formatTopTrefferMessage(
      abgangListing,
      { kaufpreisfaktor: 12.5, geschaetzterDscr: 1.45, mietQuelle: "geschaetzt_regional" },
      "pruefkandidat"
    );
    expect(text).toContain("PRÜFKANDIDAT");
    expect(text).toContain("geschätzten Miete");
  });

  it("beschriftet auch die ZVG-Variante nach Klasse", () => {
    const text = formatZvgTopTrefferMessage(
      {
        ...abgangListing,
        url: "https://www.zvg-portal.de/index.php?button=showZvg&zvg_id=40908&land_abk=sn",
        court: "Leipzig in Sachsen",
        auctionAt: "2026-09-09T08:00:00.000Z",
        caseNumber: "0467 K 0076/2022",
      },
      { kaufpreisfaktor: 8.5, geschaetzterDscr: 1.6, mietQuelle: "geschaetzt_bundesweit" },
      "pruefkandidat"
    );
    expect(text).toContain("PRÜFKANDIDAT");
    expect(text).toContain("Zwangsversteigerung");
  });
});

describe("formatAbgangMessage", () => {
  it("nennt Titel, Ort und den Grund des Abgangs", () => {
    const text = formatAbgangMessage(abgangListing);
    expect(text).toContain("NICHT MEHR VERFÜGBAR");
    expect(text).toContain("Mehrfamilienhaus zum Kauf");
    expect(text).toContain("04109 Leipzig");
  });

  it("maskiert HTML-Sonderzeichen im Titel", () => {
    const text = formatAbgangMessage({ ...abgangListing, title: "Haus <Sonder> & Co" });
    expect(text).toContain("&lt;Sonder&gt;");
    expect(text).toContain("&amp;");
  });
});

describe("formatSweepWarnungMessage", () => {
  it("nennt Quelle, gesehene und erwartete Menge sowie den Grund", () => {
    const text = formatSweepWarnungMessage(
      "zvg-portal",
      370,
      500,
      "Menge weicht um 26 % vom Median 500 der letzten Läufe ab."
    );
    expect(text).toContain("zvg-portal");
    expect(text).toContain("370");
    expect(text).toContain("500");
    expect(text).toContain("Löschung ausgesetzt");
  });

  it("kommt ohne Erwartungswert aus, wenn noch keine Historie vorliegt", () => {
    const text = formatSweepWarnungMessage(
      "immowelt",
      12,
      null,
      "Erst 1 von 3 nötigen Referenzläufen vorhanden."
    );
    expect(text).toContain("Referenzläufen");
    expect(text).not.toContain("null");
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd C:\immo-radar\scraper && npx vitest run lib/telegram.test.ts`
Expected: FAIL — `formatAbgangMessage is not a function`.

- [ ] **Step 3: `telegram.ts` anpassen**

Zuoberst importieren:

```ts
import type { Meldeklasse } from "./meldung.js";
```

Nach `MIET_QUELLE_LABELS` (etwa Zeile 40) einfügen:

```ts
/** Ueberschrift und Zusatzhinweis je Meldeklasse. */
const KLASSEN_KOPF: Record<Exclude<Meldeklasse, "keine">, { titel: string; hinweis: string | null }> = {
  top_treffer: { titel: "🎯 <b>TOP-TREFFER</b>", hinweis: null },
  pruefkandidat: {
    titel: "🔍 <b>PRÜFKANDIDAT</b>",
    hinweis:
      "<i>Faktor und DSCR beruhen auf einer geschätzten Miete — vor einer " +
      "Entscheidung selbst prüfen.</i>",
  },
};
```

`formatTopTrefferMessage` ersetzen:

```ts
export function formatTopTrefferMessage(
  listing: ListingSummary,
  k: KennzahlenSummary,
  klasse: Exclude<Meldeklasse, "keine"> = "top_treffer"
): string {
  const kopf = KLASSEN_KOPF[klasse];
  return baueNachricht([
    `${kopf.titel}
🏠 ${esc(listing.title)}
📍 ${esc(`${listing.zipCode} ${listing.city}`)}`,
    formatKennzahlenBlock(listing, k, "Kaufpreis"),
    kopf.hinweis,
    formatDataGapsLine(listing.dataGaps),
    formatLinkZeile(listing),
  ]);
}
```

`formatZvgTopTrefferMessage` ersetzen:

```ts
export function formatZvgTopTrefferMessage(
  listing: ZvgListingSummary,
  k: KennzahlenSummary,
  klasse: Exclude<Meldeklasse, "keine"> = "top_treffer"
): string {
  const kopf = KLASSEN_KOPF[klasse];
  return baueNachricht([
    `${kopf.titel} · Zwangsversteigerung
🏠 ${esc(listing.title)}`,
    formatKennzahlenBlock(listing, k, "Verkehrswert"),
    [
      `📅 <b>Termin</b> ${formatBerlinDatumzeit(listing.auctionAt)} Uhr`,
      `⚖️ Amtsgericht ${esc(listing.court)}`,
      `📋 Az. ${esc(listing.caseNumber)}`,
    ].join("\n"),
    kopf.hinweis,
    formatDataGapsLine(listing.dataGaps),
    formatNoticeBlock(listing.rawNoticeText),
    formatLinkZeile(listing),
  ]);
}
```

Direkt nach `formatPreisaenderungMessage` ergänzen:

```ts
/**
 * Abgangsmeldung. Geht ausschliesslich an Objekte, die frueher als
 * Top-Treffer oder Pruefkandidat gemeldet wurden -- bei mehreren hundert
 * Objekten je Lauf waere alles andere Dauerfeuer.
 */
export function formatAbgangMessage(listing: ListingSummary): string {
  return baueNachricht([
    `❌ <b>NICHT MEHR VERFÜGBAR</b>
🏠 ${esc(listing.title)}
📍 ${esc(`${listing.zipCode} ${listing.city}`)}`,
    `<i>Das Objekt ist aus dem Angebot verschwunden — vermutlich verkauft, ` +
      `versteigert oder zurückgezogen. Es wird nach 2 Tagen aus dem Bestand ` +
      `entfernt.</i>`,
  ]);
}

/**
 * Warnung, wenn eine Quelle durch das Plausibilitaetstor faellt. Haengt an
 * keinem Objekt und wird deshalb NICHT in notifications protokolliert --
 * dort ist listing_id `not null`. Ihr dauerhafter Niederschlag ist die
 * sweep_runs-Zeile.
 */
export function formatSweepWarnungMessage(
  source: string,
  gesehene: number,
  erwartet: number | null,
  grund: string
): string {
  const mengenZeile =
    erwartet === null
      ? `Eingesammelt: <b>${gesehene}</b> Objekte.`
      : `Eingesammelt: <b>${gesehene}</b> Objekte, erwartet wären ~<b>${erwartet}</b>.`;
  return baueNachricht([
    `⚠️ <b>SWEEP UNPLAUSIBEL · ${esc(source)}</b>`,
    mengenZeile,
    esc(grund),
    `<i>Löschung ausgesetzt — der Bestand bleibt unangetastet.</i>`,
  ]);
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `cd C:\immo-radar\scraper && npx vitest run lib/telegram.test.ts`
Expected: PASS — alle bestehenden Tests weiterhin grün (der Standardwert `"top_treffer"` hält sie rückwärtskompatibel) plus 7 neue.

- [ ] **Step 5: Commit**

```bash
cd C:\immo-radar
git add scraper/lib/telegram.ts scraper/lib/telegram.test.ts
git commit -m "feat(scraper): Pruefkandidat-Nachricht, Abgangsmeldung und Sweep-Warnung"
```

---

### Task 9: ZVG-Portal — Sweep von Detailerfassung trennen

**Files:**
- Modify: `scraper/scrapers/zvg-portal/index.ts`
- Delete: `scraper/scrapers/zvg-portal/index.test.ts`

**Interfaces:**
- Consumes: `parseZvgResultsPage`, `ZvgListSummary` (aus `./list.js`), `parseZvgDetailPage`, `ZvgDetailData` (aus `./detail.js`), `SweepErgebnis` (aus `../../lib/bestand.js`).
- Produces: `sweepZvgPortal(): Promise<{ sweep: SweepErgebnis; zusammenfassungen: Map<string, ZvgListSummary> }>`, `erfasseZvgDetails(zusammenfassungen, externalIds): Promise<ZvgDetailData[]>`. Ersetzt `scrapeZvgPortal`. Wird von Task 12 konsumiert.

**Wegfall:** `MAX_LAUFZEIT_MS`, `bundeslaenderInLaufReihenfolge` und die Rotation entfallen ersatzlos — der Sweep ohne Detailseiten ist billig genug, um immer alle 16 Länder zu schaffen. `index.test.ts` enthielt ausschließlich Tests der Rotation und wird deshalb gelöscht; die verbleibende reine Logik dieses Bereichs (`waehleDetailKandidaten`) ist in Task 4 getestet. Was hier übrig bleibt, ist Playwright-Orchestrierung ohne sinnvollen Unit-Test — Verifikation in Task 14, wie bei allen Scraper-Modulen des Projekts.

**Trefferzahl:** zvg-portal.de weist keine Gesamtzahl aus (im Fixture `zvg-portal-suche-sachsen-mfh.html` nachgeprüft: es gibt nur Blätter-Buttons). `gemeldeteTreffer` ist daher immer `null`; die Selbstkonsistenz-Prüfung entfällt für diese Quelle planmäßig.

- [ ] **Step 1: Veraltete Testdatei löschen**

```bash
cd C:\immo-radar
git rm scraper/scrapers/zvg-portal/index.test.ts
```

- [ ] **Step 2: `index.ts` ersetzen**

`scraper/scrapers/zvg-portal/index.ts` vollständig ersetzen:

```ts
import { chromium, type Browser, type Page } from "playwright";
import { parseZvgResultsPage, type ZvgListSummary } from "./list.js";
import { parseZvgDetailPage, type ZvgDetailData } from "./detail.js";
import type { SweepErgebnis } from "../../lib/bestand.js";

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
    const gibtNaechsteSeite =
      (await page.locator(`button[aria-label="${naechstesSeitenLabel}"]`).count()) > 0;
    if (!gibtNaechsteSeite) break;
    await sleep(VERZOEGERUNG_MS);
    await page.click(`button[aria-label="${naechstesSeitenLabel}"]`);
    await page.waitForLoadState("domcontentloaded");
    seite += 1;
  }
  return ergebnisse;
}

/**
 * Phase A: vollstaendige Bestandsaufnahme ueber alle 16 Bundeslaender, nur
 * Ergebnislisten. zvg-portal.de weist keine Gesamttrefferzahl aus, daher
 * bleibt gemeldeteTreffer null.
 */
export async function sweepZvgPortal(): Promise<{
  sweep: SweepErgebnis;
  zusammenfassungen: Map<string, ZvgListSummary>;
}> {
  const browser = await chromium.launch();
  const zusammenfassungen = new Map<string, ZvgListSummary>();
  const geltungsbereich: string[] = [];
  let alleLiefen = true;

  try {
    const page = await browser.newPage();
    for (const landAbk of BUNDESLAND_CODES) {
      await sleep(VERZOEGERUNG_MS);
      try {
        await sucheFuerBundesland(page, landAbk);
        const treffer = await alleSeitenErfassen(page);
        for (const t of treffer) zusammenfassungen.set(t.externalId, t);
        geltungsbereich.push(landAbk);
        console.log(`ZVG-Sweep ${landAbk}: ${treffer.length} Termine.`);
      } catch (err) {
        alleLiefen = false;
        console.warn(`ZVG-Sweep ${landAbk}: Fehler, Bundesland bleibt vom Abgleich ausgenommen`, err);
      }
    }
  } finally {
    await browser.close();
  }

  return {
    sweep: {
      source: "zvg-portal",
      vollstaendig: alleLiefen,
      geltungsbereich,
      gesehene: new Set(zusammenfassungen.keys()),
      gemeldeteTreffer: null,
    },
    zusammenfassungen,
  };
}

async function detailSeiteHolen(
  page: Page,
  zusammenfassung: ZvgListSummary,
  referer: string
): Promise<ZvgDetailData | null> {
  try {
    await page.goto(zusammenfassung.url, { waitUntil: "domcontentloaded", referer });
    return parseZvgDetailPage(await page.content(), {
      externalId: zusammenfassung.externalId,
      url: zusammenfassung.url,
      court: zusammenfassung.court,
      caseNumber: zusammenfassung.caseNumber,
    });
  } catch (err) {
    console.warn(`ZVG-Detailseite ${zusammenfassung.url}: Fehler, übersprungen`, err);
    return null;
  }
}

/**
 * Phase B: Detailseiten nur fuer die uebergebenen externalIds.
 * Der Referer muss auf die Sucheinstiegsseite zeigen -- zvg-portal.de
 * liefert sonst HTTP 200 mit dem woertlichen Body "error".
 */
export async function erfasseZvgDetails(
  zusammenfassungen: Map<string, ZvgListSummary>,
  externalIds: string[]
): Promise<ZvgDetailData[]> {
  if (externalIds.length === 0) return [];

  const browser: Browser = await chromium.launch();
  const ergebnisse: ZvgDetailData[] = [];
  try {
    const page = await browser.newPage();
    await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded" });
    const referer = page.url();

    for (const externalId of externalIds) {
      const zusammenfassung = zusammenfassungen.get(externalId);
      if (zusammenfassung === undefined) continue;
      await sleep(VERZOEGERUNG_MS);
      const daten = await detailSeiteHolen(page, zusammenfassung, referer);
      if (daten !== null) ergebnisse.push(daten);
    }
  } finally {
    await browser.close();
  }
  return ergebnisse;
}
```

- [ ] **Step 3: TypeScript-Check und Gesamtsuite**

Run: `cd C:\immo-radar\scraper && npx tsc --noEmit`
Expected: **Fehler in `main.ts`** — `scrapeZvgPortal` existiert nicht mehr. Das ist erwartet und wird in Task 12 behoben. Alle anderen Dateien müssen fehlerfrei sein.

Run: `cd C:\immo-radar\scraper && npm test`
Expected: PASS — die gelöschte `index.test.ts` fehlt, alle übrigen Tests grün.

- [ ] **Step 4: Commit**

```bash
cd C:\immo-radar
git add scraper/scrapers/zvg-portal/index.ts scraper/scrapers/zvg-portal/index.test.ts
git commit -m "feat(scraper): ZVG-Sweep ueber alle Bundeslaender getrennt von der Detailerfassung"
```

---

### Task 10: Immowelt auf Playwright

**Files:**
- Modify: `scraper/scrapers/immowelt/index.ts`

**Interfaces:**
- Consumes: `parseImmoweltListPage`, `istMehrfamilienhausKandidat` (aus `./list.js`), `parseImmoweltDetailPage`, `ImmoweltDetailData` (aus `./detail.js`), `SweepErgebnis` (aus `../../lib/bestand.js`).
- Produces: `sweepImmowelt(): Promise<{ sweep: SweepErgebnis; zusammenfassungen: Map<string, ImmoweltListSummary> }>`, `erfasseImmoweltDetails(zusammenfassungen, externalIds): Promise<ImmoweltDetailData[]>`. Ersetzt `scrapeImmowelt`. Wird von Task 12 konsumiert.

**WICHTIG — welche Variante gilt, entscheidet Task 1.** Beide Varianten liefern dieselbe Schnittstelle; sie unterscheiden sich nur darin, ob `vollstaendig` je `true` werden kann.

- [ ] **Step 1: Variante nach Spike-Ergebnis wählen**

Im Spike-Ergebnis in der Spec (`### Spike-Ergebnis 2026-09-07`) nachlesen:

- Objekttyp-Filter vorhanden **und** gefilterte Menge ≤ 5000 → **Variante A**
- sonst → **Variante B**

Die gewählte Variante hier notieren, damit Task 14 weiß, was zu erwarten ist.

- [ ] **Step 2: `index.ts` ersetzen — Variante A (vollständiger Sweep)**

Nur ausführen, wenn Step 1 Variante A ergab. `SUCHE_URL` durch die im Spike ermittelte gefilterte URL ersetzen, `WEITER_SELEKTOR` durch den dort ermittelten Blätter-Selektor.

```ts
import { chromium, type Browser, type Page } from "playwright";
import { parseImmoweltListPage, istMehrfamilienhausKandidat, type ImmoweltListSummary } from "./list.js";
import { parseImmoweltDetailPage, type ImmoweltDetailData } from "./detail.js";
import type { SweepErgebnis } from "../../lib/bestand.js";

/** Aus dem Spike: Suchseite MIT gesetztem Objekttyp-Filter Mehrfamilienhaus. */
const SUCHE_URL = "<<im Spike ermittelte gefilterte URL einsetzen>>";
/** Aus dem Spike: Selektor des Weiter-Buttons. */
const WEITER_SELEKTOR = "<<im Spike ermittelten Selektor einsetzen>>";
const VERZOEGERUNG_MS = 1000;
/** Notbremse, falls die Blaetter-Erkennung in eine Schleife laeuft. */
const MAX_SEITEN = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Trefferzahl aus dem Seitentitel, z. B. "... - 1.234 Angebote ab ...". */
export function trefferzahlAusTitel(titel: string): number | null {
  const treffer = titel.match(/([\d.]+)\s+Angebote/);
  if (treffer === null) return null;
  const zahl = Number.parseInt(treffer[1].replace(/\./g, ""), 10);
  return Number.isFinite(zahl) ? zahl : null;
}

export async function sweepImmowelt(): Promise<{
  sweep: SweepErgebnis;
  zusammenfassungen: Map<string, ImmoweltListSummary>;
}> {
  const browser = await chromium.launch();
  const zusammenfassungen = new Map<string, ImmoweltListSummary>();
  let vollstaendig = true;
  let gemeldeteTreffer: number | null = null;

  try {
    const page = await browser.newPage();
    await page.goto(SUCHE_URL, { waitUntil: "domcontentloaded" });
    gemeldeteTreffer = trefferzahlAusTitel(await page.title());

    for (let seite = 1; seite <= MAX_SEITEN; seite += 1) {
      const treffer = parseImmoweltListPage(await page.content()).filter((k) =>
        istMehrfamilienhausKandidat(k.titleLine)
      );
      for (const t of treffer) zusammenfassungen.set(t.externalId, t);

      const gibtWeiter = (await page.locator(WEITER_SELEKTOR).count()) > 0;
      if (!gibtWeiter) break;
      if (seite === MAX_SEITEN) {
        vollstaendig = false;
        console.warn(`Immowelt-Sweep: Seitengrenze ${MAX_SEITEN} erreicht, Menge unvollständig.`);
        break;
      }
      await sleep(VERZOEGERUNG_MS);
      await page.click(WEITER_SELEKTOR);
      await page.waitForLoadState("domcontentloaded");
    }
  } catch (err) {
    vollstaendig = false;
    console.warn("Immowelt-Sweep abgebrochen, Abgleich wird ausgesetzt", err);
  } finally {
    await browser.close();
  }

  console.log(`Immowelt-Sweep: ${zusammenfassungen.size} Mehrfamilienhaus-Kandidaten.`);
  return {
    sweep: {
      source: "immowelt",
      vollstaendig,
      geltungsbereich: [],
      gesehene: new Set(zusammenfassungen.keys()),
      gemeldeteTreffer,
    },
    zusammenfassungen,
  };
}

export async function erfasseImmoweltDetails(
  zusammenfassungen: Map<string, ImmoweltListSummary>,
  externalIds: string[]
): Promise<ImmoweltDetailData[]> {
  if (externalIds.length === 0) return [];

  const browser: Browser = await chromium.launch();
  const ergebnisse: ImmoweltDetailData[] = [];
  try {
    const page: Page = await browser.newPage();
    for (const externalId of externalIds) {
      const zusammenfassung = zusammenfassungen.get(externalId);
      if (zusammenfassung === undefined) continue;
      await sleep(VERZOEGERUNG_MS);
      try {
        await page.goto(zusammenfassung.url, { waitUntil: "domcontentloaded" });
        ergebnisse.push(
          parseImmoweltDetailPage(await page.content(), {
            externalId: zusammenfassung.externalId,
            url: zusammenfassung.url,
          })
        );
      } catch (err) {
        console.warn(`Immowelt-Detailseite ${zusammenfassung.url}: Fehler, übersprungen`, err);
      }
    }
  } finally {
    await browser.close();
  }
  return ergebnisse;
}
```

- [ ] **Step 3: `index.ts` ersetzen — Variante B (kein vollständiger Sweep möglich)**

Nur ausführen, wenn Step 1 Variante B ergab. Identisch zu Variante A, mit zwei Unterschieden: `SUCHE_URL` bleibt die ungefilterte Seite-1-URL, und `vollstaendig` ist **fest `false`**. Immowelt liefert damit weiterhin Kandidaten, nimmt aber an keiner Löschung teil.

Statt des Sweep-Blocks aus Variante A:

```ts
const SUCHE_URL = "https://www.immowelt.de/suche/kaufen/haus/deutschland/ad02de1";

export async function sweepImmowelt(): Promise<{
  sweep: SweepErgebnis;
  zusammenfassungen: Map<string, ImmoweltListSummary>;
}> {
  const browser = await chromium.launch();
  const zusammenfassungen = new Map<string, ImmoweltListSummary>();

  try {
    const page = await browser.newPage();
    await page.goto(SUCHE_URL, { waitUntil: "domcontentloaded" });
    const treffer = parseImmoweltListPage(await page.content()).filter((k) =>
      istMehrfamilienhausKandidat(k.titleLine)
    );
    for (const t of treffer) zusammenfassungen.set(t.externalId, t);
  } catch (err) {
    console.warn("Immowelt-Sweep fehlgeschlagen", err);
  } finally {
    await browser.close();
  }

  console.log(`Immowelt-Sweep: ${zusammenfassungen.size} Kandidaten (nur Seite 1).`);
  return {
    sweep: {
      source: "immowelt",
      // BEWUSST fest false: Seite 1 ist prinzipiell keine vollstaendige
      // Menge. Immowelt-Objekte duerfen deshalb nie auf Abwesenheit hin
      // geloescht werden. Siehe Spike-Ergebnis in der Spec.
      vollstaendig: false,
      geltungsbereich: [],
      gesehene: new Set(zusammenfassungen.keys()),
      gemeldeteTreffer: null,
    },
    zusammenfassungen,
  };
}
```

`erfasseImmoweltDetails` ist in beiden Varianten identisch — den Block aus Step 2 übernehmen.

- [ ] **Step 4: TypeScript-Check**

Run: `cd C:\immo-radar\scraper && npx tsc --noEmit`
Expected: **Fehler in `main.ts`** — `scrapeImmowelt` und `scrapeZvgPortal` existieren nicht mehr. Das ist erwartet und wird in Task 12 behoben. Alle anderen Dateien müssen fehlerfrei sein.

- [ ] **Step 5: Commit**

```bash
cd C:\immo-radar
git add scraper/scrapers/immowelt/index.ts
git commit -m "feat(scraper): Immowelt ueber Playwright, Sweep getrennt von der Detailerfassung"
```

---

### Task 11: `pipeline.ts` — Meldeklassen statt `changed`-Gate

**Files:**
- Modify: `scraper/lib/pipeline.ts`
- Test: `scraper/lib/pipeline.test.ts`

**Interfaces:**
- Consumes: `bestimmeMeldeklasse`, `istHoeher`, `type Meldeklasse` (aus `./meldung.js`), `hoechsteGemeldeteKlasse` (aus `./db.js`), `formatTopTrefferMessage`, `formatZvgTopTrefferMessage` mit Klassen-Parameter (aus `./telegram.js`).
- Produces: `processCandidate` unverändert in der Signatur; neu `PipelineCandidate.auctionAt` wird für die Meldeklasse ausgewertet. Wird von Task 12 konsumiert.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

An `scraper/lib/pipeline.test.ts` anhängen:

```ts
import { sollGesendetWerden } from "./pipeline.js";

describe("sollGesendetWerden", () => {
  it("sendet, wenn ein noch nie gemeldetes Objekt qualifiziert", () => {
    expect(sollGesendetWerden("top_treffer", "keine")).toBe(true);
  });

  it("sendet beim Aufstieg von pruefkandidat auf top_treffer", () => {
    expect(sollGesendetWerden("top_treffer", "pruefkandidat")).toBe(true);
  });

  it("sendet NICHT, wenn die Klasse gleich bleibt", () => {
    expect(sollGesendetWerden("top_treffer", "top_treffer")).toBe(false);
  });

  it("sendet NICHT, wenn das Objekt gar nicht qualifiziert", () => {
    expect(sollGesendetWerden("keine", "keine")).toBe(false);
  });

  it("sendet NICHT beim Abstieg -- eine Rueckstufung ist keine Nachricht wert", () => {
    expect(sollGesendetWerden("pruefkandidat", "top_treffer")).toBe(false);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd C:\immo-radar\scraper && npx vitest run lib/pipeline.test.ts`
Expected: FAIL — `sollGesendetWerden is not a function`.

- [ ] **Step 3: `pipeline.ts` anpassen**

Die Importe oben ergänzen:

```ts
import { bestimmeMeldeklasse, istHoeher, type Meldeklasse } from "./meldung.js";
import { upsertListingAndVersion, logNotification, hoechsteGemeldeteKlasse } from "./db.js";
```

(der bestehende `db.js`-Import wird dadurch ersetzt.)

Nach `bewerteMietschaetzung` einfügen:

```ts
/**
 * Gesendet wird nur bei einem echten AUFSTIEG. Damit ist ein Objekt genau
 * einmal je Klasse eine Nachricht wert, und eine Verbesserung
 * (pruefkandidat -> top_treffer) meldet sich erneut.
 */
export function sollGesendetWerden(aktuell: Meldeklasse, bereitsGemeldet: Meldeklasse): boolean {
  return aktuell !== "keine" && istHoeher(aktuell, bereitsGemeldet);
}
```

Den gesamten `try { ... } catch { ... }`-Block am Ende von `processCandidate` (ab `try {` bis zum schließenden `}` der Funktion) ersetzen:

```ts
  const klasse = bestimmeMeldeklasse({
    erfuelltSchwellen: kennzahlen.topTreffer,
    mietQuelle: miete.quelle,
    auctionAt: candidate.auctionAt,
    jetzt: new Date(),
  });

  if (klasse !== "keine") {
    const bereitsGemeldet = await hoechsteGemeldeteKlasse(supabase, diff.listingId);
    if (sollGesendetWerden(klasse, bereitsGemeldet)) {
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
                rawNoticeText: candidate.rawNoticeText,
              },
              kennzahlenSummary,
              klasse
            )
          : formatTopTrefferMessage(listingSummary, kennzahlenSummary, klasse);

      // Reihenfolge ist wesentlich: erst senden, dann protokollieren. Wirft
      // der Versand, entsteht KEINE Zeile -- und der naechste Lauf sieht das
      // Objekt weiterhin als "noch nie gemeldet" und holt es nach. Genau das
      // war der Fehler der alten changed-Logik.
      await schlafe(TELEGRAM_SENDEABSTAND_MS);
      await sendTelegramMessage(telegramConfig, text);
      await sendeMedien(telegramConfig, candidate);
      await logNotification(supabase, diff.listingId, klasse, {
        ...kennzahlenSummary,
        priceCents: candidate.priceCents,
      });
    }
  }

  if (diff.priceDropped && diff.previousPriceCents !== null) {
    await schlafe(TELEGRAM_SENDEABSTAND_MS);
    await sendTelegramMessage(
      telegramConfig,
      formatPreisaenderungMessage(listingSummary, diff.previousPriceCents, candidate.priceCents)
    );
    await logNotification(supabase, diff.listingId, "preisaenderung", {
      altPreisCents: diff.previousPriceCents,
      neuPreisCents: candidate.priceCents,
    });
  }
}
```

**Der umschließende `try/catch` entfällt ersatzlos.** Er hat Sendefehler verschluckt und damit die Meldung dauerhaft verloren. Die Fehlerisolation je Kandidat übernimmt weiterhin `verarbeiteKandidatIsoliert` in `main.ts` — dort wird der Fehler geloggt, ohne dass eine `notifications`-Zeile entsteht.

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `cd C:\immo-radar\scraper && npx vitest run lib/pipeline.test.ts`
Expected: PASS, alle bestehenden Tests weiterhin grün plus 5 neue.

- [ ] **Step 5: Commit**

```bash
cd C:\immo-radar
git add scraper/lib/pipeline.ts scraper/lib/pipeline.test.ts
git commit -m "fix(scraper): Meldung haengt an der Meldeklasse statt am Versions-Diff

Ein fehlgeschlagener Telegram-Versand hinterlaesst keine notifications-Zeile
mehr und wird daher vom naechsten Lauf nachgeholt. Zusaetzlich meldet sich
ein Objekt erneut, wenn es von pruefkandidat auf top_treffer aufsteigt."
```

---

### Task 12: `main.ts` — Sweep, Detailerfassung, Abgleich, Löschung

**Files:**
- Modify: `scraper/main.ts`

**Interfaces:**
- Consumes: `sweepZvgPortal`, `erfasseZvgDetails` (aus `./scrapers/zvg-portal/index.js`), `sweepImmowelt`, `erfasseImmoweltDetails` (aus `./scrapers/immowelt/index.js`), alle Funktionen aus `./lib/bestandDb.js`, `pruefeMengenplausibilitaet` (aus `./lib/plausibilitaet.js`), `ermittleAbgaenge`, `ermittleRueckkehrer`, `waehleDetailKandidaten` (aus `./lib/bestand.js`), `hoechsteGemeldeteKlasse`, `logNotification` (aus `./lib/db.js`), `formatAbgangMessage`, `formatSweepWarnungMessage`, `sendTelegramMessage` (aus `./lib/telegram.js`).
- Produces: ausführbares Skript, kein exportiertes Interface.

- [ ] **Step 1: `main.ts` vollständig ersetzen**

```ts
import { sweepImmowelt, erfasseImmoweltDetails } from "./scrapers/immowelt/index.js";
import { sweepZvgPortal, erfasseZvgDetails } from "./scrapers/zvg-portal/index.js";
import { processCandidate, type PipelineCandidate } from "./lib/pipeline.js";
import {
  ermittleAbgaenge,
  ermittleRueckkehrer,
  waehleDetailKandidaten,
  type SweepErgebnis,
} from "./lib/bestand.js";
import { pruefeMengenplausibilitaet } from "./lib/plausibilitaet.js";
import {
  ladeBekannteListings,
  ladeVeralteteExternalIds,
  markiereVerschwunden,
  hebeVerschwundenAuf,
  aktualisiereLastSeen,
  loescheAbgelaufene,
  speichereSweepLauf,
  ladeSweepHistorie,
} from "./lib/bestandDb.js";
import { hoechsteGemeldeteKlasse, logNotification } from "./lib/db.js";
import {
  sendTelegramMessage,
  formatAbgangMessage,
  formatSweepWarnungMessage,
  type TelegramConfig,
} from "./lib/telegram.js";
import { sb } from "./lib/supabase.js";

/** Detailseiten aelter als das werden neu geholt. */
const DETAIL_MAX_ALTER_TAGE = 7;
const TELEGRAM_SENDEABSTAND_MS = 500;

function schlafe(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verarbeitet einen Kandidaten und faengt Fehler ab, damit ein einzelner
 * Ausreisser (DB-Constraint, transienter 5xx, fehlgeschlagener Telegram-
 * Versand) nicht den gesamten Lauf abbricht.
 */
async function verarbeiteKandidatIsoliert(
  telegramConfig: TelegramConfig,
  candidate: PipelineCandidate
): Promise<void> {
  try {
    await processCandidate(sb, telegramConfig, candidate);
  } catch (err) {
    console.error(
      `Kandidat fehlgeschlagen, uebersprungen [${candidate.source} · ${candidate.externalId} · ${candidate.url}]:`,
      err
    );
  }
}

/**
 * Abgleich einer Quelle: Rueckkehrer entmarkieren, Abgaenge markieren und
 * melden. Laeuft nur, wenn das Plausibilitaetstor offen ist.
 */
async function gleicheBestandAb(
  telegramConfig: TelegramConfig,
  sweep: SweepErgebnis
): Promise<void> {
  const bekannte = await ladeBekannteListings(sb, sweep.source);
  const jetzt = new Date();

  // Rueckkehrer zuerst: das ist ungefaehrlich und darf auch ohne offenes
  // Plausibilitaetstor passieren.
  const rueckkehrer = ermittleRueckkehrer(sweep, bekannte);
  await hebeVerschwundenAuf(sb, rueckkehrer.map((l) => l.id));
  if (rueckkehrer.length > 0) {
    console.log(`${sweep.source}: ${rueckkehrer.length} Objekte sind zurueck.`);
  }

  // last_seen fuer alles, was der Sweep gesehen hat -- auch fuer Objekte
  // ohne neue Detailerfassung.
  await aktualisiereLastSeen(
    sb,
    bekannte.filter((l) => sweep.gesehene.has(l.externalId)).map((l) => l.id),
    jetzt
  );

  const historie = await ladeSweepHistorie(sb, sweep.source);
  const pruefung = pruefeMengenplausibilitaet({
    gesehene: sweep.gesehene.size,
    gemeldeteTreffer: sweep.gemeldeteTreffer,
    historie,
    vollstaendig: sweep.vollstaendig,
  });

  if (!pruefung.loeschenErlaubt) {
    console.warn(`${sweep.source}: Loeschung ausgesetzt — ${pruefung.grund}`);
    await schlafe(TELEGRAM_SENDEABSTAND_MS);
    await sendTelegramMessage(
      telegramConfig,
      formatSweepWarnungMessage(
        sweep.source,
        sweep.gesehene.size,
        pruefung.erwartet,
        pruefung.grund ?? ""
      )
    );
    return;
  }

  const abgaenge = ermittleAbgaenge(sweep, bekannte);
  if (abgaenge.length === 0) return;

  await markiereVerschwunden(sb, abgaenge.map((l) => l.id), jetzt);
  console.log(`${sweep.source}: ${abgaenge.length} Objekte als verschwunden markiert.`);

  // Abgangsmeldung nur fuer Objekte, die es frueher in den Chat geschafft
  // haben. Alles andere waere bei mehreren hundert Objekten Dauerfeuer.
  for (const abgang of abgaenge) {
    try {
      const gemeldet = await hoechsteGemeldeteKlasse(sb, abgang.id);
      if (gemeldet === "keine") continue;
      const { data } = await sb
        .from("listing_versions")
        .select("title, city, zip_code, price_cents, units")
        .eq("listing_id", abgang.id)
        .order("scanned_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) continue;

      await schlafe(TELEGRAM_SENDEABSTAND_MS);
      await sendTelegramMessage(
        telegramConfig,
        formatAbgangMessage({
          title: (data.title as string) ?? "Objekt",
          url: "",
          city: (data.city as string) ?? "",
          zipCode: (data.zip_code as string) ?? "",
          priceCents: Number(data.price_cents),
          units: (data.units as number | null) ?? null,
        })
      );
      await logNotification(sb, abgang.id, "verschwunden", { externalId: abgang.externalId });
    } catch (err) {
      console.error(`Abgangsmeldung fehlgeschlagen [${abgang.externalId}]:`, err);
    }
  }
}

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

  const detailGrenze = new Date(Date.now() - DETAIL_MAX_ALTER_TAGE * 24 * 60 * 60 * 1000);

  // --- Immowelt ---------------------------------------------------------
  console.log("Immowelt: Sweep gestartet...");
  const immowelt = await sweepImmowelt();
  await speichereSweepLauf(sb, immowelt.sweep);

  const immoweltBekannt = new Set(
    (await ladeBekannteListings(sb, "immowelt")).map((l) => l.externalId)
  );
  const immoweltVeraltet = new Set(await ladeVeralteteExternalIds(sb, "immowelt", detailGrenze));
  const immoweltAuswahl = waehleDetailKandidaten(
    [...immowelt.sweep.gesehene],
    immoweltBekannt,
    immoweltVeraltet
  );
  console.log(`Immowelt: ${immoweltAuswahl.length} Detailseiten zu holen.`);

  for (const objekt of await erfasseImmoweltDetails(immowelt.zusammenfassungen, immoweltAuswahl)) {
    await verarbeiteKandidatIsoliert(telegramConfig, {
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
      photoUrls: objekt.photoUrls,
    });
  }

  // --- ZVG-Portal -------------------------------------------------------
  console.log("ZVG-Portal: Sweep gestartet...");
  const zvg = await sweepZvgPortal();
  await speichereSweepLauf(sb, zvg.sweep);

  const zvgBekannt = new Set(
    (await ladeBekannteListings(sb, "zvg-portal")).map((l) => l.externalId)
  );
  const zvgVeraltet = new Set(await ladeVeralteteExternalIds(sb, "zvg-portal", detailGrenze));
  const zvgAuswahl = waehleDetailKandidaten([...zvg.sweep.gesehene], zvgBekannt, zvgVeraltet);
  console.log(`ZVG-Portal: ${zvgAuswahl.length} Detailseiten zu holen.`);

  for (const termin of await erfasseZvgDetails(zvg.zusammenfassungen, zvgAuswahl)) {
    await verarbeiteKandidatIsoliert(telegramConfig, {
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
      sourceDataGaps: termin.dataGaps,
      attachments: termin.attachments,
    });
  }

  // --- Bestandsfuehrung -------------------------------------------------
  for (const sweep of [immowelt.sweep, zvg.sweep]) {
    try {
      await gleicheBestandAb(telegramConfig, sweep);
    } catch (err) {
      console.error(`Bestandsabgleich fehlgeschlagen [${sweep.source}]:`, err);
    }
  }

  try {
    const geloescht = await loescheAbgelaufene(sb, new Date());
    if (geloescht > 0) console.log(`${geloescht} Objekte nach Ablauf der Karenz geloescht.`);
  } catch (err) {
    console.error("Loeschung fehlgeschlagen:", err);
  }

  console.log("Lauf abgeschlossen.");
}

main().catch((err) => {
  console.error("Pipeline-Fehler:", err);
  process.exitCode = 1;
});
```

- [ ] **Step 2: TypeScript-Check über das ganze Projekt**

Run: `cd C:\immo-radar\scraper && npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Gesamte Testsuite laufen lassen**

Run: `cd C:\immo-radar\scraper && npm test`
Expected: alle Tests PASS.

- [ ] **Step 4: Commit**

```bash
cd C:\immo-radar
git add scraper/main.ts
git commit -m "feat(scraper): Lauf aus Sweep, selektiver Detailerfassung, Abgleich und Loeschung"
```

---

### Task 13: README

**Files:**
- Create: `README.md`

**Interfaces:** keine.

Begründung: Diese Sitzung musste den Projektstand aus `git log` rekonstruieren, weil es keinen Einstiegspunkt gibt.

- [ ] **Step 1: `README.md` schreiben**

```markdown
# immo-radar

Findet Mehrfamilienhäuser (ab 3 Einheiten) mit belastbarer Rendite und meldet
sie per Telegram. Zwei Quellen: **Immowelt** (regulärer Verkauf) und das
**ZVG-Portal** (Zwangsversteigerungen).

## Aufbau

```
scraper/
  main.ts              Orchestrierung: Sweep -> Details -> Abgleich -> Löschung
  lib/
    metrics.ts         Kennzahlen (NOI, Faktor, DSCR, Beleihungswert)
    rentEstimate.ts    Jahreskaltmiete: angegeben / regional / bundesweit
    grunderwerbsteuer.ts  Steuersatz + Bundesland je PLZ
    meldung.ts         Meldeklassen top_treffer / pruefkandidat + Rangfolge
    bestand.ts         Abgleichlogik: Abgänge, Rückkehrer, Karenz
    plausibilitaet.ts  Tor vor der Löschung (Mengenprüfung)
    pipeline.ts        Ein Kandidat: bewerten, speichern, ggf. melden
    db.ts              listings / listing_versions / notifications
    bestandDb.ts       Bestandsführung + sweep_runs
    telegram.ts        Nachrichtenformate und Versand
    karte.ts           Lagekarte als PNG
  scrapers/
    immowelt/          list / detail / index (Playwright)
    zvg-portal/        list / detail / index (Playwright)
schema.sql             Datenbankschema (Supabase/Postgres)
docs/superpowers/      Specs und Implementierungspläne
```

## Betrieb

Ein Lauf alle 3 Stunden über GitHub Actions (`.github/workflows/scrape.yml`).

Lokal:

```bash
cd scraper
npm ci
npx playwright install chromium
npm run scrape
```

Benötigte Umgebungsvariablen (lokal in `scraper/.env`, in CI als Repo-Secrets):
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

Tests: `cd scraper && npm test`

## Wie ein Lauf arbeitet

1. **Sweep** je Quelle — nur Ergebnislisten, liefert die vollständige Ist-Menge
   aller `externalId`s. Wird in `sweep_runs` protokolliert.
2. **Detailerfassung** — nur für neue Objekte und solche, deren letzte
   Erfassung über 7 Tage her ist.
3. **Bewertung und Meldung** — gesendet wird, wenn die Meldeklasse eines
   Objekts steigt. Die `notifications`-Zeile entsteht erst nach bestätigtem
   Versand, damit ein fehlgeschlagener Versand im nächsten Lauf nachgeholt wird.
4. **Abgleich** — was im vollständigen Sweep fehlt, bekommt `disappeared_at`.
   Vorher muss die Menge plausibel sein (siehe unten).
5. **Löschung** — nach 2 Tagen Karenz wird hart gelöscht.

## Warum nicht sofort gelöscht wird

Ein Lauf darf nur dann auf Abwesenheit hin löschen, wenn er das ganze Angebot
gesehen hat. Drei Sicherungen:

- **Abdeckungsprotokoll:** Bricht der Sweep für ein Bundesland ab, bleiben
  dessen Objekte unangetastet.
- **Selbstkonsistenz:** Weist das Portal eine Trefferzahl aus, muss sie zur
  eingesammelten Menge passen. (ZVG nennt keine — dort entfällt die Prüfung.)
- **Historienvergleich:** Die Menge muss innerhalb von 25 % des Medians der
  letzten zehn Läufe liegen, und es müssen mindestens drei Referenzläufe
  vorliegen. Sonst: keine Löschung, stattdessen eine Warnung per Telegram.

Hinzugefügt wird dagegen immer — gebremst wird nur das Löschen.

## Meldeklassen

| Klasse | Bedeutung |
|---|---|
| 🎯 `top_treffer` | Schwellen erfüllt **und** die Miete ist belegt |
| 🔍 `pruefkandidat` | Schwellen erfüllt, aber die Miete ist geschätzt — Faktor und DSCR sind entsprechend unsicher |
| 💶 `preisaenderung` | Der Preis ist gefallen |
| ❌ `verschwunden` | Ein zuvor gemeldetes Objekt ist aus dem Angebot verschwunden |
```

- [ ] **Step 2: Commit**

```bash
cd C:\immo-radar
git add README.md
git commit -m "docs: README mit Aufbau, Betrieb und Loesch-Sicherungen"
```

---

### Task 14: End-to-End-Verifikation

**Manueller Verifikationslauf gegen die echten Dienste.**

**Files:** keine neuen — reine Verifikation, ggf. Korrekturen.

- [ ] **Step 1: Erster Lauf**

Run: `cd C:\immo-radar\scraper && npm run scrape`

Erwartet: Log zeigt `Immowelt: Sweep gestartet...`, `ZVG-Sweep <land>: N Termine.` für alle 16 Länder, die Zahl zu holender Detailseiten, und `Lauf abgeschlossen.` ohne unbehandelten Fehler. **Laufzeit notieren.** Es wird noch nichts gelöscht (weniger als drei Referenzläufe) — im Log steht für beide Quellen `Loeschung ausgesetzt — Erst … Referenzläufen`.

Rechne mit einem Nachhol-Schub an Telegram-Nachrichten: Objekte ohne `notifications`-Zeile gelten als nie gemeldet. Das ist einmalig und beabsichtigt.

- [ ] **Step 2: Determinismus prüfen — das entscheidende Kriterium**

Den Lauf ein zweites Mal starten, ohne dazwischen etwas zu ändern:

Run: `cd C:\immo-radar\scraper && npm run scrape`

Dann in Supabase:

```sql
select source, gesehene_objekte, vollstaendig, started_at
from sweep_runs order by started_at desc limit 6;
```

**Erwartet: `gesehene_objekte` je Quelle weicht zwischen zwei direkt
aufeinanderfolgenden Läufen um deutlich weniger als 25 % ab.** Weicht sie
stark ab, ist die Erfassung nicht deterministisch — dann NICHT weitermachen,
sondern die Ursache suchen (Selektor instabil, Pagination bricht früh ab,
Portal liefert wechselnde Mengen). Die Löschung darf erst scharf gehen, wenn
dieses Kriterium erfüllt ist.

Beim zweiten Lauf sollte außerdem die Zahl zu holender Detailseiten nahe null
liegen — sonst greift die Auffrischungsregel nicht wie gedacht.

- [ ] **Step 3: Dritten Lauf abwarten und Löschung beobachten**

Nach dem dritten erfolgreichen Lauf greift die Historienprüfung. Im Log ist
jetzt entweder `N Objekte als verschwunden markiert.` zu sehen oder gar keine
Löschmeldung (wenn nichts verschwunden ist). Eine Warnung `Loeschung
ausgesetzt` an dieser Stelle bedeutet, dass die Mengen schwanken — Ursache
suchen, nicht die Toleranz hochsetzen.

- [ ] **Step 4: Datenbank stichprobenartig prüfen**

```sql
-- Markierte Abgaenge und ihr Alter
select source, external_id, disappeared_at, now() - disappeared_at as alter
from listings where disappeared_at is not null order by disappeared_at;

-- Meldehistorie: kommt pruefkandidat vor?
select kind, count(*) from notifications group by kind;

-- Wurde die Detailerfassung wirklich selektiv?
select source, count(*) filter (where last_detail_at > now() - interval '1 hour') as frisch,
       count(*) as gesamt
from listings group by source;
```

Erwartet: `notifications` enthält sowohl `top_treffer` als auch
`pruefkandidat`; `frisch` ist beim zweiten Lauf deutlich kleiner als `gesamt`.

- [ ] **Step 5: Telegram sichten**

Im Chat prüfen: Prüfkandidaten tragen die Überschrift `🔍 PRÜFKANDIDAT` samt
Hinweis auf die geschätzte Miete; Top-Treffer unverändert `🎯`. Falls eine
Sweep-Warnung kam, nennt sie Quelle, Menge, Erwartungswert und Grund.

- [ ] **Step 6: Workflow-Laufzeit prüfen**

Die in Step 1 notierte Laufzeit gegen `timeout-minutes: 40` in
`.github/workflows/scrape.yml` halten. Der Sweep ohne Detailseiten sollte den
Lauf deutlich verkürzt haben — liegt er stabil unter 15 Minuten, das Timeout
entsprechend senken und den kommentierten Grund im Workflow aktualisieren.

- [ ] **Step 7: Korrekturen committen**

```bash
cd C:\immo-radar
git add -A
git commit -m "fix(scraper): Korrekturen aus der End-to-End-Verifikation"
git push
```

Teilprojekt 1 ist damit abgeschlossen. Als Nächstes: Teilprojekt 2
(Mietqualität — `rent_estimates` als Korpus, ZVG-Mieternte).
