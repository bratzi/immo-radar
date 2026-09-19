/**
 * Die Karte aus N2 -- zwei Schichten, und beide sagen, was sie wert sind.
 *
 * DIE ENTWURFSFRAGE UND IHRE ANTWORT
 *
 * N2 verlangt die 16 Bundeslaender als Flaeche. Bundeslandgrenzen sind
 * Geodaten, und der Bau hatte keinen Netzzugang -- es gibt sie hier also
 * nicht. Drei Wege standen offen:
 *
 *   a) Grenzen aus den PLZ-Zweistellern naehern (Voronoi ueber 95 Punkte).
 *      VERWORFEN. Das Ergebnis saehe aus wie eine Landkarte und waere an
 *      jeder Grenze um Dutzende Kilometer falsch -- Berlin und Brandenburg
 *      etwa teilen sich Zweisteller. Eine Karte, die Genauigkeit behauptet,
 *      die sie nicht hat, ist genau der Fehler, den dieser Entwurf an drei
 *      anderen Stellen ablehnt.
 *   b) Eine reine Kachelmatrix (4x4) ohne Geografie. Ehrlich, aber sie wirft
 *      die echte Lage weg, die im Repo sehr wohl vorliegt.
 *   c) GEWAEHLT: ein ECHTER Deutschlandumriss als Grund, darauf 16
 *      SCHEMATISCHE Kacheln an abgeleiteten Ankerpunkten. Die Kachel ist
 *      sichtbar eine Marke und keine Flaeche -- niemand kann sie fuer eine
 *      Grenze halten -- aber sie liegt dort, wo das Land liegt. Und in
 *      derselben Zeichenflaeche, im selben Koordinatensystem, sitzen die
 *      echten Punkte der Objekte mit PLZ.
 *
 * Damit tragen beide Schichten genau die Genauigkeit, die ihre Daten decken:
 * die Kachel eine Landeszugehoerigkeit (100 % gedeckt), der Punkt eine
 * Ortsangabe (1,3 % gedeckt). Die Legende nennt diesen Unterschied dauerhaft
 * und aus den Daten gerechnet.
 *
 * Alle Koordinaten kommen aus `karte.generated.ts` und damit aus dem Repo;
 * das erzeugende Skript steht unter `web/scripts/`.
 */
import type { SnapshotBundesland, SnapshotObjekt } from "../daten/snapshot.ts";
import { BUNDESLAND_PUNKTE, PLZ_KOORDINATEN, UMRISS } from "./karte.generated.ts";

export { UMRISS, PLZ_KOORDINATEN, BUNDESLAND_PUNKTE };

// Der Kartenausschnitt -- dieselben Grenzen, die `zeichneDeutschlandkarte`
// (`scraper/lib/karte.ts`) fuer das Telegram-Kartenbild benutzt.
const LON_MIN = 5.6;
const LON_MAX = 15.4;
const LAT_MIN = 47.1;
const LAT_MAX = 55.1;

/**
 * Die Zeichenflaeche. Das Seitenverhaeltnis ist nicht gegriffen: Auf 51° Breite
 * ist ein Laengengrad rund 0,63 Breitengrade lang, die 9,8° Laenge sind also
 * rund 6,2 "Breitengrade" breit gegen 8,0 hoch. 360 x 464 trifft das auf ein
 * Prozent -- Deutschland erscheint dadurch weder gestaucht noch gestreckt.
 */
export const KARTE_BREITE = 360;
export const KARTE_HOEHE = 464;

export interface Punkt {
  x: number;
  y: number;
}

/** Laenge/Breite -> Bildkoordinate. Plattkarte, wie im Scraper. */
export function projiziere(lon: number, lat: number): Punkt {
  return {
    x: ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * KARTE_BREITE,
    y: ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * KARTE_HOEHE,
  };
}

/** Der Deutschlandumriss als SVG-Pfad. */
export function umrissPfad(): string {
  const punkte = UMRISS.map(([lon, lat]) => {
    const p = projiziere(lon, lat);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  });
  return `M${punkte.join("L")}Z`;
}

