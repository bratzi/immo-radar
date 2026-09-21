/**
 * Die Filter aus N3 -- und NUR die.
 *
 * Jede Zeile der Tabelle in N3 ist gegen eine vorhandene Spalte geprueft.
 * Was dort nicht steht, steht auch hier nicht; insbesondere gibt es
 * ABSICHTLICH KEINEN ZIMMERZAHL-FILTER. Die Zimmerzahl steht im Titel
 * ("8 Zimmer, 226,4 m²"), aber in keiner Spalte. Sie zur Anzeigezeit aus dem
 * Titel zu raten wuerde jeden Titel ohne Zimmerangabe als "0 Zimmer"
 * filterbar machen -- genau die stille Null, die dieses Projekt ueberall
 * sonst verhindert.
 *
 * Reine Funktionen, ohne React und ohne Uhr.
 */
import type {
  Sicherheitsstufe,
  SnapshotObjekt,
  Verfuegbarkeitszustand,
} from "../daten/snapshot.ts";
import { zweistellerMitKoordinate } from "./karte.ts";

/**
 * Merkwert fuer die Kategorie "Objekte ohne Region" (E-7).
 *
 * DIE ENTSCHEIDUNG DES NUTZERS vom 2026-09-13 lautet woertlich: eine
 * **eigene, ausdruecklich beschriftete Kategorie**, nicht in einen anderen
 * Bereich einsortiert.
 *
 * WAS ER BEHEBT: `bundesland` ist `string | null`, und bis zum 2026-09-20
 * fiel jedes Objekt mit `null` heraus, sobald irgendein Bundesland gewaehlt
 * war -- ein Klick auf die Karte liess sie verschwinden, und es gab keinen
 * Weg zurueck. Gemessen am 2026-09-20 sind das 35 Objekte.
 *
 * WARUM IM FELD `bundeslaender` und nicht in einem eigenen: So erbt die
 * Kategorie Zuruecksetzen, Zaehler und `istFilterAktiv`, ohne dass eine
 * einzige Stelle davon wissen muss. Auf der Karte trifft der Merkwert auf
 * keine Kachel und wird dort schlicht nicht gefunden -- das ist richtig so,
 * denn ein Objekt ohne Region hat keinen Ort, und eine Kachel dafuer waere
 * eine Behauptung ueber seine Lage.
 *
 * Der Wert ist bewusst kein Bundeslandname und kollidiert daher mit keinem.
 */
export const OHNE_REGION = "ohne-region";

export interface Filter {
  /** Bundeslandnamen, dazu ggf. `OHNE_REGION`. */
  bundeslaender: string[];
  /** PLZ-Zweisteller, gewaehlt ueber einen Klick auf die Karte. */
  plzZweisteller: string[];
  quellen: string[];
  stufen: Sicherheitsstufe[];
  zustaende: Verfuegbarkeitszustand[];
  datenluecken: string[];

  kaufpreisVon: number | null;
  kaufpreisBis: number | null;
  wohnflaecheVon: number | null;
  wohnflaecheBis: number | null;
  grundstueckVon: number | null;
  grundstueckBis: number | null;
  baujahrVon: number | null;
  baujahrBis: number | null;
  einheitenVon: number | null;
  einheitenBis: number | null;

  nurUeberMeldeschwelle: boolean;
  nurPreissenkungen: boolean;
  nurSchwellenwechsler: boolean;

  terminNur: boolean;
  terminVon: string | null;
  terminBis: string | null;
}

export const LEERER_FILTER: Filter = {
  bundeslaender: [],
  plzZweisteller: [],
  quellen: [],
  stufen: [],
  zustaende: [],
  datenluecken: [],
  kaufpreisVon: null,
  kaufpreisBis: null,
  wohnflaecheVon: null,
  wohnflaecheBis: null,
  grundstueckVon: null,
  grundstueckBis: null,
  baujahrVon: null,
  baujahrBis: null,
  einheitenVon: null,
  einheitenBis: null,
  nurUeberMeldeschwelle: false,
  nurPreissenkungen: false,
  nurSchwellenwechsler: false,
  terminNur: false,
  terminVon: null,
  terminBis: null,
};

