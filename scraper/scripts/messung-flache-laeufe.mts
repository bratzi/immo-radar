/**
 * NUR LESEND. Zaehlt aus, wie oft ein Immowelt-Lauf nur Seite 1 je Region
 * bekommt -- die Grundlage fuer die Warnung aus BACKLOG B9.
 *
 * DIE FRAGE, neu gestellt: B9 beschreibt den 2026-09-20 als Vorfall. Die
 * Regionshistorie zeigt etwas anderes -- jede Regionszeile traegt entweder
 * die volle Menge (nw 6.800, bw 4.900, br 1.100) oder rund 40. Vierzig ist
 * genau eine Ergebnisseite. Es gibt also nicht einen Einbruch, sondern zwei
 * Betriebszustaende. Dieses Skript zaehlt aus, wie sie sich verteilen.
 *
 * WARUM NICHT EINE PROZENTSCHWELLE: Ein erster Versuch verglich jede Region
 * mit ihrem eigenen Median der letzten zehn Laeufe. Das meldete 24 % aller
 * Laeufe und den Vorfall vom 20.09. trotzdem NICHT -- weil der Median selbst
 * schon bei 40 lag. Der Massstab war mitgesunken. Die Unterscheidung
 * "flach oder tief" braucht keinen Median; sie steht in der Zeile selbst.
 *
 * WACHE: Jede Kennzahl meldet NICHT GEMESSEN, wenn ihre Grundlage fehlt.
 *
 * Aufruf: cd scraper && npx tsx scripts/messung-flache-laeufe.mts
 */
import { sb } from "../lib/supabase.js";

/** Bis zu so vielen Karten gilt eine Region als "nur Seite 1 bekommen". */
const EINE_SEITE = 45;

const { data, error } = await sb
  .from("sweep_region_runs")
  .select("partition, started_at, gesehene_objekte, gemeldete_treffer, vollstaendig")
  .eq("source", "immowelt")
  .order("started_at", { ascending: true })
  .limit(20000);
if (error) throw error;

const zeilen = (data ?? []) as {
  partition: string;
  started_at: string;
  gesehene_objekte: number;
  gemeldete_treffer: number | null;
  vollstaendig: boolean;
}[];

console.log(`sweep_region_runs (immowelt): ${zeilen.length} Zeilen`);
if (zeilen.length === 0) {
  console.log("NICHT GEMESSEN: keine Zeilen. Abbruch.");
  process.exit(1);
}

// Regionszeilen desselben Laufs tragen denselben Zeitstempel bis auf
// Sekundenbruchteile. Gruppiert wird auf die Minute -- ein Lauf startet
// seine Regionen nacheinander, aber `started_at` ist der Laufbeginn.
const jeLauf = new Map<string, typeof zeilen>();
for (const z of zeilen) {
  const schluessel = z.started_at.slice(0, 16);
  const bisher = jeLauf.get(schluessel) ?? [];
  bisher.push(z);
  jeLauf.set(schluessel, bisher);
}

let flach = 0;
let tief = 0;
let gemischt = 0;
const tiefeJeRegion = new Map<string, number>();
const laeufeJeRegion = new Map<string, number>();

console.log("\nLauf              Regionen  davon nur Seite 1  Summe gesehen  Zustand");
for (const [zeit, gruppe] of [...jeLauf].sort()) {
  const nurSeite1 = gruppe.filter((z) => z.gesehene_objekte <= EINE_SEITE).length;
  const summe = gruppe.reduce((s, z) => s + Number(z.gesehene_objekte), 0);
  const zustand =
    nurSeite1 === gruppe.length ? "FLACH" : nurSeite1 === 0 ? "tief" : "gemischt";
  if (zustand === "FLACH") flach++;
  else if (zustand === "tief") tief++;
  else gemischt++;
  for (const z of gruppe) {
    laeufeJeRegion.set(z.partition, (laeufeJeRegion.get(z.partition) ?? 0) + 1);
    if (Number(z.gesehene_objekte) > EINE_SEITE) {
      tiefeJeRegion.set(z.partition, (tiefeJeRegion.get(z.partition) ?? 0) + 1);
    }
  }
  console.log(
    `${zeit}  ${String(gruppe.length).padStart(8)}  ${String(nurSeite1).padStart(17)}  ` +
      `${String(summe).padStart(13)}  ${zustand}`
  );
}

