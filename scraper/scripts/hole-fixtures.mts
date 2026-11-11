/**
 * Holt Listen- und Detailseiten einer Quelle und schreibt sie als HTML nach
 * scraper/fixtures-out/. NUR in CI (pruefung.yml). Aufruf:
 * `hole-fixtures.mts <immowelt|kleinanzeigen>` (Standard immowelt).
 * Eine erkannte Sperre wird protokolliert, nie umgangen: dann endet das
 * Skript sofort ohne weitere Abrufe (Exit-Code 2).
 */
import { chromium, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { nurInCiAusfuehren } from "../lib/nurInCi.js";
import { bestaetigeConsentBanner } from "../scrapers/consent.js";
import { erkenneSperre, seitenabstandMs } from "../scrapers/sperre.js";
import { IMMOWELT_SUCHE_URL } from "../scrapers/immowelt/index.js";
import { kleinanzeigenSeitenUrl } from "../scrapers/kleinanzeigen/index.js";

nurInCiAusfuehren("hole-fixtures");
mkdirSync("fixtures-out", { recursive: true });
const quelle = process.argv[2] ?? "immowelt";

/** Laedt eine Seite, speichert sie und gibt false bei Sperre zurueck. */
async function holeSeite(page: Page, url: string, datei: string, consent = false): Promise<boolean> {
  const antwort = await page.goto(url, { waitUntil: "domcontentloaded" });
  if (consent) await bestaetigeConsentBanner(page);
  await page.waitForTimeout(2500);
  const html = await page.content();
  const sperre = erkenneSperre({ status: antwort?.status() ?? 0, html, url: page.url() });
  console.log(`${datei}:`, antwort?.status(), page.url(), "Titel:", await page.title(), "Sperre:", sperre);
  writeFileSync(`fixtures-out/${datei}.html`, html);
  if (sperre) {
    await page.screenshot({ path: `fixtures-out/${datei}.png`, fullPage: true });
    console.error(`GESPERRT (${sperre}) -- keine weiteren Abrufe.`);
    process.exitCode = 2;
    return false;
  }
  return true;
}

async function immowelt(page: Page): Promise<void> {
  if (!(await holeSeite(page, IMMOWELT_SUCHE_URL, "mietliste-muenchen", true))) return;
  await page.screenshot({ path: "fixtures-out/mietliste-muenchen.png", fullPage: true });
  const links = await page.locator('a[href*="/expose/"]').evaluateAll((as) =>
    [...new Set(as.map((a) => (a as HTMLAnchorElement).href))].slice(0, 3)
  );
  for (const [i, link] of links.entries()) {
    await page.waitForTimeout(seitenabstandMs());
    if (!(await holeSeite(page, link, `mietdetail-${i}`))) return;
  }
}

/** Kleinanzeigen: hoechstens 2 Listen- und 6 Detailseiten. */
async function kleinanzeigen(page: Page): Promise<void> {
  const links: string[] = [];
  for (let n = 1; n <= 2; n++) {
    if (n > 1) await page.waitForTimeout(seitenabstandMs());
    if (!(await holeSeite(page, kleinanzeigenSeitenUrl(n), `liste-${n}`))) return;
    if (n === 1) {
      await page.screenshot({ path: "fixtures-out/liste-1.png", fullPage: true });
      const hrefs = await page.locator("article.aditem[data-href]").evaluateAll((as) =>
        as.map((a) => a.getAttribute("data-href") ?? "")
      );
      for (const h of hrefs) if (h && !links.includes(h)) links.push(new URL(h, "https://www.kleinanzeigen.de").href);
      console.log("Karten mit data-href:", hrefs.length);
    }
  }
  for (const [i, link] of links.slice(0, 6).entries()) {
    await page.waitForTimeout(seitenabstandMs());
    if (!(await holeSeite(page, link, `detail-${i}`))) return;
  }
}

const browser = await chromium.launch({ headless: false });
try {
  const page = await browser.newPage();
  if (quelle === "kleinanzeigen") await kleinanzeigen(page);
  else if (quelle === "immowelt") await immowelt(page);
  else { console.error(`Unbekannte Quelle: ${quelle}`); process.exitCode = 1; }
} finally {
  await browser.close();
}
