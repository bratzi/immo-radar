/**
 * DIAGNOSE, kein Fix: Was liefert Immowelt an unseren Browser, das wir
 * wegwerfen?
 *
 * DIE FRAGE. Der Sweep laedt die Ergebnisliste mit einem echten Browser und
 * klickt sich durch die Seiten. Immowelt laedt Seite 2+ clientseitig ueber
 * `classified-search` bzw. `serp-bff/search` nach -- diese Antworten fliegen
 * also ohnehin durch unseren Browser. Wir lesen sie nicht; wir parsen
 * stattdessen das gerenderte HTML und bekommen daraus nur die Titelzeile.
 *
 * Zwei Dinge fehlen dem Projekt seit Wochen, und beide stuenden
 * ueblicherweise in so einer JSON-Antwort:
 *
 *   1. DIE PLZ. Ohne sie bleibt die Mietschaetzung bundeslandgenau (A11),
 *      und 97,4 % des Bestands sind nicht punktgenau verortbar. Bisher
 *      koennte sie nur die Detailseite liefern -- die von
 *      Rechenzentrums-Adressen ueberwiegend gesperrt ist (B6).
 *   2. DIE GESAMTTREFFERZAHL. `trefferzahlAusTitel` liest sie aus dem
 *      Seitentitel, aber vier Regionen weisen sie dort nicht aus: nw, bw, mv
 *      und sh. Ohne sie kann `istRegionVollstaendig` fuer sie nie true
 *      liefern, und genau daran haengt A16 -- der letzte offene Block fuer
 *      die Immowelt-Loeschhoheit (B1).
 *
 * KOSTET NICHTS EXTRA. Das Skript laedt eine Suchseite und blaettert einmal
 * weiter -- genau das, was der Sweep ohnehin tut. Es stellt keine eigene
 * Anfrage an einen gesperrten Pfad; es hoert nur zu, was der Browser von
 * selbst holt. Die robots.txt-Abwaegung des Projekts
 * (specs/2026-09-07-vollstaendige-erfassung-design.md, "Abgewogene Risiken")
 * bleibt damit unberuehrt.
 *
 * Aendert nichts, speichert nichts.
 *
 * Aufruf: gh workflow run pruefung.yml -f skript=diagnose-netz
 */
import { chromium } from "playwright";
import { nurInCiAusfuehren } from "../lib/nurInCi.js";
import { bestaetigeConsentBanner } from "../scrapers/consent.js";
import { schliesseStoerendeUeberlagerung } from "../scrapers/overlays.js";

nurInCiAusfuehren("diagnose-netz");

// Nordrhein-Westfalen: die groesste Region UND eine der vier ohne
// Trefferzahl im Titel. Faellt hier eine Zahl ab, ist A16 beantwortet.
const URL = "https://www.immowelt.de/suche/kaufen/haus/mehrfamilienhaus/guenstig/nordrhein-westfalen/ad04de5";

interface Mitschnitt {
  url: string;
  status: number;
  laenge: number;
  koerper: string;
}

const mitschnitte: Mitschnitt[] = [];

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

