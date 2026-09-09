import type { SupabaseClient } from "@supabase/supabase-js";
import {
  istHartLoeschbar,
  type BekanntesListing,
  type RegionLauf,
  type SweepErgebnis,
} from "./bestand.js";
import { HISTORIE_LAENGE } from "./plausibilitaet.js";

/**
 * Supabase schneidet Ergebnisse stillschweigend ab, also unsichtbare Reihen
 * wuerden jeden Lauf neu abgerufen. Blattert stattdessen durch, bis eine
 * Seite kuerzer als die Seitengroesse ist. Absolute Decke 200_000 Reihen --
 * bei Ueberschuss wird deutlich geworfen, nie nur ein Teilergebnis zurueck.
 */
async function ladeSeitenweise<T>(
  fetchSeite: (von: number, bis: number) => Promise<{ data: T[] | null; error: any }>,
  tableName: string
): Promise<T[]> {
  const alle: T[] = [];
  const seitenGroesse = 1000;
  const absoluteDecke = 200_000;
  let seiteIndex = 0;

  while (true) {
    const von = seiteIndex * seitenGroesse;
    const bis = von + seitenGroesse - 1;

    if (von >= absoluteDecke) {
      throw new Error(
        `Tabelle '${tableName}' uebersteigt Decke von ${absoluteDecke} Reihen`
      );
    }

    const { data, error } = await fetchSeite(von, bis);
    if (error) throw error;

    const seite = data ?? [];
    alle.push(...seite);

    if (seite.length < seitenGroesse) {
      break;
    }

    seiteIndex++;
  }

  return alle;
}

export async function ladeBekannteListings(
  supabase: SupabaseClient,
  source: string
): Promise<BekanntesListing[]> {
  const zeilen = await ladeSeitenweise<{
    id: string;
    external_id: string;
    disappeared_at: string | null;
    fundort: string | null;
  }>(
    async (von, bis) =>
      supabase
        .from("listings")
        // `fundort` haelt fest, auf welcher Regionsliste das Objekt gefunden
        // wurde. Ohne diese Spalte hat ein Immowelt-Objekt keine lesbare
        // Partition, denn seine externalId ist eine nackte UUID -- siehe
        // `partitionEinesListings`.
        .select("id, external_id, disappeared_at, fundort")
        .eq("source", source)
        .range(von, bis),
    "listings"
  );
  return zeilen.map((zeile) => ({
    id: zeile.id,
    externalId: zeile.external_id,
    disappearedAt: zeile.disappeared_at,
    fundort: zeile.fundort,
  }));
}

/**
 * externalIds, deren Detailerfassung zu lange her ist. Faengt geaenderte
 * Verkehrswerte und verlegte Termine ein, ohne jeden Lauf alle Detailseiten
 * zu holen. `last_detail_at is null` faellt bewusst mit hinein: solche
 * Objekte wurden noch nie im Detail erfasst.
 */
export async function ladeVeralteteExternalIds(
  supabase: SupabaseClient,
  source: string,
  grenze: Date
): Promise<string[]> {
  const zeilen = await ladeSeitenweise<{ external_id: string }>(
    async (von, bis) =>
      supabase
        .from("listings")
        .select("external_id")
        .eq("source", source)
        .or(`last_detail_at.is.null,last_detail_at.lt.${grenze.toISOString()}`)
        .range(von, bis),
    "listings"
  );
  return zeilen.map((zeile) => zeile.external_id);
}

/**
 * Groesse eines `.in()`-Blocks. Die Grenze ist die URL-Laenge, nicht die
 * Datenbank: gemessen am 2026-09-08 gehen 641 IDs durch (25.072 B), 642
 * ergeben HTTP 400 `Bad Request`, 1.500 ergeben HTTP 414. 500 laesst Luft
 * fuer laengere Spaltennamen und zusaetzliche Filter.
 */
const BLOCKGROESSE = 500;

/**
 * Fuehrt eine Schreiboperation blockweise aus. Scheitert ein Block, wirft die
 * Funktion sofort -- ein Teilerfolg darf nie als Erfolg durchgehen. Sonst
 * gelten gesehene Objekte als nicht gesehen und werden loeschbar.
 */
async function jeBlock(
  listingIds: string[],
  schreibe: (block: string[]) => PromiseLike<{ error: any }>
): Promise<void> {
  for (let von = 0; von < listingIds.length; von += BLOCKGROESSE) {
    const { error } = await schreibe(listingIds.slice(von, von + BLOCKGROESSE));
    if (error) throw error;
  }
}

