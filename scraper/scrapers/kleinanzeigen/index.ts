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
import { parseKleinanzeigenDetail, parseKleinanzeigenListe } from "./parse.js";

const BASIS = `https://www.kleinanzeigen.de/s-wohnung-mieten/muenchen/anzeige:angebote/preis::${FANGNETZ.warmmieteMaxEuro}/sortierung:neuste`;
const KATEGORIE = `c203l6411+wohnung_mieten.qm_d:${FANGNETZ.flaecheMinM2}%2C+wohnung_mieten.zimmer_d:${FANGNETZ.zimmerMin}%2C`;

export const KLEINANZEIGEN_SUCHE_URL = `${BASIS}/${KATEGORIE}`;

/** Listenseiten je Lauf (unter dem allgemeinen Deckel MAX_LISTENSEITEN). */
// Volle 5 Seiten: rund 90 % der gefilterten Karten sind Tauschwohnungen
// (Browser 2026-11-11: 23 von 25), "swap_s:nein" laesst nur 11 von 819 uebrig.
export const KLEINANZEIGEN_LISTENSEITEN = MAX_LISTENSEITEN;

/** URL der n-ten Listenseite (1-basiert). */
export function kleinanzeigenSeitenUrl(n: number): string {
  if (n <= 1) return KLEINANZEIGEN_SUCHE_URL;
  return `${BASIS}/seite:${n}/${KATEGORIE}`;
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
