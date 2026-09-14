/**
 * Sicherheitsstufen fuer die Rangliste, nach Abschnitt 3.3 des
 * Dashboard-Entwurfs (docs/superpowers/specs/2026-09-09-dashboard-entwurf.md).
 *
 * Reine Funktion: kein Supabase, kein Netz, kein `console`, keine Zeit.
 */

import { berechneKennzahlen, type KennzahlenInput } from "./metrics.js";
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

/** DSCR bei der unguenstigsten (`unten`) und der guenstigsten (`oben`) Mietannahme im Band. */
export interface Bandkanten {
  unten: number;
  oben: number;
}

/**
 * Schwelle, an der die Meldung haengt (`topTreffer` in `metrics.ts`,
 * `geschaetzterDscr >= 1,3`). Hier dupliziert statt importiert, weil
 * `metrics.ts` sie nirgends als eigenen Namen exportiert -- sie steckt dort
 * als Literal in `topTreffer`.
 */
const DSCR_MELDESCHWELLE = 1.3;

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
