# Nachtrag-Korrektur, ZVG-Hälfte von A-4 und der erste Schnitt von `ranking.ts`

> **Für agentische Bearbeiter:** ERFORDERLICHE UNTER-SKILL: Diesen Plan mit
> `superpowers:subagent-driven-development` Aufgabe für Aufgabe umsetzen. Die
> Schritte tragen Kästchen (`- [ ]`) zum Abhaken.
>
> **Jeder Agent wägt zusätzlich selbst ab, welche Superpower zu seiner Aufgabe
> passt, und wendet sie an** — der Plan schreibt sie nicht vor. Bei neuem
> Verhalten liegt `superpowers:test-driven-development` nahe, bei einem Fehler
> `superpowers:systematic-debugging`, vor jeder Fertigmeldung
> `superpowers:verification-before-completion`.

**Ziel:** Der Dashboard-Entwurf trägt nur noch **einen** Stand, A-4 gilt auch
für ZVG statt nur für Immowelt, und `scraper/lib/ranking.ts` existiert mit der
Stufenfunktion, an der das ganze Dashboard hängt.

**Architektur:** Drei voneinander unabhängige Arbeitsstücke. Aufgabe 1 ist reine
Dokumentation ohne eine Zeile Code. Aufgabe 2 zieht eine bereits getroffene
Entscheidung des Nutzers auf die zweite Quelle nach und berührt dabei den
ZVG-Scraper und `main.ts`. Aufgabe 3 legt eine neue, reine Datei an, die nichts
importiert, was die anderen beiden anfassen.

**Tech Stack:** TypeScript (ESM, `strict: true`), `tsx`, `vitest`,
`@supabase/supabase-js`. Alles unter `scraper/`.

**Spec:** [`../specs/2026-09-09-dashboard-entwurf.md`](../specs/2026-09-09-dashboard-entwurf.md)
(Aufgaben 1 und 3) und
[`../specs/2026-09-12-messfragen-nachtrag-funde.md`](../specs/2026-09-12-messfragen-nachtrag-funde.md)
(Aufgabe 1 wörtlich) sowie
[`../specs/2026-09-09-offene-entscheidungen.md`](../specs/2026-09-09-offene-entscheidungen.md)
Entscheidung 2 (Aufgabe 2).

## Global Constraints

Gelten für **jede** Aufgabe, wörtlich aus
[`../BACKLOG.md`](../BACKLOG.md) übernommen:

- **Kein bundesweiter Scraper-Lauf über den Anschluss des Nutzers.** Lokal
  höchstens **eine** Region über `scraper/scripts/pruefe-region.mts`. Ein voller
  Lauf hat das Heimnetz zweimal lahmgelegt.
- **Kein Netzkommando im Agentenauftrag:** kein `npm`, `npm ci`, `npm install`,
  `curl`, `gh`, `git fetch`, `git push`. `node_modules` wird über
  `scripts/worktree-node-modules.sh` bereitgestellt (Junction, sonst Symlink,
  sonst Kopie). Fehlt etwas, das Netz bräuchte: **BLOCKED melden**, nicht
  umgehen.
- **Chromium läuft mit Fenster** (`headless: false`). Nicht auf headless
  „zurückoptimieren".
- **TDD ist Pflicht:** erst der Test, **ihn rot sehen**, dann die minimale
  Umsetzung. Ein grüner Test, der den Fehler nie rot gesehen hat, gilt in
  diesem Projekt als wertlos.
- **Vor jeder Erfolgsmeldung:** `cd scraper && npx vitest run` und
  `npx tsc --noEmit` frisch laufen lassen und die Ausgabe zeigen.
- **Wer nicht urteilen kann, löscht nicht.** Jede Änderung an
  `lib/bestand.ts`, `lib/plausibilitaet.ts` oder `lib/bestandDb.ts` berührt die
  Wachen vor der Massenlöschung. Dort nie fail-open bauen: ein unbekannter
  Zustand ist `null`/`false`, nie „in Ordnung".
- **Die Doku führt der Koordinator zusammen.** Kein Agent fasst
  `BACKLOG.md`, `TODO.md`, `UEBERGABE.md` oder `ABNAHME-BASIS.md` an.

---

## Aufgabe 1: Der Nachtrag trägt nur noch einen Stand

**Kein Code.** Die Funddatei
[`../specs/2026-09-12-messfragen-nachtrag-funde.md`](../specs/2026-09-12-messfragen-nachtrag-funde.md)
**ist der Auftrag, Punkt für Punkt.** Sie ist zuerst vollständig zu lesen.

