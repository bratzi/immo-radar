import { describe, it, expect } from "vitest";
import { ermittleJahreskaltmiete,
  mieteProM2FuerBundesland,
  bundeslandFuerRegionscode,
  mietSpanneFuerBundesland,
  mietSpanneBundesweit,
  REGIONALE_SPANNE_S2,
} from "./rentEstimate.js";

describe("ermittleJahreskaltmiete", () => {
  it("nutzt die angegebene Miete, wenn vorhanden", () => {
    const r = ermittleJahreskaltmiete(1200, 100);
    expect(r.jahreskaltmiete).toBe(1200 * 12);
    expect(r.quelle).toBe("angegeben");
  });

  it("schätzt bundesweit, wenn keine Miete angegeben ist", () => {
    const r = ermittleJahreskaltmiete(null, 100);
    expect(r.quelle).toBe("geschaetzt_bundesweit");
    expect(r.jahreskaltmiete).toBeGreaterThan(0);
  });

  /**
   * Der bisherige Wert 9,23 €/m² stammte aus dem ImmoScout-Wohnpreisatlas
   * (Recherchestand 09/2026) und ist gegen die BBSR-Angebotsmiete 2025
   * (11,11 €/m²) um 16,9 % zu niedrig. Zu niedrig heiszt hier: Der
   * Kaufpreisfaktor faellt zu schlecht aus und ein lohnendes Objekt fiele
   * unter die Meldeschwelle -- der Fehler geht also gegen den Nutzer.
   * Quelle: BBSR, "Mieten driften immer weiter auseinander" (2025).
   */
  it("setzt den belegten BBSR-Wert 2025 von 11,11 €/m² an", () => {
    const r = ermittleJahreskaltmiete(null, 100);
    expect(r.jahreskaltmiete).toBeCloseTo(11.11 * 100 * 12, 6);
  });

  it("schätzt bundesweit auch bei 0 oder negativer Angabe", () => {
    const r = ermittleJahreskaltmiete(0, 100);
    expect(r.quelle).toBe("geschaetzt_bundesweit");
  });
});

describe("ermittleJahreskaltmiete — regionales Mietniveau", () => {
  const jahr = (plz: string) => ermittleJahreskaltmiete(null, 100, plz).jahreskaltmiete;

  it("setzt in Muenchen deutlich mehr an als in Ostthueringen", () => {
    expect(jahr("80331")).toBeGreaterThan(jahr("07545") * 1.5);
  });

  it("bleibt fuer jede bekannte PLZ in einem plausiblen Rahmen (4 bis 25 EUR/m2)", () => {
    for (const plz of ["01067", "08525", "20095", "45663", "80331", "99974"]) {
      const proM2 = jahr(plz) / 100 / 12;
      expect(proM2).toBeGreaterThanOrEqual(4);
      expect(proM2).toBeLessThanOrEqual(25);
    }
  });

  it("faellt bei unbekannter PLZ auf den Bundesschnitt zurueck", () => {
    expect(jahr("xxxxx")).toBe(ermittleJahreskaltmiete(null, 100).jahreskaltmiete);
  });

  it("meldet die regionale Schaetzung als eigene Quelle", () => {
    expect(ermittleJahreskaltmiete(null, 100, "80331").quelle).toBe("geschaetzt_regional");
  });

  it("nutzt weiterhin die angegebene Miete, auch wenn eine PLZ vorliegt", () => {
    const r = ermittleJahreskaltmiete(1200, 100, "80331");
    expect(r.quelle).toBe("angegeben");
    expect(r.jahreskaltmiete).toBe(14400);
  });
});

describe("bundeslandFuerRegionscode", () => {
  it("uebersetzt die Immowelt-Regionscodes in Bundeslandnamen", () => {
    expect(bundeslandFuerRegionscode("nw")).toBe("Nordrhein-Westfalen");
    expect(bundeslandFuerRegionscode("by")).toBe("Bayern");
    expect(bundeslandFuerRegionscode("hb")).toBe("Bremen");
    expect(bundeslandFuerRegionscode("bw")).toBe("Baden-Württemberg");
    expect(bundeslandFuerRegionscode("th")).toBe("Thüringen");
  });

  it("liefert null fuer alles Unbekannte", () => {
    expect(bundeslandFuerRegionscode("xx")).toBeNull();
    expect(bundeslandFuerRegionscode("")).toBeNull();
  });
});

