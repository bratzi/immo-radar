import { describe, it, expect } from "vitest";
import { bestimmeSicherheitsstufe } from "./ranking.js";
import { berechneKennzahlen } from "./metrics.js";

describe("bestimmeSicherheitsstufe", () => {
  it("stuft ein Objekt ohne Wohnflaeche als S0 ein, auch ohne die Datenluecke", () => {
    // Die 148 Objekte vom 2026-09-07: keine Flaeche, aber die Luecke
    // wohnflaeche_fehlt gab es damals noch nicht. Nach der alten Regel
    // landeten sie in S2 und S1 -- mit einer grauen 0,0 am Ende eines
    // gerankten Blocks, also als "geprueft und schlecht" statt als
    // "nicht beurteilbar".
    expect(
      bestimmeSicherheitsstufe({
        rentSource: "geschaetzt_regional",
        dataGaps: [],
        livingAreaM2: null,
      })
    ).toBe("S0");

    expect(
      bestimmeSicherheitsstufe({
        rentSource: "geschaetzt_regional",
        dataGaps: [],
        livingAreaM2: 0,
      })
    ).toBe("S0");
  });

  it("laesst eine belegte Miete nicht ueber eine Datenluecke gewinnen", () => {
    expect(
      bestimmeSicherheitsstufe({
        rentSource: "angegeben",
        dataGaps: ["preis_miete_unvereinbar"],
        livingAreaM2: 120,
      })
    ).toBe("S0");
  });

  it("ordnet die drei bewertbaren Stufen zu", () => {
    const flaeche = { dataGaps: [], livingAreaM2: 120 };
    expect(bestimmeSicherheitsstufe({ ...flaeche, rentSource: "angegeben" })).toBe("S3");
    expect(bestimmeSicherheitsstufe({ ...flaeche, rentSource: "geschaetzt_regional" })).toBe("S2");
    expect(bestimmeSicherheitsstufe({ ...flaeche, rentSource: "geschaetzt_bundesland" })).toBe("S1");
    expect(bestimmeSicherheitsstufe({ ...flaeche, rentSource: "geschaetzt_bundesweit" })).toBe("S1");
  });

  it("stuft ein unbekanntes rent_source als S0 ein, nicht als S1", () => {
    // Abschnitt 3.3 definiert S1 als AUFZAEHLUNG --
    // rent_source ∈ {'geschaetzt_bundesland', 'geschaetzt_bundesweit'} --
    // keine Restmenge. Ein Wert ausserhalb der vier benannten gehoert in
    // keine der drei bewertbaren Stufen. "Wer nicht urteilen kann, loescht
    // nicht" (docs/superpowers/BACKLOG.md) gilt auch hier: ein unbekannter
    // Zustand ist S0 ("nicht beurteilbar"), nie S1 ("bundeslandgenau
    // geschaetzt") -- alles andere waere Nichtwissen als Behauptung
    // getarnt, und genau das nennt 3.7 den gefaehrlichsten Fall.
    //
    // Seit ea8b731 ist das kein theoretischer Fall mehr: Das Projekt legt
    // `listings`-Zeilen ohne `listing_versions`-Zeile an (Objekte, die die
    // Quelle ohne Preis anbietet). Solche Objekte tragen ueberhaupt kein
    // rent_source -- also null, sowohl fuer Immowelt als auch fuer ZVG
    // (beide Quellen seit dem Merge von sdd/zvg-a4).
    const flaeche = { dataGaps: [], livingAreaM2: 120 };
    expect(bestimmeSicherheitsstufe({ ...flaeche, rentSource: null })).toBe("S0");
    expect(bestimmeSicherheitsstufe({ ...flaeche, rentSource: "geschaetzt_irgendwie" })).toBe(
      "S0"
    );
  });
});

describe("die Rangzahl ist der DSCR -- und der haengt an einer Identitaet", () => {
  // Kein Ranking-Code, sondern eine Wache. Der ganze Entwurf ordnet nach dem
  // DSCR, und 2.3 begruendet das damit, dass er informationell dominiert:
  //
  //   nettomietrenditeCapRate = (noi / gesamtkosten) * 100
  //   geschaetzterDscr        =  noi / (gesamtkosten * KAPITALDIENST_SATZ)
  //
  // Mit KAPITALDIENST_SATZ = 0,06 ist der Quotient beider Groessen konstant
  // 100 * 0,06 = 6. Daraus folgt zweierlei, und beides traegt den Entwurf:
  // Die Rangfolge ist unempfindlich gegen den unterstellten Zinssatz (2.3,
  // Punkt 3 -- wichtig, weil 6 % eine Annahme sind, kein gemessener Wert),
  // und Faktor und Rendite sind nach 2.1 teilweise dieselbe Zahl. Aendert
  // jemand eine der beiden Formeln, ordnet das Dashboard still nach etwas
  // anderem -- ohne dass irgendein anderer Test faellt.
  //
  // Die Eingabewerte stammen aus lib/metrics.test.ts (Zeile 7-13 und 87-93),
  // nicht aus der Luft. Am 2026-09-13 nachgerechnet: A ergibt DSCR
  // 0,8039150663732376 gegen capRate/6 = 0,8039150663732376; B (der echte
  // Produktionsfall mit falschem Preis) 68,27015692794394 gegen
  // 68,27015692794394. Die Identitaet haelt also auch weit ausserhalb des
  // plausiblen Bereichs.
  const leipzig = {
    kaufpreis: 480_000,
    jahreskaltmiete: 32_000,
    einheiten: 3,
    baujahr: 1998,
    wohnflaecheM2: 240,
  };
  // Der reale Fehlmeldungsfall 2f41102f: rechnerisch einwandfrei, inhaltlich
  // Unsinn. Er steht hier, damit die Identitaet nicht nur im gutmuetigen
  // Zahlenbereich geprueft wird.
  const kaputt = {
    kaufpreis: 2_840,
    jahreskaltmiete: 16_224,
    einheiten: 3,
    baujahr: 1998,
    wohnflaecheM2: 198.8,
  };

  it("haelt fest, dass geschaetzterDscr = nettomietrenditeCapRate / 6 ist", () => {
    const a = berechneKennzahlen(leipzig, 5.5);
    expect(a.geschaetzterDscr).toBeCloseTo(a.nettomietrenditeCapRate / 6, 10);

    const b = berechneKennzahlen(kaputt, 6.5);
    expect(b.geschaetzterDscr).toBeCloseTo(b.nettomietrenditeCapRate / 6, 10);
  });
});
