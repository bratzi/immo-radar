import { describe, it, expect } from "vitest";
import { werteAusTitelzeile } from "./titelzeile.js";

/**
 * Alle Zeichenketten hier stammen WOERTLICH aus einer echten Immowelt-
 * Ergebnisliste (Bremen, Prueflauf auf einem GitHub-Runner am 2026-09-08).
 *
 * WARUM AUS DER TITELZEILE: Immowelts Detailseiten antworten von
 * Rechenzentrums-Adressen mit HTTP 403 und DataDome-CAPTCHA, die Suchseite im
 * selben Lauf mit HTTP 200. Die Bewertung muss deshalb aus der Ergebnisliste
 * kommen -- und dort steht alles Noetige im `title`-Attribut der Karte, das
 * der Sweep ohnehin schon einsammelt.
 */
describe("werteAusTitelzeile", () => {
  it("liest Preis, Zimmer, Wohnflaeche und Grundstueck", () => {
    const w = werteAusTitelzeile(
      "Mehrfamilienhaus zum Kauf - West - 75.000 € - 8 Zimmer, 158,7 m², 184 m² Grundstück"
    );
    expect(w.preisCents).toBe(7_500_000);
    expect(w.zimmer).toBe(8);
    expect(w.wohnflaecheM2).toBe(158.7);
    expect(w.grundstueckM2).toBe(184);
    expect(w.lage).toBe("West");
  });

  it("kommt mit einem Zusatz hinter dem Grundstueck zurecht", () => {
    const w = werteAusTitelzeile(
      "Mehrfamilienhaus zum Kauf - West - 179.000 € - 8 Zimmer, 200 m², 167 m² Grundstück, frei ab sofort"
    );
    expect(w.preisCents).toBe(17_900_000);
    expect(w.wohnflaecheM2).toBe(200);
    expect(w.grundstueckM2).toBe(167);
  });

  it("unterscheidet Wohnflaeche und Grundstueck sicher", () => {
    // Der teuerste denkbare Fehler: das Grundstueck als Wohnflaeche lesen.
    // Hier ist das Grundstueck mehr als viermal so gross -- die Miete und
    // damit der Kaufpreisfaktor waeren um denselben Faktor zu gut.
    const w = werteAusTitelzeile(
      "Mehrfamilienhaus zum Kauf - Nord - 195.000 € - 4 Zimmer, 80 m², 679 m² Grundstück"
    );
    expect(w.wohnflaecheM2).toBe(80);
    expect(w.grundstueckM2).toBe(679);
  });

  it("liefert null fuer alles, was nicht dasteht", () => {
    const w = werteAusTitelzeile("Mehrfamilienhaus zum Kauf");
    expect(w.preisCents).toBeNull();
    expect(w.wohnflaecheM2).toBeNull();
    expect(w.grundstueckM2).toBeNull();
    expect(w.zimmer).toBeNull();
    expect(w.lage).toBeNull();
  });

  it("liest einen Preis mit Tausenderpunkten ueber einer Million", () => {
    const w = werteAusTitelzeile(
      "Mehrfamilienhaus zum Kauf - Mitte - 1.250.000 € - 12 Zimmer, 420 m², 800 m² Grundstück"
    );
    expect(w.preisCents).toBe(125_000_000);
  });

  it("nimmt keinen Preis an, wenn nur 'Preis auf Anfrage' dasteht", () => {
    // Ein Objekt ohne Preis ist nicht bewertbar. Ein erfundener Preis waere
    // schlimmer als gar keiner.
    const w = werteAusTitelzeile("Mehrfamilienhaus zum Kauf - West - Preis auf Anfrage - 6 Zimmer, 140 m²");
    expect(w.preisCents).toBeNull();
    expect(w.wohnflaecheM2).toBe(140);
  });
});
