import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { kleinanzeigenQuelle, kleinanzeigenSeitenUrl, KLEINANZEIGEN_SUCHE_URL } from "./index.js";
import type { Abrufer, Antwort } from "../quelle.js";

const fixture = (n: string) => readFileSync(new URL(`../../test/fixtures/kleinanzeigen/${n}`, import.meta.url), "utf-8");

function fakeAbrufer(seiten: Record<string, Antwort>): Abrufer & { geholt: string[]; gewartet: number[] } {
  const ab = {
    geholt: [] as string[], gewartet: [] as number[],
    async hole(url: string) { ab.geholt.push(url); return seiten[url] ?? { status: 404, html: "", url }; },
    async warte(ms: number) { ab.gewartet.push(ms); },
  };
  return ab;
}

describe("kleinanzeigenQuelle.sweep", () => {
  it("blaettert weiter, Abstand zwischen den Seiten, hoert bei fehlender Seite auf", async () => {
    const ab = fakeAbrufer({
      [kleinanzeigenSeitenUrl(1)]: { status: 200, html: fixture("liste-1.html"), url: kleinanzeigenSeitenUrl(1) },
      [kleinanzeigenSeitenUrl(2)]: { status: 200, html: fixture("liste-2.html"), url: kleinanzeigenSeitenUrl(2) },
    });
    const e = await kleinanzeigenQuelle.sweep(ab, 60_000);
    expect(ab.geholt).toEqual([KLEINANZEIGEN_SUCHE_URL, kleinanzeigenSeitenUrl(2), kleinanzeigenSeitenUrl(3)]);
    expect(ab.gewartet.length).toBe(2);
    expect(e.status).toBe("ok");
    expect(e.vollstaendig).toBe(false);
    const ids = e.angebote.map((a) => a.externalId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("3565305244");
  });

  it("Sperre auf Seite 1: gesperrt, keine weiteren Abrufe", async () => {
    const url = kleinanzeigenSeitenUrl(1);
    const ab = fakeAbrufer({ [url]: { status: 403, html: "<html>captcha-delivery.com</html>", url } });
    const e = await kleinanzeigenQuelle.sweep(ab, 60_000);
    expect(e).toMatchObject({ status: "gesperrt", hinweis: "datadome", angebote: [] });
    expect(ab.geholt).toEqual([url]);
  });

  it("leere Seite 2 heisst Ende der Liste: vollstaendig", async () => {
    const ab = fakeAbrufer({
      [kleinanzeigenSeitenUrl(1)]: { status: 200, html: fixture("liste-1.html"), url: kleinanzeigenSeitenUrl(1) },
      [kleinanzeigenSeitenUrl(2)]: { status: 200, html: "<html><body></body></html>", url: kleinanzeigenSeitenUrl(2) },
    });
    const e = await kleinanzeigenQuelle.sweep(ab, 60_000);
    expect(e.vollstaendig).toBe(true);
  });
});

describe("kleinanzeigenQuelle.ladeDetail", () => {
  it("parst die Detailseite und meldet Sperren", async () => {
    const url = "https://www.kleinanzeigen.de/s-anzeige/ruhige-moderne-2-zimmer-wohnung/3565305244-203-6481";
    const liste = { quelle: "kleinanzeigen" as const, externalId: "3565305244", url, titel: "x" };
    const { leeresAngebot } = await import("../../lib/typen.js");
    const ok = await kleinanzeigenQuelle.ladeDetail(fakeAbrufer({ [url]: { status: 200, html: fixture("detail-1.html"), url } }), leeresAngebot(liste));
    expect(ok.sperre).toBeNull();
    expect(ok.angebot?.warmmieteCents).toBe(150_000);
    const gesperrt = await kleinanzeigenQuelle.ladeDetail(fakeAbrufer({ [url]: { status: 429, html: "", url } }), leeresAngebot(liste));
    expect(gesperrt.sperre).toBe("http");
  });
});
