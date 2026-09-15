import { describe, expect, it } from "vitest";
import type { SnapshotObjekt } from "../daten/snapshot.ts";
import { bestimmeBereich, gliedere, sortierschluessel } from "./gliederung.ts";

const JETZT = new Date("2026-09-15T12:00:00Z");

function objekt(teil: Partial<SnapshotObjekt> = {}): SnapshotObjekt {
  return {
    id: "a",
    quelle: "immowelt",
    url: null,
    titel: null,
    ort: null,
    bundesland: "Sachsen",
    plz: null,
    kaufpreisEuro: 100000,
    wohnflaecheM2: 100,
    grundstueckM2: null,
    baujahr: null,
    einheiten: null,
    einheitenAngenommen: true,
    stufe: "S1",
    trefferklasse: "normal",
    rangzahl: 1,
    band: { unten: 0.8, oben: 1.4 },
    istSchwellenwechsler: false,
    zustand: "verfuegbar",
    datenluecken: [],
    preisGesenkt: false,
    zuletztGesehen: "2026-09-15T00:00:00Z",
    abgaengigSeit: null,
    termin: null,
    ...teil,
  };
}

describe("bestimmeBereich -- N1 plus die Karenzgrenze aus 6.4", () => {
  it("ordnet nach Trefferklasse, nicht nach Sicherheitsstufe", () => {
    expect(bestimmeBereich(objekt({ trefferklasse: "top", stufe: "S1" }), JETZT)).toBe("top");
    expect(bestimmeBereich(objekt({ trefferklasse: "normal", stufe: "S3" }), JETZT)).toBe("normal");
    expect(
      bestimmeBereich(objekt({ trefferklasse: "nichtBeurteilbar", stufe: "S0" }), JETZT)
    ).toBe("nichtBeurteilbar");
  });

  it("laesst ein abgaengiges Objekt WAEHREND der Karenz an seiner Rangposition (6.4)", () => {
    const geradeEben = objekt({
      trefferklasse: "top",
      abgaengigSeit: "2026-09-14T12:00:00Z", // 1 Tag her, Karenz sind 2
      zustand: "abgaengig",
    });
    expect(bestimmeBereich(geradeEben, JETZT)).toBe("top");
  });

  it("schiebt es NACH der Karenz in den Bereich Abgaenge (6.4)", () => {
    const laengerWeg = objekt({
      trefferklasse: "top",
      abgaengigSeit: "2026-09-10T12:00:00Z", // 5 Tage her
      zustand: "abgaengig",
    });
    expect(bestimmeBereich(laengerWeg, JETZT)).toBe("abgaenge");
  });

  it("zieht die Karenzgrenze genau bei zwei Tagen", () => {
    const knappDrin = objekt({ abgaengigSeit: "2026-09-13T12:00:01Z" });
    const knappDraussen = objekt({ abgaengigSeit: "2026-09-13T11:59:59Z" });
    expect(bestimmeBereich(knappDrin, JETZT)).toBe("normal");
    expect(bestimmeBereich(knappDraussen, JETZT)).toBe("abgaenge");
  });

  it("behandelt ein unlesbares Abgangsdatum als Abgang und nie als verfuegbar", () => {
    // Fail-closed: Was sich nicht datieren laesst, darf nicht durch die
    // Karenzpruefung zurueck in die Rangliste rutschen.
    expect(bestimmeBereich(objekt({ abgaengigSeit: "kaputt" }), JETZT)).toBe("abgaenge");
  });

  it("laesst ein nicht beurteilbares Objekt nach der Karenz ebenfalls in die Abgaenge", () => {
    const weg = objekt({
      trefferklasse: "nichtBeurteilbar",
      stufe: "S0",
      abgaengigSeit: "2026-09-01T00:00:00Z",
    });
    expect(bestimmeBereich(weg, JETZT)).toBe("abgaenge");
  });
});

