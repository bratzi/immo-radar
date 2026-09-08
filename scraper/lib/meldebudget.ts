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

export interface Meldebudget {
  /** true, solange noch gesendet werden darf. Verbraucht KEINE Einheit. */
  darfSenden(): boolean;
  /** Eine Meldung verbuchen. Nach dem tatsaechlichen Versand aufrufen. */
  verbuchen(): void;
  /** Wie viele Meldungen dieser Lauf schon gesendet hat. */
  verbraucht(): number;
  /** Wie viele Meldungen wegen des Budgets zurueckgestellt wurden. */
  zurueckgestellt(): number;
  /** Eine zurueckgestellte Meldung verbuchen. */
  zurueckstellen(): void;
}

export function erstelleMeldebudget(maximum: number): Meldebudget {
  let gesendet = 0;
  let verschoben = 0;
  return {
    darfSenden: () => gesendet < maximum,
    verbuchen: () => {
      gesendet += 1;
    },
    verbraucht: () => gesendet,
    zurueckgestellt: () => verschoben,
    zurueckstellen: () => {
      verschoben += 1;
    },
  };
}
