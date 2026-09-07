import { describe, it, expect } from "vitest";
import {
  partitionAusExternalId,
  ermittleAbgaenge,
  ermittleRueckkehrer,
  istKarenzAbgelaufen,
  waehleDetailKandidaten,
  type SweepErgebnis,
  type BekanntesListing,
} from "./bestand.js";

function sweep(overrides: Partial<SweepErgebnis> = {}): SweepErgebnis {
  return {
    source: "zvg-portal",
    vollstaendig: true,
    geltungsbereich: ["sn", "by"],
    gesehene: new Set<string>(),
    gemeldeteTreffer: null,
    ...overrides,
  };
}

function listing(externalId: string, disappearedAt: string | null = null): BekanntesListing {
  return { id: `id-${externalId}`, externalId, disappearedAt };
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

  it("prueft bei leerem Geltungsbereich alle Objekte (Quelle ohne Partitionierung)", () => {
    const abgaenge = ermittleAbgaenge(
      sweep({ source: "immowelt", geltungsbereich: [], gesehene: new Set(["a"]) }),
      [listing("a"), listing("b")]
    );
    expect(abgaenge.map((l) => l.externalId)).toEqual(["b"]);
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
