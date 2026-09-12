# Blätterung, Meldedeckel und A-4 — Umsetzungsplan

> **Für agentische Bearbeiter:** ERFORDERLICHE UNTER-SKILL: Diesen Plan mit
> `superpowers:subagent-driven-development` Aufgabe für Aufgabe umsetzen.
> Die Schritte tragen Kästchen (`- [ ]`) zum Abhaken.
>
> **Jeder Agent wählt zusätzlich selbst die passende Superpower für seine
> Aufgabe und wendet sie an** — bei einem Fehler `superpowers:systematic-debugging`,
> bei neuem Verhalten `superpowers:test-driven-development`, vor dem Melden
> der Fertigstellung `superpowers:verification-before-completion`.

**Ziel:** Die drei Befunde des Produktionslaufs `34637349206` schließen — eine
Blätterung, die 14,5 % des Bestands übersieht, ein Meldedeckel, der die
falsche Menge deckelt, und der stille `continue` für Objekte ohne Preis (A-4).

**Architektur:** Alle drei Änderungen liegen in vorhandenen Modulen. Zwei
davon werden als **reine Funktion** herausgezogen, damit sie ohne Datenbank
testbar sind; `main.ts` bleibt reine Verdrahtung. Keine Schemaänderung, kein
Schreibzugriff auf die Produktionsdatenbank außerhalb des normalen Laufs.

**Tech-Stack:** TypeScript (ESM, `.js`-Endungen im Import), vitest, Supabase
JS-Client, Playwright. Tests laufen mit `npm test` in `scraper/`.

**Spec:** [`ABNAHME-BASIS.md`](../ABNAHME-BASIS.md) (A-4, B-2, D-5),
[`specs/2026-09-09-dashboard-entwurf.md`](../specs/2026-09-09-dashboard-entwurf.md)
(Abschnitte 9–11), [`UEBERGABE.md`](../UEBERGABE.md) (die Fallen).

## Belegte Ausgangslage

Gemessen am 2026-09-11/12, nicht aus dem Gedächtnis:

| Beleg | Wert |
|---|---|
| Lauf `34637349206`, Immowelt markiert (Protokoll) | 44 |
| Immowelt-Zeilen mit `disappeared_at` (Datenbank) | 32 |
| Blätterung über `listings`: doppelt geliefert | 1.762 von 12.158 |
| Blätterung über `listings`: nie geliefert | 1.762 von 12.158 |
| Abgangsmeldungen tatsächlich gesendet | 1 von 10 Kandidaten |
| Meldebudget zurückgestellt, vorher → nachher | 71 → 47 |

## Globale Randbedingungen

- **Nie ein Live-Lauf lokal.** `lib/nurInCi.ts` bricht `npm run scrape` und
  jedes Prüfskript ohne `CI` ab. Volle Läufe über
  `gh workflow run scrape.yml --ref main`, Prüfläufe über `pruefung.yml`.
  Reine Datenbankabfragen sind davon nicht betroffen und dürfen lokal laufen.
- **Fail-closed ist Gesetz.** In `bestand.ts`, `plausibilitaet.ts`,
  `bestandDb.ts` und `scrapers/immowelt/index.ts` ist ein unbekannter Zustand
  `null`/`false`, nie „in Ordnung". Kein stiller Vorgabewert bei einem
  Argument, das über eine Löschung oder Markierung entscheidet.
- **Ein grüner Test beweist nichts, wenn er nie rot war.** Jeder Test wird
  zuerst gegen den unveränderten Produktionscode laufen gelassen und muss
  dort scheitern. Wer einen sofort grünen Test schreibt, macht den
  Produktionscode kurz kaputt und sieht zu, ob der Test es merkt.
- **Kein Test hängt am Kalender.** Datumswerte relativ zu einer eingefrorenen
  Uhr, nie zu `new Date()`.
- **Kommentare auf Deutsch, ohne Umlaute im Bezeichner**, im Stil der
  umgebenden Dateien: sie begründen das Warum, nicht das Was.
- **Commit-Nachrichten über `git commit -F <datei>`**, sobald ein
  Prozentzeichen vorkommt — `printf` bricht daran mitten im Satz ab.
- **`npm ci` ist in einem Agenten-Worktree verboten.** `node_modules` kommt
  über [`scripts/worktree-node-modules.sh`](../../../scripts/worktree-node-modules.sh).
- Nach jeder Aufgabe: `npm test` und `npx tsc --noEmit` müssen sauber sein.
  Ausgangsstand: **423 Tests grün**.

## Dateienübersicht

