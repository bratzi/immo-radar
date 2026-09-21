import { describe, it, expect } from "vitest";
import {
  hochwassermarkeAus,
  waehleMassstab,
  urteileGegenMassstab,
  type MassstabRegeln,
} from "./regionsMassstab.js";

/** Die Regeln, mit denen Immowelt misst. Hier fest, damit die Tests nicht an
 *  einer Konstante des Scrapers haengen. */
const REGELN: MassstabRegeln = {
  untergrenze: 45,
  toleranzGemeldet: 0.25,
  toleranzMarke: 0.1,
};

describe("hochwassermarkeAus", () => {
  it("liefert das Maximum", () => {
    expect(hochwassermarkeAus([40, 6795, 41, 6807])).toBe(6807);
  });

  it("liefert null fuer eine leere Liste -- NICHT null als Menge missverstehen", () => {
    expect(hochwassermarkeAus([])).toBeNull();
  });

  it("laesst sich von Nullmengen nicht senken", () => {
    // Eine abgebrochene Region protokolliert `gesehene: 0`. Ein Maximum
    // ignoriert das; genau deshalb ist es hier der richtige Schaetzer.
    expect(hochwassermarkeAus([0, 0, 1316])).toBe(1316);
  });

  it("laesst sich von flachen Laeufen nicht senken", () => {
    // Der ganze Sinn der Marke. Eine Region, die in 24 % der Laeufe nur eine
    // Ergebnisseite bekommt, behaelt ihren Massstab. Ein Median laege hier
    // bei 40 -- und genau daran ist der Vorschlag aus dem Backlog gescheitert.
    expect(hochwassermarkeAus([6807, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40])).toBe(6807);
  });
});

describe("waehleMassstab", () => {
  it("gibt der gemeldeten Trefferzahl den Vorrang vor der Marke", () => {
    const m = waehleMassstab(2719, 6807, REGELN);
    expect(m.art).toBe("gemeldete_treffer");
    expect(m.referenz).toBe(2719);
    expect(m.toleranz).toBe(0.25);
  });

  it("nimmt die Marke, wenn keine Trefferzahl gemeldet ist", () => {
    const m = waehleMassstab(null, 6807, REGELN);
    expect(m.art).toBe("hochwassermarke");
    expect(m.referenz).toBe(6807);
    expect(m.toleranz).toBe(0.1);
  });

  it("verwirft eine Marke von hoechstens einer Ergebnisseite", () => {
    // Der Startfall: Eine Region, deren Historie NUR aus flachen Laeufen
    // besteht, bekaeme eine Marke von 40 -- und dann gaelte jeder flache
    // Lauf als vollstaendig. 40 Karten sind eine Ergebnisseite, kein
    // Bestand. Simuliert im Messskript, real nie eingetreten: keine der 16
    // Regionen startete flach.
    expect(waehleMassstab(null, 45, REGELN).art).toBe("keiner");
    expect(waehleMassstab(null, 40, REGELN).art).toBe("keiner");
    expect(waehleMassstab(null, 46, REGELN).art).toBe("hochwassermarke");
  });

  it("hat keinen Massstab, wenn weder Trefferzahl noch Marke vorliegen", () => {
    const m = waehleMassstab(null, null, REGELN);
    expect(m.art).toBe("keiner");
    expect(m.referenz).toBeNull();
  });

  it("nimmt auch eine gemeldete Null als Massstab", () => {
    // Eine echte Null ist eine Aussage des Portals, kein fehlender Wert.
    const m = waehleMassstab(0, null, REGELN);
    expect(m.art).toBe("gemeldete_treffer");
    expect(m.referenz).toBe(0);
  });
});

describe("urteileGegenMassstab", () => {
  const gegenMarke = { art: "hochwassermarke" as const, referenz: 6807, toleranz: 0.1 };
  const gegenGemeldet = { art: "gemeldete_treffer" as const, referenz: 2719, toleranz: 0.25 };

  it("urteilt gegen die Marke mit 10 Prozent Toleranz", () => {
    expect(urteileGegenMassstab(6807, gegenMarke, false)).toBe(true);
    expect(urteileGegenMassstab(6127, gegenMarke, false)).toBe(true); // genau 90 %
    expect(urteileGegenMassstab(6126, gegenMarke, false)).toBe(false);
  });

  it("laesst einen flachen Lauf nie durch", () => {
    // Der Fall, um den es in A16 ueberhaupt geht.
    expect(urteileGegenMassstab(40, gegenMarke, false)).toBe(false);
  });

  it("urteilt gegen die gemeldete Trefferzahl mit 25 Prozent Toleranz", () => {
    expect(urteileGegenMassstab(2040, gegenGemeldet, false)).toBe(true);
    expect(urteileGegenMassstab(2039, gegenGemeldet, false)).toBe(false);
  });

  it("gilt bei gemeldeter Null als vollstaendig, sobald ueberhaupt etwas ankam", () => {
    const nullGemeldet = { art: "gemeldete_treffer" as const, referenz: 0, toleranz: 0.25 };
    expect(urteileGegenMassstab(1, nullGemeldet, false)).toBe(true);
  });

  it("urteilt ohne Massstab immer unvollstaendig", () => {
    const keiner = { art: "keiner" as const, referenz: null, toleranz: 0 };
    expect(urteileGegenMassstab(6807, keiner, false)).toBe(false);
  });

  it("urteilt am Seitendeckel immer unvollstaendig", () => {
    // Der Seitendeckel ist ein Beleg fuer das Gegenteil von Vollstaendigkeit.
    expect(urteileGegenMassstab(6807, gegenMarke, true)).toBe(false);
  });

  it("urteilt ohne eine einzige Karte immer unvollstaendig", () => {
    // Signatur eines Soft-Blocks: HTTP 200, leere Huelle.
    const nullGemeldet = { art: "gemeldete_treffer" as const, referenz: 0, toleranz: 0.25 };
    expect(urteileGegenMassstab(0, nullGemeldet, false)).toBe(false);
  });
});
