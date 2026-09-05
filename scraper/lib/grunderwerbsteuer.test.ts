import { describe, it, expect } from "vitest";
import { grunderwerbsteuerSatz, bundeslandFuerPlz } from "./grunderwerbsteuer.js";

describe("grunderwerbsteuerSatz", () => {
  it("liefert 3.5 für München (Bayern)", () => {
    expect(grunderwerbsteuerSatz("80331")).toBe(3.5);
  });

  it("liefert 6.0 für Berlin", () => {
    expect(grunderwerbsteuerSatz("10115")).toBe(6.0);
  });

  it("liefert 5.5 für Leipzig (Sachsen)", () => {
    expect(grunderwerbsteuerSatz("04109")).toBe(5.5);
  });

  it("liefert 5.0 für Stuttgart (Baden-Württemberg)", () => {
    expect(grunderwerbsteuerSatz("70173")).toBe(5.0);
  });

  it("liefert den bundesweiten Durchschnitt für eine unbekannte PLZ", () => {
    expect(grunderwerbsteuerSatz("00000")).toBeCloseTo(5.6, 5);
  });
});

describe("bundeslandFuerPlz", () => {
  it("liefert 'Bayern' für München", () => {
    expect(bundeslandFuerPlz("80331")).toBe("Bayern");
  });

  it("liefert null für eine unbekannte PLZ", () => {
    expect(bundeslandFuerPlz("00000")).toBeNull();
  });
});