/** Traegt der Filter ueberhaupt eine Einschraenkung? */
export function istFilterAktiv(filter: Filter): boolean {
  return (
    filter.bundeslaender.length > 0 ||
    filter.plzZweisteller.length > 0 ||
    filter.quellen.length > 0 ||
    filter.stufen.length > 0 ||
    filter.zustaende.length > 0 ||
    filter.datenluecken.length > 0 ||
    filter.kaufpreisVon !== null ||
    filter.kaufpreisBis !== null ||
    filter.wohnflaecheVon !== null ||
    filter.wohnflaecheBis !== null ||
    filter.grundstueckVon !== null ||
    filter.grundstueckBis !== null ||
    filter.baujahrVon !== null ||
    filter.baujahrBis !== null ||
    filter.einheitenVon !== null ||
    filter.einheitenBis !== null ||
    filter.nurUeberMeldeschwelle ||
    filter.nurPreissenkungen ||
    filter.nurSchwellenwechsler ||
    filter.terminNur ||
    filter.terminVon !== null ||
    filter.terminBis !== null
  );
}

/**
 * Eine Spanne. DIE ENTSCHEIDENDE ZEILE IST DIE ERSTE:
 *
 * Ist die Spanne gesetzt und traegt das Objekt keinen Wert, faellt es HERAUS.
 * Es wird weder stillschweigend eingeschlossen (dann filterte die Spanne
 * nichts) noch als 0 behandelt (das waere eine erfundene Angabe).
 *
 * Das ist keine Kosmetik, sondern der Leitsatz auf die Filter angewendet:
 * `baujahr` traegt heute 58 von 18.335 Objekten (0,3 %), `einheiten` 99
 * (0,5 %). Ein Baujahrfilter blendet also praktisch den ganzen Bestand aus.
 * Damit das niemanden ueberrascht, nennt die Oberflaeche neben jedem
 * Spannenfeld die Zahl aus `zaehleOhneAngabe` -- die Regel ist hart, aber
 * sie ist angeschrieben.
 */
function inSpanne(wert: number | null, von: number | null, bis: number | null): boolean {
  if (von === null && bis === null) return true;
  if (wert === null) return false;
  if (von !== null && wert < von) return false;
  if (bis !== null && wert > bis) return false;
  return true;
}

/** Eine Auswahl. Leere Auswahl heisst "keine Einschraenkung", nicht "nichts". */
/**
 * Wie `inAuswahl`, aber mit einer Antwort auf `null`: Ein Objekt ohne Region
 * gehoert der Kategorie `OHNE_REGION` und sonst keiner.
 *
 * `inAuswahl` laesst `null` immer herausfallen, sobald gefiltert wird -- fuer
 * jedes andere Feld ist das richtig (ein Objekt ohne Quelle gehoert zu keiner
 * Quelle), fuer das Bundesland ist es der Fehler, den E-7 benennt.
 */
export function inBundeslandAuswahl(
  bundesland: string | null,
  auswahl: readonly string[]
): boolean {
  if (auswahl.length === 0) return true;
  if (bundesland === null) return auswahl.includes(OHNE_REGION);
  return auswahl.includes(bundesland);
}

function inAuswahl(wert: string | null, auswahl: readonly string[]): boolean {
  if (auswahl.length === 0) return true;
  if (wert === null) return false;
  return auswahl.includes(wert);
}

/**
 * Terminspanne. Ein unlesbarer Termin faellt heraus, sobald gefiltert wird --
 * nie durch. Eine reine Tagesangabe ("2026-10-01") wird als Tagesbeginn
 * gelesen; `terminBis` schliesst deshalb den ganzen genannten Tag ein.
 */
function inTerminSpanne(termin: string | null, von: string | null, bis: string | null): boolean {
  if (von === null && bis === null) return true;
  if (termin === null) return false;
  const zeit = Date.parse(termin);
  if (!Number.isFinite(zeit)) return false;
  if (von !== null) {
    const vonZeit = Date.parse(von);
    if (Number.isFinite(vonZeit) && zeit < vonZeit) return false;
  }
  if (bis !== null) {
    const bisZeit = Date.parse(bis);
    // Ganzer Tag: "bis 01.10." schliesst den 01.10. ein.
    if (Number.isFinite(bisZeit) && zeit >= bisZeit + 24 * 60 * 60 * 1000) return false;
  }
  return true;
}

function hatEineDerLuecken(objekt: SnapshotObjekt, gewaehlt: readonly string[]): boolean {
  if (gewaehlt.length === 0) return true;
  return objekt.datenluecken.some((luecke) => gewaehlt.includes(luecke));
}

