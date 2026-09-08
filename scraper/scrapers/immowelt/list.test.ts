import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseImmoweltListPage, istMehrfamilienhausKandidat } from "./list.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(
  path.join(__dirname, "..", "..", "test", "fixtures", "immowelt-suche-haus.html"),
  "utf-8"
);

describe("parseImmoweltListPage", () => {
  it("extrahiert mindestens 30 Karten aus der echten Fixture-Seite", () => {
    const results = parseImmoweltListPage(fixtureHtml);
    expect(results.length).toBeGreaterThanOrEqual(30);
  });

  it("extrahiert die bekannte Mehrfamilienhaus-Karte korrekt", () => {
    const results = parseImmoweltListPage(fixtureHtml);
    const treffer = results.find((r) => r.externalId === "e71353e6-4ef9-4162-8a4f-e680c3951de4");
    expect(treffer).toBeDefined();
    expect(treffer!.url).toBe("https://www.immowelt.de/expose/e71353e6-4ef9-4162-8a4f-e680c3951de4");
    expect(treffer!.titleLine).toContain("Mehrfamilienhaus zum Kauf - Bad Wildungen");
  });
});

describe("istMehrfamilienhausKandidat", () => {
  it("erkennt 'Mehrfamilienhaus zum Kauf - ...' als Kandidat", () => {
    expect(
      istMehrfamilienhausKandidat("Mehrfamilienhaus zum Kauf - Bad Wildungen - 269.000 € - 6 Zimmer")
    ).toBe(true);
  });

  it("erkennt 'Einfamilienhaus zum Kauf - ...' NICHT als Kandidat", () => {
    expect(
      istMehrfamilienhausKandidat("Einfamilienhaus zum Kauf - Wolfhagen - 150.000 € - 6 Zimmer")
    ).toBe(false);
  });

  it("erkennt 'Doppelhaushälfte zum Kauf - ...' NICHT als Kandidat", () => {
    expect(istMehrfamilienhausKandidat("Doppelhaushälfte zum Kauf - Würzburg - 429.000 €")).toBe(false);
  });
});

describe("parseImmoweltListPage -- Fundort", () => {
  it("stempelt jeden Treffer mit der Region, auf deren Seite er stand", () => {
    // Immowelts externalId ist eine UUID ohne Ortsbezug. Woher ein Objekt
    // stammt, weiss nur der Sweep -- also muss er es festhalten.
    const karten = parseImmoweltListPage(fixtureHtml, "he");
    expect(karten.length).toBeGreaterThan(0);
    expect(karten.every((k) => k.fundort === "he")).toBe(true);
  });

  it("laesst den Fundort null, wenn keiner angegeben wurde", () => {
    expect(parseImmoweltListPage(fixtureHtml)[0].fundort).toBeNull();
  });
});
