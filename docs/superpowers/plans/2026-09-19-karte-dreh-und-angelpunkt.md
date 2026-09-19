# Die Karte als Dreh- und Angelpunkt — Implementierungsplan

> **Für agentische Arbeiter:** VERPFLICHTENDE UNTER-SKILL:
> `superpowers:subagent-driven-development` (empfohlen) oder
> `superpowers:executing-plans`. Schritte tragen Kästchen (`- [ ]`).
> **Jeder Agent wägt zusätzlich selbst ab, welche weitere Superpower zu seiner
> Aufgabe passt, und wendet sie an** — Regel 3 der Arbeitsweise dieses Projekts
> (`UEBERGABE.md`, „Wie in diesem Projekt gearbeitet wird").
> **Bei jedem Schritt, der `web/src/ui/`, `web/src/App.tsx` oder `stil.css`
> berührt:** zusätzlich die Skills `web-design-guidelines` und
> `react-best-practices` anwenden (Nutzerauftrag 2026-09-19, gilt für jede
> Web-Arbeit an diesem Projekt).

**Ziel:** Die Karte wird zum Dreh- und Angelpunkt der Weboberfläche: Fährt man
in der Liste über eine Zeile, zeigt ein Ring, wo die Karte sie verortet; ein
Tooltip erscheint sofort und gestaltet; ein Klick auf einen PLZ-Punkt filtert
die Liste; die Karte steht als eigene, mitwandernde Spalte neben der Liste.
Nebenbei werden die drei belegten Performance-Befunde der Weboberfläche
(Ladetext, Update je Netzwerk-Paket, Objektliteral je Zeile) behoben, weil sie
dieselben Dateien berühren.

**Architektur:** Alles Rechnerische — welche Markierung zu einem Objekt gehört,
der PLZ-Filter, die Tooltip-Texte, die Tooltip-Platzierung, die Fortschritts-
Entscheidungen — steht als **reine Funktion unter `web/src/logik/` bzw.
`web/src/daten/`** und wird mit vitest zuerst rot, dann grün geprüft. Die
React-Verdrahtung darüber ist dünn und wird **im Browser** geprüft
(Playwright, headless): `web/vitest.config.ts` läuft mit `environment: "node"`
und `include: ["src/**/*.test.ts"]`, es gibt bewusst weder jsdom noch
Testing-Library, und dieser Plan fügt **keine Abhängigkeit** hinzu. Die Karte
behält ihre Grundschicht unverändert; das Hover-Signal ist ein zusätzliches,
flüchtiges Overlay.

**Tech-Stack:** TypeScript, React 18, Vite 6, vitest 2, Inline-SVG. Kein neues
Paket.

**Spec:** [`specs/2026-09-19-karte-dreh-und-angelpunkt-design.md`](../specs/2026-09-19-karte-dreh-und-angelpunkt-design.md)
(Entwurf, per Brainstorming erarbeitet) und für die Performance-Befunde
[`UEBERGABE.md`](../UEBERGABE.md), Abschnitt „Audit-Befunde der Weboberfläche".
Ergänzend der Dashboard-Entwurf `2026-09-09-dashboard-entwurf.md` und der
Nachtrag `2026-09-15-dashboard-nachtrag-oberflaeche.md`.

**Abweichungen vom Spec — beim Lesen des Codes gefunden, hier entschieden:**

1. Der Spec nennt `zweistellerMitKoordinate` „bereits exportiert". **Stimmt
   nicht** (`web/src/logik/karte.ts`, `function zweistellerMitKoordinate`
   ohne `export`). Task 4 exportiert sie.
2. Der Spec will einen Zustand `hoverObjektId: string | null` und lässt die
   Karte die ID auflösen. **Entschieden: `hoverObjekt: SnapshotObjekt | null`.**
   Die Zeile hat ihr Objekt ohnehin in der Hand; ein Nachschlagen in 22.000
   Einträgen entfällt. Die Prop der Karte heißt wie im Spec
   `hervorgehobenesObjekt: SnapshotObjekt | null`.
3. Der Spec lässt die `<title>`-Elemente „zusätzlich" stehen. **Entschieden:
   sie entfallen** (Task 9). Neben einem sofortigen eigenen Tooltip würde der
   Browser nach rund einer Sekunde sein eigenes darüberlegen — zwei
   Sprechblasen für dieselbe Form. Der Name für Screenreader kommt weiter aus
   `aria-label` (ist an den Kacheln schon da und kommt an die Punkte).

## Global geltende Randbedingungen

Jede Aufgabe erfüllt sie stillschweigend mit.

- **Die Karte zeigt IMMER den ganzen Bestand, nie die gefilterte Auswahl**
  (`Karte.tsx`, Kommentar an `alleObjekte`). Das Hover-Highlight ist keine
  Filteränderung; die Grundschicht (Kacheln, Punkte, Farbe, Größe) bleibt
  exakt wie heute berechnet. Nur ein zusätzliches, transientes Overlay kommt
  dazu. Ein Klick auf einen Punkt darf filtern (Kacheln tun das heute schon).
- **Ehrlich bleiben (Nutzerentscheidung 2026-09-19):** Objekt mit PLZ →
  markiert den PLZ-Zweisteller-Punkt; Objekt ohne PLZ, aber mit Bundesland →
  markiert die Bundesland-Kachel; Objekt ganz ohne Ortsangabe → keine
  Markierung. Kein Objekt wird als „hier genau" gezeigt, wenn die Daten das
  nicht hergeben (nur 1,3 % aller Objekte tragen eine verortbare PLZ).
- **Keine echte Geokodierung, keine neue Datenquelle, kein neuer
  Export-Schritt.** Alles Nötige (`plz`, `bundesland`) steht in
  `SnapshotObjekt`.
- **Keine Fremdanfrage zur Laufzeit (N5), keine neue Abhängigkeit.** Die Karte
  bleibt Inline-SVG; ein Tooltip ist ein eigenes Element.
- **Wo Wissen fehlt, steht eine ehrliche Angabe statt einer Zahl** (Leitsatz
  des Projekts): kein „23.5 von 3.2 MB", keine stille 0.
- **TDD, und jeder Test wird zuerst rot gesehen.** Ein grüner Test, der nie rot
  war, belegt nichts. Bei einem Test, der sofort grün ist: Produktionscode
  kurz kaputtmachen und zusehen, ob der Test es merkt.
- **Kommentare im Code sind deutsch, ohne Umlaute** (`ae`/`oe`/`ue`, wie in den
  bestehenden Dateien); Texte, die die Oberfläche anzeigt, tragen echte
  Umlaute. Bezeichner ohne Umlaute.
- **Kein lokaler Scraper-Lauf, keine Schreibzugriffe auf die Produktions-
  datenbank, `.github/workflows/` bleibt für Agenten gesperrt.** Dieser Plan
  berührt nichts davon.

## Arbeitsumgebung — für jeden Worktree

Ausgangsstand: `main` = `6796f02`, **103 Web-Tests grün, 1 übersprungen**
(gemessen 2026-09-19), `tsc --noEmit` sauber.

1. Worktree: `git worktree add ../immo-radar-wt-<name> -b feat/karte-<name> main`
   (Name je Aufgabe siehe unten).
2. `node_modules`: im Worktree-Wurzelverzeichnis
   `bash scripts/worktree-node-modules.sh` — **niemals `npm ci`** (drei
   gleichzeitige `npm ci` haben das Heimnetz des Nutzers lahmgelegt).
3. Die lokale Snapshot-Datei liegt nicht im Repo (git-ignoriert, 24 MB):
   `cp /c/immo-radar/web/public/dashboard-snapshot.json web/public/`. Ohne sie
   überspringt `snapshot.vertrag.test.ts` acht Prüfungen, und der
   Entwicklungsserver zeigt nur die Fehlerseite.
4. Tests und Typprüfung: `cd web && npx vitest run` und
   `cd web && npx tsc --noEmit`.
5. **Browser-Prüfungen laufen über Playwright direkt**, nie über das
   `mcp__browser__*`-Werkzeug (das ist der echte Chrome des Nutzers). Playwright
   1.63 liegt in `C:/immo-radar/scraper/node_modules`, die Browser in
   `%LOCALAPPDATA%\ms-playwright`. Ein Skript importiert es mit einer
   **Datei-URL**:
   `import { chromium } from "file:///C:/immo-radar/scraper/node_modules/playwright/index.mjs";`
   — nie mit einem `/c/…`-Pfad (Node liest das als `C:\c\…`). Skripte gehören
   ins **Scratchpad**, nie ins Repo. Headless-Chromium gegen die **eigene**
   Seite ist unproblematisch (gesperrt ist nur Immowelt).
6. Entwicklungsserver: `cd web && npx vite --port <freier Port> --strictPort`
   im Hintergrund. **Nach der Aufgabe beenden**, gezielt über die
   Kommandozeile suchen — nicht alle `node`-Prozesse abschießen (ein
   vergessener Server verhindert später `git worktree remove`).
7. Commit-Texte über eine Datei (`git commit -F <datei>`), nie über `printf`:
   ein Prozentzeichen bricht die Nachricht mitten im Satz ab.
8. **Kein Merge und kein Push durch den Agenten** — beides macht der
   Koordinator nach der Prüfung.

## Dateistruktur

| Datei | Verantwortung | Task |
|---|---|---|
| `web/src/daten/laden.ts` | + reine Helfer `erwarteteBytes`, `gueltigesZiel`, `sollMelden`; Leseschleife gedrosselt | 1 |
| `web/src/daten/laden.test.ts` | neu | 1 |
| `web/src/ui/VirtuelleListe.tsx` | Objektliteral aus der Zeichenschleife | 2 |
| `web/src/logik/karte.ts` | + `Markierung`, `markierungFuer`, `beschreibeMarkierung`; `zweistellerMitKoordinate` wird exportiert | 3, 4 |
| `web/src/logik/karte.test.ts` | + Tests dazu | 3 |
| `web/src/logik/filter.ts` | + `plzZweisteller`, `schalteEintrag`, `OhneAngabe.plz` | 4 |
| `web/src/logik/filter.test.ts` | + Tests dazu; bestehender `zaehleOhneAngabe`-Test wird um `plz` ergänzt | 4 |
| `web/src/logik/kartentexte.ts` (neu) | Tooltip-Texte an EINER Stelle (Tooltip und `aria-label`) | 5 |
| `web/src/logik/tooltipPosition.ts` (neu) | reine Platzierung des Tooltips | 5 |
| `web/src/ui/KartenTooltip.tsx` (neu) | das Tooltip-Element | 9 |
| `web/src/ui/Karte.tsx` | Overlay, klickbare Punkte, Tooltip | 7, 8, 9 |
| `web/src/ui/Objektzeile.tsx`, `Bereich.tsx` | Hover-Weiterleitung | 7 |
| `web/src/ui/Filterleiste.tsx` | Gruppe „PLZ-Bereich" | 8 |
| `web/src/App.tsx` | Layout, Hover-Zustand, PLZ-Schalter | 6, 7, 8 |
| `web/src/stil.css` | Kartenspalte, Overlay, Punkt-Zustände, Tooltip | 6, 7, 8, 9 |

## Reihenfolge und Parallelität

- **Block A (Tasks 1–5): fünf Worktrees gleichzeitig.** Die Dateien sind
  disjunkt. Einzige Berührung: Task 3 hängt neue Funktionen ans Ende von
  `karte.ts`, Task 4 ändert dort nur die Zeile `function zweistellerMitKoordinate`
  zu `export function …` — git führt das ohne Konflikt zusammen.
- **Block B (Tasks 6–9): nacheinander in einem Zweig**, gestartet von `main`
  **nach** dem Merge von Block A. Alle vier berühren `Karte.tsx`, `App.tsx`
  oder `stil.css`; Parallelität brächte nur Merge-Arbeit.
- **Block C (Task 10):** Abnahme, Dokumentation, Merge/Push — Koordinator.
- **Modellwahl (Vorschlag, entscheidet der Koordinator beim Losschicken):**
  Tasks 1–5 `sonnet` (Code ist ausgeschrieben), Tasks 6–9 `opus`
  (Gestaltungsurteil, React-Leistung, Browser-Prüfung).

---

# Block A — Grundlagen (parallel)

### Task 1: Der Ladetext sagt die Wahrheit, und die Seite rechnet nicht je Paket neu

Behebt die Befunde **A** und **B** aus `UEBERGABE.md`.

**Der Befund, belegt:** `Content-Length` nennt die Größe *auf der Leitung*
(komprimiert, rund 3,2 MB). `antwort.body.getReader()` liefert aber bereits
*dekomprimierte* Bytes (rund 23,5 MB). `Ladeanzeige` schreibt daraus wörtlich
„23.5 von 3.2 MB"; der Balken ist durch `Math.min(1, …)` gedeckelt und steht
früh auf 100 %. Zusätzlich steht die Zeile
`gesamt: erwartet ?? bytes` in der Phase „aufbereitung" — dort ist der Abruf
längst fertig, das Ziel *ist* `bytes`. Und jede Meldung in der Leseschleife
löst in `App.tsx` ein `setFortschritt` aus: hunderte bis tausende
Render-Durchläufe im teuersten Moment der Seite.

**Files:**
- Modify: `web/src/daten/laden.ts`
- Create: `web/src/daten/laden.test.ts`
- `App.tsx` bleibt **unverändert** — `Ladeanzeige` kann `gesamt === null` bereits
  („… MB gelesen", wandernder Balken).

**Worktree:** `../immo-radar-wt-laden`, Zweig `feat/karte-laden`.

**Interfaces:**
- Consumes: nichts aus anderen Tasks.
- Produces (aus `daten/laden.ts`):
  - `export const MELDE_ABSTAND_MS = 100;`
  - `export function erwarteteBytes(kopf: Pick<Headers, "get">): number | null`
  - `export function gueltigesZiel(erwartet: number | null, gelesen: number): number | null`
  - `export function sollMelden(letzteMeldungMs: number | null, jetztMs: number, abstandMs?: number): boolean`

- [ ] **Step 1: Den Fehler im echten Browser reproduzieren (Vorher-Messung)**

Ein kleiner Server, der die Seite so ausliefert wie Cloudflare — die
Snapshot-Datei gzip-komprimiert, mit `Content-Length` der komprimierten Größe.
Datei `serve-gz.mjs` im **Scratchpad** anlegen:

```js
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { extname, join, normalize } from "node:path";

const wurzel = process.argv[2];
const port = Number(process.argv[3] ?? 4601);
const komprimiert = process.argv[4] === "gzip";
const typen = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

createServer((anfrage, antwort) => {
  const pfad = normalize(decodeURIComponent(anfrage.url.split("?")[0])).replace(/^([/\\]|\.\.[/\\])+/, "");
  const datei = join(wurzel, pfad === "" ? "index.html" : pfad);
  if (!existsSync(datei) || statSync(datei).isDirectory()) {
    antwort.writeHead(404);
    antwort.end();
    return;
  }
  let inhalt = readFileSync(datei);
  const kopf = { "content-type": typen[extname(datei)] ?? "application/octet-stream" };
  if (komprimiert && extname(datei) === ".json") {
    inhalt = gzipSync(inhalt);
    kopf["content-encoding"] = "gzip";
  }
  kopf["content-length"] = String(inhalt.length);
  antwort.writeHead(200, kopf);
  antwort.end(inhalt);
}).listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}`));
```

und `pruefe-ladetext.mjs` daneben (sammelt jeden Zustand des Ladetextes, prüft
die Aussage „gelesen ≤ gesamt" und meldet Konsolenfehler):

```js
import { chromium } from "file:///C:/immo-radar/scraper/node_modules/playwright/index.mjs";

