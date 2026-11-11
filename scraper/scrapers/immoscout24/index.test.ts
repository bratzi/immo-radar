import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { baueImmoscoutQuelle, type JsonAntwort } from "./index.js";
import { parseImmoscoutListe } from "./parse.js";

const fixture = (n: string) => JSON.parse(readFileSync(new URL(`../../test/fixtures/immoscout24/${n}`, import.meta.url), "utf8"));
const abrufer = { hole: async () => { throw new Error("Browser darf nicht benutzt werden"); }, warte: async () => {} };

function fake(antworten: JsonAntwort[]) {
  const urls: string[] = [];
  return { urls, hole: async (url: string) => { urls.push(url); return antworten.shift() ?? { status: 500, json: null }; } };
}
const seite = (n: number, von: number) => ({ ...fixture("liste.json"), pageNumber: n, numberOfPages: von });

describe("ImmoScout24-Sweep", () => {
  it("liest alle Seiten, Filter stehen in der URL, vollstaendig am Ende", async () => {
    const f = fake([{ status: 200, json: seite(1, 2) }, { status: 200, json: seite(2, 2) }]);
    const e = await baueImmoscoutQuelle(f.hole, async () => {}).sweep(abrufer, 60_000);
    expect(e).toMatchObject({ status: "ok", vollstaendig: true, hinweis: null });
    expect(e.angebote).toHaveLength(4);
    expect(f.urls).toHaveLength(2);
    expect(f.urls[0]).toContain("geocodes=%2Fde%2Fbayern%2Fmuenchen");
    expect(f.urls[0]).toContain("price=-1300.0");
    expect(f.urls[0]).not.toContain("balcony");
    expect(f.urls[1]).toContain("pagenumber=2");
  });

  it("403 auf Seite 1 ist gesperrt", async () => {
    const e = await baueImmoscoutQuelle(fake([{ status: 403, json: null }]).hole, async () => {}).sweep(abrufer, 60_000);
    expect(e).toMatchObject({ status: "gesperrt", vollstaendig: false, hinweis: "http" });
  });

  it("500 auf Seite 1 ist fehler", async () => {
    const e = await baueImmoscoutQuelle(fake([{ status: 500, json: null }]).hole, async () => {}).sweep(abrufer, 60_000);
    expect(e).toMatchObject({ status: "fehler", vollstaendig: false });
  });
});

describe("ImmoScout24-Detail", () => {
  const basis = parseImmoscoutListe(fixture("liste.json")).find((a) => a.externalId === "172539355")!;
  it("laedt das Expose und ergaenzt die Warmmiete", async () => {
    const f = fake([{ status: 200, json: fixture("expose-172539355.json") }]);
    const d = await baueImmoscoutQuelle(f.hole, async () => {}).ladeDetail(abrufer, basis);
    expect(f.urls[0]).toBe("https://api.mobile.immobilienscout24.de/expose/172539355");
    expect(d).toMatchObject({ sperre: null, angebot: { warmmieteCents: 126_000, warmmieteQuelle: "angegeben" } });
  });
  it("429 beim Expose ist Sperre, Angebot bleibt", async () => {
    const d = await baueImmoscoutQuelle(fake([{ status: 429, json: null }]).hole, async () => {}).ladeDetail(abrufer, basis);
    expect(d).toEqual({ angebot: basis, sperre: "http" });
  });
});
