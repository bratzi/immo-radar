import { describe, it, expect } from "vitest";
import {
  schaetzeRegionsKadenzen,
  kadenzFuerRegion,
  waehleJuengsteVersionen,
  zuListingZeile,
  zuVersionZeile,
  bestimmeTrefferklasse,
  baueSnapshot,
} from "./snapshot.js";
import { bewerteFuerRangliste } from "./ranking.js";
import { ermittleJahreskaltmiete } from "./rentEstimate.js";
import { grunderwerbsteuerSatzFuerBundesland } from "./grunderwerbsteuer.js";
import { KARENZ_TAGE } from "./bestand.js";
import { DSCR_MELDESCHWELLE, berechneKennzahlen } from "./metrics.js";

const TAG_MS = 24 * 60 * 60 * 1000;
const START = Date.parse("2026-09-08T00:00:00.000Z");

/** Ein vollstaendiger Regionslauf `tage` Tage nach dem Bezugspunkt. */
function lauf(partition: string, tage: number, vollstaendig = true) {
  return {
    source: "immowelt",
    partition,
    startedAt: new Date(START + tage * TAG_MS).toISOString(),
    vollstaendig,
  };
}

function jetztNach(tage: number): Date {
  return new Date(START + tage * TAG_MS);
}

describe("schaetzeRegionsKadenzen", () => {
  it("schaetzt die Kadenz als Median der Abstaende zwischen vollstaendigen Laeufen", () => {
    // Abstaende 1, 2, 1 Tage -> Median 1. Der Median und nicht das Mittel:
    // 43 % der Cron-Termine fallen aus (A10), ein einzelner langer Abstand
    // soll die Kadenz nicht verschieben.
    const kadenzen = schaetzeRegionsKadenzen(
      [lauf("by", 0), lauf("by", 1), lauf("by", 3), lauf("by", 4)],
      jetztNach(4.5)
    );
    expect(kadenzFuerRegion(kadenzen, "immowelt", "by")).toBeCloseTo(1, 6);
  });

  it("liefert keine Kadenz, wenn weniger als drei vollstaendige Laeufe vorliegen", () => {
    // `bw` und `sh` haben am 2026-09-15 je genau EINEN vollstaendigen Lauf.
    // Aus einem Lauf folgt kein Abstand, aus zwei genau einer -- daraus einen
    // "typischen" Abstand zu bilden waere keine Schaetzung, sondern eine
    // Behauptung. Und der Median ueber null Abstaende ist NaN: Ein NaN, das
    // als Zahl durchrutscht, waere schlimmer als null, weil in
    // `bestimmeVerfuegbarkeitszustand` jeder Vergleich damit false ergibt und
    // das Objekt still als "verfuegbar" gaelte.
    const einLauf = schaetzeRegionsKadenzen([lauf("bw", 0)], jetztNach(1));
    expect(kadenzFuerRegion(einLauf, "immowelt", "bw")).toBeNull();

    const zweiLaeufe = schaetzeRegionsKadenzen([lauf("sh", 0), lauf("sh", 1)], jetztNach(1.1));
    expect(kadenzFuerRegion(zweiLaeufe, "immowelt", "sh")).toBeNull();
  });

  it("zaehlt unvollstaendige Laeufe nicht mit", () => {
    // Ein Teillauf sagt nichts darueber, wie oft eine Region GANZ gesehen
    // wird. Mit ihm gerechnet bekaeme `nw` (15 Laeufe, 3 davon vollstaendig)
    // eine Kadenz, obwohl es seine Trefferzahl nie ausweist.
    const kadenzen = schaetzeRegionsKadenzen(
      [lauf("nw", 0), lauf("nw", 0.5, false), lauf("nw", 1, false)],
      jetztNach(1.1)
    );
    expect(kadenzFuerRegion(kadenzen, "immowelt", "nw")).toBeNull();
  });

  it("verwirft eine Kadenz, die der letzte vollstaendige Lauf widerlegt", () => {
    // Der gemessene Fall `nw` am 2026-09-15: drei vollstaendige Laeufe, alle
    // vom 2026-09-08/09 und damit VOR der Fail-closed-Umstellung von
    // `istRegionVollstaendig`. Median 0,44 Tage -- der letzte davon liegt aber
    // 5,7 Tage zurueck. Die Kadenz ist durch die Gegenwart widerlegt; sie
    // weiter zu benutzen erklaerte den ganzen NRW-Bestand zu "verfuegbar".
    const kadenzen = schaetzeRegionsKadenzen(
      [lauf("nw", 0), lauf("nw", 0.1), lauf("nw", 0.9)],
      jetztNach(6)
    );
    expect(kadenzFuerRegion(kadenzen, "immowelt", "nw")).toBeNull();
  });

  it("uebersteht unlesbare Zeitstempel, ohne eine Zahl zu erfinden", () => {
    const kadenzen = schaetzeRegionsKadenzen(
      [
        { source: "immowelt", partition: "he", startedAt: "keine Zeit", vollstaendig: true },
        { source: "immowelt", partition: "he", startedAt: "auch nicht", vollstaendig: true },
        { source: "immowelt", partition: "he", startedAt: "", vollstaendig: true },
      ],
      jetztNach(1)
    );
    expect(kadenzFuerRegion(kadenzen, "immowelt", "he")).toBeNull();
  });

  it("haelt die Quellen auseinander", () => {
    // `zvg-portal` hat am 2026-09-15 KEINE einzige Zeile in
    // sweep_region_runs. Seine Objekte duerfen sich die Kadenz von Immowelt
    // nicht ausleihen -- das waere eine Aussage ueber einen Lauf, den es nie
    // gab.
    const kadenzen = schaetzeRegionsKadenzen(
      [lauf("sn", 0), lauf("sn", 1), lauf("sn", 2)],
      jetztNach(2.5)
    );
    expect(kadenzFuerRegion(kadenzen, "immowelt", "sn")).toBeCloseTo(1, 6);
    expect(kadenzFuerRegion(kadenzen, "zvg-portal", "sn")).toBeNull();
  });

  it("liefert null fuer ein Objekt ohne zuordenbare Region", () => {
    const kadenzen = schaetzeRegionsKadenzen(
      [lauf("sn", 0), lauf("sn", 1), lauf("sn", 2)],
      jetztNach(2.5)
    );
    expect(kadenzFuerRegion(kadenzen, "immowelt", null)).toBeNull();
  });
});

