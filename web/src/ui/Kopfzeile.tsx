/**
 * Der Kopf der Seite (Entwurf 3.9).
 *
 * "Eine Zeile, aus den Daten gerechnet, in Worten statt in Balken." Alle
 * Zahlen entstehen zur Anzeigezeit und stehen nirgends im Text: Zwischen dem
 * 2026-09-08 und dem 2026-09-12 sind aus "2 Objekten mit belegter Miete" 1
 * geworden und aus 83 % 98 %.
 *
 * ---------------------------------------------------------------------------
 * DAS WORT "TOP-TREFFER" HAT HIER GENAU EINE BEDEUTUNG
 * ---------------------------------------------------------------------------
 *
 * Entwurf 3.9 formuliert die Kopfzeile als "0 Top-Treffer seit dem
 * 2026-09-07" und meint damit die MELDEKLASSE aus `bestimmeMeldeklasse`, die
 * geschaetzte Mieten grundsaetzlich herunterstuft. Der Export meldet dagegen
 * 811 Objekte der TREFFERKLASSE `top` nach N1.1. Beide Zahlen sind richtig
 * und messen Verschiedenes.
 *
 * ENTSCHEIDUNG (vom Auftraggeber dieses Schritts gefaellt): Im Dashboard
 * heisst "Top-Treffer" ausschliesslich die Trefferklasse nach N1.1. Die
 * Kopfzeile darf das Wort deshalb nicht in der anderen Bedeutung benutzen.
 * Ein Wort mit zwei Bedeutungen auf derselben Seite ist genau das
 * Zwei-Staende-Problem, das dieses Projekt schon zweimal teuer korrigiert hat.
 *
 * WAS DARAUS FOLGT, und das ist eine Entscheidung, die hier getroffen wurde:
 * Die vorgeschlagene Ersatzformulierung ("seit dem ... wurde keine Meldung der
 * hoechsten Stufe verschickt") steht NICHT in der Kopfzeile, weil der
 * Snapshot diese Zahl nicht traegt. `topTrefferSeit` ist ausweislich des
 * Exports das aelteste `first_seen`, also der BEGINN DES BEOBACHTUNGSFENSTERS
 * -- keine Aussage ueber verschickte Meldungen. Ueber Meldungen sagt der Kopf
 * deshalb nur etwas, wenn `betrieb.meldebudget` belegt ist (ein Export
 * innerhalb eines Laufs); sonst schweigt er. Eine Aussage ohne Zahl waere
 * hier schlimmer als keine.
 */
import type { Snapshot } from "../daten/snapshot.ts";
import {
  formatiereAnzahl,
  formatiereDatum,
  formatiereDatumZeit,
  formatiereProzent,
} from "../logik/formate.ts";

interface Eigenschaften {
  snapshot: Snapshot;
  topAnzahl: number;
}

export function Kopfzeile({ snapshot, topAnzahl }: Eigenschaften) {
  const { kopfzeile, betrieb } = snapshot;
  const budget = betrieb.meldebudget;

  return (
    <header className="kopf">
      <div className="marke">
        <h1 className="marke__name">
          immo<em>·</em>radar
        </h1>
        <span className="marke__stand">
          Stand {formatiereDatumZeit(snapshot.erzeugtAm)}
          {snapshot.lauf.id !== null && ` · Lauf ${snapshot.lauf.id}`}
        </span>
      </div>

      <p className="kopfzeile">
        <span className="kopfzeile__satz">
          <b>{formatiereAnzahl(kopfzeile.mitBelegterMiete)}</b>
          {kopfzeile.mitBelegterMiete === 1 ? " Objekt trägt" : " Objekte tragen"} eine{" "}
          <b>belegte</b> Miete — von <b>{formatiereAnzahl(kopfzeile.objekteGesamt)}</b>.{" "}
          <b>{formatiereProzent(kopfzeile.anteilBundeslandgenau, 1)}</b> aller Bewertungen
          beruhen auf einer bundeslandweiten Mietschätzung.
        </span>{" "}
        <span className="kopfzeile__satz">
          Beobachtet wird seit dem <b>{formatiereDatum(kopfzeile.topTrefferSeit)}</b>; älter als
          dieses Datum ist keine Aussage auf dieser Seite.
        </span>{" "}
        <span className="kopfzeile__satz">
          <b className="gold">{formatiereAnzahl(topAnzahl)} Top-Treffer</b> halten die
          Meldeschwelle auch an der unteren Bandkante.
        </span>
        {budget !== null && (
          <>
            {" "}
            <span className="kopfzeile__satz">
              Der letzte Lauf hat <b>{formatiereAnzahl(budget.gesendet)}</b> von höchstens{" "}
              <b>{formatiereAnzahl(budget.hoechstens)}</b> Meldungen verschickt,{" "}
              <b>{formatiereAnzahl(budget.zurueckgestellt)}</b> zurückgestellt.
            </span>
          </>
        )}
      </p>

      <p className="worterklaerung">
        <b>„Top-Treffer“ heißt auf dieser Seite genau eine Sache:</b> Das Objekt hält die
        Meldeschwelle <b>auch dann noch</b>, wenn die Mietschätzung gegen es läuft — also an der
        unteren Bandkante, nicht nur im Mittelwert (N1.1). Weil im Bestand fast nur geschätzte
        Mieten stehen, besteht dieser Bereich überwiegend aus S1-Objekten mit Band; das Abzeichen
        an jedem Objekt sagt das. Die <b>Meldeklasse</b> des Telegram-Wegs ist eine andere Größe
        und kommt auf dieser Seite nicht vor.
      </p>
    </header>
  );
}