| Datei | Verantwortung nach diesem Plan |
|---|---|
| `scraper/lib/bestandDb.ts` | Blätterung per Keyset statt Bereich (Aufgabe 1) |
| `scraper/lib/bestandDb.test.ts` | Beweis, dass unter Zeilenbewegung nichts verlorengeht |
| `scraper/lib/bestand.ts` | neue reine Funktion `waehleAbgangsmeldungen` (Aufgabe 2) |
| `scraper/lib/db.ts` | `bereitsGemeldeteListingIds`, `upsertListingOhneBewertung` (Aufgaben 2, 3) |
| `scraper/main.ts` | Verdrahtung, keine Logik (Aufgaben 2, 3) |
| `docs/superpowers/specs/2026-09-09-dashboard-entwurf.md` | Nachtrag mit M1–M6 (Aufgabe 5) |

---

### Aufgabe 1: Die Blätterung verliert keine Zeile mehr

**Warum:** `ladeBekannteListings` blättert mit `.range(von, bis)` **ohne
Sortierung**. Postgres liefert dann in der Reihenfolge, in der die Zeilen
physisch liegen, und jede `UPDATE` im selben Lauf (`last_seen` für ~10.000
gesehene Objekte) verschiebt Zeilen zwischen die Seiten. Gemessen: 1.762
Zeilen doppelt, 1.762 nie geliefert, bei 12.158 Zeilen. Jeder Lauf sieht
zufällig 14,5 % des Bestands nicht — und was `bekannte` nicht enthält, kann
weder markiert noch entmarkiert werden.

**Files:**
- Modify: `scraper/lib/bestandDb.ts:16-49` (`ladeSeitenweise`), `:51-83`
  (`ladeBekannteListings`), `:95-115` (`ladeVeralteteExternalIds`),
  `:217-246` (`loescheAbgelaufene`)
- Test: `scraper/lib/bestandDb.test.ts`

**Interfaces:**
- Produces: `ladeSeitenweise<T>(fetchSeite: (nachId: string | null, grenze: number) => Promise<{ data: T[] | null; error: any }>, tableName: string): Promise<T[]>`
  — der Aufrufer bekommt jetzt die **letzte gesehene id** statt eines
  Bereichs und muss `.order("id").gt("id", nachId).limit(grenze)` bauen.
  Jede geladene Zeile trägt deshalb `id`.
- Consumes: nichts aus anderen Aufgaben.

- [ ] **Schritt 1: Den roten Test schreiben**

In `scraper/lib/bestandDb.test.ts` anfügen. Der gefälschte Client bildet
nach, was Postgres tatsächlich tut: Eine aktualisierte Zeile rutscht ans
Ende. Bei Bereichsblätterung fehlt danach eine Zeile und eine kommt doppelt.

```ts
/**
 * Warum dieser Test existiert: Lauf 34637349206 meldete 44 Markierungen,
 * in der Datenbank standen 32. Gemessen ueber `listings`: 1.762 von 12.158
 * Zeilen kamen doppelt, 1.762 nie. Ursache ist eine Blaetterung ohne
 * Sortierung -- jede UPDATE im selben Lauf verschiebt Zeilen zwischen die
 * Seiten. Was `bekannte` nicht enthaelt, kann nicht markiert und nicht
 * entmarkiert werden.
 */
describe("ladeBekannteListings -- Blaetterung unter Zeilenbewegung", () => {
  /**
   * Bildet einen Heap nach, in dem eine Zeile je Seitenabruf ans Ende
   * wandert. `order`/`gt` bekommen eine stabile Sortierung zu sehen,
   * `range` nicht -- genau wie in Postgres.
   */
  function wanderderHeap(anzahl: number) {
    const zeilen = Array.from({ length: anzahl }, (_, i) => ({
      id: `id-${i.toString().padStart(5, "0")}`,
      external_id: `ext-${i}`,
      disappeared_at: null,
      fundort: "th",
    }));
    let heap = [...zeilen];
    let sortiert = false;
    let nachId: string | null = null;
    let grenze = 1000;

    const abfrage: any = {
      eq: () => abfrage,
      order: () => {
        sortiert = true;
        return abfrage;
      },
      gt: (_spalte: string, wert: string) => {
        nachId = wert;
        return abfrage;
      },
      limit: (n: number) => {
        grenze = n;
        return liefere();
      },
      range: (von: number, bis: number) => {
        const seite = heap.slice(von, bis + 1);
        bewege();
        return Promise.resolve({ data: seite, error: null });
      },
    };

    function bewege() {
      // Eine Zeile wird aktualisiert und liegt danach hinten.
      const erste = heap.shift();
      if (erste) heap.push(erste);
    }

    function liefere() {
      const quelle = sortiert ? [...heap].sort((a, b) => a.id.localeCompare(b.id)) : heap;
      const start = nachId === null ? 0 : quelle.findIndex((z) => z.id > nachId!);
      const seite = start < 0 ? [] : quelle.slice(start, start + grenze);
      bewege();
      return Promise.resolve({ data: seite, error: null });
    }

    return {
      client: {
        from: () => ({ select: () => abfrage }),
      } as unknown as SupabaseClient,
      anzahl,
    };
  }

  it("liefert jede Zeile genau einmal, auch wenn Zeilen waehrend des Lesens wandern", async () => {
    const { client, anzahl } = wanderderHeap(2500);

    const geladen = await ladeBekannteListings(client, "immowelt");

    const verschiedene = new Set(geladen.map((z) => z.id));
    expect(geladen.length).toBe(anzahl);
    expect(verschiedene.size).toBe(anzahl);
  });
});
```

