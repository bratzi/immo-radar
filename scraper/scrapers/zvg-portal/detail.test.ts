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

describe("parseZvgDetailPage — Anhaenge", () => {
  const daten = parseZvgDetailPage(fixtureHtml, KONTEXT);

  it("erfasst den Anhang der Fixture mit URL und Dateiname", () => {
    expect(daten.attachments).toEqual([
      {
        url: "https://www.zvg-portal.de/index.php?button=showAnhang&land_abk=sn&file_id=109158&zvg_id=40908",
        filename: "amtliche_Bekanntmachung1.pdf",
      },
    ]);
  });

  it("erfasst ALLE Anhaenge, nicht nur den ersten (Seiten mit Expose haben zwei)", () => {
    const html = fixtureHtml.replace(
      /(<a aria-label="Anhang"[^>]*>amtliche_Bekanntmachung1\.pdf<\/a>)/,
      '$1 <a aria-label="Anhang" target="_blank" href="?button=showAnhang&amp;land_abk=sn&amp;file_id=109159&amp;zvg_id=40908 ">Exposee1.pdf</a>'
    );
    const zwei = parseZvgDetailPage(html, KONTEXT);
    expect(zwei.attachments).toHaveLength(2);
    expect(zwei.attachments[1].filename).toBe("Exposee1.pdf");
    expect(zwei.attachments[1].url).toContain("file_id=109159");
  });

  it("liefert je Anhang absolute URL und Dateiname", () => {
    for (const anhang of daten.attachments) {
      expect(anhang.url).toMatch(/^https:\/\/www\.zvg-portal\.de\/.*showAnhang/);
      expect(anhang.filename).toMatch(/\.pdf$/i);
    }
  });

  it("nennt die Anhaenge auch im Bekanntmachungstext mit Dateinamen", () => {
    expect(daten.rawNoticeText).toContain("amtliche_Bekanntmachung1.pdf");
    expect(daten.rawNoticeText).toContain("file_id=109158");
  });

  it("liefert eine leere Liste, wenn die Seite keinen Anhang hat", () => {
    const html = fixtureHtml.replace(/<a aria-label="Anhang"[\s\S]*?<\/a>/g, "");
    expect(parseZvgDetailPage(html, KONTEXT).attachments).toEqual([]);
  });
});

describe("parseZvgDetailPage — Verkehrswert mit Zusatztext (echte Portal-Faelle)", () => {
  const mitWert = (wert: string) =>
    parseMitErsetzung(["<p>271.000,00</p>", `<p>${wert}</p>`]).priceCents;

  it("ignoriert eine vorangestellte Grundbuch-Referenz", () => {
    expect(mitWert("Grundbuch von Eschersheim Blatt 3713 lfd.Nr. 1: 605.000,00 €")).toBe(605_000_00);
  });

  it("ignoriert ein vorangestelltes 'zu lfd. Nr.'", () => {
    expect(mitWert("zu lfd. Nr. 1: 89.000,00 EUR")).toBe(89_000_00);
  });

  it("ignoriert einen nachgestellten Klammerzusatz", () => {
    expect(mitWert("240,00 € (lfd. Nr. 2)")).toBe(240_00);
  });

  it("ignoriert ein nachgestelltes Kassenzeichen mit langer Ziffernfolge", () => {
    expect(mitWert("543.000,00 € (Kassenzeichen für Sicherheitsleistung: 040031701069)")).toBe(543_000_00);
  });

  it("versteht die Schreibweise mit Strich statt Nachkommastellen", () => {
    expect(mitWert("Verkehrswert: 353.000,-€")).toBe(353_000_00);
  });

  it("versteht 'Euro' ausgeschrieben und fehlende Leerzeichen", () => {
    expect(mitWert("25.000,00 Euro")).toBe(25_000_00);
    expect(mitWert("Verkehrswert:268.000,00€")).toBe(268_000_00);
  });

  it("liest Millionenbetraege korrekt", () => {
    expect(mitWert("Grundbuch von Frankfurt Bezirk 25 Blatt 3759 lfd.Nr. 1: 2.190.000,00 €")).toBe(2_190_000_00);
  });

  it("liest einen echten Kleinbetrag als solchen, statt Ziffern zusammenzukleben", () => {
    expect(mitWert("BVNr. 1: 50,00 €")).toBe(50_00);
  });

  it("nimmt bei mehreren Betraegen den groessten (Gesamt-Verkehrswert)", () => {
    expect(mitWert("lfd. Nr. 1: 120.000,00 €, lfd. Nr. 2: 480.000,00 €")).toBe(480_000_00);
  });
});

describe("parseZvgDetailPage — Verkehrswert ohne Waehrungszeichen im Feld", () => {
  const mitWert = (wert: string) =>
    parseMitErsetzung(["<p>271.000,00</p>", `<p>${wert}</p>`]).priceCents;

  it("nimmt die Gesamtsumme vor der Aufschluesselung", () => {
    expect(mitWert("70.000,00 (BV Nr. 1: 1.000,00; BV Nr. 2: 69.000,00)")).toBe(70_000_00);
  });

  it("ignoriert eine vorangestellte laufende Nummer", () => {
    expect(mitWert("Lfd. Nr. 1: 27.000,00")).toBe(27_000_00);
  });

  it("vertraegt einen abschliessenden Punkt", () => {
    expect(mitWert("129.000,00.")).toBe(129_000_00);
  });

  it("nimmt bei mehreren Objekten den groessten Betrag", () => {
    expect(mitWert("Objekt 1: 71.300,00 | Objekt 2: ,00")).toBe(71_300_00);
  });

  it("verwirft ein Feld ganz ohne Betrag", () => {
    expect(() => mitWert("Grundbuch von Duderstadt Blatt 7803 lfd.Nr. 1: €")).toThrow(/Verkehrswert/);
    expect(() => mitWert("Lfd. Nr. 1")).toThrow(/Verkehrswert/);
  });
});
