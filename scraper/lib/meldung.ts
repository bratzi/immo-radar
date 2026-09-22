/**
 * Meldeklasse eines Objekts. Die Rangfolge entscheidet, ob eine erneute
 * Nachricht faellig ist: gesendet wird nur, wenn die Klasse STEIGT.
 */
export type Meldeklasse = "keine" | "pruefkandidat" | "top_treffer";

const RANG: Record<Meldeklasse, number> = {
  keine: 0,
  pruefkandidat: 1,
  top_treffer: 2,
};

/** Alle kind-Werte in notifications, die an der Rangfolge teilnehmen. */
const KLASSEN_KINDS: Meldeklasse[] = ["pruefkandidat", "top_treffer"];

export interface MeldeklassenEingabe {
  /** Ergebnis der reinen Schwellenpruefung aus metrics.ts (Feld topTreffer). */
  erfuelltSchwellen: boolean;
  /**
   * MietQuelle aus rentEstimate.ts. Nur "angegeben" gilt als belegt,
   * "geschaetzt_regional" (PLZ-genau) als gut genug fuer eine Nachricht.
   */
  mietQuelle: string;
  /** ISO-Zeitpunkt des Versteigerungstermins, null bei Nicht-ZVG-Quellen. */
  auctionAt: string | null;
  jetzt: Date;
}

/**
 * Bildet die Meldeklasse. Kennzahlen auf Basis einer GESCHAETZTEN Miete sind
 * rechnerisch eher ein verkappter Quadratmeterpreis-Vergleich als eine
 * Rendite -- deshalb landen sie in einer eigenen Klasse, statt still
 * unterdrueckt oder wie belegte Zahlen behandelt zu werden.
 *
 * SEIT DEM 2026-09-22 gilt zusaetzlich eine Sperre ab PLZ-Stufe
 * (Entscheidung des Nutzers): verschickt wird nur bei `angegeben` oder
 * `geschaetzt_regional`. `geschaetzt_bundesland` und `geschaetzt_bundesweit`
 * sind zu grob -- bundesweit ist EIN Wert fuer ganz Deutschland, und eine
 * daraus gerechnete Rendite traegt keine Nachricht.
 *
 * WAS DIE SPERRE NICHT TUT: Sie blendet nichts aus dem Dashboard aus. Dessen
 * `trefferklasse` kommt aus `bestimmeTrefferklasse` in lib/snapshot.ts und
 * haengt an den Kennzahlen, nicht an dieser Funktion. Die Objekte bleiben
 * sichtbar und auffindbar, sie klingeln nur nicht mehr.
 */
export function bestimmeMeldeklasse(eingabe: MeldeklassenEingabe): Meldeklasse {
  if (!eingabe.erfuelltSchwellen) return "keine";

  // Ein bereits gelaufener Termin macht jede Meldung wertlos, unabhaengig
  // davon wie gut die Kennzahlen sind.
  if (eingabe.auctionAt !== null) {
    const termin = new Date(eingabe.auctionAt);
    if (Number.isFinite(termin.getTime()) && termin.getTime() < eingabe.jetzt.getTime()) {
      return "keine";
    }
  }

  // MELDESPERRE AB PLZ-STUFE. Eine Auswahlliste, keine Ausschlussliste:
  // eine Quelle, die hier nicht steht, meldet nicht.
  if (eingabe.mietQuelle === "angegeben") return "top_treffer";
  if (eingabe.mietQuelle === "geschaetzt_regional") return "pruefkandidat";
  return "keine";
}

/** true, wenn `a` einen echten Aufstieg gegenueber `b` darstellt. */
export function istHoeher(a: Meldeklasse, b: Meldeklasse): boolean {
  return RANG[a] > RANG[b];
}

/**
 * Hoechste Klasse aus einer Liste roher `kind`-Werte aus notifications.
 * Fremde Werte (preisaenderung, verschwunden) nehmen an der Rangfolge nicht
 * teil und werden ignoriert.
 */
export function hoechsteKlasse(kinds: string[]): Meldeklasse {
  let hoechste: Meldeklasse = "keine";
  for (const kind of kinds) {
    const klasse = KLASSEN_KINDS.find((k) => k === kind);
    if (klasse !== undefined && istHoeher(klasse, hoechste)) hoechste = klasse;
  }
  return hoechste;
}
