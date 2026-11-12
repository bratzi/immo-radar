import { describe, it, expect } from "vitest";
import { istMuenchen, ringFuerPlz } from "./muenchenPlz.js";

describe("istMuenchen", () => {
  it("nimmt Stadtgebiet an", () => {
    expect(istMuenchen("80331")).toBe(true);
    expect(istMuenchen("81929")).toBe(true);
  });
  it("weist Umland ab", () => {
    expect(istMuenchen("82031")).toBe(false); // Gruenwald
    expect(istMuenchen("85521")).toBe(false); // Ottobrunn
    expect(istMuenchen("80330")).toBe(false);
  });
  it("nimmt das Umland in der Suedwest-Bucht der Stadtgrenze an (Nutzer 2026-11-12)", () => {
    expect(istMuenchen("82061")).toBe(true); // Neuried
    expect(istMuenchen("82152")).toBe(true); // Planegg, Martinsried
    expect(istMuenchen("82166")).toBe(true); // Graefelfing
    expect(ringFuerPlz("82061")).toBe(3);
  });
});

describe("ringFuerPlz", () => {
  it("Altstadt, Maxvorstadt, Schwabing, Haidhausen sind Ring 1", () => {
    expect(ringFuerPlz("80331")).toBe(1);
    expect(ringFuerPlz("80799")).toBe(1);
    expect(ringFuerPlz("80802")).toBe(1);
    expect(ringFuerPlz("81667")).toBe(1);
  });
  it("Laim, Sendling, Bogenhausen sind Ring 2", () => {
    expect(ringFuerPlz("80687")).toBe(2);
    expect(ringFuerPlz("81369")).toBe(2);
    expect(ringFuerPlz("81675")).toBe(2);
  });
  it("Rest ist Ring 3", () => {
    expect(ringFuerPlz("81929")).toBe(3);
    expect(ringFuerPlz("80995")).toBe(3);
  });
});
