import { describe, it, expect } from "vitest";
import { istFlaechendeckenderNullausfall,
  beschreibeDetailFehler,
  ordneDetailErgebnisEin,
  verteileErgebnisse,
  fasseZvgDetailsZusammen,
  type DetailErgebnis,
} from "./index.js";
import { VerkehrswertFehltError, parseZvgDetailPage, type ZvgDetailData } from "./detail.js";
import type { ZvgListSummary } from "./list.js";

describe("istFlaechendeckenderNullausfall", () => {
  it("ist KEIN Ausfall, wenn nur ein Bundesland unter mehreren leer ist", () => {
    // Der reproduzierbare Normalfall (2026-09-07): bw, be, hh, mv, sh leer,
    // der Rest traegt die 188 Termine. Ein Lauf muss weiter loeschen duerfen.
    expect(istFlaechendeckenderNullausfall([0, 88, 0, 12, 0, 41, 0, 47])).toBe(false);
  });

  it("ist ein Ausfall, wenn JEDE erfasste Region null Treffer meldet", () => {
    // Signatur eines stillen Suchformular-Ausfalls: alle Regionen leer.
    expect(istFlaechendeckenderNullausfall([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(
      true
    );
  });

  it("ist KEIN Ausfall, wenn gar keine Region erfasst wurde", () => {
    // Alle sechzehn liefen in eine Ausnahme -- das hat die Vollstaendigkeit
    // schon an anderer Stelle gekippt, hier bleibt es false.
    expect(istFlaechendeckenderNullausfall([])).toBe(false);
  });

  it("ist KEIN Ausfall, sobald eine einzige Region Treffer hat", () => {
    expect(istFlaechendeckenderNullausfall([0, 0, 0, 1])).toBe(false);
  });
});

describe("beschreibeDetailFehler", () => {
  it("wertet ein fehlendes Verkehrswertfeld NICHT als Stoerung", () => {
    const b = beschreibeDetailFehler(
      "https://www.zvg-portal.de/x",
      new VerkehrswertFehltError("Grundbuch von Duderstadt Blatt 7803 lfd.Nr. 1: €")
    );
    expect(b.stoerung).toBe(false);
    expect(b.text).toContain("nennt keinen");
    // Kein Stapelabzug: 3 solcher Zeilen in JEDEM Lauf wuerden echte
    // Stoerungen im Log verdecken.
    expect(b.text).not.toContain("Fehler, übersprungen");
  });

  it("wertet jeden anderen Fehler weiterhin als Stoerung", () => {
    const b = beschreibeDetailFehler("https://www.zvg-portal.de/x", new Error("net::ERR_ABORTED"));
    expect(b.stoerung).toBe(true);
    expect(b.text).toContain("Fehler, übersprungen");
  });
});

describe("ordneDetailErgebnisEin", () => {
  it("trennt 'die Quelle nennt keinen Wert' von 'der Abruf ist gescheitert'", () => {
    expect(ordneDetailErgebnisEin(null, new VerkehrswertFehltError("--")).art).toBe(
      "ohne-verkehrswert"
    );
    expect(ordneDetailErgebnisEin(null, new Error("timeout")).art).toBe("stoerung");
  });

  it("schreibt bei einer Stoerung KEINE Zeile ohne Bewertung", () => {
    // Eine Zeile ohne Bewertung behauptet "geprueft, kein Wert vorhanden".
    // Bei einem Abbruch waere das eine Behauptung ueber etwas, das niemand
    // gesehen hat -- genau die Bauart, die dieses Projekt fail-closed nennt.
    expect(ordneDetailErgebnisEin(null, new Error("ERR_NAME_NOT_RESOLVED")).art).toBe(
      "stoerung"
    );
  });

  it("stuft die Portal-Fehlerseite 'error' als Stoerung ein, nicht als 'ohne Verkehrswert' (K-1)", () => {
    // Die Kette aus detailSeiteHolen ohne Browser: parsen, Fehler fangen,
    // einordnen. zvg-portal.de liefert bei falschem Referer HTTP 200 mit dem
    // woertlichen Body "error" -- gesehen hat dann niemand eine Bekanntmachung.
    let fehler: unknown = null;
    try {
      parseZvgDetailPage("error", {
        externalId: "sn-40908",
        url: "https://www.zvg-portal.de/index.php?button=showZvg&zvg_id=40908&land_abk=sn",
        court: "Leipzig in Sachsen",
        caseNumber: "0467 K 0076/2022",
      });
    } catch (err) {
      fehler = err;
    }
    expect(ordneDetailErgebnisEin(null, fehler).art).toBe("stoerung");
    expect(beschreibeDetailFehler("https://www.zvg-portal.de/x", fehler).stoerung).toBe(true);
  });
});

function zusammenfassung(externalId: string): ZvgListSummary {
  return {
    externalId,
    url: `https://www.zvg-portal.de/${externalId}`,
    caseNumber: `K ${externalId}`,
    court: "Amtsgericht",
  };
}

function termin(externalId: string): ZvgDetailData {
  return { externalId } as ZvgDetailData;
}

describe("verteileErgebnisse", () => {
  // Die Zusage "eine Stoerung schreibt keine Zeile ohne Bewertung" haengt an
  // dieser Aufteilung: main.ts schreibt fuer jedes Element aus
  // `ohneVerkehrswert` eine Zeile und bewertet jedes aus `termine`. Was hier in
  // keiner der beiden Listen landet, wird nicht geschrieben.
  it("legt eine Stoerung in KEINE der beiden Listen, die main.ts schreibt", () => {
    const v = verteileErgebnisse([
      { zusammenfassung: zusammenfassung("sn-1"), ergebnis: { art: "stoerung" } },
    ]);
    expect(v.termine).toEqual([]);
    expect(v.ohneVerkehrswert).toEqual([]);
    expect(v.stoerungen.map((z) => z.externalId)).toEqual(["sn-1"]);
  });

  it("verteilt gemischte Ergebnisse je nach Art und haelt die Reihenfolge", () => {
    const ergebnisse: { zusammenfassung: ZvgListSummary; ergebnis: DetailErgebnis }[] = [
      { zusammenfassung: zusammenfassung("sn-1"), ergebnis: { art: "erfasst", daten: termin("sn-1") } },
      { zusammenfassung: zusammenfassung("ni-13233"), ergebnis: { art: "ohne-verkehrswert" } },
      { zusammenfassung: zusammenfassung("nw-2"), ergebnis: { art: "stoerung" } },
      { zusammenfassung: zusammenfassung("by-3"), ergebnis: { art: "erfasst", daten: termin("by-3") } },
      { zusammenfassung: zusammenfassung("nw-167869"), ergebnis: { art: "ohne-verkehrswert" } },
    ];
    const v = verteileErgebnisse(ergebnisse);
    expect(v.termine.map((t) => t.externalId)).toEqual(["sn-1", "by-3"]);
    expect(v.ohneVerkehrswert.map((z) => z.externalId)).toEqual(["ni-13233", "nw-167869"]);
    expect(v.stoerungen.map((z) => z.externalId)).toEqual(["nw-2"]);
  });

  it("liefert leere Listen fuer keine Ergebnisse", () => {
    expect(verteileErgebnisse([])).toEqual({ termine: [], ohneVerkehrswert: [], stoerungen: [] });
  });
});

describe("fasseZvgDetailsZusammen", () => {
  // Laufsumme fuer den ZVG-Zweig, Gegenstueck zu fasseOhnePreisZusammen.
  // Sie liefert den Produktionsbeleg fuer A-4 und macht einen Massenausfall
  // sichtbar -- seit K-1 als Sprung bei den Stoerungen, nicht mehr bei
  // "ohne Verkehrswert".
  it("nennt erfasste, wertlose und gestoerte Detailseiten mit der Gesamtzahl", () => {
    const text = fasseZvgDetailsZusammen({
      termine: [termin("a"), termin("b")],
      ohneVerkehrswert: [zusammenfassung("ni-13233")],
      stoerungen: [zusammenfassung("nw-2"), zusammenfassung("nw-3")],
    });
    expect(text).toBe(
      "ZVG: 1 von 5 Detailseiten ohne verwertbaren Verkehrswert (Zeile ohne Bewertung), " +
        "2 erfasst, 2 Stoerungen (nichts geschrieben, der naechste Lauf holt sie erneut)."
    );
  });

  it("nennt auch den leeren Lauf ausdruecklich", () => {
    expect(fasseZvgDetailsZusammen({ termine: [], ohneVerkehrswert: [], stoerungen: [] })).toBe(
      "ZVG: 0 von 0 Detailseiten ohne verwertbaren Verkehrswert (Zeile ohne Bewertung), " +
        "0 erfasst, 0 Stoerungen (nichts geschrieben, der naechste Lauf holt sie erneut)."
    );
  });
});
