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

/**
 * Bundesweite Angebots-Kaltmiete. Quelle: BBSR, "Mieten driften immer weiter
 * auseinander" (2025) -- Angebotsmiete 11,11 €/m², Bestandsmiete rund
 * 7,76 €/m². Angebotsmiete ist die richtige Bezugsgroesse: Dieses Projekt
 * bewertet Objekte, die neu vermietet wuerden, nicht laufende Vertraege.
 *
 * Vorher stand hier 9,23 €/m² aus dem ImmoScout-Wohnpreisatlas
 * (Recherchestand 09/2026) -- gegen den BBSR-Wert 16,9 % zu niedrig. Zu
 * niedrig heiszt: Der Kaufpreisfaktor faellt zu schlecht aus, ein lohnendes
 * Objekt fiele unter die Meldeschwelle. Der Fehler ging also gegen den
 * Nutzer.
 */
export const BUNDESWEITER_MIETPREIS_PRO_M2_MONAT = 11.11;

/**
 * Naeherungs-Kaltmiete in €/m²/Monat je zweistelligem PLZ-Bereich.
 *
 * Der Bundesschnitt allein war als Schaetzgrundlage unbrauchbar: er setzte
 * fuer ein 27.000-€-Objekt in Plauen 38.500 € Jahresmiete an und erzeugte so
 * einen Kaufpreisfaktor von 0,7. Die Spanne zwischen Muenchen (~20 €/m²) und
 * strukturschwachen Regionen (~5 €/m²) ist zu gross, um sie zu mitteln.
 *
 * HERKUNFT UND PRUEFSTAND -- bitte vor jeder "Korrektur" lesen:
 *
 * Diese 95 Werte sind HANDRECHERCHIERT und kamen ohne benannte Quelle in
 * `590e5fe` (2026-09-07) ins Repo. Am 2026-09-08 wurden sie erstmals gegen
 * eine Quelle geprueft (Backlog A11): Zensus 2022, Regionaltabelle Gebaeude
 * und Wohnungen, Spalte "durchschn. Nettokaltmiete pro Quadratmeter",
 * umgerechnet von Bestands- auf Angebotsmiete ueber den BBSR-Abstand 2025.
 *
 *   n = 23 Stichproben (Gross-, Mittelstadt und laendlich, Ost und West)
 *   Mittel -8,5 %, Median -11,4 %, Spanne -23,7 % bis +23,9 %
 *   17 von 23 innerhalb ±15 %
 *
 * Gegenprobe ohne Umrechnung, gegen direkt veroeffentlichte
 * BBSR-Angebotsmieten 2025: Muenchen -2,4 %, Frankfurt -0,8 %,
 * Stuttgart -6,4 %.
 *
 * Die Tabelle ist also NICHT geraten. Sie trifft Niveau und Gefaelle und
 * liegt systematisch leicht zu niedrig -- erwartbar, weil ein
 * PLZ-Zweisteller mehr umfasst als seine Kernstadt (die "44" ist Dortmund
 * UND Bochum UND Herne). Wer einen Einzelwert anhebt, verschiebt damit auch
 * den Bundeslandmittelwert, der daraus gebildet wird.
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

/** Die REGIONALE_MIETE_PRO_M2-Werte aller PLZ-Zweisteller eines Bundeslandes. */
function werteFuerBundesland(bundesland: string): number[] {
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
  return werte;
}

const mittelwerte = new Map<string, number | null>();

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
 * WIE GROB, ist seit dem 2026-09-08 gemessen (Backlog A11). Der Mittelwert
 * als Zahl ist gut -- Median -2,8 % gegen Zensus 2022/BBSR, 13 von 16
 * Laendern innerhalb ±15 %. Das Problem ist die Spanne, die er einebnet:
 *
 *   Nordrhein-Westfalen   6,50 bis 16,50 €/m²   -37,1 % bis +59,7 %
 *   Bayern                8,00 bis 20,50 €/m²   -34,8 % bis +67,1 %
 *
 * 7 der 16 Laender verlassen intern das ±30-%-Band, und dort liegen 64 % der
 * bewerteten Objekte. Diese Stufe traegt 83 % des Bestands (1.758 von 2.108
 * Versionen), weil Immowelt-Ergebnislisten keine PLZ nennen. Gemessene
 * Auswirkung: ±30 % Miete verschieben rund 15 % aller Meldeklassen.
 *
 * Der wirksamste Hebel ist deshalb NICHT eine bessere Tabelle, sondern eine
 * PLZ fuer Immowelt-Objekte.
 *
 * Wird beim ersten Aufruf berechnet und gemerkt -- 10.812 PLZ-Eintraege sind
 * nichts, aber es passiert einmal je Kandidat.
 */
