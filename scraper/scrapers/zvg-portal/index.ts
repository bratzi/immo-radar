import { chromium, type Browser, type Page } from "playwright";
import { parseZvgResultsPage, type ZvgListSummary } from "./list.js";
import {
  parseZvgDetailPage,
  VerkehrswertFehltError,
  type ZvgDetailData,
} from "./detail.js";
import type { SweepErgebnis } from "../../lib/bestand.js";
import { bestaetigeConsentBanner } from "../consent.js";

const SEARCH_URL = "https://www.zvg-portal.de/index.php?button=Termine%20suchen";
const MEHRFAMILIENHAUS_OBJ_TYP = "4";
const ALLE_AMTSGERICHTE = "0";
/**
 * Drosselung zwischen zwei zvg-portal.de-Seitenabrufen. Wird in `main.ts`
 * importiert, um daraus die Zahl der ZVG-Detailkandidaten abzuleiten -- so kann
 * das Detailbudget nie von dieser Drossel abdriften.
 */
export const ZVG_VERZOEGERUNG_MS = 1000;
/** Runaway-loop guard: kein Bundesland sollte diese Grenze erreichen. Wird als
 *  Incompleteness-Signal behandelt, nicht als erwartete Grenze. */
const MAX_SEITEN_PRO_BUNDESLAND = 200;

const BUNDESLAND_CODES = [
  "bw", "by", "be", "br", "hb", "hh", "he", "mv",
  "ni", "nw", "rp", "sl", "sn", "st", "sh", "th",
];

/**
 * Systemische Nullausfall-Probe fuer den ZVG-Sweep.
 *
 * `trefferProRegion` traegt die Trefferzahl jedes Bundeslands, das OHNE
 * Ausnahme durchlief (Regionen mit Fehler oder Seitenlimit kippen die
 * Vollstaendigkeit bereits an anderer Stelle und zaehlen hier nicht mit).
 *
 * Ein EINZELNES leeres Bundesland ist kein Ausfall: Baden-Wuerttemberg,
 * Berlin, Hamburg, Mecklenburg-Vorpommern und Schleswig-Holstein haben
 * schlicht keine Zwangsversteigerung eines Mehrfamilienhauses gelistet. Zwei
 * Live-Laeufe am 2026-09-07 zeigten beide reproduzierbar exakt diese fuenf
 * (bw, be, hh, mv, sh) leer -- bei 188 Terminen insgesamt. Eine fruehere
 * Fassung setzte pro leerem Bundesland `vollstaendig: false`; damit konnte
 * der ZVG-Sweep NIE loeschen, weil dieselben fuenf in jedem Lauf leer sind.
 * Eine Wache, die sich nie oeffnet, ist ein eigener Bug.
 *
 * Der gefaehrliche Fall -- eine grosse Region wie Nordrhein-Westfalen
 * (88 von 188 Objekten) faellt still aus -- wird NICHT hier abgefangen,
 * sondern von der Median-Historien-Pruefung in `lib/plausibilitaet.ts`:
 * 188 auf 100 ist ein Einbruch von 47 %, weit ausserhalb der dortigen
 * 25-%-Toleranz. Diese Probe hier waere dagegen redundant und zugleich
 * schaedlich fuer den Normalfall -- deshalb prueft sie NUR den einen Fall,
 * den der Median nicht sieht: einen stillen Ausfall des Suchformulars selbst
 * (geaenderter Selektor, Formularumbau, Fehlerseite mit HTTP 200). Der
 * trifft ALLE Regionen gleichzeitig, nie reproduzierbar nur die fuenf
 * kleinsten. Bedingung also: jede erfasste Region null Treffer.
 *
 * Keine erfasste Region (leere Liste) ist KEIN Nullausfall in diesem Sinne
 * -- dann liefen alle sechzehn Bundeslaender in eine Ausnahme, was die
 * Vollstaendigkeit ohnehin schon gekippt hat.
 */
