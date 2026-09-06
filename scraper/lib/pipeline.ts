import type { SupabaseClient } from "@supabase/supabase-js";
import { grunderwerbsteuerSatz, bundeslandFuerPlz } from "./grunderwerbsteuer.js";
import { berechneKennzahlen } from "./metrics.js";
import { ermittleJahreskaltmiete } from "./rentEstimate.js";
import { upsertListingAndVersion, logNotification } from "./db.js";
import {
  sendTelegramMessage,
  formatTopTrefferMessage,
  formatZvgTopTrefferMessage,
  formatPreisaenderungMessage,
  type TelegramConfig,
  type ListingSummary,
} from "./telegram.js";

const MIN_EINHEITEN = 3;
/** Mindestabstand zwischen zwei Telegram-Sendungen, damit der erste Lauf
 *  (alles ist "changed") nicht in ein Rate-Limit laeuft. */
const TELEGRAM_SENDEABSTAND_MS = 500;

function schlafe(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface EinheitenAuswertung {
  ausschliessen: boolean;
  einheitenFuerBerechnung: number;
  dataGaps: string[];
}

export function bewerteEinheiten(units: number | null, unitsConfident: boolean): EinheitenAuswertung {
  if (unitsConfident && units !== null && units < MIN_EINHEITEN) {
    return { ausschliessen: true, einheitenFuerBerechnung: units, dataGaps: [] };
  }
  if (!unitsConfident || units === null) {
    return { ausschliessen: false, einheitenFuerBerechnung: units ?? MIN_EINHEITEN, dataGaps: ["units_unconfirmed"] };
  }
  return { ausschliessen: false, einheitenFuerBerechnung: units, dataGaps: [] };
}

export interface PipelineCandidate {
  source: string;
  externalId: string;
  url: string;
  title: string;
  priceCents: number;
  livingAreaM2: number | null;
  plotAreaM2: number | null;
  units: number | null;
  unitsConfident: boolean;
  yearBuilt: number | null;
  zipCode: string;
  city: string;
  rentColdMonthly: number | null;
  auctionAt: string | null;
  court: string | null;
  caseNumber: string | null;
  rawNoticeText: string | null;
  /** Luecken, die bereits die Quelle beim Parsen festgestellt hat (z. B.
   *  "location_unconfirmed"). Wird mit den Einheiten-Luecken zusammengefuehrt. */
  sourceDataGaps?: string[];
}

export async function processCandidate(
  supabase: SupabaseClient,
  telegramConfig: TelegramConfig,
  candidate: PipelineCandidate
): Promise<void> {
  const einheiten = bewerteEinheiten(candidate.units, candidate.unitsConfident);
  if (einheiten.ausschliessen) {
    console.log(
      `Übersprungen (Einheiten bestätigt: ${candidate.units}, benötigt >=${MIN_EINHEITEN}): ${candidate.title}`
    );
    return;
  }

  const dataGaps = Array.from(new Set([...(candidate.sourceDataGaps ?? []), ...einheiten.dataGaps]));

  const miete = ermittleJahreskaltmiete(candidate.rentColdMonthly, candidate.livingAreaM2 ?? 0);
  const satz = grunderwerbsteuerSatz(candidate.zipCode);
  const bundesland = bundeslandFuerPlz(candidate.zipCode);
  const kennzahlen = berechneKennzahlen(
    {
      kaufpreis: candidate.priceCents / 100,
      jahreskaltmiete: miete.jahreskaltmiete,
      einheiten: einheiten.einheitenFuerBerechnung,
      baujahr: candidate.yearBuilt,
      wohnflaecheM2: candidate.livingAreaM2 ?? 0,
    },
    satz
  );

  const diff = await upsertListingAndVersion(supabase, {
    source: candidate.source,
    externalId: candidate.externalId,
    url: candidate.url,
    priceCents: candidate.priceCents,
    rentColdMonthlyCents: candidate.rentColdMonthly === null ? null : Math.round(candidate.rentColdMonthly * 100),
    rentSource: miete.quelle,
    livingAreaM2: candidate.livingAreaM2,
    plotAreaM2: candidate.plotAreaM2,
    units: candidate.units,
    unitsConfident: candidate.unitsConfident,
    yearBuilt: candidate.yearBuilt,
    zipCode: candidate.zipCode,
    city: candidate.city,
    bundesland,
    title: candidate.title,
    kennzahlen,
    auctionAt: candidate.auctionAt,
    court: candidate.court,
    caseNumber: candidate.caseNumber,
    rawNoticeText: candidate.rawNoticeText,
    dataGaps,
  });

  const listingSummary: ListingSummary = {
    title: candidate.title,
    url: candidate.url,
    city: candidate.city,
    zipCode: candidate.zipCode,
    priceCents: candidate.priceCents,
    units: candidate.units,
    dataGaps,
  };

  try {
    if (diff.changed && kennzahlen.topTreffer) {
      const kennzahlenSummary = {
        kaufpreisfaktor: kennzahlen.kaufpreisfaktor,
        geschaetzterDscr: kennzahlen.geschaetzterDscr,
        mietQuelle: miete.quelle,
      };
      const text =
        candidate.source === "zvg-portal" && candidate.court && candidate.auctionAt && candidate.caseNumber
          ? formatZvgTopTrefferMessage(
              {
                ...listingSummary,
                court: candidate.court,
                auctionAt: candidate.auctionAt,
                caseNumber: candidate.caseNumber,
                rawNoticeText: candidate.rawNoticeText,
              },
              kennzahlenSummary
            )
          : formatTopTrefferMessage(listingSummary, kennzahlenSummary);
      await schlafe(TELEGRAM_SENDEABSTAND_MS);
      await sendTelegramMessage(telegramConfig, text);
      await logNotification(supabase, diff.listingId, "top_treffer", {
        ...kennzahlenSummary,
        priceCents: candidate.priceCents,
      });
    }

    if (diff.priceDropped && diff.previousPriceCents !== null) {
      await schlafe(TELEGRAM_SENDEABSTAND_MS);
      await sendTelegramMessage(
        telegramConfig,
        formatPreisaenderungMessage(listingSummary, diff.previousPriceCents, candidate.priceCents)
      );
      await logNotification(supabase, diff.listingId, "preisaenderung", {
        altPreisCents: diff.previousPriceCents,
        neuPreisCents: candidate.priceCents,
      });
    }
  } catch (err) {
    console.error(`Benachrichtigung fehlgeschlagen fuer "${candidate.title}" (${candidate.url}):`, err);
  }
}
