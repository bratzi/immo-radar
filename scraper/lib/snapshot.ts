/**
 * Snapshot-Export -- der REINE Teil (Dashboard-Entwurf, Abschnitt 9,
 * Schritt 3; Dateiformat in N4 des Nachtrags vom 2026-09-15).
 *
 * Kein Supabase, kein Netz, kein `console`, und die Uhr kommt als Parameter
 * herein statt aus `new Date()` -- dieselbe Bauform wie `istHartLoeschbar`
 * (`bestand.ts`) und `bestimmeVerfuegbarkeitszustand` (`ranking.ts`). Das
 * Laden der Zeilen und das Schreiben der Datei stehen in `snapshotDb.ts`.
 *
 * Der Export LIEST NUR. Nichts in dieser Datei und nichts in `snapshotDb.ts`
 * schreibt in die Datenbank.
 */

import {
  berechneKennzahlen,
  DSCR_MELDESCHWELLE,
  MAX_PLAUSIBLER_KAUFPREISFAKTOR,
  MIN_PLAUSIBLER_KAUFPREISFAKTOR,
  type KennzahlenInput,
} from "./metrics.js";
import {
  bewerteFuerRangliste,
  bestimmeVerfuegbarkeitszustand,
  s0Gruende,
  type Bandkanten,
  type RangEinordnung,
  type Sicherheitsstufe,
  type Verfuegbarkeitszustand,
} from "./ranking.js";
import { bewerteEinheiten } from "./pipeline.js";
import { ermittleJahreskaltmiete, bundeslandFuerRegionscode } from "./rentEstimate.js";
import {
  grunderwerbsteuerSatz,
  grunderwerbsteuerSatzFuerBundesland,
  bundeslandFuerPlz,
} from "./grunderwerbsteuer.js";
import { partitionEinesListings } from "./bestand.js";
import { datenlueckeKlartext, LUECKE_PREIS_FEHLT } from "./telegram.js";

const MS_PRO_TAG = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Die Datenbankgrenze
//
// EINE Regel, und sie gilt ohne Ausnahme: Was die Abfrage nicht liefert, ist
// `null` / `false` / `[]` -- nie ein Wert, der etwas behauptet.
//
// Der Anlass ist konkret. Ein Feld, das eine Abfrage nicht mitauswaehlt, kommt
// als `undefined` an. `bestimmeVerfuegbarkeitszustand` prueft
// `disappearedAt !== null`; ein `undefined` rutscht da glatt hindurch und
// erklaert ein lebendes Objekt zum Abgang. Dieselbe Bauart hat
// `ladeBekannteListings` (`bestandDb.ts`) unmittelbar vor einer Loeschwache
// schon einmal getroffen -- der `?? null`-Kommentar dort ist der Vorgaenger
// dieses Blocks.
// ---------------------------------------------------------------------------

/** Text oder `null`. Leerer Text ist keine Angabe. */
function alsTextOderNull(wert: unknown): string | null {
  if (typeof wert !== "string") return null;
  const getrimmt = wert.trim();
  return getrimmt === "" ? null : getrimmt;
}

/**
 * Zahl oder `null`. `numeric` und `bigint` kommen ueber PostgREST als String
 * an -- ein `living_area_m2` von "0" waere als String truthy, und `> 0` waere
 * ein Textvergleich. Die Sicherheitsstufe haengt an genau dieser Pruefung.
 * Was sich nicht in eine endliche Zahl verwandeln laesst, wird `null` und
 * nicht `NaN`: Jeder Vergleich mit `NaN` ist `false`, und ein stilles `false`
 * ist hier immer die gefaehrliche Antwort.
 */
function alsZahlOderNull(wert: unknown): number | null {
  if (wert === null || wert === undefined) return null;
  if (typeof wert === "number") return Number.isFinite(wert) ? wert : null;
  if (typeof wert === "string") {
    const getrimmt = wert.trim();
    if (getrimmt === "") return null;
    const zahl = Number(getrimmt);
    return Number.isFinite(zahl) ? zahl : null;
  }
  return null;
}

/**
 * Wahrheitswert, der nur bei einem echten `true` wahr ist. `unitsConfident`
 * und `priceDropped` sind BEHAUPTUNGEN, wenn sie wahr sind ("Einheiten
 * bestaetigt", "Preis gesenkt"); ein fehlendes Feld darf sie nie erheben.
 */
function alsJaOderNein(wert: unknown): boolean {
  return wert === true;
}

/** Textliste oder `[]`. Alles, was kein Array von Strings ist, ist keine Liste. */
function alsTextListe(wert: unknown): string[] {
  if (!Array.isArray(wert)) return [];
  return wert.filter((eintrag): eintrag is string => typeof eintrag === "string");
}

/** Eine Zeile aus `listings`, so wie der Snapshot sie braucht. */
export interface SnapshotListingZeile {
  id: string;
  source: string;
  externalId: string | null;
  url: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  disappearedAt: string | null;
  fundort: string | null;
}

