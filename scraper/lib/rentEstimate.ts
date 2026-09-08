import plzBundesland from "./plzBundesland.generated.json" with { type: "json" };

/**
 * Woher die Jahreskaltmiete stammt, von genau nach grob:
 *
 *  - `angegeben`             -- das Portal nennt eine Miete. Nur damit gilt
 *                               ein Objekt als Top-Treffer.
 *  - `geschaetzt_regional`   -- aus dem PLZ-Zweisteller.
 *  - `geschaetzt_bundesland` -- Mittel des Bundeslandes. Fuer Immowelt der
 *                               Regelfall: die Ergebnisliste nennt keine PLZ,
 *                               und die Detailseite ist von
 *                               Rechenzentrums-Adressen gesperrt.
 *  - `geschaetzt_bundesweit` -- letzter Ausweg, ein Wert fuer ganz Deutschland.
 */
export type MietQuelle =
  | "angegeben"
  | "geschaetzt_regional"
  | "geschaetzt_bundesland"
  | "geschaetzt_bundesweit";

export interface MietSchaetzung {
  jahreskaltmiete: number;
  quelle: MietQuelle;
}

// Bundesweiter Durchschnitt Kaltmiete, Stand Recherche 09/2026 (ImmoScout24-Wohnpreisatlas: 9,23 €/m²).
export const BUNDESWEITER_MIETPREIS_PRO_M2_MONAT = 9.23;

/**
 * Naeherungs-Kaltmiete in €/m²/Monat je zweistelligem PLZ-Bereich.
 *
 * Der Bundesschnitt allein war als Schaetzgrundlage unbrauchbar: er setzte
 * fuer ein 27.000-€-Objekt in Plauen 38.500 € Jahresmiete an und erzeugte so
 * einen Kaufpreisfaktor von 0,7. Die Spanne zwischen Muenchen (~20 €/m²) und
 * strukturschwachen Regionen (~5 €/m²) ist zu gross, um sie zu mitteln.
 */
const REGIONALE_MIETE_PRO_M2: Record<string, number> = {
  "01": 9.0, "02": 6.0, "03": 6.5, "04": 9.5, "06": 6.8, "07": 7.2, "08": 6.0, "09": 6.5,
  "10": 14.5, "12": 13.5, "13": 13.0, "14": 12.0, "15": 8.5, "16": 9.0, "17": 8.0,
  "18": 9.5, "19": 8.5,
  "20": 15.5, "21": 12.0, "22": 15.0, "23": 10.5, "24": 10.0, "25": 9.5, "26": 8.5,
  "27": 8.5, "28": 10.5, "29": 8.0,
  "30": 11.0, "31": 8.5, "32": 8.5, "33": 9.0, "34": 9.0, "35": 9.5, "36": 8.5,
  "37": 9.5, "38": 9.0, "39": 7.5,
  "40": 12.5, "41": 10.0, "42": 10.0, "44": 9.5, "45": 9.5, "46": 9.0, "47": 9.5,
  "48": 10.5, "49": 9.5,
  "50": 13.0, "51": 11.0, "52": 10.5, "53": 12.0, "54": 9.5, "55": 12.0, "56": 9.5,
  "57": 9.0, "58": 9.0, "59": 9.0,
  "60": 16.5, "61": 12.5, "63": 12.0, "64": 12.5, "65": 13.0, "66": 8.5, "67": 10.5,
  "68": 12.5, "69": 13.5,
  "70": 15.0, "71": 13.0, "72": 12.5, "73": 11.5, "74": 11.0, "75": 11.5, "76": 12.0,
  "77": 10.5, "78": 11.0, "79": 13.5,
  "80": 20.5, "81": 20.0, "82": 17.5, "83": 14.0, "84": 11.0, "85": 14.5, "86": 12.5,
  "87": 12.0, "88": 12.0, "89": 12.0,
  "90": 12.5, "91": 11.0, "92": 9.5, "93": 12.0, "94": 10.0, "95": 8.0, "96": 9.5,
  "97": 11.0, "98": 7.5, "99": 8.5,
};

/**
 * Immowelt-Regionscode (aus `IMMOWELT_REGIONEN`) auf den Bundeslandnamen, wie
 * ihn `plzBundesland.generated.json` und die Grunderwerbsteuer-Tabelle
 * verwenden.
 */
const BUNDESLAND_JE_REGIONSCODE: Record<string, string> = {
  bw: "Baden-Württemberg",
  by: "Bayern",
  be: "Berlin",
  br: "Brandenburg",
  hb: "Bremen",
  hh: "Hamburg",
  he: "Hessen",
  mv: "Mecklenburg-Vorpommern",
  ni: "Niedersachsen",
  nw: "Nordrhein-Westfalen",
  rp: "Rheinland-Pfalz",
  sl: "Saarland",
  sn: "Sachsen",
  st: "Sachsen-Anhalt",
  sh: "Schleswig-Holstein",
  th: "Thüringen",
};

