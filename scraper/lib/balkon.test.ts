import { describe, it, expect } from "vitest";
import { erkenneBalkon } from "./balkon.js";

const leer = { ausstattung: [], titel: "", beschreibung: "" };

describe("erkenneBalkon", () => {
  it("strukturierte Ausstattung zaehlt zuerst", () => {
    expect(erkenneBalkon({ ...leer, ausstattung: ["Einbaukueche", "Balkon"] })).toEqual({ balkon: "ja", beleg: "Balkon" });
  });
  it("Loggia, Terrasse, Dachterrasse zaehlen", () => {
    expect(erkenneBalkon({ ...leer, titel: "2 Zimmer mit Loggia" }).balkon).toBe("ja");
    expect(erkenneBalkon({ ...leer, beschreibung: "grosse Dachterrasse" }).balkon).toBe("ja");
  });
  it("Suedbalkon im Fliesstext liefert den Satz als Beleg", () => {
    const r = erkenneBalkon({ ...leer, beschreibung: "Helle Wohnung. Sonniger Südbalkon nach Westen. Ruhige Lage." });
    expect(r).toEqual({ balkon: "ja", beleg: "Sonniger Südbalkon nach Westen." });
  });
  it("Negation gewinnt", () => {
    expect(erkenneBalkon({ ...leer, beschreibung: "Leider ohne Balkon, dafuer Garten." })).toEqual({ balkon: "nein", beleg: "Leider ohne Balkon, dafuer Garten." });
    expect(erkenneBalkon({ ...leer, beschreibung: "kein Balkon" }).balkon).toBe("nein");
    expect(erkenneBalkon({ ...leer, beschreibung: "Balkon nicht vorhanden" }).balkon).toBe("nein");
  });
  it("franzoesischer Balkon zaehlt nicht", () => {
    expect(erkenneBalkon({ ...leer, beschreibung: "mit französischem Balkon" })).toEqual({ balkon: "unbekannt", beleg: null });
    expect(erkenneBalkon({ ...leer, ausstattung: ["Französischer Balkon"] }).balkon).toBe("unbekannt");
  });
  it("Negation UND echter Balkon: Negation gewinnt (lieber verschlucken als falsch melden)", () => {
    expect(erkenneBalkon({ ...leer, beschreibung: "Kein Balkon im Wohnzimmer, aber Balkon an der Kueche." }).balkon).toBe("nein");
  });
  it("nichts gefunden ist unbekannt", () => {
    expect(erkenneBalkon(leer)).toEqual({ balkon: "unbekannt", beleg: null });
  });
});
