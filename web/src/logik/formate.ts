/**
 * Zahlen und Zeiten fuer die Anzeige.
 *
 * EINE REGEL ZIEHT SICH DURCH ALLES HIER: Eine fehlende Angabe wird zu einem
 * Gedankenstrich, niemals zu einer Null. Entwurf 3.7 -- "eine graue 0,0 waere
 * der Fehler, den dieser ganze Abschnitt verhindern soll: Der Nutzer laese
 * sie als Urteil."
 */

const MS_PRO_TAG = 24 * 60 * 60 * 1000;

/** Was an der Stelle einer fehlenden Angabe steht. Kein Wert, kein Urteil. */
export const OHNE_ANGABE = "—";

const ANZAHL = new Intl.NumberFormat("de-DE");
const EURO = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const FLAECHE = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const DSCR = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const DATUM = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});
const DATUM_ZEIT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export function formatiereAnzahl(wert: number): string {
  return ANZAHL.format(wert);
}

export function formatiereEuro(wert: number | null): string {
  if (wert === null || !Number.isFinite(wert)) return OHNE_ANGABE;
  return `${EURO.format(wert)} €`;
}

export function formatiereFlaeche(wert: number | null): string {
  if (wert === null || !Number.isFinite(wert)) return OHNE_ANGABE;
  return `${FLAECHE.format(wert)} m²`;
}

/** Die Rangzahl. `null` heisst "keine Kennzahl", nicht "Kennzahl null". */
export function formatiereDscr(wert: number | null): string {
  if (wert === null || !Number.isFinite(wert)) return OHNE_ANGABE;
  return DSCR.format(wert);
}

export function formatiereProzent(anteil: number | null, stellen = 0): string {
  if (anteil === null || !Number.isFinite(anteil)) return OHNE_ANGABE;
  return `${new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen,
  }).format(anteil * 100)} %`;
}

/**
 * Preis je Quadratmeter -- eine Division zweier ANGEZEIGTER Zahlen, keine
 * neue Kennzahl. Fehlt eine der beiden, entsteht keine; eine Flaeche von 0
 * ergibt `null` und nicht Unendlich.
 */
export function preisJeQuadratmeter(
  kaufpreisEuro: number | null,
  wohnflaecheM2: number | null
): number | null {
  if (kaufpreisEuro === null || wohnflaecheM2 === null) return null;
  if (!Number.isFinite(kaufpreisEuro) || !Number.isFinite(wohnflaecheM2)) return null;
  if (wohnflaecheM2 <= 0) return null;
  return kaufpreisEuro / wohnflaecheM2;
}

/** Alter eines Zeitstempels in Tagen. Unlesbar und fehlend ergeben `null`. */
export function alterInTagen(zeitstempel: string | null, jetzt: Date): number | null {
  if (zeitstempel === null) return null;
  const zeit = Date.parse(zeitstempel);
  if (!Number.isFinite(zeit)) return null;
  return (jetzt.getTime() - zeit) / MS_PRO_TAG;
}

/**
 * Das Alter in Worten. Entwurf 4.4 verlangt das Alter AM OBJEKT, sonst liest
 * der Nutzer einen sechs Tage alten Preis als aktuell.
 */
export function formatiereTagesalter(tage: number | null): string {
  if (tage === null || !Number.isFinite(tage)) return "Zeitpunkt unbekannt";
  const ganze = Math.floor(tage);
  if (ganze <= 0) return "heute";
  if (ganze === 1) return "vor 1 Tag";
  return `vor ${formatiereAnzahl(ganze)} Tagen`;
}

export function formatiereDatum(zeitstempel: string | null): string {
  if (zeitstempel === null) return OHNE_ANGABE;
  const zeit = Date.parse(zeitstempel);
  if (!Number.isFinite(zeit)) return OHNE_ANGABE;
  return DATUM.format(new Date(zeit));
}

export function formatiereDatumZeit(zeitstempel: string | null): string {
  if (zeitstempel === null) return OHNE_ANGABE;
  const zeit = Date.parse(zeitstempel);
  if (!Number.isFinite(zeit)) return OHNE_ANGABE;
  return `${DATUM_ZEIT.format(new Date(zeit))} UTC`;
}
