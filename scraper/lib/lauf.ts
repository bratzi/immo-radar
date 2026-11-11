import type { SupabaseClient } from "@supabase/supabase-js";
import type { Quelle } from "./typen.js";

export interface LaufZeile {
  quelle: Quelle; gesehen: number; passend: number; unklar: number; gemeldet: number;
  vollstaendig: boolean; status: "ok" | "gesperrt" | "fehler"; dauer_ms: number; hinweis: string | null;
}

export async function speichereLauf(sb: SupabaseClient, lauf: LaufZeile): Promise<void> {
  const { error } = await sb.from("laeufe").insert(lauf);
  if (error) throw new Error(`speichereLauf: ${error.message}`);
}

/** Die letzten `n` Laeufe einer Quelle, neueste zuerst. */
export async function ladeLetzteLaeufe(sb: SupabaseClient, quelle: Quelle, n: number): Promise<{ status: string; gestartet_am: string }[]> {
  const { data, error } = await sb.from("laeufe").select("status, gestartet_am")
    .eq("quelle", quelle).order("gestartet_am", { ascending: false }).limit(n);
  if (error) throw new Error(`ladeLetzteLaeufe ${quelle}: ${error.message}`);
  return (data ?? []) as { status: string; gestartet_am: string }[];
}
