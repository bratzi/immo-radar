import { chromium, type Browser, type Page } from "playwright";
import {
  parseImmoweltListPage,
  istMehrfamilienhausKandidat,
  type ImmoweltListSummary,
} from "./list.js";
import { parseImmoweltDetailPage, type ImmoweltDetailData } from "./detail.js";
import { rotiereAuswahl, type SweepErgebnis } from "../../lib/bestand.js";
import { bestaetigeConsentBanner } from "../consent.js";

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

/** Sammelt eine Region ueber alle Ergebnisseiten ein. */
async function regionErfassen(
  page: Page,
  region: { code: string; pfad: string },
  ziel: Map<string, ImmoweltListSummary>,
  consentBereitsBestaetigt: boolean
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
  for (; seite <= SEITEN_DECKEL; seite += 1) {
    for (const karte of parseImmoweltListPage(await page.content())) {
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
    await sleep(IMMOWELT_VERZOEGERUNG_MS);
    try {
      await weiter.first().click();
    } catch {
      // Klick fehlgeschlagen, obwohl der Knopf da ist -- praktisch immer faengt
      // das frisch aufgebaute Usercentrics-Overlay den Klick ab. Usercentrics
      // baut das Overlay bei JEDEM Seitenwechsel neu auf (`data-created-at`
      // aendert sich pro Seite), eine einmalige Bestaetigung pro Browser-
      // Context haelt daher ueber einen mehrseitigen Sweep nicht. Belegt im
      // Live-Lauf: Seite 1 und 2 liefen nach einer Bestaetigung, Seite 3 wurde
      // erneut abgefangen. Also einmal kurz wegklicken und den Klick GENAU
      // einmal wiederholen; schlaegt auch der zweite Versuch fehl, gilt die
      // Region wie bisher als zu Ende (kein Endlos-Retry).
      await bestaetigeConsentBanner(page, 2000);
      try {
        await weiter.first().click();
      } catch {
        break;
      }
    }
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
        await page.goto(zusammenfassung.url, { waitUntil: "domcontentloaded", referer });
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
