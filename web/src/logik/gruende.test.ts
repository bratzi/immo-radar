import { describe, expect, it } from "vitest";
import type { SnapshotObjekt } from "../daten/snapshot.ts";
import { gruendeFuerAnzeige } from "./gruende.ts";

function objekt(teil: Partial<SnapshotObjekt> = {}): SnapshotObjekt {
  return {
    id: "a",
    quelle: "immowelt",
    url: null,
    titel: null,
    ort: null,
    bundesland: null,
    plz: null,
    kaufpreisEuro: null,
    wohnflaecheM2: null,
    grundstueckM2: null,
    baujahr: null,
    einheiten: null,
    einheitenAngenommen: true,
    stufe: "S0",
    trefferklasse: "nichtBeurteilbar",
    rangzahl: null,
    kaufpreisfaktor: null,
    band: null,
    istSchwellenwechsler: false,
    zustand: "verfuegbar",
    datenluecken: [],
    preisGesenkt: false,
    zuletztGesehen: null,
    abgaengigSeit: null,
    termin: null,
    ...teil,
  };
}

describe("gruendeFuerAnzeige", () => {
  it("gibt die Klartext-Gruende des Exports unveraendert weiter", () => {
    const gruende = gruendeFuerAnzeige(
      objekt({ datenluecken: ["Wohnfläche fehlt", "Preis und Miete unvereinbar"] })
    );
    expect(gruende).toEqual([
      { text: "Wohnfläche fehlt", istKlartext: true },
      { text: "Preis und Miete unvereinbar", istKlartext: true },
    ]);
  });

  it("markiert einen ROHEN Lueckencode als solchen, statt ihn als Satz auszugeben", () => {
    // `irgendein_neuer_code` ist ERFUNDEN, kein Beispiel aus dem Bestand:
    // Der bisherige Beleg `kaufpreis_unplausibel` traegt seit A18-2 einen
    // Eintrag in DATA_GAP_LABELS (scraper/lib/telegram.ts) und liefe hier am
    // falschen Anlass weiter. Die Wache bleibt trotzdem noetig -- die
    // naechste Umbenennung ohne nachgezogenes Label faellt genauso auf. Die
    // Oberflaeche baut dafuer KEINE zweite Klartext-Tabelle -- sie zeigt den
    // Code und sagt dazu, dass er keiner ist.
    const gruende = gruendeFuerAnzeige(objekt({ datenluecken: ["irgendein_neuer_code"] }));
    expect(gruende).toEqual([{ text: "irgendein_neuer_code", istKlartext: false }]);
  });

  it("erkennt einen Klartext auch dann, wenn er Unterstriche im Satz haette", () => {
    expect(gruendeFuerAnzeige(objekt({ datenluecken: ["Preis fehlt — die Quelle nennt nichts"] }))[0])
      .toEqual({ text: "Preis fehlt — die Quelle nennt nichts", istKlartext: true });
  });

  it("laesst ein Objekt OHNE Kennzahl niemals ohne Text dastehen (3.7)", () => {
    // Befund am Bestand vom 2026-09-15: ein ZVG-Objekt war S0 (keine
    // Wohnflaeche), trug aber gar keinen `data_gaps`-Eintrag -- die Stufe
    // hing am FELD, der Klartext an der ABLEITUNG. BEHOBEN seit A18-1
    // (2026-09-16): `s0Gruende` (`scraper/lib/ranking.ts`) liefert den Grund
    // seither selbst. Diese Pruefung bleibt als Wache stehen -- eine leere
    // Zelle saehe aus wie "geprueft und nichts gefunden", falls der Export
    // die Zusage doch einmal verletzt.
    const gruende = gruendeFuerAnzeige(objekt({ rangzahl: null, datenluecken: [] }));
    expect(gruende).toHaveLength(1);
    expect(gruende[0]!.istKlartext).toBe(false);
    expect(gruende[0]!.text.length).toBeGreaterThan(0);
  });

  it("raet dabei KEINE Ursache, sondern sagt, dass der Export keine nennt", () => {
    const text = gruendeFuerAnzeige(objekt({ rangzahl: null, datenluecken: [] }))[0]!.text;
    // Kein erfundener Grund -- insbesondere nicht die im Frontend
    // nachgebaute Ableitung "Wohnflaeche fehlt" (Entwurf 5.3, Punkt 4).
    expect(text).not.toMatch(/Wohnfläche/);
    expect(text).toMatch(/kein(en)? Grund/i);
  });

  it("erfindet fuer ein Objekt MIT Kennzahl keinen Ersatztext", () => {
    expect(gruendeFuerAnzeige(objekt({ rangzahl: 1.2, datenluecken: [] }))).toEqual([]);
  });
});
