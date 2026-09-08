import { chromium, type Browser, type Page } from "playwright";
import {
  parseImmoweltListPage,
  istMehrfamilienhausKandidat,
  type ImmoweltListSummary,
} from "./list.js";
import { parseImmoweltDetailPage, type ImmoweltDetailData } from "./detail.js";
import { rotiereAuswahl, type RegionLauf, type SweepErgebnis } from "../../lib/bestand.js";
import { bestaetigeConsentBanner } from "../consent.js";
import { schliesseStoerendeUeberlagerung } from "../overlays.js";

const BASIS = "https://www.immowelt.de/suche/kaufen/haus/mehrfamilienhaus/guenstig/";
/**
 * Drosselung zwischen zwei Immowelt-Seitenabrufen. Bewusst hoeher als die
 * projektweiten 1000 ms: der volle Bundes-Sweep sind ~885 Ergebnisseiten, und
 * bei 1 s Abstand kam die DataDome-CAPTCHA mitten im Lauf zurueck (Live-Lauf
 * 2026-09-07, trotz Fenstermodus). 5 s * ~885 = ~74 min faellt zwar aus dem
 * Zeitbudget eines einzelnen Laufs -- deshalb deckt jeder Lauf nur einen
 * Ausschnitt ab (siehe SWEEP_BUDGET_MS) -- haelt die Anfragerate aber
 * niedrig genug, um unauffaellig zu bleiben.
 *
 * Wird in `main.ts` importiert, um daraus die Zahl der Immowelt-
 * Detailkandidaten abzuleiten -- so kann das Detailbudget nie von dieser
 * Drossel abdriften.
 */
export const IMMOWELT_VERZOEGERUNG_MS = 5000;

/**
 * Wanduhr-Budget eines einzelnen Immowelt-Laufs. Kein Regionen-Zaehler: die
 * Bundeslaender sind viel zu unterschiedlich gross (Nordrhein-Westfalen allein
 * ~188 Ergebnisseiten -> ~16 min bei 5 s Drossel; NRW + Bayern +
 * Baden-Wuerttemberg zusammen ~441 Seiten -> ~37 min), die Lauflaenge wuerde je
 * nach ausgeloster Scheibe wild schwanken.
 *
 * Rechnung: ~885 Ergebnisseiten bundesweit, bei IMMOWELT_VERZOEGERUNG_MS = 5 s
 * sind das ~74 min fuer einen vollen Kreis. Mit 12 min pro Lauf nimmt jeder
 * Lauf eine begrenzte Scheibe, und der Kreis schliesst sich ueber mehrere
 * Laeufe (~74 / 12 ~ 6 Laeufe).
 */
const SWEEP_BUDGET_MS = 12 * 60 * 1000;
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

/**
 * Aufwaerm-URL fuer Phase B (Detailseiten). Eine echte Ergebnisliste, aufgebaut
 * exakt wie in `regionErfassen` aus BASIS + Regionspfad -- hier das erste
 * Bundesland der Regionsliste. Kein neues URL-Schema, nur die bestehende Form.
 * Wozu das Aufwaermen dient, steht bei `erfasseImmoweltDetails`.
 */
const AUFWAERM_URL = `${BASIS}${IMMOWELT_REGIONEN[0].pfad}`;

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

/**
 * Wie oft ein abgefangener "naechste Seite"-Klick wiederholt wird, und wie viel
 * Zeit das Consent-Banner beim jeweiligen Versuch bekommt.
 *
 * Die Zahlen stammen aus einem Live-Lauf gegen Bremen (2026-09-07): Der
 * Akzeptieren-Knopf rendert unvorhersehbar spaet in den Shadow Root. Ein
 * Versuch mit 10 s fand ihn NICHT, der naechste mit 2 s fand ihn, der
 * uebernaechste mit 2 s wieder nicht. Es ist also kein fester Schwellenwert,
 * ab dem es klappt -- es ist ein Rennen. Die Antwort darauf ist mehrmals
 * versuchen und dabei laenger warten, nicht einmal laenger warten.
 *
 * Mit nur einem Retry (Stand 137ba2d) brach Bremen nach 2 von 5 Seiten ab und
 * lieferte 80 statt 209 Objekten.
 */
const CONSENT_RETRY_BUDGETS_MS = [3_000, 6_000, 12_000];

