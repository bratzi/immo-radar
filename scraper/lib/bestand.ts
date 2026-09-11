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
  /**
   * Auf welcher Regionsliste dieses Objekt gefunden wurde -- `listings.fundort`.
   * `null` heisst "nicht zuzuordnen", nicht "gehoert ueberall hin": 157 Objekte
   * (8,2 %, gemessen 2026-09-08) tragen ihn nicht, Altbestand aus der Zeit, als
   * Immowelt ueber Detailseiten erfasst wurde.
   */
  fundort: string | null;
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
 * Die Partition eines bekannten Objekts -- das Bundesland, dem es zugerechnet
 * wird -- oder `null`, wenn es sich nicht zuordnen laesst.
 *
 * WARUM ES DIESE FUNKTION ZUSAETZLICH ZU `partitionAusExternalId` GIBT:
 * Letztere liest das Bundesland aus der externalId und kann das nur fuer ZVG,
 * dessen Kennung es traegt (`sn-40908`). Immowelts externalId ist eine nackte
 * UUID. Fuer jedes Immowelt-Objekt war die Partition damit `null`, und `null`
 * heisst fail-closed "nie ein Abgang" -- eine der Sperren, die verhindern,
 * dass fuer Immowelt ueberhaupt je etwas als verschwunden erkannt wird.
 *
 * Die Information liegt laengst in der Datenbank: Seit dem Umbau auf die
 * Ergebnisliste schreibt der Sweep zu jedem Objekt den Fundort mit.
 *
 * REIHENFOLGE, und sie ist eine Entscheidung: Der gespeicherte Fundort geht
 * vor. Er ist die Beobachtung eines Laufs -- "dieses Objekt stand auf der
 * Ergebnisliste dieser Region" --, waehrend die externalId eine Ableitung aus
 * einer Kennung ist. Widersprechen sich beide, gilt die Beobachtung. Der
 * Rueckfall auf die externalId bleibt trotzdem noetig: ZVG hat historisch
 * keinen Fundort gesetzt, und ohne ihn verloere ausgerechnet die einzige
 * Quelle ihre Partition, die heute wirklich loescht.
 *
 * Kein Fundort und keine lesbare externalId heisst `null`. Diese Objekte sind
 * unter keiner regionsgenauen Regel je zuzuordnen -- und damit nie ein Abgang.
 */
export function partitionEinesListings(source: string, listing: BekanntesListing): string | null {
  if (listing.fundort !== null && listing.fundort !== "") return listing.fundort;
  return partitionAusExternalId(source, listing.externalId);
}

/**
 * Liegt das Objekt in dem, was dieser Lauf tatsaechlich gesehen hat?
 *
 * Zwei Faelle, beide fail-closed:
 *
 * - **Leerer Geltungsbereich -> false.** Bis zum 2026-09-09 stand hier
 *   `true`, gelesen als "Quelle ohne Partitionierung". Das war die erste der
 *   drei Fail-open-Stellen aus dem B-2-Entwurf: Ein Lauf, in dem keine
 *   einzige Region vollstaendig durchlief, gab damit den GANZEN Bestand zum
 *   Abgleich frei und haette alles geloescht, was er nicht gesehen hat. "Kein
 *   Land belegt" heisst nicht "alle Laender belegt", es heisst "nichts
 *   belegt".
 *
 *   Gemessen kostet das heute nichts: ZVG hatte in 18 vollstaendigen Laeufen
 *   nie einen leeren Geltungsbereich (immer 11 oder 16 Laender), und fuer
 *   Immowelt ist `vollstaendig` ohnehin hart false. Es ist Vorbereitung fuer
 *   die regionsgenaue Markierung, nicht eine Verhaltensaenderung von heute.
 *
 * - **Unlesbare Partition -> false.** Eine ZVG-externalId ohne
 *   Bundesland-Praefix heisst "nicht zuzuordnen" und damit NIE ein Abgang.
 */
