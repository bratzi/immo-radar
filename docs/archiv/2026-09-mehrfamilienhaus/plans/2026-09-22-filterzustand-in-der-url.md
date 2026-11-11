# Filterzustand in der URL — Implementierungsplan (B7-1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Filterzustand des Dashboards und die Kartengröße stehen in der Adresszeile, sodass eine Auswahl verschickbar, neuladefest und mit dem Zurück-Knopf lösbar ist.

**Architecture:** Die URL ist die Quelle, kein Spiegel. Der Filter wird über `useSyncExternalStore` aus `location.search` abgeleitet; ein einziges reines Modul übersetzt zwischen `Filter` und Suchstring. Ein zweites reines Stück (`leergrund`) beantwortet, warum eine Liste leer ist.

**Tech Stack:** React 18 (`useSyncExternalStore`), TypeScript, Vitest. **Keine neue Abhängigkeit** — `web/` hat genau zwei Laufzeitabhängigkeiten (`react`, `react-dom`), und das bleibt so.

**Spec:** `docs/superpowers/specs/2026-09-22-filterzustand-in-der-url-design.md`

## Global Constraints

- **Alle Bezeichner, Kommentare und Testnamen auf Deutsch.** Umlaute in Code und Kommentaren werden umschrieben (`ae`, `oe`, `ue`, `sz`), in Markdown nicht.
- **Kein neues Paket**, weder Laufzeit noch Entwicklung. Insbesondere kein Router, kein jsdom, keine Testing-Library.
- **Kein Komponententest.** `web/` hat 14 Testdateien, alle reine Logik (`.ts`). Entscheidungen wandern in reine Funktionen, Komponenten bleiben dünn.
- **`ausSuchstring` wirft nie.** Die Adresse ist von Hand veränderbar.
- **Der Filter hat 22 Felder** (nachgezählt über `LEERER_FILTER`, 2026-09-22).
- **Nicht anfassen:** `Bereich.tsx` (der `leertext`-Mechanismus wird benutzt, nicht geändert), `Karte.tsx`, der Snapshot-Vertrag.
- Nach jeder Aufgabe: `cd web && npx tsc --noEmit && npx vitest run` — beides muss sauber sein.

---

### Task 1: Das Format

**Files:**
- Create: `web/src/logik/filterUrl.ts`
- Test: `web/src/logik/filterUrl.test.ts`

