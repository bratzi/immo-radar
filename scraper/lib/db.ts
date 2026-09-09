import type { SupabaseClient } from "@supabase/supabase-js";
import type { Kennzahlen } from "./metrics.js";
import type { MietQuelle } from "./rentEstimate.js";
import { hoechsteKlasse, type Meldeklasse } from "./meldung.js";

export interface VersionFields {
  priceCents: number;
  rentColdMonthlyCents: number | null;
  units: number | null;
}

export interface VersionDiffInput {
  previous: VersionFields | null;
  current: VersionFields;
}

export interface VersionDiffResult {
  changed: boolean;
  priceDropped: boolean;
}

export function diffVersion(input: VersionDiffInput): VersionDiffResult {
  if (input.previous === null) {
    return { changed: true, priceDropped: false };
  }
  const changed =
    input.previous.priceCents !== input.current.priceCents ||
    input.previous.rentColdMonthlyCents !== input.current.rentColdMonthlyCents ||
    input.previous.units !== input.current.units;
  const priceDropped = input.current.priceCents < input.previous.priceCents;
  return { changed, priceDropped };
}

export interface ListingVersionData {
  source: string;
  externalId: string;
  url: string;
  priceCents: number;
  rentColdMonthlyCents: number | null;
  rentSource: MietQuelle;
  livingAreaM2: number | null;
  plotAreaM2: number | null;
  units: number | null;
  unitsConfident: boolean;
  yearBuilt: number | null;
  zipCode: string;
  city: string;
  bundesland: string | null;
  title: string;
  kennzahlen: Kennzahlen;
  /**
   * Region, auf deren Ergebnisliste das Objekt gefunden wurde. null heisst
   * "nicht zuzuordnen" -- so wie eine ZVG-externalId ohne Bundeslandpraefix,
   * und mit derselben Folge: Unzuordenbares ist nie ein Abgang.
   */
  fundort?: string | null;
  auctionAt?: string | null;
  court?: string | null;
  caseNumber?: string | null;
  rawNoticeText?: string | null;
  dataGaps?: string[];
}

export interface UpsertResult extends VersionDiffResult {
  listingId: string;
  previousPriceCents: number | null;
}

/**
 * Baut die Zeile fuer listing_versions. Ausgelagert, damit die Abbildung der
 * optionalen Felder ohne Datenbank testbar ist.
 */
export function versionInsertZeile(
  listingId: string,
  data: ListingVersionData,
  diff: VersionDiffResult
): Record<string, unknown> {
  return {
    listing_id: listingId,
    price_cents: data.priceCents,
    rent_cold_monthly_cents: data.rentColdMonthlyCents,
    rent_source: data.rentSource,
    living_area_m2: data.livingAreaM2,
    plot_area_m2: data.plotAreaM2,
    units: data.units,
    units_confident: data.unitsConfident,
    year_built: data.yearBuilt,
    zip_code: data.zipCode,
    city: data.city,
    bundesland: data.bundesland,
    title: data.title,
    changed: diff.changed,
    price_dropped: diff.priceDropped,
    metrics: data.kennzahlen,
    auction_at: data.auctionAt ?? null,
    court: data.court ?? null,
    case_number: data.caseNumber ?? null,
    raw_notice_text: data.rawNoticeText ?? null,
    data_gaps: data.dataGaps ?? [],
  };
}

/**
 * Die `listings`-Zeile eines gerade erfassten Objekts. Als reine Funktion
 * herausgezogen, damit sich ohne Datenbank pruefen laesst, WAS geschrieben
 * wird -- gleiches Muster wie `versionInsertZeile`.
 */
export function listingUpsertZeile(
  data: Pick<ListingVersionData, "source" | "externalId" | "url"> & { fundort?: string | null },
  jetzt: string
): Record<string, unknown> {
  return {
    source: data.source,
    external_id: data.externalId,
    url: data.url,
    last_seen: jetzt,
    // Das Objekt wurde gerade im Detail erfasst, ist also wieder da.
    disappeared_at: null,
    last_detail_at: jetzt,
    // null = nicht zuzuordnen. Bewusst kein Default auf irgendeine Region:
    // ein falscher Fundort waere schlimmer als gar keiner, weil er ein Objekt
    // in den Geltungsbereich eines Sweeps zoege, der es nie gesehen hat.
    fundort: data.fundort ?? null,
  };
}

