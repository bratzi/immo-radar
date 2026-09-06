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

const BESCHREIBUNG_ORIGINAL =
  "Dreifamilienwohnhaus, zweigeschossig, unterkellert, ausgebautes Dachgeschoss, ca. 203 qm Wohnfläche, freistehend.";
const BAUJAHR_ORIGINAL = "Bj. 1937, 1994/95 saniert und modernisiert.";
const OBJEKT_LAGE_ORIGINAL =
  '<strong>Mehrfamilienhaus:</strong> Hugo-Haase-Straße  29, 04442 Zwenkau';

/** Ersetzt eine Textstelle in der Fixture und parst das Ergebnis neu. */
function parseMitErsetzung(...ersetzungen: [string, string][]) {
  let html = fixtureHtml;
  for (const [suchen, ersetzen] of ersetzungen) {
    if (!html.includes(suchen)) throw new Error(`Fixture enthält "${suchen}" nicht (mehr)`);
    html = html.replace(suchen, ersetzen);
  }
  return parseZvgDetailPage(html, KONTEXT);
}

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

  it("meldet keine Datenlücken, wenn alle Felder sauber gelesen wurden", () => {
    expect(daten.dataGaps).toEqual([]);
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

  it("faelschte nicht 'zehn'-Substring in Zahliworten 13-19 als Einheitenzahl", () => {
    const html = fixtureHtml.replace(
      "Dreifamilienwohnhaus, zweigeschossig, unterkellert, ausgebautes Dachgeschoss, ca. 203 qm Wohnfläche, freistehend.",
      "Vierzehnfamilienhaus, zweigeschossig, unterkellert, ausgebautes Dachgeschoss, ca. 203 qm Wohnfläche, freistehend."
    );
    const daten = parseZvgDetailPage(html, KONTEXT);
    expect(daten.units).toBeNull();
    expect(daten.unitsConfident).toBe(false);
  });
});

describe("parseZvgDetailPage — Verkehrswert-Plausibilität", () => {
  it("wirft bei einem Verkehrswert von 0,00 statt einen Schein-Top-Treffer zu erzeugen", () => {
    expect(() =>
      parseMitErsetzung(["<p>271.000,00</p>", "<p>0,00</p>"])
    ).toThrow(/Verkehrswert/);
  });

  it("wirft weiterhin bei einem nicht numerischen Verkehrswert", () => {
    expect(() =>
      parseMitErsetzung(["<p>271.000,00</p>", "<p>auf Anfrage</p>"])
    ).toThrow(/Verkehrswert/);
  });
});

describe("parseZvgDetailPage — Wohnfläche- und Baujahr-Varianten", () => {
  it("liest 'Wohnfläche: 203 m²' (Label vor Wert) und 'Baujahr 1937'", () => {
    const daten = parseMitErsetzung(
      [BESCHREIBUNG_ORIGINAL, "Dreifamilienwohnhaus, zweigeschossig, Wohnfläche: 203 m², freistehend."],
      [BAUJAHR_ORIGINAL, "Baujahr 1937, 1994/95 saniert und modernisiert."]
    );
    expect(daten.livingAreaM2).toBe(203);
    expect(daten.yearBuilt).toBe(1937);
  });

  it("liest 'Wohnfläche ca. 203 qm' und 'Baujahr: 1937'", () => {
    const daten = parseMitErsetzung(
      [BESCHREIBUNG_ORIGINAL, "Dreifamilienwohnhaus, Wohnfläche ca. 203 qm, freistehend."],
      [BAUJAHR_ORIGINAL, "Baujahr: 1937, 1994/95 saniert und modernisiert."]
    );
    expect(daten.livingAreaM2).toBe(203);
    expect(daten.yearBuilt).toBe(1937);
  });

  it("liest 'Wohnfl. 203 qm' und 'erbaut um 1937'", () => {
    const daten = parseMitErsetzung(
      [BESCHREIBUNG_ORIGINAL, "Dreifamilienwohnhaus, Wohnfl. 203 qm, freistehend."],
      [BAUJAHR_ORIGINAL, "erbaut um 1937, 1994/95 saniert und modernisiert."]
    );
    expect(daten.livingAreaM2).toBe(203);
    expect(daten.yearBuilt).toBe(1937);
  });

  it("liest '203 m2 Wohnflaeche' (Umschrift ohne Umlaut) und 'erbaut 1937'", () => {
    const daten = parseMitErsetzung(
      [BESCHREIBUNG_ORIGINAL, "Dreifamilienwohnhaus, ca. 203 m2 Wohnflaeche, freistehend."],
      [BAUJAHR_ORIGINAL, "erbaut 1937, 1994/95 saniert und modernisiert."]
    );
    expect(daten.livingAreaM2).toBe(203);
    expect(daten.yearBuilt).toBe(1937);
  });

  it("liefert null, wenn wirklich keine Angabe im Text steht", () => {
    const daten = parseMitErsetzung(
      [BESCHREIBUNG_ORIGINAL, "Dreifamilienwohnhaus, freistehend."],
      [BAUJAHR_ORIGINAL, "1994/95 saniert und modernisiert."]
    );
    expect(daten.livingAreaM2).toBeNull();
    expect(daten.yearBuilt).toBeNull();
  });
});

