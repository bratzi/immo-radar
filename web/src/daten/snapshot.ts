/**
 * Das Dateiformat, das die Oberflaeche liest (Nachtrag 2026-09-15, N4).
 *
 * MASSGEBLICH IST `scraper/lib/snapshot.ts`. Diese Datei ist eine bewusste
 * Zweitschrift und keine Abkuerzung:
 *
 * - `web/` muss allein bauen. Es geht als eigenes Buendel auf Cloudflare Pages
 *   und darf nicht davon abhaengen, dass der Scraper uebersetzt.
 * - Ein reiner Typ-Import ueber die Projektgrenze wuerde `metrics.ts`,
 *   `ranking.ts`, `pipeline.ts` und eine 250-kB-JSON-Datei in die
 *   Typaufloesung der Oberflaeche ziehen.
 *
 * Damit die Zweitschrift nicht auseinanderlaeuft, steht neben ihr ein
 * VERTRAGSTEST (`snapshot.vertrag.test.ts`), der die ECHTE Snapshot-Datei
 * liest und Feld fuer Feld gegen diese Typen prueft. Ein Typ-Import koennte
 * das nicht: Er prueft den Quelltext des Exporters, nicht seine Ausgabe.
 */

/** Die drei Trefferklassen aus N1. */
export type Trefferklasse = "top" | "normal" | "nichtBeurteilbar";

/** Die vier Sicherheitsstufen aus Entwurf 3.3. */
export type Sicherheitsstufe = "S3" | "S2" | "S1" | "S0";

/** Die drei Verfuegbarkeitszustaende aus Entwurf 6.3. */
export type Verfuegbarkeitszustand = "verfuegbar" | "unbestaetigt" | "abgaengig";

/**
 * Die Rangzahl ist ein BAND, kein Punkt (Entwurf 3.4). `unten` ist die
 * Kante bei der unguenstigen Mietannahme -- nach ihr wird sortiert (3.5).
 */
export interface Bandkanten {
  unten: number;
  oben: number;
}

export interface SnapshotObjekt {
  id: string;
  quelle: string;
  url: string | null;
  titel: string | null;
  ort: string | null;
  bundesland: string | null;
  /** Nur 242 von 18.335 Objekten tragen eine (N2). */
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
  /** Kaufpreisfaktor, die zweite Zahl neben dem DSCR (Entwurf 2.3). `null` bei S0. */
  kaufpreisfaktor: number | null;
  /** `null` bei S0 (keine Kennzahl) und bei S3 (dort steht ein Punktwert, 3.4). */
  band: Bandkanten | null;
  istSchwellenwechsler: boolean;
  zustand: Verfuegbarkeitszustand;
  /** Klartext-Gruende, keine rohen Lueckencodes (3.7). */
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
  medianDscr: number | null;
  standAlterTage: number | null;
}

export interface SnapshotKopfzeile {
  objekteGesamt: number;
  mitBelegterMiete: number;
  /** Beginn des Beobachtungsfensters (aeltestes `first_seen`), nicht eine Trefferzahl. */
  topTrefferSeit: string | null;
  anteilBundeslandgenau: number | null;
}

export interface SnapshotBetrieb {
  uebersprungeneJeLauf: { preis_auf_anfrage: number; preis_unlesbar: number } | null;
  meldebudget: { gesendet: number; hoechstens: number; zurueckgestellt: number } | null;
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

/**
 * Die Meldeschwelle auf dem DSCR (`DSCR_MELDESCHWELLE`, `scraper/lib/metrics.ts`).
 *
 * Sie steht hier NUR zum ZEICHNEN -- die Schwellenlinie im Bandstreifen und
 * ihre Beschriftung. Ueber die Trefferklasse entscheidet sie NICHT: Das hat
 * der Export bereits getan (`bestimmeTrefferklasse`, N1.1), und die
 * Oberflaeche rechnet keine Schwelle nach (Entwurf 5.3, Punkt 4 -- "zwei
 * Kopien derselben Zahl waren in diesem Projekt schon einmal der Fehler").
 */
export const DSCR_MELDESCHWELLE_ANZEIGE = 1.3;

/**
 * Karenz nach einem Abgang in Tagen (`KARENZ_TAGE`, `scraper/lib/bestand.ts`).
 *
 * Entwurf 6.4: Innerhalb der Karenz bleibt ein abgaengiges Objekt AN SEINER
 * RANGPOSITION und wird ausgegraut; erst danach wandert es in den Bereich
 * "Abgaenge". Der Snapshot liefert bewusst kein Feld dafuer (er liefert
 * `abgaengigSeit`), also zieht die Oberflaeche die Grenze.
 */
export const KARENZ_TAGE = 2;
