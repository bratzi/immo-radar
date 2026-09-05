export type MietQuelle = "angegeben" | "geschaetzt_bundesweit";

export interface MietSchaetzung {
  jahreskaltmiete: number;
  quelle: MietQuelle;
}

// Bundesweiter Durchschnitt Kaltmiete, Stand Recherche 09/2026 (ImmoScout24-Wohnpreisatlas: 9,23 €/m²).
export const BUNDESWEITER_MIETPREIS_PRO_M2_MONAT = 9.23;

export function ermittleJahreskaltmiete(
  angegebeneMonatsmiete: number | null,
  wohnflaecheM2: number
): MietSchaetzung {
  if (angegebeneMonatsmiete !== null && angegebeneMonatsmiete > 0) {
    return { jahreskaltmiete: angegebeneMonatsmiete * 12, quelle: "angegeben" };
  }
  return {
    jahreskaltmiete: BUNDESWEITER_MIETPREIS_PRO_M2_MONAT * wohnflaecheM2 * 12,
    quelle: "geschaetzt_bundesweit",
  };
}
