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

/** Liegt das Objekt in dem, was dieser Lauf tatsaechlich gesehen hat? */
function imGeltungsbereich(sweep: SweepErgebnis, listing: BekanntesListing): boolean {
  if (sweep.geltungsbereich.length === 0) return true;
  const partition = partitionAusExternalId(sweep.source, listing.externalId);
  if (partition === null) return true;
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