export function istFlaechendeckenderNullausfall(trefferProRegion: number[]): boolean {
  return trefferProRegion.length > 0 && trefferProRegion.every((anzahl) => anzahl === 0);
}

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
    await sleep(ZVG_VERZOEGERUNG_MS);
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
  // Trefferzahl je Bundesland, das ohne Ausnahme durchlief -- Grundlage der
  // systemischen Nullausfall-Probe nach der Schleife.
  const trefferProRegion: number[] = [];
  let alleLiefen = true;

  try {
    const page = await browser.newPage();
    // Einmal pro Browser-Context, nach der ersten Navigation: ein etwaiges
    // Consent-Overlay wegklicken. Das ZVG-Portal hat vermutlich keins -- dann
    // kehrt der Helfer nach einer begrenzten Wartezeit still zurueck. Der
    // Aufruf kostet diese eine Wartezeit und schuetzt, falls das Portal spaeter
    // eins nachruestet (siehe scrapers/consent.ts).
    let consentErledigt = false;
    for (const landAbk of BUNDESLAND_CODES) {
      await sleep(ZVG_VERZOEGERUNG_MS);
      try {
        await sucheFuerBundesland(page, landAbk);
        if (!consentErledigt) {
          await bestaetigeConsentBanner(page);
          consentErledigt = true;
        }
        const { treffer, abgeschnitten } = await alleSeitenErfassen(page);
        for (const t of treffer) zusammenfassungen.set(t.externalId, t);
        trefferProRegion.push(treffer.length);
        if (abgeschnitten) {
          alleLiefen = false;
          console.warn(
            `ZVG-Sweep ${landAbk}: Seitenlimit (${MAX_SEITEN_PRO_BUNDESLAND}) erreicht, ` +
              `Bundesland bleibt vom Abgleich ausgenommen. ${treffer.length} Termine gespeichert.`
          );
        } else if (treffer.length === 0) {
          // Ein EINZELNES leeres Bundesland kippt die Vollstaendigkeit NICHT
          // (mehr) -- Begruendung samt Beleg an istFlaechendeckenderNullausfall.
          // Kurz: manche Bundeslaender haben schlicht keine passende
          // Zwangsversteigerung gelistet (2026-09-07: bw, be, hh, mv, sh leer
          // bei 188 Terminen), und der gefaehrliche Fall -- eine grosse Region
          // faellt still aus -- wird von der Median-Pruefung in
          // lib/plausibilitaet.ts erschlagen, nicht hier. Nur wenn JEDE
          // erfasste Region null Treffer meldet, ist es ein Formular-Ausfall;
          // das entscheidet die Probe nach der Schleife. Ohne Treffer bleibt
          // das Bundesland aus dem Geltungsbereich -- es gibt nichts
          // abzugleichen -- zaehlt aber nicht als Fehler.
          console.log(
            `ZVG-Sweep ${landAbk}: null Treffer -- dieses Bundesland hat aktuell ` +
              `keine passende Zwangsversteigerung gelistet.`
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

    // Systemische Nullausfall-Probe: ein leeres Bundesland ist normal, alle
    // sechzehn leer ist ein stiller Ausfall des Suchformulars -- dann darf der
    // Sweep nichts loeschen. Details und Beleg an istFlaechendeckenderNullausfall.
    if (istFlaechendeckenderNullausfall(trefferProRegion)) {
      alleLiefen = false;
      console.warn(
        `ZVG-Sweep: alle ${trefferProRegion.length} erfassten Bundeslaender ohne einen ` +
          `einzigen Treffer -- stiller Ausfall des Suchformulars, ZVG loescht in diesem Lauf nicht.`
      );
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

/**
 * Entscheidet, ob ein Fehler beim Abruf einer Detailseite eine Stoerung ist
 * oder eine Eigenschaft der Quelle -- und wie die Zeile im Log lautet.
 *
 * Getrennt herausgezogen, damit diese Entscheidung unter Test steht. Eine
 * Meldung, die eine Ursache behauptet, hat dieses Projekt schon dreimal in die
 * falsche Richtung geschickt.
 */
export function beschreibeDetailFehler(
  url: string,
  err: unknown
): { text: string; stoerung: boolean } {
  if (err instanceof VerkehrswertFehltError) {
    return {
      text: `ZVG-Detailseite ${url}: uebersprungen -- die Bekanntmachung nennt keinen verwertbaren Verkehrswert ("${err.feldtext}"). Das ist keine Stoerung, sondern eine Eigenschaft der Quelle.`,
      stoerung: false,
    };
  }
  return { text: `ZVG-Detailseite ${url}: Fehler, übersprungen`, stoerung: true };
}

/**
 * Wie ein Detailergebnis einzuordnen ist -- als reine Funktion herausgezogen,
 * damit diese Entscheidung unter Test steht (`erfasseZvgDetails` selbst
 * startet einen echten Browser und ist nicht direkt testbar).
 *
 * "ohne-verkehrswert" ist eine Eigenschaft der Quelle (das Gericht laesst den
 * Wert aus) und bekommt spaeter eine Zeile ohne Bewertung. "stoerung" ist ein
 * echter Abrufausfall und bekommt fail-closed KEINE Zeile: eine Zeile ohne
 * Bewertung behauptet "geprueft, kein Wert vorhanden", und das waere bei
 * einer blossen Stoerung eine Behauptung ueber etwas, das niemand gesehen hat.
 */
export type DetailErgebnis =
  | { art: "erfasst"; daten: ZvgDetailData }
  | { art: "ohne-verkehrswert" }
  | { art: "stoerung" };

export function ordneDetailErgebnisEin(
  daten: ZvgDetailData | null,
  fehler: unknown
): DetailErgebnis {
  if (daten !== null) return { art: "erfasst", daten };
  if (fehler instanceof VerkehrswertFehltError) return { art: "ohne-verkehrswert" };
  return { art: "stoerung" };
}

async function detailSeiteHolen(
  page: Page,
  zusammenfassung: ZvgListSummary,
  referer: string
): Promise<DetailErgebnis> {
  let daten: ZvgDetailData | null = null;
  let fehler: unknown = null;
  try {
    await page.goto(zusammenfassung.url, { waitUntil: "domcontentloaded", referer });
    daten = parseZvgDetailPage(await page.content(), {
      externalId: zusammenfassung.externalId,
      url: zusammenfassung.url,
      court: zusammenfassung.court,
      caseNumber: zusammenfassung.caseNumber,
    });
  } catch (err) {
    fehler = err;
  }

  const ergebnis = ordneDetailErgebnisEin(daten, fehler);
  if (ergebnis.art !== "erfasst") {
    const { text, stoerung } = beschreibeDetailFehler(zusammenfassung.url, fehler);
    // Nur eine echte Stoerung bekommt den Stapelabzug. Ein Gericht, das ein
    // Feld leer laesst, ist keine -- und drei solcher Zeilen in JEDEM Lauf
    // wuerden echte Stoerungen im Log verdecken.
    if (stoerung) console.warn(text, fehler);
    else console.log(text);
  }
  return ergebnis;
}

/**
 * Phase B: Detailseiten nur fuer die uebergebenen externalIds.
 * Der Referer muss auf die Sucheinstiegsseite zeigen -- zvg-portal.de
 * liefert sonst HTTP 200 mit dem woertlichen Body "error".
 *
 * Liefert neben den erfassten Terminen auch `ohneVerkehrswert`: Objekte,
 * deren Bekanntmachung keinen verwertbaren Verkehrswert nennt (A-4). Ein
 * echter Abrufausfall (Stoerung) landet in KEINER der beiden Listen.
 */
export async function erfasseZvgDetails(
  zusammenfassungen: Map<string, ZvgListSummary>,
  externalIds: string[]
): Promise<{ termine: ZvgDetailData[]; ohneVerkehrswert: ZvgListSummary[] }> {
  if (externalIds.length === 0) return { termine: [], ohneVerkehrswert: [] };

  // headless: false -- siehe sweepZvgPortal / scrapers/immowelt/index.ts.
  const browser: Browser = await chromium.launch({ headless: false });
  const termine: ZvgDetailData[] = [];
  const ohneVerkehrswert: ZvgListSummary[] = [];
  try {
    const page = await browser.newPage();
    await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded" });
    // Einmal pro Browser-Context nach der ersten Navigation (siehe
    // scrapers/consent.ts). Kehrt still zurueck, falls kein Overlay da ist.
    await bestaetigeConsentBanner(page);
    const referer = page.url();

    for (const externalId of externalIds) {
      const zusammenfassung = zusammenfassungen.get(externalId);
      if (zusammenfassung === undefined) continue;
      await sleep(ZVG_VERZOEGERUNG_MS);
      const ergebnis = await detailSeiteHolen(page, zusammenfassung, referer);
      if (ergebnis.art === "erfasst") termine.push(ergebnis.daten);
      else if (ergebnis.art === "ohne-verkehrswert") ohneVerkehrswert.push(zusammenfassung);
      // "stoerung": weder Termin noch Zeile -- der Abruf ist gescheitert,
      // keine Aussage ueber das Objekt moeglich.
    }
  } finally {
    await browser.close();
  }
  return { termine, ohneVerkehrswert };
}
