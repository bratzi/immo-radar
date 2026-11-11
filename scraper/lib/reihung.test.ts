import { describe, it, expect } from "vitest";
import { leeresAngebot } from "./typen.js";
import { berechnePunkte, sortiereTreffer } from "./reihung.js";

const JETZT = new Date("2026-11-11T12:00:00Z");
const basis = () => leeresAngebot({
  quelle: "immowelt", externalId: "a", url: "u", titel: "t",
  warmmieteCents: 125_000, warmmieteQuelle: "geschaetzt", zimmer: 2, flaecheM2: 45, plz: "81929",
});

describe("berechnePunkte", () => {
  it("Basis ohne Bonus: 0 (27,8 Euro je m2, Ring 3, alt, geschaetzt)", () => {
    expect(berechnePunkte(basis(), JETZT)).toBe(0);
  });
  it("Balkon ja +15, nein und unbekannt 0", () => {
    const a = basis(); a.balkon = "ja"; expect(berechnePunkte(a, JETZT)).toBe(15);
    a.balkon = "nein"; expect(berechnePunkte(a, JETZT)).toBe(0);
  });
  it("3 Zimmer +30", () => { const a = basis(); a.zimmer = 3; expect(berechnePunkte(a, JETZT)).toBe(30); });
  it("unter 22 Euro je m2 +20, unter 25 +10", () => {
    const a = basis(); a.flaecheM2 = 60; // 20,83
    expect(berechnePunkte(a, JETZT)).toBe(20);
    a.flaecheM2 = 52; // 24,04
    expect(berechnePunkte(a, JETZT)).toBe(10);
  });
  it("Ring 1 +15, Ring 2 +5", () => {
    const a = basis(); a.plz = "80802"; expect(berechnePunkte(a, JETZT)).toBe(15);
    a.plz = "80687"; expect(berechnePunkte(a, JETZT)).toBe(5);
  });
  it("juenger als 2 h +10", () => {
    const a = basis(); a.veroeffentlichtAm = "2026-11-11T10:30:00Z";
    expect(berechnePunkte(a, JETZT)).toBe(10);
    a.veroeffentlichtAm = "2026-11-11T09:30:00Z";
    expect(berechnePunkte(a, JETZT)).toBe(0);
  });
  it("Warmmiete angegeben +5", () => { const a = basis(); a.warmmieteQuelle = "angegeben"; expect(berechnePunkte(a, JETZT)).toBe(5); });
});

describe("sortiereTreffer", () => {
  it("hoechste Punkte zuerst, bei Gleichstand nach externalId", () => {
    const s = sortiereTreffer([{ punkte: 5, externalId: "b" }, { punkte: 30, externalId: "z" }, { punkte: 5, externalId: "a" }]);
    expect(s.map((x) => x.externalId)).toEqual(["z", "a", "b"]);
  });
});
