import { describe, it, expect } from "vitest";
import {
  trefferzahlAusTitel,
  istRegionVollstaendig,
  regionUnvollstaendigMeldung,
  IMMOWELT_REGIONEN,
  gemeldeteTrefferSumme,
  blaettereWeiter,
  beurteileDetailAntwort,
  laufZusammenfassung,
  baueRegionLauf,
} from "./index.js";
import type { MassstabArt } from "../../lib/regionsMassstab.js";

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
    expect(istRegionVollstaendig(0, null, false, null)).toBe(false);
  });

  it("gilt als unvollstaendig, wenn die Trefferzahl fehlt -- auch mit Objekten", () => {
    // Fail-closed statt fail-open (2026-09-09). Ohne Trefferzahl gibt es
    // keinen Massstab, an dem sich die eingesammelte Menge messen liesse --
    // und ausgerechnet fuer `nw`, `bw` und `mv` parst der Titel nicht, also
    // fuer die beiden groessten Regionen. Vorher ruhte deren
    // Vollstaendigkeit auf "mehr als null Karten"; ein soft-geblockter Lauf
    // mit einer einzigen Karte haette `nw` als vollstaendig ausgewiesen und
    // damit spaeter 1.160 echte Objekte zu Abgaengen erklaert.
    //
    // Warum das heute nichts kostet: Fuer Immowelt ist `vollstaendig` im
    // Sweep-Ergebnis ohnehin hart `false`, es wird nichts geloescht. Es
    // verhindert nur, dass unbelegte Regionen als Referenzlaeufe zaehlen --
    // genau das, was der spaetere regionsgenaue Abgleich braucht.
    expect(istRegionVollstaendig(41, null, false, null)).toBe(false);
  });

  it("ist unvollstaendig, wenn nichts eingesammelt wurde -- selbst bei 0 gemeldeten Treffern", () => {
    // 0/0 ist zwar in sich stimmig, aber null eingesammelte Objekte sind nie
    // ein Beleg fuer Vollstaendigkeit: eine geblockte Huelle kann einen Titel
    // tragen, der zu null Treffern parst. Null gesammelt -> immer false.
    expect(istRegionVollstaendig(0, 0, false, null)).toBe(false);
  });

  it("ist unvollstaendig, wenn nichts eingesammelt wurde, obwohl Treffer gemeldet sind", () => {
    expect(istRegionVollstaendig(0, 120, false, null)).toBe(false);
  });

  it("ist unvollstaendig, wenn die Menge weit unter der gemeldeten Zahl liegt", () => {
    // Bremen im Smoke-Test: 41 von 209 eingesammelt (nur Seite 1).
    expect(istRegionVollstaendig(41, 209, false, null)).toBe(false);
  });

  it("ist vollstaendig, wenn die Menge innerhalb der 25-%-Toleranz bleibt", () => {
    // 160 von 209 -> Fehlbetrag 23 %, noch im Rahmen.
    expect(istRegionVollstaendig(160, 209, false, null)).toBe(true);
  });

  it("ist vollstaendig, wenn mehr eingesammelt als gemeldet wurde", () => {
    expect(istRegionVollstaendig(250, 209, false, null)).toBe(true);
  });

  it("ist NIE vollstaendig, wenn die Blaetterung am Seitendeckel abgeschnitten wurde", () => {
    // Die vierte Fail-open-Stelle, gefunden beim Umbau auf Option 3
    // (2026-09-09). `regionErfassen` meldet `abgeschnitten`, wenn die Region
    // am Seitendeckel des Portals endet -- sie ist dann NACHWEISLICH
    // unvollstaendig erfasst. Bisher wurde dieser Befund nur geloggt.
    //
    // Solange nichts markiert wurde, kostete das nichts. Mit Option 3 waere es
    // ein Loch: Der Deckel liegt bei rund 10.000 Objekten; meldet das Portal
    // 10.000 bis 13.333, landet die abgeschnittene Menge zufaellig innerhalb
    // der 25-%-Toleranz, die Region kaeme in den Geltungsbereich, und die
    // abgeschnittenen Objekte waeren Abgaenge. Ein BEKANNTER
    // Unvollstaendigkeitsbefund darf nie in eine Vollstaendigkeitsaussage
    // muenden -- er schlaegt vor jeder Mengenrechnung durch.
    expect(istRegionVollstaendig(160, 209, true, null)).toBe(false);
    expect(istRegionVollstaendig(250, 209, true, null)).toBe(false);
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
      },
      async () => true
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
      },
      async () => zugestimmt
    );
    expect(ok).toBe(true);
    expect(consentVersuche).toBe(2);
  });

  it("gibt auf, wenn auch nach allen Versuchen kein Klick durchgeht", async () => {
    const ok = await blaettereWeiter(nie, async () => {}, async () => true);
    expect(ok).toBe(false);
  });

  it("meldet Fehlschlag, wenn der Klick durchgeht, die Liste sich aber nicht aendert", async () => {
    // Live belegt (Bremen, 2026-09-08): fuenf "erfolgreiche" Klicks, aber nur
    // zwei tatsaechlich verschiedene Seiten. Ein Klick, der keine Ausnahme
    // wirft, ist KEIN Beleg fuer einen Seitenwechsel -- ein Overlay kann ihn
    // schlucken, ohne dass Playwright etwas merkt.
    const ok = await blaettereWeiter(
      async () => {},
      async () => {},
      async () => false
    );
    expect(ok).toBe(false);
  });

  it("versucht es weiter, bis sich die Liste wirklich geaendert hat", async () => {
    let klicks = 0;
    const ok = await blaettereWeiter(
      async () => {
        klicks += 1;
      },
      async () => {},
      async () => klicks >= 2
    );
    expect(ok).toBe(true);
    expect(klicks).toBe(2);
  });

  it("gibt dem Banner bei jedem weiteren Versuch mehr Zeit", async () => {
    // 2 s waren nachweislich zu knapp. Ein spaeterer Versuch darf nicht
    // dieselbe zu kurze Frist bekommen wie der erste.
    const budgets: number[] = [];
    await blaettereWeiter(
      nie,
      async (ms) => {
        budgets.push(ms);
      },
      async () => true
    );
    expect(budgets.length).toBeGreaterThanOrEqual(3);
    expect(budgets[1]).toBeGreaterThan(budgets[0]);
    expect(budgets[2]).toBeGreaterThan(budgets[1]);
  });
});