describe("mieteProM2FuerBundesland", () => {
  // Immowelt-Ergebnislisten nennen KEINE Postleitzahl -- weder im HTML noch im
  // Datenmodell (beides geprueft, 2026-09-08). Bekannt ist nur das Bundesland,
  // in dessen Liste ein Objekt stand. Der Wert wird deshalb aus den
  // vorhandenen PLZ-Werten dieses Bundeslandes gemittelt, nicht neu erfunden.

  it("liefert fuer die Stadtstaaten den Wert ihrer eigenen Lage", () => {
    // Bremen deckt nur die 28er -- der Mittelwert muss dort landen.
    const bremen = mieteProM2FuerBundesland("Bremen");
    expect(bremen).not.toBeNull();
    expect(bremen as number).toBeGreaterThan(9);
    expect(bremen as number).toBeLessThan(12);
  });

  it("ordnet die Bundeslaender plausibel zueinander", () => {
    // Bayern (Muenchen ~20 €/m²) muss ueber Sachsen-Anhalt liegen. Wenn diese
    // Reihenfolge kippt, stimmt die Mittelung nicht.
    const by = mieteProM2FuerBundesland("Bayern") as number;
    const st = mieteProM2FuerBundesland("Sachsen-Anhalt") as number;
    expect(by).toBeGreaterThan(st);
  });

  it("bleibt fuer jedes Bundesland in einer realistischen Spanne", () => {
    for (const land of [
      "Bayern", "Baden-Württemberg", "Berlin", "Brandenburg", "Bremen", "Hamburg",
      "Hessen", "Mecklenburg-Vorpommern", "Niedersachsen", "Nordrhein-Westfalen",
      "Rheinland-Pfalz", "Saarland", "Sachsen", "Sachsen-Anhalt",
      "Schleswig-Holstein", "Thüringen",
    ]) {
      const wert = mieteProM2FuerBundesland(land);
      expect(wert, land).not.toBeNull();
      expect(wert as number, land).toBeGreaterThan(5);
      expect(wert as number, land).toBeLessThan(20);
    }
  });

  it("liefert null fuer ein unbekanntes Bundesland", () => {
    expect(mieteProM2FuerBundesland("Elbonien")).toBeNull();
  });
});

describe("ermittleJahreskaltmiete -- bundeslandgenauer Weg", () => {
  it("nutzt das Bundesland, wenn keine PLZ vorliegt", () => {
    // Genau der Immowelt-Fall: Die Ergebnisliste nennt keine PLZ, wohl aber
    // das Bundesland, in dessen Liste das Objekt stand.
    const m = ermittleJahreskaltmiete(null, 200, undefined, "Bayern");
    expect(m.quelle).toBe("geschaetzt_bundesland");
    const proM2 = m.jahreskaltmiete / 200 / 12;
    expect(proM2).toBeGreaterThan(5);
    expect(proM2).toBeLessThan(20);
  });

  it("bevorzugt die PLZ, wenn beides vorliegt", () => {
    // Die PLZ ist ortsgenauer. Ein Bundeslandmittel darf sie nie verdraengen.
    const m = ermittleJahreskaltmiete(null, 100, "80331", "Bayern");
    expect(m.quelle).toBe("geschaetzt_regional");
  });

  it("bevorzugt die angegebene Miete vor allem anderen", () => {
    const m = ermittleJahreskaltmiete(1000, 100, undefined, "Bayern");
    expect(m.quelle).toBe("angegeben");
    expect(m.jahreskaltmiete).toBe(12000);
  });

  it("faellt auf den Bundesschnitt zurueck, wenn auch das Bundesland fehlt", () => {
    const m = ermittleJahreskaltmiete(null, 100, undefined, null);
    expect(m.quelle).toBe("geschaetzt_bundesweit");
  });

  it("faellt auf den Bundesschnitt zurueck bei unbekanntem Bundesland", () => {
    const m = ermittleJahreskaltmiete(null, 100, undefined, "Elbonien");
    expect(m.quelle).toBe("geschaetzt_bundesweit");
  });
});

describe("mietSpanneFuerBundesland", () => {
  it("berechnet die gemessene Spanne fuer Bayern -- deckungsgleich mit Entwurf 3.4 (-34,8 % / +67,1 %)", () => {
    const spanne = mietSpanneFuerBundesland("Bayern");
    expect(spanne).not.toBeNull();
    expect(spanne!.minProzent).toBeCloseTo(-0.348, 3);
    expect(spanne!.maxProzent).toBeCloseTo(0.671, 3);
  });

  it("liefert null fuer ein unbekanntes Bundesland -- keine erfundene Spanne", () => {
    expect(mietSpanneFuerBundesland("Nirgendwo")).toBeNull();
  });
});

describe("REGIONALE_SPANNE_S2", () => {
  it("ist die feste A11-Streuung der Tabelle gegen den Zensus, -23,7 % bis +23,9 %", () => {
    expect(REGIONALE_SPANNE_S2.minProzent).toBeCloseTo(-0.237, 3);
    expect(REGIONALE_SPANNE_S2.maxProzent).toBeCloseTo(0.239, 3);
  });
});

describe("mietSpanneBundesweit", () => {
  it("berechnet die Spanne ueber ALLE PLZ-Werte gegen den Bundesschnitt 11,11 €/m²", () => {
    const spanne = mietSpanneBundesweit();
    expect(spanne.minProzent).toBeCloseTo(-0.4599459945994599, 6);
    expect(spanne.maxProzent).toBeCloseTo(0.8451845184518453, 6);
  });

  it("merkt sich das Ergebnis wie die Nachbarfunktionen -- zwei Aufrufe liefern dieselbe Referenz (A17)", () => {
    // mieteProM2FuerBundesland und mietSpanneFuerBundesland merken sich ihr
    // Ergebnis in einer Map und geben bei einem Treffer dasselbe Objekt
    // zurueck, statt es neu zu bauen. mietSpanneBundesweit lief bisher bei
    // jedem Aufruf erneut ueber die ganze REGIONALE_MIETE_PRO_M2-Tabelle und
    // baute jedes Mal ein neues Objekt -- toEqual saehe das nicht, weil beide
    // Objekte inhaltlich gleich sind. toBe (Referenzgleichheit) unterscheidet
    // "wiederverwendet" zuverlaessig von "neu berechnet".
    expect(mietSpanneBundesweit()).toBe(mietSpanneBundesweit());
  });
});
