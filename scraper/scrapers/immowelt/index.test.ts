import { describe, it, expect } from "vitest";
import {
  trefferzahlAusTitel,
  istRegionVollstaendig,
  IMMOWELT_REGIONEN,
  gemeldeteTrefferSumme,
  blaettereWeiter,
} from "./index.js";

describe("trefferzahlAusTitel", () => {
  it("liest die Zahl aus einem echten Bundesland-Titel", () => {
    expect(
      trefferzahlAusTitel("Mehrfamilienhaus kaufen in Nordrhein-Westfalen - 7.505 Angebote | immowelt")
    ).toBe(7505);
  });

  it("liest auch eine Zahl ohne Tausenderpunkt", () => {
    expect(trefferzahlAusTitel("Mehrfamilienhaus kaufen in Bremen - 209 Angebote | immowelt")).toBe(209);
  });

  it("liefert null, wenn der Titel keine Trefferzahl nennt", () => {
    expect(trefferzahlAusTitel("Mehrfamilienhaus als Kapitalanlage kaufen | immowelt")).toBeNull();
  });
});

describe("istRegionVollstaendig", () => {
  it("gilt als unvollstaendig, wenn WEDER Trefferzahl NOCH Objekte ankamen", () => {
    // Signatur eines DataDome-Soft-Blocks: HTTP 200, aber leere Huelle --
    // kein parsebarer Titel, keine Karte. Ein echtes Bundesland hat weder
    // null Mehrfamilienhaeuser noch einen unlesbaren Titel.
    expect(istRegionVollstaendig(0, null)).toBe(false);
  });

  it("gilt als vollstaendig, wenn nur der Titel nicht parste, aber Objekte ankamen", () => {
    // Echte Seite, bloss ein geaenderter Titel -- daraus laesst sich nichts
    // gegen die Region ableiten, es bleibt bei der Seitendeckel-Pruefung.
    expect(istRegionVollstaendig(41, null)).toBe(true);
  });

  it("ist unvollstaendig, wenn nichts eingesammelt wurde -- selbst bei 0 gemeldeten Treffern", () => {
    // 0/0 ist zwar in sich stimmig, aber null eingesammelte Objekte sind nie
    // ein Beleg fuer Vollstaendigkeit: eine geblockte Huelle kann einen Titel
    // tragen, der zu null Treffern parst. Null gesammelt -> immer false.
    expect(istRegionVollstaendig(0, 0)).toBe(false);
  });

  it("ist unvollstaendig, wenn nichts eingesammelt wurde, obwohl Treffer gemeldet sind", () => {
    expect(istRegionVollstaendig(0, 120)).toBe(false);
  });

  it("ist unvollstaendig, wenn die Menge weit unter der gemeldeten Zahl liegt", () => {
    // Bremen im Smoke-Test: 41 von 209 eingesammelt (nur Seite 1).
    expect(istRegionVollstaendig(41, 209)).toBe(false);
  });

  it("ist vollstaendig, wenn die Menge innerhalb der 25-%-Toleranz bleibt", () => {
    // 160 von 209 -> Fehlbetrag 23 %, noch im Rahmen.
    expect(istRegionVollstaendig(160, 209)).toBe(true);
  });

  it("ist vollstaendig, wenn mehr eingesammelt als gemeldet wurde", () => {
    expect(istRegionVollstaendig(250, 209)).toBe(true);
  });
});

describe("IMMOWELT_REGIONEN", () => {
  it("deckt alle 16 Bundeslaender ab", () => {
    expect(IMMOWELT_REGIONEN).toHaveLength(16);
  });

  it("hat eindeutige Codes", () => {
    const codes = IMMOWELT_REGIONEN.map((r) => r.code);
    expect(new Set(codes).size).toBe(16);
  });

  it("traegt bei jedem Eintrag eine Geo-Id im Pfad -- ohne sie liefert Immowelt HTTP 410", () => {
    for (const region of IMMOWELT_REGIONEN) {
      expect(region.pfad).toMatch(/\/ad\d{2}de\d+$/);
    }
  });
});

