import { describe, it, expect } from "vitest";
import { werteAusTitelzeile, fasseOhnePreisZusammen, ermittleLueckencodeOhnePreis } from "./titelzeile.js";

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

  it("liest '75000 €' ohne Tausenderpunkt als null statt als 0 Cent", () => {
    // Unbelegt in den 1758 echten Titeln (A13). Vor dem Fix griff PREIS die
    // letzten drei Ziffern ("000") und ergab still 0 Cent -- ein erfundener
    // Preis, der unmittelbar in den Kaufpreisfaktor eingegangen waere. Ein
    // still falscher Preis ist schlimmer als eine Fehlanzeige.
    const w = werteAusTitelzeile("Mehrfamilienhaus zum Kauf - West - 75000 € - 3 Zimmer, 90 m²");
    expect(w.preisCents).toBeNull();

    // Die beiden Formate, die in den 1758 echten Titeln tatsaechlich
    // vorkommen, duerfen der Fix nicht anfassen.
    expect(werteAusTitelzeile("Mehrfamilienhaus zum Kauf - Mitte - 750.000 € - 5 Zimmer").preisCents).toBe(
      75_000_000
    );
    expect(werteAusTitelzeile("Mehrfamilienhaus zum Kauf - Mitte - 1.234.567 € - 5 Zimmer").preisCents).toBe(
      123_456_700
    );
  });

  it("liest '5.00 €' mit unvollstaendiger Dreiergruppe als null statt als 0 Cent", () => {
    // Derselbe Fehler wie "75000 €", nur eine Stelle weiter: Der Lookbehind
    // vor PREIS sperrte nur eine Ziffer davor, nicht den Punkt. Damit durfte
    // hinter dem Punkt ein NEUER Preis anfangen -- "00" plus Euro-Zeichen,
    // also wieder 0 Cent. Auch dieser Titel muss eine Fehlanzeige ergeben und
    // faellt damit unter `preis_unlesbar`.
    expect(
      werteAusTitelzeile("Mehrfamilienhaus zum Kauf - West - 5.00 € - 3 Zimmer, 90 m²").preisCents
    ).toBeNull();

    // Das Komma-Format bleibt unangetastet.
    expect(
      werteAusTitelzeile("Mehrfamilienhaus zum Kauf - Mitte - 1.500,50 € - 5 Zimmer").preisCents
    ).toBe(150_050);
  });
});

/**
 * Zwei Lueckencodes statt einem (A13): "die Quelle nennt keinen Preis" ist
 * Markt, "der Titel enthaelt ein € aber das Muster greift nicht" ist eine
 * Regression im Parser. Ohne die Unterscheidung sehen beide Faelle in der
 * Diagnose gleich aus, dabei bedeutet nur der zweite, dass etwas kaputt ist.
 */
describe("ermittleLueckencodeOhnePreis", () => {
  it("erkennt 'Preis auf Anfrage' -- kein € im Titel -- als preis_auf_anfrage", () => {
    expect(
      ermittleLueckencodeOhnePreis("Mehrfamilienhaus zum Kauf - West - Preis auf Anfrage - 6 Zimmer")
    ).toBe("preis_auf_anfrage");
  });

  it("erkennt ein vorhandenes € mit nicht greifendem Muster als preis_unlesbar", () => {
    // Genau der A13-Fall: "75000 €" ohne Tausenderpunkt. Das Muster greift
    // nicht, aber die Quelle NENNT einen Preis -- das ist der Regressionsfall.
    expect(ermittleLueckencodeOhnePreis("Mehrfamilienhaus zum Kauf - West - 75000 € - 6 Zimmer")).toBe(
      "preis_unlesbar"
    );
  });
});

/**
 * Warum das eine eigene Funktion ist: Die Quote der Objekte ohne Preis
 * schwankte zwischen 0,5 % und 6,5 % je Lauf und sah damit wie eine
 * Verschlechterung aus. Gemessen ist es ein Regionseffekt -- der
 * 6,5-%-Lauf zog seine ganze Bewertungsscheibe aus Baden-Wuerttemberg, die
 * 0-%-Laeufe aus Nordrhein-Westfalen. Ohne die Aufschluesselung im
 * Laufprotokoll liest sich jeder bw-Lauf wie ein Rueckschritt (Backlog A13).
 */
describe("fasseOhnePreisZusammen", () => {
  it("nennt bei null Faellen keine Region", () => {
    expect(fasseOhnePreisZusammen([])).toBe("0 ohne Preisangabe uebersprungen.");
  });

  it("schluesselt nach Fundort auf", () => {
    const faelle = [
      { fundort: "bw", titleLine: "a" },
      { fundort: "bw", titleLine: "b" },
      { fundort: "nw", titleLine: "c" },
    ];
    // "a", "b", "c" enthalten kein € -- alle drei zaehlen als
    // preis_auf_anfrage, die Fundort-Aufschluesselung bleibt erhalten.
    expect(fasseOhnePreisZusammen(faelle)).toBe(
      "3 ohne Preisangabe uebersprungen: preis_auf_anfrage 3 (bw 2, nw 1), preis_unlesbar 0."
    );
  });

  it("weist preis_auf_anfrage und preis_unlesbar getrennt aus -- je nach Fundort", () => {
    // Genau die Unterscheidung aus A13: eine steigende preis_unlesbar-Quote
    // zeigt eine Regression, eine steigende preis_auf_anfrage-Quote ist Markt.
    const faelle = [
      { fundort: "bw", titleLine: "Haus - West - Preis auf Anfrage - 3 Zimmer" },
      { fundort: "bw", titleLine: "Haus - West - 75000 € - 3 Zimmer" },
      { fundort: "nw", titleLine: "Haus - Ost - Preis auf Anfrage - 2 Zimmer" },
    ];
    expect(fasseOhnePreisZusammen(faelle)).toBe(
      "3 ohne Preisangabe uebersprungen: preis_auf_anfrage 2 (bw 1, nw 1), preis_unlesbar 1 (bw 1)."
    );
  });

  it("sortiert die groesste Region nach vorn", () => {
    const faelle = [
      { fundort: "hb", titleLine: "a" },
      { fundort: "nw", titleLine: "b" },
      { fundort: "nw", titleLine: "c" },
    ];
    expect(fasseOhnePreisZusammen(faelle)).toContain("(nw 2, hb 1)");
  });

  it("macht einen fehlenden Fundort sichtbar statt ihn zu verschweigen", () => {
    expect(fasseOhnePreisZusammen([{ fundort: null, titleLine: "a" }])).toBe(
      "1 ohne Preisangabe uebersprungen: preis_auf_anfrage 1 (ohne Fundort 1), preis_unlesbar 0."
    );
  });
});
