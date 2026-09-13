/**
 * Sicherheitsstufen fuer die Rangliste, nach Abschnitt 3.3 des
 * Dashboard-Entwurfs (docs/superpowers/specs/2026-09-09-dashboard-entwurf.md).
 *
 * Reine Funktion: kein Supabase, kein Netz, kein `console`, keine Zeit.
 */

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

  return "S1";
}
