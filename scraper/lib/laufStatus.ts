/**
 * Laufstatus fuer den Radar (Tabelle `lauf_status`, eine Zeile id=1):
 * "laeuft seit" beim Start, "fertig um" am Ende. Der Knopf im Radar und
 * `starte_lauf()` in Supabase lesen ihn, damit kein zweiter Lauf startet.
 * Ein Fehler hier darf den Lauf nicht stoppen; main.ts faengt ihn ab.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export function laufUrlAusUmgebung(env: Record<string, string | undefined>): string | null {
  const { GITHUB_SERVER_URL: s, GITHUB_REPOSITORY: r, GITHUB_RUN_ID: id } = env;
  return s && r && id ? `${s}/${r}/actions/runs/${id}` : null;
}

export async function meldeLaufStart(sb: SupabaseClient, jetzt: Date, runUrl: string | null): Promise<void> {
  const { error } = await sb.from("lauf_status")
    .upsert({ id: 1, laeuft: true, gestartet_am: jetzt.toISOString(), beendet_am: null, run_url: runUrl }, { onConflict: "id" });
  if (error) throw new Error(`meldeLaufStart: ${error.message}`);
}

export async function meldeLaufEnde(sb: SupabaseClient, jetzt: Date): Promise<void> {
  const { error } = await sb.from("lauf_status").update({ laeuft: false, beendet_am: jetzt.toISOString() }).eq("id", 1);
  if (error) throw new Error(`meldeLaufEnde: ${error.message}`);
}
