import { describe, it, expect } from "vitest";
import { istFlaechendeckenderNullausfall } from "./index.js";

describe("istFlaechendeckenderNullausfall", () => {
  it("ist KEIN Ausfall, wenn nur ein Bundesland unter mehreren leer ist", () => {
    // Der reproduzierbare Normalfall (2026-09-07): bw, be, hh, mv, sh leer,
    // der Rest traegt die 188 Termine. Ein Lauf muss weiter loeschen duerfen.
    expect(istFlaechendeckenderNullausfall([0, 88, 0, 12, 0, 41, 0, 47])).toBe(false);
  });

  it("ist ein Ausfall, wenn JEDE erfasste Region null Treffer meldet", () => {
    // Signatur eines stillen Suchformular-Ausfalls: alle Regionen leer.
    expect(istFlaechendeckenderNullausfall([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(
      true
    );
  });

  it("ist KEIN Ausfall, wenn gar keine Region erfasst wurde", () => {
    // Alle sechzehn liefen in eine Ausnahme -- das hat die Vollstaendigkeit
    // schon an anderer Stelle gekippt, hier bleibt es false.
    expect(istFlaechendeckenderNullausfall([])).toBe(false);
  });

  it("ist KEIN Ausfall, sobald eine einzige Region Treffer hat", () => {
    expect(istFlaechendeckenderNullausfall([0, 0, 0, 1])).toBe(false);
  });
});
