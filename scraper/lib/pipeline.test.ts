import { describe, it, expect } from "vitest";
import { bewerteEinheiten } from "./pipeline.js";

describe("bewerteEinheiten", () => {
  it("schließt eine BESTÄTIGTE Zahl unter der Mindestgrenze aus", () => {
    const ergebnis = bewerteEinheiten(2, true);
    expect(ergebnis.ausschliessen).toBe(true);
  });

  it("schließt eine bestätigte Zahl AB der Mindestgrenze NICHT aus, ohne data_gaps", () => {
    const ergebnis = bewerteEinheiten(5, true);
    expect(ergebnis.ausschliessen).toBe(false);
    expect(ergebnis.einheitenFuerBerechnung).toBe(5);
    expect(ergebnis.dataGaps).toEqual([]);
  });

  it("schließt eine UNBEKANNTE Zahl NICHT aus, setzt die Mindestgrenze als Rechen-Untergrenze und markiert die Lücke", () => {
    const ergebnis = bewerteEinheiten(null, false);
    expect(ergebnis.ausschliessen).toBe(false);
    expect(ergebnis.einheitenFuerBerechnung).toBe(3);
    expect(ergebnis.dataGaps).toEqual(["units_unconfirmed"]);
  });

  it("schließt eine UNBESTÄTIGTE Zahl unter der Mindestgrenze NICHT aus (das ist genau der Fehler, den dieser Fix behebt)", () => {
    const ergebnis = bewerteEinheiten(2, false);
    expect(ergebnis.ausschliessen).toBe(false);
    expect(ergebnis.einheitenFuerBerechnung).toBe(2);
    expect(ergebnis.dataGaps).toEqual(["units_unconfirmed"]);
  });
});
