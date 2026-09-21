import { describe, expect, it } from "vitest";
import { zvgSuchfelder, ZVG_SUCHE_URL } from "./zvgSuche.ts";

describe("zvgSuchfelder", () => {
  it("baut Bundeslandkuerzel und PLZ", () => {
    expect(zvgSuchfelder("zvg-portal", "Bayern", "97688")).toEqual({
      land_abk: "by",
      plz: "97688",
    });
  });

  it("schreibt Brandenburg als br, NICHT als bb", () => {
    // Die Kartentabelle in logik/karte.ts nutzt BB. Das ZVG-Portal kennt nur
    // br und antwortet auf bb mit "falsche Parameter uebergeben" -- am
    // 2026-09-21 gegen die Livesuche geprueft. Deshalb hat diese Abbildung
    // eine EIGENE Tabelle und erbt die der Karte nicht.
    expect(zvgSuchfelder("zvg-portal", "Brandenburg", "16562")?.land_abk).toBe("br");
  });

  it("gibt fuer Immowelt null zurueck -- dort ist der Direktlink in Ordnung", () => {
    expect(zvgSuchfelder("immowelt", "Bayern", "97688")).toBeNull();
  });

  it("gibt null ohne Bundesland zurueck", () => {
    // Ohne land_abk weist die Suche jede Anfrage ab. Ein Formular, das
    // sicher scheitert, ist so schlecht wie der kaputte Direktlink.
    expect(zvgSuchfelder("zvg-portal", null, "97688")).toBeNull();
  });

  it("gibt null bei unbekanntem Bundeslandnamen zurueck", () => {
    expect(zvgSuchfelder("zvg-portal", "Entenhausen", "97688")).toBeNull();
  });

  it("sucht ohne PLZ nur im Bundesland, statt gar nicht zu suchen", () => {
    // Eine Landesliste ist laenger als noetig, aber sie fuehrt zum Ziel --
    // der Direktlink fuehrte auf "error".
    expect(zvgSuchfelder("zvg-portal", "Hessen", null)).toEqual({ land_abk: "he", plz: "" });
  });

  it("behandelt die Platzhalter-PLZ 00000 wie keine PLZ", () => {
    // 3 von 189 ZVG-Objekten tragen 00000. Danach zu suchen liefert nichts.
    expect(zvgSuchfelder("zvg-portal", "Hessen", "00000")).toEqual({ land_abk: "he", plz: "" });
  });

  it("nennt die Suchadresse des Portals", () => {
    expect(ZVG_SUCHE_URL).toBe("https://www.zvg-portal.de/index.php?button=Suchen");
  });
});