function imGeltungsbereich(sweep: SweepErgebnis, listing: BekanntesListing): boolean {
  if (sweep.geltungsbereich.length === 0) return false;
  const partition = partitionEinesListings(sweep.source, listing);
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
  // Beide Quellen fahren heute alles oder nichts: Immowelt setzt
  // `vollstaendig` hart auf false, und ZVG setzt es bei jedem stolpernden
  // Bundesland auf false. Diese Wache beendet die Abgangserkennung deshalb
  // bereits hier, bevor `geltungsbereich` ueberhaupt befragt wird -- die
  // regionsgenaue Verengung laeuft in der Praxis nie.
  //
  // (Immowelt FUELLT `geltungsbereich` sehr wohl, mit den Regionen, die in
  // diesem Lauf vollstaendig durchliefen. Es ist als Beleg protokolliert,
  // nicht als Loeschfilter -- ein frueherer Kommentar behauptete hier, die
  // Liste sei leer.)
  //
  // Das ist Absicht, nicht Versehen: Die Verengung passt nicht zur
  // quellenweiten Median-Pruefung in `plausibilitaet.ts`. Nimmt man ein
  // Bundesland heraus, faellt die eingesammelte Gesamtmenge um dessen Anteil
  // und die Medianpruefung schlaegt ohnehin an. Alles oder nichts ist
  // einfacher und sicherer. `geltungsbereich` wird trotzdem weiter befuellt
  // und in `sweep_runs` protokolliert -- als Beleg darueber, WELCHE Regionen
  // sauber liefen, nicht als Loeschfilter.
  if (!sweep.vollstaendig) return [];
  return nichtMehrGesehen(sweep, bekannte);
}

/**
 * Der regionsgenaue Filter, den `ermittleAbgaenge` und `ermittleMarkierungen`
 * teilen: noch nicht markiert, in einer Region, die dieser Lauf VOLLSTAENDIG
 * erfasst hat, und dort nicht mehr aufgetaucht.
 *
 * Die drei Bedingungen sind alle fail-closed. `imGeltungsbereich` gibt bei
 * leerem Geltungsbereich und bei unlesbarer Partition `false` zurueck -- ein
 * Objekt ohne Fundort (157 Stueck, Altbestand aus der Detailseiten-Aera) ist
 * damit unter keiner regionsgenauen Regel je ein Abgang.
 */
function nichtMehrGesehen(
  sweep: SweepErgebnis,
  bekannte: BekanntesListing[]
): BekanntesListing[] {
  return bekannte.filter(
    (listing) =>
      listing.disappearedAt === null &&
      imGeltungsbereich(sweep, listing) &&
      !sweep.gesehene.has(listing.externalId)
  );
}

/**
 * Welche Beweislast eine Quelle fuer das MARKIEREN tragen muss.
 *
 * Der Unterschied haengt an genau einer Frage: Darf diese Quelle hart
 * loeschen? Beantwortet wird sie von der Erlaubnisliste
 * `QUELLEN_MIT_LOESCHHOHEIT` in `bestandDb.ts` -- der einzigen Stelle im
 * Projekt, die ueber Loeschhoheit entscheidet.
 */
export interface Markierbefugnis {
  /** Steht die Quelle in `QUELLEN_MIT_LOESCHHOHEIT`? */
  hatLoeschhoheit: boolean;
  /** Ergebnis von `pruefeMengenplausibilitaet` fuer diesen Lauf. */
  quellenPruefungBestanden: boolean;
}

/**
 * Objekte, die neu als verschwunden zu MARKIEREN sind -- die Umsetzung von
 * Option 3 ("markieren ohne loeschen", Abnahmekriterium B-2).
 *
 * WARUM ES DIESE FUNKTION NEBEN `ermittleAbgaenge` GIBT: `vollstaendig`
 * beschreibt die QUELLENWEITE Beweislast, die eine LOESCHUNG verlangt. Fuer
 * Immowelt ist der Wert aus gutem Grund hart `false` -- ein Lauf, der nur so
 * viele Bundeslaender abgrast, wie ins Zeitbudget passen, kann die Quelle als
 * ganze nie belegen. Fuer eine REVERSIBLE Markierung ist diese Beweislast
 * falsch bemessen: Sie kann dort nie erbracht werden, und sie muss es auch
 * nicht. Der Schaden eines Fehlurteils ist ein paar Tage graue Darstellung,
 * zurueckgenommen beim naechsten Auftauchen (`ermittleRueckkehrer` braucht
 * dafuer ausdruecklich keinen vollstaendigen Sweep) -- nicht Datenverlust.
 *
 * Die drei Faelle:
 *
 * - **Loeschhoheit, quellenweite Pruefung nicht bestanden -> nichts.** Bei
 *   einer Quelle mit Loeschhoheit ist die Markierung der ERSTE SCHRITT DER
 *   LOESCHUNG: Nach `KARENZ_TAGE` raeumt `loescheAbgelaufene` sie hart weg.
 *   Sie traegt deshalb dieselbe Beweislast wie die Loeschung selbst.
 * - **Loeschhoheit, Pruefung bestanden -> `ermittleAbgaenge`,** also
 *   einschliesslich der `vollstaendig`-Wache. Fuer ZVG aendert sich nichts.
 * - **Keine Loeschhoheit -> der Regionsbeweis genuegt.** Markiert wird nur,
 *   wessen Fundort eine Region ist, die in DIESEM Lauf ihre Vollstaendigkeit
 *   gegen die vom Portal ausgewiesene Trefferzahl belegt hat
 *   (`istRegionVollstaendig` -> `geltungsbereich`). Das ist ein Vergleich
 *   gegen eine Live-Wahrheit, nicht gegen einen historischen Median -- die
 *   quellenweite Mengenpruefung misst bei einer rotierend erfassten Quelle
 *   ohnehin nur die Rotation (gemessen 3.361 bis 9.329 Objekte je Lauf,
 *   Faktor 2,8) und waere dort ein permanentes Nein.
 *
 * Was dadurch NICHT freigegeben wird: die harte Loeschung. Sie haengt allein
 * an `QUELLEN_MIT_LOESCHHOHEIT`, und dort steht `immowelt` nicht.
 *
 * BEWUSSTE LUECKE: `nw`, `bw` und `mv` nennen ihre Trefferzahl nirgends
 * (gemessen 2026-09-09, weder im Titel noch im Seitentext). Sie erreichen
 * `vollstaendig` und damit den Geltungsbereich nie, also wird dort auch nie
 * etwas markiert. Der zweite Vollstaendigkeitsmassstab dafuer ist
 * zurueckgestellt (A16); solange er fehlt, ist Nichtstun die richtige
 * Antwort -- `nw` allein ist 21,2 % des Bestands.
 */
