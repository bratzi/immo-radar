import { describe, it, expect } from "vitest";
import { median, pruefeMengenplausibilitaet } from "./plausibilitaet.js";

describe("median", () => {
  it("liefert null fuer eine leere Liste", () => {
    expect(median([])).toBeNull();
  });

  it("liefert bei ungerader Anzahl den mittleren Wert", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("liefert bei gerader Anzahl das Mittel der beiden mittleren Werte", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("laesst die Eingabeliste unveraendert", () => {
    const werte = [5, 1, 3];
    median(werte);
    expect(werte).toEqual([5, 1, 3]);
  });
});

describe("pruefeMengenplausibilitaet", () => {
  const historieOk = [500, 510, 490, 505, 495];

  it("verbietet das Loeschen, wenn der Sweep unvollstaendig war", () => {
    const e = pruefeMengenplausibilitaet({
      gesehene: 500,
      gemeldeteTreffer: null,
      historie: historieOk,
      vollstaendig: false,
    });
    expect(e.loeschenErlaubt).toBe(false);
    expect(e.grund).toContain("unvollständig");
  });

  it("verbietet das Loeschen bei weniger als drei Referenzlaeufen", () => {
    const e = pruefeMengenplausibilitaet({
      gesehene: 500,
      gemeldeteTreffer: null,
      historie: [500, 510],
      vollstaendig: true,
    });
    expect(e.loeschenErlaubt).toBe(false);
    expect(e.grund).toContain("Referenzläufe");
  });

  it("erlaubt das Loeschen ab drei Referenzlaeufen bei stabiler Menge", () => {
    const e = pruefeMengenplausibilitaet({
      gesehene: 500,
      gemeldeteTreffer: null,
      historie: [500, 510, 490],
      vollstaendig: true,
    });
    expect(e.loeschenErlaubt).toBe(true);
    expect(e.grund).toBeNull();
  });

  it("erlaubt eine Abweichung knapp innerhalb der Toleranz", () => {
    // Median 500, -24 % = 380
    const e = pruefeMengenplausibilitaet({
      gesehene: 380,
      gemeldeteTreffer: null,
      historie: historieOk,
      vollstaendig: true,
    });
    expect(e.loeschenErlaubt).toBe(true);
  });

  it("verbietet eine Abweichung knapp ausserhalb der Toleranz nach unten", () => {
    // Median 500, -26 % = 370
    const e = pruefeMengenplausibilitaet({
      gesehene: 370,
      gemeldeteTreffer: null,
      historie: historieOk,
      vollstaendig: true,
    });
    expect(e.loeschenErlaubt).toBe(false);
    expect(e.erwartet).toBe(500);
    expect(e.grund).toContain("weicht");
  });

  it("verbietet eine Abweichung nach oben genauso", () => {
    const e = pruefeMengenplausibilitaet({
      gesehene: 700,
      gemeldeteTreffer: null,
      historie: historieOk,
      vollstaendig: true,
    });
    expect(e.loeschenErlaubt).toBe(false);
  });

  it("verbietet das Loeschen, wenn die ausgewiesene Trefferzahl stark abweicht", () => {
    const e = pruefeMengenplausibilitaet({
      gesehene: 300,
      gemeldeteTreffer: 500,
      historie: [300, 305, 295],
      vollstaendig: true,
    });
    expect(e.loeschenErlaubt).toBe(false);
    expect(e.grund).toContain("Trefferzahl");
  });

  it("ignoriert die Selbstkonsistenz, wenn das Portal keine Trefferzahl nennt", () => {
    // zvg-portal.de weist keine Gesamtzahl aus -- dort greift nur die Historie.
    const e = pruefeMengenplausibilitaet({
      gesehene: 500,
      gemeldeteTreffer: null,
      historie: historieOk,
      vollstaendig: true,
    });
    expect(e.loeschenErlaubt).toBe(true);
  });

  it("erlaubt das Loeschen, wenn gesehene und ausgewiesene Zahl zusammenpassen", () => {
    const e = pruefeMengenplausibilitaet({
      gesehene: 495,
      gemeldeteTreffer: 500,
      historie: historieOk,
      vollstaendig: true,
    });
    expect(e.loeschenErlaubt).toBe(true);
  });

  // --- Nullmengen: die Symptome eines Soft-Blocks, nicht ein leeres Portal ---

  it("verbietet das Loeschen, wenn der Lauf ueberhaupt nichts eingesammelt hat", () => {
    // Genau der DataDome-Fall: HTTP 200, leere Huelle, 0 Karten, keine
    // Trefferzahl. Ohne diese Wache waere das ein 100-%-Abgang.
    const e = pruefeMengenplausibilitaet({
      gesehene: 0,
      gemeldeteTreffer: null,
      historie: historieOk,
      vollstaendig: true,
    });
    expect(e.loeschenErlaubt).toBe(false);
    expect(e.grund).toContain("nichts eingesammelt");
  });

  it("verbietet das Loeschen auch bei 0 gesehenen und gemeldeten 0 Treffern", () => {
    const e = pruefeMengenplausibilitaet({
      gesehene: 0,
      gemeldeteTreffer: 0,
      historie: historieOk,
      vollstaendig: true,
    });
    expect(e.loeschenErlaubt).toBe(false);
    expect(e.grund).toContain("nichts eingesammelt");
  });

  it("verbietet das Loeschen, wenn der Median der Referenzlaeufe null ist", () => {
    // Drei Nulllaeufe hintereinander machten den Median 0 -- die alte
    // Fassung uebersprang die Medianpruefung dann und gab das Loeschen frei.
    const e = pruefeMengenplausibilitaet({
      gesehene: 5,
      gemeldeteTreffer: null,
      historie: [0, 0, 0],
      vollstaendig: true,
    });
    expect(e.loeschenErlaubt).toBe(false);
    expect(e.grund).toContain("Median");
    expect(e.grund).not.toContain("nichts eingesammelt");
  });

  it("erlaubt das Loeschen bei einzelnen Nulllaeufen in der Historie, solange der Median positiv ist", () => {
    // Median von [0, 500, 510] ist 500 -- ein Ausreisser reisst die Referenz
    // nicht mit, genau dafuer ist der Median da.
    const e = pruefeMengenplausibilitaet({
      gesehene: 500,
      gemeldeteTreffer: null,
      historie: [0, 500, 510],
      vollstaendig: true,
    });
    expect(e.loeschenErlaubt).toBe(true);
    expect(e.grund).toBeNull();
  });
});
