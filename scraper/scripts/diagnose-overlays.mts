/**
 * DIAGNOSE, kein Fix: Was genau verhindert das Weiterblaettern bei Immowelt?
 *
 * Beobachtung des Nutzers (2026-09-08): Es gibt MEHRERE verschiedene Overlays,
 * nicht nur das Usercentrics-Consent-Banner. Von Hand weggeklickt liess sich
 * blaettern.
 *
 * Messung des Laufs davor: 5 Blaetter-Runden, aber nur 81 statt 209 Objekte --
 * der Klick warf keine Ausnahme mehr, die Seite wechselte aber trotzdem nicht.
 * "Klick hat nicht geworfen" ist also KEIN Beleg fuer einen Seitenwechsel.
 *
 * Dieses Skript aendert nichts. Es holt EINE Region und schreibt auf:
 *  - welches Element tatsaechlich ueber dem "naechste Seite"-Knopf liegt
 *    (document.elementFromPoint, inklusive Shadow-Root-Aufloesung),
 *  - alle bildschirmfuellenden Elemente mit hohem z-index,
 *  - ob sich die Ergebnisliste nach dem Klick wirklich geaendert hat.
 */
import { chromium } from "playwright";
import { nurInCiAusfuehren } from "../lib/nurInCi.js";
import { bestaetigeConsentBanner } from "../scrapers/consent.js";
import { schliesseStoerendeUeberlagerung } from "../scrapers/overlays.js";

// Live-Abruf: laeuft nur auf GitHubs Rechnern, nicht ueber den Anschluss
// des Nutzers (Begruendung in lib/nurInCi.ts).
nurInCiAusfuehren("diagnose-overlays");

const URL =
  "https://www.immowelt.de/suche/kaufen/haus/mehrfamilienhaus/guenstig/bremen/bremen-28219/ad08de2110";

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
let netz: string[] = [];
page.on("response", (r) => {
  const u = r.url();
  if (u.includes("immowelt.de") || u.includes("captcha")) {
    netz.push(`${r.status()} ${u.slice(0, 95)}`);
  }
});

/** Was liegt an diesem Punkt zuoberst? Loest Shadow Roots auf. */
async function obenAn(x: number, y: number): Promise<string> {
  // ACHTUNG: keine verschachtelten Funktionen in page.evaluate -- tsx/esbuild
  // spritzt dafuer einen `__name`-Helfer ein, den es im Browser nicht gibt
  // ("ReferenceError: __name is not defined").
  return page.evaluate(([px, py]) => {
    const kette: string[] = [];
    let wurzel: Document | ShadowRoot = document;
    for (let tiefe = 0; tiefe < 6; tiefe += 1) {
      const el: Element | null = (wurzel as Document).elementFromPoint(px, py);
      if (el === null) break;
      const id = el.id ? "#" + el.id : "";
      const roh = typeof el.className === "string" ? el.className.trim() : "";
      const cls = roh ? "." + roh.split(/\s+/).slice(0, 3).join(".") : "";
      kette.push("<" + el.tagName.toLowerCase() + id + cls + ">");
      const sr: ShadowRoot | null = el.shadowRoot;
      if (sr === null || sr === undefined) break;
      wurzel = sr;
    }
    return kette.join(" -> ") || "nichts";
  }, [x, y]);
}

