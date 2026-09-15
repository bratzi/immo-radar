import { describe, expect, it } from "vitest";
import type { SnapshotObjekt } from "../daten/snapshot.ts";
import { LEERER_FILTER, wendeFilterAn, zaehleOhneAngabe, istFilterAktiv } from "./filter.ts";

function objekt(teil: Partial<SnapshotObjekt> = {}): SnapshotObjekt {
  return {
    id: "a",
    quelle: "immowelt",
    url: null,
    titel: null,
    ort: null,
    bundesland: "Sachsen",
    plz: null,
    kaufpreisEuro: 200000,
    wohnflaecheM2: 150,
    grundstueckM2: 400,
    baujahr: 1970,
    einheiten: 3,
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

describe("wendeFilterAn -- der leere Filter", () => {
  it("laesst alles durch", () => {
    const alle = [objekt({ id: "1" }), objekt({ id: "2", stufe: "S0" })];
    expect(wendeFilterAn(alle, LEERER_FILTER)).toHaveLength(2);
  });

  it("gilt als nicht aktiv", () => {
    expect(istFilterAktiv(LEERER_FILTER)).toBe(false);
    expect(istFilterAktiv({ ...LEERER_FILTER, bundeslaender: ["Sachsen"] })).toBe(true);
  });
});

describe("wendeFilterAn -- Auswahlfilter (ODER innerhalb, UND zwischen den Feldern)", () => {
  it("filtert nach Bundesland", () => {
    const alle = [objekt({ id: "sn" }), objekt({ id: "by", bundesland: "Bayern" })];
    const treffer = wendeFilterAn(alle, { ...LEERER_FILTER, bundeslaender: ["Bayern"] });
    expect(treffer.map((o) => o.id)).toEqual(["by"]);
  });

  it("verodert mehrere Bundeslaender", () => {
    const alle = [
      objekt({ id: "sn" }),
      objekt({ id: "by", bundesland: "Bayern" }),
      objekt({ id: "he", bundesland: "Hessen" }),
    ];
    const treffer = wendeFilterAn(alle, { ...LEERER_FILTER, bundeslaender: ["Bayern", "Sachsen"] });
    expect(treffer.map((o) => o.id).sort()).toEqual(["by", "sn"]);
  });

  it("blendet ein Objekt OHNE Bundesland aus, sobald nach Bundeslaendern gefiltert wird", () => {
    const alle = [objekt({ id: "ohne", bundesland: null })];
    expect(wendeFilterAn(alle, { ...LEERER_FILTER, bundeslaender: ["Sachsen"] })).toHaveLength(0);
  });

  it("filtert nach Quelle, Stufe und Zustand und verbindet die Felder mit UND", () => {
    const alle = [
      objekt({ id: "passt", quelle: "zvg-portal", stufe: "S2", zustand: "unbestaetigt" }),
      objekt({ id: "falscheQuelle", quelle: "immowelt", stufe: "S2", zustand: "unbestaetigt" }),
      objekt({ id: "falscheStufe", quelle: "zvg-portal", stufe: "S1", zustand: "unbestaetigt" }),
    ];
    const treffer = wendeFilterAn(alle, {
      ...LEERER_FILTER,
      quellen: ["zvg-portal"],
      stufen: ["S2"],
      zustaende: ["unbestaetigt"],
    });
    expect(treffer.map((o) => o.id)).toEqual(["passt"]);
  });
});

describe("wendeFilterAn -- Spannenfilter", () => {
  it("schliesst die Grenzen ein", () => {
    const alle = [
      objekt({ id: "unten", kaufpreisEuro: 100000 }),
      objekt({ id: "oben", kaufpreisEuro: 300000 }),
      objekt({ id: "drueber", kaufpreisEuro: 300001 }),
    ];
    const treffer = wendeFilterAn(alle, {
      ...LEERER_FILTER,
      kaufpreisVon: 100000,
      kaufpreisBis: 300000,
    });
    expect(treffer.map((o) => o.id)).toEqual(["unten", "oben"]);
  });

  it("laesst eine halboffene Spanne zu", () => {
    const alle = [objekt({ id: "klein", wohnflaecheM2: 50 }), objekt({ id: "gross", wohnflaecheM2: 500 })];
    expect(
      wendeFilterAn(alle, { ...LEERER_FILTER, wohnflaecheVon: 100 }).map((o) => o.id)
    ).toEqual(["gross"]);
  });

  it("BLENDET Objekte ohne Angabe aus, sobald die Spanne aktiv ist", () => {
    // Die Entscheidung, die der Leitsatz erzwingt: Ein Objekt ohne Baujahr
    // faellt weder stillschweigend hinein noch gilt es als Baujahr 0. Es
    // faellt heraus -- und die Oberflaeche sagt, wie viele das sind.
    const alle = [objekt({ id: "mit", baujahr: 1980 }), objekt({ id: "ohne", baujahr: null })];
    expect(wendeFilterAn(alle, { ...LEERER_FILTER, baujahrVon: 1900 }).map((o) => o.id)).toEqual([
      "mit",
    ]);
  });

  it("laesst Objekte ohne Angabe unangetastet, solange die Spanne nicht gesetzt ist", () => {
    const alle = [objekt({ id: "ohne", baujahr: null, einheiten: null, grundstueckM2: null })];
    expect(wendeFilterAn(alle, LEERER_FILTER)).toHaveLength(1);
  });

  it("filtert Grundstuecksflaeche und Einheiten nach derselben Regel", () => {
    const alle = [
      objekt({ id: "passt", grundstueckM2: 800, einheiten: 4 }),
      objekt({ id: "zuKlein", grundstueckM2: 100, einheiten: 4 }),
      objekt({ id: "ohneEinheiten", grundstueckM2: 800, einheiten: null }),
    ];
    const treffer = wendeFilterAn(alle, {
      ...LEERER_FILTER,
      grundstueckVon: 500,
      einheitenVon: 2,
    });
    expect(treffer.map((o) => o.id)).toEqual(["passt"]);
  });
});

describe("wendeFilterAn -- Schalter", () => {
  it("'nur ueber der Meldeschwelle' meint die Trefferklasse aus N1.1, nicht den Punktwert", () => {
    const alle = [
      objekt({ id: "top", trefferklasse: "top" }),
      // Punktwert ueber 1,3, untere Bandkante darunter -- genau der Fall, den
      // N1.1 ausschliesst. Die Oberflaeche rechnet das nicht nach, sie nimmt
      // die Trefferklasse, die der Export gesetzt hat.
      objekt({ id: "nurImBand", trefferklasse: "normal", rangzahl: 1.6, band: { unten: 0.9, oben: 2.3 } }),
    ];
    expect(
      wendeFilterAn(alle, { ...LEERER_FILTER, nurUeberMeldeschwelle: true }).map((o) => o.id)
    ).toEqual(["top"]);
  });

  it("filtert Preissenkungen", () => {
    const alle = [objekt({ id: "gesenkt", preisGesenkt: true }), objekt({ id: "normal" })];
    expect(
      wendeFilterAn(alle, { ...LEERER_FILTER, nurPreissenkungen: true }).map((o) => o.id)
    ).toEqual(["gesenkt"]);
  });

  it("filtert Schwellenwechsler", () => {
    const alle = [objekt({ id: "wechsler", istSchwellenwechsler: true }), objekt({ id: "fest" })];
    expect(
      wendeFilterAn(alle, { ...LEERER_FILTER, nurSchwellenwechsler: true }).map((o) => o.id)
    ).toEqual(["wechsler"]);
  });
});

describe("wendeFilterAn -- Datenluecken, einzeln auswaehlbar (N3)", () => {
  it("findet Objekte mit der gewaehlten Luecke", () => {
    const alle = [
      objekt({ id: "ohneFlaeche", datenluecken: ["Wohnfläche fehlt"] }),
      objekt({ id: "sauber", datenluecken: [] }),
    ];
    expect(
      wendeFilterAn(alle, { ...LEERER_FILTER, datenluecken: ["Wohnfläche fehlt"] }).map((o) => o.id)
    ).toEqual(["ohneFlaeche"]);
  });

  it("verodert mehrere Luecken -- eine genuegt", () => {
    const alle = [
      objekt({ id: "a", datenluecken: ["Wohnfläche fehlt"] }),
      objekt({ id: "b", datenluecken: ["Preis fehlt"] }),
      objekt({ id: "c", datenluecken: ["Lage nicht bestätigt"] }),
    ];
    const treffer = wendeFilterAn(alle, {
      ...LEERER_FILTER,
      datenluecken: ["Wohnfläche fehlt", "Preis fehlt"],
    });
    expect(treffer.map((o) => o.id)).toEqual(["a", "b"]);
  });
});

describe("wendeFilterAn -- Zwangsversteigerungstermin (nur ZVG)", () => {
  it("zeigt mit 'nur mit Termin' ausschliesslich Objekte, die einen tragen", () => {
    const alle = [
      objekt({ id: "mit", quelle: "zvg-portal", termin: "2026-10-01T09:00:00Z" }),
      objekt({ id: "ohne" }),
    ];
    expect(wendeFilterAn(alle, { ...LEERER_FILTER, terminNur: true }).map((o) => o.id)).toEqual([
      "mit",
    ]);
  });

  it("grenzt den Termin nach Datum ein und blendet Objekte ohne Termin dabei aus", () => {
    const alle = [
      objekt({ id: "frueh", termin: "2026-09-20T09:00:00Z" }),
      objekt({ id: "spaet", termin: "2026-12-01T09:00:00Z" }),
      objekt({ id: "ohne", termin: null }),
    ];
    const treffer = wendeFilterAn(alle, { ...LEERER_FILTER, terminBis: "2026-10-01" });
    expect(treffer.map((o) => o.id)).toEqual(["frueh"]);
  });

  it("wirft einen unlesbaren Termin heraus, statt ihn durchzulassen", () => {
    const alle = [objekt({ id: "kaputt", termin: "demnaechst" })];
    expect(wendeFilterAn(alle, { ...LEERER_FILTER, terminVon: "2026-01-01" })).toHaveLength(0);
  });
});

describe("zaehleOhneAngabe -- was ein Spannenfilter kosten wuerde", () => {
  it("zaehlt je Feld die Objekte ohne Wert", () => {
    const alle = [
      objekt({ baujahr: 1970, einheiten: 3, grundstueckM2: 400, wohnflaecheM2: 150, kaufpreisEuro: 1 }),
      objekt({ baujahr: null, einheiten: null, grundstueckM2: null, wohnflaecheM2: null, kaufpreisEuro: null }),
      objekt({ baujahr: null, einheiten: 2, grundstueckM2: 100, wohnflaecheM2: 90, kaufpreisEuro: 5 }),
    ];
    expect(zaehleOhneAngabe(alle)).toEqual({
      kaufpreis: 1,
      wohnflaeche: 1,
      grundstueck: 1,
      baujahr: 2,
      einheiten: 1,
    });
  });
});
