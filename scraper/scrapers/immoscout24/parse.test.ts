import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseImmoscoutListe, parseImmoscoutExpose, euroCents } from "./parse.js";

const fixture = (n: string) => JSON.parse(readFileSync(new URL(`../../test/fixtures/immoscout24/${n}`, import.meta.url), "utf8"));

describe("euroCents", () => {
  it("liest deutsche Betraege", () => {
    expect(euroCents("1.080 €")).toBe(108_000);
    expect(euroCents("3.240,00")).toBe(324_000);
    expect(euroCents("keine Angabe")).toBeNull();
    expect(euroCents(undefined)).toBeNull();
  });
});

describe("parseImmoscoutListe", () => {
  const liste = parseImmoscoutListe(fixture("liste.json"));

  it("wirft Tauschwohnungen raus", () => {
    expect(liste.some((a) => /tausch/i.test(a.titel))).toBe(false);
    expect(liste).toHaveLength(4);
  });

  it("liest Forstenried: Listenpreis ist Kaltmiete, Warmmiete bleibt leer (Pipeline schaetzt)", () => {
    const a = liste.find((x) => x.externalId === "172539355")!;
    expect(a).toMatchObject({
      quelle: "immoscout24",
      url: "https://www.immobilienscout24.de/expose/172539355",
      titel: "Zuhause mit 2 Zimmern in Forstenried",
      kaltmieteCents: 108_000,
      warmmieteCents: null,
      nebenkostenCents: null,
      zimmer: 2,
      flaecheM2: 48,
      plz: "81476",
      balkon: "unbekannt",
      detailGeladen: false,
    });
    expect(a.bildUrls).toHaveLength(1);
  });

  it("Befristung und Balkon im Titel werden erkannt", () => {
    const [a] = parseImmoscoutListe({ resultListItems: [
      { type: "EXPOSE_RESULT", item: { id: "1", title: "Befristete möblierte 2-Zimmer-Wohnung mit Balkon", attributes: [] } },
    ] });
    expect(a).toMatchObject({ befristet: true, balkon: "ja" });
  });

  it("liest Dezimalflaeche 48,6 m2", () => {
    expect(liste.some((a) => a.flaecheM2 === 48.6)).toBe(true);
  });
});

describe("parseImmoscoutExpose", () => {
  const basis = parseImmoscoutListe(fixture("liste.json")).find((x) => x.externalId === "172539355")!;

  it("Forstenried: Warmmiete angegeben, Nebenkosten, Balkon ja, bezugsfrei", () => {
    const a = parseImmoscoutExpose(fixture("expose-172539355.json"), basis)!;
    expect(a).toMatchObject({
      kaltmieteCents: 108_000,
      nebenkostenCents: 18_000,
      warmmieteCents: 126_000,
      balkon: "ja",
      balkonBeleg: "Balkon/Terrasse",
      verfuegbarAb: "1.12.2026",
      stadtteil: "Forstenried",
      detailGeladen: true,
    });
  });

  it("Bilder kommen aus dem MEDIA-Abschnitt (nur PICTURE), sonst bleibt das Titelbild", () => {
    const roh = fixture("expose-172539355.json");
    const ohne = parseImmoscoutExpose(roh, basis)!;
    expect(ohne.bildUrls).toEqual(basis.bildUrls);
    roh.sections.unshift({ type: "MEDIA", media: [
      { type: "PICTURE", previewImageUrl: "https://pictures.example/1.jpg", fullImageUrl: "https://pictures.example/1-gross.jpg" },
      { type: "VIDEO", previewImageUrl: "https://pictures.example/video.jpg" },
      { type: "PICTURE", previewImageUrl: "https://pictures.example/2.jpg" },
    ] });
    expect(parseImmoscoutExpose(roh, basis)!.bildUrls).toEqual(["https://pictures.example/1.jpg", "https://pictures.example/2.jpg"]);
  });

  it("Tauschwohnung im Exposetitel ergibt null", () => {
    expect(parseImmoscoutExpose(fixture("expose-tausch.json"), basis)).toBeNull();
  });
});

describe("ImmoScout24 online seit", () => {
  it("liest 'vor einem Tag' aus der Liste relativ zum Lauf", () => {
    const jetzt = new Date("2026-11-12T10:00:00Z");
    const a = parseImmoscoutListe(fixture("liste.json"), jetzt).find((x) => x.externalId === "172539355")!;
    expect(a.veroeffentlichtAm).toBe("2026-11-11T10:00:00.000Z");
  });
});
