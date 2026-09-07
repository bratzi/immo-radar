/** Erst ab so vielen erfolgreichen Referenzlaeufen wird ueberhaupt geloescht. */
export const MIN_REFERENZLAEUFE = 3;
/** Zulaessige Abweichung vom Median der Referenzlaeufe. */
export const TOLERANZ_ANTEIL = 0.25;
/** Wie viele vergangene Laeufe die Referenz bilden. */
export const HISTORIE_LAENGE = 10;

export interface PlausibilitaetsEingabe {
  /** Objekte, die dieser Sweep tatsaechlich eingesammelt hat. */
  gesehene: number;
  /** Vom Portal ausgewiesene Trefferzahl; null, wenn es keine nennt. */
  gemeldeteTreffer: number | null;
  /** gesehene_objekte der letzten erfolgreichen Laeufe derselben Quelle. */
  historie: number[];
  vollstaendig: boolean;
}

export interface PlausibilitaetsErgebnis {
  loeschenErlaubt: boolean;
  /** Klartext fuer die Warnmeldung; null, wenn das Loeschen erlaubt ist. */
  grund: string | null;
  /** Median der Referenzlaeufe, fuer die Warnmeldung. Null ohne Historie. */
  erwartet: number | null;
}

/** Median ohne Seiteneffekt auf die Eingabeliste. */
export function median(werte: number[]): number | null {
  if (werte.length === 0) return null;
  const sortiert = [...werte].sort((a, b) => a - b);
  const mitte = Math.floor(sortiert.length / 2);
  return sortiert.length % 2 === 1
    ? sortiert[mitte]
    : (sortiert[mitte - 1] + sortiert[mitte]) / 2;
}

/**
 * Entscheidet, ob auf Abwesenheit hin geloescht werden darf.
 *
 * Das Abdeckungsprotokoll erkennt nur Sweeps, die MIT Fehler abbrechen. Der
 * gefaehrlichere Fall ist der technisch saubere Lauf, der trotzdem zu wenig
 * liefert -- geaenderter Selektor, anders greifender Filter, stillschweigend
 * gekuerzte Ausgabe. Genau den faengt diese Funktion ab.
 */
export function pruefeMengenplausibilitaet(
  eingabe: PlausibilitaetsEingabe
): PlausibilitaetsErgebnis {
  const erwartet = median(eingabe.historie);

  if (!eingabe.vollstaendig) {
    return { loeschenErlaubt: false, grund: "Sweep war unvollständig.", erwartet };
  }

  if (eingabe.gemeldeteTreffer !== null && eingabe.gemeldeteTreffer > 0) {
    const abweichung =
      Math.abs(eingabe.gesehene - eingabe.gemeldeteTreffer) / eingabe.gemeldeteTreffer;
    if (abweichung > TOLERANZ_ANTEIL) {
      return {
        loeschenErlaubt: false,
        grund:
          `Eingesammelt ${eingabe.gesehene}, das Portal weist aber ` +
          `${eingabe.gemeldeteTreffer} Trefferzahl aus.`,
        erwartet,
      };
    }
  }

  if (eingabe.historie.length < MIN_REFERENZLAEUFE) {
    return {
      loeschenErlaubt: false,
      grund:
        `Erst ${eingabe.historie.length} von ${MIN_REFERENZLAEUFE} nötigen ` +
        `Referenzläufen vorhanden.`,
      erwartet,
    };
  }

  // erwartet ist hier nie null: historie.length >= MIN_REFERENZLAEUFE > 0.
  const referenz = erwartet as number;
  if (referenz > 0) {
    const abweichung = Math.abs(eingabe.gesehene - referenz) / referenz;
    if (abweichung > TOLERANZ_ANTEIL) {
      return {
        loeschenErlaubt: false,
        grund:
          `Menge weicht um ${Math.round(abweichung * 100)} % vom Median ` +
          `${referenz} der letzten Läufe ab.`,
        erwartet,
      };
    }
  }

  return { loeschenErlaubt: true, grund: null, erwartet };
}