- [ ] **Schritt 2: Den Test rot sehen**

```bash
cd scraper && npx vitest run lib/bestandDb.test.ts -t "waehrend des Lesens wandern"
```

Erwartet: FAIL. Die geladene Menge ist kleiner als 2500, und die Zahl der
verschiedenen ids ist noch kleiner. Läuft der Test **grün**, ist der
gefälschte Heap falsch gebaut und der Test wertlos — dann zuerst den
Nachbau reparieren, nicht den Produktionscode.

- [ ] **Schritt 3: `ladeSeitenweise` auf Keyset umstellen**

In `scraper/lib/bestandDb.ts`:

```ts
/**
 * Blaettert per Keyset, nicht per Bereich.
 *
 * WARUM NICHT `.range(von, bis)`: Ohne `ORDER BY` liefert Postgres in
 * physischer Reihenfolge, und jedes UPDATE im selben Lauf verschiebt eine
 * Zeile ans Ende. Gemessen am 2026-09-12 ueber `listings`: 1.762 von 12.158
 * Zeilen kamen doppelt, 1.762 gar nicht. Ein `ORDER BY id` allein reicht
 * nicht -- ein gleichzeitiger Einschub verschiebt die Fenster weiterhin.
 * Keyset ist gegen beides immun: die naechste Seite beginnt hinter einer
 * konkreten id, nicht an einer gezaehlten Position.
 *
 * Absolute Decke 200_000 Zeilen -- bei Ueberschuss wird geworfen, nie ein
 * Teilergebnis zurueckgegeben.
 */
async function ladeSeitenweise<T extends { id: string }>(
  fetchSeite: (nachId: string | null, grenze: number) => Promise<{ data: T[] | null; error: any }>,
  tableName: string
): Promise<T[]> {
  const alle: T[] = [];
  const seitenGroesse = 1000;
  const absoluteDecke = 200_000;
  let nachId: string | null = null;

  while (true) {
    if (alle.length >= absoluteDecke) {
      throw new Error(`Tabelle '${tableName}' uebersteigt Decke von ${absoluteDecke} Reihen`);
    }

    const { data, error } = await fetchSeite(nachId, seitenGroesse);
    if (error) throw error;

    const seite = data ?? [];
    alle.push(...seite);
    if (seite.length < seitenGroesse) break;
    nachId = seite[seite.length - 1].id;
  }

  return alle;
}
```

- [ ] **Schritt 4: Die drei Aufrufstellen nachziehen**

`ladeBekannteListings`:

```ts
    async (nachId, grenze) => {
      const abfrage = supabase
        .from("listings")
        .select("id, external_id, disappeared_at, fundort")
        .eq("source", source)
        .order("id", { ascending: true })
        .limit(grenze);
      return nachId === null ? abfrage : abfrage.gt("id", nachId);
    },
```

`ladeVeralteteExternalIds` — `id` muss mit in die Auswahl, sonst gibt es
keinen Schlüssel zum Weiterblättern:

```ts
  const zeilen = await ladeSeitenweise<{ id: string; external_id: string }>(
    async (nachId, grenze) => {
      const abfrage = supabase
        .from("listings")
        .select("id, external_id")
        .eq("source", source)
        // ... die vorhandenen Filter unveraendert uebernehmen ...
        .order("id", { ascending: true })
        .limit(grenze);
      return nachId === null ? abfrage : abfrage.gt("id", nachId);
    },
    "listings"
  );
```

`loescheAbgelaufene` analog, mit `.in("source", QUELLEN_MIT_LOESCHHOHEIT)`
und `.not("disappeared_at", "is", null)` unverändert davor.

- [ ] **Schritt 5: Tests grün sehen**

```bash
cd scraper && npm test
```

Erwartet: der neue Test PASS, und **alle** vorhandenen Tests weiter grün.
Der Nachbau in `fakeSupabase` kennt `range` — er braucht jetzt `order`,
`gt` und `limit`. Fällt ein alter Test, ist das der Nachbau, nicht die
Sache; er wird mitgezogen, nicht der Produktionscode zurückgedreht.

- [ ] **Schritt 6: Sabotageprobe**

`.order("id", { ascending: true })` in `ladeBekannteListings` entfernen und
`npm test` laufen lassen. Erwartet: der neue Test fällt. Danach
zurücknehmen.

- [ ] **Schritt 7: Committen**

