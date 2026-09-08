/**
 * DIAGNOSE, kein Fix: Was steht in einer Immowelt-Ergebnisliste wirklich drin?
 *
 * WARUM: Immowelts Detailseiten sind von Rechenzentrums-Adressen gesperrt
 * (HTTP 403 mit DataDome-CAPTCHA, gemessen 2026-09-08 auf einem GitHub-Runner),
 * waehrend die Suchseite im selben Lauf HTTP 200 mit vollem Datenmodell
 * liefert. Die Bewertung muss deshalb aus der Ergebnisliste kommen -- die der
 * Sweep ohnehin schon vollstaendig herunterlaedt und bis auf drei Felder
 * wegwirft.
 *
 * Offene Frage, die dieses Skript beantwortet: Traegt die Liste ein
 * strukturiertes Datenmodell je Karte (dann daraus lesen -- robust), oder muss
 * aus dem Karten-HTML geparst werden (dann bruechig)?
 *
 * Aendert nichts, speichert nichts. Ein Seitenabruf.
 */
import { chromium } from "playwright";
import { nurInCiAusfuehren } from "../lib/nurInCi.js";
import { bestaetigeConsentBanner } from "../scrapers/consent.js";
import { schliesseStoerendeUeberlagerung } from "../scrapers/overlays.js";
import { parseImmoweltListPage, istMehrfamilienhausKandidat } from "../scrapers/immowelt/list.js";

nurInCiAusfuehren("diagnose-liste");

const URL =
  "https://www.immowelt.de/suche/kaufen/haus/mehrfamilienhaus/guenstig/bremen/bremen-28219/ad08de2110";

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded" });
await bestaetigeConsentBanner(page);
await schliesseStoerendeUeberlagerung(page, 4000);
await page.waitForTimeout(2000);

const html = await page.content();
console.log(`\nSeite: ${html.length} Zeichen`);

const karten = parseImmoweltListPage(html, "hb");
const kandidaten = karten.filter((k) => istMehrfamilienhausKandidat(k.titleLine));
console.log(`Karten: ${karten.length}, davon Mehrfamilienhaus-Kandidaten: ${kandidaten.length}`);
console.log(`Beispiel-Titelzeile: ${JSON.stringify(kandidaten[0]?.titleLine ?? null)}`);

console.log("
=== Titelzeilen (was schon heute erfasst wird) ===");
for (const k of kandidaten.slice(0, 6)) console.log(`  ${JSON.stringify(k.titleLine)}`);

console.log("
=== Woher koennte die PLZ kommen? ===");
// 1) Steht eine PLZ ueberhaupt im Karten-Markup?
const plzImHtml = [...new Set(html.match(/\d{5}/g) ?? [])].slice(0, 12);
console.log(`  Fuenfstellige Zahlen im Seiten-HTML: ${plzImHtml.join(", ") || "keine"}`);

// 2) Traegt das Datenmodell strukturierte Ortsangaben?
const ortsbericht = await page.evaluate(() => {
  const w = window as unknown as Record<string, unknown>;
  const roh = w["__UFRN_LIFECYCLE_SERVERREQUEST__"];
  const daten = typeof roh === "string" ? JSON.parse(roh) : roh;
  const warteschlange: { wert: unknown; pfad: string }[] = [{ wert: daten, pfad: "" }];
  const funde: string[] = [];
  let besucht = 0;
  while (warteschlange.length > 0 && besucht < 20000 && funde.length < 6) {
    const e = warteschlange.shift();
    if (e === undefined) break;
    besucht += 1;
    const v = e.wert;
    if (typeof v === "string" && /^\d{5}$/.test(v)) {
      funde.push(`${e.pfad} = ${v}`);
      continue;
    }
    if (Array.isArray(v)) {
      for (let i = 0; i < Math.min(v.length, 4); i += 1) {
        warteschlange.push({ wert: v[i], pfad: `${e.pfad}[${i}]` });
      }
    } else if (v !== null && typeof v === "object") {
      for (const [k, kind] of Object.entries(v as Record<string, unknown>)) {
        warteschlange.push({ wert: kind, pfad: e.pfad === "" ? k : `${e.pfad}.${k}` });
      }
    }
  }
  return { funde, besucht };
});
console.log(`  PLZ-Pfade im Datenmodell (${ortsbericht.besucht} Knoten durchsucht):`);
for (const f of ortsbericht.funde) console.log(`    ${f}`);
if (ortsbericht.funde.length === 0) console.log("    keine gefunden");

await browser.close();
