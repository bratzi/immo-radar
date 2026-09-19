import { describe, expect, it } from "vitest";
import { platziereTooltip } from "./tooltipPosition.ts";

const behaelter = { breite: 1000, hoehe: 800 };
const tip = { breite: 200, hoehe: 100 };

describe("platziereTooltip", () => {
  it("setzt das Tooltip mittig ueber den Anker", () => {
    // mitte = 400 + 40/2 - 200/2 = 320 ; oben = 300 - 8 - 100 = 192
    expect(platziereTooltip({ x: 400, y: 300, breite: 40, hoehe: 24 }, tip, behaelter)).toEqual({
      links: 320,
      oben: 192,
      unterhalb: false,
    });
  });

  it("klappt nach unten, wenn oben kein Platz ist", () => {
    // oben waere 50 - 8 - 100 < 0 ; unten = 50 + 24 + 8 = 82
    expect(platziereTooltip({ x: 400, y: 50, breite: 40, hoehe: 24 }, tip, behaelter)).toEqual({
      links: 320,
      oben: 82,
      unterhalb: true,
    });
  });

  it("haelt das Tooltip am linken Rand", () => {
    expect(platziereTooltip({ x: 0, y: 300, breite: 20, hoehe: 24 }, tip, behaelter).links).toBe(0);
  });

  it("haelt das Tooltip am rechten Rand", () => {
    expect(platziereTooltip({ x: 990, y: 300, breite: 10, hoehe: 24 }, tip, behaelter).links).toBe(800);
  });

  it("bleibt am linken Rand, wenn es breiter ist als der Behaelter", () => {
    const breit = { breite: 1200, hoehe: 100 };
    expect(platziereTooltip({ x: 500, y: 300, breite: 40, hoehe: 24 }, breit, behaelter).links).toBe(0);
  });

  it("bleibt auch in der Hoehe im Behaelter", () => {
    // Weder oben (60 - 8 - 100 < 0) noch unten (60 + 24 + 8 + 100 > 150) passt es:
    // dann so weit wie moeglich nach unten geklemmt.
    const lage = platziereTooltip({ x: 400, y: 60, breite: 40, hoehe: 24 }, tip, { breite: 1000, hoehe: 150 });
    expect(lage).toEqual({ links: 320, oben: 50, unterhalb: true });
  });

  it("kennt einen eigenen Abstand", () => {
    expect(
      platziereTooltip({ x: 400, y: 300, breite: 40, hoehe: 24 }, tip, behaelter, 20).oben
    ).toBe(180);
  });
});
