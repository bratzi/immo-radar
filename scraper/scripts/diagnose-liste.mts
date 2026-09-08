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

// Traegt die Liste dasselbe Datenmodell wie eine Detailseite?
console.log("\n=== Datenmodell auf der Suchseite ===");
const hatModell = html.includes("__UFRN_LIFECYCLE_SERVERREQUEST__");
console.log(`__UFRN_LIFECYCLE_SERVERREQUEST__: ${hatModell ? "vorhanden" : "fehlt"}`);

if (hatModell) {
  // Keine verschachtelten Funktionen im evaluate-Rumpf (tsx-__name-Falle).
  const bericht = await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const roh = w["__UFRN_LIFECYCLE_SERVERREQUEST__"];
    if (typeof roh !== "string") return { fehler: `Typ ${typeof roh}, kein String` };
    let daten: unknown;
    try {
      daten = JSON.parse(roh);
    } catch {
      return { fehler: "nicht als JSON lesbar" };
    }
    const obj = daten as Record<string, unknown>;
    const wurzeln = Object.keys(obj);

    // Erste Karte suchen: irgendwo unterhalb steckt eine Liste von Objekten
    // mit einer id und einem Preis. Breitensuche statt Raten.
    const warteschlange: { wert: unknown; pfad: string }[] = [{ wert: daten, pfad: "" }];
    let treffer: { pfad: string; schluessel: string[]; probe: string } | null = null;
    let besucht = 0;
    while (warteschlange.length > 0 && besucht < 4000 && treffer === null) {
      const eintrag = warteschlange.shift();
      if (eintrag === undefined) break;
      besucht += 1;
      const v = eintrag.wert;
      if (Array.isArray(v)) {
        const erstes = v[0];
        if (erstes !== null && typeof erstes === "object") {
          const k = Object.keys(erstes as Record<string, unknown>);
          const sieht = k.some((x) => /price|preis/i.test(x)) && k.some((x) => /id$/i.test(x));
          if (sieht) {
            treffer = {
              pfad: eintrag.pfad,
              schluessel: k,
              probe: JSON.stringify(erstes).slice(0, 700),
            };
            break;
          }
        }
        for (let i = 0; i < Math.min(v.length, 3); i += 1) {
          warteschlange.push({ wert: v[i], pfad: `${eintrag.pfad}[${i}]` });
        }
      } else if (v !== null && typeof v === "object") {
        for (const [k, kind] of Object.entries(v as Record<string, unknown>)) {
          warteschlange.push({ wert: kind, pfad: eintrag.pfad === "" ? k : `${eintrag.pfad}.${k}` });
        }
      }
    }
    return { wurzeln, treffer, besucht };
  });

  console.log(JSON.stringify(bericht, null, 2).slice(0, 2500));
}

await browser.close();
