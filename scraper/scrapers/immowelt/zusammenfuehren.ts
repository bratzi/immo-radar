import type { TitelzeilenWerte } from "./titelzeile.js";
import type { ImmoweltDetailData } from "./detail.js";

/**
 * Die Werte eines Immowelt-Objekts, nachdem die Detailseite -- falls es eine
 * gab -- ueber die Titelzeile der Ergebnisliste gelegt wurde.
 */
export interface ZusammengefuehrteWerte {
  preisCents: number | null;
  wohnflaecheM2: number | null;
  grundstueckM2: number | null;
  baujahr: number | null;
  /** Leerstring, solange keine Detailseite eine PLZ genannt hat. */
  plz: string;
  ort: string;
  kaltmiete: number | null;
  einheiten: number | null;
  einheitenSicher: boolean;
  fotoUrls: string[];
  /**
   * true, sobald eine Detailseite abgerufen UND gelesen wurde -- auch dann,
   * wenn sie nichts Neues nannte. Steuert `last_detail_at`: Ein false bei
   * einer gelesenen, aber leeren Seite holte dasselbe Objekt in jedem Lauf
   * erneut und verbrauchte Detailbudget fuer etwas, das die Quelle nicht hat.
   */
  detailGelesen: boolean;
}

/**
 * Legt die Detailseite ueber die Titelzeile.
 *
 * Die Regel in einem Satz: **Ein `null` auf der Detailseite ist keine
 * Aussage.** Es darf einen Wert der Titelzeile nicht loeschen -- sonst macht
 * die Detailphase den Bestand aermer statt reicher, und zwar ausgerechnet bei
 * den Objekten, deren Seite lueckenhaft ist.
 *
 * Andersherum gewinnt die Detailseite ueberall dort, wo sie etwas sagt. Sie
 * ist die genauere Quelle: Die Titelzeile ist ein Fliesstext, aus dem Zahlen
 * herausgelesen werden; die Detailseite traegt ein Datenmodell.
 *
 * Drei Felder kann NUR die Detailseite liefern -- PLZ, Baujahr und Kaltmiete.
 * Sie sind der ganze Grund fuer diese Phase (Backlog B6): ohne PLZ bleibt die
 * Mietschaetzung bundeslandgenau (A11).
 */
export function fuegeDetailHinzu(
  titelzeile: TitelzeilenWerte,
  detail: ImmoweltDetailData | undefined
): ZusammengefuehrteWerte {
  const ausTitelzeile: ZusammengefuehrteWerte = {
    preisCents: titelzeile.preisCents,
    wohnflaecheM2: titelzeile.wohnflaecheM2,
    grundstueckM2: titelzeile.grundstueckM2,
    baujahr: null,
    // Ohne Detailseite gibt es keine PLZ: Sie steht weder im HTML noch im
    // Datenmodell der Suchseite.
    plz: "",
    // Die Lage der Karte ist ein Stadtteilname, kein Ort -- besser als nichts,
    // und die Detailseite ueberschreibt sie gleich, wenn sie einen Ort nennt.
    ort: titelzeile.lage ?? "",
    kaltmiete: null,
    // Die Zimmerzahl der Titelzeile ist NICHT die Zahl der Wohneinheiten. Sie
    // hier einzusetzen waere eine stille Erfindung.
    einheiten: null,
    einheitenSicher: false,
    fotoUrls: [],
    detailGelesen: false,
  };
  if (detail === undefined) return ausTitelzeile;

  return {
    ...ausTitelzeile,
    preisCents: detail.priceCents,
    wohnflaecheM2: detail.livingAreaM2 ?? ausTitelzeile.wohnflaecheM2,
    grundstueckM2: detail.plotAreaM2 ?? ausTitelzeile.grundstueckM2,
    baujahr: detail.yearBuilt,
    plz: detail.zipCode !== "" ? detail.zipCode : ausTitelzeile.plz,
    ort: detail.city !== "" ? detail.city : ausTitelzeile.ort,
    kaltmiete: detail.rentColdMonthly,
    einheiten: detail.units,
    // Haengt am Wert: Ohne Einheitenzahl gibt es nichts, dessen man sich
    // sicher sein koennte.
    einheitenSicher: detail.units !== null && detail.unitsConfident,
    fotoUrls: detail.photoUrls,
    detailGelesen: true,
  };
}
