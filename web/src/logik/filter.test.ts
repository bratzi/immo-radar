import { describe, expect, it } from "vitest";
import type { SnapshotObjekt } from "../daten/snapshot.ts";
import { LEERER_FILTER, wendeFilterAn, zaehleOhneAngabe, istFilterAktiv, schalteEintrag, inBundeslandAuswahl, OHNE_REGION, leergrund } from "./filter.ts";

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
    kaufpreisfaktor: 10,
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
      plz: 3,
    });
  });
});

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

describe("inBundeslandAuswahl -- die Kategorie Objekte ohne Region (E-7)", () => {
  it("laesst ohne Auswahl alles durch, auch die ohne Region", () => {
    expect(inBundeslandAuswahl(null, [])).toBe(true);
    expect(inBundeslandAuswahl("Sachsen", [])).toBe(true);
  });

  it("laesst ein Objekt ohne Region nur beim Merkwert durch", () => {
    // Genau der Fall, der E-7 ausmacht: Bis zum 2026-09-20 fiel ein Objekt
    // ohne Region beim ersten Klick auf die Karte heraus, und es gab keinen
    // Weg, es zurueckzuholen.
    expect(inBundeslandAuswahl(null, ["Sachsen"])).toBe(false);
    expect(inBundeslandAuswahl(null, [OHNE_REGION])).toBe(true);
  });

  it("laesst den Merkwert kein Objekt MIT Region durchlassen", () => {
    // Sonst waere er kein Filter, sondern ein Schalter, der alles zeigt.
    expect(inBundeslandAuswahl("Sachsen", [OHNE_REGION])).toBe(false);
  });

  it("verbindet Merkwert und Laender mit ODER, wie jedes andere Feld", () => {
    expect(inBundeslandAuswahl(null, ["Sachsen", OHNE_REGION])).toBe(true);
    expect(inBundeslandAuswahl("Sachsen", ["Sachsen", OHNE_REGION])).toBe(true);
    expect(inBundeslandAuswahl("Bayern", ["Sachsen", OHNE_REGION])).toBe(false);
  });
});

describe("wendeFilterAn — Objekte ohne Region", () => {
  const mitRegion = objekt({ id: "mit", bundesland: "Sachsen" });
  const ohneRegion = objekt({ id: "ohne", bundesland: null });
  const alle = [mitRegion, ohneRegion];

  it("zeigt beide, solange kein Bundesland gewaehlt ist", () => {
    expect(wendeFilterAn(alle, LEERER_FILTER).map((o) => o.id)).toEqual(["mit", "ohne"]);
  });

  it("zeigt bei gewaehltem Merkwert nur die ohne Region", () => {
    const filter = { ...LEERER_FILTER, bundeslaender: [OHNE_REGION] };
    expect(wendeFilterAn(alle, filter).map((o) => o.id)).toEqual(["ohne"]);
  });

  it("zeigt bei gewaehltem Bundesland nur die mit Region", () => {
    const filter = { ...LEERER_FILTER, bundeslaender: ["Sachsen"] };
    expect(wendeFilterAn(alle, filter).map((o) => o.id)).toEqual(["mit"]);
  });

  it("zaehlt den Merkwert als aktiven Filter", () => {
    expect(istFilterAktiv({ ...LEERER_FILTER, bundeslaender: [OHNE_REGION] })).toBe(true);
  });
});

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