describe("beurteileDetailAntwort", () => {
  // Warum es diese Funktion gibt: Im Produktivlauf scheiterten ALLE 144
  // Immowelt-Detailseiten mit "__UFRN_LIFECYCLE_SERVERREQUEST__ nicht
  // gefunden -- Seitenstruktur hat sich vermutlich geaendert". Dieselben URLs
  // lieferten lokal HTTP 200 mit vollstaendigem Datenmodell (geprueft
  // 2026-09-08). Die Struktur war also nie das Problem.
  //
  // Genau diese Verwechslung -- Sperre als Strukturaenderung gemeldet -- hat
  // in diesem Projekt schon dreimal in die falsche Richtung gefuehrt. Der
  // HTTP-Status stand die ganze Zeit zur Verfuegung und wurde nie ausgewertet.

  it("nennt einen abgewiesenen Abruf beim Namen, statt die Struktur zu verdaechtigen", () => {
    const urteil = beurteileDetailAntwort(403, 1500, false);
    expect(urteil).not.toBeNull();
    expect(urteil).toMatch(/403/);
    expect(urteil).toMatch(/abgewiesen/i);
    expect(urteil).not.toMatch(/Struktur/i);
  });

  it("erkennt den Soft-Block: HTTP 200 mit leerer Huelle", () => {
    // DataDome antwortet auch mit 200 und ~1,5 kB Huelle statt der Seite.
    const urteil = beurteileDetailAntwort(200, 1500, false);
    expect(urteil).toMatch(/Huelle|HÃ¼lle/);
    expect(urteil).not.toMatch(/Struktur/i);
  });

  it("verdaechtigt die Struktur NUR bei einer vollstaendigen Seite ohne Datenmodell", () => {
    const urteil = beurteileDetailAntwort(200, 650_000, false);
    expect(urteil).toMatch(/Struktur/i);
  });

  it("meldet nichts, wenn die Seite in Ordnung ist", () => {
    expect(beurteileDetailAntwort(200, 650_000, true)).toBeNull();
  });

  it("behandelt eine fehlende Antwort als nicht beurteilbar, nicht als in Ordnung", () => {
    // page.goto kann null liefern. Das ist kein Beleg fuer eine heile Seite.
    expect(beurteileDetailAntwort(null, 0, false)).not.toBeNull();
  });
});

