import { describe, expect, it } from "vitest";
import { fuegeDetailHinzu } from "./zusammenfuehren.js";
import type { TitelzeilenWerte } from "./titelzeile.js";
import type { ImmoweltDetailData } from "./detail.js";

const TITELZEILE: TitelzeilenWerte = {
  preisCents: 7_500_000,
  wohnflaecheM2: 158.7,
  grundstueckM2: 184,
  zimmer: 8,
  lage: "West",
};

const DETAIL: ImmoweltDetailData = {
  externalId: "abc",
  url: "https://example.invalid/expose/abc",
  title: "Mehrfamilienhaus",
  priceCents: 7_400_000,
  livingAreaM2: 160,
  plotAreaM2: 190,
  rooms: 9,
  yearBuilt: 1972,
  zipCode: "44135",
  city: "Dortmund",
  units: 4,
  unitsConfident: true,
  rentColdMonthly: 210_000,
  descriptionText: "Text",
  photoUrls: ["https://example.invalid/1.jpg"],
};

describe("fuegeDetailHinzu — ohne Detailseite", () => {
  const werte = fuegeDetailHinzu(TITELZEILE, undefined);

  it("behaelt die Werte der Titelzeile", () => {
    expect(werte.preisCents).toBe(7_500_000);
    expect(werte.wohnflaecheM2).toBe(158.7);
    expect(werte.grundstueckM2).toBe(184);
  });

  it("laesst die PLZ leer und nimmt die Lage als Ort", () => {
    expect(werte.plz).toBe("");
    expect(werte.ort).toBe("West");
  });

  it("erfindet weder Baujahr noch Kaltmiete noch Einheiten", () => {
    expect(werte.baujahr).toBeNull();
    expect(werte.kaltmiete).toBeNull();
    expect(werte.einheiten).toBeNull();
    expect(werte.einheitenSicher).toBe(false);
  });

  it("meldet, dass keine Detailseite gelesen wurde", () => {
    // Steuert last_detail_at. Ein true hier hielte das Objekt faelschlich
    // aus der Detailerfassung heraus.
    expect(werte.detailGelesen).toBe(false);
  });
});

describe("fuegeDetailHinzu — mit Detailseite", () => {
  const werte = fuegeDetailHinzu(TITELZEILE, DETAIL);

  it("laesst die Detailseite gewinnen, wo sie etwas sagt", () => {
    expect(werte.preisCents).toBe(7_400_000);
    expect(werte.wohnflaecheM2).toBe(160);
    expect(werte.grundstueckM2).toBe(190);
    expect(werte.plz).toBe("44135");
    expect(werte.ort).toBe("Dortmund");
    expect(werte.baujahr).toBe(1972);
    expect(werte.kaltmiete).toBe(210_000);
    expect(werte.einheiten).toBe(4);
    expect(werte.einheitenSicher).toBe(true);
    expect(werte.fotoUrls).toEqual(["https://example.invalid/1.jpg"]);
  });

  it("meldet, dass eine Detailseite gelesen wurde", () => {
    expect(werte.detailGelesen).toBe(true);
  });
});

describe("fuegeDetailHinzu — lueckenhafte Detailseite", () => {
  // Der eigentliche Zweck der Funktion: Ein null auf der Detailseite ist
  // keine Aussage. Es darf einen Wert der Titelzeile NICHT loeschen, sonst
  // macht die Detailphase den Bestand aermer statt reicher.
  const luecke: ImmoweltDetailData = {
    ...DETAIL,
    livingAreaM2: null,
    plotAreaM2: null,
    zipCode: "",
    city: "",
    units: null,
    unitsConfident: false,
    yearBuilt: null,
    rentColdMonthly: null,
    photoUrls: [],
  };
  const werte = fuegeDetailHinzu(TITELZEILE, luecke);

  it("faellt fuer jedes fehlende Feld auf die Titelzeile zurueck", () => {
    expect(werte.wohnflaecheM2).toBe(158.7);
    expect(werte.grundstueckM2).toBe(184);
    expect(werte.ort).toBe("West");
  });

  it("laesst die PLZ leer statt sie zu erfinden", () => {
    expect(werte.plz).toBe("");
  });

  it("gilt trotzdem als gelesen", () => {
    // Die Seite wurde abgerufen, sie nennt nur nichts. Ein false hier holte
    // dasselbe Objekt in jedem Lauf erneut -- ein stehender Rueckstand.
    expect(werte.detailGelesen).toBe(true);
  });
});