/** Ausgang einer einzelnen Region -- erfasst (mit oder ohne Trefferzahl) oder
 *  mit einem Fehler abgebrochen. */
export type RegionAusgang =
  | { art: "erfasst"; gemeldet: number | null }
  | { art: "fehler" };

/**
 * Die vom Portal ausgewiesene Gesamttrefferzahl ueber alle Regionen eines
 * Laufs -- oder null, wenn sie nicht beurteilbar ist.
 *
 * FAIL-CLOSED, und das ist der ganze Zweck: Diese Zahl geht in die
 * Mengenplausibilitaet ein, die Loeschungen autorisiert. Eine Summe, die
 * einzelne fehlende Beitraege verschweigt, ist gefaehrlicher als gar keine
 * Zahl. Null Regionen ergeben deshalb null und nicht 0.
 *
 * Live-Befund 2026-09-07: In `sweep_runs` stand `gemeldete_treffer = 0` neben
 * 562 eingesammelten Objekten. Abgebrochene Regionen trugen 0 zur Summe bei,
 * ohne sie als unbrauchbar zu markieren -- dieselbe Fail-open-Bauart, die das
 * Review schon einmal als teuersten Fehler des Plans gefunden hat.
 */
export function gemeldeteTrefferSumme(ausgaenge: RegionAusgang[]): number | null {
  if (ausgaenge.length === 0) return null;
  let summe = 0;
  for (const a of ausgaenge) {
    if (a.art === "fehler") return null;
    if (a.gemeldet === null) return null;
    summe += a.gemeldet;
  }
  return summe;
}

/**
 * Versucht, eine Seite weiterzublaettern, und raeumt dabei so oft wie noetig
 * das Consent-Overlay weg.
 *
 * Warum das mehr als ein Retry braucht, steht bei CONSENT_RETRY_BUDGETS_MS.
 * Die beiden Aktionen kommen als Funktionen herein, damit diese Logik ohne
 * Browser testbar ist.
 *
 * @returns true, wenn ein Klick durchging; false, wenn alle Versuche scheiterten.
 */
export async function blaettereWeiter(
  klicke: () => Promise<void>,
  raeumeAuf: (budgetMs: number) => Promise<void>,
  hatGeblaettert: () => Promise<boolean>,
  budgets: number[] = CONSENT_RETRY_BUDGETS_MS
): Promise<boolean> {
  // Ein Versuch gilt NUR dann als gelungen, wenn sich die Ergebnisliste
  // danach tatsaechlich geaendert hat.
  //
  // WARUM DAS NICHT AM KLICK HAENGT: Live gemessen (Bremen, 2026-09-08) gingen
  // fuenf Klicks nacheinander ohne Ausnahme durch, waehrend die Liste ab
  // Seite 2 stehenblieb -- eingesammelt wurden 80 statt 209 Objekte, weil
  // dieselbe Seite immer wieder gelesen und ueber die externalId
  // wegdedupliziert wurde. Ein Overlay kann einen Klick schlucken, ohne dass
  // Playwright etwas meldet. "Hat nicht geworfen" ist deshalb kein Beleg.
  try {
    await klicke();
    if (await hatGeblaettert()) return true;
  } catch {
    // Klick abgefangen -- gleich aufraeumen und erneut versuchen.
  }

  for (const budget of budgets) {
    await raeumeAuf(budget);
    try {
      await klicke();
      if (await hatGeblaettert()) return true;
    } catch {
      continue;
    }
  }
  return false;
}

/** Wie lange nach einem Klick auf eine tatsaechlich neue Liste gewartet wird. */
const NEUE_LISTE_TIMEOUT_MS = 8_000;

/**
 * Kennung der ersten Ergebniskarte. Aendert sie sich, wurde wirklich
 * geblaettert. Bewusst ueber einen Locator statt `page.evaluate`: `tsx`
 * spritzt in verschachtelte Funktionen einen `__name`-Helfer ein, den es im
 * Browser nicht gibt.
 */
async function ersteKartenKennung(page: Page): Promise<string | null> {
  try {
    return await page.locator('a[href*="/expose/"]').first().getAttribute("href", { timeout: 2_000 });
  } catch {
    return null;
  }
}