```bash
git add scraper/lib/bestandDb.ts scraper/lib/bestandDb.test.ts
git commit -F - <<'ENDE'
fix(bestand): die Blaetterung uebersah jeden Lauf einen Teil des Bestands

Gemessen ueber listings: 1.762 von 12.158 Zeilen kamen doppelt, 1.762 nie.
`.range()` ohne ORDER BY liest in physischer Reihenfolge, und die UPDATEs
desselben Laufs verschieben Zeilen zwischen die Seiten. Was `bekannte`
nicht enthaelt, wird weder markiert noch entmarkiert -- Lauf 34637349206
meldete deshalb 44 Markierungen, in der Datenbank standen 32.

Keyset statt Bereich: die naechste Seite beginnt hinter einer konkreten id.
ENDE
```

---

### Aufgabe 2: Der Meldedeckel deckelt die Menge, die gemeldet wird

**Warum:** `main.ts:273` legt den Deckel von 10 über **alle** markierten
Abgänge und filtert erst danach auf Objekte, die je im Chat waren. Bei 671
Meldungen auf 12.158 Objekte sind die ersten zehn Markierungen fast nie
gemeldete. Lauf `34637349206`: 44 markiert, 10 Kandidaten, **eine** Meldung
gesendet — und die 34 verschwiegenen tauchen nie wieder auf, weil sie
markiert bleiben. Der Deckel sollte Dauerfeuer verhindern, nicht die
Meldung selbst.

**Files:**
- Create: nichts
- Modify: `scraper/lib/bestand.ts` (neue Funktion ans Ende des
  Abgangs-Abschnitts), `scraper/lib/db.ts` (Sammelabfrage),
  `scraper/main.ts:271-280`
- Test: `scraper/lib/bestand.test.ts`

**Interfaces:**
- Produces:
  - `waehleAbgangsmeldungen<T extends { id: string }>(abgaenge: T[], warGemeldet: (id: string) => boolean): { melden: T[]; verschwiegen: number }`
  - `bereitsGemeldeteListingIds(supabase: SupabaseClient, listingIds: string[]): Promise<Set<string>>`
- Consumes: `MAX_ABGANGSMELDUNGEN_JE_LAUF` aus `lib/bestand.ts`.

- [ ] **Schritt 1: Den roten Test schreiben**

In `scraper/lib/bestand.test.ts`:

```ts
/**
 * Warum dieser Test existiert: Im Lauf 34637349206 waren von 44 markierten
 * Abgaengen 10 im Deckel -- und davon war genau EINER je gemeldet worden.
 * Neun Plaetze gingen an Objekte, die gar keine Meldung ausloesen konnten,
 * und die uebrigen 34 bleiben fuer immer stumm, weil sie markiert sind und
 * nie wieder als neuer Abgang auftauchen. Der Deckel gehoert HINTER den
 * Filter, nicht davor.
 */
describe("waehleAbgangsmeldungen", () => {
  const abgang = (id: string) => ({ id, externalId: `ext-${id}` });

  it("fuellt den Deckel nur mit Objekten, die je gemeldet wurden", () => {
    const abgaenge = [
      ...Array.from({ length: 30 }, (_, i) => abgang(`nie-${i}`)),
      ...Array.from({ length: 3 }, (_, i) => abgang(`gemeldet-${i}`)),
    ];
    const gemeldet = new Set(["gemeldet-0", "gemeldet-1", "gemeldet-2"]);

    const { melden, verschwiegen } = waehleAbgangsmeldungen(abgaenge, (id) => gemeldet.has(id));

    expect(melden.map((a) => a.id)).toEqual(["gemeldet-0", "gemeldet-1", "gemeldet-2"]);
    expect(verschwiegen).toBe(0);
  });

  it("deckelt bei mehr gemeldeten Abgaengen als Plaetzen", () => {
    const abgaenge = Array.from({ length: 25 }, (_, i) => abgang(`g-${i}`));

    const { melden, verschwiegen } = waehleAbgangsmeldungen(abgaenge, () => true);

    expect(melden).toHaveLength(MAX_ABGANGSMELDUNGEN_JE_LAUF);
    expect(verschwiegen).toBe(25 - MAX_ABGANGSMELDUNGEN_JE_LAUF);
  });

  it("zaehlt nie gemeldete Objekte nicht als verschwiegen", () => {
    // Sie sind kein Verlust: Sie haetten auch ohne Deckel keine Meldung
    // erzeugt. Wer sie mitzaehlt, meldet dem Nutzer eine Zahl, die nichts
    // bedeutet.
    const abgaenge = Array.from({ length: 100 }, (_, i) => abgang(`nie-${i}`));

    const { melden, verschwiegen } = waehleAbgangsmeldungen(abgaenge, () => false);

    expect(melden).toEqual([]);
    expect(verschwiegen).toBe(0);
  });
});
```

- [ ] **Schritt 2: Den Test rot sehen**

```bash
cd scraper && npx vitest run lib/bestand.test.ts -t "waehleAbgangsmeldungen"
```

Erwartet: FAIL mit `waehleAbgangsmeldungen is not a function`.

- [ ] **Schritt 3: Die reine Funktion schreiben**

In `scraper/lib/bestand.ts`, direkt unter `budgetiereAbgangsmeldungen`:

