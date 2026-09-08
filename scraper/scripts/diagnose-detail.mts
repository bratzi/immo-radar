/**
 * DIAGNOSE, kein Fix: Warum liefert die Immowelt-Detailerfassung nichts?
 *
 * Befund (Actions-Log, Laeufe vom 2026-09-07 20:51 UTC bis 2026-09-08 08:15):
 * ALLE 144 Detailseiten je Lauf scheitern mit
 * "__UFRN_LIFECYCLE_SERVERREQUEST__ nicht gefunden". Ob dahinter eine
 * 403-Huelle steckt oder eine umgebaute Seite, sagt das Log nicht --
 * `erfasseImmoweltDetails` wertet den HTTP-Status von `page.goto` nicht aus.
 *
 * Dieses Skript aendert nichts. Drei Abrufe: eine Suchseite zum Aufwaermen,
 * danach zwei Detailseiten.
 */
import { chromium } from "playwright";
import { nurInCiAusfuehren } from "../lib/nurInCi.js";
import { bestaetigeConsentBanner } from "../scrapers/consent.js";
import { schliesseStoerendeUeberlagerung } from "../scrapers/overlays.js";

// Live-Abruf: laeuft nur auf GitHubs Rechnern, nicht ueber den Anschluss
// des Nutzers (Begruendung in lib/nurInCi.ts).
nurInCiAusfuehren("diagnose-detail");

const AUFWAERM = "https://www.immowelt.de/suche/kaufen/haus/mehrfamilienhaus/guenstig/nordrhein-westfalen/ad04de5";
// Zwei URLs, die im Produktivlauf gescheitert sind (aus dem Actions-Log).
const EXPOSES = [
  "https://www.immowelt.de/expose/c6d140f7-e3a4-4c40-9a31-64930ea9c5ab",
  "https://www.immowelt.de/expose/406ed786-c488-4835-bd34-48b3ae644518",
];

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

async function bericht(url: string, referer?: string): Promise<void> {
  const antwort = await page.goto(url, { waitUntil: "domcontentloaded", referer });
  const html = await page.content();
  const hatModell = html.includes("__UFRN_LIFECYCLE_SERVERREQUEST__");
  console.log(`\n  HTTP ${antwort?.status()}  ${html.length} Zeichen`);
  console.log(`  Titel: ${(await page.title()).slice(0, 70)}`);
  console.log(`  __UFRN_LIFECYCLE_SERVERREQUEST__ im HTML: ${hatModell ? "JA" : "NEIN"}`);
  if (!hatModell) {
    // Was steht stattdessen drin? Nur die Signale, die zwischen Sperre und
    // Umbau unterscheiden.
    for (const [name, muster] of [
      ["DataDome/CAPTCHA", /datadome|captcha-delivery|geo\.captcha/i],
      ["enable JS-Huelle", /enable JS|disable any ad blocker/i],
      ["__NEXT_DATA__", /__NEXT_DATA__/],
      ["window.__", /window\.__[A-Z_]+/],
    ] as const) {
      if (muster.test(html)) console.log(`    gefunden: ${name}`);
    }
    const treffer = html.match(/window\.__[A-Z_]+/g);
    if (treffer) console.log(`    globale Variablen: ${[...new Set(treffer)].slice(0, 6).join(", ")}`);
  }
}

console.log("=== 1. Aufwaermen an der Suchseite ===");
await bericht(AUFWAERM);
await bestaetigeConsentBanner(page);
await schliesseStoerendeUeberlagerung(page, 4000);
const referer = page.url();

for (const [i, url] of EXPOSES.entries()) {
  console.log(`\n=== ${i + 2}. Detailseite (mit Referer, wie im Produktivlauf) ===`);
  await page.waitForTimeout(5000);
  await bericht(url, referer);
}

await browser.close();