export function ermittleMarkierungen(
  sweep: SweepErgebnis,
  bekannte: BekanntesListing[],
  befugnis: Markierbefugnis
): BekanntesListing[] {
  if (befugnis.hatLoeschhoheit) {
    if (!befugnis.quellenPruefungBestanden) return [];
    return ermittleAbgaenge(sweep, bekannte);
  }
  return nichtMehrGesehen(sweep, bekannte);
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

/**
 * Wie viele Abgangsmeldungen ein Lauf hoechstens verschickt.
 *
 * WARUM ES DIESE GRENZE BRAUCHT: Bis zum 2026-09-09 markierte allein ZVG,
 * und dort sind es ein bis zwei Objekte je Lauf -- die Meldeschleife lief
 * ungedeckelt, und das fiel nie auf. Mit Option 3 markiert auch Immowelt,
 * und der erste Lauf danach holt einen Rueckstand auf, der sich seit dem
 * Projektbeginn aufgestaut hat: Jedes Objekt, das je in den Chat kam und
 * inzwischen weg ist, wuerde in EINEM Lauf gemeldet.
 *
 * Dieses Projekt hat den Nutzer schon einmal geflutet -- 318 Meldungen in
 * einem Lauf, weswegen es `MAX_MELDUNGEN_JE_LAUF` ueberhaupt gibt. Eine
 * Markierung freizugeben, ohne die Meldeseite zu deckeln, waere derselbe
 * Fehler an der Nachbarstelle.
 *
 * WAS DER DECKEL KOSTET, und warum es vertretbar ist: Die ueberzaehligen
 * Abgaenge werden NICHT nachgeholt. Sie sind bereits markiert, tauchen im
 * naechsten Lauf also nicht erneut als neuer Abgang auf. Ihr Verschwinden
 * bleibt damit unbemeldet -- aber nicht unbemerkt: `disappeared_at` steht in
 * der Datenbank, und genau daraus lebt die ausgegraute Darstellung im
 * Dashboard. Der Deckel kostet eine Chat-Nachricht, keine Information.
 */
export const MAX_ABGANGSMELDUNGEN_JE_LAUF = 10;

/**
 * Schneidet die Abgangsliste auf das, was ein Lauf melden darf.
 *
 * Bewusst ohne Auswahlregel: Die Reihenfolge ist die des Bestandsabgleichs.
 * Eine Rangfolge zu erfinden ("die teuersten zuerst") waere eine Behauptung
 * darueber, welcher Abgang wichtiger ist -- und die ist nicht gemessen.
 */
export function budgetiereAbgangsmeldungen<T>(abgaenge: T[]): {
  melden: T[];
  verschwiegen: number;
} {
  return {
    melden: abgaenge.slice(0, MAX_ABGANGSMELDUNGEN_JE_LAUF),
    verschwiegen: Math.max(0, abgaenge.length - MAX_ABGANGSMELDUNGEN_JE_LAUF),
  };
}
