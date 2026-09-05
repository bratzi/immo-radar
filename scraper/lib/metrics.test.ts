import { describe, it, expect } from "vitest";
import { berechneKennzahlen } from "./metrics.js";

describe("berechneKennzahlen", () => {
  // Realistisches Beispiel: MFH Leipzig, 3 Einheiten, Baujahr 1998, 240 m²,
  // Kaufpreis 480.000 €, Jahreskaltmiete 32.000 € (2.667 €/Monat)
  const basis = {
    kaufpreis: 480_000,
    jahreskaltmiete: 32_000,
    einheiten: 3,
    baujahr: 1998,
    wohnflaecheM2: 240,
  };

  it("berechnet Bewirtschaftungskosten innerhalb der 20-35%-Spanne", () => {
    const k = berechneKennzahlen(basis, 5.5);
    expect(k.bewirtschaftungskosten).toBeGreaterThanOrEqual(basis.jahreskaltmiete * 0.2);
    expect(k.bewirtschaftungskosten).toBeLessThanOrEqual(basis.jahreskaltmiete * 0.35);
  });

  it("NOI = Jahreskaltmiete - Bewirtschaftungskosten", () => {
    const k = berechneKennzahlen(basis, 5.5);
    expect(k.noi).toBeCloseTo(basis.jahreskaltmiete - k.bewirtschaftungskosten, 5);
  });

  it("Kaufnebenkosten enthalten Grunderwerbsteuer + 1.5% Notar + 3.57% Makler", () => {
    const k = berechneKennzahlen(basis, 5.5);
    expect(k.kaufnebenkosten).toBeCloseTo(basis.kaufpreis * (0.055 + 0.015 + 0.0357), 2);
  });

  it("Kaufpreisfaktor = Kaufpreis / Jahreskaltmiete", () => {
    const k = berechneKennzahlen(basis, 5.5);
    expect(k.kaufpreisfaktor).toBeCloseTo(480_000 / 32_000, 5);
  });

  it("Bruttomietrendite = Jahreskaltmiete / Kaufpreis * 100", () => {
    const k = berechneKennzahlen(basis, 5.5);
    expect(k.bruttomietrendite).toBeCloseTo((32_000 / 480_000) * 100, 5);
  });

  it("geschaetzterDscr = NOI / ((Kaufpreis + Kaufnebenkosten) * 6%)", () => {
    const k = berechneKennzahlen(basis, 5.5);
    const erwarteterKapitaldienst = (basis.kaufpreis + k.kaufnebenkosten) * 0.06;
    expect(k.geschaetzterDscr).toBeCloseTo(k.noi / erwarteterKapitaldienst, 5);
  });

  it("geschaetzterBeleihungswert = NOI / 6%", () => {
    const k = berechneKennzahlen(basis, 5.5);
    expect(k.geschaetzterBeleihungswert).toBeCloseTo(k.noi / 0.06, 2);
  });

  it("setzt finanzierungsrisiko wenn Kaufpreis > 110% des Beleihungswerts", () => {
    // Sehr niedrige Miete -> niedriger Beleihungswert -> Kaufpreis liegt weit darüber
    const k = berechneKennzahlen({ ...basis, jahreskaltmiete: 5_000 }, 5.5);
    expect(k.finanzierungsrisiko).toBe(true);
  });

  it("kein finanzierungsrisiko wenn Kaufpreis nahe am Beleihungswert liegt", () => {
    // Sehr hohe Miete -> hoher Beleihungswert
    const k = berechneKennzahlen({ ...basis, jahreskaltmiete: 90_000 }, 5.5);
    expect(k.finanzierungsrisiko).toBe(false);
  });

  it("istTopTreffer nur wenn Faktor <=15 UND DSCR >=1.3 UND kein Finanzierungsrisiko", () => {
    // Gutes Objekt: günstiger Kaufpreis relativ zur Miete
    // (numerisch verifiziert: Faktor 7.8125, DSCR ≈1.544, kein Finanzierungsrisiko)
    const gut = berechneKennzahlen({ ...basis, kaufpreis: 250_000 }, 5.5);
    expect(gut.kaufpreisfaktor).toBeLessThanOrEqual(15);
    expect(gut.geschaetzterDscr).toBeGreaterThanOrEqual(1.3);
    expect(gut.finanzierungsrisiko).toBe(false);
    expect(gut.topTreffer).toBe(true);

    // Schlechtes Objekt: Faktor deutlich über 15
    const schlecht = berechneKennzahlen({ ...basis, kaufpreis: 900_000 }, 5.5);
    expect(schlecht.topTreffer).toBe(false);
  });
});
