import { describe, it, expect } from "vitest";
import { kautionCents } from "./kaution.js";

describe("kautionCents", () => {
  it("liest Betraege", () => {
    expect(kautionCents("3.072,00 €", 102_400)).toBe(307_200);
    expect(kautionCents("3.240,00", null)).toBe(324_000);
    expect(kautionCents("5.000 €", null)).toBe(500_000);
  });
  it("rechnet Vielfache der Kaltmiete", () => {
    expect(kautionCents("3 Kaltmieten", 100_000)).toBe(300_000);
    expect(kautionCents("3", 100_000)).toBe(300_000);
    expect(kautionCents("2 MM", 100_000)).toBe(200_000);
  });
  it("leer oder unklar ist null", () => {
    expect(kautionCents(null, 100_000)).toBeNull();
    expect(kautionCents("nach Vereinbarung", 100_000)).toBeNull();
    expect(kautionCents("3 Kaltmieten", null)).toBeNull();
  });
});
