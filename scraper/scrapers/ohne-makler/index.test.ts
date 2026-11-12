import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ohneMaklerQuelle, ohneMaklerSeitenUrl } from "./index.js";
import type { Abrufer, Antwort } from "../quelle.js";

const html = readFileSync(new URL("../../test/fixtures/ohne-makler/liste.html", import.meta.url), "utf8");

function fake(antworten: Antwort[]): Abrufer & { urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    hole: async (url) => { urls.push(url); return antworten.shift() ?? { status: 500, html: "", url }; },
    warte: async () => {},
  };
}

describe("ohneMaklerSeitenUrl", () => {
  it("Seite 1 ohne Parameter, ab Seite 2 mit page", () => {
    expect(ohneMaklerSeitenUrl(1)).toBe("https://www.ohne-makler.net/immobilien/wohnung-mieten/bayern/munchen/");
    expect(ohneMaklerSeitenUrl(3)).toBe("https://www.ohne-makler.net/immobilien/wohnung-mieten/bayern/munchen/?page=3");
  });
});

describe("Ohne-Makler-Sweep", () => {
  it("eine Seite ohne neue Inserate ist das Ende: vollstaendig", async () => {
    const ab = fake([{ status: 200, html, url: "u" }, { status: 200, html, url: "u" }]);
    const e = await ohneMaklerQuelle.sweep(ab, 60_000);
    expect(e).toMatchObject({ status: "ok", vollstaendig: true });
    expect(ab.urls).toHaveLength(2);
    expect(e.angebote.length).toBeGreaterThanOrEqual(15);
  });

  it("403 auf Seite 1 ist gesperrt", async () => {
    const e = await ohneMaklerQuelle.sweep(fake([{ status: 403, html: "", url: "u" }]), 60_000);
    expect(e.status).toBe("gesperrt");
  });

  it("Seite 1 ohne Karten ist fehler", async () => {
    const e = await ohneMaklerQuelle.sweep(fake([{ status: 200, html: "<html></html>", url: "u" }]), 60_000);
    expect(e).toMatchObject({ status: "fehler", hinweis: "keine Karten auf Seite 1" });
  });
});
