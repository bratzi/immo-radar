import { describe, it, expect } from "vitest";
import {
  partitionAusExternalId,
  partitionEinesListings,
  ermittleAbgaenge,
  ermittleMarkierungen,
  waehleAbgangsmeldungen,
  MAX_ABGANGSMELDUNGEN_JE_LAUF,
  ermittleRueckkehrer,
  istKarenzAbgelaufen,
  istHartLoeschbar,
  waehleDetailKandidaten,
  rotiereAuswahl,
  streueAuswahl,
  budgetiereKandidaten,
  sweepStartVersatz,
  type SweepErgebnis,
  type BekanntesListing,
} from "./bestand.js";

function sweep(overrides: Partial<SweepErgebnis> = {}): SweepErgebnis {
  return {
    source: "zvg-portal",
    vollstaendig: true,
    strukturellTeilweise: false,
    geltungsbereich: ["sn", "by"],
    gesehene: new Set<string>(),
    gemeldeteTreffer: null,
    ...overrides,
  };
}

function listing(externalId: string, disappearedAt: string | null = null): BekanntesListing {
  return { id: `id-${externalId}`, externalId, disappearedAt, fundort: null };
}

describe("partitionAusExternalId", () => {
  it("liest das Bundesland-Kuerzel aus einer ZVG-Id", () => {
    expect(partitionAusExternalId("zvg-portal", "sn-40908")).toBe("sn");
  });

  it("liefert null fuer eine Quelle ohne Partitionierung", () => {
    expect(partitionAusExternalId("immowelt", "e71353e6-4ef9-4162-8a4f-e680c3951de4")).toBeNull();
  });

  it("liefert null, wenn die ZVG-Id nicht dem Muster entspricht", () => {
    expect(partitionAusExternalId("zvg-portal", "40908")).toBeNull();
  });
});

describe("ermittleAbgaenge", () => {
  it("meldet ein Objekt als Abgang, das im vollstaendigen Sweep fehlt", () => {
    const abgaenge = ermittleAbgaenge(sweep({ gesehene: new Set(["sn-1"]) }), [
      listing("sn-1"),
      listing("sn-2"),
    ]);
    expect(abgaenge.map((l) => l.externalId)).toEqual(["sn-2"]);
  });

  it("meldet NICHTS, wenn der Sweep unvollstaendig war", () => {
    const abgaenge = ermittleAbgaenge(
      sweep({ vollstaendig: false, gesehene: new Set(["sn-1"]) }),
      [listing("sn-1"), listing("sn-2")]
    );
    expect(abgaenge).toEqual([]);
  });

  it("laesst Objekte ausserhalb des Geltungsbereichs unangetastet", () => {
    // th lief nicht durch, deshalb darf th-9 nicht als Abgang gelten.
    const abgaenge = ermittleAbgaenge(sweep({ gesehene: new Set(["sn-1"]) }), [
      listing("sn-1"),
      listing("sn-2"),
      listing("th-9"),
    ]);
    expect(abgaenge.map((l) => l.externalId)).toEqual(["sn-2"]);
  });

  it("meldet ein bereits markiertes Objekt nicht erneut", () => {
    const abgaenge = ermittleAbgaenge(sweep({ gesehene: new Set() }), [
      listing("sn-2", "2026-09-06T10:00:00.000Z"),
    ]);
    expect(abgaenge).toEqual([]);
  });

  it("meldet bei leerem Geltungsbereich NICHTS -- kein Land belegt heisst nicht alle", () => {
    // Fail-closed (2026-09-09). Vorher galt ein leerer Geltungsbereich als
    // "Quelle ohne Partitionierung" und gab damit den GANZEN Bestand zum
    // Abgleich frei -- ein Lauf ohne eine einzige vollstaendige Region haette
    // alles geloescht, was er nicht gesehen hat. Das ist die erste der drei
    // Fail-open-Stellen aus dem B-2-Entwurf und muss fallen, bevor Immowelt
    // regionsgenau markieren darf.
    //
    // Heute kostet es nichts: ZVG hatte in 18 vollstaendigen Laeufen nie
    // einen leeren Geltungsbereich (gemessen 2026-09-09: immer 11 oder 16
    // Laender), und fuer Immowelt ist `vollstaendig` ohnehin hart false.
    const abgaenge = ermittleAbgaenge(
      sweep({ source: "immowelt", geltungsbereich: [], gesehene: new Set(["a"]) }),
      [listing("a"), listing("b")]
    );
    expect(abgaenge).toEqual([]);
  });

  it("laesst ein ZVG-Objekt mit unlesbarer Partition unangetastet", () => {
    // "40908" ohne Bundesland-Praefix ergibt keine Partition. Unbekannte
    // Partition heisst: nicht beurteilbar -- und damit nie ein Abgang.
    const abgaenge = ermittleAbgaenge(sweep({ gesehene: new Set(["sn-1"]) }), [
      listing("sn-1"),
      listing("40908"),
    ]);
    expect(abgaenge).toEqual([]);
  });
});

