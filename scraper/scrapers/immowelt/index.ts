import { chromium, type Browser, type Page } from "playwright";
import {
  parseImmoweltListPage,
  istMehrfamilienhausKandidat,
  type ImmoweltListSummary,
} from "./list.js";
import { parseImmoweltDetailPage, type ImmoweltDetailData } from "./detail.js";
import type { SweepErgebnis } from "../../lib/bestand.js";

const BASIS = "https://www.immowelt.de/suche/kaufen/haus/mehrfamilienhaus/guenstig/";
const VERZOEGERUNG_MS = 1000;
/**
 * Immowelt deckelt jede Ergebnisliste bei 250 Seiten. Erreicht eine Region
 * diesen Wert, ist ihre Menge abgeschnitten und der Sweep gilt als
 * unvollstaendig -- laut Spike liegt aktuell keine Region auch nur nahe
 * daran (Maximum: Nordrhein-Westfalen mit 188 Seiten).
 */
const SEITEN_DECKEL = 250;

/**
 * Die 16 Bundeslaender mit ihren Immowelt-Geo-Ids. Die Ids sind zwingend --
 * Pfade ohne sie liefern HTTP 410. Berlin, Hamburg und Bremen sind
 * Stadtstaaten und daher ueber ihren Stadt-Pfad angebunden.
 * Ermittelt aus den Regions-Links der bundesweiten Mehrfamilienhaus-Seite
 * (Spike 2026-09-07, siehe Spec).
 */
