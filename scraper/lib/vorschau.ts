/**
 * Vorschaubilder fuer das Radar.
 *
 * Die Dashboard-Seite des Radars darf keine fremden Bildserver laden (getestet
 * 2026-11-12: alle Portalbilder blockiert). Deshalb legt der Lauf von jeder
 * passenden Wohnung bis zu VORSCHAU_MAX_BILDER kleine WebP-Kopien als data:-URL
 * in `vorschaubilder` ab. Nur fuer passende Angebote (passt ja/unklar), damit
 * die Tabelle klein bleibt; verwaiste Zeilen werden geloescht.
 * Freigabe durch den Nutzer am 2026-11-12 (private Nutzung).
 */
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";

export const VORSCHAU_MAX_BILDER = 3;
/** Hoechstzahl Wohnungen je Lauf, damit ein Lauf nicht lange an Bildern haengt. */
export const VORSCHAU_MAX_JE_LAUF = 25;
const BREITE = 288;

export interface Schluessel { quelle: string; externalId: string }
export interface Kandidat extends Schluessel { bildUrls: string[] }
export interface Vorhanden extends Schluessel { quellUrls: string[] }
export interface VorschauZeile extends Schluessel { bilder: string[]; quellUrls: string[] }

export interface VorschauSpeicher {
  kandidaten(): Promise<Kandidat[]>;
  vorhandene(): Promise<Vorhanden[]>;
  speichere(z: VorschauZeile): Promise<void>;
  loesche(keys: Schluessel[]): Promise<void>;
}

const key = (x: Schluessel) => `${x.quelle}\u0000${x.externalId}`;
const gleich = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Was dieser Lauf laden und was er loeschen soll. */
export function planeVorschau(kandidaten: Kandidat[], vorhanden: Vorhanden[], maxJeLauf: number): { laden: Kandidat[]; loeschen: Schluessel[] } {
  const da = new Map(vorhanden.map((v) => [key(v), v]));
  const gewollt = new Set(kandidaten.map(key));
  const laden: Kandidat[] = [];
  for (const k of kandidaten) {
    const urls = k.bildUrls.slice(0, VORSCHAU_MAX_BILDER);
    if (!urls.length) continue;
    const v = da.get(key(k));
    if (v && gleich(v.quellUrls, urls)) continue;
    laden.push({ ...k, bildUrls: urls });
    if (laden.length >= maxJeLauf) break;
  }
  const loeschen = vorhanden.filter((v) => !gewollt.has(key(v))).map(({ quelle, externalId }) => ({ quelle, externalId }));
  return { laden, loeschen };
}

/** Verkleinert ein Bild auf BREITE Pixel und liefert eine WebP-data-URL. */
export async function verkleinere(roh: Buffer): Promise<string> {
  const webp = await sharp(roh).rotate().resize({ width: BREITE, height: Math.round(BREITE * 0.75), fit: "cover" }).webp({ quality: 50 }).toBuffer();
  return `data:image/webp;base64,${webp.toString("base64")}`;
}

export async function holeBild(url: string): Promise<Buffer> {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36", Accept: "image/avif,image/webp,image/*,*/*;q=0.8" }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

export interface VorschauDeps { hole: (url: string) => Promise<Buffer>; verkleinere: (roh: Buffer) => Promise<string>; budgetMs: number }
export interface VorschauErgebnis { geplant: number; geladen: number; fehlerBilder: number; geloescht: number; abgebrochen: boolean }

export async function aktualisiereVorschau(s: VorschauSpeicher, d: VorschauDeps): Promise<VorschauErgebnis> {
  const ende = Date.now() + d.budgetMs;
  const plan = planeVorschau(await s.kandidaten(), await s.vorhandene(), VORSCHAU_MAX_JE_LAUF);
  if (plan.loeschen.length) await s.loesche(plan.loeschen);
  const e: VorschauErgebnis = { geplant: plan.laden.length, geladen: 0, fehlerBilder: 0, geloescht: plan.loeschen.length, abgebrochen: false };
  for (const k of plan.laden) {
    if (Date.now() >= ende) { e.abgebrochen = true; break; }
    const bilder: string[] = [];
    for (const u of k.bildUrls) {
      try { bilder.push(await d.verkleinere(await d.hole(u))); } catch { e.fehlerBilder++; }
    }
    // Ohne ein einziges Bild nichts speichern: der naechste Lauf versucht es erneut.
    if (!bilder.length) continue;
    await s.speichere({ quelle: k.quelle, externalId: k.externalId, bilder, quellUrls: k.bildUrls });
    e.geladen++;
  }
  return e;
}

/** Supabase-Anbindung: Kandidaten sind aktive, passende Angebote mit Bildern. */
export function supabaseVorschauSpeicher(sb: SupabaseClient): VorschauSpeicher {
  return {
    async kandidaten() {
      const { data, error } = await sb.from("angebote").select("quelle, external_id, bild_urls")
        .is("verschwunden_am", null).in("passt", ["ja", "unklar"]).order("punkte", { ascending: false }).limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []).map((z) => ({ quelle: z.quelle as string, externalId: z.external_id as string, bildUrls: (z.bild_urls as string[]) ?? [] }));
    },
    async vorhandene() {
      const { data, error } = await sb.from("vorschaubilder").select("quelle, external_id, quell_urls").limit(2000);
      if (error) throw new Error(error.message);
      return (data ?? []).map((z) => ({ quelle: z.quelle as string, externalId: z.external_id as string, quellUrls: (z.quell_urls as string[]) ?? [] }));
    },
    async speichere(z) {
      const { error } = await sb.from("vorschaubilder").upsert({ quelle: z.quelle, external_id: z.externalId, bilder: z.bilder, quell_urls: z.quellUrls, aktualisiert_am: new Date().toISOString() }, { onConflict: "quelle,external_id" });
      if (error) throw new Error(error.message);
    },
    async loesche(keys) {
      for (const k of keys) {
        const { error } = await sb.from("vorschaubilder").delete().eq("quelle", k.quelle).eq("external_id", k.externalId);
        if (error) throw new Error(error.message);
      }
    },
  };
}
