import { describe, it, expect } from "vitest";
import { pruefeSeite } from "./online.js";
import type { Abrufer, Antwort } from "./quelle.js";

const ab = (a: Partial<Antwort>): Abrufer => ({
  hole: async (url) => ({ status: 200, html: '<h1 id="viewad-title">x</h1>', url, ...a }),
  warte: async () => {},
});
const URL = "https://www.kleinanzeigen.de/s-anzeige/x/123-203-1";
const BLEIBT = /\/s-anzeige\//, INHALT = /id="viewad-title"/;

describe("pruefeSeite", () => {
  it("online, wenn die Seite unter ihrer Adresse bleibt", async () => {
    expect(await pruefeSeite(ab({}), URL, BLEIBT, INHALT)).toBe("online");
  });
  it("weg bei Umleitung auf die Kategorie oder 404/410", async () => {
    expect(await pruefeSeite(ab({ url: "https://www.kleinanzeigen.de/s-wohnung-mieten/c203" }), URL, BLEIBT, INHALT)).toBe("weg");
    expect(await pruefeSeite(ab({ status: 404 }), URL, BLEIBT)).toBe("weg");
    expect(await pruefeSeite(ab({ status: 410 }), URL, BLEIBT)).toBe("weg");
  });
  it("unklar bei anderem Status oder fehlendem Inhalt, nie weg", async () => {
    expect(await pruefeSeite(ab({ status: 500 }), URL, BLEIBT)).toBe("unklar");
    expect(await pruefeSeite(ab({ html: "<p>leer</p>" }), URL, BLEIBT, INHALT)).toBe("unklar");
  });
});
