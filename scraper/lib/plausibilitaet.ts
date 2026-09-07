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
 *
 * Leitregel jeder Wache hier: Wer nicht urteilen kann, loescht nicht. Die
 * beiden Nullfaelle (nichts eingesammelt, Median null) sind KEINE bestandenen
 * Pruefungen, sondern die Symptome genau des Ausfalls, gegen den geschuetzt
 * werden soll -- ein Soft-Block liefert HTTP 200 mit leerer Huelle, also 0
 * Karten und keine Trefferzahl. Sie muessen deshalb ausdruecklich verboten
 * werden, nicht stillschweigend durchfallen.
 */
export function pruefeMengenplausibilitaet(
  eingabe: PlausibilitaetsEingabe
): PlausibilitaetsErgebnis {
  const erwartet = median(eingabe.historie);

  if (!eingabe.vollstaendig) {
    return { loeschenErlaubt: false, grund: "Sweep war unvollständig.", erwartet };
  }

  // Ein Lauf ohne ein einziges Objekt ist nie ein leergefegtes Portal, sondern
  // immer ein Ausfall (Sperre, Selektorbruch, Netzfehler). Wuerde er das Tor
  // passieren, waere JEDES bekannte Objekt ein Abgang.
  if (eingabe.gesehene === 0) {
    return {
      loeschenErlaubt: false,
      grund: "Der Sweep hat nichts eingesammelt (0 Objekte) — das ist ein Ausfall, kein leeres Portal.",
      erwartet,
    };
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

  // Ein Median von 0 heisst: die Mehrheit der Referenzlaeufe hat selbst nichts
  // gesehen. Damit gibt es keinen Massstab, an dem sich dieser Lauf messen
  // liesse -- die Division waere zudem undefiniert. Frueher wurde die Pruefung
  // hier einfach uebersprungen; dadurch machten drei Nulllaeufe hintereinander
  // den Weg fuer die Loeschung des GANZEN Bestands frei.
  if (!(referenz > 0)) {
    return {
      loeschenErlaubt: false,
      grund:
        `Median der Referenzläufe ist ${referenz} — kein belastbarer Maßstab, ` +
        `an dem sich dieser Lauf messen ließe.`,
      erwartet,
    };
  }

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

  return { loeschenErlaubt: true, grund: null, erwartet };
}
