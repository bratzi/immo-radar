import { describe, it, expect } from "vitest";
import { ermittleJahreskaltmiete } from "./rentEstimate.js";

describe("ermittleJahreskaltmiete", () => {
  it("nutzt die angegebene Miete, wenn vorhanden", () => {
    const r = ermittleJahreskaltmiete(1200, 100);
    expect(r.jahreskaltmiete).toBe(1200 * 12);
    expect(r.quelle).toBe("angegeben");
  });

  it("schätzt bundesweit, wenn keine Miete angegeben ist", () => {
    const r = ermittleJahreskaltmiete(null, 100);
    expect(r.quelle).toBe("geschaetzt_bundesweit");
    expect(r.jahreskaltmiete).toBeGreaterThan(0);
  });

  it("schätzt bundesweit auch bei 0 oder negativer Angabe", () => {
    const r = ermittleJahreskaltmiete(0, 100);
    expect(r.quelle).toBe("geschaetzt_bundesweit");
  });
});
