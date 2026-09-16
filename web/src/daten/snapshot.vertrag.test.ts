/**
 * VERTRAGSTEST gegen die ECHTE Snapshot-Datei.
 *
 * `web/src/daten/snapshot.ts` ist eine Zweitschrift der Typen aus
 * `scraper/lib/snapshot.ts`. Damit die beiden nicht auseinanderlaufen, prueft
 * dieser Test nicht den Quelltext des Exporters, sondern SEINE AUSGABE: die
 * Datei, die die Oberflaeche wirklich liest.
 *
 * Fehlt die Datei, wird uebersprungen statt rot gemeldet -- sie ist ein
 * Erzeugnis des Laufs (18,9 MB, git-ignoriert) und in einer frischen
 * Arbeitskopie nicht da. Wie man sie erzeugt, steht im Uebersprungstext und
 * in `.superpowers/sdd/2026-09-15-web-dashboard/progress.md`.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Snapshot, SnapshotObjekt } from "./snapshot.ts";
import { gruendeFuerAnzeige } from "../logik/gruende.ts";

/** Sieht wie `wohnflaeche_fehlt` aus -- ein Code, kein Satz. */
function istRoherCodeImKlartextfeld(text: string): boolean {
  return /^[a-z0-9]+(_[a-z0-9]+)+$/.test(text);
}

const DATEI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "public",
  "dashboard-snapshot.json"
);

const vorhanden = existsSync(DATEI);

const TREFFERKLASSEN = new Set(["top", "normal", "nichtBeurteilbar"]);
const STUFEN = new Set(["S3", "S2", "S1", "S0"]);
const ZUSTAENDE = new Set(["verfuegbar", "unbestaetigt", "abgaengig"]);

function istTextOderNull(wert: unknown): boolean {
  return wert === null || typeof wert === "string";
}
function istZahlOderNull(wert: unknown): boolean {
  return wert === null || (typeof wert === "number" && Number.isFinite(wert));
}

