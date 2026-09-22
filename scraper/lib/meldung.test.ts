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

  // MELDESPERRE AB PLZ-STUFE (Entscheidung des Nutzers, 2026-09-22).
  // Gemeldet wird nur, wenn die Miete belegt oder wenigstens PLZ-genau
  // geschaetzt ist. `geschaetzt_bundesland` und `geschaetzt_bundesweit` sind
  // zu grob, um eine Nachricht zu rechtfertigen -- bundesweit ist ein
  // einziger Wert fuer ganz Deutschland. Die Objekte verschwinden dadurch
  // NICHT: `trefferklasse` im Dashboard kommt aus `bestimmeTrefferklasse`
  // und haengt nicht an der Meldeklasse. Sie werden nur nicht mehr
  // verschickt.
  it("meldet nicht, wenn die Miete nur bundeslandweit geschaetzt ist", () => {
    expect(
      bestimmeMeldeklasse({
        erfuelltSchwellen: true,
        mietQuelle: "geschaetzt_bundesland",
        auctionAt: null,
        jetzt: JETZT,
      })
    ).toBe("keine");
  });

  it("meldet nicht, wenn die Miete nur bundesweit geschaetzt ist", () => {
    expect(
      bestimmeMeldeklasse({
        erfuelltSchwellen: true,
        mietQuelle: "geschaetzt_bundesweit",
        auctionAt: null,
        jetzt: JETZT,
      })
    ).toBe("keine");
  });

  it("meldet nicht bei einer unbekannten Mietquelle", () => {
    // Fail-closed: eine Quelle, die diese Funktion nicht kennt, ist kein
    // Grund zu melden. Waere die Sperre als Ausschlussliste gebaut, wuerde
    // eine spaeter ergaenzte, noch groebere Schaetzstufe still durchrutschen.
    expect(
      bestimmeMeldeklasse({
        erfuelltSchwellen: true,
        mietQuelle: "geschaetzt_kontinental",
        auctionAt: null,
        jetzt: JETZT,
      })
    ).toBe("keine");
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