/** Eine Zeile aus `listing_versions`, so wie der Snapshot sie braucht. */
export interface SnapshotVersionZeile {
  listingId: string;
  scannedAt: string | null;
  priceCents: number | null;
  rentColdMonthlyCents: number | null;
  rentSource: string | null;
  livingAreaM2: number | null;
  plotAreaM2: number | null;
  units: number | null;
  unitsConfident: boolean;
  yearBuilt: number | null;
  zipCode: string | null;
  city: string | null;
  bundesland: string | null;
  title: string | null;
  priceDropped: boolean;
  dataGaps: string[];
  auctionAt: string | null;
}

/** Rohzeile aus `listings` -> `SnapshotListingZeile`, hart normalisiert. */
export function zuListingZeile(roh: Record<string, unknown>): SnapshotListingZeile {
  return {
    id: alsTextOderNull(roh.id) ?? "",
    source: alsTextOderNull(roh.source) ?? "",
    externalId: alsTextOderNull(roh.external_id),
    url: alsTextOderNull(roh.url),
    firstSeen: alsTextOderNull(roh.first_seen),
    lastSeen: alsTextOderNull(roh.last_seen),
    disappearedAt: alsTextOderNull(roh.disappeared_at),
    fundort: alsTextOderNull(roh.fundort),
  };
}

/** Rohzeile aus `listing_versions` -> `SnapshotVersionZeile`, hart normalisiert. */
export function zuVersionZeile(roh: Record<string, unknown>): SnapshotVersionZeile {
  return {
    listingId: alsTextOderNull(roh.listing_id) ?? "",
    scannedAt: alsTextOderNull(roh.scanned_at),
    priceCents: alsZahlOderNull(roh.price_cents),
    rentColdMonthlyCents: alsZahlOderNull(roh.rent_cold_monthly_cents),
    rentSource: alsTextOderNull(roh.rent_source),
    livingAreaM2: alsZahlOderNull(roh.living_area_m2),
    plotAreaM2: alsZahlOderNull(roh.plot_area_m2),
    units: alsZahlOderNull(roh.units),
    unitsConfident: alsJaOderNein(roh.units_confident),
    yearBuilt: alsZahlOderNull(roh.year_built),
    zipCode: alsTextOderNull(roh.zip_code),
    city: alsTextOderNull(roh.city),
    bundesland: alsTextOderNull(roh.bundesland),
    title: alsTextOderNull(roh.title),
    priceDropped: alsJaOderNein(roh.price_dropped),
    dataGaps: alsTextListe(roh.data_gaps),
    auctionAt: alsTextOderNull(roh.auction_at),
  };
}

/**
 * Die juengste Version je Objekt. `listing_versions` traegt mehrere Zeilen je
 * `listing_id` (25.709 Zeilen zu 17.078 Objekten am 2026-09-15); massgeblich
 * ist die mit dem groessten `scanned_at`.
 *
 * Eine unlesbare Zeitangabe zaehlt als aeltestmoeglich und verliert damit
 * gegen jede lesbare -- sie darf nie zur "juengsten" erklaert werden, nur
 * weil ihr Zeitstempel kaputt ist. Ist sie die einzige Version, wird sie
 * trotzdem genommen: Die Angaben darin sind deswegen nicht falsch, sie sind
 * nur nicht datierbar, und das Objekt ganz zu verschweigen waere der groessere
 * Fehler.
 */
export function waehleJuengsteVersionen(
  versionen: SnapshotVersionZeile[]
): Map<string, SnapshotVersionZeile> {
  const juengste = new Map<string, SnapshotVersionZeile>();
  const zeitJeListing = new Map<string, number>();

  for (const version of versionen) {
    const zeitRoh = version.scannedAt === null ? Number.NaN : Date.parse(version.scannedAt);
    const zeit = Number.isFinite(zeitRoh) ? zeitRoh : Number.NEGATIVE_INFINITY;
    const bisher = zeitJeListing.get(version.listingId);
    if (bisher === undefined || zeit > bisher) {
      zeitJeListing.set(version.listingId, zeit);
      juengste.set(version.listingId, version);
    }
  }
  return juengste;
}

/** Eine Zeile aus `sweep_region_runs`, so weit die Kadenz sie braucht. */
export interface RegionsLauf {
  source: string;
  partition: string;
  startedAt: string;
  vollstaendig: boolean;
}

/** Kadenz je `source/partition`. Was fehlt, heisst "nicht ermittelbar". */
export type RegionsKadenzen = Map<string, number>;

/**
 * Wie viele vollstaendige Laeufe eine Region vorweisen muss, bevor aus ihnen
 * eine Kadenz wird.
 *
 * Drei, also mindestens zwei Abstaende: Aus einem einzigen Abstand einen
 * "typischen" Abstand zu bilden ist keine Schaetzung, sondern eine
 * Behauptung -- und der Median ueber null Abstaende ist `NaN`.
 *
 * BEWUSST NICHT `MIN_REFERENZLAEUFE` aus `plausibilitaet.ts`, obwohl dort
 * dieselbe Zahl steht: Das ist die Beweislast einer Loeschwache, dies hier
 * die Grundlage einer Zeitschaetzung. Wer die eine nachjustiert, soll nicht
 * unbemerkt die andere verschieben.
 */
const MIN_VOLLSTAENDIGE_LAEUFE = 3;

