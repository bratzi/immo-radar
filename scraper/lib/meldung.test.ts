import { describe, it, expect } from "vitest";
import { bestimmeMeldeklasse, istHoeher, hoechsteKlasse } from "./meldung.js";

const JETZT = new Date("2026-09-07T12:00:00.000Z");

describe("bestimmeMeldeklasse", () => {
  it("liefert top_treffer bei erfuellten Schwellen und belegter Miete", () => {
    expect(
      bestimmeMeldeklasse({
        erfuelltSchwellen: true,
        mietQuelle: "angegeben",
        auctionAt: null,
        jetzt: JETZT,
      })
    ).toBe("top_treffer");
  });

  it("liefert pruefkandidat bei erfuellten Schwellen und regional geschaetzter Miete", () => {
    expect(
      bestimmeMeldeklasse({
        erfuelltSchwellen: true,
        mietQuelle: "geschaetzt_regional",
        auctionAt: null,
        jetzt: JETZT,
      })
    ).toBe("pruefkandidat");
  });

  it("liefert pruefkandidat bei bundesweit geschaetzter Miete", () => {
    expect(
      bestimmeMeldeklasse({
        erfuelltSchwellen: true,
        mietQuelle: "geschaetzt_bundesweit",
        auctionAt: null,
        jetzt: JETZT,
      })
    ).toBe("pruefkandidat");
  });

  it("liefert keine, wenn die Schwellen nicht erfuellt sind", () => {
    expect(
      bestimmeMeldeklasse({
        erfuelltSchwellen: false,
        mietQuelle: "angegeben",
        auctionAt: null,
        jetzt: JETZT,
      })
    ).toBe("keine");
  });

  it("liefert keine, wenn der Versteigerungstermin vorbei ist -- auch bei belegter Miete", () => {
    // Ein noch gelistetes ZVG-Objekt mit gestern gelaufenem Termin darf nicht
    // gemeldet werden. Ohne diese Pruefung wuerde die Verarbeitung melden,
    // bevor der Abgleich am Laufende das Objekt markiert.
    expect(
      bestimmeMeldeklasse({
        erfuelltSchwellen: true,
        mietQuelle: "angegeben",
        auctionAt: "2026-09-06T08:00:00.000Z",
        jetzt: JETZT,
      })
    ).toBe("keine");
  });

  it("meldet einen Termin in der Zukunft normal", () => {
    expect(
      bestimmeMeldeklasse({
        erfuelltSchwellen: true,
        mietQuelle: "angegeben",
        auctionAt: "2026-09-09T08:00:00.000Z",
        jetzt: JETZT,
      })
    ).toBe("top_treffer");
  });
});

describe("istHoeher", () => {
  it("erkennt einen Aufstieg von keine auf pruefkandidat", () => {
    expect(istHoeher("pruefkandidat", "keine")).toBe(true);
  });

  it("erkennt einen Aufstieg von pruefkandidat auf top_treffer", () => {
    expect(istHoeher("top_treffer", "pruefkandidat")).toBe(true);
  });

  it("erkennt Gleichstand NICHT als Aufstieg", () => {
    expect(istHoeher("top_treffer", "top_treffer")).toBe(false);
  });

  it("erkennt einen Abstieg NICHT als Aufstieg", () => {
    expect(istHoeher("pruefkandidat", "top_treffer")).toBe(false);
  });
});

describe("hoechsteKlasse", () => {
  it("liefert keine fuer eine leere Liste", () => {
    expect(hoechsteKlasse([])).toBe("keine");
  });

  it("liefert die hoechste vorkommende Klasse", () => {
    expect(hoechsteKlasse(["pruefkandidat", "top_treffer", "pruefkandidat"])).toBe("top_treffer");
  });

  it("ignoriert fremde kind-Werte wie preisaenderung", () => {
    expect(hoechsteKlasse(["preisaenderung", "verschwunden", "pruefkandidat"])).toBe("pruefkandidat");
  });

  it("liefert keine, wenn ausschliesslich fremde kind-Werte vorliegen", () => {
    expect(hoechsteKlasse(["preisaenderung"])).toBe("keine");
  });
});