const laeufe = flach + tief + gemischt;
console.log(`\nLaeufe insgesamt: ${laeufe}`);
console.log(`  FLACH (jede Region nur Seite 1): ${flach}  = ${((flach / laeufe) * 100).toFixed(0)} %`);
console.log(`  tief (keine Region auf Seite 1 stehengeblieben): ${tief}`);
console.log(`  gemischt: ${gemischt}`);

console.log("\nRegion  Laeufe  davon tief  zuletzt tief");
const letzteTiefe = new Map<string, string>();
for (const z of zeilen) {
  if (Number(z.gesehene_objekte) > EINE_SEITE) letzteTiefe.set(z.partition, z.started_at.slice(0, 16));
}
for (const region of [...laeufeJeRegion.keys()].sort()) {
  const alle = laeufeJeRegion.get(region) ?? 0;
  const t = tiefeJeRegion.get(region) ?? 0;
  console.log(
    `${region.padEnd(6)}  ${String(alle).padStart(6)}  ${String(t).padStart(10)}  ` +
      `${letzteTiefe.get(region) ?? "NIE"}`
  );
}

// Der Kandidat fuer die Warnung: eine Region meldet eine Trefferzahl, liefert
// aber nur eine Seite. Das braucht keinen Median und keine Schwelle.
const mitTreffer = zeilen.filter((z) => z.gemeldete_treffer !== null && z.gemeldete_treffer > 0);
console.log(`\nZeilen mit ausgewiesener Trefferzahl: ${mitTreffer.length} von ${zeilen.length}`);
if (mitTreffer.length === 0) {
  console.log("  NICHT GEMESSEN: keine einzige Trefferzahl in der Historie.");
} else {
  const krass = mitTreffer.filter(
    (z) => Number(z.gesehene_objekte) <= EINE_SEITE && (z.gemeldete_treffer as number) > 100
  );
  console.log(
    `  davon "nur Seite 1 trotz ausgewiesener Menge > 100": ${krass.length} ` +
      `= ${((krass.length / mitTreffer.length) * 100).toFixed(0)} % der Zeilen mit Trefferzahl`
  );
}

// --- Was das fuer die Neubewertung heisst -------------------------------
// Ein Objekt wird nur neu bewertet, wenn SEINE Region tief gesweept wird und
// es dabei in die Bewertungsscheibe faellt. Beide Faktoren zusammen, nicht
// der Deckel allein, bestimmen die Latenz einer Preissenkung.
const DECKEL_ALT = 600;
const DECKEL_NEU = 3000;
const zeitraumTage =
  (Date.parse(zeilen[zeilen.length - 1].started_at) - Date.parse(zeilen[0].started_at)) / 86_400_000;
console.log(`\nZeitraum der Historie: ${zeitraumTage.toFixed(1)} Tage`);
if (!(zeitraumTage > 0)) {
  console.log("  NICHT GEMESSEN: Zeitraum ist null, Kadenz nicht berechenbar.");
} else {
  console.log("\nRegion  Objekte  tiefe Laeufe/Tag  Tage bis neu bewertet bei 600  bei 3000");
  for (const region of [...laeufeJeRegion.keys()].sort()) {
    const tiefe = zeilen.filter(
      (z) => z.partition === region && Number(z.gesehene_objekte) > EINE_SEITE
    );
    if (tiefe.length === 0) {
      console.log(`${region.padEnd(6)}  NICHT GEMESSEN (kein einziger tiefer Lauf)`);
      continue;
    }
    const objekte = Math.max(...tiefe.map((z) => Number(z.gesehene_objekte)));
    const proTag = tiefe.length / zeitraumTage;
    const tage = (deckel: number) => objekte / deckel / proTag;
    console.log(
      `${region.padEnd(6)}  ${String(objekte).padStart(7)}  ${proTag.toFixed(2).padStart(16)}  ` +
        `${tage(DECKEL_ALT).toFixed(1).padStart(29)}  ${tage(DECKEL_NEU).toFixed(1).padStart(8)}`
    );
  }
}
