/**
 * Die Klartext-Gruende an einem Objekt ohne Kennzahl (Entwurf 3.7).
 *
 * > "Sie tragen keine Kennzahl. Kein DSCR, kein Faktor, keine Rendite -- an
 * > der Stelle steht der Grund im Klartext."
 *
 * Diese Datei loest ZWEI BEFUNDE am echten Bestand vom 2026-09-15, beide im
 * Export entstanden und beide hier nur AUFGEFANGEN, nicht repariert -- an
 * `scraper/` wird in diesem Schritt nichts geaendert:
 *
 * 1. **Ein roher Lueckencode.** `kaufpreis_unplausibel` steht bei 2 Objekten
 *    in `data_gaps`, hat aber keinen Eintrag in `DATA_GAP_LABELS`
 *    (`scraper/lib/telegram.ts`); `datenlueckeKlartext` reicht ihn deshalb
 *    unveraendert durch. Die Oberflaeche baut dafuer KEINE zweite
 *    Klartext-Tabelle -- das war die ausdrueckliche Entscheidung 2 des
 *    Snapshot-Schritts ("damit es EINE Tabelle gibt und nicht zwei"). Sie
 *    zeigt den Code und kennzeichnet ihn als unbeschrifteten Code.
 *
 * 2. **Ein Objekt ohne jeden Grund.** Ein ZVG-Objekt (Leverkusen) ist S0,
 *    weil ihm die Wohnflaeche fehlt, traegt aber keinen `data_gaps`-Eintrag:
 *    Die Stufe haengt am FELD `living_area_m2`, der Klartext an der
 *    ABLEITUNG `wohnflaeche_fehlt` -- genau die Luecke, die Entwurf 3.3 fuer
 *    148 Objekte beschreibt. Eine leere Zelle dort saehe aus wie "geprueft
 *    und nichts gefunden", also wie ein Urteil.
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