export const IMMOWELT_REGIONEN: { code: string; pfad: string }[] = [
  { code: "nw", pfad: "nordrhein-westfalen/ad04de5" },
  { code: "by", pfad: "bayern/ad04de9" },
  { code: "bw", pfad: "baden-wurttemberg/ad04de8" },
  { code: "ni", pfad: "niedersachsen/ad04de3" },
  { code: "rp", pfad: "rheinland-pfalz/ad04de7" },
  { code: "he", pfad: "hessen/ad04de6" },
  { code: "sn", pfad: "sachsen/ad04de14" },
  { code: "sh", pfad: "schleswig-holstein/ad04de1" },
  { code: "br", pfad: "brandenburg/ad04de12" },
  { code: "st", pfad: "sachsen-anhalt/ad04de15" },
  { code: "th", pfad: "thuringen/ad04de16" },
  { code: "sl", pfad: "saarland/ad04de10" },
  { code: "mv", pfad: "mecklenburg-vorpommern/ad04de13" },
  { code: "be", pfad: "berlin/berlin-10115/ad08de8634" },
  { code: "hh", pfad: "hamburg/hamburg-20095/ad08de1113" },
  { code: "hb", pfad: "bremen/bremen-28219/ad08de2110" },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Trefferzahl aus dem Seitentitel, z. B. "... - 7.505 Angebote | immowelt". */
export function trefferzahlAusTitel(titel: string): number | null {
  const treffer = titel.match(/([\d.]+)\s+Angebote/);
  if (treffer === null) return null;
  const zahl = Number.parseInt(treffer[1].replace(/\./g, ""), 10);
  return Number.isFinite(zahl) ? zahl : null;
}

/** Sammelt eine Region ueber alle Ergebnisseiten ein. */
async function regionErfassen(
  page: Page,
  region: { code: string; pfad: string },
  ziel: Map<string, ImmoweltListSummary>
): Promise<{ gemeldet: number | null; abgeschnitten: boolean }> {
  await page.goto(`${BASIS}${region.pfad}`, { waitUntil: "domcontentloaded" });
  const gemeldet = trefferzahlAusTitel(await page.title());

  let seite = 1;
  for (; seite <= SEITEN_DECKEL; seite += 1) {
    for (const karte of parseImmoweltListPage(await page.content())) {
      if (istMehrfamilienhausKandidat(karte.titleLine)) ziel.set(karte.externalId, karte);
    }
    const weiter = page.locator('button[aria-label="nächste seite"]');
    if ((await weiter.count()) === 0) break;
    await sleep(VERZOEGERUNG_MS);
    await weiter.first().click();
    await page.waitForLoadState("domcontentloaded");
  }

  console.log(`Immowelt-Sweep ${region.code}: ${seite} Seiten, gemeldet ${gemeldet ?? "?"}.`);
  return { gemeldet, abgeschnitten: seite > SEITEN_DECKEL };
}

/**
 * Phase A: vollstaendige Bestandsaufnahme ueber alle 16 Bundeslaender, nur
 * Ergebnislisten. Der Umweg ueber die Laender ist noetig, weil Immowelt
 * bundesweit bei 250 Seiten deckelt und so nur 10.000 der 35.415
 * Mehrfamilienhaeuser erreichbar waeren.
 */
export async function sweepImmowelt(): Promise<{
  sweep: SweepErgebnis;
  zusammenfassungen: Map<string, ImmoweltListSummary>;
}> {
  const browser = await chromium.launch();
  const zusammenfassungen = new Map<string, ImmoweltListSummary>();
  let alleLiefen = true;
  let gemeldeteSumme = 0;
  let gemeldeteVollstaendig = true;

  try {
    const page = await browser.newPage();
    for (const region of IMMOWELT_REGIONEN) {
      await sleep(VERZOEGERUNG_MS);
      try {
        const { gemeldet, abgeschnitten } = await regionErfassen(page, region, zusammenfassungen);
        if (abgeschnitten) {
          alleLiefen = false;
          console.warn(`Immowelt-Sweep ${region.code}: Seitendeckel erreicht, Menge abgeschnitten.`);
        }
        if (gemeldet === null) gemeldeteVollstaendig = false;
        else gemeldeteSumme += gemeldet;
      } catch (err) {
        alleLiefen = false;
        console.warn(`Immowelt-Sweep ${region.code}: Fehler`, err);
      }
    }
  } catch (err) {
    alleLiefen = false;
    console.warn("Immowelt-Sweep abgebrochen", err);
  } finally {
    await browser.close();
  }

  console.log(`Immowelt-Sweep: ${zusammenfassungen.size} Mehrfamilienhaus-Kandidaten.`);
  return {
    sweep: {
      source: "immowelt",
      vollstaendig: alleLiefen,
      // Bewusst leer: die Immowelt-externalId ist eine UUID ohne Bundesland,
      // eine partitionsgenaue Loeschung waere daraus nicht ableitbar. Fuer
      // diese Quelle gilt deshalb alles oder nichts.
      geltungsbereich: [],
      gesehene: new Set(zusammenfassungen.keys()),
      gemeldeteTreffer: gemeldeteVollstaendig ? gemeldeteSumme : null,
    },
    zusammenfassungen,
  };
}

/** Phase B: Detailseiten nur fuer die uebergebenen externalIds. */
export async function erfasseImmoweltDetails(
  zusammenfassungen: Map<string, ImmoweltListSummary>,
  externalIds: string[]
): Promise<ImmoweltDetailData[]> {
  if (externalIds.length === 0) return [];

  const browser: Browser = await chromium.launch();
  const ergebnisse: ImmoweltDetailData[] = [];
  try {
    const page: Page = await browser.newPage();
    for (const externalId of externalIds) {
      const zusammenfassung = zusammenfassungen.get(externalId);
      if (zusammenfassung === undefined) continue;
      await sleep(VERZOEGERUNG_MS);
      try {
        await page.goto(zusammenfassung.url, { waitUntil: "domcontentloaded" });
        ergebnisse.push(
          parseImmoweltDetailPage(await page.content(), {
            externalId: zusammenfassung.externalId,
            url: zusammenfassung.url,
          })
        );
      } catch (err) {
        console.warn(`Immowelt-Detailseite ${zusammenfassung.url}: Fehler, übersprungen`, err);
      }
    }
  } finally {
    await browser.close();
  }
  return ergebnisse;
}
