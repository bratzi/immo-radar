import { describe, it, expect } from "vitest";
import { bestimmeWarmmiete } from "./warmmiete.js";

describe("bestimmeWarmmiete", () => {
  it("angegebene Warmmiete gewinnt", () => {
    expect(bestimmeWarmmiete({ kaltmieteCents: 90_000, nebenkostenCents: 20_000, warmmieteCents: 115_000 }))
      .toEqual({ warmmieteCents: 115_000, warmmieteQuelle: "angegeben" });
  });
  it("sonst Kalt plus Nebenkosten", () => {
    expect(bestimmeWarmmiete({ kaltmieteCents: 90_000, nebenkostenCents: 20_000, warmmieteCents: null }))
      .toEqual({ warmmieteCents: 110_000, warmmieteQuelle: "kalt_plus_nk" });
  });
  it("sonst Kalt mal 1,25, gerundet, als Schaetzung", () => {
    expect(bestimmeWarmmiete({ kaltmieteCents: 99_999, nebenkostenCents: null, warmmieteCents: null }))
      .toEqual({ warmmieteCents: 124_999, warmmieteQuelle: "geschaetzt" });
  });
  it("ohne Kaltmiete unbekannt", () => {
    expect(bestimmeWarmmiete({ kaltmieteCents: null, nebenkostenCents: 20_000, warmmieteCents: null }))
      .toEqual({ warmmieteCents: null, warmmieteQuelle: "unbekannt" });
  });
  it("Warmmiete 0 gilt als nicht angegeben", () => {
    expect(bestimmeWarmmiete({ kaltmieteCents: 80_000, nebenkostenCents: null, warmmieteCents: 0 }).warmmieteQuelle)
      .toBe("geschaetzt");
  });
});
