import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseImmoweltDetailPage } from "./detail.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(
  path.join(__dirname, "..", "..", "test", "fixtures", "immowelt-expose-mehrfamilienhaus.html"),
  "utf-8"
);

const KONTEXT = {
  externalId: "e71353e6-4ef9-4162-8a4f-e680c3951de4",
  url: "https://www.immowelt.de/expose/e71353e6-4ef9-4162-8a4f-e680c3951de4",
};

describe("parseImmoweltDetailPage", () => {
  const daten = parseImmoweltDetailPage(fixtureHtml, KONTEXT);

  it("übernimmt externalId und url unverändert", () => {
    expect(daten.externalId).toBe(KONTEXT.externalId);
    expect(daten.url).toBe(KONTEXT.url);
  });

  it("liest Titel, Preis und Adresse korrekt", () => {
    expect(daten.title).toBe("Mehrfamilienhaus zum Kauf");
    expect(daten.priceCents).toBe(269_000_00);
    expect(daten.zipCode).toBe("34537");
    expect(daten.city).toBe("Bad Wildungen");
  });

  it("liest Wohnfläche, Grundstücksfläche, Zimmer und Baujahr korrekt", () => {
    expect(daten.livingAreaM2).toBe(265);
    expect(daten.plotAreaM2).toBe(578);
    expect(daten.rooms).toBe(6);
    expect(daten.yearBuilt).toBe(1964);
  });

  it("erkennt korrekt, dass die Einheitenzahl NICHT sicher bestimmbar ist (echtes Grenzbeispiel)", () => {
    // Dieses konkrete Objekt ist laut Freitext ein Einfamilienhaus mit einer
    // vermieteten Einliegerwohnung, obwohl Immowelt es als "Mehrfamilienhaus"
    // kategorisiert. Der Text enthält keine explizite "X Wohneinheiten"-Angabe,
    // daher muss units unbekannt bleiben statt geraten zu werden.
    expect(daten.units).toBeNull();
    expect(daten.unitsConfident).toBe(false);
  });

  it("liest keine Jahreskaltmiete aus (Text nennt nur eine Warmmiete für eine Teilfläche)", () => {
    // Die Fixture enthält "pauschale Warmmiete von 480,00 €" fuer die
    // Einliegerwohnung — das ist weder eine Kaltmiete noch die Miete des
    // Gesamtobjekts und darf NICHT als Jahreskaltmiete missverstanden werden.
    expect(daten.rentColdMonthly).toBeNull();
  });
});

describe("parseImmoweltDetailPage — Einheiten-Erkennung mit synthetischem Text", () => {
  // WICHTIG: replaceAll (nicht replace) verwenden. Der Anker-Satz kommt in der
  // Fixture zweimal vor: einmal im sichtbar gerenderten HTML (data-testid
  // "cdp-main-description-expandable-text"), einmal im eingebetteten
  // __UFRN_LIFECYCLE_SERVERREQUEST__-JSON-Blob, den parseImmoweltDetailPage
  // tatsächlich ausliest. Die JSON-Kopie steht im Dokument SPÄTER als die
  // HTML-Kopie — ein einfaches replace() träfe nur die falsche (erste,
  // sichtbare) Stelle und der Parser würde die Injektion nie sehen.
  it("erkennt eine explizite Angabe wie '6 Wohneinheiten'", () => {
    const html = fixtureHtml.replaceAll(
      "Bei der hier angebotenen Immobilie",
      "Das Haus verfügt über 6 Wohneinheiten. Bei der hier angebotenen Immobilie"
    );
    const daten = parseImmoweltDetailPage(html, KONTEXT);
    expect(daten.units).toBe(6);
    expect(daten.unitsConfident).toBe(true);
  });

  it("erkennt eine explizite Kaltmieten-Angabe", () => {
    const html = fixtureHtml.replaceAll(
      "Bei der hier angebotenen Immobilie",
      "Die Kaltmiete beträgt insgesamt 2.400,00 € im Monat. Bei der hier angebotenen Immobilie"
    );
    const daten = parseImmoweltDetailPage(html, KONTEXT);
    expect(daten.rentColdMonthly).toBe(2400);
  });
});