const KUERZEL: Readonly<Record<string, string>> = {
  "Baden-Württemberg": "BW",
  Bayern: "BY",
  Berlin: "BE",
  Brandenburg: "BB",
  Bremen: "HB",
  Hamburg: "HH",
  Hessen: "HE",
  "Mecklenburg-Vorpommern": "MV",
  Niedersachsen: "NI",
  "Nordrhein-Westfalen": "NW",
  "Rheinland-Pfalz": "RP",
  Saarland: "SL",
  Sachsen: "SN",
  "Sachsen-Anhalt": "ST",
  "Schleswig-Holstein": "SH",
  Thüringen: "TH",
};

const KACHEL_BREITE = 34;
const KACHEL_HOEHE = 24;

/**
 * Handversatz einzelner Kacheln, in Bildpunkten.
 *
 * NUR WO ES SEIN MUSS, und jeder Eintrag ist begruendet. Wo eine Kachel
 * versetzt ist, zieht die Karte eine duenne Linie zu ihrem Ankerpunkt -- die
 * Verschiebung wird gezeigt, nicht verschwiegen.
 *
 * - **Berlin**: Der PLZ-gewichtete Punkt Brandenburgs liegt nur rund 13 px
 *   von Berlins entfernt (Brandenburg umschliesst Berlin, sein Mittel wird
 *   dadurch nach Osten gezogen). Berlin weicht nach Nordosten aus.
 * - **Hamburg**: liegt fast genau unter Schleswig-Holstein; 26 px nach Osten
 *   schaffen Luft, ohne die Lage zu verfaelschen.
 */
const VERSATZ: Readonly<Record<string, readonly [number, number]>> = {
  Berlin: [30, -26],
  Hamburg: [26, 2],
};

export interface KachelLage {
  name: string;
  kuerzel: string;
  /** Mittelpunkt der Kachel. */
  x: number;
  y: number;
  /** Der abgeleitete Ankerpunkt des Landes -- bei Versatz nicht gleich x/y. */
  ankerX: number;
  ankerY: number;
  versetzt: boolean;
  breite: number;
  hoehe: number;
}

/** Die 16 Kachellagen, fertig gerechnet. */
export function kachelLagen(): KachelLage[] {
  return BUNDESLAND_PUNKTE.map((land) => {
    const anker = projiziere(land.lon, land.lat);
    const versatz = VERSATZ[land.name] ?? [0, 0];
    // Innerhalb der Zeichenflaeche halten -- sonst schneidet der Rand eine
    // Kachel an und das Kuerzel wird unlesbar.
    const halbeBreite = KACHEL_BREITE / 2;
    const halbeHoehe = KACHEL_HOEHE / 2;
    const x = Math.min(
      KARTE_BREITE - halbeBreite,
      Math.max(halbeBreite, anker.x + versatz[0])
    );
    const y = Math.min(KARTE_HOEHE - halbeHoehe, Math.max(halbeHoehe, anker.y + versatz[1]));
    return {
      name: land.name,
      kuerzel: KUERZEL[land.name] ?? "??",
      x,
      y,
      ankerX: anker.x,
      ankerY: anker.y,
      versetzt: versatz[0] !== 0 || versatz[1] !== 0,
      breite: KACHEL_BREITE,
      hoehe: KACHEL_HOEHE,
    };
  });
}

export interface PlzPunkt {
  zweisteller: string;
  x: number;
  y: number;
  anzahl: number;
  topTreffer: number;
}

/** Der PLZ-Zweisteller, zu dem es eine Koordinate gibt -- sonst `null`. */
export function zweistellerMitKoordinate(plz: string | null): string | null {
  if (plz === null) return null;
  const treffer = plz.trim().match(/^(\d{2})\d{3}$/);
  if (treffer === null) return null;
  const zweisteller = treffer[1]!;
  return PLZ_KOORDINATEN[zweisteller] === undefined ? null : zweisteller;
}