**Dateien:**
- Ändern: `docs/superpowers/specs/2026-09-09-dashboard-entwurf.md` — Abschnitte
  3.1, 3.3, 3.8, 4.3, 6.2, 6.3, 9, 10 (M3-Zeile), 13.1, 13.4, 13.7 und die
  E-7-Zeile in Abschnitt 11
- Ändern: `docs/superpowers/specs/2026-09-12-messfragen-nachtrag-funde.md` —
  am Ende je Fund vermerken, **wie** er erledigt wurde
- Lesen, nicht ändern:
  `.superpowers/sdd/2026-09-12-blaetterung-meldedeckel-und-a4/messung-korrektur-1.ts`,
  `messung-korrektur-2.ts`, `messung-korrektur-regionsabstand.ts` — die
  Messskripte des Prüfers, aus denen die Korrekturzahlen stammen

**Interfaces:**
- Consumes: nichts aus anderen Aufgaben
- Produces: einen Entwurf mit **einem** Stand. Aufgabe 3 liest daraus
  ausschließlich Abschnitt 3.3 (die Stufenbedingungen) und 3.7.

**Die Grundregel, aus der Funddatei wörtlich:** Der Entwurf darf danach an
keiner Stelle zwei Stände tragen, und keine Zahl darf ohne Verfahren, Datum und
die Angabe dastehen, **was sie nicht hergibt**. Wo die sieben Tage Historie eine
Frage nicht beantworten, ist „nicht entscheidbar, in vier Wochen nachmessen"
die richtige Antwort und **nicht** eine Schwelle mit schwacher Begründung.

- [ ] **Schritt 1: Kritisch 1 — 3.3, 3.1, 13.1 und die M3-Zeile in Abschnitt 10 auf die korrigierte Regel umstellen**

Die Tabelle in 3.3 nennt in derselben Zeile die korrigierte Bedingung
(`living_area_m2 <= 0` zählt als S0) und die alten Zahlen. Die Zahlen unter der
korrigierten Regel stehen bereits gemessen in der Funddatei:

| Stufe | bisher im Nachtrag | unter der korrigierten Regel |
|---|---|---|
| S3 | 1 | 1 |
| S2 | 196 | **52** (0,4 %) |
| S1 | 11.312 | **11.308** |
| S0 | 1.102 | **1.250** (9,9 %) |
| davon ZVG in S2 | 169 | **39** |

Alle vier Stellen bekommen diese Zahlen. **Zusätzlich zu ändern, und das ist
der eigentliche Punkt:** Die tragende M3-Antwort lautete „S2 trägt genug für
einen eigenen Block". Mit 52 Objekten ist das **nicht mehr belegt**. Die
Blockfrage ist als **offen** zu kennzeichnen, nicht als beantwortet — mit der
Begründung, dass 52 von 12.611 Objekten (0,4 %) einen eigenen beschrifteten
Block tragen müssten, und dass diese Frage Schritt 4 des Entwurfs betrifft,
nicht Schritt 2.

- [ ] **Schritt 2: Kritisch 2 — 6.3 auf einen Stand bringen und die 3-Tage-Schwelle zurückziehen**

Die Zustandstabelle definiert weiter über „Kadenz seiner Region" und „das
Doppelte der Regionskadenz", der Fließtext sagt fett „Die Schwelle ist
regionsindividuell, nicht global" — direkt vor dem Block, der eine globale
Schwelle von 3 Tagen beschließt. **Einer der beiden Stände muss weg.**

Zwei Begründungssätze des Nachtrags sind zudem durch seine eigenen Messwerte
widerlegt. Gemessen:

| Größe | Wert |
|---|---|
| `nw` P90 | 3,32 d |
| `ni` P90 | 3,10 d |
| Maximum aller Regionen | 4,78 d |
| bei 3 Tagen dauerhaft unbestätigt: `ni` | 217 von 853 (25,4 %) |
| bei 3 Tagen dauerhaft unbestätigt: `nw` | 337 von 3.163 (10,7 %) |

„3 Tage liegen über jedem Regions-P90" ist damit falsch (`nw` 3,32 d), „eine
gerade Zahl über dem gemessenen Maximum aller Regionen" ebenfalls (4,78 d), und
„trifft keine Region dauerhaft" ist widerlegt.

**Dazu kommt, dass die Grundgesamtheit die Schwelle ohnehin nicht trägt:** Das
älteste `first_seen` liegt 6,92 Tage zurück, und nur 187 von 12.611 Objekten
(1,5 %) sind länger als 5 Tage im Bestand. Ein Objekt von gestern *kann* kein
Alter von 3 Tagen zeigen. Auf Objekte eingeschränkt, die überhaupt einen
Rückstand zeigen können, liegen **13,0 %** über 3 Tagen statt der genannten
5,6 %.