describe.skipIf(!vorhanden)("Vertrag: die echte Snapshot-Datei passt zu den Typen", () => {
  const snapshot = vorhanden
    ? (JSON.parse(readFileSync(DATEI, "utf8")) as Snapshot)
    : (null as unknown as Snapshot);

  it("traegt die sechs Aeste des Dateiformats aus N4", () => {
    expect(typeof snapshot.erzeugtAm).toBe("string");
    expect(snapshot.lauf).toBeTypeOf("object");
    expect(snapshot.kopfzeile).toBeTypeOf("object");
    expect(Array.isArray(snapshot.bundeslaender)).toBe(true);
    expect(Array.isArray(snapshot.objekte)).toBe(true);
    expect(snapshot.betrieb).toBeTypeOf("object");
  });

  it("liefert eine Kopfzeile, deren Zahlen gerechnet und nicht geschrieben sind", () => {
    expect(snapshot.kopfzeile.objekteGesamt).toBe(snapshot.objekte.length);
    expect(typeof snapshot.kopfzeile.mitBelegterMiete).toBe("number");
    expect(istTextOderNull(snapshot.kopfzeile.topTrefferSeit)).toBe(true);
    expect(istZahlOderNull(snapshot.kopfzeile.anteilBundeslandgenau)).toBe(true);
  });

  it("liefert je Bundesland die drei umschaltbaren Kartengroessen (N2)", () => {
    expect(snapshot.bundeslaender.length).toBeGreaterThan(0);
    for (const land of snapshot.bundeslaender) {
      expect(typeof land.name).toBe("string");
      expect(typeof land.objekte).toBe("number");
      expect(typeof land.topTreffer).toBe("number");
      expect(istZahlOderNull(land.medianDscr)).toBe(true);
      expect(istZahlOderNull(land.standAlterTage)).toBe(true);
    }
  });

  it("haelt bei JEDEM Objekt jedes Feld im vereinbarten Typ", () => {
    const fehler: string[] = [];
    for (const objekt of snapshot.objekte as SnapshotObjekt[]) {
      const pruefe = (bedingung: boolean, feld: string) => {
        if (!bedingung && fehler.length < 10) fehler.push(`${objekt.id}: ${feld}`);
      };
      pruefe(typeof objekt.id === "string" && objekt.id !== "", "id");
      pruefe(typeof objekt.quelle === "string", "quelle");
      pruefe(istTextOderNull(objekt.url), "url");
      pruefe(istTextOderNull(objekt.titel), "titel");
      pruefe(istTextOderNull(objekt.ort), "ort");
      pruefe(istTextOderNull(objekt.bundesland), "bundesland");
      pruefe(istTextOderNull(objekt.plz), "plz");
      pruefe(istZahlOderNull(objekt.kaufpreisEuro), "kaufpreisEuro");
      pruefe(istZahlOderNull(objekt.wohnflaecheM2), "wohnflaecheM2");
      pruefe(istZahlOderNull(objekt.grundstueckM2), "grundstueckM2");
      pruefe(istZahlOderNull(objekt.baujahr), "baujahr");
      pruefe(istZahlOderNull(objekt.einheiten), "einheiten");
      pruefe(typeof objekt.einheitenAngenommen === "boolean", "einheitenAngenommen");
      pruefe(STUFEN.has(objekt.stufe), "stufe");
      pruefe(TREFFERKLASSEN.has(objekt.trefferklasse), "trefferklasse");
      pruefe(istZahlOderNull(objekt.rangzahl), "rangzahl");
      pruefe(istZahlOderNull(objekt.kaufpreisfaktor), "kaufpreisfaktor");
      if (objekt.stufe === "S0") pruefe(objekt.kaufpreisfaktor === null, "kaufpreisfaktor bei S0 null");
      pruefe(
        objekt.band === null ||
          (typeof objekt.band.unten === "number" && typeof objekt.band.oben === "number"),
        "band"
      );
      pruefe(typeof objekt.istSchwellenwechsler === "boolean", "istSchwellenwechsler");
      pruefe(ZUSTAENDE.has(objekt.zustand), "zustand");
      pruefe(
        Array.isArray(objekt.datenluecken) &&
          objekt.datenluecken.every((l) => typeof l === "string"),
        "datenluecken"
      );
      pruefe(typeof objekt.preisGesenkt === "boolean", "preisGesenkt");
      pruefe(istTextOderNull(objekt.zuletztGesehen), "zuletztGesehen");
      pruefe(istTextOderNull(objekt.abgaengigSeit), "abgaengigSeit");
      pruefe(istTextOderNull(objekt.termin), "termin");
    }
    expect(fehler).toEqual([]);
  });

  it("gibt einem Objekt OHNE Kennzahl auch kein Band und keine Trefferklasse (3.7)", () => {
    const verletzungen = (snapshot.objekte as SnapshotObjekt[]).filter(
      (o) => o.rangzahl === null && (o.band !== null || o.trefferklasse !== "nichtBeurteilbar")
    );
    expect(verletzungen).toHaveLength(0);
  });

  it("laesst KEIN Objekt ohne Kennzahl ohne Text dastehen (3.7) -- gegen alle Objekte", () => {
    // Das ist die Zusicherung, auf die es ankommt: Was der Nutzer sieht.
    // Sie haelt auch dort, wo der Export selbst einmal keinen Grund liefern
    // sollte (siehe die Wache unten) -- `gruendeFuerAnzeige` faengt das ab.
    const ohneText = (snapshot.objekte as SnapshotObjekt[]).filter(
      (o) => o.rangzahl === null && gruendeFuerAnzeige(o).length === 0
    );
    expect(ohneText).toHaveLength(0);
  });

  // Ehemals EIN BEFUND-Test (maass zwei bekannte Verstoesse, statt sie
  // auszuschliessen). Nach A18-1 (`s0Gruende` in `scraper/lib/ranking.ts`)
  // und A18-2 (Altname `kaufpreis_unplausibel` beschriftet) gilt beides als
  // Zusage des Exports, nicht mehr nur als gemessener Zustand -- deshalb die
  // strenge Form, jetzt als ZWEI getrennte Pruefungen (Review M-5): In einem
  // gemeinsamen Test bricht das erste fehlschlagende `expect` ab, bevor das
  // zweite je laeuft -- getrennt meldet jede Haelfte unabhaengig.
  it("WACHE (A18, Teil a): jedes S0-Objekt traegt einen Grund", () => {
    // IDs als LISTE vergleichen, nicht nur die Laenge: Faellt die Wache,
    // nennt der Fehlertext genau die betroffenen Objekte.
    const objekte = snapshot.objekte as SnapshotObjekt[];
    const ohneGrund = objekte.filter((o) => o.stufe === "S0" && o.datenluecken.length === 0);
    expect(ohneGrund.map((o) => o.id)).toEqual([]);
  });

  it("WACHE (A18, Teil b): kein Grund in datenluecken ist ein roher Code", () => {
    // Codes als LISTE vergleichen, nicht nur die Anzahl: Faellt die Wache,
    // nennt der Fehlertext genau die durchgereichten Codes.
    const objekte = snapshot.objekte as SnapshotObjekt[];
    const roheCodes = objekte
      .flatMap((o) => o.datenluecken)
      .filter((l) => istRoherCodeImKlartextfeld(l));
    expect([...new Set(roheCodes)]).toEqual([]);
  });

  it("haelt bei jedem Band die untere Kante unter oder auf der oberen", () => {
    const verdreht = (snapshot.objekte as SnapshotObjekt[]).filter(
      (o) => o.band !== null && o.band.unten > o.band.oben
    );
    expect(verdreht).toHaveLength(0);
  });

  it("vergibt 'top' nur an Objekte, die eine untere Bandkante ODER S3 vorweisen (N1.1)", () => {
    const unbelegt = (snapshot.objekte as SnapshotObjekt[]).filter(
      (o) => o.trefferklasse === "top" && o.band === null && o.stufe !== "S3"
    );
    expect(unbelegt).toHaveLength(0);
  });
});

describe.skipIf(vorhanden)("Vertrag: Snapshot-Datei fehlt", () => {
  it("wird uebersprungen -- so erzeugt man sie", () => {
    expect(vorhanden).toBe(false);
    // `web/public/dashboard-snapshot.json` ist git-ignoriert. Erzeugen: den
    // Lauf laufen lassen (erzeugt sie als Artefakt) oder `erzeugeSnapshot`
    // aus `scraper/lib/snapshotDb.ts` rein lesend aufrufen -- siehe
    // .superpowers/sdd/2026-09-15-web-dashboard/progress.md.
  });
});
