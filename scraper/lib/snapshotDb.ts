/**
 * Snapshot-Export -- die Ladeschicht und das Schreiben der Datei.
 *
 * DIESE DATEI LIEST NUR. Kein `insert`, kein `update`, kein `delete`, kein
 * `upsert` gegen die Datenbank -- das ist die harte Anforderung an Schritt 3
 * (Entwurf 5.3: "Es verlangt null Aenderungen an der Produktionsdatenbank").
 * Geschrieben wird genau eine Datei im Dateisystem.
 *
 * Alles Rechnen steht in `snapshot.ts` und ist dort ohne Datenbank getestet.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ladeSeitenweise } from "./bestandDb.js";
import {
  baueSnapshot,
  zuListingZeile,
  zuVersionZeile,
  type RegionsLauf,
  type Snapshot,
  type SnapshotBetriebEingabe,
  type SnapshotEingabe,
  type SnapshotListingZeile,
  type SnapshotVersionZeile,
} from "./snapshot.js";

/**
 * Wohin die Datei standardmaessig geht, relativ zum Arbeitsverzeichnis des
 * Laufs (`scraper/`). Ueberschreibbar ueber `SNAPSHOT_PFAD`, damit die
 * spaetere Veroeffentlichung als CI-Artefakt den Ort setzen kann, ohne dass
 * hier etwas geaendert werden muss -- der Workflow selbst gehoert nicht zu
 * diesem Schritt.
 */
export const SNAPSHOT_STANDARD_PFAD = path.join("snapshot", "dashboard-snapshot.json");

export function snapshotPfad(): string {
  const gesetzt = (process.env.SNAPSHOT_PFAD ?? "").trim();
  return gesetzt === "" ? SNAPSHOT_STANDARD_PFAD : gesetzt;
}

/**
 * Schreibt den Snapshot und meldet die TATSAECHLICHE Groesse in Bytes.
 *
 * Die Groesse wird gemessen und nicht geschaetzt: N4 vermutet 6 bis 10 MB und
 * verlangt ausdruecklich "erst messen, dann teilen". Ohne diese Zahl im Log
 * waere die Entscheidung ueber eine Aufteilung wieder eine Vermutung.
 */
export async function schreibeSnapshot(
  ziel: string,
  snapshot: Snapshot
): Promise<{ pfad: string; bytes: number }> {
  const verzeichnis = path.dirname(ziel);
  if (verzeichnis !== "" && verzeichnis !== ".") {
    await mkdir(verzeichnis, { recursive: true });
  }
  // Ohne Einrueckung: Die Datei wird gelesen, nicht gelesen-gelesen. Bei
  // 17.000 Objekten kostet jede Einrueckungsebene mehrere hundert Kilobyte,
  // und die Oberflaeche parst ohnehin.
  const inhalt = JSON.stringify(snapshot);
  await writeFile(ziel, inhalt, "utf-8");
  return { pfad: ziel, bytes: Buffer.byteLength(inhalt, "utf-8") };
}

/**
 * Laedt alle `listings`.
 *
 * Geblaettert wird per KEYSET und nicht per `.range()`. Der Grund steht
 * ausfuehrlich an `ladeSeitenweise` (`bestandDb.ts`) und ist gemessen: Ueber
 * `listings` kamen am 2026-09-12 1.762 von 12.158 Zeilen doppelt und 1.762
 * gar nicht. Eine seitenweise Abfrage ohne stabile Sortierung ist hier keine
 * Abfrage, sondern eine Stichprobe -- und ein Snapshot, der ein Sechstel des
 * Bestands doppelt und ein Sechstel nie zeigt, waere schlimmer als keiner.
 */
async function ladeAlleListings(supabase: SupabaseClient): Promise<SnapshotListingZeile[]> {
  const zeilen = await ladeSeitenweise<{ id: string } & Record<string, unknown>>(
    async (nachId, grenze) => {
      let abfrage = supabase
        .from("listings")
        .select("id, source, external_id, url, first_seen, last_seen, disappeared_at, fundort")
        .order("id", { ascending: true });
      if (nachId !== null) abfrage = abfrage.gt("id", nachId);
      return abfrage.limit(grenze);
    },
    "listings"
  );
  return zeilen.map(zuListingZeile);
}