describe("waehleJuengsteVersionen", () => {
  it("waehlt je Objekt die Version mit dem groessten scanned_at", () => {
    // `listing_versions` traegt mehrere Zeilen je `listing_id` (25.709 Zeilen
    // zu 17.078 Objekten am 2026-09-15). Der Snapshot zeigt den neuesten
    // Stand, und die Reihenfolge der geladenen Seiten ist keine.
    const juengste = waehleJuengsteVersionen([
      versionsZeile("a", "2026-09-10T00:00:00.000Z", 100),
      versionsZeile("a", "2026-09-14T00:00:00.000Z", 300),
      versionsZeile("a", "2026-09-12T00:00:00.000Z", 200),
      versionsZeile("b", "2026-09-01T00:00:00.000Z", 900),
    ]);
    expect(juengste.get("a")?.priceCents).toBe(300);
    expect(juengste.get("b")?.priceCents).toBe(900);
  });

  it("laesst eine Version mit unlesbarem scanned_at nie ueber eine lesbare gewinnen", () => {
    const juengste = waehleJuengsteVersionen([
      versionsZeile("a", "kaputt", 999),
      versionsZeile("a", "2026-09-01T00:00:00.000Z", 111),
    ]);
    expect(juengste.get("a")?.priceCents).toBe(111);
  });
});

describe("die Datenbankgrenze: `undefined` wird hart zu `null`", () => {
  it("macht aus einem fehlenden disappeared_at niemals einen Abgang", () => {
    // DER Fall, um den es hier geht. `bestimmeVerfuegbarkeitszustand` prueft
    // `disappearedAt !== null` -- ein `undefined` aus einer Abfrage, die die
    // Spalte nicht mitausgewaehlt hat, rutscht da glatt hindurch und erklaert
    // ein lebendes Objekt zum Abgang.
    const zeile = zuListingZeile({ id: "a", source: "immowelt", url: "https://x" });
    expect(zeile.disappearedAt).toBeNull();
    expect(zeile.lastSeen).toBeNull();
    expect(zeile.firstSeen).toBeNull();
    expect(zeile.fundort).toBeNull();
  });

  it("macht aus fehlenden Versionsfeldern null, false und []", () => {
    const zeile = zuVersionZeile({ listing_id: "a" });
    expect(zeile.scannedAt).toBeNull();
    expect(zeile.priceCents).toBeNull();
    expect(zeile.rentSource).toBeNull();
    expect(zeile.livingAreaM2).toBeNull();
    expect(zeile.bundesland).toBeNull();
    expect(zeile.auctionAt).toBeNull();
    // Beides sind BEHAUPTUNGEN, wenn sie true sind. Ein fehlendes Feld darf
    // sie nie erheben: "Einheiten bestaetigt" und "Preis gesenkt" ohne
    // Grundlage sind genau die Art Aussage, die dieser Entwurf ablehnt.
    expect(zeile.unitsConfident).toBe(false);
    expect(zeile.priceDropped).toBe(false);
    expect(zeile.dataGaps).toEqual([]);
  });

  it("wandelt die Zahlenspalten aus Postgres in Zahlen, nicht in Text", () => {
    // `numeric` und `bigint` kommen ueber PostgREST als String an. Ein
    // `living_area_m2` von "0" waere als String truthy und `> 0` waere ein
    // Textvergleich -- die Sicherheitsstufe haengt an genau dieser Pruefung.
    const zeile = zuVersionZeile({
      listing_id: "a",
      price_cents: "34890000",
      living_area_m2: "146.5",
      plot_area_m2: "1000",
      units: "3",
      year_built: "1998",
    });
    expect(zeile.priceCents).toBe(34890000);
    expect(zeile.livingAreaM2).toBeCloseTo(146.5, 6);
    expect(zeile.plotAreaM2).toBe(1000);
    expect(zeile.units).toBe(3);
    expect(zeile.yearBuilt).toBe(1998);
  });

  it("macht aus einer unbrauchbaren Zahl null statt NaN", () => {
    const zeile = zuVersionZeile({ listing_id: "a", price_cents: "keine Zahl", units: "" });
    expect(zeile.priceCents).toBeNull();
    expect(zeile.units).toBeNull();
  });
});

