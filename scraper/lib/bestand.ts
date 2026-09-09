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
   * Diese Quelle ist AUS PRINZIP nur teilweise erfasst: die Ratenbegrenzung
   * (Anti-Bot-CAPTCHA unter Last) erzwingt eine rotierende Scheibe pro Lauf.
   * Ihre Unvollstaendigkeit ist damit ERWARTET und darf nicht als Anomalie
   * gemeldet werden -- eine Warnung, die jeden Lauf feuert, trainiert den
   * Leser darauf, den Kanal zu ignorieren. Eine Loeschung autorisiert dieser
   * Wert so oder so nie; das entscheidet allein `vollstaendig`.
   */
  strukturellTeilweise: boolean;
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

/**
 * Was eine einzelne Region in einem Lauf geliefert hat. Grundlage der
 * spaeteren regionsgenauen Loeschhoheit -- heute nur protokolliert.
 */
export interface RegionLauf {
  /** Bundeslandkuerzel, z. B. "he". */
  partition: string;
  gesehene: number;
  gemeldeteTreffer: number | null;
  vollstaendig: boolean;
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
 * heraus, dessen Startpunkt mit `versatz` wandert. Ist die Liste KUERZER als
 * das Budget, kommt sie unveraendert zurueck. Ist sie genau so lang, kommt sie
 * vollstaendig zurueck, aber am wandernden Startpunkt aufgeschnitten -- so
 * laesst sich mit `budget == kandidaten.length` die ganze Liste rotieren,
 * ohne die Rotationsarithmetik ein zweites Mal auszuschreiben.
 *
 * Warum der wandernde Start: ohne ihn griffe jeder Lauf immer denselben
 * Listenkopf und liesse das Ende auf ewig unbearbeitet. `versatz` wird aus der
 * Uhr abgeleitet (Stunden seit Epoche) -- kein persistenter Zustand, keine
 * neue Abhaengigkeit, gleiche Mechanik wie frueher die Bundesland-Rotation.
 */
/**
 * Waehlt die Kandidatenscheibe eines Laufs und formuliert dazu die Log-Zeile.
 *
 * Beides zusammen, weil die Meldung sonst behauptet, was die Auswahl nicht
 * haelt: Die Vorgaengerin sagte "RUECKSTAND N auf spaetere Laeufe
 * zurueckgestellt". Gemessen am 2026-09-08 traf das nicht zu -- die Auswahl
 * verschob sich um 3 von 600 Eintraegen je Lauf. Die Zeile sagt jetzt nur
 * noch, was in DIESEM Lauf geschah.
 */
export function budgetiereKandidaten(
  quelle: string,
  budget: number,
  kandidaten: string[],
  versatz: number
): { auswahl: string[]; meldung: string } {
  const auswahl = streueAuswahl(kandidaten, budget, versatz);
  const unbearbeitet = kandidaten.length - auswahl.length;
  const meldung =
    `${quelle}: ${auswahl.length} von ${kandidaten.length} Kandidaten in diesem Lauf ` +
    `bearbeitet, ueber die Liste gestreut. ` +
    (unbearbeitet === 0
      ? `Keiner bleibt uebrig.`
      : `${unbearbeitet} bleiben in diesem Lauf unbearbeitet.`);
  return { auswahl, meldung };
}

/**
 * Waehlt hoechstens `budget` Eintraege, die ueber die GANZE Liste gestreut
 * sind, statt sie wie `rotiereAuswahl` zusammenhaengend herauszuschneiden.
 *
 * Warum es beides gibt: Der Sweep rotiert die 16 Bundeslaender und braucht
 * dort ein zusammenhaengendes Fenster -- die Reihenfolge ist der Zweck. Die
 * Bewertungsauswahl braucht das Gegenteil. Gemessen am 2026-09-08 (Lauf
 * 34215003141) schnitt das zusammenhaengende Fenster 560 von 597 Objekten aus
 * einem einzigen Bundesland, weil Nordrhein-Westfalen 73 % der Liste stellt.
 *
 * Und es wanderte kaum: Das Fenster ist 600 breit, der Versatz waechst 1 je
 * Stunde, der Cron laeuft alle 3 Stunden -- 597 von 600 Eintraegen waren im
 * Folgelauf dieselben. Nordrhein-Westfalen haette so 6895/48 = 144 Laeufe
 * gebraucht, also rund 287 Tage, bis es einmal vollstaendig bewertet ist.
 */
export function streueAuswahl(kandidaten: string[], budget: number, versatz: number): string[] {
  if (kandidaten.length <= budget) return kandidaten;
  const n = kandidaten.length;
  const start = ((versatz % n) + n) % n;
  const auswahl: string[] = [];
  for (let i = 0; i < budget; i += 1) {
    // Der Abstand ist n/budget als BRUCH, nicht als abgerundete ganze Zahl.
    // Ein fester Abstand floor(n/budget) deckt nur budget*floor(n/budget)
    // Positionen ab und laesst den Rest als ein zusammenhaengendes Loch: beim
    // Band vom 2026-09-08 waren das 9000 von 9334 Positionen, und Hamburg fiel
    // von ~28 anteiligen Plaetzen auf 7. Mit dem Bruch liegt der letzte Index
    // bei n - ceil(n/budget), das Fenster umspannt also den ganzen Ring.
    //
    // Verschieden sind die Indizes weiterhin: n > budget ist oben schon
    // sichergestellt, also waechst floor(i * n / budget) mit jedem Schritt um
    // mindestens 1.
    auswahl.push(kandidaten[(start + Math.floor((i * n) / budget)) % n]);
  }
  return auswahl;
}

export function rotiereAuswahl(kandidaten: string[], budget: number, versatz: number): string[] {
  if (kandidaten.length < budget) return kandidaten;
  const start = ((versatz % kandidaten.length) + kandidaten.length) % kandidaten.length;
  const fenster: string[] = [];
  for (let i = 0; i < budget; i += 1) {
    fenster.push(kandidaten[(start + i) % kandidaten.length]);
  }
  return fenster;
}

/**
 * Startindex der Regionsrotation eines Sweeps.
 *
 * Frueher war das die Wanduhr: `Math.floor(Date.now() / 3_600_000) % 16`. Das
 * war der Grund, warum die Abdeckung so langsam wuchs. Das Zeitbudget eines
 * Laufs (SWEEP_BUDGET_MS = 12 min) reicht fuer genau eine grosse Region --
 * `nw` allein braucht 173 Seiten -- also war jede grosse Region praktisch nur
 * von EINEM der 16 Startindizes aus erreichbar, und welcher das ist, entschied
 * die Cron-Uhrzeit. Monte-Carlo ueber 3.000 Durchlaeufe (Entwurf 2026-09-08,
 * `specs/2026-09-08-immowelt-abgaenge-optionen.md`): volle Abdeckung in 5,7
 * statt 13,1 Tagen, 90. Perzentil 7,6 statt 20,2 -- ohne einen einzigen
 * zusaetzlichen Abruf.
 *
 * Fortgeschrieben wird NICHT ueber einen Zaehler, sondern aus der Historie in
 * `sweep_region_runs`: Startpunkt ist die Region, die am laengsten nicht
 * gesweept wurde; bei Gleichstand entscheidet die Listenreihenfolge. Fuer die
 * zusammenhaengenden Fenster, die `rotiereAuswahl` schneidet, ist das exakt
 * "weitermachen, wo der letzte Lauf aufhoerte" -- aber es heilt sich selbst,
 * wenn eine Region ausfaellt oder ein Cron-Termin ausfaellt. Ein Zaehler
 * koennte das nicht.
 *
 * Warum der Gleichstand ueber die Listenreihenfolge laeuft: Alle Zeilen eines
 * Laufs werden in EINEM Insert geschrieben und tragen deshalb denselben
 * `started_at`. Innerhalb eines Laufs ist die Reihenfolge also gar nicht
 * unterscheidbar; verlaesslich ist nur der Vergleich ZWISCHEN Laeufen, und
 * genau darauf stuetzt sich diese Funktion.
 *
 * `letzteSweeps === null` heisst "Historie nicht lesbar", nicht "leer". Dann
 * bleibt es bei der Uhr: ein fester Start bei Index 0 wuerde die Abdeckung auf
 * die erste Region einfrieren, sobald die Abfrage einmal scheitert.
 */
export function sweepStartVersatz(
  codes: string[],
  letzteSweeps: Map<string, number> | null,
  jetztMs: number
): number {
  if (letzteSweeps === null) return Math.floor(jetztMs / 3_600_000);
  let bester = 0;
  // Nie gesweept ist aelter als jeder Zeitstempel.
  let aeltester = Number.POSITIVE_INFINITY;
  for (let i = 0; i < codes.length; i += 1) {
    const zuletzt = letzteSweeps.get(codes[i]) ?? Number.NEGATIVE_INFINITY;
    if (zuletzt < aeltester) {
      aeltester = zuletzt;
      bester = i;
    }
  }
  return bester;
}
