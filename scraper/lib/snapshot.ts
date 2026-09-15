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
  DSCR_MELDESCHWELLE,
  MAX_PLAUSIBLER_KAUFPREISFAKTOR,
  MIN_PLAUSIBLER_KAUFPREISFAKTOR,
} from "./metrics.js";
import type { RangEinordnung } from "./ranking.js";

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

function median(werte: number[]): number {
  if (werte.length === 0) return Number.NaN;
  const sortiert = [...werte].sort((a, b) => a - b);
  const mitte = Math.floor(sortiert.length / 2);
  return sortiert.length % 2 === 1
    ? sortiert[mitte]
    : (sortiert[mitte - 1] + sortiert[mitte]) / 2;
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

    const kadenz = median(abstaendeTage);
    // Jede nicht-endliche oder nicht-positive Zahl faellt hier heraus. Ein
    // NaN, das als Zahl durchrutscht, waere schlimmer als `null`: In
    // `bestimmeVerfuegbarkeitszustand` ist `alterMs > NaN` immer `false`, das
    // Objekt gaelte still als "verfuegbar" -- genau die Fail-open-Bauart, die
    // dieses Projekt an vier Stellen geschlossen hat.
    if (!Number.isFinite(kadenz) || kadenz <= 0) continue;

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
