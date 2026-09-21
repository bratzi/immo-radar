/**
 * Zwei kleine Werkzeuge fuer die Bewertungsschleife -- und die Begruendung,
 * warum es sie ueberhaupt gibt.
 *
 * DAS GEMESSENE PROBLEM (2026-09-21): Ein bewertetes Objekt kostet rund
 * 0,6 s, und fast alles davon ist Warten. `upsertListingAndVersion` macht
 * drei Datenbankrunden nacheinander -- Zeile schreiben, letzte Version
 * lesen, neue Version schreiben -- bei rund 100 ms Umlaufzeit je Runde.
 * Gerechnet auf den Deckel von 600 Objekten sind das sechs Minuten, mehr als
 * der Sweep selbst braucht.
 *
 * WAS DAS KOSTET, und zwar nicht an Zeit: Bei 600 Bewertungen je Lauf,
 * real 4,5 Laeufen am Tag und ueber 23.000 Objekten im Bestand wird ein
 * Objekt nur alle **8,5 Tage** neu bewertet. So spaet wird eine Preissenkung
 * bemerkt -- bei einem Werkzeug, dessen Kernversprechen Preissenkungen sind.
 *
 * Die Zeit geht nicht fuer Rechenarbeit drauf, sondern fuer Warten auf das
 * Netz. Mehrere Objekte gleichzeitig zu bearbeiten kostet daher nichts und
 * bringt fast den vollen Faktor.
 */

/**
 * Eine Warteschlange, die Aufgaben nacheinander ausfuehrt, auch wenn sie
 * gleichzeitig hereinkommen.
 *
 * WOZU: Der Meldeteil der Pipeline darf NIE nebenlaeufig laufen. Er prueft
 * das Meldebudget, sendet dann ueber Telegram und verbucht danach -- zwischen
 * Pruefung und Verbuchung liegt also ein Netzabruf. Laufen zwei Meldungen
 * parallel, sehen beide dasselbe freie Kontingent, und das Budget wird
 * ueberzogen. Dasselbe gilt fuer den Sendeabstand: Telegram drosselt, und
 * gleichzeitige Sendungen laufen in dessen Rate-Limit.
 *
 * Der Fehler einer Aufgabe verstopft die Kette NICHT: Die naechste laeuft
 * trotzdem. Sonst risse ein einzelner Ausreisser die Meldungen des ganzen
 * Laufs mit -- dieselbe Regel, die `verarbeiteKandidatIsoliert` anwendet.
 */
export function serialisierer(): <T>(aufgabe: () => Promise<T>) => Promise<T> {
  // Die Kette haelt nur die REIHENFOLGE fest, nie ein Ergebnis und nie einen
  // Fehler: `catch(() => {})` sorgt dafuer, dass ein Fehlschlag die Kette
  // nicht vergiftet. Der Aufrufer bekommt seinen Fehler trotzdem -- er haengt
  // an dem Promise, das zurueckgegeben wird, nicht an der Kette.
  let kette: Promise<unknown> = Promise.resolve();
  return <T>(aufgabe: () => Promise<T>): Promise<T> => {
    const ergebnis = kette.then(aufgabe);
    kette = ergebnis.catch(() => {});
    return ergebnis;
  };
}

/**
 * Arbeitet eine Liste ab und laesst dabei hoechstens `breite` Eintraege
 * gleichzeitig laufen.
 *
 * EIN EINZELNER FEHLER BRICHT NICHTS AB. `Promise.all` waere hier falsch: Es
 * verwirft beim ersten Fehlschlag den Rest, und ein voruebergehender
 * Datenbankfehler bei einem Objekt duerfte niemals die uebrigen 599
 * mitnehmen. Der Aufrufer faengt seine Fehler selbst ab (so wie
 * `verarbeiteKandidatIsoliert` es tut); was hier durchkommt, wird still
 * geschluckt, damit die Schleife weiterlaeuft.
 *
 * DER RUECKWEG IST EINE ZAHL: `breite = 1` ergibt exakt das Verhalten einer
 * gewoehnlichen `for`-Schleife, Eintrag fuer Eintrag. Macht Nebenlaeufigkeit
 * im Betrieb Aerger, genuegt diese eine Aenderung.
 */
export async function inBloecken<T>(
  eintraege: readonly T[],
  breite: number,
  arbeit: (eintrag: T) => Promise<void>
): Promise<void> {
  if (eintraege.length === 0) return;
  const sichereBreite = Math.max(1, Math.floor(breite));
  // Ein gemeinsamer Zeiger statt fester Bloecke: So holt sich jeder Arbeiter
  // den naechsten freien Eintrag, sobald er fertig ist. Feste Bloecke wuerden
  // dagegen am langsamsten Eintrag jedes Blocks haengen bleiben.
  let naechster = 0;
  const arbeiter = Array.from({ length: Math.min(sichereBreite, eintraege.length) }, async () => {
    for (;;) {
      const index = naechster;
      naechster += 1;
      if (index >= eintraege.length) return;
      try {
        await arbeit(eintraege[index]);
      } catch {
        // Siehe Docstring: Der Aufrufer kapselt selbst. Hier wird nur
        // verhindert, dass ein Ausreisser die Schleife beendet.
      }
    }
  });
  await Promise.all(arbeiter);
}