**Interfaces:**
- Consumes: `Filter`, `LEERER_FILTER` aus `./filter.ts`; `Kartengroesse` aus `./karte.ts`
- Produces:
  - `type Feldart = "liste" | "zahl" | "schalter" | "text"`
  - `const FELDER: Record<keyof Filter, { schluessel: string; art: Feldart }>`
  - `function zuSuchstring(filter: Filter, kartengroesse: Kartengroesse): string`
  - `function ausSuchstring(such: string): { filter: Filter; kartengroesse: Kartengroesse }`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Create `web/src/logik/filterUrl.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LEERER_FILTER, type Filter } from "./filter.ts";
import type { Kartengroesse } from "./karte.ts";
import { FELDER, ausSuchstring, zuSuchstring } from "./filterUrl.ts";

/**
 * Ein Filter, in dem JEDES Feld gesetzt ist -- abgeleitet aus `FELDER` und
 * NICHT von Hand aufgezaehlt. Kommt ein 23. Feld dazu, landet es ohne Zutun
 * im Hin- und Rueckweg. Eine Handliste waere genau der Test, der ein
 * vergessenes Feld nicht findet.
 */
function vollerFilter(): Filter {
  const ziel = { ...LEERER_FILTER } as Record<string, unknown>;
  for (const [feld, { art }] of Object.entries(FELDER)) {
    if (art === "liste") ziel[feld] = ["eins", "zwei"];
    else if (art === "schalter") ziel[feld] = true;
    else if (art === "zahl") ziel[feld] = 42;
    else ziel[feld] = "2026-01-01";
  }
  return ziel as Filter;
}

describe("zuSuchstring und ausSuchstring", () => {
  it("fuehrt jedes gesetzte Feld unveraendert hin und zurueck", () => {
    const filter = vollerFilter();
    const kartengroesse: Kartengroesse = "medianDscr";
    expect(ausSuchstring(zuSuchstring(filter, kartengroesse))).toEqual({
      filter,
      kartengroesse,
    });
  });

  it("kennt jedes Feld des Filters", () => {
    // Zweite Wache neben dem Typpruefer: Sie haelt auch dann, wenn jemand
    // `FELDER` lockerer typisiert.
    expect(Object.keys(FELDER).sort()).toEqual(Object.keys(LEERER_FILTER).sort());
  });

  it("vergibt jeden Schluessel nur einmal", () => {
    const schluessel = Object.values(FELDER).map((f) => f.schluessel);
    expect(new Set(schluessel).size).toBe(schluessel.length);
  });

  it("ergibt fuer den leeren Filter eine leere Adresse", () => {
    // Sonst truege jede frische Seite Ballast.
    expect(zuSuchstring(LEERER_FILTER, "objekte")).toBe("");
  });

  it("laesst Kommas in Listen unveraendert stehen", () => {
    // Lesbarkeit: URLSearchParams wuerde "%2C" schreiben.
    const filter = { ...LEERER_FILTER, stufen: ["S2", "S3"] as Filter["stufen"] };
    expect(zuSuchstring(filter, "objekte")).toBe("st=S2,S3");
  });

  it("ignoriert einen unbekannten Schluessel, ohne den Rest zu verlieren", () => {
    const { filter } = ausSuchstring("st=S2&voellig=egal");
    expect(filter.stufen).toEqual(["S2"]);
  });

  it("wirft bei einer unlesbaren Zahl nicht, sondern nimmt den Standard", () => {
    const { filter } = ausSuchstring("kpv=abc");
    expect(filter.kaufpreisVon).toBeNull();
  });

  it("faellt bei unbekannter Kartengroesse auf objekte zurueck", () => {
    expect(ausSuchstring("karte=gibtesnicht").kartengroesse).toBe("objekte");
  });
});
```

- [ ] **Step 2: Den Test laufen lassen und rot sehen**

Run: `cd web && npx vitest run src/logik/filterUrl.test.ts`
Expected: FAIL — `Failed to resolve import "./filterUrl.ts"`.

- [ ] **Step 3: Das Modul schreiben**

Create `web/src/logik/filterUrl.ts`:

```ts
/**
 * Uebersetzt zwischen `Filter` und dem Suchteil der Adresse (B7-1).
 *
 * REIN, OHNE DOM -- damit ohne Browser pruefbar. Wer `history` anfassen
 * will, tut das im Hook `useFilterUrl`, nicht hier.
 *
 * KURZ DURCH WEGLASSEN: Geschrieben wird nur, was vom `LEERER_FILTER`
 * abweicht. Ohne Auswahl bleibt die Adresse ganz sauber.
 *
 * WIRFT NIE. Die Adresse ist von Hand veraenderbar, und eine abgestuerzte
 * Oberflaeche ist die schlechteste Antwort auf einen Tippfehler.
 */
import { LEERER_FILTER, type Filter } from "./filter.ts";
import type { Kartengroesse } from "./karte.ts";

export type Feldart = "liste" | "zahl" | "schalter" | "text";

/**
 * Feld -> kurzer Schluessel und Art.
 *
 * `Record<keyof Filter, ...>` ist die erste Wache: Ein neues Filterfeld
 * uebersetzt NICHT, bevor es hier einen Schluessel hat -- der Typpruefer
 * meldet die fehlende Zeile, kein Test muss es merken.
 *
 * Die Art muss ausdrueckich dastehen, weil `LEERER_FILTER` sie nicht
 * hergibt: `kaufpreisVon` und `terminVon` sind dort beide `null`.
 *
 * Exportiert fuer den Test, der daraus einen vollstaendig gesetzten Filter
 * ableitet.
 */
export const FELDER: Record<keyof Filter, { schluessel: string; art: Feldart }> = {
  bundeslaender: { schluessel: "bl", art: "liste" },
  plzZweisteller: { schluessel: "plz", art: "liste" },
  quellen: { schluessel: "q", art: "liste" },
  stufen: { schluessel: "st", art: "liste" },
  zustaende: { schluessel: "zu", art: "liste" },
  datenluecken: { schluessel: "dl", art: "liste" },
  kaufpreisVon: { schluessel: "kpv", art: "zahl" },
  kaufpreisBis: { schluessel: "kpb", art: "zahl" },
  wohnflaecheVon: { schluessel: "wfv", art: "zahl" },
  wohnflaecheBis: { schluessel: "wfb", art: "zahl" },
  grundstueckVon: { schluessel: "gsv", art: "zahl" },
  grundstueckBis: { schluessel: "gsb", art: "zahl" },
  baujahrVon: { schluessel: "bjv", art: "zahl" },
  baujahrBis: { schluessel: "bjb", art: "zahl" },
  einheitenVon: { schluessel: "ehv", art: "zahl" },
  einheitenBis: { schluessel: "ehb", art: "zahl" },
  nurUeberMeldeschwelle: { schluessel: "meld", art: "schalter" },
  nurPreissenkungen: { schluessel: "senk", art: "schalter" },
  nurSchwellenwechsler: { schluessel: "wech", art: "schalter" },
  terminNur: { schluessel: "tn", art: "schalter" },
  terminVon: { schluessel: "tv", art: "text" },
  terminBis: { schluessel: "tb", art: "text" },
};

const KARTE_SCHLUESSEL = "karte";
const KARTE_STANDARD: Kartengroesse = "objekte";
const KARTENGROESSEN: readonly Kartengroesse[] = ["objekte", "topTreffer", "medianDscr"];

export function zuSuchstring(filter: Filter, kartengroesse: Kartengroesse): string {
  const teile = new URLSearchParams();
  for (const [feld, { schluessel, art }] of Object.entries(FELDER)) {
    const wert = (filter as Record<string, unknown>)[feld];
    if (art === "liste") {
      const liste = wert as string[];
      if (liste.length > 0) teile.set(schluessel, liste.join(","));
    } else if (art === "schalter") {
      if (wert === true) teile.set(schluessel, "1");
    } else if (wert !== null && wert !== undefined) {
      teile.set(schluessel, String(wert));
    }
  }
  if (kartengroesse !== KARTE_STANDARD) teile.set(KARTE_SCHLUESSEL, kartengroesse);
  // URLSearchParams schreibt "%2C" fuer das Komma. Ein Komma ist im
  // Suchteil erlaubt, und die Adresse soll lesbar bleiben. Beim Lesen ist
  // beides gleichwertig, URLSearchParams nimmt das Komma unveraendert.
  return teile.toString().replaceAll("%2C", ",");
}

export function ausSuchstring(such: string): {
  filter: Filter;
  kartengroesse: Kartengroesse;
} {
  const teile = new URLSearchParams(such);
  const filter = { ...LEERER_FILTER };
  const ziel = filter as Record<string, unknown>;

  for (const [feld, { schluessel, art }] of Object.entries(FELDER)) {
    const roh = teile.get(schluessel);
    if (roh === null) continue;
    if (art === "liste") {
      ziel[feld] = roh
        .split(",")
        .map((eintrag) => eintrag.trim())
        .filter((eintrag) => eintrag !== "");
    } else if (art === "schalter") {
      ziel[feld] = roh === "1";
    } else if (art === "zahl") {
      const zahl = Number(roh);
      // Ein unlesbarer Wert faellt auf den Standard, statt NaN zu setzen --
      // NaN vergliche sich spaeter stumm mit allem als falsch.
      ziel[feld] = roh.trim() !== "" && Number.isFinite(zahl) ? zahl : null;
    } else {
      ziel[feld] = roh;
    }
  }

  const karte = teile.get(KARTE_SCHLUESSEL);
  const kartengroesse = KARTENGROESSEN.includes(karte as Kartengroesse)
    ? (karte as Kartengroesse)
    : KARTE_STANDARD;

  return { filter, kartengroesse };
}
```