/** Bundesland zu einem Immowelt-Regionscode, sonst null. */
export function bundeslandFuerRegionscode(code: string): string | null {
  return BUNDESLAND_JE_REGIONSCODE[code] ?? null;
}

/**
 * Naeherungs-Kaltmiete je m²/Monat fuer ein ganzes BUNDESLAND.
 *
 * WARUM ES DAS BRAUCHT: Immowelt-Ergebnislisten nennen keine Postleitzahl --
 * weder im Seiten-HTML noch im Datenmodell (beides geprueft am 2026-09-08).
 * Bekannt ist nur, in welcher Bundesland-Liste ein Objekt stand. Die
 * Detailseite, die eine PLZ traegt, ist von Rechenzentrums-Adressen gesperrt.
 *
 * Der Wert wird aus den vorhandenen PLZ-Werten dieses Bundeslandes gemittelt
 * und NICHT neu geschaetzt -- gemittelt ueber die verschiedenen
 * PLZ-Zweisteller des Landes, jeder einmal gezaehlt. Nach PLZ-Anzahl zu
 * gewichten waere schlechter: Die Zahl der Postleitzahlen haengt an der
 * Flaeche, die Miete an der Einwohnerdichte.
 *
 * DAS IST GROEBER ALS DIE PLZ-SCHAETZUNG, und zwar spuerbar: In
 * Nordrhein-Westfalen liegen Duesseldorf (12,50) und laendliche Kreise (9,00)
 * unter demselben Mittelwert. Objekte, die so bewertet werden, tragen deshalb
 * die Datenluecke `miete_nur_bundeslandgenau`.
 *
 * Wird beim ersten Aufruf berechnet und gemerkt -- 10.812 PLZ-Eintraege sind
 * nichts, aber es passiert einmal je Kandidat.
 */
const mittelwerte = new Map<string, number | null>();

export function mieteProM2FuerBundesland(bundesland: string): number | null {
  const gemerkt = mittelwerte.get(bundesland);
  if (gemerkt !== undefined) return gemerkt;

  const zweisteller = new Set<string>();
  for (const [plz, land] of Object.entries(plzBundesland as Record<string, string>)) {
    if (land !== bundesland) continue;
    const treffer = plz.match(/^(\d{2})\d{3}$/);
    if (treffer !== null) zweisteller.add(treffer[1]);
  }

  const werte: number[] = [];
  for (const zs of zweisteller) {
    const wert = REGIONALE_MIETE_PRO_M2[zs];
    if (wert !== undefined) werte.push(wert);
  }

  const ergebnis =
    werte.length === 0
      ? null
      : Math.round((werte.reduce((a, b) => a + b, 0) / werte.length) * 100) / 100;
  mittelwerte.set(bundesland, ergebnis);
  return ergebnis;
}

/** Naeherungs-Kaltmiete je m²/Monat fuer eine PLZ, sonst null. */
export function regionaleMieteProM2(zipCode: string): number | null {
  const treffer = zipCode.trim().match(/^(\d{2})\d{3}$/);
  if (!treffer) return null;
  return REGIONALE_MIETE_PRO_M2[treffer[1]] ?? null;
}

/**
 * @param bundesland Voller Bundeslandname, wenn keine PLZ vorliegt. Nur dann
 *                   greift die bundeslandgenaue Schaetzung -- die PLZ bleibt
 *                   immer der genauere Weg und geht vor.
 */
export function ermittleJahreskaltmiete(
  angegebeneMonatsmiete: number | null,
  wohnflaecheM2: number,
  zipCode?: string,
  bundesland?: string | null
): MietSchaetzung {
  if (angegebeneMonatsmiete !== null && angegebeneMonatsmiete > 0) {
    return { jahreskaltmiete: angegebeneMonatsmiete * 12, quelle: "angegeben" };
  }

  const regional = zipCode === undefined ? null : regionaleMieteProM2(zipCode);
  if (regional !== null) {
    return { jahreskaltmiete: regional * wohnflaecheM2 * 12, quelle: "geschaetzt_regional" };
  }

  // Groeber als die PLZ und ausdruecklich als solches gekennzeichnet: Objekte
  // mit dieser Quelle bekommen in der Pipeline die Datenluecke
  // `miete_nur_bundeslandgenau`.
  const jeLand = bundesland === undefined || bundesland === null
    ? null
    : mieteProM2FuerBundesland(bundesland);
  if (jeLand !== null) {
    return { jahreskaltmiete: jeLand * wohnflaecheM2 * 12, quelle: "geschaetzt_bundesland" };
  }

  return {
    jahreskaltmiete: BUNDESWEITER_MIETPREIS_PRO_M2_MONAT * wohnflaecheM2 * 12,
    quelle: "geschaetzt_bundesweit",
  };
}
