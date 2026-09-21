/**
 * Der Weg zu einem ZVG-Verfahren, der von aussen tatsaechlich funktioniert.
 *
 * DAS PROBLEM: Der gespeicherte Direktlink
 * (`index.php?button=showZvg&zvg_id=...`) liefert von einer fremden Domain
 * aus **immer** HTTP 200 mit dem Body `error`. zvg-portal.de verlangt einen
 * Referer der eigenen Domain; ein Klick aus dem Dashboard ist aber immer
 * Cross-Origin, und Browser senden dabei standardmaessig nur den Origin.
 * Derselbe Mechanismus ist im Scraper seit Langem bekannt -- `ladeDatei`
 * setzt fuer ZVG-PDFs eigens einen Referer.
 *
 * DIE LOESUNG: die Terminsuche des Portals, vorbelegt mit Bundesland und
 * PLZ. Sie ist **POST**, nicht GET -- ein `<a href>` kann sie daher nicht
 * aufrufen, ein `<form method="post" target="_blank">` schon. Formulare
 * unterliegen nicht CORS, und gegen die Livesuche geprueft (2026-09-21)
 * antwortet sie ohne Referer, mit fremdem Referer und mit Origin-Header
 * gleichermassen.
 *
 * GEMESSEN an 20 Objekten aus dem Snapshot: Alle 20 wurden gefunden, 11
 * davon als einziger Treffer, die uebrigen unter zwei bis vier.
 */

/** Die Suche nimmt genau zwei Felder -- mehr ist geprueft und unnoetig. */
export interface ZvgSuchfelder {
  land_abk: string;
  /** Leer heisst: im ganzen Bundesland suchen. */
  plz: string;
}

export const ZVG_SUCHE_URL = "https://www.zvg-portal.de/index.php?button=Suchen";

/**
 * EIGENE Tabelle, die der Karte bewusst NICHT geerbt.
 *
 * `logik/karte.ts` schreibt Brandenburg als `BB` -- das ist die gaengige
 * Abkuerzung, aber das ZVG-Portal kennt nur `br` und antwortet auf `bb` mit
 * „falsche Parameter uebergeben" (am 2026-09-21 gegen die Livesuche
 * geprueft). Wer die Kartentabelle kleinschreibt, baut genau diesen stillen
 * Fehler ein. Alle uebrigen 15 stimmen ueberein.
 */
const ZVG_KUERZEL: Readonly<Record<string, string>> = {
  "Baden-Württemberg": "bw",
  Bayern: "by",
  Berlin: "be",
  Brandenburg: "br",
  Bremen: "hb",
  Hamburg: "hh",
  Hessen: "he",
  "Mecklenburg-Vorpommern": "mv",
  Niedersachsen: "ni",
  "Nordrhein-Westfalen": "nw",
  "Rheinland-Pfalz": "rp",
  Saarland: "sl",
  Sachsen: "sn",
  "Sachsen-Anhalt": "st",
  "Schleswig-Holstein": "sh",
  Thüringen: "th",
};

/**
 * PLZ, die keine ist. Drei der 189 ZVG-Objekte tragen sie; danach zu suchen
 * liefert nichts, und eine Suche ohne Treffer ist so unbrauchbar wie der
 * kaputte Direktlink.
 */
const PLATZHALTER_PLZ = "00000";

/**
 * Die Formularfelder fuer dieses Objekt -- oder `null`, wenn keine Suche
 * moeglich ist und der gewoehnliche Verweis stehen bleiben soll.
 */
export function zvgSuchfelder(
  quelle: string,
  bundesland: string | null,
  plz: string | null
): ZvgSuchfelder | null {
  if (quelle !== "zvg-portal") return null;
  if (bundesland === null) return null;
  const land_abk = ZVG_KUERZEL[bundesland];
  // Ohne gueltiges Kuerzel weist die Suche jede Anfrage ab. Ein Formular, das
  // sicher scheitert, waere kein Fortschritt gegenueber dem Direktlink.
  if (land_abk === undefined) return null;
  return {
    land_abk,
    plz: plz === null || plz === PLATZHALTER_PLZ ? "" : plz,
  };
}
