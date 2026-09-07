import { chromium, type Browser, type Page } from "playwright";
import {
  parseImmoweltListPage,
  istMehrfamilienhausKandidat,
  type ImmoweltListSummary,
} from "./list.js";
import { parseImmoweltDetailPage, type ImmoweltDetailData } from "./detail.js";
import { rotiereAuswahl, type SweepErgebnis } from "../../lib/bestand.js";

const BASIS = "https://www.immowelt.de/suche/kaufen/haus/mehrfamilienhaus/guenstig/";
/**
 * Drosselung zwischen zwei Immowelt-Seitenabrufen. Bewusst hoeher als die
 * projektweiten 1000 ms: der volle Bundes-Sweep sind ~885 Ergebnisseiten, und
 * bei 1 s Abstand kam die DataDome-CAPTCHA mitten im Lauf zurueck (Live-Lauf
 * 2026-09-07, trotz Fenstermodus). 5 s * ~885 = ~74 min faellt zwar aus dem
 * Zeitbudget eines einzelnen Laufs -- deshalb deckt jeder Lauf nur einen
 * Ausschnitt ab (siehe REGIONEN_PRO_LAUF) -- haelt die Anfragerate aber
 * niedrig genug, um unauffaellig zu bleiben.
 */
const IMMOWELT_VERZOEGERUNG_MS = 5000;

/**
 * Wie viele der 16 Bundeslaender ein einzelner Lauf abgrast. Rechnung: ~885
 * Ergebnisseiten bundesweit, bei IMMOWELT_VERZOEGERUNG_MS = 5 s sind das
 * ~74 min fuer den ganzen Kreis. Damit ein Lauf nahe bei zehn Minuten bleibt,
 * passen ~110 Seiten -> 885 / 16 ~ 55 Seiten pro Land -> rund drei Laender.
 * Der Rest folgt in den Folgelaeufen; ein voller Durchlauf sammelt sich ueber
 * den Tag an (16 / 3 ~ 6 Laeufe).
 */
const REGIONEN_PRO_LAUF = 3;
/**
 * Immowelt deckelt jede Ergebnisliste bei 250 Seiten. Erreicht eine Region
 * diesen Wert, ist ihre Menge abgeschnitten und der Sweep gilt als
 * unvollstaendig.
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

/**
 * Anteil, um den die eingesammelte Menge einer Region hinter der vom Portal
 * gemeldeten Trefferzahl zurueckbleiben darf, bevor die Region als
 * unvollstaendig gilt. Gleiche Zahl wie `TOLERANZ_ANTEIL` in
 * `lib/plausibilitaet.ts` -- dieselbe Mengen-Plausibilitaet, nur eine Ebene
 * frueher (pro Bundesland statt fuer die ganze Quelle).
 */
const REGION_FEHLBETRAG_TOLERANZ = 0.25;

/**
 * Hat eine Region genug Objekte geliefert, um ihrer Vollstaendigkeit zu
 * trauen? Diese Funktion faengt den Fall ab, den `page.goto` NICHT bemerkt:
 * Immowelt sitzt hinter DataDome, und ein Soft-Block kommt als HTTP 200 mit
 * einer leeren Huelle zurueck. `parseImmoweltListPage` wirft darauf nicht, es
 * liefert schlicht `[]`. Ohne diese Wache liefe der Sweep technisch sauber
 * durch, meldete `vollstaendig=true` und autorisierte eine Massenloeschung.
 *
 * Wie sie ausfaellt und warum:
 *
 * - `gesammelt === 0`: immer `false` -- ganz gleich, was der Titel sagt. Null
 *   eingesammelte Objekte sind nie ein Beleg fuer Vollstaendigkeit. Selbst
 *   `gemeldet === 0` (Portal weist ausdruecklich null Angebote aus) rettet
 *   diesen Fall nicht: eine geblockte Huelle kann einen Titel tragen, der zu
 *   null Treffern parst, und dann waere 0/0 nur scheinbar in sich stimmig.
 * - `gemeldet > 0` und `gesammelt > 0`: normale Mengenpruefung. Bleibt die
 *   eingesammelte Menge um mehr als REGION_FEHLBETRAG_TOLERANZ zurueck ->
 *   `false`.
 * - `gemeldet === null`, aber `gesammelt > 0`: `true`. Eine echte Seite, deren
 *   Titel nur nicht parste (Formatwechsel). Daraus laesst sich nichts gegen
 *   die Region ableiten; es bleibt bei der Seitendeckel-Pruefung
 *   (`abgeschnitten`) und der quellenweiten Mengenpruefung in
 *   `lib/plausibilitaet.ts`.
 */
