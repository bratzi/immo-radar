/**
 * NUR LESEND. Misst, was `sweep_region_runs` ueber die Regionskadenz hergibt.
 *
 * WARUM DIESES SKRIPT IM REPO LIEGT: Der Dashboard-Entwurf (4.3, 13.8) hat
 * eine halbe Korrekturrunde verloren, weil das Messskript zur Regionskadenz
 * nur in einem git-ignorierten Verzeichnis lag und mit der Sitzung verschwand
 * -- die Zahl war danach nicht mehr nachvollziehbar. Dieses hier ist
 * committet, damit die Herleitung wiederholbar bleibt.
 *
 * Aufruf: cd scraper && npx tsx scripts/messung-regionskadenz.mts
 */
import { sb } from "../lib/supabase.js";

const { data, error } = await sb
  .from("sweep_region_runs")
  .select("source, partition, started_at, vollstaendig, gesehene_objekte, gemeldete_treffer")
  .order("started_at", { ascending: true })
  .limit(20000);
if (error) throw error;

const zeilen = (data ?? []) as {
  source: string;
  partition: string;
  started_at: string;
  vollstaendig: boolean;
  gesehene_objekte: number;
  gemeldete_treffer: number | null;
}[];

console.log(`sweep_region_runs: ${zeilen.length} Zeilen`);
if (zeilen.length > 0) {
  console.log(`  aeltester Lauf: ${zeilen[0].started_at}`);
  console.log(`  juengster Lauf: ${zeilen[zeilen.length - 1].started_at}`);
}

const jeSchluessel = new Map<string, typeof zeilen>();
for (const zeile of zeilen) {
  const schluessel = `${zeile.source}/${zeile.partition}`;
  const bisher = jeSchluessel.get(schluessel) ?? [];
  bisher.push(zeile);
  jeSchluessel.set(schluessel, bisher);
}

console.log("\nquelle/region  laeufe  davon vollst.  mit gemeldete_treffer  medianAbstandTage(alle)  medianAbstandTage(vollst.)");
const namen = [...jeSchluessel.keys()].sort();
for (const name of namen) {
  const gruppe = jeSchluessel.get(name)!;
  const vollstaendige = gruppe.filter((z) => z.vollstaendig);
  const mitTreffer = gruppe.filter((z) => z.gemeldete_treffer !== null);
  console.log(
    `${name.padEnd(14)} ${String(gruppe.length).padStart(6)}  ${String(vollstaendige.length).padStart(13)}  ` +
      `${String(mitTreffer.length).padStart(21)}  ${medianAbstand(gruppe).toFixed(2).padStart(23)}  ` +
      `${medianAbstand(vollstaendige).toFixed(2).padStart(26)}`
  );
}

function medianAbstand(gruppe: { started_at: string }[]): number {
  const zeiten = gruppe
    .map((z) => Date.parse(z.started_at))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (zeiten.length < 2) return Number.NaN;
  const abstaende: number[] = [];
  for (let i = 1; i < zeiten.length; i += 1) abstaende.push((zeiten[i] - zeiten[i - 1]) / 86_400_000);
  abstaende.sort((a, b) => a - b);
  const mitte = Math.floor(abstaende.length / 2);
  return abstaende.length % 2 === 1
    ? abstaende[mitte]
    : (abstaende[mitte - 1] + abstaende[mitte]) / 2;
}