/**
 * Warum der Titel WOERTLICH ins Log gehoert: Fuer `nw`, `bw` und `mv` liefert
 * `trefferzahlAusTitel` null, und WARUM ist bis heute nicht gemessen. Timing
 * ist eine Hypothese (der Titel wird unmittelbar nach `domcontentloaded`
 * gelesen), ein Formatwechsel eine zweite. Ein geratenes neues Muster waere
 * genau die Sorte Reparatur, die dieses Projekt schon dreimal teuer bezahlt
 * hat. Ein einziger Lauf mit dem echten Titel im Log entscheidet die Frage.
 */
describe("regionUnvollstaendigMeldung", () => {
  it("gibt den echten Seitentitel wieder, wenn die Trefferzahl fehlt", () => {
    const meldung = regionUnvollstaendigMeldung(
      "nw",
      1160,
      null,
      "Mehrfamilienhaus kaufen in Nordrhein-Westfalen | immowelt"
    );
    expect(meldung).toContain("nw");
    expect(meldung).toContain("Mehrfamilienhaus kaufen in Nordrhein-Westfalen | immowelt");
    expect(meldung).toContain("1160");
  });

  it("nennt bei zu kleiner Menge beide Zahlen", () => {
    const meldung = regionUnvollstaendigMeldung("be", 40, 420, "... - 420 Angebote | immowelt");
    expect(meldung).toContain("40");
    expect(meldung).toContain("420");
  });

  it("benennt den Soft-Block-Verdacht, wenn weder Titel noch Karte ankamen", () => {
    const meldung = regionUnvollstaendigMeldung("mv", 0, null, "");
    expect(meldung).toContain("Soft-Block");
  });

  it("kuerzt einen ueberlangen Titel, statt das Log zu fluten", () => {
    const meldung = regionUnvollstaendigMeldung("bw", 500, null, "x".repeat(400));
    expect(meldung.length).toBeLessThan(300);
  });
});

describe("laufZusammenfassung", () => {
  const region = (
    partition: string,
    gesehene: number,
    gemeldeteTreffer: number | null,
    vollstaendig: boolean
  ) => ({
    partition,
    gesehene,
    gemeldeteTreffer,
    vollstaendig,
    // Abgeleitet wie in der Wirklichkeit: Wo eine Trefferzahl steht, ist sie
    // der Massstab; wo keine steht, hat diese Zeile keinen.
    massstab: (gemeldeteTreffer === null ? "keiner" : "gemeldete_treffer") as MassstabArt,
    referenzMenge: gemeldeteTreffer,
  });

  it("benennt den flachen Lauf, in dem jede Region auf Seite 1 stehenbleibt", () => {
    // Der gemessene Zustand vom 2026-09-21: 16 Regionen, je eine Seite.
    const laeufe = [
      region("nw", 40, null, false),
      region("by", 40, 5130, false),
      region("bw", 40, null, false),
      region("ni", 40, 3385, false),
    ];
    const zeile = laufZusammenfassung(laeufe);
    expect(zeile).toContain("FLACH");
    expect(zeile).toContain("4 von 4");
    // Die Summe der ausgewiesenen Treffer gehoert dazu -- sie ist der Beleg,
    // dass das Portal mehr kennt, als der Lauf bekommen hat.
    expect(zeile).toContain("8515");
  });

  it("nennt Regionen ohne Trefferzahl getrennt, statt sie als Null zu zaehlen", () => {
    const zeile = laufZusammenfassung([
      region("nw", 40, null, false),
      region("by", 40, 5130, false),
    ]);
    // NICHT GEMESSEN darf nicht wie "null Treffer" aussehen.
    expect(zeile).toContain("1 ohne Trefferzahl");
  });

  it("meldet einen tiefen, vollstaendigen Lauf ohne Warnwort", () => {
    const zeile = laufZusammenfassung([region("nw", 6807, 6800, true)]);
    expect(zeile).not.toContain("FLACH");
    expect(zeile).toContain("vollstaendig");
  });

  it("nennt einen tiefen Lauf NICHT flach, auch wenn er unvollstaendig ist", () => {
    // nw liefert 6807 Karten, aber keine Trefferzahl im Titel -- fail-closed
    // unvollstaendig. Das ist kein flacher Lauf und darf nicht so heissen.
    const zeile = laufZusammenfassung([region("nw", 6807, null, false)]);
    expect(zeile).not.toContain("FLACH");
    expect(zeile).toContain("1 von 1");
  });

  it("behauptet bei einer einzigen Regionszeile keinen flachen Lauf", () => {
    // Ein tiefer Lauf schafft oft nur eine Region. Bricht die ab, steht dort
    // eine kleine Zahl -- daraus einen flachen Lauf zu machen waere geraten.
    const zeile = laufZusammenfassung([region("hb", 40, 202, false)]);
    expect(zeile).not.toContain("FLACH");
  });

  it("sagt bei leerer Liste ausdruecklich, dass nichts gemessen wurde", () => {
    expect(laufZusammenfassung([])).toContain("keine Region");
  });
});

