/**
 * Die Stichprobe am Anfang der Detailphase -- und warum es sie gibt.
 *
 * DAS GEMESSENE PROBLEM (2026-09-21): Immowelts /expose/-Sperre ist kein
 * Wackelkontakt. Ist sie aktiv, scheitern nicht ein paar Abrufe, sondern
 * ALLE -- in drei Produktionslaeufen 75 von 75. Die Phase holt trotzdem
 * stur ihre `MAX_DETAILS_IMMOWELT` Seiten, bei rund 10 s je Abruf also vier
 * Minuten, und schickt dabei 25 Anfragen gegen eine Quelle, die gerade
 * zumacht. Bei real 4,5 Laeufen am Tag sind das 112 Abrufe taeglich ins
 * Leere.
 *
 * Umgekehrt gilt: Kommt die Sperre nicht, kommen VIELE durch -- 6 von 10 war
 * die beste je gemessene Quote. Die beiden Zustaende liegen so weit
 * auseinander, dass wenige Abrufe sie sicher unterscheiden.
 *
 * WAS DIESE PROBE NICHT IST: eine dauerhafte Abschaltung. Jeder Lauf
 * probiert erneut -- die Sperre kam und ging binnen eines Tages, und ein
 * Schalter, der sich selbst umlegt und dann liegen bleibt, waere schlimmer
 * als die verlorenen vier Minuten.
 */

/**
 * Wie viele Abrufe die Probe umfasst.
 *
 * Bei rund 10 s je Abruf kostet eine gescheiterte Probe eine halbe Minute
 * statt vier Minuten. Zwei waeren noch billiger, aber drei geben der Quote
 * von 60 % genug Raum: Die Wahrscheinlichkeit, dass drei Abrufe bei offener
 * Sperre alle scheitern, liegt unter 7 %.
 */
export const PROBE_GROESSE = 3;

/**
 * Soll die Detailphase nach der Probe abbrechen?
 *
 * Die Entscheidung faellt GENAU EINMAL, beim `PROBE_GROESSE`-ten Abruf.
 * Danach nie wieder: Ein Lauf, der die Probe bestanden hat, soll nicht doch
 * noch abbrechen, nur weil spaeter eine Strecke ohne Treffer kommt.
 */
export function abbrechenNachProbe(stand: { versucht: number; erfasst: number }): boolean {
  return stand.versucht === PROBE_GROESSE && stand.erfasst === 0;
}
