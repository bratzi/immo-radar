import { describe, it, expect } from "vitest";
import { onlineSeitAusText } from "./onlineSeit.js";

const JETZT = new Date("2026-11-12T10:00:00Z");
const vor = (ms: number) => new Date(JETZT.getTime() - ms).toISOString();
const STD = 36e5, TAG = 864e5;

describe("onlineSeitAusText", () => {
  it.each([
    ["vor 8 Stunden", vor(8 * STD)],
    ["vor einer Stunde", vor(STD)],
    ["vor 25 Minuten", vor(25 * 6e4)],
    ["vor einem Tag", vor(TAG)],
    ["vor 3 Tagen", vor(3 * TAG)],
    ["vor 2 Wochen", vor(14 * TAG)],
    ["2 T.", vor(2 * TAG)],
    ["5 Std.", vor(5 * STD)],
    ["12 Min.", vor(12 * 6e4)],
    ["gerade eben", vor(0)],
  ])("relativ: %s", (text, erwartet) => {
    expect(onlineSeitAusText(text, JETZT)).toBe(erwartet);
  });

  it("Datum dd.mm.yyyy wird Mitternacht Berlin", () => {
    expect(onlineSeitAusText("06.11.2026", JETZT)).toBe("2026-11-05T23:00:00.000Z");
  });

  it("Unbekanntes bleibt null", () => {
    expect(onlineSeitAusText("demnächst", JETZT)).toBeNull();
    expect(onlineSeitAusText(undefined, JETZT)).toBeNull();
  });
});
