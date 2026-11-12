import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { wgGesuchtQuelle, wgGesuchtSeitenUrl } from "./index.js";
import type { Abrufer, Antwort } from "../quelle.js";

const html = readFileSync(new URL("../../test/fixtures/wg-gesucht/liste.html", import.meta.url), "utf8");

function fake(antworten: Antwort[]): Abrufer & { urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    hole: async (url) => { urls.push(url); return antworten.shift() ?? { status: 500, html: "", url }; },
    warte: async () => {},
  };
}

describe("wgGesuchtSeitenUrl", () => {
  it("Filter in der URL, Seiten 0-basiert im Pfad", () => {
    const u1 = wgGesuchtSeitenUrl(1);
    expect(u1).toContain("/wohnungen-in-Muenchen.90.2.1.0.html");
    expect(u1).toContain("rMax=1800");
    expect(u1).toContain("sMin=30");
    expect(u1).not.toContain("rmMin=");
    expect(wgGesuchtSeitenUrl(2)).toContain(".90.2.1.1.html");
  });
  it("Format der Blaetter-Links der Seite: ohne offer_filter, categories[0] (sonst liefert jede Seite Seite 0)", () => {
    for (const u of [wgGesuchtSeitenUrl(1), wgGesuchtSeitenUrl(2)]) {
      expect(u).not.toContain("offer_filter");
      expect(u).toContain("categories%5B0%5D=2");
      expect(u).toContain("rent_types%5B0%5D=2");
    }
  });
});

describe("WG-Gesucht-Sweep: Ende der Liste", () => {
  it("eine volle Seite ohne neue Inserate beendet den Lauf als vollstaendig", async () => {
    const voll = html.repeat(5); // 25 Karten, aber nur 5 verschiedene
    const ab = fake([{ status: 200, html: voll, url: "u" }, { status: 200, html: voll, url: "u" }]);
    const e = await wgGesuchtQuelle.sweep(ab, 60_000);
    expect(ab.urls).toHaveLength(2);
    expect(e).toMatchObject({ status: "ok", vollstaendig: true });
    expect(e.angebote).toHaveLength(5);
  });
});

describe("WG-Gesucht-Sweep", () => {
  it("eine kurze Seite ist das Ende der Liste: vollstaendig", async () => {
    const ab = fake([{ status: 200, html, url: "u" }]);
    const e = await wgGesuchtQuelle.sweep(ab, 60_000);
    expect(e).toMatchObject({ status: "ok", vollstaendig: true, hinweis: null });
    expect(e.angebote).toHaveLength(5);
    expect(ab.urls).toHaveLength(1);
  });

  it("403 ist gesperrt", async () => {
    const e = await wgGesuchtQuelle.sweep(fake([{ status: 403, html: "", url: "u" }]), 60_000);
    expect(e.status).toBe("gesperrt");
  });

  it("Seite 1 ohne Karten ist fehler", async () => {
    const e = await wgGesuchtQuelle.sweep(fake([{ status: 200, html: "<html></html>", url: "u" }]), 60_000);
    expect(e).toMatchObject({ status: "fehler", hinweis: "keine Karten auf Seite 1" });
  });
});

describe("WG-Gesucht-Detail", () => {
  it("ruft nichts ab und gibt das Angebot unveraendert zurueck", async () => {
    const ab = fake([]);
    const [a] = (await wgGesuchtQuelle.sweep(fake([{ status: 200, html, url: "u" }]), 60_000)).angebote;
    expect(await wgGesuchtQuelle.ladeDetail(ab, a)).toEqual({ angebot: a, sperre: null });
    expect(ab.urls).toHaveLength(0);
  });
});
