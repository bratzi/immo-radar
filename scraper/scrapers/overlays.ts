import type { Locator, Page } from "playwright";

/**
 * Wegklicken von Immowelts eigenen Werbe-Ueberlagerungen -- NICHT des
 * Cookie-Banners (das macht scrapers/consent.ts).
 *
 * WARUM DIESE DATEI EXISTIERT: Der Immowelt-Sweep brach seit jeher nach genau
 * zwei Ergebnisseiten je Region ab. Das wurde nacheinander als kaputte
 * Pagination, als DataDome-Block und als Cookie-Overlay fehlgedeutet. Gemessen
 * am 2026-09-08 (Bremen, echte Seite) ist es keins davon:
 *
 *   ELEMENT <div class="css-1lcifqp">   fixed, 1265x720, pointer-events: auto
 *     TEXT:  "Beschleunige deine Suche mit einem Suchauftrag ... E-Mail ..."
 *     KNOPF: aria-label="Schließen"
 *     KNOPF: "Suchauftrag speichern"
 *            data-testid="av-ssab-Modal-secondPageModal-submit"
 *
 * Es ist Immowelts Suchauftrag-/Newsletter-Dialog. Sein eigener Testid sagt,
 * wann er kommt: `secondPageModal` -- beim Wechsel auf Seite 2. Danach faengt
 * er jeden Klick auf den "naechste Seite"-Knopf ab, und Playwright meldet
 * woertlich "<div class=\"css-8g8ihq\">…</div> ... subtree intercepts pointer
 * events".
 *
 * Zwei Eigenheiten bestimmen die Umsetzung:
 *  - Die Klassennamen werden bei jedem Rendern neu erzeugt (beobachtet:
 *    css-8g8ihq, css-5h5f1k, css-1lcifqp fuer dasselbe Ding). Ein Selektor auf
 *    die Klasse ist damit wertlos. Stabil sind die ARIA-Rolle `dialog` und der
 *    Schliessen-Knopf mit `aria-label="Schließen"`.
 *  - Der Dialog wird GESCHLOSSEN, nicht bedient. Sein Absenden-Knopf traegt
 *    eine E-Mail-Adresse ein und legt einen Suchauftrag an -- das waere eine
 *    Anmeldung im Namen des Nutzers und ist ausdruecklich nicht gewollt. Es
 *    wird ausschliesslich der Schliessen-Knopf geklickt, so wie ein Mensch es
 *    tut; das Element wird NICHT aus dem DOM gerissen.
 *
 * Diese Funktion wirft nie -- ein misslungener Versuch darf einen Sweep nicht
 * abbrechen.
 */

/**
 * Wie oft nacheinander geschlossen wird. Beobachtet wurden ZWEI gestapelte
 * Ueberlagerungen (Suchauftrag-Dialog plus eine zweite mit einem "x" oben
 * links); nach dem Wegklicken der einen liegt die naechste da. Ein Aufruf muss
 * die Seite freiraeumen, sonst blockt beim naechsten Blaettern wieder etwas.
 */
const MAX_RUNDEN = 4;

/** Wie lange in einer Folgerunde auf die naechste Ueberlagerung gewartet wird. */
const FOLGERUNDE_TIMEOUT_MS = 750;

/** Wie lange nach dem Klick auf das Verschwinden gewartet wird. */
const VERSCHWINDEN_TIMEOUT_MS = 3_000;

/**
 * Beschriftungen, die einen Schliessen-Knopf ausmachen, wenn er KEIN
 * `aria-label` traegt. Nur das typografische Kreuz und ein alleinstehendes
 * "x" -- der Text muss die GESAMTE Beschriftung sein, sonst traefe es
 * beliebige Knoepfe mit einem x im Wort.
 */
const KREUZ_TEXT = /^[×✕✖✗❌ xX]$/;

/**
 * Selektoren fuer den Schliessen-Knopf, in dieser Reihenfolge: erst das
 * eindeutige `aria-label` innerhalb eines echten Dialogs, dann als
 * freistehender Notnagel, zuletzt das nackte Kreuz.
 */
