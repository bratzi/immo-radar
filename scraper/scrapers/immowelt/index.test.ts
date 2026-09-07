import { describe, it, expect } from "vitest";
import { trefferzahlAusTitel, istRegionVollstaendig, IMMOWELT_REGIONEN } from "./index.js";

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

describe("istRegionVollstaendig", () => {
  it("gilt als unvollstaendig, wenn WEDER Trefferzahl NOCH Objekte ankamen", () => {
    // Signatur eines DataDome-Soft-Blocks: HTTP 200, aber leere Huelle --
    // kein parsebarer Titel, keine Karte. Ein echtes Bundesland hat weder
    // null Mehrfamilienhaeuser noch einen unlesbaren Titel.
    expect(istRegionVollstaendig(0, null)).toBe(false);
  });

  it("gilt als vollstaendig, wenn nur der Titel nicht parste, aber Objekte ankamen", () => {
    // Echte Seite, bloss ein geaenderter Titel -- daraus laesst sich nichts
    // gegen die Region ableiten, es bleibt bei der Seitendeckel-Pruefung.
    expect(istRegionVollstaendig(41, null)).toBe(true);
  });

  it("ist unvollstaendig, wenn nichts eingesammelt wurde -- selbst bei 0 gemeldeten Treffern", () => {
    // 0/0 ist zwar in sich stimmig, aber null eingesammelte Objekte sind nie
    // ein Beleg fuer Vollstaendigkeit: eine geblockte Huelle kann einen Titel
    // tragen, der zu null Treffern parst. Null gesammelt -> immer false.
    expect(istRegionVollstaendig(0, 0)).toBe(false);
  });

  it("ist unvollstaendig, wenn nichts eingesammelt wurde, obwohl Treffer gemeldet sind", () => {
    expect(istRegionVollstaendig(0, 120)).toBe(false);
  });

  it("ist unvollstaendig, wenn die Menge weit unter der gemeldeten Zahl liegt", () => {
    // Bremen im Smoke-Test: 41 von 209 eingesammelt (nur Seite 1).
    expect(istRegionVollstaendig(41, 209)).toBe(false);
  });

  it("ist vollstaendig, wenn die Menge innerhalb der 25-%-Toleranz bleibt", () => {
    // 160 von 209 -> Fehlbetrag 23 %, noch im Rahmen.
    expect(istRegionVollstaendig(160, 209)).toBe(true);
  });

  it("ist vollstaendig, wenn mehr eingesammelt als gemeldet wurde", () => {
    expect(istRegionVollstaendig(250, 209)).toBe(true);
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
