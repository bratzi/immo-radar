/**
 * Produktionslauf (scrape.yml): je aktive Quelle ein Lauf, Ergebnis in
 * Supabase (`angebote`, `laeufe`) und als Snapshot fuers Dashboard.
 * Kein Telegram (Nutzerentscheidung 2026-11-11). Eine Sperre stoppt nur die
 * betroffene Quelle; die Pausenregel steckt in verarbeiteQuelle.
 */
import "dotenv/config";
import { chromium } from "playwright";
import { sb } from "./lib/supabase.js";
import { nurInCiAusfuehren } from "./lib/nurInCi.js";
import { verarbeiteQuelle } from "./lib/pipeline.js";
import { schreibeSnapshot } from "./lib/snapshot.js";
import { QUELLEN } from "./scrapers/quellen.js";
import { playwrightAbrufer } from "./scrapers/abrufer.js";
import { MAX_DETAILSEITEN } from "./scrapers/sperre.js";

nurInCiAusfuehren("scrape");

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
} finally {
  await browser.close();
}
await schreibeSnapshot(sb, "snapshot/dashboard-snapshot.json", new Date());
