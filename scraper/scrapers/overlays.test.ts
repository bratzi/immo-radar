import { describe, it, expect, afterAll } from "vitest";
import { chromium, type Browser } from "playwright";
import { schliesseStoerendeUeberlagerung } from "./overlays.js";

/**
 * Gegen eine selbst gebaute Seite, nie gegen Immowelt.
 *
 * Nachgebildet ist der Dialog, der den Sweep seit jeher nach zwei Seiten
 * ausbremste. Live gemessen (Immowelt/Bremen, 2026-09-08): ein
 * bildschirmfuellendes, fest positioniertes Div ("Beschleunige deine Suche mit
 * einem Suchauftrag") mit `data-testid="av-ssab-Modal-secondPageModal-submit"`
 * -- es erscheint beim Wechsel auf Seite 2 und faengt danach jeden Klick auf
 * den "naechste Seite"-Knopf ab. Sein Klassenname wird bei jedem Rendern neu
 * erzeugt (css-8g8ihq, css-5h5f1k, css-1lcifqp), taugt also nicht als Selektor;
 * stabil ist nur der Schliessen-Knopf mit `aria-label="Schließen"`.
 */

let browser: Browser | null = null;
async function seiteMitDialog(html: string) {
  browser ??= await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html);
  return page;
}

afterAll(async () => {
  await browser?.close();
});

const DIALOG = `
  <button id="weiter">nächste seite</button>
  <div role="dialog" id="modal"
       style="position:fixed;inset:0;width:100vw;height:100vh;background:#fff">
    Beschleunige deine Suche mit einem Suchauftrag
    <button aria-label="Schließen" onclick="document.getElementById('modal').remove()">x</button>
    <button data-testid="av-ssab-Modal-secondPageModal-submit">Suchauftrag speichern</button>
  </div>`;

describe("schliesseStoerendeUeberlagerung", () => {
  it("schliesst den Suchauftrag-Dialog ueber seinen Schliessen-Knopf", async () => {
    const page = await seiteMitDialog(DIALOG);
    expect(await schliesseStoerendeUeberlagerung(page, 3000)).toBe(true);
    expect(await page.locator("#modal").count()).toBe(0);
    await page.close();
  }, 30_000);

  it("klickt NIEMALS den Speichern-Knopf -- das waere eine Anmeldung", async () => {
    // Der Dialog will eine E-Mail-Adresse. Weggeklickt wird er, nicht bedient.
    const page = await seiteMitDialog(DIALOG.replace(
      '<button data-testid="av-ssab-Modal-secondPageModal-submit">Suchauftrag speichern</button>',
      '<button data-testid="av-ssab-Modal-secondPageModal-submit" ' +
        'onclick="window.__abgeschickt=true">Suchauftrag speichern</button>'
    ));
    await schliesseStoerendeUeberlagerung(page, 3000);
    expect(await page.evaluate(() => (window as unknown as { __abgeschickt?: boolean }).__abgeschickt))
      .toBeUndefined();
    await page.close();
  }, 30_000);

  it("meldet false, wenn gar keine Ueberlagerung da ist", async () => {
    const page = await seiteMitDialog('<button id="weiter">nächste seite</button>');
    expect(await schliesseStoerendeUeberlagerung(page, 500)).toBe(false);
    await page.close();
  }, 30_000);
});

/**
 * Der ZWEITE Blockierer, vom Nutzer beschrieben (2026-09-08): noch eine
 * Ueberlagerung, die sich ueber ein "x" OBEN LINKS in der Ecke schliessen
 * laesst -- ohne `aria-label="Schließen"`. Sie liegt zusaetzlich zum
 * Suchauftrag-Dialog auf der Seite.
 */
const ZWEITER = `
  <button id="weiter">nächste seite</button>
  <div role="dialog" id="modal2"
       style="position:fixed;inset:0;width:100vw;height:100vh;background:#eee">
    <button id="zu"
            style="position:absolute;top:8px;left:8px"
            onclick="document.getElementById('modal2').remove()">×</button>
    <button id="cta" style="position:absolute;top:300px;left:400px"
            onclick="window.__ctaGeklickt=true">Jetzt registrieren</button>
  </div>`;

