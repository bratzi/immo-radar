import { describe, expect, it } from "vitest";
import {
  alterInTagen,
  formatiereAnzahl,
  formatiereDatum,
  formatiereDscr,
  formatiereEuro,
  formatiereFlaeche,
  formatiereTagesalter,
  preisJeQuadratmeter,
} from "./formate.ts";

describe("formatiereAnzahl", () => {
  it("setzt deutsche Tausenderpunkte", () => {
    expect(formatiereAnzahl(18335)).toBe("18.335");
    expect(formatiereAnzahl(0)).toBe("0");
  });
});

describe("formatiereEuro", () => {
  it("rundet auf volle Euro und setzt Tausenderpunkte", () => {
    expect(formatiereEuro(348900)).toBe("348.900 €");
  });

  it("gibt fuer eine fehlende Angabe einen Gedankenstrich und nie eine 0", () => {
    expect(formatiereEuro(null)).toBe("—");
  });
});

describe("formatiereFlaeche", () => {
  it("zeigt eine Nachkommastelle nur, wenn es eine gibt", () => {
    expect(formatiereFlaeche(146)).toBe("146 m²");
    expect(formatiereFlaeche(226.4)).toBe("226,4 m²");
  });

  it("gibt fuer eine fehlende Angabe einen Gedankenstrich", () => {
    expect(formatiereFlaeche(null)).toBe("—");
  });
});

describe("formatiereDscr", () => {
  it("zeigt zwei Nachkommastellen mit Komma", () => {
    expect(formatiereDscr(1.7651978930494958)).toBe("1,77");
    expect(formatiereDscr(0.7)).toBe("0,70");
  });

  it("gibt fuer KEINE Kennzahl einen Gedankenstrich und niemals '0,00' (3.7)", () => {
    expect(formatiereDscr(null)).toBe("—");
  });
});

describe("preisJeQuadratmeter", () => {
  it("teilt zwei vorhandene Angaben", () => {
    expect(preisJeQuadratmeter(300000, 150)).toBe(2000);
  });

  it("gibt null zurueck, sobald eine der beiden fehlt -- nichts wird ergaenzt", () => {
    expect(preisJeQuadratmeter(null, 150)).toBeNull();
    expect(preisJeQuadratmeter(300000, null)).toBeNull();
  });

  it("gibt null statt Unendlich zurueck, wenn die Flaeche 0 ist", () => {
    expect(preisJeQuadratmeter(300000, 0)).toBeNull();
  });
});

describe("alterInTagen und formatiereTagesalter", () => {
  const jetzt = new Date("2026-09-15T12:00:00Z");

  it("rechnet das Alter eines Zeitstempels in Tagen", () => {
    expect(alterInTagen("2026-09-13T12:00:00Z", jetzt)).toBeCloseTo(2, 5);
  });

  it("gibt null zurueck, wenn der Zeitstempel fehlt oder unlesbar ist", () => {
    expect(alterInTagen(null, jetzt)).toBeNull();
    expect(alterInTagen("irgendwann", jetzt)).toBeNull();
  });

  it("schreibt das Alter in Worten, nicht als Zahl ohne Einheit", () => {
    expect(formatiereTagesalter(0.2)).toBe("heute");
    expect(formatiereTagesalter(1.4)).toBe("vor 1 Tag");
    expect(formatiereTagesalter(6.2)).toBe("vor 6 Tagen");
  });

  it("sagt bei fehlendem Alter, dass es unbekannt ist -- nicht 'vor 0 Tagen'", () => {
    expect(formatiereTagesalter(null)).toBe("Zeitpunkt unbekannt");
  });
});

describe("formatiereDatum", () => {
  it("schreibt ein deutsches Datum", () => {
    expect(formatiereDatum("2026-09-07T05:43:00Z")).toBe("07.09.2026");
  });

  it("gibt bei unlesbarem oder fehlendem Wert einen Gedankenstrich", () => {
    expect(formatiereDatum(null)).toBe("—");
    expect(formatiereDatum("demnaechst")).toBe("—");
  });
});