**Zu schreiben ist die zulässige Antwort:** „Auf sieben Tagen Historie nicht
entscheidbar. Die Schwelle wird in vier Wochen nachgemessen; bis dahin gilt die
regionsindividuelle Definition aus der Zustandstabelle." Die alten
Begründungssätze werden **gestrichen, nicht ergänzt**.

- [ ] **Schritt 3: Wichtig 3 — 4.3 und 13.4 widersprechen sich; einen Stand wählen**

Die Filterliste „(7 / 14 / 30 Tage)" und die Begründung für das 7-Tage-Fenster
stehen unverändert über dem Block, der 3 Tage beschließt. Schwerer wiegt: Die
alte Begründung war das 90. Perzentil des **Regionsabstands** (7,6 d), gemessen
wurde aber das **`last_seen`-Alter**. Das sind zwei verschiedene Größen.
Abschnitt 13.4 sagt, die 5,7 und 7,6 Tage seien „nicht widerlegt", während 4.3
zwei Absätze davor sagt, ihre Begründung trage nicht mehr. **Beides zugleich
geht nicht.**

Zwei zulässige Wege, **einer** ist zu wählen und die Wahl zu begründen:

1. Den Regionsabstand aus `sweep_region_runs` wirklich nachmessen — das Skript
   dafür liegt bereits als
   `.superpowers/sdd/2026-09-12-blaetterung-meldedeckel-und-a4/messung-korrektur-regionsabstand.ts`.
   Braucht einen Datenbankzugriff (Service-Key in `scraper/.env`), **kein
   Scraping**. Das ist erlaubt.
2. Die Änderung an 4.3 zurücknehmen und die 7/14/30-Tage-Fassung stehen lassen,
   mit dem ausdrücklichen Vermerk, dass das `last_seen`-Alter eine andere Größe
   misst und die Frage offen ist.

Weg 1 ist vorzuziehen, **wenn** das Skript ohne Änderung läuft. Scheitert es,
ist Weg 2 zu gehen und der Fehlschlag zu vermerken — nicht stillschweigend auf
Weg 2 auszuweichen.

- [ ] **Schritt 4: Wichtig 4 — M6 misst einen Rang, den der Entwurf nicht vergibt**

**6 der 17** echten Preissenkungen liegen in **S0** — Objekten, die nach 3.7
überhaupt keinen Rangplatz bekommen. Gerankt wurde global über alle 12.157,
obwohl 3.2 nach Stufenblöcken trennt. Der Median „+539 Plätze", mit dem
Abschnitt 2.4 belegt wird, stammt damit teils aus einer Liste, die es so nie
geben wird.

Zwei zulässige Wege, **einer** ist zu wählen:

1. Innerhalb der Stufe und ohne S0 neu rechnen (Skripte:
   `messung-m6-preissenkung.ts` und `messung-m6-teil2.ts`, Datenbankzugriff,
   kein Scraping).
2. Ausdrücklich dranschreiben, **welche** Liste gerankt wurde — „global über
   alle bewerteten Objekte, einschließlich S0, also über eine Liste, die das
   Dashboard so nicht zeigt" — und dazu, dass 6 der 17 Senkungen in S0 lagen.

