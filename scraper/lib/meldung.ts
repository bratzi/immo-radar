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
  /** MietQuelle aus rentEstimate.ts. Nur "angegeben" gilt als belegt. */
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

  return eingabe.mietQuelle === "angegeben" ? "top_treffer" : "pruefkandidat";
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