```ts
/**
 * Welche Abgaenge dieser Lauf meldet.
 *
 * WARUM DIE REIHENFOLGE ZAEHLT: Bis zum 2026-09-12 lag der Deckel VOR dem
 * Filter "wurde dieses Objekt je gemeldet". Bei 671 Meldungen auf 12.158
 * Objekte sind die ersten zehn Markierungen fast nie gemeldete: Lauf
 * 34637349206 deckelte auf 10 Kandidaten und verschickte davon EINE
 * Meldung. Die uebrigen 34 bleiben fuer immer stumm, denn sie sind
 * markiert und tauchen nie wieder als neuer Abgang auf.
 *
 * `verschwiegen` zaehlt deshalb nur, was der Deckel einem tatsaechlich
 * meldefaehigen Objekt genommen hat -- alles andere waere eine Zahl ohne
 * Bedeutung.
 */
export function waehleAbgangsmeldungen<T extends { id: string }>(
  abgaenge: T[],
  warGemeldet: (id: string) => boolean
): { melden: T[]; verschwiegen: number } {
  const meldefaehig = abgaenge.filter((a) => warGemeldet(a.id));
  return {
    melden: meldefaehig.slice(0, MAX_ABGANGSMELDUNGEN_JE_LAUF),
    verschwiegen: Math.max(0, meldefaehig.length - MAX_ABGANGSMELDUNGEN_JE_LAUF),
  };
}
```

`budgetiereAbgangsmeldungen` bleibt stehen, solange ihre Tests grün sind;
sie wird in Schritt 5 aus `main.ts` entfernt und danach mitsamt ihren Tests
gelöscht, wenn kein Aufrufer mehr übrig ist.

- [ ] **Schritt 4: Test grün sehen**

```bash
cd scraper && npx vitest run lib/bestand.test.ts -t "waehleAbgangsmeldungen"
```

Erwartet: PASS, drei Tests.

- [ ] **Schritt 5: Die Sammelabfrage in `lib/db.ts`**

Eine Abfrage je Block statt einer je Objekt — bei hunderten Abgängen wäre
`hoechsteGemeldeteKlasse` in der Schleife sonst eine Abfrage je Objekt.

```ts
/**
 * Welche dieser Objekte je eine Meldung ausgeloest haben.
 *
 * Blockweise, weil die URL-Laenge die Zahl der IDs in einem `.in()`
 * begrenzt: gemessen am 2026-09-08 liefern 641 IDs HTTP 200 und 642
 * HTTP 400. Dieselbe Grenze, an der schon der Bestandsabgleich zerbrochen
 * ist.
 */
export async function bereitsGemeldeteListingIds(
  supabase: SupabaseClient,
  listingIds: string[]
): Promise<Set<string>> {
  const gefunden = new Set<string>();
  const blockGroesse = 500;
  for (let von = 0; von < listingIds.length; von += blockGroesse) {
    const block = listingIds.slice(von, von + blockGroesse);
    const { data, error } = await supabase
      .from("notifications")
      .select("listing_id, kind")
      .in("listing_id", block);
    if (error) throw error;
    for (const zeile of data ?? []) {
      if (hoechsteKlasse([zeile.kind as string]) !== "keine") {
        gefunden.add(zeile.listing_id as string);
      }
    }
  }
  return gefunden;
}
```

- [ ] **Schritt 6: `main.ts` verdrahten**

`scraper/main.ts:271-280` ersetzen:

```ts
  const gemeldeteIds = await bereitsGemeldeteListingIds(sb, abgaenge.map((l) => l.id));
  const { melden, verschwiegen } = waehleAbgangsmeldungen(abgaenge, (id) => gemeldeteIds.has(id));
  if (verschwiegen > 0) {
    console.log(
      `${sweep.source}: ${verschwiegen} weitere meldefaehige Abgaenge sind markiert, aber nicht ` +
        `gemeldet (Deckel ${MAX_ABGANGSMELDUNGEN_JE_LAUF}). Sie stehen mit disappeared_at im Bestand.`
    );
  }
```

Der Aufruf `const gemeldet = await hoechsteGemeldeteKlasse(sb, abgang.id);`
samt `if (gemeldet === "keine") continue;` in der Schleife entfällt — die
Frage ist jetzt vor dem Deckel beantwortet. Die Importe in `main.ts`
entsprechend anpassen: `budgetiereAbgangsmeldungen` raus,
`waehleAbgangsmeldungen` und `bereitsGemeldeteListingIds` rein.

- [ ] **Schritt 7: Alles grün sehen und aufräumen**

```bash
cd scraper && npm test && npx tsc --noEmit
```

Erwartet: alles grün. Ist `budgetiereAbgangsmeldungen` jetzt ohne Aufrufer
(`grep -rn "budgetiereAbgangsmeldungen" --include=*.ts .`), wird sie samt
ihres `describe`-Blocks gelöscht; toter Code mit eigenen Tests sieht
lebendig aus.

- [ ] **Schritt 8: Committen**

