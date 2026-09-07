import { describe, it, expect } from "vitest";
import { trefferzahlAusTitel, IMMOWELT_REGIONEN } from "./index.js";

describe("trefferzahlAusTitel", () => {
  it("liest die Zahl aus einem echten Bundesland-Titel", () => {
    expect(
      trefferzahlAusTitel("Mehrfamilienhaus kaufen in Nordrhein-Westfalen - 7.505 Angebote | immowelt")
    ).toBe(7505);
  });

  it("liest auch eine Zahl ohne Tausenderpunkt", () => {
    expect(trefferzahlAusTitel("Mehrfamilienhaus kaufen in Bremen - 209 Angebote | immowelt")).toBe(209);
  });

  it("liefert null, wenn der Titel keine Trefferzahl nennt", () => {
    expect(trefferzahlAusTitel("Mehrfamilienhaus als Kapitalanlage kaufen | immowelt")).toBeNull();
  });
});

describe("IMMOWELT_REGIONEN", () => {
  it("deckt alle 16 Bundeslaender ab", () => {
    expect(IMMOWELT_REGIONEN).toHaveLength(16);
  });

  it("hat eindeutige Codes", () => {
    const codes = IMMOWELT_REGIONEN.map((r) => r.code);
    expect(new Set(codes).size).toBe(16);
  });

  it("traegt bei jedem Eintrag eine Geo-Id im Pfad -- ohne sie liefert Immowelt HTTP 410", () => {
    for (const region of IMMOWELT_REGIONEN) {
      expect(region.pfad).toMatch(/\/ad\d{2}de\d+$/);
    }
  });
});
