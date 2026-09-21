import { describe, expect, it } from "vitest";
import { serialisierer, inBloecken } from "./nebenlaeufig.js";

describe("serialisierer", () => {
  it("laesst Aufgaben nacheinander laufen, auch wenn sie parallel gestartet werden", async () => {
    // Der Meldeteil der Pipeline darf NIE nebenlaeufig laufen: Er prueft das
    // Meldebudget und verbucht es danach. Zwischen Pruefung und Verbuchung
    // liegt ein Telegram-Versand -- laufen zwei Meldungen parallel, sehen
    // beide dasselbe freie Kontingent und das Budget wird ueberzogen.
    const serialisiere = serialisierer();
    const verlauf: string[] = [];
    const aufgabe = (name: string, dauerMs: number) => async () => {
      verlauf.push(`${name}-start`);
      await new Promise((r) => setTimeout(r, dauerMs));
      verlauf.push(`${name}-ende`);
    };
    await Promise.all([
      serialisiere(aufgabe("a", 30)),
      serialisiere(aufgabe("b", 5)),
      serialisiere(aufgabe("c", 1)),
    ]);
    expect(verlauf).toEqual([
      "a-start", "a-ende",
      "b-start", "b-ende",
      "c-start", "c-ende",
    ]);
  });

  it("laesst die Kette weiterlaufen, wenn eine Aufgabe wirft", async () => {
    // Ein einzelner Ausreisser darf die Warteschlange nicht verstopfen --
    // sonst rissen die Meldungen des ganzen Laufs mit.
    const serialisiere = serialisierer();
    const verlauf: string[] = [];
    const schlecht = serialisiere(async () => {
      throw new Error("kaputt");
    });
    const gut = serialisiere(async () => {
      verlauf.push("gut");
    });
    await expect(schlecht).rejects.toThrow("kaputt");
    await gut;
    expect(verlauf).toEqual(["gut"]);
  });

  it("gibt den Rueckgabewert der Aufgabe durch", async () => {
    const serialisiere = serialisierer();
    await expect(serialisiere(async () => 42)).resolves.toBe(42);
  });
});

describe("inBloecken", () => {
  it("verarbeitet hoechstens `breite` Eintraege gleichzeitig", async () => {
    let gleichzeitig = 0;
    let hoechstens = 0;
    const eintraege = [1, 2, 3, 4, 5, 6, 7];
    await inBloecken(eintraege, 3, async () => {
      gleichzeitig += 1;
      hoechstens = Math.max(hoechstens, gleichzeitig);
      await new Promise((r) => setTimeout(r, 5));
      gleichzeitig -= 1;
    });
    expect(hoechstens).toBe(3);
  });

  it("verarbeitet jeden Eintrag genau einmal", async () => {
    const gesehen: number[] = [];
    await inBloecken([1, 2, 3, 4, 5], 2, async (n) => {
      gesehen.push(n);
    });
    expect(gesehen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("verhaelt sich bei Breite 1 wie eine gewoehnliche Schleife", async () => {
    // Der Rueckweg: Macht Nebenlaeufigkeit Aerger, stellt EINE Zahl das alte
    // Verhalten wieder her.
    const verlauf: string[] = [];
    await inBloecken([1, 2, 3], 1, async (n) => {
      verlauf.push(`start-${n}`);
      await new Promise((r) => setTimeout(r, 3));
      verlauf.push(`ende-${n}`);
    });
    expect(verlauf).toEqual(["start-1", "ende-1", "start-2", "ende-2", "start-3", "ende-3"]);
  });

  it("laesst einen einzelnen Fehler den Rest nicht abbrechen", async () => {
    // Dieselbe Regel wie `verarbeiteKandidatIsoliert`: Ein Ausreisser darf
    // nicht den ganzen Lauf mitreissen.
    const fertig: number[] = [];
    await inBloecken([1, 2, 3, 4], 2, async (n) => {
      if (n === 2) throw new Error("kaputt");
      fertig.push(n);
    });
    expect(fertig.sort((a, b) => a - b)).toEqual([1, 3, 4]);
  });

  it("kommt mit einer leeren Liste zurecht", async () => {
    await expect(inBloecken([], 4, async () => {})).resolves.toBeUndefined();
  });
});