function versionsZeile(listingId: string, scannedAt: string, priceCents: number) {
  return zuVersionZeile({
    listing_id: listingId,
    scanned_at: scannedAt,
    price_cents: priceCents,
  });
}

describe("bestimmeTrefferklasse (N1.1)", () => {
  it("nennt ein Objekt nur dann top, wenn die Schwelle an der UNTEREN Bandkante haelt", () => {
    // Entwurf 3.5: ein Objekt steigt nur, wenn es auch dann noch gut ist,
    // wenn die Schaetzung gegen es laeuft. Eine Trefferklasse auf dem
    // Punktwert wuerde die Sortierung darunter widerlegen -- und 25 % aller
    // bewertbaren Objekte sind Schwellenwechsler (3.6).
    const haelt = {
      stufe: "S1" as const,
      rangzahl: 1.8,
      band: { unten: 1.35, oben: 2.4 },
      istSchwellenwechsler: false,
    };
    expect(bestimmeTrefferklasse(haelt, 11)).toBe("top");

    const nurImPunkt = {
      stufe: "S1" as const,
      rangzahl: 1.8,
      band: { unten: 0.9, oben: 2.4 },
      istSchwellenwechsler: true,
    };
    expect(bestimmeTrefferklasse(nurImPunkt, 11)).toBe("normal");
  });

  it("nimmt bei S3 den Punktwert, weil es dort kein Band gibt", () => {
    const belegt = { stufe: "S3" as const, rangzahl: 1.4, band: null, istSchwellenwechsler: false };
    expect(bestimmeTrefferklasse(belegt, 11)).toBe("top");

    const belegtDarunter = {
      stufe: "S3" as const,
      rangzahl: 0.76,
      band: null,
      istSchwellenwechsler: false,
    };
    expect(bestimmeTrefferklasse(belegtDarunter, 13)).toBe("normal");
  });

  it("nennt ein geschaetztes Objekt OHNE Band nie top", () => {
    // `bewerteFuerRangliste` liefert fuer S1/S2 ein `band: null`, wenn die
    // Mietspanne des Bundeslandes nicht ermittelbar war. Dann gibt es keine
    // untere Bandkante -- und ohne sie ist "haelt auch unten" keine Aussage,
    // die jemand pruefen koennte. Fail-closed: nicht top.
    const ohneBand = {
      stufe: "S1" as const,
      rangzahl: 2.5,
      band: null,
      istSchwellenwechsler: false,
    };
    expect(bestimmeTrefferklasse(ohneBand, 11)).toBe("normal");
  });

  it("verlangt zusaetzlich einen Kaufpreisfaktor zwischen 3 und 15", () => {
    const stark = {
      stufe: "S1" as const,
      rangzahl: 3,
      band: { unten: 2.0, oben: 4.0 },
      istSchwellenwechsler: false,
    };
    expect(bestimmeTrefferklasse(stark, 16)).toBe("normal");
    // Unter 3 ist kein Schnaeppchen, sondern ein Datenfehler (metrics.ts).
    expect(bestimmeTrefferklasse(stark, 2.9)).toBe("normal");
    expect(bestimmeTrefferklasse(stark, 15)).toBe("top");
    expect(bestimmeTrefferklasse(stark, 3)).toBe("top");
    // Kein Faktor heisst kein Beleg fuer den Faktor -- nie top.
    expect(bestimmeTrefferklasse(stark, null)).toBe("normal");
  });

  it("nennt S0 nicht beurteilbar, nie normal", () => {
    // 3.7: S0-Objekte bekommen ueberhaupt keinen Rangplatz. Sie stehen nicht
    // am Ende der Liste -- sie stehen nicht IN der Liste.
    const s0 = { stufe: "S0" as const, rangzahl: null, band: null, istSchwellenwechsler: false };
    expect(bestimmeTrefferklasse(s0, 11)).toBe("nichtBeurteilbar");
  });
});

