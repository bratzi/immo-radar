import type { MietQuelle } from "./rentEstimate.js";

/**
 * Obergrenze fuer Telegram-Meldungen je Lauf.
 *
 * WARUM ES DAS BRAUCHT: Gemeldet wird bei jedem Aufstieg der Meldeklasse, und
 * beim allerersten Sehen steigt jedes qualifizierte Objekt von "keine" auf.
 * Solange Immowelt nur 144 Objekte je Lauf erreichte, war das harmlos. Seit
 * die Bewertung aus der Ergebnisliste kommt, sind es potenziell alle
 * gesehenen -- beim letzten Sweep 3.665, bundesweit ~35.000.
 *
 * Die Rechnung, die das gefaehrlich macht: Ein Objekt fuer 75.000 € mit
 * 158 m² ergibt bei bundeslandgenauer Miete rund 19.000 € Jahresmiete und
 * damit einen Kaufpreisfaktor von etwa 4 -- weit unter der Schwelle von 15.
 * Guenstige Objekte passieren die Schwellen also fast alle. Bei 500 ms
 * Sendeabstand waeren tausend Meldungen mehr als acht Minuten Dauerfeuer, und
 * der Lauf liefe in das 75-Minuten-Limit des Jobs. Der Kill trifft VOR dem
 * Abgleichsblock am Ende von main() -- Markieren, Entmarkieren und
 * Karenz-Loeschung fielen dann stumm aus.
 *
 * DAS BUDGET VERLIERT NICHTS. Ohne Zeile in `notifications` gilt ein Objekt im
 * naechsten Lauf weiter als nie gemeldet und wird nachgeholt. Die Meldung wird
 * also verschoben, nicht verworfen -- dieselbe Selbstheilung, auf der schon
 * die Fehlerbehandlung des Versands beruht.
 */

/**
 * Guete der Miete, auf der eine Meldung beruht -- gruppiert auf die zwei
 * Stufen, die fuer die Meldereihenfolge zaehlen.
 *
 *  - `belegt_oder_plz_genau` -- das Portal nennt die Miete, oder sie kommt
 *    aus dem PLZ-Zweisteller. Beides ist ortsscharf.
 *  - `nur_landesweit` -- die Miete ist ueber ein ganzes Bundesland (oder
 *    schlimmstenfalls ueber Deutschland) gemittelt.
 */
export type Mietstufe = "belegt_oder_plz_genau" | "nur_landesweit";

/**
 * Ordnet eine `MietQuelle` aus rentEstimate.ts der Meldestufe zu.
 *
 * WARUM DIE QUELLE UND NICHT DIE DATENLUECKE: Es gaebe zwei Kandidaten fuer
 * dieses Merkmal -- die Datenluecke `miete_nur_bundeslandgenau` und die
 * MietQuelle `geschaetzt_bundesland`. Die Luecke ist die ABLEITUNG: sie
 * entsteht in `bewerteMietschaetzung` genau dann, wenn die Quelle
 * "geschaetzt_bundesland" ist, und landet danach in einem Set zusammen mit
 * `sourceDataGaps`, also mit Zeichenketten, die der jeweilige Scraper
 * beisteuert. Ein Merkmal, das darueber entscheidet, WER gemeldet wird,
 * darf nicht an einer Zeichenkette aus dem Parser haengen. Die MietQuelle
 * dagegen ist ein getypter Union-Wert, den nur `ermittleJahreskaltmiete`
 * setzt -- und der Compiler erzwingt, dass hier jede Stufe bedacht ist.
 *
 * `geschaetzt_bundesweit` faellt mit in die untere Stufe: der Bundesschnitt
 * ist noch groeber als der Landesmittelwert.
 */
export function mietstufeFuerQuelle(quelle: MietQuelle): Mietstufe {
  return quelle === "angegeben" || quelle === "geschaetzt_regional"
    ? "belegt_oder_plz_genau"
    : "nur_landesweit";
}

