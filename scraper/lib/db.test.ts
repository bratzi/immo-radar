import { describe, it, expect } from "vitest";
import { diffVersion } from "./db.js";

describe("diffVersion", () => {
  it("meldet changed=true und priceDropped=false für die allererste Version", () => {
    const result = diffVersion({
      previous: null,
      current: { priceCents: 100_000_00, rentColdMonthlyCents: 100_000, units: 3 },
    });
    expect(result.changed).toBe(true);
    expect(result.priceDropped).toBe(false);
  });

  it("meldet changed=false wenn sich nichts geändert hat", () => {
    const werte = { priceCents: 100_000_00, rentColdMonthlyCents: 100_000, units: 3 };
    const result = diffVersion({ previous: werte, current: { ...werte } });
    expect(result.changed).toBe(false);
    expect(result.priceDropped).toBe(false);
  });

  it("erkennt eine Preissenkung", () => {
    const result = diffVersion({
      previous: { priceCents: 200_000_00, rentColdMonthlyCents: 100_000, units: 3 },
      current: { priceCents: 190_000_00, rentColdMonthlyCents: 100_000, units: 3 },
    });
    expect(result.changed).toBe(true);
    expect(result.priceDropped).toBe(true);
  });

  it("erkennt eine Preiserhöhung NICHT als priceDropped", () => {
    const result = diffVersion({
      previous: { priceCents: 190_000_00, rentColdMonthlyCents: 100_000, units: 3 },
      current: { priceCents: 200_000_00, rentColdMonthlyCents: 100_000, units: 3 },
    });
    expect(result.changed).toBe(true);
    expect(result.priceDropped).toBe(false);
  });
});
