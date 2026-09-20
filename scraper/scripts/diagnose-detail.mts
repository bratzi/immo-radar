/**
 * DIAGNOSE, kein Fix: Besteht Immowelts /expose/-Sperre fuer
 * Rechenzentrums-Adressen noch?
 *
 * Befund 2026-09-07/08 (Actions-Log): ALLE 144 Detailseiten je Lauf
 * scheiterten; /suche/ antwortete im selben Lauf mit HTTP 200. Seither ist
 * `erfasseImmoweltDetails` nicht mehr eingehaengt -- der Docstring dort
 * verlangt ausdruecklich, die Sperre neu zu pruefen, bevor jemand sie wieder
 * einhaengt (Backlog B6, Schritt 1).
 *
 * Dieses Skript aendert nichts und speichert nichts.
 *
 * WARUM DIE URLS FRISCH GEHOLT WERDEN: Die zwei fest verdrahteten
 * expose-URLs vom 2026-09-07 sind moeglicherweise laengst abgelaufen. Ein 404
 * waere dann von einer Sperre nicht zu unterscheiden und die Messung wertlos.
 * Also: aufwaermen an der Suchseite, die dort verlinkten expose-URLs
 * einsammeln, und genau die abrufen. Die beiden alten URLs laufen als
 * Gegenprobe mit -- sie zeigen, ob "abgelaufen" anders aussieht als "gesperrt".
 */
import { chromium } from "playwright";
import { nurInCiAusfuehren } from "../lib/nurInCi.js";
import { bestaetigeConsentBanner } from "../scrapers/consent.js";
import { schliesseStoerendeUeberlagerung } from "../scrapers/overlays.js";
import { beurteileDetailAntwort, IMMOWELT_VERZOEGERUNG_MS } from "../scrapers/immowelt/index.js";

// Live-Abruf: laeuft nur auf GitHubs Rechnern, nicht ueber den Anschluss
// des Nutzers (Begruendung in lib/nurInCi.ts).
nurInCiAusfuehren("diagnose-detail");

const AUFWAERM = "https://www.immowelt.de/suche/kaufen/haus/mehrfamilienhaus/guenstig/nordrhein-westfalen/ad04de5";
/** Wie viele frische Detailseiten geprueft werden. Drei reichen fuer ein Urteil. */
const FRISCHE_PROBEN = 3;
/** Aus dem Actions-Log vom 2026-09-07 -- nur als Gegenprobe, evtl. abgelaufen. */
const ALTE_EXPOSES = [
  "https://www.immowelt.de/expose/c6d140f7-e3a4-4c40-9a31-64930ea9c5ab",
  "https://www.immowelt.de/expose/406ed786-c488-4835-bd34-48b3ae644518",
];

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

/** Ein Abruf, ein Urteil. Gibt zurueck, ob die Seite brauchbar war. */
async function bericht(url: string, referer?: string): Promise<boolean> {
  const antwort = await page.goto(url, { waitUntil: "domcontentloaded", referer });
  const html = await page.content();
  const hatModell = html.includes("__UFRN_LIFECYCLE_SERVERREQUEST__");
  const status = antwort?.status() ?? null;
  console.log(`  HTTP ${status}  ${html.length} Zeichen`);
  console.log(`  Titel: ${(await page.title()).slice(0, 70)}`);
  console.log(`  __UFRN_LIFECYCLE_SERVERREQUEST__ im HTML: ${hatModell ? "JA" : "NEIN"}`);
  // Dasselbe Urteil, das der Produktivpfad faellen wuerde -- nicht ein
  // zweites, eigenes. Sonst misst die Diagnose etwas anderes als der Lauf.
  const urteil = beurteileDetailAntwort(status, html.length, hatModell);
  console.log(`  Urteil: ${urteil ?? "brauchbar -- Datenmodell vorhanden"}`);
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
  return urteil === null;
}

console.log("=== 1. Aufwaermen an der Suchseite ===");
const suchseiteOk = await bericht(AUFWAERM);
await bestaetigeConsentBanner(page);
await schliesseStoerendeUeberlagerung(page, 4000);
const referer = page.url();

// Frische expose-URLs aus genau der Liste, die eben geladen wurde.
const roh = await page.locator('a[href*="/expose/"]').evaluateAll((els) =>
  els.map((el) => (el as HTMLAnchorElement).href)
);
const frisch = [...new Set(roh)].slice(0, FRISCHE_PROBEN);
console.log(`\n  Frische expose-URLs aus der Ergebnisliste: ${roh.length} Links, ${new Set(roh).size} verschieden`);
if (frisch.length === 0) {
  console.log("  KEINE gefunden -- dann sagt dieser Lauf ueber die Detailsperre nichts.");
}

let brauchbar = 0;
for (const [i, url] of frisch.entries()) {
  console.log(`\n=== 2.${i + 1} Frische Detailseite (mit Referer, wie im Produktivlauf) ===`);
  console.log(`  ${url}`);
  await page.waitForTimeout(IMMOWELT_VERZOEGERUNG_MS);
  if (await bericht(url, referer)) brauchbar += 1;
}

for (const [i, url] of ALTE_EXPOSES.entries()) {
  console.log(`\n=== 3.${i + 1} Gegenprobe: alte URL vom 2026-09-07 (evtl. abgelaufen) ===`);
  console.log(`  ${url}`);
  await page.waitForTimeout(IMMOWELT_VERZOEGERUNG_MS);
  await bericht(url, referer);
}

console.log("\n=== Ergebnis ===");
console.log(`  Suchseite (/suche/): ${suchseiteOk ? "brauchbar" : "NICHT brauchbar"}`);
console.log(`  Frische Detailseiten (/expose/): ${brauchbar} von ${frisch.length} brauchbar`);
if (frisch.length > 0 && brauchbar === frisch.length && suchseiteOk) {
  console.log("  -> Die Sperre vom 2026-09-07 besteht in dieser Form NICHT mehr.");
} else if (frisch.length > 0 && brauchbar === 0) {
  console.log("  -> Die Sperre besteht fort. erfasseImmoweltDetails bleibt ausgehaengt.");
} else {
  console.log("  -> Uneindeutig. Kein Umbau auf dieser Grundlage.");
}

await browser.close();
