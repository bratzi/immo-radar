/**
 * Sicherheitsstufen fuer die Rangliste, nach Abschnitt 3.3 des
 * Dashboard-Entwurfs (docs/superpowers/specs/2026-09-09-dashboard-entwurf.md).
 *
 * Reine Funktion: kein Supabase, kein Netz, kein `console`. Zeit kommt nur
 * indirekt herein, ueber `berechneKennzahlen` (metrics.ts liest dort
 * `new Date().getFullYear()` fuer den Instandhaltungssatz) -- diese Datei
 * selbst liest die Uhr nirgends direkt.
 */

import { berechneKennzahlen, DSCR_MELDESCHWELLE, type KennzahlenInput } from "./metrics.js";
import {
  mietSpanneFuerBundesland,
  mietSpanneBundesweit,
  REGIONALE_SPANNE_S2,
  type MietSpanne,
} from "./rentEstimate.js";

export type Sicherheitsstufe = "S3" | "S2" | "S1" | "S0";

/**
 * Lueckencodes, die eine Kennzahl ohne Grundlage anzeigen -- nicht nur eine
 * schlechte Kennzahl. Jede der drei heisst "die Kennzahl hat keine
 * Grundlage": `wohnflaeche_fehlt` (Miete/Rendite faellt auf 0),
 * `preis_miete_unvereinbar` (Preis oder Miete ist falsch),
 * `rent_estimate_unreliable` (die Vermietbarkeits-Annahme traegt nicht).
 */
const S0_LUECKEN = ["wohnflaeche_fehlt", "preis_miete_unvereinbar", "rent_estimate_unreliable"] as const;

/**
 * Bestimmt die Sicherheitsstufe eines Objekts. S0 wird zuerst geprueft und
 * sticht jede andere Stufe, auch eine angegebene Miete: Eine belegte Miete
 * soll nicht ueber eine Datenluecke gewinnen koennen.
 *
 * `livingAreaM2 <= 0` (also auch `null`) zaehlt unabhaengig von `dataGaps`
 * als S0. Grund: `wohnflaeche_fehlt` ist eine Ableitung des Feldes
 * `living_area_m2` und wurde erst am 2026-09-08 eingefuehrt -- Objekte mit
 * einer aelteren Version tragen die Luecke nicht, obwohl ihnen die Flaeche
 * fehlt. Wuerde die Stufe nur an der Luecke haengen, datierte die Rangliste
 * auf den Tag, an dem ein Objekt zuletzt gescannt wurde, statt auf den
 * tatsaechlichen Zustand des Feldes.
 *
 * `rentSource` wird gegen eine **Aufzaehlung** geprueft, nicht gegen eine
 * Restmenge: Abschnitt 3.3 definiert S1 als
 * `rent_source ∈ {'geschaetzt_bundesland', 'geschaetzt_bundesweit'}`, S2 und
 * S3 je einen einzelnen Wert. Ein Wert ausserhalb dieser vier -- `null`
 * oder ein unbekannter String -- faellt deshalb bewusst auf S0, nicht auf
 * S1: "Wer nicht urteilen kann, loescht nicht" (docs/superpowers/BACKLOG.md)
 * gilt auch fuer die Rangliste. Ein unbekannter Zustand heisst "nicht
 * beurteilbar", nie "vermutlich bundeslandgenau geschaetzt" -- alles andere
 * verwandelte Nichtwissen in eine Behauptung, und genau das nennt Abschnitt
 * 3.7 des Entwurfs den gefaehrlichsten Fall fuer ein Ranking-Dashboard.
 */
export function bestimmeSicherheitsstufe(objekt: {
  rentSource: string | null;
  dataGaps: string[];
  livingAreaM2: number | null;
}): Sicherheitsstufe {
  const hatS0Luecke = objekt.dataGaps.some((luecke) =>
    (S0_LUECKEN as readonly string[]).includes(luecke)
  );
  const flaecheFehlt = objekt.livingAreaM2 === null || objekt.livingAreaM2 <= 0;

  if (hatS0Luecke || flaecheFehlt) {
    return "S0";
  }

  if (objekt.rentSource === "angegeben") {
    return "S3";
  }

  if (objekt.rentSource === "geschaetzt_regional") {
    return "S2";
  }

  if (objekt.rentSource === "geschaetzt_bundesland" || objekt.rentSource === "geschaetzt_bundesweit") {
    return "S1";
  }

  return "S0";
}

/** Der vierte Weg nach S0: eine Mietquelle ausserhalb der Aufzaehlung in
 *  Entwurf 3.3. Kein `data_gaps`-Eintrag traegt ihn, er entsteht erst hier. */
export const LUECKE_MIETQUELLE_UNBEKANNT = "mietquelle_unbekannt";

