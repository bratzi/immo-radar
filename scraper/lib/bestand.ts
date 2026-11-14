/**
 * Removal sweep: every run checks listings that the radar shows (passt ja or
 * unklar) but this run did not see in a search list, oldest check first, and
 * marks those that are gone. Sources whose sweep is complete rarely leave any;
 * this catches the rest (Kleinanzeigen fills its list with nearby places,
 * Ohne-Makler is capped at five pages, Immowelt only reports via mail).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Abrufer, Quelle } from "../scrapers/quelle.js";
import { leeresAngebot } from "./typen.js";
import { seitenabstandMs } from "../scrapers/sperre.js";

export interface BestandErgebnis { geprueft: number; weg: number; unklar: number; gesperrt: boolean }

export async function pruefeBestand(
  sb: SupabaseClient, quelle: Quelle, ab: Abrufer, laufStart: Date, max = 15,
): Promise<BestandErgebnis> {
  const erg: BestandErgebnis = { geprueft: 0, weg: 0, unklar: 0, gesperrt: false };
  if (!quelle.pruefeOnline) return erg;
  const { data, error } = await sb.from("angebote").select("id, external_id, url, titel")
    .eq("quelle", quelle.name).is("verschwunden_am", null).in("passt", ["ja", "unklar"])
    .lt("zuletzt_gesehen", laufStart.toISOString())
    .order("geprueft_am", { ascending: true, nullsFirst: true }).limit(max);
  if (error) throw new Error(`Bestand lesen: ${error.message}`);
  for (const [i, z] of (data ?? []).entries()) {
    if (i > 0) await ab.warte(seitenabstandMs());
    const s = await quelle.pruefeOnline(ab, leeresAngebot({ quelle: quelle.name, externalId: z.external_id, url: z.url, titel: z.titel }));
    if (s === "gesperrt") { erg.gesperrt = true; break; }
    erg.geprueft++;
    const jetzt = new Date().toISOString();
    const aenderung = s === "weg" ? { verschwunden_am: jetzt, geprueft_am: jetzt } : { geprueft_am: jetzt };
    if (s === "weg") erg.weg++; else if (s === "unklar") erg.unklar++;
    const { error: e } = await sb.from("angebote").update(aenderung).eq("id", z.id);
    if (e) throw new Error(`Bestand schreiben: ${e.message}`);
  }
  return erg;
}