// --- baueSnapshot ----------------------------------------------------------

const JETZT = new Date("2026-09-15T12:00:00.000Z");

function listing(id: string, felder: Record<string, unknown> = {}) {
  return zuListingZeile({
    id,
    source: "immowelt",
    external_id: `ext-${id}`,
    url: `https://immowelt.de/${id}`,
    first_seen: "2026-09-08T00:00:00.000Z",
    last_seen: "2026-09-15T06:00:00.000Z",
    fundort: "by",
    ...felder,
  });
}

/** 100.000 EUR auf 150 m² in Bayern -- bundeslandgenau geschaetzt, also S1. */
function version(listingId: string, felder: Record<string, unknown> = {}) {
  return zuVersionZeile({
    listing_id: listingId,
    scanned_at: "2026-09-15T06:00:00.000Z",
    price_cents: 10_000_000,
    rent_cold_monthly_cents: null,
    rent_source: "geschaetzt_bundesland",
    living_area_m2: "150",
    units: null,
    units_confident: false,
    bundesland: "Bayern",
    city: "Peine",
    title: "Mehrfamilienhaus",
    data_gaps: ["miete_nur_bundeslandgenau", "units_unconfirmed"],
    ...felder,
  });
}

/** Drei vollstaendige `by`-Laeufe, der letzte kurz vor JETZT -> Kadenz ~1 Tag. */
function regionsLaeufeBayern() {
  return [
    { source: "immowelt", partition: "by", startedAt: "2026-09-13T10:00:00.000Z", vollstaendig: true },
    { source: "immowelt", partition: "by", startedAt: "2026-09-14T10:00:00.000Z", vollstaendig: true },
    { source: "immowelt", partition: "by", startedAt: "2026-09-15T10:00:00.000Z", vollstaendig: true },
  ];
}

function eingabe(teile: Record<string, unknown> = {}) {
  return {
    listings: [listing("a")],
    versionen: [version("a")],
    regionsLaeufe: regionsLaeufeBayern(),
    lauf: { id: "34910160636", beendetAm: "2026-09-15T11:59:00.000Z" },
    betrieb: { uebersprungeneJeLauf: null, meldebudget: null },
    ...teile,
  };
}