export async function markiereVerschwunden(
  supabase: SupabaseClient,
  listingIds: string[],
  zeitpunkt: Date
): Promise<void> {
  await jeBlock(listingIds, (block) =>
    supabase
      .from("listings")
      .update({ disappeared_at: zeitpunkt.toISOString() })
      .in("id", block)
  );
}

export async function hebeVerschwundenAuf(
  supabase: SupabaseClient,
  listingIds: string[]
): Promise<void> {
  await jeBlock(listingIds, (block) =>
    supabase.from("listings").update({ disappeared_at: null }).in("id", block)
  );
}

export async function aktualisiereLastSeen(
  supabase: SupabaseClient,
  listingIds: string[],
  zeitpunkt: Date
): Promise<void> {
  await jeBlock(listingIds, (block) =>
    supabase
      .from("listings")
      .update({ last_seen: zeitpunkt.toISOString() })
      .in("id", block)
  );
}

/**
 * Quellen, deren Objekte hart geloescht werden duerfen.
 *
 * ERLAUBNISLISTE, nicht Ausschlussliste: Eine neue oder unbekannte Quelle
 * wird dadurch nie geloescht, bis jemand sie hier bewusst eintraegt. Das ist
 * die dritte der drei Fail-open-Stellen aus dem B-2-Entwurf --
 * `loescheAbgelaufene` filterte gar nicht nach `source` und loeschte alles,
 * was irgendwo eine abgelaufene Karenz trug.
 *
 * Warum das bisher nicht aufgefallen ist: Nur ZVG markiert ueberhaupt etwas.
 * Gemessen am 2026-09-09 trugen genau 2 Objekte `disappeared_at`, beide von
 * ZVG. Sobald Immowelt regionsgenau markiert (Option 3), loescht dieselbe
 * Funktion die Markierten zwei Tage spaeter hart mit weg -- und genau das
 * soll Option 3 gerade nicht tun. Wer Immowelt hier eintraegt, gibt die
 * harte Loeschung frei; das ist eine bewusste Entscheidung, keine
 * Nebenwirkung.
 */
const QUELLEN_MIT_LOESCHHOHEIT = ["zvg-portal"];

/**
 * Loescht Objekte, deren Karenz abgelaufen ist. listing_versions und
 * notifications folgen per `on delete cascade`. Kommt ein Objekt spaeter
 * zurueck, legt der naechste Lauf es schlicht neu an.
 *
 * Drei unabhaengige Bedingungen muessen zutreffen: eine Quelle mit
 * Loeschhoheit (siehe QUELLEN_MIT_LOESCHHOHEIT), altes `disappeared_at` UND
 * altes `last_seen` (siehe `istHartLoeschbar`). Was dieser Lauf gesehen hat,
 * kann damit nicht geloescht werden -- unabhaengig davon, was weiter oben in
 * der Kette schiefging.
 */
export async function loescheAbgelaufene(
  supabase: SupabaseClient,
  jetzt: Date
): Promise<number> {
  const zeilen = await ladeSeitenweise<{
    id: string;
    disappeared_at: string;
    last_seen: string | null;
  }>(
    async (von, bis) =>
      supabase
        .from("listings")
        .select("id, disappeared_at, last_seen")
        // Der Filter gehoert in die Abfrage, nicht hinter sie: Sonst laedt
        // diese Funktion bei einer markierenden Immowelt-Quelle tausende
        // Zeilen, nur um sie zu verwerfen.
        .in("source", QUELLEN_MIT_LOESCHHOHEIT)
        .not("disappeared_at", "is", null)
        .range(von, bis),
    "listings"
  );

  const faellig = zeilen
    .filter((zeile) => istHartLoeschbar(zeile.disappeared_at, zeile.last_seen, jetzt))
    .map((zeile) => zeile.id);
  if (faellig.length === 0) return 0;

  await jeBlock(faellig, (block) => supabase.from("listings").delete().in("id", block));
  return faellig.length;
}

export async function speichereSweepLauf(
  supabase: SupabaseClient,
  sweep: SweepErgebnis
): Promise<void> {
  const { error } = await supabase.from("sweep_runs").insert({
    source: sweep.source,
    gemeldete_treffer: sweep.gemeldeteTreffer,
    gesehene_objekte: sweep.gesehene.size,
    vollstaendig: sweep.vollstaendig,
    geltungsbereich: sweep.geltungsbereich,
  });
  if (error) throw error;
}

