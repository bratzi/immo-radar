export interface KennzahlenInput {
  kaufpreis: number;
  jahreskaltmiete: number;
  einheiten: number;
  baujahr: number | null;
  wohnflaecheM2: number;
}

export interface Kennzahlen {
  bewirtschaftungskosten: number;
  noi: number;
  kaufnebenkosten: number;
  bruttomietrendite: number;
  nettomietrenditeCapRate: number;
  kaufpreisfaktor: number;
  geschaetzterDscr: number;
  geschaetzterBeleihungswert: number;
  finanzierungsrisiko: boolean;
  topTreffer: boolean;
}

/**
 * Untergrenze, unter der ein Kaufpreisfaktor keine Gelegenheit mehr anzeigt,
 * sondern einen Datenfehler.
 *
 * Bewusst weit unter jedem Marktniveau: Selbst stark sanierungsbeduerftige
 * Mehrfamilienhaeuser wechseln in Deutschland nicht unter dem Sechs- bis
 * Achtfachen der Jahreskaltmiete den Besitzer. Ein Faktor von 3 hiesse, das
 * Haus habe sich nach drei Jahren Bruttomiete bezahlt. Die Schwelle soll
 * kaputte Eingaben abfangen, NICHT ueber die Guete eines Angebots urteilen --
 * darum liegt sie so tief, dass sie ein echtes Schnaeppchen nie trifft.
 */
export const MIN_PLAUSIBLER_KAUFPREISFAKTOR = 3;

const KAPITALDIENST_SATZ = 0.06;
const NOTAR_GRUNDBUCH_SATZ = 0.015;
const MAKLER_SATZ = 0.0357;
const VERWALTUNG_PRO_EINHEIT_JAHR = 300;
const MIETAUSFALLWAGNIS_SATZ = 0.02;

function instandhaltungssatzProM2(baujahr: number | null): number {
  if (baujahr === null) return 9.0;
  const alter = new Date().getFullYear() - baujahr;
  if (alter <= 22) return 7.1;
  if (alter <= 32) return 9.0;
  return 11.5;
}

function berechneBewirtschaftungskosten(input: KennzahlenInput): number {
  const verwaltung = input.einheiten * VERWALTUNG_PRO_EINHEIT_JAHR;
  const instandhaltung = instandhaltungssatzProM2(input.baujahr) * input.wohnflaecheM2;
  const mietausfallwagnis = input.jahreskaltmiete * MIETAUSFALLWAGNIS_SATZ;
  const summe = verwaltung + instandhaltung + mietausfallwagnis;
  const min = input.jahreskaltmiete * 0.2;
  const max = input.jahreskaltmiete * 0.35;
  return Math.min(Math.max(summe, min), max);
}

export function berechneKennzahlen(
  input: KennzahlenInput,
  grunderwerbsteuerSatzProzent: number
): Kennzahlen {
  const bewirtschaftungskosten = berechneBewirtschaftungskosten(input);
  const noi = input.jahreskaltmiete - bewirtschaftungskosten;
  const kaufnebenkosten =
    input.kaufpreis * (grunderwerbsteuerSatzProzent / 100 + NOTAR_GRUNDBUCH_SATZ + MAKLER_SATZ);
  const bruttomietrendite = (input.jahreskaltmiete / input.kaufpreis) * 100;
  const nettomietrenditeCapRate = (noi / (input.kaufpreis + kaufnebenkosten)) * 100;
  const kaufpreisfaktor = input.kaufpreis / input.jahreskaltmiete;
  const geschaetzterDscr = noi / ((input.kaufpreis + kaufnebenkosten) * KAPITALDIENST_SATZ);
  const geschaetzterBeleihungswert = noi / KAPITALDIENST_SATZ;
  const finanzierungsrisiko = input.kaufpreis > geschaetzterBeleihungswert * 1.1;
  // Nach OBEN pruefen reicht nicht. Am 2026-09-07 ging listing 2f41102f als
  // top_treffer raus: 2.840 € fuer 198,8 m², Kaufpreisfaktor 0,175,
  // Bruttomietrendite 571 %. Die Rechnung war fehlerfrei -- der Preis kam aus
  // dem alten Immowelt-Detailparser und war falsch. `<= 15` erfuellt so ein
  // Wert muehelos, und je kaputter die Zahl, desto besser sah das Objekt aus.
  const kaufpreisfaktorUnplausibel = kaufpreisfaktor < MIN_PLAUSIBLER_KAUFPREISFAKTOR;
  const topTreffer =
    !kaufpreisfaktorUnplausibel &&
    kaufpreisfaktor <= 15 &&
    geschaetzterDscr >= 1.3 &&
    !finanzierungsrisiko;

  return {
    bewirtschaftungskosten,
    noi,
    kaufnebenkosten,
    bruttomietrendite,
    nettomietrenditeCapRate,
    kaufpreisfaktor,
    geschaetzterDscr,
    geschaetzterBeleihungswert,
    finanzierungsrisiko,
    topTreffer,
  };
}
