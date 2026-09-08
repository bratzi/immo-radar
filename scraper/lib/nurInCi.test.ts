import { describe, it, expect, vi, afterEach } from "vitest";
import { nurInCiAusfuehren } from "./nurInCi.js";

/**
 * Die Sperre existiert, weil Live-Abrufe vom Rechner des Nutzers dessen
 * Anschluss zweimal lahmgelegt haben -- beim zweiten Mal durch mehrere fuer
 * sich harmlose Einzellaeufe. Diese Tests halten fest, dass sie nicht aus
 * Versehen wegoptimiert wird.
 */
describe("nurInCiAusfuehren", () => {
  const alt = { ...process.env };
  afterEach(() => {
    process.env = { ...alt };
    vi.restoreAllMocks();
  });

  it("laesst den Lauf in CI durch", () => {
    process.env.CI = "true";
    expect(() => nurInCiAusfuehren("test")).not.toThrow();
  });

  it("bricht lokal ab, statt loszulaufen", () => {
    delete process.env.CI;
    delete process.env.ICH_HABE_DEN_ANSCHLUSS_FREIGEGEBEN;
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => nurInCiAusfuehren("test")).toThrow("exit");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("laesst die ausdrueckliche Freigabe durch, warnt aber", () => {
    delete process.env.CI;
    process.env.ICH_HABE_DEN_ANSCHLUSS_FREIGEGEBEN = "ja";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => nurInCiAusfuehren("test")).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  it("akzeptiert kein beliebiges Wort als Freigabe", () => {
    delete process.env.CI;
    process.env.ICH_HABE_DEN_ANSCHLUSS_FREIGEGEBEN = "vielleicht";
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => nurInCiAusfuehren("test")).toThrow("exit");
  });
});
