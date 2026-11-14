/**
 * Quelle Kleinanzeigen: Mietwohnungen Muenchen, neueste zuerst.
 *
 * Portalfilter in der URL (im Browser belegt 2026-11-11: 819 Treffer, alle
 * >= 45 m2, >= 2 Zi., <= 1.300 EUR kalt, nur Angebote). Vorauswahl, kein Beleg:
 * jedes Feld wird im Code erneut geprueft. Die Liste ist nach
 * "neueste" sortiert, deshalb reichen wenige Seiten je Lauf; das Ende der
 * Liste wird dabei praktisch nie erreicht (vollstaendig = false), also wird
 * auch nichts als verschwunden markiert.
 */
import type { Angebot } from "../../lib/typen.js";
import { FANGNETZ } from "../../lib/profil.js";
import type { Abrufer, DetailErgebnis, Quelle, SweepErgebnis } from "../quelle.js";
import { erkenneSperre, seitenabstandMs, MAX_LISTENSEITEN } from "../sperre.js";
import { pruefeSeite } from "../online.js";
import { parseKleinanzeigenDetail, parseKleinanzeigenListe } from "./parse.js";

const pfad = (slug: string) => `https://www.kleinanzeigen.de/s-wohnung-mieten/${slug}/anzeige:angebote/preis::${FANGNETZ.warmmieteMaxEuro}/sortierung:neuste`;
// swap_s:nein drops flat swaps (about 90 % of the unfiltered hits). Checked
// 2026-11-13: the filtered list holds ~11 Munich flats plus nearby places on
// one page, 6 of 8 Munich private offers were missing from the newest-5-pages
// sweep because swaps crowded them out.
const kategorie = (ortId: string) => `c203l${ortId}+wohnung_mieten.qm_d:${FANGNETZ.flaecheMinM2}%2C+wohnung_mieten.swap_s:nein+wohnung_mieten.zimmer_d:${FANGNETZ.zimmerMin}%2C`;
const BASIS = pfad("muenchen");
const KATEGORIE = kategorie("6411");

/**
 * Umland Suedwest (lib/muenchenPlz.ts UMLAND_SUEDWEST). Kleinanzeigen bindet die
 * Suche an eine Ortskennung; die Stadt (l6411) enthaelt diese Gemeinden nicht.
 * Kennungen aus s-ort-empfehlungen.json, abgefragt 2026-11-12.
 */
export interface KleinanzeigenOrt { name: string; slug: string; id: string }
export const KLEINANZEIGEN_UMLAND: readonly KleinanzeigenOrt[] = [
  { name: "Neuried", slug: "neuried", id: "15726" },
  { name: "Planegg", slug: "planegg", id: "10516" },
  { name: "Graefelfing", slug: "graefelfing", id: "12962" },
];
/** Erste Listenseite eines Umland-Orts; dort gibt es selten mehr als eine Seite. */
export function kleinanzeigenOrtUrl(o: KleinanzeigenOrt): string {
  return `${pfad(o.slug)}/${kategorie(o.id)}`;
}
/** Volle Listenseite; weniger Karten heisst, der Ort ist vollstaendig gelesen. */
const KARTEN_JE_SEITE = 25;

export const KLEINANZEIGEN_SUCHE_URL = `${BASIS}/${KATEGORIE}`;

/** Listenseiten je Lauf (unter dem allgemeinen Deckel MAX_LISTENSEITEN). */
// Up to 5 pages; without swaps the list usually ends on page 1, which makes
// the sweep complete.
// Without swaps the Munich list held 131 offers on 2026-11-14, about five pages
// of 27 cards (25 plus top ads), so five pages never reached the end.
export const KLEINANZEIGEN_LISTENSEITEN = MAX_LISTENSEITEN + 3;

/** URL der n-ten Listenseite (1-basiert). */
export function kleinanzeigenSeitenUrl(n: number): string {
  if (n <= 1) return KLEINANZEIGEN_SUCHE_URL;
  return `${BASIS}/seite:${n}/${KATEGORIE}`;
}