- [ ] **Step 4: Den Test laufen lassen und gruen sehen**

Run: `cd web && npx vitest run src/logik/filterUrl.test.ts`
Expected: PASS, 8 Tests.

- [ ] **Step 5: Beweisen, dass der Hin- und Rueckweg rot werden KANN**

Eine Zeile aus `FELDER` voruebergehend entfernen (z. B. `baujahrBis`) und den Test erneut laufen lassen.
Expected: FAIL in „kennt jedes Feld des Filters" **und** im Hin- und Rueckweg. Danach die Zeile wieder einsetzen.

Ein Test, der nie rot war, hat nichts bewiesen.

- [ ] **Step 6: Gate und Commit**

```bash
cd web && npx tsc --noEmit && npx vitest run
git add web/src/logik/filterUrl.ts web/src/logik/filterUrl.test.ts
git commit -m "feat(web): Filter und Kartengroesse uebersetzen in die Adresse und zurueck"
```

---

### Task 2: Warum die Liste leer ist

**Files:**
- Modify: `web/src/logik/filter.ts` (anfuegen, nichts umbauen)
- Test: `web/src/logik/filter.test.ts` (anfuegen)

**Interfaces:**
- Consumes: nichts aus Task 1
- Produces:
  - `type Leergrund = "kein_bestand" | "filter_trifft_nichts"`
  - `function leergrund(gefiltert: number, gesamt: number, filterAktiv: boolean): Leergrund | null`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

An `web/src/logik/filter.test.ts` anfuegen (und `leergrund` in den bestehenden Import aus `./filter.ts` aufnehmen):

```ts
describe("leergrund", () => {
  // WARUM: Eine leere Liste hat zwei sehr verschiedene Gruende. "Es gibt
  // nichts" und "deine Auswahl trifft nichts" duerfen nicht denselben Satz
  // bekommen -- sonst sieht ein verschickter Link, der ins Leere zeigt, aus
  // wie ein leerer Bestand.

  it("nennt keinen Grund, solange etwas uebrig bleibt", () => {
    expect(leergrund(3, 100, true)).toBeNull();
  });

  it("nennt den leeren Bestand, wenn es ueberhaupt nichts gibt", () => {
    expect(leergrund(0, 0, false)).toBe("kein_bestand");
  });

  it("nennt den leeren Bestand auch dann, wenn ein Filter aktiv ist", () => {
    // Bei null Objekten insgesamt ist der Filter nicht die Ursache.
    expect(leergrund(0, 0, true)).toBe("kein_bestand");
  });

  it("nennt den Filter, wenn es Objekte gibt und die Auswahl nichts trifft", () => {
    expect(leergrund(0, 100, true)).toBe("filter_trifft_nichts");
  });

  it("nennt den leeren Bestand, wenn ohne Filter nichts uebrig bleibt", () => {
    // Kann der Bereich selbst ausschliessen (z. B. "nur mit Rangzahl").
    expect(leergrund(0, 100, false)).toBe("kein_bestand");
  });
});
```

- [ ] **Step 2: Den Test laufen lassen und rot sehen**

Run: `cd web && npx vitest run src/logik/filter.test.ts`
Expected: FAIL — `leergrund is not a function`.

- [ ] **Step 3: Die Funktion schreiben**

An `web/src/logik/filter.ts` anfuegen:

```ts
/** Warum eine Liste leer ist. `null`, solange sie es nicht ist. */
export type Leergrund = "kein_bestand" | "filter_trifft_nichts";

/**
 * Unterscheidet die beiden Gruende fuer eine leere Liste.
 *
 * WARUM ES DIESE FUNKTION GIBT (B7-1): Seit der Filterzustand in der Adresse
 * steht, kann ein verschickter Link auf 0 Objekte zeigen. Der Empfaenger
 * darf das nicht als leeren Bestand lesen. Die Entscheidung steht hier und
 * nicht in der Komponente, damit sie ohne Browser pruefbar ist -- `web/`
 * hat keine Komponententests.
 */
export function leergrund(
  gefiltert: number,
  gesamt: number,
  filterAktiv: boolean
): Leergrund | null {
  if (gefiltert > 0) return null;
  if (gesamt === 0) return "kein_bestand";
  return filterAktiv ? "filter_trifft_nichts" : "kein_bestand";
}
```

