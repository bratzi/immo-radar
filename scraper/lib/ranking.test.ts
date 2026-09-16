import { describe, it, expect, vi } from "vitest";
import {
  bestimmeSicherheitsstufe,
  bewerteFuerRangliste,
  bestimmeVerfuegbarkeitszustand,
  s0Gruende,
} from "./ranking.js";
import { berechneKennzahlen, type KennzahlenInput } from "./metrics.js";

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

  it("stuft den Altnamen kaufpreis_unplausibel genauso auf S0 wie den heutigen (A18-2)", () => {
    // Ohne diesen Eintrag bekommen die 2 Altzeilen eine Rangzahl, die auf
    // genau der Zahl beruht, die als unvereinbar gemeldet wurde.
    const objekt = { rentSource: "angegeben", dataGaps: ["kaufpreis_unplausibel"], livingAreaM2: 80 };
    expect(bestimmeSicherheitsstufe(objekt)).toBe("S0");
    expect(s0Gruende(objekt)).toEqual(["kaufpreis_unplausibel"]);
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

describe("bewerteFuerRangliste", () => {
  // Diese Fixtures haengen indirekt am Kalender: berechneKennzahlen ->
  // instandhaltungssatzProM2 (metrics.ts) staffelt nach
  // `alter = aktuelles Jahr - baujahr`. Bei baujahr 1998 wechselt `alter`
  // am 2031-01-01 von <=32 auf >32 (Satz 9,0 -> 11,5 €/m²) -- die unten
  // gepinnten DSCR-Werte gelten bis dahin und muessen danach neu gerechnet
  // werden.
  const leipzig: KennzahlenInput = {
    kaufpreis: 480_000,
    jahreskaltmiete: 32_000,
    einheiten: 3,
    baujahr: 1998,
    wohnflaecheM2: 240,
  };
  const kaputt: KennzahlenInput = {
    kaufpreis: 2_840,
    jahreskaltmiete: 16_224,
    einheiten: 3,
    baujahr: 1998,
    wohnflaecheM2: 198.8,
  };
  const GRUNDERWERBSTEUER = 5.5;

  it("liefert bei wohnflaeche_fehlt KEINE Kennzahl -- keine 0, kein Rang, kein Band (3.7)", () => {
    const ergebnis = bewerteFuerRangliste(
      { rentSource: "geschaetzt_regional", dataGaps: [], livingAreaM2: null },
      leipzig,
      GRUNDERWERBSTEUER,
      "Bayern"
    );
    expect(ergebnis.stufe).toBe("S0");
    expect(ergebnis.rangzahl).toBeNull();
    expect(ergebnis.band).toBeNull();
    expect(ergebnis.istSchwellenwechsler).toBe(false);
  });

  it("S3 traegt einen Punktwert, aber kein Band (3.4: 'Fuer S3 entfaellt das Band')", () => {
    const ergebnis = bewerteFuerRangliste(
      { rentSource: "angegeben", dataGaps: [], livingAreaM2: 240 },
      leipzig,
      GRUNDERWERBSTEUER,
      null
    );
    expect(ergebnis.stufe).toBe("S3");
    expect(ergebnis.rangzahl).toBeCloseTo(0.8039150663732376, 10);
    expect(ergebnis.band).toBeNull();
    expect(ergebnis.istSchwellenwechsler).toBe(false);
  });

  it("S1 mit bekanntem Bundesland bekommt das gemessene Landesband -- und ueberquert hier die Meldeschwelle 1,3", () => {
    const ergebnis = bewerteFuerRangliste(
      { rentSource: "geschaetzt_bundesland", dataGaps: [], livingAreaM2: 240 },
      leipzig,
      GRUNDERWERBSTEUER,
      "Bayern"
    );
    expect(ergebnis.stufe).toBe("S1");
    expect(ergebnis.rangzahl).toBeCloseTo(0.8039150663732376, 10);
    expect(ergebnis.band).not.toBeNull();
    expect(ergebnis.band!.unten).toBeCloseTo(0.5241500025253383, 8);
    expect(ergebnis.band!.oben).toBeCloseTo(1.3431343814711796, 8);
    expect(ergebnis.istSchwellenwechsler).toBe(true);
  });

  it("S1 ohne bekanntes Bundesland bekommt fail-closed KEIN Band -- keine erfundene Spanne", () => {
    const ergebnis = bewerteFuerRangliste(
      { rentSource: "geschaetzt_bundesland", dataGaps: [], livingAreaM2: 240 },
      leipzig,
      GRUNDERWERBSTEUER,
      null
    );
    expect(ergebnis.stufe).toBe("S1");
    expect(ergebnis.band).toBeNull();
    expect(ergebnis.istSchwellenwechsler).toBe(false);
  });

  it("S1 mit rent_source geschaetzt_bundesweit nutzt die bundesweite Spanne, nicht die Landesspanne", () => {
    const ergebnis = bewerteFuerRangliste(
      { rentSource: "geschaetzt_bundesweit", dataGaps: [], livingAreaM2: 240 },
      leipzig,
      GRUNDERWERBSTEUER,
      null
    );
    expect(ergebnis.stufe).toBe("S1");
    expect(ergebnis.band).not.toBeNull();
    expect(ergebnis.band!.unten).toBeCloseTo(0.434157551596708, 8);
    expect(ergebnis.band!.oben).toBeCloseTo(1.4833716346220858, 8);
  });

  it("S2 nutzt die feste A11-Spanne, unabhaengig vom Bundesland", () => {
    const ergebnis = bewerteFuerRangliste(
      { rentSource: "geschaetzt_regional", dataGaps: [], livingAreaM2: 240 },
      leipzig,
      GRUNDERWERBSTEUER,
      null
    );
    expect(ergebnis.stufe).toBe("S2");
    expect(ergebnis.band).not.toBeNull();
    expect(ergebnis.band!.unten).toBeCloseTo(0.6133871956427803, 8);
    expect(ergebnis.band!.oben).toBeCloseTo(0.9960507672364413, 8);
    expect(ergebnis.istSchwellenwechsler).toBe(false);
  });

  it("kein Schwellenwechsler, wenn das ganze Band ueber der Meldeschwelle liegt", () => {
    const ergebnis = bewerteFuerRangliste(
      { rentSource: "geschaetzt_bundesland", dataGaps: [], livingAreaM2: 198.8 },
      kaputt,
      6.5,
      "Bayern"
    );
    expect(ergebnis.stufe).toBe("S1");
    expect(ergebnis.band!.unten).toBeGreaterThan(1.3);
    expect(ergebnis.istSchwellenwechsler).toBe(false);
  });
});

describe("bestimmeVerfuegbarkeitszustand", () => {
  const jetzt = new Date("2026-09-14T12:00:00Z");

  it("ist abgaengig, sobald disappearedAt gesetzt ist -- unabhaengig von allem anderen", () => {
    expect(
      bestimmeVerfuegbarkeitszustand(
        { disappearedAt: "2026-09-01T00:00:00Z", lastSeen: "2026-09-14T11:00:00Z", kadenzTageDerRegion: 1 },
        jetzt
      )
    ).toBe("abgaengig");
  });

  it("ist unbestaetigt, wenn die Region keine Kadenz hat (nicht zuzuordnen ODER erkennt keine Abgaenge)", () => {
    expect(
      bestimmeVerfuegbarkeitszustand(
        { disappearedAt: null, lastSeen: "2026-09-14T11:59:00Z", kadenzTageDerRegion: null },
        jetzt
      )
    ).toBe("unbestaetigt");
  });

  it("ist verfuegbar, wenn last_seen juenger ist als die doppelte Regionskadenz", () => {
    // Kadenz 1 Tag, last_seen vor 1,5 Tagen -- unter dem Doppelten (2 Tage).
    expect(
      bestimmeVerfuegbarkeitszustand(
        { disappearedAt: null, lastSeen: "2026-09-13T00:00:00Z", kadenzTageDerRegion: 1 },
        jetzt
      )
    ).toBe("verfuegbar");
  });

  it("ist unbestaetigt, wenn last_seen aelter ist als die doppelte Regionskadenz", () => {
    // Kadenz 1 Tag, last_seen vor 2 Tagen 13 Stunden -- ueber dem Doppelten.
    expect(
      bestimmeVerfuegbarkeitszustand(
        { disappearedAt: null, lastSeen: "2026-09-11T23:00:00Z", kadenzTageDerRegion: 1 },
        jetzt
      )
    ).toBe("unbestaetigt");
  });

  it("ist unbestaetigt, wenn last_seen fehlt -- keine Angabe ist kein Freibrief", () => {
    expect(
      bestimmeVerfuegbarkeitszustand(
        { disappearedAt: null, lastSeen: null, kadenzTageDerRegion: 1 },
        jetzt
      )
    ).toBe("unbestaetigt");
  });

  it("ist unbestaetigt, wenn last_seen kein gueltiges Datum ist", () => {
    expect(
      bestimmeVerfuegbarkeitszustand(
        { disappearedAt: null, lastSeen: "kein-datum", kadenzTageDerRegion: 1 },
        jetzt
      )
    ).toBe("unbestaetigt");
  });

  it("ist unbestaetigt, wenn disappearedAt fehlt (undefined) -- auch bei FRISCHEM last_seen", () => {
    // A17-Nachbesserung: Die erste Fassung dieses Fixes liess `undefined`
    // durchfallen zur Frischepruefung. Bei frischem last_seen kam dann
    // "verfuegbar" heraus -- das ersetzt nur eine Behauptung durch eine
    // andere. "verfuegbar" behauptet genauso viel Wissen wie "abgaengig",
    // nur in die Gegenrichtung: Ob ein Objekt ohne bekannten disappearedAt
    // zwischenzeitlich als abgaengig markiert wurde, ist unbekannt, ganz
    // gleich wie frisch last_seen ist. Deshalb hier ein last_seen, das WEIT
    // UNTER der doppelten Kadenz liegt (1 Stunde vor `jetzt`, Kadenz 1 Tag)
    // -- die Frischepruefung allein wuerde "verfuegbar" liefern. Kommt
    // stattdessen "unbestaetigt" heraus, beweist das den Kurzschluss:
    // `undefined` bei disappearedAt entscheidet sofort, ohne last_seen und
    // Kadenz ueberhaupt erst zu befragen.
    //
    // Das `as` umgeht die engere Signatur absichtlich, um exakt den Fall
    // einer Datenbankzeile nachzubilden, deren Spalte disappeared_at gar
    // nicht mit ausgewaehlt wurde.
    const objektOhneFeldFrisch = {
      lastSeen: "2026-09-14T11:00:00Z",
      kadenzTageDerRegion: 1,
    } as unknown as { disappearedAt: string | null; lastSeen: string | null; kadenzTageDerRegion: number | null };

    expect(bestimmeVerfuegbarkeitszustand(objektOhneFeldFrisch, jetzt)).toBe("unbestaetigt");
  });

  it("ist unbestaetigt, wenn disappearedAt fehlt (undefined) -- auch bei LAENGST ABGELAUFENEM last_seen", () => {
    // Ergaenzt den Test oben um die Gegenprobe: Der Kurzschluss auf
    // "unbestaetigt" gilt unabhaengig davon, was last_seen sagt -- nicht nur
    // fuer frische, sondern auch fuer laengst abgelaufene Werte liefert
    // dieselbe Ursache (disappearedAt unbekannt) dasselbe Ergebnis.
    const objektOhneFeldAbgelaufen = {
      lastSeen: "2026-09-11T23:00:00Z",
      kadenzTageDerRegion: 1,
    } as unknown as { disappearedAt: string | null; lastSeen: string | null; kadenzTageDerRegion: number | null };

    expect(bestimmeVerfuegbarkeitszustand(objektOhneFeldAbgelaufen, jetzt)).toBe("unbestaetigt");
  });
});

describe("DSCR_MELDESCHWELLE hat genau eine Quelle (A17)", () => {
  it("bewerteFuerRangliste benutzt die aus metrics.ts exportierte Schwelle, keine eigene Kopie", async () => {
    // Diese Schwelle darf nur an EINER Stelle im Quellcode stehen
    // (metrics.ts, dort in `topTreffer`). ranking.ts muss sie importieren.
    // Um das zu pruefen -- nicht nur, dass beide Stellen heute zufaellig
    // denselben Wert 1,3 tragen -- wird metrics.ts hier durch eine Fassung
    // mit einer ANDEREN Schwelle ersetzt. Haengt ranking.ts wirklich am
    // Import, muss sich sein Verhalten mit der Faelschung aendern. Bleibt es
    // gleich, benutzt ranking.ts eine eigene, unabhaengige Kopie -- genau der
    // Fehler, den dieser Test verhindern soll.
    vi.resetModules();
    vi.doMock("./metrics.js", async (importOriginal) => {
      const echte = await importOriginal<typeof import("./metrics.js")>();
      return { ...echte, DSCR_MELDESCHWELLE: 2.0 };
    });

    const { bewerteFuerRangliste: bewerteMitGefaelschterSchwelle } = await import("./ranking.js");

    const leipzig: KennzahlenInput = {
      kaufpreis: 480_000,
      jahreskaltmiete: 32_000,
      einheiten: 3,
      baujahr: 1998,
      wohnflaecheM2: 240,
    };

    // Mit der echten Schwelle 1,3 ueberquert dieses Band (unten 0,524, oben
    // 1,343) die Schwelle -- siehe "S1 mit bekanntem Bundesland..." oben in
    // dieser Datei. Mit der gefaelschten Schwelle 2,0 liegt das ganze Band
    // darunter, also KEIN Schwellenwechsel mehr.
    const ergebnis = bewerteMitGefaelschterSchwelle(
      { rentSource: "geschaetzt_bundesland", dataGaps: [], livingAreaM2: 240 },
      leipzig,
      5.5,
      "Bayern"
    );

    expect(ergebnis.band!.unten).toBeLessThan(2.0);
    expect(ergebnis.band!.oben).toBeLessThan(2.0);
    expect(ergebnis.istSchwellenwechsler).toBe(false);

    vi.doUnmock("./metrics.js");
    vi.resetModules();
  });
});

describe("s0Gruende nennt den Grund, aus dem S0 entstanden ist (A18)", () => {
  it("nennt wohnflaeche_fehlt, wenn die Flaeche fehlt und data_gaps leer ist", () => {
    // Genau der Befund am ZVG-Objekt 9327fbb0 (Leverkusen, 2026-09-15):
    // S0 wegen des FELDES living_area_m2, ohne Eintrag in data_gaps.
    expect(s0Gruende({ rentSource: "geschaetzt_bundesland", dataGaps: [], livingAreaM2: null }))
      .toEqual(["wohnflaeche_fehlt"]);
  });

  it("nennt die vorhandene S0-Luecke, ohne sie zu verdoppeln", () => {
    expect(
      s0Gruende({ rentSource: "angegeben", dataGaps: ["wohnflaeche_fehlt"], livingAreaM2: null })
    ).toEqual(["wohnflaeche_fehlt"]);
  });

  it("nennt eine unbekannte Mietquelle als eigenen Grund", () => {
    // Der vierte Weg nach S0: rentSource ausserhalb der Aufzaehlung.
    expect(s0Gruende({ rentSource: null, dataGaps: [], livingAreaM2: 80 }))
      .toEqual(["mietquelle_unbekannt"]);
  });

  it("liefert fuer jede andere Stufe eine leere Liste", () => {
    expect(s0Gruende({ rentSource: "angegeben", dataGaps: [], livingAreaM2: 80 })).toEqual([]);
  });

  it("nennt fuer JEDES S0-Objekt mindestens einen Grund", () => {
    // Die eigentliche Zusage. Wer bestimmeSicherheitsstufe um einen
    // fuenften S0-Weg erweitert und s0Gruende vergisst, faellt hier auf.
    const faelle = [
      { rentSource: null, dataGaps: [], livingAreaM2: null },
      { rentSource: "geschaetzt_regional", dataGaps: ["preis_miete_unvereinbar"], livingAreaM2: 80 },
      { rentSource: "unbekannt", dataGaps: [], livingAreaM2: 0 },
      { rentSource: "angegeben", dataGaps: ["rent_estimate_unreliable"], livingAreaM2: 80 },
    ];
    for (const fall of faelle) {
      expect(bestimmeSicherheitsstufe(fall)).toBe("S0");
      expect(s0Gruende(fall).length).toBeGreaterThan(0);
    }
  });
});
