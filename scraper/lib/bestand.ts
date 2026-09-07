/** Karenz zwischen Verschwinden und harter Loeschung. */
export const KARENZ_TAGE = 2;

const KARENZ_MS = KARENZ_TAGE * 24 * 60 * 60 * 1000;

/** ZVG-externalIds haben die Form "<bundesland>-<zvg_id>", z. B. "sn-40908". */
const ZVG_PARTITION_PATTERN = /^([a-z]{2})-\d+$/;

/**
 * Ergebnis eines Sweeps: die Ist-Menge einer Quelle in diesem Lauf, samt der
 * Information, WIE WEIT man ihr trauen darf.
 */
export interface SweepErgebnis {
  source: string;
  /** Lief der Sweep sauber durch? Nur dann darf ueberhaupt geloescht werden. */
  vollstaendig: boolean;
  /**
   * Partitionen, die sauber durchliefen (ZVG: Bundesland-Kuerzel).
   * Leer = die Quelle kennt keine Partitionierung, es gilt der ganze Bestand.
   */
  geltungsbereich: string[];
  /** Alle im Sweep gesehenen externalIds. */
  gesehene: Set<string>;
  /** Vom Portal ausgewiesene Trefferzahl; null, wenn es keine nennt. */
  gemeldeteTreffer: number | null;
}

export interface BekanntesListing {
  id: string;
  externalId: string;
  /** ISO-Zeitpunkt oder null, wenn das Objekt regulaer im Angebot ist. */
  disappearedAt: string | null;
}

/**
 * Partition eines Objekts, oder null wenn die Quelle nicht partitioniert ist.
 * Das Bundesland steckt bereits in der ZVG-externalId -- ein zusaetzlicher
 * Datenbank-Zugriff ist dafuer nicht noetig.
 */
export function partitionAusExternalId(source: string, externalId: string): string | null {
  if (source !== "zvg-portal") return null;
  const treffer = externalId.match(ZVG_PARTITION_PATTERN);
  return treffer === null ? null : treffer[1];
}

/**
 * Liegt das Objekt in dem, was dieser Lauf tatsaechlich gesehen hat?
 *
 * Eine unlesbare Partition (ZVG-externalId ohne Bundesland-Praefix) heisst
 * "nicht zuzuordnen" und damit NIE ein Abgang. Frueher galt sie als
 * unpartitioniert und war damit loeschbar -- ein Fail-open in
 * Loeschrichtung. Der leere Geltungsbereich weiter oben bleibt davon
 * unberuehrt: er bedeutet "Quelle ohne Partitionierung" (Immowelt) und wird
 * ohnehin nur erreicht, wenn `vollstaendig` bereits true ist.
 */
function imGeltungsbereich(sweep: SweepErgebnis, listing: BekanntesListing): boolean {
  if (sweep.geltungsbereich.length === 0) return true;
  const partition = partitionAusExternalId(sweep.source, listing.externalId);
  if (partition === null) return false;
  return sweep.geltungsbereich.includes(partition);
}

/**
 * Objekte, die neu als verschwunden zu markieren sind: im Geltungsbereich
 * eines VOLLSTAENDIGEN Sweeps nicht mehr gesehen und noch nicht markiert.
 */
export function ermittleAbgaenge(
  sweep: SweepErgebnis,
  bekannte: BekanntesListing[]
): BekanntesListing[] {
  // Beide Quellen fahren alles oder nichts: Immowelt liefert einen leeren
  // `geltungsbereich`, und ZVG setzt bei jedem stolpernden Bundesland
  // `vollstaendig` auf false. Diese Wache beendet die Abgangserkennung
  // deshalb bereits hier, bevor `geltungsbereich` ueberhaupt befragt wird --
  // die regionsgenaue Verengung laeuft in der Praxis nie.
  //
  // Das ist Absicht, nicht Versehen: Die Verengung passt nicht zur
  // quellenweiten Median-Pruefung in `plausibilitaet.ts`. Nimmt man ein
  // Bundesland heraus, faellt die eingesammelte Gesamtmenge um dessen Anteil
  // und die Medianpruefung schlaegt ohnehin an. Alles oder nichts ist
  // einfacher und sicherer. `geltungsbereich` wird trotzdem weiter befuellt
  // und in `sweep_runs` protokolliert -- als Beleg darueber, WELCHE Regionen
  // sauber liefen, nicht als Loeschfilter.
  if (!sweep.vollstaendig) return [];
  return bekannte.filter(
    (listing) =>
      listing.disappearedAt === null &&
      imGeltungsbereich(sweep, listing) &&
      !sweep.gesehene.has(listing.externalId)
  );
}