/**
 * Die Lueckencodes, die die S0-Einstufung TRAGEN -- fuer jede andere Stufe
 * leer.
 *
 * WARUM HIER UND NICHT IM EXPORT: `bestimmeSicherheitsstufe` ist die einzige
 * Stelle, die ueber S0 entscheidet, und sie kennt den Grund in dem Moment, in
 * dem sie ihn anwendet. Aus `livingAreaM2 === null` im Export oder gar in der
 * Oberflaeche einen Grund abzuleiten waere eine zweite Kopie derselben Regel
 * (Entwurf 5.3, Punkt 4) -- genau die Dopplung, die A17 beseitigt hat.
 *
 * DIE ZUSAGE: Jedes S0-Objekt bekommt mindestens einen Grund. Entwurf 3.7
 * verlangt ihn ("an der Stelle steht der Grund im Klartext"), und eine leere
 * Zelle saehe aus wie "geprueft und nichts gefunden" -- also wie ein Urteil.
 * Ein Test nagelt das ueber alle vier Wege nach S0 fest.
 */
export function s0Gruende(objekt: {
  rentSource: string | null;
  dataGaps: string[];
  livingAreaM2: number | null;
}): string[] {
  if (bestimmeSicherheitsstufe(objekt) !== "S0") return [];

  const gruende = objekt.dataGaps.filter((luecke) =>
    (S0_LUECKEN as readonly string[]).includes(luecke)
  );

  // Das Feld, nicht die Ableitung: `wohnflaeche_fehlt` gibt es erst seit dem
  // 2026-09-08, aeltere Versionen tragen die Luecke nicht, obwohl ihnen die
  // Flaeche fehlt (siehe Kommentar an `bestimmeSicherheitsstufe`).
  const flaecheFehlt = objekt.livingAreaM2 === null || objekt.livingAreaM2 <= 0;
  if (flaecheFehlt && !gruende.includes("wohnflaeche_fehlt")) {
    gruende.push("wohnflaeche_fehlt");
  }

  // Bleibt nichts uebrig, war die Mietquelle der Grund -- der einzige Weg
  // nach S0, der ohne Luecke und ohne fehlende Flaeche auskommt.
  if (gruende.length === 0) gruende.push(LUECKE_MIETQUELLE_UNBEKANNT);

  return gruende;
}

/** DSCR bei der unguenstigsten (`unten`) und der guenstigsten (`oben`) Mietannahme im Band. */
export interface Bandkanten {
  unten: number;
  oben: number;
}

/**
 * Bandkanten durch einen zweiten und dritten Aufruf von `berechneKennzahlen`
 * mit skalierter Miete (Entwurf 3.4) -- das Band wird gerechnet, nicht
 * geschaetzt. `noi` waechst monoton mit der Miete (Bewirtschaftungskosten
 * sind zwischen 20 % und 35 % der Miete gedeckelt, nie mehr), darum liefert
 * die niedrigere Miete auch zuverlaessig die niedrigere Bandkante.
 */
function berechneBandkanten(
  input: KennzahlenInput,
  grunderwerbsteuerSatzProzent: number,
  spanne: MietSpanne
): Bandkanten {
  const untenInput = { ...input, jahreskaltmiete: input.jahreskaltmiete * (1 + spanne.minProzent) };
  const obenInput = { ...input, jahreskaltmiete: input.jahreskaltmiete * (1 + spanne.maxProzent) };
  return {
    unten: berechneKennzahlen(untenInput, grunderwerbsteuerSatzProzent).geschaetzterDscr,
    oben: berechneKennzahlen(obenInput, grunderwerbsteuerSatzProzent).geschaetzterDscr,
  };
}

export interface RangEinordnung {
  stufe: Sicherheitsstufe;
  /** DSCR, `null` fuer S0 -- ein nicht beurteilbares Objekt bekommt KEINE Kennzahl (3.7), keine 0. */
  rangzahl: number | null;
  /** `null` fuer S0 (keine Kennzahl) und S3 (dort steht ein Punktwert, kein Band, 3.4). */
  band: Bandkanten | null;
  /** Nur aussagekraeftig, wenn `band !== null` -- ohne Band ist `false` "nicht beurteilbar", nicht "ueberquert die Schwelle nicht". */
  istSchwellenwechsler: boolean;
}

/**
 * Fasst Sicherheitsstufe, Rangzahl, Bandkanten und Schwellenwechsler-Merkmal
 * zu einer Einordnung zusammen (Entwurf 9, Schritt 2).
 *
 * S0 bekommt ueberhaupt keine Kennzahl (3.7) -- die Pruefung passiert VOR
 * jedem Aufruf von `berechneKennzahlen`, nicht danach: Ein Objekt ohne
 * Wohnflaeche soll nie eine 0 durchrechnen, die spaeter verworfen wird.
 */