export function mieteProM2FuerBundesland(bundesland: string): number | null {
  const gemerkt = mittelwerte.get(bundesland);
  if (gemerkt !== undefined) return gemerkt;

  const werte = werteFuerBundesland(bundesland);
  const ergebnis =
    werte.length === 0
      ? null
      : Math.round((werte.reduce((a, b) => a + b, 0) / werte.length) * 100) / 100;
  mittelwerte.set(bundesland, ergebnis);
  return ergebnis;
}

/**
 * Bandbreite der Mietschaetzung, als prozentuale Abweichung vom Mittelwert
 * nach unten und oben.
 */
export interface MietSpanne {
  minProzent: number;
  maxProzent: number;
}

/**
 * Bandbreite fuer ein Bundesland: die GEMESSENE interne Spanne seiner
 * PLZ-Werte gegen den eigenen Mittelwert (Dashboard-Entwurf 3.4) -- nicht
 * eine pauschale Annahme. Fuer Bayern z. B. -34,8 % / +67,1 %, deckungsgleich
 * mit der von Hand nachgerechneten Tabelle in 3.4. `null`, wenn das
 * Bundesland keine PLZ-Werte hat (wie `mieteProM2FuerBundesland`).
 */
const spannen = new Map<string, MietSpanne | null>();

export function mietSpanneFuerBundesland(bundesland: string): MietSpanne | null {
  const gemerkt = spannen.get(bundesland);
  if (gemerkt !== undefined) return gemerkt;

  const werte = werteFuerBundesland(bundesland);
  if (werte.length === 0) {
    spannen.set(bundesland, null);
    return null;
  }
  const mittel = mieteProM2FuerBundesland(bundesland);
  if (mittel === null) {
    spannen.set(bundesland, null);
    return null;
  }
  const min = Math.min(...werte);
  const max = Math.max(...werte);
  const ergebnis: MietSpanne = {
    minProzent: (min - mittel) / mittel,
    maxProzent: (max - mittel) / mittel,
  };
  spannen.set(bundesland, ergebnis);
  return ergebnis;
}

/**
 * Feste Bandbreite fuer S2 (PLZ-genaue Schaetzung): die gemessene Streuung
 * der Tabelle `REGIONALE_MIETE_PRO_M2` gegen den Zensus 2022 (Backlog A11,
 * n = 23). Anders als bei S1 ist das keine je-Bundesland-Spanne -- sie
 * beschreibt, wie gut die Tabelle selbst trifft, nicht die Streuung
 * INNERHALB eines Landes.
 */
export const REGIONALE_SPANNE_S2: MietSpanne = {
  minProzent: -0.237,
  maxProzent: 0.239,
};

/**
 * Bandbreite der bundesweiten Schaetzung (`geschaetzt_bundesweit`), analog
 * zu `mietSpanneFuerBundesland`: die gemessene Spanne ALLER PLZ-Werte gegen
 * den Bundesschnitt. Betrifft nur sehr wenige Objekte (6 von 12.611,
 * gemessen 2026-09-12, Entwurf 3.3) -- Faelle ohne PLZ UND ohne Bundesland.
 */
export function mietSpanneBundesweit(): MietSpanne {
  const werte = Object.values(REGIONALE_MIETE_PRO_M2);
  const min = Math.min(...werte);
  const max = Math.max(...werte);
  return {
    minProzent: (min - BUNDESWEITER_MIETPREIS_PRO_M2_MONAT) / BUNDESWEITER_MIETPREIS_PRO_M2_MONAT,
    maxProzent: (max - BUNDESWEITER_MIETPREIS_PRO_M2_MONAT) / BUNDESWEITER_MIETPREIS_PRO_M2_MONAT,
  };
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
