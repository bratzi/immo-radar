import { describe, expect, it } from "vitest";
import type { SnapshotObjekt } from "../daten/snapshot.ts";
import { laenderOhneAbgangserkennung, zaehleZustaende } from "./regionen.ts";

function objekt(teil: Partial<SnapshotObjekt> = {}): SnapshotObjekt {
  return {
    id: Math.random().toString(36),
    quelle: "immowelt",
    url: null,
    titel: null,
    ort: null,
    bundesland: "Sachsen",
    plz: null,
    kaufpreisEuro: 1,
    wohnflaecheM2: 1,
    grundstueckM2: null,
    baujahr: null,
    einheiten: null,
    einheitenAngenommen: true,
    stufe: "S1",
    trefferklasse: "normal",
    rangzahl: 1,
    band: null,
    istSchwellenwechsler: false,
    zustand: "verfuegbar",
    datenluecken: [],
    preisGesenkt: false,
    zuletztGesehen: null,
    abgaengigSeit: null,
    termin: null,
    ...teil,
  };
}

describe("laenderOhneAbgangserkennung", () => {
  it("nennt ein Land, aus dem ueber die Hauptquelle KEIN einziger Abgang erkannt wurde", () => {
    const land = laenderOhneAbgangserkennung([
      objekt({ bundesland: "Bayern", abgaengigSeit: "2026-09-01T00:00:00Z" }),
      objekt({ bundesland: "Bayern" }),
      objekt({ bundesland: "Baden-Württemberg" }),
      objekt({ bundesland: "Baden-Württemberg" }),
    ]);
    expect(land).toEqual(["Baden-Württemberg"]);
  });

  it("zaehlt AUSSCHLIESSLICH die Hauptquelle -- ein ZVG-Abgang widerlegt nichts", () => {
    // Der Befund, der diese Funktion noetig gemacht hat: In
    // Nordrhein-Westfalen stehen 4.384 Immowelt-Objekte ohne einen einzigen
    // Abgang, aber 2 ZVG-Abgaenge. Ueber ALLE Quellen gezaehlt fiele NRW
    // heraus -- ausgerechnet die Region, die A15 als erste nennt. Die beiden
    // Quellen werden von verschiedenen Sweeps bedient; nur der Immowelt-Sweep
    // ist es, der seine Trefferzahl nicht ausweist.
    const land = laenderOhneAbgangserkennung([
      objekt({ bundesland: "Nordrhein-Westfalen", quelle: "immowelt" }),
      objekt({ bundesland: "Nordrhein-Westfalen", quelle: "immowelt" }),
      objekt({
        bundesland: "Nordrhein-Westfalen",
        quelle: "zvg-portal",
        abgaengigSeit: "2026-09-01T00:00:00Z",
      }),
    ]);
    expect(land).toEqual(["Nordrhein-Westfalen"]);
  });

  it("nennt ein Land NICHT, wenn es ueberhaupt keine Objekte der Hauptquelle hat", () => {
    // Ohne beobachtete Objekte ist "kein Abgang erkannt" keine Aussage
    // ueber die Region, sondern nur ueber die Leere.
    const land = laenderOhneAbgangserkennung([
      objekt({ bundesland: "Bremen", quelle: "zvg-portal" }),
    ]);
    expect(land).toEqual([]);
  });

  it("uebergeht Objekte ohne Bundesland", () => {
    expect(laenderOhneAbgangserkennung([objekt({ bundesland: null })])).toEqual([]);
  });

  it("gibt die Laender alphabetisch und ohne Wiederholung zurueck", () => {
    const land = laenderOhneAbgangserkennung([
      objekt({ bundesland: "Schleswig-Holstein" }),
      objekt({ bundesland: "Schleswig-Holstein" }),
      objekt({ bundesland: "Mecklenburg-Vorpommern" }),
    ]);
    expect(land).toEqual(["Mecklenburg-Vorpommern", "Schleswig-Holstein"]);
  });

  it("kommt mit einer leeren Menge zurecht", () => {
    expect(laenderOhneAbgangserkennung([])).toEqual([]);
  });
});

describe("zaehleZustaende", () => {
  it("zaehlt die drei Zustaende", () => {
    expect(
      zaehleZustaende([
        objekt({ zustand: "verfuegbar" }),
        objekt({ zustand: "unbestaetigt" }),
        objekt({ zustand: "unbestaetigt" }),
        objekt({ zustand: "abgaengig" }),
      ])
    ).toEqual({ verfuegbar: 1, unbestaetigt: 2, abgaengig: 1, gesamt: 4 });
  });

  it("kommt mit einer leeren Menge zurecht und gibt keine Anteile aus dem Nichts", () => {
    expect(zaehleZustaende([])).toEqual({
      verfuegbar: 0,
      unbestaetigt: 0,
      abgaengig: 0,
      gesamt: 0,
    });
  });
});
