import { describe, it, expect, afterAll } from "vitest";
import { chromium, type Browser } from "playwright";
import { bestaetigeConsentBanner } from "./consent.js";

/**
 * Diese Tests laufen gegen eine SELBST GEBAUTE Seite, nie gegen Immowelt.
 * Sie bilden die eine Eigenschaft nach, an der die echte Zustimmung scheiterte:
 * Der Host `#usercentrics-root` haengt sofort an, der Akzeptieren-Knopf
 * erscheint erst deutlich spaeter im Shadow Root.
 *
 * Live gemessen (Immowelt/Bremen, 2026-09-08): nach 3 s null Knoepfe, nach 8 s
 * vier Knoepfe -- darunter `data-testid="uc-accept-all-button"` mit der
 * Beschriftung "OK".
 */

let browser: Browser | null = null;
async function seite(verzoegerungMs: number) {
  browser ??= await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(`
    <div id="usercentrics-root"></div>
    <button id="ziel">nächste seite</button>
    <script>
      const host = document.getElementById("usercentrics-root");
      const wurzel = host.attachShadow({ mode: "open" });
      setTimeout(() => {
        const b = document.createElement("button");
        b.setAttribute("data-testid", "uc-accept-all-button");
        b.textContent = "OK";
        b.addEventListener("click", () => { b.remove(); window.__zugestimmt = true; });
        wurzel.appendChild(b);
      }, ${verzoegerungMs});
    </script>
  `);
  return page;
}

afterAll(async () => {
  await browser?.close();
});

describe("bestaetigeConsentBanner", () => {
  it("klickt den Knopf, der erst spaet im Shadow Root erscheint", async () => {
    // Der Kern des Fehlers: Das Zeitbudget wurde auf sieben Kandidaten
    // aufgeteilt, sodass der EINZIGE passende Selektor nur ein Siebtel davon
    // abwartete -- bei 10 s live rund 1,4 s, waehrend der Knopf 8 s braucht.
    const page = await seite(1500);
    await bestaetigeConsentBanner(page, 4000);
    expect(await page.evaluate(() => (window as unknown as { __zugestimmt?: boolean }).__zugestimmt)).toBe(true);
    await page.close();
  }, 30_000);

  it("kehrt still zurueck, wenn es gar kein Banner gibt", async () => {
    browser ??= await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent("<button id='ziel'>nächste seite</button>");
    await expect(bestaetigeConsentBanner(page, 1000)).resolves.toBeUndefined();
    await page.close();
  }, 30_000);
});