/**
 * Wendet den Filter an. Innerhalb eines Feldes ODER, zwischen den Feldern UND.
 *
 * "Nur ueber der Meldeschwelle" liest die TREFFERKLASSE und rechnet die
 * Schwelle nicht nach: Nach N1.1 haelt ein Top-Treffer die Schwelle auch an
 * der unteren Bandkante, und diese Entscheidung ist im Export gefallen.
 */
export function wendeFilterAn(objekte: SnapshotObjekt[], filter: Filter): SnapshotObjekt[] {
  return objekte.filter((objekt) => {
    if (!inBundeslandAuswahl(objekt.bundesland, filter.bundeslaender)) return false;

    // Nur bei gesetztem Filter rechnen: Der Zweisteller wird sonst je Objekt bei
    // JEDER Filteraenderung per Regex herausgeschnitten.
    if (
      filter.plzZweisteller.length > 0 &&
      !inAuswahl(zweistellerMitKoordinate(objekt.plz), filter.plzZweisteller)
    ) {
      return false;
    }

    if (!inAuswahl(objekt.quelle, filter.quellen)) return false;
    if (!inAuswahl(objekt.stufe, filter.stufen)) return false;
    if (!inAuswahl(objekt.zustand, filter.zustaende)) return false;
    if (!hatEineDerLuecken(objekt, filter.datenluecken)) return false;

    if (!inSpanne(objekt.kaufpreisEuro, filter.kaufpreisVon, filter.kaufpreisBis)) return false;
    if (!inSpanne(objekt.wohnflaecheM2, filter.wohnflaecheVon, filter.wohnflaecheBis)) return false;
    if (!inSpanne(objekt.grundstueckM2, filter.grundstueckVon, filter.grundstueckBis)) return false;
    if (!inSpanne(objekt.baujahr, filter.baujahrVon, filter.baujahrBis)) return false;
    if (!inSpanne(objekt.einheiten, filter.einheitenVon, filter.einheitenBis)) return false;

    if (filter.nurUeberMeldeschwelle && objekt.trefferklasse !== "top") return false;
    if (filter.nurPreissenkungen && !objekt.preisGesenkt) return false;
    if (filter.nurSchwellenwechsler && !objekt.istSchwellenwechsler) return false;

    if (filter.terminNur && objekt.termin === null) return false;
    if (!inTerminSpanne(objekt.termin, filter.terminVon, filter.terminBis)) return false;

    return true;
  });
}

export interface OhneAngabe {
  kaufpreis: number;
  wohnflaeche: number;
  grundstueck: number;
  baujahr: number;
  einheiten: number;
  plz: number;
}

/**
 * Wie viele Objekte je Spannenfeld ueberhaupt keinen Wert tragen -- also wie
 * viele ein Filter auf dieses Feld ausblenden WUERDE, bevor er irgendetwas
 * einschraenkt. Steht in der Oberflaeche direkt am Feld.
 *
 * `plz` zaehlt, wie viele Objekte ein Klick auf einen Kartenpunkt ausblenden wuerde.
 */
export function zaehleOhneAngabe(objekte: SnapshotObjekt[]): OhneAngabe {
  const zaehler: OhneAngabe = {
    kaufpreis: 0,
    wohnflaeche: 0,
    grundstueck: 0,
    baujahr: 0,
    einheiten: 0,
    plz: 0,
  };
  for (const objekt of objekte) {
    if (objekt.kaufpreisEuro === null) zaehler.kaufpreis += 1;
    if (objekt.wohnflaecheM2 === null) zaehler.wohnflaeche += 1;
    if (objekt.grundstueckM2 === null) zaehler.grundstueck += 1;
    if (objekt.baujahr === null) zaehler.baujahr += 1;
    if (objekt.einheiten === null) zaehler.einheiten += 1;
    if (zweistellerMitKoordinate(objekt.plz) === null) zaehler.plz += 1;
  }
  return zaehler;
}

/** Ein Eintrag rein, wenn er fehlt -- raus, wenn er schon drin ist. */
export function schalteEintrag<T>(liste: readonly T[], eintrag: T): T[] {
  return liste.includes(eintrag) ? liste.filter((e) => e !== eintrag) : [...liste, eintrag];
}