- [ ] **Step 4: Den Test laufen lassen und gruen sehen**

Run: `cd web && npx vitest run src/logik/filter.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate und Commit**

```bash
cd web && npx tsc --noEmit && npx vitest run
git add web/src/logik/filter.ts web/src/logik/filter.test.ts
git commit -m "feat(web): leergrund unterscheidet leeren Bestand von leerer Auswahl"
```

---

### Task 3: Der Hook und die Verdrahtung

**Files:**
- Create: `web/src/logik/useFilterUrl.ts`
- Modify: `web/src/App.tsx:121-122` (die beiden `useState`), `:253` (`setzeFilter`) und `:277` (`setzeGroesse`)

**Interfaces:**
- Consumes: `zuSuchstring`, `ausSuchstring` aus Task 1
- Produces:
  - `type Adressmodus = "schritt" | "ersetzen"`
  - `function useFilterUrl(): { filter: Filter; kartengroesse: Kartengroesse; setzeFilter: (filter: Filter, modus?: Adressmodus) => void; setzeKartengroesse: (groesse: Kartengroesse) => void }`

**Hinweis fuer die ausfuehrende Person:** Diese Aufgabe hat **keinen automatischen Test** — `web/` hat keine Komponententests, und das soll sich in diesem Vorgang nicht aendern (Global Constraints). Der Beweis sind `tsc`, die bestehenden 203 Tests und eine Handprobe im laufenden Dashboard. Das ist ausdruecklich so geplant und kein vergessener Test.

- [ ] **Step 1: Den Hook schreiben**

Create `web/src/logik/useFilterUrl.ts`:

```ts
/**
 * Die Adresse ist die Quelle des Filters, nicht sein Spiegel (B7-1).
 *
 * WARUM NICHT SPIEGELN: Ein Spiegel sind zwei Staende desselben Wertes, und
 * zwei Staende laufen auseinander -- derselbe Fehler wie bei
 * `DSCR_MELDESCHWELLE` (BACKLOG A17). Dazu kaeme die Schleifengefahr
 * zwischen Effekt und Ereignis.
 *
 * DIE EINZIGE STELLE, DIE `history` ANFASST. Das Format liegt in
 * `filterUrl.ts` und weiss von Fenstern nichts.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Filter } from "./filter.ts";
import type { Kartengroesse } from "./karte.ts";
import { ausSuchstring, zuSuchstring } from "./filterUrl.ts";

export type Adressmodus = "schritt" | "ersetzen";

const hoerer = new Set<() => void>();

/**
 * `pushState` und `replaceState` loesen KEIN `popstate` aus -- das tut nur
 * der Browser bei Vor und Zurueck. Eigene Aenderungen muessen deshalb selbst
 * gemeldet werden, sonst zeigt die Oberflaeche den alten Filter.
 */
function melde(): void {
  for (const rueckruf of hoerer) rueckruf();
}

function abonniere(rueckruf: () => void): () => void {
  hoerer.add(rueckruf);
  window.addEventListener("popstate", melde);
  return () => {
    hoerer.delete(rueckruf);
    if (hoerer.size === 0) window.removeEventListener("popstate", melde);
  };
}

