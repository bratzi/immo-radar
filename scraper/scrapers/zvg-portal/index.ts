import { chromium, type Browser, type Page } from "playwright";
import { parseZvgResultsPage, type ZvgListSummary } from "./list.js";
import { parseZvgDetailPage, type ZvgDetailData } from "./detail.js";
import type { SweepErgebnis } from "../../lib/bestand.js";

const SEARCH_URL = "https://www.zvg-portal.de/index.php?button=Termine%20suchen";
const MEHRFAMILIENHAUS_OBJ_TYP = "4";
const ALLE_AMTSGERICHTE = "0";
const VERZOEGERUNG_MS = 1000;
/** Runaway-loop guard: kein Bundesland sollte diese Grenze erreichen. Wird als
 *  Incompleteness-Signal behandelt, nicht als erwartete Grenze. */
const MAX_SEITEN_PRO_BUNDESLAND = 200;

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

async function alleSeitenErfassen(
  page: Page
): Promise<{ treffer: ZvgListSummary[]; abgeschnitten: boolean }> {
  const treffer: ZvgListSummary[] = [];
  let seite = 1;
  while (seite <= MAX_SEITEN_PRO_BUNDESLAND) {
    treffer.push(...parseZvgResultsPage(await page.content()));
    const naechstesSeitenLabel = `blättern zur Sitennummer ${seite + 1}`;
    const gibtNaechsteSeite =
      (await page.locator(`button[aria-label="${naechstesSeitenLabel}"]`).count()) > 0;
    if (!gibtNaechsteSeite) {
      return { treffer, abgeschnitten: false };
    }
    await sleep(VERZOEGERUNG_MS);
    await page.click(`button[aria-label="${naechstesSeitenLabel}"]`);
    await page.waitForLoadState("domcontentloaded");
    seite += 1;
  }
  // Schleife endet nur bei Erreichen der Grenze, mit noch existierender naechster Seite.
  return { treffer, abgeschnitten: true };
}

/**
 * Phase A: vollstaendige Bestandsaufnahme ueber alle 16 Bundeslaender, nur
 * Ergebnislisten. zvg-portal.de weist keine Gesamttrefferzahl aus, daher
 * bleibt gemeldeteTreffer null.
 */
export async function sweepZvgPortal(): Promise<{
  sweep: SweepErgebnis;
  zusammenfassungen: Map<string, ZvgListSummary>;
}> {
  // headless: false fuer gleiches Browserverhalten wie beim Immowelt-Scraper
  // (dort zwingend wegen DataDome, Begruendung in scrapers/immowelt/index.ts).
  const browser = await chromium.launch({ headless: false });
  const zusammenfassungen = new Map<string, ZvgListSummary>();
  const geltungsbereich: string[] = [];
  let alleLiefen = true;

  try {
    const page = await browser.newPage();
    for (const landAbk of BUNDESLAND_CODES) {
      await sleep(VERZOEGERUNG_MS);
      try {
        await sucheFuerBundesland(page, landAbk);
        const { treffer, abgeschnitten } = await alleSeitenErfassen(page);
        for (const t of treffer) zusammenfassungen.set(t.externalId, t);
        if (abgeschnitten) {
          alleLiefen = false;
          console.warn(
            `ZVG-Sweep ${landAbk}: Seitenlimit (${MAX_SEITEN_PRO_BUNDESLAND}) erreicht, ` +
              `Bundesland bleibt vom Abgleich ausgenommen. ${treffer.length} Termine gespeichert.`
          );
        } else if (treffer.length === 0) {
          // Ein Bundesland ohne einen einzigen Treffer ist technisch nicht von
          // einem stillen Ausfall zu unterscheiden -- geaenderter Selektor,
          // Formularumbau, Fehlerseite mit HTTP 200. zvg-portal.de weist keine
          // Gesamttrefferzahl aus, deshalb gibt es fuer diese Quelle KEINE
          // Selbstkonsistenz-Pruefung, die das nachtraeglich auffangen wuerde.
          // Dass ein Bundesland wirklich einmal null Zwangsversteigerungen von
          // Mehrfamilienhaeusern hat, ist moeglich, aber selten -- der Preis
          // dafuer ist ein Lauf ohne ZVG-Loeschung, der Preis fuer die andere
          // Richtung waere ein geloeschter Bestand. Also: im Zweifel nicht
          // loeschen.
          alleLiefen = false;
          console.warn(
            `ZVG-Sweep ${landAbk}: null Treffer -- nicht von einem stillen Ausfall ` +
              `unterscheidbar, ZVG loescht in diesem Lauf nicht.`
          );
        } else {
          geltungsbereich.push(landAbk);
          console.log(`ZVG-Sweep ${landAbk}: ${treffer.length} Termine.`);
        }
      } catch (err) {
        alleLiefen = false;
        console.warn(`ZVG-Sweep ${landAbk}: Fehler, Bundesland bleibt vom Abgleich ausgenommen`, err);
      }
    }
  } finally {
    await browser.close();
  }

  return {
    sweep: {
      source: "zvg-portal",
      vollstaendig: alleLiefen,
      // ZVG wird pro Lauf komplett abgegrast; jede Unvollstaendigkeit hier ist
      // ein echter Ausfall und soll laut gemeldet werden.
      strukturellTeilweise: false,
      geltungsbereich,
      gesehene: new Set(zusammenfassungen.keys()),
      gemeldeteTreffer: null,
    },
    zusammenfassungen,
  };
}

async function detailSeiteHolen(
  page: Page,
  zusammenfassung: ZvgListSummary,
  referer: string
): Promise<ZvgDetailData | null> {
  try {
    await page.goto(zusammenfassung.url, { waitUntil: "domcontentloaded", referer });
    return parseZvgDetailPage(await page.content(), {
      externalId: zusammenfassung.externalId,
      url: zusammenfassung.url,
      court: zusammenfassung.court,
      caseNumber: zusammenfassung.caseNumber,
    });
  } catch (err) {
    console.warn(`ZVG-Detailseite ${zusammenfassung.url}: Fehler, übersprungen`, err);
    return null;
  }
}

/**
 * Phase B: Detailseiten nur fuer die uebergebenen externalIds.
 * Der Referer muss auf die Sucheinstiegsseite zeigen -- zvg-portal.de
 * liefert sonst HTTP 200 mit dem woertlichen Body "error".
 */
export async function erfasseZvgDetails(
  zusammenfassungen: Map<string, ZvgListSummary>,
  externalIds: string[]
): Promise<ZvgDetailData[]> {
  if (externalIds.length === 0) return [];

  // headless: false -- siehe sweepZvgPortal / scrapers/immowelt/index.ts.
  const browser: Browser = await chromium.launch({ headless: false });
  const ergebnisse: ZvgDetailData[] = [];
  try {
    const page = await browser.newPage();
    await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded" });
    const referer = page.url();

    for (const externalId of externalIds) {
      const zusammenfassung = zusammenfassungen.get(externalId);
      if (zusammenfassung === undefined) continue;
      await sleep(VERZOEGERUNG_MS);
      const daten = await detailSeiteHolen(page, zusammenfassung, referer);
      if (daten !== null) ergebnisse.push(daten);
    }
  } finally {
    await browser.close();
  }
  return ergebnisse;
}
