import { describe, expect, it } from "vitest";
import { oeffnetTooltip } from "./tooltipAusloeser.ts";

describe("oeffnetTooltip", () => {
  it("oeffnet bei einem Mauszeiger", () => {
    expect(oeffnetTooltip({ art: "zeiger", zeigerArt: "mouse" })).toBe(true);
  });

  it("oeffnet auch bei einem Stift", () => {
    expect(oeffnetTooltip({ art: "zeiger", zeigerArt: "pen" })).toBe(true);
  });

  it("oeffnet NICHT bei einem Fingertipp -- der ist ein Klick, kein Hover", () => {
    expect(oeffnetTooltip({ art: "zeiger", zeigerArt: "touch" })).toBe(false);
  });

  it("oeffnet bei echtem Tastaturfokus", () => {
    expect(oeffnetTooltip({ art: "fokus", fokusSichtbar: true })).toBe(true);
  });

  it("oeffnet NICHT bei Fokus aus einem Klick -- sonst bliebe das Tooltip stehen", () => {
    expect(oeffnetTooltip({ art: "fokus", fokusSichtbar: false })).toBe(false);
  });
});