/**
 * Wie viele der Meldungen eines Laufs auf einer NUR LANDESWEIT geschaetzten
 * Miete beruhen duerfen.
 *
 * DIE MESSUNG, DIE DIESE ZAHL BEGRUENDET (2026-09-09, Abnahmekriterium D-5):
 * Das Budget von 25 ist dauerhaft ausgeschoepft -- zuletzt 25 gesendet, 117
 * zurueckgestellt. Die landesweit geschaetzte Stufe stellt dabei 339 von 409
 * Meldekandidaten (83 % des Bestands), weil Immowelt-Ergebnislisten keine PLZ
 * nennen. Sie ist zugleich die unschaerfste: 7 der 16 Bundeslaender verlassen
 * intern das ±30-%-Band (NRW 6,50 bis 16,50 €/m², Bayern 8,00 bis 20,50), und
 * dort liegen 64 % der bewerteten Objekte. Ueber alle 1.879 bewertbaren
 * Objekte mit Miete ×0,7 / ×1,0 / ×1,3 nachgerechnet: 558 Objekte (29,7 %)
 * wechseln irgendwo im Band die Meldeklasse.
 *
 * Ohne Kontingent bestimmt also die groebste Stufe allein durch ihre Masse,
 * wer gemeldet wird -- ein Objekt mit belegter Miete steht hinter Dutzenden
 * Schaetzungen an, bei 117 Zurueckgestellten ueber Wochen hinweg.
 *
 * WARUM 5 UND NICHT WENIGER: 5 von 25 ist mehr als die reine Trefferquote
 * verlangen wuerde, aber die Stufe ist nicht wertlos -- ihr Mittelwert liegt
 * gegen Zensus 2022/BBSR bei Median -2,8 %, und 13 der 16 Laender treffen auf
 * ±15 %. Sie soll gebremst werden, nicht abgeschaltet.
 *
 * WARUM NICHT MEHR: Bliebe die Haelfte, waere die Reihenfolge bei 339 zu 70
 * Kandidaten praktisch unveraendert.
 *
 * Auf `MAX_MELDUNGEN_JE_LAUF` gesetzt verhaelt sich das Budget exakt wie vor
 * dieser Aenderung -- die Sicherheitsleine, unter Test in
 * meldebudget.test.ts.
 */
export const KONTINGENT_NUR_LANDESWEIT = 5;

export interface Meldebudget {
  /**
   * true, solange noch gesendet werden darf. Verbraucht KEINE Einheit.
   * Ohne Stufe gilt `belegt_oder_plz_genau`, also nur das Gesamtbudget --
   * so verhalten sich Meldungen, die gar nicht an einer Mietschaetzung
   * haengen (die Preisaenderung).
   */
  darfSenden(stufe?: Mietstufe): boolean;
  /** Eine Meldung verbuchen. Nach dem tatsaechlichen Versand aufrufen. */
  verbuchen(stufe?: Mietstufe): void;
  /** Wie viele Meldungen dieser Lauf schon gesendet hat. */
  verbraucht(): number;
  /** Wie viele Meldungen wegen des Budgets zurueckgestellt wurden. */
  zurueckgestellt(): number;
  /**
   * Eine zurueckgestellte Meldung verbuchen. `nachholen` ist der Versand
   * selbst: wird er mitgegeben, kommt er auf die Nachholliste und geht am
   * Ende des Laufs doch noch raus, falls Plaetze frei geblieben sind.
   */
  zurueckstellen(nachholen?: () => Promise<void>): void;
  /**
   * Am Ende des Laufs aufrufen: verschickt zurueckgestellte Meldungen,
   * solange das GESAMTBUDGET noch Plaetze hat. Das Kontingent gilt hier
   * nicht mehr -- es hat seinen Zweck erfuellt, sobald feststeht, dass die
   * besser belegten Kandidaten die Plaetze nicht brauchen.
   *
   * Wirft nie: ein gescheiterter Nachzuegler zaehlt wieder als
   * zurueckgestellt und wird im naechsten Lauf erneut versucht. Ein Wurf an
   * dieser Stelle traefe den Abgleichsblock in main() mit.
   */
  holeNach(): Promise<void>;
}

export function erstelleMeldebudget(
  maximum: number,
  kontingentNurLandesweit: number = KONTINGENT_NUR_LANDESWEIT
): Meldebudget {
  let gesendet = 0;
  let gesendetNurLandesweit = 0;
  let verschoben = 0;
  const nachholliste: (() => Promise<void>)[] = [];

  const budget: Meldebudget = {
    darfSenden: (stufe = "belegt_oder_plz_genau") => {
      if (gesendet >= maximum) return false;
      return stufe !== "nur_landesweit" || gesendetNurLandesweit < kontingentNurLandesweit;
    },
    verbuchen: (stufe = "belegt_oder_plz_genau") => {
      gesendet += 1;
      if (stufe === "nur_landesweit") gesendetNurLandesweit += 1;
    },
    verbraucht: () => gesendet,
    zurueckgestellt: () => verschoben,
    zurueckstellen: (nachholen) => {
      verschoben += 1;
      if (nachholen !== undefined) nachholliste.push(nachholen);
    },
    holeNach: async () => {
      while (nachholliste.length > 0 && gesendet < maximum) {
        const nachholen = nachholliste.shift()!;
        verschoben -= 1;
        try {
          await nachholen();
        } catch (err) {
          // Zurueck in die Zurueckgestellten: ohne Zeile in `notifications`
          // gilt das Objekt weiter als nie gemeldet und wird nachgeholt.
          verschoben += 1;
          console.warn("Nachgeholte Meldung fehlgeschlagen, bleibt zurueckgestellt:", err);
        }
      }
    },
  };
  return budget;
}
