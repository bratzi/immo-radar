import { describe, it, expect } from "vitest";
import { grunderwerbsteuerSatz, bundeslandFuerPlz,
  grunderwerbsteuerSatzFuerBundesland,
  BUNDESWEITER_GRUNDERWERBSTEUER_DURCHSCHNITT,
} from "./grunderwerbsteuer.js";

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

describe("grunderwerbsteuerSatzFuerBundesland", () => {
  it("liefert den Satz ohne Umweg ueber eine PLZ", () => {
    // Immowelt-Objekte aus der Ergebnisliste haben keine PLZ, wohl aber das
    // Bundesland ihrer Fundstelle. Der Steuersatz haengt ohnehin am Land.
    expect(grunderwerbsteuerSatzFuerBundesland("Bayern")).toBe(3.5);
    expect(grunderwerbsteuerSatzFuerBundesland("Nordrhein-Westfalen")).toBe(6.5);
    expect(grunderwerbsteuerSatzFuerBundesland("Bremen")).toBe(5.5);
  });

  it("faellt auf den Bundesschnitt zurueck, statt zu raten", () => {
    expect(grunderwerbsteuerSatzFuerBundesland("Elbonien")).toBe(BUNDESWEITER_GRUNDERWERBSTEUER_DURCHSCHNITT);
    expect(grunderwerbsteuerSatzFuerBundesland(null)).toBe(BUNDESWEITER_GRUNDERWERBSTEUER_DURCHSCHNITT);
  });
});