const ARIA_SELEKTOREN = [
  '[role="dialog"] button[aria-label="Schließen"]',
  '[aria-modal="true"] button[aria-label="Schließen"]',
  'button[aria-label="Schließen"]',
  'button[aria-label="Close"]',
  '[role="dialog"] [data-testid*="close" i]',
];

/** Behaelter, in denen ein nacktes Kreuz als Schliessen-Knopf gilt. */
const KREUZ_BEHAELTER = ['[role="dialog"]', '[aria-modal="true"]'];

/** Alle Kandidaten fuer einen Schliessen-Knopf auf dieser Seite. */
function schliessKandidaten(page: Page): Locator[] {
  const kandidaten = ARIA_SELEKTOREN.map((sel) => page.locator(sel));
  for (const behaelter of KREUZ_BEHAELTER) {
    // `hasText` mit verankerter Regex: der Knopf traegt NUR das Kreuz.
    kandidaten.push(
      page.locator(`${behaelter} button`, { hasText: KREUZ_TEXT }),
      page.locator(`${behaelter} [role="button"]`, { hasText: KREUZ_TEXT })
    );
  }
  return kandidaten;
}

/**
 * Der am weitesten oben links liegende sichtbare Treffer -- dort sitzt das
 * Schliesskreuz (vom Nutzer so beobachtet). Ohne diese Wahl koennte bei
 * mehreren Treffern ein beliebiger erwischt werden.
 */
async function obenLinks(kandidaten: Locator[]): Promise<Locator | null> {
  let bester: Locator | null = null;
  let bestesMass = Number.POSITIVE_INFINITY;
  for (const kandidat of kandidaten) {
    const treffer = await kandidat.all();
    for (const t of treffer) {
      let box: { x: number; y: number } | null = null;
      try {
        if (!(await t.isVisible())) continue;
        box = await t.boundingBox();
      } catch {
        continue;
      }
      if (box === null) continue;
      const mass = box.x + box.y;
      if (mass < bestesMass) {
        bestesMass = mass;
        bester = t;
      }
    }
  }
  return bester;
}

/**
 * Attribut, mit dem ein gefundener Schliessen-Knopf kurz markiert wird, damit
 * Playwright ihn anklicken kann. Notwendig, weil die Ueberlagerungen keinen
 * stabilen Selektor haben: ihre Klassennamen werden bei jedem Rendern neu
 * erzeugt, und eine Dialog-Rolle tragen sie nicht (gemessen 2026-09-08:
 * `<div class="css-1lcifqp"> role=- aria-modal=- data-testid=-`).
 *
 * Markiert wird nur; das Overlay wird NICHT aus dem DOM entfernt und kein
 * Zustand der Seite veraendert. Geklickt wird danach ganz normal.
 */
const MARKER = "data-immoradar-schliessen";

/**
 * Sucht das Schliesskreuz einer bildschirmfuellenden Ueberlagerung und
 * markiert es. Ein Kreuz zaehlt nur, wenn es in einem Vorfahren steckt, der
 * fest positioniert ist UND mindestens ein Viertel des Sichtfensters
 * ueberdeckt -- sonst wuerde ein "x" aus dem normalen Seiteninhalt (etwa ein
 * Filter-Chip) getroffen und der Sweep raeumte der Seite die Suche weg.
 *
 * Bei mehreren Treffern gewinnt der am weitesten oben links liegende; dort
 * sitzt das Schliesskreuz (vom Nutzer so beobachtet).
 *
 * ACHTUNG: keine verschachtelten Funktionen im `evaluate`-Rumpf -- `tsx`
 * spritzt dafuer einen `__name`-Helfer ein, den es im Browser nicht gibt.
 */