export async function upsertListingAndVersion(
  supabase: SupabaseClient,
  data: ListingVersionData
): Promise<UpsertResult> {
  const jetzt = new Date().toISOString();
  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .upsert(listingUpsertZeile(data, jetzt), { onConflict: "source,external_id" })
    .select()
    .single();
  if (listingError) throw listingError;

  const { data: previousVersion, error: previousVersionError } = await supabase
    .from("listing_versions")
    .select("price_cents, rent_cold_monthly_cents, units")
    .eq("listing_id", listing.id)
    .order("scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousVersionError) throw previousVersionError;

  const diff = diffVersion({
    previous: previousVersion
      ? {
          priceCents: Number(previousVersion.price_cents),
          rentColdMonthlyCents:
            previousVersion.rent_cold_monthly_cents === null
              ? null
              : Number(previousVersion.rent_cold_monthly_cents),
          units: previousVersion.units,
        }
      : null,
    current: {
      priceCents: data.priceCents,
      rentColdMonthlyCents: data.rentColdMonthlyCents,
      units: data.units,
    },
  });

  const { error: versionError } = await supabase
    .from("listing_versions")
    .insert(versionInsertZeile(listing.id, data, diff));
  if (versionError) throw versionError;

  return {
    listingId: listing.id,
    previousPriceCents: previousVersion ? Number(previousVersion.price_cents) : null,
    ...diff,
  };
}

/**
 * Der Beleg, den eine `notifications`-Zeile tragen muss, damit sie eine
 * Zustellung belegt statt sie zu behaupten (Abnahmekriterium D-1). Die
 * `message_id` kann nur Telegram vergeben; die Lauf-ID macht den Abgleich
 * zwischen Actions-Log und Datenbank exakt statt zeitfensterbasiert.
 */
export function versandBeleg(
  telegramMessageId: number | null,
  runId: string | undefined
): Record<string, unknown> {
  return { telegramMessageId, runId: runId ?? null };
}

/**
 * `logNotification` wird in ALLEN drei Aufrufern (pipeline.ts zweimal,
 * main.ts einmal) ausschliesslich NACH einem bestaetigten Versand erreicht --
 * ein Wurf aus `sendTelegramMessage` verlaesst die Funktion vorher (siehe
 * Reihenfolgetests oben). Die Erfolgszeile hier statt an jedem Aufrufer
 * einzeln zu bauen, deckt automatisch alle drei ab und kann nicht an einer
 * Stelle vergessen werden -- `sendTelegramMessage` selbst kaeme dafuer nicht
 * infrage, die kennt nur die message_id, nicht das Objekt.
 *
 * Kein personenbezogener Inhalt, keine ganze Nachricht: Das Actions-Log ist
 * oeffentlich einsehbar, sobald jemand Zugriff auf die Actions hat.
 */
export async function logNotification(
  supabase: SupabaseClient,
  listingId: string,
  kind: "top_treffer" | "pruefkandidat" | "preisaenderung" | "verschwunden",
  detail: Record<string, unknown>,
  objektKennung: string
): Promise<void> {
  const { error } = await supabase.from("notifications").insert({
    listing_id: listingId,
    kind,
    detail,
  });
  if (error) throw error;
  const messageId = (detail as { telegramMessageId?: number | null }).telegramMessageId ?? null;
  console.log(`Telegram gesendet [${kind}] message_id=${messageId ?? "unbekannt"} ${objektKennung}`);
}

/**
 * Hoechste Meldeklasse, die fuer dieses Listing je BESTAETIGT verschickt
 * wurde. Grundlage der Entscheidung, ob eine erneute Nachricht faellig ist.
 * Weil die Zeile erst nach erfolgreichem Versand entsteht, wirkt ein
 * fehlgeschlagener Versand automatisch als "noch nie gemeldet" -- der
 * naechste Lauf holt ihn nach.
 */
export async function hoechsteGemeldeteKlasse(
  supabase: SupabaseClient,
  listingId: string
): Promise<Meldeklasse> {
  const { data, error } = await supabase
    .from("notifications")
    .select("kind")
    .eq("listing_id", listingId);
  if (error) throw error;
  return hoechsteKlasse((data ?? []).map((zeile) => zeile.kind as string));
}
