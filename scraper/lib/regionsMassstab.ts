/**
 * WORAN eine Region gemessen wird, und wie das Urteil daraus faellt.
 *
 * Getrennt in zwei Schritte, weil `vollstaendig` die Wache vor der
 * Massenloeschung ist: Erst steht fest, WORAN gemessen wird, dann faellt das
 * Urteil. Nur so kann die Datenbankzeile den Massstab mitschreiben, und nur
 * so steht `vollstaendig = true` nie ohne Beleg da.
 *
 * WARUM EINE HOCHWASSERMARKE UND KEIN MEDIAN: gemessen am 2026-09-21 gegen
 * die zwoelf Regionen, deren Trefferzahl bekannt ist (323 Urteile, Skript
 * `scripts/messung-a16-massstaebe.mts`). Der gleitende Median -- der Vorschlag
 * aus BACKLOG A16 -- erzeugte 203 falsche Freigaben. Ursache: 24 % der Laeufe
 * sind flach, und der Median sinkt mit dem Ausfall mit. Auch das Maximum ueber
 * ein Fenster von zehn Laeufen fiel durch (43). Nicht der Schaetzer ist das
 * Problem, sondern das Fenster: Der flache Zustand haelt laenger an als zehn
 * Laeufe. Die Marke OHNE Fenster urteilte fehlerfrei -- 0 Fail-open, 0
 * Fehlalarm, und sie sagte genau so oft "vollstaendig" wie die Wahrheit
 * (54 von 54), war also keine triviale Nullmessung.
 *
 * Details: docs/superpowers/specs/2026-09-21-a16-zweiter-vollstaendigkeitsmassstab-design.md
 */

export type MassstabArt = "gemeldete_treffer" | "hochwassermarke" | "keiner";

export interface Massstab {
  art: MassstabArt;
  /** Die Menge, gegen die geurteilt wird. null nur bei art "keiner". */
  referenz: number | null;
  /** Zulaessiger Fehlbetrag als Anteil. Gehoert zum Massstab, nicht zum
   *  Aufrufer -- sonst koennte dieselbe Referenz je nach Aufrufort anders
   *  streng gelesen werden. */
  toleranz: number;
}

export interface MassstabRegeln {
  /** Bis zu dieser Marke gilt die Historie NICHT als Massstab. */
  untergrenze: number;
  /** Zulaessiger Fehlbetrag gegen die gemeldete Trefferzahl. */
  toleranzGemeldet: number;
  /** Zulaessiger Fehlbetrag gegen die Hochwassermarke. Enger, weil eine
   *  einzelne Region viel stabiler ist als eine ganze Quelle. */
  toleranzMarke: number;
}

/**
 * Das Maximum der bisher gesehenen Mengen. `null` fuer eine leere Liste --
 * und das ist NICHT dasselbe wie die Menge null: Ohne Historie gibt es
 * keinen Massstab, mit einer Historie aus lauter Nullen ebenfalls nicht.
 */
export function hochwassermarkeAus(mengen: number[]): number | null {
  if (mengen.length === 0) return null;
  return Math.max(...mengen);
}

export function waehleMassstab(
  gemeldet: number | null,
  hochwassermarke: number | null,
  regeln: MassstabRegeln
): Massstab {
  // Die gemeldete Trefferzahl ist die Aussage des Portals ueber sich selbst
  // und schlaegt jede Schaetzung aus der eigenen Historie.
  if (gemeldet !== null) {
    return { art: "gemeldete_treffer", referenz: gemeldet, toleranz: regeln.toleranzGemeldet };
  }
  // Eine Marke, die nicht ueber eine Ergebnisseite hinauskommt, ist keine
  // Marke, sondern der Abdruck des Ausfalls, gegen den hier geschuetzt wird.
  if (hochwassermarke !== null && hochwassermarke > regeln.untergrenze) {
    return { art: "hochwassermarke", referenz: hochwassermarke, toleranz: regeln.toleranzMarke };
  }
  return { art: "keiner", referenz: null, toleranz: 0 };
}

export function urteileGegenMassstab(
  gesammelt: number,
  massstab: Massstab,
  /**
   * Endete die Blaetterung am Seitendeckel des Portals? Verpflichtend und
   * ohne Vorgabewert: Ein Argument mit stillem `false` waere genau die Sorte
   * Vorgabe, die einen unbekannten Zustand als "in Ordnung" liest.
   */
  abgeschnitten: boolean
): boolean {
  if (abgeschnitten) return false;
  if (gesammelt === 0) return false;
  if (massstab.art === "keiner" || massstab.referenz === null) return false;
  // Eine gemeldete Null ist eine Aussage, kein fehlender Wert: Das Portal
  // sagt, es gebe hier nichts. Dann genuegt, dass ueberhaupt etwas ankam --
  // die Division waere sonst undefiniert.
  if (massstab.referenz === 0) return true;
  return gesammelt >= massstab.referenz * (1 - massstab.toleranz);
}
