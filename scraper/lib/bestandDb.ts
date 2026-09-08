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
  }>(
    async (von, bis) =>
      supabase
        .from("listings")
        .select("id, external_id, disappeared_at")
        .eq("source", source)
        .range(von, bis),
    "listings"
  );
  return zeilen.map((zeile) => ({
    id: zeile.id,
    externalId: zeile.external_id,
    disappearedAt: zeile.disappeared_at,
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
 * Loescht Objekte, deren Karenz abgelaufen ist. listing_versions und
 * notifications folgen per `on delete cascade`. Kommt ein Objekt spaeter
 * zurueck, legt der naechste Lauf es schlicht neu an.
 *
 * Zwei unabhaengige Bedingungen muessen zutreffen (siehe `istHartLoeschbar`):
 * altes `disappeared_at` UND altes `last_seen`. Was dieser Lauf gesehen hat,
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
