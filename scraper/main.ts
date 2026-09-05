import { scrapeImmowelt } from "./scrapers/immowelt/index.js";
import { grunderwerbsteuerSatz } from "./lib/grunderwerbsteuer.js";
import { berechneKennzahlen } from "./lib/metrics.js";
import { ermittleJahreskaltmiete } from "./lib/rentEstimate.js";
import { upsertListingAndVersion, logNotification } from "./lib/db.js";
import { sb } from "./lib/supabase.js";
import {
  sendTelegramMessage,
  formatTopTrefferMessage,
  formatPreisaenderungMessage,
} from "./lib/telegram.js";

const MIN_EINHEITEN = 3;

async function main() {
  const telegramConfig = {
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
  };

  console.log("Immowelt: Scraping gestartet...");
  const gefunden = await scrapeImmowelt();
  console.log(`Immowelt: ${gefunden.length} Mehrfamilienhaus-Kandidaten von Seite 1.`);

  for (const objekt of gefunden) {
    if (objekt.units === null || objekt.units < MIN_EINHEITEN) {
      console.log(
        `Übersprungen (Einheiten: ${objekt.units ?? "unbestätigt"}, benötigt >=${MIN_EINHEITEN}): ${objekt.title}`
      );
      continue;
    }

    const miete = ermittleJahreskaltmiete(objekt.rentColdMonthly, objekt.livingAreaM2 ?? 0);
    const satz = grunderwerbsteuerSatz(objekt.zipCode);
    const kennzahlen = berechneKennzahlen(
      {
        kaufpreis: objekt.priceCents / 100,
        jahreskaltmiete: miete.jahreskaltmiete,
        einheiten: objekt.units,
        baujahr: objekt.yearBuilt,
        wohnflaecheM2: objekt.livingAreaM2 ?? 0,
      },
      satz
    );

    const diff = await upsertListingAndVersion(sb, {
      source: "immowelt",
      externalId: objekt.externalId,
      url: objekt.url,
      priceCents: objekt.priceCents,
      rentColdMonthlyCents: objekt.rentColdMonthly === null ? null : Math.round(objekt.rentColdMonthly * 100),
      rentSource: miete.quelle,
      livingAreaM2: objekt.livingAreaM2,
      plotAreaM2: objekt.plotAreaM2,
      units: objekt.units,
      unitsConfident: objekt.unitsConfident,
      yearBuilt: objekt.yearBuilt,
      zipCode: objekt.zipCode,
      city: objekt.city,
      bundesland: null,
      title: objekt.title,
      kennzahlen,
    });

    const listingSummary = {
      title: objekt.title,
      url: objekt.url,
      city: objekt.city,
      zipCode: objekt.zipCode,
      priceCents: objekt.priceCents,
      units: objekt.units,
    };

    try {
      if (diff.changed && kennzahlen.topTreffer) {
        const kennzahlenSummary = {
          kaufpreisfaktor: kennzahlen.kaufpreisfaktor,
          geschaetzterDscr: kennzahlen.geschaetzterDscr,
          mietQuelle: miete.quelle,
        };
        await sendTelegramMessage(telegramConfig, formatTopTrefferMessage(listingSummary, kennzahlenSummary));
        await logNotification(sb, diff.listingId, "top_treffer", { ...kennzahlenSummary, priceCents: objekt.priceCents });
      }

      if (diff.priceDropped && diff.previousPriceCents !== null) {
        await sendTelegramMessage(
          telegramConfig,
          formatPreisaenderungMessage(listingSummary, diff.previousPriceCents, objekt.priceCents)
        );
        await logNotification(sb, diff.listingId, "preisaenderung", {
          altPreisCents: diff.previousPriceCents,
          neuPreisCents: objekt.priceCents,
        });
      }
    } catch (err) {
      console.error(`Benachrichtigung fehlgeschlagen fuer "${objekt.title}" (${objekt.url}):`, err);
    }
  }

  console.log("Lauf abgeschlossen.");
}

main().catch((err) => {
  console.error("Pipeline-Fehler:", err);
  process.exitCode = 1;
});