export function useFilterUrl(): {
  filter: Filter;
  kartengroesse: Kartengroesse;
  setzeFilter: (filter: Filter, modus?: Adressmodus) => void;
  setzeKartengroesse: (groesse: Kartengroesse) => void;
} {
  const such = useSyncExternalStore(
    abonniere,
    () => window.location.search,
    () => ""
  );
  const { filter, kartengroesse } = useMemo(() => ausSuchstring(such), [such]);

  const schreibe = useCallback(
    (naechsterFilter: Filter, naechsteGroesse: Kartengroesse, modus: Adressmodus) => {
      const naechste = zuSuchstring(naechsterFilter, naechsteGroesse);
      // Ohne Auswahl bleibt die Adresse sauber, ohne "?".
      const ziel = naechste === "" ? window.location.pathname : `${window.location.pathname}?${naechste}`;
      if (modus === "schritt") window.history.pushState(null, "", ziel);
      else window.history.replaceState(null, "", ziel);
      melde();
    },
    []
  );

  const setzeFilter = useCallback(
    (naechster: Filter, modus: Adressmodus = "schritt") =>
      schreibe(naechster, kartengroesse, modus),
    [schreibe, kartengroesse]
  );

  const setzeKartengroesse = useCallback(
    (groesse: Kartengroesse) => schreibe(filter, groesse, "schritt"),
    [schreibe, filter]
  );

  return { filter, kartengroesse, setzeFilter, setzeKartengroesse };
}
```

- [ ] **Step 2: `App.tsx` umstellen**

`web/src/App.tsx:121-122` — diese zwei Zeilen:

```tsx
  const [filter, setFilter] = useState<Filter>(LEERER_FILTER);
  const [kartengroesse, setKartengroesse] = useState<Kartengroesse>("objekte");
```

werden zu:

```tsx
  // Der Filter lebt in der Adresse, nicht im Zustand (B7-1). Damit ist eine
  // Auswahl verschickbar, ein Neuladen verliert sie nicht, und der
  // Zurueck-Knopf loest sie, statt die Seite zu verlassen.
  const { filter, kartengroesse, setzeFilter, setzeKartengroesse } = useFilterUrl();
```

Import ergaenzen: `import { useFilterUrl } from "./logik/useFilterUrl.ts";`

Zwei Uebergaben nachziehen:

```tsx
// :253
setzeFilter={setzeFilter}
// :277
setzeGroesse={setzeKartengroesse}
```

Wird `LEERER_FILTER` oder `useState` in `App.tsx` danach nirgends mehr gebraucht, den jeweiligen Import entfernen — `tsc` meldet es.

- [ ] **Step 3: Gate**

Run: `cd web && npx tsc --noEmit && npx vitest run`
Expected: keine Typfehler, 203 Tests gruen.

- [ ] **Step 4: Handprobe im laufenden Dashboard**

`cd web && npm run dev`, dann im Browser:

1. Ein Bundesland und eine Stufe waehlen → die Adresse zeigt `?bl=...&st=...`.
2. **Neu laden** → dieselbe Auswahl steht wieder da.
3. **Zurueck** → die zuletzt gewaehlte Stufe faellt weg, die Seite bleibt.
4. Die Adresse kopieren, in einem neuen Tab oeffnen → dieselbe Auswahl.
5. Alles abwaehlen → die Adresse steht wieder ohne `?` da.

Erwartet: alle fuenf. Schlaegt 3 fehl und die Seite wird verlassen, ist `melde()` nicht verdrahtet.

- [ ] **Step 5: Commit**

```bash
git add web/src/logik/useFilterUrl.ts web/src/App.tsx
git commit -m "feat(web): der Filter lebt in der Adresse statt im Zustand"
```

---

### Task 4: Der Zurück-Knopf bekommt sinnvolle Schritte

**Files:**
- Modify: `web/src/ui/Filterleiste.tsx` — die Eigenschaft `setzeFilter` in den Props, `aendere` (`:211`) und **zwei** Aufrufe (`:553`, `:562`)

**Interfaces:**
- Consumes: `Adressmodus` aus Task 3
- Produces: nichts fuer spaetere Aufgaben

**Hinweis:** Kein automatischer Test (siehe Task 3). Beweis sind `tsc`, die bestehenden Tests und die Handprobe unten.

**Warum nur zwei Aufrufe:** Die fuenf Spannenfelder schreiben ueber `onBlur`
(`:133`, `:145`), also einmal je verlassenem Feld und nie je Tastendruck. Sie
sind damit abgeschlossene Einzelhandlungen wie ein Klick und bleiben
**Schritte**. Nur `terminVon` und `terminBis` haengen an `onChange` und
feuern beim Tippen mehrfach.

- [ ] **Step 1: Die Props und `aendere` erweitern**

In `web/src/ui/Filterleiste.tsx` die Eigenschaft aendern:

```tsx
  setzeFilter: (filter: Filter, modus?: Adressmodus) => void;
