/**
 * Holt Ergebnisliste und bis zu drei Detailseiten der Immowelt-Mietsuche
 * Muenchen und schreibt sie als HTML nach scraper/fixtures-out/. NUR in CI
 * (pruefung.yml). Eine erkannte Sperre wird protokolliert, nie umgangen: dann
 * endet das Skript ohne Detailabrufe.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { nurInCiAusfuehren } from "../lib/nurInCi.js";
import { bestaetigeConsentBanner } from "../scrapers/consent.js";
import { erkenneSperre, seitenabstandMs } from "../scrapers/sperre.js";
import { IMMOWELT_SUCHE_URL } from "../scrapers/immowelt/index.js";

nurInCiAusfuehren("hole-fixtures");
mkdirSync("fixtures-out", { recursive: true });

const browser = await chromium.launch({ headless: false });
try {
  const page = await browser.newPage();
  const antwort = await page.goto(IMMOWELT_SUCHE_URL, { waitUntil: "domcontentloaded" });
  await bestaetigeConsentBanner(page);
  await page.waitForTimeout(3000);
  const html = await page.content();
  const sperre = erkenneSperre({ status: antwort?.status() ?? 0, html, url: page.url() });
  console.log("Liste:", antwort?.status(), page.url(), "Titel:", await page.title(), "Sperre:", sperre);
  writeFileSync("fixtures-out/mietliste-muenchen.html", html);
  await page.screenshot({ path: "fixtures-out/mietliste-muenchen.png", fullPage: true });
  if (sperre) {
    console.error(`GESPERRT (${sperre}) -- keine weiteren Abrufe.`);
    process.exitCode = 2;
  } else {
    const links = await page.locator('a[href*="/expose/"]').evaluateAll((as) =>
      [...new Set(as.map((a) => (a as HTMLAnchorElement).href))].slice(0, 3)
    );
    console.log("Exposé-Links:", links.length);
    for (const [i, link] of links.entries()) {
      await page.waitForTimeout(seitenabstandMs());
      const r = await page.goto(link, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      const d = await page.content();
      const s = erkenneSperre({ status: r?.status() ?? 0, html: d, url: page.url() });
      console.log(`Detail ${i}:`, r?.status(), link, "Titel:", await page.title(), "Sperre:", s);
      writeFileSync(`fixtures-out/mietdetail-${i}.html`, d);
      if (s) { process.exitCode = 2; break; }
    }
  }
} finally {
  await browser.close();
}
