import { describe, expect, it } from "vitest";
import type { SnapshotObjekt } from "../daten/snapshot.ts";
import {
  KARTE_HOEHE,
  KARTE_BREITE,
  berechneAbdeckung,
  buendlePlzPunkte,
  kachelLagen,
  projiziere,
  spanneDerGroesse,
} from "./karte.ts";

function objekt(teil: Partial<SnapshotObjekt> = {}): SnapshotObjekt {
  return {
    id: "a",
    quelle: "immowelt",
    url: null,
    titel: null,
    ort: null,
    bundesland: "Sachsen",
    plz: null,
    kaufpreisEuro: 1,
    wohnflaecheM2: 1,
    grundstueckM2: null,
    baujahr: null,
    einheiten: null,
    einheitenAngenommen: true,
    stufe: "S1",
    trefferklasse: "normal",
    rangzahl: 1,
    kaufpreisfaktor: 10,
    band: null,
    istSchwellenwechsler: false,
    zustand: "verfuegbar",
    datenluecken: [],
    preisGesenkt: false,
    zuletztGesehen: null,
    abgaengigSeit: null,
    termin: null,
    ...teil,
  };
}

describe("projiziere", () => {
  it("bildet Nordwesten nach links oben und Suedosten nach rechts unten ab", () => {
    const nordwest = projiziere(5.6, 55.1);
    const suedost = projiziere(15.4, 47.1);
    expect(nordwest.x).toBeCloseTo(0, 5);
    expect(nordwest.y).toBeCloseTo(0, 5);
    expect(suedost.x).toBeCloseTo(KARTE_BREITE, 5);
    expect(suedost.y).toBeCloseTo(KARTE_HOEHE, 5);
  });

  it("legt Berlin oben rechts und Muenchen unten in der Mitte ab", () => {
    const berlin = projiziere(13.4, 52.52);
    const muenchen = projiziere(11.58, 48.14);
    expect(berlin.x).toBeGreaterThan(muenchen.x);
    expect(berlin.y).toBeLessThan(muenchen.y);
  });
});

describe("kachelLagen -- die 16 schematischen Kacheln der Grundschicht (N2)", () => {
  const lagen = kachelLagen();

  it("liefert genau 16 Kacheln", () => {
    expect(lagen).toHaveLength(16);
  });

  it("gibt jeder Kachel ein zweistelliges Kuerzel", () => {
    for (const lage of lagen) {
      expect(lage.kuerzel).toMatch(/^[A-Z]{2}$/);
    }
    expect(new Set(lagen.map((l) => l.kuerzel)).size).toBe(16);
  });

  it("laesst keine zwei Kacheln einander ueberlappen", () => {
    // Der ganze Zweck der Versatzwerte. Berlin und Brandenburg liegen im
    // PLZ-gewichteten Mittel nur 13 px auseinander -- ohne Versatz liege die
    // eine Kachel auf der anderen.
    for (let i = 0; i < lagen.length; i += 1) {
      for (let j = i + 1; j < lagen.length; j += 1) {
        const a = lagen[i]!;
        const b = lagen[j]!;
        const getrennt =
          Math.abs(a.x - b.x) >= a.breite || Math.abs(a.y - b.y) >= a.hoehe;
        expect(getrennt, `${a.kuerzel} ueberlappt ${b.kuerzel}`).toBe(true);
      }
    }
  });

  it("haelt jede Kachel innerhalb der Zeichenflaeche", () => {
    for (const lage of lagen) {
      expect(lage.x - lage.breite / 2).toBeGreaterThanOrEqual(0);
      expect(lage.y - lage.hoehe / 2).toBeGreaterThanOrEqual(0);
      expect(lage.x + lage.breite / 2).toBeLessThanOrEqual(KARTE_BREITE);
      expect(lage.y + lage.hoehe / 2).toBeLessThanOrEqual(KARTE_HOEHE);
    }
  });

  it("merkt sich den Ankerpunkt, damit eine versetzte Kachel angebunden bleibt", () => {
    const berlin = lagen.find((l) => l.name === "Berlin")!;
    expect(berlin.versetzt).toBe(true);
    expect(berlin.ankerX).not.toBe(berlin.x);
  });
});

