import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { planeVorschau, aktualisiereVorschau, verkleinere, VORSCHAU_MAX_BILDER, type Kandidat, type Vorhanden, type VorschauSpeicher } from "./vorschau.js";

const k = (id: string, urls: string[]): Kandidat => ({ quelle: "wg-gesucht", externalId: id, bildUrls: urls });

describe("planeVorschau", () => {
  it("neue Kandidaten und geaenderte Bilder werden geladen, unveraenderte nicht", () => {
    const kandidaten = [k("1", ["a", "b"]), k("2", ["c"]), k("3", ["d", "e"])];
    const vorhanden: Vorhanden[] = [
      { quelle: "wg-gesucht", externalId: "2", quellUrls: ["c"] },
      { quelle: "wg-gesucht", externalId: "3", quellUrls: ["d"] },
    ];
    const p = planeVorschau(kandidaten, vorhanden, 10);
    expect(p.laden.map((x) => x.externalId)).toEqual(["1", "3"]);
    expect(p.loeschen).toEqual([]);
  });

  it("nur die ersten Bilder zaehlen; Bilder dahinter loesen kein Neuladen aus", () => {
    const urls = ["a", "b", "c", "d", "e"];
    const p = planeVorschau([k("1", urls)], [{ quelle: "wg-gesucht", externalId: "1", quellUrls: urls.slice(0, VORSCHAU_MAX_BILDER) }], 10);
    expect(p.laden).toEqual([]);
  });

  it("Vorschau ohne passenden Kandidaten wird geloescht", () => {
    const p = planeVorschau([k("1", ["a"])], [
      { quelle: "wg-gesucht", externalId: "1", quellUrls: ["a"] },
      { quelle: "immoscout24", externalId: "9", quellUrls: ["x"] },
    ], 10);
    expect(p.loeschen).toEqual([{ quelle: "immoscout24", externalId: "9" }]);
  });

  it("haelt sich an die Hoechstzahl je Lauf und laesst Kandidaten ohne Bild aus", () => {
    const p = planeVorschau([k("1", []), k("2", ["a"]), k("3", ["b"]), k("4", ["c"])], [], 2);
    expect(p.laden.map((x) => x.externalId)).toEqual(["2", "3"]);
  });
});

describe("verkleinere", () => {
  it("macht aus einem grossen Bild eine kleine WebP-data-URL", async () => {
    const gross = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg().toBuffer();
    const url = await verkleinere(gross);
    expect(url.startsWith("data:image/webp;base64,")).toBe(true);
    const roh = Buffer.from(url.split(",")[1], "base64");
    const meta = await sharp(roh).metadata();
    expect(meta.width).toBe(288);
    expect(roh.length).toBeLessThan(20_000);
  });
});

function fakeSpeicher(kandidaten: Kandidat[], vorhanden: Vorhanden[]) {
  const gespeichert: { quelle: string; externalId: string; bilder: string[]; quellUrls: string[] }[] = [];
  const geloescht: { quelle: string; externalId: string }[] = [];
  const s: VorschauSpeicher = {
    kandidaten: async () => kandidaten,
    vorhandene: async () => vorhanden,
    speichere: async (z) => { gespeichert.push(z); },
    loesche: async (keys) => { geloescht.push(...keys); },
  };
  return { s, gespeichert, geloescht };
}

describe("aktualisiereVorschau", () => {
  it("laedt, verkleinert und speichert; kaputte Bilder werden uebersprungen", async () => {
    const { s, gespeichert } = fakeSpeicher([k("1", ["ok1", "kaputt", "ok2"])], []);
    const e = await aktualisiereVorschau(s, {
      hole: async (u) => { if (u === "kaputt") throw new Error("404"); return Buffer.from(u); },
      verkleinere: async (b) => `data:image/webp;base64,${b.toString("base64")}`,
      budgetMs: 10_000,
    });
    expect(gespeichert).toHaveLength(1);
    expect(gespeichert[0].bilder).toHaveLength(2);
    expect(gespeichert[0].quellUrls).toEqual(["ok1", "kaputt", "ok2"]);
    expect(e).toMatchObject({ geladen: 1, fehlerBilder: 1 });
  });

  it("speichert nichts, wenn kein Bild ladbar war, damit der naechste Lauf es erneut versucht", async () => {
    const { s, gespeichert } = fakeSpeicher([k("1", ["kaputt"])], []);
    await aktualisiereVorschau(s, { hole: async () => { throw new Error("403"); }, verkleinere: async () => "x", budgetMs: 10_000 });
    expect(gespeichert).toHaveLength(0);
  });

  it("loescht verwaiste Vorschauen", async () => {
    const { s, geloescht } = fakeSpeicher([], [{ quelle: "wg-gesucht", externalId: "7", quellUrls: ["a"] }]);
    const e = await aktualisiereVorschau(s, { hole: async () => Buffer.from(""), verkleinere: async () => "x", budgetMs: 10_000 });
    expect(geloescht).toEqual([{ quelle: "wg-gesucht", externalId: "7" }]);
    expect(e.geloescht).toBe(1);
  });
});
