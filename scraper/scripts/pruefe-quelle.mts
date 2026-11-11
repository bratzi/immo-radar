/**
 * Prueflauf einer Quelle ohne Datenbank und ohne Telegram: dieselbe Pipeline
 * wie main.ts, aber gegen die In-Memory-FakeDb. NUR in CI (pruefung.yml).
 * Aufruf: `pruefe-quelle.mts <quelle>`. Schreibt die bewerteten Angebote nach
 * fixtures-out/pruefe-<quelle>.json und eine Tabelle ins Log.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { nurInCiAusfuehren } from "../lib/nurInCi.js";
import { FakeDb } from "../lib/fakeDb.js";
import { verarbeiteQuelle } from "../lib/pipeline.js";
import { waehleQuelle } from "../scrapers/quellen.js";
import { playwrightAbrufer } from "../scrapers/abrufer.js";
import { MAX_DETAILSEITEN } from "../scrapers/sperre.js";

nurInCiAusfuehren("pruefe-quelle");
const quelle = waehleQuelle(process.argv[2] ?? "kleinanzeigen");
mkdirSync("fixtures-out", { recursive: true });

const browser = await chromium.launch({ headless: false });
try {
  const page = await browser.newPage();
  const db = new FakeDb();
  const e = await verarbeiteQuelle(
    { sb: db.alsClient(), sweepBudgetMs: 3 * 60_000, maxDetails: MAX_DETAILSEITEN, jetzt: new Date() },
    quelle, playwrightAbrufer(page),
  );
  console.log("Lauf:", JSON.stringify(e.lauf));
  console.table(e.angebote.map((a) => ({
    id: a.externalId, passt: a.passt, gruende: a.gruende.join(","),
    warm: a.warmmieteCents === null ? null : a.warmmieteCents / 100, quelleWarm: a.warmmieteQuelle,
    zimmer: a.zimmer, m2: a.flaecheM2, balkon: a.balkon, plz: a.plz, detail: a.detailGeladen,
  })));
  const zaehl = (p: string) => e.angebote.filter((a) => a.passt === p).length;
  console.log(`Urteile: ja=${zaehl("ja")} nein=${zaehl("nein")} unklar=${zaehl("unklar")}`);
  writeFileSync(`fixtures-out/pruefe-${quelle.name}.json`, JSON.stringify(e, null, 2));
  if (e.lauf.status !== "ok") process.exitCode = 2;
} finally {
  await browser.close();
}
