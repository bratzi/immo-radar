import { chromium, type Page } from "playwright";
import { parseZvgResultsPage, type ZvgListSummary } from "./list.js";
import { parseZvgDetailPage, type ZvgDetailData } from "./detail.js";

const SEARCH_URL = "https://www.zvg-portal.de/index.php?button=Termine%20suchen";
const MEHRFAMILIENHAUS_OBJ_TYP = "4";
const ALLE_AMTSGERICHTE = "0";
const VERZOEGERUNG_MS = 1000;
const MAX_SEITEN_PRO_BUNDESLAND = 30;

const BUNDESLAND_CODES = [
  "bw", "by", "be", "br", "hb", "hh", "he", "mv",
  "ni", "nw", "rp", "sl", "sn", "st", "sh", "th",
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sucheFuerBundesland(page: Page, landAbk: string): Promise<void> {
  await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded" });
  await page.selectOption("#obj_liste", MEHRFAMILIENHAUS_OBJ_TYP);
  await page.evaluate(() => (window as unknown as { insertObj: () => void }).insertObj());
  await page.selectOption("select[name='land_abk']", landAbk);
  await page.selectOption("select[name='ger_id']", ALLE_AMTSGERICHTE);
  await page.click("form[name='globe'] button[type='submit']");
  await page.waitForLoadState("domcontentloaded");
}

async function alleSeitenErfassen(page: Page): Promise<ZvgListSummary[]> {
  const ergebnisse: ZvgListSummary[] = [];
  let seite = 1;
  while (seite <= MAX_SEITEN_PRO_BUNDESLAND) {
    ergebnisse.push(...parseZvgResultsPage(await page.content()));
    const naechstesSeitenLabel = `blättern zur Sitennummer ${seite + 1}`;
    const gibtNaechsteSeite = (await page.locator(`button[aria-label="${naechstesSeitenLabel}"]`).count()) > 0;
    if (!gibtNaechsteSeite) break;
    await page.click(`button[aria-label="${naechstesSeitenLabel}"]`);
    await page.waitForLoadState("domcontentloaded");
    seite += 1;
  }
  return ergebnisse;
}

async function detailsErfassen(page: Page, zusammenfassungen: ZvgListSummary[]): Promise<ZvgDetailData[]> {
  const ergebnisse: ZvgDetailData[] = [];
  const referer = page.url();
  for (const zusammenfassung of zusammenfassungen) {
    await sleep(VERZOEGERUNG_MS);
    try {
      await page.goto(zusammenfassung.url, { waitUntil: "domcontentloaded", referer });
      const html = await page.content();
      ergebnisse.push(
        parseZvgDetailPage(html, {
          externalId: zusammenfassung.externalId,
          url: zusammenfassung.url,
          court: zusammenfassung.court,
          caseNumber: zusammenfassung.caseNumber,
        })
      );
    } catch (err) {
      console.warn(`ZVG-Detailseite ${zusammenfassung.url}: Fehler, übersprungen`, err);
    }
  }
  return ergebnisse;
}

export async function scrapeZvgPortal(): Promise<ZvgDetailData[]> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const alleTermine: ZvgDetailData[] = [];
    for (const landAbk of BUNDESLAND_CODES) {
      await sleep(VERZOEGERUNG_MS);
      try {
        await sucheFuerBundesland(page, landAbk);
        const zusammenfassungen = await alleSeitenErfassen(page);
        console.log(`ZVG-Portal ${landAbk}: ${zusammenfassungen.length} Mehrfamilienhaus-Termine gefunden.`);
        const details = await detailsErfassen(page, zusammenfassungen);
        alleTermine.push(...details);
      } catch (err) {
        console.warn(`ZVG-Portal Bundesland ${landAbk}: Fehler, uebersprungen`, err);
      }
    }
    return alleTermine;
  } finally {
    await browser.close();
  }
}