const port = process.argv[2];
const browser = await chromium.launch({ headless: true });
const seite = await browser.newPage();
const konsolenfehler = [];
seite.on("console", (m) => { if (m.type() === "error") konsolenfehler.push(m.text()); });
await seite.addInitScript(() => {
  window.__zahlen = [];
  document.addEventListener("DOMContentLoaded", () => {
    new MutationObserver(() => {
      const el = document.querySelector(".laden__zahl");
      if (el && window.__zahlen.at(-1) !== el.textContent) window.__zahlen.push(el.textContent);
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  });
});
await seite.goto(`http://127.0.0.1:${port}/`);
await seite.waitForSelector(".geruest", { timeout: 60000 });
const zahlen = await seite.evaluate(() => window.__zahlen);
const falsch = zahlen.filter((z) => {
  const m = /^([\d.]+) von ([\d.]+) MB$/.exec(z);
  return m !== null && Number(m[1]) > Number(m[2]) + 0.05;
});
console.log(JSON.stringify({ zahlen, falsch, konsolenfehler }, null, 2));
await browser.close();
process.exitCode = falsch.length > 0 || konsolenfehler.length > 0 ? 1 : 0;
```

Im Worktree bauen und gegen den **unveränderten** Stand messen:

```bash
cd web && npx vite build
node <scratchpad>/serve-gz.mjs C:/immo-radar-wt-laden/web/dist 4601 gzip   # im Hintergrund
node <scratchpad>/pruefe-ladetext.mjs 4601
```

Erwartet (Vorher): Exit-Code 1, `falsch` enthält Einträge der Form
`"23.5 von 3.x MB"`. Die Zahlen notieren — sie gehören in die Commit-Nachricht.
**Sieht man den Fehler hier nicht, ist die Annahme über die Ursache falsch:
anhalten und berichten, nicht weiterbauen.**

- [ ] **Step 2: Den fehlschlagenden Test schreiben**

`web/src/daten/laden.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MELDE_ABSTAND_MS, erwarteteBytes, gueltigesZiel, sollMelden } from "./laden.ts";

describe("erwarteteBytes -- gegen welche Zahl darf der Fortschritt gemessen werden?", () => {
  it("nimmt Content-Length, wenn die Antwort unkomprimiert kommt", () => {
    expect(erwarteteBytes(new Headers({ "content-length": "24705879" }))).toBe(24705879);
  });

  it("nimmt sie NICHT, wenn die Antwort komprimiert ist: gelesen werden dekomprimierte Bytes", () => {
    // Der gemessene Fehler: "23.5 von 3.2 MB". Content-Length ist die Groesse auf der
    // Leitung, getReader() liefert die dekomprimierte.
    for (const kodierung of ["gzip", "br", "deflate", "zstd", "GZIP"]) {
      expect(
        erwarteteBytes(new Headers({ "content-length": "3300000", "content-encoding": kodierung }))
      ).toBeNull();
    }
  });

  it("behandelt 'identity' wie keine Kodierung", () => {
    expect(
      erwarteteBytes(new Headers({ "content-length": "1000", "content-encoding": "identity" }))
    ).toBe(1000);
  });

  it("meldet 'unbekannt', wenn der Kopf fehlt oder Unsinn enthaelt", () => {
    expect(erwarteteBytes(new Headers())).toBeNull();
    expect(erwarteteBytes(new Headers({ "content-length": "abc" }))).toBeNull();
    expect(erwarteteBytes(new Headers({ "content-length": "0" }))).toBeNull();
  });
});

describe("gueltigesZiel -- nie ein Ziel melden, das schon ueberschritten ist", () => {
  it("behaelt das Ziel, solange nicht mehr gelesen ist als erwartet", () => {
    expect(gueltigesZiel(1000, 0)).toBe(1000);
    expect(gueltigesZiel(1000, 1000)).toBe(1000);
  });

  it("gibt das Ziel auf, sobald mehr gelesen wurde -- dann stimmte der Massstab nicht", () => {
    expect(gueltigesZiel(1000, 1001)).toBeNull();
  });

  it("erfindet keins", () => {
    expect(gueltigesZiel(null, 500)).toBeNull();
  });
});

describe("sollMelden -- ein React-Update je Netzwerk-Paket war zu viel", () => {
  it("laesst die erste Meldung immer durch", () => {
    expect(sollMelden(null, 0)).toBe(true);
  });

  it("haelt Meldungen innerhalb des Abstands zurueck", () => {
    expect(sollMelden(1000, 1000 + MELDE_ABSTAND_MS - 1)).toBe(false);
  });

  it("laesst sie nach dem Abstand wieder durch", () => {
    expect(sollMelden(1000, 1000 + MELDE_ABSTAND_MS)).toBe(true);
  });
});
```

- [ ] **Step 3: Rot sehen**

Run: `cd web && npx vitest run src/daten/laden.test.ts`
Expected: FAIL — `erwarteteBytes is not a function` (bzw. `sollMelden`,
`gueltigesZiel`); die Konstante `MELDE_ABSTAND_MS` ist `undefined`.

- [ ] **Step 4: Die Helfer schreiben**

In `web/src/daten/laden.ts` direkt hinter der Konstante `SNAPSHOT_URL` einfügen:

```ts
/** Hoechstens eine Fortschrittsmeldung je Abstand -- die Leseschleife laeuft je Netzwerk-Paket. */
export const MELDE_ABSTAND_MS = 100;

/**
 * Die Zahl, gegen die der Fortschritt gemessen werden darf -- oder `null`.
 *
 * `Content-Length` nennt die Groesse AUF DER LEITUNG. Hat der Server die Antwort
 * komprimiert (`Content-Encoding` gzip, br, ...), liefert `body.getReader()`
 * aber die DEKOMPRIMIERTEN Bytes -- bei diesem Snapshot rund siebenmal so viele.
 * Beides ins Verhaeltnis zu setzen schrieb "23.5 von 3.2 MB". Lieber ehrlich
 * "unbekannt" als eine Zahl, die nicht stimmt.
 */
export function erwarteteBytes(kopf: Pick<Headers, "get">): number | null {
  const kodierung = kopf.get("content-encoding");
  if (kodierung !== null && kodierung.trim().toLowerCase() !== "identity") return null;
  const laenge = kopf.get("content-length");
  if (laenge === null) return null;
  const zahl = Number.parseInt(laenge, 10);
  return Number.isFinite(zahl) && zahl > 0 ? zahl : null;
}

/**
 * Zweite Wache gegen denselben Fehler: Ist schon MEHR gelesen als erwartet,
 * stimmte der Massstab nicht (etwa weil der Browser `Content-Encoding` nicht
 * preisgibt) -- dann wird ab hier "unbekannt" gemeldet statt ein Ziel, das
 * bereits ueberschritten ist.
 */
export function gueltigesZiel(erwartet: number | null, gelesen: number): number | null {
  return erwartet !== null && gelesen <= erwartet ? erwartet : null;
}

/** Erste Meldung immer, danach hoechstens eine je Abstand. */
export function sollMelden(
  letzteMeldungMs: number | null,
  jetztMs: number,
  abstandMs: number = MELDE_ABSTAND_MS
): boolean {
  return letzteMeldungMs === null || jetztMs - letzteMeldungMs >= abstandMs;
}
```

- [ ] **Step 5: Grün sehen**

Run: `cd web && npx vitest run src/daten/laden.test.ts`
Expected: PASS, 9 Tests.

- [ ] **Step 6: `ladeSnapshot` an die Helfer anschließen**

In `ladeSnapshot` drei Stellen ändern.

(a) Statt der drei Zeilen `laengeKopf` / `gesamt` / `erwartet`:

```ts
  const erwartet = erwarteteBytes(antwort.headers);
```

(b) Die Leseschleife: erste Meldung unverändert, danach gedrosselt.

```ts
    const leser = antwort.body.getReader();
    const stuecke: Uint8Array[] = [];
    melde({ phase: "abruf", gelesen: 0, gesamt: erwartet });
    let letzteMeldung: number | null = performance.now();
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      if (value !== undefined) {
        stuecke.push(value);
        bytes += value.byteLength;
        const jetzt = performance.now();
        if (sollMelden(letzteMeldung, jetzt)) {
          melde({ phase: "abruf", gelesen: bytes, gesamt: gueltigesZiel(erwartet, bytes) });
          letzteMeldung = jetzt;
        }
      }
    }
```

(c) Der Übergang in die Aufbereitung meldet **immer** und trägt den fertigen
Stand — der Abruf ist abgeschlossen, das Ziel ist `bytes`:

```ts
  melde({ phase: "aufbereitung", gelesen: bytes, gesamt: bytes });