export function bewerteFuerRangliste(
  objekt: {
    rentSource: string | null;
    dataGaps: string[];
    livingAreaM2: number | null;
  },
  kennzahlenInput: KennzahlenInput,
  grunderwerbsteuerSatzProzent: number,
  bundesland: string | null
): RangEinordnung {
  const stufe = bestimmeSicherheitsstufe(objekt);

  if (stufe === "S0") {
    return { stufe, rangzahl: null, band: null, istSchwellenwechsler: false };
  }

  const rangzahl = berechneKennzahlen(kennzahlenInput, grunderwerbsteuerSatzProzent).geschaetzterDscr;

  if (stufe === "S3") {
    return { stufe, rangzahl, band: null, istSchwellenwechsler: false };
  }

  const spanne: MietSpanne | null =
    stufe === "S2"
      ? REGIONALE_SPANNE_S2
      : objekt.rentSource === "geschaetzt_bundesweit"
        ? mietSpanneBundesweit()
        : bundesland === null
          ? null
          : mietSpanneFuerBundesland(bundesland);

  if (spanne === null) {
    return { stufe, rangzahl, band: null, istSchwellenwechsler: false };
  }

  const band = berechneBandkanten(kennzahlenInput, grunderwerbsteuerSatzProzent, spanne);
  return {
    stufe,
    rangzahl,
    band,
    istSchwellenwechsler: band.unten < DSCR_MELDESCHWELLE && band.oben >= DSCR_MELDESCHWELLE,
  };
}

export type Verfuegbarkeitszustand = "verfuegbar" | "unbestaetigt" | "abgaengig";

const MS_PRO_TAG = 24 * 60 * 60 * 1000;

/**
 * Die drei Verfuegbarkeitszustaende aus Entwurf 6.3.
 *
 * `kadenzTageDerRegion === null` deckt drei Faelle aus der Entwurfstabelle
 * gleichzeitig ab, die dasselbe Ergebnis haben: keine Region zuzuordnen,
 * eine Region ohne Abgangserkennung (`nw`, `bw`, `mv`), oder eine Kadenz,
 * die (noch) nicht ermittelbar ist. In allen drei Faellen gilt "nicht
 * hingesehen", nie "verfuegbar" -- Nichtwissen wird nicht zu Vertrauen
 * aufgewertet, dieselbe Regel wie bei der Sicherheitsstufe.
 *
 * Fehlt `lastSeen`, gilt dasselbe: keine Angabe ist kein Freibrief (wie
 * `istHartLoeschbar` in `bestand.ts`).
 *
 * Entwurf 6.3 definiert nur zwei Kanten -- "juenger als die Kadenz" fuer
 * verfuegbar, "aelter als das Doppelte" fuer unbestaetigt -- und laesst den
 * Spalt dazwischen offen. Diese Funktion loest ihn bewusst zugunsten von
 * "verfuegbar" auf: die einzige gepruefte Kante ist das Doppelte der
 * Kadenz. Das ist eine Auslegung, keine Vorgabe des Entwurfs -- 6.3 kuendigt
 * ohnehin eine Nachmessung der Schwelle in vier Wochen an.
 */
export function bestimmeVerfuegbarkeitszustand(
  objekt: {
    disappearedAt: string | null;
    lastSeen: string | null;
    kadenzTageDerRegion: number | null;
  },
  jetzt: Date
): Verfuegbarkeitszustand {
  // `null` und `undefined` sind hier NICHT dasselbe Nichtwissen. `null`
  // heisst "die Spalte wurde gelesen, das Objekt ist nicht als abgaengig
  // markiert" -- eine Aussage, die es rechtfertigt, ueber last_seen und
  // Kadenz zu urteilen (weiter unten). `undefined` heisst "die Spalte lag
  // gar nicht vor" (z. B. eine Datenbankzeile, in der disappeared_at nicht
  // mit ausgewaehlt wurde) -- dazu gibt es keine Aussage. Die Signatur oben
  // (`string | null`) ist dann ein Typvertrag, den TypeScript zur Laufzeit
  // nicht durchsetzt.
  //
  // Deshalb zwei getrennte Ergebnisse statt eines gemeinsamen Fallthrough:
  // Ein `undefined` darf nicht zu "abgaengig" UND nicht zu "verfuegbar"
  // werden -- beides waeren Behauptungen ueber ein Feld, das nie gelesen
  // wurde. Es entscheidet sofort auf "unbestaetigt", ohne last_seen oder
  // Kadenz ueberhaupt erst zu befragen: Nichtwissen wird in diesem Projekt
  // nie zu einer Behauptung (docs/superpowers/BACKLOG.md), in keine der
  // beiden Richtungen.
  if (objekt.disappearedAt === undefined) return "unbestaetigt";
  if (objekt.disappearedAt !== null) return "abgaengig";
  if (objekt.kadenzTageDerRegion === null) return "unbestaetigt";
  if (objekt.lastSeen === null) return "unbestaetigt";

  const lastSeenMs = new Date(objekt.lastSeen).getTime();
  if (!Number.isFinite(lastSeenMs)) return "unbestaetigt";

  const alterMs = jetzt.getTime() - lastSeenMs;
  const schwelleMs = 2 * objekt.kadenzTageDerRegion * MS_PRO_TAG;
  return alterMs > schwelleMs ? "unbestaetigt" : "verfuegbar";
}