/**
 * Bereits markierte Objekte, die wieder aufgetaucht sind. Anders als beim
 * Loeschen wird hier auch aus einem unvollstaendigen Sweep gefolgert: das
 * Zuruecknehmen einer Markierung vernichtet keine Daten.
 */
export function ermittleRueckkehrer(
  sweep: SweepErgebnis,
  bekannte: BekanntesListing[]
): BekanntesListing[] {
  return bekannte.filter(
    (listing) => listing.disappearedAt !== null && sweep.gesehene.has(listing.externalId)
  );
}

/** true, wenn die Karenz abgelaufen ist und hart geloescht werden darf. */
export function istKarenzAbgelaufen(disappearedAt: string, jetzt: Date): boolean {
  return jetzt.getTime() - new Date(disappearedAt).getTime() > KARENZ_MS;
}

/**
 * Zweite, unabhaengige Bedingung fuer die harte Loeschung: `last_seen` muss
 * ebenfalls aelter als die Karenz sein.
 *
 * Sowohl der Upsert (`db.ts`) als auch `aktualisiereLastSeen` (`main.ts`)
 * frischen `last_seen` fuer alles auf, was der Sweep gesehen hat. Ein in
 * diesem Lauf gesehenes Objekt kann damit nicht geloescht werden, egal was
 * weiter oben schiefging -- ein veraltetes `disappeared_at`, ein Fehler beim
 * Zuruecknehmen der Markierung, ein Bug in der Abgangslogik. Guertel und
 * Hosentraeger vor der zerstoerendsten Operation im Projekt.
 *
 * Fehlt `last_seen`, wird NICHT geloescht: keine Angabe ist kein Freibrief.
 */
export function istHartLoeschbar(
  disappearedAt: string,
  lastSeen: string | null,
  jetzt: Date
): boolean {
  if (!istKarenzAbgelaufen(disappearedAt, jetzt)) return false;
  if (lastSeen === null) return false;
  const lastSeenMs = new Date(lastSeen).getTime();
  if (!Number.isFinite(lastSeenMs)) return false;
  return jetzt.getTime() - lastSeenMs > KARENZ_MS;
}

/**
 * Welche Objekte brauchen eine Detailseite? Neue immer; bekannte nur, wenn
 * ihre letzte Detailerfassung zu lange her ist. Nach dem ersten vollen Lauf
 * ist diese Menge fast leer -- genau das macht den vollstaendigen Sweep
 * ueberhaupt bezahlbar. Gilt quellenunabhaengig fuer Immowelt wie ZVG.
 */
export function waehleDetailKandidaten(
  gesehene: string[],
  bekannte: Set<string>,
  veraltete: Set<string>
): string[] {
  return gesehene.filter((id) => !bekannte.has(id) || veraltete.has(id));
}

/**
 * Schneidet aus `kandidaten` ein Fenster von hoechstens `budget` Eintraegen
 * heraus, dessen Startpunkt mit `versatz` wandert. Passt die ganze Liste ins
 * Budget, kommt sie unveraendert zurueck.
 *
 * Warum der wandernde Start: ohne ihn griffe jeder Lauf immer denselben
 * Listenkopf und liesse das Ende auf ewig unbearbeitet. `versatz` wird aus der
 * Uhr abgeleitet (Stunden seit Epoche) -- kein persistenter Zustand, keine
 * neue Abhaengigkeit, gleiche Mechanik wie frueher die Bundesland-Rotation.
 */
export function rotiereAuswahl(kandidaten: string[], budget: number, versatz: number): string[] {
  if (kandidaten.length <= budget) return kandidaten;
  const start = ((versatz % kandidaten.length) + kandidaten.length) % kandidaten.length;
  const fenster: string[] = [];
  for (let i = 0; i < budget; i += 1) {
    fenster.push(kandidaten[(start + i) % kandidaten.length]);
  }
  return fenster;
}