```

Im Kopfkommentar der Datei Punkt 1 der Antwort anpassen: „`Content-Length`
liefert das Ziel nur bei unkomprimierter Antwort; sonst (komprimiert, Kopf
fehlt) wird der Fortschritt als 'unbekannt' gemeldet und NICHT geschaetzt.
Die Meldungen sind auf eine je 100 ms gedrosselt — die erste und der Uebergang
in die Aufbereitung kommen immer durch."

- [ ] **Step 7: Alles prüfen, im echten Browser nachmessen**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: alle Tests grün (103 + 9 = 112 grün, 1 übersprungen), `tsc` sauber.

Dann `cd web && npx vite build` und **beide** Serverarten gegen den neuen Stand:

```bash
node <scratchpad>/serve-gz.mjs C:/immo-radar-wt-laden/web/dist 4601 gzip   # komprimiert (wie Cloudflare)
node <scratchpad>/pruefe-ladetext.mjs 4601
node <scratchpad>/serve-gz.mjs C:/immo-radar-wt-laden/web/dist 4602        # unkomprimiert
node <scratchpad>/pruefe-ladetext.mjs 4602
```

Expected: beide Exit-Code 0, `falsch: []`, keine Konsolenfehler. Komprimiert:
nur `"… MB gelesen"`-Zustände (kein „von"). Unkomprimiert: `"x von 23.6 MB"` mit
wachsendem x, zuletzt gleich. **Notieren, was der Browser wirklich
preisgibt:** Gibt Chromium `Content-Encoding` über `fetch` her (dann greift
`erwarteteBytes`) oder nicht (dann fängt `gueltigesZiel` es ab, und der Text
springt einmal von „von" auf „gelesen")? Das Ergebnis steht in der
Commit-Nachricht und in `UEBERGABE.md`.

Beide Server und den Vite-Prozess beenden.

- [ ] **Step 8: Commit**

```bash
git add web/src/daten/laden.ts web/src/daten/laden.test.ts
git commit -F <nachricht.txt>
```

Nachricht (Vorschlag): `fix(web): Ladetext nennt keine Falschzahl mehr, Fortschritt gedrosselt` —
Rumpf mit Vorher-/Nachher-Messung aus Step 1 und 7.

---

### Task 2: Ein Objektliteral je Zeile — und ehrlich prüfen, ob `onScroll` ein Problem ist

Behebt Befund **C**. **Files:** Modify `web/src/ui/VirtuelleListe.tsx`.
**Worktree:** `../immo-radar-wt-liste`, Zweig `feat/karte-liste`.

**Interfaces:** nichts Neues; `VirtuelleListe`-Eigenschaften bleiben unverändert.

- [ ] **Step 1: Das Literal auf Modulebene heben**

In `VirtuelleListe.tsx` unter den Konstanten `ZEILENHOEHE_BREIT` /
`ZEILENHOEHE_SCHMAL` / `SCHMAL_AB`:

```ts
/** Ein Objekt fuer alle Zeilen -- ein Literal in der Schleife waere je Bild und Zeile ein neues. */
const DURCHSICHTIG = { display: "contents" } as const;
```

und in der Zeichenschleife `style={{ display: "contents" }}` durch
`style={DURCHSICHTIG}` ersetzen.

- [ ] **Step 2: Messen, ob `setOben` je Scroll-Ereignis ein echtes Problem ist**

Der Verdacht aus dem Audit: `onScroll={(e) => setOben(e.currentTarget.scrollTop)}`
löst je Ereignis einen Render-Durchlauf der Liste aus. **Nicht aus Reflex
umbauen — messen.**

*Vorübergehend* (nicht committen) die Rückgabe von `VirtuelleListe` in einen
`Profiler` hüllen:

```tsx
import { Profiler } from "react";
// ...
return (
  <Profiler
    id="liste"
    onRender={(_id, _phase, dauer) => {
      ((window as unknown as { __profil?: number[] }).__profil ??= []).push(dauer);
    }}
  >
    {/* die bisherige Rückgabe */}
  </Profiler>
);
```

Scratchpad-Skript `messe-scroll.mjs` (Entwicklungsserver, weil der `Profiler`
im Produktionsbau abgeschaltet ist; deshalb sind die Zeiten großzügig zu
lesen — der Entwicklungsmodus ist langsamer):

```js
import { chromium } from "file:///C:/immo-radar/scraper/node_modules/playwright/index.mjs";

const port = process.argv[2];
const browser = await chromium.launch({ headless: true });
const seite = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await seite.goto(`http://127.0.0.1:${port}/`);
await seite.waitForSelector(".liste", { timeout: 60000 });
await seite.evaluate(() => { window.__profil = []; });
const box = await (await seite.$(".liste")).boundingBox();
await seite.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 120; i += 1) {
  await seite.mouse.wheel(0, 40);
  await seite.waitForTimeout(16);
}
const werte = await seite.evaluate(() => window.__profil.slice().sort((a, b) => a - b));
const p95 = werte[Math.floor(werte.length * 0.95)] ?? 0;
const mittel = werte.reduce((s, w) => s + w, 0) / Math.max(1, werte.length);
console.log(JSON.stringify({ commits: werte.length, mittelMs: +mittel.toFixed(2), p95Ms: +p95.toFixed(2) }));
await browser.close();
```

Run: `cd web && npx vite --port 5171 --strictPort` (Hintergrund), dann
`node <scratchpad>/messe-scroll.mjs 5171`.

**Entscheidungsregel, vorab festgelegt:**
- `p95Ms < 2` → **kein Befund.** `onScroll` bleibt unverändert. In der
  Commit-Nachricht festhalten: „onScroll geprüft: N Commits, p95 X ms —
  kein Befund."
- `p95Ms ≥ 2` → `setOben` auf die Zeilengrenze quantisieren:
  `setOben(Math.floor(e.currentTarget.scrollTop / zeilenhoehe) * zeilenhoehe)`
  (`ersteSichtbare` rechnet ohnehin mit `Math.floor(oben / zeilenhoehe)`, die
  Ausgabe bleibt also gleich; React überspringt den Render, solange die Zeile
  gleich bleibt). Danach erneut messen; die Änderung nur behalten, wenn die
  Commit-Zahl sinkt und die Liste beim Scrollen unverändert aussieht.

- [ ] **Step 3: Den vorübergehenden `Profiler` wieder entfernen**

Run: `git diff web/src/ui/VirtuelleListe.tsx`
Expected: nur das gehobene Literal (und, falls Step 2 es verlangte, die
Quantisierung). Kein `Profiler`, kein `window`-Zugriff.

- [ ] **Step 4: Prüfen**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: 103 grün, 1 übersprungen; `tsc` sauber. Entwicklungsserver beenden.

- [ ] **Step 5: Commit**

Nachricht (Vorschlag): `perf(web): Objektliteral aus der Zeichenschleife der virtuellen Liste` —
Rumpf mit dem Messergebnis aus Step 2.

---

### Task 3: Welche Markierung gehört zu einem Objekt?

Reine Logik hinter dem Hover-Ring. **Files:** Modify
`web/src/logik/karte.ts` (am Ende anhängen), `web/src/logik/karte.test.ts`.
**Worktree:** `../immo-radar-wt-markierung`, Zweig `feat/karte-markierung`.

**Interfaces:**
- Consumes: `zweistellerMitKoordinate` (steht in `karte.ts`, wird in Task 4
  exportiert — hier wird sie nur innerhalb der Datei benutzt).
- Produces (aus `logik/karte.ts`):
  - `export type Markierung = { art: "plz"; zweisteller: string } | { art: "bundesland"; name: string };`
  - `export function markierungFuer(objekt: Pick<SnapshotObjekt, "plz" | "bundesland">): Markierung | null`
  - `export function beschreibeMarkierung(markierung: Markierung | null): string`

- [ ] **Step 1: Die fehlschlagenden Tests schreiben**

In `karte.test.ts` den Import um `beschreibeMarkierung` und `markierungFuer`
erweitern und am Dateiende anhängen (`objekt(...)` ist die vorhandene
Hilfsfunktion der Datei):

```ts
describe("markierungFuer -- wohin gehoert ein Objekt auf der Karte?", () => {
  it("nimmt den PLZ-Punkt, wenn die PLZ eine bekannte Koordinate hat", () => {
    expect(markierungFuer(objekt({ plz: "80331", bundesland: "Bayern" }))).toEqual({
      art: "plz",
      zweisteller: "80",
    });
  });

  it("faellt auf die Bundesland-Kachel zurueck, wenn es keine PLZ gibt", () => {
    expect(markierungFuer(objekt({ plz: null, bundesland: "Sachsen" }))).toEqual({
      art: "bundesland",
      name: "Sachsen",
    });
  });

  it("faellt auch dann auf die Kachel zurueck, wenn die PLZ keine Koordinate hat", () => {
    // "00000": der Zweisteller "00" steht nicht in PLZ_KOORDINATEN -- ein Punkt
    // waere erfunden. Dieselbe Regel wie in berechneAbdeckung.
    expect(markierungFuer(objekt({ plz: "00000", bundesland: "Sachsen" }))).toEqual({
      art: "bundesland",
      name: "Sachsen",
    });
  });

  it("behauptet bei einer kaputten PLZ keinen Punkt", () => {
    expect(markierungFuer(objekt({ plz: "8033", bundesland: "Bayern" }))).toEqual({
      art: "bundesland",
      name: "Bayern",
    });
  });

  it("markiert nichts, wenn weder PLZ noch Bundesland vorliegen", () => {
    expect(markierungFuer(objekt({ plz: null, bundesland: null }))).toBeNull();
  });
});

