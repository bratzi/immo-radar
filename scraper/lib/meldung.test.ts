import { describe, it, expect } from "vitest";
import { leeresAngebot } from "./typen.js";
import { formatTrefferMessage, formatPreissenkungMessage } from "./meldung.js";

const JETZT = new Date("2026-11-11T12:00:00Z");
const a = leeresAngebot({
  quelle: "immowelt", externalId: "e", url: "https://www.immowelt.de/expose/e", titel: "Helle 2,5-Zimmer-Wohnung",
  warmmieteCents: 124_000, warmmieteQuelle: "angegeben", zimmer: 2.5, flaecheM2: 52, balkon: "ja",
  balkonBeleg: "sonniger Südbalkon", plz: "80797", stadtteil: "Schwabing-West", verfuegbarAb: "01.01.2027",
  veroeffentlichtAm: "2026-11-11T11:20:00Z",
});

describe("formatTrefferMessage", () => {
  it("enthaelt Stadtteil, Warmmiete, Zimmer, Flaeche, Preis je m2, Balkonbeleg, Quelle, Alter, Link", () => {
    const t = formatTrefferMessage(a, JETZT);
    expect(t).toContain("Schwabing-West");
    expect(t).toContain("1.240 € warm");
    expect(t).toContain("2,5 Zi");
    expect(t).toContain("52 m²");
    expect(t).toContain("23,8 €/m²");
    expect(t).toContain("Balkon: sonniger Südbalkon");
    expect(t).toContain("Immowelt");
    expect(t).toContain("vor 40 min");
    expect(t).toContain("https://www.immowelt.de/expose/e");
    expect(t).not.toContain("geschätzt");
  });
  it("markiert geschaetzte Warmmiete", () => {
    expect(formatTrefferMessage({ ...a, warmmieteQuelle: "geschaetzt" }, JETZT)).toContain("Warmmiete geschätzt");
  });
  it("faellt ohne Stadtteil auf PLZ zurueck", () => {
    expect(formatTrefferMessage({ ...a, stadtteil: null }, JETZT)).toContain("80797");
  });
  it("escaped HTML im Titel", () => {
    expect(formatTrefferMessage({ ...a, balkonBeleg: "<b>Balkon</b>" }, JETZT)).toContain("&lt;b&gt;");
  });
});

describe("formatPreissenkungMessage", () => {
  it("zeigt alt und neu", () => {
    const t = formatPreissenkungMessage(a, 130_000);
    expect(t).toContain("1.300 €");
    expect(t).toContain("1.240 €");
    expect(t).toContain("https://www.immowelt.de/expose/e");
  });
});
