import { describe, expect, it } from "vitest";
import { LEERER_FILTER, type Filter } from "./filter.ts";
import type { Kartengroesse } from "./karte.ts";
import { FELDER, ausSuchstring, zuSuchstring } from "./filterUrl.ts";

/**
 * Ein Filter, in dem JEDES Feld gesetzt ist -- abgeleitet aus `FELDER` und
 * NICHT von Hand aufgezaehlt. Kommt ein 23. Feld dazu, landet es ohne Zutun
 * im Hin- und Rueckweg. Eine Handliste waere genau der Test, der ein
 * vergessenes Feld nicht findet.
 */
function vollerFilter(): Filter {
  const ziel = { ...LEERER_FILTER } as Record<string, unknown>;
  for (const [feld, { art }] of Object.entries(FELDER)) {
    if (art === "liste") ziel[feld] = ["eins", "zwei"];
    else if (art === "schalter") ziel[feld] = true;
    else if (art === "zahl") ziel[feld] = 42;
    else ziel[feld] = "2026-01-01";
  }
  return ziel as unknown as Filter;
}

describe("zuSuchstring und ausSuchstring", () => {
  it("fuehrt jedes gesetzte Feld unveraendert hin und zurueck", () => {
    const filter = vollerFilter();
    const kartengroesse: Kartengroesse = "medianDscr";
    expect(ausSuchstring(zuSuchstring(filter, kartengroesse))).toEqual({
      filter,
      kartengroesse,
    });
  });

  it("kennt jedes Feld des Filters", () => {
    // Zweite Wache neben dem Typpruefer: Sie haelt auch dann, wenn jemand
    // `FELDER` lockerer typisiert.
    expect(Object.keys(FELDER).sort()).toEqual(Object.keys(LEERER_FILTER).sort());
  });

  it("vergibt jeden Schluessel nur einmal", () => {
    const schluessel = Object.values(FELDER).map((f) => f.schluessel);
    expect(new Set(schluessel).size).toBe(schluessel.length);
  });

  it("ergibt fuer den leeren Filter eine leere Adresse", () => {
    // Sonst truege jede frische Seite Ballast.
    expect(zuSuchstring(LEERER_FILTER, "objekte")).toBe("");
  });

  it("laesst Kommas in Listen unveraendert stehen", () => {
    // Lesbarkeit: URLSearchParams wuerde "%2C" schreiben.
    const filter = { ...LEERER_FILTER, stufen: ["S2", "S3"] as Filter["stufen"] };
    expect(zuSuchstring(filter, "objekte")).toBe("st=S2,S3");
  });

  it("ignoriert einen unbekannten Schluessel, ohne den Rest zu verlieren", () => {
    const { filter } = ausSuchstring("st=S2&voellig=egal");
    expect(filter.stufen).toEqual(["S2"]);
  });

  it("wirft bei einer unlesbaren Zahl nicht, sondern nimmt den Standard", () => {
    const { filter } = ausSuchstring("kpv=abc");
    expect(filter.kaufpreisVon).toBeNull();
  });

  it("faellt bei unbekannter Kartengroesse auf objekte zurueck", () => {
    expect(ausSuchstring("karte=gibtesnicht").kartengroesse).toBe("objekte");
  });

  it("uebersteht ein Komma INNERHALB eines Listenwerts unveraendert", () => {
    // Echter Wert aus der Snapshot-Datei koennte so aussehen. Ein Komma im
    // Inhalt darf nicht mit dem Trennkomma zwischen Listenelementen
    // verwechselt werden -- sonst wird aus einem Eintrag beim Neuladen zwei.
    const filter = { ...LEERER_FILTER, datenluecken: ["Preis fehlt, Miete unklar"] };
    const such = zuSuchstring(filter, "objekte");
    expect(ausSuchstring(such).filter.datenluecken).toEqual(["Preis fehlt, Miete unklar"]);
  });

  it("uebersteht Prozentzeichen und Kaufmanns-Und in einem Listenwert unveraendert", () => {
    // Dieselbe Klasse Fehler, andere Zeichen: "%" muss beim Lesen nicht
    // vorzeitig dekodiert und "&" nicht als Feldtrenner missverstanden werden.
    const filter = { ...LEERER_FILTER, datenluecken: ["Kauf & Miete: 50% unklar"] };
    const such = zuSuchstring(filter, "objekte");
    expect(ausSuchstring(such).filter.datenluecken).toEqual(["Kauf & Miete: 50% unklar"]);
  });

  it("liest ein Listenfeld auch mit fuehrendem Fragezeichen im Suchteil", () => {
    // Die eigene Zerlegung fuer Listenfelder (siehe Komma-Fix) darf sich
    // hier nicht anders verhalten als `URLSearchParams` bei den uebrigen
    // Feldarten -- beide muessen ein fuehrendes "?" gleich tolerieren.
    expect(ausSuchstring("?st=S2").filter.stufen).toEqual(["S2"]);
  });
});