describe("gemeldeteTrefferSumme", () => {
  // Diese Funktion entscheidet, ob der Sweep der vom Portal ausgewiesenen
  // Trefferzahl trauen darf. Sie muss fail-closed sein: im Zweifel null.
  // Live-Befund 2026-09-07: In der Datenbank stand `gemeldete_treffer = 0`
  // neben 562 tatsaechlich eingesammelten Objekten -- ein Widerspruch, der nur
  // entstehen kann, weil abgebrochene Regionen stillschweigend als "nichts zu
  // melden" durchgingen statt als "nicht beurteilbar".

  it("summiert die Trefferzahlen der erfassten Regionen", () => {
    expect(
      gemeldeteTrefferSumme([
        { art: "erfasst", gemeldet: 209 },
        { art: "erfasst", gemeldet: 7505 },
      ])
    ).toBe(7714);
  });

  it("liefert null, sobald eine Region keine Trefferzahl nannte", () => {
    expect(
      gemeldeteTrefferSumme([
        { art: "erfasst", gemeldet: 209 },
        { art: "erfasst", gemeldet: null },
      ])
    ).toBeNull();
  });

  it("liefert null, sobald eine Region mit einem Fehler abbrach", () => {
    // Der Kern des Fehlers: eine abgestuerzte Region trug bisher 0 zur Summe
    // bei, ohne die Summe als unbrauchbar zu markieren.
    expect(
      gemeldeteTrefferSumme([{ art: "erfasst", gemeldet: 209 }, { art: "fehler" }])
    ).toBeNull();
  });

  it("liefert null, wenn ueberhaupt keine Region verarbeitet wurde", () => {
    // Null Regionen sind kein Beleg fuer "null Treffer" -- sie sind gar kein
    // Beleg. Vorher kam hier 0 heraus und sah aus wie eine Messung.
    expect(gemeldeteTrefferSumme([])).toBeNull();
  });
});

describe("blaettereWeiter", () => {
  // Live-Befund 2026-09-07 (Bremen, echte Seite): Das Usercentrics-Overlay
  // kommt nach JEDEM Seitenwechsel zurueck, und sein Akzeptieren-Knopf rendert
  // unvorhersehbar spaet -- ein Versuch mit 10 s scheiterte, der naechste mit
  // 2 s gelang, der uebernaechste mit 2 s scheiterte wieder. Mit nur einem
  // Retry brach Bremen deshalb nach 2 von 5 Seiten ab: 80 statt 209 Objekte.

  const nie = async () => {
    throw new Error("Klick abgefangen");
  };

  it("meldet Erfolg, ohne das Consent-Banner anzufassen, wenn der Klick gleich sitzt", async () => {
    let consentVersuche = 0;
    const ok = await blaettereWeiter(
      async () => {},
      async () => {
        consentVersuche += 1;
      }
    );
    expect(ok).toBe(true);
    expect(consentVersuche).toBe(0);
  });

  it("blaettert weiter, wenn erst der zweite Consent-Versuch den Knopf findet", async () => {
    // Genau der beobachtete Fall. Mit einem einzigen Retry endet die Region hier.
    let consentVersuche = 0;
    let zugestimmt = false;
    const ok = await blaettereWeiter(
      async () => {
        if (!zugestimmt) throw new Error("Klick abgefangen");
      },
      async () => {
        consentVersuche += 1;
        if (consentVersuche >= 2) zugestimmt = true;
      }
    );
    expect(ok).toBe(true);
    expect(consentVersuche).toBe(2);
  });

  it("gibt auf, wenn auch nach allen Versuchen kein Klick durchgeht", async () => {
    const ok = await blaettereWeiter(nie, async () => {});
    expect(ok).toBe(false);
  });

  it("gibt dem Banner bei jedem weiteren Versuch mehr Zeit", async () => {
    // 2 s waren nachweislich zu knapp. Ein spaeterer Versuch darf nicht
    // dieselbe zu kurze Frist bekommen wie der erste.
    const budgets: number[] = [];
    await blaettereWeiter(nie, async (ms) => {
      budgets.push(ms);
    });
    expect(budgets.length).toBeGreaterThanOrEqual(3);
    expect(budgets[1]).toBeGreaterThan(budgets[0]);
    expect(budgets[2]).toBeGreaterThan(budgets[1]);
  });
});
