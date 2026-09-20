/**
 * NUR LESEND. B5 Schritt 1 und 2 in einem Lauf.
 *
 * FRAGE 1 (Schritt 1): Wie alt sind die leeren Huellen? Kommen sie alle aus
 * wenigen Tagen, ist B5 eine Regression. Verteilen sie sich ueber Wochen, ist
 * es ein Dauerzustand -- und damit womoeglich gar kein Fehler.
 *
 * FRAGE 2 (Schritt 2): Ist die E-7-Zahl ("54 Objekte ohne zuordenbare
 * Region") mit der B5-Zahl vergleichbar? Der Backlog warnt ausdruecklich
 * davor, zwei Groessen mit verschiedener Definition nebeneinanderzustellen --
 * genau der Fehler, den dieses Projekt bei "54 statt 157" schon einmal
 * gemacht hat. Also beide Definitionen hier ausrechnen, nicht vergleichen,
 * was frueher gezaehlt wurde.
 *
 * DEFINITION EINER LEEREN HUELLE: eine Zeile in `listings` ohne jede Zeile in
 * `listing_versions`. Nur `upsertListingOhneBewertung` erzeugt solche Zeilen;
 * der regulaere Pfad schreibt immer beides. Im Snapshot erscheinen sie als
 * `titel: null, ort: null, plz: null`, weil all diese Felder auf
 * `listing_versions` liegen.
 *
 * Aufruf: cd scraper && npx tsx scripts/messung-b5-leere-huellen.mts
 */
import { sb } from "../lib/supabase.js";
import { ladeSeitenweise } from "../lib/bestandDb.js";
import { partitionEinesListings } from "../lib/bestand.js";

const QUELLE = "immowelt";

const listings = await ladeSeitenweise<{
  id: string;
  external_id: string;
  first_seen: string;
  last_seen: string;
  disappeared_at: string | null;
  fundort: string | null;
}>(async (nachId, grenze) => {
  let abfrage = sb
    .from("listings")
    .select("id, external_id, first_seen, last_seen, disappeared_at, fundort")
    .eq("source", QUELLE)
    .order("id", { ascending: true });
  if (nachId !== null) abfrage = abfrage.gt("id", nachId);
  return abfrage.limit(grenze);
}, "listings");

// Welche listing_ids tragen ueberhaupt eine Version? Seitenweise, weil die
// Tabelle um ein Vielfaches groesser ist als `listings`.
const mitVersion = new Set<string>();
const versionen = await ladeSeitenweise<{ id: string; listing_id: string }>(
  async (nachId, grenze) => {
    let abfrage = sb
      .from("listing_versions")
      .select("id, listing_id")
      .order("id", { ascending: true });
    if (nachId !== null) abfrage = abfrage.gt("id", nachId);
    return abfrage.limit(grenze);
  },
  "listing_versions"
);
for (const zeile of versionen) mitVersion.add(zeile.listing_id);

const huellen = listings.filter((l) => !mitVersion.has(l.id));

console.log(`\n=== Bestand ${QUELLE} ===`);
console.log(`listings gesamt:            ${listings.length}`);
console.log(`davon mit mindestens einer Version: ${listings.length - huellen.length}`);
console.log(`LEERE HUELLEN (B5):         ${huellen.length}`);

// --- Frage 1: Alter -------------------------------------------------------
const nachTag = new Map<string, number>();
for (const h of huellen) {
  const tag = h.first_seen.slice(0, 10);
  nachTag.set(tag, (nachTag.get(tag) ?? 0) + 1);
}
const tage = [...nachTag.entries()].sort((a, b) => a[0].localeCompare(b[0]));
console.log(`\n=== Schritt 1: first_seen der leeren Huellen ===`);
for (const [tag, anzahl] of tage) console.log(`  ${tag}  ${String(anzahl).padStart(5)}`);
if (tage.length > 0) {
  console.log(`  -> ${tage.length} verschiedene Tage, von ${tage[0][0]} bis ${tage[tage.length - 1][0]}`);
}

// Gegenprobe: verteilt sich der GESAMTE Bestand genauso? Ohne sie sagt die
// Streuung oben nichts -- ein Bestand, der selbst nur drei Tage alt ist, kann
// keine Huellen aus Wochen haben.
const bestandNachTag = new Map<string, number>();
for (const l of listings) {
  const tag = l.first_seen.slice(0, 10);
  bestandNachTag.set(tag, (bestandNachTag.get(tag) ?? 0) + 1);
}
const bestandTage = [...bestandNachTag.keys()].sort();
console.log(`\n  Gegenprobe -- der GESAMTE Bestand verteilt sich auf ${bestandTage.length} Tage`);
console.log(`  (${bestandTage[0]} bis ${bestandTage[bestandTage.length - 1]})`);
console.log(`  Huellenanteil je Tag, wo es Huellen gibt:`);
for (const [tag, anzahl] of tage) {
  const gesamt = bestandNachTag.get(tag) ?? 0;
  const anteil = gesamt > 0 ? ((anzahl / gesamt) * 100).toFixed(1) : "?";
  console.log(`  ${tag}  ${String(anzahl).padStart(5)} von ${String(gesamt).padStart(6)}  = ${anteil} %`);
}

// --- Frage 2: die E-7-Definition -----------------------------------------
// E-7 zaehlt "ohne zuordenbare Region" -- das ist `partitionEinesListings`
// gegen null, NICHT "ohne Version". Zwei verschiedene Fragen an denselben
// Bestand.
const ohneRegion = listings.filter(
  (l) =>
    partitionEinesListings(QUELLE, {
      id: l.id,
      externalId: l.external_id,
      disappearedAt: l.disappeared_at,
      fundort: l.fundort,
    }) === null
);
const beides = huellen.filter(
  (h) =>
    partitionEinesListings(QUELLE, {
      id: h.id,
      externalId: h.external_id,
      disappearedAt: h.disappeared_at,
      fundort: h.fundort,
    }) === null
);
console.log(`\n=== Schritt 2: die E-7-Definition am selben Bestand ===`);
console.log(`ohne zuordenbare Region (E-7):     ${ohneRegion.length}`);
console.log(`leere Huellen (B5):                ${huellen.length}`);
console.log(`beides zugleich:                   ${beides.length}`);
console.log(
  `  -> Die Mengen ueberschneiden sich zu ${
    huellen.length > 0 ? ((beides.length / huellen.length) * 100).toFixed(1) : "0"
  } % der Huellen.`
);

// --- Zustand der Huellen --------------------------------------------------
const abgaengig = huellen.filter((h) => h.disappeared_at !== null).length;
console.log(`\n=== Zustand der leeren Huellen ===`);
console.log(`abgaengig markiert: ${abgaengig}`);
console.log(`im Angebot:         ${huellen.length - abgaengig}`);
const letzteSicht = [...new Set(huellen.map((h) => h.last_seen.slice(0, 10)))].sort();
console.log(
  `zuletzt gesehen zwischen ${letzteSicht[0]} und ${letzteSicht[letzteSicht.length - 1]}`
);