describe("baueSnapshot", () => {
  it("nimmt ein Objekt ohne listing_versions-Zeile mit Klartext-Grund auf", () => {
    // Entwurf 3.3 / Abschnitt 9 Schritt 3, Entscheidung des Nutzers: Solche
    // Zeilen (preis_auf_anfrage / preis_unlesbar) erscheinen im Bereich
    // "nicht beurteilbar", nicht nur auf der Betriebsseite. Sie tragen keinen
    // data_gaps-Eintrag -- der Klartext-Grund muss hier entstehen.
    const snapshot = baueSnapshot(
      eingabe({ listings: [listing("a"), listing("ohne")], versionen: [version("a")] }),
      JETZT
    );

    const ohne = snapshot.objekte.find((o) => o.id === "ohne");
    expect(ohne).toBeDefined();
    expect(ohne?.stufe).toBe("S0");
    expect(ohne?.trefferklasse).toBe("nichtBeurteilbar");
    expect(ohne?.rangzahl).toBeNull();
    expect(ohne?.band).toBeNull();
    expect(ohne?.kaufpreisEuro).toBeNull();
    // Ein Klartext-Grund, kein roher Maschinencode -- 3.7 verlangt fuer jedes
    // S0-Objekt einen Grund in Worten.
    expect(ohne?.datenluecken).toHaveLength(1);
    expect(ohne?.datenluecken[0]).toMatch(/Preis fehlt/);
    expect(ohne?.datenluecken[0]).not.toMatch(/_/);
  });

  it("uebernimmt Stufe, Rangzahl und Band unveraendert aus ranking.ts", () => {
    const snapshot = baueSnapshot(eingabe(), JETZT);
    const objekt = snapshot.objekte[0];

    const erwartet = bewerteFuerRangliste(
      {
        rentSource: "geschaetzt_bundesland",
        dataGaps: ["miete_nur_bundeslandgenau", "units_unconfirmed"],
        livingAreaM2: 150,
      },
      {
        kaufpreis: 100_000,
        jahreskaltmiete: ermittleJahreskaltmiete(null, 150, "", "Bayern").jahreskaltmiete,
        einheiten: 3,
        baujahr: null,
        wohnflaecheM2: 150,
      },
      grunderwerbsteuerSatzFuerBundesland("Bayern"),
      "Bayern"
    );

    expect(objekt.stufe).toBe(erwartet.stufe);
    expect(objekt.rangzahl).toBeCloseTo(Number(erwartet.rangzahl), 9);
    expect(objekt.band?.unten).toBeCloseTo(Number(erwartet.band?.unten), 9);
    expect(objekt.band?.oben).toBeCloseTo(Number(erwartet.band?.oben), 9);
    expect(objekt.istSchwellenwechsler).toBe(erwartet.istSchwellenwechsler);
  });

  it("gibt jedem Objekt einer Region ohne belegbare Kadenz den Zustand unbestaetigt", () => {
    // `nw` weist seine Trefferzahl nie aus -> nie ein vollstaendiger Lauf ->
    // keine Kadenz -> "unbestaetigt". Das Fehlen einer Abgangsmarkierung ist
    // dort KEIN Beleg fuer Verfuegbarkeit (Entwurf 6.2).
    const nw = baueSnapshot(
      eingabe({
        listings: [listing("a", { fundort: "nw" })],
        versionen: [version("a", { bundesland: "Nordrhein-Westfalen" })],
      }),
      JETZT
    );
    expect(nw.objekte[0].zustand).toBe("unbestaetigt");

    // Bayern hat drei vollstaendige Laeufe und einen frischen -> verfuegbar.
    expect(baueSnapshot(eingabe(), JETZT).objekte[0].zustand).toBe("verfuegbar");
  });

  it("nennt ein markiertes Objekt abgaengig, mit Datum", () => {
    const snapshot = baueSnapshot(
      eingabe({ listings: [listing("a", { disappeared_at: "2026-09-14T00:00:00.000Z" })] }),
      JETZT
    );
    expect(snapshot.objekte[0].zustand).toBe("abgaengig");
    expect(snapshot.objekte[0].abgaengigSeit).toBe("2026-09-14T00:00:00.000Z");
  });

  it("waehlt fuer die Stufe die UNGENAUERE der beiden Mietquellen", () => {
    // Gespeichert steht `geschaetzt_regional` (S2, Band ±23,7 %), die Miete
    // entsteht heute aber ohne PLZ bundeslandgenau (S1, in Bayern
    // -34,8 %...+67,1 %). Das schmalere Band zu nehmen hiesse, ein Objekt
    // sicherer darzustellen, als beide Beobachtungen zusammen hergeben -- und
    // ein zu schmales Band kann einen Top-Treffer erzeugen.
    const snapshot = baueSnapshot(
      eingabe({ versionen: [version("a", { rent_source: "geschaetzt_regional", zip_code: null })] }),
      JETZT
    );
    expect(snapshot.objekte[0].stufe).toBe("S1");
  });

  it("aggregiert je Bundesland Objekte, Top-Treffer, Median-DSCR und Standalter", () => {
    const snapshot = baueSnapshot(
      eingabe({
        listings: [listing("a"), listing("b")],
        // 100.000 EUR haelt die Schwelle auch unten, 250.000 EUR nicht.
        versionen: [version("a"), version("b", { price_cents: 25_000_000 })],
      }),
      JETZT
    );

    const bayern = snapshot.bundeslaender.find((l) => l.name === "Bayern");
    expect(bayern?.objekte).toBe(2);
    expect(bayern?.topTreffer).toBe(1);
    const dscrs = snapshot.objekte.map((o) => Number(o.rangzahl)).sort((x, y) => x - y);
    expect(bayern?.medianDscr).toBeCloseTo((dscrs[0] + dscrs[1]) / 2, 9);
    // Letzter `by`-Lauf: 2026-09-15T10:00Z, JETZT 12:00Z -> 2 Stunden.
    expect(bayern?.standAlterTage).toBeCloseTo(2 / 24, 6);
  });

  it("schreibt die Betriebsgroessen des Laufs als null, nicht als 0", () => {
    // `uebersprungeneJeLauf` und `meldebudget` sind Laufkennwerte und stehen
    // nirgends in der Datenbank. Eine 0 hiesse "nichts uebersprungen, nichts
    // gemeldet" -- eine Behauptung aus Nichtwissen.
    const ohneLauf = baueSnapshot(eingabe(), JETZT);
    expect(ohneLauf.betrieb.uebersprungeneJeLauf).toBeNull();
    expect(ohneLauf.betrieb.meldebudget).toBeNull();

    const mitLauf = baueSnapshot(
      eingabe({
        betrieb: {
          uebersprungeneJeLauf: { preis_auf_anfrage: 12, preis_unlesbar: 3 },
          meldebudget: { gesendet: 25, hoechstens: 25, zurueckgestellt: 117 },
        },
      }),
      JETZT
    );
    expect(mitLauf.betrieb.uebersprungeneJeLauf).toEqual({
      preis_auf_anfrage: 12,
      preis_unlesbar: 3,
    });
    expect(mitLauf.betrieb.meldebudget?.zurueckgestellt).toBe(117);
  });

  it("fuehrt den Regionsstand je Region aus dem juengsten Lauf", () => {
    const snapshot = baueSnapshot(
      eingabe({
        regionsLaeufe: [
          ...regionsLaeufeBayern(),
          {
            source: "immowelt",
            partition: "nw",
            startedAt: "2026-09-14T21:00:00.000Z",
            vollstaendig: false,
          },
          {
            source: "immowelt",
            partition: "nw",
            startedAt: "2026-09-10T21:00:00.000Z",
            vollstaendig: true,
          },
        ],
      }),
      JETZT
    );
    const nw = snapshot.betrieb.regionsstand.find((r) => r.region === "nw");
    expect(nw?.letzterLauf).toBe("2026-09-14T21:00:00.000Z");
    expect(nw?.vollstaendig).toBe(false);
  });

  it("rechnet die Kopfzeile aus den Daten", () => {
    const snapshot = baueSnapshot(
      eingabe({
        listings: [listing("a"), listing("b"), listing("ohne")],
        versionen: [
          version("a"),
          version("b", { rent_source: "angegeben", rent_cold_monthly_cents: 150_000 }),
        ],
      }),
      JETZT
    );
    expect(snapshot.kopfzeile.objekteGesamt).toBe(3);
    expect(snapshot.kopfzeile.mitBelegterMiete).toBe(1);
    // 1 von 3 beruht auf einer bundeslandweiten Schaetzung.
    expect(snapshot.kopfzeile.anteilBundeslandgenau).toBeCloseTo(1 / 3, 9);
    expect(snapshot.kopfzeile.topTrefferSeit).toBe("2026-09-08T00:00:00.000Z");
    expect(snapshot.erzeugtAm).toBe(JETZT.toISOString());
    expect(snapshot.lauf.id).toBe("34910160636");
  });

  it("nimmt jedes Objekt genau einmal auf, auch bei mehreren Versionen", () => {
    const snapshot = baueSnapshot(
      eingabe({
        listings: [listing("a"), listing("b")],
        versionen: [
          version("a", { scanned_at: "2026-09-10T00:00:00.000Z", price_cents: 9_900_000 }),
          version("a"),
          version("b"),
        ],
      }),
      JETZT
    );
    expect(snapshot.objekte).toHaveLength(2);
    expect(new Set(snapshot.objekte.map((o) => o.id)).size).toBe(2);
    // Die juengste Version gewinnt: 100.000 EUR, nicht 99.000 EUR.
    expect(snapshot.objekte.find((o) => o.id === "a")?.kaufpreisEuro).toBe(100_000);
  });
});

