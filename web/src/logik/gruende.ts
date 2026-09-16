/**
 * Die Klartext-Gruende an einem Objekt ohne Kennzahl (Entwurf 3.7).
 *
 * > "Sie tragen keine Kennzahl. Kein DSCR, kein Faktor, keine Rendite -- an
 * > der Stelle steht der Grund im Klartext."
 *
 * Diese Datei fing urspruenglich ZWEI BEFUNDE am echten Bestand vom
 * 2026-09-15 auf, beide im Export entstanden und inzwischen (2026-09-16, A18)
 * in `scraper/` behoben. Beide Kennzeichnungen bleiben trotzdem als WACHEN
 * stehen, nicht als Behauptung eines weiterhin offenen Befunds:
 *
 * 1. BEHOBEN (A18-2, 2026-09-16): **Ein roher Lueckencode.** `kaufpreis_unplausibel`
 *    stand bei Objekten in `data_gaps`, hatte aber keinen Eintrag in
 *    `DATA_GAP_LABELS` (`scraper/lib/telegram.ts`); `datenlueckeKlartext`
 *    reichte ihn deshalb unveraendert durch. `DATA_GAP_LABELS` traegt den
 *    Altnamen seither als Alias auf denselben Klartext wie
 *    `preis_miete_unvereinbar` (die A9-Umbenennung) -- der Export uebersetzt,
 *    die Produktionsdaten blieben unangetastet. Die Erkennung eines
 *    unbeschrifteten Codes bleibt dennoch bestehen: Die Oberflaeche baut
 *    dafuer KEINE zweite Klartext-Tabelle -- das war die ausdrueckliche
 *    Entscheidung 2 des Snapshot-Schritts ("damit es EINE Tabelle gibt und
 *    nicht zwei"). Sie ist jetzt die Wache fuer die naechste Umbenennung ohne
 *    nachgezogenes Label, nicht mehr der Befund selbst.
 *
 * 2. BEHOBEN (A18-1, 2026-09-16): **Ein Objekt ohne jeden Grund.** Ein
 *    ZVG-Objekt (Leverkusen) war S0, weil ihm die Wohnflaeche fehlte, trug
 *    aber keinen `data_gaps`-Eintrag: Die Stufe hing am FELD
 *    `living_area_m2`, der Klartext an der ABLEITUNG `wohnflaeche_fehlt`.
 *    Seither liefert `s0Gruende` (`scraper/lib/ranking.ts`) den Grund an der
 *    Stelle, die ueber S0 entscheidet, und `scraper/lib/snapshot.ts`
 *    verschmilzt ihn in `datenluecken` -- kein S0-Objekt verlaesst den
 *    Export mehr ohne Grund. Diese Datei bleibt trotzdem: `OHNE_GENANNTEN_GRUND`
 *    ist weiterhin die richtige Antwort, sollte der Export die Zusage doch
 *    einmal verletzen -- sie ist jetzt die Wache, nicht der Befund.
 *
 * WAS HIER BEWUSST NICHT GESCHIEHT: Der Ersatztext RAET KEINE URSACHE. Aus
 * `wohnflaecheM2 === null` im Frontend ein "Wohnfläche fehlt" abzuleiten
 * waere eine im Frontend nachgebaute Ableitung -- Entwurf 5.3, Punkt 4
 * verbietet genau das, und es waere eine zweite Wahrheit ueber denselben
 * Begriff. Der Text sagt stattdessen wahrheitsgemaess, dass der Export
 * keinen Grund nennt.
 */
import type { SnapshotObjekt } from "../daten/snapshot.ts";

export interface Grund {
  text: string;
  /**
   * `false` heisst: Das ist kein Satz, den jemand fuer die Anzeige
   * geschrieben hat, sondern ein durchgereichter Code oder ein Ersatztext.
   * Die Oberflaeche setzt ihn dann sichtbar anders.
   */
  istKlartext: boolean;
}

export const OHNE_GENANNTEN_GRUND =
  "Nicht beurteilbar — der Export nennt zu diesem Objekt keinen Grund";

/**
 * Ein roher Lueckencode sieht aus wie `wohnflaeche_fehlt`: nur Kleinbuchstaben,
 * Ziffern und Unterstriche, kein Leerzeichen. Ein Klartext ist ein Satz.
 */
function istRoherCode(text: string): boolean {
  return /^[a-z0-9]+(_[a-z0-9]+)+$/.test(text);
}

/**
 * Die Gruende, die an einem Objekt angezeigt werden.
 *
 * Fuer ein Objekt MIT Kennzahl bleibt die Liste leer, wenn der Export keine
 * Luecken nennt -- dort wird nichts erfunden. Fuer ein Objekt OHNE Kennzahl
 * ist die Liste garantiert nicht leer.
 */
export function gruendeFuerAnzeige(objekt: SnapshotObjekt): Grund[] {
  const gruende: Grund[] = objekt.datenluecken.map((text) => ({
    text,
    istKlartext: !istRoherCode(text),
  }));

  if (gruende.length === 0 && objekt.rangzahl === null) {
    return [{ text: OHNE_GENANNTEN_GRUND, istKlartext: false }];
  }
  return gruende;
}
