import { describe, it, expect } from "vitest";
import { baueSnapshot } from "./snapshot.js";

describe("baueSnapshot", () => {
  it("nur ja/unklar, sortiert nach Punkten absteigend, Laeufe mitgegeben", () => {
    const s = baueSnapshot(
      [
        { external_id: "a", passt: "unklar", punkte: 10 },
        { external_id: "b", passt: "ja", punkte: 40 },
        { external_id: "c", passt: "nein", punkte: 99 },
      ],
      [{ quelle: "kleinanzeigen", status: "ok" }],
      new Date("2026-11-11T12:00:00Z"),
    );
    expect(s.erzeugtAm).toBe("2026-11-11T12:00:00.000Z");
    expect(s.angebote.map((a) => a.external_id)).toEqual(["b", "a"]);
    expect(s.laeufe).toHaveLength(1);
  });
});
