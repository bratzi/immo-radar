import { describe, it, expect } from "vitest";
import { formatTopTrefferMessage, formatPreisaenderungMessage, formatZvgTopTrefferMessage } from "./telegram.js";

const listing = {
  title: "Mehrfamilienhaus zum Kauf",
  url: "https://www.immowelt.de/expose/abc-123",
  city: "Leipzig",
  zipCode: "04109",
  priceCents: 480_000_00,
  units: 3,
};

describe("formatTopTrefferMessage", () => {
  it("enthält Ort, PLZ, Einheiten, Preis, Kennzahlen und Link", () => {
    const text = formatTopTrefferMessage(listing, {
      kaufpreisfaktor: 12.5,
      geschaetzterDscr: 1.45,
      mietQuelle: "angegeben",
    });
    expect(text).toContain("Leipzig");
    expect(text).toContain("04109");
    expect(text).toContain("3 Einheiten");
    expect(text).toContain("480.000");
    expect(text).toContain("12.5");
    expect(text).toContain("1.45");
    expect(text).toContain("https://www.immowelt.de/expose/abc-123");
  });
});

describe("formatTopTrefferMessage mit data_gaps", () => {
  it("hängt eine Warnzeile mit Klartext-Übersetzung an, wenn Angaben fehlen", () => {
    const text = formatTopTrefferMessage(
      { ...listing, dataGaps: ["units_unconfirmed"] },
      { kaufpreisfaktor: 12.5, geschaetzterDscr: 1.45, mietQuelle: "angegeben" }
    );
    expect(text).toContain("⚠️ Fehlende Angaben: Einheiten nicht bestätigt");
  });

  it("hängt KEINE Warnzeile an, wenn keine Angaben fehlen", () => {
    const text = formatTopTrefferMessage(
      { ...listing, dataGaps: [] },
      { kaufpreisfaktor: 12.5, geschaetzterDscr: 1.45, mietQuelle: "angegeben" }
    );
    expect(text).not.toContain("Fehlende Angaben");
  });

  it("hängt KEINE Warnzeile an, wenn dataGaps ganz fehlt (Rückwärtskompatibilität)", () => {
    const text = formatTopTrefferMessage(listing, {
      kaufpreisfaktor: 12.5,
      geschaetzterDscr: 1.45,
      mietQuelle: "angegeben",
    });
    expect(text).not.toContain("Fehlende Angaben");
  });
});

describe("formatZvgTopTrefferMessage", () => {
  const zvgListing = {
    title: "Mehrfamilienhaus: Hugo-Haase-Straße 29, 04442 Zwenkau",
    url: "https://www.zvg-portal.de/index.php?button=showZvg&zvg_id=40908&land_abk=sn",
    city: "Zwenkau",
    zipCode: "04442",
    priceCents: 271_000_00,
    units: 3,
    dataGaps: [],
    court: "Leipzig in Sachsen",
    auctionAt: "2026-09-09T08:00:00.000Z",
    caseNumber: "0467 K 0076/2022",
  };

  it("enthält Gericht, Termin (Berlin-Zeit), Aktenzeichen, Verkehrswert und Link", () => {
    const text = formatZvgTopTrefferMessage(zvgListing, {
      kaufpreisfaktor: 8.5,
      geschaetzterDscr: 1.6,
      mietQuelle: "geschaetzt_bundesweit",
    });
    expect(text).toContain("Leipzig in Sachsen");
    expect(text).toContain("0467 K 0076/2022");
    expect(text).toContain("271.000");
    expect(text).toContain("09.09.2026");
    expect(text).toContain("10:00");
    expect(text).toContain(zvgListing.url);
  });

  it("hängt bei fehlenden Angaben ebenfalls die Warnzeile an", () => {
    const text = formatZvgTopTrefferMessage(
      { ...zvgListing, dataGaps: ["units_unconfirmed"] },
      { kaufpreisfaktor: 8.5, geschaetzterDscr: 1.6, mietQuelle: "geschaetzt_bundesweit" }
    );
    expect(text).toContain("⚠️ Fehlende Angaben: Einheiten nicht bestätigt");
  });
});

describe("formatPreisaenderungMessage", () => {
  it("enthält alten und neuen Preis sowie den Link", () => {
    const text = formatPreisaenderungMessage(listing, 500_000_00, 480_000_00);
    expect(text).toContain("500.000");
    expect(text).toContain("480.000");
    expect(text).toContain("https://www.immowelt.de/expose/abc-123");
  });
});
