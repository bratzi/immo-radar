/**
 * Kennzahlen aus der Titelzeile einer Immowelt-Ergebniskarte.
 *
 * WARUM DIESE DATEI EXISTIERT: Immowelts Detailseiten antworten von
 * Rechenzentrums-Adressen mit HTTP 403 und einem DataDome-CAPTCHA, waehrend
 * die Suchseite im selben Lauf HTTP 200 mit vollstaendiger Seite liefert
 * (gemessen 2026-09-08 auf einem GitHub-Runner, unmittelbar nacheinander in
 * derselben Browser-Sitzung). Der volle Lauf verbrannte dadurch 12 Minuten je
 * Durchgang auf 144 Abrufe, die ausnahmslos mit 403 endeten.
 *
 * Die Bewertung kommt deshalb aus der Ergebnisliste. Das kostet KEINEN
 * zusaetzlichen Abruf: Der Sweep laedt diese Seiten ohnehin und wirft bisher
 * alles bis auf drei Felder weg. Im `title`-Attribut der Karte steht:
 *
 *   "Mehrfamilienhaus zum Kauf - West - 75.000 € - 8 Zimmer, 158,7 m², 184 m² Grundstück"
 *
 * Was hier NICHT herauszuholen ist: die Postleitzahl. Sie steht weder im
 * Seiten-HTML noch im Datenmodell der Suchseite (beides geprueft). Der Ort ist
 * nur als Stadtteilname da ("West", "Nord"). Die Mietschaetzung fuer
 * Immowelt-Objekte wird dadurch bundeslandgenau statt PLZ-genau -- siehe
 * `lib/rentEstimate.ts`.
 */

/** Was sich aus einer Titelzeile lesen laesst. Alles einzeln nullbar. */
export interface TitelzeilenWerte {
  preisCents: number | null;
  wohnflaecheM2: number | null;
  grundstueckM2: number | null;
  zimmer: number | null;
  /** Stadtteil oder Ortsangabe, wie sie dasteht. Ohne Postleitzahl. */
  lage: string | null;
}

/** Deutsche Zahl mit Tausenderpunkt und Dezimalkomma: "1.250.000" -> 1250000. */
function deutscheZahl(text: string): number | null {
  const zahl = Number.parseFloat(text.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(zahl) ? zahl : null;
}

/**
 * Preis in Cent. Verlangt das Eurozeichen -- "Preis auf Anfrage" ergibt null.
 * Ein erfundener Preis waere schlimmer als gar keiner: Er ginge unmittelbar in
 * den Kaufpreisfaktor ein.
 */
const PREIS = /(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s*€/;

/**
 * Wohnflaeche und Grundstueck stehen beide als "N m²" da und unterscheiden
 * sich nur durch das Wort "Grundstück" dahinter. Deshalb wird das Grundstueck
 * ZUERST gesucht und aus dem Text entfernt; was dann noch als "m²" uebrig
 * ist, ist die Wohnflaeche.
 *
 * Die Reihenfolge ist der ganze Trick. Ohne sie liest ein einfaches
 * "m²"-Muster bei "80 m², 679 m² Grundstück" die 679 als Wohnflaeche -- und
 * der Kaufpreisfaktor faellt um mehr als das Achtfache zu gut aus.
 */
const GRUNDSTUECK = /(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s*m²\s*Grundstück/;
const FLAECHE = /(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s*m²/;
const ZIMMER = /(\d+(?:,\d+)?)\s*Zimmer/;

/**
 * Die Lage steht zwischen dem ersten und dem zweiten Trennstrich:
 * "Mehrfamilienhaus zum Kauf - West - 75.000 € - ...". Nur uebernommen, wenn
 * sie weder Zahl noch Eurozeichen enthaelt -- sonst waere bei fehlender
 * Ortsangabe der Preis als Lage gelesen worden.
 */
const TRENNER = " - ";

export function werteAusTitelzeile(titleLine: string): TitelzeilenWerte {
  const preisTreffer = titleLine.match(PREIS);
  const grundstueckTreffer = titleLine.match(GRUNDSTUECK);

  // Grundstueck herausschneiden, bevor die Wohnflaeche gesucht wird.
  const ohneGrundstueck =
    grundstueckTreffer === null ? titleLine : titleLine.replace(grundstueckTreffer[0], "");
  const flaecheTreffer = ohneGrundstueck.match(FLAECHE);
  const zimmerTreffer = titleLine.match(ZIMMER);

  const teile = titleLine.split(TRENNER);
  const rohLage = teile.length >= 3 ? teile[1].trim() : "";
  const lage = rohLage !== "" && !/[\d€]/.test(rohLage) ? rohLage : null;

  return {
    preisCents:
      preisTreffer === null
        ? null
        : (() => {
            const euro = deutscheZahl(preisTreffer[1]);
            return euro === null ? null : Math.round(euro * 100);
          })(),
    wohnflaecheM2: flaecheTreffer === null ? null : deutscheZahl(flaecheTreffer[1]),
    grundstueckM2: grundstueckTreffer === null ? null : deutscheZahl(grundstueckTreffer[1]),
    zimmer: zimmerTreffer === null ? null : deutscheZahl(zimmerTreffer[1]),
    lage,
  };
}

/**
 * Fasst die Objekte zusammen, die ohne Preis uebersprungen wurden -- nach
 * Fundort aufgeschluesselt.
 *
 * Warum die Aufschluesselung: Die Quote schwankte zwischen 0,5 % und 6,5 %
 * je Lauf. Gemessen ist das ein Regionseffekt und keine Verschlechterung --
 * der 6,5-%-Lauf zog seine ganze Bewertungsscheibe aus Baden-Wuerttemberg,
 * die 0-%-Laeufe aus Nordrhein-Westfalen. Ohne diese Zeile liest sich jeder
 * bw-Lauf wie ein Rueckschritt (Backlog A13).
 *
 * Ein fehlender Fundort wird ausdruecklich als "ohne Fundort" ausgewiesen,
 * nicht weggelassen: Ein unbekannter Zustand ist in diesem Projekt nie
 * "in Ordnung".
 */
export function fasseOhnePreisZusammen(
  faelle: { fundort: string | null; titleLine: string }[]
): string {
  if (faelle.length === 0) return "0 ohne Preisangabe uebersprungen.";

  const jeFundort = new Map<string, number>();
  for (const fall of faelle) {
    const schluessel = fall.fundort ?? "ohne Fundort";
    jeFundort.set(schluessel, (jeFundort.get(schluessel) ?? 0) + 1);
  }

  const aufschluesselung = [...jeFundort.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([fundort, anzahl]) => `${fundort} ${anzahl}`)
    .join(", ");

  return `${faelle.length} ohne Preisangabe uebersprungen (${aufschluesselung}).`;
}