export function istRegionVollstaendig(gesammelt: number, gemeldet: number | null): boolean {
  if (gesammelt === 0) return false;
  if (gemeldet === null) return true;
  if (gemeldet === 0) return true;
  return gesammelt >= gemeldet * (1 - REGION_FEHLBETRAG_TOLERANZ);
}

/** Sammelt eine Region ueber alle Ergebnisseiten ein. */
async function regionErfassen(
  page: Page,
  region: { code: string; pfad: string },
  ziel: Map<string, ImmoweltListSummary>
): Promise<{ gemeldet: number | null; abgeschnitten: boolean; gesammelt: number }> {
  await page.goto(`${BASIS}${region.pfad}`, { waitUntil: "domcontentloaded" });
  const gemeldet = trefferzahlAusTitel(await page.title());

  // Nur die IDs DIESER Region -- `ziel` wird ueber alle Laender geteilt und
  // taugt daher nicht zum Zaehlen, was ein einzelnes Land geliefert hat.
  const regionIds = new Set<string>();
  let seite = 1;
  for (; seite <= SEITEN_DECKEL; seite += 1) {
    for (const karte of parseImmoweltListPage(await page.content())) {
      if (istMehrfamilienhausKandidat(karte.titleLine)) {
        ziel.set(karte.externalId, karte);
        regionIds.add(karte.externalId);
      }
    }
    const weiter = page.locator('button[aria-label="nächste seite"]');
    if ((await weiter.count()) === 0) break;
    await sleep(IMMOWELT_VERZOEGERUNG_MS);
    await weiter.first().click();
    await page.waitForLoadState("domcontentloaded");
  }

  console.log(
    `Immowelt-Sweep ${region.code}: ${seite} Seiten, ${regionIds.size} Karten, gemeldet ${gemeldet ?? "?"}.`
  );
  return { gemeldet, abgeschnitten: seite > SEITEN_DECKEL, gesammelt: regionIds.size };
}

/**
 * Phase A: Bestandsaufnahme der Ergebnislisten. Der Umweg ueber die Laender
 * ist noetig, weil Immowelt bundesweit bei 250 Seiten deckelt und so nur
 * 10.000 der 35.415 Mehrfamilienhaeuser erreichbar waeren.
 *
 * Jeder Lauf grast nur REGIONEN_PRO_LAUF Bundeslaender ab (rotierend, siehe
 * unten) -- der volle Kreis wuerde bei 5 s Drosselung das Zeitbudget sprengen
 * und die DataDome-CAPTCHA zurueckholen. Ein Teil-Sweep ueber wenige Laender
 * ist damit nie eine vollstaendige Erfassung: `vollstaendig` ist fuer Immowelt
 * grundsaetzlich `false` (siehe Rueckgabe). Volle Abdeckung sammelt sich ueber
 * den Tag ueber mehrere Laeufe an.
 */
