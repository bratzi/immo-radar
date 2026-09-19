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

## Entscheidungen aus dem Grilling (2026-09-19, mit dem Nutzer)

Vor dem Start von Block B hat der Nutzer den Plan gegen die echten Zahlen
durchgesprochen. **Diese Entscheidungen gelten und werden nicht wieder
aufgebracht:**

| Frage | Entscheidung |
|---|---|
| Welche Fensterbreiten? | **Wechselt stark, auch Handy.** Der schmale Fall ist gleichwertig zu lösen, nicht nur „fällt in den Fluss zurück" |
| Was leistet die Karte auf dem Handy? | **Einstieg und Filter, ehrlich begrenzt:** Tippen auf Kachel oder Punkt filtert. **Kein Hover-Ring, kein Tooltip auf Touch** — ein Finger schwebt nicht, und eine Listenzeile ist ein Link (Tippen öffnet die Quelle), kann also nicht zugleich „zeig auf der Karte" bedeuten |
| Notebook (1366 px)? | **Mitwandernde Karte schon ab 1360 px**, Karte 300–460 px breit. Gerechnet: 296 (Filterleiste) + 300 (Karte) + 706 (Mindestbreite einer Listenzeile) + 52 (Innenabstand von `.haupt`) = 1354 → 1360. Die im Gespräch zuerst genannten 1300 px reichten rechnerisch nicht. Unter 1360 px steht die Karte im Fluss und klebt nicht |
| Zuklappen? | **Unter 1360 px zuklappbar. Beim ersten Besuch offen, danach gemerkt** (`localStorage`; gesperrt oder kaputt → offen). Zugeklappt zeigt der Kopf den aktiven Filter („Bayern · 80…") — Task 6b |
| Lohnt der Hover-Ring, wenn er in 97,4 % der Fälle nur eine Kachel trifft? | **Ja, wie geplant.** Gemessen am Snapshot vom 2026-09-18 (21.897 Objekte): 221 (1,0 %) bekommen einen PLZ-Punkt, 21.321 (97,4 %) nur eine Kachel, 355 (1,6 %) gar nichts. Der Ring liefert dort Orientierung, keine neue Angabe |
| Die leeren Hüllen ohne Region? | **Festhalten, nach der Karte angehen** — siehe Task 10, Step 4 |

**Der Fund, der zur letzten Zeile führte:** 352 der 356 Objekte ohne Bundesland
haben **weder Titel noch Ort noch PLZ — nur eine URL** (347 der 356 stammen von
Immowelt), zuletzt gesehen 151 am 17. und 197 am 18. Der Entwurf nannte für
E-7 noch 54 (Stand 09-15, womöglich andere Zählweise; dem Snapshot fehlt
`first_seen`, deshalb ist „erst seit …" **nicht belegt**). Die Kategorie
„Objekte ohne Region" aus E-7 ist im Dashboard nirgends gebaut. **Nicht Teil
dieses Plans** — dieser Plan behandelt solche Objekte nur ehrlich (kein Ring,
ein Satz unter der Karte).

Zwei weitere Messungen, die der Plan berücksichtigt: Die 221 PLZ-Objekte
verteilen sich auf 60 Punkte (größter 16 Objekte, Median 2, 15 Punkte mit genau
einem Objekt), 186 davon sind Zwangsversteigerungen — ein Klick auf einen Punkt
ergibt also eine **sehr kleine** Liste. Das ist ehrlich und wird durch den
Ausblendungssatz in der Filterleiste (Task 8) gesagt.

**Vom Koordinator ohne Rückfrage ergänzt** (klein, im Geist der Entscheidungen):
ein Sprunglink „Zur Liste" (sonst rund 76 Tab-Stopps vor der Liste), die
Kürzel-Schriftgröße bei 300 px Spaltenbreite nachprüfen, eine wirksame
Trefferfläche der Punkte von mindestens 24 px auf Touch, Hover nur für Maus und
Stift (Tastaturfokus bleibt gleichwertig).

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
- **Touch bekommt keinen Hover.** Weder Ring noch Tooltip erscheinen bei einem
  Fingertipp; Tippen filtert. Maus und Stift (`pointerType` `mouse`/`pen`) sowie
  Tastaturfokus (`:focus-visible`) lösen Ring und Tooltip aus.
- **Kein `localStorage`-Zugriff ohne `try/catch`** — schon der Zugriff auf
  `window.localStorage` kann werfen (blockierte Website-Daten, privates
  Fenster). Die Seite muss ohne Speicher genauso laufen.
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
   im Hintergrund. **Vite bindet hier nur an IPv6 — in Skripten `localhost`
   benutzen, nicht `127.0.0.1`** (der eigene Testserver aus Task 1 bindet
   ausdrücklich `127.0.0.1`, dort gilt das umgekehrt). **Auf der Seite gibt es
   zwei `.liste`-Elemente**, und bei 1440×900 liegt die erste unter dem
   sichtbaren Bereich: `.locator(".liste").first().scrollIntoViewIfNeeded()`,
   sonst trifft ein Mausrad-Schritt nichts (gemessen in Task 2: ein Skript
   meldete „0 Commits", was leicht als „kein Problem" hätte gelten können).
   **Nach der Aufgabe beenden**, gezielt über die
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
| `web/src/App.tsx` | Layout, Sprunglink, Hover-Zustand, PLZ-Schalter | 6, 7, 8 |
| `web/src/logik/karteOffen.ts` (neu), `karteOffen.test.ts` (neu) | Zuklapp-Zustand der Karte, sicher gegen fehlenden Speicher | 6b |
| `web/src/logik/kartentexte.ts` | + `filterKurz` (Filter-Kurztext im zugeklappten Kartenkopf) | 6b |
| `web/src/stil.css` | Kartenspalte, Overlay, Punkt-Zustände, Tooltip | 6, 7, 8, 9 |

## Reihenfolge und Parallelität

- **Block A (Tasks 1–5): ERLEDIGT am 2026-09-19** — fünf Worktrees
  gleichzeitig, gemergt, 145 Web-Tests grün. Die Dateien waren disjunkt. Einzige Berührung: Task 3 hängt neue Funktionen ans Ende von
  `karte.ts`, Task 4 ändert dort nur die Zeile `function zweistellerMitKoordinate`
  zu `export function …` — git führt das ohne Konflikt zusammen.
- **Block B (Tasks 6, 6b, 7, 8, 9): nacheinander in einem Zweig**, gestartet von
  `main` **nach** dem Merge von Block A. Alle berühren `Karte.tsx`, `App.tsx`
  oder `stil.css`; Parallelität brächte nur Merge-Arbeit.
- **Block C (Task 10):** Abnahme, Dokumentation, Merge/Push — Koordinator.
- **Modellwahl (Vorschlag, entscheidet der Koordinator beim Losschicken):**
  Tasks 1–5 `sonnet` (Code ist ausgeschrieben; **so gelaufen und gut**),
  Tasks 6–9 `opus` (Gestaltungsurteil, React-Leistung, Browser-Prüfung).

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

# Zwischenschritt: Block A zusammenführen — ERLEDIGT (2026-09-19)

Alle fünf Zweige nacheinander (nicht als Octopus-Merge: zwei berühren
`karte.ts`) mit `--no-ff` in `main` gemergt, ohne Konflikt. Der Koordinator
hat die Produktionsdiffs aller fünf Zweige selbst gelesen — sie stimmten Zeile
für Zeile mit dem Plan überein. **145 Web-Tests grün, 1 übersprungen** (103 + 10
Task 1 + 8 Task 3 + 10 Task 4 + 14 Task 5; der Plan hatte 9 und 12 gesagt und
sich in beiden Zahlen verzählt), `tsc` und `vite build` sauber.

Ein Befund des Agenten zu Task 3 ist bereits eingearbeitet: Der Satz unter der
Karte für Objekte ohne Markierung sagt jetzt „keine verortbare PLZ und kein
Bundesland" statt „weder PLZ noch Bundesland" — ein Objekt mit kaputter oder
koordinatenloser PLZ trägt sehr wohl eine PLZ.

**Lehre beim Aufräumen der Worktrees:** `cmd //c "rmdir <pfad>"` aus Git-Bash
meldete „Pfad nicht gefunden" und ließ die Junctions stehen (der Pfad wird
beim Weiterreichen verstümmelt); `git worktree remove` entfernt den Worktree,
lässt aber die Junction-Ordner zurück. Was funktionierte, ist PowerShell:
`[System.IO.Directory]::Delete($junction, $false)` nach der Prüfung
`(Get-Item $junction -Force).LinkType -eq 'Junction'` — das löst nur den Link.
**Danach** prüfen, dass im Rest kein Reparse-Point mehr liegt
(`Get-ChildItem <rest> -Recurse -Force -Attributes ReparsePoint`), erst dann
löschen, und zuletzt die Gegenprobe am echten `node_modules`.

---

# Block B — Oberfläche (nacheinander, ein Zweig)

**Worktree:** `../immo-radar-wt-karte`, Zweig `feat/karte-oberflaeche`, von `main`
nach dem Merge von Block A (`371ccd9`). Vor jedem Task die Entwicklungsumgebung
aus dem Abschnitt „Arbeitsumgebung" (Snapshot-Datei kopieren!). Nach **jedem**
Task Tests, `tsc` und die genannte Browser-Prüfung, dann ein Commit.
**Ausgangsstand: 145 Web-Tests grün, 1 übersprungen.**

**Die Aufgaben dieses Blocks lesen sich der Reihe nach:** 6 (Layout) → 6b
(Zuklappen) → 7 (Hover) → 8 (Klick) → 9 (Tooltip). Jede setzt die vorige voraus.

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
190 + 128 px, vier Lücken zu 14 px, 2 × 16 px Innenabstand). Bei `--rail` 296 px,
2 × 26 px Innenabstand von `.haupt` und der **vom Nutzer gewollten**
Mindestbreite der Karte von 300 px heißt das: 296 + 300 + 706 + 52 = 1354 —
dreispaltig ab **1360 px** Fensterbreite (deckt das verbreitete 1366-px-
Notebook), und die Kartenspalte darf nie breiter sein, als der Rest hergibt.
Deshalb: `--karte: clamp(300px, calc(100vw - var(--rail) - 780px), 460px)`.