```bash
git add scraper/lib/bestand.ts scraper/lib/bestand.test.ts scraper/lib/db.ts scraper/main.ts
git commit -F - <<'ENDE'
fix(abgang): der Deckel lag vor dem Filter statt dahinter

Lauf 34637349206: 44 Abgaenge markiert, 10 im Deckel, EINE Meldung
gesendet. Die anderen neun Plaetze gingen an Objekte, die nie im Chat
waren und deshalb gar keine Meldung ausloesen konnten -- und die 34
verschwiegenen bleiben stumm, weil sie markiert sind und nie wieder als
neuer Abgang auftauchen.

Jetzt wird zuerst gefiltert, dann gedeckelt, und `verschwiegen` zaehlt nur
noch meldefaehige Objekte. Eine Sammelabfrage statt einer Abfrage je Objekt.
ENDE
```

---

### Aufgabe 3: Ein Objekt ohne Preis fällt nicht mehr still heraus (A-4)

**Warum:** `main.ts:398` verwirft ein Immowelt-Objekt ohne Preis mit einem
`continue`. Es steht danach nur im Protokoll des Laufs und in keiner
Tabelle. Abnahmekriterium A-4 verlangt, dass kein Objekt still aus dem Radar
fällt. **Entscheidung des Nutzers vom 2026-09-11:** eine `listings`-Zeile
**ohne** `listing_versions`-Zeile. Kein nullbares `price_cents`, keine
Migration auf Produktionsdaten.

**Files:**
- Modify: `scraper/lib/db.ts` (neue Funktion neben `upsertListingAndVersion`),
  `scraper/main.ts:395-414`
- Test: `scraper/lib/db.test.ts`

**Interfaces:**
- Produces: `upsertListingOhneBewertung(supabase: SupabaseClient, daten: { source: string; externalId: string; url: string; fundort: string | null }): Promise<void>`
- Consumes: `listingUpsertZeile` aus `lib/db.ts` (vorhanden, exportiert).

- [ ] **Schritt 1: Den roten Test schreiben**

In `scraper/lib/db.test.ts`:

```ts
/**
 * Warum dieser Test existiert: Abnahmekriterium A-4 verlangt, dass kein
 * Objekt still aus dem Radar faellt. "Preis auf Anfrage" ist bei Immowelt
 * kein Parserfehler, sondern eine Aussage der Quelle -- das Objekt
 * existiert, nur seine Bewertung nicht. Es bekommt deshalb eine
 * listings-Zeile und KEINE listing_versions-Zeile: ein erfundener Preis
 * ginge unmittelbar in den Kaufpreisfaktor ein, und ein nullbarer Preis
 * verlangte eine Migration auf Produktionsdaten.
 */
describe("upsertListingOhneBewertung", () => {
  it("schreibt eine listings-Zeile und keine listing_versions-Zeile", async () => {
    const geschrieben: string[] = [];
    const client = {
      from(tabelle: string) {
        geschrieben.push(tabelle);
        return {
          upsert: () => Promise.resolve({ data: null, error: null }),
        };
      },
    } as unknown as SupabaseClient;

    await upsertListingOhneBewertung(client, {
      source: "immowelt",
      externalId: "abc",
      url: "https://example.invalid/expose/abc",
      fundort: "th",
    });

    expect(geschrieben).toEqual(["listings"]);
    expect(geschrieben).not.toContain("listing_versions");
  });

  it("behauptet keine Detailerfassung -- last_detail_at bleibt leer", async () => {
    // Ein last_detail_at wuerde das Objekt aus `ladeVeralteteExternalIds`
    // heraushalten: es gaelte als frisch im Detail erfasst, obwohl nie eine
    // Detailseite gelesen wurde.
    let zeile: Record<string, unknown> = {};
    const client = {
      from: () => ({
        upsert: (werte: Record<string, unknown>) => {
          zeile = werte;
          return Promise.resolve({ data: null, error: null });
        },
      }),
    } as unknown as SupabaseClient;

    await upsertListingOhneBewertung(client, {
      source: "immowelt",
      externalId: "abc",
      url: "https://example.invalid/expose/abc",
      fundort: null,
    });

    expect(zeile.last_detail_at).toBeNull();
    expect(zeile.disappeared_at).toBeNull();
    expect(zeile.last_seen).toEqual(expect.any(String));
  });
});
```

- [ ] **Schritt 2: Den Test rot sehen**

```bash
cd scraper && npx vitest run lib/db.test.ts -t "upsertListingOhneBewertung"
```

Erwartet: FAIL mit `upsertListingOhneBewertung is not a function`.

- [ ] **Schritt 3: Die Funktion schreiben**

In `scraper/lib/db.ts`:

```ts
/**
 * Ein Objekt festhalten, das die Quelle ohne Preis anbietet.
 *
 * "Preis auf Anfrage" ist bei Immowelt gemessen kein Parserfehler, sondern
 * eine Aussage der Quelle (A13 Schritt 2); bei ZVG laesst gelegentlich das
 * Gericht den Verkehrswert aus (A6). Ohne Preis ist nichts zu rechnen, und
 * ein erfundener Preis waere schlimmer als gar keiner. Das Objekt bekommt
 * deshalb eine listings-Zeile und KEINE listing_versions-Zeile: A-4 ist
 * damit woertlich erfuellt, ohne Migration und ohne dass eine einzige
 * Metrik eine Zeile ohne Preis zu sehen bekommt.
 *
 * `last_detail_at` bleibt leer: Es wurde keine Detailseite gelesen, und ein
 * gesetzter Wert hielte das Objekt aus `ladeVeralteteExternalIds` heraus.
 */
export async function upsertListingOhneBewertung(
  supabase: SupabaseClient,
  daten: { source: string; externalId: string; url: string; fundort: string | null }
): Promise<void> {
  const jetzt = new Date().toISOString();
  const { error } = await supabase.from("listings").upsert(
    { ...listingUpsertZeile(daten, jetzt), last_detail_at: null },
    { onConflict: "source,external_id" }
  );
  if (error) throw error;
}
```

- [ ] **Schritt 4: Test grün sehen**

```bash
cd scraper && npx vitest run lib/db.test.ts -t "upsertListingOhneBewertung"
```

Erwartet: PASS, zwei Tests.

- [ ] **Schritt 5: `main.ts` verdrahten**

In `scraper/main.ts`, im Zweig `if (werte.preisCents === null)`, **vor** dem
`continue` und nach der bestehenden Protokollzeile:

```ts
      await upsertListingOhneBewertung(sb, {
        source: "immowelt",
        externalId: zusammenfassung.externalId,
        url: zusammenfassung.url,
        fundort: zusammenfassung.fundort ?? null,
      });
```

Die Protokollzeile bleibt: Sie trennt „die Quelle nennt keinen Preis" von
„der Parser hat versagt", und diese Unterscheidung steht in keiner Tabelle.

- [ ] **Schritt 6: Prüfen, dass die Löschwachen das aushalten**

Eine `listings`-Zeile ohne Version ist ab jetzt ein normaler Zustand. Zwei
Stellen lesen Versionen und müssen leer vertragen:

```bash
cd scraper && grep -n "listing_versions" main.ts lib/pipeline.ts | grep -v test
```

In `main.ts` in der Abgangsschleife steht bereits `if (!data) continue;` —
ohne Version geht keine Abgangsmeldung raus, und das ist richtig: Ein
Objekt, das nie bewertet wurde, war auch nie im Chat. Prüfen, ob eine
weitere Stelle ohne diese Absicherung liest; findet sich eine, wird sie in
dieser Aufgabe mit eigenem Test geschlossen.

- [ ] **Schritt 7: Alles grün sehen**

```bash
cd scraper && npm test && npx tsc --noEmit
```

- [ ] **Schritt 8: Committen**

```bash
git add scraper/lib/db.ts scraper/lib/db.test.ts scraper/main.ts
git commit -F - <<'ENDE'
feat(a4): ein Objekt ohne Preis bekommt eine Zeile statt eines continue

Entscheidung des Nutzers vom 2026-09-11: eine listings-Zeile ohne
listing_versions-Zeile. Erfuellt A-4 woertlich, ohne Migration auf
Produktionsdaten und ohne dass eine Metrik eine Zeile ohne Preis sieht.
last_detail_at bleibt leer -- es wurde keine Detailseite gelesen.
ENDE
```

---

### Aufgabe 4: Den D-5-Beleg zu Ende messen (kein Code)

**Warum:** D-5 ist erfüllt, wenn ein Produktionslauf **weniger
Zurückgestellte** zeigt **und** besser belegte Objekte unter den Gesendeten.
Die erste Hälfte steht: 71 → 47. Die zweite ist noch nicht gemessen.

**Files:**
- Modify: `docs/superpowers/ABNAHME-BASIS.md` (Zeile zu D-5)
- Kein Produktionscode.

- [ ] **Schritt 1: Die Mietquelle der gesendeten Meldungen auszählen**

Rein lesend, lokal erlaubt. Skript in das Sitzungsverzeichnis, nicht ins
Repository. Es liest `notifications` seit dem Lauf und schlägt je
`listing_id` die jüngste `listing_versions`-Zeile nach.

```ts
import { sb } from "file:///C:/immo-radar/scraper/lib/supabase.ts";
const seit = "2026-09-11T19:00:00Z";
const { data: meldungen } = await sb
  .from("notifications").select("listing_id, kind, sent_at").gte("sent_at", seit);
// Je listing_id die juengste Version holen und nach rent_source auszaehlen.
```

Die Spalte, die die Stufe trägt, steht in `lib/rentEstimate.ts` (`MietQuelle`);
in der Datenbank ist es `listing_versions.rent_source`. **Erst nachsehen,
wie die Spalte tatsächlich heißt, dann abfragen** — eine geratene Spalte
liefert stillschweigend `null` und damit ein falsches Ergebnis.

