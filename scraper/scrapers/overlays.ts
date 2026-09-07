import type { Page } from "playwright";

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
 * Selektoren fuer den Schliessen-Knopf, in dieser Reihenfolge: erst innerhalb
 * eines echten Dialogs (eng, damit nie ein anderes "Schliessen" der Seite
 * getroffen wird), dann als freistehender Notnagel.
 */
const SCHLIESSEN_SELEKTOREN = [
  '[role="dialog"] button[aria-label="Schließen"]',
  '[aria-modal="true"] button[aria-label="Schließen"]',
  'button[aria-label="Schließen"]',
];

/** Wie lange nach dem Klick auf das Verschwinden gewartet wird. */
const VERSCHWINDEN_TIMEOUT_MS = 3_000;

/**
 * Schliesst eine stoerende Ueberlagerung, falls eine da ist.
 *
 * @param page       Die Playwright-Seite.
 * @param timeoutMs  Wie lange insgesamt auf das Erscheinen gewartet wird.
 * @returns true, wenn tatsaechlich eine Ueberlagerung geschlossen wurde.
 */
export async function schliesseStoerendeUeberlagerung(
  page: Page,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  try {
    for (const selektor of SCHLIESSEN_SELEKTOREN) {
      const rest = deadline - Date.now();
      if (rest <= 0) break;

      const knopf = page.locator(selektor).first();
      try {
        await knopf.waitFor({ state: "visible", timeout: Math.max(1, rest) });
      } catch {
        continue;
      }

      try {
        await knopf.click({ timeout: Math.max(500, deadline - Date.now()) });
        await knopf.waitFor({ state: "hidden", timeout: VERSCHWINDEN_TIMEOUT_MS });
        console.log(`Stoerende Ueberlagerung geschlossen ueber: ${selektor}`);
        return true;
      } catch {
        continue;
      }
    }
  } catch (err) {
    console.warn("Ueberlagerung: unerwarteter Fehler, ignoriert", err);
  }
  return false;
}