```

und `:211`:

```tsx
  /**
   * Eine abgeschlossene Eingabe ist ein Schritt im Verlauf -- auch das
   * Verlassen eines Spannenfeldes, denn die fuenf Spannen schreiben ueber
   * `onBlur` und nicht je Tastendruck. Nur die beiden Datumsfelder haengen
   * an `onChange` und feuern beim Tippen mehrfach; sie ersetzen deshalb.
   */
  const aendere = (teil: Partial<Filter>, modus: Adressmodus = "schritt") =>
    setzeFilter({ ...filter, ...teil }, modus);
```

Import ergaenzen: `import type { Adressmodus } from "../logik/useFilterUrl.ts";`

- [ ] **Step 2: Die beiden Datumsfelder umstellen**

Die Stellen finden:

```bash
cd web && grep -n "aendere({ termin\(Von\|Bis\)" src/ui/Filterleiste.tsx
```

Expected: **genau 2 Zeilen** (`:553`, `:562`). Bei beiden `, "ersetzen"` als zweites Argument ergaenzen:

```tsx
onChange={(e) =>
  aendere({ terminVon: e.currentTarget.value === "" ? null : e.currentTarget.value }, "ersetzen")
}
```

`terminNur` ist ein Ankreuzfeld und bleibt ein **Schritt**.

- [ ] **Step 3: Gate**

Run: `cd web && npx tsc --noEmit && npx vitest run`
Expected: sauber, 203 Tests gruen.

- [ ] **Step 4: Handprobe**

1. Drei Bundeslaender nacheinander anklicken, dann dreimal Zurueck → jeder Klick faellt einzeln weg.
2. In das Kaufpreisfeld `150000` tippen, **Feld verlassen**, dann Zurueck → der Preis faellt weg, die Bundeslandauswahl bleibt stehen.
3. Ein Datum eintippen und Zurueck → die ganze Datumsangabe faellt in einem Schritt weg, nicht ziffernweise.

- [ ] **Step 5: Commit**

```bash
git add web/src/ui/Filterleiste.tsx
git commit -m "fix(web): abgeschlossene Eingaben sind Verlaufsschritte, tippende Datumsfelder nicht"
```

---

### Task 5: Eine Auswahl, die nichts trifft, sagt das

**Files:**
- Modify: `web/src/App.tsx` — die vier `leertext`-Stellen (`:312`, `:333`, `:348`, `:367`)
- Modify: `web/src/stil.css` — eine Regel fuer `.leer__loesen` neben `.leer` (`:1657`)

**Interfaces:**
- Consumes: `leergrund` aus Task 2, `istFilterAktiv` aus `filter.ts`, `setzeFilter` aus Task 3
- Produces: nichts fuer spaetere Aufgaben

**Hinweis:** Kein automatischer Test (siehe Task 3).

- [ ] **Step 1: Den gemeinsamen Leertext bauen**

In `web/src/App.tsx`, oberhalb des `return`:

```tsx
  /**
   * Der Satz unter einer leeren Liste. Seit B7-1 kann ein verschickter Link
   * auf 0 Objekte zeigen -- das darf nicht wie ein leerer Bestand aussehen.
   * Die Unterscheidung trifft `leergrund`, hier steht nur noch der Text.
   */
  const leertextFuer = (gefiltert: number, eigenerSatz: React.ReactNode): React.ReactNode => {
    const grund = leergrund(gefiltert, alleObjekte.length, istFilterAktiv(filter));
    if (grund !== "filter_trifft_nichts") return eigenerSatz;
    return (
      <>
        <b>Diese Auswahl trifft kein einziges Objekt.</b>{" "}
        Der Bestand hat {formatiereAnzahl(alleObjekte.length)} Objekte — der Filter
        schliesst alle aus. Das kann an einem Link liegen, der aelter ist als der
        Bestand.{" "}
        <button type="button" className="leer__loesen" onClick={() => setzeFilter(LEERER_FILTER)}>
          Filter lösen
        </button>
      </>
    );
  };
