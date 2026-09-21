/**
 * NUR LESEND. Prueft Kandidaten fuer den ZWEITEN Vollstaendigkeitsmassstab
 * (BACKLOG A16) gegen ein Feld, auf dem die Wahrheit bekannt ist.
 *
 * DIE IDEE: A16 will Regionen ohne ausgewiesene Trefferzahl (`nw`, `bw`,
 * `mv`, `sh`) an ihrer EIGENEN Historie messen. Ob so ein Massstab taugt,
 * laesst sich an diesen vier Regionen gerade NICHT pruefen -- dort fehlt die
 * Wahrheit. Die zwoelf uebrigen Regionen nennen ihre Trefferzahl; fuer sie
 * steht in `vollstaendig` bereits das Urteil des heutigen Massstabs. Ein
 * Kandidat, der dort Fail-open erzeugt, taugt fuer `nw` erst recht nicht.
 *
 * WARUM NICHT EINFACH DER MEDIAN: Am 2026-09-21 gemessen -- 24 % der Laeufe
 * sind flach (jede Region bleibt bei rund 40 Karten). Ein gleitender Median
 * sinkt mit diesem Ausfall MIT. Deshalb steht hier auch eine Hochwassermarke
 * als Kandidat, die das strukturell nicht kann.
 *
 * WACHE: Jede Kennzahl meldet NICHT GEMESSEN, wenn ihre Grundlage fehlt.
 * Ein Kandidat ohne ein einziges gepruefte Urteil gilt NICHT als fehlerfrei.
 *
 * Aufruf: cd scraper && npx tsx scripts/messung-a16-massstaebe.mts
 */
import { sb } from "../lib/supabase.js";
import { median } from "../lib/plausibilitaet.js";

const { data, error } = await sb
  .from("sweep_region_runs")
  .select("partition, started_at, gesehene_objekte, gemeldete_treffer, vollstaendig")
  .eq("source", "immowelt")
  .order("started_at", { ascending: true })
  .limit(20000);
if (error) throw error;

type Zeile = {
  partition: string;
  started_at: string;
  gesehene_objekte: number;
  gemeldete_treffer: number | null;
  vollstaendig: boolean;
};
const zeilen = (data ?? []) as Zeile[];

console.log(`sweep_region_runs (immowelt): ${zeilen.length} Zeilen`);
if (zeilen.length === 0) {
  console.log("NICHT GEMESSEN: keine Zeilen. Abbruch.");
  process.exit(1);
}

const jeRegion = new Map<string, Zeile[]>();
for (const z of zeilen) {
  const bisher = jeRegion.get(z.partition) ?? [];
  bisher.push(z);
  jeRegion.set(z.partition, bisher);
}

const ohneTrefferzahl: string[] = [];
const mitTrefferzahl: string[] = [];
for (const [code, rs] of jeRegion) {
  (rs.every((r) => r.gemeldete_treffer === null) ? ohneTrefferzahl : mitTrefferzahl).push(code);
}
ohneTrefferzahl.sort();
mitTrefferzahl.sort();

console.log(`\n=== Regionen ===`);
console.log(`nie eine Trefferzahl (${ohneTrefferzahl.length}): ${ohneTrefferzahl.join(", ") || "KEINE"}`);
console.log(`mit Trefferzahl     (${mitTrefferzahl.length}): ${mitTrefferzahl.join(", ") || "KEINE"}`);

console.log(`\n=== Historie je Region ===`);
console.log("code  Zeilen  min     max     Median  vollst.  Spanne max/min");
for (const code of [...ohneTrefferzahl, ...mitTrefferzahl]) {
  const rs = jeRegion.get(code)!;
  const m = rs.map((r) => r.gesehene_objekte);
  const min = Math.min(...m);
  const max = Math.max(...m);
  const med = median(m);
  const vollst = rs.filter((r) => r.vollstaendig).length;
  const spanne = min > 0 ? (max / min).toFixed(1) : "NICHT GEMESSEN (min=0)";
  console.log(
    `${code.padEnd(5)} ${String(rs.length).padStart(6)}  ${String(min).padStart(6)}  ` +
      `${String(max).padStart(6)}  ${String(med).padStart(6)}  ${String(vollst).padStart(7)}  ${spanne}`
  );
}

/** Ein Kandidat urteilt aus der Historie -- ohne die Trefferzahl zu kennen. */
type Kandidat = {
  name: string;
  /** null = enthaelt sich (zu wenig Historie). Sonst: vollstaendig ja/nein. */
  urteil: (gesehen: number, historie: number[]) => boolean | null;
};

const MIN_HIST = 3;
const FENSTER = 10;

function hochwasser(werte: number[]): number {
  return Math.max(...werte);
}