/**
 * Zeile fuer `sweep_region_runs` -- die Mengenhistorie EINER Region.
 *
 * WARUM EINE EIGENE TABELLE: `ladeSweepHistorie` liest den Median aus
 * `sweep_runs` und filtert dabei nur auf `source` und `vollstaendig`.
 * Regionszeilen dort wuerden in genau diesen Median einflieszen und die
 * Wache verfaelschen, die vor einer Massenloeschung schuetzt -- eine Region
 * mit 200 Objekten neben einem Quellenlauf mit 5000 verschiebt ihn
 * beliebig. Eine getrennte Tabelle kann das strukturell nicht. Sie ist
 * ausserdem rein additiv: keine bestehende Abfrage aendert sich.
 *
 * Diese Zeilen aendern heute NICHTS am Loeschverhalten. Sie sammeln die
 * Historie, die eine spaetere regionsgenaue Loeschhoheit braucht -- die
 * greift ohnehin erst, wenn eine Region MIN_REFERENZLAEUFE eigene
 * erfolgreiche Laeufe vorweisen kann.
 */
export function regionsLaufZeile(source: string, lauf: RegionLauf): Record<string, unknown> {
  return {
    source,
    partition: lauf.partition,
    gesehene_objekte: lauf.gesehene,
    gemeldete_treffer: lauf.gemeldeteTreffer,
    vollstaendig: lauf.vollstaendig,
  };
}

/** Schreibt die Regionszeilen eines Laufs. Fehler brechen den Lauf nicht ab:
 *  diese Protokollierung ist Vorbereitung, kein Betriebsmittel. */
export async function speichereRegionsLaeufe(
  supabase: SupabaseClient,
  source: string,
  laeufe: RegionLauf[]
): Promise<void> {
  if (laeufe.length === 0) return;
  const { error } = await supabase
    .from("sweep_region_runs")
    .insert(laeufe.map((l) => regionsLaufZeile(source, l)));
  if (error) console.warn("sweep_region_runs: nicht geschrieben", error);
}

/**
 * Mengen der letzten erfolgreichen Laeufe als Referenz. Nur vollstaendige
 * Laeufe zaehlen -- ein Teillauf ist als Vergleichsmassstab wertlos.
 */
export async function ladeSweepHistorie(
  supabase: SupabaseClient,
  source: string
): Promise<number[]> {
  const { data, error } = await supabase
    .from("sweep_runs")
    .select("gesehene_objekte")
    .eq("source", source)
    .eq("vollstaendig", true)
    .order("started_at", { ascending: false })
    .limit(HISTORIE_LAENGE);
  if (error) throw error;
  return (data ?? []).map((zeile) => Number(zeile.gesehene_objekte));
}

/**
 * Wie viele Regionszeilen fuer den Rotations-Startpunkt gelesen werden. 16
 * Bundeslaender, ein paar Laeufe Reserve -- mehr als das aendert am Ergebnis
 * nichts, weil ohnehin nur der juengste Zeitpunkt je Region zaehlt. Faellt
 * eine Region aus diesem Fenster, ist sie besonders lange nicht gesweept
 * worden und wird dadurch bevorzugt gestartet: die Ungenauigkeit zeigt in die
 * ungefaehrliche Richtung.
 */
const REGIONS_HISTORIE_ZEILEN = 200;

/**
 * Wann jede Region zuletzt gesweept wurde -- Grundlage der
 * Fortsetzungsrotation (`sweepStartVersatz` in `bestand.ts`).
 *
 * Der Rueckgabewert unterscheidet zwei Faelle, die nicht verwechselt werden
 * duerfen: Eine leere Map heisst "noch nie gesweept" und startet den Lauf an
 * der ersten Region. `null` heisst "Historie nicht lesbar" und laesst den
 * Aufrufer auf die Uhr zurueckfallen -- sonst friere die Abdeckung bei der
 * ersten Region ein, sobald diese Abfrage einmal scheitert.
 */
export async function ladeLetzteRegionsSweeps(
  supabase: SupabaseClient,
  source: string
): Promise<Map<string, number> | null> {
  const { data, error } = await supabase
    .from("sweep_region_runs")
    .select("partition, started_at")
    .eq("source", source)
    .order("started_at", { ascending: false })
    .limit(REGIONS_HISTORIE_ZEILEN);
  if (error !== null || data === null) {
    console.warn("sweep_region_runs: Historie nicht lesbar, Rotation faellt auf die Uhr zurueck", error);
    return null;
  }
  const letzte = new Map<string, number>();
  for (const zeile of data as { partition: string; started_at: string }[]) {
    const zeitpunkt = Date.parse(zeile.started_at);
    if (!Number.isFinite(zeitpunkt)) continue;
    const bisher = letzte.get(zeile.partition);
    if (bisher === undefined || zeitpunkt > bisher) letzte.set(zeile.partition, zeitpunkt);
  }
  return letzte;
}
