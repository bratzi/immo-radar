import { describe, it, expect } from "vitest";
import { formatTopTrefferMessage, formatPreisaenderungMessage, formatZvgTopTrefferMessage, teileInMediengruppen } from "./telegram.js";

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

  it("enthält Gericht, Termin (Berlin-Zeit), Aktenzeichen und Verkehrswert", () => {
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
  });

  it("verlinkt NICHT direkt auf die zvg-portal.de-Detailseite, da diese ohne eigene Sitzung nur 'error' liefert", () => {
    const text = formatZvgTopTrefferMessage(zvgListing, {
      kaufpreisfaktor: 8.5,
      geschaetzterDscr: 1.6,
      mietQuelle: "geschaetzt_bundesweit",
    });
    expect(text).not.toContain(zvgListing.url);
  });

  it("zeigt den vollstaendigen Inseratstext, damit die Seite gar nicht noetig ist", () => {
    const mitText = {
      ...zvgListing,
      rawNoticeText: [
        "Art der Versteigerung: Zwangsversteigerung zum Zwecke der Aufhebung der Gemeinschaft",
        "Grundbuch: Bergfelde Blatt 2420",
        "Objekt/Lage: Mehrfamilienhaus: Clara-Zetkin-Straße 27, 16562 Hohen Neuendorf",
        "Beschreibung: Grundstück, bebaut mit einem Mehrfamilienhaus (Baujahr um 1904, Wohnfläche 252,34 m²)",
        "Verkehrswert in €: 686.000,00 €",
        "Ort der Versteigerung: Amtsgericht Neuruppin, Karl-Marx-Straße 18a, 16816 Neuruppin, 2. OG, Saal 325",
      ].join("\n"),
    };
    const text = formatZvgTopTrefferMessage(mitText, {
      kaufpreisfaktor: 8.5,
      geschaetzterDscr: 1.6,
      mietQuelle: "geschaetzt_bundesweit",
    });
    expect(text).toContain("Baujahr um 1904");
    expect(text).toContain("Wohnfläche 252,34 m²");
    expect(text).toContain("Saal 325");
    expect(text).toContain("Zwangsversteigerung zum Zwecke der Aufhebung");
  });

  it("haengt einen funktionierenden Google-Maps-Link zur Adresse an", () => {
    const text = formatZvgTopTrefferMessage(zvgListing, {
      kaufpreisfaktor: 8.5,
      geschaetzterDscr: 1.6,
      mietQuelle: "geschaetzt_bundesweit",
    });
    expect(text).toContain("https://www.google.com/maps/search/?api=1&query=");
    expect(text).toContain("Zwenkau");
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

  it("ersetzt eine zvg-portal.de-URL durch den Sucheinstieg statt einen toten Direktlink", () => {
    const zvgListing = { ...listing, url: "https://www.zvg-portal.de/index.php?button=showZvg&zvg_id=40908&land_abk=sn" };
    const text = formatPreisaenderungMessage(zvgListing, 300_000_00, 280_000_00);
    expect(text).not.toContain(zvgListing.url);
    expect(text).toContain("https://www.zvg-portal.de/index.php?button=Termine%20suchen");
  });
});

describe("teileInMediengruppen", () => {
  it("fasst bis zu 10 Bilder in eine Gruppe (Telegram-Grenze)", () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://mms.immowelt.de/${i}.jpg`);
    expect(teileInMediengruppen(urls)).toHaveLength(1);
  });

  it("teilt mehr als 10 Bilder in mehrere Gruppen auf", () => {
    const urls = Array.from({ length: 27 }, (_, i) => `https://mms.immowelt.de/${i}.jpg`);
    const gruppen = teileInMediengruppen(urls);
    expect(gruppen).toHaveLength(3);
    expect(gruppen[0]).toHaveLength(10);
    expect(gruppen[2]).toHaveLength(7);
  });

  it("liefert keine Gruppe bei leerer Liste", () => {
    expect(teileInMediengruppen([])).toEqual([]);
  });

  it("deckelt die Gesamtzahl, damit ein Objekt den Chat nicht flutet", () => {
    const urls = Array.from({ length: 90 }, (_, i) => `https://mms.immowelt.de/${i}.jpg`);
    const gesamt = teileInMediengruppen(urls).flat().length;
    expect(gesamt).toBeLessThanOrEqual(30);
  });
});