/**
 * Ab welchem Vielfachen der geschaetzten Kadenz der letzte vollstaendige Lauf
 * die Schaetzung widerlegt.
 *
 * Dieselbe Zahl, die `bestimmeVerfuegbarkeitszustand` (`ranking.ts`) auf
 * Objekte anwendet -- dort ist sie privat und nicht importierbar. Sie steht
 * hier mit derselben Begruendung: Ein einzelner ausgefallener Termin soll
 * nichts umwerfen, ein dauerhaft ausbleibender Lauf schon.
 */
const KADENZ_WIDERLEGT_AB_VIELFACHEM = 2;

function regionsSchluessel(source: string, partition: string): string {
  return `${source}/${partition}`;
}

/**
 * Median, oder `null`, wenn es nichts zu mitteln gibt. Nicht-endliche Werte
 * fallen vorher heraus: Ein `NaN` im Ergebnis waere schlimmer als `null`,
 * weil jeder Vergleich damit `false` ergibt.
 */
function medianOderNull(werteRoh: number[]): number | null {
  const werte = werteRoh.filter((wert) => Number.isFinite(wert)).sort((a, b) => a - b);
  if (werte.length === 0) return null;
  const mitte = Math.floor(werte.length / 2);
  return werte.length % 2 === 1 ? werte[mitte] : (werte[mitte - 1] + werte[mitte]) / 2;
}

/**
 * Schaetzt je Region, wie viele Tage typischerweise zwischen zwei
 * VOLLSTAENDIGEN Sweeps liegen (Entwurf 6.3). Das Nachschlagen ist bewusst
 * aus `ranking.ts` herausgehalten -- dort kommt die Zahl als Parameter an.
 *
 * Das Verfahren, und warum es so streng ist:
 *
 * 1. Nur vollstaendige Laeufe. Ein Teillauf sagt nichts darueber, wie oft
 *    eine Region ganz gesehen wird.
 * 2. Weniger als MIN_VOLLSTAENDIGE_LAEUFE -> keine Kadenz.
 * 3. Kadenz = Median der Abstaende. Der Median und nicht das Mittel, weil
 *    43 % der Cron-Termine ausfallen (A10) und ein einzelner langer Abstand
 *    die Zahl sonst verschoebe.
 * 4. AKTUALITAETSPROBE: Liegt der letzte vollstaendige Lauf laenger als das
 *    Doppelte der geschaetzten Kadenz zurueck, ist die Schaetzung durch die
 *    Gegenwart widerlegt -> keine Kadenz.
 *
 * Schritt 4 ist der Kern und keine Kosmetik. Gemessen am 2026-09-15 tragen
 * `nw`, `bw`, `mv` und `sh` in `sweep_region_runs` NULL Zeilen mit
 * `gemeldete_treffer`; `istRegionVollstaendig` kann fuer sie seit der
 * Fail-closed-Umstellung nie mehr `true` liefern. Ihre `vollstaendig`-Zeilen
 * stammen alle vom 2026-09-08/09, also von davor. Ohne Schritt 4 bekaeme `nw`
 * aus drei solchen Altzeilen eine Kadenz von 0,44 Tagen und der ganze
 * NRW-Bestand hiesse "verfuegbar" -- aus einer Region, aus der nie ein Abgang
 * erkannt wird.
 *
 * WELCHE REGION KEINE VOLLSTAENDIGKEIT BELEGEN KANN, WIRD DAMIT AUS DEN DATEN
 * ABGELEITET und nirgends aufgezaehlt. Eine Liste `["nw","bw","mv"]` waere
 * schon beim Schreiben veraltet gewesen: `sh` gehoert seit der Messung vom
 * 2026-09-15 dazu, steht aber in keiner Spezifikation.
 *
 * WAS DAS VERFAHREN NICHT HERGIBT: Am 2026-09-15 umfasst
 * `sweep_region_runs` sieben Tage und 171 Zeilen, ausschliesslich von
 * `immowelt`. Das ist eine Schaetzung auf duenner Grundlage, keine Messung
 * einer eingeschwungenen Kadenz. Fuer `zvg-portal` gibt es dort ueberhaupt
 * keine Zeile -- jedes ZVG-Objekt bekommt deshalb `null` und damit
 * "unbestaetigt".
 */
export function schaetzeRegionsKadenzen(laeufe: RegionsLauf[], jetzt: Date): RegionsKadenzen {
  const zeitenJeRegion = new Map<string, number[]>();
  for (const lauf of laeufe) {
    if (!lauf.vollstaendig) continue;
    const zeit = Date.parse(lauf.startedAt);
    if (!Number.isFinite(zeit)) continue;
    const schluessel = regionsSchluessel(lauf.source, lauf.partition);
    const bisher = zeitenJeRegion.get(schluessel);
    if (bisher === undefined) zeitenJeRegion.set(schluessel, [zeit]);
    else bisher.push(zeit);
  }

  const kadenzen: RegionsKadenzen = new Map();
  for (const [schluessel, zeiten] of zeitenJeRegion) {
    if (zeiten.length < MIN_VOLLSTAENDIGE_LAEUFE) continue;
    const sortiert = [...zeiten].sort((a, b) => a - b);

    const abstaendeTage: number[] = [];
    for (let i = 1; i < sortiert.length; i += 1) {
      abstaendeTage.push((sortiert[i] - sortiert[i - 1]) / MS_PRO_TAG);
    }

    const kadenz = medianOderNull(abstaendeTage);
    // Jede nicht-endliche oder nicht-positive Zahl faellt hier heraus. Ein
    // NaN, das als Zahl durchrutscht, waere schlimmer als `null`: In
    // `bestimmeVerfuegbarkeitszustand` ist `alterMs > NaN` immer `false`, das
    // Objekt gaelte still als "verfuegbar" -- genau die Fail-open-Bauart, die
    // dieses Projekt an vier Stellen geschlossen hat.
    if (kadenz === null || kadenz <= 0) continue;

    const alterDesLetztenTage = (jetzt.getTime() - sortiert[sortiert.length - 1]) / MS_PRO_TAG;
    if (!Number.isFinite(alterDesLetztenTage)) continue;
    if (alterDesLetztenTage > KADENZ_WIDERLEGT_AB_VIELFACHEM * kadenz) continue;

    kadenzen.set(schluessel, kadenz);
  }
  return kadenzen;
}

