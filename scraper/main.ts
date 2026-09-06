import { scrapeImmowelt } from "./scrapers/immowelt/index.js";
import { scrapeZvgPortal } from "./scrapers/zvg-portal/index.js";
import { processCandidate, type PipelineCandidate } from "./lib/pipeline.js";
import { sb } from "./lib/supabase.js";

async function main() {
  const REQUIRED_ENV_VARS = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"];
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      throw new Error(`Fehlende Umgebungsvariable: ${key}`);
    }
  }

  const telegramConfig = {
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
  };

  console.log("Immowelt: Scraping gestartet...");
  const immoweltTreffer = await scrapeImmowelt();
  console.log(`Immowelt: ${immoweltTreffer.length} Mehrfamilienhaus-Kandidaten von Seite 1.`);
  for (const objekt of immoweltTreffer) {
    const candidate: PipelineCandidate = {
      source: "immowelt",
      externalId: objekt.externalId,
      url: objekt.url,
      title: objekt.title,
      priceCents: objekt.priceCents,
      livingAreaM2: objekt.livingAreaM2,
      plotAreaM2: objekt.plotAreaM2,
      units: objekt.units,
      unitsConfident: objekt.unitsConfident,
      yearBuilt: objekt.yearBuilt,
      zipCode: objekt.zipCode,
      city: objekt.city,
      rentColdMonthly: objekt.rentColdMonthly,
      auctionAt: null,
      court: null,
      caseNumber: null,
      rawNoticeText: null,
    };
    await processCandidate(sb, telegramConfig, candidate);
  }

  console.log("ZVG-Portal: Scraping gestartet...");
  const zvgTermine = await scrapeZvgPortal();
  console.log(`ZVG-Portal: ${zvgTermine.length} Mehrfamilienhaus-Termine gefunden.`);
  for (const termin of zvgTermine) {
    const candidate: PipelineCandidate = {
      source: "zvg-portal",
      externalId: termin.externalId,
      url: termin.url,
      title: termin.title,
      priceCents: termin.priceCents,
      livingAreaM2: termin.livingAreaM2,
      plotAreaM2: null,
      units: termin.units,
      unitsConfident: termin.unitsConfident,
      yearBuilt: termin.yearBuilt,
      zipCode: termin.zipCode,
      city: termin.city,
      rentColdMonthly: null,
      auctionAt: termin.auctionAt,
      court: termin.court,
      caseNumber: termin.caseNumber,
      rawNoticeText: termin.rawNoticeText,
    };
    await processCandidate(sb, telegramConfig, candidate);
  }

  console.log("Lauf abgeschlossen.");
}

main().catch((err) => {
  console.error("Pipeline-Fehler:", err);
  process.exitCode = 1;
});