describe("baueSnapshot: jedes S0-Objekt traegt seinen Grund (A18-1)", () => {
  it("gibt jedem S0-Objekt einen Klartext-Grund, auch ohne data_gaps (A18)", () => {
    // Nachbau des ZVG-Objekts 9327fbb0 (Leverkusen): Wohnflaeche fehlt,
    // data_gaps leer.
    const snapshot = baueSnapshot(
      eingabe({ versionen: [version("a", { living_area_m2: null, data_gaps: [] })] }),
      JETZT
    );
    const objekt = snapshot.objekte[0];
    expect(objekt.stufe).toBe("S0");
    expect(objekt.datenluecken).toEqual(["Wohnfläche fehlt"]);
  });

  it("verdoppelt einen bereits vorhandenen Grund nicht", () => {
    const snapshot = baueSnapshot(
      eingabe({
        versionen: [version("a", { living_area_m2: null, data_gaps: ["wohnflaeche_fehlt"] })],
      }),
      JETZT
    );
    expect(snapshot.objekte[0].datenluecken).toEqual(["Wohnfläche fehlt"]);
  });

  it("behaelt Luecken, die nicht S0 begruenden", () => {
    // `location_unconfirmed` traegt keine S0-Einstufung, gehoert aber
    // weiterhin in die Liste -- der Export kuerzt keine Auskunft weg.
    const snapshot = baueSnapshot(
      eingabe({
        versionen: [version("a", { living_area_m2: null, data_gaps: ["location_unconfirmed"] })],
      }),
      JETZT
    );
    expect(snapshot.objekte[0].datenluecken).toEqual([
      "Lage (PLZ/Ort) nicht bestätigt",
      "Wohnfläche fehlt",
    ]);
  });

  it("nennt denselben Klartext nur einmal, auch wenn Altname und heutiger Name zusammen stehen", () => {
    // Pruefung Runde 1, M-4: Zwei VERSCHIEDENE Codes mit demselben Klartext
    // (`kaufpreis_unplausibel` ist der Altname von `preis_miete_unvereinbar`)
    // ueberstehen eine Entdopplung auf Code-Ebene und stuenden als derselbe
    // Satz zweimal da. Heute 0 Faelle im Bestand.
    const snapshot = baueSnapshot(
      eingabe({
        versionen: [
          version("a", { data_gaps: ["kaufpreis_unplausibel", "preis_miete_unvereinbar"] }),
        ],
      }),
      JETZT
    );
    expect(snapshot.objekte[0].stufe).toBe("S0");
    expect(snapshot.objekte[0].datenluecken).toEqual([
      "Preis und Miete unvereinbar — eine der beiden Zahlen stimmt nicht",
    ]);
  });

  it("nennt den Weg ueber eine unbekannte Mietquelle im Klartext", () => {
    // Pruefung Runde 1, M-6: Der einzige S0-Weg, dessen Grund in keiner
    // `data_gaps`-Zeile steht und nur aus `s0Gruende` kommt. Flaeche vorhanden,
    // keine Luecke, `rent_source` leer.
    const snapshot = baueSnapshot(
      eingabe({ versionen: [version("a", { rent_source: null, data_gaps: [] })] }),
      JETZT
    );
    expect(snapshot.objekte[0].stufe).toBe("S0");
    expect(snapshot.objekte[0].datenluecken).toEqual([
      "Mietquelle unbekannt — die Miete ist nicht einzuordnen",
    ]);
  });
});