**Folge der schmalen Karte:** Die Zeichnung ist 360 Einheiten breit; bei 300 px
Spaltenbreite (abzüglich 20 px Innenabstand) erscheint sie mit rund 78 %, die
Kachelkürzel (`font-size: 11px` in Zeichnungseinheiten) also mit rund 8,6 px
Bildschirmschrift — zu klein. Die **wirksame** Schriftgröße
(`11 × Zeichnungsbreite_px / 360`) muss bei jeder Breite ab 1360 px
mindestens 10 px betragen; sonst die Schriftgröße in `.kachel__kuerzel`
anheben (auch die Kachel selbst wächst mit, die Kürzel dürfen sie nicht
sprengen — Berlin und Hamburg auf Überlappung prüfen).

**Unter 1360 px** steht die Karte im Fluss (nicht klebend) und ist zuklappbar
(Task 6b). Zwischen 961 und 1359 px liegt sie oben in der rechten Spalte; ab
960 px abwärts zwischen Filterleiste und Liste.

- [ ] **Step 1: Vorher-Bilder machen**

Scratchpad-Skript, das bei 1440×900, 1366×768, 1100×800 und 390×844 je einen
Vollbild-Screenshot von `http://localhost:<port>/` in ein Scratchpad-Verzeichnis
`vorher/` legt (Entwicklungsserver, Snapshot vorhanden, auf `.geruest` warten).
Sie dienen dem Vergleich in Step 6, nicht der Dokumentation.

- [ ] **Step 2: `App.tsx` umbauen**

Den Block `<div className="tafeln">…</div>` **ersatzlos** auflösen: Zwischen
`<aside className="rail">…</aside>` und `<main className="haupt">` eine neue
Spalte einfügen, und `<Betriebstafel>` als **erstes** Kind von `<main>`.
Dazu ein **Sprunglink** als allererstes Kind von `.geruest` und eine Marke am
Anfang der Liste — ohne ihn sind es rund 76 Tab-Stopps (16 Kacheln + bis zu 60
Punkte, dazu die Filterleiste) vor dem ersten Objekt:

```tsx
    <div className="geruest">
      <a className="sprunglink" href="#liste">
        Zur Liste springen
      </a>
      <Kopfzeile snapshot={snapshot} topAnzahl={topImBestand} />
```

und `<main className="haupt">` bekommt `id="liste" tabIndex={-1}` (damit der
Fokus nach dem Sprung wirklich dort landet und nicht nur die Ansicht scrollt):

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
  /* 296 + 300 + 706 (kleinste Listenzeile) + 52 = 1354; darunter kein Platz. */
  --karte: clamp(300px, calc(100vw - var(--rail) - 780px), 460px);
```

Der Sprunglink (Step 2) liegt **ausserhalb des Flusses** — sonst wird er ein
eigenes Grid-Kind von `.geruest` und schiebt die Areas auseinander:

```css
.sprunglink {
  position: absolute;
  left: 8px;
  top: -48px;
  z-index: 40;
  padding: 9px 14px;
  background: var(--flaeche-hoch);
  border: 1px solid var(--gold);
  border-radius: var(--r);
  color: var(--gold-hell);
  text-decoration: none;
  transition: top 0.1s;
}

.sprunglink:focus {
  top: 8px;
}

.haupt:focus {
  outline: none;
}
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
@media (min-width: 1360px) {
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
Für jede Breite **1920, 1440, 1366, 1360, 1359, 1280, 1100, 961, 960, 800, 390**
(Höhe 900, außer 1366×768 und 390×844) prüfen und ausgeben:

1. Kein waagerechtes Scrollen der Seite:
   `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.
2. Die Liste passt in ihren Behälter (öffne bei Bedarf „Top-Treffer"):
   `.liste.scrollWidth <= .liste.clientWidth` und kein `.zeile` läuft rechts
   über `.liste` hinaus. **Bei 1360 und 1366 px ist das die Probe auf die
   706-px-Rechnung.** Schlägt sie dort fehl, `--karte` bzw. den Schwellwert
   `1360px` anheben — und die Zahl in den Kommentar an `--karte` schreiben.
3. **Ab 1360 px** bleibt die Karte stehen, während die Seite scrollt:
   `window.scrollTo(0, 2000)`, dann `boundingBox()` von `.kartenspalte .tafel`
   → `y` zwischen 0 und 40. **Unter 1360 px** scrollt sie mit (`y` < 0 nach dem
   Scrollen).
4. Ab 1360 px liegt die Betriebstafel **über** „Top-Treffer" in `.haupt`, und
   `.tafeln` kommt im DOM nicht mehr vor.
5. **Wirksame Kürzel-Schriftgröße** (siehe oben) ≥ 10 px bei 1360, 1366, 1440
   und 1920 px; Kacheln von Berlin und Hamburg überlappen nicht.
6. **Sprunglink:** mit `Tab` als erstes fokussierbares Element erreichbar,
   sichtbar nur im Fokus; `Enter` bringt den Fokus in `<main id="liste">`
   (`document.activeElement.id === "liste"`).
7. Ab 1360 px passt bei 1440×900 die **Kartenzeichnung und der Satz mit der
   Abdeckung** ohne inneres Scrollen der Kartenspalte in das Fenster
   (`.kartenspalte.scrollHeight <= .kartenspalte.clientHeight`, sonst notieren,
   um wie viel sie überläuft); bei **1366×768** muss wenigstens die
   **Kartenzeichnung vollständig** sichtbar sein, die Legende darf dort im
   Inneren der Spalte scrollen. Läuft sie über: die beiden Hinweisabsätze
   (`.hinweis-schematisch`) in ein standardmäßig geschlossenes
   `<details className="karte__hinweise"><summary>So ist die Karte zu lesen</summary>…</details>`
   packen — **der Abdeckungssatz (`.abdeckung`) bleibt dauerhaft sichtbar**
   (N2 verlangt ihn ausdrücklich), und die Aussage „Kacheln sind schematisch"
   darf nicht verschwinden, sondern nur eingeklappt sein; in der Legende steht
   dann zusätzlich ein Halbsatz „Kacheln sind schematisch (Details unten)".
8. Keine Konsolenfehler.
9. Die Kopfhöhe: `.kopf.offsetHeight` messen. Weicht sie stark von 132 px ab
   (dem Rückfallwert von `--kopf-hoehe`, den `.rail` und jetzt auch die
   Kartenspalte benutzen), den Wert in `:root` nachziehen — **gemeinsam** für
   beide, nicht nur für die Karte.

Nachher-Bilder bei 1440×900, 1366×768, 1100×800, 390×844 machen und mit `vorher/`
vergleichen; das Ergebnis der Sichtung in zwei Sätzen im Commit festhalten.

- [ ] **Step 7: Die Skills anwenden**

`web-design-guidelines` auf `web/src/stil.css` (die geänderten Abschnitte) und
`web/src/App.tsx`; `react-best-practices` auf `App.tsx`. Echte Befunde beheben
(Kontrast, Tastaturführung, Sticky-Verhalten), unechte mit einem Satz Begründung
verwerfen. Das Ergebnis im Commit-Rumpf nennen.

- [ ] **Step 8: Commit**

Nachricht (Vorschlag): `feat(web): Karte als eigene mitwandernde Spalte, Betriebstafel an den Anfang der Liste`.

---

### Task 6b: Unter 1360 px ist die Karte zuklappbar — und merkt es sich

Entscheidung des Nutzers (Grilling): Auf schmalen Bildschirmen ist die Karte
der **Einstieg**, nicht ein Dauerbrenner. Beim ersten Besuch **offen**, danach
merkt sich die Seite, ob man sie zugeklappt hat. Zugeklappt zeigt der Kopf den
aktiven Filter, damit man ihn nicht vergisst. Ab 1360 px (mitwandernde Spalte)
gibt es weder Knopf noch Zuklappen — die Karte ist dort immer sichtbar.

**Files:**
- Create: `web/src/logik/karteOffen.ts`, `web/src/logik/karteOffen.test.ts`
- Modify: `web/src/logik/kartentexte.ts`, `web/src/logik/kartentexte.test.ts`,
  `web/src/ui/Karte.tsx`, `web/src/stil.css`

**Interfaces:**
- Consumes: nichts aus anderen Tasks.
- Produces (aus `logik/karteOffen.ts`):
  - `export const KARTE_OFFEN_SCHLUESSEL = "immo-radar.karte-offen";`
  - `export function liesKarteOffen(speicher: Pick<Storage, "getItem"> | null): boolean`
  - `export function schreibeKarteOffen(speicher: Pick<Storage, "setItem"> | null, offen: boolean): void`
  - `export function holeSpeicher(): Storage | null`
- Produces (aus `logik/kartentexte.ts`):
  - `export function filterKurz(laender: readonly string[], plzZweisteller: readonly string[]): string`

- [ ] **Step 1: Die fehlschlagenden Tests schreiben**

`web/src/logik/karteOffen.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { KARTE_OFFEN_SCHLUESSEL, liesKarteOffen, schreibeKarteOffen } from "./karteOffen.ts";

const mit = (wert: string | null) => ({
  getItem: (schluessel: string) => (schluessel === KARTE_OFFEN_SCHLUESSEL ? wert : null),
});

describe("liesKarteOffen -- im Zweifel offen, nie versteckt", () => {
  it("ist offen, wenn nichts gemerkt ist (erster Besuch)", () => {
    expect(liesKarteOffen(mit(null))).toBe(true);
  });

  it("ist zu, wenn zugeklappt gemerkt ist", () => {
    expect(liesKarteOffen(mit("0"))).toBe(false);
  });

  it("ist offen, wenn offen gemerkt ist", () => {
    expect(liesKarteOffen(mit("1"))).toBe(true);
  });

  it("ist offen bei jedem anderen Wert -- ein kaputter Eintrag versteckt die Karte nicht", () => {
    expect(liesKarteOffen(mit("vielleicht"))).toBe(true);
    expect(liesKarteOffen(mit(""))).toBe(true);
  });

  it("ist offen ohne Speicher", () => {
    expect(liesKarteOffen(null)).toBe(true);
  });

  it("ist offen, wenn der Zugriff wirft (blockierte Website-Daten)", () => {
    const wirft = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    expect(liesKarteOffen(wirft)).toBe(true);
  });
});

describe("schreibeKarteOffen", () => {
  it("schreibt 1 fuer offen und 0 fuer zu", () => {
    const eintraege = new Map<string, string>();
    const speicher = { setItem: (k: string, v: string) => void eintraege.set(k, v) };
    schreibeKarteOffen(speicher, false);
    expect(eintraege.get(KARTE_OFFEN_SCHLUESSEL)).toBe("0");
    schreibeKarteOffen(speicher, true);
    expect(eintraege.get(KARTE_OFFEN_SCHLUESSEL)).toBe("1");
  });

  it("wirft nicht, wenn es keinen Speicher gibt", () => {
    expect(() => schreibeKarteOffen(null, true)).not.toThrow();
  });

  it("wirft nicht, wenn der Speicher voll oder gesperrt ist", () => {
    const wirft = {
      setItem: () => {
        throw new DOMException("voll", "QuotaExceededError");
      },
    };
    expect(() => schreibeKarteOffen(wirft, false)).not.toThrow();
  });
});
```

In `kartentexte.test.ts` den Import um `filterKurz` erweitern und anhängen:

```ts
describe("filterKurz -- was im zugeklappten Kartenkopf steht", () => {
  it("ist leer, wenn nichts gewaehlt ist", () => {
    expect(filterKurz([], [])).toBe("");
  });

  it("nennt ein Land", () => {
    expect(filterKurz(["Bayern"], [])).toBe("Bayern");
  });

  it("nennt Laender vor PLZ-Bereichen, mit Auslassungspunkten an den Bereichen", () => {
    expect(filterKurz(["Bayern"], ["80"])).toBe("Bayern · 80…");
  });

  it("nennt bis zu drei Eintraege ganz", () => {
    expect(filterKurz(["Bayern", "Sachsen"], ["80"])).toBe("Bayern · Sachsen · 80…");
  });

  it("kuerzt ab vier Eintraegen auf zwei plus Zahl -- der Kopf ist schmal", () => {
    expect(filterKurz(["Bayern", "Sachsen"], ["80", "10"])).toBe("Bayern · Sachsen · +2");
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `cd web && npx vitest run src/logik/karteOffen.test.ts src/logik/kartentexte.test.ts`
Expected: FAIL — `karteOffen.ts` existiert nicht; `filterKurz is not a function`.

- [ ] **Step 3: Die Umsetzung**

`web/src/logik/karteOffen.ts`:

```ts
/**
 * Ob die Karte auf schmalen Bildschirmen aufgeklappt ist -- und dass die Seite
 * sich das merkt.
 *
 * `localStorage` ist hier NIE verlaesslich: Blockierte Website-Daten, ein
 * privates Fenster oder ein voller Speicher lassen schon den ZUGRIFF auf
 * `window.localStorage` werfen. Deshalb steckt jeder Zugriff in einem
 * `try/catch`, und im Zweifel ist die Karte OFFEN: Eine versteckte Karte ist
 * ein Fehler, den man nicht sieht; eine offene Karte kostet nur Platz.
 */
export const KARTE_OFFEN_SCHLUESSEL = "immo-radar.karte-offen";

export function liesKarteOffen(speicher: Pick<Storage, "getItem"> | null): boolean {
  try {
    return speicher?.getItem(KARTE_OFFEN_SCHLUESSEL) !== "0";
  } catch {
    return true;
  }
}

export function schreibeKarteOffen(
  speicher: Pick<Storage, "setItem"> | null,
  offen: boolean
): void {
  try {
    speicher?.setItem(KARTE_OFFEN_SCHLUESSEL, offen ? "1" : "0");
  } catch {
    // Gesperrt oder voll: dann wird eben nichts gemerkt.
  }
}

/** Der Speicher, oder `null` -- auch dann, wenn schon der Zugriff wirft. */
export function holeSpeicher(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
```

In `kartentexte.ts` anhängen:

```ts
/**
 * Der Kurztext fuer den zugeklappten Kartenkopf: Laender zuerst, dann die
 * PLZ-Bereiche. Bis zu drei Eintraege stehen ganz da, ab vier zwei plus Zahl --
 * der Kopf ist auf dem Handy schmal.
 */
export function filterKurz(
  laender: readonly string[],
  plzZweisteller: readonly string[]
): string {
  const teile = [...laender, ...plzZweisteller.map((zweisteller) => `${zweisteller}…`)];
  if (teile.length <= 3) return teile.join(" · ");
  return `${teile.slice(0, 2).join(" · ")} · +${teile.length - 2}`;
}
```

- [ ] **Step 4: Grün sehen, Gegenprobe**

Run: `cd web && npx vitest run src/logik/karteOffen.test.ts src/logik/kartentexte.test.ts`
Expected: PASS.

Gegenprobe: in `liesKarteOffen` `!== "0"` vorübergehend zu `=== "1"` ändern —
„ist offen, wenn nichts gemerkt ist" und „ist offen bei jedem anderen Wert"
müssen rot werden; zurücknehmen.

- [ ] **Step 5: `Karte.tsx` — der Knopf und der Zustand**

Imports: `filterKurz` aus `../logik/kartentexte.ts`; `holeSpeicher`,
`liesKarteOffen`, `schreibeKarteOffen` aus `../logik/karteOffen.ts`; `useState`
aus `react`.

In `Karte`, vor `return`:

```tsx
  // Der Ausgangswert wird EINMAL gelesen (Initialisierungsfunktion), nicht je Render.
  const [offen, setOffen] = useState(() => liesKarteOffen(holeSpeicher()));
  const schalteOffen = () => {
    const neu = !offen;
    setOffen(neu);
    schreibeKarteOffen(holeSpeicher(), neu);
  };
  const kurz = filterKurz(gewaehlteLaender, []);
```

(`gewaehltePlz` gibt es erst ab Task 8; **dort wird das zweite Argument auf
`gewaehltePlz` nachgezogen** — sonst zeigt der zugeklappte Kopf einen aktiven
PLZ-Filter nie an.)

Die Wurzel wird `<section className={`tafel${offen ? "" : " tafel--zu"}`}>`; im
`.tafel__kopf` **vor** dem `<h2>`:

```tsx
        <button
          type="button"
          className="karte__zuklappen"
          aria-expanded={offen}
          aria-controls="karte-inhalt"
          aria-label={offen ? "Karte zuklappen" : "Karte aufklappen"}
          onClick={schalteOffen}
        >
          <span aria-hidden="true">▶</span>
        </button>
```

und **hinter** dem `<h2>` (vor dem Größen-Schalter):

```tsx
        {kurz !== "" && <span className="karte__filterkurz">{kurz}</span>}
```

`<div className="tafel__inhalt">` bekommt `id="karte-inhalt"`.

- [ ] **Step 6: Stylesheet**

Hinter den `.karte__schalter`-Regeln:

```css
/* Zuklappen gibt es nur, solange die Karte nicht als Spalte mitwandert. */
.karte__zuklappen,
.karte__filterkurz {
  display: none;
}

@media (max-width: 1359px) {
  .karte__zuklappen {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    min-height: 32px;
    background: none;
    border: 1px solid var(--linie);
    border-radius: var(--r);
    color: var(--papier-gedaempft);
    cursor: pointer;
    transition: transform 0.12s;
  }

  .karte__zuklappen[aria-expanded="true"] {
    transform: rotate(90deg);
  }

  .karte__zuklappen:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }

  /* Zugeklappt: nur der Kopf bleibt, und er nennt den aktiven Filter. */
  .tafel--zu .tafel__inhalt,
  .tafel--zu .karte__schalter {
    display: none;
  }

  .tafel--zu .karte__filterkurz {
    display: inline;
    margin-right: auto;
    padding-left: 8px;
    font-size: 12px;
    color: var(--gold-hell);
  }
}
```

- [ ] **Step 7: Tests, Typprüfung, Build**

Run: `cd web && npx vitest run && npx tsc --noEmit && npx vite build`
Expected: alles grün (145 + 14 = 159 grün, 1 übersprungen).

- [ ] **Step 8: Im Browser prüfen**

Scratchpad-Skript, Entwicklungsserver, echter Snapshot:

1. **390×844, Touch** (`hasTouch: true`, `isMobile: true`): Erster Besuch (leerer
   Speicher) → `aria-expanded="true"`, `#karte-inhalt` sichtbar. Knopf
   antippen → `#karte-inhalt` nicht sichtbar, `aria-expanded="false"`, der
   Größen-Schalter weg.
2. Eine Kachel antippen (Filter Bayern), dann zuklappen → der Kopf zeigt
   „Bayern". Eine PLZ gibt es erst ab Task 8.
3. **Merken:** zuklappen, Seite neu laden → Karte bleibt zu;
   `localStorage["immo-radar.karte-offen"] === "0"`. Aufklappen, neu laden →
   offen.
4. **1440×900:** der Knopf ist **nicht sichtbar**; die Karte ist sichtbar, auch
   wenn der Speicher `"0"` trägt (vor dem Laden per `addInitScript` setzen).
5. **Gesperrter Speicher:** per `addInitScript`
   `Object.defineProperty(window, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } })`
   → die Seite lädt, die Karte ist offen, **keine** Konsolenfehler, das
   Zuklappen funktioniert weiter (nur eben ungemerkt).
6. Tastatur: `Tab` erreicht den Knopf, `Enter` und `Leertaste` klappen; der
   Fokusring ist sichtbar; der Knopf ist mindestens 32 × 32 px groß.
7. Fenster von 1400 auf 1000 px ziehen, während die Karte zu ist → sie bleibt
   zu; auf 1400 zurück → sie ist sichtbar (kein Knopf).
8. Keine Konsolenfehler.

- [ ] **Step 9: Die Skills anwenden**

`web-design-guidelines` (Zielgröße, `aria-expanded`/`aria-controls`, Fokus
sichtbar, Zustand nicht nur durch Farbe), `react-best-practices`
(Initialisierungsfunktion statt Wert bei `useState`, kein Lesen im Render).
Echte Befunde beheben, Rest mit Begründung verwerfen.

- [ ] **Step 10: Commit**

Nachricht (Vorschlag): `feat(web): Karte unter 1360 px zuklappbar, Zustand gemerkt, Filter im zugeklappten Kopf`.

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
  // Nur Maus und Stift schweben. Ein Fingertipp ist KEIN Hover: Der Tipp oeffnet
  // die Quelle (die Zeile ist ein Link), und ein danach stehenbleibender Ring
  // waere ein Fehlzustand -- Browser senden nach einem Tipp keinen "Leave", bis
  // man woanders tippt. (Entscheidung des Nutzers: auf dem Handy ist die Karte
  // Einstieg und Filter, kein Hover-Spiegel.)
  // Der Tastaturfokus ist gleichwertig: `:focus-visible` trifft nur echten
  // Tastaturfokus, nicht das Fokussieren durch einen Klick oder Tipp.
  const hoverAnschluss = {
    onPointerEnter: (ereignis: PointerEvent<HTMLElement>) => {
      if (ereignis.pointerType !== "touch") onHover(objekt);
    },
    onPointerLeave: () => onHover(null),
    onFocus: (ereignis: FocusEvent<HTMLElement>) => {
      if (ereignis.currentTarget.matches(":focus-visible")) onHover(objekt);
    },
    onBlur: () => onHover(null),
  };
```

`PointerEvent` und `FocusEvent` als **Typen** aus `react` importieren
(`import { memo, type FocusEvent, type PointerEvent } from "react";`) — die
DOM-Typen gleichen Namens sind nicht dieselben.

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
5b. **Touch** (eigener Kontext mit `hasTouch: true`, `isMobile: true`, 390×844,
   Karte aufgeklappt): `page.tap()` auf eine Zeile → **kein** `.markierung`, die
   Zeile unter der Karte bleibt leer. Damit der Tipp nicht wirklich Immowelt
   öffnet, vorher `page.route("**/*", r => r.abort())` für fremde Adressen
   setzen oder den Popup-Handler auf Schließen legen. **Anschließend auf
   dieselbe Zeile klicken (Maus, `page.mouse.click`)** → hier darf ebenfalls
   kein Ring stehenbleiben, wenn der Zeiger wieder weg ist.
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

**Warum die Punkte einen größeren Trefferbereich brauchen — gerechnet:** Ein
Punkt hat einen Radius von 2,2 bis 7,6 Einheiten in einer 360 Einheiten breiten
Zeichnung. Auf dem Handy (390 px Fensterbreite, Zeichnung rund 334 px breit,
Faktor 0,93) sind das **4 bis 14 px** Durchmesser — deutlich unter den 24 px,
die WCAG 2.5.8 verlangt. Jeder Punkt bekommt deshalb einen unsichtbaren,
größeren Kreis als Trefferfläche, zusammen mit dem sichtbaren Punkt in einer
Gruppe.

**Die 24 px gelten auf dem Bildschirm, nicht in Zeichnungseinheiten.** Bei
Faktor 0,93 braucht es einen Radius von rund 13 Einheiten; das Maß muss also
mit der Zeichnungsbreite rechnen und nicht fest verdrahtet sein. Deshalb
bekommt die Karte eine gemessene Breite (`ResizeObserver` am `<svg>`) und
daraus den nötigen Mindestradius. **Gegenprobe im Browser ist Pflicht** (Step 6,
Punkt 7) — die Rechnung allein zählt hier nicht.

**Die 60 Punkte liegen dicht beieinander** (Median 2 Objekte je Punkt, 15
Punkte mit genau einem). Große Trefferflächen überlappen dann. Regel: Die
Trefferfläche wächst nie über den halben Abstand zum nächsten Punkt hinaus —
sonst stiehlt ein großer Punkt seinem Nachbarn den Klick. Ist der Abstand
kleiner als 24 px auf dem Bildschirm, gewinnt der nähere Mittelpunkt; das ist
der ehrliche Kompromiss, und der Tastaturweg (Tab + Enter) bleibt als
zuverlässiger Zugang daneben bestehen.

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

Imports: `alsZeile`, `punktText` aus `../logik/kartentexte.ts`; `useEffect`,
`useRef`, `useState` aus `react`. In `Eigenschaften` und der Parameterliste:
`gewaehltePlz: readonly string[]`, `schaltePlz: (zweisteller: string) => void`.

**Den Kurztext aus Task 6b nachziehen** — sonst zeigt der zugeklappte
Kartenkopf einen aktiven PLZ-Filter nie an:

```tsx
  const kurz = filterKurz(gewaehlteLaender, gewaehltePlz);
```

Die gemessene Breite und daraus die Trefferfläche (die Zeichnung ist
`KARTE_BREITE` = 360 Einheiten breit, dargestellt in `breitePx`):

```tsx
  const bild = useRef<SVGSVGElement>(null);
  const [breitePx, setBreitePx] = useState(KARTE_BREITE);

  useEffect(() => {
    const element = bild.current;
    if (element === null || typeof ResizeObserver === "undefined") return;
    const messen = () => setBreitePx(element.getBoundingClientRect().width || KARTE_BREITE);
    messen();
    const beobachter = new ResizeObserver(messen);
    beobachter.observe(element);
    return () => beobachter.disconnect();
  }, []);

  // 24 px Zielgroesse (WCAG 2.5.8) in Zeichnungseinheiten zurueckgerechnet.
  // Faellt die Messung aus, gilt die Zeichnungsbreite -- dann ist der Radius
  // eher zu gross als zu klein, und das ist die richtige Richtung.
  const trefferRadius = (radius: number) =>
    Math.max(radius + 3, (12 * KARTE_BREITE) / Math.max(1, breitePx));
```

und am `<svg className="karte__bild" …>` das Attribut `ref={bild}`.

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
                {/* Trefferflaeche: unsichtbar, aber gross genug fuer einen Finger. */}
                <circle className="plzknopf__flaeche" cx={punkt.x} cy={punkt.y} r={trefferRadius(r)} />
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
7. **Trefferfläche, auf dem Bildschirm gemessen — bei 1440×900 UND bei
   390×844:** `boundingBox()` **jeder** `.plzknopf__flaeche` → Breite und Höhe
   mindestens 24 px. Zusätzlich ein Klick 10 px neben dem Mittelpunkt des
   kleinsten sichtbaren Punkts trifft ihn. Schlägt das fehl, ist die
   Rückrechnung in `trefferRadius` falsch — die gemessene Zahl in den Kommentar
   schreiben, nicht die Prüfung lockern.
8. **Überlappung:** Für jedes Paar benachbarter Punkte prüfen, dass ein Klick
   genau auf den Mittelpunkt des einen **diesen** filtert und nicht den
   Nachbarn (`aria-pressed` danach am richtigen Element).
9. **Touch** (390×844, `hasTouch: true`): Ein Tipp auf einen Punkt filtert;
   **kein** Tooltip erscheint (das kommt erst in Task 9, hier also nur die
   Vorprüfung, dass der Tipp überhaupt ankommt).
10. Keine Konsolenfehler.

**Der Tab-Stopp-Konflikt ist gelöst, nicht vertagt:** Die rund 60 Punkte plus
16 Kacheln liegen vor der Liste im Tab-Weg. Der Sprunglink „Zur Liste springen"
aus Task 6 überspringt sie in einem Schritt. Punkte sind bereits nach Anzahl
absteigend sortiert (`buendlePlzPunkte`), die größten kommen also zuerst.

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
      // Und ein Fokus, der von einem Klick kommt, auch nicht -- nur echter
      // Tastaturfokus. Sonst bliebe nach jedem Klick auf eine Kachel ein
      // Tooltip stehen, obwohl der Zeiger laengst weg ist.
      if (!("pointerType" in ereignis) && !ereignis.currentTarget.matches(":focus-visible")) return;
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
  /* Nie breiter als das Fenster: `platziereTooltip` klemmt sonst links an den
     Rand und schneidet rechts ab. Auf einem 390-px-Schirm greift das zweite Mass. */
  max-width: min(260px, calc(100vw - 16px));
  overflow-wrap: break-word;
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
5. Zeiger weg → Tooltip weg. Tastaturfokus auf eine Kachel (per `Tab`, nicht per
   Klick) → Tooltip; `Tab` weiter → weg. **Und: eine Kachel anklicken, dann den
   Zeiger wegnehmen → kein Tooltip bleibt stehen** (der Klick setzt Fokus, aber
   nicht `:focus-visible`).
6. Auf der Kartenspalte scrollen bzw. die Seite scrollen, während das Tooltip
   offen ist → es schließt.
7. **Kein doppeltes Tooltip:** Im DOM der SVG gibt es kein `<title>` mehr
   (`svg.querySelectorAll("title").length === 0`).
8. `aria-label` an einer Kachel und an einem Punkt vorhanden und gleichlautend
   mit `Titel · Zeile · Zeile …`.
9. **Fingertipp:** Mit `hasTouch: true` und `page.tap()` auf eine Kachel → kein
   Tooltip, der Filter greift trotzdem. Dasselbe für einen PLZ-Punkt.
10. **390×844:** Ein Tooltip, das per Tastaturfokus ausgelöst wird, bleibt
    vollständig im Fenster (`boundingBox()` innerhalb 0..390 × 0..844) und
    läuft nicht rechts hinaus — das ist die Probe auf `max-width` mit `100vw`.
11. Keine Konsolenfehler; kein Long Task ≥ 50 ms beim Überfahren aller Kacheln.

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

Ein Scratchpad-Skript fährt den Weg einmal von vorn bis hinten, bei **1440×900**,
**1366×768** und **390×844 (mit `hasTouch`)**, mit dem echten Snapshot, und legt
Screenshots ab: Laden (Ladetext ohne „von … MB"-Widerspruch) → Liste öffnen →
Zeile anfahren (Ring + Satz) → Kachel anfahren (Tooltip) → Punkt anklicken
(Filter + Gruppe in der Leiste + kleinere Liste) → zurücksetzen.

Bei **1366 px** ausdrücklich: dreispaltig, Karte klebt, Liste ohne waagerechtes
Scrollen, Kachelkürzel lesbar. Bei **390 px**: Karte zwischen Filterleiste und
Liste, zuklappbar und gemerkt, kein waagerechtes Scrollen, **kein Ring und kein
Tooltip bei Tipp**, Tippen filtert, Trefferflächen ≥ 24 px.
**Konsole: kein Fehler.**

- [ ] **Step 3: Unabhängige Prüfung der Oberfläche**

`web-design-guidelines` über **alle** in diesem Plan berührten UI-Dateien
(`Karte.tsx`, `KartenTooltip.tsx`, `Objektzeile.tsx`, `Bereich.tsx`,
`Filterleiste.tsx`, `App.tsx`, `stil.css`) und `react-best-practices` über
`Karte.tsx`, `App.tsx`, `VirtuelleListe.tsx`, `laden.ts`. Dabei ausdrücklich
bewerten: **ob der Sprunglink wirklich trägt** (Filterleiste → Karte mit ~76
Stopps → Liste), **Farbe allein** trägt keinen Zustand (Ring, gewählter Punkt,
gewählte Kachel, zugeklappte Karte), **Kontrast** des Rings, der Tooltip-Texte
und des Filter-Kurztexts im zugeklappten Kopf. Echte Befunde beheben (eigener
Commit je Befund), unechte mit Begründung verwerfen, **alles** in einer Liste
festhalten — sie geht in `UEBERGABE.md`.

**Dies ist zugleich das Design-/Barrierefreiheits-Audit**, das am 2026-09-19
zweimal am Sitzungslimit abgebrochen ist und in `UEBERGABE.md` als „noch nie
gelaufen" steht. Es ist damit erledigt und muss dort umgetragen werden —
allerdings nur für `web/`, nicht für Teile außerhalb dieses Plans; was
ungeprüft bleibt, wird benannt.

- [ ] **Step 4: Spec und Übergabe auf Stand bringen**

- `specs/2026-09-19-karte-dreh-und-angelpunkt-design.md`: den Satz „(bereits
  exportiert aus `karte.ts`)" berichtigen („wird in Task 4 exportiert"), die
  drei Abweichungen dieses Plans (Objekt statt ID, `<title>` entfällt,
  Punkt-Trefferfläche) mit je einem Satz nachtragen, **die Entscheidungen aus
  dem Grilling vom 2026-09-19 als eigenen Abschnitt übernehmen** (Handy,
  Breakpoint 1360, Zuklappen mit Merken, kein Hover auf Touch — der Entwurf
  sagt zum schmalen Fall bisher nur „muss zurück in den Fluss fallen"), und
  oben vermerken: „Umgesetzt am <Datum>, Plan
  `plans/2026-09-19-karte-dreh-und-angelpunkt.md`."
- `UEBERGABE.md`: Abschnitt „Audit-Befunde der Weboberfläche" — A, B, C als
  erledigt mit Messergebnis (Task 1 Step 7: was gibt Chromium über
  `Content-Encoding` preis; Task 2 Step 2: p95 der Scroll-Commits; Task 7
  Step 7: Differenz der Zeilen-Renders); der Karten-Abschnitt als erledigt; das
  Design-/Barrierefreiheits-Audit: was Step 3 fand; **die Liste der noch
  offenen Punkte** (A16, A10, A11 Schritt 4, Gegenprobe `Location`-Kopf).
- **`BACKLOG.md`: die leeren Hüllen als eigener, neuer Punkt** — Entscheidung
  des Nutzers im Grilling („festhalten, nach der Karte angehen"). Mit den
  gemessenen Zahlen, damit später niemand neu messen muss: Snapshot vom
  2026-09-18, 21.897 Objekte, **356 ohne Bundesland, davon 352 ohne Titel, ohne
  Ort, ohne PLZ — nur eine URL; 347 der 356 stammen von Immowelt**; zuletzt gesehen
  151 am 17., 197 am 18.; Zustand 176 unbestätigt, 171 verfügbar, 9 abgängig.
  E-7 nannte 54 (Stand 09-15, womöglich andere Zählweise). **Was NICHT belegt
  ist:** dass es sich um eine neue Regression handelt — dem Snapshot fehlt
  `first_seen`, der Vergleich mit den 54 ist deshalb keiner. Der erste Schritt
  des künftigen Punkts ist also eine Messung über `listings.first_seen` in der
  Datenbank (nur lesend), nicht eine Vermutung über die Ursache. Ebenfalls
  festhalten: **die Kategorie „Objekte ohne Region" aus E-7 ist im Dashboard
  nirgends gebaut.**
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

**Abdeckung der Grilling-Entscheidungen (2026-09-19):** Handy = Einstieg und
Filter, zuklappbar mit Merken (Task 6b), kein Hover/Tooltip auf Touch (globale
Randbedingung + Tasks 7, 9), Breakpoint 1360 statt 1400 mit der Rechnung
(Task 6), Hover-Ring wie geplant (Task 7), leere Hüllen festgehalten statt
angegangen (Task 10 Step 4). Dazu die vom Koordinator ergänzten Kleinigkeiten:
Sprunglink (Task 6), Kürzel-Schriftgröße (Task 6 Step 6, Punkt 5),
24-px-Trefferfläche mit Überlappungsregel (Task 8).

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
(Task 4 → 8); `filterKurz` (Task 6b, in Task 8 auf `gewaehltePlz` nachgezogen —
das ist die eine Stelle, an der ein späterer Task einen früheren *ändert*, und
sie ist an beiden Enden vermerkt); `liesKarteOffen`/`schreibeKarteOffen`/
`holeSpeicher` (Task 6b); `trefferRadius` und `breitePx` (Task 8);
`TooltipText`/`kachelText`/`punktText`/`alsZeile` (Task 5 → 8, 9);
`Rechteck`/`TooltipLage`/`platziereTooltip` (Task 5 → 9); `onHover` und
`hervorgehobenesObjekt` (Task 7); `gewaehltePlz`/`schaltePlz` (Task 8);
`TooltipZiel`/`KartenTooltip` (Task 9). Die Karte bekommt ihre Eigenschaften
schrittweise (7: `hervorgehobenesObjekt`, 8: `gewaehltePlz`+`schaltePlz`); jeder
Task nennt die Ergänzung und lässt `tsc` sie prüfen.

**Bekannte Restunsicherheit, offen benannt:**

- Ob Chromium `Content-Encoding` über `fetch` herausgibt, war eine offene
  Frage — **gemessen am 2026-09-19: ja.** `erwarteteBytes` greift, `gueltigesZiel`
  blieb als zweite Wache ungenutzt. Beide bleiben trotzdem im Code, weil sie
  verschiedene Fehler abfangen.
- **Firefox und Safari sind nicht geprüft.** Alle Browserprüfungen laufen gegen
  Chromium. Betroffen sind vor allem `:focus-visible` an SVG-Gruppen,
  `pointerType` und `position: fixed` in einer scrollenden Spalte. Das gehört
  so in `UEBERGABE.md` — als offener Punkt, nicht als stillschweigend erledigt.
- **Ein echtes Mobilgerät ist nicht geprüft.** Playwrights `hasTouch` ist eine
  Nachbildung; iOS Safari verhält sich bei `:hover` und Tooltips nachweislich
  anders (es sendet einem Element nach dem Tippen oft einen Hover-Zustand).
  Die Entscheidung „kein Hover auf Touch" ist in diesem Plan über
  `pointerType` gelöst, nicht über CSS-`@media (hover: hover)` — das ist die
  robustere Wahl, ersetzt aber keine Prüfung auf echtem Gerät.
