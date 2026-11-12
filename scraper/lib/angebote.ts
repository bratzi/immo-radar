import type { SupabaseClient } from "@supabase/supabase-js";
import type { Angebot, Passt, Profilurteil, Quelle } from "./typen.js";

export interface AngebotZeile {
  quelle: Quelle; external_id: string; url: string; titel: string;
  kaltmiete_cents: number | null; nebenkosten_cents: number | null; warmmiete_cents: number | null;
  warmmiete_quelle: string; zimmer: number | null; flaeche_m2: number | null;
  balkon: string; balkon_beleg: string | null; plz: string | null; stadtteil: string | null;
  verfuegbar_ab: string | null; befristet: boolean | null; bild_urls: string[];
  veroeffentlicht_am: string | null; passt: Passt; gruende: string[]; punkte: number;
  zuletzt_gesehen: string; verschwunden_am: null; detail_geladen_am: string | null;
}

/** Was ein frueher geladenes Expose beigetragen hat; null, wenn keins geladen wurde. */
export interface GespeichertesExpose {
  am: string; kaltmieteCents: number | null; nebenkostenCents: number | null; warmmieteCents: number | null;
  warmmieteQuelle: string; balkon: string; balkonBeleg: string | null; verfuegbarAb: string | null; befristet: boolean | null;
}

export interface Bekannt {
  id: string; gemeldetAm: string | null; letzteWarmmieteGemeldetCents: number | null;
  verschwundenAm: string | null; passt: Passt; expose: GespeichertesExpose | null;
  /** Fruehester bisher gelesener Zeitpunkt "online seit". */
  veroeffentlichtAm?: string | null;
}

export function zuZeile(a: Angebot, urteil: Profilurteil, punkte: number, jetzt: Date): AngebotZeile {
  const iso = jetzt.toISOString();
  return {
    quelle: a.quelle, external_id: a.externalId, url: a.url, titel: a.titel,
    kaltmiete_cents: a.kaltmieteCents, nebenkosten_cents: a.nebenkostenCents, warmmiete_cents: a.warmmieteCents,
    warmmiete_quelle: a.warmmieteQuelle, zimmer: a.zimmer, flaeche_m2: a.flaecheM2,
    balkon: a.balkon, balkon_beleg: a.balkonBeleg, plz: a.plz, stadtteil: a.stadtteil,
    verfuegbar_ab: a.verfuegbarAb, befristet: a.befristet, bild_urls: a.bildUrls,
    veroeffentlicht_am: a.veroeffentlichtAm, passt: urteil.passt, gruende: urteil.gruende, punkte,
    zuletzt_gesehen: iso, verschwunden_am: null, detail_geladen_am: a.detailGeladen ? (a.detailGeladenAm ?? iso) : null,
  };
}

export function entscheideMeldung(bekannt: Bekannt | undefined, warmmieteCents: number | null): "neu" | "preissenkung" | "keine" {
  if (!bekannt || bekannt.gemeldetAm === null) return "neu";
  if (warmmieteCents !== null && bekannt.letzteWarmmieteGemeldetCents !== null && warmmieteCents < bekannt.letzteWarmmieteGemeldetCents) return "preissenkung";
  return "keine";
}

export async function ladeBekannte(sb: SupabaseClient, quelle: Quelle): Promise<Map<string, Bekannt>> {
  const { data, error } = await sb.from("angebote")
    .select("id, external_id, gemeldet_am, letzte_warmmiete_gemeldet_cents, verschwunden_am, passt, detail_geladen_am, kaltmiete_cents, nebenkosten_cents, warmmiete_cents, warmmiete_quelle, balkon, balkon_beleg, verfuegbar_ab, befristet, veroeffentlicht_am")
    .eq("quelle", quelle);
  if (error) throw new Error(`ladeBekannte ${quelle}: ${error.message}`);
  const map = new Map<string, Bekannt>();
  for (const z of data ?? []) map.set(z.external_id, {
    id: z.id, gemeldetAm: z.gemeldet_am, letzteWarmmieteGemeldetCents: z.letzte_warmmiete_gemeldet_cents,
    verschwundenAm: z.verschwunden_am, passt: z.passt, veroeffentlichtAm: z.veroeffentlicht_am,
    expose: z.detail_geladen_am ? {
      am: z.detail_geladen_am, kaltmieteCents: z.kaltmiete_cents, nebenkostenCents: z.nebenkosten_cents,
      warmmieteCents: z.warmmiete_cents, warmmieteQuelle: z.warmmiete_quelle, balkon: z.balkon,
      balkonBeleg: z.balkon_beleg, verfuegbarAb: z.verfuegbar_ab, befristet: z.befristet,
    } : null,
  });
  return map;
}

export async function speichereAngebote(sb: SupabaseClient, zeilen: AngebotZeile[]): Promise<void> {
  if (zeilen.length === 0) return;
  const { error } = await sb.from("angebote").upsert(zeilen, { onConflict: "quelle,external_id" });
  if (error) throw new Error(`speichereAngebote: ${error.message}`);
}

export async function markiereVerschwunden(sb: SupabaseClient, quelle: Quelle, gesehen: Set<string>, jetzt: Date): Promise<number> {
  const { data, error } = await sb.from("angebote").select("id, external_id").eq("quelle", quelle).is("verschwunden_am", null);
  if (error) throw new Error(`markiereVerschwunden lesen: ${error.message}`);
  const ids = (data ?? []).filter((z) => !gesehen.has(z.external_id)).map((z) => z.id);
  if (ids.length === 0) return 0;
  const { error: e2 } = await sb.from("angebote").update({ verschwunden_am: jetzt.toISOString() }).in("id", ids);
  if (e2) throw new Error(`markiereVerschwunden schreiben: ${e2.message}`);
  return ids.length;
}

export async function markiereGemeldet(sb: SupabaseClient, id: string, warmmieteCents: number | null, jetzt: Date): Promise<void> {
  const { error } = await sb.from("angebote")
    .update({ gemeldet_am: jetzt.toISOString(), letzte_warmmiete_gemeldet_cents: warmmieteCents }).eq("id", id);
  if (error) throw new Error(`markiereGemeldet: ${error.message}`);
}

export async function ladeIdFuer(sb: SupabaseClient, quelle: Quelle, externalId: string): Promise<string> {
  const { data, error } = await sb.from("angebote").select("id").eq("quelle", quelle).eq("external_id", externalId).single();
  if (error || !data) throw new Error(`ladeIdFuer ${quelle}/${externalId}: ${error?.message ?? "leer"}`);
  return data.id;
}
