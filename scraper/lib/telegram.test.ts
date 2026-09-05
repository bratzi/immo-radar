import { describe, it, expect } from "vitest";
import { formatTopTrefferMessage, formatPreisaenderungMessage } from "./telegram.js";

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

describe("formatPreisaenderungMessage", () => {
  it("enthält alten und neuen Preis sowie den Link", () => {
    const text = formatPreisaenderungMessage(listing, 500_000_00, 480_000_00);
    expect(text).toContain("500.000");
    expect(text).toContain("480.000");
    expect(text).toContain("https://www.immowelt.de/expose/abc-123");
  });
});
