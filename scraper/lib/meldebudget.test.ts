import { describe, it, expect } from "vitest";
import { erstelleMeldebudget } from "./meldebudget.js";

describe("erstelleMeldebudget", () => {
  it("laesst bis zum Maximum senden", () => {
    const b = erstelleMeldebudget(2);
    expect(b.darfSenden()).toBe(true);
    b.verbuchen();
    expect(b.darfSenden()).toBe(true);
    b.verbuchen();
    expect(b.darfSenden()).toBe(false);
  });

  it("zaehlt Gesendetes und Zurueckgestelltes getrennt", () => {
    const b = erstelleMeldebudget(1);
    b.verbuchen();
    b.zurueckstellen();
    b.zurueckstellen();
    expect(b.verbraucht()).toBe(1);
    expect(b.zurueckgestellt()).toBe(2);
  });

  it("sendet bei einem Budget von 0 gar nicht", () => {
    expect(erstelleMeldebudget(0).darfSenden()).toBe(false);
  });

  it("verbraucht beim blossen Nachfragen nichts", () => {
    // Sonst wuerde eine Pruefung, die zu keinem Versand fuehrt, das Budget
    // aufzehren -- und die Meldungen blieben aus, ohne dass jemand es merkt.
    const b = erstelleMeldebudget(1);
    b.darfSenden();
    b.darfSenden();
    expect(b.verbraucht()).toBe(0);
    expect(b.darfSenden()).toBe(true);
  });
});
