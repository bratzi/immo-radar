import { describe, it, expect } from "vitest";
import { regionsLaufZeile } from "./bestandDb.js";

/**
 * Warum diese Zeilen in eine EIGENE Tabelle gehen und nicht in `sweep_runs`:
 * `ladeSweepHistorie` filtert dort nur auf `source` und `vollstaendig`.
 * Regionszeilen wuerden in den Median einflieszen und genau die Wache
 * verfaelschen, die vor einer Massenloeschung schuetzt. Eine getrennte
 * Tabelle kann das strukturell nicht.
 */
describe("regionsLaufZeile", () => {
  it("haelt fest, was eine Region geliefert hat", () => {
    const zeile = regionsLaufZeile("immowelt", {
      partition: "he",
      gesehene: 2719,
      gemeldeteTreffer: 2719,
      vollstaendig: true,
    });
    expect(zeile).toMatchObject({
      source: "immowelt",
      partition: "he",
      gesehene_objekte: 2719,
      gemeldete_treffer: 2719,
      vollstaendig: true,
    });
  });

  it("protokolliert eine abgebrochene Region als unvollstaendig", () => {
    // Eine Region, die mit einer Ausnahme endete, darf spaeter nie als
    // Referenzlauf gelten -- sonst waere der Median aus Ausfaellen gebildet.
    const zeile = regionsLaufZeile("immowelt", {
      partition: "nw",
      gesehene: 0,
      gemeldeteTreffer: null,
      vollstaendig: false,
    });
    expect(zeile.vollstaendig).toBe(false);
    expect(zeile.gemeldete_treffer).toBeNull();
    expect(zeile.gesehene_objekte).toBe(0);
  });
});
