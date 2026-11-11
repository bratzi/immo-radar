/**
 * Snapshot fuers Dashboard (minimal, Plan 2 erweitert): Angebote mit passt
 * ja/unklar nach Punkten und die letzten 20 Laeufe.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

type Zeile = Record<string, unknown> & { passt?: unknown; punkte?: unknown };

export function baueSnapshot<A extends Zeile, L extends Record<string, unknown>>(angebote: A[], laeufe: L[], jetzt: Date) {
  return {
    erzeugtAm: jetzt.toISOString(),
    angebote: angebote.filter((a) => a.passt === "ja" || a.passt === "unklar")
      .sort((x, y) => Number(y.punkte ?? 0) - Number(x.punkte ?? 0)),
    laeufe,
  };
}

export async function schreibeSnapshot(sb: SupabaseClient, pfad: string, jetzt: Date): Promise<void> {
  const { data: angebote, error } = await sb.from("angebote").select("*").in("passt", ["ja", "unklar"]).is("verschwunden_am", null);
  if (error) throw new Error(`Snapshot angebote: ${error.message}`);
  const { data: laeufe, error: e2 } = await sb.from("laeufe").select("*").order("gestartet_am", { ascending: false }).limit(20);
  if (e2) throw new Error(`Snapshot laeufe: ${e2.message}`);
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(baueSnapshot(angebote ?? [], laeufe ?? [], jetzt), null, 2));
}
