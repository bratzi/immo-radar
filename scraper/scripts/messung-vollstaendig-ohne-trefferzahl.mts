/**
 * NUR LESEND. Misst das Alter der widerspruechlichen Zeilen in
 * `sweep_region_runs`: `vollstaendig = true`, aber `gemeldete_treffer IS NULL`.
 *
 * WARUM: `vollstaendig` ist die Wache vor der Massenloeschung. Ohne
 * Trefferzahl gibt es keinen Massstab, an dem Vollstaendigkeit zu messen
 * waere -- die Kombination ist in sich widerspruechlich. `istRegionVollstaendig`
 * kann sie seit der Fail-closed-Umstellung (2026-09-09) nicht mehr erzeugen.
 * Die entscheidende Zahl ist deshalb das JUENGSTE `started_at`: liegt es vor
 * dem 2026-09-09, ist der Befund Altlast; liegt es danach, schreibt der
 * laufende Code eine unbelegte Vollstaendigkeit.
 *
 * Aufruf: cd scraper && npx tsx scripts/messung-vollstaendig-ohne-trefferzahl.mts
 */
import { sb } from "../lib/supabase.js";

console.log("Frage sweep_region_runs ab (source=immowelt, gemeldete_treffer IS NULL, vollstaendig=true) ...");

const { data, error } = await sb
  .from("sweep_region_runs")
  .select("partition, gemeldete_treffer, vollstaendig, started_at")
  .eq("source", "immowelt")
  .is("gemeldete_treffer", null)
  .eq("vollstaendig", true)
  .order("started_at", { ascending: false })
  .limit(1000);
if (error) throw error;

const zeilen = (data ?? []) as {
  partition: string;
  gemeldete_treffer: number | null;
  vollstaendig: boolean;
  started_at: string;
}[];

console.log(`Antwort da: ${zeilen.length} Zeilen`);

if (zeilen.length === 0) {
  console.log("Keine widerspruechlichen Zeilen gefunden.");
} else {
  console.log(`  juengstes started_at: ${zeilen[0].started_at}`);
  console.log(`  aeltestes started_at: ${zeilen[zeilen.length - 1].started_at}`);

  const jeRegion = new Map<string, string[]>();
  for (const z of zeilen) {
    const bisher = jeRegion.get(z.partition) ?? [];
    bisher.push(z.started_at);
    jeRegion.set(z.partition, bisher);
  }
  console.log("  Verteilung je Region (Anzahl, juengstes, aeltestes):");
  for (const [region, stempel] of [...jeRegion.entries()].sort()) {
    console.log(`    ${region}: ${stempel.length}  juengstes ${stempel[0]}  aeltestes ${stempel[stempel.length - 1]}`);
  }
  console.log("  Alle Zeilen:");
  for (const z of zeilen) console.log(`    ${z.started_at}  ${z.partition}`);
}

// Gegenprobe: Wie sieht der Gesamtbestand aus? Ohne diese Zahlen laesst sich
// nicht sagen, ob "keine Zeile nach dem 09." heisst "abgestellt" oder
// "seitdem lief ueberhaupt nichts".
console.log("Gegenprobe: Gesamtbestand der Tabelle ...");
const { data: alle, error: fehler2 } = await sb
  .from("sweep_region_runs")
  .select("source, partition, started_at, vollstaendig, gemeldete_treffer")
  .order("started_at", { ascending: false })
  .limit(20000);
if (fehler2) throw fehler2;
const g = (alle ?? []) as {
  source: string;
  partition: string;
  started_at: string;
  vollstaendig: boolean;
  gemeldete_treffer: number | null;
}[];
console.log(`  Gesamt: ${g.length} Zeilen, juengste ${g[0]?.started_at}, aelteste ${g[g.length - 1]?.started_at}`);
const vollstaendigeMitZahl = g.filter((z) => z.vollstaendig && z.gemeldete_treffer !== null);
console.log(`  vollstaendig=true MIT Trefferzahl: ${vollstaendigeMitZahl.length}, juengste ${vollstaendigeMitZahl[0]?.started_at}`);
const seit09 = g.filter((z) => z.started_at >= "2026-09-09");
console.log(`  Zeilen ab 2026-09-09: ${seit09.length}, davon vollstaendig=true: ${seit09.filter((z) => z.vollstaendig).length}`);
console.log("Fertig.");
