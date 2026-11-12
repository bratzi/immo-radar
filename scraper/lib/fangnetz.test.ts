import { describe, it, expect } from "vitest";
import { FANGNETZ, PROFIL } from "./profil.js";
import { KLEINANZEIGEN_SUCHE_URL, kleinanzeigenSeitenUrl } from "../scrapers/kleinanzeigen/index.js";
import { IMMOSCOUT_SUCHE } from "../scrapers/immoscout24/index.js";
import { wgGesuchtSeitenUrl } from "../scrapers/wg-gesucht/index.js";

describe("Fangnetz der Portalfilter", () => {
  it("ist weiter als das Profil, damit der Radar lockern kann", () => {
    expect(FANGNETZ.warmmieteMaxEuro * 100).toBeGreaterThan(PROFIL.warmmieteMaxCents);
    expect(FANGNETZ.zimmerMin).toBeLessThan(PROFIL.zimmerMin);
    expect(FANGNETZ.flaecheMinM2).toBeLessThan(PROFIL.flaecheMinM2);
  });

  it("Kleinanzeigen nutzt das Fangnetz auf allen Seiten", () => {
    for (const u of [KLEINANZEIGEN_SUCHE_URL, kleinanzeigenSeitenUrl(3)]) {
      expect(u).toContain(`preis::${FANGNETZ.warmmieteMaxEuro}`);
      expect(u).toContain(`qm_d:${FANGNETZ.flaecheMinM2}%2C`);
      expect(u).toContain(`zimmer_d:${FANGNETZ.zimmerMin}%2C`);
    }
  });

  it("ImmoScout24 nutzt das Fangnetz", () => {
    expect(IMMOSCOUT_SUCHE).toContain(`price=-${FANGNETZ.warmmieteMaxEuro}.0`);
    expect(IMMOSCOUT_SUCHE).toContain(`numberofrooms=${FANGNETZ.zimmerMin}.0-`);
    expect(IMMOSCOUT_SUCHE).toContain(`livingspace=${FANGNETZ.flaecheMinM2}.0-`);
  });

  it("WG-Gesucht nutzt das Fangnetz", () => {
    const u = wgGesuchtSeitenUrl(1);
    expect(u).toContain(`rMax=${FANGNETZ.warmmieteMaxEuro}`);
    expect(u).toContain(`sMin=${FANGNETZ.flaecheMinM2}`);
    expect(u).toContain(`rmMin=${FANGNETZ.zimmerMin}`);
  });
});