describe("buendlePlzPunkte -- die Punktschicht (N2)", () => {
  it("bildet je PLZ-Zweisteller einen Punkt und zaehlt die Objekte", () => {
    const punkte = buendlePlzPunkte([
      objekt({ id: "1", plz: "01067" }),
      objekt({ id: "2", plz: "01099" }),
      objekt({ id: "3", plz: "80331" }),
    ]);
    const dresden = punkte.find((p) => p.zweisteller === "01")!;
    expect(dresden.anzahl).toBe(2);
    expect(punkte.find((p) => p.zweisteller === "80")!.anzahl).toBe(1);
    expect(punkte).toHaveLength(2);
  });

  it("uebergeht Objekte ohne PLZ, statt sie irgendwo abzulegen", () => {
    expect(buendlePlzPunkte([objekt({ plz: null })])).toHaveLength(0);
  });

  it("uebergeht eine PLZ, zu der es keine Koordinate gibt", () => {
    // Fuenf Stellen, aber ein Zweisteller, den die Tabelle nicht kennt.
    expect(buendlePlzPunkte([objekt({ plz: "05123" })])).toHaveLength(0);
    expect(buendlePlzPunkte([objekt({ plz: "keine" })])).toHaveLength(0);
  });

  it("zaehlt Top-Treffer je Punkt getrennt mit", () => {
    const punkte = buendlePlzPunkte([
      objekt({ id: "1", plz: "01067", trefferklasse: "top" }),
      objekt({ id: "2", plz: "01099", trefferklasse: "normal" }),
    ]);
    expect(punkte[0]!.topTreffer).toBe(1);
    expect(punkte[0]!.anzahl).toBe(2);
  });
});

describe("berechneAbdeckung -- was die Legende dauerhaft sagen muss (N2)", () => {
  it("rechnet die Abdeckung aus den Daten, nicht aus einer festgeschriebenen Zahl", () => {
    const abdeckung = berechneAbdeckung([
      objekt({ id: "1", plz: "01067", bundesland: "Sachsen" }),
      objekt({ id: "2", plz: null, bundesland: "Sachsen" }),
      objekt({ id: "3", plz: null, bundesland: null }),
    ]);
    expect(abdeckung).toEqual({
      gesamt: 3,
      mitPlz: 1,
      mitBundesland: 2,
      ohneOrtsangabe: 1,
    });
  });

  it("zaehlt eine PLZ ohne bekannte Koordinate NICHT als punktgenau verortbar", () => {
    // Die Legende verspricht "punktgenau verortbar". Eine PLZ, zu der die
    // Tabelle keinen Punkt kennt, traegt dieses Versprechen nicht.
    const abdeckung = berechneAbdeckung([objekt({ plz: "05123" })]);
    expect(abdeckung.mitPlz).toBe(0);
  });

  it("kommt mit einer leeren Menge zurecht", () => {
    expect(berechneAbdeckung([])).toEqual({
      gesamt: 0,
      mitPlz: 0,
      mitBundesland: 0,
      ohneOrtsangabe: 0,
    });
  });
});

describe("spanneDerGroesse -- die Skala der Flaechenfaerbung", () => {
  const laender = [
    { name: "A", objekte: 10, topTreffer: 1, medianDscr: 0.5, standAlterTage: 1 },
    { name: "B", objekte: 30, topTreffer: 0, medianDscr: 1.2, standAlterTage: null },
    { name: "C", objekte: 0, topTreffer: 0, medianDscr: null, standAlterTage: null },
  ];

  it("spannt ueber die vorhandenen Werte", () => {
    expect(spanneDerGroesse(laender, "objekte")).toEqual({ min: 0, max: 30 });
    expect(spanneDerGroesse(laender, "topTreffer")).toEqual({ min: 0, max: 1 });
  });

  it("uebergeht fehlende Mediane, statt sie als 0 mitzuspannen", () => {
    expect(spanneDerGroesse(laender, "medianDscr")).toEqual({ min: 0.5, max: 1.2 });
  });

  it("gibt null zurueck, wenn kein einziger Wert vorliegt", () => {
    expect(spanneDerGroesse([laender[2]!], "medianDscr")).toBeNull();
  });
});
