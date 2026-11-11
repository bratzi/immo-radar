import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseWgGesuchtListe, plzFuerStadtteil } from "./parse.js";
import { pruefeProfil } from "../../lib/profil.js";

const html = readFileSync(new URL("../../test/fixtures/wg-gesucht/liste.html", import.meta.url), "utf8");

describe("plzFuerStadtteil", () => {
  it("ordnet Stadtbezirke einer Muenchner PLZ zu", () => {
    expect(plzFuerStadtteil("Bogenhausen")).toBe("81925");
    expect(plzFuerStadtteil("Pasing-Obermenzing")).toBe("81241");
    expect(plzFuerStadtteil("Sendling-Westpark")).toBe("81373");
    expect(plzFuerStadtteil("Schwabing")).toBe("80796");
  });
  it("unbekannter Ort bleibt null", () => {
    expect(plzFuerStadtteil("Emmering")).toBeNull();
    expect(plzFuerStadtteil(null)).toBeNull();
  });
});

describe("parseWgGesuchtListe", () => {
  const liste = parseWgGesuchtListe(html);

  it("liest alle 5 Karten", () => {
    expect(liste.map((a) => a.externalId)).toEqual(["14327734", "5792739", "14315553", "10526015", "11262567"]);
  });

  it("Bogenhausen: Gesamtmiete ist angegebene Warmmiete", () => {
    const a = liste.find((x) => x.externalId === "10526015")!;
    expect(a).toMatchObject({
      quelle: "wg-gesucht",
      url: "https://www.wg-gesucht.de/wohnungen-in-Muenchen-Bogenhausen.10526015.html",
      warmmieteCents: 85_000,
      kaltmieteCents: null,
      flaecheM2: 65,
      stadtteil: "Bogenhausen",
      plz: "81925",
      verfuegbarAb: "01.12.2026",
      detailGeladen: false,
    });
    expect(a.zimmer).toBeGreaterThanOrEqual(2);
    expect(a.bildUrls.length).toBeGreaterThan(0);
    expect(a.bildUrls[0]).toMatch(/^https:\/\/img\.wg-gesucht\.de\//);
  });

  it("Pasing: Zimmer aus dem Untertitel, Titel entschluesselt", () => {
    const a = liste.find((x) => x.externalId === "14327734")!;
    expect(a).toMatchObject({ zimmer: 2, flaecheM2: 69, warmmieteCents: 95_000 });
    expect(a.titel).toContain("Terrasse & Gartenanteil");
  });

  it("WG-Zimmer fallen im Profil raus, Emmering bleibt unklar", () => {
    const urteil = (id: string) => pruefeProfil(liste.find((x) => x.externalId === id)!);
    expect(urteil("14327734").passt).toBe("nein");
    expect(urteil("5792739").passt).toBe("nein");
    expect(urteil("11262567").gruende).toContain("plz_unbekannt");
  });

  it("enthaelt keine Namen der Inserierenden", () => {
    expect(JSON.stringify(liste)).not.toMatch(/user-name/);
  });
});