async function markiereSchliessKreuz(page: Page): Promise<boolean> {
  try {
    return await page.evaluate((marker) => {
      const kreuz = /^[×✕✖✗❌ xX]$/;
      const alt = document.querySelectorAll("[" + marker + "]");
      for (let i = 0; i < alt.length; i += 1) alt[i].removeAttribute(marker);

      let bester: Element | null = null;
      let bestesMass = Number.POSITIVE_INFINITY;
      const alle = document.querySelectorAll('button,[role="button"]');
      for (let i = 0; i < alle.length; i += 1) {
        const el = alle[i];
        const text = (el.textContent ?? "").trim();
        const label = el.getAttribute("aria-label") ?? "";
        if (!kreuz.test(text) && !/schlie|close/i.test(label)) continue;

        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;

        let vorfahr: Element | null = el;
        let inUeberlagerung = false;
        for (let tiefe = 0; tiefe < 10 && vorfahr !== null; tiefe += 1) {
          const st = getComputedStyle(vorfahr);
          if (st.position === "fixed" || st.position === "absolute") {
            const vr = vorfahr.getBoundingClientRect();
            if (vr.width * vr.height >= window.innerWidth * window.innerHeight * 0.25) {
              inUeberlagerung = true;
              break;
            }
          }
          vorfahr = vorfahr.parentElement;
        }
        if (!inUeberlagerung) continue;

        const mass = r.x + r.y;
        if (mass < bestesMass) {
          bestesMass = mass;
          bester = el;
        }
      }

      if (bester === null) return false;
      bester.setAttribute(marker, "1");
      return true;
    }, MARKER);
  } catch {
    return false;
  }
}

/**
 * Schliesst stoerende Ueberlagerungen, solange welche da sind.
 *
 * @param page       Die Playwright-Seite.
 * @param timeoutMs  Wie lange insgesamt auf das Erscheinen der ERSTEN gewartet
 *                    wird. Ist keine da, kehrt die Funktion zuegig zurueck.
 * @returns true, wenn mindestens eine Ueberlagerung geschlossen wurde.
 */
export async function schliesseStoerendeUeberlagerung(
  page: Page,
  timeoutMs: number
): Promise<boolean> {
  let geschlossen = 0;
  try {
    for (let runde = 0; runde < MAX_RUNDEN; runde += 1) {
      const kandidaten = schliessKandidaten(page);
      const frist = runde === 0 ? timeoutMs : FOLGERUNDE_TIMEOUT_MS;
      let knopf: Locator | null = null;

      // Zuerst der Weg ueber die Geometrie: er kostet nichts und erwischt auch
      // die Bauart OHNE Dialog-Rolle, an der die Selektoren unten scheitern.
      if (await markiereSchliessKreuz(page)) {
        knopf = page.locator(`[${MARKER}]`).first();
      } else {
        // Sonst auf ALLE Selektor-Kandidaten gleichzeitig warten, mit dem
        // ganzen Budget -- nicht der Reihe nach je einen Bruchteil. (Dieselbe
        // Falle wie in scrapers/consent.ts, dort ausfuehrlich begruendet.)
        try {
          await kandidaten
            .reduce((a, b) => a.or(b))
            .first()
            .waitFor({ state: "visible", timeout: Math.max(1, frist) });
          knopf = await obenLinks(kandidaten);
        } catch {
          knopf = null;
        }
      }

      if (knopf === null) break; // nichts (mehr) da -- regulaeres Ende

      try {
        await knopf.click({ timeout: 3_000 });
        await knopf.waitFor({ state: "hidden", timeout: VERSCHWINDEN_TIMEOUT_MS });
      } catch {
        // Nicht klickbar oder nicht verschwunden -- vermutlich verdeckt die
        // eine Ueberlagerung die andere. Naechste Runde probiert erneut.
        continue;
      }

      geschlossen += 1;
      console.log(`Stoerende Ueberlagerung geschlossen (${geschlossen}).`);
    }
  } catch (err) {
    console.warn("Ueberlagerung: unerwarteter Fehler, ignoriert", err);
  }
  return geschlossen > 0;
}