/**
 * Kadenz einer Region, oder `null`. `null` deckt alle Faelle ab, die Entwurf
 * 6.3 gleich behandelt: keine Region zuzuordnen, eine Region ohne
 * Abgangserkennung, eine Region ohne ausreichende Historie. Alle drei heissen
 * "nicht hingesehen", nie "verfuegbar".
 */
export function kadenzFuerRegion(
  kadenzen: RegionsKadenzen,
  source: string,
  partition: string | null
): number | null {
  if (partition === null) return null;
  return kadenzen.get(regionsSchluessel(source, partition)) ?? null;
}

/** Die drei sichtbaren Bereiche der Oberflaeche (Nachtrag N1). */
export type Trefferklasse = "top" | "normal" | "nichtBeurteilbar";

/**
 * Die Trefferklasse nach N1.1 des Nachtrags vom 2026-09-15.
 *
 * `top` heisst: Das Objekt haelt die Meldeschwelle AUCH AN DER UNTEREN
 * BANDKANTE -- also auch dann noch, wenn die Mietschaetzung gegen es laeuft.
 * Begruendung in N1.1: Entwurf 3.5 sortiert bereits nach der unteren Kante,
 * und 3.6 hat gemessen, dass 25 % aller bewertbaren Objekte
 * Schwellenwechsler sind. Eine Trefferklasse auf dem Punktwert bestuende zu
 * einem erheblichen Teil aus Objekten, deren Rang allein an der Schaetzung
 * haengt, und widerlegte die Sortierung darunter.
 *
 * Drei Feinheiten, alle drei fail-closed:
 *
 * - **S3 hat kein Band** (3.4), dort steht eine Zahl. Bei belegter Miete gibt
 *   es keine Schaetzung, die gegen das Objekt laufen koennte -- also
 *   entscheidet der Punktwert.
 * - **S1/S2 OHNE Band** (die Mietspanne des Bundeslandes war nicht
 *   ermittelbar) sind nie `top`. Ohne untere Kante ist "haelt auch unten"
 *   keine Aussage, die jemand pruefen koennte. Das darf nicht mit dem
 *   S3-Fall verwechselt werden, obwohl beide `band === null` tragen -- die
 *   Stufe unterscheidet sie.
 * - **Kein Kaufpreisfaktor** heisst nicht `top`.
 *
 * `finanzierungsrisiko`, die vierte Bedingung von `topTreffer` in
 * `metrics.ts`, fehlt hier bewusst: Entwurf 2.2 rechnet vor, dass es nur
 * unterhalb von DSCR ≈ 0,81…0,84 greift und bei geforderten DSCR >= 1,3
 * deshalb nie die bindende Bedingung sein kann.
 *
 * Alle drei Schwellen werden aus `metrics.ts` IMPORTIERT und nicht
 * abgeschrieben (Entwurf 5.3, Punkt 4).
 */
export function bestimmeTrefferklasse(
  einordnung: RangEinordnung,
  kaufpreisfaktor: number | null
): Trefferklasse {
  if (einordnung.rangzahl === null) return "nichtBeurteilbar";

  const kanteUnten =
    einordnung.band !== null
      ? einordnung.band.unten
      : einordnung.stufe === "S3"
        ? einordnung.rangzahl
        : null;
  if (kanteUnten === null) return "normal";

  const haeltSchwelle = kanteUnten >= DSCR_MELDESCHWELLE;
  const faktorPlausibel =
    kaufpreisfaktor !== null &&
    kaufpreisfaktor >= MIN_PLAUSIBLER_KAUFPREISFAKTOR &&
    kaufpreisfaktor <= MAX_PLAUSIBLER_KAUFPREISFAKTOR;

  return haeltSchwelle && faktorPlausibel ? "top" : "normal";
}

// ---------------------------------------------------------------------------
// Das Dateiformat aus N4 des Nachtrags vom 2026-09-15
// ---------------------------------------------------------------------------

