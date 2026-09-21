/**
 * NUR LESEND. Prueft, ob der zweite Vollstaendigkeitsmassstab (A16) in der
 * Datenbank ankommt -- die Abnahme des letzten Laufs.
 *
 * WAS HIER NICHT ERWARTET WIRD: dass `nw`, `bw`, `mv` oder `sh` vollstaendig
 * sind. Solange Immowelt flach liefert, reissen 40 Karten jede Marke. Dass
 * keine neue vollstaendige Region erscheint, ist der Beweis, dass der Massstab
 * wirkt -- nicht, dass er fehlt.
 *
 * WAS ERWARTET WIRD: `massstab` und `referenz_menge` sind gefuellt. Steht dort
 * `keiner` fuer eine Region mit Historie, ist die Marke nicht geladen worden;
 * steht dort `null`, hat die Zeile die Migration nicht gesehen.
 *
 * WACHE: Das Skript sagt ausdruecklich NICHT GEMESSEN, wenn es keine Zeilen
 * aus dem letzten Lauf findet. Ein leeres Ergebnis ist kein bestandener Test.
 *
 * Aufruf: cd scraper && npx tsx scripts/pruefe-massstaebe.mts
 */
import { sb } from "../lib/supabase.js";

const { data, error } = await sb
  .from("sweep_region_runs")
  .select("partition, started_at, gesehene_objekte, gemeldete_treffer, massstab, referenz_menge, vollstaendig")
  .eq("source", "immowelt")
  .order("started_at", { ascending: false })
  .limit(16);

if (error !== null) {
  // Eine fehlende Spalte sieht hier aus wie ein gewoehnlicher Fehler und ist
  // der wahrscheinlichste: die Migration ist nicht gelaufen.
  console.log("NICHT GEMESSEN: Abfrage fehlgeschlagen.", error.message);
  if (/massstab|referenz_menge/.test(error.message)) {
    console.log("");
    console.log("Das sieht nach der fehlenden Migration aus. Im Supabase-SQL-Editor:");
    console.log("  alter table sweep_region_runs add column massstab text;");
    console.log("  alter table sweep_region_runs add column referenz_menge integer;");
  }
  process.exit(1);
}

type Zeile = {
  partition: string;
  started_at: string;
  gesehene_objekte: number;
  gemeldete_treffer: number | null;
  massstab: string | null;
  referenz_menge: number | null;
  vollstaendig: boolean;
};
const zeilen = (data ?? []) as Zeile[];

if (zeilen.length === 0) {
  console.log("NICHT GEMESSEN: keine Regionszeile gefunden. Es lief noch kein Sweep.");
  process.exit(1);
}

console.log(`Die ${zeilen.length} juengsten Regionszeilen (immowelt):\n`);
console.log("code  gesehen  gemeldet  massstab            referenz  vollstaendig");
for (const z of zeilen) {
  console.log(
    `${z.partition.padEnd(5)} ${String(z.gesehene_objekte).padStart(7)}  ` +
      `${(z.gemeldete_treffer === null ? "--" : String(z.gemeldete_treffer)).padStart(8)}  ` +
      `${(z.massstab ?? "NULL").padEnd(19)} ` +
      `${(z.referenz_menge === null ? "--" : String(z.referenz_menge)).padStart(8)}  ` +
      `${z.vollstaendig ? "ja" : "nein"}`
  );
}

const ohneMassstab = zeilen.filter((z) => z.massstab === null);
const keiner = zeilen.filter((z) => z.massstab === "keiner");
const marke = zeilen.filter((z) => z.massstab === "hochwassermarke");
const gemeldet = zeilen.filter((z) => z.massstab === "gemeldete_treffer");
// Eine Zeile mit vollstaendig=true, die an nichts gemessen wurde, ist genau
// der Widerspruch, gegen den die Sperre an der Schreibstelle steht.
const widerspruch = zeilen.filter((z) => z.vollstaendig && (z.massstab === null || z.massstab === "keiner"));

console.log("");
console.log(`massstab 'hochwassermarke':   ${marke.length}`);
console.log(`massstab 'gemeldete_treffer': ${gemeldet.length}`);
console.log(`massstab 'keiner':            ${keiner.length}`);
console.log(`massstab NULL (vor A16):      ${ohneMassstab.length}`);

console.log("");
if (ohneMassstab.length === zeilen.length) {
  console.log("BEFUND: Alle Zeilen tragen NULL -- dieser Lauf kannte A16 noch nicht.");
  process.exit(1);
}
if (widerspruch.length > 0) {
  console.log(
    `FEHLER: ${widerspruch.length} Zeile(n) mit vollstaendig=true ohne Massstab -- ` +
      `${widerspruch.map((z) => z.partition).join(", ")}. Die Sperre an der Schreibstelle greift nicht.`
  );
  process.exit(1);
}
if (marke.length === 0) {
  console.log(
    "BEFUND: keine einzige Zeile misst gegen die Hochwassermarke. Entweder war " +
      "keine der vier Regionen ohne Trefferzahl dabei (Rotation), oder die Marken " +
      "wurden nicht geladen. Die Regionen dieses Laufs stehen oben."
  );
  process.exit(1);
}
console.log("IN ORDNUNG: jede Zeile traegt ihren Massstab, keine ist vollstaendig ohne Beleg.");