/**
 * Laedt ALLE `listing_versions` (25.709 Zeilen am 2026-09-15), ebenfalls per
 * Keyset.
 *
 * Warum alle und nicht nur die juengste je Objekt: Die "juengste je
 * `listing_id`" verlangt in PostgREST entweder ein `distinct on`, das die
 * Client-Bibliothek nicht anbietet, oder eine Sicht bzw. Funktion in der
 * Datenbank -- und eine Schemaaenderung ist fuer Schritt 3 ausdruecklich
 * ausgeschlossen. Die Auswahl trifft deshalb `waehleJuengsteVersionen`
 * (`snapshot.ts`), wo sie ohne Datenbank unter Test steht.
 */
async function ladeAlleVersionen(supabase: SupabaseClient): Promise<SnapshotVersionZeile[]> {
  const zeilen = await ladeSeitenweise<{ id: string } & Record<string, unknown>>(
    async (nachId, grenze) => {
      let abfrage = supabase
        .from("listing_versions")
        // Eine einzige Zeichenkette, nicht zusammengesetzt: PostgREST leitet
        // den Ergebnistyp aus dem LITERAL ab, und eine Verkettung nimmt ihm
        // genau das.
        .select("id, listing_id, scanned_at, price_cents, rent_cold_monthly_cents, rent_source, living_area_m2, plot_area_m2, units, units_confident, year_built, zip_code, city, bundesland, title, price_dropped, data_gaps, auction_at")
        .order("id", { ascending: true });
      if (nachId !== null) abfrage = abfrage.gt("id", nachId);
      return abfrage.limit(grenze);
    },
    "listing_versions"
  );
  return zeilen.map(zuVersionZeile);
}

/** Laedt `sweep_region_runs` -- Grundlage der Kadenz und des Regionsstands. */
async function ladeRegionsLaeufe(supabase: SupabaseClient): Promise<RegionsLauf[]> {
  const zeilen = await ladeSeitenweise<{ id: string } & Record<string, unknown>>(
    async (nachId, grenze) => {
      let abfrage = supabase
        .from("sweep_region_runs")
        .select("id, source, partition, started_at, vollstaendig")
        .order("id", { ascending: true });
      if (nachId !== null) abfrage = abfrage.gt("id", nachId);
      return abfrage.limit(grenze);
    },
    "sweep_region_runs"
  );
  // Dieselbe Normalisierung wie an jeder anderen Datenbankgrenze: Was fehlt,
  // behauptet nichts. Ein fehlendes `vollstaendig` heisst NICHT vollstaendig.
  return zeilen.map((zeile) => ({
    source: typeof zeile.source === "string" ? zeile.source : "",
    partition: typeof zeile.partition === "string" ? zeile.partition : "",
    startedAt: typeof zeile.started_at === "string" ? zeile.started_at : "",
    vollstaendig: zeile.vollstaendig === true,
  }));
}

export interface SnapshotLaufAngaben {
  id: string | null;
  beendetAm: string | null;
}

/** Laedt alles, was `baueSnapshot` braucht. Rein lesend. */
export async function ladeSnapshotEingabe(
  supabase: SupabaseClient,
  lauf: SnapshotLaufAngaben,
  betrieb: SnapshotBetriebEingabe
): Promise<SnapshotEingabe> {
  const [listings, versionen, regionsLaeufe] = await Promise.all([
    ladeAlleListings(supabase),
    ladeAlleVersionen(supabase),
    ladeRegionsLaeufe(supabase),
  ]);
  return { listings, versionen, regionsLaeufe, lauf, betrieb };
}

export interface SnapshotErgebnis {
  pfad: string;
  bytes: number;
  objekte: number;
}

/**
 * Der ganze Schritt 3: laden, rechnen, schreiben. Rein lesend gegenueber der
 * Datenbank.
 */
export async function erzeugeSnapshot(
  supabase: SupabaseClient,
  lauf: SnapshotLaufAngaben,
  betrieb: SnapshotBetriebEingabe,
  jetzt: Date,
  ziel: string = snapshotPfad()
): Promise<SnapshotErgebnis> {
  const eingabe = await ladeSnapshotEingabe(supabase, lauf, betrieb);
  const snapshot = baueSnapshot(eingabe, jetzt);
  const geschrieben = await schreibeSnapshot(ziel, snapshot);
  return { ...geschrieben, objekte: snapshot.objekte.length };
}
