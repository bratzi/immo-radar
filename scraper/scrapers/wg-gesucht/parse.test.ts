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
  it("Fuerstenried, Fuerstenried West, Forstenried und Solln liegen im Sueden, nicht in Obersendling", () => {
    expect(plzFuerStadtteil("Fürstenried West")).toBe("81476");
    expect(plzFuerStadtteil("Fuerstenried")).toBe("81476");
    expect(plzFuerStadtteil("Forstenried")).toBe("81476");
    expect(plzFuerStadtteil("Solln")).toBe("81479");
    expect(plzFuerStadtteil("Obersendling")).toBe("81379");
  });
  it("Umland Suedwest (WG-Gesucht fuehrt es als Stadtteil von Muenchen) bekommt seine PLZ", () => {
    expect(plzFuerStadtteil("Neuried")).toBe("82061");
    expect(plzFuerStadtteil("Planegg")).toBe("82152");
    expect(plzFuerStadtteil("Martinsried")).toBe("82152");
    expect(plzFuerStadtteil("Gräfelfing")).toBe("82166");
    expect(plzFuerStadtteil("Graefelfing")).toBe("82166");
    expect(plzFuerStadtteil("Lochham")).toBe("82166");
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

describe("WG-Gesucht online seit", () => {
  it("liest Datum und '2 T.' von der Karte", () => {
    const jetzt = new Date("2026-11-12T10:00:00Z");
    const l = parseWgGesuchtListe(html, jetzt);
    expect(l.find((x) => x.externalId === "10526015")!.veroeffentlichtAm).toBe("2026-11-04T23:00:00.000Z");
    expect(l.find((x) => x.externalId === "14327734")!.veroeffentlichtAm).toBe("2026-11-10T10:00:00.000Z");
  });
});