/**
 * Wartet darauf, dass die Ergebnisliste eine ANDERE erste Karte zeigt als
 * `vorher`. Das ist der einzige verlaessliche Beleg fuer einen Seitenwechsel:
 * Ein Klick, der keine Ausnahme wirft, sagt darueber nichts (siehe
 * `blaettereWeiter`).
 */
async function wartetAufNeueListe(
  page: Page,
  vorher: string | null,
  timeoutMs: number = NEUE_LISTE_TIMEOUT_MS
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await ersteKartenKennung(page)) !== vorher) return true;
    await sleep(250);
  }
  return false;
}

/**
 * Sammelt eine Region ueber alle Ergebnisseiten ein.
 *
 * Exportiert ausschliesslich fuer `scripts/pruefe-region.mts` -- das
 * Pruefwerkzeug muss GENAU diesen Codepfad beobachten koennen, sonst prueft es
 * eine Nachbildung statt der Produktion. Ausserdem ist es die einzige
 * Moeglichkeit, lokal EINE Region zu fahren: `sweepImmowelt` laeuft immer ueber
 * die rotierende Laenderliste, und ein bundesweiter Lauf ueber einen privaten
 * Anschluss ist ausdruecklich unerwuenscht (siehe README/UEBERGABE).
 */
export async function regionErfassen(
  page: Page,
  region: { code: string; pfad: string },
  ziel: Map<string, ImmoweltListSummary>,
  consentBereitsBestaetigt: boolean,
  /**
   * Obergrenze der Ergebnisseiten. NUR fuer `scripts/pruefe-region.mts`
   * gedacht, damit eine grosse Region lokal geprueft werden kann, ohne den
   * Anschluss des Nutzers mit 60 Seitenabrufen zu belasten. Im Produktivlauf
   * bleibt es beim Seitendeckel des Portals.
   */
  maxSeiten: number = SEITEN_DECKEL
): Promise<{ gemeldet: number | null; abgeschnitten: boolean; gesammelt: number }> {
  await page.goto(`${BASIS}${region.pfad}`, { waitUntil: "domcontentloaded" });
  // Einmal pro Browser-Context, direkt nach der ersten Navigation: das
  // Usercentrics-Overlay wegklicken. Ohne das laeuft jeder "naechste
  // Seite"-Klick unten in einen 30-s-Timeout und der Sweep sammelt still nur
  // Seite 1 pro Region ein (siehe scrapers/consent.ts).
  if (!consentBereitsBestaetigt) await bestaetigeConsentBanner(page);
  const gemeldet = trefferzahlAusTitel(await page.title());

  // Nur die IDs DIESER Region -- `ziel` wird ueber alle Laender geteilt und
  // taugt daher nicht zum Zaehlen, was ein einzelnes Land geliefert hat.
  const regionIds = new Set<string>();
  let seite = 1;
  const deckel = Math.min(SEITEN_DECKEL, maxSeiten);
  for (; seite <= deckel; seite += 1) {
    // Fundort aufpraegen: Immowelts externalId ist eine UUID und verraet
    // nicht, auf welcher Regionsliste das Objekt stand.
    for (const karte of parseImmoweltListPage(await page.content(), region.code)) {
      if (istMehrfamilienhausKandidat(karte.titleLine)) {
        ziel.set(karte.externalId, karte);
        regionIds.add(karte.externalId);
      }
    }
    const weiter = page.locator('button[aria-label="nächste seite"]');
    // Fehlt der "naechste Seite"-Knopf, ist die Region regulaer zu Ende. Das
    // ist die einzige Abbruchbedingung und bleibt es -- der Retry unten greift
    // NUR bei einem fehlgeschlagenen Klick, nie bei fehlendem Knopf.
    if ((await weiter.count()) === 0) break;
    // Merken, was gerade oben steht -- daran wird gleich gemessen, ob wirklich
    // geblaettert wurde.
    const vorherigeKennung = await ersteKartenKennung(page);
    await sleep(IMMOWELT_VERZOEGERUNG_MS);
    // Klick faengt praktisch immer das frisch aufgebaute Usercentrics-Overlay
    // ab. Usercentrics baut es bei JEDEM Seitenwechsel neu auf, eine einmalige
    // Bestaetigung haelt ueber einen mehrseitigen Sweep also nicht. Wie oft und
    // wie lange nachgefasst wird, steht bei CONSENT_RETRY_BUDGETS_MS -- ein
    // einzelner Retry mit fester Frist reichte nachweislich nicht.
    const weitergeblaettert = await blaettereWeiter(
      () => weiter.first().click(),
      async (budgetMs) => {
        // Reihenfolge zaehlt: Der Suchauftrag-Dialog ist der haeufigere
        // Blockierer (er kommt verlaesslich beim Wechsel auf Seite 2), das
        // Cookie-Banner nur beim ersten Aufschlag.
        await schliesseStoerendeUeberlagerung(page, budgetMs);
        await bestaetigeConsentBanner(page, budgetMs);
      },
      () => wartetAufNeueListe(page, vorherigeKennung)
    );
    // Kein Endlos-Retry: geht der Klick auch nach allen Versuchen nicht durch,
    // gilt die Region als zu Ende.
    if (!weitergeblaettert) break;
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
 * Jeder Lauf grast nur so viele Bundeslaender ab, wie in SWEEP_BUDGET_MS
 * Wanduhrzeit passen (rotierend, siehe unten) -- der volle Kreis wuerde bei 5 s
 * Drosselung das Zeitbudget sprengen und die DataDome-CAPTCHA zurueckholen. Ein
 * Teil-Sweep ueber wenige Laender ist damit nie eine vollstaendige Erfassung:
 * `vollstaendig` ist fuer Immowelt grundsaetzlich `false` (siehe Rueckgabe).
 * Volle Abdeckung sammelt sich ueber mehrere Laeufe an.
 */
export async function sweepImmowelt(): Promise<{
  sweep: SweepErgebnis;
  zusammenfassungen: Map<string, ImmoweltListSummary>;
  /** Mengenhistorie je Region -- Vorbereitung der regionsgenauen Loeschhoheit. */
  regionLaeufe: RegionLauf[];
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
  // Ausgang JEDER angefassten Region -- auch der abgebrochenen. Aus dieser
  // Liste entsteht am Ende die gemeldete Trefferzahl (fail-closed, siehe
  // gemeldeteTrefferSumme). Frueher waren das zwei lose Variablen, und eine
  // abgestuerzte Region beruehrte keine von beiden.
  const ausgaenge: RegionAusgang[] = [];
  // Was JEDE angefasste Region geliefert hat. Aendert heute nichts am
  // Loeschverhalten; sammelt die Historie, die eine spaetere regionsgenaue
  // Loeschhoheit braucht.
  const regionLaeufe: RegionLauf[] = [];

  // Die volle Regionsliste in Rotationsreihenfolge. `rotiereAuswahl` (aus
  // lib/bestand.js, unit-getestet) liefert bei Budget == Listenlaenge die
  // ganze Liste, aber am wandernden Startpunkt aufgeschnitten; der Versatz ist
  // -- wie bei der Detail-Rotation in main.ts -- die Stundenzahl seit Epoche,
  // sodass Folgelaeufe an spaeteren Regionen beginnen. Wie weit ein Lauf durch
  // diese Reihenfolge kommt, entscheidet allein SWEEP_BUDGET_MS.
  const versatz = Math.floor(Date.now() / 3_600_000);
  const rotierteCodes = rotiereAuswahl(
    IMMOWELT_REGIONEN.map((r) => r.code),
    IMMOWELT_REGIONEN.length,
    versatz
  );
  const regionen = rotierteCodes.map(
    (code) => IMMOWELT_REGIONEN.find((r) => r.code === code)!
  );

  const startMs = Date.now();
  let abgearbeitet = 0;

  try {
    const page = await browser.newPage();
    // Consent-Zustand lebt im Browser-Context: einmal weggeklickt, bleibt er
    // weg. Wird nach der ersten erfolgreichen `regionErfassen` gesetzt.
    let consentErledigt = false;
    for (const region of regionen) {
      // Budget-Wache VOR dem Start einer Region. Eine einmal begonnene Region
      // wird in `regionErfassen` immer zu Ende geblaettert -- ein halb
      // erfasstes Bundesland waere eine Luege ueber die Abdeckung. Die erste
      // Region laeuft immer, egal wie knapp das Budget schon ist.
      if (abgearbeitet > 0 && Date.now() - startMs >= SWEEP_BUDGET_MS) break;
      abgearbeitet += 1;
      await sleep(IMMOWELT_VERZOEGERUNG_MS);
      try {
        const { gemeldet, abgeschnitten, gesammelt } = await regionErfassen(
          page,
          region,
          zusammenfassungen,
          consentErledigt
        );
        consentErledigt = true;
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
        ausgaenge.push({ art: "erfasst", gemeldet });
        regionLaeufe.push({
          partition: region.code,
          gesehene: gesammelt,
          gemeldeteTreffer: gemeldet,
          vollstaendig: istRegionVollstaendig(gesammelt, gemeldet),
        });
      } catch (err) {
        // Eine abgebrochene Region ist NICHT "null gemeldete Treffer". Sie ist
        // nicht beurteilbar, und das muss bis in die Trefferzahl durchschlagen.
        ausgaenge.push({ art: "fehler" });
        // Wie viel diese Region vor dem Abbruch schon eingesammelt hatte,
        // laesst sich hier nicht sagen -- die Ausnahme kam aus der Mitte der
        // Blaetterschleife. Festgehalten wird deshalb nur, DASS sie nicht
        // beurteilbar ist; als Referenzlauf zaehlt sie dadurch nie.
        regionLaeufe.push({
          partition: region.code,
          gesehene: 0,
          gemeldeteTreffer: null,
          vollstaendig: false,
        });
        console.warn(`Immowelt-Sweep ${region.code}: Fehler`, err);
      }
    }
  } catch (err) {
    console.warn("Immowelt-Sweep abgebrochen", err);
  } finally {
    await browser.close();
  }

  const abgedeckt = regionen.slice(0, abgearbeitet).map((r) => r.code);
  const zurueckgestellt = regionen.length - abgearbeitet;
  console.log(
    `Immowelt-Sweep: Regionen dieses Laufs -- ${abgedeckt.join(", ") || "keine"} ` +
      `(${abgearbeitet} von ${IMMOWELT_REGIONEN.length} abgearbeitet, ${zurueckgestellt} ` +
      `wegen Zeitbudget auf Folgelaeufe zurueckgestellt).`
  );
  console.log(`Immowelt-Sweep: ${zusammenfassungen.size} Mehrfamilienhaus-Kandidaten.`);
  return {
    sweep: {
      source: "immowelt",
      // Immer false, ohne Ausnahme: ein Lauf, der nur so viele Bundeslaender
      // abgrast, wie ins Wanduhr-Budget passen, kann per Definition nicht
      // vollstaendig sein. Bewusst so gebaut, um unter der Anti-Bot-
      // Ratenschwelle zu bleiben. Immowelt liefert dadurch weiterhin Kandidaten
      // (das Hinzufuegen ist nie an `vollstaendig` gebunden), autorisiert aber
      // keine Loeschung. Die Loeschhoheit zurueckzuholen hiesse, pro Fundort zu
      // verengen -- das braucht eine Spalte, die festhaelt, WO jedes Listing
      // gefunden wurde, und ist ein eigenes Arbeitspaket. Bis dahin loescht nur
      // ZVG.
      vollstaendig: false,
      // Partiell AUS PRINZIP: die 5-s-Drossel erzwingt die rotierende Scheibe
      // oben. Diese Unvollstaendigkeit ist erwartet und darf in
      // `gleicheBestandAb` nicht als Anomalie ueber Telegram gemeldet werden.
      strukturellTeilweise: true,
      // Die Regionen, die in diesem Lauf VOLLSTAENDIG durchliefen. Als Beleg
      // protokolliert, nicht als Loeschfilter: `vollstaendig` ist fuer
      // Immowelt immer false, und `partitionAusExternalId` liefert fuer diese
      // Quelle null -- zwei unabhaengige Sperren, die bestehen bleiben, bis
      // die regionsgenaue Loeschhoheit bewusst gebaut wird.
      geltungsbereich: regionLaeufe.filter((l) => l.vollstaendig).map((l) => l.partition),
      gesehene: new Set(zusammenfassungen.keys()),
      gemeldeteTreffer: gemeldeteTrefferSumme(ausgaenge),
    },
    zusammenfassungen,
    regionLaeufe,
  };
}

/**
 * Ab welcher HTML-Groesse eine Antwort als vollstaendige Seite gilt. Echte
 * Immowelt-Seiten liegen bei 650.000 bis 1.150.000 Zeichen (lokal gemessen,
 * 2026-09-08); eine DataDome-Huelle bei rund 1,5 kB.
 */
const VOLLE_SEITE_AB_ZEICHEN = 50_000;

/**
 * Warum ein Detailabruf nichts brauchbares geliefert hat -- oder null, wenn
 * alles in Ordnung ist.
 *
 * WARUM DIESE FUNKTION EXISTIERT: Im Produktivlauf scheiterten ALLE 144
 * Immowelt-Detailseiten mit der Parser-Meldung
 * "__UFRN_LIFECYCLE_SERVERREQUEST__ nicht gefunden -- Seitenstruktur hat sich
 * vermutlich geaendert". Dieselben URLs lieferten lokal HTTP 200 mit
 * vollstaendigem Datenmodell. Die Struktur war also nie das Problem, und die
 * Meldung schickte die Fehlersuche in die falsche Richtung -- zum dritten Mal
 * in diesem Projekt (davor: "Pagination kaputt", "Immowelt gesperrt").
 *
 * Der HTTP-Status stand die ganze Zeit zur Verfuegung: `page.goto` gibt eine
 * Response zurueck, die niemand ausgewertet hat. Diese Funktion trennt die
 * drei Faelle, die sich sonst gleich anfuehlen:
 *
 *  - Status ungleich 200: der Abruf wurde abgewiesen. Eine Sperre, kein Umbau.
 *  - Status 200, aber winzige Seite: DataDomes Soft-Block antwortet mit 200
 *    und einer ~1,5-kB-Huelle ("Please enable JS and disable any ad blocker").
 *  - Status 200, vollstaendige Seite, trotzdem kein Datenmodell: erst HIER
 *    darf man die Seitenstruktur verdaechtigen.
 *
 * Eine fehlende Antwort (`status === null`) gilt als nicht beurteilbar, nicht
 * als in Ordnung.
 */
export function beurteileDetailAntwort(
  status: number | null,
  htmlLaenge: number,
  hatDatenmodell: boolean
): string | null {
  if (status === null) {
    return "Keine HTTP-Antwort erhalten -- nicht beurteilbar.";
  }
  if (status !== 200) {
    return `Abruf abgewiesen: HTTP ${status}. Das ist eine Sperre oder ein Fehler der Gegenseite.`;
  }
  if (hatDatenmodell) return null;
  if (htmlLaenge < VOLLE_SEITE_AB_ZEICHEN) {
    return (
      `HTTP 200, aber nur ${htmlLaenge} Zeichen -- eine Huelle statt der Seite. ` +
      `So sieht DataDomes Soft-Block aus. Antwort darauf ist Drosselung, nicht Umgehung.`
    );
  }
  return (
    `HTTP 200 und ${htmlLaenge} Zeichen, aber kein Datenmodell -- hier kann die ` +
    `Seitenstruktur tatsaechlich geaendert sein. Erst jetzt lohnt ein Blick in den Parser.`
  );
}

/**
 * Phase B: Detailseiten nur fuer die uebergebenen externalIds.
 *
 * WIRD VOM PRODUKTIVLAUF NICHT MEHR AUFGERUFEN (Stand 2026-09-08). Immowelts
 * /expose/-Seiten antworten von Rechenzentrums-Adressen mit HTTP 403 und einem
 * DataDome-CAPTCHA, waehrend /suche/ im selben Lauf und derselben
 * Browser-Sitzung HTTP 200 mit vollstaendiger Seite liefert -- direkt
 * nacheinander auf einem GitHub-Runner gemessen. 144 von 144 Abrufen je Lauf
 * scheiterten so, zwoelf Minuten Budget fuer nichts.
 *
 * Die Bewertung kommt seither aus der Titelzeile der Ergebniskarte
 * (scrapers/immowelt/titelzeile.ts). Diese Funktion bleibt stehen, weil sie
 * von einem gewoehnlichen Anschluss aus nachweislich funktioniert (lokal
 * geprueft, HTTP 200 mit vollem Datenmodell) -- sie waere der Weg, falls der
 * Lauf je von einer nicht gesperrten Adresse aus stattfindet. Vorher aber
 * pruefen, ob die Sperre noch besteht, statt sie einfach wieder einzuhaengen.
 */
export async function erfasseImmoweltDetails(
  zusammenfassungen: Map<string, ImmoweltListSummary>,
  externalIds: string[]
): Promise<ImmoweltDetailData[]> {
  if (externalIds.length === 0) return [];

  // headless: false zwingend -- Begruendung siehe sweepImmowelt oben.
  const browser: Browser = await chromium.launch({ headless: false });
  const ergebnisse: ImmoweltDetailData[] = [];
  // Wie viele Abrufe nichts brauchbares lieferten. Nur die ersten drei werden
  // einzeln gemeldet -- 144 gleichlautende Zeilen verstopfen das Log und
  // verbergen die eine Zahl, auf die es ankommt.
  let abgewiesen = 0;
  try {
    const page: Page = await browser.newPage();

    // Session aufwaermen, BEVOR die erste Detailseite geholt wird -- genau der
    // Schritt, den `erfasseZvgDetails` fuer sein Portal schon macht und der hier
    // fehlte. Ein frischer Browser, der als allererste Anfrage direkt eine
    // /expose/-URL oeffnet (kein vorheriger Seitenaufruf, keine Session, kein
    // Consent), bekommt von Immowelts Schutz eine 403-Huelle statt der Seite.
    // `parseImmoweltDetailPage` findet darin das Datenmodell
    // (__UFRN_LIFECYCLE_SERVERREQUEST__) nicht, meldet "Seitenstruktur
    // geaendert" -- und so geht JEDE Detailseite des Laufs verloren.
    // Direkt belegt (Live-Lauf 2026-09-07, dieselbe expose-URL): kalt
    // angesteuert -> HTTP 403 mit Huelle; zuerst eine Suchseite laden, ein paar
    // Sekunden warten, dann zur expose-URL -> HTTP 200 mit vollstaendigem
    // Datenmodell. Nicht als redundant entfernen -- ohne diesen Schritt liefert
    // Phase B fuer Immowelt nichts.
    await page.goto(AUFWAERM_URL, { waitUntil: "domcontentloaded" });
    // Consent-Banner JETZT wegklicken, nach dem Aufwaermen: gegen die echte
    // Suchseite, nicht gegen die 403-Huelle, an der es nichts ausrichten konnte.
    // Einmal pro Browser-Context (siehe scrapers/consent.ts).
    await bestaetigeConsentBanner(page);
    // Referer fuer jede Detailnavigation -- wie in `erfasseZvgDetails`. Eine
    // expose-Seite wird normalerweise aus einer Ergebnisliste heraus geoeffnet.
    const referer = page.url();

    for (const externalId of externalIds) {
      const zusammenfassung = zusammenfassungen.get(externalId);
      if (zusammenfassung === undefined) continue;
      // Drossel vor jedem Abruf -- auch vor dem ersten. Das ist zugleich die
      // kurze Ruhe nach der Suchseite, die die manuelle Probe vor der ersten
      // erfolgreichen Detailnavigation brauchte. Das Aufwaermen oben ist ein
      // weiterer Seitenabruf und damit wie die uebrigen gedrosselt.
      await sleep(IMMOWELT_VERZOEGERUNG_MS);
      try {
        const antwort = await page.goto(zusammenfassung.url, {
          waitUntil: "domcontentloaded",
          referer,
        });
        const html = await page.content();
        // Erst beurteilen, DANN parsen: Der Parser kann nur "Datenmodell
        // fehlt" sagen und verdaechtigt dafuer die Seitenstruktur -- auch
        // dann, wenn in Wahrheit eine Sperre geantwortet hat.
        const urteil = beurteileDetailAntwort(
          antwort?.status() ?? null,
          html.length,
          html.includes("__UFRN_LIFECYCLE_SERVERREQUEST__")
        );
        if (urteil !== null) {
          abgewiesen += 1;
          if (abgewiesen <= 3) {
            console.warn(`Immowelt-Detailseite ${zusammenfassung.url}: ${urteil}`);
          }
          continue;
        }
        ergebnisse.push(
          parseImmoweltDetailPage(html, {
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
  if (abgewiesen > 0) {
    console.warn(
      `Immowelt-Details: ${abgewiesen} von ${externalIds.length} Abrufen ohne Datenmodell, ` +
        `${ergebnisse.length} erfasst. Bei einem Totalausfall zuerst den oben genannten ` +
        `Grund lesen -- eine Sperre erfordert Drosselung, eine Strukturaenderung den Parser.`
    );
  }
  return ergebnisse;
}
