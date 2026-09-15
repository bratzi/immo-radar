/**
 * Die Gliederung der Seite (Nachtrag N1) und die Ordnung innerhalb jedes
 * Bereichs (Entwurf 3.5, 3.7, 6.4).
 *
 * Reine Funktionen, keine React-Abhaengigkeit, keine Uhr von sich aus --
 * `jetzt` kommt herein wie in `snapshot.ts` des Exports.
 *
 * WAS HIER NICHT GESCHIEHT: Es wird keine Schwelle nachgerechnet. Welche
 * Trefferklasse ein Objekt traegt, hat `bestimmeTrefferklasse` (N1.1) im
 * Export entschieden; hier wird sie nur gelesen. Entwurf 5.3, Punkt 4.
 */
import { KARENZ_TAGE, type SnapshotObjekt } from "../daten/snapshot.ts";

const MS_PRO_TAG = 24 * 60 * 60 * 1000;

/** Die vier sichtbaren Bereiche: drei aus N1, plus die Abgaenge aus 6.4. */
export type Bereich = "top" | "normal" | "nichtBeurteilbar" | "abgaenge";

export interface Gliederung {
  top: SnapshotObjekt[];
  normal: SnapshotObjekt[];
  nichtBeurteilbar: SnapshotObjekt[];
  abgaenge: SnapshotObjekt[];
}

/**
 * Ist die Karenz nach einem Abgang vorbei?
 *
 * FAIL-CLOSED: Ein unlesbares `abgaengigSeit` heisst "Karenz vorbei" und
 * nicht "kein Abgang". Ein Objekt, dessen Abgangsdatum kaputt ist, darf nicht
 * still in die Rangliste kaufbarer Objekte zurueckrutschen -- dieselbe Regel,
 * mit der `waehleJuengsteVersionen` eine unlesbare Zeit behandelt.
 */
function karenzVorbei(abgaengigSeit: string, jetzt: Date): boolean {
  const zeit = Date.parse(abgaengigSeit);
  if (!Number.isFinite(zeit)) return true;
  return jetzt.getTime() - zeit > KARENZ_TAGE * MS_PRO_TAG;
}

/**
 * In welchen Bereich ein Objekt gehoert.
 *
 * Die Reihenfolge der Pruefung ist die Aussage: Erst die Karenzgrenze aus
 * 6.4, dann die Trefferklasse aus N1. WAEHREND der Karenz bleibt ein
 * abgaengiges Objekt an seiner Rangposition (ausgegraut) -- ein Rueckkehrer
 * hebt die Markierung ohne vollstaendigen Sweep wieder auf
 * (`ermittleRueckkehrer`). Erst danach verlaesst es die Rangliste.
 */
export function bestimmeBereich(objekt: SnapshotObjekt, jetzt: Date): Bereich {
  if (objekt.abgaengigSeit !== null && karenzVorbei(objekt.abgaengigSeit, jetzt)) {
    return "abgaenge";
  }
  return objekt.trefferklasse;
}

/**
 * Wonach innerhalb einer Rangliste sortiert wird: die UNTERE Bandkante (3.5).
 *
 * "Ein Objekt steigt nur, wenn es auch dann noch gut ist, wenn die Schaetzung
 * gegen es laeuft." Weil die Bandbreite je Bundesland verschieden ist (3.4),
 * ist das keine gleichfoermige Streckung: Breite Unschaerfe ist eine
 * Zurueckstufung, keine neutrale Eigenschaft.
 *
 * Ohne Band (S3) zaehlt der Punktwert -- bei belegter Miete gibt es keine
 * Schaetzung, die gegen das Objekt laufen koennte. Ohne Kennzahl gibt es
 * `null` zurueck und NICHT 0: Eine 0 waere ein Urteil (3.7).
 */
export function sortierschluessel(objekt: SnapshotObjekt): number | null {
  if (objekt.band !== null) return objekt.band.unten;
  return objekt.rangzahl;
}

/**
 * Absteigend nach Schluessel. `null` steht IMMER hinten, unabhaengig von der
 * Sortierrichtung -- ein Objekt ohne Kennzahl bekommt keinen Rangplatz, es
 * bekommt nur einen Platz in der Ausgabe.
 */
function absteigend(
  objekte: SnapshotObjekt[],
  schluessel: (o: SnapshotObjekt) => number | null
): SnapshotObjekt[] {
  // Schluessel einmal je Objekt berechnen (Schwartz'sche Transformation) und
  // den Eingabeindex mitfuehren: `Array.prototype.sort` ist in modernen
  // Laufzeiten zwar stabil, aber bei 18.000 Objekten soll die Ordnung nicht
  // an einer Zusicherung der Laufzeit haengen.
  return objekte
    .map((objekt, index) => ({ objekt, index, wert: schluessel(objekt) }))
    .sort((a, b) => {
      if (a.wert === null && b.wert === null) return a.index - b.index;
      if (a.wert === null) return 1;
      if (b.wert === null) return -1;
      if (a.wert !== b.wert) return b.wert - a.wert;
      return a.index - b.index;
    })
    .map((eintrag) => eintrag.objekt);
}

/** Zeitstempel als Zahl; unlesbar und fehlend zaehlen als aeltestmoeglich. */
function zeitOderNull(text: string | null): number | null {
  if (text === null) return null;
  const zeit = Date.parse(text);
  return Number.isFinite(zeit) ? zeit : null;
}

/**
 * Teilt die Objekte auf die vier Bereiche auf und ordnet jeden nach SEINER
 * eigenen Groesse:
 *
 * | Bereich | Ordnung | Begruendung |
 * |---|---|---|
 * | Top-Treffer | untere Bandkante, absteigend | 3.5 |
 * | Normale Treffer | untere Bandkante, absteigend | 3.5 |
 * | Nicht beurteilbar | zuletzt gesehen, absteigend | 3.7 -- sie tragen keine Kennzahl, nach der man sie ordnen koennte |
 * | Abgaenge | Abgangsdatum, absteigend | 6.4 |
 */
export function gliedere(objekte: SnapshotObjekt[], jetzt: Date): Gliederung {
  const top: SnapshotObjekt[] = [];
  const normal: SnapshotObjekt[] = [];
  const nichtBeurteilbar: SnapshotObjekt[] = [];
  const abgaenge: SnapshotObjekt[] = [];

  for (const objekt of objekte) {
    switch (bestimmeBereich(objekt, jetzt)) {
      case "top":
        top.push(objekt);
        break;
      case "normal":
        normal.push(objekt);
        break;
      case "nichtBeurteilbar":
        nichtBeurteilbar.push(objekt);
        break;
      case "abgaenge":
        abgaenge.push(objekt);
        break;
    }
  }

  return {
    top: absteigend(top, sortierschluessel),
    normal: absteigend(normal, sortierschluessel),
    nichtBeurteilbar: absteigend(nichtBeurteilbar, (o) => zeitOderNull(o.zuletztGesehen)),
    abgaenge: absteigend(abgaenge, (o) => zeitOderNull(o.abgaengigSeit)),
  };
}
