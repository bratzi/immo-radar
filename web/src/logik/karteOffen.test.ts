import { describe, expect, it } from "vitest";
import { KARTE_OFFEN_SCHLUESSEL, liesKarteOffen, schreibeKarteOffen } from "./karteOffen.ts";

const mit = (wert: string | null) => ({
  getItem: (schluessel: string) => (schluessel === KARTE_OFFEN_SCHLUESSEL ? wert : null),
});

describe("liesKarteOffen -- im Zweifel offen, nie versteckt", () => {
  it("ist offen, wenn nichts gemerkt ist (erster Besuch)", () => {
    expect(liesKarteOffen(mit(null))).toBe(true);
  });

  it("ist zu, wenn zugeklappt gemerkt ist", () => {
    expect(liesKarteOffen(mit("0"))).toBe(false);
  });

  it("ist offen, wenn offen gemerkt ist", () => {
    expect(liesKarteOffen(mit("1"))).toBe(true);
  });

  it("ist offen bei jedem anderen Wert -- ein kaputter Eintrag versteckt die Karte nicht", () => {
    expect(liesKarteOffen(mit("vielleicht"))).toBe(true);
    expect(liesKarteOffen(mit(""))).toBe(true);
  });

  it("ist offen ohne Speicher", () => {
    expect(liesKarteOffen(null)).toBe(true);
  });

  it("ist offen, wenn der Zugriff wirft (blockierte Website-Daten)", () => {
    const wirft = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    expect(liesKarteOffen(wirft)).toBe(true);
  });
});

describe("schreibeKarteOffen", () => {
  it("schreibt 1 fuer offen und 0 fuer zu", () => {
    const eintraege = new Map<string, string>();
    const speicher = { setItem: (k: string, v: string) => void eintraege.set(k, v) };
    schreibeKarteOffen(speicher, false);
    expect(eintraege.get(KARTE_OFFEN_SCHLUESSEL)).toBe("0");
    schreibeKarteOffen(speicher, true);
    expect(eintraege.get(KARTE_OFFEN_SCHLUESSEL)).toBe("1");
  });

  it("wirft nicht, wenn es keinen Speicher gibt", () => {
    expect(() => schreibeKarteOffen(null, true)).not.toThrow();
  });

  it("wirft nicht, wenn der Speicher voll oder gesperrt ist", () => {
    const wirft = {
      setItem: () => {
        throw new DOMException("voll", "QuotaExceededError");
      },
    };
    expect(() => schreibeKarteOffen(wirft, false)).not.toThrow();
  });
});
