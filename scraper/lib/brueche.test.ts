import { describe, it, expect } from "vitest";
import { bewerteQuelle, planeAktionen, issueTitel, type LaufKurz } from "./brueche.js";

const l = (status: string, gesehen: number, t: string): LaufKurz => ({ status, gesehen, gestartet_am: t });
const gut = (t: string) => l("ok", 30, t);

describe("bewerteQuelle", () => {
  it("zweimal ok mit 0 gesehen ist ein Bruch", () => {
    expect(bewerteQuelle("q", [l("ok", 0, "t2"), l("ok", 0, "t1"), gut("t0")])).toEqual({ quelle: "q", art: "bruch", seit: "t1" });
  });
  it("zweimal fehler ist ein Bruch", () => {
    expect(bewerteQuelle("q", [l("fehler", 0, "t2"), l("fehler", 5, "t1")])?.art).toBe("bruch");
  });
  it("gemischt fehler und ok/0 ist ein Bruch", () => {
    expect(bewerteQuelle("q", [l("fehler", 0, "t2"), l("ok", 0, "t1")])?.art).toBe("bruch");
  });
  it("ein einzelner schlechter Lauf ist kein Bruch", () => {
    expect(bewerteQuelle("q", [l("ok", 0, "t2"), gut("t1")])).toBeNull();
    expect(bewerteQuelle("q", [l("fehler", 0, "t1")])).toBeNull();
  });
  it("Sperren sind kein Bruch; erst drei in Folge melden sperre", () => {
    expect(bewerteQuelle("q", [l("gesperrt", 0, "t2"), l("gesperrt", 0, "t1"), gut("t0")])).toBeNull();
    expect(bewerteQuelle("q", [l("gesperrt", 0, "t3"), l("gesperrt", 0, "t2"), l("gesperrt", 0, "t1")]))
      .toEqual({ quelle: "q", art: "sperre", seit: "t1" });
  });
  it("Erholung nur beim Uebergang von schlecht auf gut", () => {
    expect(bewerteQuelle("q", [gut("t2"), l("ok", 0, "t1")])).toEqual({ quelle: "q", art: "erholt", seit: "t2" });
    expect(bewerteQuelle("q", [gut("t2"), l("gesperrt", 0, "t1")])?.art).toBe("erholt");
    expect(bewerteQuelle("q", [gut("t2"), gut("t1")])).toBeNull();
  });
  it("ok mit gesehen > 0 und unvollstaendig bleibt gut", () => {
    expect(bewerteQuelle("q", [l("ok", 3, "t2"), l("ok", 3, "t1")])).toBeNull();
  });
});

describe("planeAktionen", () => {
  it("legt ein Reparatur-Issue an, wenn keins offen ist", () => {
    const [a] = planeAktionen([{ quelle: "wg-gesucht", art: "bruch", seit: "t1" }], []);
    expect(a).toMatchObject({ typ: "anlegen", titel: "Reparatur: wg-gesucht", label: "reparatur" });
  });
  it("Sperre bekommt Label sperre", () => {
    const [a] = planeAktionen([{ quelle: "x", art: "sperre", seit: "t1" }], []);
    expect(a).toMatchObject({ typ: "anlegen", titel: issueTitel("sperre", "x"), label: "sperre" });
  });
  it("keine Doppelmeldung bei offenem Issue mit gleichem Titel", () => {
    expect(planeAktionen([{ quelle: "x", art: "bruch", seit: "t1" }], [{ number: 7, title: "Reparatur: x", labels: ["reparatur"] }])).toEqual([]);
  });
  it("ein anderes offenes Issue haelt die Meldung nicht auf", () => {
    expect(planeAktionen([{ quelle: "x", art: "bruch", seit: "t1" }], [{ number: 7, title: "Reparatur: y", labels: ["reparatur"] }])).toHaveLength(1);
  });
  it("Erholung kommentiert offene Issues der Quelle, beide Arten", () => {
    const offen = [
      { number: 7, title: "Reparatur: x", labels: ["reparatur"] },
      { number: 8, title: "Sperre: x", labels: ["sperre"] },
      { number: 9, title: "Reparatur: y", labels: ["reparatur"] },
    ];
    const akt = planeAktionen([{ quelle: "x", art: "erholt", seit: "t2" }], offen);
    expect(akt.map((a) => a.typ === "kommentar" && a.nummer)).toEqual([7, 8]);
    expect(akt[0]).toMatchObject({ text: expect.stringContaining("liefert wieder seit Lauf t2") });
  });
  it("Erholung ohne offenes Issue tut nichts", () => {
    expect(planeAktionen([{ quelle: "x", art: "erholt", seit: "t2" }], [])).toEqual([]);
  });
});
