import { describe, expect, it } from "vitest";
import type { SnapshotObjekt } from "../daten/snapshot.ts";
import {
  KARTE_HOEHE,
  KARTE_BREITE,
  abstandZuKacheln,
  begrenzterTrefferradius,
  halberNachbarabstand,
  berechneAbdeckung,
  beschreibeMarkierung,
  buendlePlzPunkte,
  kachelLagen,
  markierungFuer,
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

describe("halberNachbarabstand -- wie weit eine Trefferflaeche hoechstens wachsen darf", () => {
  const punkt = (zweisteller: string, x: number, y: number) => ({ zweisteller, x, y });

  it("ist die halbe Strecke zum naechsten Nachbarn", () => {
    const abstaende = halberNachbarabstand([punkt("10", 0, 0), punkt("20", 10, 0)]);
    expect(abstaende.get("10")).toBe(5);
    expect(abstaende.get("20")).toBe(5);
  });

  it("nimmt je Punkt den NAECHSTEN Nachbarn, nicht irgendeinen", () => {
    const abstaende = halberNachbarabstand([punkt("10", 0, 0), punkt("20", 4, 0), punkt("30", 100, 0)]);
    expect(abstaende.get("10")).toBe(2);
    expect(abstaende.get("20")).toBe(2);
    expect(abstaende.get("30")).toBe(48);
  });

  it("rechnet schraeg, nicht nur waagerecht", () => {
    const abstaende = halberNachbarabstand([punkt("10", 0, 0), punkt("20", 3, 4)]);
    expect(abstaende.get("10")).toBe(2.5);
  });

  it("gibt einem einzelnen Punkt keine Schranke", () => {
    expect(halberNachbarabstand([punkt("10", 0, 0)]).get("10")).toBe(Infinity);
  });
});

describe("begrenzterTrefferradius -- gross genug fuer einen Finger, aber nie der Klau des Nachbarn", () => {
  it("nimmt den geforderten Radius, wenn Platz ist", () => {
    expect(begrenzterTrefferradius(3, 13, 40)).toBe(13);
  });

  it("wird vom halben Nachbarabstand gedeckelt -- sonst stiehlt ein Punkt den Klick", () => {
    expect(begrenzterTrefferradius(3, 13, 6)).toBe(6);
  });

  it("BRICHT die Schranke auch fuer einen grossen Punkt nicht -- im Browser gemessen", () => {
    // Zuerst stand hier `toBe(5)`: "nie kleiner als der sichtbare Punkt".
    // Die Browsermessung hat das widerlegt -- PLZ 51 stahl PLZ 50 den Klick,
    // weil dieses Mindestmass die Nachbarschranke aussticht. Die Trefferflaeche
    // darf NIE ueber den Mittelpunkt des Nachbarn reichen; das ist die
    // Invariante, nicht die Zielgroesse.
    expect(begrenzterTrefferradius(5, 13, 1)).toBe(1);
  });

  it("wird aber nie null -- ein Punkt ohne jede Trefferflaeche waere unerreichbar", () => {
    expect(begrenzterTrefferradius(5, 13, 0)).toBe(0.5);
  });

  it("nimmt ohne Nachbarn den geforderten Radius", () => {
    expect(begrenzterTrefferradius(3, 13, Infinity)).toBe(13);
  });

  it("nimmt mindestens den sichtbaren Punkt, solange Platz ist", () => {
    expect(begrenzterTrefferradius(8, 4, 40)).toBe(8);
  });

  // Im Browser gemessen (2026-09-20, Task 10): Die unsichtbare Trefferflaeche
  // der Punkte lag ueber den Kacheln und nahm ihnen den Klick -- das Saarland
  // traf bei 1366 px keinen einzigen von 25 Rasterpunkten mehr, Berlin, Bremen
  // und Thueringen verloren ihre Mitte. Deshalb eine zweite Schranke.
  it("wird vom Abstand zur naechsten Kachel gedeckelt", () => {
    expect(begrenzterTrefferradius(3, 13, Infinity, 5)).toBe(5);
  });

  it("drueckt dabei aber nie unter den SICHTBAREN Punkt -- sichtbar heisst treffbar", () => {
    // Punkt liegt mitten in der Kachel (Abstand 0). Die Kachel bekommt alles
    // zurueck bis auf das, was der Punkt selbst verdeckt.
    expect(begrenzterTrefferradius(6, 13, Infinity, 0)).toBe(6);
  });

  it("laesst die Nachbarschranke weiterhin alles stechen, auch die Kachelschranke", () => {
    expect(begrenzterTrefferradius(6, 13, 1, 0)).toBe(1);
  });

  it("ohne Kachel in der Naehe bleibt alles wie bisher", () => {
    expect(begrenzterTrefferradius(3, 13, 40, Infinity)).toBe(13);
  });
});

describe("abstandZuKacheln -- wie nah ein Punkt der naechsten Kachelflaeche kommt", () => {
  const punkt = (zweisteller: string, x: number, y: number) => ({ zweisteller, x, y });
  const kachel = (x: number, y: number) => ({ x, y, breite: 10, hoehe: 6 });

  it("misst die Luecke bis zum Rand des Rechtecks, nicht bis zu seiner Mitte", () => {
    // Kachel von x 5..15, y 7..13. Punkt liegt 5 links davon.
    const abstaende = abstandZuKacheln([punkt("10", 0, 10)], [kachel(10, 10)]);
    expect(abstaende.get("10")).toBe(5);
  });

  it("ist null, wenn der Punkt in der Kachel liegt", () => {
    expect(abstandZuKacheln([punkt("10", 10, 10)], [kachel(10, 10)]).get("10")).toBe(0);
  });

  it("rechnet ueber Eck", () => {
    // Naechste Ecke der Kachel liegt bei (5, 7); Punkt bei (2, 3).
    expect(abstandZuKacheln([punkt("10", 2, 3)], [kachel(10, 10)]).get("10")).toBe(5);
  });

  it("nimmt die naechste von mehreren Kacheln", () => {
    const abstaende = abstandZuKacheln([punkt("10", 0, 10)], [kachel(40, 10), kachel(10, 10)]);
    expect(abstaende.get("10")).toBe(5);
  });

  it("gibt ohne Kacheln keine Schranke", () => {
    expect(abstandZuKacheln([punkt("10", 0, 0)], []).get("10")).toBe(Infinity);
  });
});