// Zuhoeren, nicht fragen: Jede Antwort, die wie ein Datendienst aussieht,
// wird mitgeschnitten. Der Koerper wird nur gelesen, wenn er JSON ist --
// Bilder und Skripte interessieren nicht.
page.on("response", async (antwort) => {
  const url = antwort.url();
  if (!/classified-search|serp-bff|getlistitems|graphql|\/api\//i.test(url)) return;
  try {
    const typ = antwort.headers()["content-type"] ?? "";
    if (!/json/i.test(typ)) {
      mitschnitte.push({ url, status: antwort.status(), laenge: 0, koerper: "" });
      return;
    }
    const koerper = await antwort.text();
    mitschnitte.push({ url, status: antwort.status(), laenge: koerper.length, koerper });
  } catch {
    // Eine Antwort, deren Koerper nicht mehr da ist, ist kein Fehler des
    // Laufs -- sie faellt nur aus der Messung.
  }
});

await page.goto(URL, { waitUntil: "domcontentloaded" });
await bestaetigeConsentBanner(page);
await schliesseStoerendeUeberlagerung(page, 4000);
await page.waitForTimeout(2000);

console.log(`\n=== 1. Seitentitel (heutige Quelle der Trefferzahl) ===`);
console.log(`  ${JSON.stringify(await page.title())}`);

console.log(`\n=== 2. Weiterblaettern -- das loest den Nachladeruf aus ===`);
const weiter = page.locator('button[aria-label="nächste seite"]');
if ((await weiter.count()) === 0) {
  console.log("  KEIN Weiter-Knopf. Dann sagt dieser Lauf ueber das Nachladen nichts.");
} else {
  await weiter.first().click();
  await page.waitForTimeout(6000);
  await schliesseStoerendeUeberlagerung(page, 3000);
  await page.waitForTimeout(2000);
  console.log(`  geblaettert, Titel jetzt: ${JSON.stringify(await page.title())}`);
}

console.log(`\n=== 3. Mitgeschnittene Datenantworten ===`);
console.log(`  ${mitschnitte.length} Antworten aufgefangen`);
for (const m of mitschnitte) {
  console.log(`  HTTP ${m.status}  ${m.laenge} Zeichen  ${m.url.slice(0, 110)}`);
}
if (mitschnitte.length === 0) {
  console.log("  KEINE. Dann laedt die Seite ihre Ergebnisse nicht ueber einen");
  console.log("  Datendienst nach, und die ganze Idee traegt nicht.");
}

// --- Die beiden Fragen, gegen jeden Koerper gestellt --------------------
function suchePfade(
  roh: string,
  treffer: (wert: unknown, pfad: string) => boolean,
  hoechstens: number
): string[] {
  let daten: unknown;
  try {
    daten = JSON.parse(roh);
  } catch {
    return [];
  }
  const funde: string[] = [];
  const warteschlange: { wert: unknown; pfad: string }[] = [{ wert: daten, pfad: "" }];
  let besucht = 0;
  while (warteschlange.length > 0 && besucht < 200000 && funde.length < hoechstens) {
    const e = warteschlange.shift();
    if (e === undefined) break;
    besucht += 1;
    if (treffer(e.wert, e.pfad)) {
      funde.push(`${e.pfad} = ${JSON.stringify(e.wert)}`);
      continue;
    }
    const v = e.wert;
    if (Array.isArray(v)) {
      for (let i = 0; i < Math.min(v.length, 3); i += 1) {
        warteschlange.push({ wert: v[i], pfad: `${e.pfad}[${i}]` });
      }
    } else if (v !== null && typeof v === "object") {
      for (const [k, kind] of Object.entries(v as Record<string, unknown>)) {
        warteschlange.push({ wert: kind, pfad: e.pfad === "" ? k : `${e.pfad}.${k}` });
      }
    }
  }
  return funde;
}

console.log(`\n=== 4. FRAGE 1: Steht die PLZ drin? ===`);
let plzGefunden = false;
for (const m of mitschnitte) {
  if (m.koerper === "") continue;
  const funde = suchePfade(
    m.koerper,
    (wert) => typeof wert === "string" && /^\d{5}$/.test(wert),
    8
  );
  if (funde.length > 0) {
    plzGefunden = true;
    console.log(`  in ${m.url.slice(0, 70)}:`);
    for (const f of funde) console.log(`    ${f}`);
  }
}
if (!plzGefunden) console.log("  keine fuenfstellige Zahl als Wert gefunden");

console.log(`\n=== 5. FRAGE 2: Steht eine Gesamttrefferzahl drin? ===`);
let zahlGefunden = false;
for (const m of mitschnitte) {
  if (m.koerper === "") continue;
  const funde = suchePfade(
    m.koerper,
    (wert, pfad) =>
      typeof wert === "number" &&
      wert > 50 &&
      /total|count|anzahl|results|hits|num/i.test(pfad),
    10
  );
  if (funde.length > 0) {
    zahlGefunden = true;
    console.log(`  in ${m.url.slice(0, 70)}:`);
    for (const f of funde) console.log(`    ${f}`);
  }
}
if (!zahlGefunden) console.log("  kein Zaehlfeld gefunden");

console.log(`\n=== FAZIT ===`);
console.log(`  Datenantworten aufgefangen: ${mitschnitte.length}`);
console.log(`  PLZ im JSON:                ${plzGefunden ? "JA" : "nein"}`);
console.log(`  Trefferzahl im JSON:        ${zahlGefunden ? "JA" : "nein"}`);
console.log(`  -> JA/JA hiesse: die Detailphase ist fuer PLZ ueberfluessig (B6),`);
console.log(`     und A16 waere ohne zweiten Vollstaendigkeitsmassstab geloest.`);

await browser.close();