describe("baueSnapshot: Kaufpreisfaktor am Objekt (A18-3)", () => {
  it("traegt den Kaufpreisfaktor am Objekt (Entwurf 2.3, A18-3)", () => {
    const snapshot = baueSnapshot(
      eingabe({ versionen: [version("a", { living_area_m2: "80" })] }),
      JETZT
    );
    const objekt = snapshot.objekte[0];

    // Derselbe Rechenweg wie `baueObjekt`, von Hand aus der Fixture
    // hergeleitet (Pruefung Runde 2, M-4): 100.000 EUR Kaufpreis (Default aus
    // `version()`), 80 m² statt der ueblichen 150, 3 angenommene Einheiten
    // (units unconfirmed -> MIN_EINHEITEN aus pipeline.ts), keine PLZ -> die
    // Miete wird bundeslandgenau fuer Bayern geschaetzt, der Satz ebenso.
    // Ein Vergleich nur auf "ist eine endliche Zahl" haette eine Verwechslung
    // mit einer anderen Kennzahl (z. B. `rangzahl`) nicht gefangen.
    const erwarteterFaktor = berechneKennzahlen(
      {
        kaufpreis: 100_000,
        jahreskaltmiete: ermittleJahreskaltmiete(null, 80, "", "Bayern").jahreskaltmiete,
        einheiten: 3,
        baujahr: null,
        wohnflaecheM2: 80,
      },
      grunderwerbsteuerSatzFuerBundesland("Bayern")
    ).kaufpreisfaktor;

    expect(objekt.kaufpreisfaktor).toBeTypeOf("number");
    expect(objekt.kaufpreisfaktor).toBeCloseTo(erwarteterFaktor, 9);
  });

  it("laesst den Kaufpreisfaktor bei S0 leer, statt Infinity zu schreiben", () => {
    const snapshot = baueSnapshot(
      eingabe({ versionen: [version("a", { living_area_m2: null })] }),
      JETZT
    );
    expect(snapshot.objekte[0].stufe).toBe("S0");
    expect(snapshot.objekte[0].kaufpreisfaktor).toBeNull();
  });

  it("laesst rangzahl endlich, wenn ein gespeicherter Nullpreis den DSCR nach Infinity treibt (Pruefung Runde 1, M-8)", () => {
    // `kaufpreisfaktor` ist an dieser Stelle schon abgesichert
    // (`einordnung.rangzahl === null ? null : endlichOderNull(...)`), aber
    // `rangzahl` selbst -- der DSCR aus `ranking.ts` -- wurde bisher
    // unbesehen durchgereicht. `price_cents: 0` ist ein GESPEICHERTER
    // Nullpreis, keine fehlende Angabe: `price_cents === null` liefe ueber
    // den S0-Pfad (Datenluecke `wohnflaeche_fehlt`/kein Preis) und waere
    // hier nicht der gemeinte Fall. Flaeche und Mietquelle bleiben wie in
    // der Basisfixture -- das Objekt landet also auf S1, nicht S0.
    const snapshot = baueSnapshot(
      eingabe({ versionen: [version("a", { price_cents: 0 })] }),
      JETZT
    );
    const objekt = snapshot.objekte[0];
    expect(objekt.stufe).not.toBe("S0");

    // Beleg VOR dem Fix: derselbe Rechenweg wie `baueObjekt`, von Hand
    // nachgerechnet. Kaufpreis 0 macht sowohl den Klammerterm als auch
    // `kaufnebenkosten` zu 0 -- der Nenner von `geschaetzterDscr` ist 0. Die
    // Miete (bundeslandgenau fuer Bayern geschaetzt, wie im Test "uebernimmt
    // Stufe, Rangzahl und Band unveraendert") ist positiv, `noi` bleibt es
    // auch (Bewirtschaftungskosten sind auf hoechstens 35 % der Miete
    // gedeckelt) -- der DSCR wird `Infinity`, nicht `NaN`.
    const jahreskaltmiete = ermittleJahreskaltmiete(null, 150, "", "Bayern").jahreskaltmiete;
    expect(jahreskaltmiete).toBeGreaterThan(0);
    const kennzahlen = berechneKennzahlen(
      {
        kaufpreis: 0,
        jahreskaltmiete,
        einheiten: 3,
        baujahr: null,
        wohnflaecheM2: 150,
      },
      grunderwerbsteuerSatzFuerBundesland("Bayern")
    );
    expect(kennzahlen.geschaetzterDscr).toBe(Infinity);

    // Die eigentliche Behauptung: das JS-Objekt VOR jeder Serialisierung
    // (JSON.stringify macht aus Infinity ohnehin null und verschleiert genau
    // die Verwechslung mit einem echten S0-null, um die es hier geht) traegt
    // nie Infinity. Mit dem heutigen Code (ohne Fix) ist `rangzahl` an dieser
    // Stelle Infinity, und dieser Test schlaegt fehl.
    expect(objekt.rangzahl).not.toBe(Infinity);
    expect(
      objekt.rangzahl === null || Number.isFinite(objekt.rangzahl)
    ).toBe(true);
  });

  it("laesst den Kaufpreisfaktor auch bei S0 MIT Flaeche leer, wo der Faktor endlich waere (Pruefung Runde 2, M-2)", () => {
    // Der vorige Test baut S0 ueber `living_area_m2: null` -- dort ist die
    // Miete 0 und der Faktor `Infinity`, und `endlichOderNull` machte daraus
    // ohnehin `null`. Er haette eine entfernte Nullung
    // (`einordnung.rangzahl === null ? null : ...`) nicht gemerkt. Diese
    // Fixture (aus dem A18-1-Test "Mietquelle unbekannt") ist S0 ueber eine
    // Mietquelle ausserhalb der Aufzaehlung, bei vorhandener Flaeche -- die
    // Miete wird trotzdem bundeslandgenau geschaetzt (`ermittleJahreskaltmiete`
    // fragt `rent_source` nicht ab) und der Faktor ist daher ENDLICH. Nur die
    // ausdrueckliche Pruefung auf `rangzahl === null` schuetzt hier.
    const snapshot = baueSnapshot(
      eingabe({ versionen: [version("a", { rent_source: null, data_gaps: [] })] }),
      JETZT
    );
    expect(snapshot.objekte[0].stufe).toBe("S0");
    expect(snapshot.objekte[0].kaufpreisfaktor).toBeNull();
  });
});

describe("baueSnapshot: Konstanten aus dem Export statt als dritte Kopie (A18-4)", () => {
  it("liefert Karenz und Meldeschwelle mit, statt sie der Oberflaeche zu ueberlassen (A18-4)", () => {
    const snapshot = baueSnapshot(eingabe(), JETZT);
    // Gegen die Quellen geprueft, nicht gegen Literale: Aendert jemand
    // KARENZ_TAGE, muss der Snapshot mitgehen -- genau darum geht es.
    expect(snapshot.konstanten.karenzTage).toBe(KARENZ_TAGE);
    expect(snapshot.konstanten.dscrMeldeschwelle).toBe(DSCR_MELDESCHWELLE);
  });
});
