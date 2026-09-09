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
 *
 * Das `(?<!\d)` vorn ist Pflicht, kein Zierrat: Ohne die Lookbehind-Sperre
 * greift das Muster bei einer Zahl ohne Tausenderpunkt ("75000 €") an einer
 * beliebigen Stelle mitten in der Ziffernfolge und liest nur die letzten drei
 * Ziffern -- "000" statt "75000". Ergebnis war 0 Cent statt Fehlanzeige, ein
 * erfundener Preis. In den 1758 gemessenen echten Titeln kommt dieses Format
 * nicht vor (A13); die Sperre stellt sicher, dass es dort landet, wo es
 * hingehoert: null statt eines stillen Fehlwerts.
 */
const PREIS = /(?<!\d)(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s*€/;

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
 * Zwei Lueckencodes statt einem, analog zu `wohnflaeche_fehlt` in
 * lib/pipeline.ts: derselbe Sprachgebrauch (deutscher Code, Unterstriche),
 * dieselbe Idee -- ein unbeurteilbarer Zustand bekommt einen eigenen Namen
 * statt in einem allgemeinen "fehlt" unterzugehen.
 *
 * `preis_auf_anfrage`: die Quelle nennt schlicht keinen Preis (kein € im
 * Titel). Das ist Markt, keine Regression.
 *
 * `preis_unlesbar`: der Titel enthaelt ein €, aber PREIS greift nicht. Genau
 * das war der A13-Fall "75000 €" ohne Tausenderpunkt -- eine steigende Quote
 * hier zeigt einen kaputten Parser an, keinen Markttrend.
 */
export type LueckencodeOhnePreis = "preis_auf_anfrage" | "preis_unlesbar";

export function ermittleLueckencodeOhnePreis(titleLine: string): LueckencodeOhnePreis {
  return titleLine.includes("€") ? "preis_unlesbar" : "preis_auf_anfrage";
}

/** Baut "fundort anzahl, fundort anzahl" -- groesste Region zuerst, sonst alphabetisch. */
function aufschluesselnJeFundort(faelle: { fundort: string | null }[]): string {
  const jeFundort = new Map<string, number>();
  for (const fall of faelle) {
    const schluessel = fall.fundort ?? "ohne Fundort";
    jeFundort.set(schluessel, (jeFundort.get(schluessel) ?? 0) + 1);
  }
  return [...jeFundort.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([fundort, anzahl]) => `${fundort} ${anzahl}`)
    .join(", ");
}

/**
 * Fasst die Objekte zusammen, die ohne Preis uebersprungen wurden -- nach
 * Fundort UND nach Lueckencode aufgeschluesselt.
 *
 * Warum die Fundort-Aufschluesselung: Die Quote schwankte zwischen 0,5 % und
 * 6,5 % je Lauf. Gemessen ist das ein Regionseffekt und keine
 * Verschlechterung -- der 6,5-%-Lauf zog seine ganze Bewertungsscheibe aus
 * Baden-Wuerttemberg, die 0-%-Laeufe aus Nordrhein-Westfalen. Ohne diese
 * Zeile liest sich jeder bw-Lauf wie ein Rueckschritt (Backlog A13).
 *
 * Warum die Code-Aufschluesselung: Ohne sie sehen "die Quelle nennt keinen
 * Preis" und "der Parser hat versagt" in der Diagnose gleich aus. Nur der
 * zweite Fall (`preis_unlesbar`) ist eine Regression; eine steigende Quote
 * beim ersten (`preis_auf_anfrage`) ist Markt.
 *
 * Ein fehlender Fundort wird ausdruecklich als "ohne Fundort" ausgewiesen,
 * nicht weggelassen: Ein unbekannter Zustand ist in diesem Projekt nie
 * "in Ordnung".
 */
export function fasseOhnePreisZusammen(
  faelle: { fundort: string | null; titleLine: string }[]
): string {
  if (faelle.length === 0) return "0 ohne Preisangabe uebersprungen.";

  const jeCode = new Map<LueckencodeOhnePreis, { fundort: string | null }[]>([
    ["preis_auf_anfrage", []],
    ["preis_unlesbar", []],
  ]);
  for (const fall of faelle) {
    jeCode.get(ermittleLueckencodeOhnePreis(fall.titleLine))!.push(fall);
  }

  const teile = [...jeCode.entries()].map(([code, gruppe]) => {
    const aufschluesselung = gruppe.length === 0 ? "" : ` (${aufschluesselnJeFundort(gruppe)})`;
    return `${code} ${gruppe.length}${aufschluesselung}`;
  });

  return `${faelle.length} ohne Preisangabe uebersprungen: ${teile.join(", ")}.`;
}
