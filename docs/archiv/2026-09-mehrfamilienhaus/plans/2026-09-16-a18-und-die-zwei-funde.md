# A18 und die zwei ungesuchten Funde — Implementierungsplan

> **Für agentische Arbeiter:** VERPFLICHTENDE UNTER-SKILL:
> `superpowers:subagent-driven-development` (empfohlen) oder
> `superpowers:executing-plans`. Schritte tragen Kästchen (`- [ ]`).
> **Jeder Agent wägt zusätzlich selbst ab, welche weitere Superpower zu seiner
> Aufgabe passt, und wendet sie an** — das ist Regel 3 der Arbeitsweise dieses
> Projekts (`UEBERGABE.md`, „Wie in diesem Projekt gearbeitet wird").

**Ziel:** Die vier Befunde am Snapshot-Export (A18) beheben und die zwei
Funde, die beim Bau der Oberfläche nebenbei auffielen, bis zur Entscheidung
bringen — damit das Dashboard auf einem Export steht, der jede Aussage selbst
belegt.

**Architektur:** Alle vier A18-Punkte laufen auf denselben Satz hinaus: **Wer
eine Aussage trifft, liefert ihren Grund und ihre Konstanten mit.** Heute
entscheidet der Export über die Stufe (`bestimmeSicherheitsstufe`), reicht den
Grund aber nicht durch; er kennt den Kaufpreisfaktor, schreibt ihn aber nicht
hin; er kennt Karenz und Meldeschwelle, und die Oberfläche hält deshalb dritte
Kopien. Die Behebung erweitert jeweils den Export, **nie die Oberfläche** —
eine im Frontend nachgebaute Ableitung ist in diesem Projekt ausdrücklich
verboten (Entwurf 5.3, Punkt 4).

**Tech-Stack:** TypeScript, Node 22, vitest (Scraper: `cd scraper && npx vitest run`,
Web: `cd web && npx vitest run`), Supabase-Client nur lesend, React + Vite im
`web/`-Teil.

**Spec:** [`specs/2026-09-09-dashboard-entwurf.md`](../specs/2026-09-09-dashboard-entwurf.md)
Abschnitte 2.3, 3.3, 3.7, 5.3, plus Nachtrag
[`specs/2026-09-15-dashboard-nachtrag-oberflaeche.md`](../specs/2026-09-15-dashboard-nachtrag-oberflaeche.md).
Befundlage: [`BACKLOG.md`](../BACKLOG.md) A18 und A15.

## Global geltende Randbedingungen

- **Kein lokaler Scraper-Lauf.** `lib/nurInCi.ts` bricht ohne `CI` ab. Lesende
  Datenbankabfragen sind erlaubt und laufen lokal (`cd scraper && npx tsx <datei>`);
  der Worktree braucht dafür eine Kopie von `scraper/.env`.
- **Keine Schreibzugriffe auf die Produktionsdatenbank.** Kein `update`, kein
  `insert`, kein `delete` — auch nicht, um „zwei alte Zeilen nachzuziehen".
- **`.github/workflows/` ist für Agenten gesperrt.** Aufgabe 7 gehört dem
  Koordinator, nicht einem Subagenten.
- **Jeder Test wird zuerst rot gesehen.** Ein grüner Test, der nie rot war,
  belegt nichts (`UEBERGABE.md`, „Fallen"). Bei einem Test, der sofort grün
  ist: Produktionscode kurz kaputtmachen, zusehen, ob der Test es merkt,
  zurücknehmen.
- **Fail-closed bleibt fail-closed.** Ein unbekannter Zustand ist `null` oder
  `false`, nie „in Ordnung".
- **Klartext auf Deutsch, Bezeichner auf Deutsch** — wie im umgebenden Code.
- **Commit-Nachrichten mit Prozentzeichen nur über `git commit -F`.**
- **Am Ende jeder Aufgabe:** `cd scraper && npx tsc --noEmit && npx vitest run`
  **und** `cd web && npx tsc --noEmit && npx vitest run && npx vite build`.
  Ausgangslage: 504 Scraper-Tests, 84 Web-Tests grün.

---

## Dateiübersicht

| Datei | Verantwortung | Aufgabe |
|---|---|---|
| `scraper/lib/ranking.ts` | entscheidet als **einzige** Stelle über die Sicherheitsstufe | 1, 2 |
| `scraper/lib/telegram.ts` | führt als **einzige** Stelle die Klartexttabelle `DATA_GAP_LABELS` | 2 |
| `scraper/lib/snapshot.ts` | baut die Exportdatei | 1, 3, 4 |
| `web/src/daten/snapshot.ts` | Zweitschrift der Exporttypen | 3, 4 |
| `web/src/logik/gruende.ts` | fängt fehlende Gründe ab (wird durch Aufgabe 1 teilweise überflüssig) | 1 |
| `web/src/daten/snapshot.vertrag.test.ts` | Wächter gegen einen still veränderten Export | 1, 3, 4 |
| `scraper/scrapers/immowelt/index.ts` | Kommentar an `istRegionVollstaendig` | 5 |
| `scraper/lib/bestandDb.ts` | schreibt `sweep_region_runs` | 6 |
| `.github/workflows/scrape.yml` | veröffentlicht den Snapshot als Artefakt | 7 |

Aufgaben **1+2** und **3+4** fassen jeweils eine Agentenrunde zusammen: Sie
fassen dieselben Stellen an, und getrennte Zweige würden sich am selben
Absatz von `snapshot.ts` in die Quere kommen. **5** und **6** sind davon
unabhängig und laufen gleichzeitig.

---

### Aufgabe 1: Jedes S0-Objekt bringt seinen Grund mit

**Der Befund:** Das ZVG-Objekt `9327fbb0…` (Leverkusen) ist S0, weil die
Wohnfläche fehlt, trägt aber ein leeres `data_gaps` — und damit im Export eine
leere Gründeliste. Entwurf 3.7 verlangt ausdrücklich einen Grund: *„an der
Stelle steht der Grund im Klartext"*. Die Oberfläche schreibt heute
ersatzweise „der Export nennt zu diesem Objekt keinen Grund".

**Warum die Behebung in `ranking.ts` gehört und nicht in den Export:**
`bestimmeSicherheitsstufe` ist die einzige Stelle, die über S0 entscheidet.
Sie kennt den Grund in dem Moment, in dem sie ihn anwendet. Würde der Export
aus `wohnflaecheM2 === null` einen Grund ableiten, gäbe es die Regel zweimal —
genau die Dopplung, die A17 gerade beseitigt hat.

**Dateien:**
- Ändern: `scraper/lib/ranking.ts:54-81` (`bestimmeSicherheitsstufe`)
- Ändern: `scraper/lib/snapshot.ts:618` und `:691` (Feld `datenluecken`)
- Test: `scraper/lib/ranking.test.ts`, `scraper/lib/snapshot.test.ts`
- Ändern: `web/src/logik/gruende.ts` (Kommentar: Befund 2 ist behoben)
- Test: `web/src/daten/snapshot.vertrag.test.ts`

**Schnittstellen:**
- Liefert an Aufgabe 3 und 4: nichts Neues — die Feldnamen bleiben.
- Neu exportiert: `s0Gruende(objekt): string[]` aus `scraper/lib/ranking.ts`.
  Liefert die **Lückencodes** (nicht den Klartext), die S0 begründen, und ein
  leeres Array für jede andere Stufe.

- [ ] **Schritt 1: Den scheiternden Test für `s0Gruende` schreiben**

In `scraper/lib/ranking.test.ts` anfügen:

```ts
describe("s0Gruende nennt den Grund, aus dem S0 entstanden ist (A18)", () => {
  it("nennt wohnflaeche_fehlt, wenn die Flaeche fehlt und data_gaps leer ist", () => {
    // Genau der Befund am ZVG-Objekt 9327fbb0 (Leverkusen, 2026-09-15):
    // S0 wegen des FELDES living_area_m2, ohne Eintrag in data_gaps.
    expect(s0Gruende({ rentSource: "geschaetzt_bundesland", dataGaps: [], livingAreaM2: null }))
      .toEqual(["wohnflaeche_fehlt"]);
  });

  it("nennt die vorhandene S0-Luecke, ohne sie zu verdoppeln", () => {
    expect(
      s0Gruende({ rentSource: "angegeben", dataGaps: ["wohnflaeche_fehlt"], livingAreaM2: null })
    ).toEqual(["wohnflaeche_fehlt"]);
  });

  it("nennt eine unbekannte Mietquelle als eigenen Grund", () => {
    // Der vierte Weg nach S0: rentSource ausserhalb der Aufzaehlung.
    expect(s0Gruende({ rentSource: null, dataGaps: [], livingAreaM2: 80 }))
      .toEqual(["mietquelle_unbekannt"]);
  });

  it("liefert fuer jede andere Stufe eine leere Liste", () => {
    expect(s0Gruende({ rentSource: "angegeben", dataGaps: [], livingAreaM2: 80 })).toEqual([]);
  });

  it("nennt fuer JEDES S0-Objekt mindestens einen Grund", () => {
    // Die eigentliche Zusage. Wer bestimmeSicherheitsstufe um einen
    // fuenften S0-Weg erweitert und s0Gruende vergisst, faellt hier auf.
    const faelle = [
      { rentSource: null, dataGaps: [], livingAreaM2: null },
      { rentSource: "geschaetzt_regional", dataGaps: ["preis_miete_unvereinbar"], livingAreaM2: 80 },
      { rentSource: "unbekannt", dataGaps: [], livingAreaM2: 0 },
      { rentSource: "angegeben", dataGaps: ["rent_estimate_unreliable"], livingAreaM2: 80 },
    ];
    for (const fall of faelle) {
      expect(bestimmeSicherheitsstufe(fall)).toBe("S0");
      expect(s0Gruende(fall).length).toBeGreaterThan(0);
    }
  });
});
```

Der Import oben in der Datei um `s0Gruende` erweitern.

- [ ] **Schritt 2: Test laufen lassen und rot sehen**

Lauf: `cd scraper && npx vitest run lib/ranking.test.ts`
Erwartet: FEHLER, `s0Gruende is not a function` bzw. ein TS-Fehler beim Import.

- [ ] **Schritt 3: `s0Gruende` schreiben**

In `scraper/lib/ranking.ts` direkt hinter `bestimmeSicherheitsstufe` einfügen.
Der neue Code `mietquelle_unbekannt` kommt in Aufgabe 2 in `DATA_GAP_LABELS`;
damit er nicht als roher Code durchschlägt, wird er **in derselben Runde**
beschriftet.

```ts
/** Der vierte Weg nach S0: eine Mietquelle ausserhalb der Aufzaehlung in
 *  Entwurf 3.3. Kein `data_gaps`-Eintrag traegt ihn, er entsteht erst hier. */
export const LUECKE_MIETQUELLE_UNBEKANNT = "mietquelle_unbekannt";

/**
 * Die Lueckencodes, die die S0-Einstufung TRAGEN -- fuer jede andere Stufe
 * leer.
 *
 * WARUM HIER UND NICHT IM EXPORT: `bestimmeSicherheitsstufe` ist die einzige
 * Stelle, die ueber S0 entscheidet, und sie kennt den Grund in dem Moment, in
 * dem sie ihn anwendet. Aus `livingAreaM2 === null` im Export oder gar in der
 * Oberflaeche einen Grund abzuleiten waere eine zweite Kopie derselben Regel
 * (Entwurf 5.3, Punkt 4) -- genau die Dopplung, die A17 beseitigt hat.
 *
 * DIE ZUSAGE: Jedes S0-Objekt bekommt mindestens einen Grund. Entwurf 3.7
 * verlangt ihn ("an der Stelle steht der Grund im Klartext"), und eine leere
 * Zelle saehe aus wie "geprueft und nichts gefunden" -- also wie ein Urteil.
 * Ein Test nagelt das ueber alle vier Wege nach S0 fest.
 */
export function s0Gruende(objekt: {
  rentSource: string | null;
  dataGaps: string[];
  livingAreaM2: number | null;
}): string[] {
  if (bestimmeSicherheitsstufe(objekt) !== "S0") return [];

  const gruende = objekt.dataGaps.filter((luecke) =>
    (S0_LUECKEN as readonly string[]).includes(luecke)
  );

  // Das Feld, nicht die Ableitung: `wohnflaeche_fehlt` gibt es erst seit dem
  // 2026-09-08, aeltere Versionen tragen die Luecke nicht, obwohl ihnen die
  // Flaeche fehlt (siehe Kommentar an `bestimmeSicherheitsstufe`).
  const flaecheFehlt = objekt.livingAreaM2 === null || objekt.livingAreaM2 <= 0;
  if (flaecheFehlt && !gruende.includes("wohnflaeche_fehlt")) {
    gruende.push("wohnflaeche_fehlt");
  }

  // Bleibt nichts uebrig, war die Mietquelle der Grund -- der einzige Weg
  // nach S0, der ohne Luecke und ohne fehlende Flaeche auskommt.
  if (gruende.length === 0) gruende.push(LUECKE_MIETQUELLE_UNBEKANNT);

  return gruende;
}
```

- [ ] **Schritt 4: Test laufen lassen und grün sehen**

Lauf: `cd scraper && npx vitest run lib/ranking.test.ts`
Erwartet: BESTANDEN, alle fünf neuen Fälle.

- [ ] **Schritt 5: Den scheiternden Test am Export schreiben**

In `scraper/lib/snapshot.test.ts` anfügen — der Export muss die Gründe
**verschmelzen**, nicht ersetzen:

```ts
it("gibt jedem S0-Objekt einen Klartext-Grund, auch ohne data_gaps (A18)", () => {
  // Nachbau des ZVG-Objekts 9327fbb0 (Leverkusen): Wohnflaeche fehlt,
  // data_gaps leer.
  const snapshot = baueSnapshot(eingabeMit({ livingAreaM2: null, dataGaps: [] }), JETZT);
  const objekt = snapshot.objekte[0];
  expect(objekt.stufe).toBe("S0");
  expect(objekt.datenluecken).toEqual(["Wohnfläche fehlt"]);
});

it("verdoppelt einen bereits vorhandenen Grund nicht", () => {
  const snapshot = baueSnapshot(
    eingabeMit({ livingAreaM2: null, dataGaps: ["wohnflaeche_fehlt"] }),
    JETZT
  );
  expect(snapshot.objekte[0].datenluecken).toEqual(["Wohnfläche fehlt"]);
});

it("behaelt Luecken, die nicht S0 begruenden", () => {
  // `location_unconfirmed` traegt keine S0-Einstufung, gehoert aber
  // weiterhin in die Liste -- der Export kuerzt keine Auskunft weg.
  const snapshot = baueSnapshot(
    eingabeMit({ livingAreaM2: null, dataGaps: ["location_unconfirmed"] }),
    JETZT
  );
  expect(snapshot.objekte[0].datenluecken).toEqual([
    "Lage (PLZ/Ort) nicht bestätigt",
    "Wohnfläche fehlt",
  ]);
});
```

`eingabeMit` gibt es in dieser Datei noch nicht unter diesem Namen — **vor dem
Schreiben die vorhandenen Hilfsfunktionen in `scraper/lib/snapshot.test.ts`
lesen und die dort übliche benutzen**, statt eine zweite zu bauen.

- [ ] **Schritt 6: Test laufen lassen und rot sehen**

Lauf: `cd scraper && npx vitest run lib/snapshot.test.ts`
Erwartet: FEHLER — `datenluecken` ist `[]` statt `["Wohnfläche fehlt"]`.

- [ ] **Schritt 7: Den Export die Gründe verschmelzen lassen**

In `scraper/lib/snapshot.ts` den Import um `s0Gruende` erweitern und an
**beiden** Rückgabestellen (Zeile ~618 für die Version-lose Zeile, ~691 für
die normale) das Feld ersetzen. Die normale Stelle:

```ts
    // Die S0-Gruende kommen aus `ranking.ts` dazu, damit KEIN S0-Objekt ohne
    // Grund dasteht (Entwurf 3.7, Befund A18-1). `Set` statt Filter: Ein
    // Objekt mit `wohnflaeche_fehlt` in `data_gaps` UND fehlender Flaeche
    // soll den Grund einmal tragen, nicht zweimal. Reihenfolge: erst die
    // gemeldeten Luecken, dann die abgeleiteten -- was in der Datenbank
    // steht, steht zuerst.
    datenluecken: [
      ...new Set([
        ...version.dataGaps,
        ...s0Gruende({
          rentSource: ungenauereMietquelle(version.rentSource, miete.quelle),
          dataGaps: version.dataGaps,
          livingAreaM2: version.livingAreaM2,
        }),
      ]),
    ].map(datenlueckeKlartext),
```

Für die Version-lose Zeile (`version === null`) bleibt
`[datenlueckeKlartext(LUECKE_PREIS_FEHLT)]` **unverändert** — dort ist der
Grund bereits genannt, und `preis_fehlt` ist die richtige Auskunft, nicht
„Wohnfläche fehlt".

- [ ] **Schritt 8: Beide Testdateien laufen lassen und grün sehen**

Lauf: `cd scraper && npx vitest run lib/snapshot.test.ts lib/ranking.test.ts`
Erwartet: BESTANDEN.

- [ ] **Schritt 9: Den Vertragstest der Oberfläche schärfen**

Der Test, der den Befund gemacht hat, darf die Ausnahme jetzt verlieren. In
`web/src/daten/snapshot.vertrag.test.ts` anfügen:

```ts
  it("nennt zu JEDEM S0-Objekt mindestens einen Grund (A18-1)", () => {
    const ohneGrund = snapshot.objekte.filter(
      (o: SnapshotObjekt) => o.stufe === "S0" && o.datenluecken.length === 0
    );
    expect(ohneGrund.map((o: SnapshotObjekt) => o.id)).toEqual([]);
  });
```

- [ ] **Schritt 10: Den Vertragstest gegen eine echte Datei laufen lassen**

**Ohne Snapshot-Datei überspringt dieser Test still** — dann belegt er nichts.
Erst erzeugen (`erzeugeSnapshot` aus `scraper/lib/snapshotDb.ts` über ein
`npx tsx`-Skript, Ziel `web/public/dashboard-snapshot.json`, **nur lesend**),
dann laufen lassen.

Lauf: `cd web && npx vitest run src/daten/snapshot.vertrag.test.ts`
Erwartet: BESTANDEN mit **92** Prüfungen, nicht 84 — die Zahl ist der Beleg,
dass die Datei da war.

- [ ] **Schritt 11: Den Kommentar in `gruende.ts` auf den neuen Stand bringen**

Befund 2 in der Kopfdokumentation von `web/src/logik/gruende.ts` ist behoben.
Die Datei bleibt trotzdem: `OHNE_GENANNTEN_GRUND` ist weiterhin die richtige
Antwort auf einen Export, der die Zusage verletzt. **Den Ersatztext nicht
entfernen** — er ist die Wache, nicht der Befund.

- [ ] **Schritt 12: Vollständige Prüfung und Commit**

```bash
cd scraper && npx tsc --noEmit && npx vitest run
cd ../web && npx tsc --noEmit && npx vitest run && npx vite build
git add scraper/lib/ranking.ts scraper/lib/ranking.test.ts scraper/lib/snapshot.ts scraper/lib/snapshot.test.ts web/src/logik/gruende.ts web/src/daten/snapshot.vertrag.test.ts
git commit -m "fix(snapshot): jedes S0-Objekt traegt seinen Grund (A18-1)"
```

---

### Aufgabe 2: Der alte Lückencode `kaufpreis_unplausibel`

**Der Befund:** `kaufpreis_unplausibel` steht bei 2 Objekten in `data_gaps`,
hat aber keinen Eintrag in `DATA_GAP_LABELS` und landet deshalb als roher
Maschinencode in der Anzeige. Es ist der **alte Name**; A9 hat ihn in
`preis_miete_unvereinbar` umbenannt, weil er eine Behauptung aufstellte, die
die Messung nicht deckt.

**Was beim Schreiben dieses Plans zusätzlich auffiel — und schwerer wiegt als
der fehlende Klartext:** `S0_LUECKEN` (`scraper/lib/ranking.ts:28`) kennt nur
den **neuen** Namen. Die beiden Altzeilen lösen die S0-Einstufung über ihre
Lücke also **gar nicht aus**. Sie landen nur dann in S0, wenn ihnen zufällig
auch die Wohnfläche fehlt. Ein Objekt, dessen Preis und Miete nachweislich
unvereinbar sind, bekommt damit eine Rangzahl, die auf genau dieser
unvereinbaren Zahl beruht. **Das ist der eigentliche Fund, nicht der
Klartext.**

**Die Entscheidung, hier getroffen und begründet:** Der **Export übersetzt**,
die Daten bleiben unangetastet. Ein `update` auf zwei Produktionszeilen wäre
ein Schreibzugriff und damit eine Nutzerentscheidung — und er löste das
Problem nur für diese zwei Zeilen, nicht für die nächste Umbenennung. Eine
Aliastabelle löst es dauerhaft und ist rückgängig zu machen.

**Dateien:**
- Ändern: `scraper/lib/telegram.ts:55-68` (`DATA_GAP_LABELS`)
- Ändern: `scraper/lib/ranking.ts:28` (`S0_LUECKEN`)
- Test: `scraper/lib/telegram.test.ts`, `scraper/lib/ranking.test.ts`
- Ändern: `web/src/logik/gruende.ts`, `web/src/logik/gruende.test.ts` (Kommentar
  und Testbegründung — der Fall bleibt als Wache, ist aber kein echter Befund mehr)

**Schnittstellen:**
- Verbraucht aus Aufgabe 1: `LUECKE_MIETQUELLE_UNBEKANNT` aus
  `scraper/lib/ranking.ts` — dieser Code braucht in derselben Runde eine Zeile
  in `DATA_GAP_LABELS`, sonst schlägt er als roher Code durch.
- Liefert: nichts Neues nach außen.

- [ ] **Schritt 1: Den scheiternden Test für die Übersetzung schreiben**

In `scraper/lib/telegram.test.ts` anfügen:

```ts
describe("Altcodes tragen denselben Klartext wie ihr heutiger Name (A18-2)", () => {
  it("uebersetzt kaufpreis_unplausibel wie preis_miete_unvereinbar", () => {
    // 2 Objekte im Bestand (Messung 2026-09-15) tragen den Namen von vor der
    // A9-Umbenennung. Der Export uebersetzt, statt die Daten anzufassen.
    expect(datenlueckeKlartext("kaufpreis_unplausibel")).toBe(
      datenlueckeKlartext("preis_miete_unvereinbar")
    );
  });

  it("beschriftet mietquelle_unbekannt", () => {
    expect(datenlueckeKlartext("mietquelle_unbekannt")).not.toBe("mietquelle_unbekannt");
  });
});
```

- [ ] **Schritt 2: Test laufen lassen und rot sehen**

Lauf: `cd scraper && npx vitest run lib/telegram.test.ts`
Erwartet: FEHLER — `"kaufpreis_unplausibel"` statt des Klartextes.

- [ ] **Schritt 3: Die beiden Zeilen ergänzen**

In `scraper/lib/telegram.ts`, in `DATA_GAP_LABELS`:

```ts
  preis_miete_unvereinbar: "Preis und Miete unvereinbar — eine der beiden Zahlen stimmt nicht",
  // ALTNAME, nicht doppelter Begriff: A9 hat `kaufpreis_unplausibel` in
  // `preis_miete_unvereinbar` umbenannt, weil der alte Name eine Ursache
  // behauptete, die die Messung nicht deckt. 2 Zeilen im Bestand stammen von
  // davor. Der Export uebersetzt sie, statt Produktionsdaten zu aendern --
  // das waere ein Schreibzugriff und loeste nur diese zwei Zeilen.
  kaufpreis_unplausibel: "Preis und Miete unvereinbar — eine der beiden Zahlen stimmt nicht",
  // Entsteht nicht in `data_gaps`, sondern in `s0Gruende` (A18-1): eine
  // Mietquelle ausserhalb der Aufzaehlung aus Entwurf 3.3.
  mietquelle_unbekannt: "Mietquelle unbekannt — die Miete ist nicht einzuordnen",
```

**Die beiden Texte müssen zeichengleich sein** — der Test vergleicht sie
gegeneinander, nicht gegen ein Literal.

- [ ] **Schritt 4: Test laufen lassen und grün sehen**

Lauf: `cd scraper && npx vitest run lib/telegram.test.ts`
Erwartet: BESTANDEN.

- [ ] **Schritt 5: Den scheiternden Test für die S0-Einstufung schreiben**

Das ist der schwerere Teil. In `scraper/lib/ranking.test.ts`:

```ts
it("stuft den Altnamen kaufpreis_unplausibel genauso auf S0 wie den heutigen (A18-2)", () => {
  // Ohne diesen Eintrag bekommen die 2 Altzeilen eine Rangzahl, die auf
  // genau der Zahl beruht, die als unvereinbar gemeldet wurde.
  const objekt = { rentSource: "angegeben", dataGaps: ["kaufpreis_unplausibel"], livingAreaM2: 80 };
  expect(bestimmeSicherheitsstufe(objekt)).toBe("S0");
  expect(s0Gruende(objekt)).toEqual(["kaufpreis_unplausibel"]);
});
```

- [ ] **Schritt 6: Test laufen lassen und rot sehen**

Lauf: `cd scraper && npx vitest run lib/ranking.test.ts`
Erwartet: FEHLER — `"S3"` statt `"S0"`.

- [ ] **Schritt 7: `S0_LUECKEN` um den Altnamen erweitern**

In `scraper/lib/ranking.ts:28`:

```ts
const S0_LUECKEN = [
  "wohnflaeche_fehlt",
  "preis_miete_unvereinbar",
  // ALTNAME desselben Befunds (A9-Umbenennung, 2 Zeilen im Bestand). Er
  // gehoert hierher und nicht nur in die Klartexttabelle: Ohne ihn traegt
  // ein Objekt mit nachweislich unvereinbaren Zahlen eine Rangzahl, die
  // genau auf diesen Zahlen beruht.
  "kaufpreis_unplausibel",
  "rent_estimate_unreliable",
] as const;
```

- [ ] **Schritt 8: Test laufen lassen und grün sehen**

Lauf: `cd scraper && npx vitest run lib/ranking.test.ts lib/telegram.test.ts`
Erwartet: BESTANDEN.

- [ ] **Schritt 9: Den Web-Test auf seine neue Rolle umstellen**

`web/src/logik/gruende.test.ts:47-53` prüft heute an `kaufpreis_unplausibel`,
dass ein **unbeschrifteter** Code als solcher gekennzeichnet wird. Dieser Code
ist jetzt beschriftet — der Test würde also am falschen Beispiel weiterlaufen.
Das Beispiel gegen einen erfundenen Code tauschen (`irgendein_neuer_code`) und
im Kommentar festhalten, **warum** es jetzt ein erfundener ist: Die Wache
bleibt, ihr Anlass ist behoben.

- [ ] **Schritt 10: Vollständige Prüfung, A18 im Backlog abhaken, Commit**

In `docs/superpowers/BACKLOG.md` die Punkte 1 und 2 von A18 auf `[x]` setzen
und die Begründung der Entscheidung („Export übersetzt, Daten unberührt")
sowie den neuen Fund zu `S0_LUECKEN` dort festhalten — **Befunde gehören ins
Repo, nicht in den Chat.**

```bash
cd scraper && npx tsc --noEmit && npx vitest run
cd ../web && npx tsc --noEmit && npx vitest run && npx vite build
git add -A && git commit -F <nachrichtendatei>
```

---

### Aufgabe 3: Der Kaufpreisfaktor gehört in den Snapshot

**Der Befund:** Entwurf **2.3** sieht den Kaufpreisfaktor „daneben als zweite
Zahl" vor. Der Export **rechnet ihn bereits** (`scraper/lib/snapshot.ts:~668`,
für `bestimmeTrefferklasse`) und wirft ihn dann weg. Die Oberfläche zeigt
ersatzweise €/m².

**Dateien:**
- Ändern: `scraper/lib/snapshot.ts` (Feld an `SnapshotObjekt`, Zuweisung an beiden Rückgabestellen)
- Ändern: `web/src/daten/snapshot.ts:37-67` (`SnapshotObjekt`)
- Ändern: `web/src/ui/Objektzeile.tsx`
- Test: `scraper/lib/snapshot.test.ts`, `web/src/daten/snapshot.vertrag.test.ts`

**Schnittstellen:**
- Produziert: `kaufpreisfaktor: number | null` an `SnapshotObjekt`, in
  **beiden** Typdateien gleich benannt. `null` bei S0 — dort wäre die Miete 0
  und der Faktor `Infinity`.

- [ ] **Schritt 1: Den scheiternden Test schreiben**

In `scraper/lib/snapshot.test.ts`:

```ts
it("traegt den Kaufpreisfaktor am Objekt (Entwurf 2.3, A18-3)", () => {
  const snapshot = baueSnapshot(eingabeMit({ livingAreaM2: 80 }), JETZT);
  const objekt = snapshot.objekte[0];
  expect(objekt.kaufpreisfaktor).toBeTypeOf("number");
  expect(Number.isFinite(objekt.kaufpreisfaktor)).toBe(true);
});

it("laesst den Kaufpreisfaktor bei S0 leer, statt Infinity zu schreiben", () => {
  const snapshot = baueSnapshot(eingabeMit({ livingAreaM2: null }), JETZT);
  expect(snapshot.objekte[0].stufe).toBe("S0");
  expect(snapshot.objekte[0].kaufpreisfaktor).toBeNull();
});
```

- [ ] **Schritt 2: Test laufen lassen und rot sehen**

Lauf: `cd scraper && npx vitest run lib/snapshot.test.ts`
Erwartet: FEHLER — TS kennt das Feld nicht.

- [ ] **Schritt 3: Das Feld anlegen und zuweisen**

In `scraper/lib/snapshot.ts` an die Objekt-Schnittstelle (bei `rangzahl`):

```ts
  /**
   * Kaufpreisfaktor, die zweite Zahl neben dem DSCR (Entwurf 2.3).
   *
   * `null` bei S0: Dort ist die Miete 0 und der Faktor `Infinity` -- und ein
   * `Infinity` ueberlebt `JSON.stringify` als `null` ohnehin nicht. Lieber
   * ein ausdrueckliches `null` als eine Zahl, die unterwegs kippt.
   */
  kaufpreisfaktor: number | null;
```

Die Variable `kaufpreisfaktor` existiert an der normalen Rückgabestelle
bereits — nur ins Rückgabeobjekt aufnehmen. An der Version-losen Stelle
`kaufpreisfaktor: null`.

- [ ] **Schritt 4: Test laufen lassen und grün sehen**

Lauf: `cd scraper && npx vitest run lib/snapshot.test.ts`
Erwartet: BESTANDEN.

- [ ] **Schritt 5: Die Zweitschrift der Typen nachziehen**

`web/src/daten/snapshot.ts`, in `SnapshotObjekt` hinter `rangzahl`, mit
demselben Kommentar in Kurzform. **Kein zweiter Rechenweg** — das Feld wird
gelesen, nie gerechnet.

- [ ] **Schritt 6: Den Vertragstest erweitern**

In `web/src/daten/snapshot.vertrag.test.ts`, bei den übrigen Feldprüfungen:

```ts
    expect(istZahlOderNull(objekt.kaufpreisfaktor)).toBe(true);
    if (objekt.stufe === "S0") expect(objekt.kaufpreisfaktor).toBeNull();
```

- [ ] **Schritt 7: Die Zahl anzeigen**

In `web/src/ui/Objektzeile.tsx` den Kaufpreisfaktor **neben** den DSCR setzen —
€/m² bleibt, es ist die dritte nützliche Zahl und kostet nichts.

**Wo der Test hingehört:** `web/` hat bewusst **keine** Komponententests und
kein `@testing-library/react` — die Logik liegt in `web/src/logik/`, und die
ist getestet. Kein Testframework nachrüsten, um eine Zahl zu prüfen. Also:

1. Braucht die Anzeige eine Formatierung, die `web/src/logik/formate.ts` noch
   nicht hat (Faktor als `24,3×`), **dort** hinzufügen, mit einem zuerst rot
   gesehenen Test in `formate.test.ts` — samt der Grenzfälle `null` und einer
   sehr großen Zahl.
2. Gibt es eine passende Funktion schon, **keine zweite bauen**.
3. Die gerenderte Zeile im Browser ansehen (`cd web && npx vite`) — so ist die
   Oberfläche auch beim Bau abgenommen worden, nicht nur durch Tests.

- [ ] **Schritt 8: Vollständige Prüfung und Commit**

```bash
cd scraper && npx tsc --noEmit && npx vitest run
cd ../web && npx tsc --noEmit && npx vitest run && npx vite build
git add -A && git commit -m "feat(snapshot): Kaufpreisfaktor am Objekt (A18-3)"
```

---

### Aufgabe 4: Karenz und Meldeschwelle aus dem Snapshot statt als dritte Kopie

**Der Befund:** `web/src/daten/snapshot.ts` führt `KARENZ_TAGE = 2` und
`DSCR_MELDESCHWELLE_ANZEIGE = 1.3` als Anzeigekonstanten. Beide sind
kommentiert und die Oberfläche rechnet damit keine Schwelle nach — formal ist
es trotzdem dasselbe Muster, das A17 gerade beseitigt hat. Der saubere Weg ist
ein Feld im Snapshot.

**Dateien:**
- Ändern: `scraper/lib/snapshot.ts` (neuer Ast `konstanten` am Snapshot)
- Ändern: `web/src/daten/snapshot.ts` (Typ, und die beiden Konstanten entfernen)
- Ändern: `web/src/logik/gliederung.ts`, `web/src/ui/Bandstreifen.tsx` (Herkunft der Zahl)
- Test: `scraper/lib/snapshot.test.ts`, `web/src/daten/snapshot.vertrag.test.ts`,
  `web/src/logik/gliederung.test.ts`

**Schnittstellen:**
- Verbraucht aus Aufgabe 3: nichts — beide Aufgaben fassen `snapshot.ts` an,
  aber an verschiedenen Stellen (Objektfeld gegen Wurzelast).
- Produziert: ein **siebter** Ast am Snapshot:

```ts
konstanten: { karenzTage: number; dscrMeldeschwelle: number };
```

**Achtung:** Der Vertragstest prüft heute wörtlich „die **sechs** Äste des
Dateiformats aus N4". Diese Zusage ändert sich — der Test muss mitgeändert
werden, und zwar sichtbar, nicht beiläufig.

- [ ] **Schritt 1: Den scheiternden Test schreiben**

In `scraper/lib/snapshot.test.ts`:

```ts
it("liefert Karenz und Meldeschwelle mit, statt sie der Oberflaeche zu ueberlassen (A18-4)", () => {
  const snapshot = baueSnapshot(eingabeMinimal(), JETZT);
  // Gegen die Quellen geprueft, nicht gegen Literale: Aendert jemand
  // KARENZ_TAGE, muss der Snapshot mitgehen -- genau darum geht es.
  expect(snapshot.konstanten.karenzTage).toBe(KARENZ_TAGE);
  expect(snapshot.konstanten.dscrMeldeschwelle).toBe(DSCR_MELDESCHWELLE);
});
```

- [ ] **Schritt 2: Test laufen lassen und rot sehen**

Lauf: `cd scraper && npx vitest run lib/snapshot.test.ts`
Erwartet: FEHLER — `konstanten` gibt es nicht.

- [ ] **Schritt 3: Den Ast anlegen**

In `scraper/lib/snapshot.ts`: `KARENZ_TAGE` aus `./bestand.js` importieren
(`DSCR_MELDESCHWELLE` ist bereits importiert) und am Snapshot ergänzen:

```ts
  /**
   * Zahlen, die die Oberflaeche zum ZEICHNEN braucht und deshalb sonst
   * abschreiben muesste (A18-4).
   *
   * Sie stehen hier, damit es sie EINMAL gibt. `web/` fuehrte beide als
   * eigene Konstanten -- kommentiert und ohne Nachrechnen, aber formal
   * dieselbe Dopplung, die A17 beseitigt hat: Aendert sich die Meldeschwelle,
   * bricht die andere Kopie lautlos.
   *
   * Sie sind ausdruecklich KEINE Einladung zum Nachrechnen. Ueber die
   * Trefferklasse entscheidet der Export (`bestimmeTrefferklasse`), nicht die
   * Oberflaeche (Entwurf 5.3, Punkt 4).
   */
  konstanten: { karenzTage: number; dscrMeldeschwelle: number };
```

Und in `baueSnapshot`:

```ts
    konstanten: { karenzTage: KARENZ_TAGE, dscrMeldeschwelle: DSCR_MELDESCHWELLE },
```

- [ ] **Schritt 4: Test laufen lassen und grün sehen**

Lauf: `cd scraper && npx vitest run lib/snapshot.test.ts`
Erwartet: BESTANDEN.

- [ ] **Schritt 5: Die Oberfläche auf die gelieferte Zahl umstellen**

In `web/src/daten/snapshot.ts` den Typ ergänzen und die beiden Konstanten
`KARENZ_TAGE` und `DSCR_MELDESCHWELLE_ANZEIGE` **entfernen**. `tsc` zeigt
danach jede Fundstelle. `gliederung.ts` und `Bandstreifen.tsx` bekommen die
Zahl als Argument bzw. Property durchgereicht — **nicht** über einen globalen
Zugriff auf den Snapshot: Beide sind heute reine Funktionen, und das sollen sie
bleiben.

- [ ] **Schritt 6: Den Vertragstest auf sieben Äste stellen**

```ts
  it("traegt die sieben Aeste des Dateiformats (N4 plus konstanten, A18-4)", () => {
    // ... die sechs bisherigen ...
    expect(snapshot.konstanten).toBeTypeOf("object");
    expect(snapshot.konstanten.karenzTage).toBeTypeOf("number");
    expect(snapshot.konstanten.dscrMeldeschwelle).toBeTypeOf("number");
  });
```

- [ ] **Schritt 7: Die Web-Tests nachziehen und grün sehen**

`gliederung.test.ts` übergibt die Karenz jetzt als Argument. **Genau hier
zuerst rot sehen** — der Test war vorher grün und darf es nicht aus Versehen
bleiben.

Lauf: `cd web && npx vitest run`
Erwartet: BESTANDEN.

- [ ] **Schritt 8: Vollständige Prüfung, Neuerzeugung, Commit**

Die Snapshot-Datei ist jetzt formatverschieden. Vor dem Vertragstest neu
erzeugen, sonst prüft er die alte Datei und meldet grün für nichts.

```bash
cd scraper && npx tsc --noEmit && npx vitest run
cd ../web && npx tsc --noEmit && npx vitest run && npx vite build
git add -A && git commit -m "refactor(snapshot): Karenz und Meldeschwelle kommen aus dem Export (A18-4)"
```

---

### Aufgabe 5: `sh` ist die vierte Region ohne Abgangserkennung

**Der Befund (zweimal unabhängig gemessen, 2026-09-15):** Schleswig-Holstein
weist seine Trefferzahl nirgends aus — genau wie `nw`, `bw` und `mv`. Aus
**vier** Regionen wird also nie ein Abgang erkannt. A15 und der lange Kommentar
an `istRegionVollstaendig` kennen nur drei.

**Was hier NICHT zu tun ist:** Die Liste irgendwo hinschreiben.
`schaetzeRegionsKadenzen` leitet die Menge bewusst aus den Daten ab
(`scraper/lib/snapshot.ts:265-275`), und der Grund steht dort: *„Eine Liste
`["nw","bw","mv"]` wäre schon beim Schreiben veraltet gewesen."* Diese Aufgabe
zieht die **Dokumentation** nach, nicht den Code.

**Dateien:**
- Ändern: `scraper/scrapers/immowelt/index.ts` (Kommentar an `istRegionVollstaendig`)
- Ändern: `docs/superpowers/BACKLOG.md` (A15)
- Neu: ein Messskript unter `scraper/scripts/` oder im Scratchpad — **lesend**

- [ ] **Schritt 1: Selbst messen, statt der Doku zu glauben**

Eine Prämisse im Auftrag kann veraltet sein (`UEBERGABE.md`). Also erst
messen. Lesendes `npx tsx`-Skript gegen `sweep_region_runs`:

```ts
// Welche Immowelt-Region hat je eine Zeile MIT gemeldete_treffer?
const { data } = await sb
  .from("sweep_region_runs")
  .select("partition, gemeldete_treffer, vollstaendig, started_at")
  .eq("source", "immowelt")
  .order("started_at", { ascending: false })
  .limit(2000);
```

Auszählen je `partition`: Zeilen gesamt, Zeilen mit `gemeldete_treffer !== null`,
Zeilen mit `vollstaendig === true`. **Zwischenausgaben schreiben** — ein
minutenlang stilles Kommando wird vom Watchdog abgeräumt.

Erwartet wird, dass `nw`, `bw`, `mv` und `sh` null Zeilen mit Trefferzahl
tragen. **Weicht das Ergebnis ab, gilt das Ergebnis, nicht dieser Plan** — dann
den Befund festhalten und den Koordinator fragen.

- [ ] **Schritt 2: Das Messergebnis ins Repo schreiben**

Eine kurze Spec unter
`docs/superpowers/specs/2026-09-16-regionen-ohne-trefferzahl.md`: die Abfrage,
die Tabelle je Region, das Datum, die Zeilenzahl der Grundgesamtheit.
Momentaufnahmen als solche kennzeichnen. **Was nur im Chat steht, stirbt mit
der Sitzung.**

- [ ] **Schritt 3: Den Kommentar an `istRegionVollstaendig` berichtigen**

In `scraper/scrapers/immowelt/index.ts`, im Absatz zu `gemeldet === null`:
statt „ausgerechnet für `nw`, `bw` und `mv`" die **vier** Regionen nennen, mit
Datum der Messung und dem Hinweis, dass die Menge aus den Daten abgeleitet und
nirgends im Code aufgezählt wird. Die Zahl „5 von 21 Regionsläufen" stammt vom
2026-09-09 — entweder aus Schritt 1 neu belegen oder ausdrücklich als Stand
vom 2026-09-09 kennzeichnen.

- [ ] **Schritt 4: A15 im Backlog nachziehen**

Der Befund „die Zahl steht nicht da" gilt für vier Regionen. Ergänzen, auf die
neue Spec verweisen, und die Folge für **A16** und **B1** benennen: Der zweite
Vollständigkeitsmaßstab braucht jetzt einen Bestand mehr, als A16 annimmt.

- [ ] **Schritt 5: Prüfen, dass kein Test an der Dreizahl hing**

```bash
cd scraper && grep -rn '"mv"' --include=*.test.ts . | head
npx tsc --noEmit && npx vitest run
```

- [ ] **Schritt 6: Commit**

```bash
git add -A && git commit -F <nachrichtendatei>
```

---

### Aufgabe 6: `vollstaendig=true` ohne `gemeldete_treffer`

**Der Befund:** `sweep_region_runs` trägt mehrfach `vollstaendig=true`,
obwohl `gemeldete_treffer` fehlt. Das ist die Wache vor der Massenlöschung —
sie gehört nachgeprüft.

**Die naheliegende Erklärung, die trotzdem zu belegen ist:**
`istRegionVollstaendig` gibt seit dem 2026-09-09 bei `gemeldet === null`
`false` zurück. Vorher stand dort `true`. Die Zeilen könnten also schlicht aus
der Zeit davor stammen. `scraper/lib/snapshot.ts:270` **behauptet genau das**
(„Ihre `vollstaendig`-Zeilen stammen alle vom 2026-09-08/09"). **Belegt ist es
nicht** — und wenn es nicht stimmt, schreibt heute ein Lauf eine
Vollständigkeitsaussage ohne Maßstab.

**Warum das ernst ist:** `schaetzeRegionsKadenzen` zählt genau diese Zeilen.
Aus drei Altzeilen bekäme `nw` eine Kadenz von 0,44 Tagen, und der ganze
NRW-Bestand hieße „verfügbar" — aus einer Region, aus der nie ein Abgang
erkannt wird. Die Aktualitätsprobe fängt das heute ab. **Sie ist die zweite
Verteidigungslinie, nicht die erste.**

**Dateien:**
- Neu: ein lesendes Messskript
- Neu: `docs/superpowers/specs/2026-09-16-vollstaendig-ohne-trefferzahl.md`
- Möglicherweise ändern: `scraper/lib/bestandDb.ts:286-294` (`regionsLaufZeile`)
- Möglicherweise ändern: `docs/superpowers/BACKLOG.md` (neuer Punkt A19)

- [ ] **Schritt 1: Das Alter der betroffenen Zeilen messen**

```ts
const { data } = await sb
  .from("sweep_region_runs")
  .select("partition, gemeldete_treffer, vollstaendig, started_at")
  .eq("source", "immowelt")
  .is("gemeldete_treffer", null)
  .eq("vollstaendig", true)
  .order("started_at", { ascending: false })
  .limit(1000);
```

**Die entscheidende Zahl ist die jüngste `started_at`.** Liegt sie vor dem
2026-09-09, ist der Befund Altlast. Liegt eine danach, schreibt der laufende
Code eine unbelegte Vollständigkeit — dann ist es ein offener Fehler und hat
Vorrang vor allem anderen in diesem Plan.

- [ ] **Schritt 2: Das Ergebnis ins Repo schreiben, bevor irgendetwas geändert wird**

Die Spec anlegen: Abfrage, Zeilenzahl, jüngstes und ältestes `started_at`,
Verteilung je Region, und die Schlussfolgerung in einem Satz. **Befunde
gehören ins Repo, sobald sie feststehen.**

- [ ] **Schritt 3a: Wenn alle Zeilen alt sind — die Wache gegen Wiederkehr bauen**

Ein Test, der festhält, dass die Zeile diese Kombination gar nicht erst bilden
kann. In `scraper/lib/bestandDb.test.ts`:

```ts
it("schreibt nie vollstaendig=true ohne gemeldete Trefferzahl", () => {
  // Der Befund vom 2026-09-15: solche Zeilen stehen in der Datenbank. Sie
  // stammen von vor der Fail-closed-Umstellung (2026-09-09, belegt in
  // specs/2026-09-16-vollstaendig-ohne-trefferzahl.md). Dieser Test haelt
  // fest, dass sie nicht wiederkommen koennen -- die Kombination ist in
  // sich widerspruechlich: "vollstaendig" ohne Massstab.
  const zeile = regionsLaufZeile("immowelt", {
    partition: "nw",
    gesehene: 1160,
    gemeldeteTreffer: null,
    vollstaendig: true,
  });
  expect(zeile.vollstaendig).toBe(false);
});
```

Zuerst rot sehen, dann in `regionsLaufZeile` schließen:

```ts
export function regionsLaufZeile(source: string, lauf: RegionLauf): Record<string, unknown> {
  return {
    source,
    partition: lauf.partition,
    gesehene_objekte: lauf.gesehene,
    gemeldete_treffer: lauf.gemeldeteTreffer,
    // Fail-closed an der SCHREIBSTELLE, nicht nur beim Rechnen. Ohne
    // Trefferzahl gibt es keinen Massstab, an dem Vollstaendigkeit zu messen
    // waere -- die Kombination ist in sich widerspruechlich. Heute kann
    // `istRegionVollstaendig` sie nicht mehr erzeugen (seit 2026-09-09); dies
    // ist die zweite Sperre, damit ein kuenftiger zweiter Massstab (A16) sie
    // nicht versehentlich wieder oeffnet.
    vollstaendig: lauf.gemeldeteTreffer === null ? false : lauf.vollstaendig,
  };
}
```

**Vorher prüfen, ob A16 das später bewusst braucht.** A16 will einen zweiten
Maßstab für Regionen ohne ausgewiesene Menge — der müsste diese Sperre dann
ausdrücklich aufheben. Das ist der Sinn: Er soll es **ausdrücklich** tun
müssen. Diese Abwägung gehört in den Kommentar und in A16.

- [ ] **Schritt 3b: Wenn eine Zeile jünger als der 2026-09-09 ist — Ursache suchen**

Dann nicht abdichten, sondern `superpowers:systematic-debugging` anwenden:
Welcher Pfad schreibt `vollstaendig: true` an `regionsLaufZeile` vorbei? Kandidaten
sind der `catch`-Zweig in `scrapers/immowelt/index.ts:552-562` (schreibt
`false`, also unverdächtig) und jeder andere Aufrufer von
`speichereRegionsLaeufe`. **Den Befund melden, bevor eine Zeile Code fällt.**

- [ ] **Schritt 4: Die Behauptung in `snapshot.ts` belegen oder berichtigen**

`scraper/lib/snapshot.ts:270-273` behauptet, alle betroffenen Zeilen stammten
vom 2026-09-08/09. Nach Schritt 1 ist das entweder belegt (dann die Messung
und ihr Datum dort nennen) oder widerlegt (dann den Absatz umschreiben).
**Zwei Stände nebeneinander sind schlimmer als ein falscher.**

- [ ] **Schritt 5: Vollständige Prüfung und Commit**

```bash
cd scraper && npx tsc --noEmit && npx vitest run
git add -A && git commit -F <nachrichtendatei>
```

---

### Aufgabe 7: Der Snapshot fällt aus dem Lauf heraus (CI-Artefakt)

> **Diese Aufgabe gehört dem Koordinator, nicht einem Subagenten.**
> `.github/workflows/` ist ohne Freigabe des Nutzers gesperrt, und ein
> kaputter Workflow legt die Produktion still.

**Die Lage:** Der Export läuft am Ende jedes Laufs und schreibt nach
`scraper/snapshot/dashboard-snapshot.json` (`SNAPSHOT_STANDARD_PFAD`,
überschreibbar über die Umgebungsvariable `SNAPSHOT_PFAD`). Der Pfad wurde
ausdrücklich so gebaut, *„damit die spätere Veröffentlichung als CI-Artefakt
den Ort setzen kann"*. Es fehlt genau ein Schritt im Workflow.

**Dateien:**
- Ändern: `.github/workflows/scrape.yml` (ein Schritt am Ende des Jobs)

- [ ] **Schritt 1: Den Schritt anhängen**

```yaml
      # Der Snapshot ist ein Nebenprodukt des Laufs (scraper/main.ts, ganz am
      # Ende, nur lesend). `if: always()` weil er auch dann brauchbar ist,
      # wenn ein spaeterer Schritt scheitert -- und `if-no-files-found: warn`,
      # weil ein fehlender Snapshot einen sonst erfolgreichen Lauf nicht rot
      # faerben darf: Alles Wesentliche steht bereits in der Datenbank.
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: dashboard-snapshot
          path: scraper/snapshot/dashboard-snapshot.json
          if-no-files-found: warn
          retention-days: 7
```

- [ ] **Schritt 2: Vor dem Push gegen die Syntax prüfen**

Ein kaputter Workflow ist der teuerste Fehler dieser Aufgabe. Vor dem Push:
YAML parsen (`npx js-yaml .github/workflows/scrape.yml` oder `python -c`),
danach nach dem Push `gh run list --workflow=scrape.yml --limit 3`.

- [ ] **Schritt 3: An einem echten Lauf belegen**

`gh workflow run scrape.yml --ref main`, dann warten und das Artefakt am Lauf
nachweisen — **Größe und Objektzahl gegen die Logzeile `Snapshot geschrieben:`
gegenprüfen.** Dieses Projekt belegt Abnahmen an echten Läufen, nicht an Tests.

- [ ] **Schritt 4: Commit und Push**

```bash
git add .github/workflows/scrape.yml
git commit -m "ci(scrape): Snapshot als Artefakt veroeffentlichen"
```

---

## Was dieser Plan bewusst nicht enthält

- **Cloudflare Pages und Access** (E-8). Braucht Zugänge, die nur der Nutzer
  hat. Sobald Aufgabe 7 steht, ist der Snapshot abholbar und die
  Veröffentlichung ist eine reine Einrichtungsfrage.
- **A10 Schritt 1** (dichterer Cron). Ausdrücklich eine Abwägung des Nutzers:
  mehr Abrufe bei Immowelt gegen 43 % ausgefallene Termine.
- **A17, letzter Punkt.** Ohne den Originalbericht der Gesamtprüfung nicht
  bearbeitbar; der Ledger ist git-ignoriert.
- **A11 Schritt 3/4, B3, B4.** Zurückgestellt, Begründung in
  `specs/2026-09-09-offene-entscheidungen.md`.
- **B1.** Braucht erst einen Entwurf, und Aufgabe 5 verschiebt seine
  Grundlage — vier Regionen statt drei.