export interface SnapshotObjekt {
  id: string;
  quelle: string;
  url: string | null;
  titel: string | null;
  ort: string | null;
  bundesland: string | null;
  plz: string | null;
  kaufpreisEuro: number | null;
  wohnflaecheM2: number | null;
  grundstueckM2: number | null;
  baujahr: number | null;
  einheiten: number | null;
  einheitenAngenommen: boolean;
  stufe: Sicherheitsstufe;
  trefferklasse: Trefferklasse;
  /** DSCR. `null` bei S0 -- ein nicht beurteilbares Objekt bekommt KEINE Kennzahl (3.7). */
  rangzahl: number | null;
  /**
   * Kaufpreisfaktor, die zweite Zahl neben dem DSCR (Entwurf 2.3).
   *
   * `null` bei S0: Dort ist die Miete 0 und der Faktor `Infinity` -- und ein
   * `Infinity` ueberlebt `JSON.stringify` als `null` ohnehin nicht. Lieber
   * ein ausdrueckliches `null` als eine Zahl, die unterwegs kippt.
   */
  kaufpreisfaktor: number | null;
  band: Bandkanten | null;
  istSchwellenwechsler: boolean;
  zustand: Verfuegbarkeitszustand;
  /** Klartext-Gruende, nie rohe Lueckencodes (3.7). */
  datenluecken: string[];
  preisGesenkt: boolean;
  zuletztGesehen: string | null;
  abgaengigSeit: string | null;
  /** Nur ZVG. */
  termin: string | null;
}

export interface SnapshotBundesland {
  name: string;
  objekte: number;
  topTreffer: number;
  /** Median der Rangzahlen; `null`, wenn kein Objekt des Landes eine traegt. */
  medianDscr: number | null;
  /** Alter des juengsten Regionslaufs in Tagen; `null`, wenn es keinen gibt. */
  standAlterTage: number | null;
}

export interface SnapshotKopfzeile {
  objekteGesamt: number;
  mitBelegterMiete: number;
  topTrefferSeit: string | null;
  anteilBundeslandgenau: number | null;
}

/** Laufkennwerte. `null` heisst "dieser Export lief nicht in einem Lauf". */
export interface SnapshotBetriebEingabe {
  uebersprungeneJeLauf: { preis_auf_anfrage: number; preis_unlesbar: number } | null;
  meldebudget: { gesendet: number; hoechstens: number; zurueckgestellt: number } | null;
}

export interface SnapshotBetrieb extends SnapshotBetriebEingabe {
  regionsstand: { region: string; letzterLauf: string | null; vollstaendig: boolean }[];
}

export interface Snapshot {
  erzeugtAm: string;
  lauf: { id: string | null; beendetAm: string | null };
  kopfzeile: SnapshotKopfzeile;
  bundeslaender: SnapshotBundesland[];
  objekte: SnapshotObjekt[];
  betrieb: SnapshotBetrieb;
}

export interface SnapshotEingabe {
  listings: SnapshotListingZeile[];
  /** ALLE Versionen; die juengste je Objekt waehlt diese Datei. */
  versionen: SnapshotVersionZeile[];
  regionsLaeufe: RegionsLauf[];
  lauf: { id: string | null; beendetAm: string | null };
  betrieb: SnapshotBetriebEingabe;
}

/**
 * Rangfolge der Mietquellen nach Genauigkeit. Alles, was hier nicht steht --
 * auch `null` --, ist 0 und damit die ungenaueste Stufe. Dieselbe
 * Aufzaehlungsregel wie `bestimmeSicherheitsstufe`.
 */
const MIETQUELLE_GENAUIGKEIT: Record<string, number> = {
  angegeben: 3,
  geschaetzt_regional: 2,
  geschaetzt_bundesland: 1,
  geschaetzt_bundesweit: 1,
};

/**
 * Die UNGENAUERE zweier Mietquellen.
 *
 * WOZU: Der Snapshot rechnet die Jahreskaltmiete mit `ermittleJahreskaltmiete`
 * neu -- derselben Funktion, die die Pipeline benutzt, aus denselben
 * gespeicherten Feldern. Die Stufe soll nach Entwurf 3.3 an der gespeicherten
 * `rent_source` haengen. Beide koennen auseinanderlaufen, sobald sich
 * `REGIONALE_MIETE_PRO_M2` aendert.
 *
 * Und das ist nicht harmlos: Die Stufe waehlt die BANDBREITE. Stuende
 * gespeichert `geschaetzt_regional` (S2, ±23,7 %), waehrend die Miete heute
 * bundeslandgenau entsteht (S1, in Bayern -34,8 %...+67,1 %), bekaeme das
 * Objekt ein zu schmales Band -- und ein zu schmales Band kann einen
 * Top-Treffer erzeugen, den die Datenlage nicht traegt (N1.1 haengt genau an
 * der unteren Bandkante). Darum zaehlt die schlechtere der beiden
 * Beobachtungen.
 */
function ungenauereMietquelle(
  gespeichert: string | null,
  neuGerechnet: string | null
): string | null {
  const a = gespeichert === null ? 0 : (MIETQUELLE_GENAUIGKEIT[gespeichert] ?? 0);
  const b = neuGerechnet === null ? 0 : (MIETQUELLE_GENAUIGKEIT[neuGerechnet] ?? 0);
  return a <= b ? gespeichert : neuGerechnet;
}

function endlichOderNull(wert: number): number | null {
  return Number.isFinite(wert) ? wert : null;
}

