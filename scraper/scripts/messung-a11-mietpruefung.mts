/**
 * NUR LESEND. Haelt die 95 handrecherchierten Werte in REGIONALE_MIETE_PRO_M2
 * gegen die INKAR-Referenz aus `lib/mietPruefdaten.generated.json`
 * (Backlog A11 Schritt 3).
 *
 * WACHE: Das Skript sagt ausdruecklich NICHT GEMESSEN, wenn die Pruefdatei
 * fehlt oder keine Referenz traegt. Ein leeres Ergebnis ist kein bestandener
 * Test.
 *
 * Aufruf: cd scraper && npx tsx scripts/messung-a11-mietpruefung.mts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REGIONALE_MIETE_PRO_M2 } from "../lib/rentEstimate.js";

const hier = path.dirname(fileURLToPath(import.meta.url));
const pruef = JSON.parse(
  readFileSync(path.join(hier, "..", "lib", "mietPruefdaten.generated.json"), "utf8"),
) as {
  jahr: string;
  quelle: string;
  zweisteller: Record<string, { referenz: number | null; abdeckung: number; plzGesamt: number }>;
};

const tabelle = REGIONALE_MIETE_PRO_M2;
const referenzen = pruef.zweisteller;

console.log(`Quelle: ${pruef.quelle}`);
console.log(`Stand: ${pruef.jahr}`);
console.log(
  `Tabellenwerte: ${Object.keys(tabelle).length} | Zweisteller mit Referenz: ${
    Object.values(referenzen).filter((z) => z.referenz !== null).length
  }`,
);

const fehltInTabelle = Object.keys(referenzen).filter(
  (zs) => referenzen[zs].referenz !== null && tabelle[zs] === undefined,
);
const ohneReferenz = Object.keys(tabelle).filter((zs) => (referenzen[zs]?.referenz ?? null) === null);
console.log(`In GeoNames, aber nicht in der Tabelle: ${fehltInTabelle.join(", ") || "keine"}`);
console.log(`In der Tabelle, aber ohne Referenz: ${ohneReferenz.join(", ") || "keine"}`);

interface Zeile {
  zs: string;
  wert: number;
  ref: number;
  abw: number;
}
const zeilen: Zeile[] = [];
for (const [zs, wert] of Object.entries(tabelle)) {
  const ref = referenzen[zs]?.referenz;
  if (ref === null || ref === undefined) continue;
  zeilen.push({ zs, wert, ref, abw: (wert - ref) / ref });
}

if (zeilen.length === 0) {
  console.log("NICHT GEMESSEN: kein einziger Wert hatte eine Referenz.");
  process.exit(1);
}

zeilen.sort((a, b) => a.abw - b.abw);
const abweichungen = zeilen.map((z) => z.abw).sort((a, b) => a - b);
const median = abweichungen[Math.floor(abweichungen.length / 2)];
const mittel = abweichungen.reduce((s, x) => s + x, 0) / abweichungen.length;
const ausserhalb = zeilen.filter((z) => Math.abs(z.abw) > 0.25);

const prozent = (x: number): string => `${(x * 100).toFixed(1)} %`;
console.log("");
console.log(`n = ${zeilen.length} | Mittel ${prozent(mittel)} | Median ${prozent(median)}`);
console.log(
  `innerhalb +-15 %: ${zeilen.filter((z) => Math.abs(z.abw) <= 0.15).length} | ` +
    `innerhalb +-25 %: ${zeilen.filter((z) => Math.abs(z.abw) <= 0.25).length}`,
);

const zeige = (z: Zeile): string =>
  `  ${z.zs}  Tabelle ${z.wert.toFixed(1).padStart(5)}  INKAR ${z.ref.toFixed(2).padStart(6)}  ` +
  `${(z.abw * 100).toFixed(1).padStart(7)} %`;

console.log("");
console.log(`AUSSERHALB +-25 % (${ausserhalb.length}):`);
for (const z of ausserhalb) console.log(zeige(z));

console.log("");
console.log("Die fuenf groessten Abweichungen nach unten:");
for (const z of zeilen.slice(0, 5)) console.log(zeige(z));
console.log("Die fuenf groessten Abweichungen nach oben:");
for (const z of zeilen.slice(-5)) console.log(zeige(z));
