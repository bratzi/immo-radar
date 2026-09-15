import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { schreibeSnapshot } from "./snapshotDb.js";
import type { Snapshot } from "./snapshot.js";

const angelegte: string[] = [];

afterEach(() => {
  while (angelegte.length > 0) {
    rmSync(angelegte.pop()!, { recursive: true, force: true });
  }
});

function temporaeresVerzeichnis(): string {
  const verzeichnis = mkdtempSync(path.join(tmpdir(), "snapshot-test-"));
  angelegte.push(verzeichnis);
  return verzeichnis;
}

const LEERER_SNAPSHOT: Snapshot = {
  erzeugtAm: "2026-09-15T12:00:00.000Z",
  lauf: { id: "34910160636", beendetAm: null },
  kopfzeile: {
    objekteGesamt: 0,
    mitBelegterMiete: 0,
    topTrefferSeit: null,
    anteilBundeslandgenau: null,
  },
  bundeslaender: [],
  objekte: [],
  betrieb: { uebersprungeneJeLauf: null, meldebudget: null, regionsstand: [] },
};

describe("schreibeSnapshot", () => {
  it("schreibt gueltiges JSON und meldet die tatsaechliche Groesse in Bytes", async () => {
    // Die Groesse wird GEMESSEN und nicht geschaetzt: N4 vermutet 6 bis 10 MB
    // und verlangt ausdruecklich "erst messen, dann teilen".
    const ziel = path.join(temporaeresVerzeichnis(), "snapshot.json");

    const ergebnis = await schreibeSnapshot(ziel, LEERER_SNAPSHOT);

    const roh = readFileSync(ziel);
    expect(JSON.parse(roh.toString("utf-8"))).toEqual(LEERER_SNAPSHOT);
    expect(ergebnis.bytes).toBe(roh.byteLength);
    expect(ergebnis.pfad).toBe(ziel);
  });

  it("legt fehlende Verzeichnisse an, statt zu scheitern", async () => {
    const ziel = path.join(temporaeresVerzeichnis(), "gibt", "es", "noch", "nicht", "s.json");

    await schreibeSnapshot(ziel, LEERER_SNAPSHOT);

    expect(JSON.parse(readFileSync(ziel, "utf-8")).erzeugtAm).toBe("2026-09-15T12:00:00.000Z");
  });
});