describe("baueRegionLauf", () => {
  it("misst gegen die Marke, wenn das Portal keine Trefferzahl nennt", () => {
    // `nw`: 42 Zeilen Historie, nie eine Trefferzahl, Marke 6995.
    const lauf = baueRegionLauf("nw", 6795, null, false, 6995);
    expect(lauf).toEqual({
      partition: "nw",
      gesehene: 6795,
      gemeldeteTreffer: null,
      vollstaendig: true,
      massstab: "hochwassermarke",
      referenzMenge: 6995,
    });
  });

  it("erklaert einen flachen Lauf fuer unvollstaendig -- mit Beleg", () => {
    // Der Fall, den A16 abfangen muss. Wichtig ist nicht nur das `false`,
    // sondern dass der Massstab mitgeschrieben wird: Ohne ihn saehe die
    // Zeile aus wie eine ungemessene.
    const lauf = baueRegionLauf("nw", 40, null, false, 6995);
    expect(lauf.vollstaendig).toBe(false);
    expect(lauf.massstab).toBe("hochwassermarke");
    expect(lauf.referenzMenge).toBe(6995);
  });

  it("hat ohne Trefferzahl und ohne Marke keinen Massstab", () => {
    const lauf = baueRegionLauf("nw", 6795, null, false, null);
    expect(lauf.vollstaendig).toBe(false);
    expect(lauf.massstab).toBe("keiner");
    expect(lauf.referenzMenge).toBeNull();
  });

  it("nimmt die gemeldete Trefferzahl, wo es sie gibt", () => {
    const lauf = baueRegionLauf("he", 2719, 2719, false, 2800);
    expect(lauf.massstab).toBe("gemeldete_treffer");
    expect(lauf.referenzMenge).toBe(2719);
    expect(lauf.vollstaendig).toBe(true);
  });

  it("gilt am Seitendeckel nie als vollstaendig, behaelt aber den Massstab", () => {
    const lauf = baueRegionLauf("nw", 6995, null, true, 6995);
    expect(lauf.vollstaendig).toBe(false);
    expect(lauf.massstab).toBe("hochwassermarke");
  });
});

describe("istRegionVollstaendig mit Marke", () => {
  it("laesst eine Region ohne Trefferzahl gelten, wenn sie ihre Marke erreicht", () => {
    expect(istRegionVollstaendig(6795, null, false, 6995)).toBe(true);
  });

  it("bleibt ohne Marke beim alten Verhalten", () => {
    // Fail-closed seit 2026-09-09. Das vierte Argument `null` ist genau der
    // Zustand, in dem der Code bis zum 2026-09-21 immer war.
    expect(istRegionVollstaendig(6795, null, false, null)).toBe(false);
  });

  it("verwirft eine Marke von hoechstens einer Ergebnisseite", () => {
    expect(istRegionVollstaendig(40, null, false, 41)).toBe(false);
  });
});
