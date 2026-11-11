import { describe, it, expect } from "vitest";
import { leeresAngebot } from "./typen.js";
import { zuZeile, entscheideMeldung } from "./angebote.js";

describe("zuZeile", () => {
  it("bildet Spaltennamen und setzt zuletzt_gesehen", () => {
    const a = leeresAngebot({ quelle: "immowelt", externalId: "e1", url: "u", titel: "t", warmmieteCents: 100_000, warmmieteQuelle: "angegeben", flaecheM2: 50.5 });
    const z = zuZeile(a, { passt: "ja", gruende: [] }, 15, new Date("2026-11-11T12:00:00Z"));
    expect(z).toMatchObject({ quelle: "immowelt", external_id: "e1", warmmiete_cents: 100_000, warmmiete_quelle: "angegeben", flaeche_m2: 50.5, passt: "ja", gruende: [], punkte: 15, zuletzt_gesehen: "2026-11-11T12:00:00.000Z", verschwunden_am: null });
  });
});

describe("entscheideMeldung", () => {
  it("unbekannt ist neu", () => expect(entscheideMeldung(undefined, 100_000)).toBe("neu"));
  it("bekannt, nie gemeldet ist neu", () => expect(entscheideMeldung({ id: "1", gemeldetAm: null, letzteWarmmieteGemeldetCents: null, verschwundenAm: null, passt: "unklar" }, 100_000)).toBe("neu"));
  it("gemeldet, gleicher Preis: keine", () => expect(entscheideMeldung({ id: "1", gemeldetAm: "x", letzteWarmmieteGemeldetCents: 100_000, verschwundenAm: null, passt: "ja" }, 100_000)).toBe("keine"));
  it("gemeldet, Preis gesunken: preissenkung", () => expect(entscheideMeldung({ id: "1", gemeldetAm: "x", letzteWarmmieteGemeldetCents: 100_000, verschwundenAm: null, passt: "ja" }, 95_000)).toBe("preissenkung"));
  it("gemeldet, Preis gestiegen oder unbekannt: keine", () => {
    const b = { id: "1", gemeldetAm: "x", letzteWarmmieteGemeldetCents: 100_000, verschwundenAm: null, passt: "ja" as const };
    expect(entscheideMeldung(b, 105_000)).toBe("keine");
    expect(entscheideMeldung(b, null)).toBe("keine");
  });
});

// Nachtrag 2026-11-11, Punkt 1: "neu" haengt nur an (quelle, external_id).
// Ein Portal-Zeitstempel wird gespeichert, entscheidet aber nie ueber "neu"
// (Portale schieben alte Anzeigen mit frischem Datum wieder hoch).
describe("Portal-Zeitstempel entscheidet nicht ueber neu", () => {
  it("bekanntes, gemeldetes Angebot mit juengerem veroeffentlichtAm gilt nicht als neu", () => {
    const a = leeresAngebot({ quelle: "immowelt", externalId: "e1", url: "u", titel: "t", warmmieteCents: 100_000, veroeffentlichtAm: "2026-11-11T11:55:00Z" });
    const bekannt = { id: "1", gemeldetAm: "2026-11-01T08:00:00Z", letzteWarmmieteGemeldetCents: 100_000, verschwundenAm: null, passt: "ja" as const };
    expect(entscheideMeldung(bekannt, a.warmmieteCents)).toBe("keine");
  });
  it("der Zeitstempel wird trotzdem gespeichert", () => {
    const a = leeresAngebot({ quelle: "immowelt", externalId: "e1", url: "u", titel: "t", veroeffentlichtAm: "2026-11-11T11:55:00Z" });
    expect(zuZeile(a, { passt: "unklar", gruende: [] }, 0, new Date("2026-11-11T12:00:00Z")).veroeffentlicht_am).toBe("2026-11-11T11:55:00Z");
  });
});
