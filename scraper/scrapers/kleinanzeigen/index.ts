/**
 * Quelle Kleinanzeigen: Mietwohnungen Muenchen, neueste zuerst.
 *
 * Bewusst ohne Portalfilter in der URL: deren Schreibweise ist nicht belegt,
 * und jedes Feld wird im Code ohnehin erneut geprueft. Die Liste ist nach
 * "neueste" sortiert, deshalb reichen wenige Seiten je Lauf; das Ende der
 * Liste wird dabei praktisch nie erreicht (vollstaendig = false), also wird
 * auch nichts als verschwunden markiert.
 */
import type { Angebot } from "../../lib/typen.js";
import type { Abrufer, DetailErgebnis, Quelle, SweepErgebnis } from "../quelle.js";
import { erkenneSperre, seitenabstandMs, MAX_LISTENSEITEN } from "../sperre.js";
import { parseKleinanzeigenDetail, parseKleinanzeigenListe } from "./parse.js";

export const KLEINANZEIGEN_SUCHE_URL =
  "https://www.kleinanzeigen.de/s-wohnung-mieten/muenchen/sortierung:neuste/c203l6411";

/** Listenseiten je Lauf (unter dem allgemeinen Deckel MAX_LISTENSEITEN). */
export const KLEINANZEIGEN_LISTENSEITEN = Math.min(2, MAX_LISTENSEITEN);

/** URL der n-ten Listenseite (1-basiert). */
export function kleinanzeigenSeitenUrl(n: number): string {
  if (n <= 1) return KLEINANZEIGEN_SUCHE_URL;
  return `https://www.kleinanzeigen.de/s-wohnung-mieten/muenchen/sortierung:neuste/seite:${n}/c203l6411`;
}

async function sweep(ab: Abrufer, budgetMs: number): Promise<SweepErgebnis> {
  const ende = Date.now() + budgetMs;
  const gesehen = new Map<string, Angebot>();
  for (let n = 1; n <= KLEINANZEIGEN_LISTENSEITEN; n++) {
    if (n > 1) {
      if (Date.now() >= ende) return { angebote: [...gesehen.values()], vollstaendig: false, status: "ok", hinweis: "Budget erschoepft" };
      await ab.warte(seitenabstandMs());
    }
    const antwort = await ab.hole(kleinanzeigenSeitenUrl(n));
    const sperre = erkenneSperre(antwort);
    if (sperre) return { angebote: [...gesehen.values()], vollstaendig: false, status: "gesperrt", hinweis: sperre };
    if (antwort.status !== 200) {
      return { angebote: [...gesehen.values()], vollstaendig: false, status: n === 1 ? "fehler" : "ok", hinweis: `HTTP ${antwort.status} auf Seite ${n}` };
    }
    const karten = (antwort.html.match(/<article[^>]*data-adid=/g) ?? []).length;
    if (karten === 0) return { angebote: [...gesehen.values()], vollstaendig: n > 1, status: n === 1 ? "fehler" : "ok", hinweis: n === 1 ? "keine Karten auf Seite 1" : null };
    for (const a of parseKleinanzeigenListe(antwort.html)) if (!gesehen.has(a.externalId)) gesehen.set(a.externalId, a);
  }
  return { angebote: [...gesehen.values()], vollstaendig: false, status: "ok", hinweis: null };
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

export const kleinanzeigenQuelle: Quelle = { name: "kleinanzeigen", aktiv: true, sweep, ladeDetail };