export async function sweepImmowelt(): Promise<{
  sweep: SweepErgebnis;
  zusammenfassungen: Map<string, ImmoweltListSummary>;
}> {
  // headless: false ist zwingend, kein Versehen. Immowelt sitzt hinter DataDome.
  // Direktvergleich (gleicher Code, gleiche URL, nur dieses Flag, 2026-09-07):
  // headless -> HTTP 403 mit DataDome-CAPTCHA auf jeder Detailseite und ab
  // Seite 2 der Ergebnisliste (~1,5 kB Body: "Please enable JS and disable any
  // ad blocker"); headfull -> HTTP 200, ~617 kB, vollstaendiges Datenmodell,
  // Bremen blaettert 5 Seiten und sammelt 206 von 209 Objekten.
  // Kein Spoofing, kein Stealth-Plugin, kein navigator.webdriver-Patch, kein
  // CAPTCHA-Loeser -- Chromium laeuft schlicht im normalen Fenstermodus statt
  // im Headless-Modus, dessen JS-Umgebung DataDomes Pruefung nicht besteht.
  // CI hat keinen Bildschirm und startet den Lauf daher unter `xvfb-run`
  // (siehe .github/workflows/scrape.yml). NICHT auf headless "optimieren".
  const browser = await chromium.launch({ headless: false });
  const zusammenfassungen = new Map<string, ImmoweltListSummary>();
  let gemeldeteSumme = 0;
  let gemeldeteVollstaendig = true;

  // Nur einen Ausschnitt der Bundeslaender pro Lauf, rotierend. `rotiereAuswahl`
  // (aus lib/bestand.js, unit-getestet) schneidet ein wanderndes Fenster aus
  // der Codeliste; der Versatz ist -- wie bei der Detail-Rotation in main.ts --
  // die Stundenzahl seit Epoche, sodass Folgelaeufe durch die Liste wandern und
  // ein voller Kreis binnen eines Tages zusammenkommt.
  const versatz = Math.floor(Date.now() / 3_600_000);
  const ausgewaehlteCodes = new Set(
    rotiereAuswahl(
      IMMOWELT_REGIONEN.map((r) => r.code),
      REGIONEN_PRO_LAUF,
      versatz
    )
  );
  const regionen = IMMOWELT_REGIONEN.filter((r) => ausgewaehlteCodes.has(r.code));
  console.log(
    `Immowelt-Sweep: Regionen dieses Laufs -- ${regionen.map((r) => r.code).join(", ")} ` +
      `(${regionen.length} von ${IMMOWELT_REGIONEN.length}; der Rest folgt in Folgelaeufen).`
  );

  try {
    const page = await browser.newPage();
    for (const region of regionen) {
      await sleep(IMMOWELT_VERZOEGERUNG_MS);
      try {
        const { gemeldet, abgeschnitten, gesammelt } = await regionErfassen(
          page,
          region,
          zusammenfassungen
        );
        if (abgeschnitten) {
          console.warn(`Immowelt-Sweep ${region.code}: Seitendeckel erreicht, Menge abgeschnitten.`);
        }
        // Die gesehenen Objekte sind echt und bleiben in `zusammenfassungen`.
        // Diese Pruefung entscheidet NICHT mehr ueber `vollstaendig` (das ist
        // fuer Immowelt ohnehin immer false), sie haelt nur das Log ehrlich:
        // sie faengt eine soft-geblockte Region ab, die lautlos [] liefert.
        if (!istRegionVollstaendig(gesammelt, gemeldet)) {
          console.warn(
            gemeldet === null
              ? `Immowelt-Sweep ${region.code}: weder Trefferzahl im Titel noch eine einzige ` +
                  `Karte -- sieht nach Soft-Block aus.`
              : `Immowelt-Sweep ${region.code}: nur ${gesammelt} von gemeldet ${gemeldet} Objekten ` +
                  `eingesammelt -- Region unvollstaendig.`
          );
        }
        if (gemeldet === null) gemeldeteVollstaendig = false;
        else gemeldeteSumme += gemeldet;
      } catch (err) {
        console.warn(`Immowelt-Sweep ${region.code}: Fehler`, err);
      }
    }
  } catch (err) {
    console.warn("Immowelt-Sweep abgebrochen", err);
  } finally {
    await browser.close();
  }

  console.log(`Immowelt-Sweep: ${zusammenfassungen.size} Mehrfamilienhaus-Kandidaten.`);
  return {
    sweep: {
      source: "immowelt",
      // Immer false, ohne Ausnahme: ein Teil-Sweep ueber nur REGIONEN_PRO_LAUF
      // Bundeslaender kann per Definition nicht vollstaendig sein. Bewusst so
      // gebaut, um unter der Anti-Bot-Ratenschwelle zu bleiben. Immowelt
      // liefert dadurch weiterhin Kandidaten (das Hinzufuegen ist nie an
      // `vollstaendig` gebunden), autorisiert aber keine Loeschung. Die
      // Loeschhoheit zurueckzuholen hiesse, pro Fundort zu verengen -- das
      // braucht eine Spalte, die festhaelt, WO jedes Listing gefunden wurde,
      // und ist ein eigenes Arbeitspaket. Bis dahin loescht nur ZVG.
      vollstaendig: false,
      // Bewusst leer: die Immowelt-externalId ist eine UUID ohne Bundesland,
      // eine partitionsgenaue Loeschung waere daraus nicht ableitbar.
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

  // headless: false zwingend -- Begruendung siehe sweepImmowelt oben.
  const browser: Browser = await chromium.launch({ headless: false });
  const ergebnisse: ImmoweltDetailData[] = [];
  try {
    const page: Page = await browser.newPage();
    for (const externalId of externalIds) {
      const zusammenfassung = zusammenfassungen.get(externalId);
      if (zusammenfassung === undefined) continue;
      await sleep(IMMOWELT_VERZOEGERUNG_MS);
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
