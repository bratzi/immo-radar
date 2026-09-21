import { describe, expect, it } from "vitest";
import { abbrechenNachProbe, PROBE_GROESSE } from "./probe.js";

describe("abbrechenNachProbe", () => {
  it("bricht ab, wenn die ersten Abrufe ALLE abgewiesen wurden", () => {
    // Der gemessene Fall: Ist Immowelts Sperre aktiv, scheitern nicht ein
    // paar Abrufe, sondern alle. 25 blind zu versuchen kostet vier Minuten
    // und schickt 25 Anfragen gegen eine Quelle, die gerade zumacht.
    expect(abbrechenNachProbe({ versucht: PROBE_GROESSE, erfasst: 0 })).toBe(true);
  });

  it("macht weiter, sobald auch nur EIN Abruf durchkam", () => {
    // 6 von 10 war die beste je gemessene Quote. Ein einzelner Erfolg heisst
    // also: die Sperre ist nicht total, der Rest lohnt sich.
    expect(abbrechenNachProbe({ versucht: PROBE_GROESSE, erfasst: 1 })).toBe(false);
  });

  it("entscheidet nicht, bevor die Probe voll ist", () => {
    // Nach einem einzelnen Fehlschlag abzubrechen waere Aberglaube -- auch
    // ein gesunder Lauf hat Ausfaelle.
    expect(abbrechenNachProbe({ versucht: 1, erfasst: 0 })).toBe(false);
    expect(abbrechenNachProbe({ versucht: PROBE_GROESSE - 1, erfasst: 0 })).toBe(false);
  });

  it("entscheidet nur EINMAL, nicht bei jedem weiteren Abruf", () => {
    // Sonst braeche ein spaeterer Lauf, der die Probe bestanden hat, doch
    // noch ab, sobald eine Strecke ohne Treffer kommt.
    expect(abbrechenNachProbe({ versucht: PROBE_GROESSE + 1, erfasst: 0 })).toBe(false);
    expect(abbrechenNachProbe({ versucht: 20, erfasst: 0 })).toBe(false);
  });

  it("haelt die Probe klein genug, dass ein Fehlschlag billig ist", () => {
    // Bei rund 10 s je Abruf kostet eine gescheiterte Probe eine halbe
    // Minute statt vier Minuten. Groesser darf sie nicht werden.
    expect(PROBE_GROESSE).toBeLessThanOrEqual(3);
    expect(PROBE_GROESSE).toBeGreaterThanOrEqual(2);
  });
});