describe("schliesseStoerendeUeberlagerung -- zweite Bauart", () => {
  it("schliesst eine Ueberlagerung ueber das x oben links, auch ohne aria-label", async () => {
    const page = await seiteMitDialog(ZWEITER);
    expect(await schliesseStoerendeUeberlagerung(page, 3000)).toBe(true);
    expect(await page.locator("#modal2").count()).toBe(0);
    await page.close();
  }, 30_000);

  it("fasst dabei keinen anderen Knopf der Ueberlagerung an", async () => {
    const page = await seiteMitDialog(ZWEITER);
    await schliesseStoerendeUeberlagerung(page, 3000);
    expect(await page.evaluate(() => (window as unknown as { __ctaGeklickt?: boolean }).__ctaGeklickt))
      .toBeUndefined();
    await page.close();
  }, 30_000);

  it("raeumt BEIDE gestapelten Ueberlagerungen in einem Aufruf weg", async () => {
    // Genau der berichtete Zustand: erst der Suchauftrag-Dialog, darunter noch
    // einer. Ein Aufruf muss die Seite freiraeumen, sonst blockt der naechste.
    const page = await seiteMitDialog(DIALOG + ZWEITER);
    expect(await schliesseStoerendeUeberlagerung(page, 5000)).toBe(true);
    expect(await page.locator("#modal").count()).toBe(0);
    expect(await page.locator("#modal2").count()).toBe(0);
    await page.close();
  }, 30_000);
});

/**
 * Die dritte und bisher uebersehene Bauart: eine bildschirmfuellende
 * Ueberlagerung OHNE `role="dialog"` und ohne `aria-modal`. Genau so sah der
 * gemessene Blockierer aus:
 *
 *   ELEMENT <div class="css-1lcifqp">   role=-  aria-modal=-  data-testid=-
 *
 * Ein Kreuz-Selektor, der nur in Dialogen sucht, findet ihn nie.
 */
const OHNE_ROLLE = `
  <button id="weiter">nächste seite</button>
  <div id="modal3"
       style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:#ddd">
    <button id="zu3" style="position:absolute;top:6px;left:6px"
            onclick="document.getElementById('modal3').remove()">✕</button>
    <button id="cta3" style="position:absolute;top:300px;left:400px"
            onclick="window.__cta3=true">Suchauftrag speichern</button>
  </div>`;

describe("schliesseStoerendeUeberlagerung -- ohne Dialog-Rolle", () => {
  it("schliesst eine bildschirmfuellende Ueberlagerung ohne role=dialog", async () => {
    const page = await seiteMitDialog(OHNE_ROLLE);
    expect(await schliesseStoerendeUeberlagerung(page, 3000)).toBe(true);
    expect(await page.locator("#modal3").count()).toBe(0);
    await page.close();
  }, 30_000);

  it("fasst auch dort keinen anderen Knopf an", async () => {
    const page = await seiteMitDialog(OHNE_ROLLE);
    await schliesseStoerendeUeberlagerung(page, 3000);
    expect(await page.evaluate(() => (window as unknown as { __cta3?: boolean }).__cta3)).toBeUndefined();
    await page.close();
  }, 30_000);

  it("laesst ein x an, das zu keiner Ueberlagerung gehoert", async () => {
    // Ein Schliesskreuz irgendwo im normalen Seiteninhalt darf NICHT geklickt
    // werden -- sonst raeumt der Sweep der Seite die Filter weg.
    const page = await seiteMitDialog(`
      <button id="weiter">nächste seite</button>
      <div style="position:static">
        <button id="filterweg" onclick="window.__filterWeg=true">×</button>
      </div>`);
    expect(await schliesseStoerendeUeberlagerung(page, 800)).toBe(false);
    expect(await page.evaluate(() => (window as unknown as { __filterWeg?: boolean }).__filterWeg))
      .toBeUndefined();
    await page.close();
  }, 30_000);
});