/**
 * Baut das Snapshot-Objekt aus bereits geladenen Zeilen (Dateiformat N4).
 *
 * REIN: kein Supabase, kein Netz, keine Uhr von sich aus -- `jetzt` kommt
 * herein, wie bei `istHartLoeschbar` (`bestand.ts`). Dadurch ist der ganze
 * Inhalt des Dashboards mit Fixtures pruefbar, ohne Datenbank.
 *
 * ALLE ABGELEITETEN GROESSEN KOMMEN AUS `ranking.ts` -- `bewerteFuerRangliste`
 * fuer Stufe, Rangzahl, Band und Schwellenwechsler,
 * `bestimmeVerfuegbarkeitszustand` fuer den Zustand. Hier wird keine Schwelle
 * nachgebaut (Entwurf 5.3, Punkt 4); die drei Zahlen, die die Trefferklasse
 * zusaetzlich braucht, sind aus `metrics.ts` importiert.
 */
export function baueSnapshot(eingabe: SnapshotEingabe, jetzt: Date): Snapshot {
  const juengsteVersionen = waehleJuengsteVersionen(eingabe.versionen);
  const kadenzen = schaetzeRegionsKadenzen(eingabe.regionsLaeufe, jetzt);

  const objekte = eingabe.listings.map((listing) =>
    baueObjekt(listing, juengsteVersionen.get(listing.id) ?? null, kadenzen, jetzt)
  );

  return {
    erzeugtAm: jetzt.toISOString(),
    lauf: eingabe.lauf,
    kopfzeile: baueKopfzeile(eingabe.listings, juengsteVersionen),
    bundeslaender: baueBundeslaender(objekte, eingabe.regionsLaeufe, jetzt),
    objekte,
    betrieb: {
      uebersprungeneJeLauf: eingabe.betrieb.uebersprungeneJeLauf,
      meldebudget: eingabe.betrieb.meldebudget,
      regionsstand: baueRegionsstand(eingabe.regionsLaeufe),
    },
  };
}

