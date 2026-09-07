import type { SupabaseClient } from "@supabase/supabase-js";
import { istKarenzAbgelaufen, type BekanntesListing, type SweepErgebnis } from "./bestand.js";
import { HISTORIE_LAENGE } from "./plausibilitaet.js";

/** Supabase deckelt Ergebnismengen; explizit hochsetzen statt still zu kuerzen. */
const MAX_ZEILEN = 10_000;

export async function ladeBekannteListings(
  supabase: SupabaseClient,
  source: string
): Promise<BekanntesListing[]> {
  const { data, error } = await supabase
    .from("listings")
    .select("id, external_id, disappeared_at")
    .eq("source", source)
    .limit(MAX_ZEILEN);
  if (error) throw error;
  return (data ?? []).map((zeile) => ({
    id: zeile.id as string,
    externalId: zeile.external_id as string,
    disappearedAt: (zeile.disappeared_at as string | null) ?? null,
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
  const { data, error } = await supabase
    .from("listings")
    .select("external_id")
    .eq("source", source)
    .or(`last_detail_at.is.null,last_detail_at.lt.${grenze.toISOString()}`)
    .limit(MAX_ZEILEN);
  if (error) throw error;
  return (data ?? []).map((zeile) => zeile.external_id as string);
}

export async function markiereVerschwunden(
  supabase: SupabaseClient,
  listingIds: string[],
  zeitpunkt: Date
): Promise<void> {
  if (listingIds.length === 0) return;
  const { error } = await supabase
    .from("listings")
    .update({ disappeared_at: zeitpunkt.toISOString() })
    .in("id", listingIds);
  if (error) throw error;
}

export async function hebeVerschwundenAuf(
  supabase: SupabaseClient,
  listingIds: string[]
): Promise<void> {
  if (listingIds.length === 0) return;
  const { error } = await supabase
    .from("listings")
    .update({ disappeared_at: null })
    .in("id", listingIds);
  if (error) throw error;
}

export async function aktualisiereLastSeen(
  supabase: SupabaseClient,
  listingIds: string[],
  zeitpunkt: Date
): Promise<void> {
  if (listingIds.length === 0) return;
  const { error } = await supabase
    .from("listings")
    .update({ last_seen: zeitpunkt.toISOString() })
    .in("id", listingIds);
  if (error) throw error;
}

/**
 * Loescht Objekte, deren Karenz abgelaufen ist. listing_versions und
 * notifications folgen per `on delete cascade`. Kommt ein Objekt spaeter
 * zurueck, legt der naechste Lauf es schlicht neu an.
 */
export async function loescheAbgelaufene(
  supabase: SupabaseClient,
  jetzt: Date
): Promise<number> {
  const { data, error } = await supabase
    .from("listings")
    .select("id, disappeared_at")
    .not("disappeared_at", "is", null)
    .limit(MAX_ZEILEN);
  if (error) throw error;

  const faellig = (data ?? [])
    .filter((zeile) => istKarenzAbgelaufen(zeile.disappeared_at as string, jetzt))
    .map((zeile) => zeile.id as string);
  if (faellig.length === 0) return 0;

  const { error: loeschFehler } = await supabase.from("listings").delete().in("id", faellig);
  if (loeschFehler) throw loeschFehler;
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
