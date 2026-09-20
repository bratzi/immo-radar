import { describe, expect, it } from "vitest";
import {
  alterInTagen,
  formatiereAnzahl,
  formatiereDatum,
  formatiereDscr,
  formatiereEuro,
  formatiereFlaeche,
  formatiereKaufpreisfaktor,
  formatiereMegabyte,
  megabyteZahl,
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

describe("formatiereKaufpreisfaktor", () => {
  it("zeigt eine Nachkommastelle mit dem Malzeichen", () => {
    expect(formatiereKaufpreisfaktor(24.3125)).toBe("24,3×");
  });

  it("gibt fuer KEINE Kennzahl (S0) einen Gedankenstrich und niemals '0,0×' (3.7)", () => {
    expect(formatiereKaufpreisfaktor(null)).toBe("—");
  });

  it("setzt bei einer sehr grossen Zahl Tausenderpunkte statt in Exponentialschreibweise zu kippen", () => {
    expect(formatiereKaufpreisfaktor(1234567.89)).toBe("1.234.567,9×");
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

describe("formatiereMegabyte -- Zahl und Einheit gehoeren zusammen", () => {
  it("schreibt deutsch mit Komma, nicht englisch mit Punkt", () => {
    // Befund aus Task 10: Der Ladetext stand als "23.3 von 23.3 MB" da,
    // waehrend jede andere Zahl der Oberflaeche deutsch formatiert ist.
    expect(formatiereMegabyte(24_445_358)).toBe("23,3 MB");
  });

  it("haelt Zahl und Einheit mit einem geschuetzten Leerzeichen zusammen", () => {
    expect(formatiereMegabyte(1024 * 1024)).toBe("1,0 MB");
  });

  it("rundet auf eine Stelle", () => {
    expect(formatiereMegabyte(0)).toBe("0,0 MB");
  });
});

describe("megabyteZahl -- dieselbe Zahl ohne Einheit", () => {
  it("nennt die Einheit nicht, damit '0,0 von 23,3 MB' sie nur einmal traegt", () => {
    expect(megabyteZahl(24_445_358)).toBe("23,3");
  });
});
