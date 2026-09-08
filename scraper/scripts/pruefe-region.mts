/**
 * Prueft EINE Immowelt-Region gegen die echte Seite -- und nur eine.
 *
 * WARUM ES DIESES SKRIPT GIBT: `sweepImmowelt()` laeuft immer ueber die
 * rotierende Liste aller 16 Bundeslaender. Ein solcher Lauf ueber einen
 * privaten Anschluss hat schon einmal das Heimnetz lahmgelegt -- nicht wegen
 * der Datenmenge, sondern wegen tausender paralleler Verbindungen und
 * DNS-Abfragen aus einem Browser mit Fenster. Lokal wird deshalb hoechstens
 * eine Region geprueft, und dieses Skript ist der dafuer vorgesehene Weg.
 *
 * Es beruehrt die Datenbank NICHT und verschickt nichts. Es holt Seiten und
 * schreibt, was es sieht.
 *
 * Aufruf:
 *   npx tsx scripts/pruefe-region.mts hb
 *
 * Bremen (`hb`) ist der Standard, weil es klein genug fuer ~6 Abrufe ist und
 * seine Sollgroesse bekannt ist (~209 Objekte). Genau eine Seite -> 42 Objekte
 * heisst: die Pagination blaettert nicht.
 */
import { chromium } from "playwright";
import { IMMOWELT_REGIONEN, regionErfassen, trefferzahlAusTitel } from "../scrapers/immowelt/index.js";
import type { ImmoweltListSummary } from "../scrapers/immowelt/list.js";

const code = process.argv[2] ?? "hb";
/** Seitendeckel fuer diese Pruefung -- schont den Anschluss bei grossen Regionen. */
const maxSeiten = Number.parseInt(process.argv[3] ?? "", 10) || 250;
const region = IMMOWELT_REGIONEN.find((r) => r.code === code);
if (region === undefined) {
  console.error(
    `Unbekannte Region "${code}". Bekannt: ${IMMOWELT_REGIONEN.map((r) => r.code).join(", ")}`
  );
  process.exit(1);
}

console.log(`=== Pruefe GENAU EINE Region: ${region.code} (${region.pfad}) ===`);
console.log(`Hoechstens ${maxSeiten} Ergebnisseiten.`);
console.log("Es wird nichts gespeichert und nichts gemeldet.\n");

// headless: false ist zwingend -- Immowelt weist headless Chromium ab.
const browser = await chromium.launch({ headless: false });
const zusammenfassungen = new Map<string, ImmoweltListSummary>();
const start = Date.now();

try {
  const page = await browser.newPage();

  // Diagnose an den Komponentengrenzen: Welche Antworten kommen ueberhaupt
  // zurueck? Ein DataDome-Soft-Block ist HTTP 200 mit leerer Huelle und faellt
  // sonst nirgends auf.
  const antworten: { status: number; url: string }[] = [];
  page.on("response", (r) => {
    const u = r.url();
    // Alles Auffaellige: jede Nicht-200-Antwort, jede CAPTCHA-Auslieferung und
    // die Blaetter-Endpunkte. Damit beantwortet EIN Lauf auch die Frage, ob das
    // Blaettern ab Seite 2 an einem abgewiesenen XHR haengt (DataDome).
    if (
      r.status() !== 200 ||
      u.includes("captcha") ||
      u.includes("serp-bff/search") ||
      u.includes("classified-search")
    ) {
      antworten.push({ status: r.status(), url: u.slice(0, 110) });
    }
  });

  let fehler: unknown = null;
  let ergebnis: Awaited<ReturnType<typeof regionErfassen>> | null = null;
  try {
    // consentBereitsBestaetigt = false: frischer Context, wie im echten Lauf
    // fuer die erste Region.
    ergebnis = await regionErfassen(page, region, zusammenfassungen, false, maxSeiten);
  } catch (err) {
    // Genau das schluckt `sweepImmowelt` im Produktivlauf still weg. Hier nicht.
    fehler = err;
  }

  console.log("\n=== Antworten ===");
  for (const a of antworten) console.log(`  ${a.status}  ${a.url}`);

  console.log("\n=== Ergebnis ===");
  console.log(`Titel der letzten Seite: ${await page.title()}`);
  console.log(`Trefferzahl daraus:      ${trefferzahlAusTitel(await page.title()) ?? "null"}`);
  if (fehler !== null) {
    console.log(`\nAUSNAHME (im Produktivlauf still verschluckt):`);
    console.log(fehler instanceof Error ? `  ${fehler.name}: ${fehler.message.split("\n")[0]}` : `  ${String(fehler)}`);
  }
  if (ergebnis !== null) {
    console.log(`\nregionErfassen lieferte: gesammelt=${ergebnis.gesammelt} ` +
      `gemeldet=${ergebnis.gemeldet ?? "null"} abgeschnitten=${ergebnis.abgeschnitten}`);
  }
  console.log(`Objekte insgesamt eingesammelt: ${zusammenfassungen.size}`);
  console.log(`Dauer: ${Math.round((Date.now() - start) / 1000)} s`);

  console.log("\n=== Befund ===");
  const n = zusammenfassungen.size;
  if (n === 0) console.log("  NICHTS eingesammelt -- Soft-Block oder Parser passt nicht.");
  else if (n <= 45) console.log(`  ${n} Objekte = genau eine Ergebnisseite. Die Pagination blaettert NICHT.`);
  else if (n <= 120) console.log(`  ${n} Objekte -- mehr als eine Seite, aber weit unter den 209, die Bremen hat.`);
  else console.log(`  ${n} Objekte. Bremen hat 209 -- das ist die Groessenordnung einer vollen Region.`);
} finally {
  await browser.close();
}
