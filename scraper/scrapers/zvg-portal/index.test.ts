import { describe, it, expect } from "vitest";
import { bundeslaenderInLaufReihenfolge } from "./index.js";

const CODES = ["bw", "by", "be", "br"];

describe("bundeslaenderInLaufReihenfolge", () => {
  it("gibt bei Versatz 0 die unveränderte Reihenfolge zurück", () => {
    expect(bundeslaenderInLaufReihenfolge(CODES, 0)).toEqual(["bw", "by", "be", "br"]);
  });

  it("rotiert den Startpunkt und behält alle Codes genau einmal", () => {
    expect(bundeslaenderInLaufReihenfolge(CODES, 2)).toEqual(["be", "br", "bw", "by"]);
  });

  it("rechnet einen Versatz größer als die Liste modulo herunter", () => {
    expect(bundeslaenderInLaufReihenfolge(CODES, 6)).toEqual(["be", "br", "bw", "by"]);
  });

  it("verliert bei keinem Versatz einen Code (Schutz vor Aushungern)", () => {
    for (let versatz = 0; versatz < 24; versatz += 1) {
      const reihenfolge = bundeslaenderInLaufReihenfolge(CODES, versatz);
      expect(reihenfolge).toHaveLength(CODES.length);
      expect([...reihenfolge].sort()).toEqual([...CODES].sort());
    }
  });

  it("kommt mit einer leeren Liste klar", () => {
    expect(bundeslaenderInLaufReihenfolge([], 3)).toEqual([]);
  });
});
