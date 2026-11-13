import { describe, it, expect } from "vitest";
import { leeresAngebot } from "./typen.js";
import { pruefeProfil, PROFIL } from "./profil.js";

const BASIS = () => leeresAngebot({
  quelle: "immowelt", externalId: "x", url: "https://example.org/x", titel: "Wohnung",
  warmmieteCents: 120_000, warmmieteQuelle: "angegeben", zimmer: 2, flaecheM2: 50,
  balkon: "ja", balkonBeleg: "Balkon", plz: "80802", befristet: false,
});

describe("pruefeProfil", () => {
  it("passt bei allen Pflichtmerkmalen", () => {
    expect(pruefeProfil(BASIS())).toEqual({ passt: "ja", gruende: [] });
  });
  it.each([
    "***NEUHAUSEN*** 3 möblierte WG-Zimmer in modernisierter 4er-WG",
    "Neugründung einer zentralen 4er-WG in München-Neuhausen",
    "4-er WG Eschenbachstr. 3, 81549München",
    "Zimmer in Wohngemeinschaft, Schwabing",
    "WG Zimmer frei ab Dezember",
    "Ein privates Zimmer für eine Frau mit KVR",
    "1 Zimmer frei in 3 Zimmer Wohnung",
    "Zimmer zu vermieten in Pasing",
    "Möbliertes Zimmer in ruhiger Lage",
    "***Wunderschönes Balkonzimmer mit Aussicht über ganz München ab sofort verfügbar*** - Ramersdorf-Perlach",
    "Einzelzimmer in Schwabing frei",
  ])("WG-Angebot ist raus: %s", (titel) => {
    const a = BASIS(); a.titel = titel;
    expect(pruefeProfil(a)).toEqual({ passt: "nein", gruende: ["wg_zimmer"] });
  });
  it.each([
    "WG-geeignete 3-Zimmer-Wohnung", "Wohnung, auch als WG geeignet", "2-Zimmer-Wohnung mit Balkon",
    "Helle 2 Zimmer Wohnung in Laim", "Zuhause mit 2 Zimmern in Forstenried", "3 Zimmer, Küche, Bad in Giesing",
    "2-Zimmer-Wohnung mit großem Wohnzimmer", "Altbau mit Wohnzimmer und Balkon, 2 Zimmer",
    // ImmoScout 2026-11-13: ganze Wohnungen, die faelschlich als WG galten.
    "Für Singles & Paare - Zwei Zimmer zu vermieten!",
    "2 Zimmer-Wohnung mit Wintergarten ideal für WG/Pärchen, verkehrsgünstig",
  ])(
    "WG-geeignete Wohnung bleibt drin: %s", (titel) => {
      const a = BASIS(); a.titel = titel;
      expect(pruefeProfil(a).passt).toBe("ja");
    });
  it("Grenzwerte sind einschliessend", () => {
    const a = BASIS(); a.warmmieteCents = PROFIL.warmmieteMaxCents; a.zimmer = 2; a.flaecheM2 = 45;
    expect(pruefeProfil(a).passt).toBe("ja");
  });
  it("zu teuer ist raus", () => {
    const a = BASIS(); a.warmmieteCents = 130_001;
    expect(pruefeProfil(a)).toEqual({ passt: "nein", gruende: ["warmmiete_zu_hoch"] });
  });
  it("Warmmiete unbekannt ist unklar, nicht raus", () => {
    const a = BASIS(); a.warmmieteCents = null; a.warmmieteQuelle = "unbekannt";
    expect(pruefeProfil(a)).toEqual({ passt: "unklar", gruende: ["warmmiete_unbekannt"] });
  });
  it("ein Zimmer ist raus, 1,5 Zimmer auch", () => {
    const a = BASIS(); a.zimmer = 1.5;
    expect(pruefeProfil(a).passt).toBe("nein");
  });
  it("44,5 m2 ist raus", () => {
    const a = BASIS(); a.flaecheM2 = 44.5;
    expect(pruefeProfil(a).gruende).toEqual(["flaeche_zu_klein"]);
  });
  it("Balkon ist Pluspunkt, kein Muss: nein und unbekannt passen", () => {
    const a = BASIS(); a.balkon = "nein";
    expect(pruefeProfil(a)).toEqual({ passt: "ja", gruende: [] });
    a.balkon = "unbekannt";
    expect(pruefeProfil(a)).toEqual({ passt: "ja", gruende: [] });
  });
  it("Umland-PLZ ist raus, nicht unklar", () => {
    const a = BASIS(); a.plz = "85521";
    expect(pruefeProfil(a)).toEqual({ passt: "nein", gruende: ["ausserhalb_muenchen"] });
  });
  it("PLZ unbekannt ist unklar", () => {
    const a = BASIS(); a.plz = null;
    expect(pruefeProfil(a)).toEqual({ passt: "unklar", gruende: ["plz_unbekannt"] });
  });
  it("befristet ist raus", () => {
    const a = BASIS(); a.befristet = true;
    expect(pruefeProfil(a).gruende).toEqual(["befristet"]);
  });
  it("nein schlaegt unklar: zu teuer UND PLZ unbekannt ist nein mit beiden Gruenden", () => {
    const a = BASIS(); a.warmmieteCents = 200_000; a.plz = null;
    expect(pruefeProfil(a)).toEqual({ passt: "nein", gruende: ["warmmiete_zu_hoch", "plz_unbekannt"] });
  });
});
