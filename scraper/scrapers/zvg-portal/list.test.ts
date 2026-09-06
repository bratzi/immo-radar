import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseZvgResultsPage } from "./list.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(
  path.join(__dirname, "..", "..", "test", "fixtures", "zvg-portal-suche-sachsen-mfh.html"),
  "utf-8"
);

describe("parseZvgResultsPage", () => {
  const results = parseZvgResultsPage(fixtureHtml);

  it("extrahiert genau die 9 gültigen Termine (10 Aktenzeichen minus 1 abgesagter Termin)", () => {
    expect(results.length).toBe(9);
  });

  it("überspringt einen abgesagten Termin ohne Detailansicht-Link", () => {
    expect(results.find((r) => r.caseNumber === "0485 K 0213/2024")).toBeUndefined();
  });

  it("extrahiert den ersten Termin korrekt", () => {
    const treffer = results.find((r) => r.caseNumber === "0467 K 0076/2022");
    expect(treffer).toBeDefined();
    expect(treffer!.externalId).toBe("sn-40908");
    expect(treffer!.url).toBe(
      "https://www.zvg-portal.de/index.php?button=showZvg&zvg_id=40908&land_abk=sn"
    );
    expect(treffer!.court).toBe("Leipzig in Sachsen");
  });

  it("extrahiert einen weiteren Termin aus einem anderen Amtsgericht korrekt (Beleg für Alle-Amtsgerichte-Aggregation)", () => {
    const treffer = results.find((r) => r.caseNumber === "0015 K 0188/2023");
    expect(treffer).toBeDefined();
    expect(treffer!.court).toBe("Chemnitz in Sachsen");
  });
});