function baueObjekt(
  listing: SnapshotListingZeile,
  version: SnapshotVersionZeile | null,
  kadenzen: RegionsKadenzen,
  jetzt: Date
): SnapshotObjekt {
  // Die Region wird genauso bestimmt wie fuer die Abgangserkennung --
  // gespeicherter Fundort vor ZVG-Praefix, sonst `null` (bestand.ts). Eine
  // eigene Herleitung hier waere eine zweite Wahrheit ueber denselben Begriff.
  const partition = partitionEinesListings(listing.source, {
    id: listing.id,
    externalId: listing.externalId ?? "",
    disappearedAt: listing.disappearedAt,
    fundort: listing.fundort,
  });
  const zustand = bestimmeVerfuegbarkeitszustand(
    {
      disappearedAt: listing.disappearedAt,
      lastSeen: listing.lastSeen,
      kadenzTageDerRegion: kadenzFuerRegion(kadenzen, listing.source, partition),
    },
    jetzt
  );

  const gemeinsam = {
    id: listing.id,
    quelle: listing.source,
    url: listing.url,
    zustand,
    zuletztGesehen: listing.lastSeen,
    abgaengigSeit: listing.disappearedAt,
  };

  if (version === null) {
    // Eine `listings`-Zeile ohne Version: kein Preis, keine Flaeche, keine
    // Mietquelle. Die Stufe wird trotzdem GERECHNET und nicht als "S0"
    // hingeschrieben -- es gibt genau eine Funktion, die ueber Stufen
    // entscheidet, und das ist `bestimmeSicherheitsstufe` (hier ueber
    // `bewerteFuerRangliste`).
    const einordnung = bewerteFuerRangliste(
      { rentSource: null, dataGaps: [], livingAreaM2: null },
      { kaufpreis: 0, jahreskaltmiete: 0, einheiten: 0, baujahr: null, wohnflaecheM2: 0 },
      grunderwerbsteuerSatzFuerBundesland(null),
      null
    );
    return {
      ...gemeinsam,
      titel: null,
      ort: null,
      bundesland: null,
      plz: null,
      kaufpreisEuro: null,
      wohnflaecheM2: null,
      grundstueckM2: null,
      baujahr: null,
      einheiten: null,
      einheitenAngenommen: false,
      stufe: einordnung.stufe,
      trefferklasse: bestimmeTrefferklasse(einordnung, null),
      rangzahl: einordnung.rangzahl,
      kaufpreisfaktor: null,
      band: einordnung.band,
      istSchwellenwechsler: einordnung.istSchwellenwechsler,
      datenluecken: [datenlueckeKlartext(LUECKE_PREIS_FEHLT)],
      preisGesenkt: false,
      termin: null,
    };
  }

  const bundesland = version.bundesland;
  const plz = version.zipCode;
  const einheiten = bewerteEinheiten(version.units, version.unitsConfident);

  // Die Miete wird mit derselben Funktion neu gerechnet, die die Pipeline
  // benutzt, aus denselben gespeicherten Feldern. Sie steht in keiner Spalte.
  const miete = ermittleJahreskaltmiete(
    version.rentColdMonthlyCents === null ? null : version.rentColdMonthlyCents / 100,
    version.livingAreaM2 ?? 0,
    plz ?? "",
    bundesland
  );

  // Genau die Fallunterscheidung aus `processCandidate`: ohne brauchbare PLZ
  // ueber das Bundesland gehen, statt auf den Bundesschnitt zu fallen.
  const satz =
    plz === null || bundeslandFuerPlz(plz) === null
      ? grunderwerbsteuerSatzFuerBundesland(bundesland)
      : grunderwerbsteuerSatz(plz);

  const kennzahlenInput: KennzahlenInput = {
    kaufpreis: (version.priceCents ?? 0) / 100,
    jahreskaltmiete: miete.jahreskaltmiete,
    einheiten: einheiten.einheitenFuerBerechnung,
    baujahr: version.yearBuilt,
    wohnflaecheM2: version.livingAreaM2 ?? 0,
  };

  // EINE Eingabe fuer Stufe UND Gruende: `s0Gruende` muss dieselbe Mietquelle
  // sehen, nach der `bewerteFuerRangliste` die Stufe bestimmt hat -- sonst
  // koennten Stufe und Begruendung auseinanderlaufen.
  const stufenEingabe = {
    rentSource: ungenauereMietquelle(version.rentSource, miete.quelle),
    dataGaps: version.dataGaps,
    livingAreaM2: version.livingAreaM2,
  };

  const einordnung = bewerteFuerRangliste(stufenEingabe, kennzahlenInput, satz, bundesland);

  // Der Kaufpreisfaktor nur fuer bewertbare Objekte: Bei S0 waere die Miete 0
  // und der Faktor Infinity. Dieselbe Reihenfolge wie in
  // `bewerteFuerRangliste` -- erst pruefen, dann rechnen, nie eine Zahl
  // durchrechnen, die spaeter verworfen wird.
  const kaufpreisfaktor =
    einordnung.rangzahl === null
      ? null
      : endlichOderNull(berechneKennzahlen(kennzahlenInput, satz).kaufpreisfaktor);

  return {
    ...gemeinsam,
    titel: version.title,
    ort: version.city,
    bundesland,
    plz,
    kaufpreisEuro: version.priceCents === null ? null : version.priceCents / 100,
    wohnflaecheM2: version.livingAreaM2,
    grundstueckM2: version.plotAreaM2,
    baujahr: version.yearBuilt,
    einheiten: version.units,
    // `units_confident` ist der Beleg. Ohne ihn ist die Zahl angenommen --
    // 99,3 % des Bestands (Entwurf 3.1), darum steht es am Objekt.
    einheitenAngenommen: !version.unitsConfident,
    stufe: einordnung.stufe,
    trefferklasse: bestimmeTrefferklasse(einordnung, kaufpreisfaktor),
    rangzahl: einordnung.rangzahl,
    kaufpreisfaktor,
    band: einordnung.band,
    istSchwellenwechsler: einordnung.istSchwellenwechsler,
    // Die S0-Gruende kommen aus `ranking.ts` dazu, damit KEIN S0-Objekt ohne
    // Grund dasteht (Entwurf 3.7, Befund A18-1). `Set` statt Filter: Ein
    // Objekt mit `wohnflaeche_fehlt` in `data_gaps` UND fehlender Flaeche
    // soll den Grund einmal tragen, nicht zweimal. Reihenfolge: erst die
    // gemeldeten Luecken, dann die abgeleiteten -- was in der Datenbank
    // steht, steht zuerst.
    //
    // Das `Set` greift NACH der Uebersetzung in Klartext, nicht davor: Der
    // Altname `kaufpreis_unplausibel` und `preis_miete_unvereinbar` sind zwei
    // Codes mit demselben Satz. Stehen beide an einem Objekt, soll der Satz
    // einmal dastehen (Pruefung Runde 1, M-4).
    datenluecken: [
      ...new Set(
        [...version.dataGaps, ...s0Gruende(stufenEingabe)].map(datenlueckeKlartext)
      ),
    ],
    preisGesenkt: version.priceDropped,
    termin: version.auctionAt,
  };
}

/**
 * Die Kopfzeile aus Entwurf 3.9. Alle Zahlen zur Anzeigezeit aus den Daten
 * gerechnet und nie im Text festgeschrieben -- zwischen dem 2026-09-08 und
 * dem 2026-09-12 sind aus "2 Objekten mit belegter Miete" 1 geworden.
 *
 * `topTrefferSeit` ist der Beginn des Beobachtungsfensters, auf das sich die
 * Aussage "n Top-Treffer seit ..." bezieht: das aelteste `first_seen` im
 * Bestand. Der Bestand ist juenger als das Projekt, und eine Aussage ueber
 * Top-Treffer kann nicht weiter zurueckreichen als die Beobachtung.
 *
 * `anteilBundeslandgenau` ist die DRITTE Aussage aus 3.9 -- der Anteil der
 * Bewertungen, die auf einer bundeslandweiten Mietschaetzung beruhen ("98 %",
 * roh ueber alle Objekte gezaehlt). NICHT der Ortsanteil aus N2; der Name ist
 * missverstaendlich, die Herkunft nicht.
 */