describe("istHartLoeschbar", () => {
  const jetzt = new Date("2026-09-07T12:00:00.000Z");

  it("loescht, wenn Karenz UND last_seen alt genug sind", () => {
    expect(istHartLoeschbar("2026-09-05T11:00:00.000Z", "2026-09-05T11:00:00.000Z", jetzt)).toBe(
      true
    );
  });

  it("loescht NICHT, wenn das Objekt in diesem Lauf noch gesehen wurde", () => {
    // disappeared_at ist alt, aber last_seen frisch -- irgendwo weiter oben
    // ist etwas schiefgelaufen. Im Zweifel nicht loeschen.
    expect(istHartLoeschbar("2026-09-05T11:00:00.000Z", "2026-09-07T11:59:00.000Z", jetzt)).toBe(
      false
    );
  });

  it("loescht NICHT, solange die Karenz laeuft", () => {
    expect(istHartLoeschbar("2026-09-06T12:00:00.000Z", "2026-09-01T00:00:00.000Z", jetzt)).toBe(
      false
    );
  });

  it("loescht NICHT, wenn last_seen fehlt -- fehlende Angabe ist kein Freibrief", () => {
    expect(istHartLoeschbar("2026-09-05T11:00:00.000Z", null, jetzt)).toBe(false);
  });
});

describe("ermittleRueckkehrer", () => {
  it("meldet ein markiertes Objekt, das wieder im Sweep auftaucht", () => {
    const zurueck = ermittleRueckkehrer(sweep({ gesehene: new Set(["sn-2"]) }), [
      listing("sn-2", "2026-09-06T10:00:00.000Z"),
    ]);
    expect(zurueck.map((l) => l.externalId)).toEqual(["sn-2"]);
  });

  it("meldet ein nicht markiertes Objekt nicht", () => {
    const zurueck = ermittleRueckkehrer(sweep({ gesehene: new Set(["sn-1"]) }), [listing("sn-1")]);
    expect(zurueck).toEqual([]);
  });

  it("meldet Rueckkehrer auch bei unvollstaendigem Sweep -- gesehen ist gesehen", () => {
    // Anders als beim Loeschen ist Zurueckholen ungefaehrlich: es vernichtet
    // keine Daten und darf deshalb auch aus einem Teillauf folgen.
    const zurueck = ermittleRueckkehrer(
      sweep({ vollstaendig: false, gesehene: new Set(["sn-2"]) }),
      [listing("sn-2", "2026-09-06T10:00:00.000Z")]
    );
    expect(zurueck.map((l) => l.externalId)).toEqual(["sn-2"]);
  });
});

describe("istKarenzAbgelaufen", () => {
  const jetzt = new Date("2026-09-07T12:00:00.000Z");

  it("ist nach mehr als 2 Tagen abgelaufen", () => {
    expect(istKarenzAbgelaufen("2026-09-05T11:00:00.000Z", jetzt)).toBe(true);
  });

  it("ist nach weniger als 2 Tagen nicht abgelaufen", () => {
    expect(istKarenzAbgelaufen("2026-09-06T12:00:00.000Z", jetzt)).toBe(false);
  });

  it("ist exakt auf der Grenze noch nicht abgelaufen", () => {
    expect(istKarenzAbgelaufen("2026-09-05T12:00:00.000Z", jetzt)).toBe(false);
  });
});