describe("parseZvgDetailPage — mehrzeilige Objekt/Lage-Zelle", () => {
  it("findet PLZ und Ort auch, wenn die Zelle über mehrere Absätze geht", () => {
    const daten = parseMitErsetzung([
      OBJEKT_LAGE_ORIGINAL,
      "<p><strong>Mehrfamilienhaus:</strong></p><p>Hugo-Haase-Straße 29</p><p>04442 Zwenkau</p>",
    ]);
    expect(daten.zipCode).toBe("04442");
    expect(daten.city).toBe("Zwenkau");
    expect(daten.dataGaps).toEqual([]);
  });

  it("markiert die Lücke, wenn gar keine PLZ zu finden ist, statt still leere Felder zu liefern", () => {
    const daten = parseMitErsetzung([
      OBJEKT_LAGE_ORIGINAL,
      "<p><strong>Mehrfamilienhaus:</strong></p><p>Hugo-Haase-Straße 29, Ortslage Zwenkau</p>",
    ]);
    expect(daten.zipCode).toBe("");
    expect(daten.city).toBe("");
    expect(daten.dataGaps).toContain("location_unconfirmed");
  });
});

describe("parseZvgDetailPage — Einheitenzahl aus Wertermittlungsprosa", () => {
  it("stuft eine Textzahl unter der Mindestgrenze auf 'unbestätigt' herab, statt auszuschließen", () => {
    const daten = parseMitErsetzung([
      BESCHREIBUNG_ORIGINAL,
      "Wohnhaus mit 1 Wohnung im EG und 2 Wohnungen im OG, ca. 203 qm Wohnfläche, freistehend.",
    ]);
    // Die Prosa nennt nur einen Teilbereich -- 2 ist keine belastbare Gesamtzahl.
    expect(daten.units).toBe(2);
    expect(daten.unitsConfident).toBe(false);
  });

  it("stuft auch 'Einfamilienhaus' in einem Nebensatz nur herab, nicht zum Ausschluss", () => {
    const daten = parseMitErsetzung([
      BESCHREIBUNG_ORIGINAL,
      "Hofanlage, das rückwärtige Einfamilienhaus ist abgängig, ca. 203 qm Wohnfläche.",
    ]);
    expect(daten.units).toBe(1);
    expect(daten.unitsConfident).toBe(false);
  });

  it("lässt eine Zahl AB der Mindestgrenze bestätigt (Regression: Dreifamilienwohnhaus)", () => {
    const daten = parseZvgDetailPage(fixtureHtml, KONTEXT);
    expect(daten.units).toBe(3);
    expect(daten.unitsConfident).toBe(true);
  });

  it("lässt eine hohe Zahl bestätigt", () => {
    const daten = parseMitErsetzung([
      BESCHREIBUNG_ORIGINAL,
      "Mehrfamilienhaus mit 8 Wohneinheiten, ca. 203 qm Wohnfläche, freistehend.",
    ]);
    expect(daten.units).toBe(8);
    expect(daten.unitsConfident).toBe(true);
  });
});
