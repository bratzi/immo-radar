import { describe, it, expect } from "vitest";
import {
  schaetzeRegionsKadenzen,
  kadenzFuerRegion,
  waehleJuengsteVersionen,
  zuListingZeile,
  zuVersionZeile,
  bestimmeTrefferklasse,
} from "./snapshot.js";

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