describe("sortierschluessel -- sortiert wird nach der UNTEREN Bandkante (3.5)", () => {
  it("nimmt die untere Kante, nicht den Punktwert", () => {
    expect(sortierschluessel(objekt({ rangzahl: 1.9, band: { unten: 0.4, oben: 3.4 } }))).toBe(0.4);
  });

  it("nimmt bei S3 den Punktwert, weil es dort kein Band gibt (3.4)", () => {
    expect(sortierschluessel(objekt({ stufe: "S3", rangzahl: 0.76, band: null }))).toBe(0.76);
  });

  it("gibt fuer ein Objekt ohne Kennzahl null zurueck -- keine 0 (3.7)", () => {
    expect(sortierschluessel(objekt({ stufe: "S0", rangzahl: null, band: null }))).toBeNull();
  });

  it("stuft breite Unschaerfe zurueck: das enge Band schlaegt das weite bei gleichem Punktwert", () => {
    const eng = objekt({ id: "eng", rangzahl: 1.2, band: { unten: 1.05, oben: 1.4 } });
    const weit = objekt({ id: "weit", rangzahl: 1.2, band: { unten: 0.7, oben: 2.0 } });
    expect(sortierschluessel(eng)).toBeGreaterThan(sortierschluessel(weit)!);
  });
});

describe("gliedere -- die vier Bereiche mit ihrer je eigenen Ordnung", () => {
  it("sortiert Top- und Normalbereich absteigend nach der unteren Bandkante", () => {
    const g = gliedere(
      [
        objekt({ id: "mitte", trefferklasse: "top", band: { unten: 1.5, oben: 2 } }),
        objekt({ id: "hoch", trefferklasse: "top", band: { unten: 1.9, oben: 2.4 } }),
        objekt({ id: "tief", trefferklasse: "top", band: { unten: 1.31, oben: 1.8 } }),
      ],
      JETZT
    );
    expect(g.top.map((o) => o.id)).toEqual(["hoch", "mitte", "tief"]);
  });

  it("sortiert den Bereich 'Nicht beurteilbar' nach zuletzt gesehen, NICHT nach Punktzahl (3.7)", () => {
    const g = gliedere(
      [
        objekt({
          id: "alt",
          trefferklasse: "nichtBeurteilbar",
          stufe: "S0",
          rangzahl: null,
          band: null,
          zuletztGesehen: "2026-09-01T00:00:00Z",
        }),
        objekt({
          id: "neu",
          trefferklasse: "nichtBeurteilbar",
          stufe: "S0",
          rangzahl: null,
          band: null,
          zuletztGesehen: "2026-09-14T00:00:00Z",
        }),
      ],
      JETZT
    );
    expect(g.nichtBeurteilbar.map((o) => o.id)).toEqual(["neu", "alt"]);
  });

  it("sortiert die Abgaenge nach Abgangsdatum absteigend (6.4)", () => {
    const g = gliedere(
      [
        objekt({ id: "frueher", abgaengigSeit: "2026-09-01T00:00:00Z" }),
        objekt({ id: "spaeter", abgaengigSeit: "2026-09-08T00:00:00Z" }),
      ],
      JETZT
    );
    expect(g.abgaenge.map((o) => o.id)).toEqual(["spaeter", "frueher"]);
  });

  it("ist bei gleichem Schluessel stabil und damit reproduzierbar", () => {
    const gleich = { trefferklasse: "top" as const, band: { unten: 1.4, oben: 1.8 } };
    const g = gliedere(
      [objekt({ id: "b", ...gleich }), objekt({ id: "a", ...gleich })],
      JETZT
    );
    expect(g.top.map((o) => o.id)).toEqual(["b", "a"]);
  });

  it("verliert kein Objekt: die vier Bereiche summieren sich auf die Eingabe", () => {
    const eingabe = [
      objekt({ id: "1", trefferklasse: "top" }),
      objekt({ id: "2", trefferklasse: "normal" }),
      objekt({ id: "3", trefferklasse: "nichtBeurteilbar", stufe: "S0", rangzahl: null, band: null }),
      objekt({ id: "4", abgaengigSeit: "2026-09-01T00:00:00Z" }),
    ];
    const g = gliedere(eingabe, JETZT);
    expect(g.top.length + g.normal.length + g.nichtBeurteilbar.length + g.abgaenge.length).toBe(4);
  });

  it("haengt ein Objekt ohne Kennzahl nie ans Ende einer gerankten Liste (3.7)", () => {
    // Ein `normal` ohne Rangzahl darf es nicht geben -- faellt es doch an,
    // gehoert es nicht mit einer stillen 0 unter die schlechtesten Objekte.
    const g = gliedere(
      [
        objekt({ id: "ohne", trefferklasse: "normal", rangzahl: null, band: null }),
        objekt({ id: "schlecht", trefferklasse: "normal", band: { unten: 0.01, oben: 0.2 } }),
      ],
      JETZT
    );
    expect(g.normal.map((o) => o.id)).toEqual(["schlecht", "ohne"]);
    expect(g.normal[1]!.rangzahl).toBeNull();
  });
});