/**
 * Die Punktschicht: je PLZ-Zweisteller ein Punkt mit der Zahl der Objekte.
 *
 * Bewusst geBUENDELT und nicht ein Punkt je Objekt: Die Koordinate ist der
 * Mittelpunkt eines Zweistellerbereichs, also fuer alle Objekte darin
 * DIESELBE. 40 Punkte uebereinander zu zeichnen behauptete 40 Orte, wo es
 * einen gibt. Ein Punkt mit der Zahl daneben sagt genau, was bekannt ist.
 */
export function buendlePlzPunkte(objekte: readonly SnapshotObjekt[]): PlzPunkt[] {
  const jeZweisteller = new Map<string, { anzahl: number; topTreffer: number }>();
  for (const objekt of objekte) {
    const zweisteller = zweistellerMitKoordinate(objekt.plz);
    if (zweisteller === null) continue;
    const eintrag = jeZweisteller.get(zweisteller) ?? { anzahl: 0, topTreffer: 0 };
    eintrag.anzahl += 1;
    if (objekt.trefferklasse === "top") eintrag.topTreffer += 1;
    jeZweisteller.set(zweisteller, eintrag);
  }

  return [...jeZweisteller.entries()]
    .map(([zweisteller, eintrag]) => {
      const koordinate = PLZ_KOORDINATEN[zweisteller]!;
      const p = projiziere(koordinate[0], koordinate[1]);
      return { zweisteller, x: p.x, y: p.y, ...eintrag };
    })
    .sort((a, b) => b.anzahl - a.anzahl);
}

export interface Abdeckung {
  gesamt: number;
  /** Objekte, die WIRKLICH einen Punkt bekommen -- PLZ und Koordinate dazu. */
  mitPlz: number;
  mitBundesland: number;
  ohneOrtsangabe: number;
}

/**
 * Die Zahlen der Kartenlegende, aus den Daten gerechnet und nie
 * festgeschrieben (N2). `mitPlz` zaehlt nur, was tatsaechlich einen Punkt
 * bekommt: Eine PLZ, zu der die Tabelle keine Koordinate kennt, ist nicht
 * "punktgenau verortbar", auch wenn sie im Feld steht.
 */
export function berechneAbdeckung(objekte: readonly SnapshotObjekt[]): Abdeckung {
  let mitPlz = 0;
  let mitBundesland = 0;
  for (const objekt of objekte) {
    if (zweistellerMitKoordinate(objekt.plz) !== null) mitPlz += 1;
    if (objekt.bundesland !== null) mitBundesland += 1;
  }
  return {
    gesamt: objekte.length,
    mitPlz,
    mitBundesland,
    ohneOrtsangabe: objekte.length - mitBundesland,
  };
}

/** Die umschaltbaren Groessen der Flaechenfaerbung (N2). */
export type Kartengroesse = "objekte" | "topTreffer" | "medianDscr";

export const KARTENGROESSE_NAMEN: Readonly<Record<Kartengroesse, string>> = {
  objekte: "Objekte",
  topTreffer: "Top-Treffer",
  medianDscr: "Median-DSCR",
};

export function werteDerGroesse(
  land: SnapshotBundesland,
  groesse: Kartengroesse
): number | null {
  return groesse === "medianDscr" ? land.medianDscr : land[groesse];
}

/**
 * Die Spanne der Farbskala. `null`-Werte spannen NICHT mit -- ein Land ohne
 * Median-DSCR ist kein Land mit Median 0, und es wuerde die Skala nach unten
 * aufziehen, bis alle anderen Laender gleich aussehen.
 */
export function spanneDerGroesse(
  laender: readonly SnapshotBundesland[],
  groesse: Kartengroesse
): { min: number; max: number } | null {
  const werte: number[] = [];
  for (const land of laender) {
    const wert = werteDerGroesse(land, groesse);
    if (wert !== null && Number.isFinite(wert)) werte.push(wert);
  }
  if (werte.length === 0) return null;
  return { min: Math.min(...werte), max: Math.max(...werte) };
}