/** Alle Elemente, die gross sind, fest sitzen und weit oben liegen. */
async function overlayVerdaechtige(): Promise<string[]> {
  return page.evaluate(() => {
    const treffer: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const s = getComputedStyle(el);
      if (s.position !== "fixed" && s.position !== "sticky") continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height < window.innerWidth * window.innerHeight * 0.25) continue;
      if (s.visibility === "hidden" || s.display === "none") continue;
      const id = el.id ? `#${el.id}` : "";
      const cls = typeof el.className === "string" && el.className
        ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}`
        : "";
      treffer.push(
        `<${el.tagName.toLowerCase()}${id}${cls}> z=${s.zIndex} pos=${s.position} ` +
          `${Math.round(r.width)}x${Math.round(r.height)} pointer=${s.pointerEvents}`
      );
    }
    return treffer;
  });
}

/** Kennung der ersten Ergebniskarte -- aendert sie sich, wurde geblaettert. */
async function ersteKarte(): Promise<string> {
  return page.evaluate(() => {
    const a = document.querySelector('a[href*="/expose/"]');
    return a === null ? "keine" : (a.getAttribute("href") ?? "keine").slice(-24);
  });
}

await page.goto(URL, { waitUntil: "domcontentloaded" });
// DIESMAL zuerst zustimmen -- danach messen, was DANN noch ueber dem
// Blaetter-Knopf liegt. Genau das ist die offene Frage.
await bestaetigeConsentBanner(page, 15000);
await page.waitForTimeout(2000);

console.log("");
console.log("=== Was nach der Zustimmung noch unter #usercentrics-root haengt ===");
for (const k of await page.locator("#usercentrics-root *").all()) {
  const info = await k.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      testid: el.getAttribute("data-testid") ?? "",
      box: Math.round(r.x) + "," + Math.round(r.y) + " " + Math.round(r.width) + "x" + Math.round(r.height),
      sichtbar: r.width > 0 && r.height > 0,
    };
  });
  if (info.sichtbar) console.log(`  <${info.tag}> testid=${info.testid || "-"} box=${info.box}`);
}

console.log("\n=== Direkt nach dem Laden ===");
console.log("Bildschirmfuellende, fest positionierte Elemente:");
for (const v of await overlayVerdaechtige()) console.log(`  ${v}`);

for (let runde = 1; runde <= 4; runde += 1) {
  console.log(`\n=== Runde ${runde} ===`);
  const vorher = await ersteKarte();
  const anzahlVorher = await page.locator('a[href*="/expose/"]').count();
  console.log(`erste Karte vorher: ${vorher}  (Karten auf der Seite: ${anzahlVorher})`);

  // Vor jedem Versuch aufraeumen -- der Suchauftrag-Dialog ist inzwischen
  // erkannt und wird geschlossen; hier geht es nur noch um das, was DANACH
  // passiert.
  await schliesseStoerendeUeberlagerung(page, 3000);
  netz = [];
  const weiter = page.locator('button[aria-label="nächste seite"]');
  if ((await weiter.count()) === 0) {
    console.log("kein 'naechste seite'-Knopf -- Ende der Liste.");
    break;
  }

  const box = await weiter.first().boundingBox();
  if (box === null) {
    console.log("Knopf hat keine Box (unsichtbar?).");
    break;
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await weiter.first().scrollIntoViewIfNeeded();
  const box2 = await weiter.first().boundingBox();
  const px = box2 === null ? x : box2.x + box2.width / 2;
  const py = box2 === null ? y : box2.y + box2.height / 2;

  console.log(`Blaetter-Knopf-Box: ${Math.round(px)},${Math.round(py)} (Mitte)`);
  console.log(`ueber dem Knopf liegt: ${await obenAn(px, py)}`);

  try {
    await weiter.first().click({ timeout: 5000 });
    console.log("Klick: durchgegangen (keine Ausnahme)");
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    console.log("Klick: ABGEFANGEN");
    for (const zeile of m.split("\n").filter((z) => /intercepts|subtree|waiting|retrying/.test(z)).slice(0, 4)) {
      console.log(`   ${zeile.trim()}`);
    }
  }

  await page.waitForTimeout(3000);
  const nachher = await ersteKarte();
  console.log(`erste Karte nachher: ${nachher}`);
  console.log(nachher === vorher ? "  -> SEITE HAT NICHT GEWECHSELT" : "  -> Seite gewechselt");
  console.log("  Netzwerk seit dem Klick:");
  for (const z of netz.slice(0, 12)) console.log(`    ${z}`);
  if (netz.length === 0) console.log("    (KEINE EINZIGE ANFRAGE -- der Klick loeste nichts aus)");
  if (nachher === vorher) {
    console.log("  Overlays in diesem Moment:");
    for (const v of await overlayVerdaechtige()) console.log(`    ${v}`);
    // WAS ist dieses Ding? Text, Rolle, Schliessen-Knoepfe.
    const details = await page.evaluate(() => {
      const raus: string[] = [];
      for (const el of Array.from(document.body.querySelectorAll("*"))) {
        const st = getComputedStyle(el);
        if (st.position !== "fixed") continue;
        const r = el.getBoundingClientRect();
        if (r.width * r.height < window.innerWidth * window.innerHeight * 0.25) continue;
        raus.push("ELEMENT <" + el.tagName.toLowerCase() + " class=\"" + String(el.className) + "\">");
        raus.push("  role=" + (el.getAttribute("role") ?? "-") +
                  " aria-modal=" + (el.getAttribute("aria-modal") ?? "-") +
                  " data-testid=" + (el.getAttribute("data-testid") ?? "-"));
        raus.push("  TEXT: " + (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 220));
        for (const b of Array.from(el.querySelectorAll("button,[role=button],a"))) {
          const t = (b.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
          const al = b.getAttribute("aria-label") ?? "";
          const ti = b.getAttribute("data-testid") ?? "";
          if (t || al || ti) raus.push("  KNOPF: \"" + t + "\" aria-label=\"" + al + "\" testid=\"" + ti + "\"");
        }
      }
      const dlg = document.querySelectorAll("[role=dialog],[aria-modal=true]");
      raus.push("Dialoge im Dokument: " + dlg.length);
      return raus;
    });
    for (const d of details) console.log(`    ${d}`);
    break;
  }
}

await browser.close();