- [ ] **Schritt 2: Gegen den Lauf davor vergleichen**

Dieselbe Auszählung für `34630574787` (Zeitfenster 2026-09-11T17:57Z bis
18:20Z, 25 gesendet, 71 zurückgestellt). Ohne Vorher-Wert sagt die Zahl
nichts.

- [ ] **Schritt 3: Das Ergebnis in `ABNAHME-BASIS.md` eintragen**

Die D-5-Zeile bekommt entweder **erfüllt** mit beiden Zahlen im Text, oder
sie bleibt offen mit der gemessenen Begründung, warum die Reihenfolge noch
nicht wirkt. Kein „vermutlich".

- [ ] **Schritt 4: Committen**

```bash
git add docs/superpowers/ABNAHME-BASIS.md
git commit -F - <<'ENDE'
docs(d5): der Beleg fuer das Meldekontingent, gemessen an zwei Laeufen
ENDE
```

---

### Aufgabe 5: Die Messfragen M1 bis M6 schließen (kein Code)

**Warum:** Schritt 0 des Dashboard-Entwurfs. M1 und M3 können die
Stufengrenzen aus Abschnitt 3.3 verschieben und gehören deshalb **vor** die
erste Zeile von `lib/ranking.ts`. Alle sechs Fragen stehen mit Begründung in
[`specs/2026-09-09-dashboard-entwurf.md`](../specs/2026-09-09-dashboard-entwurf.md)
Abschnitt 10.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-09-dashboard-entwurf.md` (Nachtrag
  am Ende, Abschnitt 10 bleibt als Frage stehen und bekommt je Zeile die
  Antwort)
- Kein Produktionscode, ausschließlich lesende Abfragen.

- [ ] **Schritt 1: M3 zuerst — die Verteilung auf die Sicherheitsstufen**

Sie entscheidet, ob S2 überhaupt genug Objekte für einen eigenen Block hat.
Auszählung über die jüngste Version je Objekt nach `rent_source` und
`data_gaps`. Erwartungswert aus dem Entwurf: 83 % S1, „über die Hälfte
`wohnflaeche_fehlt`" — die Überschneidung ist unbekannt und genau das ist
die Frage.

- [ ] **Schritt 2: M1 — der Einfluss der angenommenen Einheitenzahl**

DSCR je bewertbarem Objekt zweimal rechnen, einmal mit `MIN_EINHEITEN = 3`
und einmal mit der alternativen Annahme, im Verfahren von A11. Betrifft 567
von 1.000 Versionen. Ergebnis entscheidet: Merkmal oder eigene Stufe.

- [ ] **Schritt 3: M2, M4, M5, M6 messen**

M2 Bandbreite je Objekt bei Skalierung über die Landesspanne, M4 Verteilung
des `last_seen`-Alters je Region, M5 Zahl der Schwellenwechsler gegen A11s
558, M6 wie oft eine Preissenkung den Rang bewegt.

- [ ] **Schritt 4: Den Nachtrag schreiben**

Je Frage: die Zahl, das Verfahren, das Datum, und was sie am Entwurf
ändert. Verschiebt M1 oder M3 eine Stufengrenze, wird Abschnitt 3.3
ausdrücklich korrigiert statt ergänzt — ein Entwurf mit zwei Ständen
nebeneinander ist schlimmer als einer mit einem falschen.

- [ ] **Schritt 5: Committen**

```bash
git add docs/superpowers/specs/2026-09-09-dashboard-entwurf.md
git commit -F - <<'ENDE'
docs(dashboard): M1 bis M6 gemessen -- Schritt 0 des Entwurfs ist geschlossen
ENDE
```

---

## Danach, nicht in diesem Plan

**`scraper/lib/ranking.ts`** (Schritt 2 des Entwurfs) wird erst nach
Aufgabe 5 geschnitten. Der Grund steht im Entwurf selbst: M1 und M3 können
die Stufengrenzen verschieben, und ein Plan, der jetzt Testcode für diese
Grenzen festschreibt, schriebe eine Vermutung fest. Zwei Tests stehen aber
schon fest und gehören in den ersten Entwurf dieser Datei: dass
`geschaetzterDscr = nettomietrenditeCapRate / 6` gilt, und dass ein Objekt
mit `wohnflaeche_fehlt` **keine** Kennzahl ausliefert statt einer 0.

**Der Snapshot-Export** (Schritt 3, Zugriffsweg C1, vom Nutzer am
2026-09-11 bestätigt) folgt auf `ranking.ts`.

**Ein Produktionslauf nach den Aufgaben 1 bis 3.** Aufgabe 1 verändert,
welche Objekte der Abgleich überhaupt sieht — die Zahl der Markierungen
wird danach ein anderes Bild zeigen als die 32 dieses Laufs. Dieses Projekt
belegt Abnahmen an echten Läufen, nicht an Tests.