async function sweepMuenchen(ab: Abrufer, ende: number, gesehen: Map<string, Angebot>): Promise<Omit<SweepErgebnis, "angebote">> {
  for (let n = 1; n <= KLEINANZEIGEN_LISTENSEITEN; n++) {
    if (n > 1) {
      if (Date.now() >= ende) return { vollstaendig: false, status: "ok", hinweis: "Budget erschoepft" };
      await ab.warte(seitenabstandMs());
    }
    const antwort = await ab.hole(kleinanzeigenSeitenUrl(n));
    const sperre = erkenneSperre(antwort);
    if (sperre) return { vollstaendig: false, status: "gesperrt", hinweis: sperre };
    if (antwort.status !== 200) return { vollstaendig: false, status: n === 1 ? "fehler" : "ok", hinweis: `HTTP ${antwort.status} auf Seite ${n}` };
    const karten = (antwort.html.match(/<article[^>]*data-adid=/g) ?? []).length;
    if (karten === 0) return { vollstaendig: n > 1, status: n === 1 ? "fehler" : "ok", hinweis: n === 1 ? "keine Karten auf Seite 1" : null };
    const vorher = gesehen.size;
    for (const a of parseKleinanzeigenListe(antwort.html)) if (!gesehen.has(a.externalId)) gesehen.set(a.externalId, a);
    // End of list: a short page, or a page past the end that repeats the last one.
    if (karten < KARTEN_JE_SEITE || (n > 1 && gesehen.size === vorher)) return { vollstaendig: true, status: "ok", hinweis: null };
  }
  return { vollstaendig: false, status: "ok", hinweis: null };
}

async function sweep(ab: Abrufer, budgetMs: number): Promise<SweepErgebnis> {
  const ende = Date.now() + budgetMs;
  const gesehen = new Map<string, Angebot>();
  const alle = () => [...gesehen.values()];
  const m = await sweepMuenchen(ab, ende, gesehen);
  // Bei Sperre oder kaputter Stadtsuche das Umland nicht mehr anfragen.
  if (m.status !== "ok") return { angebote: alle(), ...m };
  let vollstaendig = m.vollstaendig;
  const hinweise: string[] = m.hinweis ? [m.hinweis] : [];
  for (const o of KLEINANZEIGEN_UMLAND) {
    if (Date.now() >= ende) { vollstaendig = false; hinweise.push(`Budget erschoepft vor ${o.name}`); break; }
    await ab.warte(seitenabstandMs());
    const antwort = await ab.hole(kleinanzeigenOrtUrl(o));
    const sperre = erkenneSperre(antwort);
    if (sperre) return { angebote: alle(), vollstaendig: false, status: "gesperrt", hinweis: `${sperre} bei ${o.name}` };
    if (antwort.status !== 200) { vollstaendig = false; hinweise.push(`HTTP ${antwort.status} bei ${o.name}`); continue; }
    const karten = (antwort.html.match(/<article[^>]*data-adid=/g) ?? []).length;
    if (karten >= KARTEN_JE_SEITE) vollstaendig = false;
    for (const a of parseKleinanzeigenListe(antwort.html)) if (!gesehen.has(a.externalId)) gesehen.set(a.externalId, a);
  }
  return { angebote: alle(), vollstaendig, status: "ok", hinweis: hinweise.length ? hinweise.join("; ") : null };
}

async function ladeDetail(ab: Abrufer, a: Angebot): Promise<DetailErgebnis> {
  await ab.warte(seitenabstandMs());
  const antwort = await ab.hole(a.url);
  const sperre = erkenneSperre(antwort);
  if (sperre) return { angebot: a, sperre };
  if (antwort.status !== 200) return { angebot: a, sperre: null };
  const d = parseKleinanzeigenDetail(antwort.html, { externalId: a.externalId, url: a.url });
  // Bilder der Liste behalten, falls die Detailseite keine liefert.
  return { angebot: d && d.bildUrls.length === 0 ? { ...d, bildUrls: a.bildUrls } : d, sperre: null };
}

export const kleinanzeigenQuelle: Quelle = {
  name: "kleinanzeigen", aktiv: true, sweep, ladeDetail,
  // A deleted ad redirects to its category page (checked 2026-11-13).
  pruefeOnline: (ab, a) => pruefeSeite(ab, a.url, /\/s-anzeige\//, /id="viewad-title"/),
};