const kandidaten: Kandidat[] = [
  {
    name: "K1 Median der letzten 10, Toleranz 25 %",
    urteil: (g, h) => {
      if (h.length < MIN_HIST) return null;
      const ref = median(h.slice(-FENSTER));
      if (ref === null || !(ref > 0)) return null;
      return g >= ref * 0.75;
    },
  },
  {
    name: "K2 Median der letzten 10, Toleranz 10 %",
    urteil: (g, h) => {
      if (h.length < MIN_HIST) return null;
      const ref = median(h.slice(-FENSTER));
      if (ref === null || !(ref > 0)) return null;
      return g >= ref * 0.9;
    },
  },
  {
    name: "K3 Hochwassermarke der letzten 10, Toleranz 25 %",
    urteil: (g, h) => {
      if (h.length < MIN_HIST) return null;
      const ref = hochwasser(h.slice(-FENSTER));
      if (!(ref > 0)) return null;
      return g >= ref * 0.75;
    },
  },
  {
    name: "K4 Hochwassermarke der letzten 10, Toleranz 10 %",
    urteil: (g, h) => {
      if (h.length < MIN_HIST) return null;
      const ref = hochwasser(h.slice(-FENSTER));
      if (!(ref > 0)) return null;
      return g >= ref * 0.9;
    },
  },
  {
    name: "K5 Hochwassermarke ueber die GANZE Historie, Toleranz 10 %",
    urteil: (g, h) => {
      if (h.length < MIN_HIST) return null;
      const ref = hochwasser(h);
      if (!(ref > 0)) return null;
      return g >= ref * 0.9;
    },
  },
];

console.log(`\n=== Gegenprobe auf den ${mitTrefferzahl.length} Regionen MIT Trefferzahl ===`);
console.log(`Wahrheit = Spalte \`vollstaendig\` (heutiger Massstab gegen die gemeldete Menge).`);
console.log(`Historie = \`gesehene_objekte\` ALLER frueheren Zeilen derselben Region.`);
console.log(`(Nur vollstaendige Zeilen als Historie geht nicht: fuer nw/bw/mv/sh gibt es keine.)\n`);

console.log(
  "Kandidat".padEnd(48) +
    "geprueft  FAIL-OPEN  Fehlalarm  enthalten"
);
for (const k of kandidaten) {
  let geprueft = 0;
  let failOpen = 0; // Kandidat sagt vollstaendig, Trefferzahl sagt nein
  let fehlalarm = 0; // Kandidat sagt unvollstaendig, Trefferzahl sagt ja
  let enthalten = 0;
  // WACHE gegen "0 Fehler, weil nichts angeschaut": wie oft sagt der Kandidat
  // ueberhaupt JA, und wie oft sagt die Wahrheit JA? Stimmen beide Zahlen bei
  // 0 Fehlern ueberein, ist die Uebereinstimmung echt. Sagt ein Kandidat NIE
  // ja, ist er trivial fehlerfrei und damit wertlos.
  let jaKandidat = 0;
  let jaWahrheit = 0;
  for (const code of mitTrefferzahl) {
    const rs = jeRegion.get(code)!;
    const historie: number[] = [];
    for (const z of rs) {
      if (z.gemeldete_treffer !== null) {
        const u = k.urteil(z.gesehene_objekte, historie);
        if (u === null) enthalten++;
        else {
          geprueft++;
          if (u) jaKandidat++;
          if (z.vollstaendig) jaWahrheit++;
          if (u && !z.vollstaendig) failOpen++;
          if (!u && z.vollstaendig) fehlalarm++;
        }
      }
      historie.push(z.gesehene_objekte);
    }
  }
  let bewertung = "";
  if (geprueft === 0) bewertung = "  NICHT GEMESSEN (0 Urteile)";
  else if (jaKandidat === 0) bewertung = "  WERTLOS: sagt nie vollstaendig";
  bewertung += `   [ja: Kandidat ${jaKandidat} / Wahrheit ${jaWahrheit}]`;
  console.log(
    k.name.padEnd(48) +
      String(geprueft).padStart(8) +
      String(failOpen).padStart(11) +
      String(fehlalarm).padStart(11) +
      String(enthalten).padStart(11) +
      bewertung
  );
}

