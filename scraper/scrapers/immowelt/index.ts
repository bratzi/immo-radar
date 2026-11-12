import type { Quelle } from "../quelle.js";

/**
 * Mietsuche Muenchen, vorgefiltert: Wohnung, ab 2 Zimmer, ab 45 m2, bis
 * 1.300 Euro. Die Portalfilter sind Vorauswahl, kein Beleg; jedes Feld wird
 * im Code erneut geprueft. Ob der Preisfilter kalt oder warm meint, steht in
 * der Spec nicht fest: deshalb ist er bewusst auf 1.300 gesetzt, der Code
 * sortiert spaeter nach Warmmiete aus.
 */
export const IMMOWELT_SUCHE_URL =
  "https://www.immowelt.de/classified-search?distributionTypes=Rent&estateTypes=Apartment&locations=AD08DE6345&numberOfRoomsMin=2&livingSpaceMin=45&priceMax=1300&order=DateDesc";


/**
 * Deaktiviert: Immowelt sperrt GitHub-Actions-Rechner per DataDome
 * (Run 43101998784). Bleibt als Eintrag verdrahtet; Parser folgen erst,
 * wenn ein Abrufweg ohne Umgehung existiert.
 */
export const immoweltQuelle: Quelle = {
  name: "immowelt",
  aktiv: false,
  sweep: async () => ({ angebote: [], vollstaendig: false, status: "fehler", hinweis: "deaktiviert (DataDome sperrt CI)" }),
  ladeDetail: async (_ab, a) => ({ angebot: a, sperre: null }),
};
