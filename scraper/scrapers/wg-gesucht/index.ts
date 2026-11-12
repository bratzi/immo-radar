/**
 * Quelle WG-Gesucht: Mietwohnungen Muenchen (Kategorie 2), unbefristet,
 * neueste zuerst, Filter in der URL (Vorauswahl, der Code prueft erneut).
 *
 * Kein Detailabruf: aus GitHub Actions lieferte die Detailseite am
 * 2026-11-12 eine andere Seite ohne Eckdaten (Probe-Lauf, 562 kB statt
 * 292 kB lokal). Die Karte hat Gesamtmiete, Flaeche, Zimmer und Ort.
 */
import type { Angebot } from "../../lib/typen.js";
import type { Abrufer, DetailErgebnis, Quelle, SweepErgebnis } from "../quelle.js";
import { erkenneSperre, seitenabstandMs, MAX_LISTENSEITEN } from "../sperre.js";
import { parseWgGesuchtListe, WGG_BASIS } from "./parse.js";
import { FANGNETZ } from "../../lib/profil.js";

const FILTER =
  "?offer_filter=1&city_id=90&sort_order=0&noDeact=1&categories%5B%5D=2&rent_types%5B%5D=2" +
  `&rMax=${FANGNETZ.warmmieteMaxEuro}&sMin=${FANGNETZ.flaecheMinM2}` +
  // rmMin=1 liefert 3 statt 103 Treffer (2026-11-12); "ab 1 Zimmer" ist kein Filter.
  (FANGNETZ.zimmerMin > 1 ? `&rmMin=${FANGNETZ.zimmerMin}` : "");
/** WG-Gesucht zeigt 20 Karten je Seite; weniger heisst: letzte Seite. */
const KARTEN_JE_SEITE = 20;

/** URL der n-ten Listenseite (1-basiert; im Pfad zaehlt WG-Gesucht ab 0). */
export function wgGesuchtSeitenUrl(n: number): string {
  return `${WGG_BASIS}/wohnungen-in-Muenchen.90.2.1.${Math.max(0, n - 1)}.html${FILTER}`;
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
    const antwort = await ab.hole(wgGesuchtSeitenUrl(n));
    const sperre = erkenneSperre(antwort);
    if (sperre) return { angebote: alle(), vollstaendig: false, status: "gesperrt", hinweis: sperre };
    if (antwort.status !== 200) {
      return { angebote: alle(), vollstaendig: false, status: n === 1 ? "fehler" : "ok", hinweis: `HTTP ${antwort.status} auf Seite ${n}` };
    }
    const karten = (antwort.html.match(/wgg-list-card offer_list_item/g) ?? []).length;
    if (karten === 0) {
      return { angebote: alle(), vollstaendig: n > 1, status: n === 1 ? "fehler" : "ok", hinweis: n === 1 ? "keine Karten auf Seite 1" : null };
    }
    for (const a of parseWgGesuchtListe(antwort.html)) if (!gesehen.has(a.externalId)) gesehen.set(a.externalId, a);
    if (karten < KARTEN_JE_SEITE) return { angebote: alle(), vollstaendig: true, status: "ok", hinweis: null };
  }
  return { angebote: alle(), vollstaendig: false, status: "ok", hinweis: null };
}

async function ladeDetail(_ab: Abrufer, a: Angebot): Promise<DetailErgebnis> {
  return { angebot: a, sperre: null };
}

export const wgGesuchtQuelle: Quelle = { name: "wg-gesucht", aktiv: true, sweep, ladeDetail };
