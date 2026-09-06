import { describe, it, expect } from "vitest";
import { plzKoordinaten, zeichneDeutschlandkarte, kartePngFuerPlz } from "./karte.js";

describe("plzKoordinaten", () => {
  it("ordnet eine saechsische PLZ dem Osten zu", () => {
    const k = plzKoordinaten("04442");
    expect(k).not.toBeNull();
    expect(k!.lon).toBeGreaterThan(12);
    expect(k!.lat).toBeGreaterThan(51);
  });

  it("ordnet eine bayerische PLZ dem Sueden zu", () => {
    const k = plzKoordinaten("80331");
    expect(k!.lat).toBeLessThan(48.5);
    expect(k!.lon).toBeGreaterThan(11);
  });

  it("liegt fuer jede bekannte PLZ innerhalb der deutschen Grenzen", () => {
    for (const plz of ["01067", "20095", "45663", "66111", "88131", "99084"]) {
      const k = plzKoordinaten(plz)!;
      expect(k.lon).toBeGreaterThan(5.6);
      expect(k.lon).toBeLessThan(15.4);
      expect(k.lat).toBeGreaterThan(47.1);
      expect(k.lat).toBeLessThan(55.2);
    }
  });

  it("liefert null bei ungueltiger oder unbekannter PLZ", () => {
    expect(plzKoordinaten("")).toBeNull();
    expect(plzKoordinaten("1234")).toBeNull();
    expect(plzKoordinaten("05999")).toBeNull();
  });
});

describe("zeichneDeutschlandkarte", () => {
  const karte = zeichneDeutschlandkarte(13.4, 52.52);

  it("liefert eine gueltige PNG-Datei", () => {
    expect(Array.from(karte.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(Buffer.from(karte).includes(Buffer.from("IHDR"))).toBe(true);
    expect(Buffer.from(karte).includes(Buffer.from("IEND"))).toBe(true);
  });

  it("ist klein genug fuer den Telegram-Versand", () => {
    expect(karte.length).toBeGreaterThan(1000);
    expect(karte.length).toBeLessThan(400_000);
  });

  it("erzeugt fuer verschiedene Orte verschiedene Bilder", () => {
    const flensburg = zeichneDeutschlandkarte(9.43, 54.78);
    const muenchen = zeichneDeutschlandkarte(11.58, 48.14);
    expect(Buffer.from(flensburg).equals(Buffer.from(muenchen))).toBe(false);
  });

  it("zeichnet denselben Ort reproduzierbar gleich", () => {
    const a = zeichneDeutschlandkarte(9.99, 53.55);
    const b = zeichneDeutschlandkarte(9.99, 53.55);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

describe("kartePngFuerPlz", () => {
  it("liefert eine Karte fuer eine bekannte PLZ", () => {
    const png = kartePngFuerPlz("16562");
    expect(png).not.toBeNull();
    expect(Array.from(png!.slice(1, 4))).toEqual([0x50, 0x4e, 0x47]);
  });

  it("liefert null statt zu werfen, wenn die PLZ unbekannt ist", () => {
    expect(kartePngFuerPlz("xxxxx")).toBeNull();
  });
});
