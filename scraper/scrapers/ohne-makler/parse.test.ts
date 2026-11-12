import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseOhneMaklerListe } from "./parse.js";

const html = readFileSync(new URL("../../test/fixtures/ohne-makler/liste.html", import.meta.url), "utf8");

describe("parseOhneMaklerListe", () => {
  const liste = parseOhneMaklerListe(html);

  it("liest jede Karte einmal", () => {
    const ids = liste.map((a) => a.externalId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(15);
  });

  it("Schwabing: Kartenpreis ist Kaltmiete, Zimmer, Flaeche, PLZ, Stadtteil", () => {
    const a = liste.find((x) => x.externalId === "514116")!;
    expect(a).toMatchObject({
      quelle: "ohne-makler",
      url: "https://www.ohne-makler.net/immobilie/514116/",
      titel: "Zuhause mitten in Schwabing mit Garten",
      kaltmieteCents: 165_000,
      warmmieteCents: null,
      zimmer: 2,
      flaecheM2: 55,
      plz: "80804",
      stadtteil: "Schwabing",
      detailGeladen: false,
    });
    expect(a.bildUrls[0]).toMatch(/^https:\/\/media\.ohne-makler\.net\//);
  });

  it("Stadtteil auch ohne Klammer (München-Trudering)", () => {
    const a = liste.find((x) => x.externalId === "514132")!;
    expect(a.plz).toBe("81825");
    expect(a.stadtteil).toBe("Trudering");
  });
});
