import { describe, expect, it } from "vitest";
import { hatGueltigeKonstanten } from "./snapshotpruefung.ts";

describe("hatGueltigeKonstanten -- zweite Wache gegen eine zu alte Datei (Review I-1)", () => {
  it("laesst vollstaendige, gueltige Konstanten durch", () => {
    expect(
      hatGueltigeKonstanten({ konstanten: { karenzTage: 2, dscrMeldeschwelle: 1.3 } })
    ).toBe(true);
  });

  it("verweigert eine Datei im alten Format ganz ohne 'konstanten'", () => {
    expect(hatGueltigeKonstanten({ objekte: [] })).toBe(false);
    expect(hatGueltigeKonstanten({})).toBe(false);
  });

  it("verweigert konstanten, wenn karenzTage fehlt oder keine endliche Zahl ist", () => {
    expect(hatGueltigeKonstanten({ konstanten: { dscrMeldeschwelle: 1.3 } })).toBe(false);
    expect(
      hatGueltigeKonstanten({ konstanten: { karenzTage: "2", dscrMeldeschwelle: 1.3 } })
    ).toBe(false);
    expect(
      hatGueltigeKonstanten({ konstanten: { karenzTage: Number.NaN, dscrMeldeschwelle: 1.3 } })
    ).toBe(false);
  });

  it("verweigert konstanten, wenn dscrMeldeschwelle fehlt oder keine endliche Zahl ist", () => {
    expect(hatGueltigeKonstanten({ konstanten: { karenzTage: 2 } })).toBe(false);
    expect(
      hatGueltigeKonstanten({ konstanten: { karenzTage: 2, dscrMeldeschwelle: null } })
    ).toBe(false);
  });

  it("verweigert, wenn 'konstanten' selbst kein Objekt ist -- oder der Snapshot keins", () => {
    expect(hatGueltigeKonstanten({ konstanten: null })).toBe(false);
    expect(hatGueltigeKonstanten(null)).toBe(false);
    expect(hatGueltigeKonstanten(undefined)).toBe(false);
  });
});