function baueKopfzeile(
  listings: SnapshotListingZeile[],
  juengsteVersionen: Map<string, SnapshotVersionZeile>
): SnapshotKopfzeile {
  let mitBelegterMiete = 0;
  let nurBundeslandgenau = 0;
  let aeltestesFirstSeen: number | null = null;
  let aeltestesFirstSeenText: string | null = null;

  for (const listing of listings) {
    const version = juengsteVersionen.get(listing.id);
    if (version !== undefined) {
      if (version.rentSource === "angegeben") mitBelegterMiete += 1;
      if (
        version.rentSource === "geschaetzt_bundesland" ||
        version.rentSource === "geschaetzt_bundesweit"
      ) {
        nurBundeslandgenau += 1;
      }
    }
    if (listing.firstSeen === null) continue;
    const zeit = Date.parse(listing.firstSeen);
    if (!Number.isFinite(zeit)) continue;
    if (aeltestesFirstSeen === null || zeit < aeltestesFirstSeen) {
      aeltestesFirstSeen = zeit;
      aeltestesFirstSeenText = listing.firstSeen;
    }
  }

  return {
    objekteGesamt: listings.length,
    mitBelegterMiete,
    topTrefferSeit: aeltestesFirstSeenText,
    anteilBundeslandgenau: listings.length === 0 ? null : nurBundeslandgenau / listings.length,
  };
}

/**
 * Die Grundschicht der Karte (N2): je Bundesland Anzahl Objekte, Anzahl
 * Top-Treffer, Median-DSCR und das Alter des letzten Regionslaufs.
 *
 * Aufgenommen wird jedes Bundesland, das in den Objekten ODER in den
 * Regionslaeufen vorkommt -- nicht eine hier aufgezaehlte Liste der 16. Ein
 * Land ohne Objekte, das aber gesweept wurde, gehoert mit seinem Standalter
 * auf die Karte; ein Land ohne beides hat nichts auszusagen.
 *
 * Objekte ohne Bundesland fallen heraus. Sie verschwinden dadurch nicht: Die
 * Kopfzeile zaehlt sie mit, und die Differenz zur Summe ueber die Laender ist
 * genau die Abdeckung, die die Kartenlegende nennen soll (N2).
 */
function baueBundeslaender(
  objekte: SnapshotObjekt[],
  regionsLaeufe: RegionsLauf[],
  jetzt: Date
): SnapshotBundesland[] {
  const jeLand = new Map<string, { objekte: number; topTreffer: number; dscrs: number[] }>();

  const hole = (name: string) => {
    const vorhanden = jeLand.get(name);
    if (vorhanden !== undefined) return vorhanden;
    const neu = { objekte: 0, topTreffer: 0, dscrs: [] as number[] };
    jeLand.set(name, neu);
    return neu;
  };

  for (const objekt of objekte) {
    if (objekt.bundesland === null) continue;
    const eintrag = hole(objekt.bundesland);
    eintrag.objekte += 1;
    if (objekt.trefferklasse === "top") eintrag.topTreffer += 1;
    if (objekt.rangzahl !== null) eintrag.dscrs.push(objekt.rangzahl);
  }

  const letzterLaufJeLand = new Map<string, number>();
  for (const lauf of regionsLaeufe) {
    const name = bundeslandFuerRegionscode(lauf.partition);
    if (name === null) continue;
    hole(name);
    const zeit = Date.parse(lauf.startedAt);
    if (!Number.isFinite(zeit)) continue;
    const bisher = letzterLaufJeLand.get(name);
    if (bisher === undefined || zeit > bisher) letzterLaufJeLand.set(name, zeit);
  }

  return [...jeLand.entries()]
    .map(([name, eintrag]) => {
      const letzter = letzterLaufJeLand.get(name);
      return {
        name,
        objekte: eintrag.objekte,
        topTreffer: eintrag.topTreffer,
        medianDscr: medianOderNull(eintrag.dscrs),
        standAlterTage: letzter === undefined ? null : (jetzt.getTime() - letzter) / MS_PRO_TAG,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/**
 * Stand je Region aus `sweep_region_runs` (Entwurf 4.4 und Abschnitt 8):
 * der JUENGSTE Lauf je Region, samt seiner Vollstaendigkeit. Bewusst der
 * juengste und nicht der juengste vollstaendige -- die Frage lautet "wann
 * wurde hier zuletzt hingesehen", und die Antwort "am 14.09., unvollstaendig"
 * ist genau die Auskunft, die N2 und 4.4 verlangen.
 */
function baueRegionsstand(
  regionsLaeufe: RegionsLauf[]
): { region: string; letzterLauf: string | null; vollstaendig: boolean }[] {
  const juengste = new Map<string, { zeit: number; lauf: RegionsLauf }>();
  for (const lauf of regionsLaeufe) {
    const zeitRoh = Date.parse(lauf.startedAt);
    const zeit = Number.isFinite(zeitRoh) ? zeitRoh : Number.NEGATIVE_INFINITY;
    const bisher = juengste.get(lauf.partition);
    if (bisher === undefined || zeit > bisher.zeit) juengste.set(lauf.partition, { zeit, lauf });
  }
  return [...juengste.entries()]
    .map(([region, { zeit, lauf }]) => ({
      region,
      letzterLauf: Number.isFinite(zeit) ? lauf.startedAt : null,
      vollstaendig: lauf.vollstaendig,
    }))
    .sort((a, b) => a.region.localeCompare(b.region));
}
