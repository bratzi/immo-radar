import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseKleinanzeigenListe, parseKleinanzeigenDetail, deutscheZahl } from "./parse.js";

const fixture = (name: string) =>
  readFileSync(new URL(`../../test/fixtures/kleinanzeigen/${name}`, import.meta.url), "utf-8");
const liste1 = fixture("liste-1.html");
const liste2 = fixture("liste-2.html");
const kontext = (externalId: string) => ({ externalId, url: `https://www.kleinanzeigen.de/s-anzeige/x/${externalId}` });

describe("deutscheZahl", () => {
  it("liest Komma als Dezimaltrenner und Punkt als Tausender", () => {
    expect(deutscheZahl("2,5")).toBe(2.5);
    expect(deutscheZahl("1.240")).toBe(1240);
    expect(deutscheZahl("84.00")).toBe(84);
    expect(deutscheZahl("abc")).toBeNull();
  });
});

describe("parseKleinanzeigenListe", () => {
  const karten = parseKleinanzeigenListe(liste1);

  it("liest alle 27 Karten ausser den 11 Tauschangeboten", () => {
    expect(karten.length).toBe(16);
    expect(karten.map((k) => k.externalId)).not.toContain("3538567900"); // TAUSCHWOHNUNG
    expect(karten.map((k) => k.externalId)).not.toContain("3382845073"); // Wohnungsswap
  });

  it("liest eine Privatkarte: Kaltmiete, Flaeche, Zimmer, PLZ, Stadtteil", () => {
    const k = karten.find((x) => x.externalId === "3565305244")!;
    expect(k).toMatchObject({
      quelle: "kleinanzeigen",
      url: "https://www.kleinanzeigen.de/s-anzeige/ruhige-moderne-2-zimmer-wohnung/3565305244-203-6481",
      titel: "Ruhige moderne 2 Zimmer Wohnung",
      kaltmieteCents: 118_000, warmmieteCents: null, nebenkostenCents: null,
      zimmer: 2, flaecheM2: 48, plz: "81827", stadtteil: "Trudering-Riem",
      detailGeladen: false, veroeffentlichtAm: null,
    });
  });

  it("Liste traegt kein Datum: veroeffentlichtAm bleibt bei allen null", () => {
    expect(karten.every((k) => k.veroeffentlichtAm === null)).toBe(true);
  });

  it("Balkon aus dem Kartentext ist hoechstens ja, nie nein", () => {
    expect(karten.every((k) => k.balkon !== "nein")).toBe(true);
    expect(karten.find((x) => x.externalId === "3562512873")!.balkon).toBe("ja");
  });

  it("Zimmer sind plausibel, nie 25 statt 2,5", () => {
    expect(karten.every((k) => k.zimmer === null || (k.zimmer >= 1 && k.zimmer <= 10))).toBe(true);
  });

  it("zweite Listenseite hat dieselbe Struktur", () => {
    const k2 = parseKleinanzeigenListe(liste2);
    expect(k2.length).toBeGreaterThan(5);
    expect(k2.every((k) => k.kaltmieteCents !== null && k.plz !== null)).toBe(true);
  });

  it("schliesst Gesuche aus, behaelt 'Suche Nachmieter'", () => {
    const karte = (id: string, titel: string) =>
      `<article data-adid="${id}" data-href="/s-anzeige/x/${id}-203-1"><div>80331 Altstadt</div><h2>${titel}</h2><p>60 m² · 2 Zi.</p><p>1.000 €</p></article>`;
    const html = `<html><body>${karte("1", "Suche 2-Zimmer-Wohnung in Schwabing")}${karte("2", "Suche Nachmieter")}${karte("3", "Wir suchen eine Wohnung")}</body></html>`;
    expect(parseKleinanzeigenListe(html).map((k) => k.externalId)).toEqual(["2"]);
  });
});

describe("parseKleinanzeigenDetail", () => {
  it("JSON-Weg (detail-1): Warmmiete angegeben, Nebenkosten inkl. Heizung, Balkon aus Merkmalen", () => {
    const a = parseKleinanzeigenDetail(fixture("detail-1.html"), kontext("3565305244"))!;
    expect(a).toMatchObject({
      quelle: "kleinanzeigen", externalId: "3565305244", titel: "Ruhige moderne 2 Zimmer Wohnung",
      kaltmieteCents: 118_000, nebenkostenCents: 25_000, warmmieteCents: 150_000,
      zimmer: 2, flaecheM2: 48, plz: "81827", stadtteil: "Trudering-Riem",
      balkon: "ja", balkonBeleg: "Balkon", verfuegbarAb: "November 2026", detailGeladen: true,
      veroeffentlichtAm: new Date(1794139486000).toISOString(),
    });
    expect(a.bildUrls.length).toBe(16);
  });

  it("gewerbliches Inserat: sortingDate ist Hochschiebezeit und wird nicht als Datum uebernommen", () => {
    const a = parseKleinanzeigenDetail(fixture("detail-5.html"), kontext("3568837941"))!;
    expect(a.warmmieteCents).toBe(74_500);
    expect(a.zimmer).toBe(1);
    expect(a.veroeffentlichtAm).toBeNull();
  });

  it("Selektor-Rueckfall (detail-0, alte Seitenform ohne JSON)", () => {
    const html = fixture("detail-0.html");
    expect(html).not.toContain("&quot;ogTitle&quot;");
    const a = parseKleinanzeigenDetail(html, kontext("3562512873"))!;
    expect(a).toMatchObject({
      kaltmieteCents: 198_000, nebenkostenCents: 50_000, warmmieteCents: 248_000,
      zimmer: 3, flaecheM2: 84, plz: "81669", stadtteil: "Au-Haidhausen",
      balkon: "ja", detailGeladen: true, veroeffentlichtAm: "2026-11-05",
    });
    expect(a.titel).toBe("Möbliert: 3-Zi.-Whg. 84 m², Au/Haidhausen, Balkon, ab 15.11.");
    expect(a.bildUrls.length).toBeGreaterThan(0);
  });

  it("Kaltmiete ohne Warmmiete bleibt unbekannt, wird nicht erfunden", () => {
    const html = fixture("detail-1.html").replaceAll("&quot;Warmmiete&quot;", "&quot;Sonstiges&quot;");
    const a = parseKleinanzeigenDetail(html, kontext("3565305244"))!;
    expect(a.warmmieteCents).toBeNull();
    expect(a.kaltmieteCents).toBe(118_000);
  });

  it("Gesuch und Tauschangebot im Detail: null (ausschliessen)", () => {
    const gesuch = fixture("detail-1.html").replaceAll("&quot;adType&quot;:[0,&quot;OFFER&quot;]", "&quot;adType&quot;:[0,&quot;WANTED&quot;]");
    expect(parseKleinanzeigenDetail(gesuch, kontext("3565305244"))).toBeNull();
    const tausch = fixture("detail-1.html").replaceAll("&quot;Kein Tausch&quot;", "&quot;Tausch&quot;");
    expect(parseKleinanzeigenDetail(tausch, kontext("3565305244"))).toBeNull();
  });
});