describe("beschreibeMarkierung -- die Zeile unter der Karte sagt, was der Ring bedeutet", () => {
  it("nennt den PLZ-Bereich und sagt, dass der Punkt kein genauer Ort ist", () => {
    const text = beschreibeMarkierung({ art: "plz", zweisteller: "80" });
    expect(text).toContain("80");
    expect(text).toContain("kein genauer Ort");
  });

  it("sagt bei der Kachel, dass nur das Land bekannt ist", () => {
    const text = beschreibeMarkierung({ art: "bundesland", name: "Sachsen" });
    expect(text).toContain("Sachsen");
    expect(text).toContain("Nur das Land");
  });

  it("sagt bei fehlender Ortsangabe, dass das Objekt nicht auf der Karte steht", () => {
    expect(beschreibeMarkierung(null)).toContain("nicht auf der Karte");
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `cd web && npx vitest run src/logik/karte.test.ts`
Expected: FAIL — `markierungFuer is not a function`.

- [ ] **Step 3: Die Umsetzung**

In `karte.ts` nach `berechneAbdeckung` einfügen:

```ts
/**
 * Wo die Karte ein Objekt zeigt -- und damit, was sie ueber seinen Ort WIRKLICH weiss.
 *
 * Dieselbe Rangfolge wie `berechneAbdeckung`: erst der PLZ-Punkt (nur wenn es zu
 * dem Zweisteller eine Koordinate gibt), dann die Bundesland-Kachel, sonst
 * nichts. Ein Objekt ohne beides wird NICHT irgendwohin gelegt.
 */
export type Markierung =
  | { art: "plz"; zweisteller: string }
  | { art: "bundesland"; name: string };

export function markierungFuer(
  objekt: Pick<SnapshotObjekt, "plz" | "bundesland">
): Markierung | null {
  const zweisteller = zweistellerMitKoordinate(objekt.plz);
  if (zweisteller !== null) return { art: "plz", zweisteller };
  if (objekt.bundesland !== null) return { art: "bundesland", name: objekt.bundesland };
  return null;
}

/** Der Satz unter der Karte -- damit ein Ring nie genauer wirkt, als die Daten sind. */
export function beschreibeMarkierung(markierung: Markierung | null): string {
  if (markierung === null) {
    return "Dieses Objekt trägt weder PLZ noch Bundesland und steht deshalb nicht auf der Karte.";
  }
  if (markierung.art === "plz") {
    return `PLZ-Bereich ${markierung.zweisteller}… — der Punkt sitzt in der Mitte des Bereichs, kein genauer Ort.`;
  }
  return `Nur das Land ist bekannt: ${markierung.name}. Die Kachel ist eine Marke, kein Ort.`;
}
```

- [ ] **Step 4: Grün sehen, und den Test einmal kaputtmachen**

Run: `cd web && npx vitest run src/logik/karte.test.ts`
Expected: PASS (17 + 8 = 25 Tests in dieser Datei).

Gegenprobe: in `markierungFuer` die Zeile `if (zweisteller !== null) …`
vorübergehend auskommentieren → mindestens zwei Tests müssen rot werden;
zurücknehmen.

- [ ] **Step 5: Alles prüfen und committen**

Run: `cd web && npx vitest run && npx tsc --noEmit` — alles grün.
Nachricht (Vorschlag): `feat(web): Markierung je Objekt fuer die Karte -- PLZ-Punkt, Kachel oder nichts`.

---

### Task 4: Der PLZ-Filter

Reine Logik hinter dem Klick auf einen Punkt. **Files:** Modify
`web/src/logik/filter.ts`, `web/src/logik/filter.test.ts`, und **eine Zeile**
in `web/src/logik/karte.ts` (`export` vor `function zweistellerMitKoordinate`).
**Worktree:** `../immo-radar-wt-plzfilter`, Zweig `feat/karte-plzfilter`.

**Interfaces:**
- Consumes: `zweistellerMitKoordinate(plz: string | null): string | null` aus `logik/karte.ts` (wird hier exportiert).
- Produces (aus `logik/filter.ts`):
  - `Filter.plzZweisteller: string[]` (neues Feld, `LEERER_FILTER.plzZweisteller = []`)
  - `export function schalteEintrag<T>(liste: readonly T[], eintrag: T): T[]`
  - `OhneAngabe.plz: number` — Objekte ohne verortbare PLZ

- [ ] **Step 1: Die fehlschlagenden Tests schreiben**

In `filter.test.ts` den Import um `schalteEintrag` erweitern. Den bestehenden
Test `zaehlt je Feld die Objekte ohne Wert` um das neue Feld ergänzen (die drei
Testobjekte tragen `plz: null` → 3):

```ts
    expect(zaehleOhneAngabe(alle)).toEqual({
      kaufpreis: 1,
      wohnflaeche: 1,
      grundstueck: 1,
      baujahr: 2,
      einheiten: 1,
      plz: 3,
    });
```

und am Dateiende anhängen:

```ts
describe("wendeFilterAn -- PLZ-Zweisteller (Klick auf einen Kartenpunkt)", () => {
  const alle = [
    objekt({ id: "muenchen", plz: "80331" }),
    objekt({ id: "berlin", plz: "10115" }),
    objekt({ id: "ohne", plz: null }),
  ];

  it("filtert nach dem Zweisteller der PLZ", () => {
    const treffer = wendeFilterAn(alle, { ...LEERER_FILTER, plzZweisteller: ["80"] });
    expect(treffer.map((o) => o.id)).toEqual(["muenchen"]);
  });

  it("verodert mehrere Zweisteller", () => {
    const treffer = wendeFilterAn(alle, { ...LEERER_FILTER, plzZweisteller: ["80", "10"] });
    expect(treffer.map((o) => o.id).sort()).toEqual(["berlin", "muenchen"]);
  });

  it("blendet ein Objekt OHNE PLZ aus, sobald nach PLZ gefiltert wird", () => {
    const treffer = wendeFilterAn(alle, { ...LEERER_FILTER, plzZweisteller: ["80"] });
    expect(treffer.map((o) => o.id)).not.toContain("ohne");
  });

  it("behandelt eine PLZ ohne Koordinate wie 'keine PLZ' -- sie ist auf der Karte nie anklickbar", () => {
    const mit00 = [objekt({ id: "null-null", plz: "00000" })];
    expect(wendeFilterAn(mit00, { ...LEERER_FILTER, plzZweisteller: ["00"] })).toHaveLength(0);
  });

  it("verbindet sich mit UND mit dem Bundesland", () => {
    const beide = [
      objekt({ id: "by", plz: "80331", bundesland: "Bayern" }),
      objekt({ id: "sn", plz: "80331", bundesland: "Sachsen" }),
    ];
    const treffer = wendeFilterAn(beide, {
      ...LEERER_FILTER,
      plzZweisteller: ["80"],
      bundeslaender: ["Bayern"],
    });
    expect(treffer.map((o) => o.id)).toEqual(["by"]);
  });

  it("gilt als aktiv, sobald ein Zweisteller gewaehlt ist", () => {
    expect(istFilterAktiv({ ...LEERER_FILTER, plzZweisteller: ["80"] })).toBe(true);
  });
});

describe("zaehleOhneAngabe -- PLZ", () => {
  it("zaehlt Objekte ohne verortbare PLZ, auch solche mit unbekanntem Zweisteller", () => {
    const alle = [
      objekt({ plz: "80331" }),
      objekt({ plz: null }),
      objekt({ plz: "00000" }),
      objekt({ plz: "8033" }),
    ];
    expect(zaehleOhneAngabe(alle).plz).toBe(3);
  });
});

describe("schalteEintrag", () => {
  it("nimmt einen fehlenden Eintrag auf und laesst die Reihenfolge stehen", () => {
    expect(schalteEintrag(["a", "b"], "c")).toEqual(["a", "b", "c"]);
  });

  it("entfernt einen vorhandenen Eintrag", () => {
    expect(schalteEintrag(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("veraendert die uebergebene Liste nicht", () => {
    const liste = ["a"];
    schalteEintrag(liste, "b");
    expect(liste).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `cd web && npx vitest run src/logik/filter.test.ts`
Expected: FAIL — `schalteEintrag is not a function`; die PLZ-Filtertests
liefern alle drei Objekte statt einem; der geänderte `zaehleOhneAngabe`-Test
scheitert an fehlendem `plz`.

- [ ] **Step 3: Die Umsetzung**

`karte.ts`: `function zweistellerMitKoordinate` → `export function zweistellerMitKoordinate`
(sonst nichts in dieser Datei).

`filter.ts`:

```ts
import { zweistellerMitKoordinate } from "./karte.ts";
```

in `Filter` hinter `bundeslaender`:

```ts
  /** PLZ-Zweisteller, gewaehlt ueber einen Klick auf die Karte. */
  plzZweisteller: string[];
```

`LEERER_FILTER`: `plzZweisteller: [],` hinter `bundeslaender: [],`.

`istFilterAktiv`: `filter.plzZweisteller.length > 0 ||` hinter der
Bundesland-Zeile.

`wendeFilterAn`, direkt hinter der Bundesland-Prüfung:

```ts
    // Nur bei gesetztem Filter rechnen: Der Zweisteller wird sonst je Objekt bei
    // JEDER Filteraenderung per Regex herausgeschnitten.
    if (
      filter.plzZweisteller.length > 0 &&
      !inAuswahl(zweistellerMitKoordinate(objekt.plz), filter.plzZweisteller)
    ) {
      return false;
    }
```

`OhneAngabe`: Feld `plz: number;`, in `zaehleOhneAngabe` Startwert `plz: 0` und
in der Schleife:

```ts
    if (zweistellerMitKoordinate(objekt.plz) === null) zaehler.plz += 1;
```

Der Docstring an `zaehleOhneAngabe` gilt weiter; einen Satz ergänzen: „`plz`
zählt, wie viele Objekte ein Klick auf einen Kartenpunkt ausblenden würde."

Neue Funktion am Dateiende:

```ts
/** Ein Eintrag rein, wenn er fehlt -- raus, wenn er schon drin ist. */
export function schalteEintrag<T>(liste: readonly T[], eintrag: T): T[] {
  return liste.includes(eintrag) ? liste.filter((e) => e !== eintrag) : [...liste, eintrag];
}
```

- [ ] **Step 4: Grün sehen, Gegenprobe**

Run: `cd web && npx vitest run src/logik/filter.test.ts`
Expected: PASS.

Gegenprobe: in `wendeFilterAn` die neue Prüfung vorübergehend auskommentieren →
die PLZ-Filtertests müssen rot werden; zurücknehmen.

- [ ] **Step 5: Alles prüfen und committen**

Run: `cd web && npx vitest run && npx tsc --noEmit` — alles grün
(`tsc` meldet jeden Ort, an dem ein `Filter` ohne `plzZweisteller` gebaut
würde; erwartet: keinen).
Nachricht (Vorschlag): `feat(web): PLZ-Zweisteller als Filterfeld -- Grundlage fuer den Klick auf die Karte`.

---

### Task 5: Die Bausteine des Tooltips

Zwei kleine, reine Module. **Files:** Create
`web/src/logik/kartentexte.ts`, `web/src/logik/kartentexte.test.ts`,
`web/src/logik/tooltipPosition.ts`, `web/src/logik/tooltipPosition.test.ts`.
**Worktree:** `../immo-radar-wt-tooltipbausteine`, Zweig `feat/karte-tooltipbausteine`.

**Interfaces:**
- Consumes: `formatiereAnzahl`, `formatiereDscr` (`logik/formate.ts`);
  `SnapshotBundesland` (`daten/snapshot.ts`); `PlzPunkt` (`logik/karte.ts`, existiert bereits).
- Produces (aus `logik/kartentexte.ts`):
  - `export interface TooltipText { titel: string; zeilen: string[]; hinweis: string }`
  - `export function kachelText(land: SnapshotBundesland | undefined, name: string, gewaehlt: boolean): TooltipText`
  - `export function punktText(punkt: Pick<PlzPunkt, "zweisteller" | "anzahl" | "topTreffer">, gewaehlt: boolean): TooltipText`
  - `export function alsZeile(text: TooltipText): string`
- Produces (aus `logik/tooltipPosition.ts`):
  - `export interface Rechteck { x: number; y: number; breite: number; hoehe: number }`
  - `export interface Groesse { breite: number; hoehe: number }`
  - `export interface TooltipLage { links: number; oben: number; unterhalb: boolean }`
  - `export function platziereTooltip(anker: Rechteck, tooltip: Groesse, behaelter: Groesse, abstand?: number): TooltipLage`

- [ ] **Step 1: Die fehlschlagenden Tests schreiben**

`web/src/logik/kartentexte.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SnapshotBundesland } from "../daten/snapshot.ts";
import { alsZeile, kachelText, punktText } from "./kartentexte.ts";

const sachsen: SnapshotBundesland = {
  name: "Sachsen",
  objekte: 1234,
  topTreffer: 7,
  medianDscr: 1.5,
  standAlterTage: 2.5,
};

describe("kachelText", () => {
  it("traegt Name, Zahlen und Stand -- dieselben Angaben wie bisher der <title>", () => {
    const text = kachelText(sachsen, "Sachsen", false);
    expect(text.titel).toBe("Sachsen");
    expect(text.zeilen).toEqual([
      "1.234 Objekte",
      "7 Top-Treffer",
      "Median-DSCR 1,50",
      "zuletzt gesweept vor 2.5 Tagen",
    ]);
  });

  it("zeigt fehlende Angaben als Gedankenstrich bzw. ehrlichen Satz, nie als 0", () => {
    const text = kachelText({ ...sachsen, medianDscr: null, standAlterTage: null }, "Sachsen", false);
    expect(text.zeilen).toContain("Median-DSCR —");
    expect(text.zeilen).toContain("kein Regionslauf verzeichnet");
  });

  it("sagt, wenn der Snapshot das Land gar nicht kennt", () => {
    expect(kachelText(undefined, "Sachsen", false).zeilen).toEqual(["keine Daten im Snapshot"]);
  });

  it("nennt im Hinweis, was ein Klick bewirkt -- je nach Zustand", () => {
    expect(kachelText(sachsen, "Sachsen", false).hinweis).toContain("zeigt nur");
    expect(kachelText(sachsen, "Sachsen", true).hinweis).toContain("entfernt");
  });
});

describe("punktText", () => {
  const punkt = { zweisteller: "80", anzahl: 1234, topTreffer: 7 };

  it("traegt Bereich und Zahlen", () => {
    const text = punktText(punkt, false);
    expect(text.titel).toBe("PLZ-Bereich 80…");
    expect(text.zeilen).toEqual(["1.234 Objekte", "7 davon Top-Treffer"]);
  });

  it("nennt im Hinweis, was ein Klick bewirkt -- je nach Zustand", () => {
    expect(punktText(punkt, false).hinweis).toContain("zeigt nur");
    expect(punktText(punkt, true).hinweis).toContain("entfernt");
  });
});

describe("alsZeile -- der Text fuer aria-label, ohne Klickhinweis", () => {
  it("verbindet Titel und Zeilen mit einem Mittelpunkt", () => {
    expect(alsZeile(punktText({ zweisteller: "80", anzahl: 3, topTreffer: 1 }, false))).toBe(
      "PLZ-Bereich 80… · 3 Objekte · 1 davon Top-Treffer"
    );
  });
});
```

`web/src/logik/tooltipPosition.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { platziereTooltip } from "./tooltipPosition.ts";

const behaelter = { breite: 1000, hoehe: 800 };
const tip = { breite: 200, hoehe: 100 };

describe("platziereTooltip", () => {
  it("setzt das Tooltip mittig ueber den Anker", () => {
    // mitte = 400 + 40/2 - 200/2 = 320 ; oben = 300 - 8 - 100 = 192
    expect(platziereTooltip({ x: 400, y: 300, breite: 40, hoehe: 24 }, tip, behaelter)).toEqual({
      links: 320,
      oben: 192,
      unterhalb: false,
    });
  });

  it("klappt nach unten, wenn oben kein Platz ist", () => {
    // oben waere 50 - 8 - 100 < 0 ; unten = 50 + 24 + 8 = 82
    expect(platziereTooltip({ x: 400, y: 50, breite: 40, hoehe: 24 }, tip, behaelter)).toEqual({
      links: 320,
      oben: 82,
      unterhalb: true,
    });
  });

  it("haelt das Tooltip am linken Rand", () => {
    expect(platziereTooltip({ x: 0, y: 300, breite: 20, hoehe: 24 }, tip, behaelter).links).toBe(0);
  });

  it("haelt das Tooltip am rechten Rand", () => {
    expect(platziereTooltip({ x: 990, y: 300, breite: 10, hoehe: 24 }, tip, behaelter).links).toBe(800);
  });

  it("bleibt am linken Rand, wenn es breiter ist als der Behaelter", () => {
    const breit = { breite: 1200, hoehe: 100 };
    expect(platziereTooltip({ x: 500, y: 300, breite: 40, hoehe: 24 }, breit, behaelter).links).toBe(0);
  });

  it("bleibt auch in der Hoehe im Behaelter", () => {
    // Weder oben (60 - 8 - 100 < 0) noch unten (60 + 24 + 8 + 100 > 150) passt es:
    // dann so weit wie moeglich nach unten geklemmt.
    const lage = platziereTooltip({ x: 400, y: 60, breite: 40, hoehe: 24 }, tip, { breite: 1000, hoehe: 150 });
    expect(lage).toEqual({ links: 320, oben: 50, unterhalb: true });
  });

  it("kennt einen eigenen Abstand", () => {
    expect(
      platziereTooltip({ x: 400, y: 300, breite: 40, hoehe: 24 }, tip, behaelter, 20).oben
    ).toBe(180);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `cd web && npx vitest run src/logik/kartentexte.test.ts src/logik/tooltipPosition.test.ts`
Expected: FAIL — die Module existieren nicht (`Failed to resolve import`).

- [ ] **Step 3: Die Module schreiben**

`web/src/logik/kartentexte.ts`:

```ts
/**
 * Die Texte der Karte an EINER Stelle -- fuer das Tooltip UND fuer `aria-label`.
 * Stuenden sie an zwei Stellen, sagte die Maus etwas anderes als der Screenreader.
 *
 * Reine Funktionen, ohne React. Fehlende Angaben werden zum Gedankenstrich
 * (`formatiereDscr`) bzw. zu einem ehrlichen Satz, nie zu einer Null.
 */
import type { SnapshotBundesland } from "../daten/snapshot.ts";
import { formatiereAnzahl, formatiereDscr } from "./formate.ts";
import type { PlzPunkt } from "./karte.ts";

export interface TooltipText {
  titel: string;
  zeilen: string[];
  /** Was ein Klick bewirkt -- damit die Bedienung auffindbar ist. */
  hinweis: string;
}

export function kachelText(
  land: SnapshotBundesland | undefined,
  name: string,
  gewaehlt: boolean
): TooltipText {
  const hinweis = gewaehlt
    ? "Klick entfernt den Filter auf dieses Land"
    : "Klick zeigt nur Objekte aus diesem Land";
  if (land === undefined) return { titel: name, zeilen: ["keine Daten im Snapshot"], hinweis };
  return {
    titel: name,
    zeilen: [
      `${formatiereAnzahl(land.objekte)} Objekte`,
      `${formatiereAnzahl(land.topTreffer)} Top-Treffer`,
      `Median-DSCR ${formatiereDscr(land.medianDscr)}`,
      land.standAlterTage === null
        ? "kein Regionslauf verzeichnet"
        : `zuletzt gesweept vor ${land.standAlterTage.toFixed(1)} Tagen`,
    ],
    hinweis,
  };
}

export function punktText(
  punkt: Pick<PlzPunkt, "zweisteller" | "anzahl" | "topTreffer">,
  gewaehlt: boolean
): TooltipText {
  return {
    titel: `PLZ-Bereich ${punkt.zweisteller}…`,
    zeilen: [
      `${formatiereAnzahl(punkt.anzahl)} Objekte`,
      `${formatiereAnzahl(punkt.topTreffer)} davon Top-Treffer`,
    ],
    hinweis: gewaehlt
      ? "Klick entfernt den Filter auf diesen Bereich"
      : "Klick zeigt nur Objekte aus diesem Bereich",
  };
}

/** Der Text fuer `aria-label`: alles in einer Zeile, ohne den Klickhinweis (`aria-pressed` sagt ihn schon). */
export function alsZeile(text: TooltipText): string {
  return [text.titel, ...text.zeilen].join(" · ");
}
```

`web/src/logik/tooltipPosition.ts`:

```ts
/**
 * Wohin das Tooltip der Karte kommt -- eine reine Rechnung, damit sie ohne
 * Browser pruefbar ist. Alle Werte sind Bildschirmkoordinaten (Viewport).
 *
 * Bevorzugt ueber dem Anker, mittig; klappt nach unten, wenn oben kein Platz
 * ist; bleibt in jedem Fall im Behaelter.
 */
export interface Rechteck {
  x: number;
  y: number;
  breite: number;
  hoehe: number;
}

export interface Groesse {
  breite: number;
  hoehe: number;
}

export interface TooltipLage {
  links: number;
  oben: number;
  unterhalb: boolean;
}

export function platziereTooltip(
  anker: Rechteck,
  tooltip: Groesse,
  behaelter: Groesse,
  abstand = 8
): TooltipLage {
  const platzOben = anker.y - abstand - tooltip.hoehe;
  const unterhalb = platzOben < 0;
  const gewuenscht = unterhalb ? anker.y + anker.hoehe + abstand : platzOben;
  const oben = Math.min(Math.max(0, gewuenscht), Math.max(0, behaelter.hoehe - tooltip.hoehe));

  const mitte = anker.x + anker.breite / 2 - tooltip.breite / 2;
  const links = Math.min(Math.max(0, mitte), Math.max(0, behaelter.breite - tooltip.breite));

  return { links, oben, unterhalb };
}
```

- [ ] **Step 4: Grün sehen, Gegenprobe**

Run: `cd web && npx vitest run src/logik/kartentexte.test.ts src/logik/tooltipPosition.test.ts`
Expected: PASS (`kartentexte`: 7, `tooltipPosition`: 7).

Gegenprobe: in `platziereTooltip` `unterhalb = platzOben < 0` vorübergehend zu
`false` ändern → „klappt nach unten" und „bleibt auch in der Höhe" werden rot;
zurücknehmen.

- [ ] **Step 5: Alles prüfen und committen**

Run: `cd web && npx vitest run && npx tsc --noEmit` — alles grün.
Nachricht (Vorschlag): `feat(web): Tooltip-Texte und Tooltip-Platzierung als reine Funktionen`.

---

# Zwischenschritt: Block A zusammenführen (Koordinator)

Nach der Prüfung jedes Zweigs (Diff lesen, Tests im Zweig grün, die
Gegenproben in den Tasks 3–5 stichprobenartig selbst wiederholen):

```bash
git checkout main
git merge --no-ff feat/karte-laden feat/karte-liste feat/karte-markierung feat/karte-plzfilter feat/karte-tooltipbausteine
cd web && npx vitest run && npx tsc --noEmit && npx vite build
```

Erwartet: **Web-Tests ≈ 103 + 9 (Task 1) + 8 (Task 3) + 12 (Task 4: 6 PLZ-Filter + 1 Zählung + 3 `schalteEintrag` + 0
geänderter) + 14 (Task 5) ≈ 146 grün**, `tsc` und `vite build` sauber. Dann Worktrees
aufräumen (Junction lösen, **bevor** gelöscht wird — siehe Projektnotiz zum
Worktree-Aufräumen), Block B startet von diesem `main`.

---

# Block B — Oberfläche (nacheinander, ein Zweig)

**Worktree:** `../immo-radar-wt-karte`, Zweig `feat/karte-oberflaeche`, von `main`
nach dem Merge von Block A. Vor jedem Task die Entwicklungsumgebung aus dem
Abschnitt „Arbeitsumgebung" (Snapshot-Datei kopieren!). Nach **jedem** Task
Tests, `tsc` und die genannte Browser-Prüfung, dann ein Commit.

### Task 6: Die Karte wird eine eigene, mitwandernde Spalte

**Files:** Modify `web/src/App.tsx`, `web/src/ui/Karte.tsx` (nur ein Satz Text),
`web/src/stil.css`.

**Interfaces:** Consumes nichts Neues. Produces: die Klasse `.kartenspalte` und
die Grid-Fläche `karte` in `.geruest` — Tasks 7–9 hängen sich hier ein.

**Der Entwurf, kurz** (Weg B, vom Nutzer bestätigt): Die Karte verlässt die
`.tafeln`-Zeile und wird eine eigene Spalte **zwischen** `.rail` und `.haupt` —
dasselbe Muster wie `.rail` (`position: sticky`). Die Betriebstafel wandert an
den Anfang des scrollenden Inhalts, oberhalb von „Top-Treffer".

**Die Spaltenbreite ist gemessen, nicht geraten.** Eine Zeile der Liste
braucht mindestens **rund 706 px** (`stil.css`, „Spaltenmaße": 38 + 150 + 112 +
190 + 128 px, vier Lücken zu 14 px, 2 × 16 px Innenabstand). Bei `--rail` 296 px
und 2 × 26 px Innenabstand von `.haupt` heißt das: dreispaltig erst ab rund
**1400 px** Fensterbreite, und die Kartenspalte darf nie breiter sein als der
Rest hergibt. Deshalb: `--karte: clamp(340px, calc(100vw - var(--rail) - 780px), 460px)`.

- [ ] **Step 1: Vorher-Bilder machen**

Scratchpad-Skript, das bei 1440×900, 1100×800 und 390×844 je einen
Vollbild-Screenshot von `http://127.0.0.1:<port>/` in ein Scratchpad-Verzeichnis
`vorher/` legt (Entwicklungsserver, Snapshot vorhanden, auf `.geruest` warten).
Sie dienen dem Vergleich in Step 6, nicht der Dokumentation.

- [ ] **Step 2: `App.tsx` umbauen**

Den Block `<div className="tafeln">…</div>` **ersatzlos** auflösen: Zwischen
`<aside className="rail">…</aside>` und `<main className="haupt">` eine neue
Spalte einfügen, und `<Betriebstafel>` als **erstes** Kind von `<main>`.

```tsx
      </aside>

      <div className="kartenspalte">
        <Karte
          bundeslaender={snapshot.bundeslaender}
          alleObjekte={alleObjekte}
          groesse={kartengroesse}
          setzeGroesse={setKartengroesse}
          gewaehlteLaender={filter.bundeslaender}
          schalteLand={schalteLand}
        />
      </div>

      <main className="haupt">
        <Betriebstafel betrieb={snapshot.betrieb} jetzt={jetzt} />

        {nichtsUebrig && (
```

(Ein `<div>` statt `<aside>`: Die Karte trägt schon ein eigenes `<section>` mit
Überschrift; ein zweites Landmark neben der Filterleiste wäre Rauschen.)

- [ ] **Step 3: Den Satz in `Karte.tsx` anpassen**

In dem zweiten `<p className="hinweis-schematisch">` den Satz
„Ein Klick wählt ein Land aus (goldener Rahmen) und filtert die Liste darunter."
zu „Ein Klick wählt ein Land aus (goldener Rahmen) und filtert die Liste." —
die Liste liegt nicht mehr überall „darunter". (Task 8 erweitert den Absatz um
die Punkte.)

- [ ] **Step 4: Das Stylesheet umbauen**

In `stil.css` unter `:root` (bei `--rail`/`--zeile-hoehe`):

```css
  --karte: clamp(340px, calc(100vw - var(--rail) - 780px), 460px);
```

`.geruest` ersetzen (Standard = mittlere Breiten: Karte oben in der rechten
Spalte, nicht mitwandernd):

```css
.geruest {
  min-height: 100%;
  display: grid;
  grid-template-columns: var(--rail) minmax(0, 1fr);
  grid-template-rows: auto auto minmax(0, 1fr);
  grid-template-areas:
    "kopf kopf"
    "rail karte"
    "rail haupt";
}
```

Hinter `.rail` ergänzen:

```css
.kartenspalte {
  grid-area: karte;
  min-width: 0;
  padding: 20px 26px 0;
}

/* Mittlere Breiten: die Karte steht oben in der rechten Spalte und wird nicht
   breiter als noetig -- sonst waere sie hoeher als das Fenster. */
.kartenspalte .tafel {
  max-width: 460px;
}
```

Die Regel `.tafeln { … }` (Abschnitt „Tafeln (Karte, Betrieb)") **löschen**, ebenso
die Regel `.tafeln` im Block `@media (max-width: 1180px)` — und damit den ganzen
Block, wenn er leer wird. Niemand benutzt die Klasse mehr; tote Regeln sind
später die Stelle, an der jemand „nur schnell" etwas ändert und nichts passiert.

Vor `@media (max-width: 960px)` einfügen:

```css
/* Breit genug fuer drei Spalten: Filter | Karte | Liste. Die Karte wandert mit,
   damit sie sichtbar bleibt, waehrend man durch die Liste blaettert -- sonst
   waere ein Hover in der Liste ein Ring auf einer Karte, die man nicht sieht. */
@media (min-width: 1400px) {
  .geruest {
    grid-template-columns: var(--rail) var(--karte) minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas:
      "kopf kopf kopf"
      "rail karte haupt";
  }

  .kartenspalte {
    padding: 20px 0 24px 20px;
    align-self: start;
    position: sticky;
    top: 0;
    max-height: calc(100vh - var(--kopf-hoehe, 132px));
    overflow-y: auto;
  }

  .kartenspalte .tafel {
    max-width: none;
  }
}
```

Im bestehenden `@media (max-width: 960px)`-Block `.geruest` ersetzen:

```css
  .geruest {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
    grid-template-areas:
      "kopf"
      "rail"
      "karte"
      "haupt";
  }

  .kartenspalte {
    padding: 16px 14px 0;
  }
```

- [ ] **Step 5: Tests und Typprüfung**

Run: `cd web && npx vitest run && npx tsc --noEmit && npx vite build`
Expected: alles grün.

- [ ] **Step 6: Im Browser prüfen — gemessen, nicht angesehen**

Scratchpad-Skript `pruefe-layout.mjs` (Entwicklungsserver, Snapshot vorhanden).
Für jede Breite **1920, 1440, 1400, 1399, 1280, 1100, 961, 960, 800, 390** (Höhe
900, außer 390×844) prüfen und ausgeben:

1. Kein waagerechtes Scrollen der Seite:
   `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.
2. Die Liste passt in ihren Behälter (öffne bei Bedarf „Top-Treffer"):
   `.liste.scrollWidth <= .liste.clientWidth` und kein `.zeile` läuft rechts
   über `.liste` hinaus. **Ab 1400 px ist das die Probe auf die 706-px-Rechnung.**
   Schlägt sie bei 1400 oder 1440 fehl, `--karte` bzw. den Schwellwert
   `1400px` anheben — und die Zahl in den Kommentar an `--karte` schreiben.
3. **Ab 1400 px** bleibt die Karte stehen, während die Seite scrollt:
   `window.scrollTo(0, 2000)`, dann `boundingBox()` von `.kartenspalte .tafel`
   → `y` zwischen 0 und 40. **Unter 1400 px** scrollt sie mit (`y` < 0 nach dem
   Scrollen).
4. Ab 1400 px liegt die Betriebstafel **über** „Top-Treffer" in `.haupt`, und
   `.tafeln` kommt im DOM nicht mehr vor.
5. Ab 1400 px passt bei 1440×900 die **Kartenzeichnung und der Satz mit der
   Abdeckung** ohne inneres Scrollen der Kartenspalte in das Fenster
   (`.kartenspalte.scrollHeight <= .kartenspalte.clientHeight`, sonst notieren,
   um wie viel sie überläuft). Läuft sie über: die beiden Hinweisabsätze
   (`.hinweis-schematisch`) in ein standardmäßig geschlossenes
   `<details className="karte__hinweise"><summary>So ist die Karte zu lesen</summary>…</details>`
   packen — **der Abdeckungssatz (`.abdeckung`) bleibt dauerhaft sichtbar**
   (N2 verlangt ihn ausdrücklich), und die Aussage „Kacheln sind schematisch"
   darf nicht verschwinden, sondern nur eingeklappt sein; in der Legende steht
   dann zusätzlich ein Halbsatz „Kacheln sind schematisch (Details unten)".
6. Keine Konsolenfehler.
7. Die Kopfhöhe: `.kopf.offsetHeight` messen. Weicht sie stark von 132 px ab
   (dem Rückfallwert von `--kopf-hoehe`, den `.rail` und jetzt auch die
   Kartenspalte benutzen), den Wert in `:root` nachziehen — **gemeinsam** für
   beide, nicht nur für die Karte.

Nachher-Bilder bei 1440×900, 1100×800, 390×844 machen und mit `vorher/`
vergleichen; das Ergebnis der Sichtung in zwei Sätzen im Commit festhalten.

- [ ] **Step 7: Die Skills anwenden**

`web-design-guidelines` auf `web/src/stil.css` (die geänderten Abschnitte) und
`web/src/App.tsx`; `react-best-practices` auf `App.tsx`. Echte Befunde beheben
(Kontrast, Tastaturführung, Sticky-Verhalten), unechte mit einem Satz Begründung
verwerfen. Das Ergebnis im Commit-Rumpf nennen.

- [ ] **Step 8: Commit**

Nachricht (Vorschlag): `feat(web): Karte als eigene mitwandernde Spalte, Betriebstafel an den Anfang der Liste`.

---

### Task 7: Hover in der Liste hebt die Verortung auf der Karte hervor

**Files:** Modify `web/src/ui/Objektzeile.tsx`, `web/src/ui/Bereich.tsx`,
`web/src/App.tsx`, `web/src/ui/Karte.tsx`, `web/src/stil.css`.

**Interfaces:**
- Consumes: `markierungFuer`, `beschreibeMarkierung` (Task 3, `logik/karte.ts`).
- Produces:
  - `Objektzeile`- und `Bereich`-Eigenschaft `onHover: (objekt: SnapshotObjekt | null) => void`
  - `Karte`-Eigenschaft `hervorgehobenesObjekt: SnapshotObjekt | null`

**Leistung, die der Spec ausdrücklich verlangt:** `Objektzeile` ist `memo`isiert
und wird über eine virtualisierte Liste mit bis zu 22.000 Einträgen gezeichnet.
`onHover` muss deshalb eine **stabile** Funktion sein — `setHoverObjekt` aus
`useState` ist es. Ein Inline-Pfeil an dieser Stelle würde das Memoisieren der
ganzen sichtbaren Zeilenmenge bei jedem Hover zunichtemachen.

- [ ] **Step 1: `Objektzeile.tsx` — Hover und Fokus melden**

In `Eigenschaften` ergänzen:

```ts
  /** Meldet die Zeile unter dem Zeiger bzw. mit Fokus -- `null`, wenn keine. Muss stabil sein (memo). */
  onHover: (objekt: SnapshotObjekt | null) => void;
```

`onHover` in der Parameterliste von `ObjektzeileRoh` ergänzen. Vor dem `return`:

```tsx
  // Fokus gleichwertig zum Zeiger: Wer mit der Tastatur durch die Liste geht,
  // bekommt denselben Ring auf der Karte.
  const hoverAnschluss = {
    onMouseEnter: () => onHover(objekt),
    onMouseLeave: () => onHover(null),
    onFocus: () => onHover(objekt),
    onBlur: () => onHover(null),
  };
```

und `{...hoverAnschluss}` auf **beide** Wurzelelemente (`<div>` ohne URL und `<a>`).

- [ ] **Step 2: `Bereich.tsx` — durchreichen**

`onHover: (objekt: SnapshotObjekt | null) => void;` in `Eigenschaften`, in die
Parameterliste, und in `zeichne` an `<Objektzeile … onHover={onHover} />`.

- [ ] **Step 3: `App.tsx` — Zustand, Aufräumen, Anschluss**

In `Dashboard`, neben den übrigen `useState`:

```tsx
  const [hoverObjekt, setHoverObjekt] = useState<SnapshotObjekt | null>(null);
```

Ein `mouseleave` feuert nicht, wenn die Zeile unter dem Zeiger **verschwindet**
(Filterwechsel, Bereich zugeklappt). Damit die Karte dann nicht auf ein Objekt
zeigt, das es in der Liste nicht mehr gibt:

```tsx
  useEffect(() => {
    setHoverObjekt(null);
  }, [filter, offen]);
```

An **alle vier** `<Bereich …>` `onHover={setHoverObjekt}`; an `<Karte …>`
`hervorgehobenesObjekt={hoverObjekt}`.

- [ ] **Step 4: `Karte.tsx` — das Overlay und die Zeile darunter**

Import ergänzen: `beschreibeMarkierung`, `markierungFuer` aus `../logik/karte.ts`.
In `Eigenschaften` und die Parameterliste: `hervorgehobenesObjekt: SnapshotObjekt | null`.

Nach `const spanne = …`:

```tsx
  const markierung = useMemo(
    () => (hervorgehobenesObjekt === null ? null : markierungFuer(hervorgehobenesObjekt)),
    [hervorgehobenesObjekt]
  );
  const punktJeZweisteller = useMemo(
    () => new Map(punkte.map((p) => [p.zweisteller, p])),
    [punkte]
  );
  const lageJeName = useMemo(() => new Map(lagen.map((l) => [l.name, l])), [lagen]);
```

Nach `const radius = …`:

```tsx
  const markierterPunkt =
    markierung?.art === "plz" ? punktJeZweisteller.get(markierung.zweisteller) : undefined;
  const markierteLage =
    markierung?.art === "bundesland" ? lageJeName.get(markierung.name) : undefined;
```

In der SVG **hinter** der `punkte.map(…)` (das Overlay liegt über allem und
ändert die Grundschicht nicht):

```tsx
          {/*
            Das Overlay des Hovers: ein zusaetzlicher Ring, KEINE Aenderung an
            Kachel oder Punkt darunter (die Karte zeigt immer den ganzen
            Bestand). Es verschwindet mit dem Zeiger.
          */}
          {markierteLage !== undefined && (
            <rect
              className="markierung"
              x={markierteLage.x - markierteLage.breite / 2 - 3}
              y={markierteLage.y - markierteLage.hoehe / 2 - 3}
              width={markierteLage.breite + 6}
              height={markierteLage.hoehe + 6}
              rx={5}
              aria-hidden="true"
            />
          )}
          {markierterPunkt !== undefined && (
            <circle
              className="markierung"
              cx={markierterPunkt.x}
              cy={markierterPunkt.y}
              r={radius(markierterPunkt.anzahl) + 4}
              aria-hidden="true"
            />
          )}
```

Unter dem `</svg>`, vor `<div className="karte__legende">`:

```tsx
        <p className="karte__hoverzeile">
          {hervorgehobenesObjekt === null ? "" : beschreibeMarkierung(markierung)}
        </p>
```

- [ ] **Step 5: Stylesheet**

Hinter `.plzpunkt`:

```css
/* Das Overlay des Hovers aus der Liste -- ein Ring, keine Umfaerbung. */
.markierung {
  fill: none;
  stroke: var(--gold-hell);
  stroke-width: 2;
  pointer-events: none;
  filter: drop-shadow(0 0 3px rgba(240, 195, 126, 0.7));
}

/* Feste Hoehe, damit die Karte nicht springt, wenn ein Satz erscheint. */
.karte__hoverzeile {
  margin: 8px 0 0;
  min-height: 3em;
  font-family: var(--schrift-prosa);
  font-size: 12px;
  line-height: 1.45;
  color: var(--papier-gedaempft);
}
```

- [ ] **Step 6: Tests und Typprüfung**

Run: `cd web && npx vitest run && npx tsc --noEmit && npx vite build`
Expected: alles grün.

- [ ] **Step 7: Im Browser prüfen**

Scratchpad-Skript (Entwicklungsserver, echter Snapshot, 1440×900). Erst die
Liste „Top-Treffer" öffnen, falls zu; dann:

1. Eine Zeile **mit PLZ** (`.zeile` mit Text `/· \d{5}/`) anfahren →
   genau **ein** `.markierung` als `circle` in der SVG, die Zeile darunter
   enthält „PLZ-Bereich" und „kein genauer Ort".
2. Eine Zeile **ohne PLZ, mit Bundesland** (`hasNotText: /\d{5}/`, Text enthält
   ` · <Land>`) → ein `.markierung` als `rect`, Text „Nur das Land ist bekannt".
3. Eine Zeile **ohne beides** — im Snapshot suchen (`objekt.bundesland === null`,
   im Dashboard der Bereich „Nicht beurteilbar" oder per Filter „Objekte ohne
   Region"; falls die Datei keins hergibt, dies im Bericht sagen, nicht
   behaupten) → kein `.markierung`, Text „nicht auf der Karte".
4. Den Zeiger aus der Liste nehmen → `.markierung` verschwindet, die Zeile
   darunter ist leer.
5. **Tastatur:** eine Zeile mit `Tab` fokussieren → derselbe Ring; `Tab` weiter →
   Ring wandert bzw. verschwindet.
6. Einen Filter setzen, während eine Zeile angefahren ist → nach dem Wechsel
   kein Ring (der `useEffect` aus Step 3).
7. **Die Grundschicht ist unverändert:** die `fill`-Werte aller `.kachel__flaeche`
   und `r`-Werte aller `.plzpunkt` vor und während des Hovers sind identisch.
8. **Leistung:** Vorübergehend (nicht committen) in `ObjektzeileRoh` als erste
   Anweisung
   `(globalThis as unknown as { __z?: number }).__z = ((globalThis as unknown as { __z?: number }).__z ?? 0) + 1;`
   einfügen. Nach dem Laden `__z` lesen, dann die Maus über 40 verschiedene
   Zeilen ziehen (je ~30 ms Pause), `__z` erneut lesen. **Erwartet: Differenz 0**
   (das Memoisieren hält, weil `onHover` stabil ist). Zur Gegenprobe kurz
   `onHover={(o) => setHoverObjekt(o)}` in `Bereich`-Aufruf einsetzen: die
   Differenz muss dann deutlich über 0 liegen — sonst misst der Zähler nichts.
   Beides zurücknehmen (`git diff` muss danach frei von `__z` sein).
   Zusätzlich per `PerformanceObserver({ type: "longtask" })` während des
   Ziehens: **kein** Eintrag ≥ 50 ms.
9. Keine Konsolenfehler.

Zeigt Punkt 8 Langsamkeit trotz stabilem `onHover` (Differenz > 0 oder Long
Tasks): Hover-Zustand aus `Dashboard` herauslösen — eine kleine Quelle
(`abonniere`/`lies`/`setze`) außerhalb von React, in `Karte` per
`useSyncExternalStore` gelesen, damit `Dashboard` und die vier `Bereich`e beim
Hover gar nicht neu rechnen. **Nur wenn die Messung es verlangt**, nicht auf
Verdacht.

- [ ] **Step 8: Die Skills anwenden**

`react-best-practices` (Kategorie `rerender-*`) auf `Objektzeile.tsx`, `Bereich.tsx`,
`App.tsx`, `Karte.tsx`; `web-design-guidelines` auf das Overlay (Kontrast des
Rings gegen `--flaeche`/Kachelfarben, Fokus-Gleichwertigkeit). Echte Befunde
beheben, Rest mit Begründung verwerfen.

- [ ] **Step 9: Commit**

Nachricht (Vorschlag): `feat(web): Hover in der Liste zeigt die Verortung auf der Karte -- Ring, ehrlich beschriftet`.

---

### Task 8: Ein Klick auf einen PLZ-Punkt filtert

**Files:** Modify `web/src/ui/Karte.tsx`, `web/src/App.tsx`,
`web/src/ui/Filterleiste.tsx`, `web/src/stil.css`.

**Interfaces:**
- Consumes: `Filter.plzZweisteller`, `schalteEintrag`, `OhneAngabe.plz` (Task 4);
  `punktText`, `alsZeile` (Task 5).
- Produces: `Karte`-Eigenschaften `gewaehltePlz: readonly string[]` und
  `schaltePlz: (zweisteller: string) => void`; die Klassen `.plzknopf`,
  `.plzknopf--gewaehlt`, `.plzknopf__flaeche`.

**Warum die Punkte einen größeren Trefferbereich brauchen:** Ein Punkt hat einen
Radius von 2,2 bis 7,6 Einheiten in einer 360 Einheiten breiten Zeichnung — auf
dem Bildschirm rund 4 bis 15 px Durchmesser. Zu klein zum Treffen (WCAG 2.5.8
verlangt 24 px). Jeder Punkt bekommt deshalb einen unsichtbaren, größeren Kreis
als Trefferfläche; er gehört mit dem sichtbaren Punkt in eine Gruppe.

- [ ] **Step 1: `App.tsx` — Schalter, `schalteLand` vereinheitlichen**

Import: `schalteEintrag` aus `./logik/filter.ts` (zu den vorhandenen).

`schalteLand` ersetzen und `schaltePlz` daneben:

```tsx
  const schalteLand = (name: string) =>
    setFilter((bisher) => ({ ...bisher, bundeslaender: schalteEintrag(bisher.bundeslaender, name) }));

  const schaltePlz = (zweisteller: string) =>
    setFilter((bisher) => ({
      ...bisher,
      plzZweisteller: schalteEintrag(bisher.plzZweisteller, zweisteller),
    }));
```

An `<Karte …>` ergänzen: `gewaehltePlz={filter.plzZweisteller}` und
`schaltePlz={schaltePlz}`.

- [ ] **Step 2: `Karte.tsx` — die Punkte werden Schaltflächen**

Imports: `alsZeile`, `punktText` aus `../logik/kartentexte.ts`. In
`Eigenschaften` und der Parameterliste: `gewaehltePlz: readonly string[]`,
`schaltePlz: (zweisteller: string) => void`.

Die `punkte.map(…)` ersetzen (das `<title>` entfällt — Begründung in den
Abweichungen oben; der Name kommt aus `aria-label`):

```tsx
          {punkte.map((punkt) => {
            const gewaehlt = gewaehltePlz.includes(punkt.zweisteller);
            const r = radius(punkt.anzahl);
            return (
              <g
                key={punkt.zweisteller}
                className={`plzknopf${gewaehlt ? " plzknopf--gewaehlt" : ""}`}
                role="button"
                tabIndex={0}
                aria-pressed={gewaehlt}
                aria-label={alsZeile(punktText(punkt, gewaehlt))}
                onClick={() => schaltePlz(punkt.zweisteller)}
                onKeyDown={(ereignis) => {
                  if (ereignis.key === "Enter" || ereignis.key === " ") {
                    ereignis.preventDefault();
                    schaltePlz(punkt.zweisteller);
                  }
                }}
              >
                {/* Trefferflaeche: unsichtbar, aber groesser als der Punkt. */}
                <circle className="plzknopf__flaeche" cx={punkt.x} cy={punkt.y} r={Math.max(r + 3, 8)} />
                <circle className="plzpunkt" cx={punkt.x} cy={punkt.y} r={r} />
              </g>
            );
          })}
```

Den zweiten Legenden-Absatz (`hinweis-schematisch`, „Die Karte zeigt immer den
ganzen Bestand …") ersetzen durch:

```tsx
          <p className="hinweis-schematisch">
            Die Karte zeigt <b>immer den ganzen Bestand</b>, nie die gefilterte Auswahl — sie ist
            der Einstieg in die Liste, nicht ihr Ergebnis. Ein Klick auf eine Kachel wählt ein
            Land, ein Klick auf einen goldenen Punkt einen PLZ-Bereich (goldener Rahmen) und
            filtert die Liste. Fährt man in der Liste über eine Zeile, zeigt ein Ring, wo die
            Karte sie verortet.
          </p>
```

- [ ] **Step 3: `Filterleiste.tsx` — der aktive PLZ-Filter wird sichtbar**

Vor `<Gruppe name="Trefferlage" …>` einfügen. Die Gruppe erscheint **erst mit der
ersten Auswahl** (die Auswahl entsteht nur auf der Karte); `offenAnfangs`
greift dann beim Einhängen:

```tsx
      {filter.plzZweisteller.length > 0 && (
        <Gruppe name="PLZ-Bereich" zaehler={filter.plzZweisteller.length} offenAnfangs>
          <div className="wahl">
            {filter.plzZweisteller.map((zweisteller) => (
              <Wahlknopf
                key={zweisteller}
                name={`${zweisteller}…`}
                titel={`PLZ-Bereich ${zweisteller}… — erneut anklicken entfernt die Auswahl`}
                anzahl={undefined}
                gewaehlt
                umschalten={() =>
                  aendere({ plzZweisteller: filter.plzZweisteller.filter((e) => e !== zweisteller) })
                }
              />
            ))}
          </div>
          {/*
            Dieselbe Ehrlichkeit wie an den Spannenfeldern: Ein PLZ-Filter blendet
            den Bestand fast ganz aus, weil nur ein kleiner Teil eine verortbare
            PLZ traegt. Ohne diese Zeile waere der Klick auf einen Punkt eine Falle.
          */}
          <p className="regionsnotiz">
            <b>{formatiereAnzahl(ohneAngabe.plz)}</b> von {formatiereAnzahl(gesamt)} Objekten
            tragen keine verortbare PLZ und fallen heraus, solange hier etwas steht — sie sind
            gerade ausgeblendet.
          </p>
        </Gruppe>
      )}
```

- [ ] **Step 4: Stylesheet**

`.plzpunkt` behält `pointer-events: none` (die Trefferfläche der Gruppe nimmt die
Ereignisse). Dahinter:

```css
.plzknopf {
  cursor: pointer;
  outline: none;
}

/* Unsichtbar, aber getroffen: `transparent` ist eine Farbe, `none` waere keine. */
.plzknopf__flaeche {
  fill: transparent;
  stroke: none;
}

.plzknopf:hover .plzpunkt {
  fill-opacity: 1;
  stroke: var(--papier);
  stroke-width: 1;
}

.plzknopf:focus-visible .plzknopf__flaeche {
  stroke: var(--gold);
  stroke-width: 1.5;
}

.plzknopf--gewaehlt .plzpunkt {
  fill-opacity: 1;
  stroke: var(--gold-hell);
  stroke-width: 2;
}
```

- [ ] **Step 5: Tests und Typprüfung**

Run: `cd web && npx vitest run && npx tsc --noEmit && npx vite build`
Expected: alles grün.

- [ ] **Step 6: Im Browser prüfen**

Scratchpad-Skript (Entwicklungsserver, echter Snapshot, 1440×900):

1. Den größten Punkt (`.plzknopf`, erstes Element) anklicken → in der Filterleiste
   erscheint die Gruppe „PLZ-Bereich" mit einem Knopf `NN…` und dem
   Ausblendungssatz; die Fußzeile „… nach Filter" **sinkt**; jede sichtbare
   Zeile trägt eine PLZ mit dem Zweisteller `NN`.
2. Denselben Punkt erneut anklicken → Filter weg, Gruppe weg, Zahl wie vorher.
3. Den Knopf in der Filterleiste anklicken → dasselbe wie 2.
4. „zurücksetzen" nach Auswahl → Filter weg.
5. Punkt **und** Bundesland-Kachel wählen → UND (Zahl ≤ jede der beiden allein).
6. Tastatur: einen Punkt mit `Tab` erreichen, `Enter` und `Leertaste` filtern
   beide; der Fokusring ist sichtbar (Screenshot).
7. **Trefferfläche:** Mit `boundingBox()` des kleinsten `.plzknopf__flaeche`
   prüfen, dass er mindestens 16 px breit ist, und ein Klick 6 px neben den
   Mittelpunkt des sichtbaren Punkts trifft ihn.
8. Keine Konsolenfehler.

**Bekannter Zielkonflikt, hier nur festgehalten:** Jeder Punkt ist ein
Tab-Stopp (bei den heutigen Daten rund 60 zusätzliche vor der Liste). Punkte
nach Anzahl absteigend zu sortieren ist bereits so (`buendlePlzPunkte`), die
größten liegen also zuerst. Ob ein Sprunglink „Zur Liste" nötig ist, bewertet
Task 10 mit `web-design-guidelines`.

- [ ] **Step 7: Die Skills anwenden**

`web-design-guidelines` (Trefferfläche, Fokus, `aria-pressed`, Farbe allein
trägt den Zustand? — der gewählte Punkt unterscheidet sich durch Strichstärke
*und* Farbe), `react-best-practices` auf `Karte.tsx`/`Filterleiste.tsx`. Echte
Befunde beheben, Rest mit Begründung verwerfen.

- [ ] **Step 8: Commit**

Nachricht (Vorschlag): `feat(web): Klick auf einen PLZ-Punkt filtert die Liste, aktiver Filter steht in der Leiste`.

---

### Task 9: Das sofortige, gestaltete Tooltip

**Files:** Create `web/src/ui/KartenTooltip.tsx`. Modify `web/src/ui/Karte.tsx`,
`web/src/stil.css`.

**Interfaces:**
- Consumes: `kachelText`, `punktText`, `alsZeile`, `TooltipText` (Task 5);
  `platziereTooltip`, `Rechteck`, `TooltipLage` (Task 5); die Punkt-Gruppen aus Task 8.
- Produces: `export interface TooltipZiel { anker: Rechteck; text: TooltipText }`
  und `export function KartenTooltip({ ziel }: { ziel: TooltipZiel })`.

**Wie es funktioniert:** Das Tooltip hängt an der **Form**, nicht an der Maus —
so braucht es keinen Handler für jede Mausbewegung, und dieselbe Logik trägt
Tastaturfokus. Es steht mit `position: fixed` in Bildschirmkoordinaten: Weder
das `overflow: hidden` an `.tafel` noch das `overflow-y: auto` der Kartenspalte
schneidet es ab (`fixed` entkommt dem Beschnitt der Vorfahren, solange keiner
von ihnen `transform`/`filter` trägt).

- [ ] **Step 1: `KartenTooltip.tsx`**

```tsx
/**
 * Das Tooltip der Karte -- sofort, gestaltet, an die Form geheftet.
 *
 * Ersetzt das verzoegerte, unformatierte Browser-Tooltip. Es ist rein optisch
 * (`aria-hidden`): Den Namen fuer Screenreader traegt `aria-label` an der
 * Form, sonst wuerde alles doppelt vorgelesen.
 *
 * Die Platzierung rechnet `platziereTooltip` (rein, getestet). Hier wird nur
 * gemessen und gesetzt -- in einem Layout-Effekt, also vor dem ersten Bild;
 * bis dahin ist das Tooltip unsichtbar, damit es nie an der falschen Stelle
 * aufblitzt.
 */
import { useLayoutEffect, useRef, useState } from "react";
import type { TooltipText } from "../logik/kartentexte.ts";
import { platziereTooltip, type Rechteck, type TooltipLage } from "../logik/tooltipPosition.ts";

export interface TooltipZiel {
  anker: Rechteck;
  text: TooltipText;
}

export function KartenTooltip({ ziel }: { ziel: TooltipZiel }) {
  const huelle = useRef<HTMLDivElement>(null);
  const [lage, setLage] = useState<TooltipLage | null>(null);

  useLayoutEffect(() => {
    const element = huelle.current;
    if (element === null) return;
    setLage(
      platziereTooltip(
        ziel.anker,
        { breite: element.offsetWidth, hoehe: element.offsetHeight },
        { breite: document.documentElement.clientWidth, hoehe: window.innerHeight }
      )
    );
  }, [ziel]);

  return (
    <div
      ref={huelle}
      className="kartentooltip"
      aria-hidden="true"
      style={lage === null ? { visibility: "hidden" } : { left: lage.links, top: lage.oben }}
    >
      <b className="kartentooltip__titel">{ziel.text.titel}</b>
      {ziel.text.zeilen.map((zeile) => (
        <span key={zeile} className="kartentooltip__zeile">
          {zeile}
        </span>
      ))}
      <em className="kartentooltip__hinweis">{ziel.text.hinweis}</em>
    </div>
  );
}
```

- [ ] **Step 2: `Karte.tsx` — Zustand und Handler**

Imports: `useEffect, useMemo, useState` aus `react` (`useMemo` ist da),
`kachelText` aus `../logik/kartentexte.ts` (`punktText`/`alsZeile` sind seit Task
8 da), `KartenTooltip, type TooltipZiel` aus `./KartenTooltip.tsx`.

In `Karte`, nach den `useMemo`s:

```tsx
  const [ziel, setZiel] = useState<TooltipZiel | null>(null);

  // Ein Bildlauf lässt die Form unter dem stehenden Tooltip wegwandern.
  const tooltipOffen = ziel !== null;
  useEffect(() => {
    if (!tooltipOffen) return;
    const schliessen = () => setZiel(null);
    window.addEventListener("scroll", schliessen, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", schliessen, { capture: true });
  }, [tooltipOffen]);

  const zeigeTooltip =
    (text: TooltipText) => (ereignis: React.PointerEvent<SVGGElement> | React.FocusEvent<SVGGElement>) => {
      // Ein Fingertipp ist ein Klick, kein Hover: ein aufblitzendes Tooltip waere Rauschen.
      if ("pointerType" in ereignis && ereignis.pointerType === "touch") return;
      const form = ereignis.currentTarget.querySelector("[data-anker]") ?? ereignis.currentTarget;
      const r = form.getBoundingClientRect();
      setZiel({ anker: { x: r.left, y: r.top, breite: r.width, hoehe: r.height }, text });
    };
  const verbergeTooltip = () => setZiel(null);
```

(`TooltipText` als Typ importieren.)

An der Kachel-`<g>`: das `<title>{beschriftungFuer(...)}</title>` **entfernen**;
`beschriftungFuer` durch `alsZeile(kachelText(land, lage.name, gewaehlt))`
ersetzen (an `aria-label`); die Funktion `beschriftungFuer` selbst löschen (samt
den dann ungenutzten Imports `formatiereAnzahl`/`formatiereDscr` nur, wenn sie
nirgends sonst gebraucht werden — `tsc` meldet es). Ergänzen:

```tsx
                onPointerEnter={zeigeTooltip(kachelText(land, lage.name, gewaehlt))}
                onPointerLeave={verbergeTooltip}
                onFocus={zeigeTooltip(kachelText(land, lage.name, gewaehlt))}
                onBlur={verbergeTooltip}
```

und am `<rect className="kachel__flaeche" …>` das Attribut `data-anker=""` (der
Anker ist das Rechteck, nicht die ganze Gruppe — sie trägt bei Berlin und
Hamburg noch Faden und Ankerpunkt).

An der Punkt-`<g>` (`plzknopf`): dieselben vier Attribute mit
`punktText(punkt, gewaehlt)`; am sichtbaren `<circle className="plzpunkt" …>`
`data-anker=""`.

Am Ende des Rückgabewerts, **als letztes Kind** von `<section className="tafel">`:

```tsx
      {ziel !== null && <KartenTooltip ziel={ziel} />}
```

- [ ] **Step 3: Stylesheet**

```css
/* Das Tooltip der Karte: fixed, damit weder overflow:hidden an .tafel noch das
   Scrollen der Kartenspalte es abschneidet. Rein optisch -- kein Zeigerziel. */
.kartentooltip {
  position: fixed;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 260px;
  padding: 9px 12px;
  background: var(--flaeche-hoch);
  border: 1px solid var(--linie-hell);
  border-radius: var(--r);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 1.4;
  pointer-events: none;
}

.kartentooltip__titel {
  font-size: 12.5px;
  letter-spacing: 0.04em;
  color: var(--papier);
}

.kartentooltip__zeile {
  color: var(--papier-gedaempft);
  font-variant-numeric: tabular-nums;
}

.kartentooltip__hinweis {
  margin-top: 4px;
  font-style: normal;
  font-size: 11px;
  color: var(--gold-hell);
}
```

- [ ] **Step 4: Tests und Typprüfung**

Run: `cd web && npx vitest run && npx tsc --noEmit && npx vite build`
Expected: alles grün.

- [ ] **Step 5: Im Browser prüfen**

Scratchpad-Skript (Entwicklungsserver, echter Snapshot, 1440×900):

1. Eine Kachel anfahren → **innerhalb von 100 ms** existiert `.kartentooltip`
   (`waitForSelector` mit `timeout: 100`), es trägt den Namen, die vier Zeilen
   und den Klickhinweis; es liegt vollständig im Fenster
   (`boundingBox()` innerhalb von `0..innerWidth × 0..innerHeight`).
2. Die **oberste** Kachel (SH) → Tooltip **unterhalb** (`top` größer als die
   Unterkante der Kachel); die **unterste** (BY oder BW) → **oberhalb**.
3. Einen Punkt anfahren → Tooltip mit „PLZ-Bereich NN…", zwei Zeilen, Hinweis.
4. Nach Klick auf den Punkt zeigt das Tooltip „Klick **entfernt** …" (Zustand
   `gewaehlt` fließt ein).
5. Zeiger weg → Tooltip weg. Tastaturfokus auf eine Kachel → Tooltip; `Tab`
   weiter → weg.
6. Auf der Kartenspalte scrollen bzw. die Seite scrollen, während das Tooltip
   offen ist → es schließt.
7. **Kein doppeltes Tooltip:** Im DOM der SVG gibt es kein `<title>` mehr
   (`svg.querySelectorAll("title").length === 0`).
8. `aria-label` an einer Kachel und an einem Punkt vorhanden und gleichlautend
   mit `Titel · Zeile · Zeile …`.
9. **Fingertipp:** Mit `hasTouch: true` und `page.tap()` auf eine Kachel → kein
   Tooltip, der Filter greift trotzdem.
10. Keine Konsolenfehler; kein Long Task ≥ 50 ms beim Überfahren aller Kacheln.

- [ ] **Step 6: Die Skills anwenden**

`web-design-guidelines` (Kontrast der Tooltip-Farben gegen `--flaeche-hoch`,
`prefers-reduced-motion` — es gibt keine Animation, also nichts zu tun, das
festhalten), `react-best-practices` (der Layout-Effekt setzt Zustand — ist das
hier vertretbar? Ja, weil er vor dem Bild läuft und die Messung nicht anders
möglich ist; der Befund wird mit dieser Begründung verworfen, falls er kommt).

- [ ] **Step 7: Commit**

Nachricht (Vorschlag): `feat(web): sofortiges gestaltetes Tooltip an Kacheln und Punkten, auch per Tastaturfokus`.

---

# Block C — Abnahme

### Task 10: Gesamtprüfung, Audit, Dokumentation, Merge (Koordinator)

- [ ] **Step 1: Volle Prüfung auf dem Stand des Zweigs**

Run: `cd web && npx vitest run && npx tsc --noEmit && npx vite build`
Expected: alles grün, Testzahl ≈ 146 (Zahl aus dem Zwischenschritt), `vite build`
ohne Warnungen.

- [ ] **Step 2: Gesamtdurchlauf im Browser**

Ein Scratchpad-Skript fährt den Weg einmal von vorn bis hinten, bei **1440×900**
und **390×844**, mit dem echten Snapshot, und legt Screenshots ab:
Laden (Ladetext ohne „von … MB"-Widerspruch) → Liste öffnen → Zeile anfahren
(Ring + Satz) → Kachel anfahren (Tooltip) → Punkt anklicken (Filter + Gruppe in
der Leiste + kleinere Liste) → zurücksetzen. Bei 390 px: Karte steht zwischen
Filterleiste und Liste, kein waagerechtes Scrollen, Tooltips erscheinen nicht
(Touch), Klick filtert. **Konsole: kein Fehler.**

- [ ] **Step 3: Unabhängige Prüfung der Oberfläche**

`web-design-guidelines` über **alle** in diesem Plan berührten UI-Dateien
(`Karte.tsx`, `KartenTooltip.tsx`, `Objektzeile.tsx`, `Bereich.tsx`,
`Filterleiste.tsx`, `App.tsx`, `stil.css`) und `react-best-practices` über
`Karte.tsx`, `App.tsx`, `VirtuelleListe.tsx`, `laden.ts`. Dabei ausdrücklich
bewerten: **Tab-Reihenfolge** (Filterleiste → Karte mit ~76 Stopps → Liste —
braucht es einen Sprunglink „Zur Liste"?), **Farbe allein** trägt keinen
Zustand (Ring, gewählter Punkt, gewählte Kachel), **Kontrast** des Rings und der
Tooltip-Texte. Echte Befunde beheben (eigener Commit je Befund), unechte mit
Begründung verwerfen, **alles** in einer Liste festhalten — sie geht in
`UEBERGABE.md`.

- [ ] **Step 4: Spec und Übergabe auf Stand bringen**

- `specs/2026-09-19-karte-dreh-und-angelpunkt-design.md`: den Satz „(bereits
  exportiert aus `karte.ts`)" berichtigen („wird in Task 4 exportiert"), die
  drei Abweichungen dieses Plans (Objekt statt ID, `<title>` entfällt,
  Punkt-Trefferfläche) mit je einem Satz nachtragen, und oben vermerken:
  „Umgesetzt am <Datum>, Plan `plans/2026-09-19-karte-dreh-und-angelpunkt.md`."
- `UEBERGABE.md`: Abschnitt „Audit-Befunde der Weboberfläche" — A, B, C als
  erledigt mit Messergebnis (Task 1 Step 7: was gibt Chromium über
  `Content-Encoding` preis; Task 2 Step 2: p95 der Scroll-Commits; Task 7
  Step 7: Differenz der Zeilen-Renders); der Karten-Abschnitt als erledigt; das
  Design-/Barrierefreiheits-Audit: was Step 3 fand; **die Liste der noch
  offenen Punkte** (A16, A10, A11 Schritt 4, Gegenprobe `Location`-Kopf).
- Gedächtnis (`immo-radar-uebergabe.md` und das Karten-Stichwort) auf Stand
  bringen.

- [ ] **Step 5: Merge, Push, Aufräumen**

```bash
git checkout main
git merge --no-ff feat/karte-oberflaeche
cd web && npx vitest run && npx tsc --noEmit && npx vite build
git push origin main
```

Der Push löst `deploy-dashboard.yml` aus; den Lauf abwarten
(`gh run list --workflow deploy-dashboard.yml --limit 1`, `gh` je Aufruf wie in
`UEBERGABE.md` beschrieben einloggen) und melden, ob er grün ist. Das
Dashboard liegt hinter Cloudflare Access — ein Blick von außen liefert 302, das
ist der erwartete Beweis für den Schutz, **kein** Beleg für die neue
Oberfläche; deren Beleg ist der grüne Lauf plus die lokalen Browserprüfungen.
Worktrees aufräumen: erst Prozesse beenden, dann die `node_modules`-Junction
lösen (`cmd //c "rmdir <worktree>\web\node_modules"`, ebenso `scraper`), dann
löschen; Gegenprobe `ls /c/immo-radar/web/node_modules | wc -l`.

- [ ] **Step 6: Sitzung beenden**

Ledger, Gedächtnis und `UEBERGABE.md` stehen (Step 4). Kurz melden, was fertig
ist und was als Nächstes kommt, dann **aufhören** — der Nutzer leert die Sitzung
(Regel 9, „Eine große Aufgabe je Sitzung").

---

## Selbstprüfung des Plans

**Abdeckung des Spec:** Hover Tabelle → Karte (Task 7); Tooltip statt `<title>`
(Task 9, Abweichung 3 begründet); Klick auf PLZ-Punkt filtert, `plzZweisteller`,
`wendeFilterAn`-Zeile, `schaltePlz` (Tasks 4, 8); Filterleiste zeigt den
aktiven PLZ-Filter — die im Spec offen gelassene Detailfrage, hier als Gruppe
mit Chip plus Ausblendungssatz entschieden (Task 8); Layout als eigene Spalte,
Betriebstafel an den Anfang, schmale Breiten (Task 6); Ehrlichkeit für Objekte
ohne PLZ/Bundesland (Task 3, Satz unter der Karte in Task 7); Invariante „ganzer
Bestand" — nur Overlay (Task 7, Prüfpunkt 7); Nicht-Ziele — keine Geokodierung,
keine Grundschichtänderung, kein neuer Export-Schritt, keine neue Abhängigkeit
(Global geltende Randbedingungen); die Skills bei jedem Web-Schritt;
TDD für reine Logik, Browser für Verdrahtung (Architektur). Zusätzlich die drei
Performance-Befunde A/B/C (Tasks 1, 2).

**Platzhalter:** keine „TBD"/„später"; jede Codeänderung ist ausgeschrieben; wo
eine Messung entscheidet (Task 2 Step 2, Task 7 Step 7 Ende), steht die
Entscheidungsregel vorab da.

**Typkonsistenz:** `Markierung`/`markierungFuer`/`beschreibeMarkierung`
(Task 3 → 7); `schalteEintrag`, `Filter.plzZweisteller`, `OhneAngabe.plz`
(Task 4 → 8); `TooltipText`/`kachelText`/`punktText`/`alsZeile` (Task 5 → 8, 9);
`Rechteck`/`TooltipLage`/`platziereTooltip` (Task 5 → 9); `onHover` und
`hervorgehobenesObjekt` (Task 7); `gewaehltePlz`/`schaltePlz` (Task 8);
`TooltipZiel`/`KartenTooltip` (Task 9). Die Karte bekommt ihre Eigenschaften
schrittweise (7: `hervorgehobenesObjekt`, 8: `gewaehltePlz`+`schaltePlz`); jeder
Task nennt die Ergänzung und lässt `tsc` sie prüfen.

**Bekannte Restunsicherheit, offen benannt:** Ob Chromium (und andere Browser)
`Content-Encoding` über `fetch` herausgeben, ist im Plan nicht vorausgesetzt —
`erwarteteBytes` und `gueltigesZiel` decken beide Fälle, Task 1 Step 7 misst
und hält fest, welcher eintritt. Firefox und Safari sind mit Playwright hier
nicht geprüft; das steht dann ausdrücklich in `UEBERGABE.md`, nicht als
stillschweigend erledigt.
