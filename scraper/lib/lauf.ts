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
