import { describe, it, expect } from "vitest";
import { ermittleJahreskaltmiete } from "./rentEstimate.js";

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
