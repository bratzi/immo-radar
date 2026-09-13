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

/**
 * Ein Objekt festhalten, das die Quelle ohne Preis anbietet.
 *
 * "Preis auf Anfrage" ist bei Immowelt gemessen kein Parserfehler, sondern
 * eine Aussage der Quelle (A13 Schritt 2). Ohne Preis ist nichts zu rechnen,
 * und ein erfundener Preis waere schlimmer als gar keiner. Das Objekt bekommt
 * deshalb eine listings-Zeile und KEINE listing_versions-Zeile -- ohne
 * Migration und ohne dass eine einzige Metrik eine Zeile ohne Preis zu sehen
 * bekommt.
 *
 * **Die Funktion ist quellenunabhaengig gebaut, aufgerufen wird sie heute
 * aber nur fuer Immowelt.** Der ZVG-Fall (das Gericht laesst den
 * Verkehrswert aus, A6 -- gemessen drei stehende IDs ueber acht Laeufe)
 * verwirft das Objekt weiterhin in `scrapers/zvg-portal/index.ts`. A-4 ist
 * damit **zur Haelfte** geschlossen, nicht ganz; die Entscheidung des
 * Nutzers vom 2026-09-11 galt ausdruecklich fuer beide Quellen
 * (`specs/2026-09-09-offene-entscheidungen.md`, Entscheidung 2).
 *
 * Und auch fuer Immowelt gilt der Anspruch nur innerhalb der
 * Rotationsscheibe: Eine Zeile bekommt nur, wer in `immoweltAuswahl` liegt
 * (hoechstens 600 von mehreren tausend gesehenen Objekten). Preislose
 * Objekte ausserhalb der Scheibe fallen in diesem Lauf weiterhin durch und
 * werden von der Rotation erst spaeter eingeholt.
 *
 * `last_detail_at` bleibt leer: Es wurde keine Detailseite gelesen, und ein
 * gesetzter Wert hielte das Objekt aus `ladeVeralteteExternalIds` heraus.
 * **Achtung beim Verdrahten von ZVG:** Genau deshalb landen die drei
 * preislosen ZVG-Faelle dann in jedem Lauf in `zvgVeraltet` und verbrauchen
 * Detailbudget fuer etwas, das das Gericht nie nachliefert.
 */
export async function upsertListingOhneBewertung(
  supabase: SupabaseClient,
  daten: { source: string; externalId: string; url: string; fundort: string | null }
): Promise<void> {
  const jetzt = new Date().toISOString();
  const { error } = await supabase.from("listings").upsert(
    { ...listingUpsertZeile(daten, jetzt), last_detail_at: null },
    { onConflict: "source,external_id" }
  );
  if (error) throw error;
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
  // Fail-closed: Die Zeile behauptet "gesendet", also muss der Versand belegt
  // sein. Belegt ist er allein durch die von Telegram bestaetigte message_id.
  // Sich stattdessen darauf zu stuetzen, dass alle Aufrufer erst nach einem
  // geglueckten Versand hierherkommen, waere eine Annahme ueber Code in einer
  // anderen Datei -- heute wahr, und von einem kuenftigen vierten Aufrufer
  // still zu brechen. Frueher stand hier "message_id=unbekannt": eine
  // Erfolgsmeldung ohne Erfolg.
  const messageId = (detail as { telegramMessageId?: number | null }).telegramMessageId ?? null;
  if (messageId === null) return;
  console.log(`Telegram gesendet [${kind}] message_id=${messageId} ${objektKennung}`);
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

/**
 * Welche dieser Objekte je eine **klassifizierte** Meldung ausgeloest haben,
 * also `pruefkandidat` oder `top_treffer` (siehe `hoechsteKlasse`).
 *
 * **Eine reine `preisaenderung` zaehlt bewusst nicht.** Das Objekt stand dann
 * zwar im Chat, aber nie mit einer Meldeklasse; der Aufrufer benutzt diese
 * Menge, um zu entscheiden, wer eine Abgangsmeldung verdient, und eine
 * Preissenkung allein begruendet kein Interesse am Abgang. Der Name sagte
 * frueher "je eine Meldung" und versprach damit mehr, als hier geprueft wird.
 *
 * Blockweise, weil die URL-Laenge die Zahl der IDs in einem `.in()`
 * begrenzt: gemessen am 2026-09-08 liefern 641 IDs HTTP 200 und 642
 * HTTP 400. Dieselbe Grenze, an der schon der Bestandsabgleich zerbrochen
 * ist.
 *
 * **Innerhalb** eines Blocks wird zusaetzlich per Keyset geblaettert. Ein
 * Block umfasst 500 Objekte, die zusammen beliebig viele
 * `notifications`-Zeilen tragen koennen -- PostgREST schneidet still ab,
 * sobald es mehr sind, als der Server herausgibt. Eine abgeschnittene
 * Antwort hiesse "dieses Objekt wurde nie gemeldet": es wuerde markiert,
 * faellt aus `melden` heraus, wird nicht als `verschwiegen` gezaehlt und
 * taucht nie wieder als neuer Abgang auf -- **fuer immer stumm**. Das ist
 * derselbe Ausfallmodus, den `3f8c7d8` geschlossen hat, nur durch eine
 * andere Tuer. Gemessen am Testdoppel: ohne Blaetterung fand die Funktion
 * bei 500 Objekten mit je drei Meldungen nur 334 davon.
 */
export async function bereitsGemeldeteListingIds(
  supabase: SupabaseClient,
  listingIds: string[]
): Promise<Set<string>> {
  const gefunden = new Set<string>();
  const blockGroesse = 500;
  const seitenGroesse = 1000;
  for (let von = 0; von < listingIds.length; von += blockGroesse) {
    const block = listingIds.slice(von, von + blockGroesse);
    let nachId: string | null = null;
    while (true) {
      let abfrage = supabase
        .from("notifications")
        .select("id, listing_id, kind")
        .in("listing_id", block)
        .order("id", { ascending: true });
      if (nachId !== null) abfrage = abfrage.gt("id", nachId);
      const { data, error } = await abfrage.limit(seitenGroesse);
      if (error) throw error;

      const seite = data ?? [];
      for (const zeile of seite) {
        if (hoechsteKlasse([zeile.kind as string]) !== "keine") {
          gefunden.add(zeile.listing_id as string);
        }
      }
      if (seite.length < seitenGroesse) break;
      nachId = seite[seite.length - 1].id as string;
    }
  }
  return gefunden;
}
