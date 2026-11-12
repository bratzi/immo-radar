/**
 * Quelle Ohne-Makler.net: Wohnung mieten, Muenchen, alle Seiten ueber
 * `?page=N`. Kein Portalfilter in der URL (keiner gefunden); der Code prueft.
 * robots.txt sperrt nur /immobilie/list/, /ad/ und Druckansichten (2026-11-12).
 * Die Seite zeigt auch ueber das Ende hinaus Karten, deshalb endet der
 * Sweep, sobald eine Seite nichts Neues bringt.
 *
 * Kein Detailabruf: das Expose nennt nur Kaltmiete und "zzgl. NK".
 */
import type { Angebot } from "../../lib/typen.js";
import type { Abrufer, DetailErgebnis, Quelle, SweepErgebnis } from "../quelle.js";
import { erkenneSperre, seitenabstandMs, MAX_LISTENSEITEN } from "../sperre.js";
import { parseOhneMaklerListe, OM_BASIS } from "./parse.js";

const LISTE = `${OM_BASIS}/immobilien/wohnung-mieten/bayern/munchen/`;

export function ohneMaklerSeitenUrl(n: number): string {
  return n <= 1 ? LISTE : `${LISTE}?page=${n}`;
}

async function sweep(ab: Abrufer, budgetMs: number): Promise<SweepErgebnis> {
  const ende = Date.now() + budgetMs;
  const gesehen = new Map<string, Angebot>();
  const alle = () => [...gesehen.values()];
  for (let n = 1; n <= MAX_LISTENSEITEN; n++) {
    if (n > 1) {
      if (Date.now() >= ende) return { angebote: alle(), vollstaendig: false, status: "ok", hinweis: "Budget erschoepft" };
      await ab.warte(seitenabstandMs());
    }
    const antwort = await ab.hole(ohneMaklerSeitenUrl(n));
    const sperre = erkenneSperre(antwort);
    if (sperre) return { angebote: alle(), vollstaendig: false, status: "gesperrt", hinweis: sperre };
    if (antwort.status !== 200) {
      return { angebote: alle(), vollstaendig: false, status: n === 1 ? "fehler" : "ok", hinweis: `HTTP ${antwort.status} auf Seite ${n}` };
    }
    const seite = parseOhneMaklerListe(antwort.html);
    if (seite.length === 0 && n === 1) return { angebote: [], vollstaendig: false, status: "fehler", hinweis: "keine Karten auf Seite 1" };
    const neu = seite.filter((a) => !gesehen.has(a.externalId));
    if (neu.length === 0) return { angebote: alle(), vollstaendig: true, status: "ok", hinweis: null };
    for (const a of neu) gesehen.set(a.externalId, a);
  }
  return { angebote: alle(), vollstaendig: false, status: "ok", hinweis: null };
}

async function ladeDetail(_ab: Abrufer, a: Angebot): Promise<DetailErgebnis> {
  return { angebot: a, sperre: null };
}

export const ohneMaklerQuelle: Quelle = { name: "ohne-makler", aktiv: true, sweep, ladeDetail };