console.log(`\n=== Was der Kandidat bei nw/bw/mv/sh taete ===`);
for (const code of ohneTrefferzahl) {
  const rs = jeRegion.get(code)!;
  console.log(`\n--- ${code} (${rs.length} Zeilen) ---`);
  for (const k of kandidaten) {
    const historie: number[] = [];
    let ja = 0;
    let nein = 0;
    let enth = 0;
    for (const z of rs) {
      const u = k.urteil(z.gesehene_objekte, historie);
      if (u === null) enth++;
      else if (u) ja++;
      else nein++;
      historie.push(z.gesehene_objekte);
    }
    console.log(`  ${k.name.padEnd(48)} vollstaendig: ${ja}, unvollstaendig: ${nein}, enthalten: ${enth}`);
  }
  const letzte = rs.slice(-12).map((r) => r.gesehene_objekte);
  console.log(`  letzte bis zu 12 Mengen: ${letzte.join(", ")}`);
}

// ---------------------------------------------------------------------------
// Toleranzkurve: derselbe Schaetzer (Hochwassermarke OHNE Fenster), nur die
// Grenze wandert. Stimmt ein Kandidat nur bei genau einem Wert, waere er auf
// die Daten gepasst. Ein breites fehlerfreies Band ist der Beleg dagegen.
// ---------------------------------------------------------------------------
console.log(`\n=== Toleranzkurve der Hochwassermarke (ganze Historie) ===`);
console.log("Toleranz  geprueft  FAIL-OPEN  Fehlalarm  ja Kandidat  ja Wahrheit");
for (const t of [0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.35, 0.5]) {
  let geprueft = 0;
  let failOpen = 0;
  let fehlalarm = 0;
  let jaK = 0;
  let jaW = 0;
  for (const code of mitTrefferzahl) {
    const historie: number[] = [];
    for (const z of jeRegion.get(code)!) {
      if (z.gemeldete_treffer !== null && historie.length >= MIN_HIST) {
        const ref = hochwasser(historie);
        if (ref > 0) {
          const u = z.gesehene_objekte >= ref * (1 - t);
          geprueft++;
          if (u) jaK++;
          if (z.vollstaendig) jaW++;
          if (u && !z.vollstaendig) failOpen++;
          if (!u && z.vollstaendig) fehlalarm++;
        }
      }
      historie.push(z.gesehene_objekte);
    }
  }
  const wache = geprueft === 0 ? " NICHT GEMESSEN" : jaK === 0 ? " WERTLOS: nie ja" : "";
  console.log(
    `${String(Math.round(t * 100)).padStart(7)} %${String(geprueft).padStart(9)}` +
      `${String(failOpen).padStart(11)}${String(fehlalarm).padStart(11)}` +
      `${String(jaK).padStart(13)}${String(jaW).padStart(13)}${wache}`
  );
}

// ---------------------------------------------------------------------------
// Der Startfall. Das Loch, das keine reale Zeile heute zeigt: Eine Region,
// deren Historie MIT flachen Laeufen beginnt, bekommt eine Hochwassermarke von
// 40 -- und dann gilt der naechste flache Lauf als vollstaendig.
// ---------------------------------------------------------------------------
console.log(`\n=== Der Startfall: erste Laeufe einer Region FLACH ===`);
function urteilHochwasser(gesehen: number, historie: number[], t = 0.1): boolean | null {
  if (historie.length < MIN_HIST) return null;
  const ref = hochwasser(historie);
  if (!(ref > 0)) return null;
  return gesehen >= ref * (1 - t);
}
for (const k of [3, 5, 10]) {
  const u = urteilHochwasser(40, Array(k).fill(40));
  console.log(
    `  Historie = ${k} x 40 Karten, neuer Lauf 40 -> ` +
      `"${u === null ? "enthaelt sich" : u ? "JA -- FAIL-OPEN" : "nein"}"`
  );
}
console.log(
  `  Historie = 40, 40, 6800, neuer Lauf 40 -> ` +
    `"${urteilHochwasser(40, [40, 40, 6800]) ? "JA -- FAIL-OPEN" : "nein"}"`
);
console.log(`\n  Kommt der Startfall real vor? Erste drei Zeilen je Region:`);
let startfallEingetreten = 0;
for (const code of [...ohneTrefferzahl, ...mitTrefferzahl]) {
  const ersteDrei = jeRegion.get(code)!.slice(0, 3).map((r) => r.gesehene_objekte);
  const alleFlach = ersteDrei.length === 3 && ersteDrei.every((m) => m <= 45);
  if (alleFlach) startfallEingetreten++;
  console.log(
    `  ${code.padEnd(5)} ${ersteDrei.join(", ").padEnd(22)}` +
      `${alleFlach ? " <-- STARTFALL WAERE EINGETRETEN" : ""}`
  );
}
console.log(
  `\n  ${startfallEingetreten} von ${jeRegion.size} Regionen starteten flach. ` +
    `Das Loch ist real oder nicht -- aber es ist NICHT durch die Gegenprobe gedeckt: ` +
    `dort urteilt der Massstab erst ab Zeile 4.`
);