describe("waehleDetailKandidaten", () => {
  const gesehen = ["sn-1", "sn-2", "sn-3"];

  it("waehlt alle unbekannten Objekte aus", () => {
    expect(waehleDetailKandidaten(gesehen, new Set(), new Set())).toEqual(["sn-1", "sn-2", "sn-3"]);
  });

  it("ueberspringt bekannte Objekte mit frischer Detailerfassung", () => {
    expect(waehleDetailKandidaten(gesehen, new Set(["sn-1", "sn-2"]), new Set())).toEqual(["sn-3"]);
  });

  it("waehlt bekannte Objekte mit veralteter Detailerfassung wieder aus", () => {
    expect(
      waehleDetailKandidaten(gesehen, new Set(["sn-1", "sn-2", "sn-3"]), new Set(["sn-2"]))
    ).toEqual(["sn-2"]);
  });

  it("liefert nichts, wenn alles bekannt und frisch ist", () => {
    expect(waehleDetailKandidaten(gesehen, new Set(gesehen), new Set())).toEqual([]);
  });
});

describe("rotiereAuswahl", () => {
  const liste = ["a", "b", "c", "d", "e"];

  it("liefert alles, wenn die Liste kuerzer als das Budget ist", () => {
    expect(rotiereAuswahl(liste, 10, 0)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("liefert genau Budget-viele Eintraege, wenn die Liste laenger ist", () => {
    expect(rotiereAuswahl(liste, 2, 0)).toEqual(["a", "b"]);
  });

  it("liefert bei anderem Versatz ein anderes Fenster", () => {
    expect(rotiereAuswahl(liste, 2, 2)).toEqual(["c", "d"]);
  });

  it("laesst das Fenster ueber das Listenende hinweg umlaufen", () => {
    expect(rotiereAuswahl(liste, 3, 4)).toEqual(["e", "a", "b"]);
  });

  it("liefert bei leerer Liste eine leere Liste", () => {
    expect(rotiereAuswahl([], 3, 7)).toEqual([]);
  });
});

describe("streueAuswahl", () => {
  /**
   * Nachgebaute Kandidatenliste eines echten Laufs: die Regionen stehen
   * hintereinander, so wie der Sweep sie einsammelt. Gemessen am 2026-09-08
   * lieferte ein Lauf 202 Objekte aus Bremen und danach 6823 aus
   * Nordrhein-Westfalen.
   */
  function bandAusZweiRegionen(): string[] {
    return [
      ...Array.from({ length: 202 }, (_, i) => `hb-${i}`),
      ...Array.from({ length: 6823 }, (_, i) => `nw-${i}`),
    ];
  }

  it("waehlt aus jeder Region der Liste, nicht nur aus einer", () => {
    const auswahl = streueAuswahl(bandAusZweiRegionen(), 600, 496907);
    const hb = auswahl.filter((id) => id.startsWith("hb-")).length;
    const nw = auswahl.filter((id) => id.startsWith("nw-")).length;
    // Anteilig waeren es ~17 aus Bremen. Die Zahl muss nicht exakt sein, aber
    // Bremen darf nicht wegfallen und Nordrhein-Westfalen nicht alles stellen.
    expect(hb).toBeGreaterThan(5);
    expect(nw).toBeGreaterThan(500);
    expect(hb + nw).toBe(600);
  });

  it("erreicht ueber aufeinanderfolgende Laeufe jeden Eintrag", () => {
    // Das ist die Eigenschaft, die dem alten zusammenhaengenden Fenster fehlte:
    // Bei Versatzschritt 3 deckten zehn Laeufe nur 127 von 1000 Eintraegen ab,
    // weil sich die Fenster fast vollstaendig ueberlappten.
    const liste = Array.from({ length: 1000 }, (_, i) => `id-${i}`);
    const erreicht = new Set<string>();
    for (let lauf = 0; lauf < 10; lauf += 1) {
      for (const id of streueAuswahl(liste, 100, lauf * 3)) erreicht.add(id);
    }
    expect(erreicht.size).toBe(1000);
  });

  it("vertritt jede Region ungefaehr ihrem Anteil entsprechend", () => {
    // Echtes Kandidatenband aus Lauf 34215003141, Groessen aus
    // sweep_region_runs. Ein fester Abstand floor(n/budget) laesst hier ein
    // Loch: 600 * 15 = 9000 der 9334 Positionen, die fehlenden 334 am Stueck.
    // Hamburg fiel dadurch auf 7 von ~28 anteiligen Plaetzen.
    const groessen: [string, number][] = [
      ["th", 858], ["mv", 619], ["be", 399],
      ["hh", 433], ["hb", 202], ["nw", 6823],
    ];
    const band = groessen.flatMap(([code, n]) =>
      Array.from({ length: n }, (_, i) => `${code}-${i}`)
    );
    const auswahl = streueAuswahl(band, 600, 496907);
    for (const [code, n] of groessen) {
      const erwartet = (600 * n) / band.length;
      const tatsaechlich = auswahl.filter((id) => id.startsWith(`${code}-`)).length;
      expect(tatsaechlich).toBeGreaterThan(erwartet * 0.7);
      expect(tatsaechlich).toBeLessThan(erwartet * 1.3);
    }
  });

  it("liefert genau Budget-viele verschiedene Eintraege", () => {
    const liste = Array.from({ length: 1000 }, (_, i) => `id-${i}`);
    const auswahl = streueAuswahl(liste, 300, 77);
    expect(auswahl).toHaveLength(300);
    expect(new Set(auswahl).size).toBe(300);
  });

  it("liefert alles, wenn die Liste nicht laenger als das Budget ist", () => {
    expect(streueAuswahl(["a", "b", "c"], 3, 5)).toEqual(["a", "b", "c"]);
    expect(streueAuswahl([], 10, 5)).toEqual([]);
  });
});

describe("budgetiereKandidaten", () => {
  const viele = Array.from({ length: 9329 }, (_, i) => `id-${i}`);

  it("verspricht nicht, dass der Rest in spaeteren Laeufen drankommt", () => {
    // Die alte Meldung sagte "RUECKSTAND 8729 auf spaetere Laeufe
    // zurueckgestellt". Gemessen am 2026-09-08 traf das nicht zu: das Fenster
    // wanderte 3 von 600 Eintraegen je Lauf. Eine Meldung, die eine Ursache
    // behauptet statt zu messen, hat dieses Projekt schon dreimal in die
    // falsche Richtung geschickt.
    const { meldung } = budgetiereKandidaten("Immowelt-Bewertung", 600, viele, 0);
    expect(meldung).not.toMatch(/zurueckgestellt|spaetere Laeufe|RUECKSTAND/);
  });
});

/**
 * Warum diese Funktion existiert: Der Startindex der Regionsrotation war die
 * Wanduhr (`Math.floor(Date.now() / 3_600_000)`). Weil das Zeitbudget eines
 * Laufs nur fuer eine grosse Region reicht, war jede grosse Region praktisch
 * von genau EINEM der 16 Startindizes aus erreichbar -- die Abdeckung hing am
 * Zufall der Cron-Uhrzeit. Monte-Carlo ueber 3.000 Durchlaeufe (Entwurf
 * 2026-09-08): volle Abdeckung in 5,7 statt 13,1 Tagen, ohne einen einzigen
 * zusaetzlichen Abruf.
 *
 * Die Fortsetzung wird NICHT als Zaehler gefuehrt, sondern aus der Historie
 * abgeleitet: Startpunkt ist die Region, die am laengsten nicht gesweept
 * wurde. Bei Gleichstand entscheidet die Listenreihenfolge. Fuer
 * zusammenhaengende Rotationsfenster ist das exakt "weitermachen, wo der
 * letzte Lauf aufhoerte" -- aber es heilt sich selbst, wenn eine Region
 * ausfaellt oder ein Lauf gar nicht startet.
 */
describe("sweepStartVersatz", () => {
  const codes = ["nw", "by", "bw", "ni"];
  const jetzt = Date.parse("2026-09-09T12:00:00Z");

  it("faellt ohne lesbare Historie auf die Uhr zurueck", () => {
    // null heisst "nicht gelesen" (Abfrage gescheitert), nicht "leer". Dann
    // ist das alte Verhalten besser als ein fester Start bei nw, der die
    // Abdeckung auf die erste Region einfrieren wuerde.
    expect(sweepStartVersatz(codes, null, jetzt)).toBe(Math.floor(jetzt / 3_600_000));
  });

  it("beginnt bei leerer Historie an der ersten Region", () => {
    expect(sweepStartVersatz(codes, new Map(), jetzt)).toBe(0);
  });

  it("beginnt hinter der zuletzt gesweepten Region, solange Regionen fehlen", () => {
    const historie = new Map([["nw", Date.parse("2026-09-09T09:00:00Z")]]);
    expect(sweepStartVersatz(codes, historie, jetzt)).toBe(1);
  });

  it("beginnt bei vollstaendiger Historie an der aeltesten Region", () => {
    const historie = new Map([
      ["nw", Date.parse("2026-09-09T06:00:00Z")],
      ["by", Date.parse("2026-09-09T09:00:00Z")],
      ["bw", Date.parse("2026-09-08T23:00:00Z")],
      ["ni", Date.parse("2026-09-09T11:00:00Z")],
    ]);
    expect(sweepStartVersatz(codes, historie, jetzt)).toBe(2);
  });

  it("ignoriert Regionen, die es in der Liste nicht mehr gibt", () => {
    // Ein abgeschaffter Regionscode in der Historie darf den Start nicht
    // auf einen Index ausserhalb der Liste schieben.
    const historie = new Map([
      ["xx", Date.parse("2026-01-01T00:00:00Z")],
      ["nw", Date.parse("2026-09-09T09:00:00Z")],
      ["by", Date.parse("2026-09-09T10:00:00Z")],
      ["bw", Date.parse("2026-09-09T11:00:00Z")],
      ["ni", Date.parse("2026-09-09T08:00:00Z")],
    ]);
    expect(sweepStartVersatz(codes, historie, jetzt)).toBe(3);
  });

  it("liefert bei leerer Regionsliste 0", () => {
    expect(sweepStartVersatz([], new Map(), jetzt)).toBe(0);
  });
});

/**
 * Warum es diese Funktion gibt: `partitionAusExternalId` liest das Bundesland
 * aus der externalId und kann das nur fuer ZVG. Immowelts externalId ist eine
 * nackte UUID und verraet nichts ueber die Region -- deshalb war fuer jedes
 * Immowelt-Objekt die Partition `null`, und ein `null` heisst fail-closed
 * "nie ein Abgang". Die Information liegt laengst in der Datenbank: Der Sweep
 * schreibt seit dem Umbau auf die Ergebnisliste den Fundort mit.
 */
describe("partitionEinesListings", () => {
  it("nimmt den gespeicherten Fundort, wo er vorhanden ist", () => {
    expect(
      partitionEinesListings("immowelt", {
        id: "id-1",
        externalId: "e71353e6-4ef9-4162-8a4f-e680c3951de4",
        disappearedAt: null,
        fundort: "nw",
      })
    ).toBe("nw");
  });

  it("liefert null fuer ein Objekt ohne Fundort -- auch bei Immowelt", () => {
    // 157 Objekte (8,2 %) tragen `fundort is null`: Altbestand aus der Zeit,
    // als Immowelt ueber Detailseiten erfasst wurde. Sie sind unter keiner
    // regionsgenauen Regel je zuzuordnen, und "nicht zuzuordnen" heisst hier
    // "nie ein Abgang".
    expect(
      partitionEinesListings("immowelt", {
        id: "id-2",
        externalId: "e71353e6-4ef9-4162-8a4f-e680c3951de4",
        disappearedAt: null,
        fundort: null,
      })
    ).toBeNull();
  });

  it("faellt ohne Fundort auf die externalId zurueck, wo die sie traegt", () => {
    // ZVG traegt das Bundesland in der externalId und hat historisch keinen
    // Fundort gesetzt. Ohne diesen Rueckfall verloere ZVG seine Partition --
    // und damit die einzige Quelle, die heute ueberhaupt loescht.
    expect(
      partitionEinesListings("zvg-portal", {
        id: "id-3",
        externalId: "sn-40908",
        disappearedAt: null,
        fundort: null,
      })
    ).toBe("sn");
  });

  it("zieht den Fundort der externalId vor, wenn beide etwas sagen", () => {
    // Der Fundort ist die Beobachtung dieses Laufs, die externalId eine
    // Ableitung aus einer Kennung. Widersprechen sie sich, gilt die
    // Beobachtung.
    expect(
      partitionEinesListings("zvg-portal", {
        id: "id-4",
        externalId: "sn-40908",
        disappearedAt: null,
        fundort: "th",
      })
    ).toBe("th");
  });
});

describe("ermittleAbgaenge mit Fundort", () => {
  const immoweltSweep = (overrides: Partial<SweepErgebnis> = {}) =>
    sweep({ source: "immowelt", geltungsbereich: ["nw"], vollstaendig: true, ...overrides });

  const iwListing = (externalId: string, fundort: string | null): BekanntesListing => ({
    id: `id-${externalId}`,
    externalId,
    disappearedAt: null,
    fundort,
  });

  it("erkennt ein Immowelt-Objekt im Geltungsbereich als Abgang", () => {
    const abgaenge = ermittleAbgaenge(immoweltSweep({ gesehene: new Set(["uuid-a"]) }), [
      iwListing("uuid-a", "nw"),
      iwListing("uuid-b", "nw"),
    ]);
    expect(abgaenge.map((l) => l.externalId)).toEqual(["uuid-b"]);
  });

  it("laesst ein Objekt ohne Fundort unangetastet", () => {
    const abgaenge = ermittleAbgaenge(immoweltSweep({ gesehene: new Set() }), [
      iwListing("uuid-alt", null),
    ]);
    expect(abgaenge).toEqual([]);
  });

  it("laesst ein Objekt aus einer anderen Region unangetastet", () => {
    const abgaenge = ermittleAbgaenge(immoweltSweep({ gesehene: new Set() }), [
      iwListing("uuid-by", "by"),
    ]);
    expect(abgaenge).toEqual([]);
  });

  it("meldet NICHTS, solange der Immowelt-Sweep unvollstaendig ist", () => {
    // Die Sperre, die heute im Betrieb greift: `vollstaendig` ist im
    // Immowelt-Sweep-Ergebnis hart false. Der Fundort macht die Partition
    // lesbar, er gibt keine Loeschung frei. Faellt dieser Test, ist versehentlich
    // die Loeschhoheit fuer Immowelt eingeschaltet worden.
    const abgaenge = ermittleAbgaenge(
      immoweltSweep({ vollstaendig: false, gesehene: new Set() }),
      [iwListing("uuid-a", "nw"), iwListing("uuid-b", "nw")]
    );
    expect(abgaenge).toEqual([]);
  });
});

describe("ermittleMarkierungen", () => {
  // Immowelt: keine Loeschhoheit, und die quellenweite Pruefung faellt jeden
  // Lauf durch (`vollstaendig` ist hart false). Genau hier soll das Markieren
  // trotzdem laufen -- es ist reversibel und vernichtet nichts.
  const ohneLoeschhoheit = { hatLoeschhoheit: false, quellenPruefungBestanden: false };
  const mitLoeschhoheit = { hatLoeschhoheit: true, quellenPruefungBestanden: true };

  const immoweltSweep = (overrides: Partial<SweepErgebnis> = {}) =>
    sweep({
      source: "immowelt",
      vollstaendig: false,
      strukturellTeilweise: true,
      geltungsbereich: ["nw"],
      ...overrides,
    });

  const iwListing = (
    externalId: string,
    fundort: string | null,
    disappearedAt: string | null = null
  ): BekanntesListing => ({ id: `id-${externalId}`, externalId, disappearedAt, fundort });

  it("markiert ein Objekt einer vollstaendig durchlaufenen Region trotz unvollstaendigem Sweep", () => {
    const markierungen = ermittleMarkierungen(
      immoweltSweep({ gesehene: new Set(["uuid-a"]) }),
      [iwListing("uuid-a", "nw"), iwListing("uuid-b", "nw")],
      ohneLoeschhoheit
    );
    expect(markierungen.map((l) => l.externalId)).toEqual(["uuid-b"]);
  });

  it("markiert ein Objekt ohne Fundort nie -- nicht zuzuordnen heisst nicht verschwunden", () => {
    const markierungen = ermittleMarkierungen(
      immoweltSweep({ gesehene: new Set() }),
      [iwListing("uuid-alt", null)],
      ohneLoeschhoheit
    );
    expect(markierungen).toEqual([]);
  });

  it("markiert ein Objekt einer Region, die in diesem Lauf nicht vorkam, nie", () => {
    const markierungen = ermittleMarkierungen(
      immoweltSweep({ gesehene: new Set() }),
      [iwListing("uuid-by", "by")],
      ohneLoeschhoheit
    );
    expect(markierungen).toEqual([]);
  });

  it("markiert bei leerem Geltungsbereich nichts -- auch ohne Loeschhoheit", () => {
    // Der Lauf, in dem KEINE Region ihre Vollstaendigkeit belegt hat, etwa
    // weil alle soft-geblockt wurden: dann ist nichts belegt, nicht alles.
    const markierungen = ermittleMarkierungen(
      immoweltSweep({ geltungsbereich: [], gesehene: new Set() }),
      [iwListing("uuid-a", "nw"), iwListing("uuid-b", "by")],
      ohneLoeschhoheit
    );
    expect(markierungen).toEqual([]);
  });

  it("markiert ein bereits markiertes Objekt nicht erneut", () => {
    const markierungen = ermittleMarkierungen(
      immoweltSweep({ gesehene: new Set() }),
      [iwListing("uuid-a", "nw", "2026-09-08T10:00:00Z")],
      ohneLoeschhoheit
    );
    expect(markierungen).toEqual([]);
  });

  it("markiert nichts, wenn eine Quelle MIT Loeschhoheit die quellenweite Pruefung nicht bestand", () => {
    // Bei ZVG ist die Markierung der erste Schritt der Loeschung. Sie braucht
    // deshalb weiterhin die volle quellenweite Beweislast.
    const markierungen = ermittleMarkierungen(
      sweep({ gesehene: new Set(["sn-1"]) }),
      [listing("sn-1"), listing("sn-2")],
      { hatLoeschhoheit: true, quellenPruefungBestanden: false }
    );
    expect(markierungen).toEqual([]);
  });

  it("verlangt von einer Quelle MIT Loeschhoheit weiterhin den vollstaendigen Sweep", () => {
    const markierungen = ermittleMarkierungen(
      sweep({ vollstaendig: false, gesehene: new Set(["sn-1"]) }),
      [listing("sn-1"), listing("sn-2")],
      mitLoeschhoheit
    );
    expect(markierungen).toEqual([]);
  });

  it("verhaelt sich bei einer Quelle MIT Loeschhoheit wie ermittleAbgaenge", () => {
    const zvg = sweep({ gesehene: new Set(["sn-1"]) });
    const bekannte = [listing("sn-1"), listing("sn-2")];
    expect(ermittleMarkierungen(zvg, bekannte, mitLoeschhoheit)).toEqual(
      ermittleAbgaenge(zvg, bekannte)
    );
    expect(
      ermittleMarkierungen(zvg, bekannte, mitLoeschhoheit).map((l) => l.externalId)
    ).toEqual(["sn-2"]);
  });
});

/**
 * Warum dieser Test existiert: Im Lauf 34637349206 waren von 44 markierten
 * Abgaengen 10 im Deckel -- und davon war genau EINER je gemeldet worden.
 * Neun Plaetze gingen an Objekte, die gar keine Meldung ausloesen konnten,
 * und die uebrigen 34 bleiben fuer immer stumm, weil sie markiert sind und
 * nie wieder als neuer Abgang auftauchen. Der Deckel gehoert HINTER den
 * Filter, nicht davor.
 */
describe("waehleAbgangsmeldungen", () => {
  const abgang = (id: string) => ({ id, externalId: `ext-${id}` });

  it("fuellt den Deckel nur mit Objekten, die je gemeldet wurden", () => {
    const abgaenge = [
      ...Array.from({ length: 30 }, (_, i) => abgang(`nie-${i}`)),
      ...Array.from({ length: 3 }, (_, i) => abgang(`gemeldet-${i}`)),
    ];
    const gemeldet = new Set(["gemeldet-0", "gemeldet-1", "gemeldet-2"]);

    const { melden, verschwiegen } = waehleAbgangsmeldungen(abgaenge, (id) => gemeldet.has(id));

    expect(melden.map((a) => a.id)).toEqual(["gemeldet-0", "gemeldet-1", "gemeldet-2"]);
    expect(verschwiegen).toBe(0);
  });

  it("deckelt bei mehr gemeldeten Abgaengen als Plaetzen", () => {
    const abgaenge = Array.from({ length: 25 }, (_, i) => abgang(`g-${i}`));

    const { melden, verschwiegen } = waehleAbgangsmeldungen(abgaenge, () => true);

    expect(melden).toHaveLength(MAX_ABGANGSMELDUNGEN_JE_LAUF);
    expect(verschwiegen).toBe(25 - MAX_ABGANGSMELDUNGEN_JE_LAUF);
  });

  it("zaehlt nie gemeldete Objekte nicht als verschwiegen", () => {
    // Sie sind kein Verlust: Sie haetten auch ohne Deckel keine Meldung
    // erzeugt. Wer sie mitzaehlt, meldet dem Nutzer eine Zahl, die nichts
    // bedeutet.
    const abgaenge = Array.from({ length: 100 }, (_, i) => abgang(`nie-${i}`));

    const { melden, verschwiegen } = waehleAbgangsmeldungen(abgaenge, () => false);

    expect(melden).toEqual([]);
    expect(verschwiegen).toBe(0);
  });
});
