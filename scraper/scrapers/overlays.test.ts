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
