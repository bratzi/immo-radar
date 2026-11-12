/**
 * Produktionslauf (scrape.yml): je aktive Quelle ein Lauf, Ergebnis in
 * Supabase (`angebote`, `laeufe`); das Artifact liest dort live.
 * Kein Telegram (Nutzerentscheidung 2026-11-11). Eine Sperre stoppt nur die
 * betroffene Quelle; die Pausenregel steckt in verarbeiteQuelle.
 */
import "dotenv/config";
import { chromium } from "playwright";
import { sb } from "./lib/supabase.js";
import { nurInCiAusfuehren } from "./lib/nurInCi.js";
import { verarbeiteQuelle } from "./lib/pipeline.js";
import { QUELLEN } from "./scrapers/quellen.js";
import { playwrightAbrufer } from "./scrapers/abrufer.js";
import { MAX_DETAILSEITEN } from "./scrapers/sperre.js";
import { meldeLaufStart, meldeLaufEnde, laufUrlAusUmgebung } from "./lib/laufStatus.js";
import { aktualisiereVorschau, supabaseVorschauSpeicher, holeBild, verkleinere } from "./lib/vorschau.js";

nurInCiAusfuehren("scrape");

// Status fuer den Radar-Knopf; ein Fehler hier stoppt den Lauf nicht.
const melde = async (was: string, f: () => Promise<void>) => { try { await f(); } catch (e) { console.error(`Laufstatus ${was}:`, e); } };
await melde("Start", () => meldeLaufStart(sb, new Date(), laufUrlAusUmgebung(process.env)));

const browser = await chromium.launch({ headless: false });
try {
  for (const quelle of QUELLEN.filter((q) => q.aktiv)) {
    const page = await browser.newPage();
    try {
      const e = await verarbeiteQuelle(
        { sb, sweepBudgetMs: 3 * 60_000, maxDetails: MAX_DETAILSEITEN, jetzt: new Date() },
        quelle, playwrightAbrufer(page),
      );
      console.log(`${quelle.name}: ${JSON.stringify(e.lauf)}${e.pausiertBis ? ` (pausiert bis ${e.pausiertBis})` : ""}`);
    } catch (fehler) {
      console.error(`${quelle.name}: Fehler`, fehler);
      process.exitCode = 1;
    } finally {
      await page.close();
    }
  }
  // Vorschaubilder fuer das Radar; ein Fehler hier stoppt den Lauf nicht.
  try {
    const v = await aktualisiereVorschau(supabaseVorschauSpeicher(sb), { hole: holeBild, verkleinere, budgetMs: 60_000 });
    console.log(`vorschau: ${JSON.stringify(v)}`);
  } catch (fehler) {
    console.error("vorschau: Fehler", fehler);
  }
} finally {
  await browser.close();
  await melde("Ende", () => meldeLaufEnde(sb, new Date()));
}