```

Importe ergaenzen: `leergrund` und `istFilterAktiv` aus `./logik/filter.ts`, `LEERER_FILTER` bleibt bzw. kommt zurueck.

- [ ] **Step 2: Die vier Stellen umstellen**

Jede der vier `leertext={...}`-Stellen so umbauen, dass der bisherige Inhalt als `eigenerSatz` durchgereicht wird, zum Beispiel `:333`:

```tsx
leertext={leertextFuer(objekteMitRang.length, <b>Kein Objekt mit Rangzahl passt zu dieser Auswahl.</b>)}
```

Der erste Parameter ist jeweils die Laenge **derselben** Liste, die der Bereich als `objekte` bekommt. Steht dort eine andere, meldet der Bereich „leer" und der Text spricht ueber eine andere Menge.

- [ ] **Step 3: Den Knopf gestalten**

`.leer` und `.leer b` gibt es in `web/src/stil.css` (`:1657`, `:1666`), einen
Knopf darin nicht. Direkt darunter ergaenzen:

```css
/* Der Knopf unter einer Liste, die nur wegen des Filters leer ist (B7-1). */
.leer__loesen {
  margin-left: 4px;
  padding: 2px 8px;
  border: 1px solid var(--papier-still);
  border-radius: 4px;
  background: transparent;
  font: inherit;
  cursor: pointer;
}
.leer__loesen:hover {
  border-color: currentColor;
}
```

- [ ] **Step 4: Gate**

Run: `cd web && npx tsc --noEmit && npx vitest run`
Expected: sauber, 203 Tests gruen.

- [ ] **Step 5: Handprobe**

1. Einen Filter waehlen, der nichts trifft (z. B. Kaufpreis von `99999999`) → der Satz „Diese Auswahl trifft kein einziges Objekt" erscheint, mit Knopf.
2. Auf **Filter lösen** klicken → die Liste ist wieder voll, die Adresse wieder sauber.
3. Einen Bereich oeffnen, der auch ohne Filter leer ist → dort steht weiterhin **sein eigener** Satz, nicht der neue.

Schritt 3 ist die Wache: Er belegt, dass der neue Text nur den einen Fall uebernimmt.

- [ ] **Step 6: Commit**

```bash
git add web/src/App.tsx web/src/stil.css
git commit -m "feat(web): eine Auswahl, die nichts trifft, nennt sich beim Namen"
```

---

### Task 6: Backlog und Übergabe nachziehen

**Files:**
- Modify: `docs/superpowers/BACKLOG.md` (B7-1)
- Modify: `docs/superpowers/UEBERGABE.md` (neuer Abschnitt oben)

- [ ] **Step 1: B7-1 als erledigt eintragen**

Im Backlog unter B7-1 festhalten: was gebaut wurde, welche drei Entscheidungen gelten (Spec Abschnitt 2), und **was offen bleibt** — wie lang die Adressen im Alltag werden, ist nicht gemessen (Spec Abschnitt 11). B7-2 bleibt unberuehrt offen.

- [ ] **Step 2: Übergabe ergaenzen**

Oben einen Abschnitt mit dem Stand, den Commits und der Handprobe, die den Beweis traegt — ausdruecklich samt der Angabe, dass Task 3 bis 5 keinen automatischen Test haben und warum.

- [ ] **Step 3: Commit und Push**

```bash
git add docs/superpowers/BACKLOG.md docs/superpowers/UEBERGABE.md
git commit -m "docs: B7-1 ist gebaut -- der Filter steht in der Adresse"
git push origin main
```
