import { describe, it, expect } from "vitest";
import { baueMail, faelligeMeldungen, type MeldeZeile } from "./meldung.js";

const Z = (t: Partial<MeldeZeile>): MeldeZeile => ({
  id: "1", quelle: "kleinanzeigen", url: "https://x/1", titel: "Helle 2-Zimmer-Wohnung",
  warmmiete_cents: 120_000, warmmiete_quelle: "angegeben", zimmer: 2, flaeche_m2: 55, plz: "80797", stadtteil: "Schwabing-West",
  nachmieter: false, gemeldet_am: null, letzte_warmmiete_gemeldet_cents: null, ...t,
});

describe("meldung", () => {
  it("meldet Neues und Preissenkungen, sonst nichts", () => {
    const r = faelligeMeldungen([
      Z({ id: "a" }),
      Z({ id: "b", gemeldet_am: "2026-11-13", letzte_warmmiete_gemeldet_cents: 125_000 }),
      Z({ id: "c", gemeldet_am: "2026-11-13", letzte_warmmiete_gemeldet_cents: 120_000 }),
    ]);
    expect(r.neu.map((z) => z.id)).toEqual(["a"]);
    expect(r.billiger.map((z) => z.id)).toEqual(["b"]);
  });
  it("eine Wohnung: Betreff nennt Preis, Zimmer, Lage; Text hat Link und Nachmieter", () => {
    const m = baueMail([Z({ nachmieter: true })], [])!;
    expect(m.betreff).toBe("Neue Wohnung: 1.200 €, 2 Zi., Schwabing-West");
    expect(m.text).toContain("https://x/1");
    expect(m.text).toContain("Nachmieter");
  });
  it("mehrere: Sammelbetreff, nichts faellig: keine Mail", () => {
    expect(baueMail([Z({}), Z({ id: "2" })], [Z({ id: "3", letzte_warmmiete_gemeldet_cents: 130_000 })])!.betreff).toBe("2 neue Wohnungen, 1 günstiger");
    expect(baueMail([], [])).toBeNull();
  });
});
