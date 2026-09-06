import type { SupabaseClient } from "@supabase/supabase-js";
import type { Kennzahlen } from "./metrics.js";
import type { MietQuelle } from "./rentEstimate.js";

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

export async function upsertListingAndVersion(
  supabase: SupabaseClient,
  data: ListingVersionData
): Promise<UpsertResult> {
  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .upsert(
      { source: data.source, external_id: data.externalId, url: data.url, last_seen: new Date().toISOString() },
      { onConflict: "source,external_id" }
    )
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

  const { error: versionError } = await supabase.from("listing_versions").insert({
    listing_id: listing.id,
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
  });
  if (versionError) throw versionError;

  return {
    listingId: listing.id,
    previousPriceCents: previousVersion ? Number(previousVersion.price_cents) : null,
    ...diff,
  };
}

export async function logNotification(
  supabase: SupabaseClient,
  listingId: string,
  kind: "top_treffer" | "preisaenderung",
  detail: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from("notifications").insert({
    listing_id: listingId,
    kind,
    detail,
  });
  if (error) throw error;
}
