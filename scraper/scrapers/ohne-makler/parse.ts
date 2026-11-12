/**
 * Ohne-Makler.net, Wohnung mieten, Muenchen (Listenseite als HTML).
 *
 * Belegt am 2026-11-12 (514116): der Kartenpreis ist die KALTmiete
 * ("Kaltmiete 1.650 EUR (zzgl. NK)" im Expose). Die Pipeline schaetzt die
 * Warmmiete. Ohne-Makler verteilt Inserate selbst an die grossen Portale;
 * Dubletten filtert die Radar-Abfrage quellenuebergreifend.
 */
import type { Angebot } from "../../lib/typen.js";
import { leeresAngebot } from "../../lib/typen.js";
import { erkenneBalkon } from "../../lib/balkon.js";

export const OM_BASIS = "https://www.ohne-makler.net";
const TAUSCH = /tauschwohnung|wohnungs?tausch|zum tausch/i;
const BEFRISTET = /\bbefristet|zwischenmiete|\bauf zeit\b/i;

function entschluessle(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function zahl(text: string | undefined): number | null {
  if (!text) return null;
  const m = text.match(/\d[\d.]*(,\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "80804 München (Schwabing)" oder "81825 München-Trudering". */
function ort(text: string): { plz: string | null; stadtteil: string | null } {
  const plz = text.match(/\b(\d{5})\b/)?.[1] ?? null;
  const teil = text.match(/\(([^)]+)\)/)?.[1] ?? text.match(/München-([\p{L}-]+)/u)?.[1] ?? null;
  return { plz, stadtteil: teil ? teil.trim() : null };
}

function karten(html: string): string[] {
  const starts = [...new Set([...html.matchAll(/data-om-id="\d+"/g)].map((m) => html.lastIndexOf("<a", m.index)))];
  return starts.map((s, i) => html.slice(s, i + 1 < starts.length ? starts[i + 1] : undefined));
}

export function parseOhneMaklerListe(html: string): Angebot[] {
  const gesehen = new Map<string, Angebot>();
  for (const roh of karten(html)) {
    const k = roh.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/\s+/g, " ");
    const id = k.match(/data-om-id="(\d+)"/)?.[1];
    if (!id || gesehen.has(id) || !/data-om-type="RENT"/.test(k)) continue;
    const titel = entschluessle(k.match(/<h4[^>]*>([\s\S]*?)<\/h4>/)?.[1] ?? "");
    if (!titel || TAUSCH.test(titel)) continue;
    const preis = k.match(/text-primary-500 text-xl[^>]*>([^<]+)</)?.[1];
    const zimmer = k.match(/title="Zimmer">[\s\S]*?<span[^>]*>([^<]+)</)?.[1];
    const flaeche = k.match(/title="Wohnfläche">[\s\S]*?<span[^>]*>([^<]+)</)?.[1];
    const ortText = entschluessle(k.match(/<\/h4>[\s\S]*?<span>([^<]*\d{5}[^<]*)<\/span>/)?.[1] ?? "");
    const bild = k.match(/<img[^>]*src="(https:\/\/media\.ohne-makler\.net\/[^"]+)"/)?.[1];
    const kalt = zahl(preis);
    const b = erkenneBalkon({ ausstattung: [], titel, beschreibung: "" });
    gesehen.set(id, leeresAngebot({
      quelle: "ohne-makler",
      externalId: id,
      url: `${OM_BASIS}/immobilie/${id}/`,
      titel,
      kaltmieteCents: kalt === null ? null : Math.round(kalt * 100),
      zimmer: zahl(zimmer),
      flaecheM2: zahl(flaeche),
      ...ort(ortText),
      balkon: b.balkon,
      balkonBeleg: b.beleg,
      befristet: BEFRISTET.test(titel) ? true : null,
      bildUrls: bild ? [entschluessle(bild)] : [],
    }));
  }
  return [...gesehen.values()];
}
