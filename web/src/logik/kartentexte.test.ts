import { describe, expect, it } from "vitest";
import type { SnapshotBundesland } from "../daten/snapshot.ts";
import { alsZeile, kachelText, punktText } from "./kartentexte.ts";

const sachsen: SnapshotBundesland = {
  name: "Sachsen",
  objekte: 1234,
  topTreffer: 7,
  medianDscr: 1.5,
  standAlterTage: 2.5,
};

describe("kachelText", () => {
  it("traegt Name, Zahlen und Stand -- dieselben Angaben wie bisher der <title>", () => {
    const text = kachelText(sachsen, "Sachsen", false);
    expect(text.titel).toBe("Sachsen");
    expect(text.zeilen).toEqual([
      "1.234 Objekte",
      "7 Top-Treffer",
      "Median-DSCR 1,50",
      "zuletzt gesweept vor 2.5 Tagen",
    ]);
  });

  it("zeigt fehlende Angaben als Gedankenstrich bzw. ehrlichen Satz, nie als 0", () => {
    const text = kachelText({ ...sachsen, medianDscr: null, standAlterTage: null }, "Sachsen", false);
    expect(text.zeilen).toContain("Median-DSCR —");
    expect(text.zeilen).toContain("kein Regionslauf verzeichnet");
  });

  it("sagt, wenn der Snapshot das Land gar nicht kennt", () => {
    expect(kachelText(undefined, "Sachsen", false).zeilen).toEqual(["keine Daten im Snapshot"]);
  });

  it("nennt im Hinweis, was ein Klick bewirkt -- je nach Zustand", () => {
    expect(kachelText(sachsen, "Sachsen", false).hinweis).toContain("zeigt nur");
    expect(kachelText(sachsen, "Sachsen", true).hinweis).toContain("entfernt");
  });
});

describe("punktText", () => {
  const punkt = { zweisteller: "80", anzahl: 1234, topTreffer: 7 };

  it("traegt Bereich und Zahlen", () => {
    const text = punktText(punkt, false);
    expect(text.titel).toBe("PLZ-Bereich 80…");
    expect(text.zeilen).toEqual(["1.234 Objekte", "7 davon Top-Treffer"]);
  });

  it("nennt im Hinweis, was ein Klick bewirkt -- je nach Zustand", () => {
    expect(punktText(punkt, false).hinweis).toContain("zeigt nur");
    expect(punktText(punkt, true).hinweis).toContain("entfernt");
  });
});

describe("alsZeile -- der Text fuer aria-label, ohne Klickhinweis", () => {
  it("verbindet Titel und Zeilen mit einem Mittelpunkt", () => {
    expect(alsZeile(punktText({ zweisteller: "80", anzahl: 3, topTreffer: 1 }, false))).toBe(
      "PLZ-Bereich 80… · 3 Objekte · 1 davon Top-Treffer"
    );
  });
});
