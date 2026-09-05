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
  const topTreffer = kaufpreisfaktor <= 15 && geschaetzterDscr >= 1.3 && !finanzierungsrisiko;

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
