/**
 * NUR LESEND. Erzeugt EINMAL einen echten Snapshot gegen die
 * Produktionsdatenbank und misst, was dabei herauskommt -- vor allem die
 * Dateigroesse.
 *
 * WOZU: N4 des Nachtrags vermutet 6 bis 10 MB und schreibt ausdruecklich
 * "erst messen, dann teilen". Ohne diese Messung waere die Entscheidung gegen
 * eine Aufteilung eine Vermutung ueber eine Vermutung. Zugleich ist der Lauf
 * die Gegenprobe auf das Format: Er zeigt, ob es traegt.
 *
 * Dieses Skript SCHREIBT NICHT in die Datenbank. Es schreibt genau eine Datei
 * nach `scraper/snapshot/` (git-ignoriert).
 *
 * Aufruf: cd scraper && npx tsx scripts/messung-snapshot-groesse.mts
 */
import { sb } from "../lib/supabase.js";
import { baueSnapshot } from "../lib/snapshot.js";
import { ladeSnapshotEingabe, schreibeSnapshot } from "../lib/snapshotDb.js";

const jetzt = new Date();
console.log(`Laden beginnt (${jetzt.toISOString()}) ...`);
const begonnen = Date.now();

const eingabe = await ladeSnapshotEingabe(
  sb,
  { id: null, beendetAm: null },
  // Kein Lauf -> Laufkennwerte unbekannt -> null. Nicht 0.
  { uebersprungeneJeLauf: null, meldebudget: null }
);
console.log(
  `geladen in ${((Date.now() - begonnen) / 1000).toFixed(1)} s: ` +
    `${eingabe.listings.length} listings, ${eingabe.versionen.length} listing_versions, ` +
    `${eingabe.regionsLaeufe.length} sweep_region_runs`
);

const snapshot = baueSnapshot(eingabe, jetzt);
const { pfad, bytes } = await schreibeSnapshot("snapshot/messung-snapshot.json", snapshot);

console.log(`\n=== Datei ===`);
console.log(`${pfad}: ${bytes} Bytes = ${(bytes / 1_048_576).toFixed(2)} MB unkomprimiert`);
console.log(`je Objekt: ${(bytes / Math.max(snapshot.objekte.length, 1)).toFixed(0)} Bytes`);

console.log(`\n=== Kopfzeile ===`);
console.log(JSON.stringify(snapshot.kopfzeile, null, 2));

console.log(`\n=== Trefferklasse / Stufe / Zustand ===`);
console.log("trefferklasse:", zaehle(snapshot.objekte.map((o) => o.trefferklasse)));
console.log("stufe:        ", zaehle(snapshot.objekte.map((o) => o.stufe)));
console.log("zustand:      ", zaehle(snapshot.objekte.map((o) => o.zustand)));
console.log("quelle:       ", zaehle(snapshot.objekte.map((o) => o.quelle)));
console.log(
  "ohne Version: ",
  snapshot.objekte.filter((o) => o.kaufpreisEuro === null).length
);
console.log("mit PLZ:      ", snapshot.objekte.filter((o) => o.plz !== null).length);
console.log(
  "ohne Bundesland:",
  snapshot.objekte.filter((o) => o.bundesland === null).length
);
console.log("Schwellenwechsler:", snapshot.objekte.filter((o) => o.istSchwellenwechsler).length);

console.log(`\n=== Bundeslaender (Kartengrundschicht) ===`);
console.log("name                        objekte  top  medianDscr  standAlterTage");
for (const land of snapshot.bundeslaender) {
  console.log(
    `${land.name.padEnd(26)} ${String(land.objekte).padStart(7)} ${String(land.topTreffer).padStart(4)}  ` +
      `${formatZahl(land.medianDscr, 3).padStart(10)}  ${formatZahl(land.standAlterTage, 2).padStart(14)}`
  );
}

console.log(`\n=== Regionsstand (Betriebsseite) ===`);
for (const stand of snapshot.betrieb.regionsstand) {
  console.log(`${stand.region}  ${stand.letzterLauf}  vollstaendig=${stand.vollstaendig}`);
}

const beispiel = snapshot.objekte.find((o) => o.trefferklasse === "top") ?? snapshot.objekte[0];
console.log(`\n=== Beispielobjekt ===`);
console.log(JSON.stringify(beispiel, null, 2));

const ohneVersion = snapshot.objekte.find((o) => o.kaufpreisEuro === null);
console.log(`\n=== Beispiel "nicht beurteilbar" ohne Version ===`);
console.log(JSON.stringify(ohneVersion ?? null, null, 2));

function zaehle(werte: string[]): Record<string, number> {
  const zaehler: Record<string, number> = {};
  for (const wert of werte) zaehler[wert] = (zaehler[wert] ?? 0) + 1;
  return zaehler;
}

function formatZahl(wert: number | null, stellen: number): string {
  return wert === null ? "null" : wert.toFixed(stellen);
}