In beiden Fällen muss die Aussage in 2.4 („Anforderung 3 ist belegt") den
Vorbehalt tragen, den die Stichprobengröße von 17 verlangt.

- [ ] **Schritt 5: Wichtig 5 — „54 statt 157" vergleicht zwei verschiedene Größen**

Alt war „ohne `fundort`", neu ist „ohne zuordenbare Region" über
`partitionEinesListings`. Heute gemessen: **ohne Fundort 250** (54 Immowelt,
196 ZVG), **ohne zuordenbare Region 54**. Der Rückgang von 8,2 % auf 0,4 % ist
damit teils definitorisch. Die angegebene Ursache („Fundort wird seit dem Umbau
mitgeschrieben") ist **behauptet, nicht gemessen**.

In E-7 und 6.2 sind beide Größen mit Namen nebeneinanderzustellen, und die
unbelegte Ursachenbehauptung ist zu streichen oder als Vermutung zu
kennzeichnen. `ABNAHME-BASIS.md` A-2 verlangt wörtlich: keine Meldung behauptet
eine Ursache, die nicht gemessen ist — das gilt auch für den Entwurf.

- [ ] **Schritt 6: Die vier kleinen Funde**

- 3.8 nennt weiter „Belegte Miete: 2 Objekte", Abschnitt 9 „solange nur
  **zwei** Objekte eine belegte Miete tragen" — gemessen ist **1**.
- Abschnitt 9 nennt weiter „bei einem 90. Perzentil von 7,6 Tagen der
  Regelfall" — hängt an Schritt 3 und ist mit dessen Ergebnis zu
  vereinheitlichen.
- E-4 trägt weiter „339 von 409 Meldekandidaten", während 13.7 aus derselben
  Messung „197 von 12.611" ableitet.
- Die Zahl „6.408 von 11.308 = 56,7 %" in 3.1 steht **ohne Verfahren** — das
  Verfahren ist zu ergänzen oder die Zahl zu streichen.

- [ ] **Schritt 7: Gegenlesen gegen die Grundregel**

Den geänderten Entwurf **einmal ganz** lesen und drei Fragen beantworten:

1. Trägt noch irgendeine Stelle zwei Stände? Als Startpunkt, nicht als Ersatz
   fürs Lesen: `grep -nE "2 Objekte|zwei Objekte|7,6 Tage|196|1\.102|11\.312|339 von 409" docs/superpowers/specs/2026-09-09-dashboard-entwurf.md`
2. Steht jede Zahl mit Verfahren und Datum da?
3. Steht bei jeder Zahl, **was sie nicht hergibt**?

- [ ] **Schritt 8: In der Funddatei je Fund vermerken, wie er erledigt wurde**

Unter jedem Fund ein kurzer Absatz: **was geändert wurde**, und bei
„entweder/oder" **welcher Weg gewählt wurde und warum**. Die Funddatei wird
damit vom Auftrag zum Protokoll.

- [ ] **Schritt 9: Commit**

```bash
git add docs/superpowers/specs/2026-09-09-dashboard-entwurf.md docs/superpowers/specs/2026-09-12-messfragen-nachtrag-funde.md
git commit -m "docs(dashboard): der Entwurf traegt nach der Korrekturrunde nur noch einen Stand"
```

**Abnahme:** Ein fremder Leser kann dem Entwurf nicht mehr zwei verschiedene
Antworten auf dieselbe Frage entnehmen. Tests und `tsc` sind hier **nicht**
betroffen — es wurde keine Zeile Code geändert; das ist im Bericht ausdrücklich
zu sagen, statt einen Testlauf als Beleg auszugeben.

---

## Aufgabe 2: A-4 gilt auch für ZVG

**Der Befund.** `ea8b731` hat A-4 nur für Immowelt geschlossen. Ein
ZVG-Objekt, dessen Bekanntmachung keinen verwertbaren Verkehrswert nennt,
wird in `scrapers/zvg-portal/index.ts` weiterhin **ersatzlos verworfen**.
Gemessen (BACKLOG A6): 3 von 194 Fällen (1,5 %), und über acht
aufeinanderfolgende Läufe **immer exakt dieselben drei IDs**. Sie bilden
einen stehenden Rückstand — jeder Lauf holt sie erneut und verwirft sie
erneut.

Die Entscheidung des Nutzers vom 2026-09-11 galt ausdrücklich für **beide**
Quellen: „Beides läuft auf dieselbe Frage hinaus und gehört zusammen
entschieden" (`specs/2026-09-09-offene-entscheidungen.md`, Entscheidung 2).

**Dateien:**
- Ändern: `scraper/scrapers/zvg-portal/index.ts` — `detailSeiteHolen` und
  `erfasseZvgDetails`
- Ändern: `scraper/main.ts:464` — die Schleife über `erfasseZvgDetails`
- Ändern: `scraper/lib/db.ts` — `upsertListingOhneBewertung` bekommt einen
  Schalter für `last_detail_at`, und der Docstring wird nachgezogen
- Test: `scraper/scrapers/zvg-portal/index.test.ts` (oder die Datei, in der
  `beschreibeDetailFehler` bereits getestet wird — **erst nachsehen**)
- Test: `scraper/lib/db.test.ts`

**Interfaces:**
- Consumes: `upsertListingOhneBewertung(supabase, { source, externalId, url,
  fundort })` aus `lib/db.ts` — bereits quellenunabhängig gebaut
- Produces: `erfasseZvgDetails(...)` liefert künftig
  `Promise<{ termine: ZvgDetailData[]; ohneVerkehrswert: ZvgListSummary[] }>`
  statt `Promise<ZvgDetailData[]>`

**Zwei Entwurfsentscheidungen, die vorab feststehen und nicht neu zu
verhandeln sind:**

1. **`last_detail_at` muss für ZVG gesetzt werden, nicht auf `null`.** Für
   Immowelt bleibt es leer, weil dort gar keine Detailseite gelesen wurde.
   Bei ZVG **wurde** die Detailseite gelesen — sie nennt nur keinen Wert.
   Bliebe das Feld leer, landeten die drei Fälle über
   `ladeVeralteteExternalIds` (`last_detail_at is null` fällt bewusst mit
   hinein) in **jedem** Lauf erneut in `zvgVeraltet` und verbrauchten
   Detailbudget für etwas, das das Gericht nie nachliefert. Das ist derselbe
   stehende Rückstand, nur teurer.
2. **Die Unterscheidung „Eigenschaft der Quelle" gegen „Störung" bleibt bei
   `beschreibeDetailFehler`.** Nur `VerkehrswertFehltError` führt zu einer
   Zeile ohne Bewertung. Ein echter Abruffehler (`stoerung: true`) darf
   **keine** Zeile schreiben — sonst behauptet die Zeile, das Objekt sei
   geprüft und wertlos, obwohl es nur nicht erreichbar war. Das ist die
   fail-closed-Regel dieses Projekts an einer neuen Stelle.

- [ ] **Schritt 1: Nachsehen, wo `beschreibeDetailFehler` getestet wird**

```bash
cd scraper && grep -rn "beschreibeDetailFehler" --include=*.ts .
```

Der neue Test gehört in dieselbe Datei. Lege keine neue Testdatei an, wenn es
schon eine gibt.

- [ ] **Schritt 2: Den fehlschlagenden Test für `erfasseZvgDetails` schreiben**

`erfasseZvgDetails` startet einen echten Browser und ist damit nicht direkt
testbar. **Deshalb ist die Trennung zuerst herzustellen:** Ziehe die
Entscheidung, was mit einem Detailergebnis geschieht, in eine reine Funktion
heraus — so wie `beschreibeDetailFehler` bereits aus demselben Grund
herausgezogen wurde („damit diese Entscheidung unter Test steht").

```ts
// scraper/scrapers/zvg-portal/index.ts
export type DetailErgebnis =
  | { art: "erfasst"; daten: ZvgDetailData }
  | { art: "ohne-verkehrswert" }
  | { art: "stoerung" };

export function ordneDetailErgebnisEin(
  daten: ZvgDetailData | null,
  fehler: unknown
): DetailErgebnis;
```

Der Test dazu, **bevor** es die Funktion gibt:

```ts
describe("ordneDetailErgebnisEin", () => {
  it("trennt 'die Quelle nennt keinen Wert' von 'der Abruf ist gescheitert'", () => {
    expect(ordneDetailErgebnisEin(null, new VerkehrswertFehltError("--")).art).toBe(
      "ohne-verkehrswert"
    );
    expect(ordneDetailErgebnisEin(null, new Error("timeout")).art).toBe("stoerung");
  });

  it("schreibt bei einer Stoerung KEINE Zeile ohne Bewertung", () => {
    // Eine Zeile ohne Bewertung behauptet "geprueft, kein Wert vorhanden".
    // Bei einem Abbruch waere das eine Behauptung ueber etwas, das niemand
    // gesehen hat -- genau die Bauart, die dieses Projekt fail-closed nennt.
    expect(ordneDetailErgebnisEin(null, new Error("ERR_NAME_NOT_RESOLVED")).art).toBe(
      "stoerung"
    );
  });
});
```

- [ ] **Schritt 3: Den Test rot sehen**

```bash
cd scraper && npx vitest run scrapers/zvg-portal/
```

Erwartung: FAIL, `ordneDetailErgebnisEin is not a function`. **Erst wenn du
diese Ausgabe gesehen hast, weiter.**

- [ ] **Schritt 4: Die minimale Umsetzung**

`ordneDetailErgebnisEin` schreiben, `detailSeiteHolen` den Fehler
durchreichen lassen statt ihn zu schlucken, und `erfasseZvgDetails` beide
Listen zurückgeben lassen. Die Logzeile aus `beschreibeDetailFehler` bleibt
erhalten — sie ist der einzige Ort, an dem „keine Störung, sondern eine
Eigenschaft der Quelle" im Protokoll steht.

- [ ] **Schritt 5: Test grün sehen**

```bash
cd scraper && npx vitest run scrapers/zvg-portal/
```

- [ ] **Schritt 6: Den Test für den `last_detail_at`-Schalter schreiben, rot sehen, umsetzen**

In `scraper/lib/db.test.ts`, im Stil der vorhandenen
`upsertListingOhneBewertung`-Tests — **erst ansehen, wie die dortigen Fakes
gebaut sind**, und denselben Stil benutzen.

```ts
it("setzt last_detail_at, wenn die Detailseite gelesen wurde", async () => {
  // ZVG: Die Bekanntmachung WURDE gelesen, sie nennt nur keinen Wert.
  // Bliebe last_detail_at leer, holte ladeVeralteteExternalIds das Objekt
  // in jedem Lauf erneut -- Detailbudget fuer etwas, das das Gericht nie
  // nachliefert.
});

it("laesst last_detail_at leer, wenn keine Detailseite gelesen wurde", async () => {
  // Immowelt: aus der Ergebnisliste bewertet, nie eine Detailseite geholt.
});
```

- [ ] **Schritt 7: `main.ts` verdrahten**

Die ZVG-Schleife (`main.ts:464`) liest künftig `termine` statt des nackten
Arrays, und schreibt für jedes Element aus `ohneVerkehrswert` eine Zeile.
**Gekapselt wie der Immowelt-Fall** — ein vorübergehender Datenbankfehler
beim unwichtigsten Schreibvorgang des Laufs darf den Lauf nicht abbrechen
(A-1). Das Muster steht unmittelbar daneben und ist zu kopieren, nicht neu
zu erfinden.

Der `fundort` ist für ZVG `null` — ein fehlender Fundort heißt „nicht
zuzuordnen", und Unzuordenbares ist nie ein Abgang.

- [ ] **Schritt 8: Prüfen, ob die neue Zeile eine Löschwache öffnet**

**ZVG hat im Gegensatz zu Immowelt Löschhoheit** (`QUELLEN_MIT_LOESCHHOHEIT`).
Deshalb ist hier ausdrücklich nachzusehen und im Bericht zu beantworten:

1. Steht ein Objekt ohne Verkehrswert in `sweep.gesehene`? (Es steht auf der
   Ergebnisliste, nur seine Detailseite ist unergiebig — also vermutlich ja.
   **Nachsehen, nicht vermuten.**)
2. Kann es dadurch je als Abgang gelten und gelöscht werden?
3. Verschiebt sich durch drei zusätzliche `listings`-Zeilen irgendeine
   Mengenplausibilität in `lib/plausibilitaet.ts`?

- [ ] **Schritt 9: Voller Lauf und Commit**

```bash
cd scraper && npx vitest run && npx tsc --noEmit
```

Beide Ausgaben im Bericht zeigen. Dann:

```bash
git add -A
git commit -m "feat(a4): auch ein ZVG-Objekt ohne Verkehrswert bekommt eine Zeile"
```

**Abnahme:** Ein ZVG-Objekt ohne Verkehrswert ist nach dem Lauf in `listings`
auffindbar, trägt keine `listing_versions`-Zeile, hat ein gesetztes
`last_detail_at` und kann keine Löschwache öffnen. Eine **Störung** schreibt
weiterhin nichts.

---

## Aufgabe 3: `scraper/lib/ranking.ts` — die Stufenfunktion

**Warum diese Aufgabe NICHT auf Aufgabe 1 wartet.** `UEBERGABE.md` sagt,
`lib/ranking.ts` dürfe erst nach der Korrekturrunde geschnitten werden. Das
gilt für die **Blockdarstellung** (Schritt 4 des Entwurfs), deren tragende
Begründung mit Kritisch 1 kippt. Es gilt **nicht** für die Stufenfunktion:
Die *Regel* aus 3.3 ist unstrittig — der Entwurf und die Funddatei sagen
dasselbe, bestritten sind nur die *Anzahlen* je Stufe. Anzahlen gehören in
kein Stück Code. Diese Prämisse ist vor dem Start noch einmal gegen 3.3 zu
prüfen; stellt sie sich als falsch heraus: **BLOCKED melden**, nicht
weiterbauen.

**Dateien:**
- Anlegen: `scraper/lib/ranking.ts`
- Anlegen: `scraper/lib/ranking.test.ts`
- Lesen, nicht ändern: `scraper/lib/metrics.ts` (`berechneKennzahlen`,
  `Kennzahlen`), `scraper/lib/pipeline.ts` (`bewerteFlaechenangabe`),
  `scraper/lib/telegram.ts` (`DATA_GAP_LABELS`)

**Interfaces:**
- Consumes: nichts aus Aufgabe 1 oder 2
- Produces:

```ts
export type Sicherheitsstufe = "S3" | "S2" | "S1" | "S0";

export function bestimmeSicherheitsstufe(objekt: {
  rentSource: string | null;
  dataGaps: string[];
  livingAreaM2: number | null;
}): Sicherheitsstufe;
```

**Der Umfang ist bewusst eng.** Nur die Stufenfunktion und die beiden
Pflichttests aus Schritt 2 des Entwurfs. Bandkanten, Bandbreite je
Bundesland, Schwellenwechsler und die Verfügbarkeitszustände sind **nicht**
Teil dieser Aufgabe — sie hängen an Fragen, die Aufgabe 1 erst klärt.

**Die Stufen, wörtlich aus Abschnitt 3.3:**

| Stufe | Bedingung |
|---|---|
| **S0** | mindestens eine Lücke aus `wohnflaeche_fehlt`, `preis_miete_unvereinbar`, `rent_estimate_unreliable` — **oder `living_area_m2` fehlt oder ist 0** |
| **S3** | `rent_source = 'angegeben'` **und** keine Lücke aus der S0-Liste |
| **S2** | `rent_source = 'geschaetzt_regional'` |
| **S1** | `rent_source ∈ {'geschaetzt_bundesland', 'geschaetzt_bundesweit'}` |

**S0 wird zuerst geprüft.** Die Reihenfolge ist nicht beliebig: S0 sticht
jede andere Stufe, auch `angegeben`.

**Warum der `living_area_m2`-Teil der eigentliche Punkt ist:** 148 Objekte
haben in ihrer jüngsten Version keine Wohnfläche und **trotzdem nicht** die
Lücke `wohnflaeche_fehlt` — die Lücke wurde erst am 2026-09-08 eingeführt,
ihre Version stammt vom 2026-09-07. Alle 148 tragen einen gespeicherten DSCR
von **0** und fielen nach der alten Regel in S2 (144) und S1 (4): mit einer
grauen 0,0 ans Ende eines gerankten Blocks. Für ein Ranking-Dashboard ist
*geprüft und schlecht* der gefährlichste Zustand, den *nicht beurteilbar*
annehmen kann. **Die Datenlücke ist eine Ableitung des Feldes; die Stufe muss
am Feld hängen, nicht an der Ableitung** — sonst datiert die Rangliste auf
den Tag, an dem ein Objekt zuletzt gescannt wurde.

- [ ] **Schritt 1: Die beiden Pflichttests schreiben**

Schritt 2 des Entwurfs nennt zwei Tests, die **zuerst rot sein müssen**:

```ts
import { describe, it, expect } from "vitest";
import { bestimmeSicherheitsstufe } from "./ranking.js";
import { berechneKennzahlen } from "./metrics.js";

describe("bestimmeSicherheitsstufe", () => {
  it("stuft ein Objekt ohne Wohnflaeche als S0 ein, auch ohne die Datenluecke", () => {
    // Die 148 Objekte vom 2026-09-07: keine Flaeche, aber die Luecke
    // wohnflaeche_fehlt gab es damals noch nicht. Nach der alten Regel
    // landeten sie in S2 und S1 -- mit einer grauen 0,0 am Ende eines
    // gerankten Blocks, also als "geprueft und schlecht" statt als
    // "nicht beurteilbar".
    expect(
      bestimmeSicherheitsstufe({
        rentSource: "geschaetzt_regional",
        dataGaps: [],
        livingAreaM2: null,
      })
    ).toBe("S0");

    expect(
      bestimmeSicherheitsstufe({
        rentSource: "geschaetzt_regional",
        dataGaps: [],
        livingAreaM2: 0,
      })
    ).toBe("S0");
  });

  it("laesst eine belegte Miete nicht ueber eine Datenluecke gewinnen", () => {
    expect(
      bestimmeSicherheitsstufe({
        rentSource: "angegeben",
        dataGaps: ["preis_miete_unvereinbar"],
        livingAreaM2: 120,
      })
    ).toBe("S0");
  });

  it("ordnet die drei bewertbaren Stufen zu", () => {
    const flaeche = { dataGaps: [], livingAreaM2: 120 };
    expect(bestimmeSicherheitsstufe({ ...flaeche, rentSource: "angegeben" })).toBe("S3");
    expect(bestimmeSicherheitsstufe({ ...flaeche, rentSource: "geschaetzt_regional" })).toBe("S2");
    expect(bestimmeSicherheitsstufe({ ...flaeche, rentSource: "geschaetzt_bundesland" })).toBe("S1");
    expect(bestimmeSicherheitsstufe({ ...flaeche, rentSource: "geschaetzt_bundesweit" })).toBe("S1");
  });
});
```

**Und der zweite Pflichttest, der die Rangzahl an ihre Definition nagelt.**
Abschnitt 2.1 des Entwurfs hält fest, dass `geschaetzterDscr` und
`nettomietrenditeCapRate` **dieselbe Zahl unter einem Divisor** sind
(`KAPITALDIENST_SATZ = 0,06`). Bricht jemand eine der beiden Formeln, ist die
Rangzahl des Dashboards still eine andere Größe:

```ts
describe("die Rangzahl ist der DSCR -- und der haengt an einer Identitaet", () => {
  // Kein Ranking-Code, sondern eine Wache. Der ganze Entwurf ordnet nach dem
  // DSCR, und 2.3 begruendet das damit, dass er informationell dominiert:
  //
  //   nettomietrenditeCapRate = (noi / gesamtkosten) * 100
  //   geschaetzterDscr        =  noi / (gesamtkosten * KAPITALDIENST_SATZ)
  //
  // Mit KAPITALDIENST_SATZ = 0,06 ist der Quotient beider Groessen konstant
  // 100 * 0,06 = 6. Daraus folgt zweierlei, und beides traegt den Entwurf:
  // Die Rangfolge ist unempfindlich gegen den unterstellten Zinssatz (2.3,
  // Punkt 3 -- wichtig, weil 6 % eine Annahme sind, kein gemessener Wert),
  // und Faktor und Rendite sind nach 2.1 teilweise dieselbe Zahl. Aendert
  // jemand eine der beiden Formeln, ordnet das Dashboard still nach etwas
  // anderem -- ohne dass irgendein anderer Test faellt.
  //
  // Die Eingabewerte stammen aus lib/metrics.test.ts (Zeile 7-13 und 87-93),
  // nicht aus der Luft. Am 2026-09-13 nachgerechnet: A ergibt DSCR
  // 0,8039150663732376 gegen capRate/6 = 0,8039150663732376; B (der echte
  // Produktionsfall mit falschem Preis) 68,27015692794394 gegen
  // 68,27015692794394. Die Identitaet haelt also auch weit ausserhalb des
  // plausiblen Bereichs.
  const leipzig = {
    kaufpreis: 480_000,
    jahreskaltmiete: 32_000,
    einheiten: 3,
    baujahr: 1998,
    wohnflaecheM2: 240,
  };
  // Der reale Fehlmeldungsfall 2f41102f: rechnerisch einwandfrei, inhaltlich
  // Unsinn. Er steht hier, damit die Identitaet nicht nur im gutmuetigen
  // Zahlenbereich geprueft wird.
  const kaputt = {
    kaufpreis: 2_840,
    jahreskaltmiete: 16_224,
    einheiten: 3,
    baujahr: 1998,
    wohnflaecheM2: 198.8,
  };

  it("haelt fest, dass geschaetzterDscr = nettomietrenditeCapRate / 6 ist", () => {
    const a = berechneKennzahlen(leipzig, 5.5);
    expect(a.geschaetzterDscr).toBeCloseTo(a.nettomietrenditeCapRate / 6, 10);

    const b = berechneKennzahlen(kaputt, 6.5);
    expect(b.geschaetzterDscr).toBeCloseTo(b.nettomietrenditeCapRate / 6, 10);
  });
});
```

**Dieser Test ist am 2026-09-13 gegen den echten Code ausgeführt worden und
war grün** — er ist bewusst ein *Charakterisierungstest*, keiner, der zuerst
rot ist. Das ist der einzige Test in diesem Plan, für den das gilt, und der
Grund steht im Kommentar: Er hält eine Eigenschaft fest, die heute schon
stimmt und still brechen könnte. Die anderen Tests dieser Aufgabe **müssen**
zuerst rot sein. Sag im Bericht ausdrücklich, welcher welcher war.

- [ ] **Schritt 2: Alle Tests rot sehen**

```bash
cd scraper && npx vitest run lib/ranking.test.ts
```

Erwartung: FAIL, `Cannot find module './ranking.js'`.

- [ ] **Schritt 3: Die minimale Umsetzung schreiben**

`lib/ranking.ts` mit `bestimmeSicherheitsstufe`. **Reine Funktion:** kein
Supabase, kein Netz, kein `console`, keine Zeit. Die S0-Lückenliste als
benannte Konstante, damit sie nicht an zwei Stellen auseinanderläuft.

- [ ] **Schritt 4: Tests grün sehen**

```bash
cd scraper && npx vitest run lib/ranking.test.ts
```

- [ ] **Schritt 5: Voller Lauf und Commit**

```bash
cd scraper && npx vitest run && npx tsc --noEmit
```

Beide Ausgaben im Bericht zeigen. Dann:

```bash
git add scraper/lib/ranking.ts scraper/lib/ranking.test.ts
git commit -m "feat(ranking): die Sicherheitsstufe haengt am Feld, nicht an der Ableitung"
```

**Abnahme:** `bestimmeSicherheitsstufe` ist eine reine Funktion, die vier
Stufen nach 3.3 vergibt, `living_area_m2 <= 0` unabhängig von `data_gaps` als
S0 wertet, und der DSCR-Identitätstest steht. Keine Zeile Oberfläche, kein
Datenbankzugriff.
