import { describe, it, expect } from "vitest";
import { FakeDb } from "./fakeDb.js";
import { meldeLaufStart, meldeLaufEnde, laufUrlAusUmgebung } from "./laufStatus.js";

describe("Laufstatus fuer den Radar", () => {
  it("Start setzt laeuft und Startzeit, Ende setzt Endzeit und laeuft=false", async () => {
    const db = new FakeDb();
    const sb = db.alsClient();
    await meldeLaufStart(sb, new Date("2026-11-12T10:00:00Z"), "https://github.com/x/y/actions/runs/1");
    expect(db.tabelle("lauf_status")).toEqual([
      expect.objectContaining({ id: 1, laeuft: true, gestartet_am: "2026-11-12T10:00:00.000Z", beendet_am: null, run_url: "https://github.com/x/y/actions/runs/1" }),
    ]);
    await meldeLaufEnde(sb, new Date("2026-11-12T10:06:00Z"));
    expect(db.tabelle("lauf_status")[0]).toMatchObject({ laeuft: false, gestartet_am: "2026-11-12T10:00:00.000Z", beendet_am: "2026-11-12T10:06:00.000Z" });
  });

  it("Lauf-URL kommt aus den GitHub-Variablen, sonst null", () => {
    expect(laufUrlAusUmgebung({ GITHUB_SERVER_URL: "https://github.com", GITHUB_REPOSITORY: "bratzi/immo-radar", GITHUB_RUN_ID: "42" }))
      .toBe("https://github.com/bratzi/immo-radar/actions/runs/42");
    expect(laufUrlAusUmgebung({})).toBeNull();
  });
});
