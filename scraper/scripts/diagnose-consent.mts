/**
 * DIAGNOSE, kein Fix: Was steckt wirklich im Usercentrics-Shadow-Root?
 *
 * Befund des Overlay-Laufs (2026-09-08): `#usercentrics-root` faengt ab dem
 * zweiten Seitenwechsel jeden Klick ab, und `bestaetigeConsentBanner` findet
 * seinen Zustimmen-Knopf trotzdem nicht. Also nachsehen, welche Knoepfe es dort
 * ueberhaupt gibt -- Beschriftung, id, data-testid -- statt weiter zu raten.
 *
 * Aendert nichts, speichert nichts. Ein Seitenabruf.
 */
import { chromium } from "playwright";

const URL =
  "https://www.immowelt.de/suche/kaufen/haus/mehrfamilienhaus/guenstig/bremen/bremen-28219/ad08de2110";

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded" });

for (const wartenS of [3, 8, 15, 25]) {
  await page.waitForTimeout(wartenS === 3 ? 3000 : 5000);
  const knoepfe = await page.locator("#usercentrics-root button").all();
  console.log(`\n=== nach ~${wartenS} s: ${knoepfe.length} Knoepfe unter #usercentrics-root ===`);
  for (const k of knoepfe) {
    // Keine verschachtelten Funktionen in evaluate (tsx-__name-Falle).
    const info = await k.evaluate((el) => {
      const attrs: string[] = [];
      for (const a of Array.from(el.attributes)) attrs.push(a.name + '="' + a.value + '"');
      const r = el.getBoundingClientRect();
      return {
        text: (el.textContent ?? "").trim().slice(0, 40),
        attrs: attrs.join(" ").slice(0, 160),
        sichtbar: r.width > 0 && r.height > 0,
      };
    });
    console.log(`  "${info.text}"  sichtbar=${info.sichtbar}`);
    console.log(`     ${info.attrs}`);
  }
  if (knoepfe.length > 0) break;
}

console.log("\n=== Was die bisherigen Selektoren finden ===");
for (const sel of ['[data-testid="uc-accept-all-button"]', "#uc-btn-accept-banner"]) {
  console.log(`  ${sel}: ${await page.locator(sel).count()} Treffer`);
}
for (const text of ["Alles akzeptieren", "Alle akzeptieren", "Akzeptieren", "Zustimmen", "Einverstanden", "OK"]) {
  const n = await page.getByRole("button", { name: text, exact: true }).count();
  if (n > 0) console.log(`  Button "${text}" (exakt): ${n} Treffer`);
}

await browser.close();
