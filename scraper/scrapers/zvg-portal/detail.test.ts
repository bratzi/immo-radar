import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseZvgDetailPage } from "./detail.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(
  path.join(__dirname, "..", "..", "test", "fixtures", "zvg-portal-detail-40908.html"),
  "utf-8"
);

const KONTEXT = {
  externalId: "sn-40908",
  url: "https://www.zvg-portal.de/index.php?button=showZvg&zvg_id=40908&land_abk=sn",
  court: "Leipzig in Sachsen",
  caseNumber: "0467 K 0076/2022",
};

describe("parseZvgDetailPage", () => {
  const daten = parseZvgDetailPage(fixtureHtml, KONTEXT);

  it("übernimmt Kontext-Felder unverändert", () => {
    expect(daten.externalId).toBe(KONTEXT.externalId);
    expect(daten.url).toBe(KONTEXT.url);
    expect(daten.court).toBe(KONTEXT.court);
    expect(daten.caseNumber).toBe(KONTEXT.caseNumber);
  });

  it("liest den Verkehrswert korrekt in Cent", () => {
    expect(daten.priceCents).toBe(271_000_00);
  });

  it("liest PLZ und Ort aus Objekt/Lage", () => {
    expect(daten.zipCode).toBe("04442");
    expect(daten.city).toBe("Zwenkau");
  });

  it("erkennt die Einheitenzahl aus dem Wort 'Dreifamilienwohnhaus'", () => {
    expect(daten.units).toBe(3);
    expect(daten.unitsConfident).toBe(true);
  });

  it("liest Wohnfläche und Baujahr aus der Beschreibung", () => {
    expect(daten.livingAreaM2).toBe(203);
    expect(daten.yearBuilt).toBe(1937);
  });

  it("wandelt den Termin in ein korrektes UTC-ISO-Datum um (Sommerzeit)", () => {
    expect(daten.auctionAt).toBe("2026-09-09T08:00:00.000Z");
  });

  it("baut raw_notice_text aus allen Feldern inkl. PDF-Link auf", () => {
    expect(daten.rawNoticeText).toContain("Zwangsversteigerung zum Zwecke der Aufhebung der Gemeinschaft");
    expect(daten.rawNoticeText).toContain("Grundbuch des Amtsgerichts Borna von Zwenkau, Blatt 756");
    expect(daten.rawNoticeText).toContain("Dreifamilienwohnhaus");
    expect(daten.rawNoticeText).toContain("271.000,00");
    expect(daten.rawNoticeText).toContain(
      "https://www.zvg-portal.de/index.php?button=showAnhang&land_abk=sn&file_id=109158&zvg_id=40908"
    );
  });
});

describe("parseZvgDetailPage — Winterzeit-Regression", () => {
  it("wandelt einen Dezember-Termin korrekt mit UTC+1 um", () => {
    const html = fixtureHtml.replace(
      "Mittwoch, 09. September 2026, 10:00 Uhr",
      "Dienstag, 15. Dezember 2026, 09:00 Uhr"
    );
    const daten = parseZvgDetailPage(html, KONTEXT);
    expect(daten.auctionAt).toBe("2026-12-15T08:00:00.000Z");
  });
});

describe("parseZvgDetailPage — kein Einheiten-Hinweis im Text", () => {
  it("liefert units=null statt zu raten, wenn der Text keinen Hinweis enthält", () => {
    const html = fixtureHtml.replace(
      "Dreifamilienwohnhaus, zweigeschossig, unterkellert, ausgebautes Dachgeschoss, ca. 203 qm Wohnfläche, freistehend.",
      "Wohnhaus, zweigeschossig, unterkellert, ausgebautes Dachgeschoss, ca. 203 qm Wohnfläche, freistehend."
    );
    const daten = parseZvgDetailPage(html, KONTEXT);
    expect(daten.units).toBeNull();
    expect(daten.unitsConfident).toBe(false);
  });
});
